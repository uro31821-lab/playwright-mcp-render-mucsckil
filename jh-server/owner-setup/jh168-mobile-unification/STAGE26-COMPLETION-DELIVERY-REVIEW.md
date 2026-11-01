# JH168 Stage26 — Complete the ORIGINAL action result, never repeat the action

## Observed evidence (2026-11-01)

Stage24 Android Chrome ⋮ action executed and verified earlier. In Stage25 live testing, a new signed CLICK operation timed out after the original 43-second wait. The server returned a scoped \`sfr_\` receipt; several subsequent read-only queries yielded \`SPLIT_FOLLOWUP_STILL_PENDING\`, with \`newJobCreated=false\` and \`automaticReplay=false\`. At the original 90-second job expiry, the receipt became unavailable. No final result for THAT original CLICK was recovered. **Its execution is UNKNOWN. Never replay it as a recovery step.**

Read-only phone Secure56 status also reported \`lastCompletionFailureCode=NETWORK_FAILURE\`, and an earlier \`lastLocalDiscardReason=SERVER_COMMAND_CHANGED\`. The phone's failure record does NOT contain the original CLICK job ID, so this diagnostic cannot be attributed to that exact job.

Source audit of existing Android \`BridgeService.completeResult\` confirms it removes the original Secure56 correlation and zeroizes the result bytes after a single signed HTTP completion attempt. If the completion HTTP response is lost, the same bytes cannot be resent. The original server endpoint also allowed different signed result bytes for an already-complete job (with a fresh nonce), so it lacked an identical-result-only duplicate ACK fence.

## Stage26 server — source-only candidate, NOT DEPLOYED

\`stage26-completion-delivery-policy.mjs\` and \`stage26-completion-delivery-patch.mjs\`:

- Apply to the exact **generated Stage25 Secure56 operator runtime**, not the immutable baseline.
- Preserve the original HMAC, one-shot nonce, signed device session, durable acceptance, OAuth and owner checks.
- Only AFTER original HMAC + fresh nonce validation, a second completion of the **same** job with **identical SHA-256 body** may return HTTP 200 as an idempotent ACK. A different result or a missing original digest returns HTTP 409 with no result overwrite.
- A FIRST completion still uses \`durableNativeHooks56?.acceptedCompletion\` and records a digest ONLY after the original durable hook accepts it.
- No UI action, job, approval, new browser path or credentials are created.
- This is process-local; after restart or job expiry, results are still UNKNOWN unless separately verified.

## Stage26 Android — Windows build-only handoff, NOT INSTALLED

Existing Stage24 source and all tests preserved. Modified:
- \`BridgeService.kt\` (frozen original completion bytes, **at most one** additional signed HTTP ACK after an IOException)
- \`CompletionResultRedeliveryPolicy.kt\` (new)
- \`CompletionResultRedeliveryPolicyTest.kt\` (new)

Restrictions:
- ONLY a previously VERIFIED non-sensitive Chrome overflow ⋮ CLICK can be ACK-redelivered.
- Original device/session, same command generation and running service are required.
- New Secure56 nonce and MAC for every HTTP attempt; NEVER reuse a consumed nonce.
- No redelivery for changed session, changed device, expired command fence, TLS/DNS error, arbitrary click, keyboard, text, approval, or different app.
- Phone never repeats \`AndroidAgent.executeRightPane\`, never changes a consent decision, and never persists original screen content or body to disk.
- Frozen result bytes live only during the current poll worker's completion HTTP call, then are wiped.
- No automatic replay after process or handset restart.

Local pure-JVM policy tests: 40 pass / 0 fail. **Full Gradle Android build/tests and device E2E NOT RUN yet.**

## Deployment order

1. Preserve and test Stage26 server patch and original Stage25 operator in CI (source-only; no production change).
2. Obtain Windows Stage26 unsigned APK review package from user using \`압축 풀기 → 실행.cmd\`. Verify complete Gradle tests and signed APK with the user's original certificate. Do not install unsigned APK.
3. Before installing candidate Android app, review/activate the server's signed idempotent result-ACK fence, with a single approved deployment and immutable/rollback audit. Existing Stage25 functions must remain.
4. Install signed Android candidate on the owner's phone without uninstall or data wipe, after server ACK compatibility is confirmed.
5. Verify a single safe Chrome ⋮ action, bounded request/result handling, wrong signed digest refusal, network-failure handling in a controlled non-device fixture; never deliberately disconnect a live phone mid-click to force an error.
6. Do not claim original Stage25 UNKNOWN click succeeded. No resending its external effect.

**No BullMQ, Redis, new certificate, token, personal data or public APK in GitHub.**

