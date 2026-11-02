# 공개 설계 참고와 적용 범위

2026-11-02 확인. 외부 코드를 복사하거나 의존성을 설치하지 않았습니다. 아래는 설계 참고이며 JH가 각 프로젝트의 성능을 달성했다는 근거가 아닙니다.

1. Reflexion — https://github.com/noahshinn/reflexion/blob/main/alfworld_runs/generate_reflections.py
   과거 행동/피드백과 다음 계획을 연결하는 접근. JH는 실제 사건과 원인 가설을 구분하며 자체 반성을 사실·개인 취향으로 승격하지 않습니다.
2. LangGraph — https://github.com/langchain-ai/docs/blob/main/src/oss/langgraph/persistence.mdx
   작업별 상태·체크포인트의 수명을 구분하는 접근. JH는 안정된 사건 ID, revision, 원자적 개인 저장과 정확한 재시도를 사용합니다. 전체 LangGraph 실행기는 설치하지 않습니다.
3. 기존 JH 1.23의 고정 검증 런타임
   `host-personalization/runtime.js`, `host-decision-learning/runtime.js`, `host-decision-learning/personalization-adapter.js`, `host-proactive-research/runtime.js`를 직접 연결합니다. 이득·부담 계산은 기존 JH 계약을 재사용하며 Timefold 엔진을 설치했다고 주장하지 않습니다. 이전 Mem0 참고 기록은 유지하되 이번 수정에서 Mem0 API를 사용하지 않습니다.

자료 해시와 인용은 같은 자료를 가리키는지 점검하기 위한 것입니다. 외부 자료의 사실성·대화 해석의 정확성·개인화 효과는 별도 검토가 필요합니다.
