# 제비서 제공자 계약 — Gemini 실행과 Manual 인계

## 최신 기본 흐름

**휴대폰의 왼쪽 GPT / 오른쪽 Gemini를 고정한다.** 사용자가 GPT에서 요청하면 필요한 대상·동작·내용을 준비하고, 지원되는 기존 Android 단계를 진행한 뒤 안 되는 단계는 **기존 Stage71 Android → Manual** 방식으로 이어간다. 완전 자동 입력·클릭·답변 회수를 Manual 인계의 선행 조건으로 요구하지 않는다.

**YOUTUBE 분석 결과와 VIDEO 생성 결과는 Gemini에서 확인한다. GPT 자동 재전송, 답변 수집, 영상 내보내기·파일 회수는 기본 개발 범위에서 제외한다.** 사용자가 나중에 GPT에 다시 질문하면 그때의 새 요청을 처리한다. 결과 복사·가져오기를 정상 흐름의 필수 단계로 넣거나 GPT가 오른쪽 결과를 자동으로 읽었다고 가정하지 않는다.

## 세 기능의 요청과 확인 위치

| 기능 | 전달할 요청 | 결과 확인 | 현재 연결 방식 |
| --- | --- | --- | --- |
| `ANDROID` — Gemini에 삼성 앱·기기 작업 위임 | 사용자가 지정한 앱·기기, 동작, 필요한 내용. 일정 관리·삼성 노트·계산기 실행·알람·지원되는 연결 기기 제어 등이 예시다. | Gemini와 해당 앱·기기에서 확인 | 삼성 연동에는 Gemini 모바일 앱이 필요하다. 현재 확인된 자동 네이티브 연결이 없으면 Manual로 인계한다. |
| `YOUTUBE` — 유튜브 분석 | 현재 요청의 영상 링크와 분석 질문 | 오른쪽 Gemini에서 확인 | 기존 휴대폰 웹 OPEN을 사용할 수 있다. 입력·실행은 실제 지원된 자동 단계 또는 Manual로 이어간다. |
| `VIDEO` — 영상 생성 | 사용자가 요청한 제작 프롬프트 | 오른쪽 Gemini에서 생성 상태와 영상을 확인 | 기존 휴대폰 웹 OPEN을 사용할 수 있다. 현재 계정의 포함 사용량·추가 결제 조건과 필요한 모드 선택을 확인하며 Manual로 이어갈 수 있다. |

`ANDROID`의 위임 범위는 **현재 Gemini가 지원하고 사용자가 연결한 삼성 앱·기기에서 수행할 수 있는 작업 전체**다. 예시 목록이나 기존 직접 열기의 세 패키지로 제한하지 않는다. 다만 기기·계정의 실제 지원을 확인하지 않고 모든 삼성 기기가 연결·제어된다고 표시하지 않는다. “계산기 열어 줘”처럼 대화에서 따로 추출할 자료가 없는 직접 실행 요청도 받는다.

