# JH168 / Playwright → Android Mobile — 하나의 결함 장부 (2026-11-01)

**사용자 확정 원칙:** **9개 웹 명령 + 4개 진입 경로의 검증을 모두 마친 뒤 문제를 분류해 한 번에 수정**한다. 각 오류가 발견될 때마다 Android/서버 기능을 고치거나 APK를 다시 설치하지 않는다. 보안상 즉시 위험할 때만 해당 실행을 중지한다.

**이번 소스 재대조 기준:** 고정 후보 `4c71890021fc299838e6a8ce45ccf5f64712f354`와 기존 설치 기록에 연결된 Stage27 원본 producer다. WEB04/06/07/08/09는 `SOURCE_CONFIRMED_CODE_GAP`에 따라 **실행 상태 `BLOCKED`, 실기기 증거 `NOT_RUN`**으로 구분한다. 기존 G02/G03/G04/G06에 근거를 보강하며 새 결함 ID를 만들지 않는다. 이 기록은 배포 완료·현재 기기 연결·실기기 실패를 관찰했다는 뜻이 아니며, 저장된 실기기 PASS는 **0/13**이다.

## 구분해야 할 시험 결과
- SOURCE-ROUTE: [GitHub CI 41281264302](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/41281264302)에서 9/9 모바일 웹 alias, 4/4 진입 경로의 생성 소스 라우팅 PASS. 이는 source-only 결과임.
- GENERATED-ALIAS-CONTRACT: [GitHub CI 41281758552](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/41281758552)에서 생성된 9개 handler의 실함수 호출 (오프라인·무효과 mock) 10/10 PASS. 개인 기기 UI 실행 증거가 아님.
- GENERATED-ENTRY-CONTRACT: [GitHub CI 41282199180](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/41282199180) **5/5 PASS**; 실제 생성된 4개 entry handler를 무효과 signed Android job doubles로 호출하여 동일 RIGHT opener, 원본 앱/화면 복귀 분리, 원격 Playwright 불호출 확인. **실기기 미실시.** 테스트 환경에서 원본 헬퍼 재선언·완료 헬퍼 누락으로 2차례 수정 후 최종 실행 성공 (제품 기능 수정 0건).
- INSTALLED-ANDROID-STATIC: 앞서 서명·설치 확인된 JH168 Stage27 APK SHA256 `129bcc55a9fbf04ebe2bb19d86958fd94f4dc6fd0969bb020105e7f162510359`를 로컬에서 정적으로 판독. 컴파일 문자열/타입 `JH168NestedScrollPolicy`, `JH168InputFocusPolicy`, `JH168RightVerticalScrollRuntime`, `JH168RightHorizontalScrollRuntime`, `JH168OriginalSecure56NativeDispatch12`, `NATIVE_IME_ENTER_ONE_SHOT_GRANT_REQUIRED`, `ACTION_SCROLL_LEFT`, `ACTION_SCROLL_RIGHT`, `JH168_STAGE27_CHROME_POPUP_READBACK_V1` 확인. **포함된 타입/문구 ≠ 실제 사용자 작업 정상 실행**, 해당 APK가 PR #72 서버 alias와 통합돼 배포된 것도 아님.
- DEPLOYED-MCP-ROUTE 이력: 당시 연결된 JH 도구 설명에 `life_web_navigate/snapshot/click/type/select/press_key/wait/back/screenshot`은 server Playwright/별도 브라우저로 기재됐다. `life_open_service`, `life_naver_mail`, `life_android_open`은 phone RIGHT Chrome 경로 안내, `life_route`은 분류였다. 이 관찰을 후속 배포의 현재 상태로 연장하지 않는다. 고정 후보의 실제 적용 SHA·선택값·카탈로그는 [활성화 확인 절차](JH168-MOBILE-VERIFICATION-ACTIVATION.md)에 따라 별도로 대조한다.
- REAL-DEVICE-MIGRATED-E2E: **0/13 PASS; 13/13 실행 증거 NOT_RUN**. 이 가운데 WEB04/06/07/08/09의 실행 가능 상태는 소스 근거로 **BLOCKED**다. Stage27 독립 Chrome 메뉴 CLICK 성공은 보존하지만, WEB-03 migration alias E2E로 중복 계산하지 않는다.

