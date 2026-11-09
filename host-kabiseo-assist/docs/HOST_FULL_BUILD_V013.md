# 카비서 v0.13 — 최신 Stage77 FIX2 전체 앱 검증

2026-11-06 Asia/Seoul. The real uploaded Android source was integrated and built locally; this is NOT the synthetic dependency seed. No private full host source, signing material, font file, APK or tool cache is uploaded by this commit.

## Verified input and integration
- User upload JH77_LOCATION_ONCE_FIX2(1).zip: 7,109,787 bytes / 528 entries / SHA256 fa36cec777b334b44926cfa73dad9960e258a4479acdbf8548f54575510e1d43. ZIP CRC and safe paths PASS.
- Actual source manifest 440 files, validation manifest 75 files, package manifest 527 files: all hashes match.
- Actual private review source: 448 files; original 435 preserved, 5 modified, 8 added.
- Camera changes: existing read-only Java metadata module (6 files), new KabiseoCapabilityReply.kt and 13-test JUnit file, BridgeService/SecureBridge56 additive integration.
- Ordinary secure_device_status remains unchanged. The explicitly signed camera challenge is command-scoped, and capability replies require the existing successful Secure56 verification, current session/device/command/generation, exact type/tool/effect and bounded expiry.
- Camera metadata flag remains false. Profiles remain empty. Capability is NOT permission or evidence for pixels, gestures, capture, zoom or restoration.

## Actual full Gradle result
Run in the local execution environment, not the GitHub public seed:

`gradle --offline --no-daemon --console=plain --max-workers=2 --continue -Pkotlin.compiler.execution.strategy=in-process :app:assembleRelease :app:testReleaseUnitTest :app:lintRelease`

- Final exit code 0 / BUILD SUCCESSFUL / 60 actionable tasks: 18 executed, 42 up-to-date.
- 115 JUnit reports, 1,301 tests, failures 0 / errors 0 / skipped 0. New capability tests 13 are included in 1,301, not added again.
- Android lint: errors 0, warnings 56. Warnings are retained, not suppressed or baselined away.
- Whole Kotlin/Java compilation, DEX generation and unsigned release APK packaging passed.
- Source hash map unchanged by build, SHA256 021d7a3bcf0b41bca8d121dafcf4a684d1af2ca7031aa155af9f84514cdcb479.
- Actual JVM: OpenJDK 21.0.12.1. Java/Kotlin bytecode target remains 17. Gradle8.9 / AGP8.7.3 / Kotlin1.9.24 / compileSdk35 / minSdk26. Do not label the runtime JDK17.

## Failures were preserved and fixed, not bypassed
1. The first actual host build failed before compilation due to missing Kotlin offline resolution metadata. The prior seed used Maven okhttp/okio dependencies whereas the host uses pinned file JARs. Public CI run42134598640 generated a matching-graph cache supplement; artifact13463854970 was downloaded and all339 file hashes checked. Eleven cache files were added/replaced; app dependency versions/files were not changed.
2. The second actual host build packaged the APK and passed all1,301 tests but lint found five NewApi errors in three unchanged parent files.
3. Added direct API30 guards in JH168RightNativeExecutor.readWindows, JH168Stage50SelectWindowDiagnostic.capture and JH168Stage62NativeSelectOptionRuntime.live, then reran the same full command. Each change reverses exactly to the parent and leaves API30+ logic unchanged. No minSdk increase, no lint disable, no new suppression/baseline.

AndroidManifest, dependency/build configuration and the existing Secure56 MAC/nonce verification prefix are byte-identical to the parent. The normal parent app was not reinstalled or rolled back. Existing location/trip source files were preserved.

## APK and review archive evidence
Unsigned APK: 48,951,405 bytes / SHA256 0e6b1c69fea42cd5b45c0151f732e996b4c41d2e3cf5c11fea70a26ec92ed404. CRC, zipalign, package/minSdk/targetSdk and new-class presence in3 DEX files checked. apksigner correctly rejects the unsigned file; this is NOT successful signing verification.

Package com.koreanlifehub.bridge, versionCode168 and parent versionName are retained only for review. Same label does not mean byte-identical installed software. Do not reuse the parent's installer receipts or original source manifest for this modified candidate.

Conversation-only source/evidence archive KaBiseo-v0.13-Stage77-Review.zip: 2,669,829 bytes / 597 entries / SHA256 da00df7101fe3ccdb0466ca08755a6605e8d84315a696d77fc5ba9b7dbacec37. CRC, all-entry hashes and fresh extraction source verification PASS. No APK, signer, tool cache, font files or installer bundled. Full logs and test XMLs are in that private conversation archive.

## Not completed
No original-key signing, installation, live server deployment or physical phone command. Whole generated MCP/Android round-trip, real camera-surface profile enrollment, read-only phone validation, auto zoom, termination detection and setting restoration remain unverified. Release security approval remains pending; lint PASS is not a SAFE verdict. Existing56 warnings include memory-lifetime, accessibility, JavaScript and hardware-identifier notices requiring scoped review before release.

The new Kotlin helper/test are published for review here. Full private host integration remains in the conversation archive. Existing historical host patch scripts target older source and must NOT be applied blindly to Stage77.

Next: review the complete server/host route and attestation, prepare a real read-only camera-surface validation candidate, then separately resolve release identity, original signing and explicit device approvals. Do not ask the user to repeat the already reported manual pinch/reset test. Automatic camera operation remains OFF.
