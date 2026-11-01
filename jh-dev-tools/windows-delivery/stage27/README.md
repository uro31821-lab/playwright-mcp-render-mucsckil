# JH168 Stage27 Windows installer contracts

This directory contains the reviewed installer source and harmless Windows
PowerShell 5.1 contract tests for the Stage27 update package. The signed APK and
signing credentials are deliberately not stored in this source directory.
The complete release archive supplies the separately verified, hash-pinned APK.

The installer validates the candidate package, version, certificate and bytes,
requires one ready device, and verifies the installed Stage26 baseline before
performing one update. An already installed exact Stage27 candidate is reused.
A durable attempt receipt is created before dispatch, and an uncertain attempt
cannot be replayed by extracting another copy of the archive. Existing result
files are preserved, and the current result is tied to its run identifier.

`Test-Stage27Installer.ps1` loads only production function definitions and
substitutes every external executable call with deterministic synthetic
fixtures. `Test-Stage27Bootstrap.ps1` exercises the real CMD wrapper against
incomplete or synthetic folders. Neither test installs an APK, uses a signing
key, connects to a device, or changes a server.

Run the two tests on Windows PowerShell 5.1 with `-KitRoot` pointing at the
`installer` directory. Passing these contracts does not establish installation
or Chrome completion behavior on the owner's phone; those require the owner's
separate runtime result.

## Stage27 package identity preflight correction (2026-11-01)
A real Windows installer run returned `APK_PACKAGE_OR_VERSION_MISMATCH` before any installation attempt, despite an exact signed APK hash. Independent Android SDK 35 `aapt dump badging` and binary `AndroidManifest.xml` parsing both confirm package `com.koreanlifehub.bridge` and version code 168 on the same 27-stage signed APK. The immutable signed APK SHA-256 remains `129bcc55a9fbf04ebe2bb19d86958fd94f4dc6fd0969bb020105e7f162510359`.

The installer now requires a pinned signature-verification and identity-proof receipt bound to that exact APK hash, original signing certificate and original source manifest. It never depends on a second machine-specific `aapt` text dump. The installed package and signer are still checked before and after an at-most-once update. Any wrong proof, APK, certificate or previous Stage26 bytes blocks before dispatch. No APK rebuild, resign, device installation or server deployment occurs in CI.
