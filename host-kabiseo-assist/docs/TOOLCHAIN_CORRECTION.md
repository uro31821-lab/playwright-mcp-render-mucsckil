# Gradle 8.9 checksum correction — 2026-11-05

The first Android candidate CI run (42027648393, job 127245786163, head db1f0080980b75297c2278a9b57aaf9a9d8d5563) failed before compilation. Its copied historical Gradle SHA-256 value had only 62 hex characters. sha256sum correctly refused the malformed checksum line. Android SDK35 and Build Tools35 were present, but no Gradle build/APK/device test ran in that attempt.

Historical malformed value (DO NOT use):
`d725d707bfabd4dfdc958c624003b80accc03f7037b5122c4b1d0ef15cecab`

Official Gradle8.9 binary-only ZIP SHA-256, checked on https://gradle.org/release-checksums/ :
`d725d707bfabd4dfdc958c624003b3c80accc03f7037b5122c4b1d0ef15cecab`

The workflow now pins the official 64-character value, validates its format BEFORE downloading, and still requires the downloaded archive to match before unzip or execution. No verification step was removed. The old user's Library document is historical evidence and was not overwritten. Use this correction for subsequent Gradle8.9 bootstrap work.

Failed evidence remains in GitHub. Success must be based on the replacement run, not assumed from this correction.
