#!/usr/bin/env python3
"""Stage22: READ-ONLY installed Meta CameraAccess/G Glass package signer readback.

This is an owner-local optional diagnostic, not an installer or phone test.
Only known package APK bytes are copied from the connected phone into a
short-lived temporary directory and verified using the owner's own Android
SDK tools. No executable/app settings/key material/credential is copied to
public GitHub or uploaded. The extracted files are destroyed at exit.

Nothing may grant physical-trial approval or Meta WDC Beta eligibility.
"""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
import tempfile

from stage20_apk_identity import badging_from_aapt2, signers_from_apksigner, normalized_digest

CAMERA_ACCESS = "com.meta.wearable.dat.externalsampleapps.cameraaccess"
G_GLASS_TRIAL = "com.koreanlifehub.jhglassprobe"
ALLOWED_PACKAGES = (CAMERA_ACCESS, G_GLASS_TRIAL)

# No arbitrary package or shell commands are accepted from CLI, intentionally.
SERIAL = re.compile(r"^[A-Za-z0-9_.-]+$")
BASE_APK_PATH = re.compile(r"^/data/app/(?!.*(?:/\.\.|\\|\x00)).*/base\.apk$")
SHA256 = re.compile(r"^[a-f0-9]{64}$")


class PhoneReadbackBlocked(RuntimeError):
    pass


def list_usb_device(adb_output: str) -> str:
    lines = [x.strip() for x in adb_output.splitlines() if x.strip()]
    if not lines or not lines[0].startswith("List of devices attached"):
        raise PhoneReadbackBlocked("ADB_DEVICE_LIST_UNTRUSTED")
    entries = []
    for line in lines[1:]:
        if line.startswith("*"):
            raise PhoneReadbackBlocked("ADB_TRANSIENT_SERVER_OUTPUT")
        cells = line.split()
        if len(cells) < 2:
            raise PhoneReadbackBlocked("ADB_LIST_MALFORMED")
        entries.append((cells[0], cells[1]))
    if len(entries) != 1:
        raise PhoneReadbackBlocked("EXACTLY_ONE_PHYSICAL_USB_DEVICE_REQUIRED")
    serial, state = entries[0]
    if not SERIAL.fullmatch(serial) or ":" in serial or serial.startswith("emulator-"):
        raise PhoneReadbackBlocked("PHYSICAL_USB_ONLY_NO_WIFI_OR_EMULATOR")
    if state != "device":
        raise PhoneReadbackBlocked("DEVICE_OWNER_ADB_AUTHORIZATION_REQUIRED")
    return serial


def base_apk_from_pm_output(output: str) -> str | None:
    raw = [line.strip() for line in output.splitlines() if line.strip()]
    if raw == [""] or raw == []:
        return None
    if any(not line.startswith("package:") for line in raw):
        raise PhoneReadbackBlocked("PACKAGE_MANAGER_OUTPUT_UNTRUSTED")
    base = [line[len("package:"):] for line in raw if line.endswith("/base.apk")]
    if len(base) != 1 or not BASE_APK_PATH.fullmatch(base[0]):
        raise PhoneReadbackBlocked("PACKAGE_MANAGER_BASE_APK_UNTRUSTED")
    # Never let a malicious/errant PackageManager response redirect a read to
    # another location. Regex anchors alone are not sufficient for dot-segments.
    parts = PurePosixPath(base[0]).parts
    if (".." in parts or "/./" in base[0] or "\\" in base[0]
            or "//" in base[0] or "\x00" in base[0]):
        raise PhoneReadbackBlocked("PACKAGE_MANAGER_PATH_TRAVERSAL_BLOCKED")
    return base[0]


def sha256_file(file: Path) -> str:
    hasher = hashlib.sha256()
    with file.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def run_verified_tool(args: list[str], timeout: int = 35) -> str:
    proc = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          text=True, check=False, timeout=timeout)
    if proc.returncode:
        raise PhoneReadbackBlocked("READ_ONLY_TOOL_REJECTED")
    if len(proc.stdout) > 160000:
        raise PhoneReadbackBlocked("UNEXPECTED_TOOL_OUTPUT_SIZE")
    return proc.stdout


def verify_sdk_tool(tool: Path) -> str:
    # Tools are selected locally, never fetched/executed from a remote URL.
    if not tool.is_absolute() or not tool.is_file():
        raise PhoneReadbackBlocked("TRUSTED_ANDROID_SDK_TOOL_REQUIRED")
    if tool.suffix.lower() not in {"", ".exe", ".bat", ".cmd"}:
        raise PhoneReadbackBlocked("TRUSTED_ANDROID_SDK_TOOL_REQUIRED")
    return str(tool)


def _package_label(package: str) -> str:
    if package == CAMERA_ACCESS:
        return "CAMERAACCESS"
    if package == G_GLASS_TRIAL:
        return "GGLASS"
    raise PhoneReadbackBlocked("PACKAGE_OUT_OF_SCOPE")


def exact_package_present(output: str, package: str) -> bool:
    """Only exact installed package name; ignore substring-matching results."""
    _package_label(package)
    lines = [line.strip() for line in output.splitlines() if line.strip()]
    if not lines:
        return False
    if len(lines) > 100 or any(not x.startswith("package:") for x in lines):
        raise PhoneReadbackBlocked("PACKAGE_LIST_FORMAT_UNEXPECTED")
    values = [x[len("package:"):] for x in lines]
    if any(not re.fullmatch(r"[a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)+", x) for x in values):
        raise PhoneReadbackBlocked("PACKAGE_LIST_FORMAT_UNEXPECTED")
    if values.count(package) > 1:
        raise PhoneReadbackBlocked("PACKAGE_LIST_DUPLICATE_EXACT_MATCH")
    return package in values


