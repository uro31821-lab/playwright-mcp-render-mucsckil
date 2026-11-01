# JH168 Stage29 — Immutable original-result receipt persisted in the existing owner journal

**State:** source-only, isolated SQLite regression candidate. Not deployed. Android APK Stage27 is unchanged and must not be installed again. Current Stage28 passed 31 isolated tests. The prior Chrome popup CLICK is already completed and must not be retried.

## Existing verified architecture

The current owner-bound journal is \`manual-circuit.sqlite\`. The original \`DurableManualCircuitFence.reserveDispatch\` records an \`OUTCOME_UNKNOWN\` action with an operation HMAC before the phone receives it. Only after the existing signed Secure56 completion is authenticated does \`recordAuthenticatedDeviceResult\` durably record \`DEVICE_RESULT_RECEIVED\` plus a keyed result HMAC. It **does not store jobId, session/command binding, screen evidence or any indication that UI task success was independently verified**.

Stage25 \`sfr_\` readback references the original in-memory job; it expires after a bounded time and cannot survive a restart on its own. Stage26 permits exact HMAC+fresh nonce duplicate completion ACK within the original in-memory context but does not recover old job payloads after a server restart. Stage28 synthetic loss/ACK tests passed, but were not live fault injection.

## Stage29 source-only adapter

\`stage29-durable-completion-readback.mjs\` adds an **explicit one-time, opt-in extension table to the already owner-bound and initialized manual-circuit journal**, without replacing, resetting, migrating or overwriting the original \`circuit_actions\` data. There is no new database file, user secret, OAuth scope, session, approval or MCP endpoint. In private host integration only:

1. The original signed completion HMAC + fresh nonce, exact secure session and device must pass the ORIGINAL production checks.
2. The ORIGINAL durable \`recordAuthenticatedDeviceResult\` must commit to \`DEVICE_RESULT_RECEIVED\`. Stage29 is not a replacement for that receipt or approval.
3. The caller provides original journal recordId, **original in-memory Secure56 job and original device result** plus owner/device/session/command/request/context/item/expiry binding. Stage29 rechecks all original job fields, recomputes the result digest in memory, and validates the resulting original journal operation and result HMACs. A caller-supplied digest is not accepted.
4. A later server instance may use the same existing owner-bound key and namespace to open the ledger **read-only in effect** (SQL SELECT only in the read method); the caller must still pass a host-injected fresh current authorization callback that positively verifies the original binding. A request-side boolean \`authenticated:true\` is never accepted.
5. Returned status is **historical signed device result received**. It explicitly returns \`taskSuccessVerified:false\`, \`uiTransitionVerified:false\`, \`newJobCreated:false\` and \`replayAllowed:false\`. It cannot recover or re-execute an old click, reconstruct the screen, rebind a changed session or extend expiry.

The new SQLite row stores only HMACs, an opaque original record ID, receipt timestamps and a row integrity MAC. It persists **no raw job body, screen pixels, user text, device ID, session token, OAuth token, password, full raw result, private key, phone consent or grant**. Its immutable triggers refuse UPDATE/DELETE. Expiry and capacity fail closed; no garbage collection or silent initialization is provided.

## Operational limits / why NOT to deploy yet

- This is **not yet inserted into the live \`createDurableNativeHooks.acceptedCompletion\` caller**. Adding it requires private owner-host wiring with the exact HMAC/nonce and signed completion order, a reviewed one-time migration of the existing owner volume, and original-current-authorization verification. It must not be exposed as a caller-authorized endpoint.
- The original journal's old Stage27/28 events cannot be backfilled: their in-memory jobId/session linkage was not recorded, so the new table cannot safely manufacture those bindings retroactively.
- The original journal acceptance and Stage29 row creation are currently two transactions. A crash between them leaves the new receipt unavailable: **UNKNOWN, not proof of failure and not permission to replay**. A future production integration may require an atomic single-transaction upgrade, reviewed separately, before availability claims.
- A new Secure56 session or changed device, owner or command cannot silently rebind the original result. A trust-approved readback protocol for a restarted host needs separate verification.
- The Stage29 receipt provides **result-received audit**, not automatically the observed Chrome menu or signed HTTP response itself. Accurate historical UI proof needs a separate already authenticated durable signed screen-evidence design.
- Do not restart the running owner service or disconnect the phone during a click. Do not add a Render disk or change permissions without approved owner-volume migration and rollback planning.

## Tests

Node.js 22 \`node:sqlite\` with original \`DurableManualCircuitFence\` on a disposable private SQLite file:
- authentic original receipt + restart/reopen => read-only received record, no new work
- pending/unreceived original action => no fabricated receipt
- wrong operation/result HMAC, job/session/device/owner/command/request/context/target => refuse
- no current host authorization => refuse
- expiry, corruption, second migration and wrong key/namespace => fail closed
- immutable SQL rows and no screen/user text stored
- Stage26/28 original code preserved, no new endpoint/approval/Android executor

**Expected evidence**: separate CI run and results. CI is not live installation or production deployment.

## Binding hardening note
The original draft took an independently supplied raw result digest; its HMAC verification alone could not tie arbitrary jobId/session fields to the original job. This candidate now requires the original trusted in-memory job and original device result, compares all original job fields with the exact binding, and computes the digest inside the host module. Result contents are never persisted. Synthetic tests now reject a swapped in-memory session, command, job ID, device digest, expiry or result.
