# JH168 Stage28 — server result recovery and signed completion transport checks

Date: 2026-11-01 KST. Scope: **development and isolated regression**, not a production fault injection or APK update.

## Last verified real device baseline

The owner-installed Stage27 signed Android APK `com.koreanlifehub.bridge` versionCode 168, with the original signing certificate and matching APK bytes, reported `STATUS: NEW_PASS` after exactly one ADB install. A separate authenticated Primary JH Secure56 screen command clicked the RIGHT Chrome overflow menu once, read 29 items in a new popup window ID 3543, returned `executorCode=clicked`, `resultVerified=true` and `verificationScope=UI_TRANSITION_ONLY`, then finished successfully. This proves the user-interface result **at the captured time**, not recovery from a dropped completion HTTP response.

## Current server source contract

- Stage25 `sfr_` follow-up receipts are bounded, tied to the original signed CLICK job/device/session/command/request/context/item and process-local. `READBACK_PENDING` uses existing `jobs.get(jobId)`; it does not dispatch clicks.
- Stage26 completion ACK policy handles the original **same job with exactly identical raw body SHA-256** only after original HMAC, one-shot fresh nonce and session/device validation. A different result or old/missing job is not a success. First completion passes the original `durableNativeHooks56?.acceptedCompletion` gate.
- Android Stage26/27 previously verified a restricted second completion HTTP attempt only for a safe, already verified, non-sensitive Chrome overflow CLICK, without re-executing the Android action. No arbitrary retries, changed device/session or TLS/DNS failure replay.
- A server-process restart, original job expiry or unavailable in-memory receipt does **not** recover the old result. Treat the original execution as UNKNOWN and do not click again merely to obtain a receipt.

## What Stage28 tests

An isolated loopback HTTP server uses **production Stage26 decision policy** with synthetic HMAC/session/device and a synthetic first durable acceptance. It deliberately drops the **local HTTP response after acceptance** and verifies an identical newly signed completion receives only a duplicate HTTP 200 ACK. It rejects an already consumed nonce, changed session, changed device, invalid MAC, expired/future expiry and a different result body. It checks no new Android action or job is created. The production Stage25 receipt registry is exercised with exact job/binding, verified RIGHT proof, changed command and expiry/restart cases.

**Important limitations:** The HTTP listener is a controlled *fixture*, not the live Render Secure56 endpoint, and does not reimplement all production authorization/durability machinery. The companion Stage26 generated-runtime source suite and original secure regressions must also pass. No live network disconnection, real duplicate click, actual Android retry injection, service restart, token reuse, APK modification or deployment is allowed.

## Completion criteria

- CI for the isolated network failure path, signed identical result, mismatch/stale rejection, process-local result loss and no-replay guards: all PASS
- Exact current source/secure-runtime composition and original Stage26 regression: PASS
- Live 27th-stage menu UI completion: **previously verified**, no need to repeat
- Live controlled HTTP failure and real server recovery after restart: **NOT_RUN / unverified**
- APK: existing Stage27 signed APK remains unchanged, no reinstall

## Follow-up boundary

If evidence shows a real original pending job with an exact bound `sfr_` receipt, use only read-only `READBACK_PENDING` under the **same** command. Never obtain a new command simply to revive a previous unknown action. Do not deploy a different server path, modify Render environment or claim post-restart durable recovery without a separate source/design and live proof.
