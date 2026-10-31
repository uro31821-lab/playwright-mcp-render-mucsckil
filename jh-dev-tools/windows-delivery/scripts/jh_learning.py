#!/usr/bin/env python3
"""Evidence-backed JH development lessons and a small, non-executing preflight.

Python 3.10+, standard library only. This is a known-regression scanner, NOT a
PowerShell parser or a Windows/Android execution test. Never execute input code
or commands supplied in a lesson. Keep the existing Windows AST/runtime checks.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import tempfile


class LearningError(ValueError):
    """Invalid lesson data or a failed preflight prerequisite."""


SCHEMA = "jh.development-lessons.v1"
REPORT_SCHEMA = "jh.development-preflight.v1"
DEFAULT_REGISTRY = Path(__file__).resolve().parents[1] / "references/development-lessons.json"
MAX_REGISTRY_BYTES = 4 * 1024 * 1024
MAX_SCRIPT_BYTES = 4 * 1024 * 1024
CHECKS = {
    "PS_ALIAS_COLLISION", "PS_AUTOMATIC_VARIABLE", "PS_ENCODING",
    "WINDOWS_ENTRYPOINT", "CMD_ENCODING", "PACKAGE_PRESERVE_OUTPUTS",
}
# A deliberately small, documented cross-platform baseline. The existing
# Windows Get-Alias/AST check must still cover the target host's complete set.
KNOWN_ALIASES = {
    "h": "Get-History", "history": "Get-History", "ghy": "Get-History",
    "r": "Invoke-History", "ihy": "Invoke-History",
}
_ID = re.compile(r"[A-Z][A-Z0-9_-]{2,95}\Z")
_HASH = re.compile(r"[0-9a-f]{64}\Z")
_FUNCTION = re.compile(
    r"(?i)(?<![\w$:-])(?:function|filter)\s+"
    r"(?:(?:global|script|local|private):)?([a-z_][\w-]*)(?=\s|\(|\{)"
)
_VARIABLE = r"\$(?:(?:global|script|local|private):)?(?:Matches|Home|Host|PID|Input|Args)\b"
_MUTATION = re.compile(
    r"(?i)(?<![\w$])(?:" + _VARIABLE + r"\s*(?:\+\+|--|[+*/%\-]?=(?!=))"
    r"|(?:\+\+|--)\s*" + _VARIABLE + r")"
)


def _digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _json_bytes(value) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf-8")


def _unique(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise LearningError(f"Duplicate JSON key: {key}")
        value[key] = item
    return value


def _read_json(path: Path):
    if path.is_symlink() or not path.is_file():
        raise LearningError("Registry/input must be a regular file")
    if path.stat().st_size > MAX_REGISTRY_BYTES:
        raise LearningError("Registry/input is too large")
    raw = path.read_bytes()
    if len(raw) > MAX_REGISTRY_BYTES:
        raise LearningError("Registry/input is too large")
    try:
        return json.loads(raw, object_pairs_hook=_unique), raw
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise LearningError("Invalid JSON data") from exc


def _text(value, label: str, limit: int = 4096):
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise LearningError(f"Invalid {label}")


def _validate_lesson(entry):
    required = {"id", "kind", "state", "scope", "symptom", "cause", "resolution", "checks", "evidence"}
    optional = {"observed_at", "supersedes", "context"}
    if not isinstance(entry, dict) or not required <= entry.keys() or entry.keys() - required - optional:
        raise LearningError("Lesson must contain only documented data fields; commands are not allowed")
    if not isinstance(entry["id"], str) or not _ID.fullmatch(entry["id"]):
        raise LearningError("Invalid lesson ID")
    if not isinstance(entry["kind"], str) or entry["kind"] not in {"incident", "practice", "preventive"}:
        raise LearningError("Invalid lesson kind")
    if not isinstance(entry["state"], str) or entry["state"] not in {"observed", "verified", "reviewed"}:
        raise LearningError("Invalid lesson state")
    for key in ("symptom", "cause", "resolution"):
        _text(entry[key], key)
    for key in ("observed_at", "supersedes", "context"):
        if key in entry:
            _text(entry[key], key)
    if "supersedes" in entry and not _ID.fullmatch(entry["supersedes"]):
        raise LearningError("Invalid supersedes ID")
    if not isinstance(entry["scope"], list) or not entry["scope"]:
        raise LearningError("Lesson needs an applicable scope")
    for scope in entry["scope"]:
        _text(scope, "scope", 128)
    checks = entry["checks"]
    if (not isinstance(checks, list) or any(not isinstance(c, str) or c not in CHECKS for c in checks)
            or len(checks) != len(set(checks))):
        raise LearningError("Unknown or duplicate check ID; add reviewed code and a regression test first")
    evidence = entry["evidence"]
    if not isinstance(evidence, list) or not evidence or len(evidence) > 64:
        raise LearningError("Lesson needs bounded, explicit evidence")
    roles = set()
    for item in evidence:
        if (not isinstance(item, dict) or not {"role", "ref"} <= item.keys()
                or item.keys() - {"role", "ref", "summary", "sha256"}):
            raise LearningError("Invalid evidence record")
        if not isinstance(item["role"], str) or item["role"] not in {"failure", "fix", "success", "policy", "validation"}:
            raise LearningError("Invalid evidence role")
        roles.add(item["role"])
        _text(item["ref"], "evidence reference", 2048)
        if "summary" in item:
            _text(item["summary"], "evidence summary")
        if "sha256" in item and (not isinstance(item["sha256"], str) or not _HASH.fullmatch(item["sha256"])):
            raise LearningError("Invalid evidence SHA-256")
    if entry["kind"] == "incident" and entry["state"] == "verified":
        if not {"failure", "fix", "success"} <= roles or not checks:
            raise LearningError("Verified incident requires failure, fix, success evidence and a regression check")
    if entry["kind"] == "practice" and entry["state"] == "verified" and "success" not in roles:
        raise LearningError("Verified practice requires success evidence")


def _validate_registry(value) -> dict:
    if (not isinstance(value, dict) or set(value) != {"schema", "lessons"}
            or value.get("schema") != SCHEMA or not isinstance(value.get("lessons"), list)
            or len(value["lessons"]) > 10000):
        raise LearningError("Unsupported lesson registry")
    ids = set()
    for entry in value["lessons"]:
        _validate_lesson(entry)
        if entry["id"] in ids:
            raise LearningError("Duplicate lesson ID")
        if "supersedes" in entry and entry["supersedes"] not in ids:
            raise LearningError("Superseded lesson must already exist")
        ids.add(entry["id"])
    return value


def load_registry(path=None) -> dict:
    value, _ = _read_json(Path(path) if path is not None else DEFAULT_REGISTRY)
    return _validate_registry(value)


def record_lesson(entry: dict, registry_path) -> dict:
    """Append reviewed facts; identical retries are no-ops, conflicting IDs fail.

    A local lock serializes cooperating writers. Subsequent skill saves still
    use normal Git conflict handling. Evidence references are not auto-certified.
    """
    _validate_lesson(entry)
    path = Path(registry_path).absolute()
    if path.is_symlink():
        raise LearningError("Registry must not be a symlink")
    lock = path.with_name(path.name + ".lock")
    try:
        fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError as exc:
        raise LearningError("Registry is being updated; do not overwrite or delete the lock") from exc
    temporary = None
    try:
        os.close(fd)
        registry, original_bytes = _read_json(path)
        registry = _validate_registry(registry)
        baseline = _digest(original_bytes)
        for existing in registry["lessons"]:
            if existing["id"] == entry["id"]:
                if existing == entry:
                    return {"ok": True, "recorded": False, "id": entry["id"], "reason": "identical_record"}
                raise LearningError("Existing lesson differs; append a new ID with supersedes instead of overwriting")
        if "supersedes" in entry and entry["supersedes"] not in {e["id"] for e in registry["lessons"]}:
            raise LearningError("Superseded lesson does not exist")
        if len(registry["lessons"]) >= 10000:
            raise LearningError("Registry has reached its supported lesson count")
        registry["lessons"].append(entry)
        raw = _json_bytes(registry)
        if len(raw) > MAX_REGISTRY_BYTES:
            raise LearningError("Registry is too large")
        fd, name = tempfile.mkstemp(prefix=".jh-lessons-", dir=path.parent)
        temporary = Path(name)
        with os.fdopen(fd, "wb") as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        if _digest(path.read_bytes()) != baseline:
            raise LearningError("Registry changed during update; preserve the new version and reconcile")
        os.replace(temporary, path)
        return {"ok": True, "recorded": True, "id": entry["id"], "registry_sha256": _digest(raw)}
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
        lock.unlink(missing_ok=True)


def _code_only(text: str) -> str:
    """Mask comments/literal strings, preserving offsets for limited patterns.

    This intentionally does not claim to parse expandable-string subexpressions,
    generated code, all legal identifiers, or general PowerShell syntax.
    """
    out = list(text)
    i, n = 0, len(text)

    def blank(start, end):
        for j in range(start, end):
            if text[j] not in "\r\n":
                out[j] = " "

    while i < n:
        start = i
        if text.startswith("<#", i):
            i += 2
            depth = 1
            while i < n and depth:
                if text.startswith("<#", i):
                    depth += 1
                    i += 2
                elif text.startswith("#>", i):
                    depth -= 1
                    i += 2
                else:
                    i += 1
            blank(start, i)
        elif text[i] == "#":
            end = text.find("\n", i)
            i = n if end < 0 else end
            blank(start, i)
        elif text[i] == "@" and i + 1 < n and text[i + 1] in "\"'" and re.match(r"@[\"'][ \t]*\r?\n", text[i:]):
            quote = text[i + 1]
            end = re.search(r"(?m)^" + re.escape(quote) + r"@", text[i + 2:])
            i = n if end is None else i + 2 + end.end()
            blank(start, i)
        elif text[i] in "\"'":
            quote = text[i]
            i += 1
            while i < n:
                if quote == '"' and text[i] == "`":
                    i += 2
                elif text[i] == quote:
                    if i + 1 < n and text[i + 1] == quote:
                        i += 2
                    else:
                        i += 1
                        break
                else:
                    i += 1
            i = min(i, n)
            blank(start, i)
        elif text[i] == "`":
            # Backtick continuation is whitespace to the pattern scanner.
            i += 1
            if i < n and text[i] == "\r":
                i += 1
            if i < n:
                i += 1
            blank(start, i)
        else:
            i += 1
    return "".join(out)


def _decode(raw: bytes) -> str:
    try:
        if raw.startswith((b"\xff\xfe", b"\xfe\xff")):
            return raw.decode("utf-16")
        return raw.decode("utf-8-sig")
    except UnicodeError as exc:
        raise LearningError("Script encoding is not UTF-8 or BOM-marked UTF-16; cannot inspect faithfully") from exc


def check_tree(root, *, files=None, registry=None, windows_release: bool = False) -> dict:
    """Check the exact in-scope files without running scripts or changing inputs.

    Passing a manifest binds findings to those bytes. Always recheck cheap static
    rules; a prior report never grants approval to changed source or rules.
    """
    from jh_integrity import snapshot, _path, _root, IntegrityError

    root = _root(root)
    if type(windows_release) is not bool:
        raise LearningError("windows_release must be a boolean")
    registry_path = Path(registry) if registry is not None else DEFAULT_REGISTRY
    lessons = load_registry(registry_path)
    registry_sha256 = _digest(_json_bytes(lessons))
    if files is None:
        files = snapshot(root)["files"]
    if not isinstance(files, dict):
        raise LearningError("files must be a manifest file mapping")
    for name in files:
        _path(name)
    # The standard package root is the folder containing the single launch file.
    auto_windows = any(name.casefold() == "실행.cmd" for name in files)
    windows = windows_release or auto_windows
    findings = []
    checked_files = []
    checked_rules = set()
    lesson_map = {c: [e["id"] for e in lessons["lessons"] if c in e["checks"]] for c in CHECKS}

    def finding(check_id, name, line, message):
        findings.append({"check_id": check_id, "path": name, "line": line,
                         "message": message, "lesson_ids": lesson_map[check_id]})

    if windows:
        checked_rules.update({"WINDOWS_ENTRYPOINT", "CMD_ENCODING"})
        if not auto_windows:
            finding("WINDOWS_ENTRYPOINT", "실행.cmd", 1, "Windows delivery needs 실행.cmd at the package root")
    for name, expected in sorted(files.items()):
        suffix = Path(name).suffix.casefold()
        if suffix not in {".ps1", ".psm1"} and not (windows and name.casefold() == "실행.cmd"):
            continue
        path = root.joinpath(*name.split("/"))
        if path.is_symlink() or not path.is_file() or not path.resolve().is_relative_to(root):
            raise LearningError(f"Script must be an in-scope regular file: {name}")
        if path.stat().st_size > MAX_SCRIPT_BYTES:
            raise LearningError(f"Script is too large for the preflight: {name}")
        raw = path.read_bytes()
        if len(raw) > MAX_SCRIPT_BYTES:
            raise LearningError(f"Script is too large for the preflight: {name}")
        if expected != {"sha256": _digest(raw), "size": len(raw)}:
            raise IntegrityError(f"Source changed before development preflight: {name}")
        checked_files.append(name)
        if suffix not in {".ps1", ".psm1"}:
            # No CMD execution or command interpretation occurs here.
            if any(b > 127 for b in raw) or b"\n" in raw.replace(b"\r\n", b"") or b"\r" in raw.replace(b"\r\n", b""):
                finding("CMD_ENCODING", name, 1, "Use ASCII and CRLF for the Windows launch file")
            continue
        text = _decode(raw)
        code = _code_only(text)
        checked_rules.update({"PS_ALIAS_COLLISION", "PS_AUTOMATIC_VARIABLE"})
        for match in _FUNCTION.finditer(code):
            helper = match.group(1)
            if helper.casefold() in KNOWN_ALIASES:
                finding("PS_ALIAS_COLLISION", name, text.count("\n", 0, match.start()) + 1,
                        f"Function {helper} collides with {KNOWN_ALIASES[helper.casefold()]}; use a JH-prefixed name")
        for match in _MUTATION.finditer(code):
            finding("PS_AUTOMATIC_VARIABLE", name, text.count("\n", 0, match.start()) + 1,
                    "Do not use a protected automatic variable as mutable application state")
        if windows:
            checked_rules.add("PS_ENCODING")
            if any(ord(c) > 127 for c in text) and not raw.startswith((b"\xef\xbb\xbf", b"\xff\xfe", b"\xfe\xff")):
                finding("PS_ENCODING", name, 1, "Non-ASCII PowerShell for Windows 5.1 needs an explicit BOM")
    checker_sha256 = _digest(Path(__file__).read_bytes())
    inputs = {"files": files, "registry_sha256": registry_sha256,
              "checker_sha256": checker_sha256, "windows_release": windows}
    status = "failed" if findings else "passed" if checked_rules else "not_applicable"
    return {
        "schema": REPORT_SCHEMA, "ok": not findings, "status": status,
        "scope": "known_regression_preflight", "fingerprint": _digest(_json_bytes(inputs)),
        "registry_sha256": registry_sha256, "checker_sha256": checker_sha256,
        "checked_files": checked_files, "checks": sorted(checked_rules), "findings": findings,
        "powershell_syntax": "not_run", "windows_execution": "not_run",
        "limitations": ["Known literal patterns only; retain target-host AST/Get-Alias checks",
                        "No build, signing, installation, or device action was executed"],
    }


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    check = sub.add_parser("check", help="Read-only preflight before a build or package")
    check.add_argument("root")
    check.add_argument("--windows-release", action="store_true")
    check.add_argument("--registry")
    listing = sub.add_parser("list", help="Read the persistent evidence-backed lessons")
    listing.add_argument("--registry")
    record = sub.add_parser("record", help="Append a reviewed JSON lesson, never execute it")
    record.add_argument("--entry", required=True)
    record.add_argument("--registry", default=str(DEFAULT_REGISTRY))
    args = parser.parse_args(argv)
    try:
        if args.command == "check":
            result = check_tree(args.root, registry=args.registry, windows_release=args.windows_release)
        elif args.command == "list":
            result = {"ok": True, **load_registry(args.registry)}
        else:
            entry, _ = _read_json(Path(args.entry))
            result = record_lesson(entry, args.registry)
        print(json.dumps(result, ensure_ascii=False, sort_keys=True))
        return 0 if result.get("ok", True) else 1
    except (ValueError, OSError) as exc:
        print(json.dumps({"ok": False, "status": "blocked", "error": str(exc)}, ensure_ascii=False))
        return 2


if __name__ == "__main__":
    sys.exit(main())
