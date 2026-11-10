# JH Glass Bridge — Stage 6 CameraAccess source candidate

**Status 2026-11-10:** independent **development-only** CameraAccess Android source overlay. **NOT installed, NOT deployed, no JH/plugin server changes.**

## Pinned official source
- Meta Wearables DAT Android: https://github.com/meta/meta-wearables-dat-android
- Commit: `f4371bc9f90249d51eb07d7f8a61e8d829294f16` (official CameraAccess sample used successfully on phone)
- Only the CameraAccess sample is modified in a temporary development checkout; installed `com.koreanlifehub.bridge` is never touched.

## Files
- `apply_cameraaccess_patch.py`: fail-closed idempotent patch of `CapturePreviewScreen.kt` (rejects unexpected upstream signature). Copies `JhGlassPhotoClient.kt` into `jhglass/` namespace.
- `JhGlassPhotoClient.kt`: pixel-only JPEG recompression <= 2 MiB (no original EXIF), HTTPS-only sender with 10 s timeouts, redirect disabled, 90-second pairing validation, never puts upload token in URL, log or disk. **Default `JhPairingProvider { null }` ensures zero network calls.**
- `test_patch.py`: local source-level tests for original Share intact, separate JH button, default-disabled behavior and safety checks. These do not substitute for Android device tests.

## UI behavior
- After photo capture, existing Share remains intact.
- A new separate `JH로 보내기` button appears **disabled by default** with explanatory status; it cannot silently send photos and cannot charge an API.
- No live JH pairing provider is connected yet. A production provider must obtain a short-lived one-shot credential **only** after a verified Secure56 phone-local approval; never use Intent extras, deep-link URL, clipboard, browser Share or static API tokens.
- No patient-identifying images until an independent clinical privacy/consent design is verified.

## Important constraints
- The HTTPS route `/jh-glass/v1/photo` is **not mounted** on the running JH server. A successful Android source compile does not imply successful photo transfer.
- The independent sample does not inject an attachment into the current ChatGPT conversation; that remains a separately verified MCP image-return requirement.
- No OpenAI API key or API call is used here, and the standard ChatGPT subscription is not treated as unlimited free API usage.
- Any Android build artifact produced for local tests must pass source/security/signing gate and separate user approval before a phone install. Do not uninstall existing JH or CameraAccess apps.

## For testing without device

```
cd jh-server/owner-setup/glass-bridge/android_cameraaccess
python3 -m unittest -v test_patch.py
python3 apply_cameraaccess_patch.py /path/to/official/samples/CameraAccess
cd /path/to/official/samples/CameraAccess
./gradlew --no-daemon :app:compileDebugKotlin
```

Do not run the patch against unknown or previously modified source. The official `Share` and existing camera stream functionality must remain unchanged.