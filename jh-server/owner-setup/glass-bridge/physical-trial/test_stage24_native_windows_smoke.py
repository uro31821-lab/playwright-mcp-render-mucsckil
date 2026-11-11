"""Real Windows cmd.exe smoke, deliberately never connects to a physical phone.

Executable entrypoint is the exact checked-out '실행.cmd'. Validates owner
decline and YES-without-SDK fail-closed using a temporary environment only.
"""
import json
import os
from pathlib import Path
import subprocess
import tempfile


def run_cmd(source: Path, user_input: str, env: dict[str, str]):
    result = subprocess.run(
        ["cmd.exe", "/d", "/c", "실행.cmd"],
        cwd=str(source),
        input=user_input,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=45,
        env=env,
        check=False,
    )
    if result.returncode != 12:
        raise AssertionError(
            f"Expected a fail-closed Windows CMD exit 12, got {result.returncode}\n"
            f"stdout={result.stdout[-1500:]}\nstderr={result.stderr[-1000:]}"
        )
    output = source / "RESULT.txt"
    if not output.is_file():
        raise AssertionError("RESULT.txt missing after running 실제 Windows CMD")
    report = json.loads(output.read_text(encoding="utf-8"))
    if report.get("status") != "BLOCKED" or report.get("physical_device_modified") is not False:
        raise AssertionError(report)
    if report.get("install_permitted") is not False:
        raise AssertionError("Unexpected installation approval")
    return report


def main():
    root = Path(__file__).resolve().parent
    if not (root / "실행.cmd").is_file():
        raise SystemExit("STAGE24_LAUNCHER_NOT_FOUND")
    with tempfile.TemporaryDirectory(prefix="GGlassNativeWindowsSmoke-") as t:
        env = os.environ.copy()
        env["CI"] = "true"  # suppresses pause in Windows CI only
        env["ANDROID_HOME"] = str(Path(t) / "no-sdk")
        env["ANDROID_SDK_ROOT"] = str(Path(t) / "no-sdk")
        env["LOCALAPPDATA"] = str(Path(t) / "no-windows-android")
        env["USERPROFILE"] = str(Path(t) / "no-user-android")
        before = (root / "stage22_phone_signer_readback.py").read_bytes()
        # Nothing runs without explicit YES, even if a suitable SDK exists.
        refusal = run_cmd(root, "\n", env)
        if refusal.get("reason") != "OWNER_DECLINED_LOCAL_READBACK":
            raise AssertionError(refusal)
        print("GGLASS_STAGE24_NATIVE_WINDOWS_OWNER_REFUSAL_PASS")
        # Explicit YES still cannot pull anything if validated SDK isn't there.
        no_sdk = run_cmd(root, "YES\n", env)
        if no_sdk.get("reason") != "ANDROID_SDK_NOT_FOUND_NO_DOWNLOAD":
            raise AssertionError(no_sdk)
        print("GGLASS_STAGE24_NATIVE_WINDOWS_NO_SDK_FAIL_CLOSED_PASS")
        if before != (root / "stage22_phone_signer_readback.py").read_bytes():
            raise AssertionError("SOURCE_CHANGED_BY_LAUNCHER")
        print("GGLASS_STAGE24_NO_REAL_PHONE_NO_ANDROID_ADB_NO_INSTALL_NO_KEY_NO_API")


if __name__ == "__main__":
    main()
