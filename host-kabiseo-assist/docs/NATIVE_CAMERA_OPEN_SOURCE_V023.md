# 카비서 v0.23 — 자체 안드로이드 카메라 오픈소스 차용 보고서

## 사용자 목표
ChatGPT 사진 전송은 필요하지 않다. 기존 JH 안에서 카비서 촬영을 명시적으로 시작하고, 촬영 중 자동 카메라 처리 후 휴대폰 갤러리에 저장한다. 사용자 요청 없이 카메라를 열거나 자동 셔터를 실행하지 않는다.

## 실제 조사 — canonical 원본과 코드를 확인함
- Android Camera Samples: https://github.com/android/camera-samples/tree/main/samples/camerax-luminosity
  tree 154c954abc5c80dddf07d264319cf89a3e1ccda9.
  CameraXLuminosityController.kt의 ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST, Y 평면 밝기 측정, finally ImageProxy.close를 확인. 파일 Apache-2.0 헤더. JH FrameLuma.java와 Activity analyzer는 이 설계를 독립 구현하되 AI로 오인시키지 않음.
- GrapheneOS Camera: https://github.com/GrapheneOS/Camera
  commit 025cb421366cd322d64d2044481c014c6468ed1a, MIT.
  util/CameraControl.kt는 ZoomState의 min/max 범위 내에서 zoomRatio를 적용. ui/seekbar/ExposureBar.kt는 ExposureState의 보정 index를 조절. JH SubjectFramingPolicy는 기기별 zoom 범위와 안정 검출 횟수/쿨다운/가장자리 보존을 독자적으로 계산. 원본 소스 복사하지 않음.
- Google Jetpack Camera App: https://github.com/google/jetpack-camera-app
  commit c38310e4902350a8c6b58e4729e60e94e51c8e09, Apache-2.0.
  core/camera/CameraSessionSettings.kt, FocusMetering.kt에서 카메라 수명주기·세션 설정·AF 비동기 관리 원리 확인. 사용 중인 기존 GPT CameraX 인스턴스를 외부에서 제어한다는 전제는 폐기.
- Google MediaPipe Samples: https://github.com/google-ai-edge/mediapipe-samples
  commit 90e4a0e8f162e20dcf1df7c688d30b9b1dbe3370, Apache-2.0.
  examples/object_detection/android/app/src/main/java/com/google/mediapipe/examples/objectdetection/ObjectDetectorHelper.kt에서 온디바이스 물체 경계 박스 입력, 옵션, LIVE_STREAM과 CPU/GPU 초기화 주의 사항 확인. 모델 자체와 추가 라이브러리는 아직 받아오거나 연결하지 않음.
- Open Camera: https://opencamera.sourceforge.io/
  공식 자동수평/구도선/히스토그램/포커스 보조 등 기능 검토. GPLv3-or-later 원본 코드 복제/포함 제외. JH 기존 소스 공개범위와 GPL 의무가 확인될 때만 다시 평가.
- CameraX Extensions Android 공식: https://developer.android.com/media/camera/camerax/extensions-api
  **중요: ExtensionMode.AUTO는 기기에 따라 FACE_RETOUCH 효과를 자동 선택할 수 있어 사용자의 얼굴·몸매 보정 제외 조건과 충돌합니다. 따라서 AUTO를 금지하고 일반 CameraX AF/AE/AWB로 시작합니다. 밝기 샘플이 400ms 간격으로 5회 지속 LOW_LIGHT일 때만, 제조사에서 NIGHT 확장을 지원하면 NIGHT를 1회 적용합니다. 야간 모드 실패 시 원래 CameraX로 복귀하며 무한 재시도/모드진동 금지.** 2026-11-01부터 1.5 이하 extension 지원이 일부 기기에서 감소하여 CameraX 1.6.2 안정판으로 pin.