## 13개 고정 결과

`소스 라우트 PASS`와 과거 모의시험 PASS는 원본 durable 정책·Android producer를 포함한 실행 계약의 통과가 아니다. 아래 다섯 행의 `SOURCE_CONFIRMED_CODE_GAP / BLOCKED`는 소스에서 확인한 차단이며 실기기 FAIL로 세지 않는다.

| ID | 대상 | 소스 라우트 / 현재 계약 판정 | 함수 모의시험의 확인 범위 | 모바일 교체 실행 상태 / 실기기 증거 |
|---|---|---|---|---|
| WEB01 | `life_web_navigate` | PASS | signed opener 동작/URL 거부 PASS | NOT_RUN |
| WEB02 | `life_web_snapshot` | PASS | START/STATUS·context 거부 PASS | NOT_RUN |
| WEB03 | `life_web_click` | PASS | fresh item/ref·단일 CLICK PASS | NOT_RUN |
| WEB04 | `life_web_type` | 경로 PASS; **SOURCE_CONFIRMED_CODE_GAP (G04)** | input preflight/SET_TEXT stub·submit 거부 PASS; 실제 durable 허용 미검증 | **BLOCKED / NOT_RUN** |
| WEB05 | `life_web_select` | PASS | OPEN→PICK·내부값 거부 PASS | NOT_RUN |
| WEB06 | `life_web_press_key` | 경로 PASS; **SOURCE_CONFIRMED_CODE_GAP (G02)** | BACK 입력 분기·다른 키 거부 PASS; BACK의 실제 durable 실행 허용은 아님 | **BLOCKED / NOT_RUN** |
| WEB07 | `life_web_wait` | 경로 PASS; **SOURCE_CONFIRMED_CODE_GAP (G03)** | STATUS 호출·`conditionVerified:false` 반환 PASS; 조건 대기 미구현 | **BLOCKED / NOT_RUN** |
| WEB08 | `life_web_back` | 경로 PASS; **SOURCE_CONFIRMED_CODE_GAP (G02)** | BACK 요청 생성·history 성공 가정 금지 PASS; 실제 durable는 DENY | **BLOCKED / NOT_RUN** |
| WEB09 | `life_web_screenshot` | 경로 PASS; **SOURCE_CONFIRMED_CODE_GAP (G06)** | local consent 인자·capture stub 위임 PASS; 원 producer의 action 파싱 미검증 | **BLOCKED / NOT_RUN** |
| ENTRY01 | `life_route` | 웹 분류 PASS; **native 의도 분류 누락 (G08)** | 기존 모의시험은 웹 분류만 확인 | **LIVE_CLASSIFICATION_PARTIAL**; 웹 문장 기대 일치, native 문장 오분류. 폰 효과 0, E2E NOT_RUN |
| ENTRY02 | `life_open_service` | PASS | 원본 generated source validator PASS / 생성 핸들러 모의시험 PASS | NOT_RUN |
| ENTRY03 | `life_naver_mail` | PASS | 원본 generated source validator PASS / 생성 핸들러 모의시험 PASS | NOT_RUN |
| ENTRY04 | `life_android_open` | PASS | 원본 generated source validator PASS / 생성 핸들러 모의시험 PASS | NOT_RUN |

