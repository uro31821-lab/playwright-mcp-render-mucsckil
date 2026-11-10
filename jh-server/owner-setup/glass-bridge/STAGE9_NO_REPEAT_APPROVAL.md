# Stage 9 — No repeated approval UX (2026-11-10)

## User decision
Every-photo screen-share approval is unacceptable for ordinary Ray-Ban Meta -> JH/GPT usage. Use a **trusted, bounded, user-authorized photo session** instead. Do not emulate or auto-click Android OS permission prompts or bypass Secure56.

## Two distinct paths

**A. Current temporary native screen capture (for diagnosis only):**
- Existing JH one-shot screen capture requires an actual phone-local task-scoped approval. A new screenshot is a new user permission boundary.
- This path was device-verified as an ephemeral image transport in Stage 8, but ChatGPT pixel inspection was NOT verified. It must not be silently automated.
- Reuse granted frames only within the exact permission/scope allowed by Android and the JH signed session. Never extend a one-frame permission to future requests.

**B. Target everyday path — direct DAT photo transfer (recommended):**
1. Explicit user-initiated one-time pairing between Meta CameraAccess-derived app and **verified owner-bound** JH session, with phone-local approval for the enrollment process (not a generic OAuth page click).
2. Bind to known device/app certificate, owner, server, limited capture scope, and a revocable session. Use short-lived per-photo upload tokens minted internally and passed only to the authenticated phone app.
3. A photo is sent **only when the user gives a direct command** (e.g., taps "JH로 보내기" or says "에비서, 이거 봐줘" once a supported voice listener exists). The explicit user command acts as photo-level authorization; no separate confirmation dialog for every ordinary, non-sensitive photo if that policy is verified and the active session grants this scope.
4. JH returns a digest/length receipt. No auto replay after ambiguous errors; no background surveillance or continuous upload.
5. If pairing expires, server/owner/device changes, user revokes it, or sensitive data is suspected, require new user confirmation or stop. For clinical data, default block until a dedicated privacy/consent review; never auto-send patient data.
6. End session and erase ephemeral tokens on user request, timeout or logout. Clear visible "connected" / "transmitting" status in the app.

## What cannot be promised
- "Auto approval" does NOT mean auto-tapping Android MediaProjection/phone security dialogs. OS-managed permission prompts remain user controlled when applicable.
- Camera DAT app bypasses repeated MediaProjection *because it does not use screen capture*, not because security is disabled.
- Current CameraAccess Stage 7 code still has a default-disabled JH control and optional confirmation UI. **No production code change or installed APK update** has happened for this Stage 9 decision.
- No supported proof that ChatGPT will accept images as file attachments into an arbitrary existing thread; prefer an authenticated MCP image result for the user's current request and test with the actual host.
- No extra OpenAI API cost incurred by this source-only design; zero-cost live runtime requires quota/route verification.

## Implementation priorities
1. Replace planned repetitive per-photo confirmation UI with **bounded user-authorized session scope** and an explicit photo command. Keep secure UI on initial pairing, renewal and sensitive data.
2. Implement/verify stable OAuth owner binding + actual JH Secure56 device-local pairing approval; no anonymous PHOTO scope or LIFE_HUB_TOKEN fallback.
3. Wire one-time photo token delivery to app and hardened photo ingress; test SHA-256 receipt and isolated chat claim, then release candidate and explicitly authorized device install.
4. Validate UX: 1 initial enrollment confirmation, 0 extra approval prompts for each ordinary authorized photo within valid session, 1 explicit photo command per sent image, 0 silent background photos, 0 replay, 0 additional paid API calls.
