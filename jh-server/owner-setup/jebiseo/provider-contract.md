# 제비서 제공자 계약 — 자동 선택·메뉴·실행

갱신일: 2026-11-06 (KST). 최신 요구는 **왼쪽 GPT에서 요청문 선택 → ‘Gemini에게 물어보기’ 클릭 → 오른쪽 Gemini 실행 클릭**이다. 후보 기본값은 `AUTO_TEXT_SELECTION`이다. `TEXT_SELECTION` 수동 안내와 구별한다.

## 요청 준비와 세 기능

`prepareJebiseoHandoff({taskRef,threadRef,sourceRef,intent,basis,feature,requestText,target?,youtubeUrl?})`의 원 의미 입력 계약을 유지한다. `intent:'execute'`와 `basis:'direct'|'contextual_user_request'`가 필요하다. 개발·설명·인용·부정은 실행하지 않는다. 전달 옵션을 이 request 객체 안에 넣지 않는다.

| feature | 내용 | 결과 정책 |
| --- | --- | --- |
| ANDROID | Gemini가 실제 지원·연결하는 삼성 앱·기기의 대상·동작·필요 내용 | GEMINI |
| YOUTUBE | 현재 요청의 정확한 링크와 분석 질문 | GPT_AFTER_MANUAL_SHARE |
| VIDEO | 제작 요청, 기존 구독 범위와 추가 결제 없음 | GEMINI |

준비 함수는 도구를 실행하지 않는다. 원문·요청 digest와 참조를 보존하며 긴 요청을 조용히 자르지 않는다. 자동 네이티브 경로의 상한은 기존 Gemini 계약인 1200 code points / UTF-8 2048 bytes다. 의미 입력의 `surface`와 `routingModel`은 기존 호환 필드이며 실제 열린 화면의 증거가 아니다.

## 호스트 lifecycle

```js
const session = host.createHandoffRuntime({
  request, // 준비 완료 객체가 아닌 원 의미 입력
  deliveryMode: 'AUTO_TEXT_SELECTION',
  requiresResultInspection, // 기존 작업의 실제 미확정 상태
  deviceId, commandId       // 이미 유효한 원 호스트 연결
});
const display = session.presentation();
// host: display.preparedPrompt를 현재 왼쪽 GPT 화면에 한 번 표시
const state = await session.start();
// 원 완료 대기 또는 기존 로컬 승인 처리 후에만 같은 session에서:
const resumed = await session.resumeAutomation();
```

`presentation()`은 실행 전에 `DISPLAY_REQUEST_TEXT`와 정확한 `preparedPrompt`를 제공한다. 전달할 텍스트는 독립된 한 블록으로 표시하고 비서 배지·코멘트는 제외한다. 화면에 먼저 보이도록 한 뒤 `start()`한다. 실제 선택 범위를 확인할 수 없으면 시작 성공으로 꾸미지 않는다.

동일 task는 request/thread/source/digest, 기기·명령, deliveryMode, inspection flag, nativeSelection descriptor가 일치하는 같은 session을 재사용한다. `nativeSelection`은 요청 참조만 든 descriptor이며 화면 증거가 아니다. 외부 caller가 native runtime, success callback, signed job, receipt, 승인 값을 공급하지 않는다. binding이 실제 등록 도구·현재 요청 capability·원 job·완료 정보를 연결한다.

`requiresResultInspection:true`는 모든 전달 방식에 우선한다. 새 task·모드·진행 보고로 미확정 효과를 없애지 않는다. AUTO 모드의 `reportManualProgress()`는 전송 증거가 될 수 없으며 거부된다.

## 실제 세 단계와 원 경로

| phase | 원 `life_android_step.action` | 다음 단계의 조건 |
| --- | --- | --- |
| SELECT_REQUEST_TEXT | jebiseo_select_request_text | 원문과 실제 선택 시작·끝이 일치하는 휴대폰 영수증 |
| CLICK_GEMINI_MENU | jebiseo_click_gemini_menu | 앞 선택 영수증과 실제 메뉴 클릭 후 오른쪽 Gemini 초안 일치 |
| SUBMIT_GEMINI | jebiseo_submit_gemini | 앞 메뉴 영수증, 같은 초안·창·전송 대상, 기존 정확한 로컬 승인과 제출 관찰 |

공개 도구 이름·스키마는 기존 `life_android_step`을 사용한다. 세 전용 carrier는 원 내부 invocation에서만 인정한다. source overlay가 실제 원 handler의 `mk` 앞에 버전 계약과 서명 대상 metadata를 넣고 기존 signJob → durable 예약 → queue → Stage26 서명 완료 경로를 유지한다. 새 임의 엔드포인트나 일반 LEFT 클릭 권한을 만들지 않는다.

