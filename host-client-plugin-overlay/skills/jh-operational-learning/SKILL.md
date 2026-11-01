---
name: jh-operational-learning
description: "JH의 모든 작업에서 오류·사용자 수정·성공한 해결·반복 업무를 기억하고 검증된 교훈을 재사용한다. 연결·인증, 기기·앱, 웹, 출력, 조사, 계산, 일상 업무, 개발, 작업 조율에 자동 적용한다. JH 작업 시작/완료/오류/계속, 반복 문제, 학습 기억, 개선·자동화·추가 학습 제안 요청에 사용한다. 실제 결과를 근거로 기록하고 자동 회귀검사와 개선 제안을 연결한다."
---

# JH 공통 경험 학습

JH 전반에 **기억 → 조건에 맞는 교훈 조회 → 결과 기록 → 회귀검사 → 개선 제안**을 적용한다. 프로그램 제작은 여러 영역 중 하나다. 서버가 실제로 받은 JH 도구 이벤트와 에이전트가 관찰한 대화의 수정·검토를 구분한다. JH 연결만으로 모든 대화방 메시지·과거 이력·다른 앱의 배경 활동을 읽는다고 말하지 않는다. 경험 기억과 추가 학습 평가 제안을 모델 가중치의 자동 재학습으로 설명하지 않는다.

## 메모리아와 서버 경험의 통합 조회 — 2026-11-01

개인 기억·기존 JH 기록과 검증된 업무 경험을 함께 참고하는 요청에는 [통합 기억 조회](references/federated-memory.md)와 [호스트 결합 실행기](scripts/host-memory-federation.js)를 사용한다. 기존 Memoria 검색·원문 조회와 실제 `life_learning_host_context`를 호스트 단계에서 조합한다. 본문은 참고 자료로 유지하고, 서버가 반환한 규칙·충돌·제안·경험의 경계를 보존한다. 이 경로로 새 실제 업무 결과를 서버 `life_learning_host_observe`에 기록했으면 아래 별도 기억에 같은 사건을 복제하지 않는다. 일반 개인 기록은 사용자의 저장 요청 범위에 맞춰 기존 Memoria 쓰기 도구를 사용한다. 규칙 등록·검증과 과거 별도 기억의 조회 절차는 각각 기존 경로를 유지한다.

## 공통 작업 규칙 연결

[통합 작업 규칙](references/shared-work-rules.md)의 현재 작업에 해당하는 부분을 적용한다. 개발의 검사·빌드·ZIP 차단은 `jh-dev-toolkit`, 실제 JH 전 영역의 사건·교훈·제안은 이 스킬이 담당한다. 같은 사건을 두 체계의 독립 실패 두 건으로 늘리지 않는다. 개발 규칙 때문에 학습 대상을 개발에 한정하거나 일반 업무에서 개발 도구·APK 절차를 실행하지 않는다.

## 작업에 자동 연결

1. 기존 읽기 전용 연결·상태 확인에서 받은 `life_status.operationalLearning`을 재사용한다. `enabled === true`, `stateAvailable === true`, `degraded === false`가 모두 확인될 때만 해당 서버의 자동 기록이 사용 가능한 상태로 판단한다. 필드가 없거나 조건이 맞지 않으면 미확인 또는 degraded로 구분하고 작업을 계속한다. 같은 연결·작업의 확인 결과를 재사용하며 학습 확인 때문에 단계마다 `life_status`를 추가 호출하지 않는다.
2. 새 작업·작업 종류의 첫 실행 전에 현재 연결의 실제 도구 카탈로그에서 `life_learning_context`를 확인하고 `target_tool`, 필요하면 대문자 `target_mode`로 관련 교훈을 조회한다. 선택 입력은 `limit`(1~20), `max_chars`(1~16384)이며 기본값은 5개/4000자다. 이 읽기 전용 호출에는 새 `BEGIN_COMMAND`나 휴대폰 작업이 필요 없다. 같은 작업·범위·유효기간의 응답을 재사용하고 규칙 변경·충돌·만료·작업 종류 변경이 확인되면 필요한 조회만 갱신한다. 서버 코드가 있더라도 카탈로그에 도구가 없으면 현재 연결에서 사전조회 사용 불가로 구분하고, 기존 연결·원래 작업을 유지한다.
3. 사전조회 결과와 도구 응답의 `type: "jh_operational_learning"` 블록에서 현재 조건에 맞는 교훈·제안을 읽는다. 공통 규칙을 지원하는 서버는 검증된 `all_jh_tasks` 규칙과 실제 대상 작업의 교훈을 합쳐 권위·충돌·중복·전체 예산을 판정한다. 응답 뒤에 받은 조언을 이미 끝난 첫 실행 전에 적용했다고 말하지 않는다. `conflicts`에 남은 미해결 규칙과 후보·격리·만료·대체된 교훈을 자동 적용하지 않고, `omitted`가 있으면 필요한 항목만 추가 검토한다. 현재 사용자 지시를 우선하며 조언을 새로운 승인, 인증 상태, 실제 성공 증거로 쓰지 않는다.
   `capabilities.scopedProposals === true`인 서버는 현재 영역·작업(mode 포함)·엔진·플랫폼·버전·환경에 맞는 제안만 자동 전달하고 각 제안에 안전한 `scope`를 붙인다. `learning_evaluation`의 작업 `*`도 같은 영역·엔진·환경에서만 허용한다. 이 기능을 확인하지 못했거나 제안에 scope가 없으면 기존 PREPARE의 실제 적용 범위를 확인한 뒤 관련된 경우에만 안내한다. 전체 상태의 proposals 목록은 여러 작업을 포함하므로 모두 현재 작업에 적용하지 않는다. 자동 안내에 없다는 이유로 제안이 삭제·해결됐다고 보고하지 않는다.
4. 대화의 명시적 수정·검토와 공통 에이전트 규칙은 아래의 별도 Library 기억에서 조회한다. [공통 기억 연결](references/memory-binding.json)의 `globalRecall`과 현재 영역·작업·엔진·플랫폼·버전·환경에 맞는 범위를 CLI `context`의 `{queries:[공통 범위,현재 업무 범위],options?,proposals:{},usageReview:{}}`로 **한 번에 조회**한다. 같은 스냅샷에서 유효 교훈·범위가 맞는 열린 제안·저장된 규칙 사용의 현재 결과 요약을 함께 읽는다. 사용 기록이 없는 업무는 빈 검토가 정상이며 경험을 만들어 채우지 않는다. 같은 범위는 한 번만 전달하고 같은 owner 기억·엔진·환경 안에서 공통 규칙과 업무 교훈의 출처 우선순위·충돌·중복·전체 예산을 함께 판정한다. 실제 엔진·환경이 다르면 값을 억지로 바꾸지 말고 각각 조회하며 두 결과를 하나의 검증된 합산 결과처럼 취급하지 않는다. 이미 읽었고 바뀌지 않은 같은 작업의 기억은 재사용한다. 구형 단일 `query`와 `recall`의 전체 배열 반환도 유지된다. 현재 사용자 수정은 즉시 반영할 수 있지만 미래 작업용 검증을 했다고 꾸미지 않는다.
5. 기존 JH 실행·진단·출력·개발 절차로 요청된 작업을 수행한다. 별도 기억의 규칙을 실제 다음 행동에 사용할 때는 아래 `usage-prepare → observe.ruleUses` 절차로 선택과 실제 사용 근거를 연결한다. 단순 조회한 규칙을 모두 사용으로 기록하지 않는다. 학습 때문에 `BEGIN_COMMAND`, 휴대폰 조회, 화면 조작, 재설치, 외부 전송을 추가하지 않는다. 사용자가 이미 고른 연결·방식·같은 범위의 승인은 재사용한다.
6. 서버가 관찰하는 도구 이벤트는 서버에 맡기고 Library에 복제하지 않는다. 별도로 관찰한 사용자 수정·검토 등 새로운 사건만 아래의 `task-view → observe` 경로로 기록한다. 계속 작업은 체크포인트의 기존 taskId·실제 attemptId를 유지한다. 서버 자동 기록이 미확인이라는 이유만으로 같은 도구 이벤트를 복제하거나 저장됐다고 추정하지 않는다. 조회·재개·저장 재시도만으로 사건·시도·독립 작업을 만들지 않는다.
7. Library에 변경이 있으면 같은 파일에 저장한다. **새로 생성됐거나 응답 유실 뒤 복구한 관련 제안**을 원래 작업 결과 뒤에 짧게 설명하고, 근거가 갖춰진 개선 후보는 아래 검토 절차로 연결한다. 거절한 제안을 반복하거나 제안만으로 스케줄·기기 동작·추가 모델 학습을 실행하지 않는다.

