# 🏴‍☠️ 카비서 — v0.8 host source verification candidate

**Draft / runtime OFF. This is not an installed camera upgrade or an APK.**

The existing GPT photo-taking flow remains the target. No separate camera launch, Chrome switch, face/body retouch, automatic shutter, attachment or sending is added. Read-only receipts never authorize pixels, gestures or camera setting changes.

## Latest verified progress
- The known full JH host candidate (258 Kotlin + 6 Java production files) compiled against real Android SDK35 and project dependency APIs. Resource compilation/link and host-bytecode D8 conversion at min API26 passed.
- 146 Kotlin + 1 Java test sources compiled; JUnit discovered 111 test classes and ran 1,278 tests with 0 failures, 0 ignored and 0 assumption failures. Non-JUnit helper/manual classes are not silently counted as executed tests.
- Existing metadata contract: 86 scenarios / 297 assertions; old host patch: 11 tests; new complete-baseline preparation guard: 9 tests. These are distinct suites, not a marketing total.
- Candidate reproduction matched all 439 files and did not alter original source.

See `docs/HOST_VERIFICATION_V08.md` and `docs/HOST_TEST_RESULT_V08.json` for scope, evidence IDs, failures and compiler warning counts. Detailed logs and reviewed host source are retained in the conversation verification archive. The current GitHub CI tooling-bootstrap success is NOT the full app build; full-source compilation and JUnit execution above took place in the local verification environment.

## Source lineage / guard
The known 433-file Stage73 archive is a historical candidate. Its existing AndroidAgent compile blocker was reproduced and the exact published Stage75/PR165 functional correction backported. The full Stage75 release archive was not available as authorized raw bytes; release version metadata was not silently changed. No claim is made that this source equals the currently installed phone or all newer parallel work.

Use `tools/prepare_host_candidate.py --source <known-original-source> --output <new-review-copy>` for this review candidate, not the old v0.7 patch alone. It refuses unknown/newer/partial inputs and existing outputs. It is a developer tool tested in Linux UTF-8, not a user installation launcher.

## Remaining gates
Full Gradle app assembly/merged manifests/full-app lint/dependency packaging/signing/install remain unperformed for this candidate. Server command production, real camera profile enrollment, phone read-only validation, automatic pinch zoom and restoration remain unverified. Feature stays OFF and existing host authentication, approval, split protection and current app are preserved. Do not ship from JVM tests or library build success alone.

## Naming / authorization
Display: 카메라비서 / 카비서. Command: `KABISEO_CAMERA_METADATA`. Java package `com.jh.pobiseo.assist` is retained for compatibility. Any legacy action must be authorized in its original signed form; do not rewrite signed actions. Default host denies. Do not turn a denied ordinary snapshot into a camera-metadata request.
