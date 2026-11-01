# Stage41 — signed JH command invalidation source review and exact diagnostics
Status: CI SOURCE ONLY. No Render or phone change.

## The actual two mutation sources in the generated Secure56 runtime
1. An OAuth-authenticated `life_android_workflow_link(BEGIN_COMMAND)` calls the original `jhStartCommand56(device,newRequestId)`, which calls `jhDiscardDeviceWork56` and rotates `jhCommandVersion56`. This is intentional *new-command* cancellation; all prior pending action/result records retain their original no-replay safeguards.
2. A **phone-local HMAC-authenticated** POST `/device/discard-work` calls exactly `jhDiscardDeviceWork56(device,eventId,previousCommandId)`. An event with a matching previous command ID is a scoped cancellation; an event lacking previousCommandId can replace the current device command. The original code does not record this source for a later read-only host call. An old scoped event that doesn't match the active command does not replace its version. The signature, nonce, HTTP admission and original discard operation MUST remain unchanged until authenticated producer intent is proven.

## What the LIVE failure proves (and does not)
- Existing Live `4c71890021fc299838e6a8ce45ccf5f64712f354` can read RIGHT Chrome via `life_web_snapshot`.
- Subsequent `life_android_computer_inspect` / `life_web_wait` have returned `new_command_binding_required_or_discarded` after fresh `BEGIN_COMMAND`, while a different earlier `life_web_click` had `OWNER_ADMISSION_BLOCKED` before dispatch.
- Neither error contains an authenticated "who invalidated this command" field; absent Render request logs are NOT evidence that phone discard did not occur. Simultaneous JH tasks from another conversation may also perform a genuine new BEGIN. No cause can be honestly declared from the old error alone.
- 29 historic SQLite `OUTCOME_UNKNOWN` records are unrelated to the current command-invalidation origin; they remain preserved.

## Stage41 reversible source-only patch
- New explicit `JH_STAGE41_COMMAND_LIFECYCLE_DIAGNOSTICS=EXPLICIT_SIGNED_COMMAND_CAUSE_V1` **requires** original Stage40 diagnostics, existing PHONE_RIGHT mode, and prevalidated original Stage25+26 owner runtime. Defaults to OFF.
- Insert only three read-only source annotations into the original signed runtime: append bounded in-memory enumeration of cause to successful new BEGIN and verified phone discard (after **existing** HMAC accept), and expose a redacted `commandLifecycleCause` if an MCP command binding rejects. No active command IDs, previous command IDs, device IDs, URLs, user account, HMAC, screenshot or raw exception are persisted or emitted. The original `jhRequireCommand56` and `jhDiscardDeviceWork56` remain byte-for-byte identical and maintain all authority.
- Possible codes are `NEW_BEGIN_COMMAND`, `PHONE_SCOPED_SITE_DISCARD`, `PHONE_UNSCOPED_SITE_DISCARD`, `COMMAND_CHANGED_SOURCE_UNOBSERVED`, `COMMAND_NO_ACTIVE_VERSION`, `COMMAND_DISCARD_IN_PROGRESS` and `COMMAND_OTHER_BINDING_FAILURE`.
- If source drift is detected, the exact source patch FAILS CLOSED. Source and source-test prove reversibility. No same-command lease renewal, no automatic recovery, no queue reattempt, no cross-session reuse.

## Controlled follow-up
1. Require exact generated runtime CI and all protected security sources unchanged. Existing source-specific owner/receipt release workflows may still fail on broad PR111 changed host files; do not remove those guards.
2. Only an explicitly verified release of exact pinned commit on the existing Render service can make this diagnostic observable on the phone. Current connected `trigger_deploy` does NOT accept a commit SHA and would deploy the current main instead of this Draft.
3. In one fresh task, preserve the same `command_id` for phone WEB02 READ → WEB03 action → native SCROLL → WEB03. A signed phone cancel may intentionally invalidate the original, and no engine may reuse it; classify which source actually changed the version, then fix a proven false positive (and negative-test spoofed/stale cases) before the next NEW task.
4. Never relabel old E2E as Stage41 passing. The 9+4 complete E2E is NOT PASS, and new source is NOT installed.

## External references (design principles, not copied code)
- https://github.com/appium/appium-uiautomator2-driver : original window identifiers, freshness, accessibility target state
- https://github.com/temporalio/sdk-typescript : signed workflow correlation, durable original effect identity and idempotency patterns
- https://github.com/open-telemetry/semantic-conventions : bounded, non-sensitive classification of failure reasons
