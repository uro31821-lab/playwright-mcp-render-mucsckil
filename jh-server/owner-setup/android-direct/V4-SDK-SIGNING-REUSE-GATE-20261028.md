# JH167 V4 — existing Windows Android SDK/key build gate (2026-10-28)

**V4 top priority, authoritative screen arrangement: LEFT ChatGPT / RIGHT Chrome, Samsung Internet or Gemini.**

## Verified from user-provided offline archives

- V4 source ZIP `JH167-V4-Gemini-Secure56-command-verification-20261028.zip` and old Windows reuse-builder `JH167-V4-기존SDK-기존인증서-자동재사용-빌드준비-20261028.zip` have the **same exact 377 Android source files** (byte-for-byte).
- Current Android app ID: `com.koreanlifehub.bridge`, `versionCode=167`, `versionName=jh167-fold8-v5r3-ocr-floating`.
- Prior verified Windows environment records Java 17, Android SDK platform 35, portable Gradle 8.9. Existing app certificate expected SHA-256: `7cc577efe48e865fdbe799b92aa9edf89724631361ae97979f2b8e4a940a288b`.
- `android/RELEASE-STATUS.json` is preserved historical JH161 metadata, **not proof of a new v167 build**.
- Re-ran offline Kotlin native policies **40/40 passed**; no full Android Gradle build or signed APK created.

## Release-preparation improvements supplied privately in conversation package

- A 377-file source manifest with file hashes and byte sizes, pinned into Windows `Build.ps1` to **stop changed or extra source before any build/sign**. Manifest SHA-256: `af12a3d51532476dd8eedd391145421864674c36befa3f533b935cc4c3aae3ab`.
- Windows existing SDK/key discovery and original certificate fingerprint verification retained.
- Gradle runs `--no-daemon --no-parallel --max-workers=1 :app:clean :app:testDebugUnitTest :app:lintDebug :app:assembleDebug` before signing.
- Full offline artifact ZIP SHA-256: `ed3313dade7028b803f77594792c04c0dddfeb9c43b950161a9e3f7269788779`; archive size 3,338,172 bytes. Original Android source is not uploaded to this GitHub repo; build ZIP stays in ChatGPT conversation files.
- Source and manifest mutation tests fail closed. No keystore, DPAPI, signing password, signed APK or original credentials are in the ZIP.

## Strict unreached gates

1. Full Gradle Android project compile/unit tests/Lint/assembly on the approved original SDK.
2. Original-PC matching-key signing, installed-app signer/version validation, then direct-to-phone private delivery (no automatic PC install).
3. Real signed Secure56 host and device E2E: original LEFT GPT / RIGHT Chrome & Gemini, exact phone-local send approval, YouTube response readback, video file export & HTTPS instant playback, cancellation and no replay.
4. Only after all feature-parity checks can Playwright fallback removal and production deployment be considered.

**This document and PR #63 are an isolated development candidate, not an APK or production release.**
