# 이비서 0.5.5 — 발신자 신원 미공유 호환 수정

## 실제 실패

운영 휴대폰에서 이비서 상태 조회·곡 메타데이터·알림 접근·켜짐 저장은 정상이나, YouTube Music의 표준 AudioEffect OPEN 발신자가 API 34 신원 공유를 사용하지 않아 `SENDER_IDENTITY_UNAVAILABLE`로 차단됐다. 이 때문에 `verifiedSessionPresent=false`, `processingRouteAvailable=false`, `engineConfirmed=false`였다.

빈 장르 정보는 평탄 프리셋 선택 사유일 뿐 세션 연결 실패 원인이 아니다.

## 수정 원칙

1. OS가 발신 UID와 패키지를 제공하면 기존처럼 둘을 정확히 대조한다.
2. 둘 중 하나라도 제공됐는데 불일치하면 즉시 차단하며 보조 경로로 내려가지 않는다.
3. 둘 다 제공되지 않은 표준 AudioEffect 방송에 한해 아래를 모두 만족할 때만 연결한다.
   - 선언 패키지가 정확히 `com.google.android.apps.youtube.music`
   - PackageManager로 로컬 확인한 설치 UID가 기대 UID와 일치
   - 알림 접근으로 확인한 현재 로컬 YouTube Music 세션이 정확히 1개
   - 원격 재생이 아니며 오디오 세션 ID가 양수
4. 이후 OS 신원이 포함된 OPEN이 오면 기존 세션의 권위를 상향한다. 보조 경로가 신원 검증 경로를 낮추지는 못한다.
5. CLOSE도 같은 권위 검사를 통과해야 하며, 불명 발신자가 기존 세션을 해제할 수 없다.

## 검증

- 순수 정책: 140개 / 4,128 assertions / 실패 0
- Android 런타임 계약: 16개 / 301 assertions / 실패 0
- Android 경계: 26개 / 304 assertions / 실패 0
- 앱 사본과 모듈 원본 바이트 일치
- versionCode 169 / versionName `jh169-stage77-location-once-native-select-fix3-keepalive-fix1-ebiseo055`
- PowerShell 정적 구조·단일 `adb install -r`·새 키 생성/삭제/초기화 금지 확인

## 아직 하지 않은 것

현재 Linux 실행환경에는 전체 Android Gradle 배포 도구가 없어 전체 Gradle 빌드·원본 키 서명·휴대폰 업데이트·실제 가청 EQ 검증은 수행하지 않았다. 서버 변경은 필요하지 않으며 자동 재실행도 허용하지 않는다.

이 PR은 #174의 0.5.4 전달 후보를 대체하는 검토용 초안이다. 실제 전체 Android 소스와 APK는 사용자 로컬 전달물에서 관리하며 이 저장소에는 패치와 검증 근거만 둔다.
