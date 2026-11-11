"""Stage24 Windows entrypoint: all tests use fake devices, no real ADB or install."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import stage24_windows_oneclick as s24
from test_stage22_phone_signer_readback import FakeReadOnlyPhone


class FakeUsbPhone(FakeReadOnlyPhone):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.usb_serial = "R59USB"
        self.actual_calls = []

    def __call__(self, argv, timeout=35):
        self.actual_calls.append(tuple(argv))
        if argv == ["adb", "devices", "-l"]:
            return ("List of devices attached\n"
                    "R59USB\tdevice product:samsung model:Galaxy transport_id:1\n")
        if argv == ["adb", "-d", "get-serialno"]:
            return self.usb_serial + "\n"
        if len(argv) >= 3 and argv[:2] == ["adb", "-d"]:
            return super().__call__(
                ["adb", "-s", "R59USB", *argv[2:]], timeout=timeout)
        return super().__call__(argv, timeout=timeout)


class Stage24WindowsReadOnlyTest(unittest.TestCase):
    def test_usb_marker_present_with_d_selector(self):
        self.assertEqual(
            s24.single_authorized_usb_transport(
                "List of devices attached\nR59USB device usb:1-3 model:Galaxy\n",
                "R59USB"),
            "R59USB")

    def test_windows_without_usb_marker_accepted_with_d_selector(self):
        self.assertEqual(
            s24.single_authorized_usb_transport(
                "List of devices attached\nR59USB device model:Galaxy transport_id:1\n",
                "R59USB"),
            "R59USB")

    def test_mismatched_usb_serial_rejected(self):
        with self.assertRaises(s24.Stage24Blocked):
            s24.single_authorized_usb_transport(
                "List of devices attached\nR59USB device model:Galaxy\n", "OTHER")

    def test_wifi_device_blocked(self):
        with self.assertRaises(Exception):
            s24.single_authorized_usb_transport(
                "List of devices attached\n192.168.0.1:5555 device usb:1-3\n",
                "192.168.0.1:5555")

    def test_two_devices_blocked(self):
        with self.assertRaises(Exception):
            s24.single_authorized_usb_transport(
                "List of devices attached\nR59USB device usb:1\nR58USB device usb:2\n",
                "R59USB")

    def test_usb_serial_changed_mid_transaction_rejected(self):
        fake = FakeUsbPhone()
        count = 0
        def changed(argv, timeout=35):
            nonlocal count
            if argv == ["adb", "-d", "get-serialno"]:
                count += 1
                if count >= 3:
                    return "DIFFERENT\n"
            return fake(argv, timeout)
        with self.assertRaises(s24.Stage24Blocked):
            s24.read_public_signers(("adb", "aapt2", "apksigner"), runner=changed)

    def test_missing_direct_usb_selector_is_blocked(self):
        fake = FakeUsbPhone()
        def no_usb(argv, timeout=35):
            if argv == ["adb", "-d", "get-serialno"]:
                raise s24.Stage24Blocked("USB_SELECTOR_UNAVAILABLE")
            return fake(argv, timeout)
        with self.assertRaises(s24.Stage24Blocked):
            s24.read_public_signers(("adb", "aapt2", "apksigner"), runner=no_usb)

    def test_readonly_success_with_fake_phone(self):
        fake = FakeUsbPhone()
        result = s24.read_public_signers(("adb", "aapt2", "apksigner"), runner=fake)
        self.assertFalse(result["owner_install_permission"])
        self.assertEqual(result["apps"][0]["installed_signer_certificate_sha256"], "ab" * 32)
        self.assertNotIn("R59USB", str(result))
        self.assertNotIn("install", str(fake.actual_calls).replace("NOT_INSTALLED", ""))
        device_data_calls = [x for x in fake.actual_calls
                             if len(x) > 2 and x[0] == "adb"
                             and ("shell" in x or "pull" in x)]
        self.assertTrue(device_data_calls)
        self.assertTrue(all(x[1] == "-d" for x in device_data_calls))
        self.assertFalse(any(x[1] == "-s" for x in device_data_calls))

    def test_yes_with_missing_trial_saves_stage26_success(self):
        fake = FakeUsbPhone()
        with tempfile.TemporaryDirectory() as folder:
            result_path = Path(folder) / "RESULT.txt"
            with patch.object(s24, "existing_sdk", return_value=("adb", "aapt2", "apksigner")):
                code = s24.main(["--result", str(result_path)],
                                input_fn=lambda _: "YES", runner=fake, platform="nt")
            self.assertEqual(code, 0)
            output = json.loads(result_path.read_text("utf-8"))
            self.assertEqual(output["diagnostic_revision"], "stage26-missing-package-and-step-failures")
            self.assertEqual(output["apps"][0]["status"], "INSTALLED_SIGNER_READ_ONLY_VERIFIED")
            self.assertEqual(output["apps"][1]["status"], "NOT_INSTALLED")
            self.assertFalse(output["install_permitted"])
            self.assertNotIn("R59USB", str(output))

    def test_stage26_result_identifies_exact_failing_command(self):
        fake = FakeUsbPhone()
        def fail_camera_path(argv, timeout=35):
            if (len(argv) > 5 and argv[:3] == ["adb", "-d", "shell"]
                    and argv[3:6] == ["pm", "path", "com.meta.wearable.dat.externalsampleapps.cameraaccess"]):
                raise s24.PhoneReadbackBlocked("READ_ONLY_TOOL_REJECTED")
            return fake(argv, timeout)
        with tempfile.TemporaryDirectory() as folder:
            result_path = Path(folder) / "RESULT.txt"
            with patch.object(s24, "existing_sdk", return_value=("adb", "aapt2", "apksigner")):
                code = s24.main(["--result", str(result_path)],
                                input_fn=lambda _: "YES", runner=fail_camera_path, platform="nt")
            self.assertEqual(code, 12)
            result = json.loads(result_path.read_text("utf-8"))
            self.assertEqual(result["reason"], "CAMERAACCESS_PACKAGE_PATH_COMMAND_FAILED")
            self.assertEqual(result["diagnostic_revision"], "stage26-missing-package-and-step-failures")
            self.assertFalse(result["physical_device_modified"])
            self.assertNotIn("R59USB", str(result))

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
