# JH167 · 폴더블 펼침 / 왼쪽 웹 · 오른쪽 GPT (후보)

## 요구 배치
- 펼친 내부 화면에서 **왼쪽 = Chrome 또는 삼성 인터넷**, **오른쪽 = ChatGPT Android 앱**
- Playwright 서버의 별도 브라우저는 사용하지 않음
- 기존 JH 인증·원래 Secure56 job·로컬 승인·저널·분할 화면·GPT 대화 유지

## 실제 확인된 GitHub 참고자료
1. Google Android large-screen codelabs: https://github.com/android/large-screen-codelabs (Apache-2.0, WindowInfoTracker/WindowManager/FoldingFeature)
2. Microsoft Surface Duo WindowManager samples: https://github.com/microsoft/surface-duo-window-manager-samples (MIT, **archived**, 참고용)
3. DroidBridge: https://github.com/zephyr7030/DroidBridge (Apache-2.0, 실제 AccessibilityService 기기 조작 방식 참고)

Open-source 원본을 실행/통째로 복사한 것은 아닙니다. 핵심 개념을 JH의 기존 코드를 보존하는 새 후보 모듈로 구현합니다. Google의 Jetpack WindowManager는 대체로 **자기 앱의 창 안에서** 폴더블 접힘/레이아웃을 관찰합니다. 별도 Chrome/ChatGPT **두 앱 창을 감지**하려면 \`AccessibilityService.windows\` / \`FLAG_RETRIEVE_INTERACTIVE_WINDOWS\` 가 더 적합합니다.

## 보호
- 새 코드는 브라우저가 왼쪽인지, GPT가 오른쪽인지 **서명된 현재 화면 증거**의 전체 화면 좌표와 실제 패키지 ID로 확인.
- 오른쪽 GPT 및 가운데 분할선을 누르지 않도록, 클릭/스크롤 좌표가 왼쪽 웹 창 내부인지 확인. \`viewport_width\`와 \`viewport_height\`는 기기 **전체 화면 좌표계**를 요구. 창별 로컬 좌표는 임의 변환 금지.
- 창 위치 변경/회전/접힘/화면 크기 변경 후 기존 화면 증거는 무효. 다시 확인 전 실행 금지.
- TYPE/KEYPRESS는 왼쪽 브라우저의 포커스된 편집 노드를 서명된 접근성 화면에서 확인한 경우에만 승인 준비. 휴대폰 발급 임대·승인도 별도로 필요.
- 화면에 두 앱이 보인다는 사실 **만으로** 기기가 완전히 펼쳐졌다고 주장하지 않음. AndroidX WindowManager에서 실제 \`FLAT\`로 보고된 경우만 별도 표기.
- 기존 좌 GPT/우 작업 화면은 레거시 모드로 유지, 이번 신규 좌 웹/우 GPT는 **명시적인 단독 모드**로 선택. 앱 역할을 자동 추측하거나 임의 뒤집기 금지.
- Kotlin \`FoldableWindows.kt\`는 최신 APK 원본에 아직 합치지 않은 **소스 후보**. 여기서 나오는 내용은 Secure56 서명 증거가 아니며, 보안 우회용으로 사용하지 않음.

## 자동 테스트와 미완료 범위
- GitHub Actions로 가상 폴더블 창 경계, 좌우 역전, 분할선 이동, 브라우저 패키지, GPT 창 보호, 포커스, 오래된 화면, 레거시 경로를 확인.
- 최신 JH167 Android 원본 ZIP 접근 및 원래 서명키 환경이 확인되지 않아 실기기 배포/설치/동작 검증 **아직 불가**.
- WindowInfoTracker와 최신 Android 앱의 폴드 상태 연결도 아직 미통합. 실제 폰에서 제공하지 않는 \`foldPosture\` 값을 임의로 생성하지 않음.
- 테스트 통과로 운영·실기기 성공을 주장하거나 운영 Playwright 서비스를 제거하지 않음.
