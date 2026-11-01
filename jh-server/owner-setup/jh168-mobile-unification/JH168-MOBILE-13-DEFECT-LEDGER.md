# JH168 / Playwright → Android Mobile — 하나의 결함 장부 (2026-11-01)

**사용자 확정 원칙:** **9개 웹 명령 + 4개 진입 경로의 검증을 모두 마친 뒤 문제를 분류해 한 번에 수정**한다. 각 오류가 발견될 때마다 Android/서버 기능을 고치거나 APK를 다시 설치하지 않는다. 보안상 즉시 위험할 때만 해당 실행을 중지한다.

## 구분해야 할 시험 결과
- SOURCE-ROUTE: [GitHub CI 41281264302](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/41281264302)에서 9/9 모바일 웹 alias, 4/4 진입 경로의 생성 소스 라우팅 PASS. 이는 source-only 결과임.
- GENERATED-ALIAS-CONTRACT: [GitHub CI 41281758552](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/41281758552)에서 생성된 9개 handler의 실함수 호출 (오프라인·무효과 mock) 10/10 PASS. 개인 기기 UI 실행 증거가 아님.
- GENERATED-ENTRY-CONTRACT: [GitHub CI 41282199180](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/41282199180) **5/5 PASS**; 실제 생성된 4개 entry handler를 무효과 signed Android job doubles로 호출하여 동일 RIGHT opener, 원본 앱/화면 복귀 분리, 원격 Playwright 불호출 확인. **실기기 미실시.** 테스트 환경에서 원본 헬퍼 재선언·완료 헬퍼 누락으로 2차례 수정 후 최종 실행 성공 (제품 기능 수정 0건).
- INSTALLED-ANDROID-STATIC: 앞서 서명·설치 확인된 JH168 Stage27 APK SHA256 `129bcc55a9fbf04ebe2bb19d86958fd94f4dc6fd0969bb020105e7f162510359`를 로컬에서 정적으로 판독. 컴파일 문자열/타입 `JH168NestedScrollPolicy`, `JH168InputFocusPolicy`, `JH168RightVerticalScrollRuntime`, `JH168RightHorizontalScrollRuntime`, `JH168OriginalSecure56NativeDispatch12`, `NATIVE_IME_ENTER_ONE_SHOT_GRANT_REQUIRED`, `ACTION_SCROLL_LEFT`, `ACTION_SCROLL_RIGHT`, `JH168_STAGE27_CHROME_POPUP_READBACK_V1` 확인. **포함된 타입/문구 ≠ 실제 사용자 작업 정상 실행**, 해당 APK가 PR #72 서버 alias와 통합돼 배포된 것도 아님.
- DEPLOYED-MCP-ROUTE: 실제 연결된 JH 도구 설명에 `life_web_navigate/snapshot/click/type/select/press_key/wait/back/screenshot`은 여전히 server Playwright/별도 브라우저로 기재. `life_open_service`, `life_naver_mail`, `life_android_open`은 phone RIGHT Chrome 경로 안내, `life_route`은 분류. **PR #72 신규 웹 alias가 운영에 적용됐다는 증거가 없음.**
- REAL-DEVICE-MIGRATED-E2E: **0/13 PASS; 13/13 아직 NOT_RUN**. Stage27 독립 Chrome 메뉴 CLICK 성공은 보존하지만, WEB-03 migration alias E2E로 중복 계산하지 않는다.

## 13개 고정 결과
| ID | 대상 | 소스 | 함수 모의시험 | 모바일 교체된 실기기 |
|---|---|---|---|---|
| WEB01 | `life_web_navigate` | PASS | signed opener 동작/URL 거부 PASS | NOT_RUN |
| WEB02 | `life_web_snapshot` | PASS | START/STATUS·context 거부 PASS | NOT_RUN |
| WEB03 | `life_web_click` | PASS | fresh item/ref·단일 CLICK PASS | NOT_RUN |
| WEB04 | `life_web_type` | PASS | input preflight/SET_TEXT·submit 거부 PASS | NOT_RUN |
| WEB05 | `life_web_select` | PASS | OPEN→PICK·내부값 거부 PASS | NOT_RUN |
| WEB06 | `life_web_press_key` | PASS | BACK만 허용·Enter/Tab/Escape 거부 PASS | NOT_RUN |
| WEB07 | `life_web_wait` | PASS | STATUS만 조회·조건 미확인 PASS | NOT_RUN |
| WEB08 | `life_web_back` | PASS | BACK 1회, 브라우저 history 성공 가정 금지 PASS | NOT_RUN |
| WEB09 | `life_web_screenshot` | PASS | local consent 인자·원본 capture stub PASS | NOT_RUN |
| ENTRY01 | `life_route` | PASS | 원본 generated source validator PASS / 생성 핸들러 모의시험 PASS | NOT_RUN |
| ENTRY02 | `life_open_service` | PASS | 원본 generated source validator PASS / 생성 핸들러 모의시험 PASS | NOT_RUN |
| ENTRY03 | `life_naver_mail` | PASS | 원본 generated source validator PASS / 생성 핸들러 모의시험 PASS | NOT_RUN |
| ENTRY04 | `life_android_open` | PASS | 원본 generated source validator PASS / 생성 핸들러 모의시험 PASS | NOT_RUN |

