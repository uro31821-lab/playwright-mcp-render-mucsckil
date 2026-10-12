# JH site switch discard — 2026-10-12

User request: when the user selects a different site while JH is working, cancel the previous work and delete its temporary state instead of saving it for resume.

This change extends the existing Secure56 workflow patch. It adds `POST /device/discard-work` with a separate `discard|session|device|nonce|expiry|bodyDigest` HMAC domain. The active session, exact device, body digest, nonce replay and expiry are all verified before deletion. It does not create a session, grant an approval or change deployment settings.

An authenticated event invalidates unfinished workflows for this phone, deletes their persistent workflow state, drops queued/in-flight command and transient result bodies, and resolves pending frame waiters without a frame. In-flight steps and late results cannot recreate the removed workflow. Completed workflows from the bound workflow engine remain intact. Unbound phone command/result bodies are transient and are purged for this device. The existing durable duplicate-execution ledger contains hashes, not resumable work or command text, and remains authoritative for previously dispatched effects.

Only a hashed device key and random deletion event ID are retained for idempotent acknowledgement. This is not saved task content. An ACK retry does not erase newly started work. The Android companion blocks admission of new phone commands until the matching deletion ACK, and persists only its random pending event ID while offline. Android must be updated together with this server code; deploy the server capability before installing that companion APK.

Validation:

- `node --test verification/site-discard.test.mjs verification/durable-computer-policy.test.mjs`: 21 tests pass. The new test executes the generated discard HTTP handler, actual HMAC/nonce validation, persistence and workflow handlers with synthetic devices. It covers bad authentication, cross-device rejection, late completion, restart, transient body erasure, frame cancellation, repeated deletion ACK and new-task preservation.
- Existing `durable-live-release.test.mjs`: 8 pass, 1 fails on a pre-existing SQLite byte-identity assertion. The same failure was reproduced with both changed production files restored to base commit `c87bc9001b869f4c2f60eab29638515dc7cdc125`. No unrelated storage migration was changed.
- No production deployment or real-phone end-to-end test has been performed for this change.

This is logical task-data deletion, not forensic storage sanitization. It does not reverse an external transaction already completed before cancellation.
