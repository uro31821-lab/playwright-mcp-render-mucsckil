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

## Stage 5: Prevent another chat from claiming the same owner's photo

New isolated source: `photo-claim-gate.mjs` and `photo-claim-gate.test.mjs` (Node.js v22 local **23/23 PASS**, test result captured).
- Existing mailbox and photo-session are **owner-scoped**, not ChatGPT-conversation-scoped. Exposing `photoSession.consume()` directly as an MCP action could leak a photo to a different conversation for the same owner. **Never expose that raw consume API**.
- `beginForChat` requires verified OAuth `glassOwnerVerified === true` and returns a 256-bit chat-only claim token and opaque request ID; **it does not return the mobile upload bearer**.
- `deliverToApprovedPhone` separately requires a trusted Secure56 approval callback bound to the same owner/request. This method is internal to a future phone-only route, never a generic MCP tool. Race/replay/expired/wrong-owner tests pass under mocked approvals.
- `consumeForChat` requires the valid original chat token, verified same owner and unused 90-second claim; other chats cannot fetch the image using only the same OAuth credentials.
- No ChatGPT stable conversation identifier or automatic attachment injection is assumed. This design only protects a chat-request-specific image retrieval, pending real host integration.
- Actual native JH Android app source was not present in the accessible JH GitHub server repository; verified phone-side approval UI and owner account-binding remain **BLOCKED**, not completed.
- This source must remain isolated from `jh-server/server.mjs` until trusted approval, safe JPEG decoding, HTTPS/rate limits, security review and end-to-end tests are completed.

### Stage 5 hosted CI confirmation

GitHub Actions test run [42831289969](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/42831289969) actually completed SUCCESS at commit `067923af5f6e19e38902dc8bea3795fa58cbcf75` on the development branch, using Node.js 24.22.2. **106/106 tests passed, 0 failed** across Stage 2–5 test files. The CI also verified `NO_PRODUCTION_WIRING_CONFIRMED` (the live server source does not import glass-bridge). See `RESULT_STAGE5_GITHUB_CI.md`. This does NOT establish real phone approval, official Meta SDK changes, production deployment or ChatGPT image receiving.

## Stage 6 — independent CameraAccess Android source candidate, compile verified

- New source: `android_cameraaccess/JhGlassPhotoClient.kt`, `apply_cameraaccess_patch.py`, `test_patch.py`, `README_STAGE6.md`.
- **Actual official Meta Android SDK compilation PASS**: GitHub [Actions 42834093333](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/42834093333), JH commit `47da2a525a785cca7db71e753ed9bad9dc44ae42`, official Meta pinned commit `f4371bc9f90249d51eb07d7f8a61e8d829294f16`. Java17 / Gradle 8.14.1, `./gradlew --no-daemon :app:compileDebugKotlin` → **BUILD SUCCESSFUL in 1m 24s**.
- Source patch Python tests **4/4 PASS**, patch idempotent, original Android `Share` preserved, new `JH로 보내기` button **disabled by default** until an actual Secure56 approved pairing source exists.
- Pixel re-encode to <=2 MiB JPEG, no metadata copy and disabled-by-default HTTPS uploader compile, **not** exercised on phone or connected to JH server.
- No APK release, user-device change, JH production server import, plugin update or new OpenAI API request; source-only stage. Detailed evidence in `RESULT_STAGE6_ANDROID_COMPILE.md`.
- Remaining blocker: current JH Android native source / real owner-bound Secure56 phone approval + trusted pairing provider, hardened live server ingress and authenticated per-chat MCP image return.

## Stage 7 — explicit native consent and image receipt verification (hosted CI PASS)

- New optional **JH로 보내기** consent dialog (patient/private-info checkbox is unchecked by default); ordinary Meta `Share` unchanged. JH action remains **disabled by default** until a real approved pairing provider is connected.
- Android sender now tracks one-use pairing tokens in volatile process memory, will not auto-retry uncertain uploads, and checks server-provided SHA-256 plus JPEG byte length before treating an HTTP 202 as acceptance. No OpenAI API usage or long-lived secrets in APK.
- Source-only Node [CI 42836361065](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/42836361065) **108/108 PASS**; Android [CI 42836340755](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/42836340755) **6/6 patch tests and official Meta Kotlin BUILD SUCCESSFUL**. No live device install, no production server MCP/photo upload, no screen-capture E2E.
- Detailed proof: `RESULT_STAGE7_RECEIPT_AND_CONSENT.md`.
- **Next efficient test (candidate, not verified):** Use existing approved JH screen-capture MCP to capture the *photograph preview visible on the phone* into the same GPT request, with explicit phone-local screen consent. This is a potential no-paid-API alternative to uploading JPEG via a new backend; not tested on the native Meta CameraAccess app and may have resolution/foreground limitations. Until proved, keep the dedicated upload blockers open.

