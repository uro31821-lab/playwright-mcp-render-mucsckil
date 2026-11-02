# 호스트 실행·저장·기존 기능 연결

## 동봉 코드 확인

`runtime-source.json`에 있는 파일별 SHA-256을 동봉 소스와 대조한다. `scripts/runtime.js`는 추가 의존성이 없는 portable JavaScript다. 검토한 코드만 현재 실행 환경에서 로드한다. 개인 상태, 사용자 발화, 검색 결과, review 설명을 코드로 평가하지 않는다.

코어 로드 뒤 `globalThis.JHDecisionLearning`을 사용한다. 기존 개인화와 비교를 연결할 때만 정확한 핀의 `../../jh-personalization/scripts/runtime.js`와 새 `scripts/personalization-adapter.js`를 함께 로드해 `JHDecisionContext`를 사용한다. 두 상태의 `ownerScope`가 다르면 어댑터는 거부한다. 이 문자열은 파일 혼용 방지용이며 저장소 인증을 대신하지 않는다.

로컬 파일 작업에는 Node.js 24와 `scripts/cli.mjs`를 쓸 수 있다. 자동 설치·자격증명 입력·외부 모델 호출은 필요하지 않다.

```sh
node cli.mjs COMMAND --store /absolute/private/JH_Decision_Learning_v1.json --owner OWNER --input request.json
```

| 명령 | API |
| --- | --- |
| init | createState({ownerScope, now}) |
| validate | validateState |
| goal | recordGoal |
| goal-status | setGoalStatus |
| predict | recordPrediction |
| outcome | recordOutcome |
| review | recordReview |
| compare | compare |
| context | goalContext |
| review-context | reviewContext |
| select | selectProposals |
| turn | interpretTurn — 상태를 바꾸지 않음 |

코어의 입력 필드와 반환 값은 [runtime-contract.md](runtime-contract.md)에 고정되어 있다. CLI의 `--owner`와 절대 `--store`는 항상 필요하다. 상태 생성만 `init`으로 하며, 조회 실패를 새 파일 생성 이유로 사용하지 않는다. CLI는 다른 소유자·손상 JSON·동시 쓰기·오래된 새 쓰기에서 원본을 보존한다. Linux 파일은 소유자 전용 0600으로 저장한다. 로컬 파일 완료는 영구 저장 완료를 뜻하지 않는다.

## 현재 목표에 맞춘 추천

현재 개인화 상태와 목표 상태를 각각 검증한 다음 다음 형태로 호출한다. 아래 식별자는 호스트가 실제 입력에서 얻은 변수이며 예시를 실제 기억에 넣지 않는다.

```js
const result = JHDecisionContext.rankWithGoal(personalState, decisionState, {
  goalId: actualGoalId,
  at: actualNow,
  scope: actualScope,
  candidates: sourcedCandidates,
  context: explicitCurrentContext
});
```

`result.goalContext`에는 지금의 목표·이유·조건·상태가 담긴다. 목표 범위의 모든 차원이 이번 scope에 일치해야 한다. `reviewContext`에는 같은 정확한 목표 범위의 이전 실제 결과, 당시 예상, 검토 설명이 함께 온다. 이전 목표가 대체되어도 과거 prediction의 snapshot은 그대로다. 이 근거를 읽고 이번 조건을 판단한다.

`result.eligible:false`이면 `ranking:null`이다. 보류·만료·종료된 목표로 추천을 계속하지 않는다. 현재 사용자 요청이 새 목표를 명시하면 기존 승인을 존중해 그 목표를 기록하고 진행할 수 있다.

활성 목표에서는 기존 개인화 기준 위에 목표의 priorities/constraints를 적용한다. 같은 키의 이번 대화 `context.priorities`가 목표 기준보다 우선한다. 제약은 key와 operator가 같은 경우 이번 값으로 대체하고 다른 제약은 유지한다. 충돌하거나 필요한 후보 정보가 없으면 후보가 제외된다. 명시적인 현재 조건 없이 호스트의 추정으로 목표의 필수 조건을 풀지 않는다.

결과는 `persistentPreferencesChanged:false`, `effectivenessVerified:false`, `authorizesExecution:false`다. 점수는 입력된 후보 특성의 비교이며 실제 효과 확률이 아니다. 영구 선호를 고칠 근거가 생기면 기존 개인화 API에 실제 대상·범위·사용자 정정을 별도로 연결한다. 두 저장소를 원자적으로 쓰는 기능은 없으므로 각각의 원래 이벤트 ID·반환 버전·읽기 검증을 보존한다.

