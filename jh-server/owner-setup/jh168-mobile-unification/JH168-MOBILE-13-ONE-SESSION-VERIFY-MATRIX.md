# JH168 9개 웹 명령 + 4개 진입 경로 — 1회 실기기 검증 매트릭스

**방식 고정:** **전 13개 대상 사전검사·실행 결과 수집 → G01–G19 결함 일괄 수정 → 전체 재검증**. 구 PR #72의 기존 기능 코드나 서명 APK를 기능별로 재수정·재설치하지 않는다.

**기존 검사 기록과 분리 기준:** 생성 서버 라우트 13/13 + 모의 handler 15/15 테스트 PASS. 기존 서명 APK Native 6개 메서드 28/28 정적 검사 PASS. **교체된 경로의 실기기 0/13**. 기존 27단계 Chrome ⋮ 완료는 이미 검증된 동작으로 재클릭 금지.

**고정 후보 소스 재대조:** `4c71890021fc299838e6a8ce45ccf5f64712f354` 기준 WEB04/06/07/08/09는 **`SOURCE_CONFIRMED_CODE_GAP / BLOCKED`**, 실기기 증거는 **`NOT_RUN`**이다. 소스에서 확인한 거절을 폰에 다시 보내 재현하지 않는다. 기존 [단일 결함 장부의 G02/G03/G04/G06](JH168-MOBILE-13-DEFECT-LEDGER.md)에 연결하며, 과거 모의시험 PASS·현재 실행 가능성·실기기 PASS를 분리한다. 이 문서 갱신으로 실제 배포 완료나 현재 기기 연결을 판정하지 않는다.

## 시험 준비 — 반드시 실제 효과 이전

1. 검사에 쓰는 정확한 후보 SHA·선택값·생성 runtime과 실제 Primary 카탈로그의 모바일 입력 스키마를 **함께 확인**. PR #107의 2026-11-01T07:15:43Z 관찰 기준 main `2c310f8b4a76d40604416e7dd4cb4976fdd1fc85`의 9개 alias는 별도 Playwright였으며 이 이력은 보존한다. 후속 고정 후보의 실제 적용 여부는 [활성화 확인 절차](JH168-MOBILE-VERIFICATION-ACTIVATION.md)에 따라 새 증거로 확인한다. **기존 Playwright 등록 또는 갱신되지 않은 입력 스키마로 모바일 효과 시험을 시작하지 않는다.**
2. 기존 27단계 원본 서명 APK `129bcc55...` 설치 체크포인트 재사용. 이미 성공한 Chrome 메뉴 동작 반복 금지. Android 소스를 실제 수정하지 않은 경우 빌드·서명·재설치 금지.
3. 테스트는 **개인 계정·병원 데이터 없는 중립 테스트 화면**으로 진행. [중립 화면 자산과 로컬 검사](fixtures/mobile13/README.md), [13개 시나리오](fixtures/mobile13/cases.json)를 준비했다. 실제 기기에서 사용할 HTTPS 게시 주소와 접근은 별도 확인하며, 파일만 있다는 이유로 준비 완료로 처리하지 않는다. 대상 화면이 없으면 `BLOCKED_TEST_FIXTURE_MISSING`, 자산은 있으나 기기에서 접근할 게시 주소가 없으면 `BLOCKED_TEST_FIXTURE_NOT_HOSTED`로 기록한다.
4. 기존 Primary·사용자 유효 인증·기기·분할창 확인. 실제 입력·클릭·화면 캡처는 기존 Secure56 HMAC/nonce와 휴대폰 로컬 승인·동의 절차에 따름. 인증/승인 실패는 다른 도구로 우회하지 않음.
5. 독립 동작은 각각 기존 승인·명령을 요구할 수 있음. 하나의 검증 세션에서 UI 확인은 묶되 **서로 다른 효과를 승인 하나로 합치지 않음**. 실행 확인이 불확실하면 절대 재클릭하지 않고 같은 작업 영수증 조회.

## 대상별 실행 증거와 일괄 수집 항목

아래 시나리오는 각 행이 최종적으로 검증해야 할 목표다. **BLOCKED 행은 지금 실행할 순서가 아니며**, 전수 조사 후 공통 원인을 통합 수정하기 전에는 실행하지 않는다. 각 행의 실제 결과 또는 차단 근거를 모두 수집한 뒤 전체 재검증한다.

