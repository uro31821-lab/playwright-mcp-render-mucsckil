# Stage 13 — JH Glass: hands-free voice-first target (user-corrected 2026-11-11)

## Non-negotiable user experience

**Ray-Ban Meta glasses worn, phone in pocket. No ChatGPT app or Meta AI app display open.**
The user says a voice command, the glasses capture what they are looking at after a deliberate request, the phone runs JH processing in the background, and the answer is spoken through the glasses. No repeatedly approving Android screen captures; no Share chooser; no opening another ChatGPT chat; no automatic recording of patients or bystanders; no separately billed OpenAI API usage.

The previously developed **CameraAccess preview -> JH screenshot -> ChatGPT** path is a **diagnostic fallback only, NOT THE PRODUCT**. Stage 10-12 source for `JH로 보내기` and owner authentication is reuse material, not evidence that voice-to-vision-to-audio actually works.

### Intended user story

1. Wearing the glasses, no visible phone/GPT screen.
2. Activate JH by a supported glasses voice invocation (only if real device/locale/channel permits); otherwise a specifically user-approved alternate trigger.
3. Ask in Korean: “에비서, 이게 뭐야?”
4. Only after this explicit request, use the DAT camera to capture **one frame** plus DAT Speech Korean transcription; validate client/owner and sensitive-image policy.
5. JH chooses the appropriate assistant (nature/art/shopping/etc), computes the visual answer **on device/offline by default** or through an explicitly approved, hard-zero-billed route; no automatic use of ChatGPT Pro subscription as an API.
6. Use Android TTS/audio routing to return a short Korean answer via the connected glasses speaker; do not show the GPT chat or Meta AI phone screen.
7. End the photo transaction; no continuous camera upload or silent background capture.

### Proposed independent layers

`Meta DAT voice invocation / Speech / Camera` (wearable sensor and speech input)
→ `Android phone JH foreground service` (runs while device screen is locked; must be verified on Samsung without defeating Android safety)
→ `JH verified Secure56 session + once-enrolled owner/device trust + per-photo signed command + privacy gate`
→ `JH assistant router + local visual model / optional strictly capped hosted GPT inference`
→ `Android Korean TTS + Bluetooth audio route to glasses`.

The glasses are a sensor-and-audio terminal, **not** a standalone GPT computer. A compatible phone remains necessary for the proposed DAT mobile-app path.

### Meta SDK capability check (official 1.0.1 pinned source)

