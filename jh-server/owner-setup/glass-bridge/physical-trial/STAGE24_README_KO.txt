G Glass Stage24 - Windows read-only app signer preflight
Version: 2026-11-11 Stage24
Status: actual Windows CI source checks passed, real user phone readback NOT RUN.

Purpose: see public signature SHA-256 and version for the currently installed
Meta CameraAccess and separate G Glass trial apps. It DOES NOT install, delete,
update, approve, modify device settings, read photos, capture screen, contact
ChatGPT/OpenAI, or start a Meta Beta registration.

1. On your existing Windows PC, verify the downloaded ZIP with Windows Defender
   and extract the complete ZIP to a folder. Never bypass security warnings.
2. Existing Python 3.10+ and Android SDK platform-tools/build-tools are required.
   These tools are NOT downloaded or installed automatically.
3. If your Android phone is ALREADY trusted for USB debugging by your PC,
   connect ONE phone by USB. Do not enable debugging solely because of this
   file unless you have explicitly decided to participate in the diagnostic.
4. Double-click "실행.cmd". Read the purpose and type EXACTLY YES only if you
   agree to the read-only inspection. Enter or anything else cancels.
5. The file RESULT.txt reports only app name, public certificate fingerprint,
   version and app APK hash, or a precise blocked reason. Do not publish a result
   containing information you do not want to share.

This is NOT a G Glass installer and NOT approval to install an APK.
If Android SDK, Windows Defender, ADB USB authorization, or any test fails,
the correct outcome is BLOCKED. Never disable security to proceed.
Meta WDC Beta support and actual glasses microphone/speaker are separate tests.
JH Secure Live/CameraAccess apps remain untouched.
