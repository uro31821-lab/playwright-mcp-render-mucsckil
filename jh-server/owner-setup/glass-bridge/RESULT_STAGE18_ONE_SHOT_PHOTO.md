# G Glass — Stage 18 one-utterance standalone photo pipeline (2026-11-11 KST)

## Actual goal and previous verified baseline

**G Glass** (지글라스), intended “Hey Meta, start G Glass”. User asks in Korean **“이게 뭐야?”**, the glasses take exactly **one** photo and later GPT vision would answer in Korean on the glasses speaker, with no ChatGPT app foreground requirement. The user must not incur unapproved extra API charges. G Glass is not yet registered for Meta WDC Beta voice invocation or running as a phone background assistant.

Reuse verified Stages 14–17:
- Official Meta DAT Android SDK **1.0.1**, pinned commit `f4371bc9f90249d51eb07d7f8a61e8d829294f16`.
- Real user glasses ↔ CameraAccess video/preview succeeded previously; no need to repeat.
- Stage17 [CI run 42961296388](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/42961296388) source tests and Kotlin/manifest compile success; no installed app changed.

## Source-only code introduced

All files are on `feature/jh-glass-photo-mailbox-20261110` in `jh-server/owner-setup/glass-bridge/android_cameraaccess/`:

- `GGlassOnePhotoCommand.kt`: **requires a final transcript** and matches **only** an exact small allowlist of Korean photo questions: “이게 뭐야?”, “이거 뭐야?”, “이것이 뭐야?”, “이게 뭔지 알려줘” and equivalent “지글라스 ...” forms. Rejects partial results, longer ambient clinic chatter, “사진 찍지 마”, unrelated phrases, and transcripts longer than 80 characters. The command itself does not touch hardware.
- `GGlassOnePhotoCommandSelfTest.kt`: 21 deterministic allow/deny cases, manually reproduced from the same pure Kotlin command logic and compiled/executed with Kotlin/JVM locally: **21/21 PASS** (`G_GLASS_ONE_PHOTO_COMMAND_PASS cases=21`). This local test used a manually replicated logic/test file rather than a byte-exact fetched GitHub source; **do not claim a GitHub test job ran it**.
- `GGlassOneShotPhotoProbe.kt`: uses the **official experimental standalone Camera Photo** capability, **without starting a video stream**. After STARTED session and already granted DAT CAMERA permission, attach Camera → access `camera.photo` → wait `PhotoState.STARTED` → pre-subscribe to exactly one `photo.photoStream` event → call `Photo.capturePhoto(PhotoResolution.FULL, PhotoQuality.HIGH)` once → require nonempty `PhotoCaptureData.imageData`, report only status → cancel collector and stop Photo then Camera. 10-s setup / 20-s transfer bounded timeouts. **Image bytes are not saved, copied to files, uploaded, logged or sent to GPT**.
- `JhGlassVoiceProbe.kt`: once the glasses deliver one final explicit photo phrase, stops speech before initiating photo capture, reports `GLASSES_USER_PHOTO_REQUEST` and speaks a fixed success/failure line. All other speech retains original inert Korean TTS test response. Existing bounded Bluetooth output guard and voice-invocation duplicate suppressor preserved.
- `apply_handsfree_probe.py`: adds exact source files to **pinned official CameraAccess staging checkout**, preserving deployed JH, JH owner session, installed Meta CameraAccess, package isolation, original Android permissions, voice safety and TTS; overlay is idempotent and refuses source mismatch.
- `test_stage14_voice_patch.py`: 2 new source tests validate command and no-network/photo cleanup boundaries (Stage14 suite now **12/12**).

## Exact official SDK signature diagnosis (not guessed)

The initial Stage18 Android CI failed at photo imports and on `.fold()`. We performed read-only Maven AAR bytecode introspection in GitHub hosted CI instead of guessing API symbols:

- Official class `com.meta.wearable.dat.camera.photo.Photo`
- `PhotoState`, `PhotoResolution`, `PhotoQuality`, `PhotoCaptureData` live under `com.meta.wearable.dat.camera.photo.types` (NOT `...camera.types`)
- `Photo.capturePhoto(PhotoResolution, PhotoQuality)` returns **void/Unit**, NOT a DatResult. Success must be inferred from subsequent `Photo.photoStream` receipt or error state.
- `Photo.photoStream` is `SharedFlow<PhotoCaptureData>`, and `PhotoCaptureData.imageData` is `byte[]`. This is why code now checks `captured.imageData.isNotEmpty()`, with no retention.
- `Photo.stop()` and `Camera.stop()` are called in cleanup.
- Evidence [GitHub Actions run 42963328293](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/42963328293), job `130334745579`. The first signature CI run did not print javap signatures due to regex escaping; second corrected inspector succeeded.

## Verified CI on current candidate

[GitHub Actions run 42963643551](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/42963643551), job `130335732828`, head commit `454da5f1d8759eea4ad5cd14e03a86c206ef6116`: **SUCCESS** on pinned official SDK:
- Python Stage14/Stage18 source and security guards: **12/12 PASS**.
- Stage16 separate-package / no-JH-overwrite tests: **8/8 PASS**.
- Pinned Android actual Gradle `:app:compileDebugKotlin :app:processDebugMainManifest`: **BUILD SUCCESSFUL in 1m40s**.
- No release APK, phone install, Meta WDC change, JH/Render update, new signing key, actual photo capture or OpenAI API charge.
- Earlier Stage18 CI failures were real and corrected by inspecting the actual Maven 1.0.1 signature, rather than weakening tests. Success is for **source compile** only.

## Privacy, security and limits

- One photo per final whitelisted voice request, and existing 2.5s Meta Intent/LaunchApp duplicate protection. No passive audio/patient photo uploads. DAT camera permission is **read-only**: if not granted it reports `GLASSES_CAMERA_PERMISSION_REQUIRED` and does NOT silently launch Meta AI, click permission, change OS access, or store images.
- No model calls; no AI classification or user data analysis. Status `GLASSES_ONE_PHOTO_EVENT_RECEIVED` is **NOT an image accepted by GPT**, not a photo delivered to this chat, and not a hardware success until an actual user device test.
- SDK's experimental Camera Photo availability on the user's real Ray-Ban Meta device still **UNVERIFIED**. Depending on firmware/Meta WDC Beta, feature may reject or time out; no automatic fallback to continuous video.
- App remains an **Activity-bound trial**, not a proven locked-screen background service. G Glass Meta app-name voice launch (ko-KR) requires WDC Beta approval; no claim of current hands-free cold start.
- GPT API and connected JH Secure56 owner/account photo ingress still need validated runtime wiring and actual billing credentials/limits; see current `USER_CONFIRMED_GPT_FREE_CREDITS_POLICY.md` for monetary rules. G Glass has not performed any actual API call.
- Original user JH Android source ZIP, phone installation, signing certificates, tokens and private patient images are not published in this repo.

## Next one development action

**Before attempting a live GPT call:** prepare a single explicitly user-approved physical device trial of Stage18. First verify Meta developer app Beta / actual G Glass launch eligibility and the installed test app's signing/source identity; do not replace the user's existing CameraAccess/JH APK. Then in one session with the phone initially unlocked for initial Meta grants, wearer says “이게 뭐야?” and check that **one** photo event appears without any upload. Separately confirm Korean TTS is audible on the Ray-Ban speaker. Photo bytes remain in RAM only and are discarded.

Only after proof of actual capture + audio should we wire one verified owner-bound, one-shot image transfer and the charge-safe GPT API gate. Do not promise zero additional API billing until actual account-level and free/purchased credit ordering are read and enforced.
