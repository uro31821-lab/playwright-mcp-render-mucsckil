# 능동 자료 조사·개선 제안: 공개 소스 참고 기록

조사일: **2026-11-02, 한국시간**.

이 문서는 반복 질문을 주제로 묶고 공개 자료를 조사해 제안하는 JH 호스트 모듈의 설계 출처를 설명한다. 아래 저장소의 실제 고정 소스와 라이선스를 읽고 필요한 구조를 선택했다. **외부 구현 코드를 복사하지 않았으며, 세 프로젝트를 실행 의존성으로 추가하지 않는다.** 구현 결과와 실행 검증은 이 모듈의 코드·테스트 및 별도 완료 기록으로 확인한다.

## 1. 확인한 고정 소스

| 프로젝트 | 확인한 commit | 라이선스 파일에서 확인한 내용 |
| --- | --- | --- |
| GPT Researcher | `3582a6841fe7dc801e2a34e34ee408641aea9bce` | 루트 LICENSE는 Apache-2.0. 같은 commit의 pyproject.toml은 MIT로 표시되어 불일치 |
| LangGraph | `d5b927ae4c054f8f7ec26b7e6e0965db6d7b371f` | MIT |
| Haystack | `8e38c633190ee43b80c136b335f8c9d6c79cc5d6` | Apache-2.0. 대상 DocumentJoiner 파일의 SPDX도 동일 |

위 commit은 조사 당시 각 공식 저장소의 `main`에서 확인한 고정 지점이다. 이후 `main`이 바뀌어도 이 문서의 참고 범위는 위 객체로 유지한다.

## 2. GPT Researcher: 조사 계획·수집·자료 검토의 분리

### 직접 읽은 원문