## 기억 접근과 저장

서버 기억은 검증된 개인 서버 owner에 묶인 파일이며 같은 서버의 여러 인증된 JH 클라이언트가 공유한다. 아래 Library 파일은 대화의 수정·검토와 에이전트 교훈을 위한 별도 기억이다. 둘 사이의 자동 동기화는 없으며 `librarySync: "not_connected"`를 연결 완료로 해석하지 않는다. 서버 상태 조회나 응답 블록만으로 Library가 갱신됐다고 말하지 않는다.

- [memory-binding.json](references/memory-binding.json)의 정확한 파일 ID를 사용한다. 해당 계정의 Library 스킬 절차로 최신 파일과 버전을 읽고 로컬에 가져온다. 처음 연결할 때만 필요하며 한 작업의 각 도구 호출마다 다시 내려받지 않는다. 다른 이름의 비슷한 파일로 대체하거나 새 사본을 계속 만들지 않는다.
- [CLI](scripts/cli.mjs)를 Node로 실행한다. 별도 npm 패키지는 필요 없다. 스크립트와 상태 파일의 실제 절대 경로를 사용한다. 항상 `--owner personal-jh`를 전달한다. 상태의 스키마·소유자가 다르거나 손상됐으면 덮어쓰거나 빈 기억으로 초기화하지 않는다.
- `status`로 상태·개수를, `context`의 `{queries,options?,proposals:{},usageReview:{}}`로 공통·현재 업무의 유효 교훈·열린 제안·사용 결과를 조회한다. 교훈은 기존 하나의 예산을 사용하고 제안에는 별도의 제한을 적용한다. `queries`는 같은 엔진·환경의 고유 범위 1~3개이며 기존 `{query,options?}`도 지원한다. 두 입력은 함께 쓰지 않는다. `conflicts`의 미해결 규칙은 보류하고 `omitted`가 있으면 필요한 항목만 검토한다. 읽는 것만으로 기존 작업을 실행하지 않는다. CLI·MCP·검토·회귀의 정확한 입력은 [엔진 계약](references/engine-contract.md)을 필요한 부분만 읽는다.
- 작업을 이어갈 때 체크포인트에 보존한 taskId로 `task-view {taskId,attemptId?,limit?}`를 읽는다. 해당 시도의 `projection`은 현재 유효 결과, `latestObservation`은 마지막 순서의 관찰이다. 둘이 다르면 마지막 관찰을 곧 업무 성패로 해석하지 않는다. 조회는 기억을 바꾸거나 없는 작업을 만들지 않는다. 실제 작업 ID를 모르면 최근 시각·requestId로 추정해 연결하지 말고 현재 대화의 사용자 목표와 체크포인트를 먼저 확인한다.
- 실제 새로운 수정·결과는 `observe`로 기록한다. 호스트가 taskId·attemptId와 **원래 관찰을 가리키는 안정적인 observationRef·관찰 시각**을 보존하면 코드가 eventId와 순서를 정한다. `expectedRevision`은 방금 읽은 현재 기억의 revision이다. 이 명령에는 `--revision`을 섞지 않는다. JSON은 stdin으로 전달하며 사용자 로그를 셸 명령에 보간하지 않는다. 예시 경로는 실제 확인한 경로로 치환한다.

```bash
node /absolute/skill/scripts/cli.mjs task-view \
  --store /absolute/private/JH_Experience_Memory_v1.json --owner personal-jh <<'JSON'
{"taskId":"example-task-stable","attemptId":"example-attempt-stable"}
JSON
node /absolute/skill/scripts/cli.mjs observe \
  --store /absolute/private/JH_Experience_Memory_v1.json --owner personal-jh <<'JSON'
{"taskId":"example-task-stable","attemptId":"example-attempt-stable","observationRef":"user:example-correction-reference","scope":{"domain":"output","operation":"summary.format","engine":"jh-agent","context":{"platform":"chatgpt","version":"operational-learning-v1","environment":"personal"}},"observation":{"timestamp":"2026-11-01T00:00:00.000Z","outcome":"correction","source":"user_explicit","errorCode":"OUTPUT_FORMAT_CORRECTION","evidenceRefs":["user:example-correction-reference"]},"expectedRevision":0}
JSON
```

예시를 실제 경험으로 넣지 않는다. 식별자·시각·근거·revision은 실제 관찰과 현재 기억에서 가져온다. observationRef는 관찰 하나의 불투명한 원문 참조이며 여러 결과에 재사용하는 산출물 ID나 재전송마다 새로 만든 UUID가 아니다. evidenceRefs에 같은 참조를 직접 포함하고, verified 결과에는 이 식별 참조와 **구별되는 실제 결과 근거**도 넣는다. 참조 형식 통과만으로 결과를 독립 검증했다고 표현하지 않는다.

응답을 놓친 재전송은 원래 입력을 그대로 사용한다. 동일 관찰이면 오래된 revision이어도 `duplicate:true`로 기존 사건과 현재 시도 요약을 반환하며 기억을 다시 쓰지 않는다. 같은 참조의 다른 내용, 오래된 revision의 새 관찰, 같은 시도의 기존 관찰보다 과거 시각인 새 관찰은 거절된다. timestamp는 근거의 원격 생성 시각이 아니라 실제 관찰 시각이며 재전송 때 현재 시각으로 바꾸지 않는다. 오래전에 실행된 작업을 지금 처음 검증했다면 지금의 새 관찰로 기록할 수 있다. 저장 장애로 원래 업무를 다시 실행하지 않는다. 기존 `ingest`는 명시적인 과거 이력과 호환 호출에 유지하며 이 경로의 충돌·순서 검사를 피하는 데 쓰지 않는다.

- 수정 후 `replace_library_file`로 **같은 library_file_id**에 저장하고 읽을 때 받은 `expected_current_version`을 사용한다. 정상 저장 결과와 파일 신원을 보존한다. 두 JH 플러그인과 개인 스킬은 같은 Library 기억을 사용하므로 각자 파일을 생성하지 않는다.
- 저장 충돌이면 최신 상태를 다시 가져와 아직 저장하지 못한 **사건/변경분만** 병합한다. 최대 세 번 내에서 수행하고 버전 검사를 제거하지 않는다. 서버나 기기 작업은 재실행하지 않는다. 충돌이 계속되면 해당 기록의 저장이 미완료임을 알리고 기존 작업 결과와 대기 변경분을 보존한다.
- Library 도구·저장소·실행환경이 없으면 대화에서 관찰한 경험의 추가 저장은 미완료로 남기고, 사용할 수 있는 서버 조언과 현재 대화의 검증된 경험을 활용한다. 저장됐다고 주장하거나 원래 작업을 멈추지 않는다. 상태 파일에는 암호·OTP·인증 토큰·쿠키·메일 본문·화면 원본·계좌 정보·원문 URL 쿼리를 넣지 않는다. 원문이 필요한 증거는 별도 승인된 위치에 두고 불투명한 참조만 기록한다.

