"""Stage24 Windows entrypoint: all tests use fake devices, no real ADB or install."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import stage24_windows_oneclick as s24
from test_stage22_phone_signer_readback import FakeReadOnlyPhone


class FakeUsbPhone(FakeReadOnlyPhone):
    def __call__(self, argv, timeout=35):
        if argv == ["adb", "devices", "-l"]:
            self.calls.append(tuple(argv))
            return "List of devices attached\nR59USB\tdevice usb:1-3 product:samsung model:Galaxy\n"
        return super().__call__(argv, timeout=timeout)


class Stage24WindowsReadOnlyTest(unittest.TestCase):
    def test_usb_marker_present(self):
        self.assertEqual(s24.single_authorized_usb_transport(
            "List of devices attached\nR59USB device usb:1-3 model:Galaxy\n"), "R59USB")

    def test_no_usb_marker_is_blocked(self):
        with self.assertRaises(s24.Stage24Blocked):
            s24.single_authorized_usb_transport(
                "List of devices attached\nR59USB device model:Galaxy\n")

    def test_wifi_device_blocked(self):
        with self.assertRaises(Exception):
            s24.single_authorized_usb_transport(
                "List of devices attached\n192.168.0.1:5555 device usb:1-3\n")

    def test_two_devices_blocked(self):
        with self.assertRaises(Exception):
            s24.single_authorized_usb_transport(
                "List of devices attached\nR59USB device usb:1\nR58USB device usb:2\n")

    def test_readonly_success_with_fake_phone(self):
        fake = FakeUsbPhone()
        result = s24.read_public_signers(("adb", "aapt2", "apksigner"), runner=fake)
        self.assertFalse(result["owner_install_permission"])
        self.assertEqual(result["apps"][0]["installed_signer_certificate_sha256"], "ab" * 32)
        self.assertNotIn("R59USB", str(result))
        self.assertNotIn("install", str(fake.calls).replace("NOT_INSTALLED", ""))

    def test_readonly_missing_cert_fails(self):
        fake = FakeUsbPhone(signers=False)
        with self.assertRaises(Exception):
            s24.read_public_signers(("adb", "aapt2", "apksigner"), runner=fake)

    def test_declined_before_sdk_or_adb(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "RESULT.txt"
            def forbidden(*args, **kwargs):
                raise AssertionError("NO_TOOL_ALLOWED_BEFORE_YES")
            with patch.object(s24, "existing_sdk", forbidden):
                rc = s24.main(["--result", str(path)],
                              input_fn=lambda prompt: "NO", platform="nt")
            self.assertEqual(rc, 12)
            report = json.loads(path.read_text("utf-8"))
            self.assertEqual(report["reason"], "OWNER_DECLINED_LOCAL_READBACK")
            self.assertFalse(report["physical_device_modified"])

    def test_yes_without_sdk_is_blocked(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "RESULT.txt"
            rc = s24.main(["--result", str(path)], input_fn=lambda _: "YES",
                          platform="nt", environment={})
            self.assertEqual(rc, 12)
            result = json.loads(path.read_text("utf-8"))
            self.assertEqual(result["reason"], "ANDROID_SDK_NOT_FOUND_NO_DOWNLOAD")
            self.assertFalse(result["install_permitted"])

    def test_non_windows_never_requests_permission(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "RESULT.txt"
            def forbidden(_):
                raise AssertionError("SHOULD_NOT_PROMPT_LINUX")
            self.assertEqual(
                s24.main(["--result", str(path)], input_fn=forbidden, platform="posix"), 12)
            self.assertEqual(json.loads(path.read_text("utf-8"))["reason"], "WINDOWS_HOST_REQUIRED")

    def test_unexpected_arguments_blocked_before_tools(self):
        self.assertEqual(s24.main(["--install", "never"]), 12)

    def test_sdk_candidate_does_not_search_network(self):
        roots = s24.sdk_roots({"ANDROID_HOME": "C:/Android/Sdk",
                              "LOCALAPPDATA": "C:/Users/U/AppData/Local"})
        self.assertEqual(len(roots), 2)
        self.assertFalse(any(str(x).startswith("https") for x in roots))

    def test_fake_sdk_discovery(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "platform-tools").mkdir()
            build = root / "build-tools" / "36.0.0"
            build.mkdir(parents=True)
            for file in (root / "platform-tools" / "adb.exe",
                         build / "aapt2.exe", build / "apksigner.bat"):
                file.write_bytes(b"SAFE_MOCK_NOT_EXECUTABLE")
            tools = s24.existing_sdk({"ANDROID_HOME": str(root)})
            self.assertEqual(len(tools), 3)
            self.assertTrue(tools[0].endswith("adb.exe"))
            self.assertTrue(tools[2].endswith("apksigner.bat"))

    def test_missing_buildtools_blocks(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "platform-tools").mkdir()
            (root / "platform-tools" / "adb.exe").write_bytes(b"")
            (root / "build-tools").mkdir()
            with self.assertRaises(s24.Stage24Blocked):
                s24.existing_sdk({"ANDROID_HOME": str(root)})


if __name__ == "__main__":
    unittest.main()
