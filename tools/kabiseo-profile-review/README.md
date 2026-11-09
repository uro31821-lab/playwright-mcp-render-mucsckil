# 카비서 v0.19 — 촬영 화면 식별자료 사전검토 후보

This is a JVM-only offline review tool, NOT a registered camera route, collector, Android integration, APK or local approval system.

## Concrete gap found
The existing `host-kabiseo-assist/integration/bridge_helper.kt.txt` supplies `Profiles { _,_,_ -> null }`. This is an intentional fail-closed placeholder, not a working enrollment mechanism. Resolving the server/runtime hold alone will NOT let that current Android candidate recognize the GPT camera. No production resource IDs or signer/profile have been observed in this work.

## Implemented here
`CameraProfileReview` reviews metadata-only samples against explicitly selected resource IDs. It requires two distinct camera openings and both chat and photo-review negative controls, identical package/version/signer/display scope, complete unobscured observations, independent visible/enabled positive controls and no camera signature collision on negative screens. Duplicate reads, mixed fold/display contexts, input/password fields and missing IDs cannot be treated as sufficient camera evidence.

The output is ALWAYS an identity-bound, **non-attested draft**. The existing `CameraSurfacePolicy` rejects this draft, which is tested against the real unchanged policy. Sample labels and identity strings are not authenticated by this tool; passing fixtures does not prove real capture, local approval or camera support. No profile enrollment or automatic UI fallback is provided. The tool reads no picture, node text or content description; it has no Android, network, file-writing or scheduler API.

## Execution and boundaries
Run `python3 tools/kabiseo-profile-review/run_tests.py` with an already installed `JAVA_HOME_17_X64`. Uses javac/java17, Python stdlib, and the existing real core policy. No new package, npm, Gradle, target Node runtime, JH server, phone call or installation is needed. Dedicated CI paths avoid rebuilding the unchanged Android module. Existing runtime REVIEW policy remains untouched. Generated tests use invented `fixture.camera` IDs only and these must never be deployed.

## What remains before real camera use
The existing approved metadata read path needs a separately reviewed local evidence collector and an actual local review/enrollment handoff bound to package, version, signer and measured display configuration. The current bridge still returns null; this tool does NOT silently replace it. Actual resource IDs may be unavailable on the current GPT camera; in that case fail closed rather than inventing IDs or using coordinate guesses. Do not upload chat text or photographs to obtain this metadata.

No user screenshots, repeated pinch/reset test, new app installation, alert or subscription are requested now. Existing source ZIP `JH77_LOCATION_ONCE_FIX2.zip` and v0.13 APK/build evidence remain historical and unchanged.
