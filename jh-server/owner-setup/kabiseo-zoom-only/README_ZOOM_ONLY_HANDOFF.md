# JH228 카비서 — AI 크기 조절을 유한한 줌인/줌아웃으로 대체 (개발 후보)

## 최종 사용자 기준
- 사용자가 앞으로/뒤로 움직일 수 없고 **화면 속 피사체 크기만** 바꾸려면 GPT는 줌 변경을 먼저 검토한다.
- 위·아래·좌·우·사선·회전 및 **원근·배경거리·시점 변화**는 실제 촬영자가 카메라를 움직여야 하며 줌만으로 대체하지 않는다.
- 기본 상대 크기: 조금 크게 1.15배, 더 크게 1.25배, 조금 작게 0.85배, 더 작게 0.75배.
- 현 CameraX 지원배율과 최대 2배 품질 상한을 넘거나 최소 줌 아래로는 **거짓 적용 없이 이동 안내**.
- 사용자가 직접 바꾼 줌이 최우선. AUTO 대기/촬영·저장 중에는 자동 재설정 금지.

## 실제 앱 소스 후보
사용자가 올린 `JH228_KABISEO_V2_BUILD_ONLY_ROUTE_GUARD_PATCH_20261121.zip`의 **638개 Android 원본**을 기준으로:
- `MainActivity.kt`에 기존 Secure56 `life_android_camera_goal_v1` AP​PLY 경로의 **zoom-only goal** 승인/명령 원장/CameraX setZoomRatio 호출/독립 STATUS readback만 추가함.
- `BridgeService.kt`에서 이전에 사용자가 제외한 ChatGPT → 오른쪽 카비서 JPEG 자동 다운로드를 명시적으로 차단.
- `V2SubjectSizeZoomPolicy.java` 신규로 배율 제한/원근 변경·수동 override·AUTO busy·stale status 판단.
- **원본 638→639 파일, 변경 2개 + 신규 1개**. 카메라 AUTO/프리즈/셔터/저장, 화면 격자·수평계 코드 원본 보존.
- **별도 API/서버 확장/자동 이미지 생성 업로드/원격 AUTO 없음.**

이 PR은 Android source ZIP을 자동 설치하지 않는다. 전체 소스와 `SOURCE_LOCK.json` 포함 다운로드 패키지 `JH228_KABISEO_ZOOM_ONLY_NO_IMAGE_BUILD_20261122.zip`은 작업 대화에 첨부되어 있으며, 현재 운영 JH227에 적용되지 않았다.

## 실제 확인된 검사 vs 미완료
- 로컬 Java 정책: 8,000개 다양한 정량 난수 케이스 + 경계/예외, 실제 `javac` 컴파일; Node 호스트 플래너 13/13 PASS. **독립 프로세스 100회씩 PASS**.
- Android 소스 639개 SHA lock, 원본 변경 경계 35/35 검사 PASS. ZIP 내용 658개/sha 모두 확인.
- **미실행**: Android Gradle 전체 빌드/실기기 설치·서명/사용자 AUTO 촬영/Render LIVE 배포.
- 실제 현재 JH227에는 새 zoom-only protocol이 없으며, **운영 Secure56 호스트의 새 goal wire 허용/STATUS에 대한 실기기 readback도 미검증**. 서버가 이를 이해한다고 가정하지 않는다.
- 다운로드한 것은 JH228 **빌드 전용 후보**. 설치·자동수정·API 호출 아님.

## 프로토콜
`JH_CAMERA_V2_ZOOM_ONLY_V1`은 숫자·서명된 현재 작업/세션/오른쪽 창/지원 zoom metadata를 요구하고, photo/JPEG/URL/lease를 허용하지 않는다. `apply`의 pending은 성공이 아니며 `status.zoomOnlyStatus=APPLIED_VERIFIED`가 실제 CameraX ratio로 재조회될 때만 성공. 명령 재발급/자동 재시도 금지.

## 격리
이 PR은 사용자 취소한 이미지 자동전송 PR #202 또는 별개 왼쪽 GPT 프롬프트 PR #203을 병합하지 않으며 **Draft 상태**로 유지한다. 기존 JH Secure Live 플러그인, JH227 설치본, Render LIVE 커밋, 원본 인증서/이미지 원장은 변경하지 않는다.