# Mobile13 pre-signed one-click release review

The owner requested unzip then 실행.cmd after the earlier PC signing path stopped because its default keystore path was absent. The original-certificate signed APK is now complete. This kit consumes that exact artifact and does not access a signing key or build/sign locally.

## Reviewed input and runtime

- Candidate ID remains `JH168-MOBILE13-20261101`.
- Signed APK: 48,884,022 bytes, SHA-256 `ffe38e54654b3174cba3d6c03c484a6b4701c527c9f080d25febe325050afd4f`.
- Original certificate: `7cc577efe48e865fdbe799b92aa9edf89724631361ae97979f2b8e4a940a288b`.
- The signed APK was verified with apksigner (v2/v3, one signer), zipalign, and exact comparison of all 514 original unsigned entries. Only three META-INF signature entries were added. The 1183 Android tests and original unsigned artifact are reused.
- Source review binds manifest, signed bytes, original package/version/certificate and the copied install input. A read lock protects the copied APK through installed readback.
- Existing unsigned identity `40b8f766692a1e44e8e02fc9ed0de47a1ba172e12c0cf634852ec647cc9905d3` remains the cache namespace. The original per-device install guard is reused, preserved and flushed before the single install dispatch.
- Exact installed signed bytes yield zero-install reuse. Otherwise only the original baseline `129bcc55a9fbf04ebe2bb19d86958fd94f4dc6fd0969bb020105e7f162510359` with no prior guard permits one update. Unknown results are not retried.
- Previous RESULT files, current RunId identity, fallback and candidate/kit locks are retained.

## Windows evidence

[Run 41302737894](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/41302737894), job124836873552, attempt1, actual checkout `75b3c0f3929247d9ce94d3d2a311c33b531c3ceb`, PowerShell Desktop5.1.20348.5756: **25 PASS, 0 FAIL**, completed2026-11-01T11:38:32Z.

The logged production hashes are updater `e341a8851f5d0554cb2db39469e9c78b6e8e2d90599a6e725f4b5284239c1cb9`, CMD `9d37a8c9daf910872873e210b72c72004af2e12807543e5f18c8700dac87dff8`, helper `9ebb716ab9cdb54f47e46c785c11412c4d8ae9c20d2f011376d4e721ca8aae0f`.

Cases cover no key/unsigned dependency, first update, installed-byte reuse without cache, legacy guard retention, unknown no-replay, flush failure, identity mismatch, tampered payload, locks, missing inputs, CMD special paths, stale results and preserved source bytes. Keytool, signing and zipalign dispatch are tripwires in the test boundary.

## Release scope

Profile `JH-WINDOWS-APK-MOBILE13-PRESIGNED-20261101-1` pins all seven delivery files after source review, actual Windows validation, and private APK verification. Earlier profiles are preserved. No real APK or key is committed to this repository. The existing standard ZIP writer and its Windows reader evidence are reused.

Windows tests use inert files/process stubs; real build/key/ADB/phone operations are NOT_RUN. This review does not claim actual installation, deployment or device E2E, and does not resolve or replay the prior unknown phone job.