## 영역과 결과 분류

| domain | 대상 |
| --- | --- |
| connection | MCP·서버·브릿지·서비스 로그인 단계의 연결/인증 |
| device | 휴대폰·앱·화면 조작과 결과 확인 |
| web | 웹 탐색·웹 업무·현재 계정과 페이지 확인 |
| output | 답변·문서·이미지의 형식, 누락, 사용자 수정 |
| research | 자료 찾기·출처 검증·비교·요약 |
| calculation | 수치·단위·계산·집계 검증 |
| routine | 반복되는 일상·업무 절차 |
| development | 코드·빌드·ZIP·배포 준비와 회귀검사 |
| orchestration | 작업 순서·도구 선택·중복 확인·인계·학습 범위 |

`operation`은 입력값과 분리한 안정적인 작업 이름으로 정한다. 예: `app.open`, `article.summary`, `summary.format`, `routine.daily-summary`. 서버가 허용 mode를 포함해 구분한 작업 종류를 합치지 않는다. 엔진과 버전이 다르면 분리한다. 알 수 없는 버전을 특정 버전처럼 꾸미지 않는다.

- `taskId`는 사용자 목표 하나에 대해 유지한다. 계속·일시 중지·결과 조회 때 새 작업으로 세지 않는다. 실제 원격 작업 ID가 없으면 별도의 로컬 불투명 ID를 만들되 서버 ID로 사용하지 않는다.
- `attemptId`는 실제 시도 하나다. 같은 시도의 완료 조회는 같은 ID를 사용한다. 수정 지적은 원래 시도에 남기고, 실제로 수행한 개선 작업은 같은 taskId의 새 attemptId로 기록한다. 단순 조회·재개·저장 재시도에는 새 attemptId를 만들지 않는다. `observe`는 해당 시도의 전체 사건에서 다음 sequence를 원자적으로 정하며, 일반 호스트 기록에서 직접 순서를 계산하지 않는다.
- `success_verified`와 `failure_verified`는 실제 결과 근거가 있을 때만 사용한다. `source`는 `host_verified` 또는 `user_explicit`, `evidenceRefs`는 비어 있지 않아야 한다. 사용자 보고만 있고 결과 확인이 안 됐으면 `user_reported`와 미확인 상태를 쓴다.
- `pending`은 접수되어 대기·진행 중인 작업, `observed`는 호출·결과를 관찰했지만 업무 성패를 검증하지 않은 상태로 분류한다. 둘 다 성공·실패나 개선 제안의 근거 횟수로 세지 않는다.
- 도구 반환, HTTP 200, 큐 접수, 서명된 완료 수신, 실제 업무 성공을 구분한다. 지연·타임아웃·불명확한 종료는 `completion_unknown`으로 남기고 기존 영수증/결과를 확인한다. 성공이나 미실행을 단정하지 않는다. 늦게 검증되면 같은 시도에 더 높은 순서의 결과를 연결하고, 반복 polling·오류 알림은 새 실패로 세지 않는다. 늦은 `pending`·`observed`로 검증된 결과를 낮추지 않는다.
- 접근 거부는 `blocked`, 취소는 `cancelled`, 명시적 사용자 수정은 `correction`이다. 권한 차단을 우회할 학습 대상으로 삼지 않는다.
- 허용된 선택 필드는 `errorCode`, 실제 측정한 `metrics`(durationMs/userSteps/toolCalls), 검토 근거가 있는 `labels`(reviewed/ruleRemediationTried/holdout), 아래 계약을 통과한 `ruleUses`다. 추정한 비용·횟수·검토 상태를 사실로 넣지 않는다. 사용 기록만으로 labels나 개선 제안 상태를 자동으로 올리지 않는다.

## 제안을 만드는 기준

초기 기준은 조정 가능한 운영 설정이다. 동일 조건의 독립 작업에서 오류/수정 2건이면 규칙 개선, 검증된 성공 3건이면 반복 업무 자동화를 제안한다. 완료 미확인 1건도 결과 확인 개선을 제안할 수 있다. 조회 횟수가 아니다.

| 종류 | 제안 내용 |
| --- | --- |
| rule_fix | 원인 검토, 조건을 좁힌 해결 규칙, 재발 검사 |
| workflow_automation | 반복 절차를 재사용 가능한 작업으로 만들고 결과 확인 포함 |
| verification_gap | 기존 시도의 영수증·결과 확인 보강; 자동 재실행 금지 |
| learning_evaluation | 규칙 개선 후에도 남은 문제에 후보 방법과 추가 모델 학습 필요성 평가 |

제안에는 독립 작업 수, 근거, 적용 조건, 바꿀 내용, 필요한 검증을 포함한다. 시간/단계 측정값은 현재 비용의 기준값이며 실제 절감 효과로 표현하지 않는다. `expectedBenefit.savings=null`이면 절감 효과 미측정이라고 설명한다.

새 채택·기각은 아래의 `DECIDE` 또는 별도 기억의 CLI `decide`로 판단 근거와 이력을 남긴다. 기존 `proposal-status`의 `accepted → implemented → verified`는 실제 진행에 맞게 별도로 관리하며 `verified`에는 실제 통과 검사와 근거가 필요하다. 완료 미확인이 해소되면 제안의 `resolved`는 불확실 상태 해소를 뜻하며, 수정 효과 검증을 뜻하지 않는다.

추가 학습 평가 제안은 검토된 실패의 독립 작업 최소 3개, 서로 다른 작업 종류 최소 2개, 규칙 개선 시도, 훈련 사례와 분리된 평가 작업이 있을 때만 나온다. 이 최소치는 학습 데이터가 충분하다거나 성능 향상을 보장하는 기준이 아니다. 유용한 학습/검색/프롬프트·도구 개선을 먼저 비교한다. 모델 학습 실행·유료 작업·데이터 업로드·외부 행동은 제안 생성에 포함되지 않는다.

## 원래 결과 확인과 기억 정정

서버의 `capabilities.existingReceiptReconciliation === true`는 기존 결과 조회에서 **호스트가 검증한 같은 시도의 영수증**으로 학습 기록을 보완하는 기능이다. `open_url`의 엄격한 오른쪽 Chrome 주소 확인은 해당 주소 확인 범위의 검증된 결과로 다룬다. 원래 작업의 결과 확인 단계에서 이미 알려진 동일 job·command로 읽을 때 적용하며, 학습 때문에 새 기기 작업이나 별도 결과 조회를 추가하지 않는다. 응답의 일반 `ok:true`나 서명된 수신만으로 성공을 만들지 않는다.

호스트는 현재 runtime에 기록된 유일한 원래 시도·task·출처·엔진·환경을 대조하고, 미확정·대기·관찰 결과만 실제 검증 결과로 보완한다. 중복 조회는 새 경험이 아니며, 이미 다른 검증 결과가 있거나 차단·취소·연계 누락이면 그대로 둔다. 기존 기기 job·영수증은 재시작 후 복원되지 않으므로, 과거 해시나 재사용된 job 번호를 추측해 연결하지 않는다. 학습 기억의 영속 보존과 영수증 복구를 구분한다.

