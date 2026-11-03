# 현재 대화에서 에비서 기능을 읽는 호스트 절차

## 호출과 작업 범위

자연어 해석은 GPT 호스트가 현재 사용자 발화와 대화 문맥을 보고 수행한다. `context.mjs`는 의미를 추론하는 모델이나 다른 대화방 원격 실행기가 아니다. 호스트가 해석한 요청을 검증하고 기존 런타임에 연결하는 읽기 전용 함수다.

주인님이 “에비서, 이런 건 어떻게 해야 돼?”라고 현재 문제를 가리키면 `intent:consult`, `basis:direct`다. “그 비서에게 물어봐”에서 에비서 지칭이 문맥상 명확하면 `basis:contextual_user_request`다. “에비서 참고해서 진행해”는 현재 작업에 맞는 `reference` 또는 `assist`로 해석한다. 사용법 질문에 등장한 예문·명시적 제외·가정은 `none`과 해당 basis로 표시하며 상태를 조회하지 않는다. 이 내부 구분을 사용자에게 고르게 하지 않는다.

현재 threadId/taskId와 실제 작업 scope를 유지한다. 플랫폼 ID가 없으면 호스트 논리 참조를 안정적으로 발급할 수 있으나 실제 플랫폼 ID나 실행 승인을 복원했다고 주장하지 않는다. 서로 다른 방의 동일 프로젝트는 관련 과거 근거를 읽을 수 있지만 현재 대화의 작업·질문·권한을 합치지 않는다.

기존 개인 대화 기록에는 taskId가 없고 `this_task`는 정확한 scope와 threadId로 구분된다. 새 taskId는 현재 호출의 출처·문맥을 표시하며 과거 기록의 실제 작업 ID와 자동 대조됐다는 뜻이 아니다. 같은 방에서 작업이 바뀌었다면 과거 이번 작업 조건이 여전히 적용되는지 호스트가 확인하고, 확인되지 않은 조건을 새 작업으로 자동 옮기지 않는다.

## 관련 근거만 가져오기

현재 문맥에 없는 과거 정보가 답을 바꿀 때만 조회한다. 기존 비공개 상태의 정확한 파일명을 확인하고 반환된 ID·버전을 재사용한다. 조회 실패·동명이인 파일·다중 후보를 빈 상태 생성으로 해결하지 않는다. 저장소 인증과 ownerScope 일치는 별개다.

| 실제 필요한 근거 | 기존 경로 |
| --- | --- |
| 대화에서 확인한 기준과 피드백 | `JH_Personal_Dialogue_v1.json`, 개인 대화 context |
| 실제 목표와 예상·결과 | `JH_Decision_Learning_v1.json`, 실제 goalId가 있을 때 |
| 후보별 사용자 기준 | `JH_Personal_Choices_v1.json`, 실제 비교 후보가 있을 때 |
| 작업 완료·실패·검증된 해결 | 기존 JH 경험 context/lesson-view와 원 결과 근거 |
| 다른 대화의 필요한 발언 | 현재 개인 문맥 조회; 발견한 실제 출처·시점을 유지 |
| 반복 문제·조사 제안 | 기존 패턴·조사 경로; 실제 topic/goal/proposal 근거가 있을 때 |

모든 파일을 호출마다 내려받지 않는다. 이미 현재 요청에서 확인한 동일 버전 상태·입력은 재사용한다. 관련 scope가 실제로 두 개면 필요한 범위별로 조회해 적용 범위를 유지한다. 의미가 비슷하다는 이유로 scope를 재작성하여 기존 검사를 통과시키지 않는다. 일반 기준·작업별 조건·과거 경험을 구분한다.

기존 상태를 확인해 아직 관련 기록이 없거나 해당 모듈이 불필요하면 null을 전달한다. 조회 접근이 실패했다면 호출 측에 실패를 보존하고, null을 “해당 기록은 없다”는 증거로 쓰지 않는다. 이 함수는 상태 생성·저장·네트워크·기기 호출을 하지 않는다.

