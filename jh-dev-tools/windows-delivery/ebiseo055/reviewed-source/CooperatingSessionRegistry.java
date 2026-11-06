/* Copyright 2026 JH Equalizer contributors. SPDX-License-Identifier: Apache-2.0 */
package kr.jh.equalizer.auto;

import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Count-bounded, in-memory bookkeeping for the standard Android audio-effect session
 * protocol. The preferred path uses OS-shared senderUid/senderPackage. Android's
 * standard audio-effect broadcast does not guarantee that the sender opts into
 * identity sharing, so a separate fallback may admit the standard contract only
 * after the caller correlates the exact installed package UID with one current,
 * local media session. Extras alone or remote JSON are never sufficient. A session
 * generation is deliberately NOT a song occurrence.
 * A bound session follows the authenticated OPEN/CLOSE and observed controller
 * lifecycle, not an elapsed playback limit. The caller must keep observing the
 * current OS media lifecycle; those observations never authorize a new audio ID.
 */
public final class CooperatingSessionRegistry {
    public static final long STARTUP_GRACE_MS = 10L * 1000L;
    public static final int MAX_SESSIONS = 4;

    public enum Action { OPEN, CLOSE }
    public enum MediaState {
        UNKNOWN, LOCAL_PLAYING, LOCAL_PAUSED, LOCAL_TRANSITIONING, NO_SESSION, NO_ACTIVE_PLAYBACK,
        PERMISSION_UNAVAILABLE, AMBIGUOUS, REMOTE, UNKNOWN_OUTPUT, ERROR
    }

    /** Immutable diagnostics. Only an available route exposes its authenticated ID. */
    public static final class Snapshot {
        public final boolean running, senderIdentityApiSupported, sourceUidAvailable;
        public final boolean senderIdentityVerified, standardContractCorrelated;
        public final boolean verifiedSessionPresent, processingRouteAvailable, playing;
        public final boolean targetEventObserved, unverifiedSenderObserved, sessionLimitExceeded;
        public final int candidateCount, pendingStartupCount, audioSessionId, authenticatedSourceUid;
        public final long startupGraceRemainingMs, mediaControllerGeneration;
        /** Pending startup deadline only. Zero means no pending deadline, including all bound routes. */
        public final long nextExpiryElapsedRealtimeMs;
        public final String routeId, reason, rejectionReason, mediaState, sessionAuthority;

        private Snapshot(boolean running, boolean api, boolean sourceUidAvailable,
                boolean senderVerified, boolean contractCorrelated,
                boolean verifiedPresent, boolean available, boolean playing,
                boolean observed, boolean unverifiedObserved, boolean overflow,
                int count, int pendingCount, int session, int sourceUid, long startupRemaining,
                long nextExpiry, long controllerGeneration,
                String routeId, String reason, String rejection, MediaState mediaState,
                String sessionAuthority) {
            this.running = running;
            senderIdentityApiSupported = api;
            this.sourceUidAvailable = sourceUidAvailable;
            senderIdentityVerified = senderVerified;
            standardContractCorrelated = contractCorrelated;
            verifiedSessionPresent = verifiedPresent;
            processingRouteAvailable = available;
            this.playing = playing;
            targetEventObserved = observed;
            unverifiedSenderObserved = unverifiedObserved;
            sessionLimitExceeded = overflow;
            candidateCount = count;
            pendingStartupCount = pendingCount;
            audioSessionId = session;
            authenticatedSourceUid = sourceUid;
            startupGraceRemainingMs = startupRemaining;
            nextExpiryElapsedRealtimeMs = nextExpiry;
            mediaControllerGeneration = controllerGeneration;
            this.routeId = routeId;
            this.reason = reason;
            rejectionReason = rejection;
            this.mediaState = mediaState.name();
            this.sessionAuthority = sessionAuthority;
        }
    }

    private static final class Entry {
        final int session;
        final String routeId;
        long boundControllerGeneration, startupExpiresAt;
        boolean senderIdentityVerified;
        Entry(int session, String routeId, long boundGeneration, long startupExpiresAt,
                boolean senderIdentityVerified) {
            this.session = session; this.routeId = routeId;
            boundControllerGeneration = boundGeneration;
            this.startupExpiresAt = startupExpiresAt;
            this.senderIdentityVerified = senderIdentityVerified;
        }
    }

    private final String sourcePackage;
    private final long startupGraceMs;
    private final String instanceId = UUID.randomUUID().toString();
    private final Map<Integer, Entry> sessions = new LinkedHashMap<>();
    private boolean running, identityApi, clockValid = true, overflow;
    private boolean targetEventObserved, unverifiedSenderObserved;
    private int expectedUid = -1;
    private long lastNow, lastMediaRevision = -1, routeGeneration, controllerGeneration;
    private MediaState mediaState = MediaState.UNKNOWN;
    private String rejection = "NONE", emptyReason = "WAITING_FOR_AUTHENTICATED_OPEN";

