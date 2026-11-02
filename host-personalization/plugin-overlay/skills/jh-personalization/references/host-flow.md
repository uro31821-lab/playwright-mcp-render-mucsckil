# 호스트 실행과 저장 계약

## 실행 환경과 경계

동봉 `scripts/runtime.js`는 추가 의존성 없이 `globalThis.JHPersonalization`을 정의한다. 코어는 파일·네트워크·자격증명·스케줄러를 사용하지 않는다. `references/runtime-source.json`의 SHA-256과 동봉 원본을 대조한 뒤 현재 코드 실행 환경에서 로드한다. 검토한 런타임을 제한된 V8에서 `new Function(runtimeSource)()`로 실행할 수 있으며, 개인 상태나 외부 자료를 코드로 평가하지 않는다.

로컬 파일에는 Node.js 24의 `scripts/cli.mjs`를 사용할 수 있다. `init / validate / prefer / revise / choose / feedback / rank` 명령과 명시적인 절대 `--store` 경로, `--owner`, `--input file.json|-`를 받는다. 로컬 CLI 성공은 개인 저장소의 저장 완료가 아니다. 파일을 현재 Library 절차로 저장하고 반환된 ID·버전을 확인해야 다음 대화에 보존된다.

`ownerScope`는 파일 혼용 방지 값이며 인증 증명이 아니다. 인증된 저장소 접근 제어와 호스트/CLI의 소유자 대조가 실제 경계를 담당한다. 손상 파일·다른 소유자 파일·용량 초과를 새 빈 기억으로 대체하지 않는다.

## 근거를 입력으로 바꾸는 기준

호스트는 사용자 말의 의미와 현재 상황을 판단한다. 런타임은 주어진 구조를 검증·기록·계산하며 자연어의 숨은 의도를 자동 추출한다고 주장하지 않는다.

| 실제 관찰 | 처리 |
| --- | --- |
| 특정 작업에서 중요하다고 명시한 조건 | 해당 topic/project/aspect에 한정된 preference |
| 예시, 가정, 여러 취향을 비교한 질문 | 사실이나 확정 취향으로 저장하지 않음. 필요하면 uncertain |
| 이번에는 자세히/간단히/탐색하고 싶음 | 이번 rank의 context.mode 또는 priorities |
| 사용자가 실제 선택과 이유를 말함 | recordChoice, 당시 유효 기준 ID 연결 |
| 써본 뒤 결과와 구체적인 불편을 말함 | recordFeedback, basis after_use와 선택 ID 연결 |
| 이유가 없는 부정 평가 | 평가 요약과 updates:[], 임의의 일반 선호 변경 금지 |
| 이전 선호를 명시적으로 정정함 | revisePreference, 원래 대상 ID 유지 |
| 계속/상태/재전송 | 원래 작업·이벤트 ID 유지, 새 선호·선택으로 누적하지 않음 |

발화 시각을 알 수 없으면 실제 관찰 시각을 쓰고 과거 발화 시각처럼 꾸미지 않는다. `sourceRef`는 실제 메시지 위치 또는 호스트가 관리하는 불투명 참조다. 추측한 플랫폼 메시지 ID·URL을 만들지 않는다. 사용자 정보의 출처와 공개 후보 자료의 출처를 구분한다.

## API

모든 mutation은 `{state,result}`를 반환한다. 입력의 `expectedRevision`에는 읽은 최신 revision을 사용한다. 원래 이벤트의 정확한 재시도는 과거 revision이어도 같은 결과를 반환하지만 다른 새 쓰기는 CAS 검사로 차단된다. 원본 state 객체를 직접 편집하지 않는다.

```js
const P = globalThis.JHPersonalization;
state = P.validateState(state);
const next = P.recordPreference(state, {
  expectedRevision: state.revision,
  preferenceId: actualStablePreferenceId,
  scope: actualScope,                  // { topic, project?, aspect? }
  key: actualCriterionKey,
  direction: 'higher',                // higher | lower
  weight: 3,                         // 1..5, host-reviewed relative weight
  status: 'confirmed',                // confirmed | uncertain
  reason: shortSupportedReason,
  sourceRef: actualSourceRef,
  at: actualObservationTime
});
state = next.state;
```

`recordPreference`는 처음 밝힌 지속 기준을 생성한다. `revisePreference`는 `revisionId`, 정정할 `preferenceId`, 새 direction/weight/status/reason 및 공통 필드를 받는다. 원래 기록은 보존하고 새 ID가 이전 기록을 대신한다. 새로 uncertain이 된 기준에 과거 confirmed 값을 대체 적용하지 않는다.

