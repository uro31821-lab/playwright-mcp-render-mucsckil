# JH168 모바일 13개 검증 — 운영 활성화 검토

**상태: 승인된 고정 후보 `4c718900`의 임시 배포·PHONE_RIGHT 모드·고정 4자산 HTTPS 제공 확인 완료.** 이 대화의 Primary 호출 스키마는 아직 구 Playwright 형태이므로 모바일 효과 검증은 갱신 대기다. 최근 등록 기기 1대는 확인했으나 signed poll·UI 완료를 확인한 것은 아니다. 실제 기기 E2E는 **0/13 `NOT_RUN`**이다. 이 문서는 실제 관찰과 확인 조건을 보존하며 다른 후보·추가 기기 동작의 승인을 만들지 않는다.

## 대상과 후보 고정

| 항목 | 기준 |
|---|---|
| 기존 운영 서비스 | `jh-secure-bridge-fix4` / `srv-db0fjl2d0e5s73be114g` |
| 기존 운영 origin | `https://jh-secure-bridge-fix4.onrender.com` |
| 운영 branch / 기준 commit | `jh-fix3-secure-server` / `2c310f8b4a76d40604416e7dd4cb4976fdd1fc85` — 적용 직전 실제 상태와 대조 |
| 이번 준비의 소스 기준 | `da3ddd203a5c9481909d59b0607cd233d80d584d` — 시작 기준 `cce1c049` 이후 같은 PR의 명시적 native 앱 진입 변경을 보존 |
| 실제 활성화 후보 | `4c71890021fc299838e6a8ce45ccf5f64712f354`. 후속 문서·개발 branch head로 자동 대체하지 않음 |
| 로컬 생성 런타임 SHA-256 | PHONE_RIGHT: `a25982af7c31f71fcb875176d9431be6c226e348bc0f3c48b478c503b0c3f45f` / ORIGINAL: `77d0e33a3ec183148a727d363a138cdd0e65b79ad99aed24f2e835b2df46a089` |
| 모바일 선택값 | `JH_MOBILE_WEB_13_MODE=EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1` |

## 후보 변경과 보존 조건

- 기존 `PHONE_RIGHT` 선택기가 유효할 때만 9개 웹 alias와 기존 4개 진입 경로를 검증한다. 같은 모드의 `life_status`는 별도 Playwright를 조회하지 않으며, signed-poll 관찰을 UI 성공으로 표시하지 않는다.
- 같은 선택기 아래에서 `index.html`, `destination.html`, `fixture.css`, `fixture.js` **고정 4자산만** HTTP로 제공한다. 일반 파일 서버·전달 프록시·새 MCP 실행기·승인 발급기를 만들지 않는다.
- **HTTPS 200·고정 해시 확인 주소:** `https://jh-secure-bridge-fix4.onrender.com/__jh_mobile13_fixture/v1/index.html`. 페이지 자산은 `/__jh_mobile13_fixture/v1/` 아래에 한정한다. 페이지의 DOM·카운터는 Android itemRef나 signed 결과의 대체 증거가 아니다.
- flag 미설정·빈 값은 `ORIGINAL`이다. 새 자산 경로를 등록하지 않고 원래 생성 런타임·도구 등록의 바이트 보존을 검사한다. 잘못된 선택값이나 운영 범위는 기존 selector에서 거절한다.
- 기존 service/origin, Stage25 pending/FOLLOWUP operator, Secure56 HMAC·nonce·TTL·명령/기기/세션 결속, 휴대폰 로컬 승인·화면 동의·one-shot 경계를 유지한다. APK·서명·poll 주소·기기 등록·로그인·기존 저장소를 변경하지 않는다. APK 재빌드·재설치는 이번 범위에 없다.

## 실제 변경 전에 충족할 조건

