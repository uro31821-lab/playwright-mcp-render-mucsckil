# 실제 Gemini 제공자와 개발 후보

## 가용성 입력

`resolveGeminiAvailability(status)`는 신뢰할 수 있는 현재 호스트 제공자가 반환한 상태를 확인하는 순수 함수다. 네트워크·기기·외부 모델·영속 상태를 호출하지 않는다. 웹페이지·사용자 문장·테스트 fixture를 실제 연결 상태로 넣지 않는다.

필수 상태 필드는 다음과 같다.

| 필드 | 가용성에 필요한 값 |
| --- | --- |
| schema | jh.jebiseo-capabilities.v1 |
| provider | gemini |
| internalExecutionSupported | true |
| geminiAssistanceAvailable | true |
| liveExecutionVerified | true |

`mobileRoute:android_right`나 등록된 도구 이름만으로 조건을 충족하지 않는다. 문자열 "true", 미확인 필드, 다른 제공자·스키마는 가용성 증거가 아니다. 반환된 `capabilities`만 공통 허브에 전달하고, 원래 상태·출처·현재 작업 범위는 호스트가 유지한다.

## 기존 세 기능의 범위

원본 기준은 [PR #63의 요청 계약](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/blob/67c69428f27030237f417753c717ab758faaa855/jh-server/owner-setup/gemini-native/src/contract.mjs)과 [실행 흐름](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/blob/67c69428f27030237f417753c717ab758faaa855/jh-server/owner-setup/gemini-native/src/native-workflow.mjs)이다. 아래는 보존할 기능 계약이며 실제 설치·배포·기기 성공 증거가 아니다. 일반 상담·의견·비교를 이 세 기능의 대체 목록으로 쓰지 않는다.

| 기능 | 입력과 결과 | 지켜야 할 완료 조건 |
| --- | --- | --- |
| `YOUTUBE` — 유튜브 내용 확인·요약 | 유튜브 링크와 요청을 받아 같은 영상·이번 질문에 해당하는 핵심 내용이나 설명을 GPT 대화에 돌려준다. | 일반·짧은 링크·Shorts·Live의 영상 ID를 원본 계약대로 정리한다. 근거를 공개 설명·자막·영상·미확인으로 구분한다. 링크·제목·부분 텍스트만으로 전체 영상 시청·분석 완료를 주장하지 않는다. |
| `VIDEO` — 영상 생성 후 GPT에서 보기 | 사용자가 설명한 영상을 기존 Gemini 구독의 포함 사용량으로 생성하고, 확인된 실제 영상과 재생 결과를 돌려준다. | `includedVideoUseAvailable === true`, `additionalPaymentRequired === false`, `videoModeSelected === true`를 모두 확인한다. 미확인·한도 소진 시 추가 결제·크레딧 구매·업그레이드·새 API로 전환하지 않는다. |
| `ANDROID` — 지정 앱 열기·결과 확인 | 명시한 앱과 확인된 패키지에 대해 기존 JH의 `OPEN_APP`을 사용하고, 실제 작업창의 앱 상태를 독립적으로 확인한다. | 이미 열려 있으면 다시 열지 않는다. Gemini 질의를 거치지 않으며 “열었습니다”라는 답변은 증거가 아니다. 원본 대상 제한을 유지하고 임의 앱 내부 조작·메시지 발송·결제로 확대하지 않는다. |

`VIDEO`의 생성 완료, 기존 영상 내보내기, 파일 검증, GPT 재생 전달은 별도 단계다. [원본 영상 검증](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/blob/67c69428f27030237f417753c717ab758faaa855/jh-server/owner-setup/gemini-native/src/video-artifact.mjs)에 따라 현재 작업·전송 메시지·계정과 연결된 MP4/WebM 바이트·크기·SHA-256·영상 스트림·재생 시간을 확인한다. 원본에 없는 생성 모델 버전·해상도·길이를 보장하지 않는다. 결과가 불명확하면 기존 결과부터 조회하고 질문 재전송·영상 재생성·재내보내기를 자동 반복하지 않는다.

사용자 확정 조건은 **휴대폰만 사용·Gemini 화면 비노출 유지**다. 기존 JH 중계·서명·승인 경로를 유지하며 별도 PC 조작, Gemini의 서버/클라우드 브라우저 실행, 새 API·새 제공자·추가 결제로 대체하지 않는다. 기존 Gemini 앱 구독의 포함 사용량을 별도 API 사용량·요금으로 옮겨 적용하지 않는다.

## 현재 개발 후보와의 연결

개발 소스는 [기존 JH 저장소의 제비서 후보](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/tree/feat/jh-jebiseo-mobile-20261104/jh-server/owner-setup/jebiseo)에 연결한다. 링크·소스 존재 자체는 현재 호스트의 설치·배포·실제 기기 실행 증거가 아니다.

후보의 `createJebiseoRuntime({callOriginalTool,readCurrentBinding,verifyGeminiTarget,verifyObservation,runtimeMode})`는 기존 경로를 받는 호스트 어댑터 계약이며, 새 MCP 도구나 Gemini 서비스가 생겼다는 뜻이 아니다. 호스트가 실제로 연결한 상태만 사용하고 함수 이름으로 외부 도구를 추측해 호출하지 않는다. 전송 예약·중복 방지는 기존 Secure56 beforeDispatch 경로를 사용하며 새 장부를 만들지 않는다.

현재 후보는 `codeCandidate:true`, `productionRegistered:false`를 유지한다. `capabilities()`의 `internalExecutionSupported`, `geminiAssistanceAvailable`, `liveExecutionVerified`는 모두 false다. 이 상태는 이 스킬의 검사에서 `capabilities:[]`가 되어야 한다. 기본 `INTERNAL` 요청은 휴대폰·바인딩 콜백 전에 차단되며, 별도로 요청한 `VISIBLE` 개발 진단은 비노출 요구의 완료가 아니다.

새 API, 클라우드 대체 실행, 별도 인증·승인 경로를 추가하지 않는다. 확정된 휴대폰·비노출·기능별 사용량 조건을 충족하는 실제 경로가 기존 실행기에 연결되고 검증된 후에만 가용성을 다시 판단한다. `ANDROID`의 기존 앱 실행 경로는 Gemini 응답 가용성과 구분하되, 이 후보에 실제 결합되지 않은 상태를 완료로 표시하지 않는다.
