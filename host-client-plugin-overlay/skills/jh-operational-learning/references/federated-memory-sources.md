# 호스트 기억 결합: 오픈소스 참고 근거

확인일: 2026-11-01
범위: 메모리아 개인 기록과 JHAI 운영 경험을 각각 조회하여 호스트의 판단에 함께 제공하는 연결.
상태: 설계 및 구현 근거다. 실제 조회·출시 결과는 별도 검증 기록에서 확인한다.
이번 참고 작업의 원문 코드 직접 복사: 0건. 신규 라이브러리 의존성 추가: 0건.

## 1. 고정한 공식 원문

### LlamaIndex

- 저장소: https://github.com/run-llama/llama_index
- 확인한 커밋: `619d74664e8404612038bc15a1a40c686037277c`
- 해당 커밋 날짜: 2026-10-14. 이후 변경되는 main 대신 아래 고정 원문을 기준으로 삼는다.
- 라이선스: MIT. 해당 커밋의 LICENSE 본문을 직접 확인했다.
- LICENSE: https://github.com/run-llama/llama_index/blob/619d74664e8404612038bc15a1a40c686037277c/LICENSE
- QueryFusionRetriever: https://github.com/run-llama/llama_index/blob/619d74664e8404612038bc15a1a40c686037277c/llama-index-core/llama_index/core/retrievers/fusion_retriever.py
- RouterRetriever: https://github.com/run-llama/llama_index/blob/619d74664e8404612038bc15a1a40c686037277c/llama-index-core/llama_index/core/retrievers/router_retriever.py
- 공식 안내: https://developers.llamaindex.ai/python/framework/module_guides/querying/retriever/retrievers/

QueryFusionRetriever는 여러 검색기의 결과를 모으고, node.hash를 기준으로 결과를 결합한다.
단순 결합은 높은 점수의 대표 노드를 남기며, 모든 중복 출처를 별도 배열로 보존하지 않는다.
RouterRetriever는 selector로 검색기를 선택하며, 복수 결과를 node_id 기준으로 합친다.
두 구현의 비동기 복수 조회는 기본 asyncio.gather를 사용하고 소스별 부분 실패 응답을 정의하지 않는다.
QueryFusionRetriever의 기본 검색어 수는 4이며 추가 검색어 생성에는 LLM을 사용한다.
생성자에서도 제공된 LLM 또는 Settings.llm을 사용하므로 클래스를 그대로 도입하지 않는다.

### Haystack

- 저장소: https://github.com/deepset-ai/haystack
- 확인한 커밋: `8e38c633190ee43b80c136b335f8c9d6c79cc5d6`
- 해당 커밋 날짜: 2026-10-30. 아래 고정 원문을 기준으로 삼는다.
- 라이선스: Apache License 2.0. 해당 커밋의 LICENSE 본문을 직접 확인했다.
- LICENSE: https://github.com/deepset-ai/haystack/blob/8e38c633190ee43b80c136b335f8c9d6c79cc5d6/LICENSE
- DocumentJoiner: https://github.com/deepset-ai/haystack/blob/8e38c633190ee43b80c136b335f8c9d6c79cc5d6/haystack/components/joiners/document_joiner.py
- 공식 API: https://docs.haystack.deepset.ai/reference/joiners-api
- 공식 개요: https://docs.haystack.deepset.ai/docs/documentjoiner

DocumentJoiner는 이미 조회된 문서 목록들을 입력받아 결합하며, 저장소 조회 자체를 수행하지 않는다.
고정 코드의 concatenate는 같은 doc.id 중 가장 높은 점수의 문서를 대표로 남긴다.
merge는 같은 doc.id의 가중 점수를 합산하며, 상위 조회 실패를 처리하는 계약은 제공하지 않는다.
개요 문서의 마지막 component 점수 설명보다 고정 코드와 API의 최고 점수 선택을 근거로 삼는다.

## 2. 채택한 설계