## 발견·미해결 항목 — 이번에는 수정하지 않고 취합
| 분류 | 항목 | 근거·관찰 | 일괄 수정 후보 / 필요한 확인 |
|---|---|---|---|
| G01 배포/경로 | 과거 카탈로그의 9개 웹 alias는 Playwright 설명·입력 형태 | 당시 JH MCP 카탈로그 vs PR #72 소스 차이; 후속 적용 결과는 별도 확인 | 승인된 고정 후보의 실제 배포 SHA·선택값·모바일 입력 스키마를 확인한 뒤 실행 |
| G02 입력/IME·BACK | `press_key`는 BACK 입력만 분기하지만 실제 FOLLOW_UP BACK은 durable DENY; Enter/Tab/Escape는 alias 거부 | WEB06/08 **SOURCE_CONFIRMED_CODE_GAP**. `durableNativeJobPolicy`는 FOLLOW_UP `CLICK`만 허용하여 BACK은 `DURABLE_OPERATION_NOT_SUPPORTED`; 다른 키는 `MOBILE_KEY_NOT_VERIFIED` | **BLOCKED** 유지. 원본 승인·포커스·원 작업 결속을 보존한 공통 계약 수정 후 검증; 별도 Computer Use로 alias 통과를 대체하지 않음 |
| G03 대기 | `life_web_wait`는 `MOBILE_WAIT_CONDITION_UNVERIFIED`, `conditionVerified:false` 반환 | WEB07 **SOURCE_CONFIRMED_CODE_GAP**. STATUS 호출은 실제 조건 판정을 구현하지 않음 | **BLOCKED** 유지. 조건 검증 없는 반복 STATUS·경과시간을 성공으로 삼지 않음 |
| G04 입력 | TYPE의 `split_screen_session_input_preflight`와 후속 `SET_TEXT`는 durable DENY; 기존 submit/CSS 제한도 유지 | WEB04 **SOURCE_CONFIRMED_CODE_GAP**. preflight는 허용 목록에 없고 FOLLOW_UP은 CLICK만 허용하여 `DURABLE_OPERATION_NOT_SUPPORTED` | **BLOCKED** 유지. input grant·로컬 승인·원 작업 결속을 포함한 공통 입력 계약을 전수 조사 후 수정; 거절 확인용 폰 실행 금지 |
| G05 선택 | `select` OPEN·PICK은 2개 개별 CLICK, 다음 항목 재획득 필요 | handler 동작 확인 | 화면 재조회/변경된 windowId/새 option itemRef 연계 전후 증거 |
| G06 스크린샷 | 모바일 screenshot alias가 원 capture에 필요한 `action: SCREENSHOT`을 선언·주입하지 않음; 원본 동의·lease 요구는 유지 | WEB09 **SOURCE_CONFIRMED_CODE_GAP**. `computerPayload56`는 빈 action을 만들고 기존 Stage27 `captureToFrameSink`의 `parseAction`은 `invalid_computer_action`으로 거절 | **BLOCKED** 유지. 동의·lease를 소모해 누락을 재현하지 않으며 원 task/run/창 결속을 보존하는 통합 수정 후 검증 |
| G07 포커스/스크롤 | APK에 네이티브 수직·수평·중첩 scroll/inputFocus 클래스 있음 | 서명 APK 정적 타입 명칭 확인, 운영 alias E2E 없음 | 실제 창·windowId/포커스 editable/스크롤 컨테이너 내부 레벨·재입력 안전성 1회 시험 |
| G08 진입 경로 | ENTRY01의 명시적 native 자유문장이 웹으로 분류됨; 다른 entry의 실기기 결과 미확인 | 고정4c live `life_route`: 웹 fixture 문장과 `휴대폰 설정 앱 열기` 모두 owner:web. 생성 classifier의 nativeHints=[] 및 native 복귀 전용 Android 분기와 일치 | native 분류 누락을 통합 수정 대상으로 보존. 별도 life_android_open의 명시적 앱 문법 존재와 구분하고 실제 앱 실행 불능으로 확대하지 않음 |
| G09 이전 CI | 4개 관련 CI 실패: 3개 보호 원본 diff 기준, 1개 옛 click 에러 메시지 기대 | PR #72 당시 Actions 41204321123/21253/21130, 41204321189 | 실제 모듈 보안 불일치인지 test baseline drift인지 전수 검토 후 동시에 정리 |
| G10 원본 Playwright 잔존 | 9+4 바깥의 기존 서버 Playwright 코드도 있음 | PR #72 설명상 후행 정리 대상 | 13개 완전 교체 검증 후 의도된 legacy-only 범위 확정, 다른 기능 임의 삭제 금지 |
| G11 통합/속도 | Android 원본 Native vs 웹 alias 진입 경로·중간개입·속도 실측 미완료 | 실기기 alias 0/13 | 한 세션에서 원본 명령/장치/동의/복귀·지연 측정, 임의 시간·성능 향상 주장 금지 |

