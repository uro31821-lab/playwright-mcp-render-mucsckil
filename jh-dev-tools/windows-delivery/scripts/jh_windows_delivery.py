#!/usr/bin/env python3
"""Match packaged Windows APK delivery files to an independently reviewed profile.

Python 3.10+, standard library only. The registry is fixed within this skill;
package contents cannot select another registry or declare their own approval.
This check does not execute Windows, PowerShell, APKs, or device operations.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import stat
import unicodedata


class WindowsDeliveryError(ValueError):
    """A missing, unreviewed, malformed, or mismatched delivery contract."""


PROFILE_REGISTRY = Path(__file__).resolve().parents[1] / "references/windows-apk-profiles.json"
REGISTRY_SCHEMA = "jh.windows-apk-profiles.v1"
PROFILE_SCHEMA = "jh.windows-apk-profile.v1"
REPORT_SCHEMA = "jh.windows-apk-delivery.v1"
MAX_REGISTRY_BYTES = 4 * 1024 * 1024
MAX_PROFILES = 128
MAX_REQUIRED_FILES = 2048
MAX_PACKAGE_FILES = 10000
MAX_FILE_BYTES = 128 * 1024 * 1024
MAX_TOTAL_BYTES = 512 * 1024 * 1024
ENTRYPOINT = "실행.cmd"
CHECKLIST = "POWER_SHELL_ERROR_CHECKLIST.txt"
_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,95}\Z")
_VERSION = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}\Z")
_SHA256 = re.compile(r"[0-9a-f]{64}\Z")
_REF = re.compile(r"(?:artifact|commit|fixture|library|sha256|source|test|user):[A-Za-z0-9][A-Za-z0-9._/-]{0,255}\Z")
_WINDOWS_RESERVED = {"con", "prn", "aux", "nul"} | {
    f"{prefix}{number}" for prefix in ("com", "lpt") for number in range(1, 10)
}


def _digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _canonical(value) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"),
                      allow_nan=False).encode("utf-8")


def _fields(value, required, label: str) -> None:
    if type(value) is not dict or set(value) != set(required):
        raise WindowsDeliveryError(f"Invalid {label} fields")


def _relative_path(value) -> str:
    if (not isinstance(value, str) or not value or len(value) > 1024 or
            value.startswith("/") or "\\" in value or ":" in value or
            any(char in value for char in '<>"|?*') or
            any(ord(char) < 32 or ord(char) == 127 for char in value)):
        raise WindowsDeliveryError("Invalid delivery file path")
    try:
        if len(value.encode("utf-8")) > 4096:
            raise WindowsDeliveryError("Delivery file path is too long")
    except UnicodeError as exc:
        raise WindowsDeliveryError("Invalid delivery file Unicode") from exc
    for part in value.split("/"):
        if (part in ("", ".", "..") or part.endswith((".", " ")) or
                part.split(".", 1)[0].casefold() in _WINDOWS_RESERVED):
            raise WindowsDeliveryError("Unsafe delivery file path")
    return value


def _file_mapping(value, *, limit: int, label: str) -> dict:
    if type(value) is not dict or not value or len(value) > limit:
        raise WindowsDeliveryError(f"Invalid {label} file mapping")
    nodes = {}
    total_bytes = 0
    for name, record in value.items():
        _relative_path(name)
        parts = name.split("/")
        for number in range(1, len(parts) + 1):
            current = "/".join(parts[:number])
            kind = "file" if number == len(parts) else "directory"
            key = unicodedata.normalize("NFC", current).casefold()
            if key in nodes and nodes[key] != (current, kind):
                raise WindowsDeliveryError(f"Colliding {label} file paths")
            nodes[key] = (current, kind)
        _fields(record, {"sha256", "size"}, label + " file")
        if (not isinstance(record["sha256"], str) or not _SHA256.fullmatch(record["sha256"]) or
                type(record["size"]) is not int or not 0 <= record["size"] <= MAX_FILE_BYTES):
            raise WindowsDeliveryError(f"Invalid {label} file digest or size")
        total_bytes += record["size"]
    if total_bytes > MAX_TOTAL_BYTES:
        raise WindowsDeliveryError(f"{label} file total exceeds delivery bounds")
    return value


def _text_list(value, *, label: str, limit: int, length: int, reference: bool = False) -> None:
    if type(value) is not list or not 1 <= len(value) <= limit:
        raise WindowsDeliveryError(f"Invalid profile {label}")
    for item in value:
        if (not isinstance(item, str) or not item.strip() or len(item) > length or
                any(ord(char) < 32 or ord(char) == 127 for char in item)):
            raise WindowsDeliveryError(f"Invalid profile {label}")
        try:
            item.encode("utf-8")
        except UnicodeError as exc:
            raise WindowsDeliveryError(f"Invalid profile {label} Unicode") from exc
        if reference and not _REF.fullmatch(item):
            raise WindowsDeliveryError("Profile evidence must use opaque supported references")
    if len(set(value)) != len(value):
        raise WindowsDeliveryError(f"Duplicate profile {label}")


def _validate_profile(profile) -> dict:
    _fields(profile, {"schema", "id", "version", "entrypoint", "required_files",
                      "evidence_refs", "limitations", "review_status"}, "profile")
    if (profile["schema"] != PROFILE_SCHEMA or not isinstance(profile["id"], str) or
            not _ID.fullmatch(profile["id"]) or not isinstance(profile["version"], str) or
            not _VERSION.fullmatch(profile["version"])):
        raise WindowsDeliveryError("Unsupported profile schema, ID, or version")
    if profile["entrypoint"] != ENTRYPOINT:
        raise WindowsDeliveryError("Windows APK profiles require the standard root entrypoint")
    if profile["review_status"] not in ("reviewed", "blocked", "candidate"):
        raise WindowsDeliveryError("Invalid profile review status")
    required = _file_mapping(profile["required_files"], limit=MAX_REQUIRED_FILES, label="required")
    if profile["review_status"] == "reviewed" and not {ENTRYPOINT, CHECKLIST} <= required.keys():
        raise WindowsDeliveryError("Profile must pin its entrypoint and PowerShell checklist")
    _text_list(profile["evidence_refs"], label="evidence_refs", limit=32, length=272, reference=True)
    _text_list(profile["limitations"], label="limitations", limit=16, length=1024)
    return profile


def _unique_pairs(pairs) -> dict:
    result = {}
    for key, value in pairs:
        if key in result:
            raise WindowsDeliveryError("Duplicate JSON key in profile registry")
        result[key] = value
    return result


def _read_registry() -> tuple[dict, str]:
    # The module constant is deliberately the only source; no CLI, environment,
    # package metadata, or caller-supplied registry pathname is supported.
    path = PROFILE_REGISTRY
    try:
        if path.is_symlink():
            raise WindowsDeliveryError("Profile registry must be a regular file")
        descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_BINARY", 0))
        with os.fdopen(descriptor, "rb") as stream:
            before = os.fstat(stream.fileno())
            if not stat.S_ISREG(before.st_mode) or before.st_size > MAX_REGISTRY_BYTES:
                raise WindowsDeliveryError("Profile registry is not a bounded regular file")
            raw = stream.read(MAX_REGISTRY_BYTES + 1)
            after = os.fstat(stream.fileno())
        current = path.lstat()
        identity = lambda item: (item.st_dev, item.st_ino, item.st_size, item.st_mtime_ns, item.st_ctime_ns)
        if (len(raw) > MAX_REGISTRY_BYTES or len(raw) != before.st_size or
                identity(before) != identity(after) or identity(after) != identity(current)):
            raise WindowsDeliveryError("Profile registry changed or exceeds its bounds")
        registry = json.loads(raw, object_pairs_hook=_unique_pairs)
    except (OSError, UnicodeError, json.JSONDecodeError, RecursionError) as exc:
        raise WindowsDeliveryError("Trusted Windows APK profile registry is unavailable or invalid") from exc
    _fields(registry, {"schema", "profiles"}, "profile registry")
    if (registry["schema"] != REGISTRY_SCHEMA or type(registry["profiles"]) is not list or
            not 1 <= len(registry["profiles"]) <= MAX_PROFILES):
        raise WindowsDeliveryError("Unsupported Windows APK profile registry")
    ids = set()
    for profile in registry["profiles"]:
        _validate_profile(profile)
        if profile["id"] in ids:
            raise WindowsDeliveryError("Duplicate Windows APK profile ID")
        ids.add(profile["id"])
    return registry, _digest(raw)


def check_delivery(files: dict, profile_id: str) -> dict:
    """Verify the actual filtered packaging manifest against a fixed profile.

    The caller must run the existing static preflight first, then preserve this
    exact file mapping when writing and verifying its ZIP. No source discovery,
    script execution, device query, or output publication occurs here.
    """
    if not isinstance(profile_id, str) or not _ID.fullmatch(profile_id):
        raise WindowsDeliveryError("Windows APK profile must be a registered ID, not a path")
    _file_mapping(files, limit=MAX_PACKAGE_FILES, label="packaged")
    registry, registry_sha256 = _read_registry()
    profile = next((item for item in registry["profiles"] if item["id"] == profile_id), None)
    if profile is None:
        raise WindowsDeliveryError("Unknown Windows APK profile ID")
    if profile["review_status"] != "reviewed":
        raise WindowsDeliveryError("Windows APK profile is not reviewed for packaging")
    for name, expected in profile["required_files"].items():
        if name not in files:
            raise WindowsDeliveryError(f"Windows APK delivery is missing required packaged file: {name}")
        if files[name] != expected:
            raise WindowsDeliveryError(f"Windows APK delivery file differs from its trusted profile: {name}")
    try:
        checker_sha256 = _digest(Path(__file__).read_bytes())
    except OSError as exc:
        raise WindowsDeliveryError("Windows APK checker identity is unavailable") from exc
    binding = {"schema": REPORT_SCHEMA, "profile_id": profile["id"], "profile_version": profile["version"],
               "profile_sha256": _digest(_canonical(profile)), "registry_sha256": registry_sha256,
               "checker_sha256": checker_sha256, "files_sha256": _digest(_canonical(files))}
    return {**binding, "ok": True, "fingerprint": _digest(_canonical(binding)),
            "entrypoint": profile["entrypoint"], "review_status": profile["review_status"],
            "required_file_count": len(profile["required_files"]), "packaged_file_count": len(files),
            "matched_files": sorted(profile["required_files"]),
            "evidence_refs": list(profile["evidence_refs"]), "limitations": list(profile["limitations"]),
            "validation_scope": "pinned_packaged_files", "runtime_status": "not_run"}
