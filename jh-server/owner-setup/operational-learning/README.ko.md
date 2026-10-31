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

이벤트는 `eventId`, `taskId`, `attemptId`, `sequence`, 시각, 영역·작업·엔진·환경, 결과, 근거 식별자를 갖습니다. 선택 항목은 오류 코드, 소요시간·사용자 단계·도구 호출 수, 검토·수정 시도·holdout 표시입니다. 원문 화면·메시지·인증정보나 임의 필드를 넣지 않습니다.

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

## 교훈은 검사 후에만 활용

### 사용자가 직접 정한 규칙의 첫 등록

반복 경험 제안이 없어도 사용자가 실제로 정한 규칙은 별도 후보로 등록할 수 있다. 같은 `life_learning_review`의 `CANDIDATE`에 `{instruction,suite,expectedRevision}`를 보낸다. 기존 `{review,suite}` 추론 경로와 섞지 않는다.

`instruction`의 필수 필드는 `lessonId`, `ruleVersion`, 원문 그대로의 `text`, `user:`로 시작하는 불투명 `sourceRef`, UTF-8 원문 SHA-256인 `sourceSha256`, `appliesTo`, `confirmation: "explicit_user_instruction"`이다. 선택 `sourceRecordRef`는 원래 기록을 가리키는 `library:`·`source:`·`artifact:` 참조이며, 기간·대체·충돌 metadata도 선택할 수 있다. 알려진 인증정보 형식은 거부하지만 완전한 개인정보 탐지기를 뜻하지 않는다.

`appliesTo`는 실제 모든 JH 작업에 적용하라고 정한 지시일 때만 `{kind:"all_jh_tasks"}`를 사용한다. 특정 작업 지시는 `{kind:"tool",target_tool:"실제 도구 이름",target_mode:"허용 mode"}`이며 mode는 필요할 때만 넣는다. 서버가 owner의 고정 환경과 실제 대상 scope를 결정하므로 입력으로 owner·엔진·환경을 바꿀 수 없다. 공통 규칙은 `orchestration / jh.common.rules` 범위에 저장하며 허구의 도구 사건이 아니다.

출처 경계는 **인증된 owner 호출자가 실제 사용자 지시임을 확인하는 것**이다. 서버가 대화 원문이나 Library를 독립적으로 읽어 진위를 인증하는 기능이 아니다. 현재 에이전트는 실제로 읽은 사용자 지시만 전달하고, 자신의 제안·추론을 `user_explicit`으로 제출하지 않는다. 원문은 그대로 guidance에, 참조·내용 해시는 evidenceRefs에 보존되어 회귀 정의와 함께 묶인다.

등록은 `user_explicit` 후보만 저장하며 사건·독립 작업 수·proposal을 만들지 않는다. 이후 반환된 `lesson/suite/revision`으로 기존 `CHECK`를 수행한다. 통과한 공통 규칙은 각 실제 도구의 `life_learning_context`와 이후 조언에 함께 제공된다. 여러 scope를 합친 뒤 전체에 권위·충돌·기간·예산을 적용하므로 특정 작업 규칙이 공통 규칙과 충돌해도 검사에서 빠지지 않는다. 현재 사용자 지시·기존 승인·인증 경계가 우선이며 규칙 자체는 계속 advisory다.

이 기능은 원문 지시 한 건의 명시적 등록이며 전체 기억 자동 이전·동기화가 아니다. `apiVersion:3`의 `explicitInstructions`와 `commonRules` capability로 지원 여부를 확인한다.

### 경험에서 구체적인 후보를 작성

`life_learning_review`는 `mode`와 JSON 문자열 `payload`를 받는다. `PREPARE`는 `{proposalId,maxAttempts?}`로 실제 제안과 현재 근거를 읽는다. `CANDIDATE`는 `{review,suite}`를 받아 현재 packet의 revision/fingerprint, 사건·범위·출처를 대조하고 구체적인 후보만 저장한다. `CHECK`는 `{lesson,suite,expectedRevision}`로 저장된 후보와 동일한 정의를 실제 평가한 뒤 활성/격리 상태를 기록한다. 두 도구의 호출 자체는 새로운 실패나 반복 업무 횟수로 세지 않는다.

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
| `ingest` | 이벤트 객체 또는 1~100개 이벤트 배열 |
| `recall` | `{domain, operation, engine, context}` |
| `context` | `{query:{domain,operation,engine,context},options?:{now,limit,maxChars}}`: 기간·충돌·예산을 적용한 읽기 |
| `review` | `{proposalId,maxAttempts?}`: 실제 근거 검토 packet 읽기 |
| `curate` | `{review,suite}`: 구체적인 검토 결과를 검증된 형식의 후보 정의로 변환. 저장·활성화는 별도 |
| `propose` | `{}` 또는 `{now, thresholds}` |
| `candidate` | `{lesson, suite}`: 시험에 연결된 후보 등록, 활성화하지 않음 |
| `check` | `{lesson, suite}`: 등록과 실제 제약검사·평가 반영 |
| `proposal-status` | `{id, status, verification?}` |

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