Official SDK: https://github.com/meta/meta-wearables-dat-android
Pinned `f4371bc9f90249d51eb07d7f8a61e8d829294f16` (`1.0.1`, Oct 9 2026).
- Camera and in-stream capture: supported (already worked on this user's Ray-Ban Meta).
- `mwdat-speech`: experimental on-glasses ASR. Requires camera/session-independent DAT microphone permission **requested after a user action**; use `DeviceSession.addSpeech()` and collect final Korean transcripts. Exact live hardware/locale/accuracy in user's configuration: **NOT VERIFIED**.
- Voice Invocations: experimental `Wearables.startVoiceInvocationsStream(...)` and `isVoiceInvocationsIntent`, `LaunchApp`. Only app-by-name launch; does NOT replace the Meta default assistant and does NOT support bare “Hey Meta” or forwarding arbitrary queries to JH. Registration and launch name require the WDC product listing and beta channel flow.
- Meta staff clarification in https://github.com/meta/meta-wearables-dat-android/discussions/209 (Oct 2026): **no separate voice permission switch to request**; configure product name/version, Beta release channel, Meta AI App connections “Launch with Hey Meta” toggle. In their tests English (US) launch-by-name worked, but **Korean/Hangul native app launch was not confirmed to work** and consistently failed upstream of the SDK. Do not repeat unchanged failed Korean launches as if JH Kotlin could fix them.
- After an app is running, Korean Speech worked in community experiments, but those reports are NOT proof for this user's devices. Speech + voice launch features are experimental and cannot yet be published to production channels.
- Meta AI app **must be installed/used to pair the glasses**, but opening its UI each time is not the intended usage. “Hey Meta” wake and app-launch routing remain Meta-controlled; JH cannot claim its own arbitrary built-in always-on wake word.

Sources:
- https://developers.meta.com/wearables/faq/
- https://github.com/meta/meta-wearables-dat-android/blob/main/plugins/mwdat-android/skills/voice-invocations/SKILL.md
- https://github.com/meta/meta-wearables-dat-android/blob/main/plugins/mwdat-android/skills/speech/SKILL.md
- https://github.com/meta/meta-wearables-dat-android/discussions/209
- https://developers.meta.com/wearables/device-access-toolkit/

### Cost reality / required proof

- **ChatGPT Pro subscription ≠ OpenAI API access**. Without opening ChatGPT, genuine hosted GPT inference normally requires a separately metered API; the original $200/month complimentary benefit is conditional and must never silently draw on previously purchased funds.
- For a **strictly zero-extra-cost** guarantee, default to an offline/on-device local visual model and Korean TTS after measuring phone resources and quality. This will NOT be genuine GPT-6 and may be less accurate; label the model truthfully.
- An optional GPT API path is disallowed unless server can actually verify remaining complimentary-only credit and stop **before** any billed usage. If this cannot be guaranteed, the API branch stays OFF. No automatic fallback to metered GPT.
- Alternative Meta AI Connectors early access can serve JH's tools through Meta AI without a separate app, but the assistant is Meta AI rather than GPT; developer access is gated and the user dislikes Meta AI. Do not silently choose it as primary.

### Feasibility-first tests (do NOT repeat camera preview)

P0: Confirm WDC app/version/Beta eligibility and which voice invocation path the user's installed Ray-Ban Meta can actually launch. English vs Korean launch is a **real platform limitation**, not a local UI bug. Do not switch the user's Meta AI interaction language without explicit request and a reversible plan.

P1: On actual glasses, verify `Speech` Korean transcripts and **Android Korean TTS audio output routed to glasses**, while the ChatGPT and Meta AI UIs are not open. Permission prompts must be locally approved, not auto-clicked. Record exact device/firmware/Meta app/SDK/version and actual end-user evidence.

P2: With app running and phone screen OFF, issue one Korean request; receive transcript; trigger one authorized DAT photo; process locally; answer on glasses; verify not just a screenshot outcome. Battery/Android foreground service restrictions and privacy indicator should be measured.

P3: Verify cold voice invocation from glasses in supported release channel. If ko-KR launch not supported, report the blocker clearly and provide an approved backup activation method; never claim “all voice, no phone” works in Korea before a physical test.

P4: Route verified image through JH assistants with proven cost cap, non-sensitive image constraint and no repeated consent for every ordinary user-triggered photograph. Only then consider separate installation/production rollout approval.

### Completion criteria

**Only PASS** if, with the ChatGPT phone app closed and Meta AI UI closed, the wearer triggers a request from glasses, asks in Korean, the glasses take a user-directed single photo, JH processes the visual data, and the answer is audibly delivered through glasses, with no repeat screen-share approval and verified zero additional billing. Each layer must be logged individually; Android/Node CI or “frame_delivered_ephemeral” does not prove end-to-end success.

### Previous work and non-deployment constraints

- Reuse already working Meta DAT camera, captured preview, user-supplied E184P2 Android source and Stage10-12 source QA.
- Original JH package `com.koreanlifehub.bridge`, installed CameraAccess, Render server and JH plugin are unchanged.
- Never transfer private original E184P2 ZIP, signing keys, patient images or tokens to the public GitHub repo.
- This file is SPEC ONLY. No foreground voice, ASR, TTS or 100% hands-free app is currently running. No additional OpenAI API call was made by writing this spec.