| 순서 | MCP 대상 | 안전한 검증 목표 / 기대 증거 | 현재 소스 계약과 실행 상태 |
|---|---|---|---|
| WEB01 | `life_web_navigate` | 중립 HTTPS 사이트를 오른쪽 Chrome으로 1회 열고 주소·작업 ID·LEFT GPT 유지 확인 | 원격 Playwright 미선택 필수 |
| WEB02 | `life_web_snapshot` | START가 실제 RIGHT 창 `windowId/displayId/contextId/itemRef` 반환; context 지정 STATUS는 같은 context의 새 READ_ONLY job | 현재 화면·팝업 재식별 필요. 원 pending job의 순수 영수증 회수와 구분 |
| WEB03 | `life_web_click` | **Stage27 ⋮가 아닌** 무해한 요소 1개 클릭, 화면/새 창 번호가 변해도 원본 영수증과 정확히 연결 | fresh itemRef 의무, target obscured 오판 점검 |
| WEB04 | `life_web_type` | 통합 수정 후 포커스·editable·원 input grant를 확인하고 비민감 SET_TEXT 1회 검증 | **SOURCE_CONFIRMED_CODE_GAP / BLOCKED (G04), NOT_RUN.** preflight type 미허용 및 FOLLOW_UP SET_TEXT 거절: `DURABLE_OPERATION_NOT_SUPPORTED`. 기존 submit/CSS/비밀번호·OTP 제한 유지 |
| WEB05 | `life_web_select` | OPEN→변경된 창/메뉴의 새 itemRef 읽기→PICK 후 실제 옵션 결과 확인 | 2단계 별도 클릭, stale itemRef 사용 금지 |
| WEB06 | `life_web_press_key` | 키별 원본 실행 계약·포커스·결과 검증 목표를 보존하고 현재는 실행 보류 | **SOURCE_CONFIRMED_CODE_GAP / BLOCKED (G02), NOT_RUN.** BACK 입력 분기는 실제 허용이 아니며 durable에서 거절. 다른 키는 `MOBILE_KEY_NOT_VERIFIED` |
| WEB07 | `life_web_wait` | 통합 수정 후 실제 조건 변화와 도구의 조건 판정 결과를 함께 확인 | **SOURCE_CONFIRMED_CODE_GAP / BLOCKED (G03), NOT_RUN.** `MOBILE_WAIT_CONDITION_UNVERIFIED`, `conditionVerified:false`; 지연 버튼·반복 STATUS로 미구현을 재현하지 않음 |
| WEB08 | `life_web_back` | 통합 수정 후 팝업·키보드 닫기와 페이지 뒤로를 분리하여 원 BACK 결과 검증 | **SOURCE_CONFIRMED_CODE_GAP / BLOCKED (G02), NOT_RUN.** FOLLOW_UP BACK은 `DURABLE_OPERATION_NOT_SUPPORTED`; 다른 도구의 BACK으로 alias 통과 대체 금지 |
| WEB09 | `life_web_screenshot` | 통합 수정 후 기존 로컬 동의·one-shot lease로 정확한 RIGHT 창의 원 프레임 확인 | **SOURCE_CONFIRMED_CODE_GAP / BLOCKED (G06), NOT_RUN.** alias의 `action: SCREENSHOT` 전달 누락. 실패 확인을 위해 동의·lease를 소비하지 않음; 원본 동의·API34 창 경계 유지 |
| ENTRY01 | `life_route` | 무해한 웹/앱 문장별 실제 분류 확인, 기기 실행 0건 | **LIVE_CLASSIFICATION_PARTIAL (G08).** 웹 fixture는 owner:web 기대 일치, `휴대폰 설정 앱 열기`도 web으로 오분류. 실제 앱 실행 실패로 세지 않음 |
| ENTRY02 | `life_open_service` | 무해한 사이트 열기 1건, RIGHT Chrome 주소·완료 영수증 확인 | WEB01과 같은 페이지를 **재열기하여 중복 효과를 만들지 않음** |
| ENTRY03 | `life_naver_mail` | 네이버 메일 **열기 경로만**, 로그인·읽지 않은 메일 삭제·발송 금지. 동일 RIGHT opener 사용 확인 | Playwright 별도 계정으로 라우팅 금지 |
| ENTRY04 | `life_android_open` | HTTPS는 RIGHT URL, 명시된 `last_work_screen`은 원본 화면 복귀로 분리 확인 | 웹→native 자동 변환/새 앱 무단 실행 금지 |

## 공통 Native 검증 열 — 13개 모두 동일 양식

