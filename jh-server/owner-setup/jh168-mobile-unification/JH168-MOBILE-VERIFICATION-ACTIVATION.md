# JH168 모바일 13개 검증 — 운영 활성화 검토

**상태: 검토용, 운영 미반영, 실제 기기 0/13 `NOT_RUN`.** 이 문서는 변경 범위와 확인 조건을 고정한다. 배포·모드 변경·휴대폰 동작의 승인 또는 실행 영수증이 아니다.

## 대상과 후보 고정

| 항목 | 기준 |
|---|---|
| 기존 운영 서비스 | `jh-secure-bridge-fix4` / `srv-db0fjl2d0e5s73be114g` |
| 기존 운영 origin | `https://jh-secure-bridge-fix4.onrender.com` |
| 운영 branch / 기준 commit | `jh-fix3-secure-server` / `2c310f8b4a76d40604416e7dd4cb4976fdd1fc85` — 적용 직전 실제 상태와 대조 |
| 이번 준비의 소스 기준 | `da3ddd203a5c9481909d59b0607cd233d80d584d` — 시작 기준 `cce1c049` 이후 같은 PR의 명시적 native 앱 진입 변경을 보존 |
| 활성화 후보 | 위 기준에 **이 문서와 고정 4자산 HTTP handler를 포함한 최종 commit**. 통합 담당자가 최종 보고서에 정확한 SHA를 고정하며 후속 head로 자동 대체하지 않음 |
| 로컬 생성 런타임 SHA-256 | PHONE_RIGHT: `a25982af7c31f71fcb875176d9431be6c226e348bc0f3c48b478c503b0c3f45f` / ORIGINAL: `77d0e33a3ec183148a727d363a138cdd0e65b79ad99aed24f2e835b2df46a089` |
| 모바일 선택값 | `JH_MOBILE_WEB_13_MODE=EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1` |

## 후보 변경과 보존 조건

- 기존 `PHONE_RIGHT` 선택기가 유효할 때만 9개 웹 alias와 기존 4개 진입 경로를 검증한다. 같은 모드의 `life_status`는 별도 Playwright를 조회하지 않으며, signed-poll 관찰을 UI 성공으로 표시하지 않는다.
- 같은 선택기 아래에서 `index.html`, `destination.html`, `fixture.css`, `fixture.js` **고정 4자산만** HTTP로 제공한다. 일반 파일 서버·전달 프록시·새 MCP 실행기·승인 발급기를 만들지 않는다.
- **계획된 주소, 아직 활성화·접근 확인 안 됨:** `https://jh-secure-bridge-fix4.onrender.com/__jh_mobile13_fixture/v1/index.html`. 페이지 자산은 `/__jh_mobile13_fixture/v1/` 아래에 한정한다. 페이지의 DOM·카운터는 Android itemRef나 signed 결과의 대체 증거가 아니다.
- flag 미설정·빈 값은 `ORIGINAL`이다. 새 자산 경로를 등록하지 않고 원래 생성 런타임·도구 등록의 바이트 보존을 검사한다. 잘못된 선택값이나 운영 범위는 기존 selector에서 거절한다.
- 기존 service/origin, Stage25 pending/FOLLOWUP operator, Secure56 HMAC·nonce·TTL·명령/기기/세션 결속, 휴대폰 로컬 승인·화면 동의·one-shot 경계를 유지한다. APK·서명·poll 주소·기기 등록·로그인·기존 저장소를 변경하지 않는다. APK 재빌드·재설치는 이번 범위에 없다.

## 실제 변경 전에 충족할 조건

로컬 추가 검증은 HTTP 단위 12개, 실제 생성 Stage25의 두 모드 HTTP 통합 1개, 기존 모바일 계약·원본 호환·Stage25 검사 42개로 **55 passed / 0 failed / 0 skipped**다. 생성·HTTP 검사는 합성 환경의 loopback에서 수행했고 운영 설정·owner 저장소·기기 등록을 사용하지 않았다. 위 SHA는 `JH_STAGE26_SIGNED_COMPLETION_ACK=EXPLICIT_IDENTICAL_SIGNED_RESULT_V1`을 포함한 이 로컬 생성 조건의 결과이며, 실제 운영 설정과 생성 결과가 일치하는지는 적용 후 별도로 확인한다. 운영 기기 E2E 결과가 아니다.

