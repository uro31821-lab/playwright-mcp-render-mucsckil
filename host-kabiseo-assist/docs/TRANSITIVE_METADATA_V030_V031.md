# 카비서 후속 개발 — 외부 라이브러리 정적 그래프·컴파일러 메타데이터 검토 (v0.30–0.31)

## 이번에 실제로 수행한 검증
기존 **비공개 v0.24.2**는 그대로 보존. 원본 파일 SHA256 `f4f85d1b3d9bbe66d392076e59ee967f4ff368a01b7a2bb5977afa6ecd59ee1c` (이전 확정)이며 본 단계에서는 다시 적용하거나 앱을 설치하지 않았다.

1. **전이 의존성 메타데이터**: CameraX1.5.2 네 모듈, Activity-KTX1.10.1, MediaPipe Tasks Core/Vision1.1.1, Protobuf-javalite4.36.2의 **8개 직접 입력**에서 출발. 공개 Google Maven과 Maven Central의 POM/.module 파일만 읽어 132개 버전 노드와 346개 연결을 방문. **8건 버전 미기재/속성 미해결**, **24개 group:artifact의 복수 버전 요구** 기록. Gradle이 실행 시 선택한 **실제 resolved graph가 아니므로 24개를 확정 충돌이라 부르지 않는다.** V030 CI [42494958300](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/42494958300) 완료 성공, artifact ID 13622604860 SHA256 `082123e6e11124e0212f297f0ef46ad767bda27e13942c6f7932d83e372d5578`.
2. **정확한 미해결 항목 재확인**: 누락 버전 8건 중 5건은 Guava27.0.1-android의 부모 POM에서 확인. `jsr305 3.0.2`, `checker-compat-qual 2.5.2`, `error_prone_annotations 2.2.0`, `j2objc-annotations 1.1`, `animal-sniffer-annotations 1.17`. 나머지 3건 `kotlin-stdlib` 버전은 발행 POM에 미기재. JH Kotlin 컴파일러 플러그인1.9.24가 실제 Gradle 해석에서 선택할 stdlib 버전은 **미확인**.
3. **더 나은 카메라 버전 후보**: CameraX1.5.3의 camera-core/camera-camera2/camera-lifecycle/camera-view 공식 AAR 4개와 Activity-KTX1.10.1 AAR 1개를 정적 분석. CameraX1.5.3의 metadata는 `minCompileSdk=35`, `minAndroidGradlePluginVersion=8.6.0`; 기존 SDK35/AGP8.7.3 요구조건과 일치. Google 공식 release note에 따르면 1.5.3은 일부 JPEG 파일 촬영 오류를 수정함. **하지만 v0.24.2 실제 앱은 아직 1.5.2이고 1.5.3로 교체하지 않음.**
4. **새 발견 — Kotlin 메타데이터**: CameraX1.5.3 네 AAR의 `.kotlin_module` 헤더는 실제로 `[1,9,9999]`이다. 이 특수 메타데이터는 **Kotlin1.9.24에서 컴파일이 성공한다는 증거도 실패한다는 확정 증거도 아니므로** 정식 Gradle/컴파일 확인 전까지 호환 상태 UNKNOWN 유지.
5. Windows Defender에서 이번 AAR 검사 exit0/위협 보고 없음. 제조사 제공 SHA256 sidecar 일치, 원본 POM/parent 해시 확인. 이 사실만으로 전체 공급망/바이너리의 **security SAFE를 승인하지 않음**. V031 최종 CI [42495761411](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/42495761411) 완료 성공, artifact ID 13623606264 SHA256 `f1b4e122de6e287829bdee8c3d9b2afc8d0a23c2fdcb86ba956d66c76437bc36`.

## 범위 및 금지
새 APK/모델 설치, Android 빌드, 서명, 기기 연결, 데이터 수정, JH 앱·서버 운영 변경 모두 0. 이 작업의 공개 GitHub 변경은 **검증기 및 체크포인트 문서뿐**이다. 카비서 실제 AI 모델 파일은 여전히 비공개 앱 후보에 포함되지 않았음. 사용자 개인정보·Private JH 원본 코드 업로드 없음.

**securityGateVerdict=REVIEW** 이므로 앱 빌드/서명/설치/실기기 E2E는 계속 보류. 다음 최초 미완료 단계는 `Guava 상속 버전과 JH Kotlin stdlib 제약 반영 → Gradle 전체 실제 해석 그래프/호환성/보안 증명 → Kotlin1.9.9999와 Kotlin1.9.24 연결 검증`이다. 24개 복수 버전 요구를 충돌로 확정하지 않으며 임의 무시 옵션 `-Xskip-metadata-version-check`를 사용하지 않는다.