## Stage 10 — 최초 승인 후 각 사진 한 번 탭 (코드 검증)

- 사용자 확정 UX: **반복되는 화면 공유 승인창 제거**, 최초 등록만 실제 Secure56 휴대전화 승인; 이후 사용자가 사진마다 **전송 버튼 한 번**을 직접 눌러야 함.
- Server `approved-device-session.mjs`: 최초 등록에 P-256 Android Keystore 공개키/서명 및 모의 Secure56 승인 사용, 사진마다 등록된 키 서명 검증·만료·중복 방지. 실제 Secure56 승인기와 운영 서버에는 아직 연결하지 않았음.
- Android `JhGlassDeviceSigner.kt`: 비밀키를 휴대전화 AndroidKeyStore 밖으로 꺼내지 않는 코드, 사용자가 선택한 사진의 해시 서명 가능. UI는 매번 확인 `AlertDialog` 없이 **`JH로 보내기` 1회 탭**으로 변경했지만 기본 전송 비활성/콜백 미연결 유지.
- Photo claim은 서명한 JPEG 해시와 실제 업로드된 JPEG 해시를 대조해 맞지 않으면 폐기.
- GitHub [Node CI 42841542013](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/42841542013) **141/141 통과**; [Android compile 42841253151](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/42841253151) **패치 7/7 + BUILD SUCCESSFUL**. 운영 배포·APK 설치·안경 사진의 실제 GPT 분석은 미완료.
- [RESULT_STAGE10_NO_REPEAT_APPROVAL.md](RESULT_STAGE10_NO_REPEAT_APPROVAL.md)에 세부 근거 및 다음 차단조건 기록.


## Stage 11: encrypted enrollment retention and original source recovery (CI PASS)

- `encrypted-device-store.mjs` implements fail-closed, AES-256-GCM encrypted persistent JH owner-to-Android-P256 **public-key** trust. The disk path/32-byte key/server identity must be supplied by a trusted operator; no implicit key creation or token/photo persistence.
- `approved-device-session.mjs` now accepts a trusted store interface, restores valid P-256 enrollment at startup and persists enrollment/revocation before reporting success; storage failures disable further photo-intent verification in the current process.
- [GitHub CI run 42844334373](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/42844334373) for commit `bdde30dc8fc820a52b1f135fd7aff743cae5517d`: **154/154 tests PASS, 0 failed**, and `NO_PRODUCTION_WIRING_CONFIRMED`. This includes real temporary-disk restart, corruption and revocation tests, but **not** a real deployed Secure56 account approval or Android E2E.
- E184P2 native Android source ZIP was **found by Library metadata** (2,725,328 bytes), but it could not be read or materialized into the development runtime: `This Project file does not have an authorized raw-byte materialization path`. Do not infer its contents or alter the actual signed JH app without an authorized, direct upload.
- Existing JH Render operating branch, installed JH and CameraAccess apps, and JH plugin were not changed. No OpenAI API calls made for this stage.
- Detailed evidence and release blockers: `RESULT_STAGE11_DURABLE_TRUST_AND_SOURCE_RECOVERY.md`.

## Next incomplete work
- Connect verified JH OAuth principal to begin/consume MCP tool.
- Add separate reviewed HTTP ingress, and simulate successful/invalid/replay/oversize requests.
- Add explicit JH transfer button to CameraAccess captured photo preview, preserving official Share as-is.
- Validate Kotlin compile/Android build/AV and approved phone update.
- Do NOT repeat previously successful DAT setup, camera build, install, or live stream tests.

Official SDK: https://github.com/meta/meta-wearables-dat-android
Pinned official sample commit: f4371bc9f90249d51eb07d7f8a61e8d829294f16.
