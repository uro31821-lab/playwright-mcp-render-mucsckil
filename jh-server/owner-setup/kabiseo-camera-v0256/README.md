# KaBiseo v0.25.6 Secure56 camera settings extension

Goal: one GPT camera-setting request changes only the already-visible RIGHT KaBiseo camera mode/style.

Flow:
1. Existing Secure56 signed READ_ONLY internal binding job reads current KaBiseo session/window binding.
2. Same GPT command id signs one WRITE_REVERSIBLE config job with that exact binding and direct user request.
3. Android v0.25.4 ShotDirective parses the natural-language request; existing mode/style setters apply it.
4. CameraConfigGate atomically re-checks same session/window and stores a no-replay receipt.

Excluded by design: Activity/camera launch, shutter/capture, gallery read, photo transfer/upload, GPT camera-result callback, automatic replay.

The base Secure56 catalog digest remains unchanged. This is a supplementary extension exactly like the existing EBISEO audio extension.

## Phone verification — 2026-11-11

JH185 candidate was built and signed with the original certificate, installed as an update, and read back as versionCode 185. Post-install Secure56 status reported secureActive=true, appVersionCode=185, KABISEO_CAMERA_SETTINGS_ONLY=true, and the expected camera extension digest/protocol. Existing EBISEO FIX13 was preserved. Auto capture, photo transfer, GPT camera-result callback, uninstall/data reset, and server deploy remained disabled at this checkpoint.

Remaining gate: deploy this server PR and run GPT -> Secure56 -> current RIGHT KaBiseo camera mode/style E2E.