`capabilities.splitReadObservationReconciliation === true`이면 기존 분할 화면 START/STATUS의 원래 영수증 조회에서 확인한 좌우 창 배치도 같은 시도에 연결한다. `verifiedObservationScope: "SPLIT_READ_LAYOUT_ONLY"`의 저장 결과는 `observed`이며 근거의 `source:jh-split-read-layout-only`는 검증 범위를 나타낸다. 화면 내용·특정 목표 앱·context 일치·전체 업무 성공까지 검증한 것으로 해석하지 않고 후보 적격 근거나 자동화 성공 횟수로 세지 않는다. 다른 snapshot·일반 완료 플래그로 이 근거를 대신하지 않는다. 기존 조회 시각의 유효기간 검사를 유지하고, 반복·약한 후속 통지가 확인 근거를 지우지 않게 한다. 이 관찰로 `open` 확인 제안이 `resolved`가 되더라도 결과 수신의 불확실성 해소로만 설명한다. 정확한 호스트 제한은 [엔진 계약](references/engine-contract.md)의 기존 영수증 절을 따른다.

## 사용자가 직접 정한 규칙 등록

반복 경험 제안이 없어도 실제 사용자 지시는 별도 후보로 등록한다. 현재 대화에서 읽은 일반 업무 규칙은 아래 **호스트 CLI 경로**, 실제 서버 도구의 규칙은 지원이 확인된 **서버 경로**로 연결한다. 경험·proposal을 꾸며 등록 조건을 채우지 않는다.

원문은 `instruction.text`에 그대로 두고 `user:` 불투명 `sourceRef`, 정확한 UTF-8 원문의 `sourceSha256`, `confirmation: "explicit_user_instruction"`, 안정적인 `lessonId`와 `ruleVersion`을 준비한다. 기존 기록에서 원문을 실제 읽었을 때만 `library:`·`source:`·`artifact:`의 `sourceRecordRef`를 넣는다. 공백·줄바꿈을 교정하거나 요약·추론을 사용자 원문으로 승격하지 않는다. SHA-256은 제공한 원문의 무결성 확인이며 발화자의 독립 인증이 아니다. 민감한 내용은 규칙 본문에 저장하지 않는다.

### 일반 대화·별도 기억의 호스트 경로

현재 `context`에 같은 요구를 포함하는 유효한 기존 규칙이 있으면 그 원문·출처·범위·검사 상태부터 확인해 재사용한다. 코드의 중복 판정은 동일 정의·suite에 대한 것이며, 전문에 포함된 단문·다른 출처 참조·새 suite의 의미상 부분 중복까지 자동 병합하지 않는다. 새 후보가 준비됐다는 이유만으로 기존 정책의 단문 사본을 추가 등록하지 않는다.

1. 동봉 CLI `instruction`에 `{instruction,suite,scope,globalRecall?}`를 전달한다. 특정 업무는 `instruction.appliesTo:{kind:"exact_scope"}`, 실제 모든 JH 작업에 적용하라는 지시는 `{kind:"all_jh_tasks"}`다. `scope`는 현재 실제 `{domain,operation,engine,context}`이며 일반 업무를 MCP `tool`로 가장하지 않는다.
2. 공통 규칙은 [기억 연결](references/memory-binding.json)의 실제 `globalRecall`을 함께 전달한다. 코드는 `orchestration / learning.scope`와 현재 scope의 동일한 엔진·전체 context를 검사한다. 다른 환경을 맞추기 위해 값을 수정하지 않는다. 공통 규칙도 해당 엔진·환경에서만 조회되며 서버 기억으로 자동 전파되지 않는다.
3. `instruction`은 한 번 읽은 기억의 `{baseRevision,lesson,suite,instructionSummary}`를 반환하며 **저장·활성화하지 않는다**. 이 명령에 `--revision`을 넣지 않는다. 원문·출처·적용 조건·정상/오류 사례를 검토한 뒤 반환된 `{lesson,suite}`로 `candidate --revision <baseRevision>`을 수행한다.
4. `candidate` 응답에는 `{revision,lesson}`만 있으므로 준비 응답의 **동일 suite를 보존**한다. 등록 응답 lesson과 그 suite로 `check`를 수행하고, 공통·현재 업무를 합친 `context`에서 실제 조회 포함 여부를 확인한다. CHECK에 `--revision`을 넣지 않는다. 실패·격리·만료·충돌 규칙을 성공으로 보고하지 않는다. 실제 로컬 변경이 생기면 위 기억 저장 절차로 같은 파일에 저장한다.
5. revision 충돌이나 등록 응답 유실이면 `instruction`을 최신 상태에서 다시 준비해 기존 ID·현재 `baseRevision`을 복구한다. `candidate`는 오래된 revision의 동일 재전송도 거절한다. 이미 알고 있는 실제 규칙 ID의 저장·검사·현재 조회 상태는 아래 `lesson-view`로 확인한다. 같은 정의·suite로 이미 검증된 유효 active 규칙이면 상태·적용 범위를 확인해 재사용하고 불필요한 재검사를 하지 않는다. 정의나 suite를 바꾸거나 새 ID를 붙여 격리된 규칙을 되살리지 않는다.

호스트 결과의 `sourceAuthentication:"host_attestation"`, `sourceRetrievalVerified:false`를 유지한다. CLI의 owner 일치 검사는 기억 파일 소유권 경계이며 대화 원문 인증이 아니다. 준비·등록·검사는 실제 오류 사건·시도·proposal 수를 늘리지 않으며, 규칙 조회만으로 이후 업무에 이미 적용됐거나 효과가 검증됐다고 말하지 않는다.

### 실제 서버 도구의 경로

현재 카탈로그의 `life_learning_review`, 상태의 `apiVersion:3`과 `capabilities.explicitInstructions/commonRules` 지원을 확인한다. 특정 작업의 `appliesTo`는 `{kind:"tool",target_tool,target_mode?}`, 공통 지시는 `{kind:"all_jh_tasks"}`이며 owner·엔진·환경은 서버가 결정한다. `CANDIDATE`의 JSON 문자열 payload `{instruction,suite,expectedRevision}`로 후보를 등록하고 반환된 `lesson/suite/revision`으로 기존 `CHECK`, 다음 대상의 `life_learning_context`를 잇는다. 호스트의 `scope/globalRecall/exact_scope`를 이 서버 payload에 보내지 않는다.

서버 결과의 `authenticated_owner_attestation`도 인증된 owner 호출자의 확인이며 서버가 대화·Library 원문을 독립 조회한 증거가 아니다. 원문 한 건의 등록은 모든 방의 배경 수집이나 두 기억의 자동 동기화가 아니다. 상세 입력·회귀 사례·복구 계약은 [엔진 계약](references/engine-contract.md)의 명시 사용자 규칙 절을 따른다.

## 규칙 한 건의 상태 확인

명시 사용자 규칙·직접 후보처럼 proposal 연결이 없는 규칙도 동봉 CLI `lesson-view`로 확인한다. 실제 `status/context/instruction/candidate` 응답이나 저장된 체크포인트에서 얻은 `lessonId`와 **현재 업무의 query 또는 queries 중 하나**, 선택 `options:{now?,limit?,maxChars?}`를 전달한다. 현재 `context`와 같은 공통·업무 범위 및 예산을 사용한다. ID만으로 현재 업무 범위를 추정하지 않고 `--revision`은 넣지 않는다.

