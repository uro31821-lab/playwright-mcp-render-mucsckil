# JH168 Stage38 — Original Computer Use EXECUTE result readback and exact split BACK

**Scope:** source-only Draft. Existing signed Stage27 APK, phone-local approvals, original Secure56 signer/nonce/OAuth, journal owner volume and persisted results remain untouched.

## Source references consulted (ideas, NOT copied modules)
- Appium UiAutomator2 driver: https://github.com/appium/appium-uiautomator2-driver ; use current device/window and target evidence across native/web transitions. Do not install a separate Appium server or grant adb_shell.
- Google TalkBack scrollable node utilities: https://github.com/google/talkback/blob/master/utils/src/main/java/com/google/android/accessibility/utils/ScrollableNodeInfo.java ; refer to accessibility-supported actions rather than CSS/DOM assumptions.
- BullMQ job IDs: https://docs.bullmq.io/guide/jobs/job-ids ; jobs are correlated by original identity and missing results are never authorization to retry. No BullMQ/Redis installed in JH.

## Change 1 — exact original execution-result receipt
- Existing Stage25 original Computer Use EXECUTE can return `status:in_progress` after its bounded wait without a usable original result token. A one-time process-local `cer_` 32-byte random receipt is now returned only if the ORIGINAL signed job is queued or in_progress.
- The original authenticated tool `life_android_pending_approval_receipt_status` accepts the new `cer_` token in its existing READ ONLY code path, with exact device/secureSession/command/task/run/lease/HMAC digest binding. No job creation or phone dispatch occurs on read.
- Only a safe projection of the ORIGINAL result is returned. `ok:true` means lookup succeeded or original result received, not user task success. No raw screen, value, token, lease, or personal data is returned.
- Different session, changed HMAC/job, expired original job, absent in-memory record or server restart fail closed UNKNOWN; the durable Stage29–37 draft remains a separate future production migration and is not claimed active.

## Change 2 — exact split BACK 
- Existing durable split policy allowed only CLICK; an explicit BACK was rejected even when bound to a real current RIGHT itemRef. New policy allows precisely CLICK or BACK as separately journaled signed reversible job types. Same fresh contextId, new requestId, commandId, targetItemRef, original phone-local policy and complete HMAC/nonce remain mandatory.
- Other split actions, unbound BACK, secret values, non-original tool/effect and unrelated Computer Use BACK remain denied.
- The BACK change requires a new phone E2E and is not proof the Android UI has performed the action.

## Hard deployment gate
- **DO NOT MERGE/DEPLOY** until original owner journal unknown count, /var/data free/WAL/backup bytes and rollback are verified; current Render runtime `4c71890021fc299838e6a8ce45ccf5f64712f354` differs from main and contains Mobile13 test routing. Android APK currently hardcodes production poll and a GitHub CI run is NOT live-phone validation.
- Execute real phone actions only through currently authenticated JH Primary and existing signed session, with fresh local approvals when needed. Previously completed Stage27 Chrome menu click and prior UNKNOWN effects must never be replayed.
