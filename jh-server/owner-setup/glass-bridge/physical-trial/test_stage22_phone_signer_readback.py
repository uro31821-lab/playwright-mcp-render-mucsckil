"""Stage22 pure/unit mock tests: no connected user phone or Android SDK required."""
from pathlib import Path
import unittest

import stage22_phone_signer_readback as t


class FakeReadOnlyPhone:
    def __init__(self, signers=True, gglass_present=False, bad_package=False):
        self.calls = []
        self.signers = signers
        self.gglass_present = gglass_present
        self.bad_package = bad_package

    def __call__(self, argv, timeout=35):
        self.calls.append(tuple(argv))
        if argv == ["adb", "devices", "-l"]:
            return "List of devices attached\nR59USB\tdevice product:samsung model:Galaxy\n"
        if len(argv) >= 6 and argv[:5] == ["adb", "-s", "R59USB", "shell", "getprop"]:
            return "0\n"
        if argv[:5] == ["adb", "-s", "R59USB", "shell", "pm"]:
            package = argv[-1]
            if package == t.G_GLASS_TRIAL and not self.gglass_present:
                return ""
            return "package:/data/app/~~abc123/p-qRabc/base.apk\n"
        if argv[:4] == ["adb", "-s", "R59USB", "pull"]:
            Path(argv[-1]).write_bytes(b"PK\x03\x04" + b"STAGE22" * 250)
            return "1 file pulled"
        if argv[:3] == ["aapt2", "dump", "badging"]:
            package = t.CAMERA_ACCESS if not self.bad_package else t.G_GLASS_TRIAL
            return (
                f"package: name='{package}' versionCode='1' versionName='1.0'\n"
                "application-label:'Camera Access'\n"
            )
        if argv[:3] == ["apksigner", "verify", "--verbose"]:
            return (
                "Verified using v2 scheme (APK Signature Scheme v2): true\n"
                "Number of signers: 1\n"
                + (f"V2 Signer: certificate SHA-256 digest: {'ab' * 32}\n"
                   if self.signers else "")
            )
        raise AssertionError("UNEXPECTED_COMMAND: " + str(argv))


class Stage22PhoneReadbackTest(unittest.TestCase):
    def test_single_usb_device(self):
        self.assertEqual(
            t.list_usb_device("List of devices attached\nR59USB\tdevice model:Galaxy\n"),
            "R59USB",
        )

    def test_empty_device_list_denied(self):
        with self.assertRaises(t.PhoneReadbackBlocked):
            t.list_usb_device("List of devices attached\n")

    def test_two_devices_denied(self):
        with self.assertRaises(t.PhoneReadbackBlocked):
            t.list_usb_device(
                "List of devices attached\nR59USB device\nR58USB device\n"
            )

    def test_untrusted_wifi_serial_denied(self):
        with self.assertRaises(t.PhoneReadbackBlocked):
            t.list_usb_device("List of devices attached\n192.168.1.4:5555 device\n")

    def test_emulator_denied(self):
        with self.assertRaises(t.PhoneReadbackBlocked):
            t.list_usb_device("List of devices attached\nemulator-5554 device\n")

    def test_unapproved_phone_denied(self):
        with self.assertRaises(t.PhoneReadbackBlocked):
            t.list_usb_device("List of devices attached\nR59USB unauthorized\n")

    def test_base_apk_parsed(self):
        self.assertEqual(
            t.base_apk_from_pm_output(
                "package:/data/app/~~AbCd/com.meta.camera-XYZ/base.apk\n"
            ), "/data/app/~~AbCd/com.meta.camera-XYZ/base.apk"
        )

    def test_no_installed_package_is_normal(self):
        self.assertIsNone(t.base_apk_from_pm_output(""))

    def test_unknown_pm_response_fails(self):
        with self.assertRaises(t.PhoneReadbackBlocked):
            t.base_apk_from_pm_output("SecurityException: denied\n")

    def test_path_traversal_is_denied(self):
        with self.assertRaises(t.PhoneReadbackBlocked):
            t.base_apk_from_pm_output("package:/data/app/../secret/base.apk\n")

    def test_two_base_apks_denied(self):
        with self.assertRaises(t.PhoneReadbackBlocked):
            t.base_apk_from_pm_output(
                "package:/data/app/abc/base.apk\npackage:/data/app/def/base.apk\n")

    def test_only_allowlisted_packages_can_be_read(self):
        with self.assertRaises(t.PhoneReadbackBlocked):
            t.read_installed_package("R59USB", "com.koreanlifehub.bridge",
                                     "adb", "aapt2", "apksigner", FakeReadOnlyPhone())

    def test_read_only_copies_and_deletes_temp_apk(self):
        fake = FakeReadOnlyPhone()
        result = t.inspect_phone("adb", "aapt2", "apksigner", command=fake)
        self.assertEqual(result["status"], "READ_ONLY_APP_IDENTITY_OBSERVED")
        cam = result["apps"][0]
        self.assertEqual(cam["package_name"], t.CAMERA_ACCESS)
        self.assertEqual(cam["installed_signer_certificate_sha256"], "ab" * 32)
        self.assertEqual(result["apps"][1]["status"], "NOT_INSTALLED")
        self.assertFalse(result["owner_install_permission"])
        self.assertFalse(result["wdc_beta_verified"])
        self.assertFalse(result["apk_bytes_retained"])
        self.assertFalse(result["device_serial_recorded"])
        commands = [c[0] for c in fake.calls]
        self.assertNotIn("install", " ".join(map(str, fake.calls)))
        self.assertNotIn("uninstall", " ".join(map(str, fake.calls)))
        self.assertNotIn("grant", " ".join(map(str, fake.calls)))
        for c in fake.calls:
            if "pull" in c:
                self.assertFalse(Path(c[-1]).exists(), "Temp APK must be deleted")
        self.assertNotIn("R59USB", str(result))

    def test_missing_signer_fails_closed(self):
        fake = FakeReadOnlyPhone(signers=False)
        with self.assertRaises(t.PhoneReadbackBlocked):
            t.inspect_phone("adb", "aapt2", "apksigner", command=fake)

    def test_mismatched_apk_package_fails_closed(self):
        fake = FakeReadOnlyPhone(bad_package=True)
        with self.assertRaises(t.PhoneReadbackBlocked):
            t.inspect_phone("adb", "aapt2", "apksigner", command=fake)

    def test_untrusted_tool_fails_closed(self):
        with self.assertRaises(t.PhoneReadbackBlocked):
            t.verify_sdk_tool(Path("adb"))

    def test_wrong_device_type_fails_closed(self):
        fake = FakeReadOnlyPhone()
        def wrong_property(argv, timeout=35):
            if argv[:5] == ["adb", "-s", "R59USB", "shell", "getprop"]:
                return "1\n"
            return fake(argv, timeout)
        with self.assertRaises(t.PhoneReadbackBlocked):
            t.inspect_phone("adb", "aapt2", "apksigner", command=wrong_property)


if __name__ == "__main__":
    unittest.main()
