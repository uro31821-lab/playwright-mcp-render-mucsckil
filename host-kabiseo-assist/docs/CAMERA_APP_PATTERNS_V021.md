# 카비서 v0.21 — 일반 카메라 앱에서 가져올 구조와 남는 경계

## 사용자 요청 / 결론
사용자는 이미 존재하는 카메라 앱을 REA로 분석해 그 방식을 가져오라고 요청했다. 기존 앱의 검증된 구조를 먼저 참고하는 방향으로 전환한다. 카메라 화면 식별검사 수를 늘리는 것과 카메라 제어 기능이 생기는 것은 다르다.

이번 실제 방법은 **공개 Kotlin 소스 직접 확인**이다. **REA APK 분석은 실행하지 않았다.** 현재 연결된 `devtools/jh-rea-runner`는 JH 저장소의 JS/MJS/CJS 1~32개만 처리하며 `analyze-javascript-application`을 실행한다. Kotlin/APK/JADX 경로는 연결되어 있지 않다. REA 본체의 Android 분석 기능과 현재 연결된 실행기의 지원 범위를 구분한다. 현재 Node 보안 REVIEW를 다른 브랜치/Node24 실행으로 우회하지 않았다. 상용 앱의 APK, 비공개 코드, 모델 가중치를 취득하거나 복제하지 않았다.

## 실제 읽은 출처 (커밋 고정)
### Google Jetpack Camera App — Apache-2.0
Repo https://github.com/google/jetpack-camera-app
Commit `c38310e4902350a8c6b58e4729e60e94e51c8e09`
- `core/camera/src/main/java/com/google/jetpackcamera/core/camera/CameraSessionSettings.kt`, blob `55c5f87c1a01b08c6be0e1dc9108df12b1d0aa1c`: 지속 세션 설정과 촬영 중 변경 가능한 설정 분리. 배율/플래시 등의 일시 변경은 보통 전체 use-case 재바인딩을 요구하지 않는다.
- `core/camera/src/main/java/com/google/jetpackcamera/core/camera/CameraSession.kt`: 세션 생성, 렌즈 변경, 실제 CameraInfo 상태 관찰과 CameraControl 적용 경로를 확인했다. 파일의 조회된 부분만 사용했으며 전체 앱 실행/전체 소스 감사를 주장하지 않는다.
### GrapheneOS Camera — MIT
Repo https://github.com/GrapheneOS/Camera
Commit `025cb421366cd322d64d2044481c014c6468ed1a`
- `app/src/main/java/app/grapheneos/camera/util/CameraControl.kt`, blob `57a19ea27dd57159a4832a56aa95fb82557d82ba`: 기기 ZoomState의 min/max로 목표배율을 제한하고 실제 camera.cameraControl에 전달한다.
- `app/src/main/java/app/grapheneos/camera/ui/seekbar/ExposureBar.kt`, blob `1b22d4d20a19a5b1b42ac8d38afa1f28aa1b0781`: ExposureState의 범위/인덱스를 읽고 setExposureCompensationIndex로 적용한다. 전체 구현을 복사하지 않았으며 해당 파일의 모든 수식이 옳다고 인증하지 않는다.
- `LICENSE`, blob `d583e45ea23d40724555f2f2c46445bd238ae84f`: MIT 조건 확인.
### Android 공식 계약
- https://developer.android.com/media/camera/camerax/configuration
- https://developer.android.com/reference/kotlin/androidx/camera/core/CameraControl
- https://developer.android.com/media/camera/camera-intents