### 일괄 수정 전 금지 사항
- 13개 전체 native contract/기기 실제 수행 결과를 수집하지 않고 소스 기능을 건건이 바꾸지 않는다.
- 기존 서명 APK를 무작정 재설치하지 않는다. Android Kotlin/manifest 변경이 실제로 필요한지 먼저 비교한다.
- Chrome 메뉴의 **이미 성공한 Stage27 클릭은 절대 재실행하지 않는다**.
- 과거 SQLite 29건을 지우거나 완료 처리하지 않는다. 별도 문제이며 이 전환 과제의 진행 단계로 전용하지 않는다.
- 안전상 차단된 기능을 서버 Playwright로 몰래 폴백시키지 않는다.

**이전 모의시험과 다음 차례:** 기존 **9개 10 tests + 4개 5 tests PASS** 기록은 무효과 doubles를 사용한 handler 계약 근거로 보존한다. 이번 재대조는 그 범위 밖의 실제 durable 허용·원 producer 입력 누락을 확인했다. 전 13개를 각각 실제 실행 증거 또는 구체적인 `BLOCKED` 근거까지 점검하고, 미점검 행을 남긴 채 기능별 수정을 시작하지 않는다. 문서에 저장된 실기기 PASS는 **0/13**이며, 배포·연결 상태는 별도 실제 관찰로만 갱신한다. 이후 전 기능에서 발견된 공통 원인만 **일괄 1회 수정 → 전체 회귀·실기기 재검증**한다.

### 고정 후보의 원본 실행 계약 재대조 — G02/G03/G04/G06 근거 보강

대상은 `4c71890021fc299838e6a8ce45ccf5f64712f354`의 소스와 PHONE_RIGHT 생성물 SHA-256 `a25982af7c31f71fcb875176d9431be6c226e348bc0f3c48b478c503b0c3f45f`다. 생성 SHA는 [후보 CI의 합성 HTTP 검사](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/41290019157)와 일치하며 운영 활성화 증거로 사용하지 않는다. 아래 판정은 읽기 전용 소스 대조이며 새 테스트·폰 실행 결과가 아니다.

