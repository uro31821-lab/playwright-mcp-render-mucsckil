# JH168 Stage33 — original current-main source integration review

Status: source-only candidate. No Render deployment, original owner DB changes, Android APK rebuild or device action.

## Why
At Stage32, the original live Render deploy was 473e8ed20b5d651d7c05f05c2af97f1779038ecb, while current GitHub main advanced to a875b3f3b3e369f49e31250c83035582e2498cc9, including two newer operational-learning commits not in older Stage29-31 branches. Passing older source CI cannot prove the same result after integration.

## Exact integration
1. Stage33 candidate has original current main SHA a875b3f3b3e369f49e31250c83035582e2498cc9 as its direct ancestor.
2. Copy 18 Stage28-32 files to new review branch through exact existing Git blob SHA objects. Keep 17 original source blobs byte-identical, with an inspectable SHA manifest.
3. Modify only one historic Stage32 ancestry test to check historical commits remain accessible. Old feature commits are no longer ancestors of a new current-main content replay. This is a test scope adjustment, not a change to a security module.
4. Preserve ALL original main Secure56 signing, phone approvals, installed APK, server bootstrap, owner SQLite, latest operational learning and source. No default server route is switched.
5. Use a combined Stage33 CI workflow rather than replaying the obsolete staged-branch workflow files. Run generated Secure56 operator tests sequentially to avoid false cross-test fixture mutation.
6. The separate legacy web 9+4 PR #72 is not part of this change.

## Integrated test contract
Stage28 dropped ACK/one original job readback, Stage29 original HMAC receipt, Stage30 same SQLite commit and crash recovery, Stage31 original owner lock/backup migration, Stage32 historical release blockers, actual current generated Stage25/26 original signed operator, pending approval and owner storage, and the latest changed learning tests.

## Scope limitations and next release gate
No live original manual-circuit unknown count, usable disk bytes or owner backup margin has been proven. The trust recovery quarantine count 57 is a separate ledger and not the manual-circuit count. Stage29/30/31 production operator selection, private schema migration and authenticated post-restart readback endpoint are still unimplemented/unverified as a live feature. A Draft PR, green CI or copying source into current main is not authorization to deploy, restart, migrate or resend an old click. Preserve Stage27 signed APK and its verified one-time Chrome menu action.