1. 각 저장소는 유지하고, 이름이 붙은 소스별 조회 결과를 호스트 단계에서 결합한다.
2. 메모리아와 JHAI의 조회 범위를 명시하며, 별도 LLM router 없이 필요한 소스를 결정한다.
3. 결과마다 source, 원본 recordId, refs, 조회 시각, 기록 유형을 유지한다.
4. 중복 키에는 소스 이름을 포함하여 서로 다른 저장소의 같은 ID를 별개로 취급한다.
5. 같은 내용을 표시상 묶을 때에도 모든 원본 참조와 출처를 보존한다.
6. 소스별 응답 상태와 생략 여부를 유지하고, 사용 가능한 결과와 부족한 근거를 함께 알린다.
7. 소스별 한도와 전체 반환 한도를 적용하되, 근거는 가능한 한 온전한 항목 단위로 반환한다.

검색 원문의 여러 검색기 구성과 문서 결합 원리를 참고하여 JH 계약에 맞는 얇은 계층을 직접 작성한다.
결합 위치는 사용자 요청을 해석하고 작업을 계획하는 호스트 단계이며, Android 실행 중간이 아니다.
개인 기록, 실행 경험, 활성 운영 교훈은 서로 다른 유형으로 유지한다.

## 3. 부분 실패는 자체 구현

참고 프로젝트의 결합 기능만으로 일부 소스 실패가 안전하게 처리된다고 간주하지 않는다.
소스별 success, empty, error, timeout, skipped에 해당하는 상태를 구분하는 계약을 마련한다.
성공한 빈 조회와 실패한 조회를 구분하고, 인증 실패나 시간 초과를 관련 기억 없음으로 바꾸지 않는다.
Promise.allSettled 또는 동등한 실패 격리 방식으로 성공한 소스의 결과를 보존하는 방식을 사용한다.
일부 소스가 실패하면 전체 결과가 불완전함을 표시하며, 실패한 소스를 추측으로 채우지 않는다.
조회 결합 계층은 자동 재시도, 원작업 재실행, 기억 쓰기, 기기 작업을 시작하지 않는다.

## 4. 채택하지 않는 범위

- LLM 검색어 생성, LLM router, embedding, 벡터 저장소, 새 프레임워크 의존성.
- 메모리아 개인 기록의 JHAI 자동 복사 및 JHAI 경험의 메모리아 자동 저장.
- 저장소 사이의 유사 문장 자동 병합 및 출처를 버리는 대표 항목 선택.
- 두 소스의 점수를 합치거나 RRF 순위를 신뢰도·규칙 활성화의 근거로 사용하는 동작.
- 검색 점수나 최신 시각만으로 충돌을 자동 해결하거나 실행 경험을 활성 교훈으로 승격하는 동작.

각 소스의 원래 순서와 유형을 우선 보존하며, 충돌하는 근거는 충돌 사실을 전달한다.
원문 코드 복사나 패키지 도입 없이 설계 원리만 참고한다.

## 5. 클라이언트 조회와 서버 인증의 경계

호스트 클라이언트가 메모리아를 조회했다는 사실은 JHAI 서버가 메모리아에 직접 인증했다는 뜻이 아니다.
ChatGPT의 메모리아 커넥터 인증과 JHAI native 서버의 메모리아 인증은 자동으로 공유되지 않는다.
클라이언트가 전달한 조회 결과는 그 전달 경로와 출처를 표시하며, 서버 직접 조회로 표현하지 않는다.
서버 직접 조회를 별도로 구성하려면 기존 read port가 요구하는 endpoint와 별도 인증 주입이 필요하다.
이 설계는 커넥터 토큰을 추출·복사·전달하거나 JHAI 기억 본문에 포함하는 경로를 추가하지 않는다.
메모리아 조회 사실, JHAI 인증 사실, 결합 결과의 근거 수준은 각각 구분하여 설명한다.
실제 호출·인증·배포·읽기 재확인 결과는 해당 실행의 별도 증거가 있을 때만 기록한다.
