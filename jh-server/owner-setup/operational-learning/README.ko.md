# JH 운영 경험 기억·검증·개선 제안

JH가 실제로 처리한 도구 호출·오류·완료 결과를 구조화해 보관하고, 같은 조건의 다음 작업에 검증된 교훈과 개선 제안을 제공하는 모듈입니다. 독립 CLI/API와 서버 공통 hook을 함께 제공합니다. 기억과 제안은 자동으로 처리하지만, 모델 가중치 재학습이나 제안된 작업 실행은 하지 않습니다.

## 적용 범위와 현재 연결 상태

| 영역 | 기록·개선 대상으로 삼을 수 있는 작업 |
| --- | --- |
| `connection` | 연결 오류, 복구 단계, 응답 확인 |
| `device` | 휴대폰 조작과 실제 결과 확인 |
| `web` | 웹 작업, 로그인·화면 상태 확인 |
| `output` | 출력 형식·필수 항목·전달 결과 |
| `research` | 근거 수집·출처 확인·비교 작업 |
| `calculation` | 계산 결과·검산·입력 조건 |
| `routine` | 반복 업무와 재사용 가능한 순서 |
| `development` | 코드·빌드·포장·회귀검사 |
| `orchestration` | 여러 단계의 연결·중단·완료 확인 |

현재 소스는 `published-host-router → pending-approval-operator-entry → generated operational/unified/owner` 경로에 연결되어 있습니다. [runtime-patch.mjs](runtime-patch.mjs)가 공통 MCP handler와 job 생성·완료 지점에 관찰 hook을 넣고, [owner-patch.mjs](owner-patch.mjs)와 [owner-host.mjs](owner-host.mjs)가 기존 owner·저장소 검증 뒤, HTTP listener를 열기 전에 학습 기능을 설치합니다. 원래 handler는 한 번만 실행하며 학습 실패로 작업을 재전송하지 않습니다.

**자동 관찰 범위는 이 서버가 실제로 받은 JH 도구 이벤트입니다.** JH가 연결된 대화방의 모든 메시지, JH를 호출하지 않은 일반 대화, 다른 방의 과거 대화를 자동으로 읽지 않습니다. 도구 이벤트에 포함되지 않은 사용자 수정·검토 결과는 승인된 host/에이전트가 아래 CLI/API로 전달해야 기억에 반영됩니다.

이 연결은 기존 승인된 pending-approval operator 시작 경로에 적용됩니다. 다른 서버 시작 경로까지 자동 연결된다는 뜻은 아닙니다. **소스 연결과 운영 배포는 별도 단계이며, 이 문서는 새 기능의 운영 배포 완료를 증명하지 않습니다.** 후보의 로컬·CI 검사와 배포 후 상태 확인을 이어서 수행해야 합니다. Android 소스 변경은 없으므로 이 기능 때문에 APK를 다시 만들 필요는 없습니다.

## 서버에서의 사용과 상태 확인

### 첫 동작 전에 기억 조회

`life_learning_context`는 실행하려는 `target_tool`과 선택 `target_mode`에 맞는 현재 교훈을 **동작 전에** 읽는 MCP 도구다. 인증된 동일 owner 저장소만 사용하고 기기 명령·승인·작업 시작을 수행하지 않는다. 기본 5개·안내문 4000자 안에서 반환하며 `revision`, `fingerprint`, `validUntil`, `conflicts`, `omitted`를 함께 확인한다. 같은 작업에서 유효한 결과는 재사용하고 대상/모드/유효기간/기억 변경이 확인된 경우만 다시 조회한다. 카탈로그가 아직 갱신되지 않아 도구가 없으면 조회됐다고 추정하지 않는다.

기존 응답에 붙는 `jh_operational_learning`은 `timing: "after_execution"`으로 표시한다. 이 응답만으로 그 첫 동작 전에 교훈을 읽었다고 표현하지 않는다. 개인 스킬의 별도 대화 기억은 기존 저장소와 CLI 경로를 유지한다.

기존 owner 설정과 영속 저장소를 사용하므로 별도 학습 활성화 환경변수나 매 작업마다 입력하는 학습 명령은 없습니다. 호출 시 조건에 맞는 활성 교훈을 조회하고, 처리 결과를 기록한 뒤 개선 제안을 계산합니다. 반환할 조언은 도구 응답에 `type: "jh_operational_learning"` 항목으로 덧붙입니다. 동일 작업 내 중복 안내를 억제하고 새 작업에서는 다시 조회합니다.

개선 제안의 자동 전달은 현재 `domain / operation / engine / context.platform / context.version / context.environment`가 모두 일치할 때만 허용합니다. `operation`에는 도구의 mode도 포함되므로 같은 도구의 START와 FOLLOW_UP 제안을 합치지 않습니다. `learning_evaluation`의 `operation: "*"`만 같은 영역·엔진·환경 안에서 여러 작업에 걸쳐 전달할 수 있습니다. 범위가 빠지거나 불완전한 기록은 자동 전달에서 제외합니다.

관련성을 먼저 확인한 다음 기존 상태·중복 방지·정렬·최대 3개 제한을 적용합니다. 따라서 무관한 제안이 표시 자리를 차지하거나 같은 작업의 '이미 안내함' 기록을 소모하지 않습니다. 전달한 제안에는 허용된 범위 필드만 담은 `scope`를 포함합니다. 전체 `life_status.operationalLearning.proposals` 목록과 저장된 제안은 보존되며, 화면에 제안이 없다는 이유로 기억에서 사라졌다고 판단하지 않습니다. 이 기능은 `capabilities.scopedProposals: true`로 확인합니다.

인증된 `life_status`의 `operationalLearning`에서 실제 상태를 확인합니다.

| 필드 | 확인할 내용 |
| --- | --- |
| `enabled`, `degraded`, `stateAvailable` | 기능 활성 상태, 저장 오류 여부, 현재 기억 조회 가능 여부 |
| `revision`, `counts`, `pending`, `queuedWrites`, `inFlight` | 기억 버전, 이벤트·시도·교훈·제안 수, 대기·진행 상태 |
| `attemptOutcomes`, `availableAdvice`, `proposals` | 결과 분포와 활용 가능한 교훈·제안 |
| `diagnostics` | 저장·검증 문제의 제한된 오류 코드 |
| `identityModel`, `observationScope`, `librarySync` | 개인 서버 owner 기준, JH 도구 이벤트 범위, Library 연결 여부 |
| `apiVersion`, `capabilities` | 현재 학습 API와 사전조회·검토 후보·기간 규칙·trace 검사 지원 여부 |

hook 설치 성공만으로 저장 성공을 판단하지 않습니다. 저장소가 손상되거나 사용할 수 없으면 `degraded` 상태를 알리고 기존 JH 작업을 계속합니다. 정상 종료에서는 진행 중인 호출과 대기 중인 기록을 제한 시간 안에서 정리하고, 끝나지 않은 호출을 완료 미확정으로 기록합니다.

## 기억하는 사실과 중복 처리

이벤트는 `eventId`, `taskId`, `attemptId`, `sequence`, 시각, 영역·작업·엔진·환경, 결과, 근거 식별자를 갖습니다. 선택 항목은 오류 코드, 소요시간·사용자 단계·도구 호출 수, 검토·수정 시도·holdout 표시와 아래 호스트 사용 확인 계약의 ruleUses입니다. 원문 화면·메시지·인증정보나 임의 필드를 넣지 않습니다.

```json
{
  "eventId": "example-001", "taskId": "task-001", "attemptId": "attempt-001",
  "sequence": 1, "timestamp": "2026-10-31T01:00:00.000Z",
  "domain": "output", "operation": "output.format", "engine": "jh-synthetic",
  "context": {"platform": "android", "version": "2", "environment": "synthetic-test"},
  "outcome": "failure_verified", "source": "host_verified",
  "evidenceRefs": ["fixture:output-case-001"], "errorCode": "MISSING_FIELD"
}
```

- 같은 이벤트 ID·내용은 중복 처리하고, 같은 ID의 다른 내용은 거부합니다.
- 같은 시도를 여러 번 조회해도 실패 횟수를 늘리지 않습니다. 제안 기준은 서로 다른 `taskId` 수입니다.
- 서버의 영수증·상태 polling은 새 실패로 세지 않습니다. job의 반복 오류 알림·늦은 완료는 같은 시도에 연결하며, 이미 검증된 결과를 늦은 `pending`·미확정 결과로 낮추지 않습니다.
- 늦게 도착한 낮은 sequence는 최신 결과를 되돌리지 않습니다.
- `completion_unknown` 뒤 실제 검증된 성공이 도착하면 해당 시도의 최종 상태를 갱신합니다. 미확정 결과는 재실행 허가가 아닙니다.
- `pending`은 작업 대기, `observed`는 호출·결과를 관찰했다는 뜻이며 둘 다 성공으로 세지 않습니다. 일반 HTTP 200·접수·`ok:true`·서명된 완료 수신만으로 업무 성공을 확정하지 않습니다.
- `success_verified`·`failure_verified`에는 `host_verified` 또는 `user_explicit` 출처와 근거가 필요합니다. 서버 hook은 작업별 결과 검증 계약을 충족할 때만 검증된 성공으로 기록합니다. 현재 `open_url`은 요청 주소의 실제 완료 확인 계약을 검사하며, 일반 job 완료는 `observed`로 남습니다.
- 알려진 실행 전 거부는 `blocked`로 구분합니다. handler 예외·job 만료·검증되지 않은 오류는 완료 미확정으로 기록하며, 오류 문자열만으로 실제 작업 실패를 확정하지 않습니다.
- 근거는 `fixture:…`, `regression:…`, `artifact:…` 등 지원하는 식별자입니다. 원문 URL은 받지 않습니다. 실제 허용 필드·형식은 [engine.mjs](engine.mjs)에 정의되어 있습니다.

### 기존 영수증을 읽을 때 원래 시도 보완

`capabilities.existingReceiptReconciliation: true`는 기존 호스트의 검증된 영수증 조회를 같은 학습 시도에 연결하는 기능입니다. 새 MCP 쓰기 모드나 사용자 입력의 성공 플래그를 받지 않습니다. URL 완료 결과의 연결 지점은 `jhOpenCompletion56()`이며, 원래 `life_job_status` 또는 open 완료 확인이 기존 명령·세션·job 일치 검사와 엄격한 오른쪽 Chrome 주소 검증을 통과했을 때만 동작합니다.

호스트 전용 `receiptObserved(job)`는 검증된 결과 또는 아래의 제한된 관찰 범위와 근거 digest가 있는 완료 메타데이터를 받습니다. 파일 잠금 안에서 현재 runtime의 **이미 존재하는 유일한 원래 attempt**, 명령에 연결된 task, host 출처, 엔진·환경을 대조합니다. `pending`, `observed`, `completion_unknown`만 원래 scope와 attempt를 보존하며 보완합니다. 조회 자체를 새 시도나 독립 경험으로 만들지 않고, 같은 근거는 중복 처리합니다. 서로 다른 기존 검증 결과, 연결 불일치, 차단·취소, 원래 시도 누락은 덮어쓰지 않습니다. 원래 응답·예외·실행 횟수는 유지됩니다.

이 결과의 의미는 **영수증 수신 당시 요청 주소가 오른쪽 Chrome에서 확인됨**입니다. 현재 화면, 전체 페이지 내용이나 이후 작업 완료를 뜻하지 않습니다. 일반 `ok:true`, 서명된 결과 수신 또는 durable journal의 수신 상태만으로 성공을 만들지 않습니다.

현재 기기 job·영수증은 메모리 Map에 있으므로 실제 서버 재시작 후 복원되지 않습니다. 새 runtimeId에서 과거 `job_1` 같은 번호를 이용해 기억을 추측 연결하지 않습니다. 학습 기억의 재시작 보존과 기기 영수증의 재시작 복구는 서로 다른 기능입니다. 이 보완은 원래 작업에서 필요한 기존 결과 조회에만 적용하며 학습을 위해 기기 작업을 추가하거나 재실행하지 않습니다. 정정 후 기존 `open` 확인 제안은 남은 미확정 시도가 없을 때 `resolved`가 되며, 사용자가 채택·기각한 상태와 판단 이력은 유지합니다.

