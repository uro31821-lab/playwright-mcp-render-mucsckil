"""Standard-library-only tests, independent of /mnt/data and the working directory."""
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

MODULE = Path(__file__).resolve().parents[1] / "scripts" / "jh_execution_recovery.py"
spec = importlib.util.spec_from_file_location("jh_execution_recovery", MODULE)
recovery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recovery)
ERROR = "ClientError\nEncountered exception: <class 'caas.internal.errors.ClientError'>."
RECEIPT = """CANDIDATE: parent-fixture
STATUS: INSTALLED_NEEDS_PARENT_PHONE_E2E
ANDROID_BUILD: PASS
ORIGINAL_KEY_SIGNING: PASS
EXTERNAL_SECURITY_GATE: PASS_SAFE
TOOLCHAIN_CHECKPOINT: EXISTING_REUSED
ANDROID_ROUTER_TESTS: PREBUILD_PASS_FULL_GRADLE_PENDING
"""

class RecoveryTests(unittest.TestCase):
    def test_platform_error(self):
        issue = recovery.classify_execution_failure(ERROR)
        self.assertEqual(issue["kind"], "TOOL_EXECUTION_ENVIRONMENT")
        self.assertEqual(issue["sameExecutorAutomaticRetries"], 0)
        self.assertFalse(issue["rootCauseConfirmed"])
    def test_other_client_error_not_misclassified(self):
        for text in ("botocore.exceptions.ClientError", "ClientError", "compileDebugKotlin failed", "caas.internal.errors.ClientErrorExtra"):
            self.assertIsNone(recovery.classify_execution_failure(text))
    def test_security_hold_not_overridden(self):
        self.assertIsNone(recovery.classify_execution_failure(ERROR + "\nEXTERNAL_SECURITY_GATE: BLOCK"))
    def test_source_access(self):
        issue = recovery.classify_execution_failure("This Project file does not have an authorized raw-byte materialization path.")
        self.assertEqual(issue["kind"], "SOURCE_ACCESS")
        self.assertFalse(issue["buildAuthorized"])
    def test_fingerprint_stable_despite_log_timestamps(self):
        a = recovery.classify_execution_failure("2026-01-01\n" + ERROR)
        b = recovery.classify_execution_failure("2026-01-02\n" + ERROR)
        self.assertEqual(a["blockerFingerprint"], b["blockerFingerprint"])
    def test_packet_has_no_automatic_retry(self):
        old = {"blockerType": "TOOL_EXECUTION_ENVIRONMENT", "boundedAutoRemediationCycles": 2}
        new = recovery.decorate_packet(old, ERROR)
        self.assertEqual(new["boundedAutoRemediationCycles"], 0)
        self.assertEqual(old["boundedAutoRemediationCycles"], 2)
    def test_other_packets_preserved(self):
        packet = {"blockerType": "SECURITY_GATE", "boundedAutoRemediationCycles": 2}
        self.assertEqual(recovery.decorate_packet(packet, ERROR), packet)
    def test_parent_host_reuse_not_camera_or_apk_success(self):
        result = recovery.reported_build_environment(RECEIPT, "parent-fixture")
        self.assertTrue(result["preferExistingVerifiedBuildHost"])
        for field in ("privateSourceBytesVerified", "installedApkHashVerified", "currentCameraBuildVerified", "reuseSignedApkAuthorized", "installAuthorized", "cameraControlAuthorized"):
            self.assertFalse(result[field], field)
    def test_prebuild_test_counts_are_not_full_build(self):
        result = recovery.reported_build_environment(RECEIPT.replace("ANDROID_BUILD: PASS", "ANDROID_BUILD: NOT_RUN"))
        self.assertFalse(result["preferExistingVerifiedBuildHost"])
    def test_security_missing_blocks_reuse(self):
        self.assertFalse(recovery.reported_build_environment(RECEIPT.replace("PASS_SAFE", "REVIEW"))["preferExistingVerifiedBuildHost"])
    def test_wrong_candidate_blocks_reuse(self):
        self.assertFalse(recovery.reported_build_environment(RECEIPT, "other-candidate")["preferExistingVerifiedBuildHost"])
    def test_duplicate_receipt_fields_are_ambiguous(self):
        r = recovery.reported_build_environment(RECEIPT + "ANDROID_BUILD: NOT_RUN\n")
        self.assertTrue(r["ambiguousReceipt"])
        self.assertFalse(r["preferExistingVerifiedBuildHost"])
    def test_empty_is_not_success(self):
        self.assertIsNone(recovery.classify_execution_failure(""))
        self.assertEqual(recovery.reported_build_environment("")["environmentEvidence"], "UNCONFIRMED")
    def test_paths_portable_in_fresh_directory(self):
        with tempfile.TemporaryDirectory() as root:
            target = Path(root) / "unrelated-working-directory"
            target.mkdir()
            script = target / "recovery.py"
            shutil.copyfile(MODULE, script)
            command = "import importlib.util; s=importlib.util.spec_from_file_location('r'," + repr(str(script)) + "); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); assert m.classify_execution_failure('caas.internal.errors.ClientError')['kind']=='TOOL_EXECUTION_ENVIRONMENT'"
            subprocess.run([sys.executable, "-c", command], cwd=root, check=True, timeout=10)
    def test_input_type_rejected(self):
        with self.assertRaises(TypeError):
            recovery.classify_execution_failure(None)

if __name__ == "__main__":
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(RecoveryTests)
    outcome = unittest.TextTestRunner(verbosity=2).run(suite)
    print("RECOVERY_TEST_RESULT=" + json.dumps({"tests": outcome.testsRun, "failures": len(outcome.failures), "errors": len(outcome.errors), "scope": "recovery advice only; no Android build or device", "cameraRuntimeChanged": False}))
    raise SystemExit(0 if outcome.wasSuccessful() else 1)
