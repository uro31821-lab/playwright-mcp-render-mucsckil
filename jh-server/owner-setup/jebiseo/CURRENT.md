# 제비서 — Gemini 모바일 연결 개발 체크포인트

## 현재 목표

사용자는 **휴대폰만 사용**하며 GPT에서 요청하면 **오른쪽 Gemini가 자동으로
열리고 배치되는 방식**을 명시했다. Google/Gemini를 직접 열고 배치하도록
안내하는 절차를 정상 사용법으로 요구하지 않는다. 이 후속 지시가 이전
Gemini 화면 비노출 기본 조건을 대체했다.

기본 실행 경로는 휴대폰 오른쪽 Chrome의 `https://gemini.google.com/app`이다.
기존 JH 통신·서명·승인·실행 엔진을 재사용한다. 비서 분석은 병렬로 할 수
있지만 같은 휴대폰 조작은 원래 명령과 기기에서 순서대로 처리한다.

명시적 화면 열기와 실제 Gemini 도움 기능의 가용성은 분리한다. 전체
`gemini-assistance`가 미가용이어도 실제 등록된 기존 RIGHT OPEN으로 화면을
여는 요청은 처리할 수 있다. 열기 성공만으로 도움 기능 가용성을 켜지 않는다.
실제 GPT 전용 버튼을 생성한 상태는 아니며, 자연어 요청이 기존 도구로 연결된다.

