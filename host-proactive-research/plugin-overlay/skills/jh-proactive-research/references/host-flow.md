# 호스트 연결과 복구 계약

## 실행 환경

- 이 기능은 호스트가 현재 관찰한 대화를 처리하는 모듈이다. 서버 daemon이나 휴대폰 서비스가 아니다.
- 동봉 `scripts/runtime.js`는 추가 패키지 없이 `globalThis.JHProactiveResearch`를 정의한다. `scripts/cli.mjs`는 Node.js 24에서 개인 JSON 파일을 읽고 원자적으로 저장한다.
- 코드 실행 환경에서 현재 스킬의 해당 resource를 끝까지 읽고 [runtime-source.json](runtime-source.json)의 SHA-256을 대조한다. 검토된 동봉 코드만 평가한다. 웹 자료나 상태 파일의 텍스트를 코드로 평가하지 않는다.
- functions의 제한된 V8 환경에서는 검토한 동봉 텍스트를 `new Function(runtimeSource)()`로 설치할 수 있다. 도구는 현재 카탈로그에서 찾은 실제 읽기 전용 검색·조회 함수만 callback으로 주입한다. Node의 `require`, 파일 API, 전역 fetch는 코어에 필요하지 않다.

## 상태와 신원

[연결 설정](state-binding.json)의 정확한 파일명을 현재 Library 검색으로 확인한다. 한 파일이면 반환된 ID·버전으로 읽고 같은 항목에 저장한다. 관련 실패·중복 후보가 없다는 것이 확인된 최초 생성 때만 `createState({ownerScope,now})`를 사용한다. 기존 기억을 찾지 못했다는 도구 오류를 새 파일 생성 사유로 삼지 않는다.

`ownerScope` 일치는 파일 혼용을 막는 검증이며 사용자 인증 증명은 아니다. 인증된 개인 저장소의 접근 제어가 파일 권한을 담당한다. 개인 상태·자료 조회 결과·작업 승인·계정 식별값을 공개 GitHub나 공유 플러그인 소스에 넣지 않는다.

| 식별자 | 유지 범위 |
| --- | --- |
| topicId | 같은 필요·문제. 표현이 달라져도 의미가 같으면 기존 ID |
| requestId | 사용자 목표 하나. 계속·재시도·상태 조회는 기존 ID |
| observationId | 실제 새 관찰 하나. 재전송은 원래 payload·시각 유지 |
| decisionId | 실제 보류·재개·거절·해결 결정 하나 |
| runId | 같은 조사 시도. 일부 실패·중단 복구에 재사용 |
| checkpointId | 완료된 수집 packet 저장 시점 하나 |
| receiptId | 제안을 응답으로 넘기는 전달 시점 하나. 실제 열람 증명이 아님 |

ID를 플랫폼의 실제 메시지 ID라고 꾸미지 않는다. 메시지 ID가 없으면 호스트가 만든 불투명 참조임을 유지하고 현재 체크포인트와 같은 파일에서 재사용한다. 사용자 원문의 발화 시각을 모르면 실제 관찰 시각을 쓰고 원문 시각처럼 표시하지 않는다.

## 최소 연결

모든 mutation은 `{state,result}`를 반환한다. 원본 상태를 직접 편집하지 않는다. `expectedRevision`은 최신 상태에서, 시각은 실제 관찰·실행에서 얻는다.

```js
// 실제 사용자 요청에서 검토한 값만 사용한다. 예시를 실제 관찰로 저장하지 않는다.
const R = globalThis.JHProactiveResearch;
R.validateState(state);
const observed = R.observe(state, observationPayload);
state = observed.state;
const plan = R.plan(state, { at: actualNow, maxTopics: 1 });
if (plan.topics.length) {
  const started = R.beginRun(state, beginPayload);
  state = started.state;
  // 같은 Library 파일에 먼저 저장한 뒤 실제 읽기 전용 조사 시작
  const run = started.result.run;
  const packet = await R.collect(run, { search, fetch }, {
    timeoutMs: 15000,
    maxSources: 6,
    ...(run.packet ? { resume: run.packet } : {})
  });
  const saved = R.checkpointRun(state, {
    expectedRevision: state.revision,
    checkpointId: actualCheckpointId,
    runId: run.runId,
    at: actualCollectionEnd,
    packet
  });
  state = saved.state;
  // 이 상태를 저장한 후 부분 결과를 검토하거나 실패 단계만 재개
}
```

조회형 `plan/notices`는 상태를 바꾸지 않는다. `validateState`가 실패하면 손상을 설명하고 기존 파일을 보존한다. 한도 초과에서도 오래된 기록을 몰래 지우거나 새 빈 파일로 대체하지 않는다.

## 공개 검색 callback

`search({query,limit})`는 실제 도구 응답에서 얻은 `[{url,title}]`를 반환한다. `fetch({url})`는 실제 조회에서 얻은 `{url,title,text,retrievedAt,kind}`를 반환한다. `kind`는 `official/source/paper/other` 중 실제 출처에 맞게 분류한다.

GitHub 조사에는 동봉 `scripts/github-adapter.js`의 `JHProactiveGitHub.create({search,fetch,scopes})`를 재사용한다. `search/fetch`에는 현재 카탈로그에서 실제 확인한 GitHub 도구를 주입하고, `scopes`에는 이번 공개 검색어를 키로 공개 `owner/repository` 문자열 또는 배열을 값으로 전달한다. 이 adapter는 실제 구조화 응답을 정규화하며 출처 URL이 달라지거나 응답 형태가 맞지 않으면 오류로 남긴다. 전체 응답이 16,000자를 넘으면 전달 본문을 그 길이의 발췌로 제한하고 제목에도 발췌임을 표시한다. 검색에서 실제 나온 blob URL만 사용한다.

