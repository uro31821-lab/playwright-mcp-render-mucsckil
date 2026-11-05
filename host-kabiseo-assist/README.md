# 🏴‍☠️ 카비서 — read-only camera metadata contract v0.5

This is an isolated JVM contract candidate, NOT a live JH route, Android service integration, APK or replacement camera. No server entry point imports or registers this module.

## Preserved baseline
Base commit: `5d72b78fd3730111076b33e2771f5b6b70f657aa` on `jh-fix3-secure-server` (2026-11-05). Preserve Stage71 Android-then-manual policy and Stage72 current-installed-app decision. No production deployment, APK build/install, split-guard bypass or older source replacement is performed.

## Scope and naming
Display name: 카메라비서 / 카비서. New action: `KABISEO_CAMERA_METADATA`.
The Java package stays `com.jh.pobiseo.assist` for compatibility. `POBISEO_CAMERA_METADATA` is accepted only if the host explicitly authorizes that ORIGINAL action. Never rename an action before signature validation. A replay with the same command/request IDs but a different action is rejected.

## Corrections
A read could previously publish a successful camera result after the route was disabled, the camera opening changed, or the enrolled profile was revoked during the read. These cases were reproduced against the unchanged supplied v0.4 source.

The candidate revalidates the complete live binding, enable flag, permit, layout and profile before returning a result. The reentry guard covers authorization callbacks, not just the reader. Cached receipts remain historical, not current-screen proof.

## Host requirements
`Host.authorize(request)` must be repeatable, read-only and return the CURRENT binding or null. Verify the actual signed command, device/account, cancellation/expiry, camera opening, package/version, window/display and layout. Defaults deny. Do not use fixture profiles in production.

A read-only receipt never permits pixels, gestures or camera changes. Existing GPT capture flow remains the target. No separate camera launch, Chrome switch, face/body retouch, focus/exposure/flash modification, automatic shutter, attachment or send is added.

The original zoom/restoration module is NOT included in this focused repository subset. User-reported manual reset is not automatic restoration proof. Production zoom must remain disabled until actual JH gesture and restoration tests pass.

## Verification
Run `python3 host-kabiseo-assist/tools/test_metadata.py` from repository root: 29 original + 25 new = 54 synthetic JVM scenarios. The full local source package additionally reran its other suites: 211 total scenarios. Do not sum 54 and 211; 54 is a subset.

Still not verified: real Android API compilation, Gradle/DEX/APK, current host wiring, device camera-surface profile, automatic gesture execution and setting restoration. This PR deliberately does not enable a runtime path.
