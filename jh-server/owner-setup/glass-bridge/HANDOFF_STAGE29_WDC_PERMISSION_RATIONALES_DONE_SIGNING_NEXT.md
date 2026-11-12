# G Glass Stage29 — Wearables Android permission rationale setup and signing next (2026-11-12 KST)

## Current observed/user-confirmed state
- Owner's G Glass WDC project exists and project Configuration > Android screen is accessible.
- Owner typed G Glass Package `com.koreanlifehub.jhglassprobe`. The upper `Save changes` for package/signature must remain untouched because the signing value is not yet confirmed; not confirmed persisted.
- Camera access ON and its rationale `G Glass uses the glasses camera only when the wearer requests a photo, to capture one image for AI visual assistance.` appeared on owner screenshot; its `Save` button greyed with `Unsaved` absent, consistent with saved.
- Microphone access ON, owner **reported** pressing its dedicated `Save` after entering rationale `G Glass uses the glasses microphone only when the wearer activates voice assistance, to understand spoken requests and provide Korean AI responses.`. Saved state not independently read back.
- Application ID and Client Token are auto-rendered in WDC and not yet integrated into a G Glass physical build. Do not repost them in public GitHub notes.
- G Glass APK `com.koreanlifehub.jhglassprobe` has **not been installed on user's phone**, and WDC app signature not registered.

## Signing gate
Do not reuse CameraAccess/JH signer. The external Meta WDC `App signature` appears to be **signer certificate SHA-256 digest converted to unpadded Base64URL** (supported by community reproductions: https://github.com/facebook/meta-wearables-dat-android/issues/80 and https://github.com/ego-flow/ego-flow-app ; verify current Meta docs at use). Android's SHA-256 hex alone is not the field representation. The user must control one long-lived G Glass-only signing key and its backup, and the fingerprint must be extracted from that certificate or a matching signed APK. CI debug signer is ephemeral, not acceptable for release channel identity. No secret keystore/key passwords may go in chat or public repo.

## Next safe user step
On user's Windows PC, determine whether `keytool` (JDK) exists with a read-only command `where.exe keytool` in Command Prompt; if missing, find an owner-approved way to generate a stable offline signing identity without modifying any existing app. Do not repeat Stage26 phone USB scan. Do not click WDC upper Android `Save changes` or install any APK until signing identity and explicit owner authorization are satisfied.

## Reminder
Preserve Meta AI glasses pairing, JH Secure Live, 카비서, 이비서, CameraAccess. Meta WDC project registration and permissions alone do NOT prove physical DAT E2E, beta eligibility, or voice-launch support.
