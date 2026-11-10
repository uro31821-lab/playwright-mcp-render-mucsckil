# JH Glass Bridge — Stage 5: photo claim isolation

Date: 2026-11-10. Status: **source-only candidate**, no production install/deploy.

## Objective
Even after JH OAuth proves a human owner, multiple ChatGPT conversations can share that identity. The older photo mailbox and `photo-session.mjs` are keyed only by owner, and exposing `photo-session.consume` as an MCP tool could allow another conversation of the **same** owner to consume the image. Stage 5 introduces a separate, opaque **chat claim** (32 random bytes) to control consumption.

## New source
- `photo-claim-gate.mjs` — only the original chat gets `chatClaimToken`; **never** returns the phone upload bearer in the chat result. A separate `deliverToApprovedPhone()` releases the photo upload bearer only after server-side Secure56 approval verification for the same owner and request. One owner has at most one outstanding chat claim, valid for at most 90 seconds.
- `photo-claim-gate.test.mjs` — 23 local Node.js tests covering separate-chat exclusion, wrong owner, wrong claim, no stable OAuth subject, unverified account, refresh, expiry, replay, overlapping pairing, request races, and in-flight approval invalidation.

## Essential guards (not to be bypassed)
- `glassOwnerVerified: true` MUST come from the **trusted, server-internal** OAuth token record issued through the Stage 4 approval gate. The mobile app and MCP tool input cannot create/forge this flag.
- `verifyPhoneApproval` must be backed by a real, signed local Secure56 approval job and a separately authenticated account/device binding, not a client JSON object or a mock. No phone approval provider exists in the current production app; this candidate is **not ready for use**.
- The caller must route `beginForChat()` output **only** to ChatGPT and `deliverToApprovedPhone()` output **only** to the signed device transport. The latter is not a public MCP tool.
- Only register `consumeForChat` / `statusForChat` as authenticated photo tools; do **not** expose the underlying `photo-session.consume` or `GlassPhotoMailbox.consumePhoto` directly. Do not print/log/URL/include claim or phone bearer in durable traces.
- Until HTTP ingress is hardened with an actual JPEG decoder, rate limits, trusted HTTPS termination and strict size limits, **do not deploy**. Also block real patient/clinical images pending privacy review.
- The claim is a per-request secret, **not an authenticated ChatGPT conversation ID**. Direct insertion into the current chat by the platform remains unverified. The host can retrieve a photo only when the user invokes the action in the same chat and supplies the pending claim through the authorized workflow.

## Local QA
`node --test photo-claim-gate.test.mjs`: **23/23 PASS** under Node.js v22.16.0, with a mocked session and mocked phone approval; no remote or Android E2E testing. The test uses a minimal copy of `verified-owner.mjs` with the same supported contract as the GitHub branch file; the GitHub source should be retested under CI after upload.

## Next
Obtain/build actual JH Android source with an explicit photo approval UI; implement signed owner-binding job in the Secure56 runtime. Then test Stage 4 OAuth owner-approval verifier and Stage 5 chat-claim gate together, add MCP image returns and guarded HTTP ingress, build the CameraAccess `JH 전송` UI and perform approved phone E2E. Existing CameraAccess APK/camera proof stays valid and should not be repeated.