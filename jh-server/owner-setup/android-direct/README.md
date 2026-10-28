# JH167 Android Direct — 1단계 격리 구현 (2026-10-28)

**상태:** 운영 반영 **안 함**. 별도 브랜치에만 존재하는 보안 재사용형 후보. 기존 JH167 APK·서명·MCP 등록·Render 설정·Chrome·Playwright 서비스는 **변경 없음**.

## 결정
JH의 기존 GPT → JH Secure MCP → Secure56 signed Bridge → Android Accessibility/Computer Use → signed job-result 체계를 보존한다. 화면을 움직이기 위해 서버 Playwright를 새로 호출하지 않는다. Android 직접 조작 시에는 이미 제공되는 \`life_android_execute_computer_action\`, \`life_android_computer_inspect\`, \`life_android_snapshot\`, \`life_job_status\` 원본 포트만 사용한다.

DroidBridge (https://github.com/zephyr7030/DroidBridge, Apache-2.0)는 기술적 참고 자료다. **DroidBridge 코드 자체는 복사하거나 실행하지 않았다.** 따라서 새로운 루트·Shizuku·ADB·원격 MCP 토큰·접근성 권한을 추가하지 않는다.

## 추가 코드
- \`engine.mjs\`: 비활성 기본값의 Android 직접 실행·승인 재사용·기기/세션/화면 바인딩·작업 중복 방지·읽기 전용 원본 작업 상태 조회.
- \`engine.test.mjs\`: 가짜 휴대폰/기존 Secure56 포트로 기능·오류·승인·보안 회귀 검증.
- \`.github/workflows/jh-android-direct-stage1.yml\`: 이 격리 브랜치에서만 Node 테스트 실행.

## 핵심 안전성
1. 원래 Secure56 호스트가 검증한 **현재 기기·세션·명령·오른쪽 화면** 바인딩 필수.
2. 기존 JH 승인 포트가 확인하고 유효한 현장 승인 토큰을 갖춘 경우에만 UI 동작 허용. 새로운 승인을 만들어 주지 않는다.
3. READ에는 기존 읽기 도구만 사용. CLICK/TYPE/SCROLL/KEYPRESS는 원래 Computer Use 도구만 호출.
4. 먼저 operationId를 로컬에 예약하고 실행. 타임아웃·불일치·수신 실패는 효과 **불명**으로 기록하고 자동 재시도 안 함.
5. 원래 작업ID를 조회하는 \`life_job_status\`만 허용. 응답 HTTP 200 또는 휴대폰 \`ok:true\`만으로 완료/업무 성공 주장 안 함.
6. 민감 정보는 기존 JH처럼 휴대폰 쪽에 남기며, 이 모듈의 중복 방지 기록에는 입력 문자열/승인·임대 토큰을 저장하지 않는다.
7. 기존 영속 실행 저널이 장기·재시작 중복 방지의 유일한 안전 근거다. 이 모듈의 메모리 기록으로 대체 금지.

## 현재 확인된 한계
- Android 167 최신 APK의 원본 프로젝트/키에 접근하지 못했으므로 APK 재빌드·실기기 조작·최신 앱 포팅 **미실시**.
- 최근 JH MCP 런타임에 실제 \`readBinding\`, \`authorizeExistingStep\`, \`invokeExistingTool\` 포트를 연결하지 않았음. 기존 서버의 원본 포트 응답을 이 모듈의 서명 확인된 job 구조로 정규화하는 어댑터가 필요함.
- 과거 \`lifehub-android-v6\` 브랜치의 \`BridgeService.kt\`는 원본 기능 참고자료일 뿐, 최신 JH Secure56 앱으로 덮어쓰면 안 됨.
- 앱 패키지 직접 실행은 최신 앱의 확정된 전용 포트가 없어 미지원으로 차단. 기존 \`life_android_open\`은 현재 버전에서 Chrome 웹 링크로 라우팅될 수 있어 앱 실행용으로 재사용하지 않음.
- CLICK/TYPE/SCROLL/KEYPRESS의 실제 승인, 통합 테스트, 화면 변경 검증이 끝나기 전에는 운영 연결 금지.

## 단계별 통과 조건
- **1단계(이번 브랜치)**: 오프라인 단위시험, 보안/중복/세션 불일치, 기존 소스 변경 0건. PASS 시에만 2단계 가능.
- **2단계**: 최신 Android JH 원본에 승인된 접근성 실행부(앱 실행 및 화면 액션) 연결 → 원래 서명 APK 빌드·샌드박스 실기기 검사. SDK와 서명은 원본 빌드 환경에서 재사용.
- **3단계**: JH MCP 기존 Secure56 작업 큐/완료 결과에 후보 어댑터를 **명시적 기능 플래그 OFF 기본값**으로 연결. 비교·실기기 E2E 후 플래그 ON.
- **4단계**: Android 동등성(앱 열기, 오른쪽 화면, 클릭/문자/스크롤, 완료확인, 승인, 로그인 유지, 오류 재개) 전 항목 통과 후 구형 Playwright 호출을 **하나씩 제거**하고 회귀검사.
- **5단계**: 운영에서 별도 Playwright 서버 완전히 미사용임을 확인한 후에만 기존 브라우저 서비스 제거/정리. 운영 배포·서비스 종료는 별도 검증 및 명시적 최종 전환 승인 이후.

**이번 변경은 1단계 코드와 검증만 수행한다.**
