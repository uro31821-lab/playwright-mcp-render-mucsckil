# New user command priority / single active JH command

This change extends the existing Secure56 queue, workflow journal and cancellation route. No parallel task executor or replacement orchestrator is introduced.

## Required caller contract

For each **new user instruction**, call `life_android_workflow_link` with `mode: "BEGIN_COMMAND"` and a fresh random 32-character lowercase hexadecimal `request_id`. Keep this request ID stable across transport retries. Pass the returned `commandId` as `command_id` to every subsequent Android/web tool for that instruction. Ordinary follow-up steps within one instruction reuse that ID. Never obtain a fresh ID to retry an obsolete instruction.

The existing `BEGIN` mode starts a new correlated test workflow and also replaces the prior command. Its `workflow_id` continuation keeps the original binding. `STATUS` is read-only and cannot dispatch. New command admission requires the existing trusted, active Secure56 device. Missing, superseded or stale command IDs reject before dispatch. Job command IDs are part of the existing full signed payload.

Tool descriptions and schemas include this contract. A deployed connector must refresh its catalog; old clients that omit `command_id` will be rejected. This source package does not update or install the user's connector by itself.

## Cancellation and persistence

- New BEGIN removes unfinished workflows, queued commands and transient bodies for that device before the new command can run.
- Existing async tool callbacks carry their command identity; checks before Android/browser dispatch and after async returns prevent stale follow-up jobs and cached late results.
- Direct site selection uses the signed `/device/discard-work` route. It invalidates the previous command and permits no automatic resumption.
- New-command cancellation from a phone that already knows the preceding command sends `previousCommandId`. A delayed request therefore cannot erase a newer accepted command. The old FIX1 unscoped payload remains valid for site selection and cases where the phone has not yet observed a command ID. In that unscoped case, a command accepted before the server receives the cancellation can also be discarded; it is never silently restarted. Device-to-server ordering of a first unseen/queued command remains an integration test item.
- Content-free current-command fences and all seen deletion/request IDs are durable. Repeating A after B, including after restart, neither cancels B nor recreates A. Capacity fails closed; IDs are never silently dropped to allow old instructions again.
- Completed external actions are not refunded, recalled or rolled back. Existing duplicate-effect hash fences and completed action receipts are retained. In-flight external operations already accepted by a provider may finish; no automatic compensation is attempted.
- Full command text is never written into the new fence/ack data. Canceled workflow content is logically removed; this is not forensic erasure of external service/browser backups.

## Verification

`node --test jh-server/verification/site-discard.test.mjs jh-server/verification/durable-computer-policy.test.mjs jh-server/verification/new-command-runtime.test.mjs`

26 checks pass, covering authenticated deletion, late callbacks, one active workflow, stable command retry, rejection of old tokens, persistent restart, multiple delayed delete requests, completed receipts, other-device isolation and existing consequential-action controls. The actual routed production generator, MCP SDK schemas, signed command payload and queued browser transport cancellation are exercised by `new-command-runtime.test.mjs` (synthetic session and browser transport; no live device).

`node --test --test-name-pattern='generated production entry' jh-server/verification/durable-live-release.test.mjs`

The existing production entry generator retains its pinned composition and parses successfully (1 check). The existing real local owner/Life/cutover host startup test also passes (1 check), including initial and verify-only startup, health response and rejection of unauthenticated MCP. These tests use synthetic devices/transports. No operational server deployment, live payment/message, or real-phone trial was performed.

The broader preexisting `durable-live-release` SQLite byte-identity failure documented in FIX1 is not reported as fixed. FIX2 does not change that storage initialization path.
