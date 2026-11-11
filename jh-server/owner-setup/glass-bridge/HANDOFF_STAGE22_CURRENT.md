# G Glass — Stage22 authoritative seven-part handoff (2026-11-11 KST)

## 1. Goal
Keep developing **G Glass (지글라스)**, Ray-Ban Meta → Korean speech, one user-triggered photo, GPT/JH vision, reply heard in glasses with phone UI closed when supported. The existing JH Secure Live/KaBiseo/CameraAccess/이비서 installs and settings MUST remain unchanged through independent physical trial. No new API credit purchase or auto-recharge; approved existing complimentary credits first and previously purchased prepaid credits second, account-level billing gate must be verified before any real GPT call.

## 2. Exact source/identity
- Development repo: `uro31821-lab/playwright-mcp-render-mucsckil`; branch `feature/jh-glass-photo-mailbox-20261110`.
- Official Meta DAT Android SDK 1.0.1 pinned commit: `f4371bc9f90249d51eb07d7f8a61e8d829294f16`.
- G Glass isolated trial package: `com.koreanlifehub.jhglassprobe`; existing Meta CameraAccess: `com.meta.wearable.dat.externalsampleapps.cameraaccess`; current JH production: `com.koreanlifehub.bridge`.
- New read-only owner-local source `jh-server/owner-setup/glass-bridge/physical-trial/stage22_phone_signer_readback.py`, tests `test_stage22_phone_signer_readback.py`. Reuses prior `stage20_apk_identity.py` public-cert parser.
- Existing GitHub Actions offline safety workflow `.github/workflows/jh-glass-stage20-readiness.yml` runs both test groups. No new app built for Stage22.

## 3. Verified completed evidence
- Stage19 official Meta MockDeviceKit Android 35 emulator: **5/5 instrumented tests PASS**, real SDK compile and synthetic Korean speech/photo: https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/42995442199
- Stage21 real debug APK compile, aapt2 package/permissions and public certificate v2 readback: SUCCESS, but CI debug certificate not approved for phone: https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/43022566859
- Stage22 new read-only installed-app identity probe: uses a strictly single **already ADB-authorized USB** phone; rejects emulator, multiple/offline/unapproved devices; only checks two allowlisted packages; uses only `adb devices -l`, `adb shell getprop ro.kernel.qemu`, `adb shell pm path <known package>`, and **read-only `adb pull` of installed `base.apk`**. Temp APK is verified locally with owner SDK `aapt2 dump badging` and `apksigner verify --print-certs`, then deleted. No signing private key, uninstall, update, install, permissions, screenshot, photo, logcat, JH service, Meta WDC or OpenAI call.
- Source-only mocked test suite checks fake device commands, public fingerprint parsing, exact package identity, temp APK deletion, no install, multiple devices/unauthorized/Wi-Fi/emulator blocks, and path traversal.
- First CI run 43027195755 revealed real security defect: `/data/app/../secret/base.apk` path traversal was not rejected. Fixed by checking POSIX path components and dot segments; failed test not counted as passed.
- Final **Stage22 actual GitHub Actions CI SUCCESS**: https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/43027341238 ; Stage20 20/20 PASS + Stage22 17/17 PASS = 37/37, no actual phone/ADB access.
- **No APK was assembled/signed/released/installed during Stage22.** Stage21 build result valid and reused.

## 4. Blockers and unknowns
- Exact installed CameraAccess certificate and private locally available stable signing identity: NOT VERIFIED; the certificate is public but matching the installed signature does not prove ownership of its private signing key. Do not authorize another package using merely an observed CameraAccess signer.
- G Glass WDC registration/Beta tester/version, English app-name voice launch and Korean ASR hardware compatibility: NOT VERIFIED. Meta Voice Invocations are experimental and user account/channel-dependent.
- Actual Samsung/Meta glasses speaker routing, Korean speech, photo once, phone locked foreground lifetime: NOT RUN.
- JH Secure56 photo ingress and billing-protected GPT image inference: NOT IMPLEMENTED/VERIFIED; no OpenAI API used.
- Actual on-device USB/cert scan: NOT_RUN. The Stage22 tool is source-only; **Windows executable or one-click deliverable has not been created or Windows-tested**. No Windows AV proof.
- No current user permission for a new physical APK installation, original app uninstall, signing-key generation, WDC change or paid API call.

## 5. Forbidden repeats/actions
Do not redo Stage19 virtual device tests merely to increase count, rebuild Stage21 debug APK without source change, use ephemeral CI debug signing identity as approved phone key, invent Meta WDC Beta approval, switch Meta locale/Developer Mode or remove Meta AI. Do not update/overwrite installed JH or CameraAccess, copy private signing key to GitHub, upload installed APK/photos/medical data or change Android permissions. Do not issue a new JH Android BEGIN_COMMAND solely for read-only package inspection if the existing JH tool cannot expose signer/installed package provenance. No direct ADB phone access without user's local voluntary USB/ADB permission.

## 6. Remaining validation
Read locally the certificate of already installed Meta CameraAccess with an owner-approved USB session (or reuse verified existing certificate receipt if supplied). Independently confirm trusted local keystore public certificate and Meta Developer Center WDC Beta app identity; then decide whether separate stable G Glass signing/registration requires an explicit new approval. Once approved, prepare independent app with exact package/signing and OS security receipts. Run **one hardware trial** for Korean speech → exactly one photo event → Korean TTS genuinely in Ray-Ban speakers, no API. Later separately test Beta voice cold-launch and JH/GPT with verified billing cap.

## 7. Next one action
**Convert Stage22 read-only local scan into a security-reviewed Windows one-click preflight using existing installed Android SDK/ADB, then have the user voluntarily run it on their Windows PC with only one already-authorized USB phone.** That action reads public installed-app cert and version only, never modifies phone and never approves installation. Until then, WDC and physical install remain BLOCKED/NOT_RUN. Do not force PC setup, new software installation or screenshots merely to read this.

### Current status
Stage19 Meta MockDeviceKit real emulator **PASS**, Stage21 actual isolated APK identity readback **PASS / physical installation BLOCKED**, Stage22 read-only host signer probe 37/37 CI **PASS in mocks / actual phone readback NOT_RUN**. Production JH unaffected.
