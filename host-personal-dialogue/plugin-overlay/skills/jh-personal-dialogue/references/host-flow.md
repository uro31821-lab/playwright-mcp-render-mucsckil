# 호스트 실행·저장·이전 기능 연결

## 동봉 코드와 실행

`runtime-source.json`의 SHA-256으로 동봉 파일을 대조한다. 검토한 소스만 코드로 로드하며 사용자 상태·피드백·검색 결과를 코드로 평가하지 않는다. 코어는 `globalThis.JHPersonalDialogue`를 제공한다. Node.js 24 CLI는 별도 설치·외부 호출 없이 사용할 수 있다.

```sh
node cli.mjs COMMAND --store /absolute/private/JH_Personal_Dialogue_v1.json --owner OWNER --input request.json
```

| 명령 | API |
| --- | --- |
| init | createState |
| validate | validateState |
| subject | recordSubject |
| question | recordQuestion |
| asked | markAsked |
| feedback | recordFeedback |
| park | parkQuestion |
| plan | planQuestion |
| context | dialogueContext |

`--owner`와 절대 `--store`는 필수다. CLI는 소유자·JSON·이벤트 재생을 검증하고 잠금과 원자적 파일 교체를 사용한다. Linux 상태 파일은 0600이다. 원본 이벤트 ID·내용·시각·expectedRevision을 보존해야 정확한 재시도가 가능하다. `validate`와 읽기 명령은 상태를 바꾸지 않는다. 로컬 파일 완료는 영구 저장 완료를 뜻하지 않는다.

## 한 번의 대화 흐름

1. 정상 조회로 실제 상태를 얻고 `validateState`로 검증한다. 새 생성 여부는 조회의 정상 완료로 판단한다.
2. 실제 요청의 topic/project/aspect와 현재 threadId로 `dialogueContext`를 읽는다. 다른 범위를 말뜻이 비슷하다는 이유로 결합하지 않는다.
3. 이미 답을 아는 경우 진행한다. 상의할 중요한 선택이 있으면 실제 대상과 질문을 기록한다. 외부 참조는 host attestation이며 그 레코드가 실제로 존재하는지 해당 모듈에서 따로 확인한다.
4. `planQuestion`을 확인하고 현재 대화에서 적절할 때 한 질문만 출력한다. `markAsked`는 그 출력 인계 시도로 기록하고 읽음·승인으로 사용하지 않는다. 저장 실패가 나면 “다음에도 기억한다”고 말하지 않는다.
5. 다음 실제 발화가 해당 질문의 답인지 확인한 뒤 `elicited`로 연결한다. 사용자가 먼저 준 피드백은 `spontaneous`로 저장한다. 두 경로 모두 같은 출처 기준과 단계 구분을 적용한다.
6. 문맥이 바뀌어 기다릴 이유가 사라지면 `parkQuestion`으로 호스트의 이유를 기록한다. 실제 사용자 거절·보류가 있었다면 그 진술에 맞는 feedback 경로를 사용한다.
7. 저장된 새 본문을 다시 읽어 상태 지문과 원래 이벤트를 대조한다. 다음 관련 답변에서 실제 기준과 미확정 사항을 다시 사용한다.

`threadId`는 플랫폼에서 실제로 제공된 값을 쓰거나 호스트가 발급한 안정적인 참조를 쓴다. 후자는 플랫폼의 실제 대화/메시지 ID로 주장하지 않는다. 계속 요청에서는 같은 논리적 대화 참조를 복구한다. 새 thread를 만들어 질문 중복·대기 제한을 우회하지 않는다.

## 확인된 기준과 미확정 기준

지속 선호는 전체 관련 feedback에서 preferenceKey별 최신 ongoing 이벤트를 사용한다. 최신 uncertain이면 unresolved로 남고 오래된 confirmed가 되살아나지 않는다. 표시 항목 limit을 줄여도 이 계산은 전체 관련 기록에 적용된다. this_task는 현재 thread에만 적용한다. considering과 experience는 근거 이력이며 명시적 장기 선호가 아니다.

질문에 대한 실제 답은 draft에 연결할 수 없다. 단순 전달만으로 asked를 answered로 만들 수 없다. userReadVerified는 false다. 질문에 대답하지 않은 상태에서 다른 피드백을 말해도 그 질문이 저절로 닫히지 않는다. 질문을 접는 결정은 사용자 만족·싫어함으로 변환되지 않는다.

## 목표·결과와 함께 조회

새 runtime와 `scripts/context-adapter.js`를 로드한다. 목표 결과가 필요할 때만 `runtime-source.json`에 핀한 기존 `../../jh-decision-learning/scripts/runtime.js`를 함께 로드한다.

```js
const result = JHPersonalDialogueBridge.context(dialogueState, decisionStateOrNull, {
  scope: actualScope,
  threadId: actualThreadId,
  at: actualNow,
  goalId: actualGoalIdOrNull,
  limit: 5
});
```

goalId가 null이면 decisionStateOrNull도 null이다. 목표를 결합하면 두 ownerScope와 scope의 모든 선언 차원이 정확히 같아야 한다. ownerScope 문자열은 파일 혼용 방지용이며 저장소 인증을 대신하지 않는다.

결과의 dialogue는 두 경로의 피드백·선호·질문 상태다. decision은 기존 `reviewContext`의 목표·예상·관찰·검토다. 두 근거를 읽고 현재 조건을 판단한다. 이 어댑터는 `updatesPreferences:false`, `infersPreferences:false`, `externalReferencesVerified:false`, `authorizesExecution:false`를 반환한다. 자유 문장으로 가중치를 자동 생성하거나 기존 개인화 상태에 쓰지 않는다.

실제 장기 기준 변경은 기존 개인화 API로 별도 기록한다. 실제 after-use라면 원래 선택과 사용 보고를 연결한다. 기존 목표와 조사 후보의 보류·거절·중복 방지 상태를 먼저 존중한다. 여러 모듈의 쓰기를 원자적으로 묶는 기능은 없으므로 각각의 원래 이벤트·버전·읽기 검증을 보존한다.

## 비공개 저장과 오류

정확한 파일명의 정상 조회 결과에서 반환된 파일 ID와 현재 버전을 사용한다. 동일 이름이 여러 개거나 조회가 실패하면 빈 상태를 새로 만들지 않는다. 같은 ID를 읽고 동일 이벤트를 확인한 뒤에만 불확실한 쓰기를 재시도한다. 실제 상태를 공개 저장소·테스트 fixture·플러그인 ZIP에 넣지 않는다.

전체 상태는 2MiB, 각 조회와 어댑터 응답은 512KiB로 제한한다. 초과 시 명시적으로 실패하고 이력을 조용히 버리지 않는다. 조회 limit이 출력 한도를 해결하지 못하면 해당 오류를 드러내고 이전 상태를 보존한다. 기존 기억 용량이나 이전 정책을 임의로 바꾸지 않는다.

코어 테스트는 기록과 상태 경계를 검증한다. 실제 만족도, 자연어 해석 정확도, 질문의 적절한 빈도는 사용자와 실제 사용에서 확인해야 한다. 질문 하나를 위한 개발 완료를 사용 후 만족으로 기록하지 않는다.
