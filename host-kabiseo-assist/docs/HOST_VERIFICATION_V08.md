# 카비서 v0.8 — full host source compile and host DEX, NOT APK

## Actual source and latest published correction
The exact known Stage73 candidate is retained as an immutable 433-file input (ZIP SHA256 in integration/host-source-tree-v08.json). The current base branch includes Stage75/PR165 at e7c6fc94776ebbf8392377624c41c95f0c90fb8a, fixing the direct return in expression-bodied AndroidAgent.execute. The original candidate really failed the full source compiler at that expression. We backported ONLY that published functional hunk; the trip-first dispatch and SplitComfortRuntime.gate remain unchanged in meaning.

The Stage75 full release ZIP was found in Library, but raw-byte materialization was denied. Consequently this is NOT a byte-identical Stage75 release and NOT an attestation of the currently installed phone source. Release versionName/asset identity remains the historical candidate and must be reconciled before any future packaging. Do not install this development source.

Use tools/prepare_host_candidate.py for a NEW v0.8 review copy, rather than using the old v0.7 patch alone. It guards the complete input tree, rejects newer/unknown/partial input and existing output, and preserves the source. Exactly 3 original files change (AndroidAgent.kt, BridgeService.kt, SecureBridge56.kt); 430 originals stay unchanged and 6 camera Java files are added. Manifest, Gradle files and feature OFF remain intact. Reproducing the source twice gave identical hashes for all 439 candidate files. Nine tests using the actual original source passed locally; these tests were not run as GitHub device tests.

## Actual compiler verification
Public tooling bootstrap CI 42035570036/job127272697966 succeeded. Artifact13417983146 SHA256 b59492c070447f05457791939053dfed857870470419fbebb1ed1696d3699aa1 supplied the real API35 android.jar, Build Tools35 AAPT2/D8, Kotlin1.9.24 compiler and pinned project dependency versions. The downloaded archive CRC, SHA and internal manifest were verified before use. No dummy Android API or source stubs were added.

In the local Linux environment (OpenJDK21.0.12.1 runtime, Java release17/Kotlin JVM target17), the candidate's actual resources were compiled/linked with AAPT2, 6 production Java files plus generated R.java compiled, and ALL 258 production Kotlin files compiled. D8 conversion of host bytecode at min API26 also succeeded. Dependencies were supplied as classpath, not assembled into a full APK.

- host-classes.jar SHA256: 93940a9293280862cf921f389f1507f25e0c4c45d7916f1249a81701061a9b3f
- host classes.dex SHA256: 2e1113cf6f3f328c28981ab206cef0a5bf32a8bdb5b2cd73212f7a7f97f8ee23
- source tree remained unchanged by compilation
- Kotlin compiler emitted 54 warning lines, including existing deprecated API warnings. Do not call this warning-free.

The first tool-bootstrap CI attempt failed on self-project unit-test variant resolution; corrected bootstrap resolves releaseCompileClasspath and JUnit separately. That failed run remains in history. Initial candidate compile failure and corrected compile logs are retained in the conversation verification package.

## Explicit limits
This was direct source/API compilation and host DEX conversion, NOT full Gradle assembleRelease, dependency/native asset packaging, merged-manifest/lint for the full app, APK signing or install. The v0.7 six-file Android-library lint result is separate (0 errors, 2 ObsoleteSdkInt warnings). The real server producer, camera profile enrollment, real phone read-only test, zoom action and restoration remain unverified. No service activation, camera operation, image/chat read, settings change, deployment or PR merge occurred.

Current 카비서 route remains OFF. Existing authentication, approval, ordinary split-screen protection, default GPT camera flow and no-face/body-retouch scope remain. No external AI API was added to runtime. Development CI and ChatGPT usage are not a claim of zero development cost.