    public CooperatingSessionRegistry(String sourcePackage) {
        this(sourcePackage, STARTUP_GRACE_MS);
    }
    /** The optional duration bounds initial OPEN-to-controller binding only, never playback time. */
    public CooperatingSessionRegistry(String sourcePackage, long startupGraceMs) {
        if (sourcePackage == null || sourcePackage.length() > 255
                || !sourcePackage.matches("[A-Za-z][A-Za-z0-9_]*(\\.[A-Za-z][A-Za-z0-9_]*)+"))
            throw new IllegalArgumentException("INVALID_SOURCE_PACKAGE");
        if (startupGraceMs < 1000 || startupGraceMs > STARTUP_GRACE_MS)
            throw new IllegalArgumentException("INVALID_STARTUP_GRACE");
        this.sourcePackage = sourcePackage;
        this.startupGraceMs = startupGraceMs;
    }

    public synchronized Snapshot start(int installedSourceUid, boolean identityApiAvailable, long now) {
        requireTime(now);
        running = true; identityApi = identityApiAvailable; clockValid = true;
        expectedUid = validUid(installedSourceUid);
        lastNow = now; lastMediaRevision = -1; controllerGeneration = 0; mediaState = MediaState.UNKNOWN;
        sessions.clear(); overflow = false; targetEventObserved = false; unverifiedSenderObserved = false;
        rejection = "NONE"; emptyReason = "WAITING_FOR_AUTHENTICATED_OPEN";
        return build(now);
    }

    /** A changed/missing installed UID invalidates every previously accepted session. */
    public synchronized Snapshot updateSourceUid(int installedSourceUid, long now) {
        advance(now);
        int next = validUid(installedSourceUid);
        if (next != expectedUid) {
            expectedUid = next;
            clear("SOURCE_IDENTITY_CHANGED");
        }
        return build(now);
    }

    /** Revisions belong to the local observer and may never be restamped by a queued callback. */
    public synchronized Snapshot observeMedia(long revision, long observedControllerGeneration, MediaState state, long now) {
        advance(now);
        if (state == null) throw new IllegalArgumentException("MEDIA_STATE_REQUIRED");
        if (!running || !clockValid || revision <= lastMediaRevision) return build(now);
        lastMediaRevision = revision;
        if (observedControllerGeneration != controllerGeneration) {
            boolean firstLocalBinding = controllerGeneration == 0 && observedControllerGeneration > 0
                    && local(state);
            if (firstLocalBinding) {
                for (Entry entry : sessions.values()) {
                    // Initial playback is not proof that an overflowed startup
                    // session set became unambiguous. Keep its loss latch intact.
                    if (overflow) break;
                    // The bounded pending OPEN predates the first local controller.
                    // Once bound, actual lifecycle events end it; elapsed playback
                    // time or a delayed observer refresh cannot delete the binding.
                    if (entry.boundControllerGeneration != 0) {
                        clear("MEDIA_CONTROLLER_CHANGED"); break;
                    }
                    entry.boundControllerGeneration = observedControllerGeneration;
                    entry.startupExpiresAt = 0;
                }
            } else clear(controllerGeneration > 0 || !sessions.isEmpty()
                    ? "MEDIA_CONTROLLER_CHANGED" : "WAITING_FOR_AUTHENTICATED_OPEN");
            controllerGeneration = Math.max(0L, observedControllerGeneration);
        }
        mediaState = state;
        if (local(state) && observedControllerGeneration <= 0) {
            clear("MEDIA_CONTROLLER_UNVERIFIED");
            mediaState = MediaState.UNKNOWN;
        }
        if (!local(state) && !(startupWait(state) && observedControllerGeneration == 0))
            clear("MEDIA_EVIDENCE_LOST");
        return build(now);
    }

    /**
     * Preferred admission path. A mismatched shared sender can never fall through to
     * the standard-contract path. An unauthenticated CLOSE cannot revoke a route.
     */
    public synchronized Snapshot onSessionEvent(Action action, String declaredPackage,
            int audioSessionId, int senderUid, String senderPackage, long now) {
        advance(now);
        if (!admissionPreamble(action, declaredPackage, now)) return build(now);
        if (!identityApi || senderUid < 0 || senderPackage == null) {
            unverifiedSenderObserved = true;
            rejection = "SENDER_IDENTITY_UNAVAILABLE"; return build(now);
        }
        if (expectedUid <= 0 || senderUid != expectedUid || !sourcePackage.equals(senderPackage)) {
            rejection = "SENDER_IDENTITY_MISMATCH"; return build(now);
        }
        return acceptSessionEvent(action, audioSessionId, true, now);
    }

