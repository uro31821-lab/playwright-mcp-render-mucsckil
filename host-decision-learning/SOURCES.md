# 목표·예상·결과·현재 제안 선별의 공개 소스 참고 기록

확인일: **2026-11-02**.

이번 보완은 사용자의 목표와 선택 조건을 연결하고, 추천 당시의 예상과 실제 결과를 비교하며, 현재 도움이 되는 제안을 가려내는 호스트 모듈이다. 아래 공식 저장소의 실제 코드에서 **기록의 구분, 평가 근거, 필수 조건과 우선순위의 분리**를 참고했다. 외부 코드를 복사하거나 실행 의존성을 추가하지 않는다.

이 구현은 입력 기록과 공개된 규칙에 따른 비교다. 강화학습, 모델 훈련, 새 최적화 알고리즘의 발명, 성능 향상 보장을 주장하지 않는다. 참고 프로젝트의 실험 점수도 JH의 성능으로 옮겨 적지 않는다.

## 1. 확인한 고정 소스와 라이선스

| 프로젝트 | 고정 커밋 | 확인한 루트 라이선스 |
| --- | --- | --- |
| Reflexion | `218cf0ef1df84b05ce379dd4a8e47f17766733a0` | [MIT](https://github.com/noahshinn/reflexion/blob/218cf0ef1df84b05ce379dd4a8e47f17766733a0/LICENSE) |
| DSPy | `25162c4fc05c2d2d019b0ffb5b6b2a9f315ec007` | [MIT](https://github.com/stanfordnlp/dspy/blob/25162c4fc05c2d2d019b0ffb5b6b2a9f315ec007/LICENSE) |
| Timefold Quickstarts | `76993a35123a127f9b630a8f7a37a1fbe76a24b0` | [Apache-2.0](https://github.com/TimefoldAI/timefold-quickstarts/blob/76993a35123a127f9b630a8f7a37a1fbe76a24b0/LICENSE.txt) |

각 커밋은 확인 당시 공식 저장소의 기본 브랜치에서 얻었다. 이후 브랜치나 패키지가 바뀌어도 이 문서의 검토 대상은 위 객체로 유지된다. 라이선스 확인 범위를 별도 데이터셋·모델·서비스 약관으로 확대하지 않는다.

## 2. Reflexion: 행동 기록·관찰·결과·반성을 구분

### 직접 읽은 파일

- [alfworld_runs/env_history.py](https://github.com/noahshinn/reflexion/blob/218cf0ef1df84b05ce379dd4a8e47f17766733a0/alfworld_runs/env_history.py)
- [alfworld_runs/alfworld_trial.py](https://github.com/noahshinn/reflexion/blob/218cf0ef1df84b05ce379dd4a8e47f17766733a0/alfworld_runs/alfworld_trial.py)
- [alfworld_runs/generate_reflections.py](https://github.com/noahshinn/reflexion/blob/218cf0ef1df84b05ce379dd4a8e47f17766733a0/alfworld_runs/generate_reflections.py)
- [hotpotqa_runs/agents.py](https://github.com/noahshinn/reflexion/blob/218cf0ef1df84b05ce379dd4a8e47f17766733a0/hotpotqa_runs/agents.py)

| 확인한 함수·구조 | 소스에서 확인한 동작 | JH에 참고하는 설계 |
| --- | --- | --- |
| `EnvironmentHistory.add()` | 행동과 관찰을 서로 다른 label로 기록한다 | 선택·실행했다는 기록과 사용 후 관찰을 구분한다 |
| `alfworld_run()` / `run_trial()` | 환경의 관찰과 종료 결과를 실행 이력·성공 여부에 연결한다 | 추천 시점의 기록을 보존하고, 이후 실제 결과를 그 기록에 연결한다 |
| `_generate_reflection_query()` | 과거 시도의 기록과 기존 계획을 사용해 다음 계획을 만들 입력을 구성한다 | 결과 차이를 검토할 때 당시 목표와 예상·선택 이유를 함께 확인한다 |
| `update_memory()` | 미해결·미제외 환경의 실패 기록을 사용해 별도의 반성 자료를 추가한다 | 결과 자체와 다음에 참고할 교훈을 같은 사실로 덮어쓰지 않는다 |
| `ReactReflectAgent.run()` / `reflect()` | 실행과 반성 단계를 나누고 이전 시도의 자료를 다음 실행에 전달한다 | 비교·검토 결과가 다음 제안에 어떻게 이어지는지 근거를 남긴다 |

원문의 ALFWorld 예제는 그 환경에 맞는 종료 판정을 사용한다. JH에서는 도구 호출이 끝났거나 사용자가 후보를 선택했다는 이유만으로 목표 달성·사용 성공을 확정하지 않는다. 실행 완료 여부, 실제 관찰, 사용자의 평가, 검증의 출처는 각각의 입력으로 다룬다.

### 제외한 부분

ALFWorld·HotpotQA 실행 환경, 모델 호출, 자율 행동 반복, 전체 대화·추론 메모 저장, 실패 후 같은 실제 작업의 자동 재실행은 가져오지 않는다. 기존 JH의 승인·실행 결과 확인 규칙을 우회하는 용도로 반성 기록을 사용하지 않는다. 이 모듈에 남기는 것은 명시적인 목표·예상·관찰·짧은 설명과 원본 참조다.

## 3. DSPy: 예상과 결과를 평가 근거에 묶기

### 직접 읽은 파일

- [dspy/evaluate/evaluate.py](https://github.com/stanfordnlp/dspy/blob/25162c4fc05c2d2d019b0ffb5b6b2a9f315ec007/dspy/evaluate/evaluate.py)
- [dspy/teleprompt/bootstrap.py](https://github.com/stanfordnlp/dspy/blob/25162c4fc05c2d2d019b0ffb5b6b2a9f315ec007/dspy/teleprompt/bootstrap.py)

| 확인한 함수·구조 | 소스에서 확인한 동작 | JH에 참고하는 설계 |
| --- | --- | --- |
| `Evaluate.__call__()` | 주어진 예제에 대한 프로그램 결과를 만든 뒤 호출자가 준 metric으로 평가한다 | 비교 기준을 명시하고, 예상과 실제 결과를 같은 항목·단위·방향으로 비교한다 |
| `EvaluationResult` | 개별 `(example, prediction, score)` 결과와 집계를 함께 보관한다 | 개별 결정의 예상·실제·차이·출처를 남겨 요약 숫자만으로 판단하지 않는다 |
| `BootstrapFewShot._bootstrap_one_example()` | 실행 trace를 수집하고 metric·threshold 판정을 거친 자료를 후속 예시에 반영한다 | 평가 근거가 확인된 경험만 다음 판단의 근거로 연결한다 |
| 같은 함수의 예외 경로 | 실행·평가 실패를 처리하고 오류 횟수를 관리한다 | 자료를 얻지 못한 경우와 실제 결과가 기대에 못 미친 경우를 구분한다 |

DSPy의 예제·모델 예측 평가와 JH의 추천 예상·실사용 결과 비교는 서로 다른 작업이다. JH가 가져오는 것은 **무엇을 예상했고, 무엇을 관찰했으며, 어떤 기준으로 비교했는지 연결하는 구조**다. DSPy 평가기가 실제 사용자의 결과를 자동 측정하는 것은 아니다.

### 그대로 가져오지 않는 기본 동작

확인한 `_bootstrap_one_example()`에는 metric이 없으면 `success = True`로 처리하는 경로가 있다. JH는 이를 사용하지 않는다. 실제 결과나 비교 기준이 없으면 미확정으로 남긴다.

`Evaluate.__call__()`에는 실행 결과가 없을 때 `failure_score`를 채우는 경로가 있다. JH에서는 관찰 누락을 사용자의 불만족이나 추천의 실제 실패 점수로 바꾸지 않는다. 자료 없음·비교 불가능·확인된 차이를 구분한다.

### 제외한 부분

DSPy 프로그램 컴파일, 모델 호출, few-shot 예시 자동 학습, 프롬프트 최적화, fine-tuning, 평가 데이터셋과 서버를 설치하지 않는다. 이 모듈은 보관된 기록에 대한 비교와 제안 선별이며, 모델의 파라미터나 시스템 지시를 변경하지 않는다.

## 4. Timefold Quickstarts: 필요한 조건을 먼저 확인하고 부담·시점을 비교

### 직접 읽은 파일

- [TaskAssigningConstraintProvider.java](https://github.com/TimefoldAI/timefold-quickstarts/blob/76993a35123a127f9b630a8f7a37a1fbe76a24b0/use-cases/task-assigning/src/main/java/org/acme/taskassigning/solver/TaskAssigningConstraintProvider.java)
- [EmployeeSchedulingConstraintProvider.java](https://github.com/TimefoldAI/timefold-quickstarts/blob/76993a35123a127f9b630a8f7a37a1fbe76a24b0/use-cases/employee-scheduling/src/main/java/org/acme/employeescheduling/solver/EmployeeSchedulingConstraintProvider.java)

| 확인한 함수·구조 | 소스에서 확인한 동작 | JH에 참고하는 설계 |
| --- | --- | --- |
| `TaskAssigningConstraintProvider.defineConstraints()` | 필수 기술 조건, 미배정, 완료시간·우선순위를 서로 다른 단계로 구성한다 | 실행 가능한 조건과 제안의 매력도를 나누고, 점수가 좋아도 필수 조건을 무시하지 않는다 |
| `noMissingSkills()` | 필요한 기술이 없는 배정을 hard constraint로 다룬다 | 필요한 입력·근거·연결 조건이 부족한 제안을 채택된 것처럼 표시하지 않는다 |
| `minimizeMakespan()` | 직원별 종료시간을 부담에 반영한다 | 예상되는 이득만 보지 않고 사용자의 시간·작업 부담을 명시적으로 비교한다 |
| `criticalPriorityTaskEndTime()` / `majorPriorityTaskEndTime()` / `minorPriorityTaskEndTime()` | 중요도에 따라 완료시간에 다른 가중치를 준다 | 현재 목표와 시점이 제안 우선순위에 미치는 이유를 드러낸다 |
| `justifyWith()` 호출 | 제약별 점수 이유를 설명 자료에 연결한다 | 제안이 선택·보류·제외된 이유와 근거를 반환한다 |
| `EmployeeSchedulingConstraintProvider.unavailableEmployee()` | 일할 수 없는 날짜를 hard constraint로 다룬다 | 사용자가 허용하지 않은 시점이나 명시적 보류 상태를 점수로 덮지 않는다 |
| `desiredDayForEmployee()` / `undesiredDayForEmployee()` | 가능한 일정 중 선호·비선호 날짜를 soft 조건으로 반영한다 | 가능한 제안 안에서 현재 시점의 적합성을 따로 평가한다 |

이 예제는 직원 배정·근무표 문제를 푼다. JH의 개인 제안 알고리즘을 제공하는 프로젝트는 아니다. 참고 범위는 **필수 조건과 선호 점수의 분리, 시간 부담, 현재 우선도, 설명 가능한 선택 이유**다. 제안의 이득·부담·시점 값은 별도의 호스트 입력이며 실제 측정치와 예상을 구분한다.

### 제외한 부분

Timefold Java 런타임, 제약 풀이 엔진, 직원·근무표 도메인, 점수 가중치와 수식의 직접 복사를 제외한다. 직원 배정의 가중치를 개인 제안에 그대로 적용하지 않는다. JH의 간단한 후보 선별을 전역 최적해 탐색, 최적 일정 보장, 학습된 사용자 효용 모델로 표현하지 않는다.

## 5. JH에서 유지할 공통 경계

1. **목표와 조건은 당시의 기록이다.** 이후 목표가 바뀌어도 이전 추천의 이유를 새 목표로 덮어쓰지 않는다.
2. **예상과 실제를 구분한다.** 아직 해 보지 않은 제안을 사용 후 평가로 저장하지 않는다. 관찰값이 없으면 없다고 표현한다.
3. **같은 기준끼리 비교한다.** 단위·방향·대상·범위가 다르면 차이를 계산 가능한 것처럼 표시하지 않는다.
4. **비교 결과와 교훈은 다르다.** 관찰된 차이는 근거로 남기고, 다음 판단에 적용할 해석에는 적용 범위와 불확실성을 붙인다.
5. **현재 필요한 제안만 고른다.** 보류·부적합 시점·부족한 근거를 먼저 확인하고, 가능한 후보에서 이득·부담·시점의 이유를 설명한다.
6. **외부 자료는 근거다.** 읽은 문서가 상태 변경·도구 실행·개인 취향 변경을 승인하지 않는다.
7. **개인 기록은 비공개다.** Git에는 구현·공개 소스 문서·합성 테스트만 두고, 실제 목표·평가·원본 대화 참조는 비공개 상태에서 다룬다.
8. **기존 기능을 보존한다.** 개인화 1.21과 공개 자료 조사 1.20의 원본을 바꾸거나, 기존 메모리 용량 확대를 이 작업에 포함하지 않는다.

구현의 구체적인 API·상태 연결·선별 규칙·검증 범위는 [README.md](./README.md)와 런타임·테스트에 연결한다. 합성 예시와 테스트 결과를 사용자의 실제 경험이나 운영 적용 성공으로 보고하지 않는다.
