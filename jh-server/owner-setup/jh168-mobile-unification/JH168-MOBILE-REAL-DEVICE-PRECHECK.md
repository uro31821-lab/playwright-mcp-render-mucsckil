# JH168 Playwright Mobile 9+4 — LIVE 실행 경로 준비 점검 (실제 실행 전)

**검사 기준:** 2026-11-01. PR #72 검증 브랜치 최신 JH Secure56 main 소스 병합 후보. 실기기 교체 0/13.

## 실제 연결 상태 — 관찰 결과
- Render 서비스 3개: jh-secure-bridge-fix4 (운영), playwright-mcp (다른 클라우드 Playwright), memoria-cloud. 모바일 전용 preview/staging 서비스 없음.
- jh-secure-bridge-fix4 Render: branch jh-fix3-secure-server, autoDeploy=no, **PR previews off**, /var/data 영속 디스크 기존 유지. 현재 LIVE SHA: 2c310f8b4a76d40604416e7dd4cb4976fdd1fc85.
- GitHub PR #72는 모바일 9 alias + 4 entrypoint 소스 후보. Render LIVE main의 9 alias는 browserTool(…) Playwright를 호출. **실제 교체 버전 미배포.**
- 현재 Primary \`life_android_devices\` 읽기 응답: \`selectedDeviceId:null, configuredActiveDeviceId:null, devices:[]\`. 이전 Stage27 실기기 성공과 현재 기기 연결 상태는 구분한다.
- 설치 확인된 Stage27 APK SHA256 \`129bcc55a9fbf04ebe2bb19d86958fd94f4dc6fd0969bb020105e7f162510359\`의 DEX \`SingleAttemptSecurePoll$Companion.request$app_release\`가 \`https://jh-secure-bridge-fix4.onrender.com/device/poll\`을 **직접 URL 문자열로 사용**. \`AndroidOwnerEnrollmentRuntime.ORIGIN\`도 현재 운영 URL. 따라서 **다른 Render 서비스만 만들어서는 기존 폰이 자동으로 신규 staging으로 폴링하지 않는다.** 다른 서버 연결을 위해서는 별도로 실제 검증된 앱 설정 전환 또는 앱 변경/보안 재연결이 필요하며, 이미 설치된 앱을 임의로 덮어쓰지 말 것.
- 실제 GitHub main Source SHA는 최신 시점에 다시 확인한다. 이 보고서의 SHA는 검사 시점의 스냅샷이다.

## 단일 테스트 후보가 충족해야 하는 조건
1. 최신 원본 main을 **PR72 후보 브랜치에만 병합**하고, 기존 9개+4개 핸들러 소스와 27단계 APK는 그대로 재사용한다. 원본 Secure56/승인·OAuth·nonce/영속 안전 경계 변경 금지.
2. 단순 빌드 보존만이 아니라 **실제 npm start published-host-router → Stage25 original FOLLOWUP operator → pending-approval composition → JH167 모바일 라우팅 패치**까지 검증. 실제 운영 선택 환경변수·도구 카탈로그 등록의 전후 결과를 비교.
3. 13개 경로 모두 SOURCE/PATH 검증 이후, 사용자 승인 없는 배포·핸드폰 명령은 하지 않는다. 운영 배포와폰 연결/승인, 클라이언트 도구 카탈로그 갱신, 실제 UI 완료는 **서로 다른 단계**.
4. 별도 staging이 실제로 불가한 것은 아님. 하지만 **현재 APK는 운영 URL을 직접 폴링**하므로, 신규 테스트용 서비스를 만들려면 사용자 승인·기기 연결 전환 경로/기존 서명·인증 분리 검증이 먼저 필요. 프리뷰는 현재 OFF.
5. 승인된 실제 테스트 시에는 운영 영향 최소화, 기존 성공한 Stage27 Chrome ⋮ 재실행 금지, 다른 안전한 무해한 요소에서 시작. 모든 13개 항목을 한 세션에서 확인하되 각 개별 효과의 원본 휴대폰 승인 필요.
6. 13개 실기기 검증 결과를 모두 PASS/FAIL/BLOCKED로 정리 후 사용자 확정 방식대로 G01–G14 공통 원인 **단일 수정 묶음**으로 해결. 항목별 임의 수정·APK 재설치 금지.

## 지금 실기기 검증 BLOCKER
**LIVE_MOBILE_ROUTE_NOT_DEPLOYED + BRIDGE_DEVICE_CURRENTLY_NOT_CONNECTED + STAGING_PREVIEW_DISABLED + APK_PRODUCTION_URL_PINNED**.

이 문서는 원인 확인과 실행 환경 준비 검토이며 배포·기기 명령을 실행하지 않는다.

### 실제 Stage25 합성 검사 추가 확인
- 생성된 Stage25 OAuth/Secure56 운영자 소스 안의 13개 경로를 조사. 9개 alias는 Android RIGHT 경로, 4개 entrypoint도 존재.
- `life_web_wait`은 `split_screen_session_status` 조회만 실행하며 `MOBILE_WAIT_CONDITION_UNVERIFIED`라고 반환하므로 모바일 라우트이지만 조건 대기 지원이 아님. 두 상태를 분리해 검사.
- 첫 CI에서 PATH 검사를 `wait`의 read-only 상태 조회 예외 없이 판정하여 8/9 FAIL, 이를 **검증만 보정**하고 원본 기능 코드는 변경하지 않음.