삼성 앱·기기 지원은 [Google의 연결 앱 목록](https://support.google.com/gemini/table/17434654?hl=ko)과 [Android 기기 제어 안내](https://support.google.com/gemini/answer/15235441?hl=ko)를 확인한다. Gemini 웹을 열었다는 사실을 삼성 모바일 앱 연동의 증거로 사용하지 않는다.

## 순수 요청 준비와 실제 실행을 구분한다

`jh-server/owner-setup/jebiseo/handoff-request.mjs`는 최신 세 기능의 요청과 수동 인계 정보를 준비하는 순수 모듈이다.

- `prepareJebiseoHandoff({taskRef,threadRef,sourceRef,intent,basis,feature,requestText,target?,youtubeUrl?})`는 명시적 실행 요청의 대상·동작·문맥을 보존한다. `intent:"execute"`, 사용자 요청에 근거한 `basis`, 현재 작업·원 요청 참조를 사용한다.
- 준비된 요청은 `surface:"GEMINI_NATIVE"|"GEMINI_WEB"`, `layout:"LEFT_GPT_RIGHT_GEMINI"`, `resultDestination:"GEMINI"`, `returnToGpt:false`와 프롬프트·요청 digest를 담는다. digest는 요청 일치 확인용이며 인증·실행 증거가 아니다.
- `createJebiseoManualHandoff(request,{taskRef,threadRef,sourceRef,requestDigest,step,outcome,receiptRef?})`의 `request`는 위 준비 함수의 반환 객체다. 같은 요청의 현재 단계에 맞는 수동 안내를 준비하며 서버 발급 승인이나 MCP mode를 생성하지 않는다.

이 준비에는 네트워크, 휴대폰 명령, 새 승인, 클릭·전송, 답변 회수 또는 영상 파일 처리가 없다. 입력 길이 적합성이나 영상 정책 값은 실제 입력 성공·구독 가용성의 증거가 아니다.

`handoff-runtime.mjs`와 원 binding의 `createHandoffRuntime({request,deviceId?,commandId?})`은 기존 웹 OPEN의 한 번 호출과 같은 원 job 조회를 연결한다. 실제 자동 호출에는 유효한 원 실행 범위를 사용한다. 현재 인계 실행기는 TYPE·SUBMIT·FORM_SNAPSHOT·답변 회수·영상 내보내기를 자동 호출하지 않는다. 삼성 네이티브 요청과 자동 지원이 없는 단계는 Manual로 이어간다.

`createHandoffRuntime`의 `request`에는 `prepareJebiseoHandoff`에 넣는 **원 의미 입력 객체**를 전달한다. `REQUEST_READY` 준비 완료 객체를 다시 넣지 않는다. factory가 내부에서 준비 함수를 실행하고 같은 task·요청·기기·명령의 session을 재사용한다.

반환된 session의 `presentation()`으로 남은 수동 절차와 아직 필요한 준비 문장을 한 번에 안내한다. `requiresUserReply:false`이며 단계마다 완료 답변을 요구하지 않는다. 사용자가 자발적으로 `INPUT` 완료를 알렸으면 기존 입력 문장 확인과 실행만 안내하고 다시 입력시키지 않는다. `SUBMIT` 완료 보고 뒤에는 Gemini에서 결과 보기만 안내한다. 늦게 온 이전 단계 보고로 안내를 되돌리지 않는다. 실행이 불확실하면 기존 화면·원 결과 확인을 먼저 안내한다.

요청 준비 성공은 Gemini 열기·전송·분석·앱 작업의 성공이 아니다. 원본 host와 연결한 자동 단계는 그 단계의 실제 결과를 별도로 확인한다. 순수 모듈의 진단값이나 호출자가 넣은 boolean으로 원 command·receipt·승인·가용성을 만들지 않는다.

현재 대화에서 사용자가 요청한 작업에 필요한 최소 내용만 전달한다. 다른 방의 대화·전체 개인 기억·파일을 자동 전달하지 않는다. 개발·사용법·인용·부정은 실행 요청으로 취급하지 않는다.

## Android → Manual과 중복 실행 방지

| 현재 상태 | 다음 처리 |
| --- | --- |
| 자동 단계가 미지원이고 아직 해당 효과를 실행하지 않음 | 준비한 요청과 현재 단계부터 Manual로 인계한다. 지원되지 않는 자동화를 먼저 완성하도록 기다리지 않는다. |
| 원 서버가 Manual 인계를 반환함 | 실제로 반환된 원 작업·인계 참조와 절차를 유지한다. 없는 MCP 도구·mode·승인·인계 코드를 만들지 않는다. |
| 이전 효과가 `PENDING` 또는 `UNKNOWN` | 원 영수증·작업 상태나 현재 화면을 먼저 확인한다. 자동 재전송 또는 같은 효과의 수동 반복을 지시하지 않는다. |
| 원 결과가 `STOP_NO_REPLAY` 또는 재검토 요구 | 원 결과의 재실행 금지와 확인 절차를 보존한다. Manual을 우회 수단으로 사용하지 않는다. |
| 사용자가 수동으로 처리했다고 알림 | 사용자 보고로 구분한다. 독립 검증된 전송·분석·앱 저장·기기 동작으로 올리지 않는다. |
| 실제 자동 요청 전달만 확인됨 | 전달 단계까지만 보고한다. 분석·영상 생성 완료나 GPT 결과 수신을 함께 선언하지 않는다. |

`MANUAL`이라는 상태만으로 이전 시도가 미실행이었다고 단정하지 않는다. 기존 pending·원 영수증·한 번 실행 보호는 유지한다. 자동 입력 또는 전송이 불확실할 때 새 명령이나 다른 task를 만들어 같은 내용을 다시 보내지 않는다.

Manual 안내 뒤 완료 회신을 의무적으로 요구하지 않는다. 사용자가 자발적으로 알려 준 완료 내용만 사용자 보고로 다루며, 이를 다음 자동 동작의 권한으로 사용하지 않는다.

## 기존 자동 OPEN과 대상별 경로

- YOUTUBE·VIDEO의 웹 대상은 `https://gemini.google.com/app`이다. 실제 카탈로그의 `life_web_navigate` → 원 Secure56 `right_web_link` 경로를 현재 유효한 명령·기기·승인 범위에서 사용한다.
- 삼성 앱·기기 작업은 Gemini 모바일 앱을 대상으로 한다. 현재 후보의 웹 OPEN을 네이티브 Gemini 자동열기로 표시하지 않는다. 지원되지 않는 네이티브 열기·입력·실행 단계는 Manual 안내로 이어간다.
- “제미나이 열어줘”라는 `intent:open`은 화면만 여는 요청이다. 분석·프롬프트 전송·영상 생성을 덧붙이지 않는다. 실제 제공되지 않은 GPT 버튼을 만들었다고 안내하지 않는다.
- 이미 올바른 오른쪽 대상이 확인됐다면 다시 열지 않는다. 새로 열었으면 같은 원 job·receipt로 실제 페이지·배치를 확인한다. 링크 클릭이나 큐 접수만으로 배치·요청 전달을 확인했다고 말하지 않는다.
- OPEN 결과가 불명확하면 원 결과부터 확인한다. 자동 OPEN이 지원되지 않는 경우의 Manual 인계와, 이미 실행했을 수 있는 OPEN의 반복을 구분한다.

## 가용성과 완료 표시

`resolveGeminiAvailability(status,{visibility:"VISIBLE"|"INTERNAL"})`는 신뢰된 현재 host 상태를 읽는 기존 순수 가용성 검사다. 이 검사와 실제 실행 권한은 별개다. `gemini-assistance`가 없다는 이유만으로 순수 요청 준비와 허용된 Manual 안내를 막지 않는다.

| 항목 | 의미 |
| --- | --- |
| 요청 준비·수동 인계 안내 | 이번 요청의 대상·동작·내용과 다음 사용자 행동을 정리한 상태. 외부 실행 증거가 아님 |
| `productionRegistered` | 실제 운영 경로에 등록됐을 때만 true |
| `codeCandidate` | 개발 후보 표시. 운영 가용성·실사용 성공이 아님 |
| `geminiAssistanceAvailable` / `liveExecutionVerified` | 해당 실제 연결과 실행 근거가 있을 때만 true. Manual 안내나 사용자 보고만으로 바꾸지 않음 |
| `runtimeMode` / `mobileRoute` | 기존 가시 자동 경로의 `PHONE_RIGHT` / `android_right`. 삼성 네이티브 자동화 지원을 뜻하지 않음 |
| `internalExecutionSupported` | 별도로 요청된 숨김 실행에 관한 값. 가시 또는 Manual 진행을 위해 true로 꾸미지 않음 |

현재 후보의 `codeCandidate:true`, `productionRegistered:false`, `geminiAssistanceAvailable:false`, `liveExecutionVerified:false`를 유지한다. 새 요청 준비·인계 코드나 검사 통과를 설치된 플러그인의 갱신·휴대폰 실행으로 표현하지 않는다. 준비, 열기, 전달, 사용자 보고, 독립 검증된 실제 동작을 각각 확인한 단계까지만 설명한다.

## 기존 자동 입력·결과 검증의 별도 보존

기존 자동 입력은 원본 snapshot/discovery가 발급한 `form15_discover`, `form15_type`, `form_activate` 인자를 사용한다. 실제 현재 Gemini 창·기기·명령·세션·대상 검증과 원 승인을 유지하고, generic `item_`를 native `f_`로 바꾸거나 인자를 만들어 넣지 않는다. 정확한 현재 입력값·전송 대상 증거가 없으면 자동 단계를 멈추고 허용된 Manual 단계로 이어간다.

보관 Stage62의 `FORM_SNAPSHOT`과 context 없는 `SNAPSHOT`에는 화면 복원 가능성이 있다. 새 순수 요청 준비·Manual 안내의 선행 읽기로 이 경로를 호출하지 않는다. 원본 효과 이후의 독립 관찰·pending 해제 조건을 낮춰 자동 성공을 만들지 않는다.

기존 직접 앱 열기 `intent:open_app / feature:ANDROID / action:OPEN_APP`와 세 패키지 매핑은 별도 호환 기능이다. 새 삼성 위임 요청을 이 경로로 라우팅하지 않는다. 그 직접 경로의 원 앱 완료·별도 `APP_OBSERVE` 검증은 그대로 보존하며, 성공 범위는 현재 오른쪽 앱 창 확인까지다.

`reply-proof.mjs`와 원본 영상 파일 검증은 과거 결과 반환 흐름의 별도 기반으로 보존한다. 최신 YOUTUBE·VIDEO 기본 흐름은 이를 호출하거나 답변 회수·파일·GPT 전달을 요구하지 않는다. 이후 실제 반환 기능을 별도로 요청받으면 그때 원본 메시지·계정·작업 연결과 파일 검증을 적용한다.

## 기준과 변경 이력

원본 기능·실행 이력은 [PR #63의 요청 계약](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/blob/67c69428f27030237f417753c717ab758faaa855/jh-server/owner-setup/gemini-native/src/contract.mjs)과 [원본 실행 흐름](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/blob/67c69428f27030237f417753c717ab758faaa855/jh-server/owner-setup/gemini-native/src/native-workflow.mjs)에 남는다. 과거의 세 앱 직접 열기·결과 반환 의무를 최신 Gemini 위임·Manual 기본 방침으로 다시 가져오지 않는다.

설치·서버 기준은 **Stage72 / PR #159 (`5d72b78fd3730111076b33e2771f5b6b70f657aa`), Stage62 FIX3 APK 유지 + Stage71 Android → Manual**이다. 현재 개발에서 InstallOnly ZIP, 재설치·재빌드·데이터 초기화, 별도 Gemini API·새 계정·추가 결제·PC/서버 브라우저로 전환하지 않는다. 기존 일반 웹 Playwright는 유지한다.
