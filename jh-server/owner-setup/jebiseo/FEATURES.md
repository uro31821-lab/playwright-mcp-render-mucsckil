# 제비서: Gemini 실행과 Manual 인계

## 최신 사용자 확정 방침

**휴대폰에서 왼쪽 GPT / 오른쪽 Gemini를 고정한다.** GPT가 현재 요청의 대상·동작·필요한 내용을 준비하고, 가능한 기존 Android 단계는 자동으로 수행하며 안 되는 단계는 **기존 Manual 방식**으로 이어간다.

**유튜브 분석·영상 생성 결과는 오른쪽 Gemini에서 확인한다. GPT 자동 재전송은 개발 범위에서 제외한다.** 사용자가 필요할 때 GPT에 다시 질문하면 그 요청을 처리한다. Gemini 결과 복사·가져오기를 필수 사용 절차로 넣지 않는다.

## 1. 세 가지 기능

| 기능 | GPT에서 준비할 내용 | Gemini에서 할 일과 확인 위치 |
| --- | --- | --- |
| **삼성 앱·기기 이용** (`ANDROID`, Gemini 위임) | 사용자 요청의 앱·기기, 동작, 필요한 내용. 예: 일정 저장, 삼성 노트 이용, 계산기 실행, 알람·지원되는 연결 기기 제어 | 현재 연결·지원되는 삼성 앱·기기 작업을 Gemini에 맡기고 Gemini 또는 대상 앱·기기에서 확인 |
| **유튜브 분석** (`YOUTUBE`) | 해당 영상 링크와 분석 질문 | Gemini에서 분석하고 오른쪽에서 결과 확인. GPT 답변 회수 없음 |
| **영상 생성** (`VIDEO`) | 사용자가 요청한 제작 프롬프트 | 기존 Gemini 이용 범위에서 영상 제작. 상태와 영상은 Gemini에서 확인하며 파일 내보내기·GPT 전달 없음 |

삼성 앱·기기는 **Gemini가 실제 지원하고 연결할 수 있는 범위 전체**를 뜻한다. 위 예시나 기존 세 앱 직접 열기 목록으로 한정하지 않는다. “계산기 열어 줘” 같은 직접 실행 요청에는 따로 추출할 일정·문서가 없어도 된다. 기기·계정별 지원을 확인하지 않고 모든 삼성 기기가 연결·제어된다고 주장하지 않는다.

전달 내용은 현재 요청에 필요한 최소 문맥이다. 다른 방의 전체 대화·개인 기억·파일을 자동 전달하지 않는다. 사용법·개발·인용·부정만으로 휴대폰 실행을 시작하지 않는다.

## 2. 현재 구현 경로

| 단계 | 자동으로 가능한 부분 | Manual과 연결하는 부분 |
| --- | --- | --- |
| 요청 준비 | `handoff-request.mjs`에서 기능·대상·질문·프롬프트와 작업 참조를 준비 | 순수 준비 단계에는 휴대폰 연결·새 명령·새 승인이 필요 없음 |
| 오른쪽 Gemini 열기 | YOUTUBE·VIDEO는 기존 `life_web_navigate` → `right_web_link`의 고정 Gemini 웹 OPEN 사용 가능 | 삼성 앱·기기 작업은 Gemini 모바일 앱 대상. 현재 네이티브 자동열기 연결이 없으면 Manual로 인계 |
| 입력·실행 | 현재 인계 실행기는 자동 TYPE·SUBMIT을 호출하지 않음 | 준비된 요청을 이용해 Manual로 입력·실행 |
| 결과 확인 | 확인된 요청 전달까지만 상태를 설명 | 분석·영상은 Gemini에서 사용자가 확인. GPT 자동 반환·필수 가져오기 없음 |

