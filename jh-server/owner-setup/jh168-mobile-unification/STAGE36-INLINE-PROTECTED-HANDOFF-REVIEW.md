# JH168 Stage36 — original protected completion with automatic sealed handle

Status: source-only Draft. No Render deployment, SQLite migration, Android execution, APK build or previous click replay.

## Prior evidence
Stage27 signed Android APK installation and the original Chrome overflow-menu click were already verified. Stages 28–35 supplied signed same-body ACK, keyed owner result ledger, atomic SQLite receipt, safe offline migration, current-main source integration, authenticated read-only original receipt and AES-GCM sealed short-lived reference. Stage35 is Draft PR #101; it has no live Render activation.

## Missing Stage35 handoff step
Previously, after the original CLICK completed, the caller had to make a separate tool call to issue the encrypted reference before its original short expiration. Stage36 attaches this reference to the ORIGINAL verified completion response instead; it does not create a new command, phone inspection, approval, replay or execution.

## Exact source design
- Stage36 adds one private WeakMap bridge to the original generated Stage25/26/30/34/35 Secure56 operator. The base operator remains unmodified and still owns all signed device request/HMAC/nonce checks.
- The original JH155 dispatch already receives the signed completed job and uses the existing jhInspectSplitEvidence155 right/left pane proof. Only if the original job is complete and its action CLICK, device, device digest, original session and command remain exact can Stage36 ask Stage35 to seal the original reference.
- The Stage35 host issuance verifies the original Stage30 HMAC journal and Stage29 immutable receipt. It cannot authorize a new job or phone action. Sealed data stays transient in a WeakMap keyed by the exact local response object.
- Stage36 does NOT put the handle into the device-returned object. After the existing runProtectedJHAction verifies the same screen evidence, and only for verified=true, executed=true, duplicate=false, the original MCP completion response receives originalReceiptHandoff with sealed_handle, unchanged expires_at_ms and the existing retrieval tool name.
- Untrusted native originalReceiptHandoff fields are deliberately stripped from the output; only the server-generated token can appear. Repeated finish consumes the stored handle once, and a consumed original response cannot cause another issue.
- If Stage35 fails, protected proof fails, the job is still pending, the command/device/session changes, or the original deadline passes before final handoff, the old response behavior remains and no sealed handle is issued, output or renewed.
- The Stage35 result proves historical signed DEVICE RESULT RECEIVED only. Stage36's original protected UI proof remains separate and no one may treat the handle itself as a historical UI-success certificate.

## Scope limits
- A client must retain the sealed token returned by that specific conversation/tool. ChatGPT cross-chat durable token storage is NOT implemented or guaranteed.
- The original signed expiry remains short and unchanged. Old Stage27 click evidence cannot be backfilled and the completed click must never be repeated to manufacture a token.
- Original Secure56 local approval, OAuth, device HMAC, owner identity, job admission, pending receipts and latest learning engine remain unchanged.
- Stage36 is a source-only candidate. Live owner-volume schema migration and Stage30–36 production activation still require separate owner approval and real read-only disk/journal prerequisites.

## Verification
GitHub Actions Stage36 workflow tests helper gating, actual original signed owner SQLite+Stage35 host with restart and protected proof simulation, exact generated Stage25/26/30/34/35 source patch, existing Stage35 encryption, original signed ACK/approval and durable owner constraints. Any failure blocks merging or deployment.

## Next sequential stage
After CI passes, evaluate actual client receipt preservation and operator rollout readiness without skipping original owner journal unknown-count, backup headroom, release approval or replay safeguards.
