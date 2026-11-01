# JH168 Stage35 — original signed receipt reference, encrypted client-carried handoff

Status: REVIEW CANDIDATE, not deployed.

## Goal
Stage34 can validate historical signed device-result receipt from original private HMAC-only SQLite if the original job/device/session/command reference survives. Stage35 provides a short-lived sealed handle that keeps this sensitive-looking reference out of clear tool output and preserves it **on the receiving client** across a server restart. It does not manufacture an old reference or extend a signed job's original expiry.

## Design
- Stage35 uses authenticated AES-256-GCM with random 96-bit IV per issue. A distinct 32-byte AEAD key is derived through HKDF-SHA256 from the **already existing private original owner key**, namespace and Stage35 domain separator. Neither old HMAC signing/approval key nor the new derived key is sent to clients.
- The handle is an opaque ciphertext, not an OAuth token, execution authority, approval, grant, bearer credential or new session. It contains the original 11 exact reference fields ONLY after encryption; the only plaintext metadata is the version prefix. The random nonce makes successive handles distinct.
- Issuance requires the original trusted in-memory completed CLICK job, unchanged pre-dispatch frozen original job/command/device/session binding, the exact original current Secure56 command and device, and a positive Stage34 re-read of both original journal and Stage29 HMAC receipt. No completed original entry, no handle.
- Existing registerOAuthTool, chooseDevice(), active56(device), original original-command jhRequireCommand56(device) continue to guard issuance. No new BEGIN_COMMAND is issued; no Android action/consent request is made.
- After server restart, the client can present the ciphertext handle to a new OAuth-wrapped read-only tool. Original OAuth and **current** Secure56 signed device must be authenticated again. The server decrypts with the original owner key and calls Stage34's exact bound read-only SQLite/HMAC verifier. Changed devices, mismatching owner key, bad GCM tag, expired signed original task, forged result, untrusted principal, other job and changed command remain UNKNOWN.
- An original secure session may expire and be replaced **only for authentication of the new read**; it is never rebound to an old effectful job or a grant. The original device digest still must match.
- Server storage is unchanged: the Stage29 journal remains HMAC-only, the sealed reference is not inserted into a database or log, and the handle is carried by the client through a tool response. Loss of this handle, or the client failing to retain it across conversations, cannot be repaired after the original job is gone.
- The original signed expiry (usually short) remains the exact bound; the server will not extend it or re-execute the job to recreate a handle. Historical Stage27 action remains verified by its original evidence, but is not backfilled into Stage29/35.
- All success responses mean only signed **DEVICE RESULT RECEIVED**, not an independently verified historical UI transition. They report taskSuccessVerified:false, uiTransitionVerified:false, replayAllowed:false.

## Deployment boundary
This is source-only Draft PR stacked onto Stage34. Existing Stage27 APK, current Render Stage25/26 operator, original OAuth, local approvals, main branch, and live owner SQLite remain unchanged. A working client-side storage/synchronization plugin or in-Chat durable token retention is NOT proven. End-to-end live user experience requires separately reviewed owner migration, generated operator activation, actual OAuth/current-device binding, and client retention policy. GitHub synthetic CI is not proof of production rollout.
