# G Glass — Stage24 Windows-native read-only preflight handoff (2026-11-11 KST)

## 1. Goal
Continue G Glass (Ray-Ban Meta) hands-free Korean voice -> one explicitly requested photo -> GPT/JH assistant -> answer audible on glasses. This Stage24 is ONLY local proof that the already installed CameraAccess and G Glass trial app identities can be inspected safely, and never grants installation or Meta WDC permissions. Existing JH Secure Live, CameraAccess, KaBiseo and Ebiseo must not be altered. No API calls or new credit purchases.

## 2. Exact source
Canonical GitHub repo `uro31821-lab/playwright-mcp-render-mucsckil`, development branch `feature/jh-glass-photo-mailbox-20261110`, Windows source directory `jh-server/owner-setup/glass-bridge/physical-trial/`.
- `stage20_apk_identity.py` public APK parser
- `stage22_phone_signer_readback.py` two-package public signer readback via owner-local ADB
- `stage24_windows_oneclick.py` improved Windows-only wrapper, explicit YES and USB physical transport gate
- `실행.cmd` sole Windows entrypoint
- `test_stage24_windows_oneclick.py` 13 fake-device unit tests
- `test_stage24_native_windows_smoke.py` actual cmd.exe smoke (NO real phone)
- Windows workflow `.github/workflows/jh-glass-stage24-windows-readonly.yml`.
Installed app allowlist: `com.meta.wearable.dat.externalsampleapps.cameraaccess` and `com.koreanlifehub.jhglassprobe`. JH production package `com.koreanlifehub.bridge` is NOT read.

## 3. Completed evidence
- Stage19 real official Meta SDK Android 35 first-party MockDeviceKit emulator voice/photo tests **5/5 PASS**: https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/42995442199
- Stage21 real G Glass isolated APK aapt2/signature v2 verification PASS **but ephemeral CI debug cert not approved**: https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/43022566859
- Stage22 read-only fake Android CLI **17/17 PASS** and Stage20 APK identity **20/20 PASS**, user device not touched.
- Stage24 **ACTUAL Windows hosted runner, cmd.exe binary, Python 3.12** GitHub CI run https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/43032544658, job 130563008789 **SUCCESS**:
  - CMD ASCII/CRLF and source Python syntax check PASS.
  - Stage20+22 regression 37/37 PASS.
  - New Stage24 mocked USB-only, no-manual phone permission, denied/no-SDK, temp APK cleanup tests 13/13 PASS.
  - Actual native Windows `cmd.exe /d /c 실행.cmd` tested twice with NO real phone and fabricated empty environment: blank/declined owner input → `OWNER_DECLINED_LOCAL_READBACK`; explicit YES but missing validated Android SDK → `ANDROID_SDK_NOT_FOUND_NO_DOWNLOAD`; both process exit 12, correct BLOCKED JSON. No Android SDK download, ADB use, APK installation, Meta WDC change, JH modification, OpenAI API, user phone.
  - Windows CI Defender `Get-MpComputerStatus` confirmed AV capability on hosted runner; **no actual Defender scan performed**, no malware-free certificate. Security verdict remains REVIEW.
- Stage23 prior standalone ZIP `GGlass_S23_ReadOnly.zip` had 30/30 Linux-simulated test PASS and ZIP integrity; **not the same file as tested Stage24 Windows launcher**, so do not treat old ZIP as native Windows-tested.

## 4. Current blockers
- Stage24 Windows source and successful GitHub CI exist, but no completed owner-device USB readback or certificate matched to locally approved signing keystore: NOT_RUN.
- Windows Defender actual file scan/host tool provenance: NOT_VERIFIED; do not bypass user security protection.
- Meta Wearables Developer Center G Glass Beta app/name/locale approval, user pair/signing and on-glasses experimental Speech/Photo: NOT_VERIFIED. Korean Meta wake-up may not work on user's release channel.
- Actual real-glasses ASR, one photo, verified BT speaker output, phone lock/background foreground-service compliance, GPT/JH owner-bound photo transfer and payment controls: NOT_RUN.
- The passed native CI tests DO NOT prove actual user Windows machine or phone setup; installing the standalone test APK remains BLOCKED pending explicit approval, verified signer and app store/supply chain safety.
- No user asked for installing signed APK or changing phone permissions.

## 5. Repeat forbidden
No rebuilding Stage19/21 for old unchanged source, no repackaging earlier unverified Stage23 as Stage24-tested, no temporary CI debug cert used to install on user's phone, no new signing key without consent, no copying private keystore/APK/photo/patient data to GitHub, no bypass of Play Protect/Defender/Meta/Android consent; no API funding assumptions or billing calls.

## 6. Remaining tests
1. If desired, package only Stage24 tested Windows source/launcher with SHA manifest and check exact extracted package on hosted Windows before release; hosted Defender scan evidence if available.
2. Owner-local read-only USB scan on an already trusted PC with existing Python/Android SDK, at user's choosing, after security review. It must display only public installed-app package/version/cert fingerprint, not device serial/private bytes. Treat USB debugging activation as a user-controlled action, not a silent setup.
3. Compare observed CameraAccess signing cert and local approved test signing identity, and confirm WDC G Glass beta only with validated readback; avoid conflating signature observation with permission to use private signing key.
4. Obtain explicit approval only when ready for a single independent *physical* test, with no GPT API.

## 7. Next one action
**Complete source-matched Stage24 Windows package delivery and AV readback** (without phone), then offer voluntary one-click owner-local read-only scan. If the user doesn't want USB/ADB action, keep BLOCKED and consider a separately authorized package-visibility method, not silent broader phone access.

Status: Stage24 actual Windows cmd.exe and 50/50 unit guards PASS; **real phone readback and physical Ray-Ban E2E NOT_RUN**; JH production unchanged.
