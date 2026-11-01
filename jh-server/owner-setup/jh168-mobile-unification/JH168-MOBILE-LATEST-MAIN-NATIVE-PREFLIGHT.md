# JH168 Playwright → Android Mobile — 최신 원본 서버 및 서명 APK 경계 검증 (2026-11-01)

**상태:** 9개 웹 명령 + 4개 진입 경로 **전체 조사 중**. 발견 즉시 개별 수정 금지. 실기기 교체 경로 E2E **0/13 NOT_RUN**. 기존 Stage27 Chrome 메뉴 클릭 성공은 재실행하지 않음.

## 1. 최신 운영 소스의 병합 적합성 — 실제 GitHub CI 검증

- 원본 최신 `jh-fix3-secure-server` HEAD: `86cfa35e4f6be6ba1b6a7f9797533a88f6406a87`.
- 확인한 기존 소스 후보 PR #72에는 9개 웹 alias, 4개 진입 경로의 Android RIGHT 라우팅 검증 코드가 있음. 생성 핸들러 실호출 모의시험 **9개 명령 10/10, 4개 진입 5/5 PASS**.
- 소스 호환성 검증 CI [41283451015](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/41283451015) **SUCCESS**, 커밋 `9397ed1d9f4761ea1152616418353d63bfff659b`:
  - 원본 `server.mjs`, `durable-live-release.mjs`, clean-restart entry, JH167 오른쪽 Chrome orchestrator, open completion, ConnectionV2, owner journal, durable host, JH155 split integration 및 pending approval operator entry **10개 파일의 내용이 최신 main과 바이트 단위 동일**.
  - 모바일 전환 관련 `jh167-article-operational-review-composition.mjs` 차이 = `patchJH168MobileWebCommands56` import 1개 + 기존 마지막 조합을 한 번 감싸는 래퍼 1개. 이 외 원본 구성 소스 변경 없음.
  - 원본 `jh-server/server.mjs`의 `life_web_*` 9개는 여전히 별도 `browserTool` Playwright로 등록돼 있음. **실제 운영에 교체가 반영됐다는 증거 아님**.
- 이 검증은 바이트 수준 호환성·generated runtime contract를 보장하지만 **Render 배포·MCP 카탈로그 노출·휴대폰 UI 실행 증거는 아님**. 최신 main이 다시 변하면 PIN과 영향받는 회귀를 재검증해야 함.

## 2. 기존 서명 APK 내부 네이티브 보안·포커스·창·스크롤 실행 계약

**원본 APK SHA-256:** `129bcc55a9fbf04ebe2bb19d86958fd94f4dc6fd0969bb020105e7f162510359`. 기존 Stage27 설치 성공 증거에 대응. `classes.dex` / `classes2.dex` 각각 검증된 로컬 DEX 텍스트로 정적 감사 (APK/인증키/사용자 데이터 GitHub 업로드 금지).

| 실제 APK 메서드 | DEX 내부 확인된 핵심 검사/호출 | 판단 |
|---|---|---|
| `AndroidComputerUseRuntime.executePrepared` | `BridgeService.workExecutionAllowed`, `AndroidAgent.windowSelection`, `findScrollable`, `workOcclusionAssessment`, `performEnter`, `AndroidAgent.executeRightPane` | 기존 Computer Use의 실행·가림·창·스크롤/엔터 코드 존재 |
| `JH168OriginalSecure56NativeDispatch12.executeOriginalJobOnce` | `resolveCurrentOriginalSignedJob`, `verifyCurrentSignedCommand`, 왼쪽 GPT·오른쪽 Chrome 기하 검증, `verifyOriginalActionAuthority`, `NATIVE_ORIGINAL_JOB_ALREADY_ATTEMPTED_NO_REPLAY` | 별도 원본 서명/재실행 방어 코드 존재. **타 클래스에서 직접 호출은 0** |
| `JH168RightNativeExecutor.imeEnterOnce` | `AccessibilityNodeInfo.findFocus`, `isEditable`, `isFocused`, `isPassword`, `authorizeImeEnter`, `NATIVE_FOCUS_CHANGED_AFTER_GRANT_NO_REPLAY` | Enter가 APK에 컴파일돼 있어도 서버 alias Enter 연결은 미확인 |
| `JH168RightNativeExecutor.captureRightWindowOnce` | `AccessibilityService.takeScreenshotOfWindow`, `NATIVE_WINDOW_SCREENSHOT_REQUIRES_API34`, `NATIVE_SCENE_CHANGED_AFTER_CONSENT_NO_REPLAY` | 창 단위 캡처/동의 후 화면 변경 방어 있음. 실제 one-shot lease 연동 미검증 |
| `JH168RightVerticalScrollRuntime.scrollInternal` | `currentPair`, `tree`, `JH168NestedScrollPolicy.offers`, `AccessibilityNodeInfo.getActionList` | 내부 대상 탐색·창 스코프·접근성 액션 확인 코드 존재 |
| `JH168RightHorizontalScrollRuntime.scrollInternal` | `currentPair`, `tree`, `JH168HorizontalScrollPolicy.offers`, `horizontal_window_changed_before_dispatch` | 가로 대상·창 변경 방어 코드 존재 |