- `definition`은 저장된 지침·범위·출처 metadata이며 `lessonState`는 candidate/active/quarantined 상태다. 과거 원문을 이번에 독립 조회했거나 당시 등록 경로를 인증했다는 뜻이 아니다. 기존 metadata가 없으면 추정해 채우지 않는다.
- `evaluation.status`의 not_run/passed/failed/invalid와 `temporalStatus`, `scopeMatches`, `conflicts`, `recallIncluded`를 따로 확인한다. `active`만으로 현재 업무에 사용할 수 있다고 판단하지 않는다. 손상된 평가 영수증은 invalid로 표시하며 조회에 포함됐다는 기존 엔진 판정이 있더라도 재사용 근거로 삼지 않는다.
- `selectionStatus:not_selected`의 구체적 원인을 예산·권위·문구 중복·대체 중 하나로 추정하지 않는다. `recallOmitted`도 단순 예산 초과 개수가 아니다. `recallFingerprint`는 현재 조회 결과의 지문이며 실제 적용 영수증이 아니다.
- 이 조회는 원래 suite 본문을 복구하거나 CHECK를 다시 실행하지 않는다. 실제 재검사가 필요하면 보존한 동일 suite를 사용한다. 없는 규칙은 `LEARNING_LESSON_NOT_FOUND`이며 새 규칙·사건·proposal을 만들지 않는다.

한 번 읽은 기억에서 진단을 반환하며 파일·revision을 바꾸지 않는다. `pastApplicationVerified/liveImprovementVerified/liveExecutionVerified`는 false를 유지한다. 이미 확인한 같은 상태를 매 단계 다시 조회하지 않는다. proposal에서 시작한 개선은 기존 `progress`의 명시적 연결도 유지하며, 이 CLI 전용 입력을 서버 MCP에 보내지 않는다. 상세 반환과 경계는 [엔진 계약](references/engine-contract.md)의 해당 절을 따른다.

## 실제 규칙 사용과 결과 연결

별도 기억의 규칙을 실제 작업에 사용할 때만 동봉 CLI의 `usage-prepare`를 사용한다. 입력은 `{taskId,attemptId,lessonId,scope,globalRecall?,options?:{limit,maxChars}}`다. 현재 `context`에서 받은 실제 규칙 ID와 작업의 안정적인 taskId·attemptId, 실제 업무 scope를 사용한다. 공통 규칙을 함께 조회한 작업이면 `memory-binding.json.globalRecall`도 전달한다. 실제 첫 사용 **전에** 준비하고, 같은 준비 응답의 `selection`을 체크포인트에 그대로 보존한다. `--revision`, 임의 `queries`, 입력 `now`는 받지 않는다. 준비 시각은 호스트가 정한다.

준비는 현재 선택 가능한 규칙의 ID·버전·정의·검사·조회 지문을 묶는 읽기 전용 작업이다. 규칙 원문이나 시험을 다시 등록하지 않으며 사건·시도·실제 사용을 만들지 않는다. `selection`의 해시는 인증 서명이 아니고 준비를 실제 행동 전에 했다는 독립 증명도 아니다.

실제로 그 규칙을 사용한 근거가 있으면 **원래 기록할 새 결과 관찰**의 `observation.ruleUses`에 `{useRef,selection,appliedAt,confirmation:"applied_in_this_attempt",evidenceRefs}`를 넣는다. 한 관찰에 고유 규칙 최대 4개다. useRef는 실제 사용 관찰 하나의 안정적인 불투명 참조이며 결과의 observationRef와 달라야 한다. 사용 근거 1~8개에는 useRef를 직접 포함하고, 같은 참조를 바깥 observation.evidenceRefs에도 모두 포함한다. source는 `host_verified`다. 실제 사용 시각은 `selection.selectedAt ≤ appliedAt ≤ observation.timestamp`를 지킨다. 실제 사용 근거와 결과 근거는 각각 확인하며 선택 지문만으로 실제 사용을 주장하지 않는다. 정확한 입력은 [엔진 계약](references/engine-contract.md)의 같은 제목 절을 따른다.

사용하지 않은 규칙은 ruleUses에 넣지 않는다. 이미 저장된 결과에 사용 정보만 덧붙이려고 새 관찰·시도를 만들거나 준비 시각을 과거로 꾸미지 않는다. 같은 실제 사용은 한 번만 기록하고, 나중에 확인한 결과는 기존 taskId·attemptId로 ruleUses를 생략해 observe한다. 원래 사용 이력은 그대로 이어진다. 응답 유실 재전송에는 처음의 selection·useRef·시각·근거·확인값까지 정확히 유지한다.

무관한 작업으로 revision이 올라도 같은 준비 내용을 재검증할 수 있다. observe의 expectedRevision은 현재 값으로 보낸다. 정의·평가·선택이 바뀌어 새 사용 연결이 거절되면 준비 영수증을 다시 만들어 이미 끝난 행동에 끼워 맞추지 않는다. 실제 결과는 근거에 맞게 ruleUses 없이 기록하고 사용 연결이 미완료임을 구분한다. 규칙이 사용 시점에는 유효했고 뒤에 기간만 만료됐다면 그 당시의 선택·사용 시점 검사로 연결할 수 있다. 현재 격리·평가 변경은 보수적으로 거절하며 기존에 저장된 동일 사건의 재전송과 과거 조회는 유지한다.

`task-view`와 observe의 `current`에서 사용 이력이 있는 시도는 `ruleUses:{items,total,omitted}`를 반환한다. 최근 최대 8개이며 각 항목의 recordedEventId가 원래 사용 기록, result가 현재 유효 결과다. `result.afterUse`가 false이면 그 결과를 사용 이후의 결과로 표현하지 않는다. `result.verified`는 사용 이후 결과의 확인 여부이며 success와 failure는 outcome으로 구분한다. 사용 확인은 항상 `sourceAuthentication:"host_attestation"` 수준이고 `applicationVerified`, `preActionTimingVerified`, `liveImprovementVerified`는 false다. 실제 적용 독립 증명·인과 개선·절감 효과로 올려 설명하지 않는다.

이 경로는 동봉 호스트 CLI/API용이다. 서버 `life_learning_context`나 `life_learning_review`에 새 mode·필드를 보내지 않는다. 서버의 일반 응답 조회, 모든 대화의 자동 수집, 두 기억의 자동 동기화 또는 모델 가중치 재학습을 추가한 기능이 아니다.

## 사용한 규칙의 결과와 개선 검토

작업 시작의 합산 `context`에 `usageReview:{}`를 넣어 요청한 실제 업무 범위의 저장된 사용 결과를 읽는다. 별도 조회가 필요한 때만 CLI `usage-review {query 또는 queries,options?}`를 사용한다. 같은 엔진·전체 context의 고유 범위 1~3개이며 `--revision`을 넣지 않는다. 현재 유효한 같은 결과는 재사용하고 새 관찰·제안 상태·업무 범위가 바뀌면 해당 범위만 갱신한다.

- 그룹은 정확한 규칙 ID·버전·정의/입력 지문·실제 사용 범위로 나눈다. 공통 규칙을 다른 업무에서 사용한 결과를 하나의 효과로 합치지 않는다. 전체 원본 사용을 집계하며 화면에 잘린 task-view를 통계 원본으로 쓰지 않는다.
- counts의 successOnlyTasks·failureOnlyTasks·unconfirmedOnlyTasks·mixedTasks는 겹치지 않는 독립 task 수다. 한 task의 여러 attempt·사용·결과 조회를 반복 성공/실패의 여러 독립 작업으로 세지 않는다. 현재 결과가 실제 사용보다 앞서면 그 사용의 검증된 결과가 아니다. 혼합·미확인을 성공이나 실패로 임의 판정하지 않는다.
- 반복 실패·결과 미확인·혼합 근거의 reasonCodes/nextSteps를 읽고 실제 필요한 항목만 짧게 안내한다. 성공 한 task는 반복 근거가 부족한 상태이며 개선 효과를 증명하지 않는다. 근거가 없다는 이유로 과거 사건을 재실행하거나 테스트 사례를 실제 기억에 넣지 않는다.
- relatedProposals의 실제 ID는 현재 open/accepted이며 실제 scope·현재 결과의 문제 유형이 맞는 기존 제안이다. 필요한 항목은 아래 `review-context`로 원래 검토 packet과 사용 근거를 함께 읽고 기존 `decide/curate-register → check → progress`로 연결한다. 해당 규칙이 실패 원인이라고 단정하지 않는다. 후보 작성에는 새 review의 현재 사건·packetFingerprint를 사용하고 과거 사용 사건이나 noticeFingerprint로 대체하지 않는다.
- 기본 예산은 그룹 3개/12000자, 최대 10개/32768자다. `options` 또는 context의 `usageReview`에는 limit·maxChars·seenNoticeFingerprints만 넣는다. groups의 samples/relatedProposals와 최상위 omitted/suppressed를 확인한다. totals는 생략 전 실제 고유 개수다. 이미 실제로 안내한 정확한 noticeFingerprint만 최대 64개 seen에 넣으며 조회만으로 읽음·채택·기각 이력을 만들지 않는다.

