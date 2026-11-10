# JH Glass — Stage14 latest 7-part handoff (2026-11-11 KST)

1. **Goal:** Ray-Ban Meta glasses worn, phone in pocket, ChatGPT and Meta AI **phone app UIs closed**; invoke JH from glasses by Meta-approved voice app launch, speak Korean question, glasses take **one user-directed** photo, JH/AI answers, and **glasses speaker** reads Korean reply. No recurrent screen-share approval, no Share chooser, no paid OpenAI API use. Meta companion app still required for pairing; it need not be manually opened each request.

2. **Exact source:** GitHub repo `uro31821-lab/playwright-mcp-render-mucsckil`, dev branch `feature/jh-glass-photo-mailbox-20261110`, official Meta DAT Android pinned SDK 1.0.1 at `f4371bc9f90249d51eb07d7f8a61e8d829294f16`. User-uploaded JH E184P2 (1).zip verified by 550 hashes; original JH app unchanged. Stage14 new code:
`jh-server/owner-setup/glass-bridge/android_cameraaccess/JhGlassVoiceProbe.kt`,
`apply_handsfree_probe.py`, `test_stage14_voice_patch.py`,
`.github/workflows/jh-glass-stage14-voice-compile.yml`.

3. **Completed + proof:** Previous Meta CameraAccess actual glasses video/preview worked on Samsung phone. Stage10-12 server/owner/Android source tests retained. **Stage14 first successful hosted GitHub Android compile** `run 42927019136`: pinned official Meta SDK, Python source tests 8/8 PASS, `:app:compileDebugKotlin` BUILD SUCCESSFUL, no APK installation. Added authenticated voice launch intent onCreate/onNewIntent and a session-bounded DAT Speech first-final transcript, fixed Korean TTS through Android media routing check, **no photo recognition**. After that result, TTS completion callback was added instead of 1.5-second cutoff, with a new compile CI under verification (check latest workflow state before calling final PASS).

4. **Failures/limitations:** Early CI failed Python temp directory setup, then CameraAccess version catalog missing official `mwdat-speech` alias; corrected with official 1.0.1 coordinate and source guard. Voice Invocations/Speech SDK are **experimental**, beta developer-channel/WDC approval required. Voice invocation is **Meta-controlled app-by-name only**, not direct takeover of default “Hey Meta” or a custom wake word. Korean app launch unverified and upstream discussions reported failures; after launch Korean Speech/phone-mediated TTS must be tested on THIS glasses model and locale. Bluetooth output existence does not prove actual glasses playback. The current Activity-bound prototype is NOT a background/locked-phone production daemon. No phone APK was installed, no genuine voice test has occurred.

5. **Do not repeat:** Initial Meta Developer Mode/SDK setup, Java17/SDK36, CameraAccess debug install and live streaming, ad hoc screenshots or repeating per-photo MediaProjection approvals, E184 zip requests, Google Drive or sandbox unreliable ZIP retry, Windows security bypass. Do not claim “GPT app closed hands-free E2E” from CI alone. Do not deploy or consume metered API without hard-zero-cost enforcement.

6. **Pending tests:** Complete latest Android compile for TTS callback. Native app WDC Beta Voice Invocations eligibility/app name setup (phone direct app launch from glasses), one initial DAT MICROPHONE permission, actual Korean Speech transcript, actual audio heard via Ray-Ban Meta speaker with no phone media speaker, phone locked/background continuation with proper Android services, single DAT photo capture and offline/strictly no-paid visual model/JH routing; safe clinical patient content gate. JH original OAuth/owner and photo backend not yet mounted, no same-chat automatic file injection proof.

7. **Next one action:** Read the new Stage14 GitHub CI run for the TTS callback change. If PASS, prepare one **separate debug trial** (source/security/signature gates) and explicitly request user permission before installing/launching anything. The next physical proof must be **voice invoke → Korean ASR → audible answer on glasses**, with GPT and Meta AI UIs not manually opened, and no photo/API cost. If Meta WDC beta or Korean invocation is blocked, test a deliberate glasses input fallback, do not revert to GPT screenshot reading.

Relevant spec: `STAGE13_TRUE_HANDSFREE_TARGET.md`; Stage14 implementation: `STAGE14_VOICE_SPEECH_TTS_PROBE.md`.
 
**Continuation sentence:** JH 안경비서 이어서. Stage14 인계서 기준으로 공식 SDK 음성 호출·한국어 ASR·안경 스피커 TTS부터 실기기 검증을 준비해. 기존 카메라 시험은 반복하지 마.
