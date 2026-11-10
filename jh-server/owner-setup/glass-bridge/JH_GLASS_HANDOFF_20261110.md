# JH Glass Bridge — conversation handoff, 2026-11-10

STATUS: This is a **proactive checkpoint**, not a claim that ChatGPT context utilization has reached 95%. Prepare the final handoff again when actual context capacity is near its limit.

## 1. Goal
Ray-Ban Meta glasses -> photo/voice -> GPT & JH Secure Live professional assistants, without requiring the Android Share chooser or opening a different ChatGPT chat. Do not add recurring expenses beyond existing subscription/free API credits.

## 2. Exact current source / state
- User enabled Meta developer mode; DAT device component version displayed as 1.0.0.0.
- Official Meta Android SDK: 1.0.1, CameraAccess sample pinned source commit f4371bc9f90249d51eb07d7f8a61e8d829294f16.
- Existing Windows development: JDK17, SDK36/build-tools36, Gradle8.14.1 from official example. Phone SM-F971N.
- CameraAccess app package: com.meta.wearable.dat.externalsampleapps.cameraaccess (different from existing JH app com.koreanlifehub.bridge).
- JH Render service: jh-secure-bridge-fix4, branch jh-fix3-secure-server, autoDeploy OFF. No live modification.
- Source candidate branch: feature/jh-glass-photo-mailbox-20261110 in uro31821-lab/playwright-mcp-render-mucsckil.
- Prototype files: verified-owner.mjs and verified-owner.test.mjs added. A verified stable OAuth subject is REQUIRED before JH wire-up (6/6 isolated tests pass).
- Prototype files: jh-server/owner-setup/glass-bridge/photo-mailbox.mjs, photo-mailbox.test.mjs, README.md.
- JH plugin currently inspected as version 1.34.87, but not updated for this work.

## 3. Confirmed complete + evidence
- Meta DAT connection / CameraAccess preview: user screenshot showed Session started + Stream streaming and actual scene.
- Windows independent debug APK: Gradle BUILD SUCCESSFUL; v2 signature passed; Windows Defender found no threats; ADB install success and live camera preview screenshot.
- Official CapturePreviewScreen.kt reviewed. Current Share invokes ACTION_SEND (generic chooser), causing other ChatGPT chat.
- JH GitHub branch created with unit-tested photo mailbox candidate. Local QA: 13/13 pass (representative copy of module source).
- No new OpenAI API usage for this stage; user previously disabled auto-recharge.

## 4. Failures / unknown
- ChatGPT sandbox ZIP links repeatedly failed; user asked not to use Google Drive.
- Git missing on Windows; solved earlier via official GitHub archive + curl + tar.
- PowerShell .ps1 blocked by policy; do not disable Windows security.
- No verified JH server upload endpoint or MCP image tool currently connected. Prototype only; no runtime/deployment proof.
- No official supported mechanism verified for inserting an attachment directly into an arbitrary existing ChatGPT conversation.
- The image mailbox does basic JPEG marker/size checks, but requires hardened HTTP body handling, actual image decode, OAuth owner-binding, token leakage protection, and rate limiting before connection.


### Authentication blocker discovered in live server source
- JH server.mjs currently authorizes OAuth access tokens by scope/expiry (oauthAccessAuthorized56), but the OAuth token records hold only scope and expiresAt, not a verified stable owner/subject identity.
- A production photo mailbox MUST NOT accept a user-supplied ownerId. Derive a verified owner or a session-bound identity from the existing server authorization boundary and verify continuity across MCP requests and possible OAuth refresh before wiring. LIFE_HUB_TOKEN fallback must not be treated as an owner identity.
- This is a **confirmed integration blocker**. The new module is deliberately NOT imported by server.mjs.

## 5. DO NOT repeat
- Developer mode setup; DAT install; Meta source download; JDK/SDK install; debug APK build/install; camera preview test.
- No old ZIP retries, Google Drive delivery, Git installer, PowerShell execution policy bypass.
- Do not touch existing JH app signature, uninstall apps, deploy live Render server, or spend API credits in this source-only phase.
- Do not claim existing chat auto attachment or complete hands-free integration.

