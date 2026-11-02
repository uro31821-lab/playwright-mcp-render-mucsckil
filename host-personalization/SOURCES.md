# 상황·선택 이유·사용 후 평가를 위한 공개 소스 참고 기록

확인일: **2026-11-02**.

이 문서는 JH의 개인화 기능에 참고한 공식 저장소의 실제 코드와 지침을 고정 커밋으로 연결한다. 참고한 것은 기억의 범위, 변경 이력, 경험에 근거한 갱신 구조다. 외부 코드를 복사하거나 해당 패키지를 의존성으로 추가하지 않는다. **JH의 추천 점수 공식은 별도로 작성한 결정론적 규칙이며, 아래 프로젝트의 추천 학습 알고리즘을 가져온 것이 아니다.**

## 1. 확인한 저장소와 라이선스

| 프로젝트 | 확인한 고정 커밋 | 루트 라이선스 |
| --- | --- | --- |
| LangMem | `839c3fa0fc2c118734611d5d86503e52fc3a3dd1` | [MIT](https://github.com/langchain-ai/langmem/blob/839c3fa0fc2c118734611d5d86503e52fc3a3dd1/LICENSE) |
| Mem0 | `753496cf1435d76c3a711f3af51303f7fdcb6420` | [Apache-2.0](https://github.com/mem0ai/mem0/blob/753496cf1435d76c3a711f3af51303f7fdcb6420/LICENSE) |
| Letta Code | `3b7e3ffcf16d6ba4880f7a697261837000221320` | [Apache-2.0](https://github.com/letta-ai/letta-code/blob/3b7e3ffcf16d6ba4880f7a697261837000221320/LICENSE) |

이 커밋들은 확인 시점 각 공식 저장소의 기본 브랜치에서 얻은 값이다. 이후 브랜치가 바뀌어도 이 문서의 검토 대상은 위 커밋이다. 저장소 전체와 모든 하위 배포물의 라이선스가 같다고 확대 해석하지 않는다.

### Letta 저장소 이동 확인

`letta-ai/letta`의 [고정 README](https://github.com/letta-ai/letta/blob/8816d3a8516893bfdc0fa14bfb1235226012e295/README.md)는 현행 소스가 `letta-ai/letta-code`에 있다고 안내하며, 기존 V1 API 서버는 `archive` 브랜치의 과거 소스로 구분한다. 따라서 예전 서버 문서를 현재 구현으로 간주하지 않고 실제 현행 저장소를 확인했다.

## 2. LangMem: 기억의 범위와 근거가 있을 때의 갱신

### 직접 읽은 원문

- [knowledge/tools.py](https://github.com/langchain-ai/langmem/blob/839c3fa0fc2c118734611d5d86503e52fc3a3dd1/src/langmem/knowledge/tools.py)
- [dynamic namespaces 안내](https://github.com/langchain-ai/langmem/blob/839c3fa0fc2c118734611d5d86503e52fc3a3dd1/docs/docs/guides/dynamically_configure_namespaces.md)
- [사용자 프로필 안내](https://github.com/langchain-ai/langmem/blob/839c3fa0fc2c118734611d5d86503e52fc3a3dd1/docs/docs/guides/manage_user_profile.md)
- [prompts/gradient.py](https://github.com/langchain-ai/langmem/blob/839c3fa0fc2c118734611d5d86503e52fc3a3dd1/src/langmem/prompts/gradient.py)

| 확인한 함수·구조 | 실제 소스에서 확인한 동작 | JH에서 참고하는 부분 |
| --- | --- | --- |
| `create_manage_memory_tool()` | namespace를 런타임 값으로 구성하고, 갱신·삭제에는 대상 ID를 요구한다 | 소유자와 적용 영역을 구분하고, 정정 시 대상 기록을 명시한다 |
| `create_search_memory_tool()` | 지정한 namespace 안에서 조회하고 검색 제한을 전달한다 | 현재 상황에 맞는 범위의 선호만 조회·적용한다 |
| 프로필 안내의 명시적 스키마와 `enable_inserts=False` | 사용자 프로필을 구조화하고 기존 프로필을 갱신하는 예시를 제공한다 | 사실·가설·명시적 선호·선택·사용 후 평가를 서로 다른 구조로 표현한다. 이 구분 자체는 JH가 추가한 계약이다 |
| `GradientPromptOptimizer.invoke()` / `ainvoke()` | trajectory가 없거나 갱신 필요 판단이 거짓이면 기존 프롬프트를 그대로 반환한다 | 실제 선택·평가 근거가 없으면 개인화 순위를 바꾼 척하지 않는 원칙을 참고한다 |

LangMem의 namespace가 자동으로 상황의 의미를 이해하거나, 일시적 지시와 장기 취향을 판별해 주는 것은 아니다. JH에서는 소유자, 주제 영역, 상황 조건, 지속 범위를 별도 입력으로 다루고 검증한다. “설치 단계가 간단하면 좋겠다”는 근거를 “항상 짧은 답변을 좋아한다”로 변환하지 않는다.

### 제외한 부분

LangMem 전체 런타임, LangGraph 저장소, 임베딩, LLM에 의한 자동 프로필 추출과 프롬프트 재작성은 도입하지 않는다. 사용자 프로필 안내에는 대화로부터 정보를 추출·추정하는 예시가 있지만, JH는 확인되지 않은 내용을 사실이나 장기 취향으로 승격하지 않는다. GradientPromptOptimizer는 **프롬프트 최적화 구현**이므로 이를 추천 후보의 점수 계산 구현으로 소개하지 않는다.

## 3. Mem0: 소유 범위 보호와 정정 이력

### 직접 읽은 원문

- [memory/main.py](https://github.com/mem0ai/mem0/blob/753496cf1435d76c3a711f3af51303f7fdcb6420/mem0/memory/main.py)
- [memory/storage.py](https://github.com/mem0ai/mem0/blob/753496cf1435d76c3a711f3af51303f7fdcb6420/mem0/memory/storage.py)
- [Platform feedback 안내](https://github.com/mem0ai/mem0/blob/753496cf1435d76c3a711f3af51303f7fdcb6420/docs/platform/features/feedback-mechanism.mdx)

| 확인한 함수·구조 | 실제 소스에서 확인한 동작 | JH에서 참고하는 부분 |
| --- | --- | --- |
| `_build_filters_and_metadata()` | `user_id`, `agent_id`, `run_id`에 따라 저장·조회 범위를 구성하며 식별자 없는 입력을 거부한다 | 개인화 상태를 소유자별로 분리하고, 임의 메타데이터로 소유 범위를 바꾸지 못하게 한다 |
| `_strip_identity_keys()` | 자유 형식 메타데이터로 식별 범위를 변경하지 못하게 한다 | 상태 소유자와 현재 상황을 권위 있는 입력에서만 결정한다 |
| `Memory._update_memory()` | 기존 내용을 읽고 갱신하며, 기존 레코드가 없거나 갱신 결과가 실패이면 오류를 내는 경로가 있다 | 정정 대상을 확인하고, 갱신 실패를 새로운 기억 생성으로 해석하지 않는 구조를 참고한다 |
| `SQLiteManager.add_history()` / `get_history()` | 이전 값, 새 값, 이벤트, 시간, 행위자, 삭제 여부를 기록·조회한다 | 무엇이 어떤 근거로 바뀌었는지 추적하고, 정정 전 판단이 현재 추천에 남지 않도록 한다 |

JH는 사실이나 선호를 단순히 마지막 문자열로 덮지 않고, 원본 요청의 위치와 선택 이유·평가·정정 사이의 연결을 보존한다. 다만 Mem0의 SQL 스키마나 데이터베이스 코드를 복사하지 않고 제한된 JSON 상태와 명시적 revision을 사용한다.

### Feedback 문서의 경계

확인한 feedback 안내는 API 키가 필요한 **Platform `MemoryClient.feedback()`** 사용법이다. 긍정·부정 피드백과 이유를 기억 ID에 연결하는 인터페이스는 참고할 수 있지만, 그 문서만으로 서버 내부의 학습·순위 알고리즘이 공개 OSS로 제공된다고 말할 수 없다.

JH는 이 API를 호출하지 않으며, 문서의 성능 향상 표현을 JH의 검증 결과로 가져오지 않는다. JH가 받은 사용 후 평가는 명시적인 후보·상황·평가 근거에 연결하고, 공개된 자체 규칙으로 다음 순위에 반영한다. 선택했다는 기록과 실제 사용 후 만족했다는 기록은 다르게 취급한다.

### 제외한 부분

외부 서비스 계정, vector store, graph memory, LLM 추출, 자동 메시지 저장, 대화 전체 전송을 추가하지 않는다. Mem0의 저장·검색 기능 전체를 설치하는 것은 현재 필요한 소유 범위·정정·평가 기록보다 큰 운영 범위를 만들기 때문이다.

## 4. Letta Code: 대화의 일시 선택과 장기 기억을 분리

### 직접 읽은 원문

- [types/client-preferences.ts](https://github.com/letta-ai/letta-code/blob/3b7e3ffcf16d6ba4880f7a697261837000221320/src/types/client-preferences.ts)
- [tui-client-preferences.ts](https://github.com/letta-ai/letta-code/blob/3b7e3ffcf16d6ba4880f7a697261837000221320/src/cli/helpers/tui-client-preferences.ts)
- [maintaining-core-memory 지침](https://github.com/letta-ai/letta-code/blob/3b7e3ffcf16d6ba4880f7a697261837000221320/src/skills/builtin/maintaining-core-memory/SKILL.md)
- [memory-conflict-repair.ts](https://github.com/letta-ai/letta-code/blob/3b7e3ffcf16d6ba4880f7a697261837000221320/src/agent/memory-conflict-repair.ts)

| 확인한 함수·구조 | 실제 소스에서 확인한 동작 | JH에서 참고하는 부분 |
| --- | --- | --- |
| `ClientPreferences` | 한 대화에 기억되는 클라이언트 선택의 타입을 명시한다 | 현재 상황의 요구와 장기 선호를 별개로 관리한다 |
| `tuiSubmitClientPreferences()` / `tuiQueuedClientPreferences()` | 사용자 입력과 자동 계속 실행의 출처에 따라 일시적 UI 선택의 유지·초기화를 구분한다 | 단순 계속 진행을 새 선호 확인이나 독립 선택으로 누적하지 않는다 |
| core-memory 지침의 갱신 기준 | 단일 모호한 사건보다 반복 패턴이나 명시적 지시를 근거로 갱신하도록 설명한다 | 한 번의 선택, 미확정 가설, 예시를 고정된 성격·취향으로 바꾸지 않는다 |
| core-memory 지침의 변경 출처 | 변경 이유와 다시 찾을 수 있는 원본 사건 위치를 기록하도록 설명한다 | 선호를 추천에 적용한 이유와 근거 ID를 추적할 수 있게 한다 |
| `claimMemoryConflictRepair()` / `completeMemoryConflictRepair()` | 시도 토큰을 비교해 늦게 끝난 작업이 더 새로운 기록을 덮지 않도록 한다 | 정정·평가 이벤트의 안정된 ID와 revision 검사로 오래된 변경을 차단한다 |

`ClientPreferences`의 실제 대상은 도구 집합과 UI 선택이며 사용자 취향 모델 자체는 아니다. JH는 **수명이 다른 선택을 같은 기억으로 취급하지 않는 구조**만 참고한다. Letta의 core-memory 문서는 실행 코드와 다른 지침 자료이므로 그 구분도 유지한다.

### JH에서 다르게 처리하는 부분

Letta 지침은 간결한 기억 본문과 Git 커밋의 출처 기록을 나눈다. JH는 사용자의 사적 대화·선택 이유를 공개 개발 저장소나 커밋에 기록하지 않는다. 출처와 정정 이력은 비공개 개인화 상태에 두고, Git에는 구현·합성 테스트·공개 출처 문서만 둔다.

Letta의 전체 에이전트 실행기, memory filesystem, Git 동기화, 자동 회고 작업, 메모리 한도 정책은 가져오지 않는다. 기존 JH 저장 용량 확대도 이 기능의 선행 조건으로 삼지 않는다.

## 5. JH 구현에 연결하는 기준

| 구분 | 기록·적용 원칙 |
| --- | --- |
| 현재 상황 | 이번 추천의 목표·중요 조건으로 사용한다. 단지 현재 지시라는 이유로 장기 선호를 생성하지 않는다 |
| 명시적 선호 | 사용자가 밝힌 내용과 적용 범위·출처를 함께 보존한다. 다른 분야의 선호로 확대하지 않는다 |
| 가설·미확정 정보 | 미확정 상태를 유지한다. 사실·검증된 취향·평가 데이터로 점수화하지 않는다 |
| 선택과 이유 | 당시 후보와 선택 이유를 연결한다. 선택은 사용 완료나 만족을 의미하지 않는다 |
| 사용 후 평가 | 사용자가 알려 준 실제 사용 후 평가를 선택 기록에 연결한다. 독립적 실기기 검증으로 오해하지 않으며, 명시적 기준 변경에 한해 다음 추천에 반영한다 |
| 정정·미확정 전환 | 이전 근거와의 관계를 보존하고 현재 확정 기준에서 제외한다. 오래된 이벤트의 재전송으로 과거 판단을 되살리지 않는다 |
| 추천 결과 | 현재 조건과 관련 근거가 순위에 미친 영향을 설명한다. 근거 없음·동률·미확정을 숨기지 않는다 |

직업, 피자, 카비서 같은 설명용 예시는 검증된 개인 사실이 아니다. 이 문서나 합성 테스트의 예시도 사용자의 실제 프로필을 만드는 입력으로 사용하지 않는다. 현재 구현의 API, 순위 계산, 검증 범위는 [README.md](./README.md) 및 해당 런타임·테스트에서 확인한다.
