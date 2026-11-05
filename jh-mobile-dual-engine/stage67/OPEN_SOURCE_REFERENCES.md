# Stage67 open-source references and adoption boundary

## Playwright Mobile
Canonical: Microsoft Playwright Android API. Use the experimental `_android` API against a real Android device only when an authenticated ADB daemon is reachable. Do not substitute server Chromium or a separate profile.
- `_android.devices({host,port})`
- `AndroidDevice.launchBrowser()`
- ordinary Page/Locator APIs after browser attach: `selectOption`, locator/page keyboard actions, waits, screenshots
- `AndroidDevice.shell()` only for fixed allowlisted Chrome-focus restoration, never arbitrary user shell

## Android accessibility
- Google TalkBack `ScrollableNodeInfo`: reference for direction-aware scroll selection and avoiding wrong-parent scroll.
- Google TalkBack labeled-by handling: prefer explicit accessibility label relationships before positional heuristics.
- Appium UiAutomator2 multi-window model: reference for package/window/display identity and topmost-window selection.
- AndroidX UI Automator remains preflight/test tooling only; do not ship it as the JH production execution engine.

## JH adoption boundary
1. No new third-party runtime/APK is installed by Stage67.
2. Existing Secure56 owner command, one-shot receipt, no-replay and phone-local sensitive approval remain authoritative.
3. A Playwright DOM test is not a phone E2E result.
4. Playwright Mobile is promoted only after the exact same owner phone is attached through an authenticated ADB/Playwright Android transport and the effect is read back.
5. Android and Playwright implementations are maintained as feature pairs; manual is kept only when both automatic providers fail safely/no-effect.
