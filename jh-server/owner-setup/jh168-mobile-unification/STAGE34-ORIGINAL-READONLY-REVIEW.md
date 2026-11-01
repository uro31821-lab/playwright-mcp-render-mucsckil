# JH168 Stage34 — authenticated original-result receipt readback, no replay

Scope: strictly source-only, Draft PR. It is NOT installed in the Render service and does not alter the original Stage27 signed Android APK.

## Objective
After original Stage27 UI verification, Stage28 identical signed ACK, Stage29 original keyed result receipt, Stage30 same SQLite transaction, Stage31 owner-volume migration and Stage33 current-main integration, add the missing read-only owner-verified original-result query for an original authorized Secure56 click. Never replay the earlier click or cancel an existing command merely to read status.

## Implemented candidate
- stage34-original-receipt-reader.mjs opens ONLY the already initialized private original manual-circuit.sqlite in SQLite readOnly/query_only mode. It verifies the unchanged original owner HMAC and Stage29 schema/key, immutable triggers, original operation and signed result HMAC, receipt row MAC, original exact job/device/session/command/request/context/item binding and original TTL.
- The original owner-scope digest is derived from the original Stage30 owner namespace on the server; the public request cannot choose an ownerDigest.
- An injected current-owner authentication callback is mandatory. A request-side approved:true, authenticated:true or other boolean never grants status.
- stage34-owner-runtime-patch.mjs reversibly adds a host-only readOriginalReceipt function over the actual Stage30 original owner hook, using an internal unexported principal. It rejects any mismatch against current Secure56 device id and digest, and requires an existing current signed Secure56 session. It does not call reserveDispatch, execute, approval, consent, BEGIN_COMMAND or any Android action.
- A reversible generated runtime patch adds one OAuth-wrapped read-only tool life_android_original_completion_receipt_status. It takes the full original task reference and gets its CURRENT device/session proof exclusively from original chooseDevice(), active56(device) and devices.get(device), never from caller authorization booleans. It changes the Stage30 host import to the Stage34 host, leaving original signed completion HMAC/nonce and Stage26 ACK order intact.
- Response is intentionally only historical ORIGINAL signed DEVICE RESULT RECEIVED. It always carries taskSuccessVerified:false, uiTransitionVerified:false, newJobCreated:false, originalJobReexecuted:false, automaticReplay:false and originalSessionRebound:false. A registered receipt cannot be treated as a historical screen-success certificate.
- Previous sessions may rotate only for CURRENT read authentication, not for restoring, reauthorizing or replaying the original action.
- If the original signed TTL expired or original scoped reference was never preserved in an authorized handoff, return UNKNOWN and refuse to revive it. Stage34 does NOT magically recover the original reference or fabricate an expired result.
- Existing pre-Stage30 journal rows have no Stage29 atomic receipt and are not backfilled.

## Review and rollout boundaries
The Stage34 original current-owner status function is an opt-in candidate only. Source CI is not live OAuth deployment, actual owner-volume migration, phone E2E or a new historical receipt displayed by ChatGPT. Current production Stage25/26 remains active and unchanged. Live rollout remains blocked by Stage32 pending owner manual-circuit unknown count, actual private backup space, correct original owner and protected source selection. No old Chrome CLICK repeats. No APK rebuild/reinstall.