- **G04 / WEB04:** [모바일 alias](mobile-web-tool-patch.mjs)의 `jhMobileWebFollow56`는 SET_TEXT에 앞서 `split_screen_session_input_preflight`를 요청한다. [durable 정책](../deployment/durable-native-job-policy.mjs)의 `durableNativeJobPolicy`에는 해당 type 허용이 없으며, 후속 `split_screen_session_followup`도 `action === 'CLICK'`와 정확한 허용 필드만 받는다. [lifecycle 예외](../deployment/jh167-split-lifecycle-policy.mjs)는 SAVE_ANALYSIS/FINISH만 다룬다. 따라서 preflight와 SET_TEXT 모두 `DURABLE_OPERATION_NOT_SUPPORTED`인 소스 계약이다.
- **G02 / WEB06·WEB08:** BACK을 모바일 helper에 전달하는 alias 분기는 존재하지만 같은 FOLLOW_UP 정책에서 거절된다. [durable host](../deployment/durable-native-host.mjs)의 `capture → beforeDispatch`가 DENY를 유지하고 [원 dispatch patch](../deployment/durable-native-runtime-candidate.mjs)는 `job.status = error`, `job.error = durableAdmission.code`로 기록한 뒤 기기에 job을 전달하지 않는다. `BACK 입력 허용`을 `BACK 실제 실행 지원`으로 읽지 않는다. Enter/Tab/Escape의 별도 alias 거절 `MOBILE_KEY_NOT_VERIFIED`도 유지한다.
- **G03 / WEB07:** 모바일 WAIT는 한 번의 STATUS 호출 뒤 `MOBILE_WAIT_CONDITION_UNVERIFIED`를 반환한다. 조건이 화면에서 변했거나 시간이 지났다는 사실만으로 이 도구의 조건 판정이 구현됐다고 보지 않는다.
- **G06 / WEB09:** 모바일 screenshot schema는 task/run/screen grant/consent/lease만 선언하고 `jhMobileWebCapture56(args)`로 전달한다. 원 runtime의 `computerPayload56`는 action 누락을 빈 문자열로 만든다. 기존 설치 기록에 연결된 Stage27 `BridgeService.kt::captureSecureFrame`는 frame permit/sink만 더하고, `AndroidComputerUseTransport.kt::captureToFrameSink → parseAction`은 SCREENSHOT action을 요구한다. `issueScreenFramePermit`의 로컬 SCREENSHOT 객체는 검사에만 사용되며 전달 payload의 action을 보완하지 않는다. 이는 원 producer의 `invalid_computer_action` 거절 근거이지 이번 폰에서 실제 오류를 수신했다는 기록이 아니다. 원본 연결 기준은 [Stage27 producer 계약 감사](../operational-learning/ANDROID-PRODUCER-COMPATIBILITY.md)를 따른다.
- **모의시험 범위:** [기존 handler 계약 시험](mobile-web-13-runtime-contract.test.mjs)은 `jhSplitScreenJob56`을 무효과 double로 바꾸고 screenshot도 `fakeCapture`로 받는다. 과거 PASS는 보존하지만 실제 durable admission·Android action 파싱을 통과했다는 근거로 확대하지 않는다.

### 2026-11-01 고정4c 운영 관찰 — G01·G08

- [활성화 기록](JH168-MOBILE-VERIFICATION-ACTIVATION.md)의 정확한 배포는 `dep-dbjg01ijnfac73fssde0`, Live 시각은 `2026-11-01T09:02:54.665289Z`다. 실제 생성 SHA a25982af…와 PHONE_RIGHT 상태 응답, 고정4자산 HTTP/해시를 확인했다. 이는 위 CI 합성 결과와 구별되는 운영 관찰이다.
- **G01:** 서버 모드는 전환됐으나 현재 대화의 호출 schema는 이전 Playwright 형태다. click의 context_id/request_id, select의 phase 등 모바일 입력을 사용할 수 없으므로 Primary Refresh 후 실제 등록을 대조할 때까지 효과 검증을 보류한다. 최근 등록 기기 1대(active, ageSeconds 9) 관찰은 signed 세션·UI 성공 증거가 아니다.
- **G08 / ENTRY01:** 실제 무효과 분류에서 웹 fixture 요청은 기대한 owner:web을 반환했다. `휴대폰 설정 앱 열기`도 같은 웹 rule을 반환했으며, 고정 후보의 nativeHints=[]와 일치한다. [원 classifier 변환](../deployment/jh167-right-pane-orchestrator-repair.mjs)이 원래의 `휴대폰 설정` native 힌트를 제거하고, `patchJH168MobileNativeAppEntry56`는 life_android_open만 바꿔 classifier를 복원하지 않았다. 자유문장 분류 누락을 확인한 것이며 별도 실행 도구의 입력 문법 문제로 축소하지 않는다. 실제 앱 실행 실패로도 확대하지 않는다.
- **현재 계수:** 소스 계약으로 차단된 WEB04/06/07/08/09, 실제 분류 누락이 확인된 ENTRY01을 구분한다. 나머지 7개 행은 카탈로그 갱신과 원 기기 조건 확인 후 실행한다. 새 BEGIN·폰 효과 0건, 실기기 PASS **0/13**이다. 후속 개발 branch706ff5c의 WAIT 변경은 배포된4c의 결과를 해결된 것으로 바꾸지 않는다.

