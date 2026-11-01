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
