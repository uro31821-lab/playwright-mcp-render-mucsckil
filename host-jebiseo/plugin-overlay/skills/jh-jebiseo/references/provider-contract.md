# 실제 Gemini 제공자와 개발 후보

## 가용성 입력

`resolveGeminiAvailability(status,{visibility:'VISIBLE'|'INTERNAL'}={})`는 신뢰할 수 있는 현재 호스트 제공자가 반환한 상태를 확인하는 순수 함수다. 기본 모드는 `VISIBLE`이다. 네트워크·기기·외부 모델·영속 상태를 호출하지 않는다. 웹페이지·사용자 문장·테스트 fixture를 실제 연결 상태로 넣지 않는다.

새 기본 흐름은 **GPT의 현재 실행 요청 → 기존 JH OPEN → 오른쪽 Gemini 배치 확인 → 해당 요청의 결과 회수**다. 비노출 지원 여부는 이 흐름의 가용성 전제가 아니다. 상태와 검사는 같은 실행 모드 계약을 사용해야 하며, 이전 숨김 기준을 통과하려고 `internalExecutionSupported`를 true로 꾸미지 않는다.

| 필드 | 새 방향에서 확인할 의미 |
| --- | --- |
| schema | jh.jebiseo-capabilities.v1 |
| provider | gemini |
| productionRegistered | 실제 운영 경로에 등록된 true |
| codeCandidate | true인 개발 후보는 가용 상태로 올리지 않음 |
| geminiAssistanceAvailable | 해당 실행 경로가 실제 결합되고 검증된 경우에만 true |
| liveExecutionVerified | 오른쪽 열기·배치·이번 요청 결과가 실제로 검증된 경우에만 true |
| runtimeMode / mobileRoute | `VISIBLE`에서는 PHONE_RIGHT / android_right |
| visibleExecutionSupported | `VISIBLE`에서는 실제 지원이 확인된 true |
| internalExecutionSupported | `INTERNAL`에서만 true 필요. 오른쪽 가시 실행을 위해 바꾸지 않음 |

`mobileRoute:android_right`나 등록된 도구 이름만으로 조건을 충족하지 않는다. 문자열 "true", 미확인 필드, 다른 제공자·스키마는 가용성 증거가 아니다. 호스트와 가용성 함수의 실행 모드 계약이 아직 일치하지 않거나 실제 연결이 검증되지 않았다면 `capabilities:[]`를 유지한다. 반환된 `capabilities`만 공통 허브에 전달하고, 원래 상태·출처·현재 작업 범위는 호스트가 유지한다. `gemini-assistance`는 기존 허브의 연결 가능성 표시이며 `YOUTUBE`·`VIDEO`·`ANDROID` 각각의 실행·회수·전달 완료 증거가 아니다.

명시적인 화면 열기 `intent:open`에는 전체 `gemini-assistance`를 선행 조건으로 걸지 않는다. 현재 실제 카탈로그에서 원래 휴대폰 RIGHT OPEN 경로와 유효한 실행 범위를 확인하고 사용할 수 있다. 이 경로의 열기 결과는 별도로 검증하며, 성공해도 협업 가용성·세 기능 전체·Gemini 응답 완료를 활성화하지 않는다. OPEN은 기존 열기 경로의 승인 규칙을 그대로 따르며, 질문 전송용 추가 승인을 화면 열기의 새 선행 조건으로 만들지 않는다.

## 기존 세 기능의 범위