### 분할 화면의 제한된 관찰 근거 연결

`capabilities.splitReadObservationReconciliation: true`이면 기존 `jhSplitReadStatus56()`의 성공한 원래 영수증 조회를 같은 시도에 연결합니다. `READBACK_PENDING` 또는 기존 STATUS 영수증 별칭을 사용하며 새 도구·mode·기기 조회는 추가하지 않습니다. registry가 실제로 읽은 원래 job 하나만 전달하고, `split_screen_session_start/status`와 `life_android_capture_work_window`의 `READ_ONLY` 경로로 제한합니다. 기존 device·session·command·taskDigest·영수증 만료 검사와 조회 시각 기준 split proof 검사를 그대로 통과해야 합니다. 다른 snapshot을 원래 job의 결과로 바꾸지 않습니다.

호스트 전용 metadata의 고정값 `verifiedObservationScope: "SPLIT_READ_LAYOUT_ONLY"`는 원래 서명된 읽기 결과에서 최근 좌우 창 배치가 확인됐다는 뜻입니다. 저장 결과는 **`observed`**이며, 근거 digest와 `source:jh-split-read-layout-only`만 남깁니다. 특정 목표 앱, 화면 내용·items·summarySource의 정확성, 요청·응답 context 일치나 전체 업무 성공은 이 검사 범위에 포함되지 않습니다. `success_verified`·후보 적격 근거·자동화 성공 횟수로 올리지 않습니다. 일반 완료 콜백과 임의의 `resultVerified/scopeVerified` 값도 이 관찰 증거를 만들 수 없습니다.

기존의 검증된 결과·차단·취소는 보존합니다. 같은 제한 관찰의 반복은 새 사건이 아니며 이후 일반 대기·미확정·관찰 통지가 이 근거를 지우지 않습니다. 실제 검증된 업무 결과가 생겼을 때만 기존 계약에 따라 더 강한 결과로 진행합니다. 기존 엔진이 미확정 상태가 없어진 `open` verification_gap을 `resolved`로 정리해도 **결과 수신의 불확실성이 해소된 것**이며 업무 성공·규칙 활성화·개선 효과 검증을 뜻하지 않습니다.

### FOLLOW_UP 클릭 완료 근거 연결

`capabilities.splitFollowupClickReceiptReconciliation: true`는 학습 런타임이 FOLLOW_UP 클릭의 제한된 완료 근거를 받을 수 있다는 표시입니다. 기존 FOLLOW_UP readback 패치가 함께 적용된 호스트에서는 `READBACK_PENDING`의 `sfr_` 영수증 조회가 검증된 결과를 원래 학습 시도에 연결합니다. 새 조회 도구·역조회 저장소·영수증 발급·클릭 재실행을 추가하지 않습니다.

기존 registry가 같은 기기·device digest·session·command·task digest·request·context·target item 및 만료 조건을 대조하고, 원래 서명된 CLICK 결과와 오른쪽 작업창 증명을 확인해야 합니다. `SPLIT_FOLLOWUP_CLICK_VERIFIED`, `CONFIRMED`, `SIGNED_CLICK_AND_RIGHT_PANE_AT_RECEIPT`를 반환한 바로 그 job 객체만 관찰 대상입니다. 일반 `complete`, `ok:true`, 임의의 `resultVerified` 값이나 다른 job의 결과만으로는 검증된 학습 결과를 만들 수 없습니다.

호스트는 `verifiedOutcome: "success_verified"`, `verifiedOutcomeScope: "SPLIT_FOLLOWUP_CLICK_ONLY"`와 근거 digest만 전달합니다. 저장 결과는 해당 **CLICK과 영수증 수신 시점의 오른쪽 작업창** 범위의 성공이며, 근거에는 `source:jh-split-followup-click-only`를 함께 남깁니다. 전체 사용자 업무, 클릭으로 의도한 후속 업무 결과, 현재 화면의 성공까지 뜻하지 않습니다. 이 근거로 검토하는 제안·규칙도 같은 범위로 제한해야 합니다.

원 시도가 유일하게 존재하고 명령·runtime·엔진·환경이 일치할 때만 `pending`, `observed`, `completion_unknown`을 보완합니다. 반복 조회는 같은 사건 한 번으로 처리하고, 차단·취소·기존 확정 결과는 보존합니다. 미확정·만료·기기 오류·`NOT_DISPATCHED` 반환은 이 성공 근거로 올리지 않습니다. observer가 없거나 실패해도 원래 반환값과 실행 횟수는 유지합니다. 서버 재시작·기존 job 보관 종료·영수증 만료로 사라진 과거 실행은 추측 복구하지 않습니다.

## 네 종류의 개선 제안

| 종류 | 기본 생성 조건 | 제안 내용 |
| --- | --- | --- |
| `rule_fix` | 같은 조건·오류의 독립 실패/차단 2건 또는 수정 지적 2건 | 원인·해결 규칙과 재발 검사 추가 |
| `workflow_automation` | 같은 조건에서 검증된 성공 3건 | 입력과 결과 검사를 갖춘 재사용 절차 준비 |
| `verification_gap` | 완료 미확정 1건 | 기존 작업의 영수증·결과 재확인 경로 개선 |
| `learning_evaluation` | 검토·규칙 수정 시도 후 실패 3건 이상, 서로 다른 작업 2종 이상, 겹치지 않는 holdout 작업 1건 이상 | 별도 평가 자료로 추가 학습 필요성 비교 |

이 숫자는 효과가 입증된 최적값이 아니라 변경 가능한 **초기 설계 설정**입니다. 영역·엔진·환경이 다른 사례를 무조건 합치지 않으며, 추가 학습 평가의 최소 사례·다양성 조건은 낮출 수 없습니다.

제안은 `advisoryOnly: true`, `externalEffects: false`입니다. 스케줄 등록·명령 재시도·모델 학습·배포를 실행하지 않습니다. 추가 학습도 증거를 모아 필요성을 평가하자는 제안 단계이며, 모델을 자동 재학습하는 기능이 아닙니다. 새 제안을 생성할 때 기존 ID·처리 상태는 보존합니다. `dismissed`를 자동으로 되살리지 않으며, 더 이상 미확정 시도가 없는 확인 제안은 `resolved`로 정리합니다.

제안 상태는 `open → accepted → implemented → verified`이며, 중간에 `dismissed`로 종료할 수 있습니다. `verified`에는 실제 통과 검사와 근거가 필요합니다. 관측 비용은 독립 작업당 기준값으로 표시하며, 비교 근거가 없는 절감시간·절감률은 만들지 않습니다.

### 제안 채택·기각과 결정 이력

`capabilities.proposalDecisions: true`인 서버는 `life_learning_review`의 명시적인 `DECIDE` 모드로 제안의 채택·기각을 기록합니다. 현재 앱 카탈로그의 mode enum에도 `DECIDE`가 있어야 호출할 수 있습니다. 서버 배포·플러그인 지침 저장만으로 기존 대화의 도구 목록이 갱신됐다고 판단하지 않습니다. 목록이 이전 버전이면 기존 Developer mode MCP 연결의 **Refresh** 후 실제 mode 목록을 다시 확인합니다. 인증이 정상인 Primary 연결을 다른 경로로 바꾸거나 기존 읽기 모드에 쓰기를 숨기지 않습니다.

1. 정상 `PREPARE {proposalId,maxAttempts?}`의 최신 packet을 읽습니다. 그 packet의 `baseRevision`, `packetFingerprint`, 실제 `attempts[].eventId`를 사용합니다.
2. `DECIDE` payload는 `{proposalId,decisionId,decision,expectedRevision,packetFingerprint,reviewer,sourceRef,reason,eventIds,maxAttempts?}`입니다. `decision`은 `accept` 또는 `dismiss`, `eventIds`는 해당 packet에서 고른 고유 사건 1–16개입니다. `reason`은 민감정보를 제거한 1–512자 판단 이유이고 `maxAttempts`는 준비 때 값(기본 12)과 같아야 합니다.
3. 실제 사용자 판단은 `reviewer:"user"`와 `user:` 참조, 승인된 범위에서 에이전트가 검토한 판단은 `reviewer:"agent"`와 `source:` 참조로 구분합니다. 이것은 인증된 owner 호출자의 출처 확인이며 서버가 대화 원문을 독립 검증했다는 뜻이 아닙니다. 기능 개발 요청만으로 기존 운영 제안을 임의로 채택·기각하지 않습니다.
4. 지원하는 새 결정은 `open → accepted/dismissed`, `accepted → dismissed`입니다. 채택은 후속 개선 대상으로 선택했다는 뜻입니다. 사건·독립 작업·교훈 수, 후보 활성 상태, 실제 기기 결과를 바꾸지 않고 `implemented/verified`로 승격하지 않습니다. 완료 미확정 근거도 검토 대상으로 선택할 수 있지만 성공 근거로 바뀌지는 않습니다.
5. 결정 ID·판단 근거·출처·이전/새 상태·서버 시각·검토 revision/fingerprint를 영수증으로 저장합니다. 파일 잠금 안에서 최신 revision을 대조하고 한 번만 반영합니다. 동일 `decisionId`와 정규화된 동일 payload 재전송은 기존 영수증과 **현재** 상태를 반환하며 revision·이력·학습 횟수를 늘리지 않습니다. 다른 내용으로 ID를 재사용하거나 새 ID로 이미 같은 상태를 다시 기록하면 `LEARNING_DECISION_CONFLICT`입니다. 오래된 새 결정은 `LEARNING_REVISION_CONFLICT`이며 최신 packet을 다시 검토해야 합니다.

처리 뒤에는 읽기 전용 `PREPARE {proposalId,view:"decision"}`로 종료된 제안까지 현재 상태·결정 이력을 조회합니다. 이 view는 검토 packet이나 `CANDIDATE` 입력을 대신하지 않습니다. 전체 상태 목록에는 제한된 `latestDecision` 요약만 붙습니다. 다음 `propose()` 갱신과 다른 controller·서버 재시작 뒤에도 이력을 보존하고, 채택·기각된 제안을 새 자동 제안으로 되살리지 않습니다. 기기 재실행·모델 학습·후속 배포 승인은 결정 기록에 포함되지 않습니다.

독립 CLI의 같은 경로는 `review → decide → decision-view`입니다. `decide`에는 JSON 안의 `expectedRevision`을 사용하고 별도의 `--revision`을 섞지 않습니다. 기존 `proposal-status` API는 유지하며, 새 채택·기각에는 근거와 이력을 남기는 `decide`를 사용합니다. 코드는 [decisions.mjs](decisions.mjs), 동시 수정과 재시작 검사는 [decision-runtime.test.mjs](decision-runtime.test.mjs)에 있습니다.

### 제안에서 후보·검사 결과까지 연결

`capabilities.proposalProgress: true`이면 기존 `CANDIDATE {review,suite}`가 검토한 후보와 원래 제안의 `candidateLinks`를 같은 저장 잠금·revision 변경 안에서 기록합니다. 연결에는 후보 ID·버전·입력 fingerprint, 검토 packet·사건 ID·검토자, 등록 시각과 검사 종류·ID·버전만 남깁니다. 제안당 최대 32개이며 최초 연결은 변경하지 않습니다. 열린 또는 채택된 제안에서 새 packet으로 같은 candidate/active 후보를 다시 등록하면 기존 연결을 반환하고 기억·revision·검사 상태를 바꾸지 않습니다. 격리된 정의의 재등록과 종료된 제안의 새 검토는 기존 정책대로 거절합니다. 오래된 packet의 재전송은 기존 revision 검사를 계속 받습니다.

기존 `PREPARE`에 `{proposalId,view:"progress"}`를 보내면 `view.schema: "jh.learning-proposal-progress.v1"`과 명시적으로 연결된 후보들의 현재 진행 상태를 읽습니다. 종료·기각한 제안도 조회할 수 있습니다. 조회는 상태·경험을 변경하지 않으며 새로운 MCP mode나 기기 명령이 필요하지 않습니다.

