"""G Glass Stage20 offline security guard tests (no device, SDK, installer, API)."""
import unittest
import stage20_apk_identity as gate

AAPT = """package: name='com.koreanlifehub.jhglassprobe' versionCode='1' versionName='1.0'
sdkVersion:'31'
targetSdkVersion:'36'
uses-permission: name='android.permission.CAMERA'
uses-permission: name='android.permission.BLUETOOTH_CONNECT'
application-label:'G Glass'
application-debuggable
"""
CERT = "Signer #1 certificate SHA-256 digest: " + ("aa" * 32) + "\n"


class IdentityGateTest(unittest.TestCase):
    def base(self):
        return gate.badging_from_aapt2(AAPT)

    def verdict(self, b=None, certs=None, approved=None):
        return gate.evaluate(
            self.base() if b is None else b,
            ["aa" * 32] if certs is None else certs,
            approved,
        )

    def test_package_and_label_parse(self):
        self.assertEqual(self.base()["package_name"], gate.TRIAL_PACKAGE)
        self.assertEqual(self.base()["label"], "G Glass")

    def test_signer_parse(self):
        self.assertEqual(gate.signers_from_apksigner(CERT), ["aa" * 32])

    def test_indented_real_apksigner_cert_line(self):
        self.assertEqual(
            gate.signers_from_apksigner("    " + CERT),
            ["aa" * 32],
        )

    def test_valid_identity_is_not_install_approval(self):
        r = self.verdict(approved="AA:" * 31 + "AA")
        self.assertEqual(r["identity_gate"], "PASS")
        self.assertFalse(r["installation_authorized"])
        self.assertFalse(r["source_provenance_verified"])
        self.assertFalse(r["wdc_beta_verified"])
        self.assertFalse(r["real_glasses_verified"])

    def test_without_preapproved_signer_fail_closed(self):
        self.assertIn("PREAPPROVED_SIGNER_FINGERPRINT_MISSING", self.verdict()["reasons"])

    def test_mismatched_approved_signer_blocks(self):
        self.assertIn("APP_SIGNER_NOT_APPROVED", self.verdict(approved="bb" * 32)["reasons"])

    def test_jh_package_collision_blocks(self):
        b = self.base()
        b["package_name"] = "com.koreanlifehub.bridge"
        self.assertIn("PACKAGE_ID_NOT_ISOLATED", self.verdict(b, approved="aa" * 32)["reasons"])

    def test_cameraaccess_package_collision_blocks(self):
        b = self.base()
        b["package_name"] = "com.meta.wearable.dat.externalsampleapps.cameraaccess"
        self.assertIn("PACKAGE_ID_NOT_ISOLATED", self.verdict(b, approved="aa" * 32)["reasons"])

    def test_unknown_permission_blocks(self):
        b = self.base()
        b["permissions"] += ["android.permission.QUERY_ALL_PACKAGES"]
        self.assertIn("PERMISSION_EXPANSION_REQUIRES_REVIEW", self.verdict(b, approved="aa" * 32)["reasons"])

    def test_exact_own_dynamic_receiver_permission_allowed(self):
        b = self.base()
        b["permissions"].append(
            "com.koreanlifehub.jhglassprobe.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION")
        self.assertEqual(self.verdict(b, approved="aa" * 32)["identity_gate"], "PASS")

    def test_other_package_receiver_permission_blocked(self):
        b = self.base()
        b["permissions"].append(
            "com.koreanlifehub.bridge.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION")
        self.assertIn(
            "PERMISSION_EXPANSION_REQUIRES_REVIEW",
            self.verdict(b, approved="aa" * 32)["reasons"],
        )

    def test_multiple_certificates_block(self):
        self.assertIn("EXACTLY_ONE_SIGNER_REQUIRED",
                      self.verdict(certs=["aa" * 32, "bb" * 32], approved="aa" * 32)["reasons"])

    def test_missing_version_blocks(self):
        b = self.base()
        b["version_code"] = ""
        self.assertIn("APK_VERSION_MISSING", self.verdict(b, approved="aa" * 32)["reasons"])

    def test_label_changed_blocks(self):
        b = self.base()
        b["label"] = "CameraAccess"
        self.assertIn("APP_LABEL_MISMATCH", self.verdict(b, approved="aa" * 32)["reasons"])

    def test_invalid_fingerprint_blocks(self):
        self.assertIsNone(gate.normalized_digest("not-a-sha"))
        self.assertEqual(gate.signers_from_apksigner("Signer #1 certificate SHA-256 digest: zzz\n"), [])

    def test_duplicate_certificate_index_raises(self):
        with self.assertRaises(ValueError):
            gate.signers_from_apksigner(CERT * 2)

    def test_absent_verifier_executable_rejected(self):
        from pathlib import Path
        with self.assertRaises(ValueError):
            gate.readonly_sdk_call(Path("apksigner"), ["verify"])

    def test_all_known_jh_packages_are_distinct(self):
        self.assertNotIn(gate.TRIAL_PACKAGE, gate.COLLIDING_PACKAGES)


if __name__ == "__main__":
    unittest.main()
