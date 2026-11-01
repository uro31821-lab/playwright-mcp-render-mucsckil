# JH168 Stage25 — integrate original CLICK receipt with EXISTING live operator

**Status:** source/CI review only. NOT merged, NOT deployed. No Android APK or phone action. Stage24 APK has already passed the Chrome ⋮ click + resultVerified real-device test.

## Why the actual operator matters

The production Render service \`jh-secure-bridge-fix4\` is tied to \`jh-fix3-secure-server\`, \`npm start\`, and \`published-host-router.mjs\`. Its selected Secure56 operator is the existing **pending-approval** operator, not the stand-alone clean-restart candidate. It contains:
- original queued phone approval receipt
- original START/STATUS split-screen read receipt
- original Computer Use inspect result receipt
- owner and operational experience-learning patches
- signed Secure56 HMAC, authorization, command fence, original durable journal, and clean restart protection

The initial standalone Stage25 operator was intentionally removed because it would not preserve all of these live modules.

## Correct additive candidate

\`jh-server/owner-setup/jh168-mobile-unification/stage25-live-operator-followup-entry.mjs\`

- Builds and authenticates the **actual existing** \`buildPendingApprovalOperatorEntrypoint56\` and its attestation first.
- Applies only \`applyJH168SplitFollowupReceiptPatch\` to that complete operator runtime, preserving all original modules byte-for-byte when the patch is reversed.
- Produces a separate signed-operator runtime, owner selector, unified wrapper, operational wrapper, and tamper-evident SHA-256 attestation. It verifies the original parent attestation and all generated hashes on every selected start.
- Only a **separately selected** operator startup with existing exact flags plus \`JH_SPLIT_FOLLOWUP_OPERATOR_ENABLE=EXPLICIT_FOLLOWUP_CLICK_RECEIPT_V1\` may call \`main()\`. Existing default \`npm start\` remains untouched. The new startup is **NOT** presently selected by the live Render start command.
- The new receipt is a read-only \`sfr_\` token for an **already dispatched** original Secure56 CLICK. Same device, device digest, signed session, command, request, context, target item and original signed job must match; new click, authorization, phone consent and automatic replay are forbidden.
- Exact \`resultVerified=true\` and original RIGHT Chrome proof are necessary to claim success; a confirmed \`target_obscured/actionDispatched=false\` remains a pre-dispatch block. Timeout or absent result remains UNKNOWN.
- Bounded receipt registry is process-local. A restart does not recover expired/missing result bytes, nor does it authorize repeating the original click.

## Required production cutover steps (NOT yet executed)

1. Record exact current service, Render workspace, last live commit/deploy and the \`npm start\`/router selection, including pending-approval and operational-learning capabilities.
2. Merge **only after** CI passes latest source and the proper activation path is approved. AutoDeploy is currently OFF on the JH service, but merging must still be reviewed for restart policy.
3. The connected Render tool currently supports environment-variable updates and manual deploy, but **does not support updating a service start command**. Activation therefore needs an additional reviewed, exact router entry (with explicit flag and preserved original default), or an authorized Dashboard start-command change. Do not bypass this gap.
4. No reset, no unsolicited re-auth, no key changes, no replacement of existing volume, no click auto-retry. Existing unconfirmed jobs must be fenced before a restart.
5. Verify the exact selected release sha and \`JH_SPLIT_FOLLOWUP_READBACK_ACTIVE\` in live logs, then read-only MCP status and exactly one safe phone scenario if needed. A pending original receipt may only be read through \`READBACK_PENDING\`; do not replay to force a timeout.
6. If the activated runtime fails any pin/attestation, revert start selection and previously verified release. Preserve storage and original pending execution state.

GitHub CI covers exact pending-approval/learning operator preservation, reversible code, authentication-scoped receipt readback, the original owner-selected runtime, and non-deployment. It does not prove live operation without steps above.

