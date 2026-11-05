# Stage67 Android execution references

## Android accessibility
- Google TalkBack ScrollableNodeInfo: direction-aware scroll selection and avoiding wrong-parent scroll.
- Google TalkBack labeled-by handling: prefer explicit accessibility label relationships before positional heuristics.
- Appium UiAutomator2 multi-window model: reference for package/window/display identity and topmost-window selection.
- AndroidX UI Automator remains preflight/test tooling only; do not ship it as the JH production execution engine.

## JH adoption boundary
1. No new third-party runtime or APK is installed by this routing layer.
2. Existing Secure56 owner command, one-shot receipt, no-replay and phone-local sensitive approval remain authoritative.
3. Automatic mobile behavior is promoted only after exact owner-phone execution plus readback.
4. Current routing is Android automatic when verified, otherwise manual.
5. Historical alternate-engine experiments remain available only through Git history and Stage68/69 evidence records; they are not current runtime code.
