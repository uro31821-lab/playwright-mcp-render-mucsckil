# Pattern Guidance 입력 계약

API 버전은 `1.0.0`, 상태 스키마는 `jh.pattern-memory.v2`다. 정식 계약은 동봉 `scripts/engine.mjs`, `host-adapter.mjs`, `store.mjs`이며 아래 표는 호출에 필요한 요약이다. 모든 필드는 명시된 JSON 자료형으로 전달한다. 허용되지 않은 필드·접근자·비정상 프로토타입·순환 객체·비유한 수는 거부한다.

## 공통 형식

| 값 | 계약 |
| --- | --- |
| 시각 | 실제 UTC ISO 문자열 `YYYY-MM-DDTHH:mm:ssZ` 또는 밀리초 세 자리. 상태에는 밀리초 형식으로 정규화. |
| ID·key·owner | 1~160자, 영문·숫자로 시작, 이후 영문·숫자·`.`·`_`·`:`·`-`. 예약 프로퍼티 이름은 불가. |
| scope | `{topic, project?, aspect?}`. 각 값은 token이며 소문자로 정규화. 같은 의미 추정으로 범위를 확장하지 않음. |
| sourceRef | `conversation:`, `user:`, `source:`, `artifact:`, `test:`, `commit:`, `file:`, `library:` 중 하나로 시작하는 불투명 참조, 전체 240자 이내. 접두사 뒤는 `[A-Za-z0-9][A-Za-z0-9._/-]*`이며 추가 콜론은 불가. 예: `conversation:thread/message`. 실제 출처 위치를 복구할 수 있게 보존. |
| 상태 | `{schema, apiVersion, ownerScope, createdAt, updatedAt, revision, events}`. 원본 사건 재생으로 검증. |
| 공통 변경 | `{id, kind, data, sourceRef, at, expectedRevision}`. 새로운 사건은 현재 revision과 일치해야 함. |
| 변경 반환 | `{state, result}`. `result.changed`, `duplicate`, `id`, `revision` 등을 확인. 반환만으로 저장되지는 않음. |

`createState({ownerScope, now})`, `validateState(state)`, `fingerprint(json)`를 export한다. `fingerprint`는 정규 JSON의 SHA-256이며 인증·의미적 진실성 증명은 아니다. 상태 최대 2MiB·2,000개 이벤트, 개별 출력 최대 512KiB다.

## mutate의 kind와 data

| kind | data 필수 필드 | 허용 값·의미 |
| --- | --- | --- |
| `observe` | `topicId, scope, taskId, requestId, type, summary, occurredAt` | type은 `question/problem/correction/decision/continue/status/explicit`. summary 300자 이내. occurredAt은 at 이후 불가. continue/status는 새 사건을 추가하지 않음. |
| `status` | `topicId, status, basis, reason` | status는 `active/snoozed/rejected/resolved`, basis는 `user_explicit/host_verified`. active에는 user_explicit 필수. reason 300자 이내. |
| `outcome` | `topicId, taskId, status, basis, summary` | 같은 topic/task의 실제 problem이 존재해야 함. status는 `solved/failed/unknown`, basis는 `user_report/host_verified`. summary 300자 이내. |
| `rule` | `scope, key, operator, value, status, basis, reason, validUntil, supersedes` | operator는 `eq/neq/gte/lte`, status는 `confirmed/uncertain/revoked`, basis는 `user_explicit/host_inferred`. confirmed에는 user_explicit 필수. reason 400자 이내. |
| `proposal` | 아래 candidate 전 필드 | 당시 적격성이 충족되어야 저장. 아직 전달하지 않은 같은 candidate는 기존 ID를 돌려줄 수 있음. |
| `receipt` | `proposalId, meaning` | meaning은 `handoff_attempted`만 허용. 실제 저장된 제안과 연결하며 24시간 이내의 유효한 전달 시도. 읽음·동의가 아님. |

rule value는 `null`, 불리언, 유한 수, 120자 이내 문자열이다. `gte/lte`는 수만 허용한다. `validUntil`은 null 또는 기록 시각 뒤 UTC 시각이다. `supersedes`는 null 또는 같은 정확한 scope/key의 최신 rule ID다. 새 규칙으로 기존 기준을 대체할 때 최신 ID가 필요하다. 최신 uncertain/revoked/expired 상태를 이전 confirmed로 되돌리지 않는다.

같은 topic/sourceRef 관찰을 다른 event ID로 다시 저장하면 `PATTERN_SOURCE_REPLAY`다. 같은 event ID와 동일 정규 입력의 재시도는 중복으로 반환하고, 다른 입력이면 `PATTERN_ID_CONFLICT`다. 같은 task의 여러 정정은 독립 작업 수를 늘리지 않는다.

## 읽기 API

| 함수 | 입력 | 결과 |
| --- | --- | --- |
| `detectPatterns(state, input)` | `{now, scope?}` | 정확한 범위의 주제별 pattern 배열. |
| `context(state, input)` | `{now, topicId}` | owner/revision, pattern/topic, 최근 proposal·receipt 각 10개, 생략 수. |
| `evaluateProposal(state, input)` | `{now, candidate}` | show/reason/contentKey, pattern, 적격 시 score. |
| `challenge(state, input)` | `{now, scope, facts, overrides?}` | 최신 규칙별 matched/conflict/unknown/uncertain/revoked/expired/current_override, requiresReview. |

pattern은 최근 30일의 독립 문제 2건·정정 2건·질문 3건 또는 명시적 요청 1건을 검토 신호로 쓴다. `continue/status/decision`은 이 횟수를 늘리지 않는다. 실제 해결 결과 이후의 새 문제는 다시 검토한다. `inferenceOnly:true`, `authorizesExecution:false`다.

