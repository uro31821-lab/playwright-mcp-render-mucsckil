# JH167 Playwright 폐기 전 기능 보존 점검 (2026-10-28)

**결론: 지금은 Playwright를 종료하거나 소스를 삭제하면 안 됩니다.** 폴더블 Android 실행 후보의 가상 검증과 Kotlin 컴파일은 성공했지만, 현재 사용자 휴대폰의 원서명 JH APK에는 아직 그 코드가 통합되지 않았습니다.

이 작업에서는 GitHub 원본에서 다음 의존을 확인했습니다.

| 기존 의존 | 새 체계의 목표 | 검증 상태 |
|---|---|---|
| \`life_open_service\`·\`life_naver_mail\` | 휴대폰 **왼쪽 웹** 열기 | Android 기기 실검증 전 |
| \`life_web_navigate/snapshot/click/type/select/press_key/wait/back/screenshot\` | 단일 Android UI·접근성 도구 | 일부 가상검증만 |
| \`life_choice_collect\`, General Work의 \`life_web_navigate/snapshot\` 호출 | Android 화면 읽기·선택·합계 | 현재 JH 실제 연결 미전환 |
| \`payment-runtime-patch.mjs\` 웹 이동·스냅샷 | 실제 휴대폰 결제 페이지와 원래 승인 유지 | **미전환** |
| \`payment-browser.mjs\`의 \`browser_evaluate\` | 동일 수준 검증 가능 여부 별도 확인 | **미전환 — 주요 차단 요인** |
| 동영상·유튜브·기타 분리된 실행 기능 | Playwright 제거 시 영향 없음 또는 대체 검증 | 추가 검증 필요 |
| 기존 RIGHT 웹·LEFT GPT 분할 화면 | 신규 LEFT 웹·RIGHT GPT로 전환 | 가상 57/57 통과, 실기기 미확인 |

**사용자는 앞으로 Playwright와 Computer Use 중 하나를 선택하지 않는 구조**가 목표지만, 실제 기능을 제거하는 마지막 작업은 원서명 APK 실기기 동등성 및 위 연관 기능들이 확인된 뒤에만 해야 합니다.

기술 제약:
- \`browser_evaluate\` 등의 브라우저 스크립트 실행은 Android 접근성 서비스의 클릭·입력 기능과 동일하지 않습니다. 단순 치환 금지. 지원 가능한 도구/공식 제공자 API/수동 검증 경로를 검토해야 합니다.
- 신뢰된 기기 승인·암호/OTP 분리·결제 승인·작업 중복방지·같은 명령의 검증된 완료 응답은 필수 조건.
- 자동 배포, Playwright 종료, Render 디스크 해지, APK 서명키 생성/교체를 하지 않습니다.
- \`cutover-audit.mjs\`의 결과는 **읽기 전용 점검**이며, 체크리스트를 채워도 자동 배포를 승인하는 프로그램이 아닙니다.
