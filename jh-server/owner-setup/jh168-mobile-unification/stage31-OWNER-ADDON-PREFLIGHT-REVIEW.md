# JH168 Stage31 — owner SQLite offline add-on migration and release gates

**State:** source-only, isolated CI. NO Render changes, device work, credentials, APK rebuild, deployment or production migration.

## Verified upstream baseline
Stage27 signed APK installed with original signing certificate and ONE Chrome overflow-menu click verified by a new popup and JH completion. Stage28 no-replay transport fixtures passed. Stage29 (PR 93, unmerged) added HMAC-only original-result receipt lookup in existing owner journal. Stage30 (PR 94, unmerged) made original authenticated completion and Stage29 receipt one SQLite COMMIT. Both are code candidates, not live operator activation.

## Stage31 original storage plan
- Reuse exact original validated owner config and owner key, original owner volume identity checks, and original exclusive SQLite owner runtime lock. A running owner process blocks the migration before any write.
- Inspect original manual-circuit.sqlite journal, verify keyed owner namespace and original table count/legacy row fingerprint, and refuse corrupt or partially migrated schemas. Require ZERO unresolved OUTCOME_UNKNOWN actions.
- A dry-run plan returns an evidence-bound digest and counts, with zero device actions, credential material, screen payloads or original job IDs in the report.
- Migration requires a deliberate, exact offline confirmation and the current identical plan digest; this is not authorization to mutate the live owner service on the user's behalf.
- Before modifying a journal, make a new consistent SQLite VACUUM INTO snapshot under a private 0700 folder, chmod the snapshot 0600, fsync, and independently verify database integrity, original owner HMAC binding and original legacy record fingerprint. Keep it private and never automatically delete it or overwrite a previous backup.
- Apply only the existing Stage29 explicit one-time additive schema mode. Original circuit_actions records, state, received count and cryptographic fingerprint must remain identical. Duplicate migration is read-only reuse, not a reinitialized or overwritten journal.
- Rollback is selection of the previous verified host code with its original journal schema still intact. NEVER restore stale snapshots automatically because newer receipts or unresolved actions could be lost. Backup restore is a separate reviewed operator-only recovery procedure.
- Old Stage27/28 clicks cannot be backfilled without their original scoped job/session evidence. The only recoverable claim is historical signed device-result received, not UI success or authorization to replay.

## CI and explicit limits
CI uses a synthetic original owner configuration, private temporary mounted-directory fixture, and original owner config/lock classes. Mount observations are synthetic, not proof that Render's real persistent disk is ready. Tests cover: dry-run, no consent, owner lock collision, backup and original fingerprint, preexisting result history, uncertain actions, wrong key/mount, partial add-on, private permissions, repeated migration and code-only rollback.

No live migration, Render restart, environment change, database or disk copying into GitHub/chat, device action or APK installation. A future release needs separate operator approval, exact current deployment/lock evidence, storage capacity and backup retention review, offline migration and rollback rehearsal before selecting a Stage30 candidate.
