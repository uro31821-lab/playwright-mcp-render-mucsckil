# 카비서 v0.43 — 최신 Guava 취약점 보완 후보와 Gradle 변형 선택 원인 확정

## 결론
카비서 **v0.24.3 비공개 검토본**은 그대로 유지. 새 출시용 APK를 만들거나 JH 운영환경·사용자 휴대폰을 수정하지 않았음. 이번 업데이트는 배포 파일 보안·Gradle 변형 선택을 **검사 전용 공용 데이터**로 확인한 결과이다.

### 1. 최신 보안 후보 갱신
Google [Guava 33.8.0 공식 릴리스](https://github.com/google/guava/releases/tag/v33.8.0) (2026-11-02)는 `HashBiMap`/`CompactHashMap`/`CompactHashSet`의 해시 충돌 공격 방어 패치를 포함한다 (CVE-2026-118042). 따라서 이전의 **33.7.2-android**만으로 최신 보안 수정이 모두 반영됐다고 보지 않는다.

- 검토 대상: `com.google.guava:guava:33.8.0-android`, 공식 JAR SHA-256 `c88b3bd93382316b00a387b629d2cc2620119e16c46554b07fa14e9aa07f990e`.
- 공식 Maven Central 게시자 체크섬 일치, ZIP 구조·CRC 검사 통과; .asc 서명 파일은 확인했지만 **발행자 공개키를 통한 암호학적 검증은 아직 수행하지 않음**.
- MediaPipe Tasks1.1.1 Java 클래스 **997개**를 대상으로 Guava27에서 실제 해석되는 **16개 심볼이 Guava33.8에서도 16개 모두 해석됨**, 신규 누락 0. 별도 Flogger API 9개 참조는 이 Guava JAR의 일부가 아니며 Android 런타임에서 호환된다는 증거가 아님.
- 이번 조회 시 OSV 보안 권고 Guava27 **3건**, Guava33.8 **0건** (미발견 취약점이 없다는 보장은 아님).
- Windows Defender 검사 대상 6개 파일 종료 0, 위협 보고 없음. 새 앱에 패키징하거나 실행하지 않음.
- 독립 검사 [CI run 42621872118](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/42621872118) **완료·성공**. Artifact ID **13676727453**, zip SHA-256 `1faafe0ef9b221d638c5157d449e5ecab05f105e7114baed8fec734b2300c42f`.

### 2. 과거 강제버전 교체 실패 원인
Gradle 9.8.2 **분리 빈 프로젝트**에서 `gradleMetadata()+mavenPom()`으로 게시자의 4개 변형(`androidApiElements/androidRuntimeElements/jreApiElements/jreRuntimeElements`)을 읽었음. 기본 빈 configuration에는 `org.gradle.jvm.environment`, `org.gradle.usage` 등이 없어 Guava33.7.2와 Guava33.8.0 모두 `VariantSelectionByAttributesException`으로 실패. 이는 Guava 바이너리가 공식 저장소에 없어서가 **아님**. [원인 관찰 run 42621316946](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/42621316946).

- **Android 속성을 전역 적용**하면 Guava33.7.2/33.8.0 단독 그래프에서 각각 6모듈, 미해결0. 반면 전체 MediaPipe+Kotlin 그래프에서는 Kotlin/코루틴의 다른 JVM 변형까지 Android로 강제되면서 **미해결 28건**. [run 42621544080](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/42621544080). 이 방식은 **폐기**.
- **Guava에만 Android 변형 속성 지정**할 때 Guava 단독 그래프는 미해결0. 전체 MediaPipe+CameraX+Kotlin 그래프에서 **74모듈/321연결, MediaPipe의 Guava 전이 요청 2건이 여전히 모호하게 미해결**. Kotlin1.9.24, CameraX1.4.2, Protobuf4.36.2 선택은 유지. [run 42622199497](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/42622199497) **검사 완료·성공**. Artifact ID **13675694340**, SHA-256 `5066807ea11fce06d4f7c11baf8bb6210cb11d1f8bafe16744cbd36bb0771c2e`. 검사 프로그램 성공은 **의존성 전체 해결 성공이 아님**.
- 따라서 **빈 Gradle 프로젝트로 실제 JH Android 앱의 Gradle8.9/AGP8.7.3 Android 변형을 대체할 수 없다**. Kotlin을 무시/변형 강제하거나 가짜 호환 성공을 주장하지 않는다.

### 3. 다음 최초 미완료
`JH_Kabiseo_PhotoMaster_Reuse_v0243_REVIEW_ONLY.zip` SHA-256 `6a024aa3da06cb17ec87428ad9d80a3d5800fb0a5c7dcbd80c1180a1cb7003e9` 기준으로 원래의 **비공개 JH Android Gradle/AGP 도구 환경**에서 `dependencyInsight`와 Android 변형별 런타임 그래프를 읽어 **Guava33.8을 안전하게 선택할 수 있는지 확인**한다. 게시자 PGP 서명 검증, 새 전이 파일 전체 보안·JNI/안드로이드 링킹, AI 모델 기기 추론은 아직 미완료다.

**보안 판정은 REVIEW 유지**. 승인 전 새 Android 전체 앱 빌드·서명·설치·휴대폰 조작/기존 JH 변경 0. 이번 공개 GitHub에는 검토기와 위 문서만 있으며 비공개 원본/모델/서명키를 게시하지 않음.