| 조회 내용 | 해석 |
| --- | --- |
| `bindingStatus` | 저장된 후보 ID·버전·입력 fingerprint·범위의 일치 여부. 없거나 달라졌으면 추정 복구하지 않음 |
| `lessonState`, `evaluation` | 현재 후보/활성/격리 상태와 같은 정의에 연결된 실제 회귀 결과·불투명 근거 |
| `temporalStatus` | 현재 시점에서 유효기간 안인지 여부 |
| `recallIncluded`, `conflicts` | 현재 조회 예산과 범위에서 기존 recall 엔진이 실제 포함하는지 여부 |
| `pastApplicationVerified`, `liveImprovementVerified` | 항상 false. 실제 적용 이력이나 업무 개선 효과를 이 조회로 증명하지 않음 |

서버 조회는 후보 범위와 기존 공통 규칙을 함께 판정합니다. 독립 CLI `progress`는 후보의 정확한 범위만 조회하며 `recallScope`로 이를 구분합니다. `recallIncluded: false`는 만료·충돌·대체·출력 예산 등으로도 생기므로 검사 실패로 단정하지 않습니다. `active`나 회귀 통과를 제안의 구현 완료·실제 효과 검증으로 승격하지 않습니다. 제안의 채택·기각과 교훈의 활성·격리는 별도 상태입니다.

과거 교훈의 문구·영역·사건이 비슷해도 연결을 새로 추정하지 않습니다. 명시 사용자 규칙이나 기존 직접 `candidate` 등록도 제안 연결이 자동 생성되지 않습니다. 독립 CLI에서 연결까지 남길 때는 `review → curate-register → check → progress`를 사용합니다. `curate-register`는 `{review,suite}`를 받고 `review.baseRevision`으로 원자적 검사를 하므로 `--revision`을 함께 쓰지 않습니다. 기존 읽기 전용 `curate`와 직접 `candidate`는 유지됩니다. 구현은 [progress.mjs](progress.mjs), 핵심·CLI·runtime·HTTP 재시작 검사는 해당 test와 기존 전체 runner에 연결되어 있습니다.

## 교훈은 검사 후에만 활용

### 사용자가 직접 정한 규칙의 첫 등록

반복 경험 제안이 없어도 사용자가 실제로 정한 규칙은 별도 후보로 등록할 수 있다. 같은 `life_learning_review`의 `CANDIDATE`에 `{instruction,suite,expectedRevision}`를 보낸다. 기존 `{review,suite}` 추론 경로와 섞지 않는다.

`instruction`의 필수 필드는 `lessonId`, `ruleVersion`, 원문 그대로의 `text`, `user:`로 시작하는 불투명 `sourceRef`, UTF-8 원문 SHA-256인 `sourceSha256`, `appliesTo`, `confirmation: "explicit_user_instruction"`이다. 선택 `sourceRecordRef`는 원래 기록을 가리키는 `library:`·`source:`·`artifact:` 참조이며, 기간·대체·충돌 metadata도 선택할 수 있다. 알려진 인증정보 형식은 거부하지만 완전한 개인정보 탐지기를 뜻하지 않는다.

`appliesTo`는 실제 모든 JH 작업에 적용하라고 정한 지시일 때만 `{kind:"all_jh_tasks"}`를 사용한다. 특정 작업 지시는 `{kind:"tool",target_tool:"실제 도구 이름",target_mode:"허용 mode"}`이며 mode는 필요할 때만 넣는다. 서버가 owner의 고정 환경과 실제 대상 scope를 결정하므로 입력으로 owner·엔진·환경을 바꿀 수 없다. 공통 규칙은 `orchestration / jh.common.rules` 범위에 저장하며 허구의 도구 사건이 아니다.

출처 경계는 **인증된 owner 호출자가 실제 사용자 지시임을 확인하는 것**이다. 서버가 대화 원문이나 Library를 독립적으로 읽어 진위를 인증하는 기능이 아니다. 현재 에이전트는 실제로 읽은 사용자 지시만 전달하고, 자신의 제안·추론을 `user_explicit`으로 제출하지 않는다. 원문은 그대로 guidance에, 참조·내용 해시는 evidenceRefs에 보존되어 회귀 정의와 함께 묶인다.

등록은 `user_explicit` 후보만 저장하며 사건·독립 작업 수·proposal을 만들지 않는다. 이후 반환된 `lesson/suite/revision`으로 기존 `CHECK`를 수행한다. 통과한 공통 규칙은 각 실제 도구의 `life_learning_context`와 이후 조언에 함께 제공된다. 여러 scope를 합친 뒤 전체에 권위·충돌·기간·예산을 적용하므로 특정 작업 규칙이 공통 규칙과 충돌해도 검사에서 빠지지 않는다. 현재 사용자 지시·기존 승인·인증 경계가 우선이며 규칙 자체는 계속 advisory다.

이 기능은 원문 지시 한 건의 명시적 등록이며 전체 기억 자동 이전·동기화가 아니다. `apiVersion:3`의 `explicitInstructions`와 `commonRules` capability로 지원 여부를 확인한다.

### 일반 대화의 명시 지시 준비와 저장

호스트 CLI는 **`instruction → candidate → check → context`**를 연결합니다. `instruction`은 `{instruction,suite,scope,globalRecall?}`만 받고, `--revision`은 거절합니다. `instruction` 내부 원문·해시·출처·수명 필드는 위 표와 같지만 `appliesTo`는 호스트 전용 두 종류만 허용합니다.

| 호스트 적용 범위 | 실제 처리 |
| --- | --- |
| `{kind:"exact_scope"}` | 전달한 현재 업무 `scope`의 domain·operation·engine·전체 context에 정확히 연결 |
| `{kind:"all_jh_tasks"}` | 함께 전달한 실제 `globalRecall`에 연결. domain=`orchestration`, operation=`learning.scope`, engine·전체 context는 현재 `scope`와 동일해야 함 |

`scope`와 `globalRecall`은 `{domain,operation,engine,context:{platform,version,environment}}` 형식입니다. 현재 연결 파일의 globalRecall을 읽어 전달하며 빈 값이나 예시 값으로 실제 환경을 추정하지 않습니다. `globalRecall`은 exact_scope에도 선택적으로 전달할 수 있지만 제공했다면 항상 같은 검증을 적용합니다. 호스트는 `kind:"tool"`을 거절하고 서버는 호스트 전용 `exact_scope`를 거절합니다. `all_jh_tasks`도 같은 엔진·환경에서 합산 조회하는 공통 규칙이며 다른 런타임 전체로 자동 확장되는 값이 아닙니다.

다음 코드는 형식 설명용 사례이며 실제 운영 기억에 시험 경험으로 등록하지 않습니다. 사용자 원문을 실제 읽어 확인한 뒤 그 원문에서 해시를 계산합니다. 문자열을 요약·교정하거나 CRLF·앞뒤 공백을 정규화하지 않습니다.

```js
import { createHash } from 'node:crypto';
const text = '요약에 근거 항목을 포함한다.';
const request = {
  instruction: {
    lessonId: 'example-summary-evidence-v1', ruleVersion: '1', text,
    sourceRef: 'user:example-original-message',
    sourceSha256: createHash('sha256').update(text, 'utf8').digest('hex'),
    appliesTo: { kind: 'exact_scope' },
    confirmation: 'explicit_user_instruction'
  },
  scope: {
    domain: 'output', operation: 'summary.format', engine: 'jh-agent',
    context: { platform: 'chatgpt', version: 'operational-learning-v1', environment: 'personal' }
  },
  suite: {
    id: 'example-summary-evidence', version: '1', evaluator: 'jh.constraints.v1',
    cases: [
      { id: 'required-heading',
        input: { value: { text: '결과\n근거' }, constraints: [
          { path: ['text'], op: 'includes', expected: '근거' }
        ] }, expected: { passed: true, failed: [] } },
      { id: 'missing-heading-detected',
        input: { value: { text: '결과' }, constraints: [
          { path: ['text'], op: 'includes', expected: '근거' }
        ] }, expected: { passed: false, failed: [0] } }
    ]
  }
};
```

JSON은 stdin으로 전달하고 원문을 셸 명령에 보간하지 않습니다. 한 번 읽은 상태에서 반환한 값은 `{baseRevision,lesson,suite,instructionSummary,readOnly:true,externalEffects:false,activatedByThisCall:false}`입니다. 이 준비는 파일·부모 폴더·잠금 파일을 만들거나 기억 revision을 바꾸지 않습니다. 다른 호출의 상태를 함께 섞어 baseRevision을 구성하지 않습니다.

검토한 준비 응답의 `{lesson,suite}`를 `candidate --revision <baseRevision>`에 보냅니다. 등록 응답은 `{revision,lesson}`뿐이므로 **준비 때 반환된 동일 suite를 보존**하고 등록 응답 lesson과 함께 `check`로 전달합니다. `check`에는 `--revision`을 넣지 않습니다. 검사 후 공통·현재 업무 범위의 `context`로 실제 포함 여부를 확인하고, 변경된 기억은 기존 owner와 파일 ID의 저장 절차로 보존합니다. 준비·후보 등록만으로 활성화되거나 사건·시도·proposal이 추가되지 않습니다.

오래된 candidate revision은 같은 내용이어도 충돌합니다. 응답 유실이나 CAS 충돌이면 최신 기억에서 `instruction`을 다시 준비해 현재 baseRevision과 기존 교훈 ID를 복구합니다. 동일 정의·suite의 candidate 또는 active를 찾아 재사용하므로 요청 ID만 바꾸어 중복 규칙을 만들지 않습니다. 같은 정의·suite로 검증된 active이면 평가·수명·조회 포함 여부를 확인하고 필요한 경우만 재검사합니다. candidate로 강등하거나 평가 이력을 늘리기 위해 CHECK를 반복하지 않습니다. 격리된 정의는 새 ID 또는 약한 suite로 우회해 되살릴 수 없습니다.

출처 summary는 고정된 `sourceAuthentication:"host_attestation"`, `sourceRetrievalVerified:false`입니다. `--owner`는 파일 owner 일치 검사이며 사용자 발화의 독립 인증이 아닙니다. 원문과 그 해시를 함께 바꾼 입력이 진짜 사용자 발화인지는 이 함수가 독립 판정할 수 없습니다. 호스트가 실제 읽은 명시 지시만 제출하고 추론은 기존 검토 경로의 `model_inferred`로 유지합니다. 원기록을 읽지 않았다면 sourceRecordRef를 추정해 넣지 않습니다.

`createHostInstructionCandidate(state,instruction,suite,{scope,globalRecall?})`는 같은 검증·중복·회귀 결합을 재사용하며 `{lesson,suite,instructionSummary}`만 반환합니다. CLI의 baseRevision·readOnly 외피는 한 번 읽은 상태에서 추가합니다. 기존 MCP mode·서버 인증 경로·서버와 별도 기억의 동기화는 변경하지 않습니다. 기록된 입력/출력 제약 검사는 실제 다음 대화의 준수나 기기 실행 성공을 대신하지 않습니다.


### 규칙 한 건의 상태 확인

동봉 CLI `lesson-view`와 순수 API `lessonView(state,input)`는 proposal 연결이 없는 명시 사용자 규칙·직접 후보도 현재 저장 상태에서 점검합니다. 새 후보·사건·proposal을 만들지 않고, 기존 CHECK를 재실행하거나 기존 평가 이력을 바꾸지 않습니다. 서버 MCP의 mode·입력은 변경하지 않습니다.

입력은 `{lessonId,query,options?}` 또는 `{lessonId,queries,options?}`이며 query/queries 중 정확히 하나가 필수입니다. `lessonId`는 실제 응답이나 체크포인트의 기존 ID입니다. 쿼리와 옵션은 `context`와 같습니다. 고유 exact scope 1–3개가 같은 engine·전체 context를 사용하고, 선택 옵션은 `now/limit/maxChars`뿐입니다. 기본 예산은 5개/4000자, 최대는 20개/16384자입니다. 현재 업무와 공통 기억의 실제 범위·예산을 전달하고 저장된 규칙의 scope를 현재 업무라고 추정하지 않습니다.

