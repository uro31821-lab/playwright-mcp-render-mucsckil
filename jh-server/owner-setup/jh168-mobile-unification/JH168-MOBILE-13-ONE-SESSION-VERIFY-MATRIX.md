# JH168 9개 웹 명령 + 4개 진입 경로 — 1회 실기기 검증 매트릭스

**방식 고정:** **전 13개 대상 사전검사·실행 결과 수집 → G01–G19 결함 일괄 수정 → 전체 재검증**. 구 PR #72의 기존 기능 코드나 서명 APK를 기능별로 재수정·재설치하지 않는다.

**현재 구분:** 생성 서버 라우트 13/13 + 모의 handler 15/15 테스트 PASS. 기존 서명 APK Native 6개 메서드 28/28 정적 검사 PASS. **교체된 경로의 실기기 0/13**. 기존 27단계 Chrome ⋮ 완료는 이미 검증된 동작으로 재클릭 금지.

## 시험 준비 — 반드시 실제 효과 이전
1. 검사에 쓰는 서버 후보가 구형 PR72 그대로인지, 최신 main 기반 테스트 호스트인지, 실제 JH 카탈로그가 어떤 코드를 선택하는지 **서명과 SHA로 확인**. PR #107의 2026-11-01T07:15:43Z 배포 후 검증 기준 LIVE main `2c310f8b4a76d40604416e7dd4cb4976fdd1fc85`의 `life_web_*` 9개는 별도 Playwright. **LIVE에서 그대로 9개 호출하면 모바일 alias 시험이 아니므로 금지**.
2. 기존 27단계 원본 서명 APK `129bcc55...` 설치 체크포인트 재사용. 이미 성공한 Chrome 메뉴 동작 반복 금지. Android 소스를 실제 수정하지 않은 경우 빌드·서명·재설치 금지.
3. 테스트는 **개인 계정·병원 데이터 없는 중립 테스트 화면**으로 진행. [중립 화면 자산과 로컬 검사](fixtures/mobile13/README.md), [13개 시나리오](fixtures/mobile13/cases.json)를 준비했다. 실제 기기에서 사용할 HTTPS 게시 주소와 접근은 별도 확인하며, 파일만 있다는 이유로 준비 완료로 처리하지 않는다. 대상 화면이 없으면 `BLOCKED_TEST_FIXTURE_MISSING`, 자산은 있으나 기기에서 접근할 게시 주소가 없으면 `BLOCKED_TEST_FIXTURE_NOT_HOSTED`로 기록한다.
4. 기존 Primary·사용자 유효 인증·기기·분할창 확인. 실제 입력·클릭·화면 캡처는 기존 Secure56 HMAC/nonce와 휴대폰 로컬 승인·동의 절차에 따름. 인증/승인 실패는 다른 도구로 우회하지 않음.
5. 독립 동작은 각각 기존 승인·명령을 요구할 수 있음. 하나의 검증 세션에서 UI 확인은 묶되 **서로 다른 효과를 승인 하나로 합치지 않음**. 실행 확인이 불확실하면 절대 재클릭하지 않고 같은 작업 영수증 조회.

## 대상별 실행 증거와 일괄 수집 항목