- 원래 명령·Secure56 원본 세션·디바이스 HMAC·request_id와 수신 상태: **확인/미확인**
- 실제 표시된 RIGHT 창의 `windowId`, `displayId`, 패키지 및 내부 스크롤 대상: **확인/미확인**
- 원래 GPT LEFT 분할화면 및 기기 안면인식 영향: **유지/변화/미검증**
- 텍스트 포커스·password/OTP 로컬 입력 차단·화면 가림 판정: **확인/미확인**
- 사용자의 필수 로컬 승인·동의 및 one-shot 소비: **확인/미확인**
- 결과 영수증·완료 신호 및 원래 GPT 복귀, 중복 작업: **확인/미확인**
- WEB02/WEB07의 증거는 해당 원 `split_screen_session_start/status` 결과에서 수집한다. 별도 comfort STATUS, fallback snapshot 또는 임의 성공 플래그를 원 결과의 증거로 대체하지 않는다. `COMFORT_STATUS_DIRECT_PROOF_MISSING`은 13개 밖의 별도 범위다.
- 새 화면 참조를 얻기 위한 STATUS와 원 pending 결과 회수를 구분한다. 원 START/STATUS·CLICK의 `srr_`/`sfr_`가 반환됐으면 그 영수증과 같은 command로 `READBACK_PENDING`을 사용한다. OPEN의 미확정 결과는 반환된 원 `job_id`·`command_id`로만 조회한다. 다른 snapshot이나 새 request ID로 원 결과를 대신하지 않는다.
- OPEN 계열은 실제 표시 주소와 요청 echo를 구분한다. `result.url`만으로 정확한 표시 주소 일치를 판정하지 않으며, 기존 Android 주소 일치 정책과 허용된 redirect 범위를 함께 기록한다. [6경로 원본 감사](../operational-learning/ANDROID-PRODUCER-COMPATIBILITY.md)의 `OPEN_REQUEST_ECHO_NOT_OBSERVED_URL`을 참조한다.
- 소요시간은 실제 계측 시에만 기록. 무측정 속도 개선 주장 금지.

## 실패·수정 순서

- 증거가 충분한 `CODE_GAP`은 `SOURCE_CONFIRMED_CODE_GAP / BLOCKED`와 원 G번호로 표시한다. **실기기 FAIL/PASS가 아니며 E2E_NOT_RUN을 유지**한다. WEB04/06/07/08/09는 위 소스 근거가 있으므로 거절 확인용 명령이나 캡처 동의를 새로 요청하지 않는다.
- 기기 또는 후보 배포가 없어 검증할 수 없는 항목은 `BLOCKED`, 소스/모의시험만 통과한 항목은 `SOURCE_PASS` 및 `E2E_NOT_RUN`을 동시에 보존.
- 13개를 전부 조사하기 전 서버/Android 기능 수정 0회. 13개 조사 완료 후 **원인 G01–G19를 묶은 한 번의 수정**과 원본 Secure56·APK 서명·13개 전면 회귀, 마지막 1회의 실제 기기 검증 세션.
- 기존 27단계 성공 CLICK과 미확정 SQLite 원본 작업을 재실행·강제 완료하지 않는다.

**실사용 상태의 기록 기준:** 이전 Playwright 카탈로그 관찰은 이력으로 보존한다. 기존 운영 origin에서 고정 후보·모바일 선택값·실제 카탈로그·현재 기기 결속을 확인하기 전에는 모바일 실행 가능으로 승격하지 않는다. 이 문서에는 후속 배포 완료나 현재 기기 접속을 추정해 적지 않으며, 기기가 비어 있으면 해당 행은 `BLOCKED_DEVICE_NOT_CONNECTED / E2E_NOT_RUN`으로 남긴다. 원본 SQLite 변경이나 새 BEGIN으로 과거 결과를 회수하지 않는다.

**2026-11-01 실제 진행:** [고정4c 활성화 기록](JH168-MOBILE-VERIFICATION-ACTIVATION.md)에서 Live·PHONE_RIGHT 생성 SHA·4자산 HTTP/해시와 최근 등록 기기 1대(active, ageSeconds 9)를 확인했다. signed poll·분할창·UI는 미확인이다. 현재 대화의 호출 schema가 이전 형태이므로 **Primary Refresh → 모바일 입력 계약 확인 → 원 세션·기기 조건 확인** 순서로 이어간다. 실제 분류 ENTRY01의 native 누락을 G08에 연결했고 폰 명령·BEGIN은 0건이다. 실기기 PASS0/13, WEB04/06/07/08/09의 소스 차단과 나머지7개 행의 카탈로그 대기를 분리한다.

### 준비 파일과 실기기 증거의 구분

중립 화면의 DOM ID·카운터·이벤트 목록은 관찰 대상이다. 실제 서명된 `itemRef`, 원 job 결과, 로컬 승인, 정확한 창 증거를 생성하거나 대신하지 않는다. 데스크톱에서 페이지 동작이 통과해도 모바일 전환 실기기 수는 **0/13, NOT_RUN**이다. ENTRY03의 실제 네이버 열기 및 ENTRY04의 native 복귀는 별도 대상에서 확인한다.

후보 `1f55bf118870ebc7d9f4bfa3f57dd7a1a84bd88a`부터 CLICK/TYPE/SELECT/BACK 및 BACK key의 alias 입력 계약에는 원 Secure56 규약의 동작별 32자리 소문자 hex `request_id`가 필요하다. **ID 입력 계약이 존재한다는 사실은 TYPE/BACK의 durable 실행 허용을 뜻하지 않으며 위 BLOCKED 판정을 유지한다.** 페이지가 이 값을 자동 생성하지 않는다. 결과 미확정 시 새 ID로 재실행하지 않고 같은 원 작업을 조회한다.
