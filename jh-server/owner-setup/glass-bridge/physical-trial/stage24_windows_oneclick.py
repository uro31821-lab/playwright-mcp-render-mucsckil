#!/usr/bin/env python3
"""G Glass Stage24 Windows owner-local read-only one-click entrypoint.

Imports the canonical Stage22 signer reader and never installs/uninstalls,
captures screens/photos, alters phone permissions or contacts GPT/Meta/JH.
The only device read is PackageManager's own base.apk for two known packages.
No sensitive serial number or binary APK bytes are persisted to RESULT.txt.

Stage24 CI only exercises an absent/mock device, never a real phone.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import re
import sys
from datetime import datetime, timezone

from stage22_phone_signer_readback import (
    inspect_phone, PhoneReadbackBlocked, verify_sdk_tool,
    run_verified_tool, list_usb_device,
)

SCHEMA = "JH_GGLASS_STAGE24_WINDOWS_READONLY_V1"
USB_MARKER = re.compile(r"(?<![A-Za-z0-9])usb:[^\s]+")
ALLOWED_ARGS = ("--result",)
MAX_VERSION_DIRS = 80


class Stage24Blocked(RuntimeError):
    pass


def sdk_roots(env: dict[str, str]) -> list[Path]:
    roots: list[Path] = []
    for key in ("ANDROID_HOME", "ANDROID_SDK_ROOT"):
        if env.get(key):
            roots.append(Path(env[key]))
    if env.get("LOCALAPPDATA"):
        roots.append(Path(env["LOCALAPPDATA"]) / "Android" / "Sdk")
    if env.get("USERPROFILE"):
        roots.append(Path(env["USERPROFILE"]) / "AppData" / "Local" / "Android" / "Sdk")
    return list(dict.fromkeys(roots))


def existing_sdk(env: dict[str, str]) -> tuple[str, str, str]:
    for root in sdk_roots(env):
        if not root.is_absolute() or not root.is_dir() or root.is_symlink():
            continue
        adb = root / "platform-tools" / "adb.exe"
        folder = root / "build-tools"
        if not adb.is_file() or adb.is_symlink() or not folder.is_dir() or folder.is_symlink():
            continue
        children = [p for p in folder.iterdir() if p.is_dir() and not p.is_symlink()]
        if len(children) > MAX_VERSION_DIRS:
            raise Stage24Blocked("ANDROID_BUILD_TOOLS_UNUSUAL_DIRECTORY_COUNT")
        children.sort(key=lambda p: tuple(int(x) for x in re.findall(r"\d+", p.name)), reverse=True)
        for child in children:
            aapt = child / "aapt2.exe"
            signer = child / "apksigner.bat"
            if all(p.is_file() and not p.is_symlink() for p in (aapt, signer)):
                return tuple(verify_sdk_tool(p.resolve()) for p in (adb, aapt, signer))
    raise Stage24Blocked("ANDROID_SDK_NOT_FOUND_NO_DOWNLOAD")


def single_authorized_usb_transport(adb_output: str, selected_usb_serial: str) -> str:
    # On Windows/libusb, 'adb devices -l' may legitimately omit the 'usb:'
    # token. The official ADB '-d' selector, not the display format, proves
    # that this is the one local USB hardware transport.
    serial = list_usb_device(adb_output)
    if not selected_usb_serial or serial != selected_usb_serial.strip():
        raise Stage24Blocked("USB_DEVICE_IDENTITY_MISMATCH")
    return serial


def read_public_signers(tools: tuple[str, str, str], runner=run_verified_tool) -> dict:
    adb = tools[0]
    inventory = runner([adb, "devices", "-l"])
    # Official Android ADB: '-d' targets an attached physical USB device,
    # failing if there is none or more than one. Never infer USB from serial.
    usb_serial = runner([adb, "-d", "get-serialno"]).strip()
    checked = single_authorized_usb_transport(inventory, usb_serial)

    def ensure_same_usb() -> None:
        if runner([adb, "-d", "get-serialno"]).strip() != checked:
            raise Stage24Blocked("USB_DEVICE_CHANGED_DURING_READBACK")

    def usb_checked_runner(argv: list[str], timeout: int = 35):
        if argv == [adb, "devices", "-l"]:
            current = runner(argv, timeout=timeout)
            ensure_same_usb()
            single_authorized_usb_transport(current, checked)
            return current
        if (len(argv) >= 4 and argv[0] == adb
                and argv[1:3] == ["-s", checked]
                and argv[3] in {"shell", "pull"}):
            ensure_same_usb()
            # Always issue device commands via USB selector, NOT '-s',
            # which alone could resolve a non-USB transport.
            return runner([adb, "-d", *argv[3:]], timeout=timeout)
        if argv and argv[0] in tools[1:]:
            return runner(argv, timeout=timeout)
        raise Stage24Blocked("UNEXPECTED_TOOL_OR_DEVICE_COMMAND")

    details = inspect_phone(*tools, command=usb_checked_runner)
    if details.get("status") != "READ_ONLY_APP_IDENTITY_OBSERVED":
        raise Stage24Blocked("PACKAGE_READBACK_INCOMPLETE")
    return details


def blocked(reason: str) -> dict:
    return {"schema": SCHEMA, "status": "BLOCKED", "reason": reason,
            "physical_device_modified": False, "install_permitted": False,
            "meta_beta_verified": False, "phone_signer_approved": False,
            "gpt_api_called": False}


def save_report(path: Path, info: dict) -> None:
    # Caller validates that this is the package's own RESULT.txt. No secrets.
    report = {"schema": SCHEMA,
              "checked_at_utc": datetime.now(timezone.utc).isoformat(),
              **info, "physical_device_modified": False,
              "install_permitted": False, "gpt_api_called": False}
    path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main(argv: list[str] | None = None, input_fn=input,
         runner=run_verified_tool, platform: str | None = None,
         environment: dict[str, str] | None = None) -> int:
    arguments = list(sys.argv[1:] if argv is None else argv)
    if len(arguments) != 2 or arguments[0] != "--result":
        print("BLOCKED_UNEXPECTED_ARGUMENTS")
        return 12
    path = Path(arguments[1]).resolve()
    if path.name != "RESULT.txt" or not path.parent.is_dir():
        print("BLOCKED_RESULT_LOCATION")
        return 12
    if (platform if platform is not None else os.name) != "nt":
        save_report(path, blocked("WINDOWS_HOST_REQUIRED"))
        return 12
    if sys.version_info < (3, 10):
        save_report(path, blocked("PYTHON_3_10_REQUIRED"))
        return 12

    print("G Glass Stage24: already installed app identity READ ONLY.")
    print("No app installs, changes, photos, screen capture, Meta or GPT API.")
    print("Only one already authorized USB phone is allowed.")
    try:
        consent = input_fn("Type YES to read CameraAccess/G Glass public APK signatures: ").strip()
    except (EOFError, KeyboardInterrupt):
        consent = ""
    if consent != "YES":
        save_report(path, blocked("OWNER_DECLINED_LOCAL_READBACK"))
        return 12
    try:
        tools = existing_sdk(os.environ if environment is None else environment)
        result = read_public_signers(tools, runner=runner)
        report = {"schema": SCHEMA,
                  "status": "APP_SIGNATURES_OBSERVED_NOT_INSTALL_AUTHORIZED",
                  "apps": result.get("apps", []),
                  "meta_beta_verified": False,
                  "phone_signer_approved": False}
    except (Stage24Blocked, PhoneReadbackBlocked, OSError, ValueError) as exc:
        report = blocked(str(exc) if isinstance(exc, (Stage24Blocked, PhoneReadbackBlocked))
                         else "LOCAL_ENVIRONMENT_READBACK_FAILED")
    save_report(path, report)
    print(report["status"])
    if report["status"] == "BLOCKED":
        print(report.get("reason", "BLOCKED"))
        return 12
    print("Public certificates only. No phone update or install approval.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
