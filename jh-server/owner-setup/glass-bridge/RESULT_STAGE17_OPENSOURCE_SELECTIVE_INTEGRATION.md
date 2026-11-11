# G Glass — Stage17 external open-source evidence and selective integration (2026-11-11)

## Provenance and current goal

- This review incorporates the user's Library file **JH_안비서_오픈소스_조사_인계서_20261111.md** (13,864 bytes, 130 lines) and the already populated JH_OpenSource_Scout_v1.json record \`inv-meta-glasses-gpt-20261111\` (E3_CODE_VERIFIED).
- The older research uses **안비서**. The user's **latest confirmed** spoken brand is **G Glass (지글라스)**, target launch “Hey Meta, start G Glass”. The original JH assistant and Secure56 constraints are unchanged.
- Final user experience: phone in pocket, no ChatGPT/Meta AI phone UI visible; one explicit image request, glasses Speech (Korean), GPT API funded **only** by verified complimentary credits, JH routing, answer spoken through glasses. No unpaid-to-paid rollover, automatic fallback, incidental patient capture, or MediaProjection.
- Current Android developer baseline: **Meta DAT 1.0.1** pinned SHA \`f4371bc9f90249d51eb07d7f8a61e8d829294f16\`; original user's installed CameraAccess stream proof retained. Source-only G Glass candidate is on \`feature/jh-glass-photo-mailbox-20261110\`, isolated package \`com.koreanlifehub.jhglassprobe\`. Do NOT change original JH APK or CameraAccess installation.

## Candidate-by-candidate verified code and gate

| Candidate | Source verified | Reuse judgment | Legal/security |
|---|---|---|---|
| [Meta official DAT Android](https://github.com/meta/meta-wearables-dat-android) | v1.0.1 CameraAccess, Voice Invocations, Speech; User's prior Stage15/16 build | **KEEP AS AUTHORITY**. No replacement SDK or alternative direct glasses hardware backdoor. Voice launch available by Meta-configured app name, experimental Beta. | \`LICENSE\` is **Meta Wearables Developer Terms**, not a permissive MIT blanket |
| [Intent-Lab/VisionClaw](https://github.com/Intent-Lab/VisionClaw) pinned \`3f39807058c5ddf9faf763de3cbc70aa0b5f6fad\` | \`agent/main.py\` uses LiveKit session and has OpenAI Realtime branch; Android \`LiveKitSessionViewModel.kt\` states phone microphone; \`StreamingService.kt\` includes foreground / wake strategy | **REFERENCE ARCHITECTURE ONLY**: short session lifecycle, frame throttling, reconnect and interruption ideas. **NO** default research gateway, LiveKit cloud service, OpenClaw agent executor, or copying developer-terms code. Streaming continuous frames would use more battery/credit than one still image. | Root \`LICENSE\` links **Meta developer terms**. External service keys/billing and code-copy rights require additional review; **REVIEW**, not SAFE |
| [lpecom/GemGlasses](https://github.com/lpecom/GemGlasses) pinned \`566343857670eb2c7f1ea39b8c7c3caa19de1221\` | \`app/src/main/java/com/lpecom/gemglasses/audio/BluetoothAudioRouter.kt\` uses Android \`setCommunicationDevice\`, audio mode; \`AgentForegroundService.kt\` sessions/wakelock; \`RealGlassesBackend.kt\` DAT API review note | **ORIGINAL DERIVED PRINCIPLE**: discover Bluetooth audio endpoints, refuse ambiguous outputs, clean session shutdown. Do NOT copy its device-first heuristic or force communication mode: user has existing YouTube Music/EQ, phone calls and other Bluetooth devices. An exact glasses playback route needs real-device confirmation. | **MIT**; associated Meta SDK/Gemini terms separate. No source copied into G Glass. Whole-code merge **REVIEW** |
| [kirill-markin/meta-glasses-ios-openai](https://github.com/kirill-markin/meta-glasses-ios-openai) pinned \`fd998ee3b8248fae11c099c8e91ee6be53f7212d\` | Swift \`RealtimeAPIClient.swift\` and \`AudioManager.swift\` support OpenAI Realtime, interruption, HFP | **DESIGN REFERENCE** (not Android code): TTS cancellation/interrupt ordering, audio session lifecycle. Do not copy Swift or embed persistent GPT API keys in Android; JH server should own key. | **MIT**, but platform iOS and optional Perplexity service not imported |
| [denya/rayban-meta-realtime-agent](https://github.com/denya/rayban-meta-realtime-agent) pinned \`5d48399d4409debeebebf243d448117e3f26bf0f\` | \`services/gateway/src/realtime.js\` uses server key and short-lived Realtime secrets; \`security.js\` protects service token; private knowledge-tool design | **CONCEPT ONLY**: short expiry, server-held API key. No code copied or deployment. Prefer existing JH owner-bound Secure56 and GPT free-credit gate. | No verified root LICENSE in research; **CODE COPYING BLOCKED** absent owner license |

### Meta language and Beta limitation — separate blocker

Meta discussion [#209](https://github.com/meta/meta-wearables-dat-android/discussions/209) and the [official voice invocation skill](https://github.com/meta/meta-wearables-dat-android/blob/f4371bc9f90249d51eb07d7f8a61e8d829294f16/plugins/mwdat-android/skills/voice-invocations/SKILL.md) document:
- Android launch requires actual Wearables Developer Center application name/version and a release/Beta channel; Developer Mode-only testing may receive zero \`LaunchApp\` events.
- Vendor/community English-US app-by-name invocation works in a Beta configuration; several Korean (\`ko-KR\`) invocations are classified as generic questions rather than app launch.
- **English letters in the name G Glass do not prove Korean interaction-language routing works**. Changing the default Meta language without user's explicit request is forbidden. Even a successful English app launch does not itself prove subsequent Korean ASR.
- G Glass can do **read-only code-level preflight / controlled UI test** now. Meta Beta registration, phone-local permission acceptance and real glasses validation are not yet done.

## Implementation completed in this development branch

**No external code was copied.** From the GemGlasses audio-routing problem we wrote original Kotlin \`android_cameraaccess/GGlassAudioOutputGuard.kt\` and \`GGlassAudioOutputGuardTest.kt\`. The guard classifies **Android Bluetooth MEDIA output candidates** into:
- \`NONE\`: no compatible BT media output → no TTS test
- \`AMBIGUOUS\`: two or more candidate output devices → no TTS test, no arbitrary first-device selection
- \`SINGLE_BLUETOOTH_CANDIDATE\`: allow **test-only** TTS and emit \`BLUETOOTH_MEDIA_OUTPUT_CANDIDATE_ONLY\`; **NOT a claim of actual Ray-Ban speaker routing**

The existing \`JhGlassVoiceProbe.kt\` now invokes this fail-closed guard and rejects ambiguous BT device configurations. \`apply_handsfree_probe.py\` copies the original Kotlin file into the source-only official CameraAccess overlay and \`test_stage14_voice_patch.py\` checks source integrity. Android package, Secure56, permissions, phone recorder, existing audio focus, EQ and Meta main stream unchanged.

**Local evidence:** \`kotlinc GGlassAudioOutputGuard.kt GGlassAudioOutputGuardTest.kt -include-runtime -d /tmp/gglass_route/test.jar && java -jar ...\` → \`G_GLASS_AUDIO_ROUTE_GUARD_PASS assertions=16\`; genuine Kotlin compiler, no Android hardware exercised.

**CI VERIFIED SUCCESS:** [GitHub Actions run 42961296388](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/42961296388) (job `130328186213`), official pinned Meta DAT 1.0.1: **10/10 Stage14 source tests + 8/8 Stage16 isolation tests PASS**, `JH_STAGE16_PINNED_PACKAGE_ISOLATION_PASS`; real Android `:app:compileDebugKotlin :app:processDebugMainManifest` **BUILD SUCCESSFUL in 1m41s**, `JH_STAGE16_KOTLIN_AND_MERGED_MANIFEST_PASS`. Separate local Kotlin media guard 16/16 PASS. No production deploy, paid API call, Windows signing, camera/photo upload, phone installation or AV bypass in this stage.

## Next development gates

1. **Exact real output routing:** Android inventory and successful TextToSpeech callback do NOT prove actual Ray-Ban speakers (Android TTS media playback route may be different). With an explicitly approved physical test, check the output device selected by Android and audibly confirm on glasses, including phone call interruption and disconnect. No forced \`MODE_IN_COMMUNICATION\` before proof, especially due to JH's existing audio/EQ path.
2. **One user-directed still photo** + Korean final transcript. Avoid permanent video streaming and auto-capture. Use Meta official camera API already proven; strip photo from state after one-shot and guard against sensitive bystanders/patients.
3. **Actual free-credit GPT API funding control**: user explicitly confirmed GPT API (not local AI fallback) and **0 additional paid usage**. Current credit balance, expiry, funding order, and account-level hard block are unverified; GPT API remains OFF until independently proven. Avoid default realtime/LiveKit services that may require separate billing.
4. **Phone in pocket**: phone-lock and background start limitations, Meta Beta name registration for **G Glass**, Android foreground connected-device/microphone policy, no unsolicited permission click, auto-retry or microphone recording.
5. **Release gate**: source compile + static security + genuine target signing and user's separate install approval → one physical end-to-end trial. No APK installation, JH runtime or Render production changes in current development stage.

## Source pointers retained

Library research handoff: \`JH_안비서_오픈소스_조사_인계서_20261111.md\`. Public technical pointers only are in JH GitHub; **private raw Library files, personal tokens, device photos and private JH Android APK source were NOT uploaded to the public repo**. This reference comparison is E5 JH fit **for the selectively evaluated patterns**, not E6 full application deployment or live-device success. Third-party whole-code security verdict remains REVIEW (no supplied executables scanned).
