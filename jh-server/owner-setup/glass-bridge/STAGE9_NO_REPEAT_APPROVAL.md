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

## Stage 10 implementation check (2026-11-10)

- No-repeat-confirmation source implementation exists in `android_cameraaccess/apply_cameraaccess_patch.py`: **JH로 보내기 1회 탭 = 해당 사진 1회 콜백**, 기존 Share 유지, 기본 비활성화.
- `android_cameraaccess/JhGlassDeviceSigner.kt`: AndroidKeyStore 내보내기 불가능한 P-256 개인키; 사용자가 사진 전송을 지시한 경우에만 사진 다이제스트에 서명하도록 만든 별도 클래스. 아직 실제 이벤트/인증 제공자 연결 전.
- `approved-device-session.mjs`: 최초 Secure56 승인 콜백(운영 실물은 미연결)을 통한 기기 등록과, 등록된 공개키로 사진별 서명·만료·재사용 검증. 기본 등록 유효기간 30일 초안; 장기 갱신 및 영속 저장은 출시 전 재검토해야 함.
- `photo-claim-gate.mjs`: 서명된 사진 SHA-256와 실제 수신 JPEG SHA-256가 다르면 채팅 전달 거부.
- GitHub 자동시험: 서버 141/141 성공, 공식 Meta Android 패치 7/7 + Kotlin 컴파일 성공. 자세한 근거는 `RESULT_STAGE10_NO_REPEAT_APPROVAL.md`.
- **실제 사진 전송/ChatGPT 분석/휴대전화 승인 1회 등록은 여전히 미구현/미검증. 운영 앱·서버 변경 없음.**


## Implementation priorities
1. Replace planned repetitive per-photo confirmation UI with **bounded user-authorized session scope** and an explicit photo command. Keep secure UI on initial pairing, renewal and sensitive data.
2. Implement/verify stable OAuth owner binding + actual JH Secure56 device-local pairing approval; no anonymous PHOTO scope or LIFE_HUB_TOKEN fallback.
3. Wire one-time photo token delivery to app and hardened photo ingress; test SHA-256 receipt and isolated chat claim, then release candidate and explicitly authorized device install.
4. Validate UX: 1 initial enrollment confirmation, 0 extra approval prompts for each ordinary authorized photo within valid session, 1 explicit photo command per sent image, 0 silent background photos, 0 replay, 0 additional paid API calls.