1. **최종 후보 CI 완료:** 기준 `cce1c049`의 CI 10개 성공은 이전 입력의 근거다. 새 handler와 이 문서를 포함한 최종 후보의 관련 검사 및 필수 CI를 병합·배포 전에 확인한다. 같은 입력의 유효한 결과는 재사용하며, 생성 성공을 운영 또는 기기 성공으로 계산하지 않는다.
2. **후보·환경 변경 범위 확인:** 정확한 후보 SHA, 동일 서비스, 위 모바일 flag의 새 값, 기존 operator 조건, 원복 방법을 함께 검토한다. 이미 유효한 동일 범위 승인은 재사용하되 다른 후보·추가 변경으로 확대하지 않는다.
3. **정확한 후보 배포 수단 확인:** 현재 연결된 Render `trigger_deploy` 인자는 `serviceId`, `clearCache`, `workspaceId`뿐이며 **`commitId`·`branch`를 받지 않는다**. 운영 branch가 그대로인 상태에서 이 호출로 PR72의 지정 commit을 배포할 수 있다고 가정하지 않는다. 정확한 후보를 고정할 수 있는 실제 배포 기능과 그 변경에 대한 승인이 먼저 있어야 한다. **도구 제약을 우회하려고 PR72를 병합하지 않는다.** 수단이 없으면 준비 완료 상태에서 배포를 보류한다.
4. **환경값 변경은 최소 병합:** 허용된 변경 시 `update_environment_variables`의 `replace:false`로 해당 flag만 병합한다. 기존 환경값 전체를 다시 쓰거나 모든 secret 변수를 조회할 필요가 없다. 이 문서는 실제 환경값 변경을 수행하지 않는다.

운영 selector는 기존 service ID와 `SERVE_READY_V1`, `EXPLICIT_OPERATOR_APPROVAL_RECEIPT_V1`, `EXPLICIT_FOLLOWUP_CLICK_RECEIPT_V1` 경계를 함께 요구한다. CI 생성 조건을 운영 권한으로 사용하지 않는다. 원본 코드: [모바일 선택기](mobile-web-tool-patch.mjs), [기존 startup router](../deployment/published-host-router.mjs), [Stage25 진입점](stage25-live-operator-followup-entry.mjs).

## 승인된 활성화 후 확인 순서

1. 정확한 후보와 선택값이 적용된 서비스 시작에서 런타임을 다시 생성한다. **flag 저장만으로 기존 handler가 전환됐다고 보지 않는다.** 재시작 후 실제 배포 commit·생성 런타임 SHA와 기존 Stage25/Stage26 활성 증거를 확인한다.
2. 실제 MCP 카탈로그의 9개 모바일 alias와 4개 entrypoint를 후보와 대조한다. `life_status.mobileRightStatus56`의 `cloudBrowserProbed:false`, `uiVerified:false`, `phoneActionVerified:false`를 확인한다. `signedPollVerified`는 기존 관찰값이며 임의로 true를 요구하거나 주입하지 않는다.
3. 계획된 HTTPS의 고정 자산과 응답을 확인하고 실제 주소를 검증 기록에 남긴다. HTTP 응답 성공은 페이지 제공의 증거이며 휴대폰 UI 완료 증거가 아니다.
4. 기존 Primary·유효 세션·분할창의 현재 상태와 원 작업의 승인 범위를 확인한 뒤 [13개 검증표](JH168-MOBILE-13-ONE-SESSION-VERIFY-MATRIX.md)를 따른다. 서로 다른 효과를 하나의 승인으로 합치지 않는다. 원 command/request/job/receipt와 필요한 로컬 승인·화면 동의는 개인 실행 기록에 연결하며 공개 문서에 토큰·키·실제 화면 원문을 기록하지 않는다.

## 원복과 미확정 결과

모바일 검증을 중단하면 새 효과 요청을 멈춘다. 해당 flag를 미설정 또는 빈 값으로 돌리고 **서비스 재시작·런타임 재생성 후 원래 카탈로그와 새 자산 경로 미등록을 확인**한다. 단순 환경값 저장만으로 원복 완료라고 보고하지 않는다.

원본 저장소를 삭제·초기화하지 않는다. 미확정 원 작업의 상태와 영수증을 보존하며, 원복·재시작을 성공·실패의 증거로 삼거나 새 request_id로 다시 실행하지 않는다. 이미 성공한 Stage27 Chrome 메뉴 동작도 반복하지 않는다. 이 임시 선택기·원복은 검증 단계용이며 G19의 최종 단일 모바일 엔진·구 Playwright 제거 목표를 대체하지 않는다.

**남은 실제 결과:** HTTPS 제공 미확인, 후보 운영 활성화 미실행, 현재 기기 연결 미확인, 교체 경로 실기기 **0/13 `NOT_RUN`**. 알려진 key/조건 WAIT 등 `CODE_GAP`은 그대로 기록한다. 준비·CI·배포·기기 결과는 각각 별도 상태로 갱신한다.