로컬 추가 검증은 HTTP 단위 12개, 실제 생성 Stage25의 두 모드 HTTP 통합 1개, 기존 모바일 계약·원본 호환·Stage25 검사 42개로 **55 passed / 0 failed / 0 skipped**다. 생성·HTTP 검사는 합성 환경의 loopback에서 수행했고 운영 설정·owner 저장소·기기 등록을 사용하지 않았다. 위 SHA는 `JH_STAGE26_SIGNED_COMPLETION_ACK=EXPLICIT_IDENTICAL_SIGNED_RESULT_V1`을 포함한 이 로컬 생성 조건의 결과이며, 실제 운영 설정과 생성 결과가 일치하는지는 적용 후 별도로 확인한다. 운영 기기 E2E 결과가 아니다.

1. **최종 후보 CI 완료:** 기준 `cce1c049`의 CI 10개 성공은 이전 입력의 근거다. 새 handler와 이 문서를 포함한 최종 후보의 관련 검사 및 필수 CI를 병합·배포 전에 확인한다. 같은 입력의 유효한 결과는 재사용하며, 생성 성공을 운영 또는 기기 성공으로 계산하지 않는다.
2. **후보·환경 변경 범위 확인:** 정확한 후보 SHA, 동일 서비스, 위 모바일 flag의 새 값, 기존 operator 조건, 원복 방법을 함께 검토한다. 이미 유효한 동일 범위 승인은 재사용하되 다른 후보·추가 변경으로 확대하지 않는다.
3. **정확한 후보 배포 수단 확인:** 현재 연결된 Render `trigger_deploy` 인자는 `serviceId`, `clearCache`, `workspaceId`뿐이며 **`commitId`·`branch`를 받지 않는다**. 운영 branch가 그대로인 상태에서 이 호출로 PR72의 지정 commit을 배포할 수 있다고 가정하지 않는다. 정확한 후보를 고정할 수 있는 실제 배포 기능과 그 변경에 대한 승인이 먼저 있어야 한다. **도구 제약을 우회하려고 PR72를 병합하지 않는다.** 수단이 없으면 준비 완료 상태에서 배포를 보류한다.
4. **환경값 저장과 배포 동작을 함께 확인:** `render_update_environment_variables`의 `replace:false`는 기존 값과 병합하는 옵션이며 **배포를 억제하는 옵션이 아니다**. 아래 실제 호출에서는 병합 후 연결 branch의 배포가 자동으로 시작됐다. 이 connector 호출을 Save only로 취급하지 않는다. 정확한 SHA 전환에는 Dashboard Environment의 **Save only 옵션이 실제로 제공되는지 먼저 확인**하고 저장 후 지정 commit을 배포하거나, commit을 명시할 수 있는 공식 경로를 사용한다. 허용된 flag만 변경하며 기존 환경값 전체를 다시 쓰거나 모든 secret 변수를 조회하지 않는다.

