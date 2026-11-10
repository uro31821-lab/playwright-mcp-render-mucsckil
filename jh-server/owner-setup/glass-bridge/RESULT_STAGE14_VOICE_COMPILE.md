# JH Glass — Stage14 Voice/Speech/Korean TTS CI result (2026-11-11 KST)

**Source-only**: compiled a CameraAccess-derived voice proof-of-concept against **Meta DAT SDK 1.0.1** official pinned source. No APK assembled/signed/installed; no phone or Render JH server or Plugin changes; no paid API request.

## GitHub hosted verification

- Successful workflow: [JH Glass Stage14 Voice + Korean TTS Compile (run 42927492768)](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/42927492768).
- JH tested head commit: `d4dc89d648e5767f0e7ae36758c635236c575b72`.
- Job ID: `130217574335`, conclusion **SUCCESS**.
- Official Meta SDK pinned commit `f4371bc9f90249d51eb07d7f8a61e8d829294f16`: `META_PINNED_SDK_101_CONFIRMED`.
- CameraAccess patch Python source tests **8/8 PASS**.
- Patch first application and second idempotent application verified; `STAGE14_VOICE_PATCH_IDEMPOTENT_PASS`.
- Actual Android Gradle compile: `./gradlew --no-daemon :app:compileDebugKotlin` → **BUILD SUCCESSFUL in 1m 23s**, `STAGE14_VOICE_KOTLIN_COMPILE_PASS`.
- Sentinel: `STAGE14_SOURCE_ONLY_NO_META_WDC_REGISTRATION_NO_JH_APP_INSTALL_NO_OPENAI_API`.

## Source additions and behavior

- `android_cameraaccess/JhGlassVoiceProbe.kt`: only Meta-validated app voice launch intent or `LaunchApp` stream event can initiate one timed microphone permission/Speech session. Final transcript consumed once; **test-only**, not logged/uploaded, generates a fixed Korean TTS phrase. Avoids arbitrary screenshot/online inference API. TTS completion listener waits for reported `onDone`, bounded to 10 seconds, then closes. Checks for a Bluetooth media output candidate before TTS.
- `android_cameraaccess/apply_handsfree_probe.py`: pinned official CameraAccess source overlay adds cold/warm Voice Invocation intent handling on `MainActivity`, DAT Speech 1.0.1 version catalog/dependency and voice probe wiring after DAT initialized. Existing camera activity behavior and initial permissions remain intact.
- `android_cameraaccess/test_stage14_voice_patch.py`: source tests reject unexpected upstream, avoid duplicates/extra platform permissions, assert no OPENAI_API_KEY/no network/MediaProjection.
- Third-party APK and signing key were not shipped. The current user's installed CameraAccess app still lacks these changes.

## What the test DOES NOT prove

- Meta Developer Center/Beta Voice Invocation approval or a successful `Hey Meta, start <app>` launch **on actual glasses**.
- Korean ko-KR native activation (reported vendor limitations) or Korean DAT Speech transcript on the user's glasses/firmware.
- Actual audio **heard from Ray-Ban Meta glasses** rather than another Bluetooth device/phone speaker; a TTS completion callback cannot establish route.
- Background/locked-screen JH runtime; this Stage14 prototype is **Activity-bound**, not a verified long-lived foreground service.
- The glasses photograph being captured on voice command or processed by a real/offline vision model; this is one-utterance **mock answer only**.
- GPT API-free cloud inference, arbitrary ChatGPT current-thread injection, or full JH Secure56 integration.
- Real-device performance, permissions and Android security gates, production release/sign/install.

## Development corrections already resolved

- First CI failed Python unittest test-folder setup; corrected.
- Another CI failed missing `mwdat-speech` alias in the official CameraAccess version catalog; added exact official 1.0.1 `mwdat-speech` declaration, matching BirdSpotter sample.
- Final TTS code removed an early 1.5-second fixed cutoff, waits for bounded utterance completion callback; successful CI proof **42927492768**.

## Next action

If the user wishes to do actual hands-free testing, **first determine WDC/Beta Voice Invocation eligibility and app-name launch availability** without changing the installed JH app. Then make a separate CameraAccess development candidate with the **same local Windows debug signing key** used for the already installed sample; complete AV/package/signature tests and ask explicit permission for one update installation. Physical test sequence: glasses app voice launch (not necessarily Korean), Korean DAT Speech, audible Korean TTS in glasses, phone UI closed; no API cost. If voice invocation is unsupported in this locale/channel, use Meta DAT glasses inputs user trigger as an explicitly labeled alternate, not screen sharing.

Source details: `STAGE14_VOICE_SPEECH_TTS_PROBE.md`; seven-part handoff: `HANDOFF_STAGE14_CURRENT.md`.
