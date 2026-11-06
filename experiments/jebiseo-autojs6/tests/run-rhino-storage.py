#!/usr/bin/env python3
"""Run main.js durableWrite through AutoJs6's pinned Rhino and a real JVM.

Android's Os/OsConstants/ErrnoException are small Java mocks in this fixture.
Java reflection, typed Class[]/Object[], primitive unboxing, Java file writes,
UTF-8 bytes, and Rhino exception wrapping are real. This is not Android/device
fsync validation or a phone E2E test.

Run from the experiment directory: python3 tests/run-rhino-storage.py
The pinned JAR is downloaded, verified, compiled against, and executed only in
a temporary directory. It is never added to the phone bundle or delivery ZIP.
An optional --rhino-jar path reuses an already downloaded, identically verified
JAR. Network/compiler failures exit nonzero rather than reporting a skipped PASS.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import urllib.request


AUTOJS_COMMIT = "b7c88e117d70176058ae0c035194a7c188ffb8c2"
JAR_NAME = "org-mozilla-rhino-2_0_0-SNAPSHOT.jar"
JAR_URL = (
    "https://raw.githubusercontent.com/SuperMonster003/AutoJs6/"
    + AUTOJS_COMMIT
    + "/libs/"
    + JAR_NAME
)
JAR_SIZE = 3_529_198
JAR_GIT_BLOB_SHA1 = "0a2e3f98fe331fc8ce19c7eab5acfb935160894c"
RESULT_PREFIX = "RHINO_STORAGE_RESULT "
EXPECTED_CASES = ["success", "open", "sync_close", "close"]


def run_process(command: list[str], *, timeout: int = 60) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        command, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout
    )
    if result.returncode:
        detail = (result.stdout + result.stderr)[-12_000:]
        raise RuntimeError(f"command failed ({result.returncode}): {command[0]}\n{detail}")
    return result


def compiler_command(java: str) -> list[str]:
    javac = shutil.which("javac")
    if javac:
        return [javac]
    modules = run_process([java, "--list-modules"], timeout=15).stdout.splitlines()
    if any(item == "jdk.compiler" or item.startswith("jdk.compiler@") for item in modules):
        return [java, "-m", "jdk.compiler/com.sun.tools.javac.Main"]
    raise RuntimeError("NOT_RUN: a JDK compiler is required (javac or the existing jdk.compiler module)")


def verified_jar(existing: Path | None) -> bytes:
    if existing is not None:
        with existing.open("rb") as stream:
            payload = stream.read(JAR_SIZE + 1)
    else:
        request = urllib.request.Request(JAR_URL, headers={"User-Agent": "Jebiseo-Rhino-Interop-Test/1"})
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = response.read(JAR_SIZE + 1)
    if len(payload) != JAR_SIZE:
        raise RuntimeError(f"PIN_MISMATCH: expected {JAR_SIZE} JAR bytes, received {len(payload)}")
    digest = hashlib.sha1(b"blob " + str(len(payload)).encode("ascii") + b"\0" + payload).hexdigest()
    if digest != JAR_GIT_BLOB_SHA1:
        raise RuntimeError(f"PIN_MISMATCH: Git blob SHA-1 {digest} does not match the pinned official blob")
    return payload


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--rhino-jar", type=Path, help="existing pinned JAR; size and Git blob hash are still verified")
    arguments = parser.parse_args()
    experiment = Path(__file__).resolve().parents[1]
    fixtures = experiment / "tests" / "fixtures" / "rhino-storage"
    production_main = experiment / "main.js"
    java = shutil.which("java")
    if java is None:
        raise RuntimeError("NOT_RUN: Java runtime is required")
    compiler = compiler_command(java)
    java_sources = sorted(fixtures.rglob("*.java"))
    if len(java_sources) != 4 or not production_main.is_file():
        raise RuntimeError("TEST_INPUT_MISSING: expected main.js and four Java fixture sources")
    payload = verified_jar(arguments.rhino_jar)
    with tempfile.TemporaryDirectory(prefix="jebiseo-rhino-storage-") as temporary:
        work = Path(temporary)
        jar = work / JAR_NAME
        jar.write_bytes(payload)
        classes = work / "classes"
        classes.mkdir()
        run_process(compiler + ["-encoding", "UTF-8", "-cp", str(jar), "-d", str(classes)] + [str(path) for path in java_sources])
        execution = run_process([
            java, "-Dfile.encoding=UTF-8", "-cp", os.pathsep.join([str(classes), str(jar)]),
            "StorageInterop", str(production_main), str(fixtures / "storage-harness.js"), str(work / "state")
        ])
        result_lines = [line[len(RESULT_PREFIX):] for line in execution.stdout.splitlines() if line.startswith(RESULT_PREFIX)]
        if len(result_lines) != 1:
            raise RuntimeError("RESULT_MISSING: JVM did not return one current interop result\n" + execution.stdout[-4000:])
        result = json.loads(result_lines[0])
        if (result.get("androidOsMock") is not True or result.get("passed") != 4 or
                [item.get("name") for item in result.get("cases", [])] != EXPECTED_CASES or
                not all(item.get("passed") is True for item in result["cases"])):
            raise RuntimeError("RESULT_INVALID: expected four successful Java/Rhino interop cases")
        summary = {
            "suite": "rhino-jvm-storage-interop", "passed": result["passed"], "failed": 0,
            "androidOsMock": True, "phoneE2E": "NOT_RUN",
            "rhinoSourceCommit": AUTOJS_COMMIT, "rhinoGitBlobSha1": JAR_GIT_BLOB_SHA1,
            "mainSha256": hashlib.sha256(production_main.read_bytes()).hexdigest(),
            "cases": result["cases"]
        }
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        print("PASS: real pinned Rhino/JVM interoperability; Android Os is a mock, not phone/device validation.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, RuntimeError, ValueError, subprocess.TimeoutExpired) as error:
        print(f"FAIL: Rhino/JVM storage interop was not verified: {error}", file=sys.stderr)
        raise SystemExit(1)
