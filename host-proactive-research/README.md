# JH 대화 기반 조사·제안

사용자가 반복해서 묻거나 문제로 보고한 주제를 기억하고, 공개 자료를 조사해 근거와 함께 개선 후보를 제안하는 **호스트 측 모듈**이다. 새 JH 대화가 들어왔을 때 연결된 호스트가 실행한다. 별도 상시 프로세스나 예약 실행기는 포함하지 않는다.

기능의 핵심은 `runtime.js`의 순수 상태 전이와, 실제 검색·본문 읽기를 제공하는 호스트 어댑터다. CLI는 상태 파일을 안전하게 읽고 갱신한다. CLI 자체는 검색, 인터넷 접근, 코드 적용, 휴대전화 조작, 운영 서버 변경을 수행하지 않는다.

## 대화에서 동작하는 방식

예를 들어 사용자가 “중첩 화면에서 스크롤 대상을 자주 잘못 찾는데, 적용할 수 있는 오픈소스를 찾아줘”라고 요청하면 호스트가 다음 절차를 수행한다.

1. 대화에서 주제와 필요를 짧게 추출한다. 원문 대화 전체를 저장하지 않는다. 같은 목적의 “계속 진행”이나 상태 확인은 새로운 독립 질문으로 세지 않는다.
2. 최근 30일 동안 독립 질문 3회, 독립 문제 보고 2회, 또는 명시적인 조사 요청 1회를 만족하는 주제를 고른다. 주제 ID를 정규화하는 작업은 호스트가 맡는다. 런타임에는 의미 분석 모델이 들어 있지 않다.
3. 사용자가 보류·제외·해결 처리한 주제를 먼저 걸러 낸다. 만료 없는 보류는 사용자가 재개할 때까지 유지하며, 새 일반 질문만으로 자동 조사·제안 대상으로 되살리지 않는다.
4. 개인정보를 제거하고 호스트가 검토한 공개 검색어를 최대 2개 사용한다. 검색 결과 중 선택한 공개 HTTPS 자료를 최대 6개 읽는다. 검색어와 실제 읽은 자료를 실행 기록에 연결한다.
5. URL과 본문 지문을 이용해 중복을 줄인다. 호스트는 읽은 자료의 관련성, 적용 지점, 검증 방법, 한계를 검토한다. 근거를 읽었다는 사실과 사실 확인·실기기 검증이 끝났다는 주장을 구분한다.
6. 새로운 근거가 있는 개선 후보를 제시한다. 이미 제시한 같은 후보는 반복하지 않으며, 조사 실패는 완료로 꾸미지 않는다. 제안 전달 기록은 `handoff_attempted`, `readVerified: false`로 남긴다.

호스트가 연결되고 실행되었을 때 이 절차가 작동한다. 이 디렉터리의 코드가 있다는 사실만으로 모든 과거 대화를 수집하거나 현재 설치된 플러그인을 교체한 것은 아니다.

## 코드와 배포 경계

| 경로 | 역할 |
| --- | --- |
| `runtime.js` | 의존성 없는 JavaScript 상태 모델, 조사 계획, 어댑터 기반 수집, 근거·제안·전달 기록 |
| `cli.mjs` | Node.js 24용 명시적 파일 어댑터. JSON 입력, 파일 잠금, 원자적 교체, revision 충돌 보호 |
| `github-adapter.js` | 실제 GitHub 읽기 전용 검색·조회 응답을 수집 계약으로 정규화하는 휴대 가능한 호스트 어댑터 |
| `runtime.test.mjs` | 합성 자료를 이용한 정책·중복·재개·출처 검증 |
| `cli.test.mjs` | 임시 파일을 이용한 보존·소유자 격리·멱등·동시 쓰기·체크포인트 검증 |
| `SOURCES.md` | 조사한 OSS의 고정 커밋, 실제 파일·함수, 라이선스 차이, 적용·제외 이유 |
| `plugin-overlay/` | 이 기능을 추가하는 **1.20.0 증분 오버레이** |
| `../host-client-plugin-overlay/` | 기존 **1.19 감사 대상**. 이 기능의 소스 경계 밖이며 그대로 보존 |

