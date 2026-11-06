# 카비서 v0.7 — actual-host source integration candidate

## Baseline and boundary
Inspected Library artifact: `JH73_TRIP_INSTALL_FIXED.zip`, SHA256 `876b26376e81a22fa8fd23c3305e9b247849fac2bc87fce6940883762379c4f0`. All 433 original source-manifest hashes matched. This is a Stage62 TripLocation+NativeSelect FIX3 merged **candidate**, not proof of the source currently installed on the phone. Its prior user build result is BLOCKED. Do not install or overwrite the working phone from this package.

`tools/apply_host_patch.py` copies the inspected Android project to a NEW directory, refuses changed guarded files, changes only BridgeService.kt and SecureBridge56.kt, and adds six camera Java files. 431 original files, manifest, minSdk26, Gradle configuration and package identity remain unchanged. The original HMAC/nonce/payload verifier and ordinary split-screen block are preserved.

## Real source wiring, disabled by default
The exact `kabiseo_camera_metadata` job runs only after original Secure56 verification and current-command/journal admission. Its `life_android_kabiseo_metadata` tool is bidirectionally bound to that type and restricted to READ_ONLY. Neither agent_snapshot nor agent_step is an entry to this route. `kabiseoCameraMetadataEnabled=false`; no server tool registration/deployment is made.

The adapter rechecks current session/device/command/generation/lock state, uses the original Secure56 transport clock, and passes bounded work to the existing service main thread. OS package version/signers, window/display/bounds/rotation and structural-event revision must still match. Timeout removes queued work and invalidates late output. No production camera profile is bundled. An unprofiled GPT window is not claimed to be a verified camera surface.

## Build distinctions
CI compiles the six-source read-only Android library (AAR plus core JAR). It does NOT compile the complete JH BridgeService or the entire APK. Actual host-source patching and isolated SecureBridge56 scope tests were run locally. Full host compilation/DEX/minSdk runtime checks remain pending. The patch copies the six source files with API34 annotations and an explicit API34 execution guard; it does NOT force a minSdk34 AAR into the existing minSdk26 manifest or suppress a manifest-merger failure.

No installation, camera launch, Chrome transition, pixel/chat-text read, gesture, face/body correction, shutter/attachment/send, or setting changes. Original restoration requirement remains mandatory before any future automatic zoom activation.

## Local tests recorded
86 JVM scenarios (existing 54 plus new 32); 12 assertions against the real patched SecureBridge56 tool-scope method and its real dependencies; 11 safe-patcher tests. These counts have different units and must not be combined into a single phone-test count. No real device tests were run.

## Next
Complete Android host build after reconciling any newer host edits, implement/review the matching server signed-job producer, enroll the actual camera surface, then test read-only behavior on phone. Automatic zoom remains OFF.
