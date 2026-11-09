package com.jh.pobiseo.assist;

import com.jh.pobiseo.assist.CameraSurfacePolicy.*;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.function.LongSupplier;

/** 카비서 explicit read-only route. This never replaces a denied snapshot or grants a gesture.
 * The Java package is preserved for host/source compatibility. Host must verify the ORIGINAL
 * action, signed command, account/device, expiry and scope; aliases are not authority conversion.
 */
public final class CameraMetadataRoute {
    public static final String ACTION = "KABISEO_CAMERA_METADATA";
    public static final String LEGACY_ACTION = "POBISEO_CAMERA_METADATA";
    public static final String DISPLAY_NAME = "카비서";
    public static final int MAX_RECEIPTS = 128;
    public record Request(String action, String requestId, String commandId) {
        public Request { valid(action); valid(requestId); valid(commandId); }
        private static void valid(String s) {
            if (s == null || !s.matches("[A-Za-z0-9_.:-]{1,128}"))
                throw new IllegalArgumentException("invalid request identifier");
        }
    }
    public interface Host {
        default boolean metadataRouteEnabled() { return false; }
        /** Return the CURRENT binding on EVERY call, or null when not authorized.
         * Must be repeatable/read-only; never consume a command or dispatch a device action here.
         * Validate the original request.action(), including any explicitly enrolled legacy alias.
         */
        default Binding authorize(Request request) { return null; }
        default Permit metadataPermit(Binding binding) { return Permit.deny(); }
        default String currentLayoutRevision(Binding binding) { return null; }
        default Profile enrolledProfile(Binding binding) { return null; }
    }
    @FunctionalInterface public interface Reader {
        Observation read(Binding binding, Profile profile);
    }
    public enum Status { DENIED, PROFILE_REQUIRED, CAMERA_READ_ONLY, UNAVAILABLE }
    public enum Reason { ROUTE_DISABLED, UNSUPPORTED_ACTION, NOT_AUTHORIZED, BINDING_CHANGED,
        BUSY, RECEIPT_CAPACITY, REQUEST_SCOPE_CHANGED, READ_FAILED, SURFACE_NOT_VERIFIED,
        PROFILE_NOT_ENROLLED, CAMERA_METADATA_VERIFIED, HOST_FAILURE }
    /** Contains no images, conversation text, IDs, coordinates or node list.
     * replayed receipts are historical results, NOT evidence of the current screen.
     */
    public record Receipt(Status status, Reason reason, boolean replayed, long completedAt) {
        public boolean permitsGesture() { return false; }
        public boolean permitsPixels() { return false; }
        public boolean cameraSettingsChanged() { return false; }
    }
    private record Key(String command, String request) {}
    private record Cached(Binding binding, String originalAction, Profile profile, Receipt receipt) {}
    private final Host host; private final Reader reader; private final LongSupplier clock;
    private final Map<Key, Cached> receipts = new LinkedHashMap<>();
    private boolean handling;
    public CameraMetadataRoute(Host host, Reader reader, LongSupplier monotonicClock) {
        this.host=Objects.requireNonNull(host); this.reader=Objects.requireNonNull(reader);
        this.clock=Objects.requireNonNull(monotonicClock);
    }
    /** Existing JH journal still owns durable replay protection. No cross-thread device work. */
    public synchronized Receipt handle(Request request) {
        long now=clock.getAsLong();
        if (request == null || !(ACTION.equals(request.action()) || LEGACY_ACTION.equals(request.action())))
            return deny(Reason.UNSUPPORTED_ACTION,now);
        if (handling) return deny(Reason.BUSY,now);
        // Protect authorization callbacks too, not just the eventual metadata reader.
        handling=true;
        try { return handleOnce(request,now); }
        finally { handling=false; }
    }
    private Receipt handleOnce(Request request,long now) {
        final Binding binding;
        try {
            if (!host.metadataRouteEnabled()) return deny(Reason.ROUTE_DISABLED,now);
            binding=host.authorize(request);
            if (binding == null || !request.commandId().equals(binding.commandId())
                    || !authorized(request,binding,clock.getAsLong()))
                return deny(Reason.NOT_AUTHORIZED,clock.getAsLong());
        } catch (RuntimeException e) { return deny(Reason.HOST_FAILURE,clock.getAsLong()); }
        Key key=new Key(request.commandId(),request.requestId());
        Cached cached=receipts.get(key);
        if (cached != null) {
            if (!cached.binding().equals(binding) || !cached.originalAction().equals(request.action()))
                return deny(Reason.REQUEST_SCOPE_CHANGED,clock.getAsLong());
            try {
                if (!Objects.equals(cached.profile(),host.enrolledProfile(binding))
                        || !authorized(request,binding,clock.getAsLong()))
                    return deny(Reason.BINDING_CHANGED,clock.getAsLong());
            } catch (RuntimeException e) { return deny(Reason.HOST_FAILURE,clock.getAsLong()); }
            Receipt old=cached.receipt();
            return new Receipt(old.status(),old.reason(),true,old.completedAt());
        }
        if (receipts.size()>=MAX_RECEIPTS) return deny(Reason.RECEIPT_CAPACITY,clock.getAsLong());
        Receipt receipt; Profile profile=null;
        try {
            profile=host.enrolledProfile(binding);
            if (!authorized(request,binding,clock.getAsLong()))
                receipt=deny(Reason.BINDING_CHANGED,clock.getAsLong());
            else {
                Observation metadata=reader.read(binding,profile);
                long ended=clock.getAsLong();
                if (!Objects.equals(profile,host.enrolledProfile(binding))
                        || !authorized(request,binding,ended))
                    receipt=deny(Reason.BINDING_CHANGED,clock.getAsLong());
                else if (metadata == null) receipt=deny(Reason.READ_FAILED,ended);
                else {
                    // Recompute independently of the reader and re-check live authority at publish time.
                    Permit permit=host.metadataPermit(binding);
                    Result result=CameraSurfacePolicy.inspect(binding,permit,metadata,profile,clock.getAsLong());
                    if (!Objects.equals(profile,host.enrolledProfile(binding))
                            || !authorized(request,binding,clock.getAsLong()))
                        receipt=deny(Reason.BINDING_CHANGED,clock.getAsLong());
                    else receipt=switch(result.state()) {
                        case DENIED -> deny(Reason.SURFACE_NOT_VERIFIED,clock.getAsLong());
                        case METADATA_ONLY_PROFILE_REQUIRED -> new Receipt(Status.PROFILE_REQUIRED,Reason.PROFILE_NOT_ENROLLED,false,clock.getAsLong());
                        case READ_ONLY_CAMERA_SURFACE -> new Receipt(Status.CAMERA_READ_ONLY,Reason.CAMERA_METADATA_VERIFIED,false,clock.getAsLong());
                    };
                }
            }
        } catch (RuntimeException e) {
            receipt=new Receipt(Status.UNAVAILABLE,Reason.READ_FAILED,false,clock.getAsLong());
        }
        receipts.put(key,new Cached(binding,request.action(),profile,receipt));
        return receipt;
    }
    private boolean authorized(Request request,Binding binding,long now) {
        // Full binding equality catches a reopened camera even when layout/window IDs are reused.
        if (!host.metadataRouteEnabled() || !binding.equals(host.authorize(request))) return false;
        Permit permit=host.metadataPermit(binding);
        String layout=host.currentLayoutRevision(binding);
        long checkedAt=clock.getAsLong();
        return checkedAt>=now && CameraSurfacePolicy.mayReadMetadata(binding,permit,checkedAt)
                && binding.layoutRevision().equals(layout) && host.metadataRouteEnabled();
    }
    private static Receipt deny(Reason reason,long now) { return new Receipt(Status.DENIED,reason,false,now); }
}
