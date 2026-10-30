# JH168 재설계 최종 방향 — Android 접근성 직접 실행 우선 (2026-10-31)

## 사용자 수정 지시가 우선
**JH 일반 클릭·입력·스크롤을 Computer Use 승인 중심으로 설계하지 않는다.**
기존 PR #70의 `Computer Use INSPECT → PREPARE → 승인 → EXECUTE`를 **기본 경로로 삼았던 설계는 철회**한다. 이전 `original-approval-checkpoint` 신규 모듈은 이 PR에서 제외한다. 기존 Secure56의 별도 보호 작업 승인 기능은 유지한다.

## 실제 목표 (한 개의 휴대폰 화면/명령)
```
GPT → 기존 Primary MCP → Secure56 Bridge → JH168 Android 접근성 엔진
  → 원래 왼쪽 GPT + 오른쪽 Chrome (windowId / package / bounds)
  → 접근성 snapshot / 현 시점에 유효한 정확한 nodeRef
  → Android 기본 접근성 1회: FOCUS 또는 SET_TEXT 또는 SCROLL
  → 원래 서명된 Android snapshot 1회 → 포커스/실제 값/스크롤 변화 검증
  → GPT에 결과 반환
```
Computer Use는 기본 실행 절차가 아니다. 기존 `agent_step → agent_snapshot` 경로와 JH GuidedForm의 과거 성공 기록을 활용한다. Playwright의 `snapshot → exact target → act → fresh snapshot` 순서는 유지하되 별도 서버 Playwright 프로필/쿠키는 이전하지 않는다.

### 행동별 세 경로
| 분류 | 실행 판단 |
|---|---|
| **일반 안전 작업** (탭 이동·일반 입력·스크롤) | 원래 휴대폰 접근성 엔진에서 현재 창/노드/안전 분류가 **서명으로 확인된 경우에만** 직접 1회 실행. Computer Use 추가 승인창은 요청하지 않음 |
| **보호된 작업** (전송·삭제·결제·민감 정보·계정 변경) | 기존 Secure56 휴대폰 원클릭 승인·동의 경계. 승인 결과는 원래 영수증으로 조회. 기존 Phone-local 인증을 없애지 않음 |
| **원래 APK가 지원하지 않거나 원래 보안 게이트가 거부하는 작업** | `NATIVE_EXACT_TARGET_CAPABILITY_MISSING` / `OWNER_ADMISSION_BLOCKED`로 중단. Computer Use나 원격 Playwright로 자동 우회·자동 재요청 금지 |

## 오픈소스의 검증된 참고점만 선택
- **DroidBridge:** `observationId + nodeRef + sceneProof`의 대상, 창, 스크린 변경 확인을 Android 접근성 클릭/텍스트 입력 직전에 한 번 더 검사. Android 측 코드의 대상 토큰을 JH 원래 서명/디바이스에 묶는다.
- **AndroidX / Appium:** 활성 창만 추정하지 않고 `displayId/windowId/package/bounds`를 통해 오른쪽 Chrome, 왼쪽 GPT, 시스템 오버레이/IME 구분. OS 창이 조금 겹친다고 전부 가림 판정하거나 안전 검사를 제거해서는 안 됨.
- **JH167 FIX9:** 명시된 UP/DOWN 스크롤 액션 우선, 없을 때 FORWARD/BACKWARD 고려. 검증 가능한 중첩 조상 체인에서 가장 깊은 유일 노드 선택. native `form_scroll`은 과거 요청 접수만 확인됐으므로 실제 이동은 최신 화면에서 별도 증명.
- **기존 Playwright:** 정확한 대상 선택과 실행 후 새 화면 검증. 휴대폰과 원격 쿠키·좌표·승인 공유 금지.
- **adb-mcp:** 조건별 단계 일괄 진행은 **같은 명령·같은 창·기존 인증 내의 검증된 일반 단계**에만 장차 채택. ADB/디버깅/별도 서버는 추가하지 않음.

