#!/usr/bin/env python3
"""G Glass Stage20: offline READ-ONLY APK identity preflight; NEVER installs.

Requires locally trusted Android SDK aapt2 and apksigner; no signing private
keys, no network, no phone, no Meta account or JH server contact. Identity PASS
is NOT physical-test, source-provenance, WDC, AV, or installation approval.
"""
import argparse
import hashlib
import hmac
import json
import re
import subprocess
from pathlib import Path

TRIAL_PACKAGE = "com.koreanlifehub.jhglassprobe"
TRIAL_LABEL = "G Glass"
COLLIDING_PACKAGES = {
    "com.koreanlifehub.bridge",
    "com.meta.wearable.dat.externalsampleapps.cameraaccess",
}
META_SOURCE_COMMIT = "f4371bc9f90249d51eb07d7f8a61e8d829294f16"
STAGE19_VERIFIED_RUN = "42995442199"
BASELINE_PERMISSIONS = {
    "android.permission.BLUETOOTH",
    "android.permission.BLUETOOTH_CONNECT",
    "android.permission.CAMERA",
    "android.permission.INTERNET",
    "android.permission.RECORD_AUDIO",
    "android.permission.MODIFY_AUDIO_SETTINGS",
    "android.permission.FOREGROUND_SERVICE",
    "android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE",
    "android.permission.WAKE_LOCK",
}
PACKAGE_RE = re.compile(r"^package:\s+name='([^']+)'\s+versionCode='([^']+)'", re.M)
LABEL_RE = re.compile(r"^(?:application-label|application):\s*(?:label=)?'([^']+)'", re.M)
PERMISSION_RE = re.compile(r"^uses-permission:\s+name='([^']+)'", re.M)
CERT_RE = re.compile(r"^\s*Signer\s+#(\d+)\s+certificate SHA-256 digest:\s*([A-Fa-f0-9: ]+)$", re.M)
SHA_RE = re.compile(r"^[a-f0-9]{64}$")


def normalized_digest(raw):
    if not raw:
        return None
    digest = raw.lower().replace(":", "").replace(" ", "")
    return digest if SHA_RE.fullmatch(digest) else None


def badging_from_aapt2(output):
    pkg = PACKAGE_RE.search(output)
    label = LABEL_RE.search(output)
    return {
        "package_name": pkg.group(1) if pkg else None,
        "version_code": pkg.group(2) if pkg else None,
        "label": label.group(1) if label else None,
        "permissions": sorted(set(PERMISSION_RE.findall(output))),
        "debuggable": bool(re.search(r"^application-debuggable$", output, re.M)),
    }


def signers_from_apksigner(output):
    signers = {}
    for index, raw in CERT_RE.findall(output):
        digest = normalized_digest(raw)
        if not digest or index in signers:
            raise ValueError("INVALID_CERT_OUTPUT")
        signers[index] = digest
    return [signers[k] for k in sorted(signers)]


def evaluate(badging, certs, approved_cert):
    reasons = []
    pkg = badging.get("package_name")
    if pkg != TRIAL_PACKAGE or pkg in COLLIDING_PACKAGES:
        reasons.append("PACKAGE_ID_NOT_ISOLATED")
    if badging.get("label") != TRIAL_LABEL:
        reasons.append("APP_LABEL_MISMATCH")
    if not badging.get("version_code"):
        reasons.append("APK_VERSION_MISSING")
    # AndroidX generates this exact *app-owned, package-scoped* receiver guard.
    # Do not generalize to arbitrary custom permissions or other app IDs.
    permitted = BASELINE_PERMISSIONS | {TRIAL_PACKAGE + ".DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION"}
    extra = sorted(set(badging.get("permissions", [])) - permitted)
    if extra:
        reasons.append("PERMISSION_EXPANSION_REQUIRES_REVIEW")
    if len(certs) != 1:
        reasons.append("EXACTLY_ONE_SIGNER_REQUIRED")
    approved = normalized_digest(approved_cert)
    if approved is None:
        reasons.append("PREAPPROVED_SIGNER_FINGERPRINT_MISSING")
    elif len(certs) == 1 and not hmac.compare_digest(certs[0], approved):
        reasons.append("APP_SIGNER_NOT_APPROVED")
    return {
        "identity_gate": "PASS" if not reasons else "BLOCKED",
        "reasons": reasons,
        "package_name": pkg,
        "version_code": badging.get("version_code"),
        "label": badging.get("label"),
        "unknown_permissions": extra,
        "signer_count": len(certs),
        "signer_approved": approved is not None and len(certs) == 1 and certs[0] == approved,
        "installation_authorized": False,
        "source_provenance_verified": False,
        "wdc_beta_verified": False,
        "real_glasses_verified": False,
    }