## 추가 정적 확인: 27단계 실제 서명 APK
- 사용자 휴대폰에 설치 성공했던 원본 서명 APK SHA-256: `129bcc55a9fbf04ebe2bb19d86958fd94f4dc6fd0969bb020105e7f162510359`.
- DEX 실제 `JH168NativeAction12` enum 필드: `IME_ENTER`, `RIGHT_WINDOW_CAPTURE`, `UNSUPPORTED`. APK 내부 `JH168RightNativeExecutor` 메서드 `imeEnterOnce`, `captureRightWindowOnce`; `JH168RightVerticalScrollRuntime`의 `scrollInternal`, `nestedReadback`; `JH168InputFocusPolicy`의 `select`, `verified` 타입/메서드가 컴파일됨. **핸들러 호출 성공/기기 런타임 적용 증거와 혼동 금지.**
- 웹 alias `life_web_press_key`의 `Enter` 거부는 현재 서버 라우트 수준에서 확인되며, APK `IME_ENTER` 기능 존재는 향후 함께 검증할 설계 후보이지 즉시 연결 완료 증거가 아니다.
- 2026-11-01T06:46Z 기준 PR #72의 원본 비교는 최신 `jh-fix3-secure-server`보다 **67커밋 뒤**. 시각·커밋 기준을 보존하고, 최신 소스 변경을 덮어쓰지 않는 1회 통합 게이트가 필요하다.

## 서명 APK 실제 DEX 호출 연결 정적 검증 — 2026-11-01
- 새로운 [JH168-MOBILE-APK-NATIVE-CALLGRAPH.md](JH168-MOBILE-APK-NATIVE-CALLGRAPH.md)에서 원본 서명 APK 해시 `129bcc55...` / DEX 2개 체크섬 통과 / 실제 메서드 호출 지도를 보존한다.
- **G12 (신규, 단일 네이티브 엔진 연결 의심):** `JH168OriginalSecure56NativeDispatch12.executeOriginalJobOnce`는 컴파일됐지만 양쪽 DEX에서 타 클래스의 `invoke-*` 호출 **0개**, 해당 클래스의 `new-instance` **0개**. 정적 직접 호출 증거가 없다는 뜻이며 reflection/dynamic 연결 부재까지 증명하는 것은 아님. 실기기/통합 전 DEX 외 호출·DI·MCP→Bridge 실제 연결 확인.
- **G13 (신규, 네이티브 경로 별개):** `BridgeService → AndroidComputerUseTransport → AndroidComputerUseRuntime` 호출과 `BridgeService → AndroidAgent.executeRightPane` 직접 호출은 존재. `GuidedForms → JH168RightVerticalScrollRuntime.scrollInternal / JH168RightHorizontalScrollRuntime.scrollInternal` 각 1개, `AndroidAgent → JH168InputFocusPolicy.select` 1개. 이 별도 경로들이 **9개 alias+4개 entrypoint에서 하나로 일관되게 개입 가능한지** 아직 미검증. 배포 전 실행/완료/창바인딩/승인/복귀를 함께 검증.
- **G14 (신규, 기능 범위/메타데이터):** 전용 `JH168NativeAction12` enum은 `IME_ENTER`, `RIGHT_WINDOW_CAPTURE`, `UNSUPPORTED` 3종. 일반 CLICK·SCROLL·SET_TEXT는 별도 `AndroidComputerUseRuntime/AndroidAgent` 경로에 있음. 또한 내장 `assets/jh-release.json`의 `installed:false`, `phoneVerified:false`는 실제 별도 설치 검증 보고서와 불일치하는 **과거 후보 메타데이터**이므로 앱 실사용 상태로 취급 금지.
- 이 감사는 사용자 휴대폰에 이미 설치 보고된 **서명 APK의 로컬 정적 판독**이며 실제 앱 UI 명령 실행 0회. 실제 alias 13개 실기기 종단검증은 여전히 **0/13**.