Android는 검증된 전체 원 job을 전용 실행기에 전달한다. 원문이 한 번 나타나는 실제 native ChatGPT 노드에서 지원되는 LONG_CLICK/SET_SELECTION과 실제 offsets를 사용한다. 메뉴의 정확한 이름·선택 문맥 귀속을 확인한 뒤 ACTION_CLICK한다. Gemini 제출은 기존 GeminiSubmitReviewPolicy와 exact approval, executeRightPane의 클릭 직전 재검토를 사용한다. 직접 Intent·재입력으로 선택 메뉴 동작을 대체하지 않는다.

휴대폰 영수증은 임의 성공 JSON이 아니라 동일 command/session/task/run/text에 묶인 짧은 수명의 process-local capability다. command/site/service 변경에서 폐기한다. 중복 requestId는 동일 내용과 기존 결과에만 대응하며 다른 내용이나 완료된 클릭을 새로 실행하지 않는다.

## 상태·승인·중복 방지

- `READY/RUNNING`: 준비 또는 기존 원 동작 처리 중이다.
- `AWAITING_COMPLETION`: 원 job의 서명 완료를 기다린다. 재개는 그 job을 읽으며 같은 클릭을 발행하지 않는다.
- `AWAITING_APPROVAL`: 실제 기존 휴대폰 승인 절차를 기다린다. 같은 phase/requestId/value로만 재개한다. 원격 승인·새 권한·대신 승인 기능을 만들지 않는다.
- `COMPLETED`: 제출 관찰이 검증됐을 때만 `submissionVerified/requestSent`를 올린다. 삼성 앱 작업·유튜브 분석·영상 생성 완료의 증거가 아니다.
- `BLOCKED`: 해당 단계의 현재 조건을 충족하지 못했다.
- `UNKNOWN`: 동작 후 결과가 불명확하다. 자동·수동 재전송을 안내하지 않는다.

`selectionVerified`, `menuClickVerified`, `submitClickVerified`는 검증된 단계까지만 올린다. `resultVerified`, `businessResultVerified`, `geminiReplyVerified`, `automaticReturnToGpt`, `automaticReplay`는 false다. 버튼 dispatch만 확인된 경우 제출 성공과 구분한다. 늦은 응답·잘못된 job·다른 명령·변경된 완료 결과·만료된 영수증은 다음 클릭을 허용하지 않는다.

## 유튜브 분석의 GPT 복귀

YOUTUBE의 `returnToGpt:true / resultDestination:'GPT_AFTER_MANUAL_SHARE'` 요구를 보존한다. 분석이 끝난 뒤 실제 공유 목록이나 사용자가 확인한 메뉴로 결과를 현재 GPT에 가져오게 한다. `session.prepareManualReturn()`은 YOUTUBE에서 기본 true, ANDROID·VIDEO에서 false다. `requested:false`로 안내를 끌 수 있으며 다른 기능은 요청한 때 true를 사용한다.

이 함수는 자동으로 답변을 읽거나 GPT에 삽입하지 않는다. 보지 않은 ‘ChatGPT로 보내기’ 메뉴를 만들지 않는다. 현재 대화에 실제 결과가 들어왔을 때 비교·재정리를 이어간다. 자동 역방향 결과 수집은 별도 미완성 범위로 남는다.

## 명시적인 수동 대안

`TEXT_SELECTION`은 기존 순수 안내 경로다. 원 runtime/폰 도구 없이 준비문과 선택 메뉴 사용 순서를 보여 준다. `reportManualProgress`의 OPEN/HANDOFF/INPUT/SUBMIT는 사용자 보고이며 독립 검증이 아니다.

`OPEN_MANUAL`은 기존 YOUTUBE·VIDEO 웹 OPEN 1회와 동일 원 job 조회 뒤 수동 입력·실행을 사용한다. 삼성 요청은 Gemini 모바일 앱 열기부터 수동이다. 원 OPEN이 불명확하면 같은 열기를 반복하지 않는다. 두 대안 모두 자동 세 단계 구현·성공으로 표시하지 않는다.

## 가용성·설치 상태

허브의 `HANDOFF_PREPARATION/ready:true`는 요청 준비 가능성이다. 자동 요청도 `executionReady:false`, `dispatchesTools:false`, `authorizesExecution:false`를 유지하고 실제 binding이 실행 조건을 확인한다. 준비 가능성으로 full `gemini-assistance`나 실기기 성공을 만들지 않는다.

기존 Stage62 FIX3 APK에 왼쪽 선택 실행기가 없으므로 이 후보는 새 Android 코드와 원 서버 overlay를 함께 요구한다. 기존 설치본을 그대로 자동 가능하다고 설명하지 않는다. 원 서명 키·정식 배포 경로를 보존한다. 후보의 빌드 성공은 설치·기기 실행 성공이 아니다.

Stage72 / PR #159 (`5d72b78fd3730111076b33e2771f5b6b70f657aa`)의 기준과 Stage71 Android → Manual 호환 경로를 보존한다. 실제 검증 전 `codeCandidate:true`, `productionRegistered:false`, `geminiAssistanceAvailable:false`, `liveExecutionVerified:false`를 유지한다.