`plugin-overlay/skills/jh-proactive-research/`에 호스트 실행 지침을 둔다. 배포용 `scripts/runtime.js`와 `scripts/cli.mjs`는 이 디렉터리의 원본을 그대로 복사한다. CLI의 `import './runtime.js'`가 유지되도록 두 파일을 같은 디렉터리에 배치한다. 기존 플러그인의 인증·승인·휴대전화 실행 규칙은 이 모듈이 대체하지 않는다.

## 상태의 보관

호스트가 관리하는 비공개 상태 파일의 이름은 **`JH_Proactive_Research_v1.json`**이다. 실제 대화 운영에서는 개인 Library의 해당 파일을 읽고, 유효성을 검사하고, 변경된 상태를 다시 저장하는 과정까지 호스트가 맡는다. CLI는 지정한 로컬 파일만 다루므로 CLI 실행 성공을 Library 업로드 성공으로 해석하면 안 된다.

상태와 대화·관심사 자료를 Git 저장소에 넣지 않는다. CLI에는 기본 저장 경로가 없고 `--store`에 절대 경로를 명시해야 한다. 상위 디렉터리는 미리 준비해야 한다. POSIX에서는 상태 파일을 소유자만 읽고 쓸 수 있는 `0600`으로 생성하며, 더 넓은 접근 권한을 가진 기존 파일은 거부한다. Windows에서는 상위 폴더의 사용자 접근 권한을 호스트가 관리한다.

`ownerScope`는 상태 소유자 식별자다. 다른 소유자 파일, 손상된 JSON, 알 수 없는 상태, 누락된 파일을 새 빈 상태로 덮지 않는다. 새 상태 생성은 `init` 명령으로만 가능하며, `init`도 기존 파일을 교체하지 않는다.

이 상태 파일은 기존 운영 서버 작업기억의 저장 용량·레코드 한도를 변경하지 않는다. 대화 주제와 조사 진행 상황을 관리하는 별도 상태다.

## CLI 실행

Node.js 24가 필요하다. `npm install` 없이 실행한다. 아래 절대 경로와 소유자 값은 실행 환경에 맞게 지정한다. JSON 예시에는 합성 데이터만 사용했다.

```sh
node host-proactive-research/cli.mjs --help
```

`init.json`:

```json
{"now":"2026-11-02T00:00:00.000Z"}
```

```sh
node host-proactive-research/cli.mjs init --store /absolute/private/JH_Proactive_Research_v1.json --owner synthetic-owner --input init.json
node host-proactive-research/cli.mjs validate --store /absolute/private/JH_Proactive_Research_v1.json --owner synthetic-owner
```

명령은 JSON 파일 또는 표준 입력으로 객체 하나를 받는다. `--input -`는 표준 입력을 명시한다. 파일 입력이 없으면 표준 입력을 읽고, 빈 입력은 `{}`로 처리한다. 성공은 JSON과 종료 코드 0, 실패는 오류 코드 JSON과 종료 코드 1로 반환한다. 오류 출력에 입력 원문이나 상태 전체를 붙이지 않는다.

| 명령 | 런타임 함수 | 입력의 핵심 | 상태 변경 |
| --- | --- | --- | --- |
| `init` | `createState` | `now`; 소유자는 `--owner` | 최초 생성 |
| `validate` | `validateState` | 빈 객체 | 없음 |
| `observe` | `observe` | `observationId`, `requestId`, `topicId`, `kind`, `publicQueries`, 근거 위치·시간 | 관찰 기록 |
| `decide` | `decideTopic` | `decisionId`, `topicId`, `status`, `reason`, `sourceRef`, `at`, 선택적 `until` | 보류·제외·해결·재개 |
| `plan` | `plan` | `at`, 선택적 `maxTopics` | 없음 |
| `begin` | `beginRun` | `runId`, `topicId`, `at` | 조사 시작 |
| `checkpoint` | `checkpointRun` | `checkpointId`, `runId`, `at`, `packet` | 수집 중간 결과 보존 |
| `complete` | `completeRun` | `runId`, `at`, `packet`, `review` | 조사 종료와 제안 후보 기록 |
| `notices` | `notices` | `at`, 선택적 `limit`, `maxChars` | 없음 |
| `ack` | `acknowledge` | `receiptId`, `proposalIds`, `at` | 제안 전달 시도 기록 |