- [researcher.py](https://github.com/assafelovic/gpt-researcher/blob/3582a6841fe7dc801e2a34e34ee408641aea9bce/gpt_researcher/skills/researcher.py)
- [curator.py](https://github.com/assafelovic/gpt-researcher/blob/3582a6841fe7dc801e2a34e34ee408641aea9bce/gpt_researcher/skills/curator.py)
- [LICENSE](https://github.com/assafelovic/gpt-researcher/blob/3582a6841fe7dc801e2a34e34ee408641aea9bce/LICENSE)
- [pyproject.toml](https://github.com/assafelovic/gpt-researcher/blob/3582a6841fe7dc801e2a34e34ee408641aea9bce/pyproject.toml)

### 확인한 함수와 채택한 생각

| 원문 위치·구성 | 확인 내용 | JH에 참고하는 설계 |
| --- | --- | --- |
| `ResearchConductor.plan_research()` | 이미 얻은 최초 검색 결과를 다시 사용할 수 있게 입력을 받으며 조사할 하위 질의를 계획한다 | 주제 선택과 조사 계획을 구분하고, 같은 조사에서 확인한 근거를 재사용한다 |
| `ResearchConductor._get_context_by_web_search()` | 최초 검색 자료를 보존하고 하위 질의들을 병렬로 처리한다 | 제한된 질의를 독립 실행하되 자료별 출처와 부분 실패를 보존한다 |
| 같은 함수의 MCP cache와 lock | 같은 연구 과정의 MCP 수집 결과가 중복 생성되지 않도록 관리한다 | 안정된 조사 ID와 단계 결과를 사용해 완료된 조회를 불필요하게 반복하지 않는다 |
| `SourceCurator.curate_sources()` | 자료 수집과 관련성·신뢰성 평가 단계를 나눈다 | 자료를 모은 뒤 현재 JH와의 관련성, 이미 구현된 부분, 적용 조건을 별도로 검토한다 |

### 채택하지 않은 부분

GPT Researcher의 전체 Python 실행기, LLM 기반 질의 확장, 재귀 심층 조사, 새 외부 모델·검색 API 계정은 도입하지 않는다. JH 모듈은 현재 호스트가 제공하는 **읽기 전용 검색·원문 조회 콜백**을 사용한다. 초기 설계의 한 조사당 상한은 **검색 질의 2개, 원문 후보 6개**다. 호스트는 일반화한 검색어와 공개 자료만 전달한다.

원문 `_get_context_by_web_search()`에는 예외 후 빈 배열을 반환하는 경로가 있다. JH는 이 동작을 가져오지 않고 **검색 실패, 실제 검색 결과 없음, 일부 성공**을 구분한다.

원문 curator는 LLM 평가 결과에 검증을 뜻하는 로그를 사용하며, 평가가 실패하면 원래 자료를 반환한다. JH에서는 **검색에서 발견함 / 원문을 읽음 / 관련성을 검토함 / 외부 사실을 검증함**을 같은 의미로 취급하지 않는다. 제안에 근거가 연결됐다는 사실만으로 코드의 호환성·성능·현장 성공이 입증되지는 않는다.

### 라이선스 표기 불일치의 처리

고정 commit의 루트 LICENSE는 Apache-2.0이지만 `pyproject.toml`의 두 라이선스 표기는 MIT다. 이 문서는 둘 중 하나로 통일해 추정하지 않고 실제 불일치를 남긴다. 이번 구현에는 **GPT Researcher 코드의 직접 편입이나 패키지 재배포가 없으며, 조사 단계 분리라는 설계만 참고**한다. 향후 직접 편입 범위가 생기면 그때의 정확한 파일·배포물·라이선스를 다시 확인해야 한다.

## 3. LangGraph: 안정된 식별자와 중간 결과의 보존

### 직접 읽은 원문

- [checkpoint README](https://github.com/langchain-ai/langgraph/blob/d5b927ae4c054f8f7ec26b7e6e0965db6d7b371f/libs/checkpoint/README.md)
- [BaseCheckpointSaver](https://github.com/langchain-ai/langgraph/blob/d5b927ae4c054f8f7ec26b7e6e0965db6d7b371f/libs/checkpoint/langgraph/checkpoint/base/__init__.py)
- [LICENSE](https://github.com/langchain-ai/langgraph/blob/d5b927ae4c054f8f7ec26b7e6e0965db6d7b371f/LICENSE)

### 확인한 인터페이스와 채택한 생각

| 원문 위치·구성 | 확인 내용 | JH에 참고하는 설계 |
| --- | --- | --- |
| `CheckpointTuple` | checkpoint에 설정·메타데이터·pending writes를 연결한다 | 주제, 조사 실행, 결과, 제안의 식별자와 근거를 서로 연결한다 |
| `BaseCheckpointSaver.get_tuple()` | 정해진 thread/checkpoint의 저장 상태를 읽는 인터페이스다 | 기존 조사 상태와 영수증을 먼저 읽고 다음 미완료 단계만 선택한다 |
| `BaseCheckpointSaver.put()` | checkpoint와 메타데이터·버전을 저장한다 | 새 상태를 명시적으로 반환하고 호스트 저장 경로에서 버전 검사를 수행한다 |
| `BaseCheckpointSaver.put_writes()` 및 README의 pending writes | 완료한 중간 결과를 보존해 재개 시 성공 단계를 다시 실행하지 않도록 설계한다 | 검색·원문 조회의 성공과 실패를 따로 보존하고 중복 조사·중복 제안을 억제한다 |

JH 모듈은 주제·조사·제안에 안정된 ID를 사용하고, **보류·제외·해결됨**을 단순 계속 요청이나 반복 관찰로 해제하지 않는 상태 전이를 둔다. 명시적인 주제 재개 결정은 별도로 반영한다. 같은 입력의 재처리와 새로운 독립 질문을 구분한다. JSON 상태의 반환과 실제 영구 저장의 성공은 별도 근거로 확인한다.

### 채택하지 않은 부분

LangGraph 패키지·Python 런타임·임의 객체 역직렬화·별도 DB 설치를 추가하지 않는다. 원문의 상태 보존 개념을 참고하되 JH에는 제한된 JSON 데이터와 기존 호스트 저장 경로를 사용한다.

조사 재개는 **허용된 읽기 작업의 진행 상태 관리**다. 이 기능으로 기존 JH의 실행·승인·보안 저널을 열거나, 결과 미확정 휴대폰 동작을 다시 실행하거나, 일반 대화 전체를 자동 수집하지 않는다. 기존 기억 저장소의 용량 확장을 이 설계의 선행 조건으로 삼지 않는다.

## 4. Haystack: 자료 결합과 중복 관리

### 직접 읽은 원문

- [DocumentJoiner](https://github.com/deepset-ai/haystack/blob/8e38c633190ee43b80c136b335f8c9d6c79cc5d6/haystack/components/joiners/document_joiner.py)
- [LICENSE](https://github.com/deepset-ai/haystack/blob/8e38c633190ee43b80c136b335f8c9d6c79cc5d6/LICENSE)

### 확인한 함수와 채택한 생각

| 원문 위치·구성 | 확인 내용 | JH에 참고하는 설계 |
| --- | --- | --- |
| `DocumentJoiner.run()` | 여러 문서 목록을 결합하고 `top_k`로 반환량을 제한한다 | 검색 경로가 달라도 후보를 하나의 제한된 목록으로 검토한다 |
| `DocumentJoiner._concatenate()` | `doc.id`로 중복을 묶고 대표 문서를 선택한다 | 같은 원문을 여러 검색 결과에서 찾았다고 독립 근거 여러 건으로 세지 않는다 |
| `DocumentJoiner._merge()` | 같은 ID의 문서 점수를 결합한다 | 자료 identity와 표시 순서를 분리한다는 구조만 참고한다 |

JH는 URL과 원문 fingerprint를 이용해 근거를 식별하고 조회 시점·출처를 보존한다. 같은 URL의 내용이 바뀌면 자료의 변경 여부를 드러내며, 변경된 내용을 옛 자료와 같은 근거로 조용히 덮어쓰지 않는다. 새 자료와 이미 알린 자료를 구분해 같은 제안을 반복하지 않도록 한다.

### 채택하지 않은 부분

Haystack 패키지, 임베딩·벡터 DB, 검색 점수 결합은 도입하지 않는다. 검색 순위나 점수를 사실성·사용자 승인·실제 적용 성공으로 해석하지 않는다. 다른 공급자의 같은 제목이나 비슷한 문장을 같은 사건으로 임의 합치지 않는다.

## 5. JH 구현에 공통으로 적용할 기준

1. **입력은 관찰된 필요다.** 접근 가능한 사용자 질문에서 정리한 주제와 근거를 입력한다. 가상의 반복 횟수를 만들거나 같은 작업의 ‘계속’을 독립 질문으로 누적하지 않는다.
2. **관심과 보류를 함께 기억한다.** 사용자 보류·제외·해결 판단은 새 관찰보다 우선한다. 명시적인 재개 조건 없이 자동 해제하지 않는다.
3. **조사는 제한된 읽기다.** 검색·원문 조회는 호스트 콜백으로 수행하고 실제 호출량·실패·생략을 남긴다. 외부 자료의 본문은 명령이나 실행 승인으로 취급하지 않는다.
4. **제안에는 적용 위치와 근거가 필요하다.** 현재 JH에 이미 있는 기능, 추가할 부분, 기대 효과, 검증할 점을 구분한다. 참고 자료만 읽고 성능 향상·시간 절약·휴대폰 성공을 단정하지 않는다.
5. **저장과 알림은 확인된 상태를 따른다.** 같은 제안의 중복 표시를 막고, 내용이나 근거가 달라졌을 때 재검토한다. 저장 응답이 불명확하면 기존 영수증부터 확인한다.
6. **기존 기억 저장 한도는 유지한다.** 운영 작업 기억의 25MiB·사건·시도 한도와 실행 저널은 이 모듈에서 수정하지 않는다. 주제·조사 상태는 별도 계약으로 다룬다.

이 문서의 공개 프로젝트는 설계 참고 자료다. JH에 대한 완료 주장은 실제 구현·시험·게시본·조회 근거가 확인된 범위로 한정한다. 대화 밖의 예약 조사, 서비스 비용 변경, 모델 가중치 학습, 자동 운영 배포는 이 출처 참고만으로 활성화되지 않는다.
