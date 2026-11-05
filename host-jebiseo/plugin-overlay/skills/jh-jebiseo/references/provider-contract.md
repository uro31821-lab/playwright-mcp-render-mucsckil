# 제비서 제공자 계약 — 텍스트 선택 전달과 유튜브 분석의 수동 복귀

갱신일: 2026-11-06 (KST). 최신 기본은 **휴대폰의 왼쪽 GPT / 오른쪽 Gemini, 선택한 문장을 ‘Gemini에게 물어보기’로 전달**하는 방식이다. 요청 내용과 전달 방식을 구분하고 기존 Android → Manual 기반을 보존한다.

## 기능과 결과 위치

| 기능 | 요청 내용 | 결과 확인 |
| --- | --- | --- |
| `ANDROID` | Gemini가 실제 지원·연결하는 삼성 앱·기기의 대상·동작·필요 내용. 일정·노트·계산기·연결 기기는 예시이며 고정 세 앱 목록으로 제한하지 않음 | Gemini 또는 실제 대상 앱·기기 |
| `YOUTUBE` | 현재 요청의 정확한 영상 링크와 분석 질문 | Gemini 분석 완료 후 사용자 선택·공유로 GPT에 돌아와 이어가기 |
| `VIDEO` | 현재 요청의 제작 프롬프트. 기존 구독 포함 범위·추가 결제 없음 | Gemini의 생성 상태·영상 |

삼성 앱·기기 요청에는 실제 Gemini 모바일 환경의 지원·연결이 필요하다. 전달 메뉴만으로 모든 삼성 기기 제어를 지원한다고 판단하지 않는다. **YOUTUBE는 분석 완료 후 수동 공유로 GPT에서 이어가는 순서를 기본으로 포함한다.** ANDROID·VIDEO 결과는 Gemini에 둔다. 자동 답변 수집·영상 export·백그라운드 GPT 반환은 하지 않는다.

## 기존 요청 입력 계약

`handoff-request.mjs`의 `prepareJebiseoHandoff({taskRef,threadRef,sourceRef,intent,basis,feature,requestText,target?,youtubeUrl?})`를 유지한다. `intent:'execute'`, `basis:'direct'|'contextual_user_request'`와 현재 요청 참조를 사용한다. 개발·인용·부정·일반 설명은 실행하지 않는다.

이 함수의 **원 의미 입력 키는 그대로** 유지하고 현재 기능별 결과 정책에 따라 준비한다. task/thread/source·프롬프트·요청 digest 검증을 유지한다. **`deliveryMode`나 `requiresResultInspection`을 원 의미 request 객체에 넣지 않는다.** 요청 준비에는 네트워크·휴대폰 명령·클릭·전송·답변 회수가 없다. 지원 길이 안에서 자동 입력 상한을 넘는 문장도 잘라 보내지 않는다.

기존 요청의 `surface:'GEMINI_NATIVE'|'GEMINI_WEB'`, 프롬프트·요청 digest는 요청 분류와 일치 확인용이다. 새 선택 메뉴가 실제로 연 화면이나 전송을 검증한 값이 아니다. `layout:'LEFT_GPT_RIGHT_GEMINI'`를 유지한다. **YOUTUBE는 `returnToGpt:true / resultDestination:'GPT_AFTER_MANUAL_SHARE'`, ANDROID·VIDEO는 `returnToGpt:false / resultDestination:'GEMINI'`**다. 모든 기능의 `automaticReturnToGpt:false`를 유지하며 반환 목적지는 수신 완료 증거가 아니다. TEXT_SELECTION 안내의 `surface:'ANDROID_TEXT_SELECTION_MENU'`도 메뉴 경로일 뿐이다. `nativeGeminiRequired`는 ANDROID 요청의 조건으로 유지한다.

`createJebiseoManualHandoff(request,transition)`의 request는 준비 함수가 반환한 객체다. 이는 기존 OPEN·INPUT·SUBMIT 안내용 순수 함수이며 공개 JSON이나 사용자 보고를 인증된 영수증으로 승격하지 않는다.

## session과 binding API

```js
const session = host.createHandoffRuntime({
  request,                              // prepareJebiseoHandoff의 원 의미 입력
  deliveryMode: 'TEXT_SELECTION',        // 기본값
  requiresResultInspection: false,      // 현재 작업의 실제 미확정 상태를 보존
  deviceId,
  commandId
});
await session.start();
const display = session.presentation();
```

`createHandoffRuntime`의 request에는 **준비 완료 반환 객체를 다시 넣지 않는다.** factory가 내부에서 준비하고 같은 task의 session을 재사용한다. `threadRef`, `sourceRef`, 요청 digest, 기기·명령과 함께 **deliveryMode·requiresResultInspection도 재사용 identity에 포함**한다. 같은 task를 다른 방식이나 장벽 값으로 재생성하지 않는다.

