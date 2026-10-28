# JH167 단일 Android 실행 라우터 — 3단계 격리 개발

## 목적
현재 GPT/JH의 Playwright 웹서버와 Android Computer Use를 각각 고르는 사용 경험을 **하나의 Android Secure56 실행 경로**로 통합한다. 폴더블 펼친 화면에서 **왼쪽 웹·오른쪽 GPT**가 기준이다.

## 추가된 후보
- \`unified-route.mjs\`: OPEN_WEB, OBSERVE, PREPARE_UI, EXECUTE_UI, STATUS_UI, STATUS_OPEN, CANCEL_UI, OPEN_APP (미지원 차단) 모두 하나의 실행 진입점 \`run()\`을 사용
- \`resolveAndroidWebTarget()\`: 네이버 메일 등 확인된 사이트 이름 또는 명시된 HTTPS URL만 처리. 검색 결과·사이트의 임의 지시를 실행 대상으로 사용하지 않음
- 모든 조작은 2단계의 **기존 Secure56 host adapter**와 기존 phone-local 승인/저널 사용. Playwright/BROWSER_MCP 재호출·로그인 프로필 복사·ADB 없음
- 기존 Playwright 브라우저 서버, JH 운영 MCP 등록 및 Android APK는 **전혀 변경하지 않음**

## 중요한 실제 제약 — 반드시 지킬 것
- 현재 휴대폰에 **서명 완료된 \`LEFT_WEB_LINK_V1\` 기능 보고**가 없으면 OPEN_WEB이 \`SIGNED_PHONE_LEFT_WEB_CAPABILITY_REQUIRED\`로 차단됨
- 기존 \`open_url target=right_web_link\`를 \`left_web_link\`로 이름만 바꾸어 실행할 수 있다고 **가정하지 않음**
- 최신 JH APK에 Android 실제 왼쪽 브라우저 Intent 처리 및 새 분할 화면/URL 서명 결과가 구현되어야 기능을 켤 수 있음
- 앱 열기(\`OPEN_APP\`)는 별도 검증된 좌측 앱 어댑터가 없으므로 무작정 Chrome/Playwright 대체로 실행하지 않음
- 외부 장치가 \`ok:true\`라고 보고한 것만으로 사이트 주소·업무 완료로 판정하지 않음. **별도 서명된 주소 확인/화면 readback**이 있어야 화면 주소까지 확인된 것으로 분류
- 폴더블 창 전환·명령/세션 교체·재시작·승인 누락에는 기존 작업을 재실행하지 않음. \`STATUS_OPEN\`은 **기존 작업 ID 조회만 수행**
- 다른 MCP 도구의 사용/Playwright 의존 삭제는 APK+실기기 동등성 확인 뒤에만 수행

## 단계 게이트
1. 지금: 하나의 UI 라우터 + 가상 Android 응답으로 자동검증 (운영 반영 없음)
2. 다음: 최신 서명된 APK 원본에 \`LEFT_WEB_LINK_V1\` 및 주소 검증 구현, 실제 폴더블에서 창 위치 유지 확인
3. 실제 JH owner runtime 포트에 UI 라우터를 장착한 **검증용** MCP tool/feature flag; 기존 Secure56 원본 유지
4. 실기기에서 브라우저 열기→클릭→입력→결과확인 E2E와 승인·완료 응답 테스트
5. 최종 인수/롤백 확인 후에만 브라우저 선택 경로와 별도 Playwright 실행 서버 제거

오픈소스 참고: https://github.com/android/large-screen-codelabs · https://github.com/zephyr7030/DroidBridge (기술 검토; 원본 코드 복사 없음).