이 검토는 상태·사건·제안·labels를 바꾸지 않는다. 원래 observe/propose 기준을 재사용하며 모델 학습·사용의 독립 인증·인과 개선 효과를 자동 판정하지 않는다. 손상된 기록의 조회 오류를 사용 0건이라고 설명하지 않는다. 정확한 반환·시간 연결·한도는 [엔진 계약](references/engine-contract.md)의 규칙 사용 결과의 범위별 검토 절을 따른다. 호스트 CLI 전용 기능이므로 서버 MCP에 usageReview 필드를 보내지 않는다.

## 개선 검토에서 사용 근거 읽기

별도 기억의 실제 제안을 검토할 때 동봉 CLI `review-context {proposalId,maxAttempts?,usageOptions?}`를 사용한다. 사용 결과 검토의 relatedProposals 또는 실제 저장된 제안에서 얻은 ID만 전달한다. 제안이 없으면 원래 작업을 계속하며 경험·제안을 꾸며 검토 조건을 만들지 않는다. 외부 packet·eventIds·query·now를 입력하거나 --revision을 넣지 않는다.

반환의 packet은 기존 review와 동일한 검토 자료이고, ruleUseEvidence는 같은 스냅샷의 부가 사용 근거다. packet.attempts에 선택된 정확한 시도·현재 결과만 대상으로 하므로 같은 task의 다른 시도를 섞지 않는다. precedingUses의 recordedEventId는 원래 사용 기록, 행의 resultEventId는 현재 결과다. nonPrecedingUseCount는 현재 결과보다 앞섰다고 확인할 수 없는 사용이다. 이를 현재 성공·실패의 선행 근거로 바꾸지 않는다.

- definition.status:matched일 때만 당시 정의 지문과 일치한 guidance를 읽는다. changed/missing/invalid일 때 현재 본문을 당시 적용 규칙처럼 대신 쓰지 않는다. packet.currentLessons의 현재 정의와 구별한다. historicalOnly/currentSelectionVerified 표시를 지키고, 이 본문을 다음 실행에 적용할 현재 유효 규칙으로 자동 승격하지 않는다.
- 실제 사용 근거와 현재 결과를 함께 검토하여 이미 시도한 규칙을 확인한다. 규칙 사용이 실패의 원인이나 개선 효과를 증명하지는 않는다. 원인·해결 제안은 계속 reviewed_inference로 구분하고 기존 후보·회귀검사 절차를 따른다.
- 결정·후보 등록에는 packet의 원래 baseRevision·packetFingerprint와 기존 계약이 허용한 현재 결과 eventIds를 사용한다. 부가 근거의 fingerprint나 과거 recordedEventId로 대체하거나 사용자 승인·후보 적격성을 새로 만들지 않는다.
- usageOptions는 maxUsesPerResult(기본 1, 최대 4), maxChars(기본 12000, 최대 32768)다. precedingUses.total/omitted·omittedResults·packet.truncated를 구별한다. totals는 원래 packet에 표시된 결과에 속한 사용 전체이며 전체 제안·기억의 집계가 아니다. 기록 0건을 실제 미사용 증거로 해석하지 않는다.

같은 검토 스냅샷은 재사용하고 현재 결과·규칙 정의·제안·revision이 바뀌면 새 검토를 준비한다. 읽기만으로 사건·후보·제안·labels·추가 학습을 바꾸지 않는다. 기존 review 명령과 서버 PREPARE는 유지되며 이 host CLI 입력을 서버 MCP에 보내지 않는다. 상세 반환은 [엔진 계약](references/engine-contract.md)의 개선 검토에 규칙 사용 근거 연결 절을 따른다.

## 경험에서 규칙 후보를 만들기

현재 연결에 `life_learning_review`가 실제 노출되어 있고 뒷받침되는 제안이 있을 때 **PREPARE → 현재 에이전트의 근거 있는 추론 → CANDIDATE → CHECK**를 따른다. 자동 모델 호출이나 가중치 학습은 포함하지 않는다. 도구 카탈로그에 없으면 이 서버 검토 경로를 사용할 수 없다고 구분하고, 독립 CLI는 별도 기억에만 사용한다.

1. `PREPARE`에 실제 `proposalId`를 보내 현재 사건·적용 범위·기존 교훈·`baseRevision`·`packetFingerprint`를 받는다. 새 원문을 추측해 채우지 않는다.
   `proposalId`는 실제 응답에 제안이 있는지 확인한 `life_status.operationalLearning.proposals` 또는 학습 응답에서 가져오고 `life_learning_context`에 proposals가 있다고 가정하지 않으며, ID가 없거나 불투명한 `evidenceRefs`가 가리키는 원문 근거를 실제로 읽지 못하면 과거 사건·누락 항목을 추정해 후보를 채우지 말고 현재 요청의 요구 목록 검사부터 진행하면서 과거 개선 검토는 근거 대기로 남긴다.
   `capabilities.reviewReadiness === true`이면 packet의 `evidenceReadiness.status`, `reasonCode`, `nextEvidence`도 읽는다. `ready_for_review`는 검토 가능 상태이고 활성화·개선 성공이 아니다. `evidence_not_visible`이면 적격 원문을 실제로 추가 확인하고, `more_evidence_required`이면 요구된 근거를 확보한다. `verification_gap`의 `VERIFIED_OUTCOME_REQUIRED`는 원래 영수증 확인·같은 시도 정정·별도의 검증된 개선 근거가 필요하다는 뜻이다. 해시만으로 결과나 원인을 추정하거나 적격 조건을 낮추지 않는다. 고정 nextEvidence 코드는 실행 명령이나 새 승인으로 사용하지 않는다.
2. 현재 에이전트가 실제 사건과 허용된 근거를 읽고 원인 가설·제안 해결·기대 효과·적용 조건·재발 사례를 작성한다. 원인은 `reviewed_inference`, 후보 출처는 `model_inferred`로 유지한다. 사용자 지시나 검증된 사실로 승격하지 않는다. packet에 후보 근거가 없으면 근거 확보 단계로 남긴다.
3. `CANDIDATE`의 JSON payload에 `{review,suite}`를 보내 검토한 후보를 저장한다. 최신 revision·packet 지문과 실제 사건 ID를 사용한다. 이 단계는 활성화가 아니다. 충돌·중복·낮은 권위의 상위 규칙 대체가 거부되면 범위를 확인하며 검사를 우회하지 않는다.
4. `CHECK`에 반환된 `lesson/suite`와 등록 결과의 `revision`을 `expectedRevision`으로 넣어 해당 사례만 실행한다. 입력·규칙·평가 방식에 맞는 실제 통과 증거가 있어야 활성화한다. 실패·건너뜀·오래된 revision은 결과대로 처리하고, 원래 기기 작업을 재실행하지 않는다.