## 재사용 판단
1. `CameraInfo`/노출 범위로 지원 기능을 확인한다. 카메라 모델명만 보고 렌즈/노출/조명 지원을 추정하지 않는다.
2. 임시 조절과 영구 설정을 분리한다. 카비서는 사용자 기본 설정을 저장소에 덮어쓰지 않는다.
3. 요청한 값, UI가 먼저 표시한 값, 비동기 적용 완료를 구분한다. CameraX ZoomState의 낙관적 갱신만으로 실제 적용 완료라고 할 수 없다.
4. 카비서 요구에 맞게 촬영 전 원래 값 스냅샷과 변경분 기록을 추가한다. 카메라 종료에 따른 CameraX 기본값 복귀는 사용자 원래 값 복원의 증거가 아니다.
5. 원래 값 복원은 같은 세션이 살아 있을 때, 닫기/해제 전에 수행하고 확인한다. 닫힘/렌즈교체/폴더블 화면 변경/수동 재조절/미확정 완료를 성공으로 덮어쓰지 않는다.

## 이번 새 코드
`tools/kabiseo-camera-session/CameraSettingsSession.java`는 위 개념을 독립 구현한 **배율·노출 인덱스·토치 임시설정/복원 계획기**다. 외부 앱 코드를 그대로 복사하거나 새 카메라 라이브러리를 앱에 넣지 않았다. Android/네트워크/파일/화면조작 API 없이 JVM에서 검증한다.

계획만 생성하며 실제 driver나 승인 공급자가 아니다. 실행/서명/원래 승인, 정확한 화면 판별, 실제 settled readback은 기존 JH와 별도 실제 어댑터 책임이다. `OWNED_CAMERA_API`, `VERIFIED_HOST_UI`, `READ_ONLY`를 구분하며, HOST_UI라는 표기만으로 직접 CameraX 권한이 생기는 것은 아니다. 읽기 전용/값을 읽을 수 없음/원상복원 불가 기능은 변경안을 내지 않는다. focus, 사진 flash 모드, 셔터, 사진 첨부·전송은 범위 밖이다. 자동 이미지 분석/구도 AI도 이번에 새로 구현하지 않았다.

예: 측정된 원래값 zoom1.5 / exposureIndex-1 → 임시2.0 / +1 → 복원1.5 / -1. 1x/0으로 일괄 초기화하지 않는다. 허용범위 초과는 명시적 clamped 계획으로 표시한다. 진행 중인 계획 재발급·미확정 자동 재시도는 하지 않는다.

## GPT 촬영 화면에 대한 결정
일반 CameraX 앱은 자신이 소유한 camera session을 제어한다. 이를 가져와도 GPT가 소유한 세션이 자동으로 넘어오지 않는다.
- GPT가 시스템 카메라 Intent로 위임하는 경로라면 별도 capture Activity 통합 가능성을 확인할 수 있으나, 실제 GPT의 호출 방식/명시적 대상 지정 여부를 확인하지 않았다.
- GPT 내부 자체 촬영이라면 접근성으로 실제 노출된 조작만 제어 가능하다. 숨겨진 센서 설정을 CameraX로 강제로 바꾸거나 다른 앱 코드에 주입하지 않는다.
- 사용자 요구인 기존 GPT 촬영흐름은 유지한다. 별도 카메라 화면/앱으로 전환하기로 결정하지 않았다. ChatGPT 기본 카메라를 교체했다고 말하지 않는다.

**우선 미완료 과제는 실제 GPT 촬영이 내부 세션인지 외부 Intent 위임인지, 배율/노출/원래값 읽기가 어떤 방식으로 제공되는지 확인하는 것**이다. 이 확인 없이 프로필 수집·승인 도구만 계속 늘려서는 핵심 기능이 완성되지 않는다. 최소 승인된 관찰 세션으로 이 적합성부터 판정하고, 노출되지 않은 기능에는 자동 지원 약속을 하지 않는다.

## 보안·배포
외부 자료는 읽기만 했고 APK/라이브러리/서명키·바이너리는 가져오지 않았다. 기존 Node runtime-policy의 REVIEW/executionAllowed=false는 그대로다. 기존 앱/서버/원본 서명/승인 경계도 변경하지 않았다. 새 코드 시험은 완료 로그를 읽은 뒤 별도 결과 기록에 연결한다. 사용자 파일 재첨부·앱 재설치·기존 손가락 확대 시험 반복을 요구하지 않는다.