원본 기준은 [PR #63의 요청 계약](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/blob/67c69428f27030237f417753c717ab758faaa855/jh-server/owner-setup/gemini-native/src/contract.mjs)과 [실행 흐름](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/blob/67c69428f27030237f417753c717ab758faaa855/jh-server/owner-setup/gemini-native/src/native-workflow.mjs)이다. 아래는 보존할 기능 계약이며 실제 설치·배포·기기 성공 증거가 아니다. 일반 상담·의견·비교를 이 세 기능의 대체 목록으로 쓰지 않는다.

| 기능 | 입력과 결과 | 지켜야 할 완료 조건 |
| --- | --- | --- |
| `YOUTUBE` — 유튜브 내용 확인·요약 | 유튜브 링크와 요청을 받아 같은 영상·이번 질문에 해당하는 핵심 내용이나 설명을 GPT 대화에 돌려준다. | 일반·짧은 링크·Shorts·Live의 영상 ID를 원본 계약대로 정리한다. 근거를 공개 설명·자막·영상·미확인으로 구분한다. 링크·제목·부분 텍스트만으로 전체 영상 시청·분석 완료를 주장하지 않는다. |
| `VIDEO` — 영상 생성 후 GPT에서 보기 | 사용자가 설명한 영상을 기존 Gemini 구독의 포함 사용량으로 생성하고, 확인된 실제 영상과 재생 결과를 돌려준다. | `includedVideoUseAvailable === true`, `additionalPaymentRequired === false`, `videoModeSelected === true`를 모두 확인한다. 미확인·한도 소진 시 추가 결제·크레딧 구매·업그레이드·새 API로 전환하지 않는다. |
| `ANDROID` — 지정 앱 열기·결과 확인 | 명시한 앱과 확인된 패키지에 대해 기존 JH의 `OPEN_APP`을 사용하고, 실제 작업창의 앱 상태를 독립적으로 확인한다. | 이미 열려 있으면 다시 열지 않는다. Gemini 질의를 거치지 않으며 “열었습니다”라는 답변은 증거가 아니다. 원본 대상 제한을 유지하고 임의 앱 내부 조작·메시지 발송·결제로 확대하지 않는다. |

`VIDEO`의 생성 완료, 기존 영상 내보내기, 파일 검증, GPT 재생 전달은 별도 단계다. [원본 영상 검증](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/blob/67c69428f27030237f417753c717ab758faaa855/jh-server/owner-setup/gemini-native/src/video-artifact.mjs)에 따라 현재 작업·전송 메시지·계정과 연결된 MP4/WebM 바이트·크기·SHA-256·영상 스트림·재생 시간을 확인한다. 원본에 없는 생성 모델 버전·해상도·길이를 보장하지 않는다. 결과가 불명확하면 기존 결과부터 조회하고 질문 재전송·영상 재생성·재내보내기를 자동 반복하지 않는다.

사용자 확정 조건은 **휴대폰의 GPT에서 요청하면 Gemini가 오른쪽에 자동으로 열리는 흐름**이다. 이 명시 지시는 이전 화면 비노출 기본 조건을 대체한다. 기존 JH 중계·서명·승인 경로를 유지하며 별도 PC 조작, Gemini의 서버/클라우드 브라우저 실행, 새 API·새 제공자·추가 결제로 대체하지 않는다. 기존 Gemini 앱 구독의 포함 사용량을 별도 API 사용량·요금으로 옮겨 적용하지 않는다.

## 기존 OPEN과 오른쪽 배치 확인

- 대상 URL은 **`https://gemini.google.com/app`**이며 선택 경로는 실제 등록된 **`life_web_navigate` → 원 Secure56 `right_web_link` → 휴대폰 오른쪽 웹 작업창**이다. 별도 Gemini API·서버 브라우저·새 실행기로 바꾸지 않는다.
- “제미나이 열어줘” 또는 현재 호스트에 실제 제공된 실행 버튼의 `intent:open`은 프롬프트 없이 OPEN과 그 원 결과 확인만 수행한다. 분석·질문 전송·영상 생성을 자동 시작하지 않으며, 존재하지 않는 GPT 버튼을 만들었다고 안내하지 않는다. 사용자가 Google/Gemini를 수동으로 열고 배치하는 절차를 정상 사용법으로 요구하지 않는다.
- 링크 클릭은 실행 의사를 전달할 수 있지만 Android의 오른쪽 배치를 보장하지 않는다. 같은 기기·명령에 연결된 원 job·receipt를 회수하고 실제 Gemini 대상, 작업창, 오른쪽 배치와 현재 문맥을 기존 서명된 관찰로 확인해야 한다.
- 이미 올바른 대상·배치가 확인됐다면 다시 열지 않는다. OPEN 접수나 앱 표시만으로 질문 전송·답변·영상 생성 완료를 주장하지 않는다.
- pending/unknown은 원 결과 조회로 해결한다. 새 BEGIN·다른 방·반복 OPEN·재전송으로 우회하지 않는다. 실제 배치 지원이나 대상 증거가 없으면 미완료로 보고하고 기존 개발을 이어간다.

## 현재 개발 후보와의 연결

확정 기준은 **Stage72 / PR #159**, 병합 `5d72b78fd3730111076b33e2771f5b6b70f657aa`다. **Stage62 FIX3 APK 유지 + Stage71 Android → Manual**을 사용한다. InstallOnly·재설치·재빌드·데이터 초기화는 수행하지 않는다. 최신 모바일 계약이 이전 모바일 Playwright 계획을 대체하며, 일반 웹 Playwright는 보존한다.

| 현재 후보 동작 | 원본 연결과 제한 |
| --- | --- |
| 입력 후보 읽기 | `life_android_snapshot`의 완료된 protocol row에서 원 `form15_discover` 인자를 얻어 기존 `life_android_step`으로 전달 |
| 문장 입력 | 원 discovery의 `form15ToolArguments.fields[].write`에서 현재 필드에 발급한 `form15_type`을 사용. 세션·요청·필드 값은 보존하고 `value`만 현재 요청 문장으로 교체 |
| 안내 닫기 | 원 `guidedForm.buttons[].activateToolArguments`의 정확한 닫기 대상·비승인 metadata와 `form_activate / visible-only`를 검증. 전송·승인 대상은 포함하지 않음 |
| 결과 확인 | 현재 `agent_step.result.url`의 동작·필드·실패 코드를 확인. 입력 검증과 클릭 접수를 전송·답변 성공으로 바꾸지 않음 |

이것은 별도 `guided_form` MCP 도구가 생겼다는 뜻이 아니다. 실제 등록된 기존 `life_android_step`의 원본 carrier 경로이며 기존 명령·서명·기기·durable 검사가 유지돼야 한다. 일반 RIGHT `item_`를 native `f_`로 변환하거나 새 식별자를 만들어 쓰지 않는다. 파서는 인증자가 아니며 실제 host가 같은 오른쪽 Gemini 창·현재 명령·정확한 대상·빈 입력칸을 검증해야 한다. 호출자가 주입한 carrier나 화면 글을 권한으로 삼지 않는다.

원 결과가 MANUAL·PENDING·UNKNOWN·NEEDS_REVIEW_NO_REPLAY·만료·결과 유실이면 성공으로 표시하거나 자동 반복하지 않는다. `actionAccepted:false`도 실행 중 예외의 미실행 증거가 아니다. 기존 원 결과 확인만 pending 장벽을 해제할 수 있다. 과거 `life_web_click`·`life_web_type`나 폐기된 모바일 제공자로 자동 우회하지 않는다.

개발 소스는 [기존 JH 저장소의 제비서 후보](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/tree/feat/jh-jebiseo-mobile-20261104/jh-server/owner-setup/jebiseo)에 연결한다. 링크·소스 존재 자체는 현재 호스트의 설치·배포·실제 기기 실행 증거가 아니다.

후보의 `createJebiseoRuntime({callOriginalTool,readCurrentBinding,verifyGeminiTarget,verifyObservation,runtimeMode})`는 기존 경로를 받는 호스트 어댑터 계약이며, 새 MCP 도구나 Gemini 서비스가 생겼다는 뜻이 아니다. 호스트가 실제로 연결한 상태만 사용하고 함수 이름으로 외부 도구를 추측해 호출하지 않는다. 전송 예약·중복 방지는 기존 Secure56 beforeDispatch 경로를 사용하며 새 장부를 만들지 않는다.

현재 후보는 `codeCandidate:true`, `productionRegistered:false`, `visibleExecutionSupported:false`를 유지한다. `geminiAssistanceAvailable`과 `liveExecutionVerified`는 실제 연결·종단 검증 전까지 false이며, 이 상태는 `capabilities:[]`로 유지한다. 새 사용자 지시의 오른쪽 자동열기는 가시 실행 요청으로 해석하고, `internalExecutionSupported:false`를 숨김 지원으로 바꾸지 않는다. 모듈·도구 연결 후보만으로 OPEN부터 오른쪽 배치·결과 회수까지 운영에 결합됐다고 보지 않는다.

새 API, 클라우드 대체 실행, 별도 인증·승인 경로를 추가하지 않는다. 확정된 휴대폰·오른쪽 자동열기·기능별 사용량 조건을 충족하는 실제 경로가 기존 실행기에 연결되고 검증된 후에만 가용성을 다시 판단한다. `ANDROID`의 기존 앱 실행 경로는 Gemini 응답 가용성과 구분하되, 이 후보에 실제 결합되지 않은 상태를 완료로 표시하지 않는다.