어댑터의 전체 응답도 512KiB로 제한한다. 큰 근거에서 `DECISION_CONTEXT_OUTPUT_CAPACITY`가 나면 후보 수를 줄이거나 `goalContext`와 작은 limit의 `reviewContext`를 별도로 읽는다. 근거를 몰래 삭제하거나 빈 기억으로 바꾸지 않는다.

## 기존 조사 제안과 연결

기존 `JHProactiveResearch`의 정상 조사·완료·출처 결과에서 실제 후보를 얻는다. snoozed/dismissed/resolved·재전송·이미 안내한 항목 처리는 먼저 기존 경로에서 한다. 이 모듈의 입력을 만들기 위해 그런 상태를 바꾸거나 해제하지 않는다.

호스트는 이번 목표를 기준으로 candidate.goalId, stage, eligible, sourceRefs를 확인하고 예상 benefit/confidence/setupBurden/ongoingBurden/interruptionCost를 입력한다. `eligible:true`는 해당 필수 조건을 실제로 검토했다는 호스트 판단이다. 유용성 점수나 출처 URL이 있는 것만으로 이를 true로 채우지 않는다. 근거가 부족하면 null이다.

`selectProposals`는 점수 전에 적격성과 시점을 검사한다. 전체의 적합한 후보가 없으면 selected는 빈 배열이다. 낮은 이득, 높은 부담, 현재 바쁨 때문에 제안하지 않는 결과도 정상이다. mode는 명시된 현재 상황에서 정하며 사람의 감정을 추정하지 않는다. 점수 계수는 비교 규칙이며 사용자별로 학습한 가중치가 아니다.

선택·안내·실제 열람·채택·실행·만족은 서로 다른 사건이다. 기존 조사 전달 확인에는 실제 제안 ID와 원래 영수증을 사용하고, 이 선택 결과를 사용자의 열람·채택으로 기록하지 않는다.

## 예상과 결과의 근거

사전에 정한 측정 항목만 같은 단위로 비교한다. 단위가 다른 자료는 임의 변환해 끼워 넣지 않고 원자료를 확인한다. 측정값이 없는 경우 null 또는 관찰 누락으로 유지한다. 관찰하지 않았다는 이유로 실패나 만족을 만들어내지 않는다.

결과를 이미 안 뒤 예상값을 기록해 사전 예측으로 주장하지 않는다. 추천할 때 적어 둔 실제 체크포인트가 있으면 그 원래 시각·출처를 연결할 수 있다. 이후 테스트 결과는 개발 동작에 대한 관찰이며 사용자의 after-use 만족과 구분한다.

`reviewed_inference`의 원인이나 조정안은 다음 호스트 판단에 참고할 자료다. 조회할 때 자동으로 목표·개인화·시스템 지시를 바꾸지 않는다. 사용자 진술이 가설을 확인하거나 정정하면 새 실제 근거를 기록한다. 반대 증거와 미확정 상태를 유지하고, 단 한 번의 선택이 모든 상황의 취향이 되지 않도록 범위를 제한한다.

## 비공개 상태와 복구

1. `state-binding.json`의 정확한 파일명을 현재 저장소에서 조회한다. 같은 파일이 있으면 반환된 ID·현재 버전과 본문을 읽어 `validateState`로 검증한다. 같은 이름이 여러 개면 근거 없이 하나를 덮어쓰지 않는다.
2. 쓰기는 원래 event ID, sourceRef, at, expectedRevision을 함께 유지한다. 성공 응답이 불확실하면 같은 파일과 이벤트를 읽고, 필요할 때 정확한 입력만 재전송한다.
3. 기존 파일 ID에 읽은 버전으로 교체 저장한다. 최초 정상 조회에 정확한 파일이 없을 때만 새로 만든다. 이후 정상 응답의 ID·버전을 유지한다.
4. 저장된 본문을 다시 읽어 전체 상태 지문을 대조한다. 저장 성공과 실제 근거·사용자 만족은 별개의 검증이다.

상태는 2MiB를 초과하면 명시적으로 거부하고 기존 기록을 보존한다. 이 기능 추가는 기존 JH·Memoria의 기억 용량 변경이나 이전을 포함하지 않는다. 실제 사용자 상태는 공개 GitHub·테스트 fixture·플러그인 ZIP에 포함하지 않는다.

## 실사용 검토 기준

개발 검사의 통과 수로 개인화가 좋아졌다고 결론 내리지 않는다. 실제 사용 이후 반복 설명의 감소, 잘못 기억한 조건의 정정 빈도, 사용자가 해야 하는 단계, 불필요한 제안 빈도, 나중에 말한 만족도를 확인한다. 비교한다면 같은 모델·작업·도구·입력 조건에서 이 기능이 있는 경우와 없는 경우를 구분한다. 현재 기록에 실사용 결과가 없으면 그 상태를 그대로 보고한다.