`CHECK`로 lesson이 active가 되어도 proposal 상태가 자동으로 verified로 바뀌지는 않는다. 새 `DECIDE`는 채택·기각만 기록하므로 실제 개선 효과 확인과 제안 수명 관리를 구분한다. 이미 설명한 같은 open 제안을 새 제안처럼 반복하지 않는다.

## 일반 대화의 제안 안내와 응답 유실 복구

별도 기억의 `context`에 `proposals:{}`를 넣으면 기존 결과에 `proposalContext`가 추가된다. `items`는 요청한 정확한 영역·작업·엔진·전체 환경에 맞는 `open` 제안이다. `learning_evaluation`의 작업 `*`만 같은 영역·엔진·환경에서 허용한다. 채택·구현·검증·기각·종료된 제안을 새 추천으로 다시 안내하지 않으며, 알고 있는 채택 제안은 기존 `progress`로 이어간다.

- 기본 제안 예산은 3개/3000자다. 필요할 때 `proposals:{limit,maxChars,seenNoticeFingerprints}`를 사용하며 한도는 10개/16384자다. `omitted`는 범위·상태·중복 안내 필터를 통과했지만 예산으로 빠진 수다. 근거는 각 항목 최대 8개이고 별도 생략 표시를 읽는다. 안내 문장을 중간에서 잘라 완전한 제안처럼 전달하지 않는다.
- 현재 대화에서 **실제로 이미 안내한** 항목의 `noticeFingerprint`만 체크포인트에 보존하고, 다음 조회의 `seenNoticeFingerprints`에 최대 64개를 넣는다. 조회만 한 항목, 응답이 유실되어 안내 여부를 모르는 항목을 넣지 않는다. 같은 내용의 이미 안내한 제안은 예산 전에 제외되고 `suppressed`로 집계되어 다른 제안을 가리지 않는다. 같은 ID라도 근거·요약이 바뀌면 지문이 달라지므로 내용을 확인해 의미 있는 변화만 안내한다.
- 교훈의 `fingerprint`와 `proposalContext.fingerprint`는 별개다. 제안만 바뀌어도 교훈 지문은 같을 수 있다. 기존 캐시에 `proposalContext`가 없거나 새 경험으로 제안이 바뀌었으면 필요한 범위의 합산 조회만 갱신한다. 유효한 동일 결과를 매 도구 호출마다 다시 읽지 않는다.
- `observe.newProposals`는 방금 생성·재개된 제안 중 **그 관찰 범위에 맞는 제한된 요약**이다. `newProposalsOmitted`를 확인한다. 빈 배열은 저장소 전체에 열린 제안이 없다는 뜻이 아니다. 정확한 관찰 재전송에서는 제안을 다시 계산하지 않으므로, 저장 응답을 놓쳤다면 `context`의 `proposals:{}`로 기존 열린 제안을 찾는다. 원래 업무나 관찰을 새 ID로 재실행하지 않는다.
- 이 조회와 `seenNoticeFingerprints`는 읽기 전용 안내 선택이다. 영속적인 전달 완료, 사용자의 실제 열람, 채택·기각, 규칙 활성화나 실행 승인을 기록하지 않는다. 안내를 숨기려고 `decide`를 호출하지 않는다. 대화 체크포인트를 확인할 수 없으면 임의로 이미 안내했다고 가정하지 않는다. 여러 방의 전달 완료를 자동 공유한다고 보고하지 않는다.

필요한 제안의 실제 `proposalId`로 `review-context`를 읽고 반환된 packet을 사용해 기존 `decide/curate-register → check → progress` 절차를 이어간다. `noticeFingerprint`와 제안 조회 지문을 검토용 `packetFingerprint`로 전달하지 않는다. 조회에서 얻은 근거 참조는 원문을 읽었다는 증거가 아니므로 후보 검토 시 실제 근거를 확인한다. 이 입력은 **동봉 CLI 전용**이며 서버 `life_learning_context`에 보내지 않는다.

## 제안·후보·검사 진행을 이어가기

서버의 `capabilities.proposalProgress === true`이면 기존 `CANDIDATE {review,suite}`가 후보와 원래 제안의 연결을 함께 저장한다. 이후 `PREPARE {proposalId,view:"progress"}`로 연결된 후보·현재 검사·유효기간·충돌·조회 포함 여부를 읽는다. 종료·기각된 제안도 읽을 수 있으며 조회는 경험·제안 상태를 바꾸지 않는다. 기존 PREPARE와 JSON payload를 사용하므로 새 mode나 휴대폰 명령은 필요 없다.

- `bindingStatus`가 일치하는 후보의 현재 `lessonState`와 `evaluation`을 확인한다. 후보 미검사·검사 실패·현재 통과를 구분하고, 과거 검사나 같은 문구의 다른 후보를 대신 쓰지 않는다.
- `recallIncluded`는 현재 범위·시각·공통 규칙·출력 예산으로 조회에 포함되는지 나타낸다. false를 곧 검사 실패로 해석하지 않는다. `recallScope`가 `candidate_only`인 독립 CLI 조회는 공통 규칙까지 합친 실제 다음 작업 사전조회를 대신하지 않는다.
- 검사 통과·조회 포함은 과거 작업에 실제 적용됐거나 개선 효과가 확인됐다는 증거가 아니다. `pastApplicationVerified`, `liveImprovementVerified`는 false로 유지한다. 제안 채택·기각과 교훈 활성·격리도 별개다.
- 응답을 받지 못했으면 이 진행 조회로 실제 연결을 먼저 확인한다. 열린 또는 채택된 제안에서 새 packet으로 같은 candidate/active 정의를 등록하면 기존 연결과 검사 상태를 유지한다. 격리된 정의의 재등록과 종료된 제안의 새 검토는 거절하며, 오래된 packet을 허용하도록 revision 검사를 우회하지 않는다. 과거 연결 없는 교훈은 추측해서 붙이지 않는다.

별도 기억에서는 `review → curate-register → check → progress`를 사용하면 같은 연결을 보존한다. `curate-register`는 `{review,suite}`와 그 안의 `review.baseRevision`을 사용하며 `--revision`을 섞지 않는다. 기존 `curate → candidate` 준비·등록 경로도 유지되지만 제안 연결을 자동 추정하지 않는다. 이 기능은 두 기억 저장소의 자동 동기화나 일반 대화의 자동 수집 기능이 아니다.

## 등록된 후보의 근거를 추적하기

후보 등록 후 원래 근거와 관련 규칙 사용을 검토할 때만 동봉 CLI `candidate-evidence`를 사용한다. 실제 `progress.candidates[].link`에서 `lessonId`, `ruleVersion`, `inputFingerprint`를 그대로 복사하고 같은 `proposalId`를 전달한다. 선택 `options`는 `maxUsesPerSource`(기본 1, 최대 4), `maxChars`(기본 12000, 최대 32768)다. `--revision`, 외부 사건 ID·packet·임의 시각은 넣지 않는다. 연결이 없는 규칙은 기존 lesson-view로 확인하며 후보를 추정해 등록하지 않는다.

- 등록에 사용한 `sourceEventIds`와 현재 보관 사건을 기준으로 읽는다. 후속 성공이나 제안 종료 후에도 원 근거를 최신 projection으로 바꾸지 않는다. 현재 결과, 원 사건의 missing 상태, 후보 identity의 변경 상태, 표시 생략 수를 구분한다.
- `derived_from_registered_sources`는 현재 이력에서 도출한 관련 사용이다. 등록 당시 존재했거나 검토자가 실제 참고했다는 인증이 아니며 `availableAtRegistrationVerified`, `reviewerAcknowledgementVerified`, `sourceContentAtRegistrationVerified`는 false를 유지한다.
- 후보의 identity 일치와 사용한 규칙의 전체 정의 일치를 구분한다. 현재 후보의 검사·기간·조회 포함 여부는 기존 progress/lesson-view로 판단하고, 이 조회만으로 실제 사용·원인·개선 효과나 학습 필요성을 확정하지 않는다.
- 이 조회 지문이나 과거 사건 ID로 기존 후보 등록·결정 지문을 대체하지 않는다. 같은 상태의 결과는 재사용하고 실제 근거·후보 상태가 바뀔 때 갱신한다. 호스트 조회용이므로 서버 MCP에 새 mode를 보내지 않는다.

