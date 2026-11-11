# JH Glass — Stage 15: Voice-diagnostic hardware trial candidate (2026-11-11 KST)

**DEVELOPMENT SOURCE ONLY. No live device installation, user account change, WDC/Beta activation, Render deploy, ChatGPT integration, or paid API call.**

## Why this stage was needed

The Stage14 source compiled successfully, but its single-turn voice/speech test depended on Meta's experimental Voice Invocation app launcher. Official Meta discussion #209 (October 2026) and issue #228 describe a verified regional obstacle: an English-language `Hey Meta, open {app}` command may be supported in WDC Beta, but `ko-KR` commands can be rejected upstream before reaching the app. With the language set to English, the glasses Speech transcription may no longer recognize Korean correctly. Meta's public SDK currently has no per-app Speech locale override. On Android 14+, background microphone/camera foreground-service creation has additional limits. A successful Kotlin build alone does not remove these restrictions.

Official references:
- https://github.com/meta/meta-wearables-dat-android/discussions/209
- https://github.com/meta/meta-wearables-dat-android/issues/228
- https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start
- https://github.com/meta/meta-wearables-dat-android/blob/f4371bc9f90249d51eb07d7f8a61e8d829294f16/plugins/mwdat-android/skills/voice-invocations/SKILL.md

## New source-only implementation

1. `android_cameraaccess/JhVoiceActivationGate.kt`: a pure Kotlin monotonic-time 2,500-ms gate. The same Meta voice launch is sometimes delivered as BOTH an Android Intent and an SDK `LaunchApp` event; one utterance may produce two callbacks. The gate accepts at most one activation and refuses repeats and backward clock movements. This does **not** simulate/approve Android or Secure56 permission prompts.
2. `android_cameraaccess/JhVoiceActivationGateSelfTest.kt`: pure Kotlin/JVM deterministic checks for first activation, exact expiry, duplicated 50-ms deliveries, burst of 100, clock rollback, invalid time/window.
3. `android_cameraaccess/apply_handsfree_probe.py`: preserves pinned upstream CameraAccess UI and app identity; adds a **DEBUG-only** `안경 음성 시험` button. A direct user tap invokes **only one** DAT Speech + Korean TTS trial, independent of whether Meta WDC Beta voice invocation is enabled. It also guards against duplicate voice-launch paths, accepts DAT initialization only after `onSuccess`, and retains an in-memory bounded history of diagnostic codes, not transcripts.
4. `android_cameraaccess/JhGlassVoiceProbe.kt`: observes one final utterance with collector subscribed before `Speech.start()`, emits `KOREAN_TEST_PHRASE_MATCH` only if the fixed test words `에비서 안녕` are heard, never stores raw spoken text. A 18-second speech deadline and 10-second TTS completion limit remain; fixed benign speech response only, no photo content or model inference.
5. `android_cameraaccess/test_stage14_voice_patch.py`: expands strict source controls to 10 cases including debug-only test entry, privacy-safe diagnostics, no new permissions, and no paid API.

## Verified tests (exact proof)

- **Hosted CI** [run 42939707305](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/42939707305), tested commit `89f19f08bca8ed0157c7eaff0ff6d434285a4783`: Python source patch checks **10/10 PASS**, pinned official Meta SDK 1.0.1 at `f4371bc9f90249d51eb07d7f8a61e8d829294f16`, idempotent overlay, actual `./gradlew --no-daemon :app:compileDebugKotlin` **BUILD SUCCESSFUL in 1m 25s**, no APK assembly/deploy.
- **Local native Kotlin/JVM**: `kotlinc JhVoiceActivationGate.kt JhVoiceActivationGateSelfTest.kt -include-runtime ... && java -jar ...` reports `JH_GLASS_VOICE_ACTIVATION_GATE_KOTLIN_PASS tests=16`. Exact locally run files' Git blob SHA-1 matched the Github blobs: gate `0fdf4ff95c0fa204d8de4f42f9a22b2bae81e0ca`, test `735da2adbd7feea9245ef1944a8e5cd87c2c9fe0`.
- Early source CI attempts failed because the synthetic Python fixture omitted Meta's actual pinned `setContent` fragment. The test fixture was corrected to include the real official layout, **not** by relaxing upstream source validation. The latest CI success supersedes the earlier failures.
- Neither CI nor local JVM tests prove actual glasses microphone, device wake phrase, TTS Bluetooth route, lockscreen or background playback.

## What the user will see in a future explicitly approved debug device test

The existing CameraAccess photo capture remains intact. The SEPARATELY SIGNED debug trial candidate (NOT currently installed) includes a debug-only `안경 음성 시험` button and local status codes.

One manual tap while the app is in use (not a final product interaction) → allow the Meta DAT microphone request **only if locally prompted** → wearer says exactly **“에비서 안녕”** → app waits for one final transcript and queues a fixed Korean spoken response (if a Bluetooth media route exists). The status history shows `KOREAN_TEST_PHRASE_MATCH` or `NOT_MATCHED`, TTS completion **route unverified** and terminal status; it never saves or transmits speech/transcript/photographs.

This trial can separately prove Korean speech + audible glasses output **before** spending time on Meta WDC Beta app-name launch. User explicitly requires the final product to run with phone in pocket and GPT/Meta AI app UI closed; a manual debug test button does not change that final goal.

## Release blockers (do not skip)

- This app is currently only a source candidate; it was not assembled as an APK, installed or signed with the SAME original Windows debug certificate. Do not replace the existing CameraAccess app with an APK signed by GitHub's ephemeral debug signer or uninstall it.
- Initial DAT microphone permission must be granted by the wearer; do not auto-click OS prompts.
- Meta WDC Beta app-version invitation/product name voice invocations and ko-KR support remain unverified and may be blocked by Meta. The app may not launch from a cold background state even if it compiles.
- Android background microphone/camera start restrictions and Samsung battery/screen-off behavior are not tested. Do not add implicit background capture, autostart or notification bypass.
- No **GPT model** without an external metered OpenAI API if ChatGPT phone app is not used; Strict zero-extra-cost default is offline/local AI or another explicitly agreed supported non-metered service. No GPT Pro-subscription free inference assumption.
- No real image analysis, camera capture voice trigger, ChatGPT image return, or spoken answer from JH has been demonstrated in this stage.

## Next one safe action

Before any installation, verify WDC Voice Invocation Beta eligibility separately from the Korean Speech hardware trial; prepare an APK update with the installed sample's original signer and security review under explicit approval. The **first phone trial** should test exactly the debug button → `에비서 안녕` Korean ASR → audible Korean TTS **on glasses** while the phone screen is turned off after the initial tap. If not supported, record exact hardware/locale result without repeated speculative launches. No API charges or patient photos.

Read this together with `STAGE13_TRUE_HANDSFREE_TARGET.md` and `HANDOFF_STAGE15_CURRENT.md`.
