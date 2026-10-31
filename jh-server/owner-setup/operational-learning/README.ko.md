# JH 운영 경험 기억·검증·개선 제안

JH 작업에서 확인한 실패·성공·수정 결과를 구조화해 보관하고, 같은 조건의 다음 작업에서 검증된 교훈과 개선 제안을 반환하는 독립 모듈입니다. 모델 가중치 재학습이나 기기 조작을 수행하지 않습니다.

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

CLI를 사용하는 플러그인/개발 에이전트 경로와 기존 handler를 감싸는 host adapter API를 제공합니다. **소스 추가만으로 운영 서버의 공통 hook에 연결되거나 휴대폰에서 자동 실행되지는 않습니다.** 운영 hook 연결·배포·실기기 E2E는 별도 확인 대상입니다. 이번 모듈은 기존 서버 핵심 경로와 Android 소스를 수정하지 않으므로, 이 모듈 때문에 APK를 다시 만들 필요는 없습니다.

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
- 늦게 도착한 낮은 sequence는 최신 결과를 되돌리지 않습니다.
- `completion_unknown` 뒤 실제 검증된 성공이 도착하면 해당 시도의 최종 상태를 갱신합니다. 미확정 결과는 재실행 허가가 아닙니다.
- `success_verified`·`failure_verified`에는 `host_verified` 또는 `user_explicit` 출처와 근거가 필요합니다. 일반 HTTP 200·접수·`ok:true`를 업무 성공으로 바꾸지 않습니다.
- 근거는 `fixture:…`, `regression:…`, `artifact:…` 등 지원하는 식별자입니다. 원문 URL은 받지 않습니다. 실제 허용 필드·형식은 [engine.mjs](engine.mjs)에 정의되어 있습니다.

## 네 종류의 개선 제안

| 종류 | 기본 생성 조건 | 제안 내용 |
| --- | --- | --- |
| `rule_fix` | 같은 조건·오류의 독립 실패/차단 2건 또는 수정 지적 2건 | 원인·해결 규칙과 재발 검사 추가 |
| `workflow_automation` | 같은 조건에서 검증된 성공 3건 | 입력과 결과 검사를 갖춘 재사용 절차 준비 |
| `verification_gap` | 완료 미확정 1건 | 기존 작업의 영수증·결과 재확인 경로 개선 |
| `learning_evaluation` | 검토·규칙 수정 시도 후 실패 3건 이상, 서로 다른 작업 2종 이상, 겹치지 않는 holdout 작업 1건 이상 | 별도 평가 자료로 추가 학습 필요성 비교 |

이 숫자는 효과가 입증된 최적값이 아니라 변경 가능한 **초기 설계 설정**입니다. 영역·엔진·환경이 다른 사례를 무조건 합치지 않으며, 추가 학습 평가의 최소 사례·다양성 조건은 낮출 수 없습니다.

제안은 `advisoryOnly: true`, `externalEffects: false`입니다. 스케줄 등록·명령 재시도·모델 학습·배포를 실행하지 않습니다. 새 제안만 반환하고 기존 ID·처리 상태는 보존합니다. `dismissed`를 자동으로 되살리지 않으며, 더 이상 미확정 시도가 없는 확인 제안은 `resolved`로 정리합니다.

제안 상태는 `open → accepted → implemented → verified`이며, 중간에 `dismissed`로 종료할 수 있습니다. `verified`에는 실제 통과 검사와 근거가 필요합니다. 관측 비용은 독립 작업당 기준값으로 표시하며, 비교 근거가 없는 절감시간·절감률은 만들지 않습니다.

## 교훈은 검사 후에만 활용

새 교훈은 `candidate`로 시작합니다. [regression.mjs](regression.mjs)가 교훈 정의·규칙 버전·시험 입력·기대값을 fingerprint로 묶고, 실제 실행 결과를 연결합니다. 통과 1건 이상, 실패 0, 건너뜀 0과 일치하는 근거가 있어야 `active`가 됩니다.

실패한 검사는 교훈을 `quarantined`로 격리합니다. 이미 대체된 검증 영수증이나 최신 영수증보다 오래된·충돌하는 시각의 증거를 다시 적용할 수 없습니다. 입력·버전이 바뀌면 새 후보 ID/버전으로 검사하며 과거 통과를 붙이지 않습니다.

recall은 활성 교훈 중 영역·작업·엔진·플랫폼·버전·환경이 모두 일치하는 것만 반환합니다. 활성화된 교훈도 조언이며 기존 승인·권한·실행 경계를 바꾸지 않습니다.

## 개인 저장소

[store.mjs](store.mjs)의 `FileLearningStore`는 절대경로와 고정 `ownerScope`를 사용합니다. 예: `/absolute/private/jh-learning.json`, `personal-jh`. 이 파일은 개인 영역에 두고 Git 저장소에 올리지 않습니다. 기존 JH 실행·승인 저널과도 별도로 둡니다.

파일 lock·revision·임시 파일 저장 후 교체로 기록을 보존합니다. 손상된 JSON·소유자 불일치·충돌은 오류로 알리고 내용을 초기화하지 않습니다. 정상 동시 기록은 순서대로 처리하며, 바쁜 lock은 제한된 대기 후 오류로 반환합니다. 소유자 표시는 암호화나 별도 인증 권한을 대신하지 않습니다.

## CLI 사용

Node.js 22와 표준 라이브러리만 사용합니다. 아래 명령은 개발자·플러그인 연결용입니다. 사용자가 매 작업마다 입력해야 하는 절차가 아닙니다.

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

저장소 루트에서 전체 검사를 실행합니다. 추가 의존성 설치는 필요하지 않습니다.

```bash
node jh-server/owner-setup/operational-learning/verify.mjs
```

이 검사는 엔진·저장소·어댑터·회귀·검토·CLI의 합성/임시파일 시험입니다. CI 설정 반영·CI 실제 통과·운영 hook 연결·서버 배포·휴대폰 E2E는 각각 별도로 확인해야 합니다.
