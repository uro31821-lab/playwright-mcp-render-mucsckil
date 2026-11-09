"""Pure recovery advice for an unavailable executor. No execution or authorization.
Only latest failure evidence belongs here, not a concatenated conversation history.
No network, shell, archive extraction, signer, phone, installation or runtime changes.
"""
from __future__ import annotations
import hashlib
import re

VERSION = "1.0.0"
_KV = re.compile(r"^[ \t]*([A-Z][A-Z0-9_]+)[ \t]*:[ \t]*(.*?)[ \t]*$", re.M)
_SECURITY = re.compile(r"EXTERNAL_SECURITY_GATE[^\r\n]*(?:BLOCK|REVIEW)|SECURITY_HOLD", re.I)
_PLATFORM = re.compile(r"(?<![A-Za-z0-9_.])caas\.internal\.errors\.ClientError(?![A-Za-z0-9_])")
_SOURCE = "This Project file does not have an authorized raw-byte materialization path"


def classify_execution_failure(text: str) -> dict | None:
    """Recognize observed infrastructure errors, not arbitrary ClientError instances."""
    if not isinstance(text, str):
        raise TypeError("failure evidence must be text")
    if _SECURITY.search(text):
        return None  # Never override the original security gate.
    if _PLATFORM.search(text):
        kind = "TOOL_EXECUTION_ENVIRONMENT"
        action = ("Stop retries in this unavailable executor. Preserve completed evidence. "
                  "Use one trivial non-mutating health check only after the executor changes. "
                  "Recover exact authorized source bytes in a healthy workspace or reuse the "
                  "verified build host. Do not modify app source or add unrelated tests to "
                  "explain a tool-level failure. Do not reinstall the phone or disable security.")
        cause = "caas.internal.errors.ClientError"
    elif _SOURCE in text:
        kind = "SOURCE_ACCESS"
        action = ("Preserve the raw-byte access denial. A filename, indexed text or checksum "
                  "is not possession of the ZIP. Recover the exact source through an authorized "
                  "attachment/connector in a healthy workspace. Do not reconstruct the app from "
                  "snippets, publish private source, or retry the same denied materialization.")
        cause = "authorized_raw_bytes_unavailable"
    else:
        return None
    return {
        "kind": kind,
        "action": action,
        "blockerFingerprint": hashlib.sha256((kind + "|" + cause).encode()).hexdigest(),
        "sameExecutorAutomaticRetries": 0,
        "recheckOnlyAfterExecutorOrAccessChange": True,
        "rootCauseConfirmed": False,
        "phoneChangeAuthorized": False,
        "buildAuthorized": False,
    }


def decorate_packet(packet: dict, text: str) -> dict:
    """Attach stop/handoff advice; this does not implement a persistent retry counter."""
    result = dict(packet)
    issue = classify_execution_failure(text)
    if issue is not None and result.get("blockerType") == issue["kind"]:
        result["executionMode"] = "RECOVER_EXECUTOR_OR_SOURCE_ONLY"
        result["boundedAutoRemediationCycles"] = 0
        result["infrastructureRecovery"] = issue
    return result


def reported_build_environment(text: str, expected_candidate: str | None = None) -> dict:
    """A RESULT text is reported evidence, not a signed artifact or live-device proof.
    A parent build never authorizes reuse of an APK after adding camera code.
    """
    if not isinstance(text, str):
        raise TypeError("receipt must be text")
    rows = _KV.findall(text)
    keys = [key for key, _ in rows]
    values = dict(rows)
    ambiguous = len(keys) != len(set(keys))
    identity_matches = expected_candidate is None or values.get("CANDIDATE") == expected_candidate
    passed = (not ambiguous and identity_matches
              and values.get("ANDROID_BUILD") == "PASS"
              and values.get("ORIGINAL_KEY_SIGNING") == "PASS"
              and values.get("EXTERNAL_SECURITY_GATE") == "PASS_SAFE"
              and values.get("TOOLCHAIN_CHECKPOINT") == "EXISTING_REUSED"
              and not _SECURITY.search(text))
    return {
        "environmentEvidence": "REPORTED_PARENT_PASS" if passed else "UNCONFIRMED",
        "preferExistingVerifiedBuildHost": bool(passed),
        "ambiguousReceipt": ambiguous,
        "candidateIdentityMatches": identity_matches,
        "privateSourceBytesVerified": False,
        "installedApkHashVerified": False,
        "currentCameraBuildVerified": False,
        "reuseSignedApkAuthorized": False,
        "installAuthorized": False,
        "cameraControlAuthorized": False,
    }
