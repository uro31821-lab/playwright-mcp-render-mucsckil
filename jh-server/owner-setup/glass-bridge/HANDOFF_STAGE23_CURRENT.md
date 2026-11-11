# G Glass — Stage23 Windows read-only installed-signer preflight (2026-11-11 KST)

## 1. Goal
Continue G Glass / Ray-Ban Meta glasses -> Korean speech -> explicit one still photo -> GPT/JH -> Korean audio through glasses, with minimal phone UI. Stage23 is an owner-local read-only **installed package certificate diagnostic** preceding any physical G Glass app install. Existing JH, CameraAccess, 이비서 and Meta AI settings must remain unchanged. No extra API purchases/auto-recharge or unverified billing.

## 2. Exact source and deliverable
Canonical existing development repo: `uro31821-lab/playwright-mcp-render-mucsckil`, branch `feature/jh-glass-photo-mailbox-20261110`.
Stage22 GitHub Python signer readback: `physical-trial/stage22_phone_signer_readback.py`, tested hosted run `43027341238`.
Stage23 **standalone Windows source snapshot** delivered as the actual current-conversation artifact **`GGlass_S23_ReadOnly.zip`** (13,549 bytes; archive SHA-256 `2da6de4714080c550289eb44e620db74890bcfc602dd11a9c2b884d975e90bae`). This artifact is **not** a GitHub commit nor APK. All source remains inside this handed-off ZIP; do not claim this file already exists on GitHub. Internal:
- `실행.cmd` (ASCII/CRLF, only user launcher)
- `사용안내.txt`
- `data/stage23_readonly.py` (self-contained reimplementation of the Stage22 read-only scanner plus Windows local SDK discovery)
- `data/test_stage23_readonly.py`
- `data/MANIFEST_SHA256.json` (every other file's size and SHA-256)
- `RESULT.txt` initially `NOT_RUN`
- `logs/LOCAL_TEST_RESULT.txt`, `docs/HANDOFF_STAGE23.md`.

Official Meta DAT SDK 1.0.1 pinned source commit `f4371bc9f90249d51eb07d7f8a61e8d829294f16`.
Independent trial package `com.koreanlifehub.jhglassprobe`, existing CameraAccess `com.meta.wearable.dat.externalsampleapps.cameraaccess`, existing JH `com.koreanlifehub.bridge` (not read/copied by Stage23).

## 3. Verified work
- Stage19 **5/5 actual first-party Meta MockDeviceKit Android 35 emulator** and official SDK compile PASS: https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/42995442199
- Stage21 real standalone Android debug APK build / read-only aapt2+apksigner verified **PASS**, but CI temporary signing certificate unapproved for user device: https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/43022566859
- Stage22 offline scanner mock **17/17 PASS**, total Stage20/22 37/37 CI: https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/43027341238
- Stage23 **30/30 local mocked Python tests passed** in the sandbox used for this response; source compile PASS, Windows CMD ASCII/CRLF static check PASS; ZIP CRC/readback and all manifest source-file SHA-256 PASS, no payload binary/installers/private keys. This is independent **Linux-host simulation**, not Windows live execution.
- Stage23 caller auto-locates existing Python 3.10+ (via `py -3` or `python`) and Android SDK from local Windows environment/standard locations; requires a typed `YES` in its own window before ADB use; demands exactly one already-authorized USB physical Android device, no network ADB or emulator, reads only two known installed packages. Uses read-only `adb shell pm path`, `adb pull base.apk`, `aapt2 dump badging`, `apksigner verify --print-certs`, and deletes the temporary APK immediately.
- Output `RESULT.txt` contains only public app certificate fingerprints, package version and APK hash, never device serial or APK binary, no actual install authorization. Exact package and signature mismatch -> blocked; never reads camera photos, app private data or JH runtime. No JH or user device touched by this development work.

## 4. Known blockers / no overclaim
- **Windows CMD native run NOT_RUN**: Windows runner and antivirus / Windows Defender scan not available in author's Linux runtime. Malware/security status remains `REVIEW`, not certified `SAFE`.
- Actual user phone connected USB, ADB authorization and installed package public signer readback **NOT_RUN**. Local Python 3.10+, existing Android SDK platform-tools/build-tools and Java are prerequisites. Do not install new software silently just to satisfy this prerequisite.
- Stage23 ZIP source is present only as a verified conversation download; GitHub development branch contains Stage22 canonical logic and Stage23 handoff, not an exact mirror of the Stage23 packaged standalone script. Avoid claiming both have byte equality.
- An observed public signature digest is not the private signing key, Meta WDC registration or permission to install. Meta WDC G Glass Beta, experimental speech and voice invocation locale eligibility, real glasses speaker route, phone lock/FGS and camera are NOT_VERIFIED.
- JH Secure56 image transfer and OpenAI API account-level funding limits NOT_VERIFIED, no API call used.

## 5. Repeat prohibited
Do not repeat Stage19/21 builds or pretend emulator passes equal hardware passes. Do not install/overwrite CameraAccess/JH, issue new signing keys, bypass Windows Defender/Play Protect/SmartScreen, change Meta AI Developer Mode/locale, send patient data, read other installed apps or switch on paid APIs. Do not present unverified Windows test as passed.

## 6. Remaining validation
Actual owner-local Windows run (with user consent, one already-authorized physical USB Android phone) -> public installed signer and version evidence only. Verify exact source/reviewed SDK tools and AV first. User can choose to provide sanitized `RESULT.txt` for further provenance analysis. Confirm Meta WDC Beta and app identity separately. Physical independent app install and permission changes require explicit fresh user approval, and before those stages, proper signing and security receipts.

## 7. Next one action
When the user is ready to use their Windows PC, **extract entire Stage23 ZIP and open `실행.cmd`**, after reviewing source/Windows Defender status; only type `YES` when they permit the read-only, two-app signer inspection. If blocked or SDK unavailable, do not weaken controls. Until actual device proof, Stage23 = **source and mock validated / real Windows+phone NOT_RUN**.

Source-package archive SHA: `2da6de4714080c550289eb44e620db74890bcfc602dd11a9c2b884d975e90bae`.
