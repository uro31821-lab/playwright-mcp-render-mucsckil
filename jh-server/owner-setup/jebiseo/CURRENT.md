# 제비서 — Gemini 모바일 연결 개발 체크포인트

## 목표와 현재 범위

사용자는 JH에 자연어로 말하고, 제비서가 Gemini의 의견을 기존 비서와 함께
현재 대화에 연결한다. 사용자가 요구한 실행은 **휴대폰만 사용 + Gemini 화면
비노출**이다. 2026-11-04 후속 지시로 확정했으며 PC·별도 서버 CLI를 사용하는
대안은 현재 구현 선택에서 제외한다. 기존 JH 서버의 서명·통신 중계 역할을
휴대폰 내 Gemini 모델 추론과 혼동하지 않는다.
비서의 독립적인 분석은 병렬로 수행하되, 같은 휴대폰의 조작은 기존 명령과
원래 Secure56 실행기에서 순서대로 처리한다.

현재 실행 연결은 **소스 후보**다. 제비서 스킬과 허브 연결은 기존 개인
[JH Secure Live](https://chatgpt.com/plugins/plugins_6ac116dadd588191ba4712ffe090534b)
**1.32.5**에 저장하고 원문을 다시 조회해 확인했다. Gemini의 실제 질문 전송·답변
수신이나 비노출 실행을 완료한 상태는 아니다. 이 문서의 검사 결과를 운영
가용성으로 승격하지 않는다.

## 원본을 복원한 결과

| 근거 | 확인한 사실 |
| --- | --- |
| 기존 Gemini [PR #63](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/pull/63) | Draft/open/unmerged, head `67c69428f27030237f417753c717ab758faaa855` |
| [기존 CI](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/41069440150) | source/base 시험 병합 `581d46ccac017f992fbc20168f5b3b776e701635`, 398 pass / 0 fail / 0 skip; 실기기 전송 증거 아님 |
| 이번 모바일 기준 | `jh-fix3-secure-server` @ `bdd5feb862102857f70133e1da87679fcd393b8d`, Stage62 SELECT PICK 통합 |
| PR63과 현재 기준의 차이 | 구 Gemini 후보는 이미 Android-native v0.5지만 최신 Mobile13/Stage61/62 실행 계열에 포함되지 않음 |
| 구 기능 범위 | YOUTUBE: 지정 유튜브 영상 내용·질문 답변. VIDEO: 기존 Gemini 포함 사용량의 영상 생성·회수·GPT 재생 전달. ANDROID: 명시한 앱 열기·독립 실행 확인 |
| 명령 폐기 기록 | 기존 `STAGE44-SINGLE-COMMAND-FOCUS.md`에 다른 방의 BEGIN 선점 사례 존재. 이것만으로 첨부 화면 당시 원인을 확정하지 않음 |

구 PR의 전체 소스를 현재 서버에 덮어쓰지 않았다. 현재 Mobile13 실행 경로에
필요한 새 연결만 개발하고, 구 후보의 영상/앱 기능은 그 원본 PR에 보존한다.
원본 3기능의 입력·출력·제한·현재 미이식 구간은 [FEATURES.md](FEATURES.md)에
정리한다. 현재 새 후보는 공통 연결 기반이며, 원래 3기능 흐름을 이식·완성한
상태가 아니다. 일반 상담용 스킬 등록을 그 세 기능의 대체 구현으로 보지 않는다.

## 구현한 연결

| 파일 | 책임 |
| --- | --- |
| `mobile-port.mjs` | 실제 등록된 기존 모바일 도구를 한 단계씩 호출. 현재 command/context/item/request 유지, TYPE과 SUBMIT 분리, 원 승인·영수증 경로 재사용 |
| `host-runtime.mjs` | 현재 상담과 개발/인용 구분, 기본 INTERNAL 요청의 무실행 차단, 같은 기기 순서 관리, 원래 Gemini 대상·명령·결과 확인 연결 |
| `reply-proof.mjs` | 이번 요청과 같은 작업·기기·계정·대화·전송 메시지인지 검증. 보이는 일부 답과 전체 답을 구분 |
| `host-jebiseo/plugin-overlay/` | 기존 개인 JH Secure Live에 추가한 제비서 스킬·공통 허브·가용성 판정의 검토된 원문 |

호스트의 `callOriginalTool`은 현재 선택된 인증된 JH 연결의 **기존 등록 handler**에
결합해야 한다. 직접 HTTP, 다른 계정, 새 브라우저, 별도의 실행기나 새 기기 선택으로
바꾸지 않는다. 원래 handler의 Secure56 서명·기기 승인·영속 중복 실행 방지가
그대로 남아 있어야 한다. 새 별도 예약 장부를 앞에 만들지 않는다.

`readCurrentBinding`과 `verifyGeminiTarget`은 신뢰된 호스트가 실제 기존 상태와
서명된 Gemini 대상·현재 질문을 대조하는 경계다. 호출자가 넣은 JSON의 `true`나
모의 callback으로 실제 연결을 주장하면 안 된다. 단순히 fresh item ref가 있다는
이유로 다른 앱의 입력칸이나 전송 버튼을 사용하지 않는다.

현재 실행 후보는 화면이 보이는 모바일 경로만 다룬다. 기본 `INTERNAL`은
`HIDDEN_EXECUTION_UNAVAILABLE`로 끝나며 휴대폰 조회·입력·새 명령을 만들지 않는다.
임의로 `VISIBLE`로 바꾸거나 과거 Playwright 서버로 되돌아가지 않는다.

## 실제 가용성

`jebiseoCapabilities()`는 다음을 유지한다.

```json
{
  "schema": "jh.jebiseo-capabilities.v1",
  "provider": "gemini",
  "mobileRoute": "android_right",
  "internalExecutionSupported": false,
  "geminiAssistanceAvailable": false,
  "liveExecutionVerified": false,
  "codeCandidate": true,
  "productionRegistered": false
}
```

허브의 `resolveGeminiAvailability`는 이 결과를 `capabilities:[]`로 해석한다.
제비서 등록은 다른 방에서 이름과 현재 상태를 이해할 준비이며, 다른 방의 대화를
자동 읽거나 실제 Gemini 의견을 이미 받는다는 뜻이 아니다. 실제 응답이 없을 때
GPT 답변에 제비서 표식을 붙이지 않는다.

## 검증과 인계

다음 명령은 네트워크·휴대폰·Gemini 전송 없이 소스 계약과 기존 생성형
Mobile13 handler를 검사한다. 새로운 모바일 adapter, 잘못된 대상·명령·중복 실행,
이전 답변 오인, 내부 실행 미지원, 기존 허브 동작을 포함한다.

```bash
node --test --test-reporter=spec \
  jh-server/owner-setup/jebiseo/*.test.mjs \
  jh-server/owner-setup/jh168-mobile-unification/mobile-web-13-runtime-contract.test.mjs \
  host-jebiseo/plugin-overlay/skills/jh-assistant-hub/tests/*.test.mjs \
  host-jebiseo/plugin-overlay/skills/jh-jebiseo/tests/*.test.mjs
```

CI는 `.github/workflows/jh-jebiseo-mobile-candidate.yml`에서 같은 범위를 실행한다.
2026-11-04 이 명령의 최종 로컬 통합 검사는 **150 pass / 0 fail / 0 skip**이다.

| 검사 범위 | 통과 |
| --- | ---: |
| 제비서 모바일 도구 연결 | 14 |
| 호스트 명령·대상·기존 영속 실행 연결 | 16 |
| 같은 요청의 Gemini 답변 증거 | 12 |
| 기존 생성형 Mobile13 handler 회귀 | 13 |
| 기존 비서 허브와 제비서 등록·가용성 | 95 |
| 합계 | 150 |

초기 제비서 등록은 1.32.4에서 변경한 15파일을 저장 후 대조했다. 현재 1.32.5
release는 `pluginrel_6aeb4958fb688191a9cac960e4da91a2`이며, 휴대폰만 사용·비노출과
원래 3기능 범위를 반영한 4파일을 저장 후 다시 대조했다. App/MCP 연결·기본
프롬프트·가용성 코드의 보존도 확인했다. 이 저장은 제비서 사용 흐름·등록 변경이며,
실행 서버 배포 또는 내부 Gemini 연결은 아니다.

이전 GitHub 업로드의 자동 승인 검토 차단은 사용자 후속 답변 **"1. 승인"**으로
해소되었다. 승인된 목적지는 `uro31821-lab/playwright-mcp-render-mucsckil`의
**공개** 저장소이며, 개발 브랜치는 `feat/jh-jebiseo-mobile-20261104`다. 원래
33파일 업로드·Draft PR·CI와 같은 작업의 3기능 확인 문서화를 진행한다.
운영 merge/deploy 또는 유료 Gemini API로의 변경 승인은 아니다.

원래 서버 시작점·운영 설정·Android 소스·서명 인증서·설치 과정은 이번 변경 대상이
아니다. 운영 배포, APK 제작/설치, 실기기 전송, Gemini 답변, 완전 비노출 실행은
각각 **미실행/미완료**다.

## 다음에 실제로 필요한 것

1. **휴대폰 내부 제공자와 원래 조건의 양립:** 현재 접근성 기반 모바일 실행은
   실제 표시된 창이 필요하다. 휴대폰 Android 앱에서 공식 Gemini API를 호출하는
   비노출 구조는 별도 후보이지만, 기존 Gemini 앱 로그인·구독 포함 사용량을
   그대로 사용하는 경로가 아니다. 특히 VIDEO의 포함 사용량·추가 결제 없음
   조건을 확인 없이 충족했다고 바꾸지 않는다. PC/서버 CLI, 숨김 웹 로그인 우회,
   가시성·서명 검사 삭제로 대체하지 않는다. 현재 연결에서 이 조건을 모두 충족하는
   휴대폰 비노출 제공자는 확인되지 않았다. 새 인증·요금 경로를 활성화하지 않았다.
2. **실제 호스트 연결:** 선택된 실행 방식에서 원래 대상/승인/결과 증거를
   이 후보 계약과 결합한다. 현재 일반 모바일 스냅샷은 Gemini 메시지·대화 ID를
   입증하지 못하므로 `sentMessageIdProven`을 임의로 참으로 만들지 않는다.
3. **실제 요청 한 건 검증:** 동일 요청의 제출·답변·현재 대화 전달과 비노출 요구를
   각각 확인한다. 불명확하면 기존 결과를 회수하고 자동 재전송하지 않는다.

공식 동작 근거:
- [Android AccessibilityService](https://developer.android.com/reference/android/accessibilityservice/AccessibilityService)
- [Playwright Android](https://playwright.dev/docs/api/class-android)
- [Firebase AI Logic FAQ](https://firebase.google.com/docs/ai-logic/faq-and-troubleshooting)
- [Google AI plans and API usage](https://aistudio.google.com/docs/google-ai-plans)
- [ML Kit GenAI device and background restrictions](https://developers.google.com/ml-kit/genai)

이 체크포인트에서 이어가며 기존 PR, 검사, 승인, 명령을 처음부터 재생성하지 않는다.
