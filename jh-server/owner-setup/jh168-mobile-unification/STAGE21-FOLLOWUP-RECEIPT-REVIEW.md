# JH168 Stage21 — Read back the ORIGINAL split FOLLOW_UP CLICK (review only)

## What this does

The existing split-read receipt registry intentionally covers only \`START\` and \`STATUS\`. If a signed \`FOLLOW_UP\` CLICK times out, reissuing the click is not a safe way to learn its outcome.

This source-only candidate adds a **separate read-only result receipt** for the exact \`split_screen_session_followup\` + \`CLICK\` + \`REVERSIBLE_WRITE\` + \`life_android_execute_computer_action\` route, without installing BullMQ, Redis or a new Android executor.

- The first click is still governed by original Secure56/HMAC, device-local approval, original command fencing, and the durable **one-click journal**. This addition grants no execution authority.
- A pending original click can expose an opaque receipt starting with \`sfr_\`.
- The **existing** MCP tool \`mode=READBACK_PENDING\`, with only \`receipt_ref=<sfr_...>\`, reads the original job by its ID. It cannot initiate a click or approve an action.
- The receipt is bound to exact device ID and digest, trusted session, command ID, task digest, original click request ID, context ID and target itemRef. Scope drift, expiry and missing original jobs fail closed.
- A verified result requires the original signed \`resultVerified=true\` **and** original right-pane evidence policy. An unrelated new window alone is not proof of success.
- An authenticated \`target_obscured\` result with \`actionDispatched=false\` means **pre-dispatch block**, not missed click completion. Other failures without proof of dispatch status remain UNKNOWN.
- Receipt tokens and bindings stay in a bounded **process-local Map**. Original results are read from the existing job map; raw phone screens are not stored in receipt records.
- After restart, a missing receipt/result stays UNKNOWN. The existing durable journal prevents an unsafe repeated click; this candidate **does not promise restart-persistent result content**.
- No changes to device UI, Android APK, server startup, production routes, approvals, HMAC, or deployment. Explicit review and CI are required before integration.

## Review integration

\`applyJH168SplitFollowupReceiptPatch\` must run **after**
\`applyJH168SplitReadReceiptPatch\` on the exact generated Secure56 operator. It is intentionally **not enabled on the deployed server** by this branch. The generated-runtime integration test validates these source anchors, original policy guards and reversible patching.

Existing production issue \`target_obscured\` with \`actionDispatched=false\` remains separately unresolved. This proposal instead addresses \`split_screen_device_result_unconfirmed\`.

## External patterns (not runtime dependencies)

- BullMQ original job \`waitUntilFinished\` / \`fromId\` / \`getState\`: https://github.com/taskforcesh/bullmq/blob/master/src/classes/job.ts
- MCP Tasks (only if both MCP ends support it): https://github.com/modelcontextprotocol/ext-tasks
- AndroidX UI Automator action and screen-state verification: https://github.com/androidx/androidx/tree/androidx-main/test/uiautomator/uiautomator/src/main/java/androidx/test/uiautomator

