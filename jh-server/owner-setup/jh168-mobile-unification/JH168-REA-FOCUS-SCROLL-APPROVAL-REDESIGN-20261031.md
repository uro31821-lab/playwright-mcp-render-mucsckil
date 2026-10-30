# JH168 · REA 기반 포커스·스크롤·Computer Use 승인 재설계 (2026-10-31)

## 기준 / 증거
- REA 6.8.0 실제 분석: [Actions #41093267546](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/41093267546). 후보 SHA `c99175d1600d87812913fdb76462ba7e0d81469b`, JS 13/13 parsed, failure 0, skipped 0. REA static graph findings 60 = **구조 분석 항목**, 결함 60건 아님. APK/Kotlin 실행 및 실제 외부 효과 시험은 REA 범위 밖.
- 운영 서버 기준: `cc6185f3919e9408ed38f1504b2d88f86f57c56d`; JH168 APK 서명·기기 검사 완료와 이 코드 후보의 실기기 작동은 별개. 기존 PR #68 결과 회수 성공, PR #69 Computer Use INSPECT 원래 작업 결과 회수 성공은 보존.
- 기존 휴대폰 실패: unfocused TYPE → `focused_input_required`; 네이버 검색창을 여는 FOLLOW_UP CLICK → `OWNER_ADMISSION_BLOCKED`; split SCROLL_ONCE → `DURABLE_OPERATION_NOT_SUPPORTED`; 이전 FIX9 prepare `scroll_target_ready` → execute `work_pane_obscured` (실제 가림 창 미확정).

## 외부 소스별 채택 / 배제
1. **AndroidX UI Automator + Appium UiAutomator2**: 단일 활성창이 아닌 모든 접근성 창의 **displayId/windowId, package, bounds, focused/active**를 구분해 현재 RIGHT Chrome만 선택. 다른 창의 대상 탐색을 성공으로 처리하지 않음. UI Automator/Appium 드라이버 자체는 APK 운영 엔진에 추가하지 않음. 공식 설명: https://developer.android.com/reference/kotlin/androidx/test/uiautomator/UiWindow .
2. **DroidBridge**: 한 번 관찰한 `observationId+nodeRef+AccessibilitySceneProof`를 클릭/타이핑 직전 다시 검증. 현재 화면 해시·접근성 노드·윈도우가 바뀌면 이전 대상 폐기. 코드: https://github.com/zephyr7030/DroidBridge .
3. **JH167 FIX9**: `AndroidScrollTargetPolicy.kt`의 방향별 explicit action 우선, explicit 방향이 없을 때만 forward/backward, 중첩 조상 관계를 증명한 **가장 깊은 단일 스크롤 노드** 선택 방식을 재사용. 이 판단은 현재 APK에 이미 존재할 수 있으므로 Kotlin 중복 구현 금지.
4. **adb-mcp**: `run_sequence`의 live guard → step → 결과 → 중단 지점 반환 방식을 참고해 GPT↔MCP 왕복을 줄일 수 있는 계약으로 설계. **ADB, 개발자 디버깅, 독립 서버, 임의 좌표 조작을 운영에 추가하지 않음.** https://github.com/iksnerd/adb-mcp/blob/main/internal/adb/sequence.go
5. **기존 Playwright**: `snapshot → 정확한 대상 → 1회 액션 → fresh snapshot` 흐름을 휴대폰에 이식. Chrome 프로필·쿠키·원격 페이지 선택을 휴대폰과 공유하지 않음.

## JH168에 맞춘 단계 계약
```
GPT → original Primary MCP / Secure56 BEGIN_COMMAND
  → RIGHT Chrome 윈도우 선택: package + displayId + windowId + bounds + left GPT
  → 화면 접근성 snapshot: sceneDigest + observationId + nodeRef + expiry
  → EXACT ONE target:
       FOCUS: editable=true, same window, unique node; if already focused, no click
       SCROLL: deepest proven scrollable node with advertised DOWN/UP
  → original Secure56 INSPECT: read-only; queued이면 기존 PR #69 receipt로 동일 작업 STATUS
  → fresh window/target proof → original Secure56 PREPARE
  → READY: 원래 액션 1회 가능
     APPROVAL_REQUIRED: 휴대폰 로컬 승인 요청 한 건만 유지·상태 조회
     SCREENSHOT_CONSENT_REQUIRED: 기존 화면 동의 경계 그대로
     OWNER_ADMISSION_BLOCKED: 중단, 별도 실행기로 우회하지 않음
  → original Secure56 EXECUTE exactly once ONLY with current lease and phone grant
  → original signed fresh READBACK: 동일 RIGHT 창에서 포커스/값/스크롤 화면 변화 확인
  → 완료·실패·미확정·사용자 개입 필요를 구분해 GPT에 반환
```

### 승인 개선은 권한 제거가 아니라 **대기 상태 회수·동일 작업의 질문 중복 제거**
- **새로운 보안 승인 기관을 만들지 않는다.** 기존 `computer_use_action_approval_request`와 `life_android_pending_approval_receipt_status`, 원본 phone-local one-shot action grant를 계속 사용한다.
- 현재 owner의 `deviceId, sessionId, commandId, workWindowId, actionDigest, targetDigest, screenDigest, taskDigest`까지 일치해야 동일 승인 REQUEST의 status receipt를 재사용할 수 있다.
- `queued / in_progress`: 같은 receipt로 STATUS만 확인, 승인창 중복 생성 금지. `complete`: ORIGINAL signed phone-local 결과를 검증한 뒤에도 **새 화면 INSPECT+PREPARE 필수**. STATUS 응답을 grant로 사용하는 건 금지.
- 작업·입력 대상·브라우저 창·계정·명령 세대 변경/만료/거절/실행 여부 불명 시 기존 승인 폐기, 자동 재시도 금지. 결제·삭제·전송·민감정보 입력의 기존 1회 승인 유지.
- 승인 및 화면 확인 대기 중 **다음 외부 효과 있는 단계는 실행하지 않는다.** 임의 프레임/좌표, 프로필·쿠키 복제 및 무단 OS 접근성 권한 변경 금지.

## 소스 후보 상태
- `right-target-preflight.mjs`: 현재 RIGHT Chrome focus/scroll 후보를 선별하되 **실행하지 않는 read-only** 가드. 기존 15/15 focus/scroll 단위시험 및 기존 Secure56 관련 CI 통과.
- `original-approval-checkpoint.mjs`: 이미 승인 요청된 원본 signed approval job의 동일-작업 status receipt만 바인딩. **grant 없음, job 발급 없음, 실행 없음**; 본 후보의 테스트는 함께 검증.
- 실제 JH168 APK의 창 정보/노드 경로/가림 창 타입에 대한 완전한 signed payload를 이 소스 후보가 수신하는지 **미확인**. 공개 저장소의 Kotlin 파일이 아닌 현재 기기 APK 원본과 계약 대조가 먼저 필요하다.
- 원래 컴퓨터 승인 `OWNER_ADMISSION_BLOCKED`를 자동 허용하도록 바꾸지 않았다. 어떤 owner fence가 거부했는지 안전한 정확한 로그/영수증이 필요하다.
- 현재 9개 server Playwright 별도 도구는 유지. Android native TYPE/SCROLL과 실제 fresh readback이 통과하기 전에 제거 금지.

## 통합 전 실기기 완료 조건 (새로운 단계만)
1. 현재 설치된 폰에서 RIGHT Chrome/LEFT GPT와 다중창 ID, 스크롤 가능한 노드 경로, 실제 가림 창의 타입·경계 **한 번만** 진단.
2. 포커스: 원래 Secure56 exact CLICK(또는 native focus 지원) → `focused=true` → 비민감 텍스트 입력 → **실제 값이 fresh signed UI에서 확인**. TEXT_SET만으로 성공 선언 금지.
3. 스크롤: 정확한 ACCESSIBILITY_SCROLL TARGET → original prepare/lease → 1회 execute → 새 화면의 스크롤/내용 변화 확인. `scroll_requested`만으로 성공 선언 금지.
4. 승인 대기: ORIGINAL phone prompt 1건, 동일 REQUEST STATUS만 조회, 같은 target/grant 범위의 중복 재질문 0건. 중요한 작업은 매 행위 경계에서 1회 local approval.
5. 실패 경로: `OWNER_ADMISSION_BLOCKED`, `work_pane_obscured`, `SCREENSHOT_BINDING_REQUIRED`, `STALE_SCREEN`, 명령 변경 때 안전하게 중단, 실행·승인 우회·자동 재전송 0건.
6. 선택한 실제 실행 entry→generated runtime→tool registration→pending receipt→phone completion→GPT 반환을 연결하고, 기존 source attestation/rollback, release CI, APK 서명 동일성을 확인한 후에만 운영 적용.

### 성능 목표 (아직 미측정)
1가지 비민감 작업은 **화면읽기·선택·준비·승인 확인·액션 1회·검증**을 서버의 조건부 같은 명령 안에서 이어 붙여 GPT 왕복을 줄인다. 인증·승인 경계에서 반드시 멈추고, 소비되지 않은 grant를 자동 발급/재사용하지 않는다. 전후 실제 도구 왕복 수와 P50/P95를 측정하기 전 절감률을 주장하지 않는다.
