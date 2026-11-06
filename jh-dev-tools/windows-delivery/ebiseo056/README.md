# 이비서 0.5.6 — 표준 오디오 세션 수정

## 정정

0.5.5에서 제안한 발신자 UID·발신 패키지 대조는 이퀄라이저 적용에 필요한 조건이 아니었다. Android 이퀄라이저가 특정 플레이어에 붙는 데 필요한 값은 표준 `ACTION_OPEN_AUDIO_EFFECT_CONTROL_SESSION`이 전달하는 양수 `EXTRA_AUDIO_SESSION`이다. `EXTRA_PACKAGE_NAME`은 대상 플레이어와 앱별 설정을 구분할 뿐 보안 신분증이 아니다.

따라서 0.5.5의 보조 신원 상관관계 설계는 폐기한다.

## 0.5.6 동작

- 정확한 YouTube Music 선언 패키지와 양수 오디오 세션 ID면 표준 EQ 경로를 만든다.
- API 34의 `getSentFromUid()` / `getSentFromPackage()`는 진단 정보일 뿐 EQ 허가 조건이 아니다.
- 곡 제목·장르·알림 미디어 세션은 AUTO 프리셋과 재생 상태를 보완할 뿐 EQ 세션을 허가하거나 폐기하지 않는다.
- 세션 0, 잘못된 선언 패키지, malformed/sticky 이벤트는 거절한다.
- 현재 엔진이 하나만 선택하는 구조에서 여러 양수 세션이 동시에 열리면 모호 상태로 유지한다.
- CLOSE는 같은 세션 ID를 해제한다.
- 앱 실행, 재생, 일시정지, 정지, seek는 하지 않는다.

## 검증

- 휴대 가능한 정책 시험: 132 tests / 3,841 assertions / 실패 0
- 실제 런타임 소스 + 테스트 Android 경계: 15 scenarios / 285 assertions / 실패 0
- Android 어댑터 경계: 26 scenarios / 304 assertions / 실패 0
- 전체 Android 소스 463개 manifest 고정
- versionCode 170 / versionName `jh170-stage77-location-once-native-select-fix3-keepalive-fix1-ebiseo056`
- 전달 스크립트: 원본 인증서만 허용, `adb install -r` 1회, uninstall/data reset/new key/Render deploy/자동 재실행 없음

## 아직 하지 않은 것

현재 실행환경에서는 Windows 전체 Gradle 빌드, 원본 키 서명, 휴대폰 업데이트, 실제 가청 EQ 검증을 수행하지 않았다. 서버 변경은 필요하지 않다. 실제 완료는 versionCode 170 설치 후 YouTube Music 재생 중 `activation.status=ACTIVE`, `applicationVerified=true`, `engineConfirmed=true`, `processingRouteAvailable=true` readback으로만 확정한다.
