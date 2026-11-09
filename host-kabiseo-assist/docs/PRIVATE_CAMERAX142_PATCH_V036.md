# 카비서 v0.36 — 비공개 v0.24.3 CameraX 1.4.2 패치 생성·검증 (설치 전)

## 이번 실제 완료
- 비공개 원본 `JH_Kabiseo_PhotoMaster_Reuse_v0242_REVIEW_ONLY.zip`의 **실제 파일 바이트를 열어** SHA256 `f4f85d1b3d9bbe66d392076e59ee967f4ff368a01b7a2bb5977afa6ecd59ee1c`와 일치 확인.
- 원본 JH `KaBiseo-v0.13-Stage77-Review.zip` SHA256 `da00df7101fe3ccdb0466ca08755a6605e8d84315a696d77fc5ba9b7dbacec37`도 일치 확인.
- 원본 Kotlin 파일 `MainActivity.kt`, `SceneAnalyzer.kt`, `GuideOverlay.kt` 3개를 비공개 로컬 메모리에서 읽음. CameraX 1.5 추가 API 표시 0; `bindToLifecycle` 두 곳 모두 3인자 `UseCaseGroup` 사용, `takePicture` 한 곳에서 3인자 저장 API 사용 확인. 토큰 검사는 정적/어휘적 검사이며 컴파일 증거가 아님.
- 기존 v0.24.2 Gradle diff에서 **`val kabiseoCameraX = "1.5.2"` 딱 한 줄**을 `1.4.2`로 교체. 다른 기능/원본 코드 변경 없음.
- 원본 JH 448파일에 old/new unified patch를 각각 충돌 없이 적용해 **454파일 재구성** 확인. 새 후보는 v0.24.2와 비교해 **453개 소스 파일 바이트 동일, `app/build.gradle.kts`만 변경**. 기존 원본 448 중 **445개 완전 동일, 3개 의도된 수정, PhotoMaster 6개 추가, 삭제 0**.
- 새 정적 안전 검사 **17/17 PASS**(원본/패치 해시, 소스 재구성, 변경 범위, 모델 없음, 허용 권한, 핵심 라이브러리 핀 유지 등). v0.24.2의 과거 35개 정적검사와 6개 부정 시험은 **과거 검증으로 재사용하되 이번 신규 검사 횟수에 합산하지 않음**.
- 생성 ZIP: `JH_Kabiseo_PhotoMaster_Reuse_v0243_REVIEW_ONLY.zip`, 25,774 bytes, SHA256 **`6a024aa3da06cb17ec87428ad9d80a3d5800fb0a5c7dcbd80c1180a1cb7003e9`**. ZIP CRC, 내부 package-manifest 13항목 SHA256를 재조회·일치 확인. 새 검증 영수증 포함. 내부 모델 TFLite 없음.
- 공개 GitHub에 **비공개 ZIP이나 JH 원본 소스는 업로드하지 않음**. 이 문서는 상태/해시만 기록.

## 개발 게이트 현황
- 실제 Android Kotlin 컴파일/AGP Gradle8.9 resolved graph/lint: **NOT_RUN**. 이전 v0.33 분리 Gradle 자료는 호환성 후보 근거일 뿐, 앱 전체 빌드가 아님.
- CameraX 1.4.2 AAR의 기본 API는 [공개 bytecode 검사 v0.34](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/42546003750)에서 확인. 이번 v0.24.3은 **소스 수준**의 후보 검증.
- 외부 MediaPipe1.1.1, Protobuf4.36.2에 대한 정적 심볼 참조 117/117 및 모델 라이선스 증거는 기존 기록 재사용. 전체 전이 바이너리 공급망/서명·Android 런타임은 아직 미완료.
- `securityGateVerdict=REVIEW`; **출시용 빌드, 서명, 배포, 새 휴대폰 설치 불가**.
- 모델이 앱에 없으므로 사용자 폰에서 피사체 인식·AI 자동 확대가 된다고 주장하지 않음. 기존 JH 운영/카메라 설정과 Secure56은 변경하지 않음.

## 다음 한 단계
비공개 v0.24.3을 기준으로 **실제 Android Gradle 선택 그래프와 외부 바이너리 공급망 보안 승인**을 완료한 뒤 Kotlin Android 컴파일·lint로 넘어갈 것. 기존 서명/폰 설치는 사용자 명시 승인과 별도의 E2E 검증이 필요. 동일 ZIP 재업로드나 오래된 USB 진단 반복하지 않음.
