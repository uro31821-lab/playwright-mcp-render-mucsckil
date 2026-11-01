# JH168 Playwright Mobile 9+4 — LIVE 실행 경로 준비 점검 (실제 실행 전)

**검사 기준:** 2026-11-01. PR #72 검증 브랜치 최신 JH Secure56 main 소스 병합 후보. 실기기 교체 0/13.

## 실제 연결 상태 — 관찰 결과
- Render 서비스 3개: jh-secure-bridge-fix4 (운영), playwright-mcp (다른 클라우드 Playwright), memoria-cloud. 모바일 전용 preview/staging 서비스 없음.
- jh-secure-bridge-fix4 Render: branch jh-fix3-secure-server, autoDeploy=no, **PR previews off**, /var/data 영속 디스크 기존 유지. 현재 LIVE SHA: 2c310f8b4a76d40604416e7dd4cb4976fdd1fc85.
- GitHub PR #72는 모바일 9 alias + 4 entrypoint 소스 후보. Render LIVE main의 9 alias는 browserTool(…) Playwright를 호출. **실제 교체 버전 미배포.**
- 이전 Primary \`life_android_devices\` 조회 기록: \`selectedDeviceId:null, configuredActiveDeviceId:null, devices:[]\`. 이는 당시 상태이며, 이번 중립 검증 화면 준비에서는 기기를 다시 조회하지 않았다. 현재 연결 상태와 이전 Stage27 실기기 성공을 구분한다.
- 설치 확인된 Stage27 APK SHA256 \`129bcc55a9fbf04ebe2bb19d86958fd94f4dc6fd0969bb020105e7f162510359\`의 DEX \`SingleAttemptSecurePoll$Companion.request$app_release\`가 \`https://jh-secure-bridge-fix4.onrender.com/device/poll\`을 **직접 URL 문자열로 사용**. \`AndroidOwnerEnrollmentRuntime.ORIGIN\`도 현재 운영 URL. 따라서 **다른 Render 서비스만 만들어서는 기존 폰이 자동으로 신규 staging으로 폴링하지 않는다.** 다른 서버 연결을 위해서는 별도로 실제 검증된 앱 설정 전환 또는 앱 변경/보안 재연결이 필요하며, 이미 설치된 앱을 임의로 덮어쓰지 말 것.
- 실제 GitHub main Source SHA는 최신 시점에 다시 확인한다. 이 보고서의 SHA는 검사 시점의 스냅샷이다.

## 단일 테스트 후보가 충족해야 하는 조건
1. 최신 원본 main을 **PR72 후보 브랜치에만 병합**하고, 기존 9개+4개 핸들러 소스와 27단계 APK는 그대로 재사용한다. 원본 Secure56/승인·OAuth·nonce/영속 안전 경계 변경 금지.
2. 단순 빌드 보존만이 아니라 **실제 npm start published-host-router → Stage25 original FOLLOWUP operator → pending-approval composition → JH167 모바일 라우팅 패치**까지 검증. 실제 운영 선택 환경변수·도구 카탈로그 등록의 전후 결과를 비교.
3. 13개 경로 모두 SOURCE/PATH 검증 이후, 사용자 승인 없는 배포·핸드폰 명령은 하지 않는다. 운영 배포와폰 연결/승인, 클라이언트 도구 카탈로그 갱신, 실제 UI 완료는 **서로 다른 단계**.
4. 별도 staging이 실제로 불가한 것은 아님. 하지만 **현재 APK는 운영 URL을 직접 폴링**하므로, 신규 테스트용 서비스를 만들려면 사용자 승인·기기 연결 전환 경로/기존 서명·인증 분리 검증이 먼저 필요. 프리뷰는 현재 OFF.
5. 승인된 실제 테스트 시에는 운영 영향 최소화, 기존 성공한 Stage27 Chrome ⋮ 재실행 금지, 다른 안전한 무해한 요소에서 시작. 모든 13개 항목을 한 세션에서 확인하되 각 개별 효과의 원본 휴대폰 승인 필요.
6. 13개 실기기 검증 결과를 모두 PASS/FAIL/BLOCKED로 정리 후 사용자 확정 방식대로 G01–G19 공통 원인 **단일 수정 묶음**으로 해결. 항목별 임의 수정·APK 재설치 금지.

## 지금 실기기 검증 BLOCKER
**LIVE_MOBILE_ROUTE_NOT_DEPLOYED + STAGING_PREVIEW_DISABLED + APK_PRODUCTION_URL_PINNED**. 기기 미연결은 위의 과거 조회에서 확인한 상태이며 실제 실행 전에 현재 상태를 확인해야 한다.

이 문서는 원인 확인과 실행 환경 준비 검토이며 배포·기기 명령을 실행하지 않는다.

### 2026-11-01 검증 환경·중립 화면 준비 추가 확인

- 후보 `1f55bf118870ebc7d9f4bfa3f57dd7a1a84bd88a`의 Stage25 진입점·owner 설정·Secure56 서버/신뢰 등록부는 운영 기준 `2c310f8`과 해당 파일 차이가 없다. Render 읽기 응답에서도 PR preview OFF, autoDeploy OFF, 기존 운영 branch를 확인했다.
- APK는 poll뿐 아니라 원 job 완료 주소도 기존 운영 host로 고정하고 redirect를 따르지 않는다. `SecureBridge56`의 서버 신원 digest와 서버 `owner-config.mjs`의 `EXPECTED_ORIGIN` 역시 해당 운영 origin에 연결된다. `PUBLIC_BASE_URL`만 바꾸거나 새 서비스를 만드는 것으로 기존 설치 APK가 후보 큐를 소비한다고 볼 수 없다.
- Stage25의 CI 생성 경로는 원본 생성·검사용이며 실제 운영 시작은 별도 지정 service/operator 조건을 확인한다. 테스트 조건을 실제 기기 실행 권한으로 사용하지 않는다. 현행 설정 그대로 운영 배포와 APK 전환을 모두 하지 않는 실기기 후보 연결 경로는 확인되지 않았다.
- [중립 테스트 화면](fixtures/mobile13/README.md)과 [13개 시나리오·기대 증거](fixtures/mobile13/cases.json)를 준비했다. 후속 후보에서는 기존 유효한 `PHONE_RIGHT` 모드에 한해 고정 페이지 4개를 생성 런타임에 포함하는 HTTP 경로를 추가했다. 기본 `ORIGINAL` 모드는 자산을 읽거나 경로를 등록하지 않는다. 현재 운영에는 미적용이며 HTTPS 게시·후보 환경 연결·휴대폰 동작은 별도 단계다.
- 준비 파일은 G19의 최종 단일 엔진 목표를 바꾸지 않는다. 현재 방식의 운영 origin에서 검증 후보를 적용할지, 별도 환경 지원을 먼저 구현할지에 대한 실제 환경 변경이 남는다. 임의 전달 프록시·인증값 복사·승인 생략으로 우회하지 않는다.
- 후속 후보 `9baec5776b23e286f34014b090b7ad0c799a85ec`에는 원본 gate를 통과할 때만 선택할 수 있는 임시 `JH_MOBILE_WEB_13_MODE=EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1` 분기가 추가됐다. 미설정 시 원래 도구 등록을 보존한다. 이 선택기와 다른 진행의 CI 변경은 그대로 보존했으며 이번 fixture 준비에서 활성화하거나 운영 반영하지 않았다. 실제 카탈로그와 선택 모드의 일치를 확인해야 한다.
- `cce1c049`를 기준으로 한 [운영 활성화 검토](JH168-MOBILE-VERIFICATION-ACTIVATION.md)에 고정 자산 경로·정확한 후보 적용·두 모드 확인·원복을 묶었다. 현재 Render `trigger_deploy`는 commit이나 branch 지정 인자가 없어, 운영 branch가 그대로인 상태에서 PR72를 배포한다고 가정할 수 없다. 정확한 후보 적용 수단과 유효한 운영 변경 승인이 남는다. 이 준비로 `LIVE_MOBILE_ROUTE_NOT_DEPLOYED` 또는 `BLOCKED_TEST_FIXTURE_NOT_HOSTED`를 해제하지 않는다.

### 실제 Stage25 합성 검사 추가 확인
- 생성된 Stage25 OAuth/Secure56 운영자 소스 안의 13개 경로를 조사. 9개 alias는 Android RIGHT 경로, 4개 entrypoint도 존재.
- `life_web_wait`은 `split_screen_session_status` 조회만 실행하며 `MOBILE_WAIT_CONDITION_UNVERIFIED`라고 반환하므로 모바일 라우트이지만 조건 대기 지원이 아님. 두 상태를 분리해 검사.
- 첫 CI에서 PATH 검사를 `wait`의 read-only 상태 조회 예외 없이 판정하여 8/9 FAIL, 이를 **검증만 보정**하고 원본 기능 코드는 변경하지 않음.