## 생성한 코드의 정확한 범위
- `right-target-preflight.mjs`: **읽기 전용, native-first 경로 선택기**. 정상 `FOCUS`, `TYPE`, `SCROLL`은 `SIGNED_ANDROID_ACCESSIBILITY` 경로를 계획하고, `computerUseInvoked=false`, `computerUseApprovalRequested=false`, `dispatched=false`를 명시한다. 원래 APK가 지원하는 `form_activate`/`set_text`/`form_scroll`과 *특정 노드 참조를 유지할 수 있는지*를 서명된 native-capability 계약으로 검사해야 한다.
- 기존 사용하지 않던 `original-approval-checkpoint.mjs` 신규 후보는 **제외**. 별도의 원래 Secure56 보호 작업 승인·영수증을 재설계하거나 없애지 않는다.
- `JH168-REA-FOCUS-SCROLL-APPROVAL-REDESIGN-20261031.md`는 사용자 지시대로 접근성 우선 설계로 교체했다.
- 후보 소스는 실행기/권한을 변경하거나 별도 승인을 자동 실행하지 않는다. **실제 native 호스트 어댑터 및 APK의 정확한 nodeRef 지원이 확인되기 전까지 이 후보는 운영 경로가 아니다.**

## 현재 확인된 사실
- 기존 JH168 운영에는 `life_android_step_and_snapshot`가 원래 `agent_step → agent_snapshot`을 구현한다. 다만 현재 도구 스키마는 `action,text,value`만 공개하므로 **exact nodeRef/window proof까지 안전하게 전달되는지 아직 확인되지 않았다**. 이 경계는 Android APK/host 계약 검증이 필요하다.
- 이전 JH167에서 수동 포커스 후 `set_text`는 성공했고, GuidedForm 특정 탭 이동은 성공했다. **자동 포커스**는 불완전하며 `form_scroll`의 결과는 접수 수준으로 실스크롤 미확인이다.
- 현재 `split_screen_assistant` START는 정상 화면을 읽고 뉴스 클릭 E2E는 별도 통과했지만 검색창 포커스 CLICK는 한 번 `OWNER_ADMISSION_BLOCKED`를 반환했다. 원래 owner fence를 다른 엔진으로 우회하지 않는다.
- 앞선 PR #68 원래 결과 회수, #69 queued INSPECT 회수와 보안 승인은 바뀌지 않는다. 서버 Playwright 9개의 완전 교체는 TYPE/SCROLL E2E 뒤에 진행한다.


## 입력 포커스만 우선 구현 — Android 공식 API 대조 (2026-10-31)

**이번 단계는 입력 포커스만** 고친다. 스크롤·자동 입력·전송을 함께 실행하지 않는다.

1. 현재 선택된 **RIGHT Chrome 접근성 창**을 package name, `windowId`, 범위와 LEFT ChatGPT 창으로 확인한다. Android의 `rootInActiveWindow`가 왼쪽 GPT 또는 시스템 키보드/대화상자를 가리킬 수 있으므로 무조건 사용하지 않는다. 현재 RIGHT 창의 root에서 탐색한다.
2. 하나의 편집 노드 `AccessibilityNodeInfo`를 확인하고 `isEditable()`, `isFocusable()`, `getActionList()`를 검사한다. **`AccessibilityNodeInfo.ACTION_FOCUS`(ID 1)**이 있는 경우에만 해당 정확한 노드에 `performAction(ACTION_FOCUS)`를 한 번 요청한다. **`ACTION_ACCESSIBILITY_FOCUS`(ID 64)**는 입력 포커스로 취급하지 않는다. 클릭 가능(`isClickable`) 여부는 `ACTION_FOCUS`의 필수 요건이 아니다.
3. 성공 판정은 `performAction`이 true라는 영수증이 아니라, **새로 읽은 RIGHT 창 root의 `findFocus(AccessibilityNodeInfo.FOCUS_INPUT)`** 결과가 같은 정확한 입력 노드인지와 **`isFocused()==true`**인지로 결정한다. 접근성 포커스의 `isAccessibilityFocused()`는 성공 근거가 아니다. 화면이 재구성되면 원래 signed `targetNodeDigest`/창/세션/명령과 새로 찾은 포커스 노드의 신원을 대조해야 한다.
4. 결과가 `true`로 확인되지 않으면 `FOCUS_INPUT_NOT_CONFIRMED`로 중단한다. 다른 좌표·`ACTION_CLICK`·Computer Use 승인으로 자동 우회하지 않는다. 일반 입력창에서는 별도 Computer Use 승인 절차를 기본으로 도입하지 않는다. 보호된 행위에는 기존 휴대폰 단발 승인 유지.
5. 입력 텍스트는 **확인된 포커스 이후 별도 단계**에서만 수행한다. `ACTION_FOCUS` 자체가 키보드 표시나 입력값 반영을 보장하지는 않는다.

