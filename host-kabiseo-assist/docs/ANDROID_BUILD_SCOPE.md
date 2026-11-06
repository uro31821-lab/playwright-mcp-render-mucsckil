# 카비서 v0.6 Android 읽기 전용 빌드 후보

이번 변경은 원래 v0.5 ZIP의 Android 화면 검사기와 JH 연결용 진입점 두 파일을 기존 GitHub 읽기 전용 코어와 연결한 것입니다. 현재 설치된 JH 서비스에 등록하거나 실행하는 작업은 아닙니다.

## 정확한 빌드 범위
- Java 코어: CameraSurfacePolicy, CameraMetadataRoute
- Android: CameraSurfaceInspector, JhCameraMetadataEndpoint
- JDK17 / Gradle8.9 / AGP8.7.3 / compileSdk35 / minSdk34
- 산출물은 Android 라이브러리 AAR와 종속 코어 JAR입니다. APK가 아니며 단독 설치할 수 없습니다.
- AAR만 복사하면 코어 종속성이 빠집니다. 실제 호스트에는 두 Gradle 모듈을 프로젝트 종속성으로 연결해야 합니다.
- GitHub CI는 실제 Android API 컴파일, assembleDebug, lintDebug, 결과 AAR/manifest 검사를 수행합니다. 실행 로그 확인 전에는 빌드 성공으로 표시하지 않습니다.

## 변하지 않은 경계
서비스/화면/권한 추가 없음. 카메라 직접 열기, 사진 픽셀/대화 본문 읽기, 제스처, 자동 촬영·첨부·전송, 얼굴/몸매 보정, Chrome 전환 없음. 기본 Host는 거부합니다. 현재 JH 인증/승인을 통과하는 전용 경로의 실제 연결은 남아 있습니다. 기존 분할 화면 보호를 우회하거나 전역으로 끄지 않습니다.

자동 확대, 원상복원, 온디바이스 장면 분석 및 나머지 Android 모듈은 이번 4파일 빌드 범위 밖입니다. 기존 사용자 수동 시험을 자동 작동 증명으로 사용하지 않습니다. 기존 설치 APK와 서버 배포는 변경하지 않습니다.

## 사용자가 할 일
현재 없음. PC에서 빌드하거나 과거 APK를 설치하지 않습니다. 실제 호스트 병합과 실기기 확인이 필요한 시점에만 필요한 한 단계로 안내합니다.
