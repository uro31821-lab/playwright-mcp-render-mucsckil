# 제비서: 기존 제미나이 3기능과 모바일 전환 범위

원본 확인 기준: **PR #63, `67c69428f27030237f417753c717ab758faaa855`**.
현재 사용자 조건은 **휴대폰만 사용**과 **GPT 요청 시 오른쪽 Gemini 자동 열기**다.
사용자가 Google/Gemini를 직접 열고 배치하는 절차를 없애라는 후속 명시 지시가
이전 화면 비노출 조건을 대체했다. 기본 경로는 휴대폰 오른쪽 Chrome의 Gemini 웹이다.
원래 기능은 `YOUTUBE / VIDEO / ANDROID`이며, 일반 질문·다른 의견·검토라는 세 가지 상담 기능으로 대체하지 않는다. [원본 요청 계약][contract]

## 1. 유지할 세 가지 기능

| 기능 | 입력과 사용 예시 | 사용자에게 돌아올 결과 | 원본의 조건·제한 |
| --- | --- | --- | --- |
| **유튜브 영상 내용 확인·요약** (`YOUTUBE`) | 유튜브 링크 + 요청 문장. 예: “이 링크 영상의 핵심만 알려줘.” | 같은 영상과 현재 질문에 연결된 제목·핵심 내용 또는 요청한 설명을 GPT 대화에 표시 | 일반 영상·짧은 링크·Shorts·Live의 영상 ID를 표준 URL로 정리한다. 실제 근거를 공개 설명·자막·영상·미확인으로 구분한다. 전체 영상 시청을 보장하지 않으며, 전체 답변 증거가 없으면 부분 결과로 표시한다. [계약][contract] · [실행 흐름][workflow] |
| **영상 생성 후 GPT에서 보기** (`VIDEO`) | 만들 영상에 대한 설명. 예: “제주 해변의 아침을 영상으로 만들어줘.” | 현재 요청으로 생성된 실제 영상과 검증된 재생 결과 | 기존 포함 사용량 이용 가능, 추가 결제 불필요, 영상 모드 선택을 모두 확인한 뒤 진행한다. 생성된 기존 영상만 내보내고 실제 파일·해시·형식·재생 시간·전달 결과를 확인한다. 특정 생성 모델 버전·해상도·영상 길이는 원본 계약에 고정되어 있지 않다. [실행 흐름][workflow] · [파일 검증][artifact] |
| **휴대폰 앱 열기·결과 확인** (`ANDROID`) | 명시한 앱과 확인된 대상 패키지. 예: “유튜브 앱 열어줘.” | 지정 앱이 실제 작업창에 열렸는지 확인한 결과를 GPT에 표시 | 실제 구현 범위는 **`OPEN_APP`만**이다. 기존 JH 앱 실행기를 사용하며, 이미 열려 있으면 다시 열지 않는다. Gemini의 “열었습니다”라는 답변은 성공 증거가 아니다. 임의 앱 내부 조작·메시지 발송·결제 기능으로 확대하지 않는다. [계약][contract] · [실행 흐름][workflow] |

원본은 세 기능 모두 GPT에 결과를 돌려주는 구조다. `ANDROID` 분기는 Gemini 질의를 거치지 않고 기존 JH의 `engine.openApp`과 독립적인 앱 상태 확인을 사용한다. [실행 흐름][workflow]

## 2. 추가 결제와 결과 확인

| 항목 | 보존할 기준 |
| --- | --- |
| 영상 생성의 결제 조건 | `includedVideoUseAvailable === true`, `additionalPaymentRequired === false`, `videoModeSelected === true`를 모두 확인해야 한다. 미확인 상태를 무료·이용 가능으로 간주하지 않는다. [실행 흐름][workflow] |
| Gemini API와 기존 이용권 | 원본은 별도 Gemini API 경로가 아니다. 기존 앱의 포함 사용량을 새 API의 사용량·요금 조건으로 옮겨 적용하지 않는다. [원본 설명][readme] · [실행 흐름][workflow] |
| 유튜브 답변 | 현재 전송 메시지·질문 해시·영상 URL의 일치를 확인한다. 원본의 `fullVideoInspectionVerified`는 `false`이며, 부분 텍스트를 전체 영상 분석 완료로 올리지 않는다. [실행 흐름][workflow] |
| 영상 파일 | 현재 작업·전송 메시지·계정에 연결된 MP4/WebM 바이트, 크기, SHA-256, 실제 영상 스트림과 재생 시간을 확인한다. 파일 검증과 GPT 재생 전달은 별도 단계다. [파일 검증][artifact] · [실행 흐름][workflow] |
| 앱 실행 | 지정 패키지와 독립적인 실제 앱 상태가 일치해야 한다. ChatGPT·JH Bridge·Android System UI는 이 요청 계약의 실행 대상에서 제외한다. [계약][contract] · [실행 흐름][workflow] |
| 결과가 불명확할 때 | 기존 전송·내보내기·전달 결과부터 조회한다. 같은 질문 재전송, 영상 재생성, 재내보내기를 자동으로 반복하지 않는다. [실행 흐름][workflow] |

## 3. 코드가 있는 부분과 아직 연결되지 않은 부분

**원본에는 세 기능의 요청 계약·상태 전이·검사 코드가 있다. 운영 연결이나 휴대폰에서의 전체 성공을 뜻하지 않는다.** 원본 통합 코드의 상태는 `productionRegistered: false`, `chatGptDeliveryConnected: false`, `androidApkBuilt: false`, `physicalPhoneTested: false`다. [원본 통합 상태][composition] · [원본 기능 검사][tests]

