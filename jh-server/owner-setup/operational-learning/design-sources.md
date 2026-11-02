# 경험 학습 보강에 참고한 원본과 적용 결정

2026-10-31 사용자가 제공한 후보를 공식 GitHub 소스와 기존 JH 구현에 대조했다. 아래 네 프로젝트의 설계 원리를 JH의 기존 Node 엔진에 맞게 구현했다. 외부 프로젝트 코드를 복사하거나 런타임 의존성을 추가하지 않았다. 기존 개인 owner 저장소, 승인·실행 경계와 v1 기억 파일을 유지한다.

| 참고 원본 | 확인한 설계 | JH에 반영한 부분 |
| --- | --- | --- |
| [LangMem README](https://github.com/langchain-ai/langmem/blob/839c3fa0fc2c118734611d5d86503e52fc3a3dd1/README.md), [기억 도구](https://github.com/langchain-ai/langmem/blob/839c3fa0fc2c118734611d5d86503e52fc3a3dd1/src/langmem/knowledge/tools.py) | 기존 저장소용 기본 함수, 기억 관리·범위별 검색, 영속 저장소 필요 | 사실·경험·절차 유형, 현재 작업 범위의 유효 교훈 조회, 개수·안내문 길이 제한, 실제 첫 동작 전 읽기 도구 |
| [ACE Curator](https://github.com/ace-agent/ace/blob/82709de050e1db6e6ef2f07bcb0393560b94992a/ace/core/curator.py) | 현재 playbook을 기준으로 후보 작성·집계 후 적용. 실제 적용은 ADD 중심 | 실제 사건/제안으로 검토 packet 생성 → 에이전트가 원인·수정·기대효과를 작성 → 후보 저장 → 별도 회귀검증. 기준 revision과 동일 후보 중복 확인 |
| [Graphiti EntityEdge](https://github.com/getzep/graphiti/blob/72b5c59c06607e09ea855be61b6ff5a3446fc951/graphiti_core/edges.py) | 근거 episode와 사실 유효 시점·무효화 시점의 구분 | 규칙 유효기간·출처·명시적 대체 관계·대체 이력, 미해결 충돌 보류. 대체 이후 만료/격리 시 옛 규칙 자동 부활 방지 |
| [promptfoo trajectory 검사](https://github.com/promptfoo/promptfoo/blob/5582f347bbc5359b201ce2d48c9c7fbebd8dcbd9/src/assertions/trajectory.ts) | 실제 trace에 대한 도구 사용·순서·인수·단계 수 검사 | 같은 도구의 중복 실행, 잘못된 대상, 순서 오류, 근거 없는 성공 주장 등을 부작용 없이 검사하는 native evaluator와 선택적 adapter |

LangMem의 Python/모델 호출 경로, Graphiti의 그래프 저장소, promptfoo 전체 실행기는 이번 런타임에 설치하지 않았다. Mem0는 향후 저장·검색 대안을 비교할 때, OPA는 기존 실행 전 정책을 별도 엔진으로 관리해야 할 구체적인 필요가 생길 때 검토한다. 기존 저장소와 승인 검사를 중복 구현하지 않는다.

## 적용 경계

- 이 보강은 기억과 행동 지침·검증의 개선이다. 모델 가중치 학습이나 유료 모델 호출을 자동 실행하지 않는다.
- 기록된 사건만 검토 packet에 넣는다. AI가 작성한 원인·해결·예상 효과는 `reviewed_inference`이며 사용자 확정 지시나 실제 성공으로 바꾸지 않는다.
- 회귀시험은 고정 JSON 또는 기록된 trace의 계약을 확인한다. 합성 fixture가 통과해도 실제 휴대폰·사이트·설치 성공을 의미하지 않는다.
- trace의 `host_verified` 표시는 수집자가 실제 근거를 확인하고 제공해야 한다. 평가기는 그 표시의 외부 진위를 독자적으로 인증하지 않는다.
- 원문 인증정보를 입력하지 않는다. 알려진 토큰 형식 거부는 실수 방지 장치이며 완전한 개인정보 탐지기를 대신하지 않는다.
- MCP 도구가 서버에 등록된 것, 현재 클라이언트 카탈로그에 노출된 것, 에이전트가 실행 전에 조회·적용한 것은 구분해 확인한다.
- 서버 도구 사건 저장소와 대화·스킬 기억 저장소의 자동 동기화는 여전히 별도 과제다. 같은 서버 owner의 여러 연결은 서버 기억을 공유한다.

## 2026-11-01 — 명시적 호스트 기억 연결의 추가 참고 원본

위 2026-10-31 기록은 당시의 적용 판단으로 보존한다. 이번에는 사용자의 오픈소스 참고·부족한 연결 구현 요청에 따라 LangGraph와 Mem0의 공식 원문을 아래 커밋으로 고정해 조사했다. 기존 `host-observations.mjs`와 owner 저장소에 연결하는 [host-memory-bridge.mjs](host-memory-bridge.mjs)를 JH의 Node 계약으로 작성하며 **외부 코드를 복사하거나 새 런타임 의존성을 추가하지 않았다.** 이 문서는 설계 출처이며 신규 기능의 CI·운영 배포·실기기 검증 완료를 뜻하지 않는다.

| 원본·라이선스 | 고정 소스 | 채택한 설계 원칙 | 도입하지 않은 구성 |
| --- | --- | --- | --- |
| LangGraph, MIT, `e5c961d7fbe7ca6fdd4c94c84d90511372514d55` | [BaseStore·Item·namespace 검증](https://github.com/langchain-ai/langgraph/blob/e5c961d7fbe7ca6fdd4c94c84d90511372514d55/libs/checkpoint/langgraph/store/base/__init__.py), [LICENSE](https://github.com/langchain-ai/langgraph/blob/e5c961d7fbe7ca6fdd4c94c84d90511372514d55/LICENSE) | 대화 thread와 독립된 장기 기억, namespace와 key의 분리, 읽기·쓰기 계약과 입력 범위 검사. JH는 기존 owner가 결정한 저장소 안에서 host 참조를 별도 task/attempt 이름 공간으로 해시하고 engine/context를 고정한다. | graph/checkpointer 전체, embedding·semantic search, prefix를 통한 owner 범위 확장, 원본 사건 upsert·삭제, 조회 시 TTL 갱신·자동 만료 삭제 |
| Mem0, Apache-2.0, `753496cf1435d76c3a711f3af51303f7fdcb6420` | [기억 추가·갱신·이력 호출](https://github.com/mem0ai/mem0/blob/753496cf1435d76c3a711f3af51303f7fdcb6420/mem0/memory/main.py), [history 저장·조회](https://github.com/mem0ai/mem0/blob/753496cf1435d76c3a711f3af51303f7fdcb6420/mem0/memory/storage.py), [삭제와 갱신 경합 수정](https://github.com/mem0ai/mem0/commit/753496cf1435d76c3a711f3af51303f7fdcb6420), [LICENSE](https://github.com/mem0ai/mem0/blob/753496cf1435d76c3a711f3af51303f7fdcb6420/LICENSE) | 현재 값과 변경 이력의 구별, 생성 후 identity 보존, 중복 억제, 없는 기록을 갱신으로 재생성하지 않는 원칙. JH는 기존 immutable 사건과 projection, stable observationRef, SHA-256, revision/CAS를 그대로 재사용한다. | LLM 자동 추출·판정, embedding·vector/entity store, raw 대화·화면 이력, 자동 기억 갱신·삭제, delete_all/reset, 외부 telemetry, MD5 텍스트 일치를 사건 동일성으로 사용 |

### 원문을 그대로 적용하지 않은 이유

- LangGraph의 namespace는 데이터 분류 수단이며 그 자체가 인증·접근 권한 증명은 아니다. JH에서는 기존 검증된 owner 설정이 파일과 소유자를 결정하고 새 도구 입력으로 바꾸지 못하게 한다. 일부 LangGraph TTL 구현의 읽기 시 갱신도 JH의 읽기 상태 불변 계약에는 적용하지 않는다.
- 조사한 Mem0 ADD 경로는 단일 LLM 추출과 ADD 중심 처리다. 현재 중복 검사는 검색된 기존 기억 top 10 및 같은 batch의 텍스트 해시를 비교하므로 저장소 전체의 동일 사건 중복 보장이 아니다. JH는 실제 관찰의 안정된 참조와 전체 입력 일치로 재전송을 판정한다.
- Mem0의 `infer=False` 경로도 embedding을 호출한다. 추론을 끄는 것만으로 외부 호출이 사라진다고 가정하지 않고, 이번 JH 연결은 외부 모델·embedding·추가 패키지 없이 동작하도록 작성한다.
- Mem0 변경 이력의 개념은 참고하되 원문 본문이나 private 데이터의 복제를 도입하지 않는다. JH 사건은 허용된 결과·범위·근거 참조만 보관한다. source 표시는 인증된 owner 호출자의 attestation이며 결과의 독립 검증이나 사용자 발화의 자동 수집 인증이 아니다.
- 새 경험은 활성 규칙과 분리해 반환한다. Library 과거 기억을 복사·자동 통합하지 않으며 `librarySync:not_connected`와 일반 대화 자동 수집 없음 표시를 유지한다. 기존 서버 도구 사건의 UNKNOWN을 host 관찰로 임의 정정하거나 원래 동작을 재실행하지 않는다.

참고한 계약을 JH에 맞게 좁혀 구현했으며 외부 프로젝트와의 API 호환성이나 그 프로젝트의 검증 결과를 승계한다고 주장하지 않는다. 새 경로의 source·회귀·CI·카탈로그·운영 활성화는 각각 실제 근거로 확인한다.