Render 공식 [배포 문서](https://render.com/docs/deploys)는 Dashboard의 **Manual Deploy → Deploy a specific commit**에서 연결된 저장소의 정확한 SHA를 지정할 수 있음을 설명한다. 이 검증의 코드 후보는 `4c71890021fc299838e6a8ce45ccf5f64712f354`다. 현재 연결 도구로 지원되지 않는 해당 UI 단계는 필요한 사용 승인을 확인하고 수행하며, branch 최신값으로 대체하지 않는다. [환경값 문서](https://render.com/docs/configure-environment-variables)의 Save only를 이용할 때는 해당 서비스의 실제 UI 옵션을 확인한다. 저장만 수행했다면 뒤에 정확한 후보 배포가 필요하며, connector의 환경값 갱신과 같은 동작이라고 가정하지 않는다.

### 2026-11-01 환경값 갱신에서 확인한 운영 기록

| UTC 시점 | 실제 관찰 |
|---|---|
| `2026-11-01T08:59:20.972955Z` | `render_update_environment_variables`를 `replace:false`로 호출한 뒤, 연결 branch의 기준 commit `2c310f8b4a76d40604416e7dd4cb4976fdd1fc85`를 대상으로 `dep-dbjfuq67bikc73fbffm0` 배포가 자동 생성됨. 승인된 `4c71890021fc299838e6a8ce45ccf5f64712f354` 지정 배포와 구분함 |
| `2026-11-01T09:00:10.434052Z` | Dashboard Cancel로 위 자동 배포의 `canceled` 상태 확인 |
| 자동 배포 취소 후 조회 | 기존 live 배포 `dep-dbjectmtlv9c73d0167g`가 유지됨을 확인 |

자동 배포 취소는 저장된 환경값의 원복이 아니다. 모바일 flag를 저장한 뒤 승인된 `4c71890021fc299838e6a8ce45ccf5f64712f354`를 지정한 **Deploy a specific commit**을 실행했다. 새 후보의 완료 근거는 다음 별도 관찰이며 위 취소 기록으로 대신하지 않는다.

### 고정 후보의 실제 배포·응답 확인

| 확인 항목 | 실제 관찰 |
|---|---|
| 배포 | `dep-dbjg01ijnfac73fssde0`, `trigger:manual`, 정확한 commit `4c71890021fc299838e6a8ce45ccf5f64712f354` |
| 시작 / Live | `2026-11-01T09:01:58.412210Z` / `2026-11-01T09:02:54.665289Z`; Render API와 Dashboard의 `Deploy succeeded / Live` 확인 |
| 실제 생성 SHA | `a25982af7c31f71fcb875176d9431be6c226e348bc0f3c48b478c503b0c3f45f`; PHONE_RIGHT 후보 생성값과 일치 |
| 시작 로그 | 이번 배포의 `JH_OPERATIONAL_READY`, `JH_SPLIT_FOLLOWUP_READBACK_ACTIVE`, `JH_STAGE26_SIGNED_COMPLETION_ACK_ACTIVE`가 같은 생성 SHA를 보고. 기존 승인·학습 보존, 자동 replay 금지, APK 변경 없음 확인 |
| 고정 4자산 | index 10344 bytes, destination 3444 bytes, CSS 5208 bytes, JS 9062 bytes 모두 HTTP 200·원본 SHA-256 일치. 고정 CSP, no-store, nosniff, no-referrer 확인 |
| Primary 실제 응답 | `life_status.browser: not_applicable_mobile_right`, `cloudBrowserProbed:false`, `uiVerified:false`, `phoneActionVerified:false`, `signedPollVerified:false`; 학습 저장소 enabled·stateAvailable true, degraded false |
| 기기 관찰 | 최근 등록 기기 1대, active true, 조회 당시 ageSeconds 9. 이는 signed 작업 완료·분할창·UI 확인이 아님 |
| 호출 스키마 경계 | 현재 호스트의 `life_web_click`에 context_id/request_id 없음, select에 phase 없음, snapshot/screenshot도 이전 입력 형태. 실제 서버 tools/list를 별도 회수한 것으로 간주하지 않음. Primary Refresh 후 새 스키마를 확인하기 전 모바일 효과 요청 보류 |
| 무효과 분류 | ENTRY01 웹 요청은 owner:web, 명시적 `휴대폰 설정 앱 열기`도 owner:web. 후자는 기존 G08 분류 누락으로 기록. BEGIN·폰 효과 요청 0건 |

개발 branch에는 이후 `706ff5c82f6ec2f6750d89e53c2924a610e2a75f`의 WAIT 조건 평가·Playwright 제거 전 감사가 추가됐지만 **이 운영 배포에는 포함되지 않았다**. 고정4c의 검증 결과와 후속 source-only 변경을 섞지 않는다. 기존 검증 CI 10개 성공은 재사용했고 변경 없는 55개 시험을 재실행하지 않았다.

**재시작과 새 환경값 적용을 구분한다.** Render의 Restart service는 현재 배포된 commit과 **같은 환경값**을 다시 사용한다. 따라서 새 flag를 저장한 뒤 단순 Restart service만 호출해 활성화·원복을 완료했다고 판단하지 않는다. 새 환경값을 적용하는 배포를 사용한다.

운영 selector는 기존 service ID와 `SERVE_READY_V1`, `EXPLICIT_OPERATOR_APPROVAL_RECEIPT_V1`, `EXPLICIT_FOLLOWUP_CLICK_RECEIPT_V1` 경계를 함께 요구한다. CI 생성 조건을 운영 권한으로 사용하지 않는다. 원본 코드: [모바일 선택기](mobile-web-tool-patch.mjs), [기존 startup router](../deployment/published-host-router.mjs), [Stage25 진입점](stage25-live-operator-followup-entry.mjs).

## 승인된 활성화 후 확인 순서

1. 정확한 후보와 선택값이 적용된 서비스 시작에서 런타임을 다시 생성한다. **flag 저장만으로 기존 handler가 전환됐다고 보지 않는다.** 새 환경값을 적용하는 배포 후 실제 배포 commit·생성 런타임 SHA와 기존 Stage25/Stage26 활성 증거를 확인한다.
2. 실제 MCP 카탈로그의 9개 모바일 alias와 4개 entrypoint를 후보와 대조한다. `life_status.mobileRightStatus56`의 `cloudBrowserProbed:false`, `uiVerified:false`, `phoneActionVerified:false`를 확인한다. `signedPollVerified`는 기존 관찰값이며 임의로 true를 요구하거나 주입하지 않는다.
3. 계획된 HTTPS의 고정 자산과 응답을 확인하고 실제 주소를 검증 기록에 남긴다. HTTP 응답 성공은 페이지 제공의 증거이며 휴대폰 UI 완료 증거가 아니다.
4. 기존 Primary·유효 세션·분할창의 현재 상태와 원 작업의 승인 범위를 확인한 뒤 [13개 검증표](JH168-MOBILE-13-ONE-SESSION-VERIFY-MATRIX.md)를 따른다. 서로 다른 효과를 하나의 승인으로 합치지 않는다. 원 command/request/job/receipt와 필요한 로컬 승인·화면 동의는 개인 실행 기록에 연결하며 공개 문서에 토큰·키·실제 화면 원문을 기록하지 않는다.

## 원복과 미확정 결과

모바일 검증을 중단하면 새 효과 요청을 멈춘다. 해당 flag를 미설정 또는 빈 값으로 돌리고 **새 환경값을 적용하는 재배포·런타임 재생성 후 원래 카탈로그와 새 자산 경로 미등록을 확인**한다. 같은 검증 후보 SHA의 기본 모드로 원복하거나 검토한 운영 기준 `2c310f8b4a76d40604416e7dd4cb4976fdd1fc85`를 정확히 지정한다. 단순 환경값 저장 또는 Restart service만으로 원복 완료라고 보고하지 않는다.

원본 저장소를 삭제·초기화하지 않는다. 미확정 원 작업의 상태와 영수증을 보존하며, 원복·재시작을 성공·실패의 증거로 삼거나 새 request_id로 다시 실행하지 않는다. 이미 성공한 Stage27 Chrome 메뉴 동작도 반복하지 않는다. 이 임시 선택기·원복은 검증 단계용이며 G19의 최종 단일 모바일 엔진·구 Playwright 제거 목표를 대체하지 않는다.

**남은 실제 결과:** Primary 호출 스키마 Refresh·실제 모바일 등록 대조, signed 원 세션·분할창·개별 로컬 승인 확인, 나머지 모바일 실행 검증. 고정4c의 TYPE/BACK/KEY/WAIT/SCREENSHOT 계약 누락과 ENTRY01 native 분류 누락은 [기존 결함 장부](JH168-MOBILE-13-DEFECT-LEDGER.md)에 기록했다. 기기 E2E **0/13 `NOT_RUN`**을 유지하며 배포 완료를 기기 성공으로 세지 않는다.