## 발견·미해결 항목 — 이번에는 수정하지 않고 취합
| 분류 | 항목 | 근거·관찰 | 일괄 수정 후보 / 필요한 확인 |
|---|---|---|---|
| G01 배포/경로 | 운영 9개 웹 alias는 여전히 Playwright를 설명 | 현재 JH MCP 카탈로그 vs PR #72 소스 차이 | 최신 main에 통합된 단일 모바일 실행 엔진 적용 후보를 검증한 뒤 독립 승인으로 배포 |
| G02 입력/IME | 서버 `press_key`는 BACK만 지원, Enter/Tab/Escape 불허 | 생성 handler 모의시험에서 확인. APK에는 IME_ENTER 관련 코드 문자열 존재 | native 원본 Secure56 1회 허가·대상 포커스 재확인 후 보안 계약이 실제 연결되는지 검증. 키별 지원을 임의 선언하지 말 것 |
| G03 대기 | `life_web_wait`는 `MOBILE_WAIT_CONDITION_UNVERIFIED` 반환 | 실제 생성 핸들러 동작 확인 | 창/화면 재조회·조건 판정 계약 확보. 기다린 시간만으로 성공 판정 금지 |
| G04 입력 | `type.submit=true` 거부, CSS selector 거부 | 실제 생성 handler 테스트 PASS (fail closed) | 원본 접근성에서 텍스트 + 엔터 별도 승인/증거, 사용자가 원한 기능과 일치 여부 점검 |
| G05 선택 | `select` OPEN·PICK은 2개 개별 CLICK, 다음 항목 재획득 필요 | handler 동작 확인 | 화면 재조회/변경된 windowId/새 option itemRef 연계 전후 증거 |
| G06 스크린샷 | 원본 화면 공유 동의·일회성 lease 필요 | 새 alias가 원본 캡처 함수로 전달되는 소스 확인 | 실제 phone local consent/lease 및 UI readback 필요; 더 쉬운 무승인 capture 경로 금지 |
| G07 포커스/스크롤 | APK에 네이티브 수직·수평·중첩 scroll/inputFocus 클래스 있음 | 서명 APK 정적 타입 명칭 확인, 운영 alias E2E 없음 | 실제 창·windowId/포커스 editable/스크롤 컨테이너 내부 레벨·재입력 안전성 1회 시험 |
| G08 진입 경로 | 4개 원본 진입의 signed RIGHT 분류는 source PASS, 동적/실기기 미확인 | 실제 생성 runtime 정적 검증 | 4개 실제 앱·Chrome·웹→앱 동작에서 단일 원본 명령/동의/결과 귀속 확인 |
| G09 이전 CI | 4개 관련 CI 실패: 3개 보호 원본 diff 기준, 1개 옛 click 에러 메시지 기대 | PR #72 당시 Actions 41204321123/21253/21130, 41204321189 | 실제 모듈 보안 불일치인지 test baseline drift인지 전수 검토 후 동시에 정리 |
| G10 원본 Playwright 잔존 | 9+4 바깥의 기존 서버 Playwright 코드도 있음 | PR #72 설명상 후행 정리 대상 | 13개 완전 교체 검증 후 의도된 legacy-only 범위 확정, 다른 기능 임의 삭제 금지 |
| G11 통합/속도 | Android 원본 Native vs 웹 alias 진입 경로·중간개입·속도 실측 미완료 | 실기기 alias 0/13 | 한 세션에서 원본 명령/장치/동의/복귀·지연 측정, 임의 시간·성능 향상 주장 금지 |

### 일괄 수정 전 금지 사항
- 13개 전체 native contract/기기 실제 수행 결과를 수집하지 않고 소스 기능을 건건이 바꾸지 않는다.
- 기존 서명 APK를 무작정 재설치하지 않는다. Android Kotlin/manifest 변경이 실제로 필요한지 먼저 비교한다.
- Chrome 메뉴의 **이미 성공한 Stage27 클릭은 절대 재실행하지 않는다**.
- 과거 SQLite 29건을 지우거나 완료 처리하지 않는다. 별도 문제이며 이 전환 과제의 진행 단계로 전용하지 않는다.
- 안전상 차단된 기능을 서버 Playwright로 몰래 폴백시키지 않는다.

**다음 차례:** 13개 생성 핸들러의 동적 계약까지 **전부 PASS (9개 10 tests + 4개 5 tests)**. 이제 실제 설치 APK의 Android native 포커스·중첩 스크롤·창 ID/캡처/IME 권한 계약을 확인하고, 최신 main과 PR #72의 차이를 한 번에 분석한다. 실기기 alias 13개 E2E는 새 경로가 운영 미배포이므로 여전히 **NOT_RUN/BLOCKED**. 후보 배포/기기 승인이 필요하면 명시적 출시 게이트를 거친다. 그 후 전 기능에서 발견된 공통 원인만 **일괄 1회 수정**.

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
