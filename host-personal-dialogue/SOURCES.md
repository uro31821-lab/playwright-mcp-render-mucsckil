# 먼저 묻는 질문과 자발적 피드백: 공개 소스 참고 기록

확인일: **2026-11-02**.

이번 문서는 질문 초안·실제 질문·응답을 구분하고, 응답을 정확한 대화·대상·단계에 연결하는 데 필요한 공개 구현 두 개만 다룬다. 외부 코드를 복사하거나 패키지 의존성을 추가하지 않는다. 기존 조사·개인화 모듈의 출처를 이번 기능의 새로운 성능 근거로 재사용하지 않는다.

## 1. 확인한 고정 소스

| 프로젝트 | 고정 커밋 | 확인한 라이선스 |
| --- | --- | --- |
| LangGraph | `ee3c043bddcc514012885167dd5916b15d6e4731` | [MIT](https://github.com/langchain-ai/langgraph/blob/ee3c043bddcc514012885167dd5916b15d6e4731/LICENSE) |
| Rasa Open Source | `60a3cff9c08183760355b07bd60f5223d8916d6b` | [Apache-2.0](https://github.com/RasaHQ/rasa/blob/60a3cff9c08183760355b07bd60f5223d8916d6b/LICENSE.txt) |

확인 시점 공식 저장소 기본 브랜치의 커밋을 고정했다. 라이선스 설명은 위 저장소의 해당 파일 범위이며 별도 서비스·모델·상용 배포물의 약관까지 뜻하지 않는다.

## 2. LangGraph: 어떤 대기의 어떤 응답인지 명시

### 직접 읽은 파일

- [types.py](https://github.com/langchain-ai/langgraph/blob/ee3c043bddcc514012885167dd5916b15d6e4731/libs/langgraph/langgraph/types.py)
- [pregel/_loop.py](https://github.com/langchain-ai/langgraph/blob/ee3c043bddcc514012885167dd5916b15d6e4731/libs/langgraph/langgraph/pregel/_loop.py)
- [pregel/_algo.py](https://github.com/langchain-ai/langgraph/blob/ee3c043bddcc514012885167dd5916b15d6e4731/libs/langgraph/langgraph/pregel/_algo.py)
- [checkpoint README](https://github.com/langchain-ai/langgraph/blob/ee3c043bddcc514012885167dd5916b15d6e4731/libs/checkpoint/README.md)

| 확인한 함수·구조 | 실제 동작 | JH에 참고하는 설계 |
| --- | --- | --- |
| `Interrupt.id`, `Command.resume` | 대기 항목 ID와 응답 값을 연결할 수 있다 | 질문 ID를 가진 응답을 해당 질문에만 연결한다 |
| `PregelLoop._first()` | 여러 pending interrupt가 있을 때 ID 없는 단일 resume 값을 거부한다 | “네” 같은 응답을 임의의 질문에 붙이지 않고, 어느 질문인지 확인 가능한 문맥을 요구한다 |
| `_scratchpad()` | task별 기록과 namespace hash에 맞는 `resume_map` 값을 가져온다 | 다른 대화·대상·단계의 응답을 섞지 않는다 |
| `interrupt()`의 `response_schema` 처리 | 지원되는 타입 스키마로 응답을 검증하고 잘못된 입력을 거부하는 경로가 있다 | 응답의 형식·대상·상태를 검증한 후에만 기록한다 |
| checkpoint의 `thread_id`·`checkpoint_id` | 대화 흐름과 그 안의 저장 시점을 별도로 식별한다 | 소유자·대화·대상·질문을 안정된 ID와 사건 기록으로 구분한다 |

JH의 `thread/subject/phase` 결합은 이 모듈의 명시적 계약이다. LangGraph가 사용자 관심·선택·실사용 평가의 의미까지 판별해 준다는 뜻은 아니다. 자발적 피드백에는 존재하지 않는 질문 ID를 만들어 붙이지 않는다.

### 그대로 가져오지 않는 동작

LangGraph는 단일 응답 값이나 노드 내 호출 순서에 따른 재개도 지원한다. JH의 질문 응답 기록은 대상 질문과 대화 문맥을 명시적으로 검사한다. 또한 LangGraph의 노드 재개가 노드 처음부터 로직을 다시 실행할 수 있다는 설명을, JH의 실제 작업을 자동 재실행해도 된다는 근거로 사용하지 않는다.

확인한 `interrupt()`에서 JSON Schema `dict`는 사용자에게 스키마를 표시하지만 그 자체로 resume 값을 검증하지 않는 경로가 있다. JH는 스키마가 표시되었다는 이유로 검증이 끝났다고 처리하지 않고 자체 입력 검사를 수행한다.

LangGraph 런타임·checkpointer·Python 직렬화·그래프 실행기·외부 저장 서비스를 설치하지 않는다. 필요한 것은 대기와 응답의 정확한 연결 및 상태 보존 구조다.

## 3. Rasa: 현재 질문의 대상과 실제 질문 동작을 구분

### 직접 읽은 파일

- [rasa/core/actions/forms.py](https://github.com/RasaHQ/rasa/blob/60a3cff9c08183760355b07bd60f5223d8916d6b/rasa/core/actions/forms.py)
- [rasa/shared/core/trackers.py](https://github.com/RasaHQ/rasa/blob/60a3cff9c08183760355b07bd60f5223d8916d6b/rasa/shared/core/trackers.py)

| 확인한 함수·구조 | 실제 동작 | JH에 참고하는 설계 |
| --- | --- | --- |
| `FormAction.get_slot_to_fill()` | 현재 `active_loop`가 다른 form이면 이전 form의 `requested_slot`을 무시한다 | 주제·대상·단계가 바뀌었을 때 과거 질문을 현재 질문으로 재사용하지 않는다 |
| `request_next_slot()` / `_find_next_slot_to_request()` | 아직 필요한 항목을 찾고 요청할 항목과 질문 실행을 연결한다 | 현재 필요한 질문을 계획하되, 이미 답한 항목을 완료되지 않은 질문처럼 다루지 않는다 |
| `_ask_for_slot()` | 해당 질문 action을 찾아 실행한다. action이 없으면 빈 이벤트 목록을 반환하는 경로가 있다 | 질문을 계획한 것과 실제 질문 메시지를 제시한 것을 별도 상태로 둔다 |
| `DialogueStateTracker.from_events()` | `sender_id`로 지정된 대화에서 사건을 적용해 상태를 복원한다 | 소유자·대화별 기록을 복원하고 답변의 원본 위치를 남긴다 |
| `DialogueStateTracker.update()` | 사건을 추가하고 그 사건의 상태 변경을 적용한다 | 질문 제시·응답·자발적 피드백을 각각 근거 있는 사건으로 기록한다 |

요청할 slot을 정했다는 사실만으로 사용자에게 질문이 전달되었다고 볼 수는 없다. JH도 `draft`에서 `asked`로 바꾸는 사건과 실제 질문 메시지의 참조를 분리해 확인한다. `asked`는 호스트의 제시 기록이며 사용자가 읽거나 답했다는 증거를 대신하지 않는다.

### 제외한 부분

Rasa의 NLU 모델 훈련, intent·entity 추정, 정책 엔진, form 전체 스택, action 서버는 도입하지 않는다. 추출된 단어를 그대로 검증된 취향으로 저장하는 자동화도 추가하지 않는다. 이번 기능은 제한된 상태와 명시적인 연결 계약을 다룬다.

## 4. JH에 적용할 구분

| 구분 | 적용 원칙 |
| --- | --- |
| 질문 초안 | 사용자에게 아직 제시하지 않은 후보. 답변이 달릴 질문으로 확정하지 않는다 |
| 질문 제시 | 호스트가 실제로 제시한 메시지 참조와 함께 기록한다 |
| 질문에 대한 응답 | 질문 ID와 대화·대상·단계가 일치해야 한다 |
| 자발적 피드백 | 질문 없이 나온 평가도 해당 대상과 단계에 연결한다. 가짜 질문·제시 기록을 만들지 않는다 |
| 문맥상 질문 접기 | 호스트가 더 이상 현재 대화에 필요하지 않다고 판단한 이유를 별도로 남긴다. 사용자의 거절·불만·선호를 만들어 대신 기록하지 않는다 |
| 관심 표현 | 알고 싶거나 고려한다는 근거. 선택 완료와 구분한다 |
| 선택 | 선택했다는 근거. 실제로 사용했거나 만족했다는 뜻은 아니다 |
| 사용 후 평가 | 실제 사용 후 사용자가 알려 준 평가. 관심·시도 의향으로 대신 채우지 않는다 |
| 현재 이해 | 확인된 내용·미확정 내용·이번 작업에만 해당하는 조건을 구분해 조회한다 |

이 설계는 질문과 피드백의 출처를 정리하는 방식이다. 개인 전용 모델을 새로 훈련하거나, 대화만으로 사실·취향·만족도를 자동 검증하거나, 사용 효과가 개선되었다고 주장하지 않는다. 실제 개인 기록은 비공개 상태에 보관하며 공개 저장소에는 구현·공개 출처·합성 검증만 둔다.