```json
{
  "lessonId": "example-known-rule-id",
  "queries": [
    {"domain":"orchestration","operation":"learning.scope","engine":"jh-agent","context":{"platform":"chatgpt","version":"operational-learning-v1","environment":"personal"}},
    {"domain":"output","operation":"summary.format","engine":"jh-agent","context":{"platform":"chatgpt","version":"operational-learning-v1","environment":"personal"}}
  ],
  "options": {"limit":5,"maxChars":4000}
}
```

예시는 입력 형식 설명이며 ID·현재 업무 범위는 실제 확인한 값으로 치환합니다. CLI의 `--revision`은 거절합니다. 저장소를 한 번 읽어 아래 결과를 산출하며, 존재하지 않는 ID에는 `LEARNING_LESSON_NOT_FOUND`를 반환하고 파일·부모 폴더·잠금 파일을 만들지 않습니다.

| 반환 항목 | 의미 |
| --- | --- |
| `schema`, `lessonId`, `revision`, `checkedAt` | `jh.learning-lesson-view.v1` 진단의 대상·스냅샷·판정 시각 |
| `definition` | 저장된 ID·ruleVersion·inputFingerprint·scope·전체 guidance·제한된 evidenceRefs·존재하는 metadata |
| `lessonState` | 현재 저장된 candidate/active/quarantined 상태 |
| `evaluation` | 기존 평가 영수증의 not_run/passed/failed/invalid 상태, 시각·통과/실패/건너뜀 수·제한된 근거 |
| `temporalStatus` | not_yet_valid/in_window/expired. 유효 시작은 포함하고 종료 시각은 제외 |
| `scopeMatches` | 전달한 현재 scope 집합에 저장 규칙의 exact scope가 있는지 |
| `engineRecallIncluded` | 같은 시각·범위·예산으로 기존 recall 엔진을 실행한 포함 여부 |
| `recallIncluded` | 평가 영수증의 무결성까지 확인한 이 진단의 재사용 판정. invalid 평가는 false |
| `selectionStatus` | included/invalid_evaluation/not_in_scope/candidate/quarantined/not_yet_valid/expired/not_selected |
| `conflicts`, `conflictsTruncated` | 해당 규칙을 포함하는 현재 충돌과 생략 여부 |
| `recallBudget`, `recallFingerprint`, `recallOmitted` | 실제 context와 같은 조회 예산·지문·전체 생략 수 |

definition의 guidance는 기존 최대 2048자 규칙을 유지해 전체를 반환합니다. 정의·평가의 evidenceRefs는 각각 최대 8개와 `evidenceRefsTruncated`를 반환합니다. 충돌은 최대 4개, 각 충돌의 lessonIds는 최대 16개이며 생략을 표시합니다. 다른 규칙의 guidance 전체나 실행 이력을 함께 반환하지 않습니다.

저장 정의는 기존 `addLesson`, 평가 영수증은 같은 receipt에 대한 기존 `evaluateLesson` 검증을 재사용합니다. 이 과정의 반환 상태는 저장하지 않습니다. 정상 정의·영수증에서는 현재 `context`의 포함 여부와 지문을 그대로 사용합니다. 영수증이 손상됐는데 기존 엔진의 더 작은 활성 필터에는 포함될 수 있는 경우, `engineRecallIncluded`와 별도로 `recallIncluded:false`, `selectionStatus:invalid_evaluation`을 반환해 차이를 숨기지 않습니다.

`not_selected`의 세부 원인은 추정하지 않습니다. `active + passed + in_window`라도 권위·같은 지침 중복·대체·예산 등으로 선택되지 않을 수 있습니다. `recallOmitted`는 이런 미선택과 충돌도 포함하므로 전부 예산 초과로 설명하지 않습니다. 대체 이력·기간은 기존 엔진 정책을 따르며 후속 규칙 만료를 이유로 과거 규칙을 되살리지 않습니다.

이 결과는 저장된 상태에 대한 **읽기 전용 진단**입니다. `readOnly/advisoryOnly`는 true, `externalEffects/pastApplicationVerified/liveImprovementVerified/liveExecutionVerified`는 false입니다. `user_explicit` 출처 또는 `user:` 참조만으로 원문을 독립 조회했다거나 과거 `host_attestation` 경로에서 등록됐다고 복원하지 않습니다. 저장하지 않은 instructionSummary·원래 appliesTo·원래 suite 본문이나 suite ID/버전도 추정하지 않습니다. 실제 재검사에는 보존한 suite가 필요하고, 현재 조회 포함은 실제 과거 적용·효과·기기 실행 성공의 증거가 아닙니다.


### 경험에서 구체적인 후보를 작성

`life_learning_review`는 `mode`와 JSON 문자열 `payload`를 받는다. `PREPARE`는 `{proposalId,maxAttempts?}`로 실제 제안과 현재 근거를 읽는다. `CANDIDATE`는 `{review,suite}`를 받아 현재 packet의 revision/fingerprint, 사건·범위·출처를 대조하고 구체적인 후보만 저장한다. `CHECK`는 `{lesson,suite,expectedRevision}`로 저장된 후보와 동일한 정의를 실제 평가한 뒤 활성/격리 상태를 기록한다. 두 도구의 호출 자체는 새로운 실패나 반복 업무 횟수로 세지 않는다.

`capabilities.reviewReadiness: true`인 서버는 PREPARE packet에 `evidenceReadiness`를 함께 반환한다. 현재 패턴에 일치하는 검증 결과 수(`currentVerifiedOutcomeCount`), 적격 근거 수(`currentEligibleCount`), 실제 표시된 적격 근거 수(`visibleEligibleCount`)를 구분한다. `ready_for_review`는 근거를 검토할 수 있다는 뜻이며 규칙 활성화나 실제 개선 성공이 아니다. 전체에 적격 근거가 있지만 현재 packet에 표시되지 않았으면 `evidence_not_visible`, 근거가 부족하면 `more_evidence_required`로 표시한다.

`verification_gap`은 `VERIFIED_OUTCOME_REQUIRED` 사유로 원래 시도에 묶인 기존 영수증 확인(`READ_ORIGINAL_BOUND_RECEIPT`), 신뢰된 검증 결과로 같은 시도 정정(`CORRECT_ORIGINAL_ATTEMPT_FROM_VERIFIED_RECEIPT`), 별도의 검증된 개선 경험 검토(`REVIEW_SEPARATE_VERIFIED_IMPROVEMENT_EVIDENCE`)를 요구한다. 이 코드는 실행 명령이나 새 조회 권한이 아니다. 불투명한 해시만으로 원문이나 원인을 읽었다고 판단하지 않는다. 이 metadata도 packet fingerprint에 포함되며 기존 `candidateEligible`과 후보 적격성 검사는 완화하지 않는다. 자동 재실행·결과 추정·활성화 여부는 모두 false다.

검토의 `cause`, `resolution`, `expectedEffect`, `guidance`는 에이전트가 실제 근거를 읽고 작성한다. `reflection.assessment: "reviewed_inference"`와 `provenance: "model_inferred"`로 보존하며 사용자 지시로 승격하지 않는다. 에이전트 추론을 수행하는 별도 모델 서비스는 실행하지 않는다. 직접 사용하는 함수와 필드는 [curation.mjs](curation.mjs), 사용 가능한 검증 사례는 [curation.test.mjs](curation.test.mjs)를 참고한다. 기각·완료 제안, 오래된 검토 packet, 중복된 polling과 미확인 결과만으로 규칙을 만들지 않는다.

새 교훈은 `candidate`로 시작합니다. [regression.mjs](regression.mjs)가 교훈 정의·규칙 버전·시험 입력·기대값을 fingerprint로 묶고, 실제 실행 결과를 연결합니다. 통과 1건 이상, 실패 0, 건너뜀 0과 일치하는 근거가 있어야 `active`가 됩니다.

실패한 검사는 교훈을 `quarantined`로 격리합니다. 이미 대체된 검증 영수증이나 최신 영수증보다 오래된·충돌하는 시각의 증거를 다시 적용할 수 없습니다. 입력·버전이 바뀌면 새 후보 ID/버전으로 검사하며 과거 통과를 붙이지 않습니다.

recall은 활성 교훈 중 영역·작업·엔진·플랫폼·버전·환경이 모두 일치하는 것만 반환합니다. 서버에서는 허용 mode를 포함한 작업 종류가 같아야 하므로 같은 도구의 서로 다른 동작에 교훈을 섞지 않습니다. 활성화된 교훈도 조언이며 기존 승인·권한·실행 경계를 바꾸지 않습니다.

### 기억 종류와 규칙 변경 이력

선택 metadata는 `memoryKind`(fact/episode/procedure), `provenance`(user_explicit/host_verified/model_inferred/legacy), `validFrom`, `validUntil`, `supersedes`, `conflictKey`, `reflection`이다. 구형 metadata 없는 기록과 fingerprint는 그대로 읽는다. 새 metadata도 회귀 fingerprint에 묶이며 변경된 정의에 이전 검사를 재사용하지 않는다.

낮은 출처의 규칙은 더 높은 출처를 대체하지 못한다. 동급의 같은 `conflictKey`에서 내용이 다르면 함께 적용하지 않고 충돌로 반환한다. 최근 시각만으로 우선순위를 결정하지 않는다. 대체 후보는 통과하고 유효 시작 시점에 도달해야 효력이 생긴다. 이미 대체된 이전 규칙은 이력으로 보존하며 후속 규칙 만료·격리 시 자동으로 부활시키지 않는다. 이 정책은 학습 교훈 내부의 선택 기준이며 시스템 지시·인증·승인 규칙을 변경하지 않는다.

### 실행 과정 재발 검사

suite에 `evaluator: "jh.trajectory.v1"`을 명시하면 [trajectory.mjs](trajectory.mjs)가 도구 횟수·순서·인수·전체 단계 수와 성공 주장/결과 근거의 대응을 검사한다. trace나 검사가 없으면 통과시키지 않는다. 검사 종류도 suite fingerprint에 포함한다. 기존 JSON 검사는 미지정 또는 `jh.constraints.v1`로 유지하며 임의 코드·모듈 이름을 실행할 수 없다.

[fixtures/learning-trajectories.json](fixtures/learning-trajectories.json)은 APK 중복 설치/삭제, 화면 대상 혼동, 근거 없는 조사 성공, 출력 순서 등의 **합성** 양성·음성 사례다. 실제 실패를 확보했으면 개인정보를 제거한 입력과 기대 결과를 추가한다. `evaluatePromptfooTrajectory()`는 동일 입력을 promptfoo custom assertion 결과로 바꾸는 선택적 adapter이며 promptfoo 설치나 모델 평가 실행을 뜻하지 않는다. [참고 원본과 적용 결정](design-sources.md)에 범위와 한계를 기록했다.

## 개인 저장소

서버 연결은 검증된 owner 설정의 `config.stateDir/operational-learning-v1.json`에 기록하고, `ownerScope`를 `jh-owner:`와 `config.accountDigest`의 조합으로 고정합니다. 같은 개인 서버에 인증되어 들어온 여러 방·클라이언트의 JH 호출은 이 파일을 공유하므로 서버 재시작 뒤에도 기억을 읽을 수 있습니다. 요청 인자·대화방 이름·OAuth 주장으로 다른 저장소를 선택하지 않습니다. 이는 `configured-personal-server-owner` 모델이며 여러 owner를 분리하는 다중 사용자 서비스는 아닙니다.

이 서버 파일과 ChatGPT Library는 별개입니다. 현재 `librarySync: "not_connected"`이며 Library의 파일·스킬 기억·대화 기록을 자동으로 가져오거나 동기화하지 않습니다.

[store.mjs](store.mjs)의 `FileLearningStore`는 절대경로와 고정 `ownerScope`를 사용합니다. 예: `/absolute/private/jh-learning.json`, `personal-jh`. 이 파일은 개인 영역에 두고 Git 저장소에 올리지 않습니다. 기존 JH 실행·승인 저널과도 별도로 둡니다.