| 순서 | MCP 대상 | 안전한 검증 시나리오 / 기대 증거 | 기존 소스에서 확정된 제약 |
|---|---|---|---|
| WEB01 | `life_web_navigate` | 중립 HTTPS 사이트를 오른쪽 Chrome으로 1회 열고 주소·작업 ID·LEFT GPT 유지 확인 | 원격 Playwright 미선택 필수 |
| WEB02 | `life_web_snapshot` | START가 실제 RIGHT 창 `windowId/displayId/contextId/itemRef` 반환, STATUS는 같은 작업 재조회 | 현재 화면·팝업 재식별 필요 |
| WEB03 | `life_web_click` | **Stage27 ⋮가 아닌** 무해한 요소 1개 클릭, 화면/새 창 번호가 변해도 원본 영수증과 정확히 연결 | fresh itemRef 의무, target obscured 오판 점검 |
| WEB04 | `life_web_type` | 테스트 입력칸 포커스·editable 확인 후 비민감 문자 1회 SET_TEXT; 로컬 입력 승인·결과 확인 | CSS selector 거부, `submit=true` 미지원, 사용자만 입력할 비밀번호/OTP 불실행 |
| WEB05 | `life_web_select` | OPEN→변경된 창/메뉴의 새 itemRef 읽기→PICK 후 실제 옵션 결과 확인 | 2단계 별도 클릭, stale itemRef 사용 금지 |
| WEB06 | `life_web_press_key` | BACK과 별도로 Enter/Tab/Escape 지원을 확인. 미지원이면 **기능 GAP 확정**으로 기록하고 위험한 키 명령은 시도하지 않음 | 현재 서버는 BACK 외 `MOBILE_KEY_NOT_VERIFIED`; APK IME Enter는 연결 불명 |
| WEB07 | `life_web_wait` | 테스트 화면의 실제 조건 변화가 관측될 때만 성공, 단순 시간 경과를 성공으로 간주하지 않음 | 현재 `MOBILE_WAIT_CONDITION_UNVERIFIED`: 기능 GAP, 무한 반복 금지 |
| WEB08 | `life_web_back` | 팝업 닫기/키보드 닫기/페이지 뒤로를 분리, 실제 변경된 UI·원본 명령 확인 | BACK ≠ 자동 history 성공 |
| WEB09 | `life_web_screenshot` | 민감정보 없는 RIGHT 창에서 기존 1회 화면 동의·one-shot lease 사용, 정확한 윈도우 캡처/결과 확인 | 로컬 동의 없이 캡처 불가, API34 창 단위 증거 |
| ENTRY01 | `life_route` | 무해한 웹/앱 문장별 라우팅만 확인, 분류 도구의 자체 실행 0건 | Playwright 자동 선택·실행 금지 |
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
- OPEN 계열은 실제 표시 주소와 요청 echo를 구분한다. `result.url`만으로 정확한 표시 주소 일치를 판정하지 않으며, 기존 Android 주소 일치 정책과 허용된 redirect 범위를 함께 기록한다. [6경로 원본 감사](../operational-learning/ANDROID-PRODUCER-COMPATIBILITY.md)의 `OPEN_REQUEST_ECHO_NOT_OBSERVED_URL`을 참조한다.
- 소요시간은 실제 계측 시에만 기록. 무측정 속도 개선 주장 금지.

## 실패·수정 순서
- 증거가 충분한 `CODE_GAP`은 무리하게 실기기 동작을 발생시키지 않고 결함 장부에 확정 표시.
- 기기 또는 후보 배포가 없어 검증할 수 없는 항목은 `BLOCKED`, 소스/모의시험만 통과한 항목은 `SOURCE_PASS` 및 `E2E_NOT_RUN`을 동시에 보존.
- 13개를 전부 조사하기 전 서버/Android 기능 수정 0회. 13개 조사 완료 후 **원인 G01–G19를 묶은 한 번의 수정**과 원본 Secure56·APK 서명·13개 전면 회귀, 마지막 1회의 실제 기기 검증 세션.
- 기존 27단계 성공 CLICK과 미확정 SQLite 원본 작업을 재실행·강제 완료하지 않는다.

**실사용 검증 차단 현재 상태:** LIVE JH 서버는 아직 9개 `life_web_*`를 별도 Playwright로 설명 및 등록하고 있으므로, 이들 alias를 실제 휴대폰 대상으로 시험하려면 **분리된 검증용 서버 후보/배포·OAuth·기기 연결**이 필요하다. 승인 없는 운영 배포나 프로덕션 SQLite 변경은 하지 않는다.

### 준비 파일과 실기기 증거의 구분

중립 화면의 DOM ID·카운터·이벤트 목록은 관찰 대상이다. 실제 서명된 `itemRef`, 원 job 결과, 로컬 승인, 정확한 창 증거를 생성하거나 대신하지 않는다. 데스크톱에서 페이지 동작이 통과해도 모바일 전환 실기기 수는 **0/13, NOT_RUN**이다. ENTRY03의 실제 네이버 열기 및 ENTRY04의 native 복귀는 별도 대상에서 확인한다.

후보 `1f55bf118870ebc7d9f4bfa3f57dd7a1a84bd88a`부터 CLICK/TYPE/SELECT/BACK 및 지원 key의 효과 요청에는 원 Secure56 규약의 동작별 32자리 소문자 hex `request_id`를 전달한다. 페이지가 이 값을 자동 생성하지 않는다. 결과 미확정 시 새 ID로 재실행하지 않고 같은 원 작업을 조회한다.