- 일반 웹 검색은 현재 제공된 웹 검색 도구를 사용한다. 기술 근거는 공식 문서·저장소·논문을 우선한다.
- GitHub 파일 조사에는 현재 GitHub `search`의 `query/repository_name/topn`과 `fetch` 또는 `fetch_file`의 실제 계약을 사용할 수 있다. source repository 범위는 공개 검색어·작업 목적과 함께 호스트가 보존한다.
- 구조화된 응답이 있으면 먼저 사용한다. 여러 겹의 `structuredContent/result`는 실제 응답 구조를 확인해 풀고, 텍스트뿐이면 현재 형식에서 명시된 URL·제목만 추출한다. 임의 검색문·추측 URL로 응답을 채우지 않는다.
- 도구 오류·인증 실패·형식 불일치·원문 미반환은 예외로 넘겨 packet 오류에 남긴다. 빈 목록으로 바꾸지 않는다.
- `fetch`에 넘기는 URL은 이번 run의 실제 검색 결과여야 한다. 다른 URL로 바뀐 응답을 원래 URL로 재표시하지 않는다. GitHub raw/blob 같은 표현 차이도 호스트가 실제 응답을 검토해 동일 파일임을 확인한 경우에만 정규화하고 원래 조회 증거를 남긴다.
- `text`에는 실제로 읽은 내용만 넣는다. 도구가 제공한 본문 일부라면 제목·요약 검토에 발췌 범위를 표시한다. 런타임이 저장하는 `excerpt`와 해시는 전달받은 제한된 텍스트의 추적 근거이며, 전체 웹사이트 읽기나 사실 인증이 아니다.
- IP·localhost·사설 호스트·자격증명 포함 URL을 거절하는 코어 검사는 DNS나 리다이렉트를 검증하는 네트워크 방화벽이 아니다. 실제 callback은 도구의 허용 대상·인증·접근 제한을 유지하고 임의 raw HTTP 클라이언트로 대체하지 않는다.
- 제한된 시간 초과는 기다리기를 중단한다는 뜻이다. 이미 호출된 외부 읽기를 취소했다고 단정하지 않는다.

검색어를 만들 때 개인 이름·회사 내부 사안·원문 대화·계정·토큰·파일 ID를 제거한다. 런타임의 문자/패턴 검사는 보조 장치이며 의미상 개인정보 판정을 대신하지 않는다. 입력 `need`를 그대로 검색어로 보내지 않는다.

## 중단과 부분 실패

`beginRun`을 성공한 뒤 응답이 유실되면 같은 run ID·원래 payload로 다시 읽는다. 기존 진행 상태를 새 조사로 만들지 않는다. `checkpointRun`으로 저장한 packet은 `state.runs[runId].packet`에서 복구하며 다음 `collect`의 `resume`에 전달한다. 성공한 검색·조회는 재사용하고 실패 단계만 다시 시도한다.

checkpoint 전에 호스트가 종료되면 아직 저장하지 못한 읽기 작업이 다시 실행될 수 있다. 매 도구 호출을 정확히 한 번만 실행한다는 보장은 하지 않는다. 진행 중 사용자가 보류하면 최신 상태에 결정부터 저장하고 제안을 완료하지 않는다. 다른 방의 결정을 놓치지 않도록 긴 수집 뒤 완료 직전에 최신 Library 버전을 확인하고 현재 상태와 대조한다.

완료를 확정할 때만 `completeRun`을 사용한다. 완료 packet·review는 변경하지 않는다. 다른 내용을 같은 완료 ID로 덮지 말고 실제 새 요청·새 run으로 처리한다. 관련 자료가 없거나 한계가 크면 `relevant:false`와 그 이유를 보존하고 억지로 제안을 만들지 않는다.

## 검토와 전달

`review`는 `relevant, summary, change, benefit, integration, validation, limitations, sourceIds`를 포함한다. `sourceIds`는 packet에서 실제 조회된 자료 ID만 참조한다. “검증됨/성공/자동 개선” 같은 별도 플래그를 만들어 권위를 올리지 않는다.

새 제안이 적합하면 `notices`에서 출력하고, 응답으로 넘기는 시점의 `acknowledge`를 같은 상태에 저장한다. 전달 기록은 사용자의 읽음·승인·실행 증명이 아니므로 화면 읽음을 추정하지 않는다. 저장과 대화 전달은 하나의 원자적 거래가 아니다. 결과가 불명확하면 기존 receipt와 대화 체크포인트를 대조하고 자동으로 새 receipt를 생성하지 않는다.

적용이 요청된 개선은 `jh-dev-toolkit`의 소스 확인·관련 검사·배포 준비 절차를 따른다. 실제 구현 결과는 기존 `jh-operational-learning` 경로에서 한 번 기록한다. 이 주제 파일은 그 사건의 두 번째 성공 기록을 만드는 용도가 아니다.

## 현재 보장 범위

합성 테스트는 정책과 오류 처리를 확인한다. 실제 도구 조회·개인 파일 저장·플러그인 게시에는 각 단계의 실제 응답이 필요하다. 현재 대화에서 코드가 동작한 사실, 개인 플러그인 새 버전이 저장된 사실, 과거 방에 새 지침이 로드된 사실은 서로 구분한다.