**정적 검사 결과:** 6개 메서드 내 선택한 호출·거부 문자열 **28/28 존재**. 하지만 `NativeDispatch12` 타 클래스 직접 호출 및 `new-instance` 0건이라는 기존 G12 관찰은 여전함. 리플렉션/의존성 주입/실제 런타임 성공은 정적 검사로 검증하지 못한다.

## 3. 일괄 수정 전에 남는 원인 묶음 (기존 G02, G06, G07, G12~G14 보강)

1. **서버 alias ↔ 실행부 접속 (G01/G12):** 최신 main과 래퍼 차이는 2개 소스 조각뿐이지만, 런타임 연결·도구 카탈로그 노출·전용 네이티브 디스패처 사용은 미증명.
2. **키/입력 및 포커스 (G02/G04/G13):** APK는 `performEnter`, `imeEnterOnce` 및 포커스/민감 입력 차단을 갖추나 `life_web_press_key`는 BACK 이외 거부, `life_web_type`은 입력 후 submit 별개. 두 길이 동일 Secure56 허가/기기 포커스를 쓰는지 검증.
3. **수직/수평/중첩 스크롤 (G07/G13):** `GuidedForms` 전용 nested-scroll과 기존 `ComputerUseRuntime.findScrollable`가 별개의 직접 호출 경로. 내부 scroll item/ref와 창 ID/화면 증거를 같은 명령으로 묶는지 검증.
4. **스크린샷/창 변경/원래 승인 (G06/G13):** API34 창 캡처와 기존 화면 동의·lease, 새 창/팝업 변경/가림 오판을 동일 결과로 연결해야 함.
5. **조건 대기/선택/돌아가기 (G03/G05):** 서버 wait은 아직 조건 판정 불가, OPEN→PICK에는 새 itemRef 필요. 기존 BACK은 Android 뒤로 가기이지 브라우저 history 성공 보증 아님.
6. **일괄 출시/호환성 (G09/G11):** 이전 CI baseline 차이·현재 PR의 구형 브랜치 및 미배포 문제를 동결된 하나의 검증 조합으로 확인. 기존 앱 서명·원본 승인·미확정 작업 재실행 금지.

## 4. 현재 객관적인 상태

| 검증 대상 | 결과 |
|---|---|
| 13개 생성 서버 alias/entry route | **13/13 source/동작 mock 검증 PASS** |
| 기존 설치 APK 네이티브 6개 메서드 보안·창·포커스 검사 | **28/28 정적 anchor PASS** |
| 최신 main과 전환 코드의 원본 종속 파일 호환성 | **10/10 동일, 합성 래퍼 차이 2개** |
| Android 실제 13개 migrated alias E2E | **0/13 (NOT_RUN)** |
| 이번 Render 배포, APK 설치, 휴대폰 실행, 기능 수정 | **각 0회** |

**다음:** 서명된 기존 Android 실행부를 재사용하는 **격리된 실제 검증 경로**가 가능한지 확인하고, 필요한 배포/연결/승인을 기능 수정과 구분. 교체 alias 13개 모두 실제로 검증하고 안전하게 결함을 기록한 후 G01–G14 전체를 단일 패치로 수정. 구버전 PR #72를 최신 운영 브랜치에 곧바로 병합하거나 APK를 재설치하지 않는다.