파일 lock·revision·임시 파일 저장 후 교체로 기록을 보존합니다. 손상된 JSON·소유자 불일치·충돌은 오류로 알리고 내용을 초기화하지 않습니다. 정상 동시 기록은 순서대로 처리하며, 바쁜 lock은 제한된 대기 후 오류로 반환합니다. 소유자 표시는 암호화나 별도 인증 권한을 대신하지 않습니다.

## 호스트 관찰 기록과 작업 재개

일반 대화에서 에이전트가 실제 확인한 사용자 수정·검토·결과는 `task-view → observe`로 연결합니다. 서버가 이미 관찰한 같은 JH 도구 사건은 이 경로로 복제하지 않습니다. 이 기능은 기존 저장 스키마를 사용하며 새로운 MCP 도구·mode, 배경 메시지 수집, 서버와 Library의 자동 동기화를 추가하지 않습니다.

`taskId`는 사용자 목표 하나에 대해 유지합니다. 계속·조회·저장 재시도는 같은 목표·같은 시도입니다. 사용자 수정은 원래 시도에 남기고 실제 개선 작업을 수행했다면 같은 taskId의 새 attemptId를 사용합니다. 현재 제안 계산은 시도별 유효 결과를 사용하므로 실제 다른 실행까지 원래 시도에 덮어쓰면 수정 지적이 제안 집계에서 빠질 수 있습니다. 새 시도도 별개의 사용자 목표로 부풀리지 않습니다.

### 읽기 전용 task-view

입력은 `{taskId,attemptId?,limit?}`이며 `limit` 기본값은 8, 허용 범위는 1~32입니다. 현재 저장소를 한 번 읽고 실제 해당 작업·시도만 반환합니다. taskId를 추측하거나 가장 최근 작업을 자동 선택하지 않습니다. 없는 파일·작업을 생성하지 않습니다.

반환은 `schema:"jh.learning-task-view.v1"`, `revision`, `taskId`, 선택한 `attemptId` 또는 null, `taskFound`, `found`, `counts`, `attempts`, `omittedAttempts`를 포함합니다. 각 시도는 다음을 구별합니다.

| 필드 | 의미 |
| --- | --- |
| `scope` | 저장된 영역·작업·엔진·전체 환경 |
| `projection` | 엔진이 현재 유효하게 유지하는 시도 결과 |
| `latestObservation` | 해당 시도의 가장 높은 순서 관찰 |
| `eventCount`, `maxSequence`, `nextSequence` | 요약만이 아니라 전체 사건에서 계산한 개수·순서 |
| `latestObservedAt` | 전체 사건의 최대 실제 관찰 시각 |
| `sequenceExhausted` | 순서가 1,000,000,000에 도달한 경우 true, 다음 순서는 null |

검증된 성공 뒤 `pending`이 기록됐다면 projection은 성공이고 latestObservation은 pending일 수 있습니다. 요약의 사건 ID·원래 시각·outcome·source와 근거를 함께 읽습니다. 근거는 각 요약에서 최대 8개를 반환하고 `evidenceRefsOmitted/evidenceRefsTruncated`로 생략을 표시합니다. `observationRef`는 저장된 근거 참조로 사건 ID를 재계산해 일치할 때만 복구하며 생략된 근거와 별도로 보존합니다. 예전 사건의 참조는 추측하지 않고 null로 둡니다. projection의 누적 metrics는 해당 사건 원문 하나의 측정값과 다를 수 있습니다.

조회는 `readOnly:true`, `externalEffects:false`, `replayAllowed:false`입니다. 조회 결과가 실제 업무의 재실행 승인이나 현재 성공의 독립 재검증은 아닙니다.

### observe 입력과 원자적 기록

```json
{
  "taskId": "example-task-stable",
  "attemptId": "example-actual-attempt",
  "observationRef": "user:example-observation-reference",
  "scope": {
    "domain": "output",
    "operation": "summary.format",
    "engine": "jh-agent",
    "context": {
      "platform": "chatgpt",
      "version": "operational-learning-v1",
      "environment": "personal"
    }
  },
  "observation": {
    "timestamp": "2026-11-01T00:00:00.000Z",
    "outcome": "correction",
    "source": "user_explicit",
    "errorCode": "OUTPUT_FORMAT_CORRECTION",
    "evidenceRefs": ["user:example-observation-reference"]
  },
  "expectedRevision": 0
}
```

예시는 형식 설명이며 실제 경험으로 넣지 않습니다. 현재 기억의 revision과 실제 관찰 값을 사용합니다. `observation`의 선택 필드는 기존 사건과 같은 `errorCode/metrics/labels` 및 아래의 `ruleUses`이며 알 수 없는 필드·접근자·Proxy 등 데이터가 아닌 입력은 거절합니다.

`observationRef`는 하나의 실제 관찰을 가리키는 안정적인 불투명 참조입니다. 호출자가 `evidenceRefs`에 같은 참조를 포함해야 하며 자동 삽입하지 않습니다. `success_verified/failure_verified`에는 `host_verified/user_explicit` 출처와 **observationRef 이외의 실제 결과 근거**도 필요합니다. 이 검사는 참조 계약을 검증할 뿐 호스트의 분류나 원문 결과를 독립 확인하지 않습니다. 과거 자료를 지금 처음 확인했다면 timestamp는 지금의 관찰 시각이며, 자료의 원격 생성 시각과 구분합니다.

사건 ID는 `host-observation-`와 UTF-8 `JSON.stringify([taskId,attemptId,observationRef])`의 SHA-256으로 정합니다. 내용 해시를 ID에 넣지 않으므로 같은 참조의 다른 내용은 충돌로 드러납니다. JSON 키 순서는 동일성에 영향을 주지 않지만 근거 배열 순서·원래 timestamp·내용은 재전송에서도 그대로 유지합니다.

잠금 안에서 동일 사건을 먼저 대조합니다. 정확한 재전송은 오래된 expectedRevision과 timestamp여도 원래 사건을 반환하고 제안을 다시 계산하거나 파일·revision을 바꾸지 않습니다. 새로운 사건에만 expectedRevision을 검사하고, 해당 시도 **전체 사건**의 최대 sequence에 1을 더합니다. 관찰 시각은 전체 사건의 최대 시각보다 과거일 수 없고, 시간대 표기는 파싱된 시각으로 비교합니다. 같은 시각은 트랜잭션 순서로 정합니다. 순서가 소진됐거나 scope가 바뀌면 거절합니다. 이후 기존 `ingest → propose` 결과를 한 번에 저장합니다. 기존 verified 결과를 약한 후속 상태로 낮추지 않는 엔진 규칙도 유지합니다.

CLI `observe`는 payload의 expectedRevision을 사용하므로 `--revision`을 함께 받지 않습니다. 독립 API `observeTask(state,input,{now?})`는 store의 transaction 안에서 호출하며 바깥 transaction의 revision 검사에 중복 복구를 가로막게 하지 않습니다. CLI 반환은 `revision,event,duplicate,recorded,projectionChanged,current,newProposals,newProposalsOmitted,externalEffects:false,replayAllowed:false`입니다. event는 원래 관찰 영수증이고 current는 **현재** 시도 요약입니다. 과거 관찰을 재전송해도 현재 결과를 과거로 되돌리지 않습니다. 기록됐다는 사실과 유효 결과가 바뀌었다는 사실을 구분합니다.

새 관찰의 오래된 revision은 최신 상태를 다시 읽어 검토하고 저장 변경분만 재적용합니다. 같은 참조의 다른 내용을 새 ID로 포장하거나 과거 관찰 시각을 현재로 고쳐 거절을 우회하지 않습니다. 응답 불명확 시 같은 payload만 재전송하고 실제 업무를 다시 실행하지 않습니다. 기존 `ingest`의 명시적 역사 기록·배열 입력·호환 동작은 유지되며, 일반 호스트 관찰의 충돌 검사를 피하는 대체 경로로 쓰지 않습니다.

## 실제 규칙 사용과 결과 연결

호스트 CLI의 `usage-prepare → observe.observation.ruleUses → task-view`는 **선택한 규칙, 실제 사용에 관한 호스트 확인, 같은 시도의 결과**를 연결합니다. 준비만으로 사용을 기록하지 않으며 원래의 새 결과 사건 한 건에 선택 정보를 함께 저장합니다. root state 스키마와 사건·시도 계산 기준은 유지합니다. 서버 MCP에 새 mode를 추가하거나 자동으로 모든 조회를 사용으로 표시하는 기능은 아닙니다.

### 읽기 전용 usage-prepare

입력은 `{taskId,attemptId,lessonId,scope,globalRecall?,options?:{limit,maxChars}}`입니다. 실제 `context`가 반환한 규칙 ID와 해당 작업의 안정적인 식별자를 사용합니다. scope는 현재 업무 전체 범위이고 globalRecall은 실제 binding에서 가져온 동일 엔진·전체 context의 `orchestration / learning.scope`만 허용합니다. 코드가 이 한두 범위를 구성하므로 임의 queries로 다른 업무 규칙을 끼워 넣을 수 없습니다.

공통 규칙을 함께 조회한 실제 작업은 같은 globalRecall과 예산을 전달합니다. 중복 범위는 한 번만 사용합니다. 기본 예산은 5개/4000자, 허용 최대는 20개/16384자입니다. 준비 시점에 기존 엄격한 lesson-view의 passed·recallIncluded 판정과 평가 시각을 확인합니다. 후보·격리·충돌·예산 제외·그 시점의 만료 규칙은 준비할 수 없습니다.

CLI는 기억을 한 번만 읽고 호스트 현재 시각을 사용합니다. `--revision`, 입력 now·queries·expectedRevision은 받지 않습니다. 순수 API `prepareRuleUse(state,input,{now?})`의 별도 now는 시험/신뢰된 호스트 시계용입니다. 없는 저장소도 만들지 않습니다.

반환 `schema:"jh.learning-rule-use-preparation.v1"`에는 다음 selection과 `readOnly:true,usageRecorded:false,externalEffects:false,sourceAuthentication:"host_attestation"`가 있습니다. `preActionTimingVerified,applicationVerified,liveImprovementVerified`는 false입니다.

| selection 필드 | 의미 |
| --- | --- |
| schema | `jh.learning-rule-selection.v1` |
| taskId, attemptId, scope, globalRecall? | 이 선택을 사용할 실제 작업·시도·업무 범위 |
| lessonId, ruleVersion, inputFingerprint | 저장된 정확한 규칙과 검사 입력 결합 |
| definitionFingerprint | 원문·범위·근거·선택 metadata를 포함한 전체 정의의 정규 SHA-256 |
| evaluationFingerprint | 준비 때 저장된 전체 평가 영수증의 정규 SHA-256 |
| selectedAt, revision | 준비한 호스트 시각과 당시 상태 revision |
| recallFingerprint, limit, maxChars | 실제 합산 조회 지문과 예산 |
| fingerprint | fingerprint 필드만 제외한 selection 전체의 정규 SHA-256 |

규칙 guidance·전체 suite를 매 사용 기록에 복사하지 않습니다. 해시는 우발적인 내용 불일치와 연결을 검사하며 인증 서명이나 실제 사전 실행 증명이 아닙니다. 준비 응답을 실제 사용 전에 보존하고 사후에 시각을 꾸며 복원하지 않습니다.

### 실제 결과와 함께 사용 확인

새 실제 관찰의 선택 필드 `ruleUses`는 고유 규칙 최대 4개 배열입니다. 각 항목은 정확히 다음 내용을 갖습니다.

```js
{
  useRef: actualApplicationReference,
  selection: prepared.selection,
  appliedAt: actualApplicationTime,
  confirmation: "applied_in_this_attempt",
  evidenceRefs: actualApplicationEvidence
}
```