`init` 외의 모든 변경 명령에는 현재 상태의 `expectedRevision`이 필요하다. 성공 응답의 `revision`을 후속 변경에 사용한다. 같은 이벤트 ID와 같은 내용으로 다시 보낸 요청은 처음의 `expectedRevision`을 유지해도 멱등 재시도로 처리한다. 같은 ID의 내용을 바꾸거나, 오래된 revision으로 새로운 이벤트를 쓰면 거부한다. 충돌 시 최신 상태를 읽고 기존 이벤트가 처리되었는지 확인한 뒤 다음 작업을 결정한다.

관찰 입력 예시 `observation.json`:

```json
{
  "expectedRevision": 0,
  "observationId": "synthetic-observation-1",
  "requestId": "synthetic-request-1",
  "sourceRef": "source:synthetic-user-request",
  "at": "2026-11-02T00:00:01.000Z",
  "topicId": "android.nested-scroll",
  "label": "중첩 화면 스크롤",
  "need": "원하는 중첩 스크롤 대상을 안정적으로 선택할 방법",
  "kind": "explicit",
  "publicQueries": ["Android accessibility nested scrolling official documentation"],
  "queryReviewed": true
}
```

```sh
node host-proactive-research/cli.mjs observe --store /absolute/private/JH_Proactive_Research_v1.json --owner synthetic-owner --input observation.json
```

`sourceRef`와 이벤트 ID는 실제 호스트가 추적할 수 있는 원본 요청에 연결한다. 예시 값을 실제 사용자 근거인 것처럼 재사용하지 않는다. `queryReviewed: true`는 검색어를 개인정보·비밀 값 없이 공개 검색해도 되는지 호스트가 검토한 뒤에만 지정한다.

## 실제 검색 어댑터와 재개

`collect`는 CLI 명령이 아니다. 실제 검색과 본문 읽기 도구를 가진 호스트가 SDK 함수를 호출한다.

```js
import './runtime.js';
const R = globalThis.JHProactiveResearch;

// run은 begin 응답의 실제 실행 기록이다.
// searchPublic와 fetchPublicSource는 연결된 읽기 전용 도구의 어댑터다.
const packet = await R.collect(run, {
  search: searchPublic,
  fetch: fetchPublicSource,
}, { resume: run.packet, timeoutMs: 15000, maxSources: 6 });
```

호스트 어댑터는 실제 검색 결과 URL과 실제 읽은 본문의 `url`, `title`, `text`, `retrievedAt`, `kind`를 반환한다. 어댑터가 받은 공개 검색어만 외부로 전송하고, 전체 대화나 상태를 외부 서비스에 보내지 않는다. 런타임의 URL 검사는 문자열 수준의 검사이므로 실제 네트워크 어댑터도 DNS 결과와 리디렉션의 목적지가 공개 주소인지 확인해야 한다.

수집 결과 `packet`은 `checkpoint`로 저장할 수 있다. 중단 후 같은 `begin` 이벤트를 재시도하면 저장된 실행의 현재 `run.packet`을 돌려준다. 이를 `collect`의 `resume`으로 주면 이미 성공한 단계를 재사용하고 실패한 작업만 다시 시도한다. 재개할 조사라면 `complete` 전에 체크포인트를 남긴다. 완료한 실행의 입력을 바꿔 다시 완료하는 방식은 허용하지 않는다.

