# JH168 Stage45 — Android native SELECT popup, strict multi-window proof

2026-11-01 KST. **CURRENT INCIDENT = FAIL-CLOSED, NOT SELECTED.**
This is a SOURCE-ONLY contract and tests for the next Android bridge integration.
Do NOT merge/deploy as a phone fix or infer a successful PICK.

## Real connected phone findings on LIVE Stage44
- Same original signed command and RIGHT Chrome neutral Mobile13 fixture. Prior real `life_web_type` on first practice field once returned `action_verified`. Independent signed snapshot displayed `7 input-one-length` for non-sensitive `JH TEST`.
- Native 700/1250/1050 scrolling (separate new requests with original Computer Use inspection/lease) moved to a fresh `comboBoxSelect` labeled `색상을 선택하세요`.
- Original WEB05 `life_web_select(phase=OPEN)` was dispatched once. Result: `{ok:false,code:"split_screen_changed_or_missing",resultVerification:{status:"NEEDS_REVIEW_NO_REPLAY",executed:true,verified:false}}`.
- Same-context read-only `life_web_snapshot` returned `split_screen_changed_or_missing`; `life_android_screen_understand(EVIDENCE)` returned `signed_screen_readback_unconfirmed`; `life_android_computer_inspect(WAIT,READ_ONLY)` returned `ambiguous_work_window`; `life_android_split_comfort(STATUS)` returned `AMBIGUOUS_WORK`. Native-app `life_android_snapshot` yielded a completed READ_ONLY job but no successful UI evidence.
- **No OPEN replay or PICK action**, no element guessed, no owner admission bypass, no shift to cloud Playwright or original Android write fallback, and no credentials or external business side effect.

## What is actually known
A separate interactive window (native dropdown/popup) is **plausible**, but the producer did not provide signed `windowId/displayId/type/layer/anchor` evidence linking it to the original RIGHT Chrome select. No option labels or popup state were authenticated. `split_screen_changed_or_missing` is not proof a user-selected color was changed.

The original `jh-server/owner-setup/deployment/split-screen-evidence.mjs` deliberately rejects any content rows from a non-original workWindowId. Removing that guard would make a multi-window ambiguity **worse**, not fix it. It must be preserved.

## Stage45 module
`stage45-native-select-popup-proof.mjs` is a PURE post-authentication classifier:
- Classifies the exact observed failure without retrying the original effect.
- Requires pre-action original context/command/device/secure-session, original GPT LEFT+Chrome RIGHT pair, and a NEW HMAC-verified Android window observation delivered to the server only through the original Secure56 signed receipt.
- Needs exactly the two original windows plus ONE foreground popup, with matching display, Chrome package, fresh timestamp, focused overlay, layer above parent, bounds entirely inside RIGHT, explicit original `parentWindowId` and `anchorItemRef`, and uniquely signed option refs scoped to overlay window.
- Rejects multiple/unknown windows, system popups, IME, cross-pane overlays, different device or command, stale readback, spoofed option labels, and missing parent binding.
- Even when all evidence passes, result is **READ_ONLY**, `authorizedToPick:false`. It NEVER sends an Android command, never grants a token, and never replaces owner CAS/approval/HMAC.
- This is a *required-data contract*, not evidence that the current APK already emits those fields.

## Android producer integration required
An owner-verified Android source revision (not in this server repository) must produce the signed, current, authentic window stack for the RIGHT work pane, via its existing AccessibilityService:
- With `FLAG_RETRIEVE_INTERACTIVE_WINDOWS`, use `getWindowsOnAllDisplays()` (API 30+) or `getWindows()` for the default display, then obtain `AccessibilityWindowInfo.getId()`, `getDisplayId()`, `getType()`, `getLayer()`, `isActive()`, `isFocused()`, `getBoundsInScreen()`, and `getAnchor()` (where available). Capture the native-select owning anchor and original-right-window relationship.
- Official AccessibilityWindowInfo window type for an application is `TYPE_APPLICATION`. **Do NOT mix it with WindowManager.LayoutParams.TYPE_APPLICATION_PANEL**; those are different APIs. Actual popup type must be observed rather than assumed.
- Never accept a legacy UiSelector-only query, guessed coordinates or a synthetic native option list as authentic proof. Inspect actual multiple windows and their anchors. If parent/anchor cannot be proven on a given Android version, return UNKNOWN; do not enable PICK.
- After private bridge source, signing, and one-phone consent are verified, integrate this readonly proof into the existing same-workflow Mobile13 STATUS, then implement a separately reviewed signed PICK using the original journal and one-shot approvals only. Retain HMAC/nonce/owner checks.

## Sources (design only, no copied runtime code)
- Android AccessibilityWindowInfo: https://developer.android.com/reference/android/view/accessibility/AccessibilityWindowInfo
- Android UiAutomation windows: https://developer.android.com/reference/android/app/UiAutomation
- Appium UiAutomator2 Multiple Windows/Displays: https://appium.github.io/appium-uiautomator2-driver/latest/guides/multiwindow/
- Appium UiAutomator2 native listWindows: https://appium.github.io/appium-uiautomator2-driver/latest/reference/execute-methods/
- Original JH Secure56 split-screen evidence module in this repository.

## Gates
GitHub isolated CI with original signed/owner/security source BYTE-IDENTICAL; source-only unit regressions for 11 families of negative inputs, exact physical window IDs, missing option binding, duplicate window, stale screen, cross-display and current command HMAC proof. No APK build, Render release, owner-volume migration, phone action or retry of the original SELECT OPEN in this branch.