    /**
     * Compatibility path for Android's standard AudioEffect broadcast when the
     * broadcaster did not opt into API-34 identity sharing. The caller must resolve
     * declaredPackageUid locally and correlate exactly one current local media
     * session. This method never accepts a sender mismatch or a package extra alone.
     */
    public synchronized Snapshot onCorrelatedSessionEvent(Action action, String declaredPackage,
            int audioSessionId, int declaredPackageUid, boolean mediaSessionCorrelated, long now) {
        advance(now);
        if (!admissionPreamble(action, declaredPackage, now)) return build(now);
        unverifiedSenderObserved = true;
        if (!identityApi) { rejection = "SENDER_IDENTITY_API_UNAVAILABLE"; return build(now); }
        if (expectedUid <= 0 || declaredPackageUid <= 0 || declaredPackageUid != expectedUid) {
            rejection = "DECLARED_PACKAGE_UID_MISMATCH"; return build(now);
        }
        if (!mediaSessionCorrelated) {
            rejection = "MEDIA_SESSION_CORRELATION_REQUIRED"; return build(now);
        }
        return acceptSessionEvent(action, audioSessionId, false, now);
    }

    private boolean admissionPreamble(Action action, String declaredPackage, long now) {
        if (!running) { rejection = "SOURCE_STOPPED"; return false; }
        if (!clockValid) { rejection = "MONOTONIC_CLOCK_REWOUND"; return false; }
        if (action == null) { rejection = "INVALID_ACTION"; return false; }
        if (!sourcePackage.equals(declaredPackage)) {
            rejection = "DECLARED_PACKAGE_MISMATCH"; return false;
        }
        targetEventObserved = true;
        return true;
    }

    private Snapshot acceptSessionEvent(Action action, int audioSessionId,
            boolean senderIdentityVerified, long now) {
        if (audioSessionId <= 0) { rejection = "INVALID_AUDIO_SESSION"; return build(now); }
        rejection = "NONE";
        if (action == Action.CLOSE) {
            if (sessions.remove(audioSessionId) == null) rejection = "UNKNOWN_CLOSE_SESSION";
            if (sessions.isEmpty()) emptyReason = "SESSION_CLOSED";
        } else if (!overflow) {
            boolean pending = controllerGeneration == 0 && startupWait(mediaState);
            if (!(local(mediaState) && controllerGeneration > 0) && !pending) {
                rejection = "MEDIA_CONTEXT_UNAVAILABLE"; return build(now);
            }
            Entry existing = sessions.get(audioSessionId);
            if (existing != null) {
                // A later OS-authenticated OPEN upgrades, but a correlated OPEN can
                // never downgrade, an existing route's admission authority.
                existing.senderIdentityVerified |= senderIdentityVerified;
                existing.boundControllerGeneration = pending ? 0 : controllerGeneration;
                existing.startupExpiresAt = pending ? addBounded(now, startupGraceMs) : 0;
            } else if (sessions.size() == MAX_SESSIONS) {
                // Do not evict a possibly active session and select an arbitrary survivor.
                overflow = true;
                rejection = "SESSION_LIMIT_EXCEEDED";
            } else {
                if (routeGeneration == Long.MAX_VALUE)
                    throw new IllegalStateException("ROUTE_GENERATION_EXHAUSTED");
                sessions.put(audioSessionId, new Entry(audioSessionId,
                        "cooperating:" + instanceId + ":" + (++routeGeneration),
                        pending ? 0 : controllerGeneration, pending ? addBounded(now, startupGraceMs) : 0,
                        senderIdentityVerified));
                emptyReason = "WAITING_FOR_AUTHENTICATED_OPEN";
            }
        } else rejection = "SESSION_LIMIT_EXCEEDED";
        return build(now);
    }

    /** Local loss/failure, never a remotely supplied reason string. */
    public synchronized Snapshot invalidate(String reason, long now) {
        advance(now);
        if (!"RECEIVER_UNAVAILABLE".equals(reason) && !"SOURCE_IDENTITY_CHANGED".equals(reason)
                && !"OBSERVER_UNAVAILABLE".equals(reason))
            throw new IllegalArgumentException("INVALID_LOCAL_INVALIDATION_REASON");
        clear(reason);
        mediaState = MediaState.UNKNOWN;
        return build(now);
    }

    /** Malformed public broadcasts change diagnostics only, never an authenticated binding. */
    public synchronized Snapshot rejectEvent(String reason, long now) {
        advance(now);
        if (!"MALFORMED_EVENT".equals(reason) && !"STICKY_EVENT_REJECTED".equals(reason))
            throw new IllegalArgumentException("INVALID_EVENT_REJECTION_REASON");
        rejection = reason;
        return build(now);
    }

