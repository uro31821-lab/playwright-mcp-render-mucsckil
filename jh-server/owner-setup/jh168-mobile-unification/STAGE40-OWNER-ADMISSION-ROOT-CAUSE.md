# JH168 Stage40 — exact owner-admission rejection diagnosis (source-only)

## Current observation
2026-11-01: LIVE Render SHA `4c71890021fc299838e6a8ce45ccf5f64712f354`, Primary signer / phone RIGHT Chrome.

A fresh `life_web_snapshot` read the Mobile 13 neutral destination fixture (right window ID 3324), including a new `context_id` and Android `item_...` link reference. A **new** `life_web_click` returned `OWNER_ADMISSION_BLOCKED` + `FAILED_PRE_DISPATCH`, verified no phone effect. A subsequent independent `life_web_wait` was denied as `new_command_binding_required_or_discarded`. This combination does **not** establish whether the first failure was due to owner trust, process epoch, signed snapshot, screen freshness, first-attempt CAS, or an asynchronous command discard. No replay/click fallback is permitted.

## Actual source root of the generic error

`jh-server/owner-setup/deployment/jh155-all-modules-patch.mjs` inserts `jhOwnerAdmission155` into the verified Secure56 owner runtime. That function:
1. requires the exact current JH command;
2. calls the original `jhPaymentLifecycle.captureBinding` (ownerDigest + trustId + deviceDigest + processEpoch) and reads one signed `agent_snapshot`;
3. validates `jhPaymentLifecycle.assertBinding` again and calls `jhInspectSplitEvidence155` on parsed paired window evidence;
4. requires the durable result-verification first PREPARING/CAS attempt with no previous dispatch;
5. delegates to `jhGateRecoveredDispatch155` for the final boolean.

`jh-result-verification/result-verification-duplicate-guard.mjs` deliberately collapses all false or thrown owner callbacks into `OWNER_ADMISSION_BLOCKED`, without returning an individual cause. The previous failure therefore **cannot be assigned to a single condition from that output alone**.

## Minimal reversible Stage40 change
- Adds an optional, **explicit original PHONE_RIGHT operator-only** flag `JH_STAGE40_OWNER_ADMISSION_DIAGNOSTICS=EXPLICIT_ORIGINAL_OWNER_REASON_V1` to the existing Stage25/26 generator; default/unset preserves the existing generated runtime and original server authorization.
- Replaces the owner callback with the **same original decision conditions**, adding finite, low-cardinality `ownerAdmissionDiagnostic` codes in a bounded process-local map, only in the `OWNER_ADMISSION_BLOCKED` result. No raw command, URL, screenshot, user account or key reaches the diagnostic response or durable SQLite.
- Correct owner, genuine signed screen, first CAS reservation, no pending discard and existing local-phone grant rules are all STILL required; any original rejection still returns **false**. No snapshot retry, click replay or fallback executor.
- Original global durable policy, `jh-recovery-write-fence`, sealed Secure56 signer, nonce, Phone APK, `jhPaymentLifecycle`, JH durable execution store and 29 old `OUTCOME_UNKNOWN` rows remain byte-for-byte unchanged.
- Original source restoration is verified via `reverseStage40OwnerAdmissionDiagnostics`. Test only on CI source initially. The optional diagnostic is NOT evidence of production activation.

## Sources used for design (principles only, no copied modules)
- Appium UiAutomator2 Driver: https://github.com/appium/appium-uiautomator2-driver — multi-window accessibility targeting, element state, stale caches and current display ID. Do not use an independent Appium server or relax Accessibility checks.
- Temporal SDK/docs: https://github.com/temporalio/documentation/blob/main/docs/encyclopedia/workflow-message-passing/handling-messages.mdx — one original workflow/update identity and idempotent external effects.
- OpenTelemetry semantic conventions: https://opentelemetry.io/docs/specs/semconv/how-to-write-conventions/ — low-cardinality diagnostic attributes and minimized sensitive context. No telemetry collector or raw logs installed.
- Google TalkBack: https://github.com/google/talkback — active accessibility actions and scoped scroll target evaluation. Not a replacement for JH APK authority.

## Release and real phone gating
1. Source CI must show original generated stage40 flag off/on, invertible patch, and original owner false/true decisions, malicious/stale owner rejection, original duplicate/no replay.
2. The **new** error reason is not observable from live phone until the exact Stage40 generated runtime is deployed on the existing trusted server. Do not confuse old phone green signed poll or earlier Chrome scroll with new-code click E2E.
3. Before controlled deployment, inspect exact LIVE branch source merge, original private owner journal/backup/in-flight tasks and preservation of old 29 rows; if unsupported by current connected release tools, leave production unchanged.
4. On real phone, one fresh neutral fixture action must return an exact classified reason if owner blocks; only after that specific reason is remediated and security re-tested do a NEW safe action. Never replay unknown effects or bypass phone approval.
5. Old independent Playwright browser remains a separate retirement decision; this Stage40 project does not change its process or cookie/profile.