위 코드는 값의 출처를 나타내는 설명이며 그대로 실행할 입력이 아닙니다. useRef는 실제 사용 관찰 하나의 안정적인 지원 불투명 참조입니다. 근거는 고유 1~8개이며 useRef를 직접 포함하고 바깥 observation.evidenceRefs에도 모두 포함해야 합니다. 결과 observationRef와 useRef는 달라야 합니다. verified 결과에는 observationRef와 모든 useRef 식별자 이외의 실제 결과 근거가 필요합니다. 실제 산출물이 사용과 결과를 함께 뒷받침하면 같은 artifact 참조를 쓸 수 있습니다. 실제 사용 근거를 읽었는지·결과가 무엇인지는 호스트가 확인하며 참조 문법이나 선택 지문만으로 검증했다고 표현하지 않습니다.

관찰 source는 `host_verified`이고 confirmation은 정확히 `applied_in_this_attempt`입니다. 선택과 사건의 taskId·attemptId·업무 범위가 같아야 하며 `selectedAt ≤ appliedAt ≤ observation.timestamp`를 요구합니다. CLI observe는 새 사용을 호스트 현재 시각보다 미래로 기록하는 입력도 거절합니다. 사용하지 않은 규칙은 생략합니다.

새 ingest는 현재 정확한 정의·평가·합산 조회를 다시 대조합니다. 당시 revision 이후 무관한 사건이 추가돼도 관련 정의·평가·조회가 동일하면 허용하고 observe의 expectedRevision CAS는 현재 값으로 별도 확인합니다. 준비와 실제 사용 시점 모두 규칙이 선택돼야 합니다. 이후 기간만 만료됐어도 두 시점에서 유효했으면 기록할 수 있습니다. 현재 격리·평가 변경·선택 변경은 보수적으로 거절합니다. 이런 경우 원래 결과는 ruleUses 없이 사실대로 기록하고 사용 연결 미완료를 알립니다. 이미 끝난 행동에 새 준비 영수증을 끼워 넣거나 업무를 재실행하지 않습니다.

동일 observationRef의 정확한 재전송은 현재 규칙 검사·CAS·시계 검사 전에 기존 사건을 복구합니다. 선택·useRef·시각·확인값·근거를 모두 보존해야 합니다. 같은 observationRef의 다른 내용과 다른 새 사건의 기존 useRef 재사용은 거절됩니다. 후속 결과 관찰에서는 원래 ruleUses를 복사하지 않습니다. 이미 저장된 사건을 사용 이력만 보강하려고 새 사건으로 만들지 않습니다.

### 사용 이력과 현재 결과 읽기

사용 이력이 있는 시도의 `task-view`와 observe.current에는 `ruleUses:{items,total,omitted}`가 추가됩니다. 전체 원본 사건에서 최근 사용 최대 8개를 반환하므로 후속 결과가 ruleUses 없이 들어와도 연결을 유지합니다. 원래 사용이 없는 구형 시도 출력은 그대로입니다.

각 항목은 useRef·정확한 규칙 지문·선택/사용 시각·recordedEventId·recordedAt·사용 근거를 반환합니다. result에는 현재 유효 projection의 eventId·outcome·timestamp·source·제한된 근거가 있습니다. `afterUse`는 결과의 sequence가 원래 사용 기록의 sequence 이상이고 timestamp가 실제 적용 시각 appliedAt 이상인지, `verified`는 그 조건에 더해 결과가 success_verified 또는 failure_verified인지 나타냅니다. verified는 성공 여부가 아니므로 outcome을 함께 확인합니다. 마지막 약한 관찰보다 이전의 검증 결과가 보존된 경우 afterUse가 false일 수 있습니다.

모든 사용 요약은 `sourceAuthentication:"host_attestation"`이고 `applicationVerified,preActionTimingVerified,liveImprovementVerified`는 false입니다. 사용 확인과 결과의 연결은 독립 실행 증명·성공의 인과 효과·절감률을 증명하지 않습니다. labels의 reviewed/ruleRemediationTried/holdout, 규칙 활성·제안 상태·추가 학습 기준도 자동으로 바꾸지 않습니다.

## 규칙 사용 결과의 범위별 검토

호스트 CLI `usage-review`는 저장된 규칙 사용과 **같은 시도의 현재 유효 결과**를 업무 범위별로 읽습니다. 순수 API는 `usageReview(state, queries, options?)`이며 상태·사건·제안·규칙을 바꾸지 않습니다. 기존 `observe → propose`가 만드는 개선 제안을 재생성하지 않고, 현재 결과의 문제 유형이 일치하는 기존 검토 경로를 연결합니다.

입력은 `{query,options?}` 또는 `{queries,options?}` 중 하나입니다. query는 실제 `{domain,operation,engine,context}`이며 queries는 같은 엔진·전체 context의 고유 exact scope 1~3개입니다. `--revision`, 임의 now·thresholds·lessonId 필터는 받지 않습니다. `context`에 선택적인 `usageReview:{}`를 넣으면 교훈·선택적인 proposalContext·사용 검토를 **한 번 읽은 동일 스냅샷**에서 반환합니다. proposals와 usageReview는 독립적으로 선택할 수 있고, 둘 다 생략한 기존 context 출력과 교훈 지문은 유지합니다.

```js
// 값은 실제 binding과 현재 업무 범위에서 가져옵니다.
{
  queries: [globalRecall, actualScope],
  proposals: {},
  usageReview: {}
}
```

조회 그룹은 `lessonId + ruleVersion + inputFingerprint + definitionFingerprint + 실제 사용 scope`입니다. 공통 규칙도 사용한 업무가 다르면 분리하고, 같은 ID라도 정의·검사 입력·버전이 달라지면 합산하지 않습니다. 현재 lesson이 변경·격리·만료·삭제됐어도 과거의 구조가 유효한 사용 영수증은 남깁니다. 현재 규칙을 재활성화하거나 과거 사용을 현재 정의로 바꾸어 해석하지 않습니다.

전체 원본 events를 검증·집계한 뒤 표시를 제한합니다. 시도당 8개·작업당 32개로 제한된 task-view 출력을 통계 원본으로 쓰지 않습니다. 사건 map key, 전역 useRef 중복, 선택 지문, 시도 projection과 저장 사건의 일치, 같은 시도의 범위를 검사합니다. 손상된 기록을 사용 0건으로 바꾸지 않고 조회 오류로 반환합니다. 접근자·Proxy·실행 가능한 입력은 실행 없이 거절합니다.

그룹의 counts에는 recordedUses·distinctAttempts·independentTasks와 다음 네 가지 **배타적인 독립 작업 수**가 있습니다. 한 task의 여러 attempt·여러 사용·반복 결과 조회는 독립 작업을 늘리지 않습니다.

| 작업 분류 | 의미 |
| --- | --- |
| successOnlyTasks | 연결된 모든 사용의 현재 결과가 사용 이후 검증된 성공 |
| failureOnlyTasks | 연결된 모든 사용의 현재 결과가 사용 이후 검증된 실패 |
| unconfirmedOnlyTasks | 어느 사용에도 사용 이후의 검증된 결과가 연결되지 않음 |
| mixedTasks | 같은 task에서 성공·실패·미확인 종류가 섞임 |

네 값의 합은 그룹의 independentTasks와 같습니다. afterUse는 현재 결과 sequence가 원래 사용 사건 sequence 이상이고 결과 시각이 appliedAt 이상일 때만 참입니다. 이전 verified projection이 보존됐다고 그 뒤 새로 기록된 사용까지 성공으로 세지 않습니다. blocked·cancelled·pending·observed·completion_unknown·correction은 검증 실패로 승격하지 않습니다. 혼합 결과도 자동으로 실패나 성공 하나로 바꾸지 않습니다.

`schema:"jh.learning-rule-use-review.v1"`의 groups에는 identity·counts·samples·relatedProposals·reasonCodes·nextSteps·noticeFingerprint가 있습니다. samples는 독립 task별 사례이며 원래 recordedEventId, 현재 result.eventId, 사용과 결과의 시간 관계·검증 여부를 구분합니다. 최상위 totals는 모든 요청 범위의 matchingGroups·recordedUses·distinctAttempts·independentTasks입니다. totals의 시도·작업 수는 여러 그룹에 걸친 실제 고유 개수이므로 그룹별 수를 단순 합산한 값과 다를 수 있습니다.

검증 실패만 있는 독립 task가 2개 이상이면 반복 실패 검토를, 미확인 task가 있으면 기존 결과 근거 확인을, 혼합 task가 있으면 상반된 기록 검토를 안내합니다. 성공 한 task만 있으면 반복 근거 부족으로 표시합니다. 성공률·개선율·절감률이나 자동 추가 학습 필요성을 계산하지 않습니다.

relatedProposals에는 **현재 open/accepted이고 실제 scope가 같으며 제안의 kind·pattern에 사용 이후 현재 결과가 일치하는** 제안만 연결합니다. 같은 scope의 다른 errorCode, 과거에만 맞았던 제안, 기각·종료된 제안, 다른 operation의 학습 제안은 연결하지 않습니다. 일반적인 불완전 과거 제안도 기존 proposalContext와 같이 연결에서 제외하며, 유효한 사용 이력 집계는 유지합니다. 실행 가능한 값·접근자·Proxy는 제안 안에 있어도 전체 읽기를 거절합니다. relationship은 current_result_pattern이며 규칙이 실패 원인이라는 뜻이 아닙니다. 필요한 실제 proposalId로 기존 review를 새로 읽고 그 packet의 현재 사건·지문을 사용합니다. archived 사용 사건 ID나 noticeFingerprint를 후보 검토 입력으로 대체하지 않습니다. 조회 결과만으로 제안을 채택·재개·검증 완료로 바꾸지 않습니다.

선택 options는 limit(기본 3, 최대 10), maxChars(기본 12000, 최대 32768), seenNoticeFingerprints(고유 SHA-256 최대 64개)입니다. 문자 예산은 반환할 그룹 전체 JSON의 Unicode 코드 포인트 수이며 그룹을 중간에서 자르지 않고 통째로 생략합니다. 독립 task 사례 최대 4개, 사례당 사용 영수증 1개, 각 사용/결과의 근거 최대 8개, 관련 제안 최대 4개를 표시합니다. 각각 total/omitted 또는 근거 생략 수를 확인합니다. 한 사례의 bucket은 생략 전 전체 사용에서 계산하므로 표시된 영수증 하나만으로 혼합 결과를 다시 판정하지 않습니다. 필요한 경우 반환된 실제 taskId로 기존 task-view를 읽습니다. `omitted`는 예산·개수 제한으로 생략한 그룹, `suppressed`는 실제 안내한 같은 지문으로 제외한 그룹입니다. 집계 총수는 표시 한도·seen에 영향을 받지 않습니다.

noticeFingerprint는 생략 전 전체 사용·현재 결과·일치하는 제안의 상태까지 반영합니다. 무관한 revision 증가로 새 안내를 만들지 않고, 숨겨진 근거가 바뀌면 지문도 바뀝니다. seen은 현재 대화에서 실제로 안내한 내용만 담는 힌트이며 영속적인 전달 완료·승인 이력이 아닙니다. 유효한 같은 조회는 재사용하고 새 관찰·제안 상태·업무 범위가 바뀌었을 때만 필요한 조회를 갱신합니다.

반환은 readOnly·advisoryOnly가 true, externalEffects·replayAllowed·applicationVerified·preActionTimingVerified·liveImprovementVerified·causalEffectVerified가 false이며 sourceAuthentication은 host_attestation입니다. 규칙 사용에 관한 호스트 확인과 실제 결과의 연결을 보여 주는 기능입니다. 사용의 독립 인증이나 인과 효과 증명으로 올려 설명하지 않습니다. 서버 MCP 입력·자동 배경 수집·기억 동기화·모델 가중치 학습을 추가하지 않습니다.

## 개선 검토에 규칙 사용 근거 연결

호스트 CLI `review-context`는 기존 제안 검토 packet과 그 결과에 선행한 규칙 사용 근거를 **하나의 저장소 스냅샷**에서 읽습니다. 순수 API는 `prepareReviewContext(state,input)`입니다. 입력은 `{proposalId,maxAttempts?,usageOptions?:{maxUsesPerResult?,maxChars?}}`이며, 실제 usage-review의 relatedProposals나 저장된 제안 조회에서 확인한 ID를 사용합니다. 외부에서 만든 packet·임의 eventIds·query·now·thresholds는 받지 않습니다. `--revision`도 사용하지 않습니다.

