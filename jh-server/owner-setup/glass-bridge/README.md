# JH Glass Bridge — Photo Mailbox Prototype

Status 2026-11-10: SOURCE CANDIDATE, TESTS ONLY. NOT DEPLOYED. No running HTTP route, MCP tool, APK modification, OpenAI API call, or photo storage on disk.

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

## Test
node --test jh-server/owner-setup/glass-bridge/photo-mailbox.test.mjs

## Next incomplete work
- Connect verified JH OAuth principal to begin/consume MCP tool.
- Add separate reviewed HTTP ingress, and simulate successful/invalid/replay/oversize requests.
- Add explicit JH transfer button to CameraAccess captured photo preview, preserving official Share as-is.
- Validate Kotlin compile/Android build/AV and approved phone update.
- Do NOT repeat previously successful DAT setup, camera build, install, or live stream tests.

Official SDK: https://github.com/meta/meta-wearables-dat-android
Pinned official sample commit: f4371bc9f90249d51eb07d7f8a61e8d829294f16.
