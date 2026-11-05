# 제비서 — Stage72 기반 반수동 개발 체크포인트

최신 사용자 확정: **왼쪽 GPT / 오른쪽 Gemini 고정**, 가능한 단계는 자동으로 진행하고 막히는 단계는 기존 **Android → Manual** 방식으로 이어간다. 유튜브 분석·영상 생성 결과는 Gemini에서 확인하며 GPT 자동 재전송은 개발 범위에서 제외한다.

## 현재 기준과 작업 범위

- 저장소: `uro31821-lab/playwright-mcp-render-mucsckil`.
- 작업: [Draft PR #145](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/pull/145), `feat/jh-jebiseo-mobile-20261104` → `jh-fix3-secure-server`. 일반 Playwright 계열 `main`은 병합 대상이 아니다.
- 사용자 기준선: [PR #159](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/pull/159), 병합 커밋 `5d72b78fd3730111076b33e2771f5b6b70f657aa`.
- **Stage62 FIX3 APK 유지 + Stage71 Android → Manual**을 사용한다. [Stage72 현재 상태](../../../../jh-mobile-dual-engine/stage72/current.json)는 이어받기 기준이다.
- 이번 반수동 변경 전 PR head: `27c3d9d6ea16619b48dd72531a79cb88e58c15ae`.
- 이번 재개에서 확인한 최신 대상 브랜치: `845c5dfd9925a9f40950f3a873b4e58bfada9990`([PR #171](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/pull/171), Stage79).
- 이전 대상 `0663e0c3b434f300803e5cf272609032a5e519d3` 이후 Stage77/78/79 기록·검사·CI **8파일**을 원 blob 그대로 보존할 예정이다. 제비서 실행·보호 원본과 무관한 변경이다.
- 이번 범위는 후보 코드·문서·관련 검사·기존 draft PR 반영이다. 운영 병합·서버 배포·휴대폰 조작·APK 변경은 수행하지 않았다.
- InstallOnly ZIP 실행, 새 APK 설치·빌드, 새 계정·유료 API·서버 브라우저로의 전환은 이번 범위에 없다.

## 최신 세 기능

| 기능 | 현재 요청 범위 | 이번 후보의 실행 방식 | 결과 확인 |
| --- | --- | --- | --- |
| `ANDROID` | Gemini가 지원하는 삼성 앱·기기의 대상·동작·필요한 내용. 일정·노트·계산기·연결 기기 등은 예시이며 고정 앱 목록으로 제한하지 않음 | Gemini **모바일 앱**을 오른쪽에 여는 단계부터 Manual 안내. 삼성 요청을 웹 Gemini로 대체하지 않음 | Gemini 또는 해당 앱·기기에서 확인 |
| `YOUTUBE` | 현재 사용자가 지정한 영상 링크와 분석 요청 | 실제 원본 연결이 있으면 고정 Gemini 웹 OPEN 1회와 같은 job 조회만 자동. 입력·실행은 Manual | 오른쪽 Gemini에서 확인, GPT 자동 반환 없음 |
| `VIDEO` | 현재 사용자가 지정한 영상 제작 프롬프트 | 같은 선택적 웹 OPEN 이후 Manual로 영상 만들기·입력·실행. 기존 구독 범위만 사용하고 추가 결제 금지 | 오른쪽 Gemini에서 확인, 영상 회수·GPT 전달 없음 |

휴대폰만 사용하는 흐름이다. 사용자가 추후 GPT에서 별도로 질문하는 것을 기본 흐름의 결과 가져오기·복사·재전송 의무로 바꾸지 않는다. 자동 클릭이 완성될 때까지 이 반수동 흐름을 막아 두지 않는다.

## 현재 구현 API

`handoff-request.mjs`의 `prepareJebiseoHandoff()`는 현재 요청만 준비한다. 입력은 `taskRef`, `threadRef`, `sourceRef`, `intent:execute`, `basis:direct|contextual_user_request`, `feature`, `requestText`이며, 필요하면 `target` 또는 `youtubeUrl`을 받는다. 개발·인용·부정·일반 설명은 비활성으로 남는다.

준비에는 휴대폰 명령·기기 연결·전역 Gemini 가용성을 요구하지 않는다. 현재 선택한 요청의 `prompt`, `promptDigest`, `requestDigest`만 만들며 다른 방·전체 대화를 읽거나 전송하지 않는다. 지원하는 요청 길이 범위에서 자동 입력 상한을 넘는 문장도 자르지 않고 `automaticInputFits:false`로 보존한다.

유튜브 주소는 정상·단축·Shorts·Live·embed 형식에서 영상 ID를 검증해 정규화한다. URL 파싱은 실제 영상 존재·전체 내용 분석의 증거가 아니다. `VIDEO`의 `existingPlanOnly:true`, `additionalPaymentAllowed:false`는 정책이며 `availabilityVerified:false`를 유지한다. 삼성의 `supportsCurrentTargetVerified:false`도 실제 기기별 지원을 추정하지 않는다는 뜻이다.

원본 binding의 새 진입점에는 **준비 결과가 아닌 원래 요청 입력 객체**를 전달한다.

```js
const session = binding.createHandoffRuntime({request, deviceId, commandId});
await session.start();
const display = session.presentation();
```

- `request`: 위 `prepareJebiseoHandoff()`의 원래 입력. 준비된 객체나 공개 JSON을 실행 증거로 전달하지 않는다.
- `deviceId`·`commandId`: 이미 유효한 원본 연결이 있을 때만 선택적 자동 OPEN에 사용한다. 새 명령을 만들지 않는다.
- `start()`: native 삼성 요청은 Manual OPEN을 안내한다. 웹 요청은 기존 원본 `OPEN`을 최대 한 번 호출하며 재호출·동시 호출도 반복 OPEN을 만들지 않는다.
- `readOpenStatus()`: 저장된 동일 `jobId`와 원 `commandId`로 `JOB_STATUS`만 읽는다. 자동 반복 조회·재OPEN·질문 전송은 없다.
- `presentation()`: 준비 문장과 남은 수동 절차를 한 번에 보여준다. `requiresUserReply:false`이며 매 단계 “열었어/입력했어/됐어”를 요구하지 않는다.
- `reportManualProgress({taskRef,threadRef,requestDigest,step})`: 사용자가 원할 때만 `OPEN|INPUT|SUBMIT` 진행 보고를 받는다. 이전·중복 보고로 안내를 뒤로 돌리지 않는다.
- `view()`: 현재 안내 상태를 읽는다. 사용자 보고는 실제 화면·전송·외부 작업 성공의 증거가 아니다.

INPUT 완료를 보고한 뒤에는 이미 입력한 문장을 다시 붙여넣게 안내하지 않는다. SUBMIT 보고 뒤에는 Gemini에서 결과 보기만 안내한다. 늦게 도착한 OPEN 응답·상태 조회는 원 참조를 보존하되 이후 수동 안내를 이전 단계로 되돌리지 않는다.

같은 task는 같은 facade를 재사용한다. `threadRef`, `sourceRef`, 요청 digest, 기기·명령이 달라지면 기존 task를 재사용할 수 없다. 요청별 식별과 원 작업 참조는 유지한다. 계정·서명 토큰을 로그에 추가하지 않으며, 준비 문장은 사용자 안내에만 표시한다.

## Manual 안내와 불확실 결과

`createJebiseoManualHandoff()`는 현재 요청에 묶인 단계별 **안내**를 만들며 실행 권한을 발급하지 않는다. 미시도·확인된 무효과 실패는 해당 단계의 Manual 안내로 이어간다. `USER_REPORTED_DONE`과 호스트가 전달한 결과값도 이 순수 함수에서 검증된 영수증으로 승격하지 않는다.

`PENDING`, `UNKNOWN`, `FAILED_AFTER_EFFECT`, `PHONE_SCOPED_SITE_DISCARD`, `EFFECT_UNKNOWN`, `NEEDS_REVIEW_NO_REPLAY`는 기존 요청·화면 확인으로 분기한다. 기존 전송 여부가 불명확한데 같은 요청을 수동으로 다시 보내도록 안내하지 않는다.

새 wrapper 자체가 실행한 것은 OPEN뿐이므로, 해당 열기 뒤 준비 문장을 보여주고 사용자가 오른쪽 Gemini를 확인한 다음 입력·실행하도록 안내할 수 있다. 반면 원본 binding이 기존 미확정 효과의 readback 장벽을 반환하면 준비 문장·재입력 절차를 내보내며 장벽을 우회하지 않는다. 기존 원 결과 확인이 우선이다.

이 흐름은 `TYPE`, `EXECUTE_SUBMIT`, `FORM_SNAPSHOT`, 새 화면 캡처, Gemini 답변 수집, 영상 내보내기를 호출하지 않는다. 현재 APK의 `agent_snapshot`·context 없는 START에는 화면 복원 가능성이 있으므로 반수동 흐름의 순수 읽기로 사용하지 않는다.

현재 카탈로그에는 `MANUAL_WAIT`·`MANUAL_DONE` 모드가 없다. APK 내부의 같은 이름 기능을 공개 도구처럼 호출하지 않는다. 기존 `split_comfort/MANUAL_HANDOFF`는 화면 재식별일 뿐 요청 전송·이전 작업 재개 증거가 아니다.

준비·Manual 안내·사용자 보고에서는 `requestSent:false`, `resultVerified:false`, `externalEffectVerified:false`, `geminiReplyVerified:false`와 재실행 금지를 유지한다. 안내 준비 성공과 Gemini 작업 성공은 별도다.

## 보존한 이전 자동화 후보

`host-runtime.mjs`, `mobile-port.mjs`, 원본 binding/composition 및 native proof는 기존 원 명령·기기·세션·Stage26 완료·Stage44 focus·durable hook 검사를 보존한다. 새 반수동 API는 이 보호 기준을 약화시키지 않는다.

기존 `android-app.mjs`의 유튜브·지메일·인스타그램 `OPEN_APP / APP_OBSERVE`는 **과거 직접 앱 열기 하위 API**다. 새 `ANDROID`의 삼성 앱·기기 위임 범위와 다르며, 새 경로에서 이 세 앱 목록을 사용하지 않는다.

기존 guided-form은 실제 발급된 native `f_`만 사용하고 `item_`를 바꿔 끼우지 않는다. 독립적인 현재 입력값·안내 종료·Gemini 전송 및 답변의 증명이 부족했던 부분은 추가 자동화 범위로 남긴다. 이를 반수동 요청 준비의 선행조건으로 두거나 결과 반환 개발을 다시 요구하지 않는다.

Gemini native의 실행 패키지 `com.google.android.apps.bard`와 화면 호스트 `com.google.android.googlequicksearchbox`는 다르다. 현 후보는 원 실행기의 패키지 확인을 임의로 완화하지 않고 native OPEN부터 Manual 안내를 제공한다.

과거 source audit에서는 `JH73_TRIP_INSTALL_FIXED.zip`의 SHA-256 `876b26376e81a22fa8fd23c3305e9b247849fac2bc87fce6940883762379c4f0`와 원 manifest **433개 파일**을 확인했다. 이는 보관 소스 검증이며 현재 설치 APK의 바이트 확인은 아니다. 과거 live SHA `a06e4643a036fa7cc121ef997bc332a43f2f85df`도 당시 조회 기록일 뿐 현재 배포 상태를 나타내지 않는다.

과거 실기기 기록에는 미확정 OPEN을 반복하지 않은 사례와 이미 분할된 GPT/Chrome에서 Gemini 주소·페이지를 확인한 사례가 있다. 안내 닫기의 과거 차단, 함수 fixture, CI 통과를 이번 반수동 기능의 실제 실행 성공으로 사용하지 않는다.

## 실제 검사 상태

| 구분 | 근거 | 결과 |
| --- | --- | --- |
| 이번 반수동 후보 로컬 관련 검사 | 8개 검사 파일을 실제 실행 | **127 pass / 0 fail / 0 skip** |
| 이번 새 binding/composition의 GitHub CI | 새 head 등록 후 PR의 해당 CI 실행으로 확인 | **작성 시 대기**. 최종 head 결과는 PR 기록 참조 |
| 이전 head `27c3d9d6ea16619b48dd72531a79cb88e58c15ae` | CI 8개 모두 성공, [주 실행 #42047230594](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/42047230594) | 보호 원본 **10 pass**, 통합 **337 pass**, 실패·건너뜀 0 |
| 이번 반수동 실기기·운영 배포 | 휴대폰 작업·APK 변경·배포를 수행하지 않음 | **미실행** |

이전 CI를 새 변경의 통과로 표시하지 않는다. 로컬 관련 검사에는 현재 환경의 전체 원본 생성 서버·인증 binding 통합 검사가 모두 포함됐다고 주장하지 않는다. 원 저장소·기존 lockfile 환경의 새 CI가 그 범위를 확인한다.

이전 ANDROID 최초 통합의 **336 pass / 1 fail**은 guard 예외를 원 wrapper가 `BLOCKED`로 반환하는데 검사에서 `UNKNOWN`을 기대한 오류였다. 기대값과 정확한 차단 코드·무추가 dispatch 검사를 고친 최종 결과가 위 `27c3…` 기록이다. 보호 원본·실행 규칙을 변경한 수정이 아니다. 더 오래된 세부 검사 이력은 PR #145의 해당 커밋 기록을 따른다.

기존 [.github/workflows/jh-jebiseo-mobile-candidate.yml](../../../../.github/workflows/jh-jebiseo-mobile-candidate.yml)의 실제 생성 서버·보호 원본·공통 허브·Stage 계약 검사를 이어 사용한다. 공통 생성 파일을 사용하는 검사는 `test-concurrency=1`을 유지하고, 보호 pin·승인 규칙을 바꿔 통과시키지 않는다.

## 이어갈 위치

최신 대상 브랜치의 무관한 8파일을 원 blob으로 보존한 후보에 반수동 코드·overlay·문서를 묶고, 새 head의 binding/composition 및 기존 CI 결과를 확인해 Draft PR #145에 기록한다. 같은 기준의 이미 완료된 검사를 불필요하게 반복하지 않는다.

현재 완료 범위는 반수동 코드 후보와 위 로컬 관련 검사다. `productionRegistered:false`, `geminiAssistanceAvailable:false`, `liveExecutionVerified:false`를 유지한다. 실제 실행은 별도의 현재 사용자 요청과 기존 유효 연결에서 진행하며 개발 재개만으로 휴대폰 BEGIN·질문 전송·영상 생성을 시작하지 않는다.
