# JH Glass Bridge — Photo Mailbox Prototype

Status 2026-11-10 (Stage 3): SOURCE CANDIDATE, TESTS ONLY. NOT DEPLOYED. No running HTTP route, MCP tool, APK modification, OpenAI API call, or photo storage on disk.

## Starting point
- Meta CameraAccess app on actual phone: build + debug signature + Defender + installation confirmed in user's screenshots.
- Actual Ray-Ban Meta glasses video streaming confirmed in phone preview.
- Upstream CameraAccess photo screen uses Android ACTION_SEND and opens Android sharing, which does not target the ongoing ChatGPT conversation.
- Current JH server did not expose a glasses-image upload tool; its Render service has autoDeploy disabled.

## Proposed integration (not complete)
1. JH's authenticated MCP request creates 256-bit one-use pairing token, valid 90 seconds; owner identity MUST come from verified OAuth principal (never request body).
2. Phone starts pairing from the user-approved JH deep link, or equivalent authenticated transport.
3. User captures a photo. The CameraAccess Bitmap is re-encoded without metadata as JPEG, <= 2 MiB, after explicit consent.
4. HTTPS endpoint uses strict TLS, rate limits, request limits imposed while streaming, no body or bearer-token logging, and stores the image only in this owner-bound ephemeral mailbox.
5. Authenticated MCP photo-consume returns one ephemeral image to the ongoing host workflow. Local in-memory buffer is erased; auto-expiry 90 seconds.
6. Host can analyze and route the photo to the appropriate JH assistant. There is no claim that ChatGPT supports direct injection into an existing conversation.
7. Glasses audio output may be added only after a separate Android/SDK test.

## Security
- No unauthenticated public upload, no embedded JH or OpenAI API keys, no automatic retry, no storage or disk dump.
- At most one pending photo per owner; pairing is one-use and expires.
- Server adapter MUST stop bodies greater than 2 MiB before buffering, handle chunked attacks, and validate actual JPEG decoding in a safe decoder. Magic bytes alone are not a complete image validation.
- Clinical/patient data must be blocked by default until separate consent/privacy gating is verified.
- Do not wire to production, deploy, restart, install, or request paid API work without explicit operational permission.

## OAuth owner-binding preflight
- Added verified-owner.mjs and verified-owner.test.mjs. The server currently issues scope/expiry-only OAuth records and **does not yet have a stable authenticated subject**.
- Tokens without a verified stable subject fail closed; before production wire-up, add owner subject at initial OAuth grant and propagate it on refresh, without weakening existing auth. Only the server may supply the verified record.
- These are isolated modules; live server.mjs remains unchanged. Local test result for owner contract: 6/6 PASS.

## Stage 3 candidate code and verified local tests

- Added photo-ingress.mjs: isolated HTTP handler for /jh-glass/v1/photo (NOT mounted on running server); denies unsupported routes/methods, untrusted native uploads, non-JPEG, over-2MiB, and decoded-image rejection.
- Upload requires an injected TRUSTED transport attestation, rate/approval gate, and real JPEG decoder validator. Without those, the endpoint fails closed with 503.
- photo-mailbox.mjs invalidates one-use pairing tokens on bad uploads and periodically sweeps expired memory. Token never appears in URL or response.
- Added photo-session.mjs: isolated begin/consume/status wrapper requiring a verified OAuth subject. Current JH server's existing scope-only OAuth records cannot pass this gate.
- HTTP adapter returns only a receipt; it does not call GPT. ChatGPT existing-thread image auto-injection remains unverified/unimplemented.
- Local QA in Node 22: 28 unit tests across ingress + owner + session, and 13 legacy mailbox assertions = 41/41 PASS. These are local simulations, not network penetration testing, GitHub CI, live JH server, Android compile, or device E2E.
- No change to jh-server/server.mjs.

### Required before deployment (still open)
1. Strong verified OAuth owner identity, with owner-approved login and refresh continuity. Never invent subject from client input.
2. Trusted HTTPS proxy configuration, rate limits, request timeouts, oversize-stream handling, and real bounded JPEG decoding.
3. Authorized MCP begin/consume tools and host image-return verification.
4. CameraAccess photo transfer UI with human consent and patient-data safeguards.
5. Security review and explicit approval before live server deployment or phone installation.

## Test
node --test jh-server/owner-setup/glass-bridge/photo-*.test.mjs jh-server/owner-setup/glass-bridge/verified-owner.test.mjs

## Stage 4: Owner-approved OAuth gate + localhost HTTP integration (SOURCE ONLY, NOT DEPLOYED)

New files:
- `owner-oauth-gate.mjs`: validates **server-verified Secure56 phone-local approval** bound to one exact ChatGPT OAuth request, server digest, resource, and nonce; derives stable pseudonymous owner subject via dedicated HMAC key. An ordinary OAuth browser button is not considered proof.
- `owner-oauth-gate.test.mjs`: checks invalid/expired/forged/replayed approval, exact redirect/client/resource/PKCE binding, one-shot code, owner separation and refresh continuity.
- `glass-local-http.integration.test.mjs`: real **localhost** HTTP POST against the isolated photo-ingress adapter; verifies one-time JPEG receipt, per-owner consume, replay, oversize denial and fail-closed paths. Signature/approval and safe JPEG decoder callbacks were stubs. **NOT** live proof.
- `secure56-glass-approval.mjs` / `secure56-glass-approval.test.mjs`: verify phone receipt HMAC with active server Secure56 secret PLUS actual phone-local approved job and separate server-owned account/device ownership record. This verifier is source-only; the phone job type and ownership store are NOT installed.\n- `STAGE4_INTEGRATION_GATES.md`: the line-level plan for integrating with current JH OAuth+Secure56 code, without weakening existing auth.

**Local Node 22 test run:** 70/70 PASS (Stage 3 suite 28, owner OAuth gate 19, localhost HTTP 6, signed Secure56 approval 17). Not GitHub CI, not a deployed OAuth verifier, not Android/GPT end-to-end. No API calls or paid services used.
**Current blocker:** Live JH `/oauth/authorize` form does not authenticate an individual owner and its issued tokens lack a stable subject; Secure56 GLASS owner approval must be implemented and actually verified before production wiring. Legacy scope-only tokens and LIFE_HUB_TOKEN fallback must never grant photo access.

## Next incomplete work
- Connect verified JH OAuth principal to begin/consume MCP tool.
- Add separate reviewed HTTP ingress, and simulate successful/invalid/replay/oversize requests.
- Add explicit JH transfer button to CameraAccess captured photo preview, preserving official Share as-is.
- Validate Kotlin compile/Android build/AV and approved phone update.
- Do NOT repeat previously successful DAT setup, camera build, install, or live stream tests.

Official SDK: https://github.com/meta/meta-wearables-dat-android
Pinned official sample commit: f4371bc9f90249d51eb07d7f8a61e8d829294f16.
