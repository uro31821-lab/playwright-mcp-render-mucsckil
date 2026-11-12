# G Glass Stage28 — Meta Wearables Developer Center owner-confirmed project creation (2026-11-12 KST)

## User-verified new milestone
The owner registered/logged into a separate Managed Meta account, completed two-factor authentication, accepted Meta Wearables Developer Terms, and created a project **G Glass** in Meta Wearables Developer Center. Owner-supplied screenshots visibly show the project Configuration screen, with Android tab offering `Package`, `App signature`, `Camera access`, `Microphone access`, plus distribution controls. The owner reported entering Android Package `com.koreanlifehub.jhglassprobe` into the form; **no saved configuration confirmation yet**. Do not claim the signature or Android integration was registered.

## Hard gate: no substitute signer
The official Meta CameraAccess app installed on the phone has a valid signer (Stage27 read-only proof), but this is a **different package**, and the public certificate digest does not grant any private signing capability. The independent G Glass APK is **NOT_INSTALLED**. The isolated CI APK debug signer is ephemeral and not owner-approved. There is still **no verified owner-approved permanent G Glass signing key or signed physical APK**; do not enter a guessed Android App signature, copy another app's signature, click Save changes while this identity is incomplete, upload private keystores, or install/replace anything.

## Safe screen work
Owner has entered the package but was instructed to leave `App signature` empty and `Save changes` untouched until G Glass-specific signer identity is prepared and independently verified. Non-installing permissions / project-page inspection are safe subject to owner direction. Camera and microphone are intended features (one explicitly authorized photo, Korean voice assistance), but any platform permission toggles must be transparently explained. Never assume unsaved form values persist across navigation.

## Existing constraints unchanged
Keep JH Secure Live, Meta CameraAccess, existing Meta AI app, KaBiseo, Ebiseo, and glasses connection unchanged. No subscription or paid OpenAI API calls. Beta invitation, source-matched signed APK, and real-glasses E2E remain unverified. `Hey Meta, start G Glass` remains an unverified voice-invocation hypothesis.

## Next action
Continue user-guided WDC Android page setup one small step at a time; prepare a **G Glass-only durable signing key** controlled by the owner and a verified Base64URL SHA-256 certificate hash before submitting `App signature`. Avoid repeated Stage26 USB scans and duplicated setup. Do not install APK without explicit owner authorization.

## Related
Previous milestone: `HANDOFF_STAGE27_PHONE_READBACK_VERIFIED.md` in this directory.
