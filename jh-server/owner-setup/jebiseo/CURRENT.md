# 제비서 — 텍스트 선택 전달 개발 체크포인트

갱신일: **2026-11-06 (KST)**. **‘선택한 글 → Gemini에게 물어보기’** 메뉴를 기본 전달 방식으로 적용한다. 추가 사용자 지시에 따라 **② 유튜브 분석은 분석 완료 후 선택·공유로 GPT에 돌아와 이어가는 흐름을 복원**한다. 삼성 앱·기기와 영상 결과는 Gemini에 둔다.

## 현재 기준과 범위

- 저장소: `uro31821-lab/playwright-mcp-render-mucsckil`.
- 후보: [Draft PR #145](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/pull/145), `feat/jh-jebiseo-mobile-20261104` → `jh-fix3-secure-server`.
- 이번 변경 시작점: `fed09d8d356544b244807702037f7b82b2d5d974`.
- 사용자 기준: [PR #159](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/pull/159)의 `5d72b78fd3730111076b33e2771f5b6b70f657aa`, **Stage62 FIX3 APK 유지 + Stage71 Android → Manual + Stage72 인계**.
- 휴대폰만 사용하며 **왼쪽 GPT / 오른쪽 Gemini**를 유지한다. 유튜브 분석의 결과 목적지는 수동 공유 후 GPT, 삼성·영상은 Gemini다. 모든 기능에 자동 반환은 없다.
- 이번 작업은 후보 코드·문서·관련 검사·PR 반영이다. 설치된 플러그인 갱신·운영 배포·휴대폰 실행·APK 변경과 구분한다.

직전 후보는 대상 브랜치 `845c5dfd9925a9f40950f3a873b4e58bfada9990`의 무관한 Stage77/78/79 기록·검사·CI 8파일을 보존했다. 이번 반영 시 대상 브랜치의 최신 상태는 별도로 확인하며 다른 기능의 기록을 제비서 설치 지시로 채택하지 않는다. 일반 `main`은 이 PR의 병합 대상이 아니다.

## 최신 세 기능

| 기능 | 준비할 문장 | 결과 위치 |
| --- | --- | --- |
| `ANDROID` | Gemini가 실제 지원·연결하는 삼성 앱·기기 작업. 일정·노트·계산기·연결 기기는 예시 | Gemini 또는 실제 대상 앱·기기 |
| `YOUTUBE` | 현재 사용자가 지정한 영상 링크와 분석 질문 | Gemini 분석 완료 → 사용자 선택·공유 → 현재 GPT 대화에서 실제 받은 내용으로 이어가기 |
| `VIDEO` | 현재 사용자가 지정한 제작 프롬프트. 기존 구독 범위·추가 결제 없음 | Gemini의 생성 상태·영상 |

현재 요청에 필요한 문장만 준비하며 고정 세 앱 목록으로 제한하지 않는다. 다른 방의 대화·전체 기억을 자동 전달하지 않고, 모든 삼성 기기 지원·연결을 추정하지 않는다.

## 기본 전달 방식

1. GPT는 **Gemini에 보낼 문장만 독립된 한 덩어리**로 표시한다. 설명·비서 배지·진행 상태를 전달 문장에 섞지 않는다.
2. 사용자가 문장을 선택하고 현재 휴대폰의 **‘Gemini에게 물어보기’**를 누른다.
3. Gemini가 받은 내용을 확인한다. **아직 초안이면 실행하고, 이미 응답 중이거나 결과가 있으면 다시 보내지 않는다.**
4. **유튜브 분석이 완료되면 분석 내용을 선택·공유해 GPT로 가져온다.** 이 순서는 첫 안내에 포함하며 별도로 ‘반환해 줘’를 다시 요구하지 않는다.

이 선택 안내에는 원 runtime 생성, 자동 OPEN·입력·클릭·전송이 없다. 메뉴를 자동 조작하는 기능이나 새 GPT 버튼·APK 기능을 만들었다고 표시하지 않는다. 단계마다 ‘열었어/입력했어/됐어’를 입력할 필요도 없다.

사진에서 확인된 것은 메뉴 노출이다. 내부 Intent, 실제 전달·실행 범위와 오른쪽 배치 완료는 별도 확인 사항이다. 왼쪽 GPT / 오른쪽 Gemini 요구를 유지하되 메뉴 사용만으로 배치 성공을 선언하지 않는다.

## 이번 session API

```js
const session = host.createHandoffRuntime({
  request,
  deliveryMode: 'TEXT_SELECTION',
  requiresResultInspection: false,
  deviceId,
  commandId
});
await session.start();
const display = session.presentation();
```

- `request`는 `prepareJebiseoHandoff()`에 넣는 **원 의미 입력**이다. 준비 완료 객체가 아니다. 원 입력 키·작업 연결·digest 검증을 유지하며 현재 기능별 반환 정책에 맞게 준비한다. 전달 옵션은 request 안에 넣지 않는다.
- `deliveryMode:'TEXT_SELECTION'`이 기본이다. 세 기능의 요청 문장과 선택 메뉴 안내를 준비하며 폰 도구를 호출하지 않는다. 안내의 `surface:'ANDROID_TEXT_SELECTION_MENU'`는 수신 앱의 실제 화면 증거가 아니다.
- `deliveryMode:'OPEN_MANUAL'`을 명시하면 이전 웹 OPEN 1회·동일 원 job 상태 조회·수동 입력 흐름을 유지한다. 삼성 네이티브 요청은 열기부터 수동이다.
- `requiresResultInspection:true`는 두 방식보다 우선한다. 현재 task의 미확정 상태를 유지하며 예시의 false로 덮지 않는다.
- 동일 task의 binding identity는 thread/source·요청 digest·기기·명령에 전달 모드와 inspection flag까지 포함한다.
- `presentation()`은 준비 문장과 남은 수동 절차를 함께 제공한다. 기존 입력·전송을 다시 하게 만들지 않는다.
- `reportManualProgress()`는 선택적인 `OPEN|INPUT|SUBMIT`와 TEXT_SELECTION 전용 `HANDOFF` 보고를 받는다. 오래된 보고로 진행을 뒤로 돌리지 않으며 보고를 실제 전송 증거로 취급하지 않는다.
- `session.prepareManualReturn()`의 requested 생략 기본값은 YOUTUBE에서 true, 다른 두 기능에서 false다. `requested:false`로 안내를 끌 수 있으며 다른 기능은 요청한 때 `requested:true`를 사용한다. 자동 결과 회수는 하지 않는다.

원 요청은 16,000바이트 이내이며 지원 길이 안에서 자동 입력 상한을 넘는 내용도 잘라 보내지 않는다. YouTube 정규화는 실제 영상 존재·분석 완료의 증거가 아니다. 기존 요청의 surface와 digest도 선택 메뉴가 실제로 연 화면·전송을 검증한 값이 아니다.

## 유튜브 분석의 수동 GPT 복귀

유튜브 분석이 끝나면 실제 공유 목록이나 사용자가 확인한 메뉴를 사용해 분석 내용을 GPT로 가져오도록 안내한다. 확인되지 않은 공유 항목을 만들지 않으며 **현재 대화에 실제 내용이 들어온 뒤** 이어서 정리한다. 메뉴 사용·완료 보고만으로 현재 대화 자동 복귀·삽입·수신을 보장하지 않는다.

YOUTUBE는 `returnToGpt:true / resultDestination:'GPT_AFTER_MANUAL_SHARE'`, ANDROID·VIDEO는 `returnToGpt:false / resultDestination:'GEMINI'`다. **모든 기능은 `automaticReturnToGpt:false`**이며 반환 목적지가 실제 수신 완료를 뜻하지 않는다. 유튜브는 수동 반환 안내를 기본 포함하고, 사용자가 끄면 생략한다.

## 기존 효과와 완료 표시

`PENDING / UNKNOWN / FAILED_AFTER_EFFECT / PHONE_SCOPED_SITE_DISCARD / EFFECT_UNKNOWN / NEEDS_REVIEW_NO_REPLAY`이면 기존 요청·화면을 먼저 확인한다. 준비 문장·전달 모드·새 task·사용자 보고로 장벽을 해제하거나 같은 내용을 다시 보내도록 안내하지 않는다.

선택 메뉴는 열기·입력·전송 중 어디까지 처리했는지 확인하기 전까지 기존 OPEN → INPUT → SUBMIT 순서로 강제하지 않는다. 선택 후에는 받은 요청을 확인하며 초안일 때만 실행하도록 안내한다. SUBMIT 보고 뒤에는 재전송하지 않고 결과를 확인하며, YOUTUBE는 분석 완료 후 수동 공유 단계로 이어간다.

`requestSent:false`, `resultVerified:false`, `externalEffectVerified:false`, `geminiReplyVerified:false`, `automaticReturnToGpt:false`는 준비·안내·사용자 보고에서 유지한다. 수동 반환 의도인 `returnToGpt:true`를 실제 수신 성공으로 표시하지 않는다. 후보 코드·문서·검사와 실제 폰 성공을 구분한다.

## 보존한 원본 기반

기존 `host-runtime.mjs`, `mobile-port.mjs`, 원 binding/composition, Stage26 완료·Stage44 focus·Stage61·durable 예약 보호를 보존한다. OPEN_MANUAL의 자동 OPEN은 같은 원 작업만 한 번 호출하며 상태 조회는 저장된 동일 job에 한정한다.

이전 native guided-form, 세 패키지 직접 `OPEN_APP / APP_OBSERVE`, `reply-proof`·영상 파일 검증은 별도 호환·추가 자동화 기반이다. 이번 삼성 위임 범위를 세 앱으로 제한하거나 답변 자동 회수를 새 선행 조건으로 넣지 않는다. 화면 복원이 가능한 보관 snapshot을 순수 공유 안내 때문에 호출하지 않는다.

과거 보관 소스의 433개 파일 검증은 현재 설치 APK 바이트 확인이 아니다. 과거 실기기에서 Gemini 페이지를 관찰한 이력도 이번 선택 메뉴 전달·역방향 공유·전체 기능의 실사용 성공으로 재사용하지 않는다.

## 검사 기록

| 구분 | 확인 범위 | 결과 |
| --- | --- | --- |
| **이번 선택 전달 변경** | 새 head의 관련 검사와 기존 binding/composition·보호 CI | 작성 시 대기. 최종 head·실행·실제 수치는 PR 기록 참조 |
| 직전 `fed09d8d356544b244807702037f7b82b2d5d974` | [CI #42060043459](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/42060043459), 전체 워크플로 8개 성공 | 보호 원본 **10 pass**, 통합 **371 pass**, 실패·skip 0 |
| 직전 반수동 로컬 검사 | 8개 관련 검사 파일 | **127 pass / 0 fail / 0 skip**. 위 CI와 범위가 겹침 |
| 이번 실기기·운영 적용 | 새 메뉴 전달·역방향 공유·폰 배치·배포 | 코드 검사와 별도. 수행·성공을 주장하지 않음 |

과거 수치를 새 변경의 통과로 표시하거나 로컬 검사와 CI를 합산하지 않는다. 기존 [.github/workflows/jh-jebiseo-mobile-candidate.yml](../../../../.github/workflows/jh-jebiseo-mobile-candidate.yml)의 실제 생성 서버·보호 원본·허브 검사를 이어 사용하며 보호 pin·승인 기준을 바꾸지 않는다.

## 이어갈 위치

선택 전달을 기본으로 하는 후보를 기존 PR에서 검토하고 해당 head CI를 확인한다. 설치된 플러그인·다른 방이 자동 갱신됐다고 가정하지 않는다. 실제 휴대폰 동작은 별도의 현재 작업과 유효한 실행 범위에서 진행한다.

이번 기본 사용은 전달 문장을 선택해 Gemini 메뉴로 넘기는 것이다. 삼성·영상 결과는 Gemini에서 확인하고, 유튜브 분석은 완료 후 사용자가 선택·공유해 현재 GPT 대화에서 실제 받은 내용으로 이어간다. 중지 지시가 오면 추가 작업을 멈춘다.
