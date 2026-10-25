# JH167 분할화면 완료 응답 개선

기준: `uro31821-lab/playwright-mcp-render-mucsckil`,
운영 브랜치 `jh-fix3-secure-server`, 기준 커밋
`4fe398595f172f0e5a94a17992ca4d0bfb5da787`.

## 문제와 변경

기존 웹 열기는 같은 Android 작업의 응답을 22초 기다린다.
검토한 JH167-R5 Android 소스의 화면 열기 대기만 최대 20초이며,
명령 폴링·완료 업로드 시간이 추가된다. 따라서 실행이 끝나도 최초 MCP
응답에 완료 보고가 없을 수 있다. 이번 사용자의 유튜브 실행 건은
원본 작업번호·완료 로그를 확보하지 못했으므로 정확한 사고 원인은 미확정이다.

- 기존 작업의 서명된 완료 응답을 최대 40초 기다린다. 빠른 응답은 즉시 반환한다.
- 미수신은 `OPEN_COMPLETION_PENDING` / `PENDING` / `actionSucceeded:null`로 반환한다.
- 같은 `job_id`·`command_id`를 사용하는 읽기 전용 `life_job_status` 후속 호출을 반환한다.
  이 도구는 해당 열기 작업에 한해 추가 최대 10초 기다린다. 새 명령·재실행을 하지 않는다.
- 기존 job status 필드와 중첩 job 응답을 보존하고 완료 수신·실행 확인을 별도 필드로 제공한다.
- 정확한 작업·명령·기기·Secure 세션, 요청 URL과 결과 URL, 실행 이후의 오른쪽 Chrome
  분할창 증거가 맞을 때만 주소 열기를 확인한다. 페이지 콘텐츠 확인은 별도이다.
- 완료 기록은 그 시점의 결과이며, 나중의 조회가 현재 화면을 재확인한 것은 아니다.
- 응답 없는 실행·불명 상태는 실패나 성공으로 바꾸지 않는다. 서명 없는 결과와 바뀐 작업은 확인하지 않는다.

## 범위

신규 모듈 `jh167-open-completion.mjs`를 기존 운영 조립부 마지막에 연결한다.
기존 운영 조립부의 변경은 import 1개와 마지막 반환식 1개이다.
기존 `life_open_service` 및 이를 공유하는 열기 별칭과 `life_job_status`에 적용한다.
도구 이름·입력 스키마·프로토콜 1.0·서명·OAuth·승인·중복 방지·영속 장부는 변경하지 않는다.
완료 HTTP 재전송, 기기 자동 실행, 새 세션 바인딩, Playwright 화면 연결은 이 변경에 포함되지 않는다.
Android 소스와 APK는 변경하지 않았고 재설치가 필요 없는 서버 패치다.

## 검증

2026-10-25 Node 24.22.1, 로컬 검사:

- 새 완료 상태·상관관계·운영 콜백 검사 27개 통과.
- 실제 운영용 코드 조립·문법·listen 없는 import 검사 2개 통과.
- 기존 라우팅·연결·읽기 대기·보안 만료·영속 수신 검사 51개 통과.
- 실제 localhost MCP + 합성 기기 Secure56 서명 + SQLite 통신 시험 1개 통과.
  23초 후의 완료 응답을 최초 MCP 호출이 수신하고, 잘못된 서명은 401로 거절하며,
  이후 job status 조회 뒤 휴대폰 큐가 비어 있음을 확인했다.
- 총 81개 통과, 최종 실패·건너뜀 0개. 실제 휴대폰 시험은 아니다.

첫 검사에서 baseline 검사 산출물 누락이 있어 기존 build-auth-candidate 생성 절차를 실행했다.
HTTP 시험의 URL 끝 슬래시 비교 오류는 표준 URL 정규화로 고친 뒤 재실행했다.
이 두 초기 실패는 제품 오류로 계산하지 않는다.

재현:

```sh
cd jh-server/owner-setup
npm ci --ignore-scripts --no-audit --no-fund
npm ci --prefix owner-enrollment --ignore-scripts --no-audit --no-fund
cd ..
node verification/build-auth-candidate.mjs
node --test --test-concurrency=1 owner-setup/deployment/jh167-open-completion.test.mjs owner-setup/deployment/jh167-connection-v2-assembled-preflight.test.mjs owner-setup/deployment/jh167-right-url-routing.test.mjs owner-setup/deployment/jh167-web-service-names.test.mjs owner-setup/deployment/jh167-connection-v2-runtime.test.mjs owner-setup/deployment/readback-budget.test.mjs verification/job-deadline.test.mjs verification/right-pane-open-route.test.mjs owner-setup/trusted-server/dispatch-receipts.test.mjs verification/jh167-open-completion-http.test.mjs
```

## 배포 및 되돌리기

현재 단계는 검증된 패치 준비이며 운영 배포·휴대폰 검증은 미실행이다.
Render 대상은 기존 `jh-secure-bridge-fix4`이며, 배포 전 workspace·서비스·실제 LIVE
커밋과 이 기준 브랜치의 최신 HEAD를 대조해야 한다. 기존 대화에서 합의된 보안·운영 경계를 유지한다.
별도 브랜치/PR로 전달하고 운영 반영 시 소스와 배포 ID를 기록한다.
되돌리기는 이 PR의 코드 변경만 revert하여 배포한다. 영속 기록·미확인 실행 장부·기기 데이터를 지우지 않는다.

주의: 휴대폰에서 결과가 전혀 전송되지 않는 결함이나 네트워크 유실은 이 서버 대기 패치만으로
복구되지 않는다. 그 경우 실제 작업의 결과 전송 진단을 먼저 확보해야 하며, 열기를 재실행하면 안 된다.
