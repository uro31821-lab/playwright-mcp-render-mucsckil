# 카비서 v0.34 — CameraX 1.4.2 하향 후보의 공개 클래스·메서드 호환성 검증

## 이번 확인
v0.33의 독립 Gradle 조사에서 `CameraX 1.4.2 + Kotlin 표준 라이브러리 1.9.24`가 선택됐던 증거는 **재사용**하고 반복하지 않았다. 새 검사에서는 실제 Google Maven 공식 저장소의 CameraX **1.4.2 및 1.5.2 각 4개 AAR**을 내려받아 체크섬(발행자 sidecar)·압축 CRC·경로 무결성을 확인한 뒤, *클래스를 실행하지 않고* classfile ABI(공개/보호 접근 메서드 시그니처)를 비교했다.

- 1.4.2 구성의 클래스: 1,030개
- 1.5.2 구성의 클래스: 1,144개
- 1.5.2에만 나타나는 공개 멤버 시그니처: 299개. 상당수가 내부·확장 API이지만 전체 항목을 무시할 수 없으며, 실제 v0.24.2 소스에 사용되는지 여부가 출시 조건이다.
- 기본 카메라 관련 미리 선택된 이름(초점, 줌, 노출, CameraProvider lifecycle, ImageCapture, ImageAnalysis, PreviewView)의 **1.4.2에서 완전히 누락된 이름: 0**.

이름만 비교하지 않고 *정확한 JVM 메서드 서명*을 비교했을 때, 미리 정의한 주요 카메라 API에서 **1.5.2에만 존재하는 형태 3개**가 확인됐다.

| newer-only API 시그니처 | 1.4.2 대응 |
|---|---|
| `ImageCapture.takePicture(OutputFileOptions, OutputFileOptions, Executor, OnImageSavedCallback)` | 이 4인자 형태 없음; 구형 3인자 형태 사용 여부를 private 소스로 대조해야 함 |
| `ProcessCameraProvider.bindToLifecycle(LifecycleOwner, CameraSelector, SessionConfig)` | 이 SessionConfig 형태 없음 |
| `ProcessCameraProvider.unbind(SessionConfig)` | 이 SessionConfig 형태 없음 |

**주의:** 검사에 사용한 expected API 이름은 공개 CameraX 기본 동작 목록이다. **사용자 비공개 PhotoMaster v0.24.2의 실제 코드·호출 지점을 이번에 읽은 것이 아니다.** 따라서 1.4.2로 버전을 지금 교체할 수 있다고 확정하지 않는다. 1.5.2에서 추가된 299개의 시그니처 중 앱이 사용하는 것이 있다면 수정 또는 다른 버전 전략이 필요하다.

## 원격 검증 증거
- 검사 소스: `tools/kabiseo-public-camerax-abi/inspect.py`
- [GitHub Actions run 42546003750](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/42546003750), job 128931047718, attempt 1 **completed/success**
- 증거 artifact ID 13643551815, SHA-256 `b475ee7b663817917bd3b5542a4f8e6fdec01bbccd3044173ff1839ccc47774f`
- Windows Defender 실행 파일 검사 종료 0, 위협 보고 없음; 기존 보호설정 불변. 발행자 AAR sidecar checksum 일치.
- 외부 AAR, 내부 클래스 및 .so는 **분석만** 했으며 실행하지 않았음. 사용자 private 앱 소스와 모델·기기 데이터는 GitHub에 업로드하지 않았음.

## 최초 미완료 작업
v0.24.2 ZIP `JH_Kabiseo_PhotoMaster_Reuse_v0242_REVIEW_ONLY.zip` (SHA `f4f85d1b3d9bbe66d392076e59ee967f4ff368a01b7a2bb5977afa6ecd59ee1c`)의 실제 PhotoMaster `MainActivity.kt`, `SceneAnalyzer.kt` 호출 목록을 **비공개 로컬 실행환경에서만 대조**해야 한다. 현재 container/python 실행 실패로 이번 턴에 private ZIP 내부를 직접 열 수 없었다. 반복 재업로드를 요구하지 않는다.

호환 조건 통과 때만 *별도* v0.24.3 비공개 검토 패치에서 CameraX 1.4.2를 적용. JH 전체 종속성 보안 영수증·실제 Kotlin/Android 컴파일·린트·서명·실기기 시험은 모두 미완료. `securityGateVerdict=REVIEW`로 기존 릴리스 보류 유지. 기존 JH 앱·Secure56·폰·서버 변경 0, APK 빌드/서명/배포 0.
