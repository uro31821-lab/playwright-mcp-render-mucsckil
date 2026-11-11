# G Glass Stage26 — Missing app vs command error separation (2026-11-11/12 KST)

## 1. Goal
Continue G Glass / Ray-Ban Meta one user-directed glasses Korean question -> single photo -> secure GPT/JH answer audible through glasses, phone UI closed when supported. Stage26 is strictly READ-ONLY LOCAL PUBLIC APP SIGNING IDENTITY preflight. Preserve installed JH Secure Live, Meta CameraAccess, KaBiseo, Ebiseo, Meta AI. No OpenAI API charge/call, Meta WDC write, phone APK install/uninstall, camera, patient data, private signing key.

## 2. Exact source
Repo: uro31821-lab/playwright-mcp-render-mucsckil
Branch: feature/jh-glass-photo-mailbox-20261110
Core files under jh-server/owner-setup/glass-bridge/physical-trial/:
- stage22_phone_signer_readback.py (new package-presence + stage failure codes)
- stage24_windows_oneclick.py (revision in RESULT, USB -d selector checks)
- test_stage22_phone_signer_readback.py (26 unit checks)
- test_stage24_windows_oneclick.py (18 unit/integration fake-device checks)
- stage20_apk_identity.py (20 existing APK checks)
- 실행.cmd, stage24_package_and_smoke.py, Windows hosted workflow jh-glass-stage24-windows-readonly.yml.
Only two allowlisted packages inspected: com.meta.wearable.dat.externalsampleapps.cameraaccess and com.koreanlifehub.jhglassprobe. Existing JH package com.koreanlifehub.bridge NOT inspected.

## 3. Verified
- Stage19 first-party Meta DAT Android 1.0.1 MockDeviceKit Android35 synthetic speech/photo instrumentation 5/5 PASS: https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/42995442199
- Stage21 source-pinned Android test APK build and v2 public signer readback PASS, but ephemeral CI signer NOT approved for phone: https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/43022566859
- Stage25 53/53 Windows unit tests PASS and exact USB hardware ADB -d selector used.
- Actual owner RESULT from Stage25: READ_ONLY_TOOL_REJECTED. It proves a local read-only command returned nonzero, but does NOT reveal which command. Do not infer a cable failure or particular app installation state.
- Stage26 reads official Android PackageManager list packages filtered to exact known name before pm path. If G Glass trial is absent, records NOT_INSTALLED rather than treating pm path's nonzero as a generic tool failure. Other failures now return allowlisted per-stage codes: CAMERAACCESS_PACKAGE_LIST_COMMAND_FAILED, CAMERAACCESS_PACKAGE_PATH_COMMAND_FAILED, CAMERAACCESS_APK_PULL_COMMAND_FAILED, CAMERAACCESS_AAPT2_BADGING_COMMAND_FAILED, CAMERAACCESS_APKSIGNER_VERIFY_COMMAND_FAILED (and GGLASS equivalents); also USB_INVENTORY_COMMAND_FAILED, USB_SELECTOR_COMMAND_FAILED, etc. No raw output, device serial or APK bytes written to RESULT.
- Stage26 each RESULT includes diagnostic_revision: stage26-missing-package-and-step-failures, so old ZIP results are distinguishable.
- Stage26 actual native Windows GitHub CI SUCCESS: https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/43045857027 . Stage20 20/20 + Stage22 26/26 + Stage24 18/18 = 64/64 PASS, native Windows cmd.exe fail-closed smoke PASS. These tests use fake USB devices and DO NOT query real phone.

## 4. Still blocked
- Actual phone installed CameraAccess public signer, WDC Beta voice launch eligibility, physical Ray-Ban Korean speech/photo/TTS and locked-screen lifetime: NOT_VERIFIED.
- The generic prior error could be a missing G Glass test app, read-only package path, APK pull, aapt2, apksigner or SDK environment. Only new Stage26 RESULT can identify the step.
- JH Secure56 one-shot photo ingress, OpenAI account balance/auto-recharge policy and real GPT vision runtime: NOT IMPLEMENTED/NOT_VERIFIED. No additional costs incurred by current development.
- Personal Windows Defender real file scan and ownership/installed certificate validation: NOT_RUN. Security remains REVIEW, not SAFE.

## 5. Repeat forbidden
Do not ask for unchanged USB cable reconnection, Dev Mode toggle, repeated old ZIP execution, new private signing key, live JH/CameraAccess app replacement, patient image transfer, paid API or weakening Windows Defender/Play Protect. A read-only public signer is NOT installation consent.

## 6. Remaining validation
Package exact tested source as a Windows one-extract ZIP; native Windows smoke + per-file SHA integrity + AV review. Owner may optionally unzip and run execution.cmd (actual name 실행.cmd) on their already approved Windows/USB setup, type YES, and send one new RESULT.txt. If specific phase fails, work only on it. No phone changes.

## 7. Next one action
Deliver tested Stage26 Windows diagnostic ZIP. Mark actual phone readback NOT_RUN until owner confirms a new RESULT, and do not begin real-glasses hardware install without explicit authorization.
