"""Package exactly the Stage24 source tested by Windows CI; no network/phone.

Run ONLY on a Windows hosted CI runner. Builds a single ZIP-like folder for
actions/upload-artifact, tests actual extracted root 실행.cmd on cmd.exe with
NO real ADB, verifies every source-file hash. No signing/install operations.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile


SOURCE = Path(__file__).resolve().parent
BUNDLE_NAME = "GGlass_S24_ReadOnly"
PYTHON_FILES = (
    "stage20_apk_identity.py",
    "stage22_phone_signer_readback.py",
    "stage24_windows_oneclick.py",
)
S24_TOKEN = 'set "S24_SOURCE=%~dp0stage24_windows_oneclick.py"'
S24_REPLACEMENT = 'set "S24_SOURCE=%~dp0data\\stage24_windows_oneclick.py"'


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def build(destination: Path, handoff: Path) -> Path:
    destination.mkdir(parents=True, exist_ok=True)
    (destination / "data").mkdir(exist_ok=True)
    (destination / "docs").mkdir(exist_ok=True)
    for name in PYTHON_FILES:
        shutil.copy2(SOURCE / name, destination / "data" / name)

    launcher = (SOURCE / "실행.cmd").read_text("ascii")
    if launcher.count(S24_TOKEN) != 1:
        raise RuntimeError("STAGE24_WIN_LAUNCHER_SOURCE_CHANGED")
    launcher = launcher.replace(S24_TOKEN, S24_REPLACEMENT)
    cmd_bytes = launcher.replace("\r\n", "\n").replace("\n", "\r\n").encode("ascii")
    if cmd_bytes.count(b"\r\n") != cmd_bytes.count(b"\n"):
        raise RuntimeError("STAGE24_CMD_EOL_UNVERIFIED")
    (destination / "실행.cmd").write_bytes(cmd_bytes)

    guide = """G Glass Stage24 | 앱 서명 확인 전용 (설치 기능 없음)

이 ZIP을 통째로 압축 해제하고 '실행.cmd'를 더블클릭합니다.
중요: Windows Defender 또는 다른 보안 기능의 경고를 우회하지 마세요.
현재 PC에 Python 3.10 이상, Android SDK platform-tools 및 build-tools가
이미 있어야 합니다. 도구를 자동으로 내려받거나 설치하지 않습니다.

이미 USB 디버깅 사용을 승인한 본인 휴대폰 1대만 연결할 수 있습니다.
입력창에서 YES를 쳐야 조회하고, Enter를 누르면 취소합니다.
조회 대상: Meta CameraAccess 앱과 G Glass 시험 앱의 공개 인증서/버전뿐.
RESULT.txt에 결과 또는 차단 이유가 저장됩니다.

