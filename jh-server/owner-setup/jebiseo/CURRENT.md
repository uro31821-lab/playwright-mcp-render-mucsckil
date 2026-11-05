# 제비서 현재 후보 — 실제 자동 세 단계

갱신일: **2026-11-06 (KST)**.

최신 사용자 요구는 **왼쪽 GPT 글 선택 → ‘Gemini에게 물어보기’ 클릭 → 오른쪽 Gemini 실행 클릭**이다. 이전 수동 선택 안내를 기본 자동 구현으로 취급하지 않는다. 기본 session은 `AUTO_TEXT_SELECTION`이다.

## 이번에 구현한 내용

서버의 `native-text-handoff-port.mjs`와 `native-text-handoff-runtime.mjs`를 원 host binding/composition에 연결했다. 실제 원 `life_android_step`의 세 전용 action을 만들며, 기존 `mk → Secure56 서명 → durable → queue → Stage26 서명 완료`를 유지한다. 사용자 JSON이나 성공 callback으로 실제 폰 영수증을 대신할 수 없다.

Android는 검증된 Stage62 FIX3 원본에서 `JebiseoTextHandoffPolicy/Transport/Runtime`을 추가했다. `BridgeService`의 검증된 전체 job에서 전용 분기를 호출한다. 일반 LEFT 클릭·입력 제한, `AndroidAgent`, `AgentFocusPolicy`, `SecureBridge56`, `SiteSwitchPolicy`, `GeminiSubmitReviewPolicy`는 그대로다.

| 단계 | 실제 동작 | 진행 조건 |
| --- | --- | --- |
| SELECT_REQUEST_TEXT | 지정 native ChatGPT 노드의 지원되는 LONG_CLICK/SET_SELECTION | 원문·실제 선택 시작/끝이 일치 |
| CLICK_GEMINI_MENU | 실제 framework 선택 메뉴의 정확한 Gemini 항목 ACTION_CLICK | 이전 폰 receipt, 메뉴 귀속, 기존 로컬 승인, 오른쪽 Gemini 초안 일치 |
| SUBMIT_GEMINI | 기존 Gemini 검토 후 RIGHT 전송 버튼 클릭 | 같은 초안·창·대상과 기존 정확한 승인, 실제 제출 관찰 |

휴대폰 receipt는 동일 task·command·session·run·원문에 묶인다. 승인 재개에는 같은 requestId를 사용하고 완료·실패·미확정 클릭을 재실행하지 않는다. 서버 재시작 후에도 원 durable UNKNOWN을 새 requestId로 우회하지 않는다. 취소는 상태 generation을 교체해 실행과 교착하지 않으며 늦은 기록은 새 작업을 되살리지 못한다.

## 실제 수행한 검사

| 범위 | 결과 | 의미 |
| --- | --- | --- |
| 서버·원 generated handler·기존 모바일·허브 통합 | **411 passed, 0 failed, 0 skipped** | 실제 후보 오버레이와 원 등록·schema·명령·큐·완료 연결 검사. 기기 결과는 합성 fixture |
| Android JVM 단위 검사 | **1,283 passed, 0 failed, 0 skipped** | 기존 검사와 신규 제비서 9개 포함 |
| Android release 빌드 | **BUILD SUCCESSFUL** | 실제 Kotlin/Android 컴파일·패키징 완료 |
| 공개 overlay 재구성 | **428/428 소스 파일 일치** | 원본 복사+두 파일 patch+네 새 파일이 빌드 소스와 바이트 일치 |
| APK 내용 확인 | applicationId/version 확인, non-debuggable | 무서명 후보이며 정식 설치용 서명 없음 |

검사 명령은 기존 `.github/workflows/jh-jebiseo-mobile-candidate.yml`의 통합 묶음과 `gradle --offline --no-daemon --max-workers=2 :app:testDebugUnitTest :app:assembleRelease`다. Git 이력이 필요한 보호 검사는 수정하지 않았으며 전체 checkout을 사용하는 PR의 GitHub CI에서 확인한다. 이 파일이 포함된 커밋의 CI는 해당 PR Checks를 기준으로 확인한다. 이전 수동 후보의 CI 결과를 이번 코드 검증으로 재사용하지 않는다.

