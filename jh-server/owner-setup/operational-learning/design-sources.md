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