이 프로그램은 APK 설치·삭제·앱 설정 변경·화면/사진 수집·API 호출을
하지 않습니다. 인증서 지문을 알아도 설치 승인이나 Meta Beta 가입을
뜻하지 않습니다. 현재는 본인 휴대폰에서 실제 검증한 결과가 없습니다.
"""
    (destination / "사용안내.txt").write_text(guide, encoding="utf-8")
    shutil.copy2(handoff, destination / "docs" / "HANDOFF_STAGE24.md")
    initial = {"schema": "JH_GGLASS_STAGE24_WINDOWS_READONLY_V1",
               "status": "NOT_RUN", "device_access": False,
               "install_permitted": False}
    (destination / "RESULT.txt").write_text(
        json.dumps(initial, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    add_manifest(destination)
    return destination


def add_manifest(destination: Path) -> None:
    files = []
    for file in sorted(p for p in destination.rglob("*") if p.is_file()
                       and p.name != "MANIFEST_SHA256.json"):
        data = file.read_bytes()
        files.append({"path": file.relative_to(destination).as_posix(),
                      "size_bytes": len(data), "sha256": digest(data)})
    manifest = {"schema": "JH_GGLASS_STAGE24_PACKAGE_V1",
                "source_tested_by": "https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/43032544658",
                "windows_native_no_phone_tested": True,
                "user_phone_tested": False,
                "security_verdict": "REVIEW_LOCAL_AV_NOT_VERIFIED",
                "files": files}
    (destination / "data" / "MANIFEST_SHA256.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def verify_manifest(destination: Path) -> None:
    m = json.loads((destination / "data" / "MANIFEST_SHA256.json").read_text("utf-8"))
    observed = []
    for item in m["files"]:
        path = destination / item["path"]
        if not path.is_file() or path.stat().st_size != item["size_bytes"]:
            raise RuntimeError("STAGE24_PACKAGE_MISSING_FILE")
        if digest(path.read_bytes()) != item["sha256"]:
            raise RuntimeError("STAGE24_PACKAGE_SHA256_MISMATCH")
        observed.append(item["path"])
    actual = sorted(p.relative_to(destination).as_posix()
                    for p in destination.rglob("*")
                    if p.is_file() and p.name != "MANIFEST_SHA256.json")
    if sorted(observed) != actual:
        raise RuntimeError("STAGE24_PACKAGE_UNTRACKED_PAYLOAD")


def smoke_cmd(bundle: Path, answer: str, expected_reason: str) -> None:
    env = os.environ.copy()
    env.update({
        "CI": "true",
        "ANDROID_HOME": str(bundle / "no-sdk"),
        "ANDROID_SDK_ROOT": str(bundle / "no-sdk"),
        "LOCALAPPDATA": str(bundle / "no-local-sdk"),
        "USERPROFILE": str(bundle / "no-user-sdk"),
    })
    proc = subprocess.run(["cmd.exe", "/d", "/c", "실행.cmd"],
                          cwd=bundle, input=answer, capture_output=True,
                          text=True, encoding="utf-8", errors="replace",
                          timeout=45, env=env, check=False)
    if proc.returncode != 12:
        raise RuntimeError("STAGE24_BUNDLED_CMD_NOT_FAIL_CLOSED")
    result = json.loads((bundle / "RESULT.txt").read_text("utf-8"))
    if (result.get("status") != "BLOCKED"
            or result.get("reason") != expected_reason
            or result.get("physical_device_modified") is not False
            or result.get("install_permitted") is not False):
        raise RuntimeError("STAGE24_BUNDLED_CMD_UNEXPECTED_RESULT")


def main():
    if os.name != "nt":
        raise SystemExit("WINDOWS_CI_ONLY")
    if len(sys.argv) != 3:
        raise SystemExit("Usage: stage24_package_and_smoke.py BUNDLE_ROOT HANDOFF_MD")
    target = Path(sys.argv[1]).resolve()
    handoff = Path(sys.argv[2]).resolve()
    if not handoff.is_file():
        raise SystemExit("HANDOFF_NOT_AVAILABLE")
    folder = build(target, handoff)
    verify_manifest(folder)
    smoke_cmd(folder, "\n", "OWNER_DECLINED_LOCAL_READBACK")
    print("GGLASS_STAGE24_BUNDLED_WINDOWS_CMD_DECLINE_PASS")
    smoke_cmd(folder, "YES\n", "ANDROID_SDK_NOT_FOUND_NO_DOWNLOAD")
    print("GGLASS_STAGE24_BUNDLED_WINDOWS_CMD_YES_NO_SDK_BLOCK_PASS")

    # The native Python runs may have created __pycache__ under data/.
    # Never distribute compiled bytecode or other executable binaries.
    for cache in list(folder.rglob("__pycache__")):
        if cache.is_dir():
            shutil.rmtree(cache)
    for junk in list(folder.rglob("*.pyc")):
        junk.unlink()
    if any(p.is_file() and p.suffix.lower() in {
        ".pyc", ".pyo", ".exe", ".dll", ".jar", ".apk", ".pyd"
    } for p in folder.rglob("*")):
        raise RuntimeError("STAGE24_EXECUTABLE_BINARY_INCLUDED")

    # A real user download starts in NOT_RUN. Recheck integrity afterward.
    (folder / "RESULT.txt").write_text(json.dumps(
        {"schema": "JH_GGLASS_STAGE24_WINDOWS_READONLY_V1",
         "status": "NOT_RUN", "device_access": False, "install_permitted": False},
        indent=2) + "\n", encoding="utf-8")
    add_manifest(folder)
    verify_manifest(folder)
    print("GGLASS_STAGE24_SOURCE_MATCHED_DELIVERY_MANIFEST_PASS")
    print("GGLASS_STAGE24_DELIVERY_NO_APK_NO_KEY_NO_PHONE_NO_GPT_API")


if __name__ == "__main__":
    main()
