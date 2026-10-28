# 폴더블 Android 네이티브 빌드 후보 (원본 APK 통합 전)

이 디렉터리는 **Android Library (AAR) 독립 컴파일 전용**입니다. 별도 앱/APK를 만들지 않고, 휴대폰 설치·서명·배포를 하지 않습니다.

- Kotlin 원본은 \`jh-server/owner-setup/android-direct/FoldableWindows.kt\`와 \`FoldLeftWebLink.kt\`를 직접 참조합니다.
- \`FoldableWindows.kt\`는 왼쪽 Chrome/삼성 인터넷, 오른쪽 GPT의 서로 다른 Android 접근성 창을 식별합니다.
- \`FoldLeftWebLink.kt\`는 **기존 Secure56가 승인하고 저널에 기록한 \`open_url(left_web_link)\` 명령이 전달되었을 때만** 호출할 수 있는 helper입니다. 이 helper는 인증/서명/승인/저널을 제공하지 않습니다.
- \`startActivity()\`가 예외 없이 반환되어도 실제 웹 주소·페이지·분할 화면 보존을 검증했다고 주장하지 않습니다.
- Android API에 따라 백그라운드 Activity 실행이 거부될 수 있으므로, 실제 갤럭시에서 시험해야 합니다.
- **최신 JH167 원서명 APK 소스, Secure56 명령 디코더, 실제 폴더블 E2E 테스트가 확보되기 전에는 운영에 배포 금지.**
- 이 Kotlin 파일은 DroidBridge / Android large-screen 예제를 참고한 독립 구현이며 원본 코드를 붙여넣지 않았습니다.

격리 컴파일:
\`\`\`
gradle -p android-fold-candidate :library:compileDebugKotlin --no-daemon
\`\`\`
