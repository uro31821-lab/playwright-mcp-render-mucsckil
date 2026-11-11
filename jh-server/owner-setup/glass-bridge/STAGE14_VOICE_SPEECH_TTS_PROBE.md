# Stage 14 — Voice-launch, glasses Speech, Korean TTS feasibility probe

**Status:** DEVELOPMENT SOURCE ONLY — no installed APK, live phone E2E, JH server deployment, Meta WDC registration, image model, or OpenAI API call.

## Intent and exact user experience

- Worn Ray-Ban Meta glasses, phone in pocket, ChatGPT and Meta AI **app UIs not open**.
- User-initiated Meta Voice Invocation launches the dedicated CameraAccess-derived JH experience **by approved app name**, NOT a bare `Hey Meta` replacement.
- With required one-time DAT microphone permission granted, attach `Speech` to a DeviceSession and consume **one final utterance** (18-second timeout); send a fixed Korean voice reply using Android TTS over the available media audio route. **No photo capture or visual inference in this probe.**
- Later stages combine one consented glasses-camera photo, offline visual inference or truly hard-zero-paid alternative, JH assistant routing, and on-glasses playback.

## Official source basis

Official Meta repository `meta/meta-wearables-dat-android` exact pinned commit `f4371bc9f90249d51eb07d7f8a61e8d829294f16`, SDK version `1.0.1`, sample `samples/CameraAccess` and BirdSpotter voice/speech/TTS implementation. Experimentally supported methods:
- `Wearables.startVoiceInvocationsStream(AutoDeviceSelector())`
- `com.meta.wearable.dat.core.voiceinvocations.isVoiceInvocationsIntent(intent)`
- `LaunchApp.responseHandle.sendSuccess(null)` exactly once, promptly
- `DeviceSession.addSpeech()`, `Speech.start()`, `Speech.transcriptions`, `Permission.MICROPHONE`
- `android.speech.tts.TextToSpeech` with `Locale.KOREAN` and `USAGE_MEDIA`
- Official `mwdat-speech` 1.0.1 is in BirdSpotter version catalog but NOT CameraAccess's stock version catalog. Stage14 overlay adds exactly that alias and dependency to the CameraAccess source-only staging copy.

Sources:
- https://github.com/meta/meta-wearables-dat-android/blob/f4371bc9f90249d51eb07d7f8a61e8d829294f16/plugins/mwdat-android/skills/voice-invocations/SKILL.md
- https://github.com/meta/meta-wearables-dat-android/blob/f4371bc9f90249d51eb07d7f8a61e8d829294f16/plugins/mwdat-android/skills/speech/SKILL.md
- https://github.com/meta/meta-wearables-dat-android/blob/f4371bc9f90249d51eb07d7f8a61e8d829294f16/samples/BirdSpotter/app/src/main/java/com/meta/pixelandtexel/birdspotter/data/dat/DatGlassesVoiceRepository.kt
- https://github.com/meta/meta-wearables-dat-android/blob/f4371bc9f90249d51eb07d7f8a61e8d829294f16/samples/BirdSpotter/app/src/main/java/com/meta/pixelandtexel/birdspotter/data/audio/SystemSpokenOutput.kt

## New JH files

- `android_cameraaccess/JhGlassVoiceProbe.kt`: a code-only experimental voice launch listener, a single DAT Speech transcript, and a **fixed neutral** Korean TTS test sentence. It makes zero image/model/network API calls. Explicit voice launch required; no continuous monitoring except the SDK's approved app launch channel and a brief speech window.
- `android_cameraaccess/apply_handsfree_probe.py`: fail-closed patch of OFFICIAL pinned CameraAccess MainActivity plus Gradle `mwdat-speech` alias. Retains existing camera behavior; captures native Voice Invocation cold and warm launch intents; connects the probe after DAT init.
- `android_cameraaccess/test_stage14_voice_patch.py`: mock-upstream source guard tests for idempotent patch, dependency, unknown-upstream rejection, no paid API/photo capture.
- `.github/workflows/jh-glass-stage14-voice-compile.yml`: pins Meta source commit, Python test, Kotlin `:app:compileDebugKotlin`, and source-only sentinel. It does not assemble/sign/install an APK or deploy.

## No unsupported promises

- Voice Invocations and Speech are **experimental** and depend on current Meta Wearables Developer Center/eligible beta channel settings. No in-app code can force the glasses to use JH as the default Meta assistant or claim a user-defined wake word.
- Korean Voice Invocation launch availability is unverified. A supported English app launch may have to be used for the *activation only*.
- An Android voice launch can bring the **JH app** to foreground automatically, even if the user never manually opens it. True screen-off/background stability and the ability to launch when the process is dead require device verification.
- A Bluetooth-capable output in the device list, and even a successful `TextToSpeech.speak`, do NOT prove that voice was audible **through Ray-Ban Meta speakers**. Must confirm on actual glasses, not phone speakers/another headset.
- The current source uses a test phrase explicitly stating that image analysis is not yet implemented. The actual photo/GPT/JH routing and offline vision require separate work.
- No user consent can be auto-clicked; DAT microphone initial grant may redirect into Meta AI app one time.
- No OpenAI API calls, credentials, external photo services or cloud speech providers are included in Stage14.

## Stage14 final hosted CI readback

- [GitHub Actions run 42927492768](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/42927492768), tested commit `d4dc89d648e5767f0e7ae36758c635236c575b72`: Python **8/8 passed**, pinned Meta SDK 1.0.1 check, idempotent patch, actual Kotlin **BUILD SUCCESSFUL in 1m 23s**. **No APK install, no WDC enrollment, no API**.
- Korean TTS completion now uses a bounded `UtteranceProgressListener.onDone`, not a 1.5-second cutoff; source-only result proves compile, **not** audible route to glasses. Evidence in `RESULT_STAGE14_VOICE_COMPILE.md`.

## Next test gate

1. Confirm hosted CI compile result of `.github/workflows/jh-glass-stage14-voice-compile.yml` (actual Kotlin compile, not just Python source tests).
2. If PASS: source review, build/sign debug *separate CameraAccess test app* only after explicit user approval, then one real glasses validation: English/ko-KR Voice Invocation app launch, single Korean ASR final, actual Bluetooth spoken output with phone tucked away. Do not repeat already verified DAT streaming.
3. If voice invocation activation is blocked by Meta regional/Beta restrictions, choose one alternative user-actuated input (e.g. SDK glasses button) and preserve phone-in-pocket behavior. Never silently downgrade to GPT screen reading or MediaProjection approvals.
4. Post successful speech+audio proof only: one user-commanded photo, local on-device vision or verified hard-zero-cost AI route, JH routing, actual sound from glasses.

## Operational state

JH Secure Live plugin, existing `com.koreanlifehub.bridge` app and Render service are unchanged. Stage14 source belongs exclusively to the existing development branch. Version 184 original native ZIP is not modified, and no private source/key/photo was copied to public GitHub.
