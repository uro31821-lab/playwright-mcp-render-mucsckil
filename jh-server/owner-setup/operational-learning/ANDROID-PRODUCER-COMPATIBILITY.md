# JHAI — Android 원본 결과와 학습 계약 6경로 대조

검토일: 2026-11-01. 분류: **정적 원본 계약 대조 완료 / 실기기 종단검증 NOT_RUN**.

## 기준과 재사용한 근거

- 서버 기준: `2c310f8b4a76d40604416e7dd4cb4976fdd1fc85` (PR #107 운영 반영 완료본).
- 모바일 후보 문서·라우팅 기준: PR #72 `8961eeb78ac24f223efbbdcd658d11343e26b76a`.
- Android 원본: `JH27_크롬메뉴_완료판정_압축풀기_실행.zip`, SHA-256 `5b568e56571b3c0d4f5691dddd1e1674a64b9a562e25f2ef25f083f2c1ba82e6`.
- 내부 payload SHA-256 `d8d9fe765254e10e18c6561139f30fcc93b4416bc0f271b6bbeabfb0a100f54c`; source manifest SHA-256 `aa9a7fe1ddf30672fed68f62c58df9cf378047ae5c7f85911d3a2102d6623105`.
- 위 manifest의 403개 파일 대조는 이전 감사 완료 근거를 재사용했다. 이번에는 추가로 읽은 원본 파일만 각각 pin과 대조했다. 403개는 무결성 대조 수이며 기능 403개나 모바일 13개 검증 완료를 뜻하지 않는다.
- 기존 빌드·서명 기록은 위 manifest를 unsigned APK `7fa13f6fe3506b81d31cf5d29f2553f9e02f54cc27c3539345765227213fea6b` 및 signed APK `129bcc55a9fbf04ebe2bb19d86958fd94f4dc6fd0969bb020105e7f162510359`에 연결한다. 설치 결과 원문은 2026-11-01T04:23:57.8259404Z의 installed hash/certificate MATCH를 기록한다.
- 이 과거 설치 기록을 현재 화면·현재 기기 연결 상태로 해석하지 않는다. 이번에 APK·개인 원본·키를 저장소에 추가하지 않았다.

## 경로별 결과

| 원 작업 | producer → 원 완료 결과 | 서버가 인정하는 범위 | 정적 판정 |
| --- | --- | --- | --- |
| HTTP(S) OPEN | `openDirectWeb` → 주소 확인 정책 결과 → 완료 시 공통 split proof → 서명 JSON | `REQUESTED_ADDRESS_IN_RIGHT_CHROME_AT_RECEIPT_TIME` | 필드 연결 있음. **실제 표시 URL은 반환하지 않는 의미상 한계**를 아래에 기록 |
| split START | `RightPaneContextRuntime.capture` → 사전·사후 창 확인 → 직접 proof | `SPLIT_READ_LAYOUT_ONLY`, observed | 정상 경로의 계약 대응 확인 |
| 일반 split STATUS | context 상태 결과 → 같은 공통 직접 proof | `SPLIT_READ_LAYOUT_ONLY`, observed | 정상 경로의 계약 대응 확인. manualHold는 별도 |
| FOLLOW_UP CLICK | 원 prepared CLICK → 새 화면 변화 판정 → 공통 proof/한정된 popup 판정 | `SPLIT_FOLLOWUP_CLICK_ONLY` | CLICK의 UI 변화 범위에 대응. 외부 업무 전체 성공은 아님 |
| Computer Use INSPECT | `AndroidComputerUseTransport.inspect` → 원 검사 JSON → 서명 완료 | `COMPUTER_INSPECT_RECEIPT_ONLY`, observed | 수신 관찰 계약에 대응. 검사 결과 `ok:false`도 원 완료 수신은 관찰 가능 |
| comfort STATUS | `SplitComfortRuntime.status` → 일반 완료 JSON; split 등록·proof 생성 없음 | 유효한 직접 proof가 있어야 `SPLIT_READ_LAYOUT_ONLY` | **COMFORT_STATUS_DIRECT_PROOF_MISSING** |

이 표는 소스상 생성·직렬화·검증 범위를 대조한 결과다. 실제 기기 동작 PASS 수를 추가하지 않으며, 기존 모바일 전환 실기기 **0/13, NOT_RUN**을 바꾸지 않는다.

### 의도된 제한을 결함으로 합치지 않는다

- `manualHandoffCode`가 있는 `manualDone=false` STATUS의 manualHold는 화면 읽기와 split 등록을 생략하는 무효과 대기다. `resultVerified=false`, `externalEffectVerified=false`를 유지하며 새 layout 관찰로 받아들이지 않는 것이 맞다.
- CLICK의 `verificationScope=UI_TRANSITION_ONLY`, `externalEffectVerified=false`는 클릭 후 UI 변화와 외부 업무 완료를 구분한다. SET_TEXT/BACK 전체로 CLICK 성공 범위를 확장하지 않는다.
- INSPECT의 `screen.screenshotDigest`는 입력 `currentScreenshotDigest`에서 전달된 값이다. INSPECT 자체의 새 픽셀 캡처 증거가 아니다. `cir_`의 `ok:true`는 원 job 조회 성공이며 아직 pending일 수도 있다. 완료된 원 결과 객체와 동일 결속을 확인한 경우에만 `COMPUTER_INSPECT_RECEIPT_ONLY` 관찰을 기록한다.
- 직접 split proof의 생성기는 `AgentFocusPolicy.evidence`이며, Boolean `splitScreenRequired` 및 문자열 proof 필드가 서명 전 `body.result`에 포함된다. 창 쌍 검증 실패·원 명령 세대 변경은 기존 제한을 유지한다.

## 확정된 별도 범위: COMFORT_STATUS_DIRECT_PROOF_MISSING

Stage27의 `SplitJobScopePolicy.requiresSplitEvidence`는 `split_comfort_status`를 포함하지 않는다. 따라서 `BridgeService`의 `splitScoped` 등록을 거치지 않고, `completeResult`의 `splitType != null` proof 부착 블록도 실행되지 않는다. `SplitComfortRuntime.status` 자체에도 `splitScreenRequired`, `splitScreen`, bounds·proof 관찰 시각이 없다.

Stage26→27 변경은 Chrome FOLLOW_UP popup 재관찰이며 위 STATUS 연결 조건은 바꾸지 않았다.

이 경로는 PR #72의 9개 웹 alias + 4개 진입 경로에 포함되지 않는다. **WEB02 snapshot과 WEB07 wait은 `split_screen_session_start/status`를 사용한다.** 이름이 STATUS라는 이유로 comfort 누락을 이 두 경로의 실패로 합치지 않는다. G11/G13과 원 결과 귀속·native 경로라는 검토 축만 공유한다.

### 외부 오류와 학습 상태를 정확히 구분

| 발생 단계 | 소스상 결과 | 원 시도에 대한 영향 |
| --- | --- | --- |
| 원 STATUS 호출이 timeout/검증 실패로 `ok:false` 종료 | 원 도구 실패 응답 | 해당 원 job 시도에 `completion_unknown / TOOL_ERROR`가 남을 수 있음 |
| 이후 원 job의 인증된 HTTP completion 수신 | 원 결과 저장과 generic 완료 관찰 | `observed`가 될 수 있음. 성공 확정 아님 |
| `srr_` 조회에서 직접 proof 없음 | 외부 응답 **`SPLIT_READ_SCREEN_PROOF_INVALID`**, 내부 verifier 이유 `SPLIT_PROOF_REQUIRED` | receipt observer로 전달되지 않음. 기존 원 outcome을 새로 덮어쓰지 않음 |
| 원 결과가 `ok:false` | `SPLIT_READ_DEVICE_REPORTED_FAILURE` | 동일하게 원 상태 보존 |
| 실제 학습 저장 예외 | 별도 fault/`LEARNING_UNAVAILABLE` 계열 | proof 거절과 다른 기록 장애 |

wrapper 자체는 helper를 호출하지만, helper가 `receipt.ok !== true`에서 반환하므로 `controller.receiptObserved`에 전달되지 않는다. “proof 거절이면 항상 unknown” 또는 “서명 완료 수신 자체가 거절됨”이라는 해석은 틀리다. 원 호출과 완료 수신의 순서에 따라 현재 projection이 다를 수 있으며 과거 이벤트는 보존된다.

통합 수정에서는 정확한 comfort STATUS 원 작업에 실제 현재 창 증거를 연결하고 기존 STATUS 진단을 보존해야 한다. 다른 snapshot의 결과를 이식하거나 전체 `split_comfort_*` prefix를 넓혀 해결하지 않는다.

## 추가 의미상 한계: OPEN_REQUEST_ECHO_NOT_OBSERVED_URL

### 확인된 사실

`PanePolicy.addressMatches(request, displayed)`는 의도된 주소 일치 정책이다. 정확한 정규화 URL 일치 외에도 제한된 `www.`/mobile host 동치, HTTP→HTTPS, **HTTPS 루트 요청에서 같은 host의 비인증 페이지로 이동**을 일부 허용한다. 이 정책 자체를 새 실행 오류나 보안 우회로 분류하지 않는다.

정적 예: 요청 `https://example.com/`과 실제 표시 `https://example.com/inbox`는 조건에 따라 허용된다. 이 예를 휴대폰에서 실행하지 않았다.

`LinkSplitController`는 기존 창 쌍을 유지한 Chrome 주소창에서 이 정책이 참일 때 `RIGHT_ADDRESS_CONFIRMED`를 만든다. 그러나 `BridgeService.openDirectWeb`의 `result.url`에는 실제 표시 주소가 아니라 **정규화된 원 요청 주소**가 들어간다.

서버 [jh167-open-completion.mjs](../deployment/jh167-open-completion.mjs)의 `describeOpenCompletion`은 `job.url === result.url`의 canonical 비교, `rightAddressConfirmed=true`, 수신 시점의 유효한 Chrome proof를 함께 확인한다. 이 URL 비교는 요청을 되돌려받은 값의 일치이며 실제 표시 URL의 정확한 일치 증거는 아니다.

### 영향과 통합 검토 기준

- 현재 scope `REQUESTED_ADDRESS_IN_RIGHT_CHROME_AT_RECEIPT_TIME`는 **Android 주소 정책이 허용한 완료 시점의 주소 확인**으로 읽어야 한다. 실제 표시 URL 원문의 정확한 일치를 따로 증명하지 않는다.
- scope에는 `EXACT`가 없다. 따라서 이 한계만으로 기존 `actionSucceeded`나 학습 성공이 잘못됐다고 단정하지 않는다. 허용된 주소 정책 범위의 성공과 정확한 표시 URL의 증거를 구분한다.
- 이것은 proof 누락과 다른 의미상 한계다. 현재 기기에서 엉뚱한 사이트를 열었다거나 기존 OPEN이 전부 실패했다는 판정이 아니다.
- 모바일 후보의 같은 RIGHT opener를 사용하는 WEB01, ENTRY02, ENTRY03 및 ENTRY04의 HTTP(S) 경로에 검토가 관련된다. ENTRY04의 native/last_work_screen 복귀로 확대하지 않는다. 이 사실만으로 각 경로의 실기기 PASS/FAIL은 바꾸지 않는다.
- 일괄 수정 시 producer의 요청/관찰 주소·일치 방식과 서버의 성공/학습 scope 의미를 맞춘다. 관찰 주소를 추가한다면 원 작업의 실제 읽기와 서명 결과에 결속해야 하며, 없을 때 요청 URL을 관찰 URL처럼 채우지 않는다.
- 검증표는 실제 주소창 읽기, 요청 echo, 주소 정책 통과를 서로 구분하고 root redirect·deep link·query/fragment·host/scheme 사례를 포함해야 한다. 새 외부 업무 효과나 페이지 내용 검증으로 승격하지 않는다.

## 다음 작업과 변경 경계

사용자 지정 **13개 전수 조사 → 공통 원인 통합 수정 → 전체 재검증**을 유지한다. 이 문서는 기존 [단일 결함 장부](../jh168-mobile-unification/JH168-MOBILE-13-DEFECT-LEDGER.md)와 [한 세션 검증표](../jh168-mobile-unification/JH168-MOBILE-13-ONE-SESSION-VERIFY-MATRIX.md)에 연결되는 소스 감사 근거다.

최종 구조는 장부 G19에 따라 Chrome 웹 조작과 Android 앱 조작을 하나의 Secure56/Bridge/모바일 접근성 엔진으로 통합하는 것이다.

이번 반영은 문서뿐이다. Android/서버 기능·승인/HMAC·기기 동작·배포를 변경하지 않고, 기존 507/507 서버 검사와 Stage27 빌드 결과를 반복하지 않는다. 운영 기억의 과거 미확정 결과나 기존 성공을 이번 감사만으로 소급 수정하지 않는다.
