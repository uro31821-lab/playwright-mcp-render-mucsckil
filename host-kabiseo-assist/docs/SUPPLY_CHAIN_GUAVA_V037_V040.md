# 카비서 v0.40 — 75개 공개 라이브러리 공급망 검사 및 취약 Guava 교체 검토

## 결론
비공개 카비서 **v0.24.3** 소스 패치(`JH_Kabiseo_PhotoMaster_Reuse_v0243_REVIEW_ONLY.zip`, SHA256 `6a024aa3da06cb17ec87428ad9d80a3d5800fb0a5c7dcbd80c1180a1cb7003e9`)는 이번에 **수정하지 않았다**. 공개 JH 개발 저장소에는 **검사 코드와 보고서/해시만** 저장. JH 본체·휴대폰·서명키·Secure56 무변경.

### 1. 이미 검증된 전체 직접+전이 입력 감사
- 검증 대상: 기존 **분리 Gradle POM-only** 그래프 75노드/322엣지 (2026-11-09 run 42538806613), 기존 artifact ID 13640123907, SHA256 `17d981cdef704b430591badf267c80c73d27c377facb18d78b61e7d5b7ab9051`을 재사용.
- run [42617768137](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/42617768137) 완료 성공: 73개 JAR/AAR 공식 게시자 파일+해시 일치, 2개 설정 POM, 누락 0; native SO 12개 발견. Windows Defender 검사 대상 133파일, 종료 0/위협 보고 없음.
- 현재 OSV 검색에서 **Guava 27.0.1-android에 보안 권고 3건** 발견: GHSA-5mg8-w23w-74h3, GHSA-7g45-4rm6-3mm3, GHSA-xxph-c9ww-hj94. 공식 [Guava v33.7.2 릴리스](https://github.com/google/guava/releases/tag/v33.7.2)는 해당 Android 수정 버전을 배포.
- artifact ID 13673621105, ZIP SHA256 `14ebac4ec9a4a5592adc408b48fc0618af76ab24171f6b2c592fff6369240306`. 공식 외부 바이너리는 Artifact에 포함하지 않고 보고서만.

### 2. 수정된 Guava의 원본 바이너리 정적 호환성
- run [42619281123](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/42619281123) 완료 성공. 공식 Maven Central Guava 27.0.1-android JAR SHA256 `caf0955aed29a1e6d149f85cfb625a89161b5cf88e0e246552b7ffa358204e28`; 후보 33.7.2-android JAR SHA256 `b949fe975a32421c1a2633c07a4f1578b462f2f467668aa0a4023c5ff7c4a808`. 각 파일 게시자 체크섬, 압축 CRC 통과; PGP asc 파일 **존재 관찰, 서명 검증은 안 함**.
- 실제 MediaPipe Tasks Core/Vision **1.1.1의 클래스 997개**에서 Guava 패키지 메서드 호출 심볼 25개 수집. Guava27에서 해석 가능한 16개는 Guava33.7.2에서 모두 해석되어 **정적 누락 0개**. 나머지 **9개는 별도 Flogger 패키지**로 Guava JAR에서 해석되지 않으며, 실제 Android 로딩/JNI 호환까지 성공했다는 뜻이 아님.
- OSV 조회: 기존 Guava27 3건, 후보33.7.2 **0건**(미발견 취약점 가능성은 남음). Windows Defender 6개 파일 검사 종료0. artifact ID 13675181075, ZIP SHA256 `305966c6a746f38f650652ee21a22541958651d13081423898a2bcce7195c8d6`.

### 3. 실제로 막힌 자동 교체
- run [42618435643](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/42618435643), [42618686640](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/42618686640): 임시 분리 Gradle에 Guava33.7.2를 강제하면 MediaPipe `tasks-core:1.1.1`, `tasks-vision:1.1.1`에서 **Guava27.0.1 요청 2건이 미해결**. Kotlin1.9.24·CameraX1.4.2·Protobuf4.36.2는 유지. 이는 **비공개 JH 전체 Android 빌드 실패 증거가 아니라 빈 프로젝트의 POM-only 검증 실패**.
- run [42619616495](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/42619616495): 저장소를 강제 분리하면 Guava 2건에 더해 Google 저장소가 빠져 **Firebase 인코더 관련 항목까지 미해결 총 6건**. 이 방식은 사용하지 않음.
- **현재 결론**: Guava 수정본은 실제 게시·정적 API·OSV 근거가 있지만, Gradle/Android 전체에서 채택 승인 아님. 자동 업그레이드나 위험한 `force`/exclusion 우회 금지.

## 릴리스 차단 및 최초 미완료
- `securityGateVerdict=REVIEW`. 전체 바이너리 인증서/서명 및 실제 Android variant dependency graph 검증 부족.
- 다음 순서: **비공개 JH Gradle8.9/AGP8.7.3 Android variant에서 안전한 Guava 버전 선택 방식과 Google/Firebase 의존성 보존 검증 → 전이 공급망 재평가 → 보안 SAFE 여부 판단 → Android Kotlin 컴파일/lint → AI 모델 기기 추론 → 기존 서명·사용자 명시 승인 설치/촬영 E2E**.
- 소스 패치 v0.24.3이 최신 검토본이고 설치된 APK는 아님. AI 객체 인식 모델도 아직 앱에 포함되지 않음. 본 실행에서 운영 배포·휴대폰 명령·재설치 **0**.