- `deliveryMode:'TEXT_SELECTION'`이 기본이다. 원 runtime을 생성하거나 폰 도구를 호출하지 않는다.
- `deliveryMode:'OPEN_MANUAL'`은 기존 선택적 웹 OPEN + 수동 입력 흐름을 명시적으로 선택한다.
- `requiresResultInspection:true`는 두 방식 모두에서 최우선이다. 현재 task의 pending/unknown을 전달 방식 변경이나 수동 보고로 해제하지 않는다. 위 예시의 false를 기존 미확정 작업에 그대로 복사하지 않는다.
- `deviceId`·`commandId`는 이미 유효한 원본 연결에서만 사용한다. 순수 선택 안내 때문에 새 명령을 만들지 않는다.

## 기본 TEXT_SELECTION 흐름

`start()`는 전달 안내를 준비한다. `presentation()`의 `preparedPrompt`와 `manualSteps`를 함께 보여 주되, **전달 문장만 독립된 한 덩어리**로 표시한다. 비서 배지·설명·진행 상태는 그 밖에 둔다. 현재 요청에 필요한 최소 문맥만 전달하며 다른 방이나 전체 기억을 자동으로 포함하지 않는다.

사용자는 준비 문장을 선택하고 현재 휴대폰의 **‘Gemini에게 물어보기’** 메뉴를 누른다. 선택 경로에 별도 자동 OPEN, 수동 재입력, 자동 실행 버튼 클릭을 덧붙이지 않는다. 메뉴 뒤에는 Gemini가 받은 내용을 확인하고 **초안 상태일 때만 실행**하도록 안내한다. 이미 응답 중이거나 결과가 있으면 같은 내용을 다시 보내지 않는다.

YOUTUBE의 첫 안내에는 **분석 완료 후 분석 내용을 선택·공유해 현재 GPT 대화에서 이어가는 순서**도 포함한다. 별도로 ‘반환해 줘’를 다시 요구하지 않는다. `requiresUserReply:false`를 유지하며 단계별 완료 회신은 필수가 아니다. 선택·공유 메뉴 사용을 전송·오른쪽 배치·분석·GPT 결과 수신 완료로 표시하지 않는다. 메뉴의 정확한 내부 Intent와 실행 범위도 사진만으로 확정하지 않는다.

왼쪽 GPT / 오른쪽 Gemini는 유지할 배치 요구다. 실제 열린 위치는 별도 확인하며 이 안내가 자동 분할·오른쪽 강제 배치·새 GPT 버튼·새 APK 기능을 만든다고 주장하지 않는다.

## 선택적 진행 보고와 원 결과 확인

`session.reportManualProgress({taskRef,threadRef,requestDigest,step})`는 기존 `OPEN|INPUT|SUBMIT`와 **TEXT_SELECTION 전용 `HANDOFF`** 보고를 받는다. 보고는 선택 사항이며 이전·중복 보고가 더 진행된 안내를 뒤로 돌리지 않는다.

선택 전달 뒤에는 받은 요청·현재 입력·결과를 확인하는 방향으로 안내하고 다시 선택해서 보내도록 돌리지 않는다. INPUT 보고 뒤에는 기존 문장 확인·실행만 안내한다. SUBMIT 보고 뒤에는 결과를 확인하며 YOUTUBE는 분석 완료 후 수동 공유 단계로 이어간다. `HANDOFF` 보고도 실제 전송·반환 수신이나 자동 실행 권한의 증거가 아니다.

현재 작업이 결과 확인을 요구하면 `presentation()`과 후속 안내에도 그 장벽을 유지한다. 원 `PENDING / UNKNOWN / FAILED_AFTER_EFFECT / PHONE_SCOPED_SITE_DISCARD / EFFECT_UNKNOWN / NEEDS_REVIEW_NO_REPLAY`를 새 task·전달 방식·사용자 보고로 미실행 또는 성공으로 바꾸지 않는다. 기존 원 작업·현재 화면부터 확인하고 자동·수동 반복 전송을 안내하지 않는다.

준비·안내·사용자 보고에서는 `requestSent:false`, `resultVerified:false`, `externalEffectVerified:false`, `geminiReplyVerified:false`, `automaticReturnToGpt:false`를 유지한다. 기능별 `returnToGpt`는 수동 반환 의도를 나타내며 실제 수신의 증거가 아니다. 늦은 OPEN 응답·오류·상태 조회가 이후 수동 진행을 되돌리지 않으며 같은 원 job 참조를 보존한다.

## Gemini → GPT 수동 반환