## 실제 기존 런타임 연결

`runtime-source.json`으로 동봉 파일을 확인한다. Node.js에서 설치된 sibling 스킬의 다섯 실제 파일을 SHA-256으로 확인한 뒤 로드한다. 개인 데이터·검색 결과·피드백을 코드로 평가하지 않는다.

```js
import { contextInstalled } from './scripts/installed-runtime.mjs';

const result = await contextInstalled(
  { dialogue: actualDialogueOrNull,
    decision: actualDecisionOrNull,
    personal: actualPersonalizationOrNull },
  { ownerScope: actualOwner,
    scope: actualScope,
    threadId: currentThread,
    taskId: currentTask,
    at: actualNow,
    invocation: {
      intent: 'consult',
      basis: 'direct',
      sourceRef: actualUserRequestRef
    },
    goalId: actualGoalIdOrNull,
    ranking: actualRankingOrNull }
);
```

`scope`는 기존 `{topic,project,aspect}` 계약을 따른다. goalId와 ranking은 없으면 null로 취급한다. ranking은 실제 `{candidates,context?}`이며 scope·시각은 현재 요청에서 전달된다. 후보 이름·평가 특성·목표·기준 값을 추측해 채우지 않는다.

직접 주입 방식은 `contextWithJH(states,input,runtimes)`다. 설치 로더는 기존 개인 대화, 대화-목표 bridge, 개인화, 판단, 판단-개인화 adapter를 재사용한다. 기존 파일을 이번 패키지에 다른 버전으로 복제하지 않는다. 의존 해시가 달라졌으면 실제 최신 버전을 확인하고 필요한 호환 검증을 한다.

## 반환값 읽기

- `active:false`인 비호출은 상태·설치 파일·기억 API를 읽지 않는다. 정상적인 현재 질문에 답하거나 제외 지시를 따른다.
- `dialogue`는 현재 scope의 기준·피드백·현재 thread의 질문이다. 다른 thread의 `this_task` 피드백은 `historicalEvidence`에 분리된다. 과거 사건을 현재 지시로 승격하지 않는다.
- `decision`은 실제 연결된 목표의 상태·결과다. 완료·보류 목표는 원래 상태 그대로다. 새로운 목표로 자동 재개하지 않는다.
- `ranking`은 실제 후보와 해당 조건이 있을 때만 계산된다. 요청한 목표 상태가 없으면 목표 없는 비교로 슬쩍 대체하지 않는다.
- `unavailable`은 전달되지 않은 상태 또는 필요한 연결의 부재다. 저장소에 기억이 없다는 확정이나 사용자 기준을 추정해도 된다는 허락이 아니다.
- `authorizesExecution:false`, `persistentStateChanged:false`다. 반환된 근거를 원래 사용자 요청에 적용하는 판단은 호스트가 맡으며 원래 작업의 유효한 승인·보안·결과 확인을 그대로 유지한다.

실제 응답은 결과를 먼저 제시한다. 관련 기록 때문에 선택이 달라졌을 때만 그 이유를 짧게 밝힌다. 실행이 필요한 원래 요청이면 승인된 다음 작업을 계속하고, 상담만 요청했으면 답과 구체적 제안으로 마친다. 불필요한 설치 안내·방 이동·재승인·긴 인계문을 덧붙이지 않는다.

## 검증과 한계

코드 검사는 실제 기존 런타임 연결, 소유자·scope·thread 경계, 기억 불변, 누락된 목표/후보, 비호출 무조회 및 설치 파일 해시를 확인한다. 자연어 예시는 별도 호스트 시나리오로 확인한다. 함수 테스트가 한국어 이해 전체 또는 모든 기존 방의 자동 적용을 증명하지 않는다.

새 공개 출처가 필요하면 현재 검색 도구로 확인한다. 다른 사람에게 전송하거나 다른 대화를 직접 조종하지 않는다. 실제 사용자 상태는 플러그인·공개 소스·예시 시험 자료에 포함하지 않는다.
