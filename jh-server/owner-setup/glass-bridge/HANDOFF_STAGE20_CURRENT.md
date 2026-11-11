# G Glass — Stage20 verified handoff (2026-11-11 KST)

## 1. Goal
Ray-Ban Meta G Glass, phone in pocket: supported Hey Meta launch, Korean final question, exactly one user-directed photo, GPT/JH answer heard through glasses. This is the final target, not already achieved. Preserve existing JH Secure Live, CameraAccess and 이비서. Complimentary API credit first, then already purchased prepaid credit only, no new payment/auto-recharge, fail closed on uncertainty. Physical feasibility testing must make ZERO OpenAI API calls.

## 2. Exact source
Development repo uro31821-lab/playwright-mcp-render-mucsckil, branch feature/jh-glass-photo-mailbox-20261110. Official Meta DAT SDK 1.0.1 source commit f4371bc9f90249d51eb07d7f8a61e8d829294f16. Trial package com.koreanlifehub.jhglassprobe; existing JH com.koreanlifehub.bridge and CameraAccess com.meta.wearable.dat.externalsampleapps.cameraaccess are separate. Private original E184P2 Android source not copied to public GitHub.

## 3. Completed, verified evidence
Stage19 first-party Meta MockDeviceKit Android 35 hosted emulator, actual Kotlin/AndroidTest compilation, synthetic Korean final transcript and photo receipt: **5/5 PASS**, run https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/42995442199. This is not actual Ray-Ban hardware proof.
Stage20 added a READ-ONLY source at physical-trial/stage20_apk_identity.py, 15 offline fail-closed tests at physical-trial/test_stage20_apk_identity.py and workflow .github/workflows/jh-glass-stage20-readiness.yml.
Actual Stage20 CI **15/15 PASS**, missing-signed-APK state intentionally BLOCKED, run https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/43000363327.
The Stage20 checker compares exact package, application label/version, original CameraAccess permissions, single signer digest from a locally approved Android apksigner, and user-approved certificate hash. A PASS from this checker is identity-only, never provenance/WDC or install approval. No JH production deployment, user phone action, new signing key, WDC setting change, OpenAI API call or charge.

## 4. Actual blockers
Approved real-phone candidate APK and preapproved stable signer fingerprint/build receipt: NOT VERIFIED. Ephemeral GitHub Actions debug signer must NOT be shipped to phone. WDC G Glass product, Beta channel, invitation, voice-launch permission, name and installed package/certificate correspondence: NOT VERIFIED. Actual Korean Ray-Ban speech, independent one-shot photo, true glasses-speaker TTS, phone locked lifetime: NOT VERIFIED. Owner-bound Secure56 photo ingress, GPT vision runtime and actual API account budget/auto-recharge controls: UNVERIFIED. Android security/AV scan and physical install: NOT RUN.

## 5. Do not repeat
Stage19 5/5 and Stage20 15/15 may be reused when the source/evidence matches. No reinstall of CameraAccess or JH, no switching Meta language or Developer Mode, no adding keys/credentials/patient images to public repo, no arbitrary new signing key, no loosening Windows Defender/Play Protect, no new ZIP just to increase counts, no API call until account-level cost gating is proven.

## 6. Separate physical tests after fresh owner approval
(A) Recommended first, manual launch Developer Mode trial: sign with owner-approved existing certificate, verify source/provenance and AV, then owner-approved installation of a distinct package and user-initiated Meta camera+mic grants. Tap the Debug test action once to verify physical on-glasses Korean speech, one explicit photo and actually audible Korean TTS. No GPT API; not proof of automatic voice startup.
(B) Later, WDC Beta app-by-name voice invocation. Requires approved package/version/name, invitation accepted, release channel, Launch with Hey Meta connection toggle and locale confirmation. Do not assume Korean activation. Changing Meta Developer Mode for Beta is a separate user-authorized action. No Meta AI default-assistant replacement.

## 7. Next one action
READ-ONLY verify a genuinely preapproved local test APK signer/source and WDC Beta eligibility, using existing trusted Android SDK (aapt2/apksigner) and local account readback. If absent, mark BLOCKED without installing. Request explicit fresh install/permission approval only after this review; first physical trial is manual tap if Beta is not ready.

**STATUS:** Stage19 emulator test PASS; Stage20 safety-policy tests PASS; true user APK signer and WDC status unknown, so physical install NOT AUTHORIZED.