# JH168 Stage25 — Signed split FOLLOW_UP result readback operator activation

**Status:** source and CI candidate; NOT merged, NOT deployed, and no phone action. The latest Stage24 APK already passed a single Chrome menu click with \`action_verified\`; installing another APK does not enable this server-only change.

## Exact startup selection

The original Secure56 + manual circuit + owner host startup is preserved. A new **explicit operator entry** exists at:

\`jh-server/owner-setup/jh168-mobile-unification/stage25-split-followup-operational-entry.mjs\`

Only an explicitly selected service startup may invoke its \`main()\`. The default production entry is unchanged.

Stage25 source generation:

1. Rebuild the *pinned* \`buildDurableRoutedOperationalEntrypoint\` candidate, preserving original owner verification, saved identity, OAuth, device-bound Secure56, HMAC, and manual journal.
2. Compose the existing \`split-read-receipt-patch\` (START/STATUS) then the new FOLLOW_UP CLICK receipt patch onto the original generated Secure56 runtime.
3. Change the generated **owner runtime selector**, unified host import, and operational wrapper import/call so that the original startup actually loads the receipt-enabled runtime BEFORE opening the listener.
4. Reverse both source patches and compare byte-for-byte with the pinned original, verifying no stealth expansion of original execution/approval scope.

A successful actual activation MUST report \`JH_SPLIT_FOLLOWUP_READBACK_ACTIVE\` with the exact selected runtime hash, AND service readiness and the existing durable circuit active. Mere CI or GitHub merge does not prove deployment.

## Behavior and limits

- Existing signed CLICK dispatch is untouched. A timeout may return a scoped \`sfr_...\` receipt, which the existing MCP \`READBACK_PENDING\` mode reads using only \`receipt_ref\` and the existing valid \`command_id\`.
- The reader obtains the original job only; **no new job, click, permission, OAuth scope, approval grant, screenshot or retry**.
- Exact phone/device digest, signed session, command ID, original request ID, target item and task digest must match.
- The phone's original \`resultVerified\` plus right-Chrome evidence is required to confirm success. \`target_obscured\` with \`actionDispatched=false\` is **pre-dispatch blocked**, not a missing completion.
- A missing, expired or terminal-unknown result remains UNKNOWN. **Do not replay**.
- The receipt registry is bounded process-local memory; old receipts are NOT recovered after a server restart. Durable journal continues to deny uncertain duplicate clicks. Restart-persistent result bytes require a separately reviewed storage integration; not claimed by this release.

## Production preflight — required before any change

1. Select the intended Render workspace **explicitly** and identify the exact JH Secure Bridge service. Preserve the existing start command, deployed commit/image, autoDeploy configuration, environment/volume, trust and OAuth paths; do not infer them from historical source.
2. Confirm no unresolved durable dispatches and review an appropriate quiescent cutover. A restart may discard an old in-flight operation and cannot be used as proof it never happened.
3. Confirm all GitHub Stage25/receipt Secure56 tests passing against the latest branch and the current base. Check the generated runtime SHA and host selector match; no APK is required.
4. Make one explicitly approved startup change/deploy only. If actual startup reports a binding/pin/storage error, **stop**, do not reset keys, volumes, sessions, or auto-restore operations.
5. Post-deployment check live MCP catalog, device signed session, exact Stage24 installed app version, same RIGHT pane, and a single safe UI action only when needed. Verify \`READBACK_PENDING\` with an **existing original receipt**, never by replaying a click.
6. Rollback: restore the previously recorded start command/commit and original verified deploy, preserving storage. First inspect unresolved effects and receipts; do not replay on rollback. Report source merge, deployment, and real phone confirmation separately.

## Checks

- Local receipt registry tests: queued/late, missing original, scoped denial, pre-dispatch blocked, proof required, expiry, no raw screen.
- Generated server source and original host selector tests: exact imports, reversible patches, old HMAC/manual journal preserved.
- GitHub Actions: \`JH168 split FOLLOWUP readback (source-only review)\` and existing Secure56 tests.

**This file is a review/activation plan, not evidence of a deployed or working new server.**