    public synchronized Snapshot stop(long now) {
        advance(now);
        running = false; clear("SOURCE_STOPPED"); mediaState = MediaState.UNKNOWN;
        return build(now);
    }
    public synchronized Snapshot snapshot(long now) { advance(now); return build(now); }

    private void advance(long now) {
        requireTime(now);
        if (now < lastNow) {
            clockValid = false; clear("MONOTONIC_CLOCK_REWOUND");
            return;
        }
        lastNow = now;
        boolean startupExpired = false;
        for (Iterator<Entry> it = sessions.values().iterator(); it.hasNext();) {
            Entry entry = it.next();
            if (entry.boundControllerGeneration == 0 && entry.startupExpiresAt <= now) {
                it.remove(); startupExpired = true;
            }
        }
        if (startupExpired && sessions.isEmpty()) emptyReason = "SESSION_STARTUP_GRACE_EXPIRED";
    }
    private void clear(String reason) {
        sessions.clear(); overflow = false; emptyReason = reason;
    }
    private static long addBounded(long now, long duration) { return now > Long.MAX_VALUE - duration ? Long.MAX_VALUE : now + duration; }
    private static boolean local(MediaState state) {
        return state == MediaState.LOCAL_PLAYING || state == MediaState.LOCAL_PAUSED
                || state == MediaState.LOCAL_TRANSITIONING;
    }
    private static boolean startupWait(MediaState state) { return state == MediaState.NO_SESSION || state == MediaState.NO_ACTIVE_PLAYBACK; }
    private static int validUid(int uid) { return uid > 0 ? uid : -1; }
    private static void requireTime(long now) {
        if (now < 0) throw new IllegalArgumentException("NEGATIVE_MONOTONIC_TIME");
    }
    private Snapshot build(long now) {
        boolean has = running && identityApi && expectedUid > 0 && clockValid && !sessions.isEmpty();
        boolean mediaLocal = local(mediaState);
        Entry candidate = sessions.size() == 1 ? sessions.values().iterator().next() : null;
        boolean available = has && !overflow && mediaLocal && candidate != null
                && controllerGeneration > 0 && candidate.boundControllerGeneration == controllerGeneration;
        Entry selected = available ? candidate : null;
        boolean senderVerified = candidate != null && candidate.senderIdentityVerified;
        boolean contractCorrelated = candidate != null && !candidate.senderIdentityVerified;
        String authority = candidate == null ? "NONE" : senderVerified
                ? "OS_SENDER_IDENTITY" : "STANDARD_AUDIO_EFFECT_CONTRACT_CORRELATED";
        long startupExpiry = 0;
        int pendingCount = 0;
        for (Entry entry : sessions.values()) {
            if (entry.boundControllerGeneration == 0) {
                pendingCount++;
                long expiry = entry.startupExpiresAt;
                if (startupExpiry == 0 || expiry < startupExpiry) startupExpiry = expiry;
            }
        }
        String reason;
        if (!running) reason = "SOURCE_STOPPED";
        else if (!clockValid) reason = "MONOTONIC_CLOCK_REWOUND";
        else if (!identityApi) reason = "SENDER_IDENTITY_API_UNAVAILABLE";
        else if (expectedUid <= 0) reason = "SOURCE_PACKAGE_UNAVAILABLE";
        else if (overflow) reason = "SESSION_LIMIT_EXCEEDED";
        else if (sessions.size() > 1) reason = "MULTIPLE_AUDIO_SESSIONS";
        else if (pendingCount > 0) reason = "WAITING_FOR_LOCAL_PLAYBACK";
        else if (sessions.isEmpty() && "SESSION_STARTUP_GRACE_EXPIRED".equals(emptyReason)) reason = emptyReason;
        else if (!mediaLocal) reason = "MEDIA_" + mediaState.name();
        else if (sessions.isEmpty()) reason = emptyReason;
        else reason = mediaState == MediaState.LOCAL_PLAYING ? "READY"
                : mediaState == MediaState.LOCAL_TRANSITIONING ? "TRANSITIONING" : "PAUSED";
        return new Snapshot(running, identityApi, expectedUid > 0,
                senderVerified, contractCorrelated, has, available,
                available && mediaState == MediaState.LOCAL_PLAYING, targetEventObserved,
                unverifiedSenderObserved, overflow, sessions.size(), pendingCount, selected == null ? 0 : selected.session,
                selected == null ? -1 : expectedUid,
                startupExpiry == 0 ? 0 : Math.max(0, startupExpiry - now), startupExpiry, controllerGeneration,
                selected == null ? "" : selected.routeId, reason, rejection, mediaState, authority);
    }
}