## 6. Pending verification
- Read-only review of OAuth principal availability, Secure56 boundaries and current server wiring.
- Implement/test restricted HTTPS pairing and image ingress (<=2 MiB, one-shot token/90s expiry) and authenticated MCP consume.
- Implement Android client transfer UI and re-encode no EXIF; no long-lived secrets in APK.
- Backend request/response security tests, Android compile/AV/build, then explicitly approved device installation and E2E.
- JH per-assistant routing on returned image, eventual audio output, cost halt policy.


### Stage 3 continuation update — November 10, 2026
- New development source: secure56-glass-approval.mjs and secure56-glass-approval.test.mjs (real HMAC verification algorithm in isolated source, simulated trusted job/account callbacks, no existing phone code integration).\n- New development source: photo-ingress.mjs / photo-ingress.test.mjs and photo-session.mjs / photo-session.test.mjs on the same branch. The mailbox gained cancelPairing and a periodic memory-expiry sweep.
- LOCAL NODE QA: photo-ingress 17/17, photo-session 5/5, verified-owner 6/6 and existing mailbox local QA 13/13, total **41/41 PASS**. GitHub CI and actual HTTP/device tests NOT_RUN.
- photo-ingress only runs when injected transport/approval/JPEG-decode security gates all exist; it is NOT registered on running JH server. No API charge, no phone update, no production rollout.
- **CRITICAL BLOCKER:** existing JH server OAuth issues access credentials with expiry and scope but no verified owner subject. A new stable subject cannot be safely fabricated; an owner-authenticated binding and refresh propagation must be developed before any live MCP/image ingress connection.
- Source and docs verified on GitHub; current exact branch: feature/jh-glass-photo-mailbox-20261110.
- Next minimal action: build and test robust owner-verified authorization contract for JH OAuth under the existing Secure56 approval boundary, then connect the hardened HTTP/MCP adapters in a separate non-deployed branch candidate. Do not touch existing JH production server or APK yet.

### Stage 4 checkpoint — 2026-11-10 (continued)

- GitHub branch unchanged: `feature/jh-glass-photo-mailbox-20261110`. New `owner-oauth-gate.mjs`, `owner-oauth-gate.test.mjs`, `glass-local-http.integration.test.mjs`, and `STAGE4_INTEGRATION_GATES.md` saved.
- Real server code inspection reconfirmed: `server.mjs` OAuth `/oauth/authorize` button lacks verified human-owner login, token records currently contain expiry and scope only, and LIFE_HUB_TOKEN can authorize generic MCP without a photo-owner subject. **Do not treat that generic OAuth step as photo consent**.
- Standalone grant-binding contract requires the verified Secure56 phone-local approval callback, one-time proof, exact OAuth client/redirect/PKCE/resource, pinned server, and separate HMAC key. It carries owner through refresh while rejecting forged/replayed grant objects.
- LOCAL NODE 22 QA: `node --test *.test.mjs`, **70/70 PASS**, including 6 actual loopback HTTP requests and 17 simulated Secure56 HMAC/owner-job/account-binding tests with mocked authorization/decoder gates. Previous Stage 3 suite 28, Stage 4 grant 19, new HTTP 6. NOT GitHub CI, live OAuth verification, production server or Android E2E.
- `STAGE4_INTEGRATION_GATES.md` documents strict steps; owner-approval evidence, real safe JPEG decoder, rate limit and phone transfer UI are **still missing**. Nothing deployed; existing JH app remains untouched; API spend $0.
- User preferences reconfirmed: avoid Google Drive and unreliable sandbox ZIP links; maintain no-extra-cost policy and checkpoint the 7-section handoff when context is truly nearing limit (no invented 95%).
- **NEXT:** add actual, locally approved Secure56 `glass_owner_oauth_bind` phone job and server-owned account binding before using the isolated HMAC verifier (currently unavailable) and then the guarded photo MCP tool on a non-deployed branch. No launch of anonymous `/oauth/authorize` photo grants.

## 7. Next action
Next incomplete work: implement a real, server-verified, phone-local Secure56 owner approval for the OAuth request digest and tested owner token propagation; then separately connect authenticated MCP image consumption with strict ingress gates. Current owner proof provider is NOT implemented. Keep live Render, JH plugin and Android app unchanged until explicit approval.

## New-chat continuation phrase
JH 안경비서 이어서. GitHub의 feature/jh-glass-photo-mailbox-20261110 브랜치와 이 인계서를 기준으로, 사진 수신의 인증/MCP 연결부터 다음 미완료 단계로 계속해.