현재 새 후보의 `host-runtime.mjs`, `mobile-port.mjs`, `reply-proof.mjs`는 공통 모바일 연결·중복 실행 방지·결과 연결 검증을 준비한 기반이다. 명시적 요청에서 `start()`가 고정 Gemini 웹 주소의 기존 Mobile13 OPEN을 호출하도록 연결했다. 세 가지 제품 기능의 완성된 실행 흐름은 아직 포함하지 않는다.

| 기능 | 현재 새 후보에 빠진 연결 | 필요한 최소 후속 개발 |
| --- | --- | --- |
| `YOUTUBE` | 영상 URL/ID 계약, 답변과 영상의 일치 확인, 근거 범위 표시 | 원본 URL·요청 계약을 유지해 최신 모바일 작업에 연결하고, 같은 질문·영상에 해당하는 답변만 결과로 표시한다. |
| `VIDEO` | 포함 사용량/추가 결제 확인, 생성 결과, 기존 영상 내보내기·조회, 실제 파일 검증·GPT 재생 전달 | 원본 영상 상태 전이를 최신 호스트 포트에 연결한다. 생성 성공과 영상 회수·검증·전달을 각각 실제 결과로 확인한다. |
| `ANDROID` | 명시적인 `OPEN_APP`과 대상 앱의 독립 상태 확인 | 기존 최신 모바일 앱 열기 포트와 결과 확인을 연결한다. 별도의 새 휴대폰 실행기를 만들지 않는다. |

새 후보의 대상·결과 검증 계약만으로 실제 증거 생산기가 생기지는 않는다. 원본 관찰은 제공자의 메시지·대화 식별자를 입증하지 못하는 경우 `SIGNED_GEMINI_VISIBLE_SEQUENCE_CANDIDATE_UNVERIFIED`와 `sentMessageIdProven: false`를 반환한다. 이 후보를 현재 질문의 검증된 최종 답변으로 바꾸지 않는다. [원본 답변 관찰자][visible]

## 4. 휴대폰만 사용·오른쪽 자동 열기

| 요구 | 현재 구현과의 관계 | 완료 조건 |
| --- | --- | --- |
| **사용자는 휴대폰만 사용** | 사용자에게 PC 실행·수동 빌드 절차를 요구하지 않는 방향을 유지한다. 원본의 영상 파일 검증은 기존 호스트에서 실행하는 코드이며, 이것만으로 휴대폰 영상 회수 경로가 연결됐다고 보지는 않는다. [파일 검증][artifact] | 휴대폰에서 요청·필요한 사용자 조치·결과 확인까지 이어지는 실제 경로를 확인한다. |
| **GPT에서 요청하면 오른쪽 Gemini 자동 열기** | 고정 `https://gemini.google.com/app`을 기존 `life_web_navigate` → `right_web_link`로 연다. 보존된 Android 소스의 `LinkSplitController`·`SamsungSplitSetup`이 필요시 분할 배치를 수행하도록 작성돼 있다. 추가 서비스 이름 매핑은 별도 후보 overlay이며 기존 운영 composition에는 자동 적용하지 않는다. | 현재 설치된 휴대폰에서 왼쪽 GPT 보존, 오른쪽 Chrome 배치, 요청 주소와 Gemini 실제 페이지를 확인한다. 링크 클릭·OPEN 접수·주소 확인을 전체 기능 완료로 보지 않는다. |
| **열기와 실제 작업 구분** | `intent: open`은 질문 없이 OPEN만 가능하다. 분석·영상 요청은 OPEN 원 결과와 새 Gemini 입력창을 확인한 다음 단계로 이어진다. pending/unknown에서 원 job만 조회하며 재OPEN·새 BEGIN을 자동 생성하지 않는다. | 현재 요청과 같은 작업의 전송·답변 또는 영상 파일까지 독립 확인한다. 전체 Gemini 도움 가용성이 false여도 기존 도구의 명시적 화면 열기 자체와 혼동하지 않는다. |
| **비서 병렬 연결** | 분석·검토는 병렬로 할 수 있지만 같은 휴대폰의 효과는 기존 명령과 결과를 유지하며 순서대로 처리한다. 새 후보는 다른 작업 선점과 미확정 결과 후 다음 효과를 차단하는 기반을 둔다. | 세 기능을 공통 모바일 경로에 연결한 뒤 기존 명령 유지, 원본 승인·결과 조회, 다른 작업과의 충돌 방지를 실제로 확인한다. |

명시적으로 `INTERNAL`을 요청한 경우에는 여전히 비노출 제공자가 없어 실행 전에 차단한다.
이 문서는 기존 세 기능을 정확히 이어가기 위한 범위 확인이다. **세 기능 실사용 완료,
새 API 연결·추가 결제 승인으로 해석하지 않는다.**

[contract]: https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/blob/67c69428f27030237f417753c717ab758faaa855/jh-server/owner-setup/gemini-native/src/contract.mjs
[workflow]: https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/blob/67c69428f27030237f417753c717ab758faaa855/jh-server/owner-setup/gemini-native/src/native-workflow.mjs
[artifact]: https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/blob/67c69428f27030237f417753c717ab758faaa855/jh-server/owner-setup/gemini-native/src/video-artifact.mjs
[readme]: https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/blob/67c69428f27030237f417753c717ab758faaa855/jh-server/owner-setup/gemini-native/README.md
[composition]: https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/blob/67c69428f27030237f417753c717ab758faaa855/jh-server/owner-setup/android-direct/gemini-v4-original-composition.mjs
[tests]: https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/blob/67c69428f27030237f417753c717ab758faaa855/jh-server/owner-setup/gemini-native/test/native-v4.test.mjs
[visible]: https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/blob/67c69428f27030237f417753c717ab758faaa855/jh-server/owner-setup/android-direct/gemini-v4-visible-reply.mjs