반환 `schema:"jh.learning-review-context.v1"`은 `packet`과 `ruleUseEvidence`를 분리합니다. packet은 같은 상태와 기존 입력으로 실행한 prepareReview의 반환과 **완전히 동일**합니다. 기존 review 명령, packetFingerprint, attempts, candidateEligible, evidenceReadiness, currentLessons, 결정·후보 등록 계약을 그대로 유지합니다. 이 호스트 조회를 위한 서버 MCP mode 추가나 서버 배포는 필요하지 않습니다.

### 현재 결과와 원래 사용의 구분

ruleUseEvidence의 coverage는 visible_packet_attempts입니다. **packet.attempts에 실제로 표시된 taskId·attemptId·현재 resultEventId**만 대상으로 삼으며, 같은 task의 다른 시도나 maxAttempts 밖 결과를 가져오지 않습니다. learning_evaluation의 제안 scope가 operation:*여도 각 선택된 결과의 실제 업무 scope로 연결합니다. 별도의 범위 확장 조회를 하지 않습니다.

각 행의 resultEventId는 현재 결과이며, precedingUses.items의 recordedEventId는 원래 사용이 기록된 사건입니다. 두 사건이 같을 수 있지만 근거 두 건이나 독립 작업 두 개로 세지 않습니다. 사용 후 별도 결과만 추가됐어도 원래 사용은 현재 결과에 이어집니다. 아래 두 조건을 모두 만족한 사용만 precedingUses에 표시합니다.

```js
currentResult.sequence >= recordedUseEvent.sequence
  && Date.parse(currentResult.timestamp) >= Date.parse(usage.appliedAt)
```

현재 결과보다 뒤에 기록되거나 실제 적용 시각이 더 늦은 사용은 nonPrecedingUseCount로 따로 셉니다. 보존된 이전 성공을 늦은 사용의 성공으로 해석하지 않습니다. 사용 기록이 없는 행의 0은 **저장된 사용 확인이 없음**을 뜻하며 실제로 규칙을 사용하지 않았다는 증거가 아닙니다. 사용 기록만으로 미확인·차단 결과를 검증된 후보 근거로 승격하지 않습니다.

### 당시 규칙 본문을 표시하는 조건

선택 영수증에는 과거 guidance 전문이 없으므로 현재 같은 ID의 규칙을 그대로 과거 본문으로 사용하지 않습니다. lessonId·ruleVersion·inputFingerprint와 `ruleUseHash(ruleDefinition(currentLesson))`이 기록된 definitionFingerprint와 모두 일치할 때만 definition.status:matched, source:matching_stored_definition과 본문·정의 scope·제한된 근거를 제공합니다. 규칙의 정의 scope와 실제 사용 업무의 scope를 구분합니다.

definition.status가 changed·missing·invalid이면 현재 본문으로 대신하지 않고 당시 식별자와 지문만 남깁니다. matched여도 현재 규칙을 적용할 수 있다는 판단이 아닙니다. 현재 만료·격리 여부로 과거 내용을 지우거나 평가를 다시 실행하지 않으며, historicalOnly:true와 currentSelectionVerified:false를 유지합니다. packet.currentLessons는 현재 저장 정의의 목록이고 sidecar의 matched 정의는 당시 지문과의 일치를 확인한 자료입니다. 다음 실제 행동에 적용할 규칙은 기존 context·usage-prepare 절차로 별도 판정합니다.

### 집계·생략·지문

sidecar에는 proposalId·baseRevision·reviewPacketFingerprint·selectedResultCount·items·totals·omittedResults·fingerprint가 있습니다. totals의 recordedUses·precedingUses·nonPrecedingUses·resultsWithUses·resultsWithPrecedingUses는 **표시된 원래 packet 결과들에 속한 전체 사용 이력**에서 계산합니다. 전체 제안이나 전체 기억의 사용 수로 확대하지 않습니다. 제한된 usage-review·task-view 반환을 집계 원본으로 사용하지 않습니다.

기존 maxAttempts는 기본 12, 최대 32를 유지합니다. usageOptions.maxUsesPerResult는 기본 1, 최대 4이며 maxChars는 기본 12000, 최대 32768입니다. 각 사용·정의·결과의 근거는 최대 8개와 생략 표시를 제공합니다. 개별 사용 표본은 precedingUses.total/omitted, sidecar 행의 문자 예산 생략은 omittedResults, 기존 packet의 작업 생략은 packet.truncated로 구분합니다. 문자 예산은 sidecar 행 JSON의 Unicode 코드 포인트 수이며 행을 중간에서 자르지 않습니다. 제한 전 총수는 그대로 유지합니다.

별도 fingerprint는 원래 검토 지문과 revision, 실제 선택된 결과 ID, 그 시도들의 생략 전 사용·현재 결과·정의 조회 상태 및 예산 설정을 묶습니다. 표시 밖의 사용이나 정확한 정의 근거가 바뀌어도 반영됩니다. 기존 packetFingerprint가 이 부가 근거까지 검증·승인했다는 뜻은 아닙니다.

### 기존 검토·후보 절차로 이어가기

검토자는 packet의 현재 결과와 ruleUseEvidence를 함께 읽고 원인·해결·기대 효과를 reviewed_inference로 작성합니다. 같은 규칙을 이미 사용했는지 살펴보되, 규칙이 실패의 원인이라고 자동 판정하지 않습니다. 결정·후보 등록에는 **packet의 기존 baseRevision·packetFingerprint**와 기존 계약에 맞는 현재 결과 eventIds를 사용합니다. sidecar fingerprint나 과거 recordedEventId를 대체 입력으로 넣지 않습니다. 기존 후보 생성이 허용하는 별도의 현재 검증된 개선 근거도 임의로 금지하지 않습니다.

없는 제안이나 현재 지지 결과가 없는 제안을 이 조회가 만들어 주지 않습니다. 실제 제안 0건은 그대로 두고 원래 작업을 계속합니다. 후보·검사·제안 상태·labels·모델 학습을 변경하지 않으며, readOnly/advisoryOnly는 true이고 externalEffects/replayAllowed는 false입니다. 사용 확인의 출처는 host_attestation이며 독립 적용·사전 실행 시점·인과 개선 효과는 검증하지 않았다고 유지합니다.

## 등록된 후보의 근거 추적

호스트 CLI `candidate-evidence`와 순수 API `prepareCandidateEvidence(state,input)`는 **등록에 사용한 사건 ID를 기준으로 현재 보관된 결과·규칙 사용 이력**을 함께 읽습니다. 입력은 `{proposalId,lessonId,ruleVersion,inputFingerprint,options?:{maxUsesPerSource?,maxChars?}}`입니다. 실제 `progress`의 최상위 proposalId와 `candidates[].link`의 후보 세 식별값을 가져오며, 별도 link ID를 만들거나 같은 문구의 다른 후보를 추정해 연결하지 않습니다. 외부 packet·eventIds·query·now와 `--revision`은 받지 않습니다.

반환 schema는 `jh.learning-candidate-evidence.v1`입니다. `registration`에는 최초 연결 시각·revision·원래 검토 지문·sourceEventIds·시험 식별 정보가, `candidate`에는 등록 identity와 현재 정의의 bindingStatus가 있습니다. `items`는 sourceEventId·sourceStatus·sourceRecord·currentProjection·precedingUses를 나누며, currentProjection의 isRegisteredSource로 원 근거와 같은 사건인지 구분합니다. `totals`는 등록 근거의 전체 개수·현재 보관/누락 개수·관련 사용 수이고, omittedSources는 문자 예산으로 빠진 행 수입니다. 문자 예산은 완전한 행의 JSON 문자 수에 적용하며 metadata·전체 집계는 별도로 반환합니다.

조회는 기존 `candidateLinks.sourceEventIds`에 고정됩니다. 제안이 종료되거나 같은 시도의 최신 결과가 바뀌어도 원래 선택된 사건 ID를 최신 결과로 교체하지 않습니다. `sourceRecord`는 해당 ID로 현재 보관된 사건이며, 현재 projection은 별도 정보입니다. 원 사건이 없고 나머지 저장소가 유효하면 missing으로 표시합니다. 손상된 전역 이력을 빈 결과로 바꾸지는 않습니다.

- 관련 사용은 동일 task·attempt·실제 scope에서 원 근거 결과보다 sequence와 적용 시각이 앞선 기록만 선행 근거로 표시합니다. 같은 task의 다른 시도나 link에 없는 결과를 끌어오지 않습니다.
- `derivation:derived_from_registered_sources`는 **현재 저장 이력에서 도출한 연결**입니다. 사건에 수집 revision과 등록 시점의 개별 내용 지문이 없으므로, 나중에 보관한 과거 이력을 등록 당시 존재했던 기록으로 인증할 수 없습니다. `availableAtRegistrationVerified`, `reviewerAcknowledgementVerified`, `sourceContentAtRegistrationVerified`는 false입니다.
- 후보의 `bindingBasis:registered_identity_fields`는 ID·버전·입력 지문·scope의 일치입니다. 등록 당시 후보 본문 전체나 실제 사용·개선 효과를 증명하지 않습니다. 현재 후보의 검사·기간·조회 포함 여부는 기존 `progress` 또는 `lesson-view`에서 확인합니다.
- 사용했던 규칙 본문은 기록된 전체 정의 지문과 현재 저장 정의가 정확히 일치할 때만 보여 줍니다. 변경·누락·유효하지 않은 정의는 구분하며, 현재 평가나 CHECK를 다시 실행하지 않습니다.
- 기본 표본은 근거 결과별 사용 1개, 최대 4개이고 문자 예산은 기본 12000자, 최대 32768자입니다. 전체 집계와 생략 수를 함께 확인합니다. 표시에서 빠진 관련 원본·현재 결과·정의 조회도 조회 지문에 결합합니다.

반환 지문은 현재 조회 내용의 식별값이며 원래 packetFingerprint나 후보의 inputFingerprint를 대신하지 않습니다. 등록 link의 regression 정보는 시험 종류·ID·버전의 연결이며, 원 suite 본문이나 과거 실패와 개별 case의 대응을 복원한 것이 아닙니다. 기존 후보 등록·회귀검사·결정 계약과 저장 형식을 유지하며, 읽기만으로 후보·사건·제안·승인·실제 모델 학습을 만들지 않습니다. 후보가 실제로 없으면 시험 데이터를 운영 기억에 넣어 조회 대상을 만들지 않습니다.

## CLI 사용

독립 CLI·엔진은 Node.js 22의 표준 라이브러리만 사용합니다. 아래 명령은 개발자·플러그인 연결용이며, 자동 서버 hook을 사용하는 일반 작업마다 입력할 필요는 없습니다. 전체 HTTP 통합시험에는 뒤에서 설명하는 기존 서버 의존성이 필요합니다.

```bash
node jh-server/owner-setup/operational-learning/cli.mjs status --store /absolute/private/jh-learning.json --owner personal-jh
node jh-server/owner-setup/operational-learning/cli.mjs ingest --store /absolute/private/jh-learning.json --owner personal-jh < event.json
node jh-server/owner-setup/operational-learning/cli.mjs check --store /absolute/private/jh-learning.json --owner personal-jh < check.json
```

