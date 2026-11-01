# JH168 — original SQLite unresolved-action capacity and independent-work decision

Scope: source-only review. No change to the original Render volume, Secure56 protected runtime, device, APK, or approval. These counts concern manual-circuit.sqlite / circuit_actions, NOT operational-learning completion_unknown or the 57 trust-recovery quarantines.

## Original code contract

In jh-server/owner-setup/deployment/durable-manual-circuit-fence.mjs:
- MAX_UNKNOWN=512 and MAX_ROWS=10000, checked transactionally by reserveDispatch().
- An unresolved row with the exact same operation_hmac is rejected even if there is just one pending row: PREVIOUS_OUTCOME_UNKNOWN_RECONCILE_REQUIRED.
- An unrelated operation is not globally blocked simply because there are 29 historical unresolved entries. Secure56 device/session/command binding, phone approvals, policy and real storage availability still apply.
- The only original receipt transition accepted is OUTCOME_UNKNOWN to DEVICE_RESULT_RECEIVED with authenticated host completion. This is NOT an assertion of overall user-task/UI/business success.
- An owner-admission error alone is NOT proof of the 512-item capacity threshold.

## Historical evidence versus live inspection

The previously reported owner-shell readback was 29 OUTCOME_UNKNOWN, 466 DEVICE_RESULT_RECEIVED, around 0.93 GiB free on /var/data, and around 0.15 MiB for original SQLite plus WAL. These are historical observations, not a fresh read of the current owner volume. Connected Render management tools do not expose private-volume SQL or shell access. life_status.operationalLearning.attemptOutcomes.completion_unknown is a separate learning store and must not replace the manual-circuit count.

The isolated regression constructs scratch SQLite records with 29 unknown and 466 received, verifies independent admission succeeds and exact-identity replay is blocked, and checks that the original threshold of 512 remains fail-closed. No owner data, device action, production approval, or original task is touched.

## Authorized original-host read-only step, when owner shell is available

From the running service jh-server directory execute ONLY on the original authorized owner host:

    node verification/jh-original-sqlite-readonly-status.mjs /var/data/jh-owner-state/manual-circuit.sqlite

This uses DatabaseSync with readOnly=true and PRAGMA query_only=ON; it SELECTs only aggregate counts, checks current DB/WAL bytes and statfs available bytes, and emits no job identities, payloads, HMACs, credentials, or tokens. Available bytes are NOT proof of safe backup/snapshot or migration capacity. No schema migration or replay occurs.

## Operational disposition

1. Retain all historical unknowns, signature-bound identities and no-replay fences. Do not delete, mark complete, bypass duplicate identity, retry or increase the caps to force execution.
2. Continue source-only and read-only development independently of the historical rows. A truly new phone action requires the original Secure56 gates, live capacity, no duplicate unresolved identity and any mandatory phone-local approval.
3. For a blocked admission, investigate separately: exact duplicate unknown, true global capacity, unsupported action/policy, missing original command/session/device binding, and owner storage/SQLite error.
4. Do not merge, deploy, restart, migrate, alter authorization, or replay the completed Stage27 Chrome click based on this source-only review. Any operational cutover needs a fresh original owner count, backup/rollback verification and separate approval.


## 2026-11-01: actual OWNER_ADMISSION_BLOCKED reproduction and root-cause boundary

An existing JH Mobile13 neutral-page life_web_snapshot read succeeded but a subsequent life_web_click returned OWNER_ADMISSION_BLOCKED before phone execution. Exact original request payload, signed command/job ID and unmasked durable denial code are not recorded with that reproduction; do not assert a specific cause from the top-level error alone.

At live Render source 4c718900, the original durable-native-host.mjs separates:
- policy DENY (e.g. DURABLE_OPERATION_NOT_SUPPORTED for malformed signed CLICK/action)
- exact original operation duplicate (DURABLE_PREVIOUS_OUTCOME_UNKNOWN)
- missing job/device/session binding (DURABLE_JOB_BINDING_REQUIRED)
- capacity or SQLite exception, currently collapsed to DURABLE_STORAGE_UNAVAILABLE (503).
Original 29/466 counts cannot explain a global 512/10,000 capacity block.

The new jh-original-owner-admission-click.test.mjs uses original createDurableNativeHooks and isolated SQLite to verify: correctly shaped CLICK is admitted, the same unresolved CLICK identity is not re-sent, an independent request is admitted, and malformed CLICK or BACK remain fail-closed. This proves policy behavior for controlled exact inputs, **not** the cause of the historical OWNER_ADMISSION_BLOCKED request.