`recordChoice`는 `choiceId, scope, candidateId, reason, criteria:[{preferenceId,reason}]`와 공통 필드를 받는다. `criteria`에는 현재 상황에 실제로 적용되는 유효한 지속 기준만 연결한다. 현재 대화에만 쓰인 기준은 장기 선호 ID로 꾸미지 말고 선택 이유에 필요 범위만 남긴다. 사용자가 선택한 사실이 없으면 호출하지 않는다.

`recordFeedback`은 `feedbackId, choiceId, basis:'after_use', outcome, summary, updates`와 공통 필드를 받는다. outcome은 positive/mixed/negative/uncertain이다. updates의 각 항목은 새 preferenceId/key/direction/weight/status/reason/explicit:true를 갖고 선택과 동일한 scope를 사용한다. 단순 관심이나 비서의 평가를 after_use로 넣지 않는다. 사용 후 평가의 진위는 호스트의 관찰 근거에 의존한다.

## 추천 계산

```js
const result = P.rank(state, {
  at: actualNow,
  scope: actualScope,
  candidates: actualCandidates,
  context: {
    mode: explicitCurrentMode,
    priorities: explicitCurrentPriorities,
    constraints: explicitCurrentConstraints
  }
});
```

candidates는 `{id,label,features:{key:number|null},sourceRefs:[string]}`이다. 각 feature는 0..1 비교 척도이고 모르는 값은 null 또는 누락이다. 현재 priorities는 `{key,direction,weight,reason,sourceRef}`이며 저장되지 않는다. constraints는 `{key,operator:'gte'|'lte',value,reason,sourceRef}`로 정의한다. 제약의 필요한 특징이 없으면 통과한 것으로 추정하지 않는다.

적용 범위는 의미 추측 없이 선언한 필드의 정확한 일치로 판정한다. 더 구체적인 범위가 우선한다. 같은 범위에서 명시적 정정과 실제 사용 후 평가는 같은 우선층이며 둘 중 더 최신 이벤트를 사용한다. 둘 다 최초의 stated보다 우선한다. 이번 context는 해당 key에 즉시 우선하고 상태는 그대로다.

점수는 알려진 특징의 가중 적합도를 확인된 전체 기준 가중치로 나눈 보수적 하한이다. 모르는 특징의 가능한 최대 기여를 더한 상한과 coverage도 반환한다. 높은 상한은 잠재적 불확실성을 뜻하며 더 좋은 후보라는 증명이 아니다. 결과는 `featureTruthVerified:false`, `scoreKind:'caller_supplied_feature_fit'`를 유지한다. 외부 후보의 실제 품질, 효과, 선호 확률을 검증한 것으로 표현하지 않는다.

`reasons`에는 적용한 기준·방향·근거가 연결된다. `unresolved`에는 점수에서 제외한 미확정 기준이 남는다. 같은 점수·확신이 낮은 후보에서는 추가로 확인할 자료를 제시하고 억지로 하나가 확실히 맞는다고 말하지 않는다. 사용자에게는 계산 내부 항목을 나열하기보다 중요한 이유 한두 가지와 한계를 설명한다.

## 저장·복구

정확한 개인 파일명을 조회해 현재 파일 ID와 버전을 확보한다. 실제로 파일이 없는 정상 응답을 확인한 최초 한 번만 `createState({ownerScope,now})`로 생성한다. 변경 후 같은 ID에 기대 버전으로 저장하며, 충돌하면 최신 파일을 다시 읽고 아직 없는 원래 이벤트만 재적용한다. 저장 재시도를 검색·설치·다른 외부 작업의 재실행으로 확대하지 않는다.

개인 선호, 사용 후 결과, 출처 참조를 공개 저장소나 공유 플러그인에 넣지 않는다. 기존 Memoria Google Drive 원본이나 JH 작업 경험을 새 JSON으로 전부 복사하지 않는다. 현재 목적에 필요한 확인된 기준만 별도 개인 선택 상태로 기록하며, 기능의 구현 성공은 기존 운영 학습 경로에 한 번 기록한다.

게시된 플러그인의 버전, 코드 실행 결과, 파일 저장 결과, 실제 사용자 만족은 각각 별도의 사실이다. 합성 테스트의 선택·평가를 개인 프로필에 넣거나, 테스트 통과를 사용자의 만족도 증거로 삼지 않는다.