상세 입력·반환·한계는 [엔진 계약](references/engine-contract.md)의 등록된 후보의 근거 추적 절을 따른다. 실제 후보가 없으면 원래 작업을 계속하고 합성 후보를 운영 기억에 넣지 않는다.

## 제안 채택·기각을 기억에 반영

1. 서버의 `capabilities.proposalDecisions === true`와 **현재 앱 카탈로그의 실제 `DECIDE` mode**를 모두 확인한다. 서버 배포나 스킬 저장만으로 도구 목록이 갱신됐다고 판단하지 않는다. 목록에 없으면 기존 Developer mode MCP 연결의 **Refresh**가 필요한 상태로 구분한다. 정상인 Primary의 인증을 바꾸거나 PREPARE·CHECK에 쓰기를 숨겨 우회하지 않는다.
2. 채택·기각할 실제 제안과 판단 근거를 먼저 확인한다. 사용자 판단은 `reviewer:"user"`와 실제 `user:` 참조, 승인된 범위의 에이전트 판단은 `reviewer:"agent"`와 `source:` 참조를 쓴다. 기능 개발·검사 요청만으로 기존 운영 제안을 임의 처리하지 않으며 에이전트 판단을 사용자 원문 지시로 높이지 않는다.
3. 기존 `PREPARE {proposalId,maxAttempts?}`의 현재 packet을 읽고 `DECIDE` payload에 `{proposalId,decisionId,decision,expectedRevision,packetFingerprint,reviewer,sourceRef,reason,eventIds,maxAttempts?}`를 넣는다. `decision`은 `accept/dismiss`, revision·지문·사건 ID는 실제 packet에서 가져온다. 민감정보를 제거한 1–512자 이유와 고유 사건 1–16개를 사용한다. 정확한 계약은 [엔진 계약](references/engine-contract.md)을 따른다.
4. 채택은 후속 개선 대상으로 선택했다는 뜻이다. `open → accepted/dismissed`, `accepted → dismissed`만 지원하며 교훈 활성화·구현 완료·실기기 성공·추가 모델 학습 승인으로 표현하지 않는다. 미확정 결과의 검토 제안도 판단할 수 있지만 원래 기기 작업을 재실행하지 않는다.
5. 응답이 불명확하면 읽기 전용 `PREPARE {proposalId,view:"decision"}`로 현재 상태·이력을 확인한다. 재전송이 필요하면 **동일 decisionId와 같은 payload**를 재사용한다. 같은 결정은 revision·경험 횟수를 늘리지 않으며, 이전 채택 영수증이 반환돼도 현재 기각 상태를 되돌리지 않는다. ID 내용 충돌과 오래된 새 결정은 그대로 거절하고 최신 packet을 다시 검토한다.
6. `latestDecision`은 제한된 상태 요약이다. 전체 이력은 decision view로 읽고, 기존 PREPARE 검토 packet과 혼동하지 않는다. 결정 자체를 성공·실패 사건으로 중복 ingest하지 않는다. 별도 기억도 동봉 CLI `review → decide → decision-view`를 쓰며 `decide`는 payload의 expectedRevision을 사용하고 `--revision`을 섞지 않는다.

별도 기억의 CLI는 `review → curate → candidate → check`로 연결한다. `curate`는 후보와 검토 근거를 만들어 반환할 뿐 저장하지 않으므로 `candidate` 등록과 실제 `check`를 생략하지 않는다. CLI `candidate`의 반환은 `{revision,lesson}`뿐이므로 `curate`의 `suite`를 보존해 `check`에 같은 lesson과 함께 전달한다. 서버 기억과 Library 기억을 이 절차로 자동 동기화한다고 말하지 않는다.

## 교훈 검증과 회귀검사

실제 근거에 연결한 `{lesson,suite}`를 만들어 `candidate`로 등록한다. `check`는 등록된 JSON 또는 기록된 실행흐름 평가기로 사례를 실행하고 결과를 기록한다. 정상 사례와 오류 재현 사례를 함께 넣는다. 사용자 로그 속 코드나 명령을 실행하지 않는다.

더 복잡한 작업은 [회귀 모듈](scripts/regression.mjs)의 `checkLesson`에 신뢰할 수 있는 부작용 없는 평가 함수를 연결한다. 원래 실패를 재현하는 입력·기대 결과와 수정 버전/구현 해시를 묶는다. 외부 동작을 다시 실행하는 시험으로 바꾸지 않는다.

- 교훈 정의·범위·검사 입력/기대 결과의 fingerprint가 일치하고 실제 검사 1개 이상, 실패/건너뜀 0일 때만 활성 조언이 된다.
- 기억 종류는 `fact/episode/procedure`, 출처는 `user_explicit/host_verified/model_inferred/legacy`로 구분한다. 필요할 때 `validFrom/validUntil`, `supersedes`, `conflictKey`를 넣는다. 새 metadata는 정의·회귀 증명에 연결하며, 실제 검증 뒤 효력이 시작된 대체는 대체자의 만료·격리로 옛 규칙을 자동 부활시키지 않는다. 복원은 새 후보와 검증으로 처리한다. 동일 주장 키에서 동급 출처의 미해결 충돌은 보류하며 단순 최신 시각으로 우선순위를 정하지 않는다.
- 실패한 후 과거 성공 영수증을 재사용해 활성화하지 않는다. 검사 실패는 격리한다. 변경된 규칙/입력은 새 버전·식별자로 검증한다.
- 일반 JSON 검사는 출력/정책 계약을, `jh.trajectory.v1`은 기록된 도구·순서·인수·단계 수·성공 주장과 근거의 대응을 검사한다. trace 자체의 진실성이나 실제 휴대폰 실행·로그인·전송·설치 성공을 증명하지 않는다. [합성 실행흐름 사례](scripts/fixtures/learning-trajectories.json)를 실제 경험으로 저장하지 않는다. promptfoo용 선택 adapter는 같은 trace 계약을 평가하며 promptfoo 설치나 외부 모델 호출을 요구하지 않는다.
- 작업마다 전체 검사 묶음을 반복하지 않는다. 변경 영향을 받는 교훈의 검사를 수행하고 같은 입력·버전의 유효 결과는 재사용한다. 공통 엔진 변경 때만 `node /absolute/skill/scripts/verify.mjs`를 실행한다.
- 개발 오류에는 기존 `jh-dev-toolkit`의 ZIP 사전 차단과 빌드 검사를 계속 사용하고, 확인된 결과를 `development` 사건으로 이 공통 기억에 연결한다.

## 구현 범위 보고

이 스킬의 저장·동봉 엔진 검증과 실제 서버 hook의 배포·작동 확인을 구분한다. 서버 자동 기록은 위의 실제 상태 응답으로 확인하고, [host-adapter.mjs](scripts/host-adapter.mjs)가 동봉됐다는 이유만으로 연결됐다고 말하지 않는다. 관찰하지 않은 대화·과거 이력을 추측해 채우지 않는다. `pending`·`observed`, 검증된 업무 결과, 교훈 활성화, 개선·추가 학습 평가 제안은 각각 확인된 단계로 보고한다.