## One-read, no-deploy production count collection

Use the existing Render service Dashboard > Shell on the running **original** jh-secure-bridge-fix4 instance, not GitHub Actions, another Render service or predeploy. Run the following as one shell command; it reads only aggregate data and does not require installing this draft PR:

    node -e 'const {DatabaseSync}=require("node:sqlite");const {statfsSync,statSync,existsSync}=require("node:fs");const p="/var/data/jh-owner-state/manual-circuit.sqlite";const d=new DatabaseSync(p,{readOnly:true});try{d.exec("PRAGMA query_only=ON");const rows=d.prepare("SELECT status,COUNT(*) AS n,MAX(created_ms) AS newestCreatedMs,MAX(completed_ms) AS newestCompletedMs FROM circuit_actions GROUP BY status").all();const f=statfsSync("/var/data");console.log(JSON.stringify({checkedAtUtc:new Date().toISOString(),rows,dbBytes:statSync(p).size,walBytes:existsSync(p+"-wal")?statSync(p+"-wal").size:0,freeBytes:f.bavail*f.bsize}));}finally{d.close()}'

**Never paste secrets, operation HMAC, record IDs, approval grants or raw task payloads into a chat or GitHub.** An unchanged aggregate alone cannot identify which exact original click was refused. Compare the current aggregate to historical 29/466 only as context; to confirm the specific failure use the **original** denied job's safe signed readback/denial code, without starting a new command or repeating the click.

## Fix rules

If global cap is genuinely reached, retain unknown records and audit journal/backup safely; do not raise caps or delete rows. If duplicate, recover only the exact original receipt and keep no-replay. If malformed original CLICK, repair the true mobile alias/owner producer binding on an isolated candidate with full protected CI. If device/session/window stale, acquire fresh read-only context for a **new, independently authorized** action; do not replay unresolved effects. If owner storage fails, validate filesystem/permissions/mount/SQLite WAL and backup privately before any migration. Never convert unsupported actions into unrestricted dispatch.

## 2026-11-01 10:49:31 UTC — DIRECT ORIGINAL LIVE OWNER SQLITE COUNTS (owner provided)

**Source:** authorized original Render Shell, original service `srv-db0fjl2d0e5s73be114g` under `/var/data/jh-owner-state/manual-circuit.sqlite`. The owner ran a `DatabaseSync({readOnly:true})` / `PRAGMA query_only=ON` SELECT and supplied the actual output. These are **current observed snapshot values at that UTC timestamp**, superseding older 29/466 observations; they are not sourced from GitHub Actions or the separate learning database.

| Metric | Measured |
|---|---:|
| OUTCOME_UNKNOWN | **32** |
| DEVICE_RESULT_RECEIVED | **474** |
| Total | **506** |
| Original unknown limit | 512 (32/512 = 6.25%) |
| Original total-row limit | 10000 (506/10000 = 5.06%) |
| Disk free | **998154240 bytes** (951.914 MiB) |
| Original SQLite file | 155648 bytes (152 KiB) |
| SQLite WAL | 201912 bytes (197.18 KiB) |
| Last UNKNOWN created | 2026-11-01T09:35:11.288Z |
| Last RECEIVED created / completed | 2026-11-01T09:58:11.677Z / 09:58:12.408Z |

**Proven:** original global row count and global unresolved count were BELOW BOTH fixed limits at query time. Another independent result was received after the latest unknown row. Owner storage had free bytes. This **eliminates the global 512 or 10000 threshold as the observed cause of an admission failure at that snapshot**, but does not rule out an exact unresolved identity collision, unsupported operation, original command binding, short-lived device/session status, or SQLite transaction error at a different time.

**Specific admission not yet attributable:** the historical `OWNER_ADMISSION_BLOCKED` response has no preserved original command/job/request correlation or raw underlying refusal code. HMAC-only circuit rows do not contain recoverable command text, target UI, job ID, approval grant, or an inverse mapping to a rejected request. Searching Render application logs did not find this exact tag or the lower-level durable denial code in the observed window. Therefore the specific refusal is **UNKNOWN**, and the 32 unknown rows must not be treated as 32 failed or incomplete business/UI actions.

**Disposition:** no data deletion/cleanup, automatic retry, replay, policy bypass, or live rollout is needed to solve the (nonexistent) global capacity issue. Future original admission denials should expose only a bounded cause code through their already-authenticated original-job readback, preserving no-replay and preventing sensitive tokens/payloads in logs. Such an observer is a separately reviewed, unshipped source proposal and does not reconstruct missing evidence from an old attempt.
