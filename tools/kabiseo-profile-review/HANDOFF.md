# 카비서 v0.20 — 현지 수집·검토·승인·조회 연결 후보

`CameraProfileHandoff` connects trusted local metadata receipts to the existing review and a one-use, exact-evidence approval. It is a source-level integration candidate, NOT a real Android collector, phone-local approval UI, persistent registry or active JH endpoint. All current tests use a synthetic Host.

## Actual state flow
COLLECTING → REVIEW_READY → COMMITTING → ENROLLED_LOCAL_LEASE → CLOSED.
The Host defaults deny. Captures must be authenticated by the existing original session, current device, command, package, signer, version and fold/display configuration. Screen labels and camera-opening IDs must be locally observed, not supplied by a chat request. The controller bounds sample count, age and session duration, retains all samples for review and freezes the exact snapshot before approval.

The canonical digest includes scope, expiry, every sample/label/opening/capture/time/node flag/bounds and selected markers. The review Ticket has a private constructor and is instance-bound. A Host consumes an already-existing phone-local approval for the exact scope/digest once. False, exception, revocation or timeout ends the attempt without replay. No UI launch or new approval request is performed by the controller.

Only after that Host verification does the memory-only registry expose a read-only Profile. Every lookup rechecks the current full identity, approval and monotonic lease. Cancellation, timeout and process restart discard the lease. Returned Profile values MUST NOT be cached or treated as action authorization. Existing `CameraSurfacePolicy` remains the final read-only surface matcher. No zoom, exposure, gesture, pixel, shutter or send authorization is added.

## Remaining real integration seams
1. A local Android metadata collector must attach existing authorization and freshly observed opening/capture labels without reading text, descriptions or pixels. The existing camera-only inspector rejects visible edit fields and cannot be silently reused to collect CHAT negative controls. A separately authorized local enrollment observer is required; no camera-policy bypass.
2. A trusted phone-local approval adapter must consume consent bound to the exact evidence digest. Implementing Host by returning true is a test fixture, not authentication.
3. The existing Android `Profiles.enrolled(package,version,signer)` lacks the fold/display `screenScope`. A real adapter must measure and compare full identity on every lookup. Dropping that field is forbidden. The current `Profiles { _,_,_ -> null }` stays unchanged.
4. This first controller intentionally keeps leases only in memory. It does not install durable profiles, and no real ChatGPT resource IDs or signing certificate are guessed.

No production/Android source, APK, dependency, permission, Node security hold, server configuration or installed app changes. Existing CI compiles this isolated Java code with JDK17 and executes fixtures only. Runtime security-hold resolution and original release/device approvals remain separate.
