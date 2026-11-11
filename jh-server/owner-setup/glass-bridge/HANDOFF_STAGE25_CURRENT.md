# G Glass Stage25 — Windows USB transport false-negative fixed (2026-11-11 KST)

## 1. Goal
Continue G Glass / Ray-Ban Meta, eventually one explicit glasses Korean voice question -> one photo -> GPT/JH reply spoken through glasses. Preserve installed JH Secure Live, 이비서, CameraAccess, Meta AI state. This stage only reads publicly inspectable app signing certificate and version via owner-approved, already connected USB phone. No app installation, permissions grant, Meta WDC change, GPT API call, new charge or key handling.

## 2. Exact sources
- Development repository: `uro31821-lab/playwright-mcp-render-mucsckil`, branch `feature/jh-glass-photo-mailbox-20261110`.
- Earlier Stage19 first-party Meta DAT 1.0.1 Android MockDeviceKit emulator: 5/5 PASS, https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/42995442199 .
- Stage21 real APK v2 signer readback: PASS but ephemeral CI signer NOT approved for phone, https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/43022566859 .
- Stage24 Windows read-only source: `jh-server/owner-setup/glass-bridge/physical-trial/stage24_windows_oneclick.py` plus `stage22_phone_signer_readback.py`, `stage20_apk_identity.py`, `실행.cmd`, `stage24_package_and_smoke.py`.
- Stage25 patch uses official ADB USB hardware selector `adb -d`, not an absent `usb:` display tag. Test source `test_stage24_windows_oneclick.py`.
- Official Android reference: https://developer.android.com/tools/adb and AOSP adb.1 https://android.git.googlesource.com/platform/packages/modules/adb/+/HEAD/docs/user/adb.1.md (AOSP mentions usb: prefix omitted with libusb).

## 3. Verified result and root cause
The local Stage24 user-result `USB_CABLE_TRANSPORT_NOT_CONFIRMED` means the former Python function detected exactly one authorized ADB device but failed an additional unsafe `usb:` substring requirement. It does NOT prove a disconnected USB cable. Actual device serial, image, patient info and full private RESULT file are not copied here.

Code correction:
1. `adb devices -l` must report exactly one authorized nonemulator device, as before.
2. `adb -d get-serialno` must succeed and match that device; ADB -d explicitly selects a USB hardware device. This works even when Windows/libusb omits `usb:` in `devices -l`.
3. Each subsequent phone readback uses `adb -d ...` **not `-s serial`**; the USB device identity is rechecked before each phone call, failing closed on change.
4. Wi-Fi targets, extra devices, unexpected commands, permission failures and ADB timeout remain BLOCKED. Only two allowlisted package base.apk files are copied briefly, verified with local Android SDK, then deleted; never install/uninstall/permissions/photography/recording.
5. User's YES consent remains mandatory for every manual run, no silent retry.

Actual Windows GitHub CI on corrected code: https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/43036585578 — SUCCESS. Existing Stage20 20/20 + Stage22 17/17 + Stage24 updated 16/16 => **53/53 Windows unit tests PASS**. Actual native cmd.exe user-decline and no-SDK smoke PASS. Confirmed the no-usb:-tag case, serial mismatch, USB replug and network/nonUSB rejection in synthetic tests. These do NOT prove user phone readback.

## 4. Remaining blockers
- User's physical USB-connected Windows computer and installed CameraAccess/G Glass signer: still **NOT VERIFIED**. There is no verified signing keystore or approved G Glass installation identity. An observed CameraAccess public certificate does not confer permission to sign/overwrite its package.
- Meta WDC G Glass app/Beta/English or Korean launch eligibility, real DAT glasses speech/photo/TTS route, phone lock foreground/background runtime: UNVERIFIED.
- Full GPT/JH one-shot photo ingress and live account-level free -> purchased prepaid API guard not implemented/verified.
- Windows Defender scan of the user's delivered ZIP and personal PC tool versions not confirmed. Never bypass security; security verdict REVIEW.

## 5. Repeat prohibited
Do not instruct repeated old Stage24 runs or USB cable reconnects merely because the old code rejects missing `usb:`. Use the corrected Stage25-delivered file. Do not repeat Stage19 emulator build or Stage21 signer test. Do not modify current JH/CameraAccess/이비서 installs, use random CI signing keys on the phone, enable debugging just to satisfy a script without explicit owner decision, copy private keystores, use patient data, or start a metered API.

## 6. Validation still required
- A single source-matched Stage25 ZIP, Windows native CMD test and SHA256 manifest must be checked and delivered. Its results remain source/test evidence only; no real phone was accessed in GitHub CI.
- Owner can choose to scan extracted ZIP with Windows Defender. If their USB debugging was already trusted, they may run `실행.cmd` and type `YES`; submit its new `RESULT.txt`. If BLOCKED, diagnose that exact reason. If success, assess public certificates only, no install authorization.
- After actual source/keystore/Meta WDC review and separate owner approval, a single independent real-glasses test may begin without GPT API.

## 7. Next one action
Deliver the **USB-selector-corrected Windows source ZIP** and obtain one voluntary actual RESULT readback. No other account, app or device changes. Never claim actual physical device PASS on CI proof alone.

Current status: real official Meta MockDeviceKit emulator 5/5 PASS; corrected Windows read-only software 53/53 synthetic tests PASS; physical Ray-Ban/real USB readback NOT_RUN; JH production unaffected.