기존 웹 OPEN의 대상은 `https://gemini.google.com/app`이다. 삼성 모바일 연동은 웹 OPEN만으로 성립하지 않는다. 기능·기기·계정 조건은 [Google 연결 앱 목록](https://support.google.com/gemini/table/17434654?hl=ko)과 [Android 기기 제어 안내](https://support.google.com/gemini/answer/15235441?hl=ko)를 기준으로 확인한다.

`handoff-request.mjs`의 `prepareJebiseoHandoff`는 현재 사용자 요청을, `createJebiseoManualHandoff`는 그 요청의 현재 수동 단계를 준비한다. 둘 다 휴대폰·네트워크·Gemini를 실행하지 않는 순수 함수다. `handoff-runtime.mjs`와 bound host의 `createHandoffRuntime`은 기존 웹 OPEN을 한 번 호출하고 같은 원 job을 조회하는 단계만 연결한다. TYPE·SUBMIT·FORM_SNAPSHOT·답변 회수·영상 내보내기는 자동 호출하지 않는다. 삼성 네이티브 요청은 열기부터 Manual로 이어간다.

## 3. 실행과 완료를 구분하는 기준

- **준비 완료:** 요청 문장이 만들어졌음. Gemini 열기·전송·실제 작업 완료가 아님.
- **열기 확인:** 같은 원 job·receipt로 오른쪽 대상이 확인됐음. 입력·전송까지 확인된 것은 아님.
- **Manual 인계:** 필요한 요청과 다음 사용자 행동을 안내했음. 서버 인계 정보가 있으면 원 참조를 유지하고 없는 도구·mode·코드를 만들지 않음.
- **사용자 완료 보고:** 사용자가 수동으로 처리했다고 알려 줌. 독립 검증된 앱 저장·분석·기기 동작과 구분.
- **요청 전달 확인:** 실제로 확인된 전달 단계까지 보고. 분석·영상 생성 결과를 GPT가 읽었다고 말하지 않음.

Manual 안내 뒤 사용자에게 완료 회신을 의무적으로 요구하지 않는다. 사용자가 결과를 Gemini에서 확인하고 필요할 때 GPT에 다시 질문하는 흐름이다.

자동 단계가 아직 실행되지 않았고 미지원이면 그 단계부터 Manual로 이어간다. 이미 실행했을 수 있는 효과가 `PENDING / UNKNOWN`이면 원 결과 또는 현재 화면부터 확인하고 같은 효과를 자동·수동으로 반복하도록 지시하지 않는다. Manual 상태만으로 기존 pending·중복 방지·원 승인 검사를 해제하지 않는다.

영상은 기존 Gemini 구독의 포함 사용량과 추가 결제 없음이 확인된 범위에서 진행한다. 미확인·한도 소진을 무료로 보거나 유료 API·업그레이드로 전환하지 않는다. 유튜브 분석 본문을 읽지 않은 GPT가 전체 영상 확인·분석 완료를 대신 선언하지 않는다.

## 4. 보존하는 기존 코드와 기준

원본은 [PR #63, `67c69428f27030237f417753c717ab758faaa855`][contract]의 `YOUTUBE / VIDEO / ANDROID` 계약과 [실행 흐름][workflow]다. 그 원본의 결과 반환·세 앱 직접 열기는 과거 구현 이력으로 보존하며, 최신 기본 방침은 위 Gemini 위임·Manual·결과 미반환이다.

| 기존 구성 | 최신 기본 흐름과의 관계 |
| --- | --- |
| `host-runtime.mjs`, `mobile-port.mjs`, 원 host binding | 실제 지원된 자동 단계의 원 명령·기기·승인·영수증·중복 방지를 재사용 |
| 직접 `OPEN_APP`와 `APP_OBSERVE` | 유튜브·지메일·인스타그램 세 패키지의 별도 호환 기능. 삼성 위임 범위를 제한하거나 대신하지 않음 |
| `reply-proof.mjs` | 실제 답변 반환을 별도로 다룰 때의 검증 기반. 최신 기본 흐름에서 답변 회수 선행 조건으로 사용하지 않음 |
| 원본 영상 파일 검증 | 향후 별도 내보내기 요청의 기반. 이번 영상 생성의 필수 단계가 아님 |

보관 Stage62의 `FORM_SNAPSHOT`과 context 없는 `SNAPSHOT`은 화면 복원을 할 수 있다. 순수 요청 준비·Manual 안내 때문에 이 읽기를 실행하지 않는다. 현재 자동 입력 증거의 한계는 보존하되 수동 인계 전체의 차단 이유로 확대하지 않는다.

개발 기준은 **Stage72 / PR #159 (`5d72b78fd3730111076b33e2771f5b6b70f657aa`)**, **Stage62 FIX3 APK 유지 + Stage71 Android → Manual 서버**다. InstallOnly ZIP·APK 재설치·재빌드로 이어가지 않으며, 일반 웹 Playwright는 유지한다. 새 API·계정·추가 결제·PC/서버 브라우저로 대체하지 않는다.

현재는 후보 소스다. `codeCandidate:true`, `productionRegistered:false`, `geminiAssistanceAvailable:false`, `liveExecutionVerified:false`를 유지한다. 코드 검사·문서·인계 준비가 운영 등록, 설치된 플러그인의 갱신, 실제 휴대폰 성공을 증명하지 않는다. 기술 계약은 [provider-contract.md](provider-contract.md)를 따른다.

[contract]: https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/blob/67c69428f27030237f417753c717ab758faaa855/jh-server/owner-setup/gemini-native/src/contract.mjs
[workflow]: https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/blob/67c69428f27030237f417753c717ab758faaa855/jh-server/owner-setup/gemini-native/src/native-workflow.mjs