개인 [JH Secure Live](https://chatgpt.com/plugins/plugins_6ac116dadd588191ba4712ffe090534b)
**1.32.6**, release `pluginrel_6aeb50d2a9108191b3309449df39eb87`에 변경을 저장했다.
변경 10파일과 주요 보존 파일을 포함한 16파일 원문을 재조회해 일치 확인했다.
250개 경로와 App/MCP·기본 프롬프트·USER/PRIVATE 상태를 유지했다.
이 저장은 실행 지침·가용성 계약 반영이며, Android 창 선택 오류의 수정·설치나
기존 모든 대화방의 자동 로드, Gemini 결과 수신을 의미하지 않는다.

## 원본과 이어가는 위치

- 저장소: `uro31821-lab/playwright-mcp-render-mucsckil`
- 개발 브랜치: `feat/jh-jebiseo-mobile-20261104`
- 기존 [Draft PR #145](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/pull/145)를 갱신한다.
- 통합 기준: `jh-fix3-secure-server` @ `bdd5feb862102857f70133e1da87679fcd393b8d`
- 이번 수정 전 PR head: `a1e5469cfb68fb84cd498ea5be367970b1076543`
- 원래 Gemini [PR #63](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/pull/63), head `67c69428f27030237f417753c717ab758faaa855`는 보존한다.

PR63은 native Gemini 후보다. 이번 기본 경로는 최신 Mobile13과 일치하는
오른쪽 Chrome 웹이다. 기존 소스를 통째로 덮어쓰거나 native Gemini의 Google
앱 창 증거를 Chrome 주소 증거로 취급하지 않는다.
원래 세 기능은 [FEATURES.md](FEATURES.md)에 정리한 `YOUTUBE / VIDEO / ANDROID`다.
일반 상담 기능으로 대체하지 않으며, 아직 세 기능의 전체 실행 흐름을 이식한
상태는 아니다. 특히 VIDEO의 포함 사용량·추가 결제 없음·실제 영상 회수 및
GPT 전달, ANDROID의 명시적 OPEN_APP·독립 상태 확인을 유지한다.

## 이번 구현

| 변경 | 실제 동작과 경계 |
| --- | --- |
| 고정 Gemini 진입과 명칭 후보 | 실제 host OPEN은 고정 HTTPS 주소로 기존 `life_web_navigate`를 호출. 제미나이·제미니·gemini·제비서 명칭의 추가 매핑은 별도 후보 overlay로 분리하며 운영 startup에 자동 적용하지 않음 |
| `mobile-port.mjs` OPEN | 기존 `life_web_navigate` 한 번 호출. 호출자 URL·native target·임의 승인값 변경을 허용하지 않음. 다른 브라우저 또는 새 기기로 전환하지 않음 |
| `host-runtime.mjs` 시작 | 실제 현재 사용자 요청의 기본을 VISIBLE로 변경. `start()`가 OPEN 실행. `intent: open`은 질문을 만들지 않고 화면만 열며 TYPE/SUBMIT 불가 |
| 원본 결과 회수 | OPEN도 다른 쓰기와 같은 pending 장벽을 사용. 원래 `job_숫자` 형식의 jobId와 명령으로 조회하고, 정확한 job·URL·effect·기기·명령 증거가 없으면 다음 효과 차단 |
| 열린 뒤 입력 | OPEN 전에 Gemini 입력창을 요구하는 교착 제거. 실제 TYPE/SUBMIT에는 여전히 신선한 Gemini 대상·작성 내용·원 승인을 검증 |
| MCP 응답 해석 | 실제 텍스트 응답의 `structuredContent: null`은 구조화 본문 없음으로 처리. 충돌하는 이중 본문은 계속 거부 |
| 플러그인과 가용성 | 최신 사용자 방향을 스킬·허브에 반영. 코드 후보·운영 등록·실제 결과 검증을 구분하고 미가용 상태 유지 |

`callOriginalTool`은 선택된 인증된 기존 registry에 결합해야 한다.
같은 기기·명령의 taskRef도 고정하며 새 taskRef로 pending 장벽을 피할 수 없다.
`readCurrentBinding`과 `verifyGeminiTarget`은 실제 원 상태·서명·대상을 검증하는
호스트 경계다. 현재 후보의 callback을 모의 true로 채워 운영 연결을 주장하지
않는다. 별도의 영속 실행 장부나 자동 BEGIN·재전송 루프를 만들지 않는다.
명시적인 INTERNAL은 여전히 실행 전에 `HIDDEN_EXECUTION_UNAVAILABLE`로 끝난다.

## 자동 배치와 실제 휴대폰 결과

보존된 stage62 Android 소스에서 다음 기존 경로를 확인했다.

`right_web_link` → `BridgeService.openDirectWeb` →
`LinkSplitController.requestWithResult(fromChat=true, requireSplit=true)` →
오른쪽 Chrome이 없을 때 `SamsungSplitSetup.start` → 실제 창 쌍·주소 재확인.

이 경로는 전체 화면 GPT에서 시스템 분할 컨트롤과 오른쪽 앱 선택기를 통해
Chrome을 배치하도록 작성돼 있다. 소스 경로의 존재를 설치 APK와의 바이트
일치나 현재 기기에서의 성공으로 해석하지 않는다.

**실제 확인:** 2026-11-04 15:30 UTC에 현재 Primary의 원 명령으로 고정 Gemini
주소 OPEN을 한 번 호출했다. 원 작업의 완료 응답을 받았으나 다음을 반환했다.

- 기기 응답: `error:AMBIGUOUS_BROWSER`, `split_screen_changed_or_missing`
- `browserRequestAccepted: false`, `rightAddressConfirmed: false`
- 기존 완료 판정: `OPEN_RESULT_UNCONFIRMED`, `EFFECT_UNKNOWN`
- 후속 읽기 전용 분할 상태: `AMBIGUOUS_WORK`, `NO_TRUSTED_SPLIT`
- 같은 명령의 화면 조회도 `split_screen_changed_or_missing`으로 제한됨

MCP 응답·휴대폰 결과 수신은 확인됐지만 **Gemini가 오른쪽에 열렸다는 확인은
없다**. 연결을 다시 만들거나 같은 OPEN을 반복하지 않았다. 현장 명령·기기·작업
식별자와 개인 화면 원문은 공개 소스에 넣지 않는다.

소스상 `PanePolicy.select`는 같은 ChatGPT에 대응하는 오른쪽 Chrome windowId
후보가 두 개 이상이면 AMBIGUOUS_BROWSER로 끝난다. `waitChat`은 Chrome 후보가
없는 RIGHT_CHROME_REQUIRED일 때만 자동 배치로 진입한다. 현재 원자료가 없어
팝업·별도 작업창·다른 디스플레이 중 원인을 확정할 수 없다. 첫 창·가장 큰 창을
임의로 골라 안전 검사를 완화하지 않는다. STATUS의 auditCount 0은 이번 후보
원자료가 없다는 뜻이며 실제 화면에 창이 0개 있다는 의미가 아니다.

## 검증

과거 head a1e5469의 150개 통과와 7개 CI 성공은 당시 기록으로 유지한다.
이번 변경은 자동 열기·실제 생성된 기존 핸들러·공통 URL/완료 계약까지 검사한다.
첫 변경 묶음은 로컬·제비서 CI에서 **207 passed / 0 failed / 0 skipped**였지만,
기존 보호 원본 검사에서 공통 composition·기존 검사 파일의 변경이 차단됐다.
보호 검사나 pin은 수정하지 않고 그 원본을 정확히 복구했으며, 추가 이름 매핑과
그 검사는 제비서 후보 모듈로 이동했다. 기존 고정 URL OPEN은 이 추가 매핑 없이
동작하는 원 경로다. 실제 원 jobId와 같은 명령의 taskRef 고정 수정도 유지한다.
이 분리까지 반영한 최종 로컬 통합 결과도 **207 passed / 0 failed / 0 skipped**
(약 6.4초)다. 신규 overlay 5개 검사를 포함하며 원본 핸들러·완료 검사를 함께 실행했다.

```bash
env -u RENDER_SERVICE_ID -u JH_DURABLE_RELEASE \
  CI=true NODE_ENV=test JH_OWNER_DEFER_LISTEN=1 \
  JH_MOBILE_WEB_13_MODE=EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1 \
  node --test --test-concurrency=1 --test-reporter=spec \
  jh-server/owner-setup/jebiseo/*.test.mjs \
  jh-server/owner-setup/deployment/jh167-web-service-names.test.mjs \
  jh-server/owner-setup/deployment/jh167-right-url-routing.test.mjs \
  jh-server/owner-setup/deployment/jh167-open-completion.test.mjs \
  jh-server/owner-setup/jh168-mobile-unification/mobile-web-4-entrypoint-contract.test.mjs \
  jh-server/owner-setup/jh168-mobile-unification/mobile-web-13-runtime-contract.test.mjs \
  host-jebiseo/plugin-overlay/skills/jh-assistant-hub/tests/*.test.mjs \
  host-jebiseo/plugin-overlay/skills/jh-jebiseo/tests/*.test.mjs
```

CI의 `.github/workflows/jh-jebiseo-mobile-candidate.yml`도 같은 범위를 검사한다.
기존 `mobile-web-current-main-compat.test.mjs`를 별도 선행 게이트로 실행해
보호 원본·모바일 통합·인증·실행 정책이 검토된 기준과 같은지 확인한다.
실제 생성기 import를 위해 owner-setup과 owner-enrollment의 기존 lockfile
의존성을 `npm ci --ignore-scripts --no-audit --no-fund`로 준비한다. 합성 검사
selector는 검사 단계에만 적용하며 운영 설정·서명·source pin을 변경하지 않는다.
같은 중간 생성 파일을 쓰므로 test-concurrency=1을 유지한다.

## 현재 상태와 다음 단계

1. **코드와 운영을 구분:** 원래 세 기능의 실제 호스트 증거 생산기·운영 등록은
   아직 미완료다. `geminiAssistanceAvailable`, `liveExecutionVerified`,
   `productionRegistered`는 false를 유지한다.
2. **기기 창 선택 문제:** 현재 전체 화면 상태 또는 원본의 내용 없는 window
   metadata가 필요하다. 가능한 원인과 기존 창 관계를 확인한 뒤 동일 display·
   원 ChatGPT 창·Chrome toolbar·가림 여부를 증명하는 좁은 수정만 검토한다.
   PanePolicy와 완료 시 AgentFocusPolicy의 전후 선택 일치도 필요하다.
3. **운영 외부 변경:** 공개 저장소 업로드·기존 Draft PR 갱신·CI·개인 플러그인
   변경은 현재 승인된 작업으로 이어간다. 운영 merge/deploy와 새 APK 설치는
   이번에 수행하지 않았다. 새 API·추가 결제·계정 전환을 활성화하지 않았다.
4. **완료 조건:** 실제 왼쪽 GPT 보존·오른쪽 Gemini 자동 열기부터 확인하고,
   해당 기능의 현재 요청 제출·응답 또는 영상 회수·GPT 전달을 각각 확인한다.

이 체크포인트에서 이어가며 완료한 원본 복구·검사·승인을 반복하지 않는다.
