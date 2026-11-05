# 제비서 — Stage72 기준 개발 체크포인트

갱신일: 2026-11-05. 사용자 지시: Stage72 재개 이후 **계속 진행**.

## 현재 기준

- 저장소: `uro31821-lab/playwright-mcp-render-mucsckil`
- 실제 PR 대상 브랜치: `jh-fix3-secure-server`. 일반 Playwright 계열의 `main`과 구분한다.
- 기준: [PR #159](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/pull/159), 병합 커밋 **`5d72b78fd3730111076b33e2771f5b6b70f657aa`**. 해당 PR의 최종 head CI 6개 성공과 병합 상태를 확인했다.
- 설치 기준: **Stage62 FIX3 APK 그대로 유지**.
- 서버 경로: **Stage71 Android → Manual**. Stage72는 현재 상태 인계 기준이다.
- 조회로 확인한 실제 live 서버 커밋은 `a06e4643a036fa7cc121ef997bc332a43f2f85df`다. Stage72 병합과 실제 서버 배포를 같은 사건으로 표시하지 않는다.
- **InstallOnly ZIP 실행, APK 재설치·재빌드·데이터 초기화 없음.**
- 기존 [Draft PR #145](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/pull/145), 브랜치 `feat/jh-jebiseo-mobile-20261104`에서 이어간다. 통합 전 후보 head는 `76d9d3488753939e9775e2ba8f4619d470e0e0c6`다. 최신 기준을 이 후보에 병합했으며 기존 보호 소스·승인 규칙을 변경하지 않았다.

기준 원문은 [Stage72 현재 상태](../../../../jh-mobile-dual-engine/stage72/current.json)와 [Stage70 동작표](../../../../jh-mobile-dual-engine/stage70/alias-matrix.json)다. 이전 모바일 Playwright 전환 계획은 현재 기준으로 대체한다. 일반 웹 Playwright는 유지한다.

PR 반영 직전 최신 기준 브랜치 `197319f91866351514b95f92e27973c62d46d0ff`도 소스에 보존 병합했다. Stage72 이후 추가된 파일은 Stage73/74의 별도 설치 전달물 기록·정적 검사·CI 3개뿐이며 서버 코드와 기존 보호 기준은 같았다. 이 기록의 설치 안내를 이번 제비서 작업의 설치 지시로 채택하지 않는다. 이 작업의 기기 기준은 위 Stage62 FIX3 유지 조건이다.

후속 개발 중 [PR #165](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/pull/165)가 병합되어 기준 브랜치가 `e7c6fc94776ebbf8392377624c41c95f0c90fb8a`로 이동했다. Stage73 실패·대체 기록과 Stage75 TripLocation FIX1 patch 기록·검사·CI, 총 6파일 변경을 그대로 보존 병합했다. 제비서 서버·원 인증 소스의 변경은 없었다. 별도 전달물의 설치 안내는 이 작업의 설치 승인이나 현재 APK 변경으로 해석하지 않는다.

최종 반영 직전 기준 브랜치는 `1d9922d8f507522e9cba25c76e7ca85d2bd49374`로 이동했다. Stage76의 별도 TripLocation 완료 기록·검사와 evidence Search 모듈·등록·검사 등 14파일을 기준 브랜치의 원 blob 그대로 보존 병합했다. 기존 composition의 Search 등록과 정확한 blob·역변환 검사도 이미 기준 브랜치에 병합된 원문 그대로다. 제비서 검사를 통과시키려고 보호 원본·pin을 새로 수정하지 않았다. 이 별도 기능 기록을 제비서의 새 API 사용·기기 설치·운영 배포 지시로 해석하지 않는다.

이번 ANDROID 반영 전 실제 PR 대상 `jh-fix3-secure-server`의 최신 ref는 `0663e0c3b434f300803e5cf272609032a5e519d3`다. 이전 `1d9922d8…` 이후 Stage77 위치 후보 기록·검사·CI 3개와 evidence Search 후속 요청 처리 3파일, 총 6개 변경을 원 blob 그대로 보존 병합한다. 제비서 파일과 충돌이 없고 원 command 주입·서명·Stage26/44/61·보호 핀은 같다. 별도 `main`은 이번 PR의 병합 대상이 아니며 이 작업의 APK 설치 기준은 바뀌지 않는다.

## 목표와 세 기능

휴대폰의 GPT에서 요청하면 왼쪽 GPT를 유지하면서 오른쪽 Chrome의 `https://gemini.google.com/app`을 기존 JH 경로로 열고 현재 요청의 결과를 회수한다. 사용자가 Google/Gemini를 직접 열고 배치하는 절차를 정상 사용법으로 요구하지 않는다. 실제 GPT 전용 버튼을 만든 상태는 아니며, 명시적인 자연어 열기 요청과 구현 후보를 구분한다.

원래 [PR #63](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/pull/63)의 `67c69428f27030237f417753c717ab758faaa855`에 있는 세 기능을 보존한다. 세부 입력·근거·결과 조건은 [FEATURES.md](FEATURES.md)를 따른다.

| 기능 | 보존할 완료 조건 | 현재 단계 |
| --- | --- | --- |
| YOUTUBE | 같은 영상·질문에 해당하는 답변, 공개 설명·자막·영상·미확인 근거 구분 | 요청·결과 계약 보존. 전체 모바일 흐름 미완료 |
| VIDEO | 기존 포함 사용량·추가 결제 없음 확인, 실제 영상 회수·파일 검증·GPT 재생 전달 | 계약 보존. 실제 생성·회수·전달 미완료 |
| ANDROID | 명시적 OPEN_APP, 확인된 패키지, 독립적인 앱 상태 확인 | 유튜브·지메일·인스타그램의 기존 원본 경로를 후보에 연결. 운영 등록·실기기 확인 미완료 |

일반 상담·의견·검토를 위 세 기능의 대체 목록으로 쓰지 않는다. 별도 Gemini API·추가 결제·새 계정·서버 브라우저로 전환하지 않는다.

## 원본 입력 경로와 이번 연결

| 동작 | 연결과 확인 기준 |
| --- | --- |
| OPEN | 기존 `life_web_navigate`와 고정 Gemini 주소 유지. 열기 요청만으로 입력·전송을 시작하지 않음 |
| OPEN_APP | ANDROID 요청만 기존 `life_android_open`에 원본 매핑으로 확인한 고정 앱 별칭 전달. URL·임의 앱·앱 내부 동작을 받지 않음 |
| APP_OBSERVE | 기존 `life_android_computer_inspect`의 WAIT INSPECT로 현재 오른쪽 앱을 읽음. 실행·복원·클릭·스크린샷 없음 |
| FORM_SNAPSHOT | 원 `life_android_snapshot`의 완료 결과에서 발급된 guided-form 인자를 읽을 수 있도록 연결 |
| DISCOVER_INPUT | 현재 원본이 발급한 `form15_discover` carrier를 그대로 원 `life_android_step`에 전달 |
| TYPE | 발급된 `form15_type`의 세션·요청·필드 값을 보존하고 `value`만 현재 요청 문장으로 변경. 전송은 별도 동작 |
| DISMISS_NOTICE | 원본의 정확한 닫기 버튼·비승인 metadata를 검증한 `form_activate`만 사용. 전송·승인 버튼과 구분 |
| 결과 해석 | 현재 호출의 `agent_step.result.url`만 한 번 해석. 입력 실패·불확실·MANUAL·만료·재검토를 성공으로 올리지 않음 |
| 후속 진행 | 기존 기기·명령·창·질문·원 결과 연결을 유지. 확인되지 않은 효과가 남으면 다음 효과 차단 |

`guided-form.mjs`는 원본 완료 snapshot/discovery에서 발급 인자를 추출한다. **실행 대상은 원 native `f_`로 통일했다.** 공개된 일반 RIGHT `item_`와 같은 노드라는 연결 근거가 없으므로, guided 작업에서는 일반 웹 `ssc_` 문맥이나 `item_` 항목을 대상 인자로 받지 않는다. 새 세션·요청·필드 값을 만들지 않으며 원 발급 carrier와 `field_id`가 정확히 일치해야 한다. 호출자가 주입한 `guided_arguments`는 host에서 거부한다. 실제 원본과 같은 기기·명령·오른쪽 Gemini 창·대상·빈 입력칸을 검증한 신뢰된 host proof만 사용한다. 파싱 성공은 인증·승인·운영 등록의 증거가 아니다.

`guided-outcome.mjs`는 현재 guided 호출의 정확한 native 결과 슬롯만 해석한다. 다른 동작의 성공 코드·필드 불일치·손상된 JSON은 미확인으로 유지한다. `field_value_verified`는 입력칸 확인일 뿐 Gemini 전송·답변 성공이 아니다. `low_risk_action_dispatched`는 클릭 접수일 뿐 안내가 닫혔다는 증거가 아니다. `actionAccepted:false`도 실행 중 예외에서는 미실행 증거가 될 수 없다.

`mobile-outcome.mjs`는 원 결과의 대기·불확실·재검토·MANUAL·거절을 보존한다. secondary 안내, UI 글, 다음 provider 추천을 현재 실행 결과로 오인하지 않는다. 이 분류와 파싱 결과는 예약·pending 장벽·승인을 해제하지 않는다. 정확한 기존 원 결과 검증만 후속 동작을 허용할 수 있다.

### 실제 원본 서버와 관찰을 결합하는 후보

- `original-host-composition.mjs`: 완성된 원 생성 서버에만 명시 적용하는 되돌릴 수 있는 overlay다. 기존 최종 등록 핸들러와 입력 schema, 현재 인증된 HTTP·MCP 요청을 그대로 결합한다. registry는 MCP 인스턴스별로 분리하며 전역의 ‘가장 최근 연결’을 선택하지 않는다. production startup과 MCP catalog에 추가 등록하지 않는다.
- `original-host-binding.mjs`: 원 private job 객체와 이번 원 핸들러가 실제로 반환한 응답을 연결한다. 현재 기기·명령·secure session·focus·원 durable hook을 읽고, 기존 Stage26 완료 기록 이후의 결과만 원 완료로 인정한다. 공개 응답의 digest나 `ok:true`를 단독 증거로 받지 않는다. 원 snapshot의 command는 실제 mk 호출 범위에 private하게 묶고 Android payload를 변경하지 않는다.
- `native-screen-proof.mjs`: 같은 원 native snapshot의 RIGHT 창·display·시각·폼 metadata를 검사한다. TYPE은 독립 snapshot과 discovery의 revision·필드 상태·원 발급 세션이 일치하고, 명확한 Gemini 질문칸 후보가 하나이며 `filled:false`인 경우로 제한한다. `filled:false`는 빈 값·공백·힌트를 뜻한다. 임의의 첫 번째 TEXT 칸을 선택하지 않는다.
- 같은 task의 facade/runtime과 pending 기록을 재사용한다. 새 객체나 다른 taskRef를 만들어 같은 원 명령의 미확정 효과를 우회하지 못한다. 요청 종료·연결 중단·명령 또는 세션 변경 후에는 이전 capability로 후속 호출하지 않는다.
- 원 학습 wrapper의 비동기 대기 뒤에도 실행 범위가 유지돼야 한다. 원 작업을 큐에 넣기 직전 현재 요청·기기·명령·세션·focus를 다시 대조한다. 원 서명·작업 내용·durable 예약은 변경하지 않으며 candidate 호출이 아닌 기존 작업에는 이 확인을 적용하지 않는다.

### 입력·닫기 이후의 별도 화면 관찰

미확정 TYPE 또는 DISMISS_NOTICE 때문에 다음 효과가 `JEBISEO_PRIOR_EFFECT_READBACK_REQUIRED`로 막힌 경우에만 `postActionObservation` 진단을 덧붙인다. 현재 요청의 private effectKey로 원 pending 작업을 찾으며 다른 작업의 완료 결과를 가져오지 않는다.

원 완료는 기존 private job 객체·명령·기기·세션·Stage26 기록으로 확인한다. 후속 snapshot은 다른 원 job이며 호출 순서가 뒤에 있어야 하고, 생성·시작 시각도 원 효과 완료 이후여야 한다. 현재 인증된 요청·기기·명령·세션이 바뀌면 이전 관찰을 재사용하지 않는다.

순수 `inspectJebiseoPostActionObservation`은 같은 RIGHT 창·display·GPT 창·배치 범위·현재 Gemini 주소·원 발급 세션·관찰 시각·민감 상태를 다시 검사한다. TYPE 이후에는 `filled:true`와 revision 변경이 정상적으로 생길 수 있으므로 입력 전의 빈칸·동일 revision 조건을 재사용하지 않는다. 원 대상 필드와 metadata를 대조하며 첫 번째 입력칸으로 대체하지 않는다.

구조가 맞는 후속 관찰도 TYPE은 `NATIVE_POST_TYPE_VALUE_UNVERIFIED`, 안내 닫기는 `NATIVE_POST_NOTICE_STATE_UNVERIFIED`로 반환한다. 글자가 있다는 metadata는 정확한 요청 문장 일치가 아니고, visible-only 목록에서 버튼이 사라진 것은 안내창이 닫혔다는 증거가 아니다. 진단은 제한된 boolean만 반환하며 질문 원문·URL·필드·세션 식별자를 포함하지 않는다.

`observationValidated:true`는 위 구조 비교를 통과했다는 진단일 뿐이다. `ok`, `authorityVerified`, `currentValueVerified`, `noticeDismissedVerified`는 항상 false이고 `readbackRequired:true`를 유지한다. 기존 `readback`·pending·예약·후속 효과 허용은 변경하지 않는다. 완료가 없거나 독립 후속 snapshot이 없거나 현재 주소가 없으면 각각 그 부족 이유만 반환한다.

### ANDROID 앱 열기와 독립 관찰 연결

`ANDROID / OPEN_APP` 요청은 Gemini를 거치지 않는다. `android-app.mjs`의 원본 매핑은 `com.google.android.youtube → 유튜브 앱`, `com.google.android.gm → 지메일 앱`, `com.instagram.android → 인스타그램 앱` 세 가지다. 다중 패키지 별칭·미확인 앱은 지원으로 표시하지 않는다. task에는 명시적 `intent:open_app`, `feature:ANDROID`, `action:OPEN_APP`, 확인된 `appPackage`, 기존 명령·기기·taskDigest가 필요하다.

`start()`는 같은 원본 `life_android_open`의 native-app 분기를 호출한다. 원본은 기존 Secure56 기기와 명령을 확인하고 `open_url(target:고정별칭,url:빈문자열)` 작업을 만든다. Android의 기존 `NativeTaskLauncher.launchVerifiedRightPane`는 이미 오른쪽에 같은 앱이 있으면 `RIGHT_PANE_ALREADY_VISIBLE / launchAccepted:false`로 반환하여 다시 열지 않는다.

원본 도구의 최초 응답은 `native_app_open` 큐 응답이며 `jobId`만 다음 조회에 연결한다. 이 응답이나 `RIGHT_PANE_VERIFIED`만으로 앱 확인을 완료하지 않는다. 원본 완료를 확인한 후, 별도 `APP_OBSERVE`를 호출해야 한다. 이 호출은 **WAIT 실행이 아닌 INSPECT**이며 인자는 `WAIT / READ_ONLY / NONE / max_actions_in_call:1`과 같은 기존 taskDigest·command로 고정된다. 좌표·입력·승인·스크린샷·lease·임의 task 변경을 받지 않는다.

앱 열기와 관찰 모두 실제 원본 `mk()`의 private invocation 기록, 같은 반환 객체·schema·원본 job·명령·기기·세션·Stage26 완료를 조인한다. 원본 큐 응답 직전에 완료되는 경합도 같은 job의 원본 완료로만 처리한다. status 조회는 보관한 원 job만 읽고 과거 호출 순서를 새 호출로 바꾸지 않는다.

후속 CU 관찰은 앱 열기와 다른 job이고 호출 순서가 뒤여야 하며, 생성·시작 시각도 원본 앱 열기 완료 이후여야 한다. Stage61 사전 창과 실제 `screen`의 패키지·창 ID·좌표가 같고, 알려진 동일 display에 왼쪽 ChatGPT·오른쪽 목표 앱이 있어야 한다. `locked`, `secureContext`, `routingBusy`는 모두 명시적 false여야 한다. 서버 생성·시작·완료 시각을 이용하며 없는 휴대폰 관찰 시각을 만들지 않는다.

이 조건을 원 host가 확인한 경우에만 `appWindowVerified:true / observationScope:RIGHT_APP_WINDOW_ONLY`로 보고한다. 원본 `resultVerified:false`를 앱 내부 작업 완료로 바꾸지 않으며 Gemini 전송·답변 확인도 아니다. 같은 앱 열기는 완료 후에도 재실행하지 않고 새 읽기 관찰만 할 수 있다. 새 관찰은 schema 검사 전부터 이전 관찰을 비워, 실패한 새 읽기를 과거 화면으로 성공 처리하지 않는다.

**회복 동작이 없는 관찰을 선택한 이유:** 보관 Android의 `agent_snapshot`과 context 없는 RIGHT START는 `snapshotWithCircuitRecovery`에서 이전 앱 복원을 실행할 수 있다. ANDROID 후보에서는 이 경로를 금지하고 CU INSPECT만 사용한다. 기존 Gemini `FORM_SNAPSHOT`/context 없는 `SNAPSHOT`을 순수 읽기로 간주하는 부분도 운영 활성화 전에 수정해야 할 남은 한계다.

`androidAppCandidateSupported:true`는 위 코드 후보를 뜻한다. `androidAppAvailable:false`, `productionRegistered:false`, `liveExecutionVerified:false`는 유지한다. 공개 JSON 검사 성공은 원본 인증을 대신하지 않는다.

### 복구 원본 확인과 현재 주소·사후 결과의 한계

이번 재개에서 보관된 `JH73_TRIP_INSTALL_FIXED.zip`의 SHA-256 `876b26376e81a22fa8fd23c3305e9b247849fac2bc87fce6940883762379c4f0`를 저장된 체크섬과 대조했고, 원 source manifest의 **433개 파일 크기·SHA-256 모두 일치**를 확인했다. 설치·빌드 스크립트를 실행하지 않고 Stage62 FIX3 소스만 읽었다. 이 확인은 현재 설치 APK의 바이트 일치 검증이 아니다.

복구한 전체 Stage62 원본의 `AndroidAgent.finishSnapshot`에서 신뢰된 `browser_address_readback / ANDROID_ACCESSIBILITY_TOOLBAR` row는 **작업창 LEFT 경로**에서만 생성된다. 현재 요구한 GPT LEFT / Chrome RIGHT에서는 이 producer가 동작하지 않는다. 실제 toolbar 읽기 함수는 있으나 다른 경로는 과거 북마크 저장·사이트 전환 판단·OPEN 직후 확인에 쓰이며 현재 RIGHT 주소를 반환하는 독립 호출이 아니다.

브라우저 snapshot은 입력값 대신 라벨·filled metadata를 내보낸다. `InputReadback.verify`는 쓰기 직후 원문을 비교하지만 `form15_verify`는 이후 저장한 전체 페이지 revision과 현재 revision을 비교하므로 독립적인 현재 요청 문장 일치 증거로 승격하지 않는다. CU 구조 digest에는 입력 원문이 포함되지 않는다. native Gemini 전용 draft·local-click receipt도 존재하지만 Chrome에 적용되지 않으며 Google 전송·답변 영수증이 아니다.

후보는 이 원 현재 주소 관찰이 없으면 **`PROVIDER_ADDRESS_UNVERIFIED`**로 차단한다. 폼의 `origin`, 일반 URL 글, 과거 OPEN 주소 확인을 현재 주소 증명으로 바꾸지 않는다. 단순 ‘닫기’는 안내창인지 구별하지 못하므로, 현재 목적 검증은 명시적인 ‘주의사항 닫기’ 대상으로 제한한다.

OPEN은 기존 `describeOpenCompletion`으로 그 작업의 완료 시점 주소만 확인한다. DISCOVER는 이후 별도 원 native snapshot으로 같은 발급 대상이 다시 확인돼야 pending을 해제할 수 있다. TYPE·DISMISS_NOTICE의 현재 값·안내 부재를 독립 확인하는 사후 생산기와 실제 전송·답변의 account/conversation/message 연결은 아직 없다. 원 완료가 수신됐다는 사실만으로 이 장벽을 해제하지 않는다.

`callOriginalTool`, `readCurrentBinding`, `verifyGeminiTarget`의 명시 적용용 원본 host 연결 후보를 추가했지만 production 등록과 실제 휴대폰 지원은 별도다. `verifyObservation`의 Gemini 답변·전송 ID 생산기를 만들었다고 주장하지 않는다. `codeCandidate:true`, `productionRegistered:false`, `geminiAssistanceAvailable:false`, `liveExecutionVerified:false`를 유지한다.

## 실제 휴대폰 기록과 이번 개발의 구분

- **2026-11-04:** 한 번의 OPEN이 `AMBIGUOUS_BROWSER`와 `EFFECT_UNKNOWN`을 반환했다. 반복 실행하지 않았으며 이를 성공이나 미실행으로 바꾸지 않는다.
- **2026-11-05 이전 실행:** 이미 분할된 GPT/Chrome에서 한 번의 Gemini OPEN 후 원 주소 확인과 별도 페이지 관찰이 성공했다. 실제 Gemini 페이지와 안내를 관찰했다. 이것은 전체 화면에서 자동 분할을 시작한 검증이나 세 기능의 전체 성공이 아니다.
- 같은 이전 실행의 안내 닫기는 `OWNER_ADMISSION_BLOCKED / FAILED_PRE_DISPATCH`였고 클릭·입력·전송은 진행되지 않았다. 이 과거 거절을 최신 Stage72의 미확인 원인으로 단정하지 않는다.
- **이번 재개는 코드 개발이다.** 새 휴대폰 명령·클릭·질문 전송·영상 생성·APK 설치를 하지 않았다.

현장 명령·기기·승인·작업 식별자와 개인 화면 원문은 공개 소스에 넣지 않는다. 다른 방의 정보·설치된 플러그인 변경이 자동으로 연결됐다고 가정하지 않는다. 과거 개인 플러그인 반영 이력과 이번 Git 후보의 overlay 변경은 별개다.

## 검사

이번 ANDROID 연결은 기존 GitHub CI에서 검사하며, 최종 head·tree·실행 번호·실제 pass/fail 수는 [Draft PR #145](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/pull/145)에 함께 기록한다. 이번에는 로컬 Node 실행이 가능하여 새 앱 관찰 검사 9개와 새 포트·runtime 검사 13개를 선택 실행했다. 전체 로컬 suite는 원 저장소 의존성이 모두 복구된 checkout이 아니므로 통과했다고 주장하지 않는다. 원본 private binding·실제 생성 composition 경계와 전체 보호 검사는 GitHub의 실제 저장소·기존 lockfile 환경에서 확인한다.

ANDROID 첫 통합 후보 `2575916c8b4983bf7774deac884c1fb99135f9a8`의 [CI #42046198263](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/42046198263)는 보호 원본 **10 pass / 0 fail / 0 skip**, 통합 **336 pass / 1 fail / 0 skip**였다. 새 composition 실패 검사의 기대 상태가 잘못됐다. 원 `jhCommandTool56`는 큐 진입 전 guard 예외를 `ok:false / replayAllowed:false` 결과로 반환하므로 해당 상태는 `UNKNOWN`이 아니라 `BLOCKED`다. target·focus·inspect payload 변형 각각의 정확한 차단 코드, 원 jobs/dispatch 불변, 재실행 금지도 함께 검사하도록 기대값을 수정했다. 실행 코드·원 wrapper·보호 기준은 이 수정에서 변경하지 않았다. 수정 뒤 최종 CI 결과는 위 PR의 해당 head 기록을 따른다.

직전 최종 코드 `e61e14c2f435c73b5b876142461489071f6649d6`의 CI 8개는 모두 성공했다. [후보 검사 #42039142621](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/42039142621)에서 보호 원본 **10 pass / 0 fail / 0 skip**, 통합 **306 pass / 0 fail / 0 skip**였다. 이는 이번 ANDROID 변경 전의 기록이며 새 코드 검사로 재사용해 표시하지 않는다.

직전 검증 후보 `53a52ee38136daf6a03ccd80d0f7905da0347d2f`의 GitHub CI 7개는 모두 성공했다. [원 실행 #42032979279](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/42032979279) 로그에서 보호 원본 **10 passed / 0 failed / 0 skipped**, 통합 **298 passed / 0 failed / 0 skipped**를 확인했다. 이 수치는 이번 추가 변경 전의 기록이다. 실제 최종 생성 서버 overlay 적용·복원과 catalog 보존도 그 검사 범위에 포함됐다. 이전 로컬의 기준 브랜치 보존 영향 범위인 Stage73·Stage75 검사 **8개 통과** 기록은 별도로 유지한다.

직전 후보 `e2827d2f9e4bfa5a9364873d5b8c02e0cee40bbc`의 로컬 통합 검사: **262 passed / 0 failed / 0 skipped**. 해당 후보의 GitHub CI 7개도 성공했다.
두 의존성 경로는 package.json과 lockfile이 같은 기존 설치를 재사용했다.
후속 기준 브랜치 기록 병합 뒤에는 영향 범위인 보호 원본·Stage71·Stage73 검사 **19개 모두 통과**를 확인했다. 제비서 실행 코드와 통합 검사는 이 병합에서 변경되지 않았다.

실행 범위는 [.github/workflows/jh-jebiseo-mobile-candidate.yml](../../../../.github/workflows/jh-jebiseo-mobile-candidate.yml)에 고정한다. 제비서·기존 실제 생성 핸들러·공통 허브 검사와 Stage66/67/69/70/71/72 계약을 함께 실행한다. 같은 중간 생성 파일을 사용하는 원 검사 때문에 `test-concurrency=1`을 유지한다. 보호 원본·pin·승인 규칙을 바꿔 검사를 통과시키지 않는다. 단위·통합·CI 통과는 실제 휴대폰의 입력·전송·답변 성공 증거가 아니다.

### 최신 기준 브랜치 기록 검사와의 호환성 수정

첫 후속 CI [#42038630663](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/42038630663)는 보호 원본 10개와 신규 사후 관찰 8개를 통과했지만, 전체 통합은 **305 pass / 1 fail**이었다. 최신 기준 브랜치에서 가져온 Stage76 검사에 과거 모바일 엔진 이름을 포함한 기록 키 참조가 남아 Stage71의 전체 실행 소스 검사를 충돌시켰다.

Stage71 검사와 Stage76 `current.json` 원문은 유지했다. Stage76 검사는 기록에 보고된 `ActiveRoutes` 수치 항목이 정확히 하나이며 정수 0인지 검사하도록 고쳤다. 항목 누락·추가·문자열·양수는 실패하며, 이름을 조립하거나 scanner 예외를 넣지 않는다. 실제 경로·기기 설치·과거 완료 기록을 변경한 것이 아니다. 최종 재검사 결과는 PR #145의 최신 head에 연결한다.

## 이어갈 위치

현재 APK 유지 조건에서 ANDROID의 원본 앱 열기와 독립 CU 관찰을 후보에 연결했다. 다음 운영 연결 때는 원본 명령·기기·taskDigest와 실제 APK가 이 생산기를 제공하는지 확인해야 한다. 코드·가상 완료 fixture·CI를 실제 휴대폰 성공으로 바꾸지 않는다.

Gemini 웹의 RIGHT 현재 주소·정확한 현재 입력값·안내 부재 생산기는 복구 원본에서 제공되지 않는다. 서버 검사기만 더 추가해 해결할 수 있는 결손이 아니다. 현재 APK 유지 조건을 바꾸지 않고 이를 자동 전송 가용성으로 올리지 않는다. YOUTUBE·VIDEO의 실제 현재 요청·전송·답변·영상 회수도 미완료다. 실제 실행 요청과 유효한 원명령이 있는 때만 휴대폰을 조작한다. 개발 재개만으로 BEGIN·재OPEN·질문 전송을 시작하지 않는다.

운영 PR 병합·서버 배포·APK 설치는 이번 개발 결과에 포함하지 않는다. 같은 기준과 검사·승인 기록을 재사용하며, 중지 요청이 오면 즉시 작업을 멈춘다.
