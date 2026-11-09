# 카비서 v0.9 준비 — 전체 앱 Gradle 검증 NOT_RUN

2026-11-05. This checkpoint does not supersede the v0.8 compile/test evidence with a new full-app success.

## Actual progress
- Re-read PR162: draft/open; previous reviewed source at 0e9b12228e9d7c8ea4d170b33982a5add3805107.
- Checked PR166: merged Stage76 TripLocation phone-E2E checkpoint (a6a277b200c64fbef0e5b8e83b354eeb55174f92). Preserve current installed app. No rollback or installation performed.
- Mounted v0.8 ZIP SHA256: 31ff9935a76e8318abee7b6909b91df89caa449ddd6ee973c21026f80cebd943. ZIP CRC and all 506 manifest entries verified locally before the workspace failure.
- Copied the 439-file review host to a separate candidate folder; saved all source hashes. Feature flag false confirmed. This is still the historical candidate+Stage75 functional repair, not a proven byte-identical installed Stage76 source.
- Added a public-only dependency seed with AGP8.7.3/Kotlin1.9.24/Gradle8.9/SDK35 and the existing pinned dependencies. No JH private source or signing material uploaded.
- GitHub run42040593825/job127290078939 succeeded. The synthetic dependency seed executed assembleRelease/testReleaseUnitTest/lintRelease. THIS WAS NOT THE JH APP.
- Original public kit artifact13421056121, 627720267 bytes, SHA256 1e54325258477b42d7faefcc5ffd8de8cf4f4635d11e67c622a25e5477da526e.
- Download connector rejected this size (limit536870912). Reused that successful artifact instead of rebuilding; run42041336475/job127292624398 verified original digest/CRC/inner checksum and split three parts, success.
- Part0 artifact13421285753: bede88e6e4212c136ec6a1bca811d1fdf95a3452223234a8fde2e5eafa5c5123.
- Part1 artifact13422600404: c553ec73e947329487c17122c0d327e1e382f21d4a63a12f1c9835fefbb35786.
- Part2 artifact13420179688: a314526bcc40e8b27a4e3415f78f51a28c5c782fbabcf3eab368bb8ea5030945.
- All three connector downloads returned file references/mounted paths. LOCAL recombination, extraction and per-file verification could not be confirmed because container/Python calls then failed with ClientError before returning execution output.

## Current block and exact status
Workspace execution unavailable: container exec and Python both returned ClientError; a trivial echo health check also failed. Do not convert downloaded artifacts into a claim that local toolchain or full JH app works.

Full JH Gradle assemble / unit suite / full-app lint: NOT_RUN in this step. No new JH APK produced, signed or installed. No phone camera read, gesture, screenshot, shutter, send or settings change. No server route enablement/deployment. Draft remains unmerged.

The originally drafted local runner/import scripts passed Python syntax compilation before the workspace failed, but their archive import and full Gradle execution have NOT been tested. They are not presented as working build tools.

## Avoid repeated expensive preparation
The two new bootstrap workflows and earlier public compile-kit export are now manual workflow_dispatch jobs, not every-PR triggers. This changes preparation triggers only; metadata regression and Android read-only build gates are preserved. Manual workflow visibility on an unmerged branch is not claimed. The exact-artifact splitter will fail after artifact expiry rather than silently substitute a different kit. Artifacts have a one-day retention; re-resolve/reverify tools if unavailable.

## Next executable boundary
After a healthy workspace is established, verify all part digests, combined archive and every internal manifest entry. Then run the unchanged isolated candidate through offline Gradle assembleRelease/testReleaseUnitTest/lintRelease; record exit codes and lint findings separately. Reconcile exact current release source before any distributable version/signing/install. Automatic camera control remains OFF.

User action: none. Do not ask the user to reinstall the phone app or repeat the manually verified pinch/reset tests to fix this development-workspace problem.
