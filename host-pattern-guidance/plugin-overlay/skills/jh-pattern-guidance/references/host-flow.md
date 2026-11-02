# 호스트 실행과 저장 절차

## 목차

- [소스와 상태 읽기](#소스와-상태-읽기)
- [실제 사건 기록과 조회](#실제-사건-기록과-조회)
- [기존 JH 런타임으로 후보 검토](#기존-jh-런타임으로-후보-검토)
- [한 번의 전달과 부분 저장 복구](#한-번의-전달과-부분-저장-복구)
- [저장 실패와 완료 판단](#저장-실패와-완료-판단)

## 소스와 상태 읽기

`runtime-source.json`의 `bundledFiles`와 동봉 파일의 SHA-256을 대조한다. Node.js 22 이상에서 검토한 모듈만 import한다. 상태·발화·검색 결과는 JSON 자료로 처리하며 코드로 실행하지 않는다. 외부 패키지 설치나 네트워크 연결은 코어 실행에 필요하지 않다.

`state-binding.json`의 정확한 파일명을 정상 조회한다. 반환된 파일 ID·현재 버전·원래 이벤트 ID를 보존한다. 이름이 같은 파일이 여러 개면 실제 출처와 이전 바인딩으로 구분하며 아무 파일이나 덮어쓰지 않는다. 조회 오류나 손상 JSON은 부재가 아니다. 신규 초기화는 정상 조회에서 부재가 확인됐을 때만 한다. 이전 v0.1 자료는 출처와 소유자 이력이 달라 자동 이관하지 않는다.

새 패턴 상태는 `jh.pattern-memory.v2` 원본 객체다. 각 기존 모듈의 파일은 해당 모듈 계약으로 별도 검증해 코어 상태 객체를 얻는다. `pattern`, `personal`, `decision`, `research`의 `ownerScope`가 모두 동일해야 한다. `ownerScope`는 파일 혼용 방지용이며 인증을 대신하지 않는다. 개인 대화의 현재 질문·피드백은 별도로 읽는다.

명령 형식은 다음과 같다. 경로·소유자·요청 파일은 실제 확인한 값으로 치환한다.

```sh
node /absolute/plugin/skills/jh-pattern-guidance/scripts/cli.mjs COMMAND \
  --store /absolute/private/JH_Pattern_Memory_v2.json \
  --owner OWNER --input /absolute/private/request.json
```

| CLI 명령 | 입력과 동작 |
| --- | --- |
| `init` | `{now}`로 새 상태 생성. 기존 파일이면 거부. |
| `validate` | 현재 파일·소유자·전체 사건 재생 검증. |
| `mutate` | 실제 원본 사건 요청 하나를 revision CAS로 반영. |
| `patterns` | `{now, scope?}`로 독립 작업별 반복 신호 조회. |
| `context` | `{now, topicId}`로 반복 근거와 최근 제안·영수증 조회. |
| `challenge` | `{now, scope, facts, overrides?}`로 최신 기준의 충돌 조회. |
| `evaluate` | `{now, candidate}`로 패턴 코어의 후보 적격성 조회. |

`--store`는 절대 경로, `--owner`는 명시한 소유자다. `--input`을 생략하면 stdin JSON을 사용한다. `evaluate`만으로 기존 목표·조사·개인화 상태 연결을 검증했다고 주장하지 않는다. 실사용 통합 후보는 아래 `reviewInstalled`를 사용한다.

## 실제 사건 기록과 조회

호스트가 원본 요청의 의미를 읽어 정확한 `topic/project/aspect`, 논리적 작업 ID와 요청 ID를 판단한다. 실제 플랫폼 ID가 제공되지 않으면 안정적인 호스트 참조를 발급하고 그 사실을 구분한다. 계속 요청마다 새 작업을 만들지 않는다. 과거 요약·첨부 화면·다른 모듈의 동일 근거를 별개의 독립 문제로 복제하지 않는다.

호스트가 생성하는 `mutate` 요청에는 실제 `id`, `kind`, `data`, `sourceRef`, `at`, 조회한 `expectedRevision`이 필요하다. 전체 입력 계약은 [runtime-contract.md](runtime-contract.md)를 따른다. 발생 시각이 과거라면 `data.occurredAt`에 실제 시각을 두고, 이벤트의 `at`는 현재 저장 시각을 사용한다. 모르는 과거 시각·결과를 만들어 넣지 않는다.

`continue/status`는 관찰 증가 없이 조회만 이어가는 용도다. `status` 이벤트는 주제를 보류·거절·해결·명시적 재개하는 별도 변경이다. 최신 `outcome:solved`는 그 전에 발생한 같은 작업의 문제를 미해결 집계에서 제외한다. 그 뒤 발생한 실제 재발은 새 근거로 구분한다.

`rule`은 사용자 명시 기준을 `confirmed`로, 호스트 추론은 `uncertain`으로 구분한다. 같은 범위·키를 바꿀 때 최신 rule ID를 `supersedes`에 지정한다. `challenge.overrides`는 이번 요청의 명시적 예외이며 저장된 규칙을 변경하지 않는다. 이 패턴 규칙은 기존 개인화 저장소와 별개다. 사용자 장기 선호를 바꿀 실제 근거가 있을 때만 기존 개인화 경로에 별도로 반영한다.

## 기존 JH 런타임으로 후보 검토

기존 조사 모듈의 실제 검색·출처 수집·완료 흐름에서 `proposalId`를 얻는다. 조사·주제 상태를 제안 적격성을 만들기 위해 임의로 재활성화하지 않는다. 공개 검색어는 사적 정보가 없는지 확인한다. URL과 내용 해시는 동일 출처를 확인하는 수단이며 사실성·HTTP 조회를 독립 인증하지 않는다.

`notices`에 현재 후보가 없으면 `reviewInstalled`를 호출하기 위한 후보나 지표를 만들지 않는다. 패턴은 `detectPatterns`로 조회하고 실제 topic이 있을 때만 `context`를 읽는다. 기존 목표가 있으면 `goalContext`, 현재 대화는 `dialogueContext`를 읽어 마지막 검증 결과와 미완료 작업을 이어간다. 계속 요청을 새 명시적 조사 사건으로 바꾸지 않고, 완료 목표·이미 전달된 제안도 그대로 둔다. 새 제안이 없다는 결과는 승인된 작업을 중단할 이유가 아니다.

설치된 skill의 `scripts/installed-runtime.mjs`에서 `reviewInstalled`를 import한다. 기본 상대 경로는 같은 플러그인의 `skills/`를 가리킨다. 별도 검증 디렉터리에서 실행할 때만 실제 검증된 `skillsRoot` 디렉터리 URL을 명시한다. 로더가 의존 해시 변경을 알리면 임의 경로·버전으로 우회하지 말고 실제 변경을 대조한다.

```js
const review = await reviewInstalled(
  {pattern: patternState, personal: personalState,
   decision: decisionState, research: researchState},
  {
    at: actualNow,
    topicId: actualTopicId,
    goalId: actualGoalId,
    proposalId: actualResearchProposalId,
    changeKey: stableMethodChangeKey,
    ranking: {scope: actualScope, candidates: sourcedCandidates,
              context: explicitCurrentContext},
    mode: actualMode,
    metrics: actualMetrics,
    hostConditionsVerified: actualConditionsResult
  }
);
```

`ranking.candidates`는 기존 개인화 형식이며, 조사 후보의 실제 ID와 일치하는 후보가 있어야 한다. `hostConditionsVerified:true`는 목표와 이번 요청의 모든 필수 조건을 실제 검토했다는 호스트 판단이다. 숫자 비교에 통과했다는 이유로 임의의 조건까지 확인됐다고 채우지 않는다. 정보가 부족하면 `null`을 쓴다. `metrics`의 다섯 값도 확인 가능한 비교 근거에서 정하며 모르는 값은 `null`이다.

결과의 `pattern`, `goalContext`, `reviewContext`, `ranking`을 함께 읽는다. `show:false`이면 이유에 따라 현재 작업을 계속하고 후보를 억지로 내지 않는다. `show:true`일 때만 반환된 `candidate`를 정확히 `kind:proposal`의 data로 사용한다. review는 읽기 전용이며 저장이나 실행 승인이 아니다. 상태가 바뀌면 이전 review를 맹목적으로 재사용하지 말고 최신 상태로 검토한다.

실제 응답은 반복된 필요, 이전 결과에서 확인된 부족한 부분, 새 근거와 방법, 필요한 부담을 연결해 설명한다. 이전 결과가 없으면 부족한 부분도 가설로 표시한다. 현재 대화의 기존 `dialogueContext.pendingQuestion`을 읽고, 새로운 질문은 해당 모듈의 `planQuestion`에서 허용될 때 한 개만 준비한다. 이미 충분한 답과 실행 권한이 있으면 추가 질문 없이 진행한다.

## 한 번의 전달과 부분 저장 복구

제안·전달·읽음·채택·사용 결과는 별개의 사건이다. 사용자에게 전달할 응답이 준비되었을 때만 다음을 수행한다.

1. 반환된 `candidate`를 패턴 CLI `mutate`로 `proposal` 저장한다. 저장 결과의 실제 `result.id`를 사용한다. 기존 동일 대기 제안의 ID가 반환되면 새 ID로 대체하지 않는다. 원본 요청과 결과를 보존한다.
2. 최신 패턴·조사·개인화·판단학습 상태를 다시 확인한다. `deliveryInstalled`에 실제 topic, 패턴 proposal ID, 조사 proposal ID, 원래 receipt ID와 sourceRef, 실제 인계 시각을 넣는다. 반환된 연결 검증이 통과해야 두 저장을 진행한다.
3. 패턴 상태에는 원래 receipt 요청 `{kind:'receipt', data:{proposalId:patternProposalId, meaning:'handoff_attempted'}, ...}`을 패턴 CLI `mutate`로 저장한다. 조사 상태에는 기존 조사 CLI `ack`로 `{expectedRevision, receiptId, proposalIds:[researchProposalId], at}`을 저장한다. 두 CLI는 각각의 소유자·잠금·revision을 검사한다. `deliveryInstalled`가 반환한 객체 자체는 저장 완료가 아니다.
4. 각 영구 저장소에는 해당 파일의 현재 버전으로 교체하고 각각 다시 읽는다. 결과 지문과 원래 proposal/receipt를 대조한다. 어떤 저장이 완료됐는지 기록한다. 전체 저장을 하나의 원자적 트랜잭션으로 주장하지 않는다.
5. 일부만 저장되거나 응답을 잃었으면 실제 두 파일을 다시 읽고 같은 원래 receipt ID·내용·시각·출처로 복구한다. 충돌 상태를 새 ID·새 시각으로 덮거나 새 조사를 실행하지 않는다. 이미 전달한 후보는 새 질문이나 제안으로 재출력하지 않는다.

```js
const next = await deliveryInstalled(states, {
  at: actualHandoffTime,
  topicId: actualTopicId,
  patternProposalId: storedPatternProposalId,
  researchProposalId: actualResearchProposalId,
  receiptId: stableReceiptId,
  sourceRef: actualHandoffRef
});
// next.persisted와 next.readVerified는 false다.
// 원본 요청을 각 저장 어댑터로 적용하고, 각 영구 파일을 재조회한다.
```

목표·출처·주제 상태가 달라져 검증이 실패하면 낡은 제안의 전달을 확정하지 않는다. 저장된 초안은 전달·승인으로 승격되지 않는다. `PATTERN_PROPOSAL_EXPIRED`면 원래 제안을 늦게 전달한 척하지 말고 현재 자료와 조건으로 다시 검토한다.

## 저장 실패와 완료 판단

로컬 파일은 소유자 전용 0600이고 심볼릭 링크·하드링크·손상 JSON·동시 쓰기 충돌을 거부한다. 기존 파일 권한이 원인이면 파일의 실제 출처와 소유자를 먼저 확인한다. 저장 한도는 2MiB·2,000개 이벤트이고 조회 출력은 512KiB다. 한도 오류에 기존 이력을 조용히 버리거나 용량 정책을 자동 변경하지 않는다.

불확실한 쓰기 결과는 원래 ID로 재조회한다. `expectedRevision`이 오래됐으면 최신 상태에서 동일 논리 사건을 확인하고 충돌을 해결한다. 이미 존재하는 동일 이벤트의 재시도는 멱등 처리되지만 다른 내용으로 같은 ID를 재사용하면 오류다.

구현 검사, 실제 기존 런타임 연결 검사, 게시 후 파일 해시 확인, 개인 상태 저장과 재조회는 별도 증거다. 합성 테스트 통과를 실제 만족도나 사용자에 대한 이해 향상으로 기록하지 않는다. 실제 사용자가 결과를 말하면 원래 선택·목표·질문과 연결해 후속 판단에 사용한다.