challenge의 facts는 최대 30개 `{key, value, sourceRef, observedAt}`이고 key는 중복될 수 없다. overrides는 최대 30개 `{key, sourceRef, reason, basis:'user_explicit'}`이다. 30일보다 오래된 사실·모르는 값·자료형 불일치는 unknown이다. 현재 override는 조회 결과에만 반영하며 영구 규칙을 변경하지 않는다. 반환의 `automaticRejection`, `semanticTruthVerified`, `authorizesExecution`은 false다.

## candidate 전 필드

```text
topicId, changeKey, goalId, goalRevision, summary, sources,
sourceRetrievalAttested, goalActive, hardConstraintsMet, mode,
benefit, confidence, setupBurden, ongoingBurden, interruptionCost
```

`summary`는 500자 이내, `goalRevision`은 0 이상 정수다. sourceRetrievalAttested는 실제 조회를 확인한 경우에만 true이며 true만 허용한다. goalActive와 hardConstraintsMet는 true/false/null이다. mode는 `normal/busy/explore`다. 다섯 metrics는 각각 0~1의 수 또는 null이다. 모르는 값을 통과를 위해 채우지 않는다.

sources는 1~6개의 `{url, contentHash, retrievedAt, kind}`다. 공개 HTTPS URL, SHA-256 소문자 64자리, 후보 시각 이후가 아닌 실제 조회 시각, `official/source/paper` 중 자료 종류가 필요하다. 인증정보·내부 호스트·사용자정보·포트·비밀 query parameter를 거부한다. 추적 query와 fragment는 제거하고 query 순서를 정규화한다. 같은 정규 URL 중복은 불가다. 해시는 원문을 실제 조회한 호스트가 계산한다.

후보가 나오는 조건은 활성 반복 주제, 현재 목표 활성, 필수 조건 확인, 30일 이내 출처, 다섯 metrics 확인, 양의 비교 점수다. 동일 goal/topic/changeKey와 동일 정규 URL·내용 해시는 이전에 전달됐다면 제목·조회 날짜·새 ID로 다시 안내하지 않는다. 다른 내용의 같은 topic도 기본 7일 간격을 적용하며, 직전 전달 뒤의 새로운 명시적 조사 요청은 간격 검토에 반영된다.

점수는 `benefit * confidence - .25 * setupBurden - .25 * ongoingBurden - .25 * modeMultiplier * interruptionCost`다. modeMultiplier는 normal=1, busy=2, explore=0.5다. 비교를 위한 호스트 입력이며 개인의 만족 확률이나 학습된 가중치가 아니다.

## 실제 JH 통합 API

`reviewWithJH(states, input, runtimes)`와 `deliveryTransition(states, input, runtimes)`는 호스트 어댑터 함수다. 설치본에서는 의존 해시 확인을 포함한 `reviewInstalled(states, input, skillsRoot?)`, `deliveryInstalled(states, input, skillsRoot?)`를 사용한다. `skillsRoot`를 제공하면 실제 검증된 skills 디렉터리의 URL이어야 한다.

states는 `{pattern, personal, decision, research}`다. 런타임은 `personal/decision/research/decisionContext`의 API 버전 1.0.0이며 기존 파일을 해시로 확인한다. 모든 ownerScope가 같아야 하고 패턴 scope와 목표 scope도 같아야 한다.

review input은 `{at, topicId, goalId, proposalId, changeKey, ranking, mode, metrics, hostConditionsVerified}`다. ranking은 `{scope, candidates, context?}`이고 기존 개인화 후보 형식 `{id, label, features, sourceRefs}`을 사용한다. `proposalId`는 기존 조사 notices의 실제 ID여야 하며 해당 ID가 ranking 후보에 있어야 한다. metrics는 다섯 비교 지표만 허용한다. hostConditionsVerified는 true/false/null이다.

검토할 현재 후보가 없으면 이 함수를 호출하지 않고 각 모듈의 읽기 API로 원래 작업을 계속한다. 빈 후보 목록이나 임의의 제안·지표로 필수 입력을 채우지 않는다. 검토와 호출 사이에 실제 후보가 이미 전달되었거나 사라졌으면 `research_not_available_or_already_delivered`를 정상적인 제안 억제로 처리한다. 이때 별도 결과의 pattern과 goalContext를 함께 읽으며 최상위 reason만으로 모든 조건을 설명하지 않는다.

실제 호출은 기존 `notices`, `rankWithGoal`, `reviewContext`, `selectProposals`와 패턴 평가를 결합한다. review 반환은 현재 패턴·목표·과거 결과·순위·show/reason과 적격 후보·연결 지문을 포함한다. `referencesOnly:true`, `permanentPreferencesChanged:false`, `authorizesExecution:false`다.

delivery input은 `{at, topicId, patternProposalId, researchProposalId, receiptId, sourceRef}`다. 기존 저장된 패턴 제안, 같은 주제의 조사 제안, 현재 목표 revision, 출처 내용을 대조한다. 반환은 `{pattern, research, patternResult, researchResult, persisted:false, readVerified:false, userAccepted:false, authorizesExecution:false}`다. 두 새 상태를 각 저장 어댑터로 적용하고 영구 저장·재조회를 별도로 수행한다.

## 오류 처리

`PATTERN_*` 오류를 원래 사건·버전과 함께 확인한다. 소유자·scope·goal·source 불일치는 다른 파일이나 임의 기준으로 우회하지 않는다. 부재·손상·용량·버전·동시 쓰기 충돌을 구분한다. CLI는 실제 경로·민감 내용을 그대로 출력하지 않는 오류 코드와 실패 종료를 사용한다. 성공 출력의 `ok:true`는 해당 로컬 명령의 완료이며 영구 저장이나 사용자 읽음의 증거가 아니다.