## 이번에 직접 작성한 JH 후보
- host-kabiseo-assist/capture Android library 모듈 선언 및 비공개 Activity.
- 실제 CameraX Preview/ImageCapture, 카메라 권한 요청, 터치 초점, 3분할 구도선, **기본 AF/AE/AWB + 조건부 야간 NIGHT 확장** (AUTO/얼굴보정 선택 금지), 유효한 촬영 버튼 입력 시 DCIM/JHCamera 갤러리 저장. 카메라 종료 후 이전 JH 앱 화면 복귀.
- FrameLuma.java: 보정 가능한 자동 AI와 구분하는 밝기 힌트. 프레임은 메모리에서만 처리, finally 닫음.
- SubjectFramingPolicy.java: 실물 추론 모델 출력이 있을 경우에만 제한된 자동 확대 제안(4연속 안정·기기 범위·가장자리 보존·매뉴얼 우선). 현재 **모델/추론/실제 자동줌 동작은 미연결**. 정책 코드는 물리적으로 카메라를 움직이지 않음.
- Android Activity는 android:exported=false. Manifest 권한 CAMERA 하나. 카메라 촬영/갤러리 저장을 위해 Android 10 이상만 정상 지원; 기존 앱의 minSdk26을 높이지 않는다.
- GPT 앱으로 사진 자동 전달, 인터넷/위치/음성 권한, 백그라운드 촬영, 무단 화면 접근, 리모트 명령 우회, 자동 셔터, 얼굴·몸매 보정 없음.

## 보안·릴리스 경계
- 공식 오픈소스 저장소의 공개 소스를 조회했고 전체 앱 바이너리·APK·모델은 복사하지 않았음.
- 새 Google Maven 의존성 CameraX1.6.2 / Activity1.10.1은 Gradle에 버전 선언한 상태. 종속 binary의 해시·서명·AV·SBOM/취약점 검사가 아직 없어 securityGateVerdict=REVIEW. 실제 JH 릴리스 빌드·서명·설치·서버 배포 금지.
- CI는 JDK17 순수 Java Policy/FrameLuma 테스트와 source/manifest static 검토. 이것을 Android 빌드나 실물 촬영 검증이라고 부르지 않는다.
- 기존 JH Android Bridge/Secure56/원본 서명/Node REVIEW hold를 보존. 기존 JH 앱에 capture Activity 호출부를 등록하거나 실제 기기에 설치하지 않음.

## 다음에 필요한 검증
1. 새 AndroidX 패키지 공급망·현재 JH 앱 dependency graph·빌드 도구/SDK 호환성 검증.
2. 보안 게이트 통과 후 기존 실제 JH source에 연결해 Android assemble/lint, 서명/승인/설치를 검증.
3. 휴대폰에서 모드 지원, 미리보기, 촬영, DCIM 저장, 원래 JH 화면 복귀를 직접 검증.
4. MediaPipe 모델 자체의 출처/배포 라이선스와 기기 추론 성능을 확인한 뒤 탐지 결과를 프레이밍 로직에 연결하고 실제 자동 확대 E2E를 별도 시험.

결론: 공개 소스 기능은 선택적으로 참조해 **실제 CameraX Activity 후보 코드**를 작성했으나 Android 컴파일/실사용·온디바이스 객체 인식은 아직 완료되지 않았다.

## 얼굴 보정 제외 안전 변경 — 2026-11-07
Android 공식 ExtensionMode API는 기기 AUTO가 FACE_RETOUCH를 선택할 수 있음을 설명합니다: https://developer.android.com/reference/androidx/camera/extensions/ExtensionMode. 따라서 초기 후보의 AUTO 사용은 부적절했고, 코드에서 명시적으로 제거했습니다. 안정적인 어두운 장면에서 NIGHT만 지원 여부를 검증해 한 번 적용, 그 외에는 CameraX 기본 AE/AF/AWB가 작동합니다. 기기별 Night 실제 결과는 아직 시험하지 않았고, **'AI가 촬영한 사진을 항상 더 예쁘게 만든다'는 효능은 검증되지 않았습니다.** 구도선/밝기 분석은 비AI, 자동 피사체 확대는 모델 및 액추에이터 미연결입니다.