자료 검토 `review`에는 관련성(`relevant`)을 명시한다. 제안으로 남길 경우 `summary`, `change`, `benefit`, `integration`, `validation`, `limitations`, 실제 읽은 `sourceIds`를 함께 제공한다. 효과를 측정하지 않았다면 예상 효과로 표현한다. 출처가 충돌하거나 최신성·라이선스가 불확실하면 그 한계를 기록한다. 조사 결과를 제안하는 단계와 사용자 시스템에 코드를 적용하는 단계는 각각의 실행 기록과 승인을 따른다.

## 파일 충돌과 복구 규칙

쓰기 명령은 같은 파일 옆의 `.lock` 파일을 배타적으로 생성한 후 최신 상태를 읽는다. 상태 전이의 revision 검사를 통과한 결과는 같은 디렉터리의 임시 파일에 기록하고 동기화한 다음 원자적으로 교체한다. 최초 생성은 기존 파일을 교체하지 않는 원자적 링크 생성으로 처리한다. 수정 직전 기존 파일 내용도 다시 비교한다.

정상 종료 시 자신의 잠금과 임시 파일을 정리한다. 정확히 같은 이벤트의 재시도는 파일을 다시 쓰지 않는다. 상태 파일의 심볼릭 링크와 다중 하드링크는 거부한다. 잠금을 사용하는 다른 CLI 프로세스와의 동시 쓰기는 직렬화하고, 오래된 새 변경은 revision 충돌로 거부한다.

비정상 종료로 `.lock`이 남으면 자동으로 빼앗지 않는다. 해당 쓰기 프로세스가 종료되었는지와 상태 파일의 무결성을 운영자가 확인한 뒤 잠금을 정리한다. 이 잠금은 협력하는 로컬 파일 작성자를 위한 것이며 원격 저장소의 동시 버전 제어를 대신하지 않는다. Library 저장 실패나 원격 버전 충돌은 호스트에서 처리하고, 저장되지 않은 단계를 완료로 보고하지 않는다.

## 참고한 오픈소스

| 프로젝트 | 적용한 설계 | 가져오지 않은 부분 |
| --- | --- | --- |
| GPT Researcher | 계획·수집·검토 분리, 이미 읽은 자료 재사용, 독립 자료 수집 | 전체 패키지, 무제한 재귀 조사, 실패를 빈 결과로 숨기는 처리 |
| LangGraph | 단계 상태, 안정된 실행 식별자, 체크포인트, 재개·멱등 | Python 실행기, 별도 DB·직렬화 계층, 새로운 상시 서비스 |
| Haystack | 문서 결합, 안정된 식별자에 의한 중복 제거, 결과 수 제한 | 임베딩·벡터 DB, 검색 점수를 근거 신뢰도로 간주하는 처리 |

고정 커밋과 실제 함수까지 확인한 기록은 [SOURCES.md](./SOURCES.md)에 있다. GPT Researcher는 조사한 동일 커밋에서 루트 라이선스와 패키지 메타데이터의 표기가 다르므로 해당 차이도 기록했다. 외부 구현 코드를 복사하지 않았고 이 기능을 위해 외부 패키지 의존성을 추가하지 않았다.

## 검증

```sh
node --test host-proactive-research/*.test.mjs
```

테스트는 합성 관찰·출처와 임시 디렉터리만 사용한다. 실제 검색, 사용자 메모리, 운영 API, 휴대전화 동작을 호출하지 않는다. 파일 테스트는 잘못된 초기화·소유자 혼합·경로 우회·중복 이벤트·오래된 쓰기·동시 쓰기·체크포인트 유실을 검증한다. 런타임 테스트는 반복 기준, 보류 유지, 수집 제한, 출처 검토, 중복 억제, 실패와 재개를 검증한다.

`.github/workflows/jhai-proactive-research.yml`은 이 디렉터리와 해당 워크플로우 변경에 한해 Node.js 24에서 같은 명령을 실행한다. 기존 워크플로우는 변경하지 않는다. 이 검증의 통과는 로컬 구현의 동작 근거이며, 실제 설치된 플러그인의 활성화나 실제 사용자 자료로 수행한 조사·기기 검증을 의미하지 않는다.