## 최신 main 호환성 + 원본 네이티브 계약 검증 추가 (2026-11-01)
- CI [41283451015](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/41283451015) `9397ed1d9f4761ea1152616418353d63bfff659b`: 최신 main 10개 핵심 파일 **바이트 동일**; 기존 조합 파일 모바일 패치 import·마지막 wrap 2개 위치만 소스 차이. 원본 9개 `life_web_*` Playwright 현재 운영 소스와 generated Android 후보의 차이는 명확하며, 실기기 13개 미완료는 보존.
- 원래 서명 APK `129bcc55a9fbf04ebe2bb19d86958fd94f4dc6fd0969bb020105e7f162510359`를 로컬에서 함수별 직접 호출·거부 코드 확인: 원본 ComputerUse/window/occlusion/scroll/enter, 새 NativeDispatch의 signed authority·no-replay, IME focus, API34 window screenshot, nested vertical/horizontal **28/28 정적 anchor PASS**. `JH168OriginalSecure56NativeDispatch12`의 **외부 직접 호출 0**은 여전하므로 실제 연결 PASS 아님.
- 전체 근거: `JH168-MOBILE-LATEST-MAIN-NATIVE-PREFLIGHT.md`. **G01/G02/G06/G07/G12/G13의 원인 분석 강화**, 신규 기능 수정 0회, E2E 0/13 유지.

## 통합 준비 발견 사실 — 2026-11-01 Stage25 실제 구동 경로

- **G15 운영 활성화 구분:** 기존 `npm start → published-host-router → Stage25 original FOLLOWUP operator`에 PR #72의 모바일 패치를 함께 구성하는 생성 서버를 확인. 실제 생성 코드의 9개 alias 중 8개는 모바일 실행 헬퍼, **`life_web_wait`은 Android `split_screen_session_status` 상태 조회**이며 `conditionVerified=false`가 의도된 현재 제한. 원격 Playwright 호출은 없음. **Stage25 생성 성공 ≠ 실제 운영 배포/폰 동작 성공.**
- **G16 Android 운영 URL 고정:** 서명 APK `129bcc55...` 내 `SingleAttemptSecurePoll$Companion.request$app_release`에서 `https://jh-secure-bridge-fix4.onrender.com/device/poll` 직접 문자열 사용 확인. 기존 앱이 별도 Render staging으로 자동 연결된다고 가정 금지; 설정 전환/테스트용 APK 등이 실제 제공되는지 별도 확인해야 함.
- **G17 실기기 준비:** 2026-11-01 읽기 전용 Primary `life_android_devices`: `devices=[]`, `selectedDeviceId=null`. 이 시점의 연결 상태만 뜻하며 과거 Stage27 성공 취소나 APK 설치 실패가 아님. Android Bridge 앱을 다시 연결한 실제 증거 전에는 UI 명령 발송 금지.
- **G18 검증환경:** 현재 Render 서비스 3개 중 모바일 후보 전용 staging 없음, 운영 서비스의 Render PR Preview **OFF**. 별도 staging을 만들더라도 G16 때문에 현재 APK와 연결되지 않을 수 있음. 이번에는 서비스 생성·유료 플랜·OAuth 변경·APK 재설치를 하지 않음.
- 최신 메인 `2c310f8b4a76d40604416e7dd4cb4976fdd1fc85`을 PR #72 내부에 **양쪽 부모 보존 병합(검증 브랜치에만)**. 기존 13개 모바일 함수 구현과 Secure56 보안 소스 변경 없이 새 CI 후보에 적용. Render/main 실서비스는 수정하지 않음. 