| 명령 | 표준입력 JSON |
| --- | --- |
| `status` | 없음: 현재 상태 요약 |
| `task-view` | `{taskId,attemptId?,limit?}`: 기존 작업·시도의 유효 결과와 최신 관찰 읽기 |
| `observe` | `{taskId,attemptId,observationRef,scope,observation,expectedRevision}`: 동일 관찰 멱등 기록, `--revision`과 함께 사용 금지 |
| `ingest` | 이벤트 객체 또는 1~100개 이벤트 배열 |
| `recall` | `{domain, operation, engine, context}` |
| `context` | `{query:{domain,operation,engine,context},options?:{now?,limit?,maxChars?}}` 또는 `{queries:[범위1,범위2],options?:{now?,limit?,maxChars?}}`: 기간·충돌·전체 예산을 적용한 읽기 두 형식 모두 선택 `proposals:{limit?,maxChars?,seenNoticeFingerprints?}`와 독립적인 `usageReview:{limit?,maxChars?,seenNoticeFingerprints?}` 지원 |
| `review` | `{proposalId,maxAttempts?}`: 실제 근거 검토 packet 읽기 |
| `review-context` | `{proposalId,maxAttempts?,usageOptions?:{maxUsesPerResult,maxChars}}`: 원래 검토 packet과 선행 규칙 사용 근거를 같은 스냅샷에서 조회, `--revision` 금지 |
| `candidate-evidence` | `{proposalId,lessonId,ruleVersion,inputFingerprint,options?:{maxUsesPerSource,maxChars}}`: 등록된 근거 사건과 현재 보관된 사용 이력의 읽기 전용 추적, `--revision` 금지 |
| `instruction` | `{instruction,suite,scope,globalRecall?}`: 명시 사용자 규칙을 읽기 전용 준비, baseRevision 반환, `--revision` 금지 |
| `lesson-view` | `{lessonId,query 또는 queries,options?}`: 저장 규칙·기존 평가·현재 조회 포함 상태의 읽기 전용 진단, `--revision` 금지 |
| `usage-prepare` | `{taskId,attemptId,lessonId,scope,globalRecall?,options?:{limit,maxChars}}`: 실제 사용 전 규칙 선택을 읽기 전용 준비, `--revision` 금지 |
| `usage-review` | `{query 또는 queries,options?:{limit,maxChars,seenNoticeFingerprints}}`: 실제 범위의 전체 사용·현재 결과를 읽기 전용 집계, `--revision` 금지 |
| `curate` | `{review,suite}`: 구체적인 검토 결과를 검증된 형식의 후보 정의로 변환. 저장·활성화는 별도 |
| `propose` | `{}` 또는 `{now, thresholds}` |
| `candidate` | `{lesson, suite}`: 시험에 연결된 후보 등록, 활성화하지 않음 |
| `check` | `{lesson, suite}`: 등록과 실제 제약검사·평가 반영 |
| `proposal-status` | `{id, status, verification?}` |

`context`에는 `query`와 `queries` 중 정확히 하나만 전달합니다. 다중 입력은 같은 엔진과 전체 `context`의 고유 exact scope 1~3개를 받습니다. 호스트가 확인한 공통 범위와 현재 업무 범위를 함께 넣으면 저장소를 한 번 읽고 기존 `recallContexts()`로 출처 우선순위·동급 충돌·같은 지침 중복·전체 개수와 문자 예산을 판정합니다. 중복 범위는 호출자가 제거하고 실제 엔진·환경이 다른 범위를 억지로 통일하지 않습니다. 반환은 `{lessons,conflicts,omitted,fingerprint,revision}`이며 기존 단일 범위의 결과·지문을 유지합니다. 조회는 기억 파일을 바꾸지 않으며 MCP mode나 서버의 관찰 범위를 추가하지 않습니다.

### 범위별 열린 제안 조회와 복구

동봉 CLI `context`는 선택적인 `proposals:{limit?,maxChars?,seenNoticeFingerprints?}`를 받습니다. 이 입력을 생략하면 proposalContext를 추가하지 않고 기존 교훈 반환과 지문을 유지합니다. 독립적인 usageReview 선택 여부에는 영향을 주지 않습니다. `proposals:{}`를 넣으면 **동일한 저장소 읽기 결과**에서 기존 교훈과 함께 `proposalContext`를 반환합니다. 서버 MCP `life_learning_context`의 입력이나 응답을 바꾸지 않습니다.

`proposalContext`는 `schema:"jh.learning-proposal-context.v1"`, `revision`, `items`, `omitted`, `suppressed`, `fingerprint`, `readOnly:true`, `advisoryOnly:true`, `externalEffects:false`를 포함합니다. 호출만으로 사건·시도·제안을 만들거나 제안을 재계산하지 않습니다.

- 요청한 고유 exact scope 1~3개 안의 **open 제안**만 선택합니다. 모든 query는 같은 엔진과 전체 context를 사용합니다. 다른 영역·작업·엔진·플랫폼·버전·환경의 제안은 예산을 소모하지 않습니다.
- `learning_evaluation`의 `operation:"*"`만 같은 영역·엔진·전체 context에서 허용합니다. 이를 전체 JH 공통 제안으로 넓히지 않습니다. 불완전한 scope나 일반적인 잘못된 과거 제안 정의는 선택하지 않으며, 접근자·Proxy·실행 가능한 값이 포함된 상태는 읽기를 거절합니다.
- 기본 한도는 3개/3000자이며 `limit`은 1~10, `maxChars`는 1~16384입니다. 문자 예산은 reason·proposedChange·requiredValidation의 Unicode 코드 포인트 합계입니다. 문장을 자르지 않고 예산에 맞지 않는 항목 전체를 생략합니다. 교훈 조회의 limit/maxChars와 별도 예산입니다.
- 항목은 실제 ID·종류·scope·상태·생성 시각·독립 작업 수·이유·제안 변경·검증 조건·관측 비용을 요약합니다. 비용의 `savings:null`은 절감 효과가 측정되지 않았다는 뜻입니다. 근거는 최대 8개와 `evidenceRefsOmitted/evidenceRefsTruncated`를 반환합니다.
- 각 `noticeFingerprint`는 **생략 전 전체 근거 참조**와 해당 안내의 실제 의미 필드에 연결됩니다. 조회 순서나 관련 없는 revision 증가만으로 지문이 바뀌지 않습니다. 교훈의 `fingerprint`와 `proposalContext.fingerprint`를 구별합니다. 두 안내 지문은 PREPARE의 `packetFingerprint`가 아닙니다. 결정·후보 등록에는 실제 proposalId로 새 review/PREPARE를 읽어 얻은 검토 지문을 사용합니다.
- `seenNoticeFingerprints`는 현재 대화에서 실제로 이미 안내한 정확한 내용의 지문을 담는 고유 SHA-256 배열이며 최대 64개입니다. 범위·상태 필터 뒤, 예산 전에 이 내용을 제외하고 `suppressed`로 집계합니다. `omitted`는 아직 제외되지 않은 적격 항목 중 예산으로 빠진 수입니다. 내용이 바뀐 같은 ID의 제안은 새 지문으로 다시 나타날 수 있습니다.

관찰 저장 응답을 놓쳐도 기존 열린 제안은 이 조회로 복구합니다. 정확한 `observe` 재전송이 `newProposals:[]`를 반환하는 것은 제안 재계산을 하지 않았다는 뜻이며, 현재 저장소에 열린 제안이 없다는 뜻이 아닙니다. 처음 만든 관찰의 `newProposals`도 전체 재계산 결과 중 **현재 관찰의 정확한 scope에 맞는 제한된 요약**이며 기본 제안 예산을 적용합니다. `newProposalsOmitted`는 그 범위의 예산 생략 수입니다. 다른 범위에 만들어진 제안은 저장소에 보존되며 적합한 다음 업무에서 조회합니다. 기존 `ingest/propose` 배열 반환은 유지합니다.

조회 결과나 seen 배열을 영속적인 전달 완료·사용자 열람·채택·기각·규칙 활성화·실제 개선 증거로 사용하지 않습니다. 본문에 안내했는지 확인할 수 없는 지문을 넣지 않으며, 응답 유실 때는 seen을 임의로 채우지 않습니다. 여러 대화방의 전달 완료를 공유하는 기능은 없습니다. 필요한 실제 proposalId로 기존 `review/decision-view/progress`를 읽고 승인된 판단·후보 검증 절차로 이어갑니다.

`candidate`와 후속 `check`에는 같은 교훈·시험 정의를 사용합니다. 처음부터 `check`로 등록·검사를 함께 수행할 수도 있습니다. 전체 CLI 입력 검증은 [cli.mjs](cli.mjs)를 따릅니다.

`check.json`의 실행 가능한 합성 예시:

```json
{
  "lesson": {
    "id": "output-fields-v1", "domain": "output", "operation": "output.format",
    "engine": "jh-synthetic",
    "context": {"platform": "android", "version": "2", "environment": "synthetic-test"},
    "guidance": "확인된 결과 상태를 필수 필드에 표시한다.",
    "evidenceRefs": ["fixture:reviewed-output-fix"], "ruleVersion": "1"
  },
  "suite": {
    "id": "output-fields", "version": "1",
    "cases": [{
      "id": "verified-status",
      "input": {"value": {"status": "verified"}, "constraints": [
        {"path": ["status"], "op": "equals", "expected": "verified"}
      ]},
      "expected": {"passed": true, "failed": []}
    }]
  }
}
```

[내장 평가기](constraints.mjs)는 JSON 값과 제약만 검사합니다. 지원 연산은 `equals`, `exists`, `includes`, `excludes`, `between`입니다. `exists`는 기대값 없이 존재를 확인하고, `includes`·`excludes`는 문자열을 검사합니다. `between`의 기대값은 양 끝을 포함하는 `{min,max}`입니다. 임의 스크립트나 이벤트가 지정한 코드를 실행하지 않습니다. 이 예시는 결과 객체 검증이며 실제 휴대폰·서버 동작 성공을 증명하지 않습니다.

## 코드 연결과 검증

```js
import { FileLearningStore } from './store.mjs';
import { createLearningAdapter } from './host-adapter.mjs';
const store = new FileLearningStore({ file: '/absolute/private/jh-learning.json', ownerScope: 'personal-jh' });
const adapter = createLearningAdapter({ store, contextForCall, classifyResult, onRecall, onProposals });
const wrappedHandler = adapter.wrap('output.format', existingHandler);
```

예시의 callback은 기존 host/에이전트가 제공해야 합니다. `contextForCall`은 작업 식별과 범위를, `classifyResult`는 독립적으로 확인한 결과만 제공합니다. [host-adapter.mjs](host-adapter.mjs)는 handler를 한 번만 호출하고 원래 반환값·예외를 유지합니다. 기억·분류·알림 실패로 업무를 재실행하지 않습니다.

Node.js 22.16 이상에서 저장소 루트 기준으로 실행합니다. 기존 의존성이 준비되어 있으면 재사용합니다. 새 환경에서 전체 검사에 필요한 의존성을 준비하는 명령은 다음과 같습니다. 실제 owner/runtime을 시작하는 HTTP 시험이 포함되므로 독립 CLI와 달리 설치 없이 실행할 수 있다고 가정하면 안 됩니다.

```bash
npm install --prefix jh-server --ignore-scripts --no-audit --no-fund --package-lock=false
npm ci --prefix jh-server/owner-setup --ignore-scripts --no-audit --no-fund
npm ci --prefix jh-server/owner-setup/owner-enrollment --ignore-scripts --no-audit --no-fund
```

학습 모듈과 연결 검사는 직접 runner로 실행합니다. 하위 test 프로세스의 결과가 집계되지 않는 실행환경에서도 개별 검사를 수집하도록 직접 import하는 경로입니다.

```bash
node jh-server/owner-setup/operational-learning/verify.mjs
```

검사에는 엔진·저장소·독립 어댑터·회귀·검토·CLI, 공통 runtime/owner patch, 실제 생성된 owner/runtime을 이용한 로컬 HTTP 통합이 포함됩니다. HTTP 시험은 합성 owner와 임시 저장소, loopback 통신으로 두 클라이언트의 기억 공유·인증 거부·상태 조회 중복 억제·프로세스 재시작 후 보존을 확인합니다. 운영 기기나 실제 외부 작업의 성공을 증명하는 시험은 아닙니다.

공통 hook 변경 시에는 이 runner에 더해 영향받는 전체 owner 회귀와 기존 인증·dispatch 필수 검사를 유지합니다. 최종 소스의 필수 CI 통과, 운영 배포, 배포 후 `life_status` 확인, 필요한 실제 작업 완료 검증은 각각 별도 증거로 남깁니다. 문서나 과거 통과 기록을 현재 후보의 통과·배포 증거로 대신하지 않습니다.
