# 제비서: 선택한 문장으로 Gemini에 전달

갱신일: 2026-11-06 (KST). **휴대폰의 왼쪽 GPT / 오른쪽 Gemini를 유지한다.** 기본 전달은 GPT가 준비한 문장을 사용자가 선택하고 **‘Gemini에게 물어보기’** 메뉴로 넘기는 방식이다.

삼성 앱·기기 작업과 영상 생성 결과는 Gemini에서 확인한다. **② 유튜브 분석은 Gemini 분석 완료 후 사용자가 분석 내용을 선택·공유해 GPT에서 이어가는 흐름을 기본으로 복원한다.** GPT가 답변을 자동 수집·재전송하는 방식은 아니며 단계별 완료 회신을 요구하지 않는다.

## 1. 세 가지 기능

| 기능 | GPT에서 준비할 내용 | Gemini에서 할 일과 확인 위치 |
| --- | --- | --- |
| **삼성 앱·기기 이용** (`ANDROID`, Gemini 위임) | 현재 요청의 앱·기기, 동작, 필요한 내용. 일정·삼성 노트·계산기·알람·연결 기기는 예시 | 실제 지원·연결된 삼성 앱·기기 작업을 Gemini에 맡기고 Gemini 또는 대상 앱·기기에서 확인 |
| **유튜브 분석** (`YOUTUBE`) | 해당 영상 링크와 분석 질문 | Gemini 분석 완료 → 분석 내용 선택·공유 → 현재 GPT 대화에서 받은 내용을 이어서 정리 |
| **영상 생성** (`VIDEO`) | 사용자가 요청한 제작 프롬프트 | 기존 Gemini 이용 범위에서 영상 제작. 생성 상태·영상은 Gemini에서 확인 |

삼성 앱·기기는 **Gemini가 실제 지원하고 연결할 수 있는 범위 전체**다. 기존 세 앱 직접 열기 목록으로 제한하지 않는다. ‘계산기 열어 줘’처럼 따로 추출할 일정·문서가 없는 직접 실행 요청도 받는다. 기기·계정별 지원을 확인하지 않고 모든 삼성 기기가 연결·제어된다고 주장하지 않는다.

전달할 내용은 현재 요청에 필요한 최소 문맥이다. 다른 방의 전체 대화·개인 기억·파일을 자동 전달하지 않는다. 사용법·개발·인용·부정만으로 휴대폰 실행을 시작하지 않는다.

## 2. 기본 경로: 텍스트 선택 메뉴

1. GPT가 Gemini에 보낼 문장을 **독립된 한 덩어리**로 보여 준다. 설명·비서 배지·진행 상태를 전달 문장 안에 섞지 않는다.
2. 사용자가 그 문장을 선택하고 휴대폰의 **‘Gemini에게 물어보기’**를 누른다. 현재 후보는 이 메뉴를 자동으로 누르거나 별도의 Gemini OPEN을 함께 실행하지 않는다.
3. 열린 Gemini에서 받은 요청을 확인한다. **초안으로 남아 있을 때만 실행**하며 이미 응답 중이거나 결과가 있으면 다시 입력·전송하지 않는다.
4. **유튜브 분석은 완료된 분석 내용을 선택·공유해 GPT로 가져오는 순서까지 처음부터 안내한다.** 별도로 ‘반환해 줘’를 다시 요구하지 않는다. 삼성·영상 결과는 Gemini에서 확인한다.

후보의 기본 `deliveryMode:'TEXT_SELECTION'`은 원 자동 실행기를 생성하거나 도구를 호출하지 않는 안내 경로다. 요청 문장과 남은 순서를 함께 보여 주므로 단계마다 ‘열었어/입력했어/됐어’를 입력할 필요가 없다.

사진에서 확인된 것은 선택 메뉴의 표시다. 메뉴 내부의 정확한 Intent, 실제 전달·실행 범위, 왼쪽 GPT / 오른쪽 Gemini 배치 완료는 별도 확인 사항이다. 메뉴를 눌렀다는 사실만으로 전송·배치 성공을 표시하지 않는다. 새 GPT 버튼이나 새 APK 기능이 생겼다고 안내하지 않는다.