`session.prepareManualReturn()`에서 requested를 생략하면 **YOUTUBE는 true, ANDROID·VIDEO는 false**를 사용한다. YOUTUBE의 수동 복귀는 최신 기본 흐름이므로 별도 반환 요청을 다시 받지 않는다. `requested:false`는 반환 안내를 끄고, 다른 두 기능은 명시적인 `requested:true`로 안내를 요청할 수 있다. 결과 확인 장벽을 반환 안내로 우회하지 않는다.

분석 완료 후 Gemini의 실제 공유 목록 또는 사용자가 확인한 메뉴를 이용한다. 확인하지 않은 ‘ChatGPT에게 보내기’ 항목을 만들지 않는다. **현재 GPT 대화에 실제 분석 내용이 들어왔는지 확인한 뒤** 후속 비교·정리를 이어간다. 공유 대상 선택이나 사용자 완료 보고만으로 현재 대화 자동 복귀·삽입·수신을 보장하지 않는다.

이 API는 Gemini 답변을 읽거나 GPT에 내용을 전송하지 않는다. 자동 수집·영상 내보내기·플랫폼 간 대화 ID 연결을 추가하지 않는다. `returnToGpt:true`인 YOUTUBE도 `automaticReturnToGpt:false`이며 사용자가 직접 선택·공유한다. 수신을 확인하기 전에는 분석 결과를 받았다고 표시하지 않고, 이 대화에 실제로 들어온 내용만 후속 작업에 사용한다.

## 명시적 OPEN_MANUAL 경로

기존 `start()`의 웹 OPEN 1회와 보관된 같은 원 job의 명시적 `readOpenStatus()`를 보존한다. YOUTUBE·VIDEO 대상은 `https://gemini.google.com/app`이며 실제 원 `life_web_navigate` → Secure56 `right_web_link` 경로의 현재 기기·명령·세션·원 승인 범위를 사용한다.

삼성 요청은 Gemini 모바일 앱을 열기부터 수동 안내한다. 웹 OPEN을 삼성 네이티브 연동 증거로 사용하지 않는다. 자동 TYPE·SUBMIT·FORM_SNAPSHOT·답변 회수·영상 export는 호출하지 않는다. 지원되지 않는 자동 단계는 수동으로 이어가되, 이미 실행했을 수 있는 OPEN은 재시도하지 않는다.

큐 응답의 `ok:true`나 job 접수는 오른쪽 배치·전송 성공이 아니다. 같은 session의 반복·동시 start는 추가 OPEN을 만들지 않는다. 원 완료·단계별 관찰의 기존 검증 조건을 낮추지 않는다. 현재 카탈로그에 없는 `MANUAL_WAIT`·`MANUAL_DONE` 모드를 만들어 호출하지 않는다.

## 가용성, 원본 보호와 적용 상태

공통 허브의 `HANDOFF_PREPARATION / ready:true`는 현재 스킬을 통한 준비 가능성이다. `executionReady:false`, 실행 권한 없음, 실제 Gemini 기여 없음으로 구분한다. activeTask의 `requiresResultInspection`을 유지해 session에 전달한다.

실제 자동 Gemini 의견 회수(full consult)에는 기존 `resolveGeminiAvailability`와 `gemini-assistance` 검증을 유지한다. 이 조건을 선택 안내·YOUTUBE 기본 수동 복귀·다른 기능의 요청된 수동 반환 안내에 확대하지 않고, 준비 가능성으로 실제 자동 협업 가용성을 만들지도 않는다. 실제 내용을 얻어 현재 요청과 대조했을 때만 그 기여를 설명한다.

기존 원 command·기기·세션·Stage26 완료·Stage44 focus·Stage61·durable 예약·발급된 native 폼 인자 보호를 유지한다. 화면 복원이 가능한 보관 `FORM_SNAPSHOT`·context 없는 `SNAPSHOT`을 순수 안내의 선행 읽기로 호출하지 않는다. 세 패키지 `OPEN_APP / APP_OBSERVE`, `reply-proof`, 영상 파일 검증은 별도 호환·추가 자동화 기반으로 보존한다.

기준은 **Stage72 / PR #159 (`5d72b78fd3730111076b33e2771f5b6b70f657aa`), Stage62 FIX3 APK 유지 + Stage71 Android → Manual**이다. 새 API·계정·추가 결제·PC/서버 브라우저·APK 설치를 이 변경의 전제로 두지 않는다.

이번 변경은 Git 후보의 코드·overlay 문서다. `codeCandidate:true`, `productionRegistered:false`, `geminiAssistanceAvailable:false`, `liveExecutionVerified:false`를 유지한다. 설치된 플러그인, 다른 대화방, 실제 휴대폰 기능이 갱신됐다고 표시하지 않는다.