## 사용자 최신 최종 구조 — G19 단일 모바일 엔진 및 구 Playwright 완전 제거

**G19 (필수 최종 완료 게이트):** 9+4 모바일 alias를 우회적으로 연결하는 것은 중간 단계이다. Chrome 웹 조작과 Android 앱 조작 모두 **하나의 Secure56/Bridge/모바일 접근성 엔진**으로 일원화해야 한다. 별도 서버 Playwright, 별도 브라우저/세션/로그인 프로필/라우팅/재시도/자동 폴백과 남은 의존 코드를 전수 조사해 기능 동등성 검증 후 완전히 제거한다. Chrome 브라우저 앱은 보존한다.

최종 통합에서 필요한 증거: 같은 GPT 명령→RIGHT Chrome/Android 앱 간 중간 개입, 정확한 window/display/context/itemRef 갱신, 현재 화면 포커스·내부/중첩 스크롤·선택/입력·키/조건 대기, 원본 phone-local 승인·결과/복귀, 무재실행, 기존 APK 서명·안면인식·좌우 화면 유지. 서버측 Playwright 자동 fallback 0과 구 명령 로직 0, 전체 기능 회귀를 확인해야 함.

**임시 flag/rollback은 실기기 시험용이며 최종 영구 2엔진 구조가 아님.** 13개 migrated phone E2E 0/13 유지. 실제 기능 소스 수정·운영 배포·휴대폰 실행은 이번 기록 작업에서 수행하지 않음.

## JHAI 원본 결과 감사 연결 — 2026-11-01

[Android producer → 학습 계약 6경로 대조](../operational-learning/ANDROID-PRODUCER-COMPATIBILITY.md)를 G11/G13의 결과 귀속·native 경로 검토에 연결한다. 이 추가 기록은 기능 수정이나 새 실기기 시험이 아니며 기존 **0/13, NOT_RUN**을 유지한다.

- **별도 범위 COMFORT_STATUS_DIRECT_PROOF_MISSING:** 설치 기록과 연결된 Stage27의 `life_android_split_comfort / STATUS` 원 결과에 직접 split/window proof가 없다. 이 도구는 13개 교체 대상에 포함되지 않는다. WEB02/WEB07의 `split_screen_session_start/status`와 구분하고, 이 결함을 13개 실패로 계산하지 않는다.
- **OPEN_REQUEST_ECHO_NOT_OBSERVED_URL:** 같은 RIGHT opener가 반환하는 `result.url`은 실제 주소창 값이 아니라 요청 주소의 정규화 값이다. Android가 의도적으로 허용한 root redirect/주소 동치 정책 통과를 정확한 표시 URL 일치로 확대하지 않는다. WEB01, ENTRY02/03, ENTRY04의 HTTP(S) 경로에 의미 검토가 관련되며, 현재 기기의 잘못된 열기 또는 정책 자체의 실패가 확인됐다는 뜻은 아니다.
- 일반 split START/STATUS, CLICK, INSPECT는 각 제한된 관찰·UI 변화·원 결과 수신 scope에 대응하는 producer 연결을 소스에서 확인했다. manualHold STATUS와 INSPECT의 의도된 증거 한계를 별도로 보존한다.
- comfort `srr_`의 외부 거절 코드는 `SPLIT_READ_SCREEN_PROOF_INVALID`, 내부 verifier 이유는 `SPLIT_PROOF_REQUIRED`다. 원 signed completion은 generic `observed`로 기록될 수 있으며, 증거 조회 거절을 별도 학습 저장 장애나 새 원 시도로 만들지 않는다.
- 수정은 기존 전수 조사 후 공통 원인 일괄 수정 순서를 따른다. 이전 APK·운영 배포·Stage27 성공 클릭·미확정 과거 동작을 반복하지 않는다.