def _stage_read(command, label: str, argv: list[str], timeout: int = 35) -> str:
    """Sanitized phase-only failure, never raw adb stdout/stderr/device serial."""
    try:
        return command(argv, timeout=timeout)
    except PhoneReadbackBlocked as exc:
        if str(exc) == "READ_ONLY_TOOL_REJECTED":
            raise PhoneReadbackBlocked(f"{label}_COMMAND_FAILED") from None
        raise
    except (OSError, subprocess.TimeoutExpired):
        raise PhoneReadbackBlocked(f"{label}_COMMAND_FAILED") from None


def read_installed_package(serial: str, package: str, adb: str,
                           aapt2: str, apksigner: str,
                           command=run_verified_tool) -> dict:
    tag = _package_label(package)
    # Read-only exact-name PackageManager inventory first. A missing G Glass
    # trial is normal; pm path can return nonzero for an absent package.
    listing = _stage_read(command, f"{tag}_PACKAGE_LIST",
                          [adb, "-s", serial, "shell", "pm", "list", "packages", package])
    if not exact_package_present(listing, package):
        return {"package_name": package, "status": "NOT_INSTALLED",
                "signer_approved_for_g_glass": False}

    location = base_apk_from_pm_output(_stage_read(
        command, f"{tag}_PACKAGE_PATH",
        [adb, "-s", serial, "shell", "pm", "path", package]))
    if location is None:
        raise PhoneReadbackBlocked(f"{tag}_PACKAGE_PATH_MISSING_AFTER_LISTED")
    with tempfile.TemporaryDirectory(prefix="jh-glass-stage22-") as tmp:
        local = Path(tmp) / "base.apk"
        _stage_read(command, f"{tag}_APK_PULL",
                    [adb, "-s", serial, "pull", location, str(local)], timeout=60)
        if local.is_symlink() or not local.is_file() or not (1024 < local.stat().st_size < 200_000_000):
            raise PhoneReadbackBlocked(f"{tag}_COPIED_APK_INVALID")
        with local.open("rb") as f:
            if f.read(4) != b"PK\x03\x04":
                raise PhoneReadbackBlocked(f"{tag}_COPIED_NOT_APK")
        sha = sha256_file(local)
        badge = badging_from_aapt2(_stage_read(
            command, f"{tag}_AAPT2_BADGING", [aapt2, "dump", "badging", str(local)]))
        if badge.get("package_name") != package:
            raise PhoneReadbackBlocked("APP_APK_PACKAGE_IDENTITY_MISMATCH")
        certs = signers_from_apksigner(_stage_read(
            command, f"{tag}_APKSIGNER_VERIFY",
            [apksigner, "verify", "--verbose", "--print-certs", str(local)]))
        if len(certs) != 1 or not SHA256.fullmatch(certs[0]):
            raise PhoneReadbackBlocked("APP_APK_SIGNER_UNVERIFIED")
        return {
            "status": "INSTALLED_SIGNER_READ_ONLY_VERIFIED",
            "package_name": package,
            "installed_version_code": badge.get("version_code"),
            "installed_apk_sha256": sha,
            "installed_signer_certificate_sha256": certs[0],
            "signed_cryptographically_verified": True,
            "signer_approved_for_g_glass": False,
        }


def inspect_phone(adb: str, aapt2: str, apksigner: str,
                  command=run_verified_tool) -> dict:
    serial = list_usb_device(_stage_read(command, "ADB_DEVICE_INVENTORY", [adb, "devices", "-l"]))
    is_emulator = _stage_read(command, "ADB_DEVICE_TYPE", [adb, "-s", serial, "shell", "getprop", "ro.kernel.qemu"]).strip()
    if is_emulator == "1" or is_emulator not in {"", "0"}:
        raise PhoneReadbackBlocked("EMULATOR_OR_UNTRUSTED_DEVICE")
    readback = [
        read_installed_package(serial, package, adb, aapt2, apksigner, command)
        for package in ALLOWED_PACKAGES
    ]
    return {
        "schema": "JH_GGLASS_STAGE22_LOCAL_SIGNER_READBACK_V1",
        "status": "READ_ONLY_APP_IDENTITY_OBSERVED",
        "apps": readback,
        "device_serial_recorded": False,
        "apk_bytes_retained": False,
        "wdc_beta_verified": False,
        "meta_app_name_launch_verified": False,
        "g_glass_signing_key_available": False,
        "owner_install_permission": False,
        "installation_performed": False,
        "readback_is_user_consent": False,
        "jH_secure_live_modified": False,
    }


def main():
    parser = argparse.ArgumentParser(description="Read installed G Glass/CameraAccess signer, no changes")
    parser.add_argument("--adb", type=Path, required=True)
    parser.add_argument("--aapt2", type=Path, required=True)
    parser.add_argument("--apksigner", type=Path, required=True)
    args = parser.parse_args()
    try:
        adb = verify_sdk_tool(args.adb)
        aapt = verify_sdk_tool(args.aapt2)
        signer = verify_sdk_tool(args.apksigner)
        result = inspect_phone(adb, aapt, signer)
        exit_code = 0
    except (PhoneReadbackBlocked, OSError, ValueError, subprocess.TimeoutExpired) as exc:
        result = {"schema": "JH_GGLASS_STAGE22_LOCAL_SIGNER_READBACK_V1",
                  "status": "BLOCKED",
                  "reason": str(exc),
                  "device_serial_recorded": False,
                  "owner_install_permission": False,
                  "installation_performed": False}
        exit_code = 12
    # Output contains only public app identity and public certificate digest; no
    # device ID, private key, Meta token, approval, photo, transcript or GPS.
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
