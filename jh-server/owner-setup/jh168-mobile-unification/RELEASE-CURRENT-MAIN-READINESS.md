# JH168 — one exact current-main receipt release candidate, source-only

Target upstream current main: `2c310f8b4a76d40604416e7dd4cb4976fdd1fc85` (includes latest operational-learning PR #99).
Stage28–37 original review source HEAD: `a356e08dbddb1cd015a4b272103f242e5a3b33ac`.

## What this candidate really does

- Replays **39 original Stage28–37 source/test/review blobs** from the completed isolated reviews ONCE over the original exact latest main tree. 37 original blobs are unchanged byte-for-byte; only Stage33 manifest/upstream-main marker and Stage33 new-workflow allowance are adapted to the current integration root.
- Preserves original Secure56, OAuth/nonce/device/session checks, all phone-local approvals, original owner SQLite source, Android app source, published operator routing and latest operational-learning source.
- Adds a single combined CI workflow; leaves old stacked PRs Draft. Does not merge old PRs into main in arbitrary order, and does not enable the source-selected Stage30–36 runtime.
- Runs original owner SQLite, atomic crash/no-replay, client text transport, loss-of-response negative case, actual generated owner operator syntax and current-main learning regressions sequentially.

## Operating evidence

- Live Render service `jh-secure-bridge-fix4` on `2c310f8b4a76d40604416e7dd4cb4976fdd1fc85` (merged original main PR #103, #106, #107), autoDeploy off and persistent disk /var/data provisioned 1 GB. The earlier Stage26 startup log cited below is historical, not current owner-volume proof.
- Live startup log at `2026-11-01T03:16:30Z`: `JH_DURABLE_CUTOVER_READY`, `legacyUnresolved=0` **at startup only**, not live original `manual-circuit.sqlite` uncertain counts.
- Trust-recovery quarantine remains 57 historical records in a separate journal, **not** the same manual-circuit unknown count; automatic replay false.
- Render read-only connector does not expose filesystem bytes/free disk or a live SQLite SQL query for the attached disk. No owner read-only status tool exposing manual-circuit counts is present in the current deployed JH MCP catalog.
- Current JH Bridge responds and has one selected device, but this does not prove Stage36/37 live feature availability. The Stage35 handle status tool is absent from the original live catalog.

## Release decision

CI is **verification-only**. Successful GitHub Actions is NOT permission to migrate production owner SQLite, restart Render, select the generated owner Stage30–36 operator, create a new approval or replay Stage27 Chrome CLICK.
Release remains BLOCKED until: (1) original manual-circuit current uncertain count is read safely, (2) current disk/WAL/free space and backup headroom verified under original owner access, (3) owner-volume migration/rollback tested and separately approved, (4) protected Stage30–36 startup and current-owner original receipt status are actually selected and attested, (5) fresh harmless PHONE action is approved and tested once. Preserve the original verified Stage27 APK.

## Next action (not a new feature stage)

Only when original owner private volume read-only status is available, confirm the current unknown effects and backup capacity, then request explicit owner authorization for the exact migration/release. If Render remote shell or an original owner-signed diagnostic is not available in the connected tools, clearly report this access limit; do not invent `df` output, a shell, or successful deployment.

## Current-main refresh (2026-11-01 KST)

- Old consolidation PR #105 failed before any actual tests because its pinned upstream `08c2de330a2d0747b26671f0241eb5b22e768e94` no longer matched the main branch after PR #106 and #107. Its earlier Stage28–37 test results are historical and do not cover this refreshed base.
- This source-only replacement candidate replays the original reviewed Stage28–37 blobs onto main `2c310f8b4a76d40604416e7dd4cb4976fdd1fc85`, including the later receipt-learning fixes, without modifying the already-deployed original host, Android, or owner database.
- The Stage33 allowed-files assertion also now allows this review document; previously it would have rejected a legal, review-only added file.
- Live receipt recovery of an MCP response lost before client delivery remains **UNAVAILABLE/UNKNOWN**: no completed Stage27 click replay, no claimed real-phone E2E.
- **Before any production release:** exact-source CI, current owner manual-circuit unknown count, actual disk/WAL/backup headroom, rollback and signed owner authorization remain required.