def readonly_sdk_call(tool, args):
    if not tool.is_absolute() or not tool.is_file() or not tool.stat().st_mode & 0o111:
        raise ValueError("TRUSTED_ANDROID_SDK_TOOL_PATH_REQUIRED")
    completed = subprocess.run([str(tool), *args], capture_output=True, text=True, timeout=30, check=False)
    if completed.returncode:
        raise RuntimeError("SDK_TOOL_REJECTED_APK")
    if len(completed.stdout) > 128000:
        raise ValueError("SDK_TOOL_OUTPUT_TOO_LARGE")
    return completed.stdout


def inspect(apk, aapt2, apksigner, expected_cert):
    if apk.is_symlink() or not apk.is_file() or not 10000 < apk.stat().st_size < 180000000:
        raise ValueError("APK_FILE_UNTRUSTED")
    with apk.open("rb") as f:
        if f.read(4) != b"PK\x03\x04":
            raise ValueError("NOT_AN_APK")
    sha = hashlib.sha256()
    with apk.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            sha.update(chunk)
    badging = readonly_sdk_call(aapt2, ["dump", "badging", str(apk)])
    signature = readonly_sdk_call(apksigner, ["verify", "--verbose", "--print-certs", str(apk)])
    outcome = evaluate(badging_from_aapt2(badging), signers_from_apksigner(signature), expected_cert)
    return {
        "schema": "JH_GGLASS_STAGE20_READONLY_IDENTITY_V1",
        "candidate_sha256": sha.hexdigest(),
        "meta_source_pin": META_SOURCE_COMMIT,
        "stage19_emulator_pass_run": STAGE19_VERIFIED_RUN,
        "status": "IDENTITY_PASS_ONLY_NOT_INSTALLABLE" if outcome["identity_gate"] == "PASS" else "BLOCKED",
        **outcome,
        "mandatory_next_gates": [
            "LOCAL_SOURCE_AND_SIGNING_PROVENANCE",
            "META_DEVICE_AND_REGISTRATION_READBACK",
            "OS_ANTIVIRUS_AND_APK_SECURITY",
            "OWNER_EXPLICIT_INSTALL_AND_PERMISSION_APPROVAL",
            "SEPARATE_WDC_BETA_VOICE_LAUNCH_ELIGIBILITY",
        ],
    }


def main():
    parser = argparse.ArgumentParser(description="Read-only G Glass APK identity; never installs")
    parser.add_argument("--apk", type=Path, required=True)
    parser.add_argument("--aapt2", type=Path, required=True)
    parser.add_argument("--apksigner", type=Path, required=True)
    parser.add_argument("--approved-cert-sha256")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    try:
        result = inspect(args.apk, args.aapt2, args.apksigner, args.approved_cert_sha256)
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as err:
        result = {
            "schema": "JH_GGLASS_STAGE20_READONLY_IDENTITY_V1",
            "status": "BLOCKED",
            "reason": str(err),
            "installation_authorized": False,
        }
    output = json.dumps(result, indent=2, ensure_ascii=False) + "\n"
    if args.output:
        args.output.write_text(output, encoding="utf-8")
    print(output, end="")
    return 0 if result.get("status") == "IDENTITY_PASS_ONLY_NOT_INSTALLABLE" else 12


if __name__ == "__main__":
    raise SystemExit(main())
