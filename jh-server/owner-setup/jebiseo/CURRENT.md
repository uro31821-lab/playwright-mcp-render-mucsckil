# 제비서 — Stage72 기준 개발 체크포인트

갱신일: 2026-11-05. 사용자 지시: 중지 이후 **다시 진행**.

## 현재 기준

- 저장소: `uro31821-lab/playwright-mcp-render-mucsckil`
- 기준: [PR #159](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/pull/159), 병합 커밋 **`5d72b78fd3730111076b33e2771f5b6b70f657aa`**. 해당 PR의 최종 head CI 6개 성공과 병합 상태를 확인했다.
- 설치 기준: **Stage62 FIX3 APK 그대로 유지**.
- 서버 경로: **Stage71 Android → Manual**. Stage72는 현재 상태 인계 기준이다.
- 조회로 확인한 실제 live 서버 커밋은 `a06e4643a036fa7cc121ef997bc332a43f2f85df`다. Stage72 병합과 실제 서버 배포를 같은 사건으로 표시하지 않는다.
- **InstallOnly ZIP 실행, APK 재설치·재빌드·데이터 초기화 없음.**
- 기존 [Draft PR #145](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/pull/145), 브랜치 `feat/jh-jebiseo-mobile-20261104`에서 이어간다. 통합 전 후보 head는 `76d9d3488753939e9775e2ba8f4619d470e0e0c6`다. 최신 기준을 이 후보에 병합했으며 기존 보호 소스·승인 규칙을 변경하지 않았다.

기준 원문은 [Stage72 현재 상태](../../../../jh-mobile-dual-engine/stage72/current.json)와 [Stage70 동작표](../../../../jh-mobile-dual-engine/stage70/alias-matrix.json)다. 이전 모바일 Playwright 전환 계획은 현재 기준으로 대체한다. 일반 웹 Playwright는 유지한다.

PR 반영 직전 최신 main `197319f91866351514b95f92e27973c62d46d0ff`도 소스에 보존 병합했다. Stage72 이후 추가된 파일은 Stage73/74의 별도 설치 전달물 기록·정적 검사·CI 3개뿐이며 서버 코드와 기존 보호 기준은 같았다. 이 기록의 설치 안내를 이번 제비서 작업의 설치 지시로 채택하지 않는다. 이 작업의 기기 기준은 위 Stage62 FIX3 유지 조건이다.

## 목표와 세 기능

휴대폰의 GPT에서 요청하면 왼쪽 GPT를 유지하면서 오른쪽 Chrome의 `https://gemini.google.com/app`을 기존 JH 경로로 열고 현재 요청의 결과를 회수한다. 사용자가 Google/Gemini를 직접 열고 배치하는 절차를 정상 사용법으로 요구하지 않는다. 실제 GPT 전용 버튼을 만든 상태는 아니며, 명시적인 자연어 열기 요청과 구현 후보를 구분한다.

원래 [PR #63](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/pull/63)의 `67c69428f27030237f417753c717ab758faaa855`에 있는 세 기능을 보존한다. 세부 입력·근거·결과 조건은 [FEATURES.md](FEATURES.md)를 따른다.

| 기능 | 보존할 완료 조건 | 현재 단계 |
| --- | --- | --- |
| YOUTUBE | 같은 영상·질문에 해당하는 답변, 공개 설명·자막·영상·미확인 근거 구분 | 요청·결과 계약 보존. 전체 모바일 흐름 미완료 |
| VIDEO | 기존 포함 사용량·추가 결제 없음 확인, 실제 영상 회수·파일 검증·GPT 재생 전달 | 계약 보존. 실제 생성·회수·전달 미완료 |
| ANDROID | 명시적 OPEN_APP, 확인된 패키지, 독립적인 앱 상태 확인 | 기존 JH 경로 사용 조건 보존. 후보 연결 미완료 |

일반 상담·의견·검토를 위 세 기능의 대체 목록으로 쓰지 않는다. 별도 Gemini API·추가 결제·새 계정·서버 브라우저로 전환하지 않는다.

## 이번 코드 변경

| 동작 | 연결과 확인 기준 |
| --- | --- |
| OPEN | 기존 `life_web_navigate`와 고정 Gemini 주소 유지. 열기 요청만으로 입력·전송을 시작하지 않음 |
| FORM_SNAPSHOT | 원 `life_android_snapshot`의 완료 결과에서 발급된 guided-form 인자를 읽을 수 있도록 연결 |
| DISCOVER_INPUT | 현재 원본이 발급한 `form15_discover` carrier를 그대로 원 `life_android_step`에 전달 |
| TYPE | 발급된 `form15_type`의 세션·요청·필드 값을 보존하고 `value`만 현재 요청 문장으로 변경. 전송은 별도 동작 |
| DISMISS_NOTICE | 원본의 정확한 닫기 버튼·비승인 metadata를 검증한 `form_activate`만 사용. 전송·승인 버튼과 구분 |
| 결과 해석 | 현재 호출의 `agent_step.result.url`만 한 번 해석. 입력 실패·불확실·MANUAL·만료·재검토를 성공으로 올리지 않음 |
| 후속 진행 | 기존 기기·명령·창·질문·원 결과 연결을 유지. 확인되지 않은 효과가 남으면 다음 효과 차단 |

`guided-form.mjs`는 원본 완료 snapshot/discovery에서 발급 인자를 추출한다. 일반 RIGHT `item_` 참조를 native `f_` 식별자로 바꾸거나 새 세션·요청 값을 만들지 않는다. 호출자가 주입한 `guided_arguments`는 host에서 거부한다. 실제 원본과 같은 기기·명령·오른쪽 Gemini 창·대상·빈 입력칸을 검증한 신뢰된 host proof만 사용한다. 파싱 성공은 인증·승인·운영 등록의 증거가 아니다.

`guided-outcome.mjs`는 현재 guided 호출의 정확한 native 결과 슬롯만 해석한다. 다른 동작의 성공 코드·필드 불일치·손상된 JSON은 미확인으로 유지한다. `field_value_verified`는 입력칸 확인일 뿐 Gemini 전송·답변 성공이 아니다. `low_risk_action_dispatched`는 클릭 접수일 뿐 안내가 닫혔다는 증거가 아니다. `actionAccepted:false`도 실행 중 예외에서는 미실행 증거가 될 수 없다.

`mobile-outcome.mjs`는 원 결과의 대기·불확실·재검토·MANUAL·거절을 보존한다. secondary 안내, UI 글, 다음 provider 추천을 현재 실행 결과로 오인하지 않는다. 이 분류와 파싱 결과는 예약·pending 장벽·승인을 해제하지 않는다. 정확한 기존 원 결과 검증만 후속 동작을 허용할 수 있다.

`callOriginalTool`, `readCurrentBinding`, `verifyGeminiTarget`, `verifyObservation`은 기존 인증된 host 경계다. production 증거 생산기·등록을 모의 true로 대체하지 않는다. `codeCandidate:true`, `productionRegistered:false`, `geminiAssistanceAvailable:false`, `liveExecutionVerified:false`를 유지한다.

## 실제 휴대폰 기록과 이번 개발의 구분

- **2026-11-04:** 한 번의 OPEN이 `AMBIGUOUS_BROWSER`와 `EFFECT_UNKNOWN`을 반환했다. 반복 실행하지 않았으며 이를 성공이나 미실행으로 바꾸지 않는다.
- **2026-11-05 이전 실행:** 이미 분할된 GPT/Chrome에서 한 번의 Gemini OPEN 후 원 주소 확인과 별도 페이지 관찰이 성공했다. 실제 Gemini 페이지와 안내를 관찰했다. 이것은 전체 화면에서 자동 분할을 시작한 검증이나 세 기능의 전체 성공이 아니다.
- 같은 이전 실행의 안내 닫기는 `OWNER_ADMISSION_BLOCKED / FAILED_PRE_DISPATCH`였고 클릭·입력·전송은 진행되지 않았다. 이 과거 거절을 최신 Stage72의 미확인 원인으로 단정하지 않는다.
- **이번 재개는 코드 개발이다.** 새 휴대폰 명령·클릭·질문 전송·영상 생성·APK 설치를 하지 않았다.

현장 명령·기기·승인·작업 식별자와 개인 화면 원문은 공개 소스에 넣지 않는다. 다른 방의 정보·설치된 플러그인 변경이 자동으로 연결됐다고 가정하지 않는다. 과거 개인 플러그인 반영 이력과 이번 Git 후보의 overlay 변경은 별개다.

## 검사

보호 원본 선행 게이트: **10 passed / 0 failed / 0 skipped**.
최종 로컬 통합 검사: **262 passed / 0 failed / 0 skipped** (약 3.5초).
두 의존성 경로는 package.json과 lockfile이 같은 기존 설치를 재사용했다.
후속 main 기록 병합 뒤에는 영향 범위인 보호 원본·Stage71·Stage73 검사 **19개 모두 통과**를 확인했다. 제비서 실행 코드와 통합 검사는 이 병합에서 변경되지 않았다.

실행 범위는 [.github/workflows/jh-jebiseo-mobile-candidate.yml](../../../../.github/workflows/jh-jebiseo-mobile-candidate.yml)에 고정한다. 제비서·기존 실제 생성 핸들러·공통 허브 검사와 Stage66/67/69/70/71/72 계약을 함께 실행한다. 같은 중간 생성 파일을 사용하는 원 검사 때문에 `test-concurrency=1`을 유지한다. 보호 원본·pin·승인 규칙을 바꿔 검사를 통과시키지 않는다. 단위·통합·CI 통과는 실제 휴대폰의 입력·전송·답변 성공 증거가 아니다.

## 이어갈 위치

이 후보의 원본 snapshot/discovery 파서를 실제 신뢰된 host 관찰 생산기와 연결하고, 기능별 현재 요청·전송·결과 회수의 증거를 이어간다. 실제 실행 요청과 유효한 원명령이 있는 때만 휴대폰을 조작한다. 개발 재개만으로 BEGIN·재OPEN·질문 전송을 시작하지 않는다.

운영 PR 병합·서버 배포·APK 설치는 이번 개발 결과에 포함하지 않는다. 같은 기준과 검사·승인 기록을 재사용하며, 중지 요청이 오면 즉시 작업을 멈춘다.
