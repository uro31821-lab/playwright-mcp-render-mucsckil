# JH167 connection diagnostic + recovery V2 — staged release

Source of truth: JH167 FIX4 installed phone, versionCode 167. OCR and scrolling already validated; do not alter APK, package, signing keys or these features.

Target: existing Render jh-secure-bridge-fix4, branch jh-fix3-secure-server, pinned base commit 8564fdbdeb27b437f693e9f0cac7de18bbb8c563.

Install only after proving both BEGIN_COMMAND and mk() dispatch gates, real owner idle snapshot, durable journal unresolved-effects count, browser tools/list-only metadata renewal, and approved notification channel acknowledgment. No arbitrary phone screen operations, login, navigation, replay, or synthetic success claims.

Operations: stage -> local tests -> CI -> production protected startup -> signed Android read-only verification -> real outage recovery (without inducing an outage). Roll back on any regression. The add-on must start disabled and fail closed.

This review file does not enable V2, restart a server, or verify recovery.