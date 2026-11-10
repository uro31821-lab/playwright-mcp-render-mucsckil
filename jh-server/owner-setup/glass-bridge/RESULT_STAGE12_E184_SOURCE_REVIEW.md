# JH Glass Stage 12 — E184P2 original source review (2026-11-11 KST)

## Scope and evidence

The user **directly attached** `E184P2 (1).zip` in this conversation. Its real bytes were inspected in the private working runtime; the archive itself has NOT been copied to this public GitHub repo.

- Exact original ZIP SHA-256: `d44e8e80b4d6d1b1328923ed8951f0f2148ceb2046955c1d31fd298d480f8b1b`
- Size: `2,725,328` bytes; ZIP entries: `551`; CRC check PASS.
- `PACKAGE-MANIFEST.json` lists `550` entry hashes/sizes, **550/550 matched**. This verifies internal archive integrity only; does NOT prove publisher identity or exact equality with the installed signed APK.
- Archive contains actual Android/Kotlin sources at `data/android-source/` and original JH package `com.koreanlifehub.bridge`; `app/build.gradle.kts` declares versionCode **184**, versionName `jh184-stage77-location-once-native-select-fix3-keepalive-fix13-ebiseo059-melon-title-retry`.
- **Release metadata conflict**: `app/src/main/assets/jh-release.json` still reports versionCode **177**, so **do not build/release/install** until exact metadata provenance and current installer status are reconciled.
- `RUN.cmd` uses a PowerShell execution-policy bypass option; NEVER execute it or relax local Windows security. Files contain third-party JARs; malware-free/source-provenance status is **REVIEW**, not SAFE.
- No key/certificate material matching private key file extensions was found; same signing cert as installed app was **not established**.
- Archive source inspect did not run any installer, gradle wrapper, shell, executable or bundled JAR.

## Actual native integration points found

- Existing non-exported owner Settings Activity: `TrustedDeviceSettingsActivity.kt`.
- Existing owner-trust/Google ID flow: `AndroidOwnerEnrollmentRuntime.kt`, `OwnerEnrollmentController.kt`, `OwnerEnrollmentWire.kt`, `AndroidTrustedDeviceWorkspace.kt`, `TrustedDeviceSettings.kt`.
- Existing Secure56 session: `SecureBridge56Runtime.session.activeView()`; owner trust record is validated by `controller.read()`.
- Existing pinned native CameraAccess package is `com.meta.wearable.dat.externalsampleapps.cameraaccess`; its installed signer can be read through Android `PackageManager` after exact `<queries>` visibility.
- Existing user-device trust is NOT automatically consent to photo transfer.

## Source-only review patch completed, not integrated with app

A small **private, review-only** source overlay was produced in the conversation sandbox, without exposing the original archive or credentials:

1. `JhGlassInitialEnrollmentPolicy.kt`: fail-closed **readiness-only** policy. Checks verified owner journal and active Secure56 session, correct JH server/device, valid ephemeral request and matching installed CameraAccess APK signer. Never returns photo grant.
2. `JhGlassAndroidOwnerReadback.kt`: read-only adapter to the actual native JH owner-trust journal and Secure56 APIs, plus local installed CameraAccess signing-certificate lookup. Does not call HTTP, approve pairing or share images.
3. `AndroidManifest_queries.patch`: adds exactly one specific CameraAccess package visibility entry inside existing `<queries>`; no new runtime permissions, exported components, services or activities.
4. `JhGlassInitialEnrollmentPolicyJvmTest.kt`: 18 Kotlin unit checks.

Review ZIP `JHGlass_Stage12_ReviewOnly.zip` generated in the conversation; SHA-256 `9c463ebe3f988252a7ed672b462830bb0aafe420c2dca0acb418be25b2b86f65` (7,938 bytes, 6 source/docs entries). Download availability is unverified until the user actually receives it.

## Tests run

- Kotlin 1.9.0 local compiler: **18/18** fail-closed pure policy tests PASS.
- Native Android adapter compiled under Kotlin 1.9.0 with contract-compatible **synthetic Android/JH stubs**, then **3/3** simulated adapter checks PASS. These are NOT actual Gradle Android build or phone tests.
- Original vs staging manifest XML: same permissions, activities, services and receivers. Exact package visibility count increased from 33 to 34.
- Original `data/android-source` is the only source used. Original ZIP bytes were never overwritten.
- No actual user phone/local approval, current-chat JPEG receive or mobile installer run was performed.

## Previously authored owner server modules found but not live-mounted

The connected repository's existing `jh-server/owner-setup/owner-enrollment/` contains `owner-host-bootstrap.mjs`, `owner-enrollment-http.mjs`, `owner-registry-service.mjs`, etc., including handlers for `/device/owner-enrollment/{begin,finish,challenge,status,cancel}`.

**Important routing correction:** The baseline `jh-server/server.mjs` itself does not mount `/device/owner-enrollment/` or `/jh-glass/v1/photo`. However `jh-server/package.json` actually starts `owner-setup/deployment/published-host-router.mjs`, which has **explicit operator-controlled alternate owner startup paths** and can invoke `owner-service-entry.mjs` / `owner-host-bootstrap.mjs`. Therefore the **live runtime's selected startup mode and owner route availability are UNVERIFIED** without read-only deploy/env/route evidence; do not infer actual production availability solely from the baseline `server.mjs`. The vetted owner host requires Google allowlists and private encrypted persistence. No production change made.

## Next single safe development step

In the **development branch only**, prepare/test an owner-host mount adapter or contract-backed integration using the already-written owner-enrollment service, verified OAuth owner identity and no phone prompts by default; keep the Secure56 catalog unchanged. Then connect a genuine, independently verified first-time CameraAccess pairing consent to the source-only native readback. No operating server deploy, JH APK re-sign/update, new app install, paid API request or phone approval without separate explicit user action.

## Keep the prior successful stages

Reuse original DAT setup, CameraAccess APK/stream real-device evidence and Stage10/11 server automated tests. Do not repeat every-photo MediaProjection consent.
