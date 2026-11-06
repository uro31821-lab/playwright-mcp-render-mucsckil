#!/usr/bin/env python3
"""Read-only packaging relationships; not Windows, signing, or device tests."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import re

def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def check(root: Path, *, require_payload: bool = True) -> dict:
    manifest = root / "data/RELEASE.json"
    release = json.loads(manifest.read_text(encoding="utf-8"))
    entry = (root / "data/Start-JH-Ebiseo.ps1").read_text(encoding="utf-8-sig")
    core = (root / "data/JH-Ebiseo-InstallCore.ps1").read_text(encoding="utf-8-sig")
    checks = {}
    pin = re.findall(r"\$PinnedReleaseSha='([0-9a-f]{64})'", entry)
    checks["single_release_pin_matches"] = len(pin) == 1 and pin[0] == sha(manifest)
    checks["verified_cloud_candidate"] = release["status"] == "VERIFIED_PREBUILT_UNSIGNED_CANDIDATE"
    checks["exact_identity_in_one_manifest"] = (
        release["application"]["id"] == "com.koreanlifehub.bridge"
        and release["application"]["versionCode"] == 168
        and release["application"]["versionName"] ==
        "jh168-stage77-location-once-native-select-fix3-keepalive-fix1-ebiseo054"
        and "fix1-fix1" not in release["application"]["versionName"]
        and release["application"]["versionName"] not in core
    )
    checks["original_certificate"] = release["signing"]["certificateSha256"] == (
        "7cc577efe48e865fdbe799b92aa9edf89724631361ae97979f2b8e4a940a288b"
    )
    checks["windows_proof_external"] = release["releaseProfile"] == {
        "status": "EXTERNAL_PINNED_PROFILE_REQUIRED",
        "windows51Execution": "SEE_EXTERNAL_DELIVERY_RECEIPT",
        "phoneInstall": "LOCAL_RESULT_REQUIRED",
    }
    evidence = {}
    for item in release["evidence"]:
        path = root / item["path"]
        checks["evidence:" + path.name] = path.is_file() and sha(path) == item["sha256"]
        evidence[path.name] = json.loads(path.read_text(encoding="utf-8-sig"))
    audit = evidence["apk-audit.json"]
    checks["audit_bound_to_build_and_source"] = (
        audit["buildResultSha256"] == sha(root / "data/evidence/full-build.json")
        and audit["sourceManifestSha256"] == sha(root / "data/evidence/source-manifest.json")
        == release["sourceManifestSha256"]
        and audit["sha256"] == release["payload"]["sha256"]
        and audit["bytes"] == release["payload"]["bytes"]
    )
    checks["build_and_tests_passed"] = (
        evidence["full-build.json"]["status"] == "PASS"
        and evidence["full-build.json"]["exitCode"] == 0
        and evidence["unit-results.json"]["tests"] > 0
        and all(evidence["unit-results.json"][x] == 0 for x in ("failures", "errors", "skipped"))
        and evidence["lint-summary.json"]["errors"] == 0
        and evidence["source-integrity.json"]["status"] == "PASS"
    )
    checks["audit_identity_matches_release"] = all(
        audit[audit_name] == release["application"][release_name]
        for audit_name, release_name in (
            ("packageName", "id"), ("versionCode", "versionCode"),
            ("versionName", "versionName"), ("minSdk", "minSdk"),
            ("targetSdk", "targetSdk"), ("debuggable", "debuggable"),
        )
    ) and audit["unsignedConfirmed"] and audit["zipalign4ByteVerified"]
    payload = root / release["payload"]["path"]
    if require_payload:
        checks["payload_hash_and_bytes"] = (
            payload.is_file() and payload.stat().st_size == release["payload"]["bytes"]
            and sha(payload) == release["payload"]["sha256"]
        )
    for path in root.rglob("*.ps1"):
        raw = path.read_bytes()
        checks["powershell_bom_crlf:" + str(path.relative_to(root))] = (
            raw.startswith(b"\xef\xbb\xbf") and b"\n" not in raw.replace(b"\r\n", b"")
        )
    cmd = (root / "실행.cmd").read_bytes()
    checks["cmd_ascii_crlf"] = all(b < 128 for b in cmd) and b"\n" not in cmd.replace(b"\r\n", b"")
    checks["no_production_delete_keygen_build"] = not re.search(
        r"(?im)^\s*(?:Remove-Item|.*-genkeypair|.*\badb\b.*uninstall|.*pm\s+clear|.*gradle(?:\.bat)?\s)",
        core,
    )
    checks["sole_update_call_and_fence_order"] = (
        core.count("@('-s',$serial,'install','-r',$signed)") == 1
        and core.index("Write-JhNewText $fence") <
        core.index("@('-s',$serial,'install','-r',$signed)")
    )
    failed = [name for name, ok in checks.items() if not ok]
    return {
        "schema": "JH_EBISEO_PREBUILT_STATIC_CONTRACT_V1",
        "scope": "Read-only byte, identity, provenance and source contract checks.",
        "windowsExecution": "NOT_RUN_BY_THIS_CHECK",
        "realSigning": "NOT_RUN", "deviceInstall": "NOT_RUN",
        "payloadRequired": require_payload, "passed": len(checks) - len(failed),
        "total": len(checks), "failed": failed, "checks": checks,
    }

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("root", type=Path)
    parser.add_argument("--metadata-only", action="store_true")
    args = parser.parse_args()
    result = check(args.root.resolve(), require_payload=not args.metadata_only)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(bool(result["failed"]))