참고하는 **Android APK Kotlin 쪽 실행 계약**(현 단계에서는 구현 예시이며 실제 APK 연결·컴파일·설치 검증 아님):

```kotlin
// root: packageName == com.android.chrome, windowId == signed RIGHT id인
// 특정 AccessibilityWindowInfo.root. GPT/시스템 오버레이 root 사용 금지.
val target: AccessibilityNodeInfo = resolveExactSignedItemRef(root, itemRef)
    ?: return FocusOutcome("STALE_TARGET")
if (!target.isEditable || !target.isFocusable ||
    target.actionList.none { it.id == AccessibilityNodeInfo.ACTION_FOCUS }) {
    return FocusOutcome("ACTION_FOCUS_UNSUPPORTED")
}
val requested = target.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
// UI가 바뀔 수 있으므로 항상 RIGHT 창 root를 새로 선택
val freshRoot = readSameSignedRightChromeRoot()
    ?: return FocusOutcome("RIGHT_WINDOW_CHANGED")
val focused = freshRoot.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
val confirmed = requested && focused?.isFocused == true &&
    focused?.isEditable == true &&
    matchesOriginalSignedNodeIdentity(focused, originalTargetDigest)
return FocusOutcome(if (confirmed) "FOCUS_INPUT_VERIFIED" else "FOCUS_UNCONFIRMED")
```

**2026-10-31 소스 후보 교정:** `right-target-preflight.mjs`에서 `FOCUS:'form_activate'`를 `FOCUS:'ACTION_FOCUS'`로 교체하고, 원본 기기가 실제 `getActionList`에 ID 1을 광고하는지와 `findFocus(FOCUS_INPUT)`/대상 `isFocused`의 원래 서명된 결과를 확인하도록 수정했다. 기존 `facts.focused`만으로 이미 포커스됐다고 인정하지 않는다. 사후 검사 `verifyRightInputFocusCompletion56`는 정확한 Secure56 action receipt·창·대상·신규 입력 포커스 증거를 요구한다.

**운영 배포 유보 사유:** 기존 원본 설치 APK의 `agent_step`가 `ACTION_FOCUS`와 `itemRef`를 안전하게 전달·실행하는 실제 계약이 현재 공개된 서버 코드만으로는 확인되지 않았다. 이 네이티브 계약을 제공하는 Android 소스/서명 APK가 확인되기 전에는 JS 정적·단위시험 통과를 휴대폰 포커스 성공으로 표시하지 않는다.

공식 API:
- https://developer.android.com/reference/android/view/accessibility/AccessibilityNodeInfo.AccessibilityAction
- https://developer.android.com/reference/android/view/accessibility/AccessibilityNodeInfo

## 실제 완료 조건
1. 현재 JH168 APK/원래 BridgeService가 `FOCUS/SET_TEXT/SCROLL`의 **명시된 nodeRef + 창 ID + 서명된 현재 scene proof**를 원래 실행기에 전달·검증할 수 있는지 증명. 불가능하면 APK 변경이 필요하다고 **명확히 기록**, Computer Use 기본 경로로 대체하지 않음.
2. 정상 Chrome 입력창 자동 포커스 → `focused=true` → 비민감 시험문구 입력 → 원래 Android 화면에서 **문구 실반영 확인**.
3. 정확한 RIGHT Chrome 내부 스크롤 조상 노드·방향 1회 실행 → 전후 화면의 실제 이동/위치/내용 변화 확인. `scroll_requested`만으로 성공 아님.
4. 정상 위 작업에는 **Computer Use 추가 승인 요청 0회**, 민감 작업에는 기존 휴대폰 단발 승인 유지. 원래 안전 분류·기기 서명·명령 바인딩·중복 방지 그대로 적용.
5. 네이티브 기능 미지원·창 불일치·가림·owner 차단·결과 미확인 시 멈추고 분기점을 알려줌. 새 요청 자동 재생 0회.

**운영 적용 상태:** 개발 후보. 이 문서/테스트의 성공을 현재 APK의 자동 포커스·입력·스크롤 성공으로 주장하지 않는다.
