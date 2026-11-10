# KaBiseo v0.25.6 Secure56 camera settings extension

Goal: one GPT camera-setting request changes only the already-visible RIGHT KaBiseo camera mode/style.

Flow:
1. Existing Secure56 signed READ_ONLY internal binding job reads current KaBiseo session/window binding.
2. Same GPT command id signs one WRITE_REVERSIBLE config job with that exact binding and direct user request.
3. Android v0.25.4 ShotDirective parses the natural-language request; existing mode/style setters apply it.
4. CameraConfigGate atomically re-checks same session/window and stores a no-replay receipt.

Excluded by design: Activity/camera launch, shutter/capture, gallery read, photo transfer/upload, GPT camera-result callback, automatic replay.

The base Secure56 catalog digest remains unchanged. This is a supplementary extension exactly like the existing EBISEO audio extension.