삼성 앱·기기 연동은 실제 Gemini 모바일 환경의 지원·연결에 따른다. 기능·기기·계정 조건은 [Google 연결 앱 목록](https://support.google.com/gemini/table/17434654?hl=ko)과 [Android 기기 제어 안내](https://support.google.com/gemini/answer/15235441?hl=ko)를 참고한다. 텍스트 전달 자체가 삼성 기기 제어 성공을 뜻하지 않는다.

## 3. 유튜브 분석 뒤 GPT에서 이어가기

유튜브 분석 요청에는 수동 반환 안내를 기본으로 포함한다. `session.prepareManualReturn()`의 requested를 생략하면 **YOUTUBE는 true, ANDROID·VIDEO는 false**를 기본으로 사용한다. 사용자가 `requested:false`를 명시하면 반환 안내를 끌 수 있다. 다른 두 기능의 반환은 별도 요청으로 `requested:true`를 사용한다.

분석이 끝난 뒤 Gemini의 실제 공유 목록이나 사용자가 확인한 메뉴를 이용한다. GPT로 향하는 공유 항목을 보지 않고 이름을 만들어 안내하지 않는다. **현재 GPT 대화에 실제 분석 내용이 들어왔는지 확인한 뒤** 비교·재정리를 이어간다. 공유 동작만으로 현재 대화 자동 복귀·삽입이나 결과 수신 완료를 보장하지 않는다.

YOUTUBE의 `returnToGpt:true / resultDestination:'GPT_AFTER_MANUAL_SHARE'`는 사용자가 공유해 돌아올 목적지를 뜻한다. 모든 기능의 `automaticReturnToGpt:false`를 유지한다. 삼성·영상은 기본 `returnToGpt:false / resultDestination:'GEMINI'`이며 답변 자동 수집·영상 export·백그라운드 GPT 반환은 구현 범위가 아니다.

## 4. 기존 열기 경로는 명시적으로 선택한다

`deliveryMode:'OPEN_MANUAL'`을 선택하면 기존 반수동 경로를 사용한다. YOUTUBE·VIDEO는 유효한 원본 연결에서 `life_web_navigate` → `right_web_link`의 고정 Gemini 웹 OPEN을 한 번 호출하고 같은 원 job만 조회할 수 있다. 입력·실행은 수동이며 삼성 앱·기기 요청은 Gemini 모바일 앱을 여는 단계부터 수동 안내한다.

선택 메뉴 경로에 자동 OPEN을 덧붙이지 않는다. 기존 웹 OPEN 대상은 `https://gemini.google.com/app`이고, 웹을 열었다는 사실을 삼성 모바일 연동 증거로 사용하지 않는다. 자동 TYPE·SUBMIT·FORM_SNAPSHOT·답변 회수·영상 export는 두 방식 모두 호출하지 않는다.

## 5. 진행 상태와 실제 결과

- **요청 준비:** 전달할 문장을 준비했음. 전송이나 실제 작업 완료가 아님.
- **수동 전달 안내:** 사용자가 이용할 메뉴와 다음 행동을 설명했음. 메뉴 클릭·전송의 증거가 아님.
- **사용자 보고:** 사용자가 선택·입력·실행했다고 알려 줌. 독립 검증된 앱 변경·분석·영상 생성과 구분함.
- **실제 확인:** 관찰한 단계까지만 설명함. 읽지 않은 Gemini 답변이나 생성 영상을 완료로 선언하지 않음.

현재 작업에 `PENDING / UNKNOWN` 등 미확정 효과가 있으면 `requiresResultInspection:true`를 먼저 적용한다. 준비 문장이나 전달 방식을 바꾸어 같은 요청을 다시 보내도록 안내하지 않는다. 수동 보고는 기존 pending·원 승인·중복 방지 장벽을 해제하지 않는다.

영상은 기존 Gemini 구독의 포함 사용량과 추가 결제 없음이 확인된 범위에서 진행한다. 한도 소진을 무료로 간주하거나 API·업그레이드로 대체하지 않는다.

## 6. 보존하는 기반과 적용 범위

원본 [PR #63의 요청 계약][contract]과 [실행 흐름][workflow], 기존 원 host binding·명령·기기·세션·영수증 보호는 보존한다. 세 패키지 `OPEN_APP / APP_OBSERVE`는 별도 직접 열기 호환 기능이며 삼성 위임 범위를 제한하지 않는다. 기존 `reply-proof.mjs`와 영상 파일 검증은 별도 자동 반환·내보내기 기능의 기반으로 남는다.

보관 Stage62의 `FORM_SNAPSHOT`과 context 없는 `SNAPSHOT`은 화면을 복원할 수 있으므로 순수 요청 준비·공유 안내의 선행 읽기로 호출하지 않는다. 기본 인계 때문에 새 명령·승인·도구·mode를 만들지 않는다.

개발 기준은 **Stage72 / PR #159 (`5d72b78fd3730111076b33e2771f5b6b70f657aa`), Stage62 FIX3 APK 유지 + Stage71 Android → Manual**이다. 이번 변경은 Git 후보 코드와 안내 문서이며 설치된 플러그인·운영 배포·실기기 성공을 뜻하지 않는다. `codeCandidate:true`, `productionRegistered:false`, `geminiAssistanceAvailable:false`, `liveExecutionVerified:false`를 유지한다.

기술 계약은 [provider-contract.md](provider-contract.md), 검사와 이어갈 위치는 [CURRENT.md](CURRENT.md)를 따른다.

[contract]: https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/blob/67c69428f27030237f417753c717ab758faaa855/jh-server/owner-setup/gemini-native/src/contract.mjs
[workflow]: https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/blob/67c69428f27030237f417753c717ab758faaa855/jh-server/owner-setup/gemini-native/src/native-workflow.mjs