## APK와 원본

- 기준 원본: Stage62 FIX3 ZIP SHA-256 `cfcb182ea69f9f0cb9fb415fc38fcf815f205639e8a66b4cc32c6f15361d341b`, 원본 source manifest 424/424 일치 확인.
- applicationId: `com.koreanlifehub.bridge`, versionCode: `168`.
- 후보 versionName: `jh168-stage62-fix3-jebiseo-auto3-candidate`.
- 빌드 APK: `app-release-unsigned.apk`, 48,934,199 bytes.
- APK SHA-256: `d9f5368a78a999f6375eadee3322c7c72d7d92074a12426708ba64ef26d3e11b`.
- 원래 인증서 서명은 수행하지 않았다. 새 키로 기존 앱을 교체하지 않는다.
- 공개 변경분: `host-jebiseo/android-overlay/`. 전체 앱 원본과 빌드 자료는 별도 보존한다.

기존 설치 FIX3에는 왼쪽 GPT 선택 consumer가 없으므로 새 Android 코드가 필요하다. APK 빌드가 성공했다는 사실만으로 설치된 앱·서버·플러그인·다른 대화방이 갱신됐다고 설명하지 않는다.

## 호스트 사용 순서

1. 현재 요청의 원 의미 입력으로 `createHandoffRuntime({request,deliveryMode:'AUTO_TEXT_SELECTION',requiresResultInspection,deviceId,commandId})`를 만든다.
2. `presentation()`의 정확한 `preparedPrompt`를 현재 왼쪽 GPT 화면에 선택 가능한 한 블록으로 먼저 표시한다. 설명·비서 배지는 밖에 두고 같은 문장을 반복 표시하지 않는다.
3. 같은 session의 `start()`로 원 실행기에 연결한다. 실제 선택 proof 없이 다음 단계로 진행하지 않는다.
4. 원 완료 대기 또는 기존 휴대폰 승인 처리 후에는 `resumeAutomation()`을 사용한다. 미확정 클릭은 새 작업으로 다시 보내지 않는다.
5. 실제 제출 관찰과 삼성 작업·분석·영상 결과를 구분한다. `resultVerified/businessResultVerified/geminiReplyVerified`는 false를 유지한다.

`nativeSelection`은 요청 참조의 descriptor이며 화면 증거가 아니다. AUTO 모드에 대한 수동 진행 보고는 검증된 클릭 영수증으로 채택하지 않는다. `TEXT_SELECTION`과 `OPEN_MANUAL`은 명시적인 기존 수동 대안이다.

## 결과 복귀와 남은 실제 확인

YOUTUBE는 **GPT_AFTER_MANUAL_SHARE**를 유지한다. Gemini 분석이 끝난 뒤 사용자가 실제 결과를 선택·공유하고 현재 GPT에 내용이 들어오면 비교·재정리한다. 삼성 앱·기기와 영상 결과는 Gemini에서 확인한다. 자동 역방향 답변 회수·영상 export는 완성된 기능으로 표시하지 않는다.

남은 실제 검증은 원 인증서 서명·정식 설치 경로, 동일 후보 서버 적용, 사진과 같은 현재 폰 화면에서 세 단계가 이어지는지 확인하는 것이다. 실제 native 선택 API/offset, toolbar ID·소유 창, 오른쪽 Gemini 배치·초안·전송 UI가 확인되지 않으면 미지원 또는 미확정으로 남긴다. 현재 휴대폰에서 세 단계 전송을 성공한 증거는 아직 없다.

`codeCandidate:true`, `productionRegistered:false`, `geminiAssistanceAvailable:false`, `liveExecutionVerified:false`를 유지한다. 운영 배포·APK 설치·실제 휴대폰 조작은 이번 검사에 포함되지 않았다.

기준선은 Stage72 / PR #159 (`5d72b78fd3730111076b33e2771f5b6b70f657aa`), Stage62 FIX3 + Stage71 Android → Manual이다. 관련 없는 이후 서버 기능과 기존 보호 게이트는 보존한다.
