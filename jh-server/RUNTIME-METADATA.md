# Runtime metadata observation

This small addition avoids asking the operator to paste a multiline diagnostic command into Web Shell. After the existing verified JH entry successfully loads, it emits exactly one `JH_RUNTIME_METADATA` JSON record to the service's existing private logs. It creates no public endpoint and accepts no remote parameters.

Only the configured target service is inspected. Other services report `WRONG_SERVICE_OR_CONTEXT` without file metadata reads. The record covers eight pre-existing owner/Life setting names, fixed file-metadata statuses, an observed `/var/data` mount point, and an optional validated public Git revision. It never prints setting values, file paths, private file contents, account identifiers, tokens, or error details.

The only file-content read is the fixed kernel metadata file `/proc/self/mountinfo`. Config/key/database/registry/policy files are checked using metadata only. This is not credential verification, storage initialization, owner enrollment, permission granting, a durability test, or an approval to deploy the larger integrated server. `releaseReady` is always false, even when all named files exist.

Existing server, OAuth, Android approvals, browser modules, replay bounds and integrity transformations are unchanged. The entry has only an import and a post-load emission call added. Logging failures cannot change server execution. No jobs or recurring schedules are added.

Deployment and observation are separate: a successful GitHub check does not prove the production record was emitted. Read the deployed commit and its runtime log before reporting actual settings. Do not infer a missing configuration from a missing log entry. File metadata is a point-in-time observation, not a lock or guarantee against concurrent changes.
