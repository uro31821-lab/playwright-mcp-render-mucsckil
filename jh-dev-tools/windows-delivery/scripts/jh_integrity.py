#!/usr/bin/env python3
"""Content manifests and defensive ZIP handling for JH source bundles.

Python 3.10+, standard library only. Manifests describe relative *files*, not
absolute source locations. Excluded directories are never traversed. A manifest
is an integrity baseline, not a signature or a substitute for secret review.
"""
from __future__ import annotations

import argparse
import fnmatch
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import sys
import tempfile
import unicodedata
import zipfile
import zlib


class IntegrityError(ValueError):
    """Invalid manifest, unsafe input, or a failed integrity operation."""


SCHEMA = "jh.integrity.manifest.v1"
DEFAULT_DIRECTORIES = tuple(sorted({
    ".git", ".venv", "venv", "node_modules", "build", "dist",
    "__pycache__", ".gradle", ".jh-dev", ".aws", ".ssh", ".gnupg",
    ".azure", ".kube", ".gcloud", ".credentials", "credentials",
    ".secrets", "secrets",
}))
DEFAULT_FILE_PATTERNS = tuple(sorted({
    ".env", ".env.*", "*.jks", "*.keystore", "*.pem", "*.key",
    "*.p12", "*.pfx", "credentials*.json", "service-account*.json",
    "service_account*.json", ".jh-integrity-tmp-*",
}))
CHUNK = 1024 * 1024
MAX_MANIFEST_BYTES = 32 * 1024 * 1024
DEFAULT_ZIP_LIMITS = {
    "max_members": 10000,
    "max_total_size": 512 * 1024 * 1024,
    "max_file_size": 128 * 1024 * 1024,
    "max_ratio": 200.0,
}
_WINDOWS_RESERVED = {"con", "prn", "aux", "nul"} | {
    f"{prefix}{number}" for prefix in ("com", "lpt") for number in range(1, 10)
}


def _path(value: object) -> str:
    """Validate a portable, strictly relative POSIX file/directory name."""
    if not isinstance(value, str) or not value:
        raise IntegrityError("Invalid relative path")
    try:
        if len(value.encode("utf-8")) > 4096:
            raise IntegrityError("Relative path is too long")
    except UnicodeError as exc:
        raise IntegrityError("Invalid Unicode in relative path") from exc
    if "\\" in value or ":" in value or value.startswith("/"):
        raise IntegrityError(f"Unsafe path: {value!r}")
    if any(ord(char) < 32 or ord(char) == 127 for char in value):
        raise IntegrityError(f"Control character in path: {value!r}")
    for part in value.split("/"):
        if part in ("", ".", "..") or part.endswith((".", " ")):
            raise IntegrityError(f"Unsafe path component: {value!r}")
        if part.split(".", 1)[0].casefold() in _WINDOWS_RESERVED:
            raise IntegrityError(f"Reserved path component: {value!r}")
    return value


def _key(value: str) -> str:
    return unicodedata.normalize("NFC", value).casefold()


def _register(nodes: dict, name: str, kind: str, *, explicit: bool = True) -> None:
    """Detect duplicate names, portable collisions and file/directory conflicts."""
    parts = name.split("/")
    for number in range(1, len(parts) + 1):
        current = "/".join(parts[:number])
        leaf = number == len(parts)
        current_kind = kind if leaf else "directory"
        is_explicit = explicit and leaf
        key = _key(current)
        previous = nodes.get(key)
        if previous:
            old_name, old_kind, old_explicit = previous
            if old_name != current:
                raise IntegrityError(f"Case/Unicode path collision: {old_name!r}, {current!r}")
            if old_kind != current_kind:
                raise IntegrityError(f"File/directory path collision: {current!r}")
            if old_explicit and is_explicit:
                raise IntegrityError(f"Duplicate path: {current!r}")
            is_explicit = is_explicit or old_explicit
        nodes[key] = (current, current_kind, is_explicit)


def _root(value) -> Path:
    result = Path(value).expanduser().absolute()
    if result.is_symlink() or not result.is_dir():
        raise IntegrityError(f"Source root must be a real directory: {result}")
    return result.resolve()


def _output(value) -> Path:
    result = Path(value).expanduser().absolute()
    if result.is_symlink():
        raise IntegrityError(f"Output must not be a symlink: {result}")
    return result.parent.resolve() / result.name


def _exists(value: Path) -> bool:
    return os.path.lexists(value)


def _check_output(value: Path, overwrite: bool) -> None:
    if _exists(value):
        if value.is_symlink() or not value.is_file():
            raise IntegrityError(f"Output is not a regular file: {value}")
        if not overwrite:
            raise IntegrityError(f"Output already exists (use --overwrite intentionally): {value}")


def _relative_if_inside(root: Path, value: Path) -> str | None:
    try:
        relative = value.relative_to(root).as_posix()
    except ValueError:
        return None
    return _path(relative)


def _policy(exclude_paths=(), *, exact: bool = False) -> dict:
    if isinstance(exclude_paths, (str, bytes)):
        raise IntegrityError("exclude_paths must be a sequence of relative paths")
    if type(exact) is not bool:
        raise IntegrityError("exact must be a boolean")
    return {
        "directories": [] if exact else list(DEFAULT_DIRECTORIES),
        "file_patterns": [] if exact else list(DEFAULT_FILE_PATTERNS),
        "paths": sorted({_path(value) for value in exclude_paths}),
    }


def _excluded(name: str, is_directory: bool, policy: dict) -> str | None:
    for excluded in policy["paths"]:
        if name == excluded or name.startswith(excluded + "/"):
            return "explicit_path"
    basename = name.rsplit("/", 1)[-1].casefold()
    # A linked Git worktree has a .git *file*, which is excluded as well.
    if basename in policy["directories"]:
        return "directory_rule"
    if any(fnmatch.fnmatchcase(basename, pattern) for pattern in policy["file_patterns"]):
        return "file_pattern"
    return None


def _walk(root: Path, policy: dict) -> tuple[list[tuple[str, Path]], list[dict]]:
    files: list[tuple[str, Path]] = []
    excluded: list[dict] = []
    nodes: dict = {}

    def visit(directory: Path, prefix: str = "") -> None:
        try:
            with os.scandir(directory) as iterator:
                entries = sorted(iterator, key=lambda entry: entry.name)
        except OSError as exc:
            raise IntegrityError(f"Cannot read directory: {directory}: {exc}") from exc
        for entry in entries:
            relative = prefix + entry.name
            _path(relative)
            is_dir = entry.is_dir(follow_symlinks=False)
            reason = _excluded(relative, is_dir, policy)
            if reason:
                excluded.append({"path": relative + ("/" if is_dir else ""), "reason": reason})
                continue
            if entry.is_symlink():
                raise IntegrityError(f"In-scope symlink is not allowed: {relative}")
            if is_dir:
                _register(nodes, relative, "directory")
                visit(Path(entry.path), relative + "/")
            elif entry.is_file(follow_symlinks=False):
                _register(nodes, relative, "file")
                files.append((relative, Path(entry.path)))
            else:
                raise IntegrityError(f"In-scope special file is not allowed: {relative}")

    visit(root)
    return sorted(files), sorted(excluded, key=lambda item: item["path"])


def _read_file(path: Path, destination=None) -> dict:
    flags = os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0)
    digest = hashlib.sha256()
    count = 0
    try:
        descriptor = os.open(path, flags)
        with os.fdopen(descriptor, "rb") as stream:
            before = os.fstat(stream.fileno())
            if not stat.S_ISREG(before.st_mode):
                raise IntegrityError(f"Not a regular file: {path}")
            while chunk := stream.read(CHUNK):
                digest.update(chunk)
                count += len(chunk)
                if destination is not None:
                    destination.write(chunk)
            after = os.fstat(stream.fileno())
        current = path.lstat()
        identity = lambda info: (info.st_dev, info.st_ino, info.st_size,
                                 info.st_mtime_ns, info.st_ctime_ns)
        if identity(before) != identity(after) or identity(after) != identity(current):
            raise IntegrityError(f"File changed while being read: {path}")
        if count != before.st_size:
            raise IntegrityError(f"File size changed while being read: {path}")
    except OSError as exc:
        raise IntegrityError(f"Cannot read file: {path}: {exc}") from exc
    return {"sha256": digest.hexdigest(), "size": count}


def _temporary(output: Path) -> tuple[int, Path]:
    output.parent.mkdir(parents=True, exist_ok=True)
    descriptor, name = tempfile.mkstemp(prefix=".jh-integrity-tmp-", dir=output.parent)
    return descriptor, Path(name)


def _publish(temporary: Path, output: Path, overwrite: bool) -> None:
    _check_output(output, overwrite)
    if overwrite:
        os.replace(temporary, output)
    else:
        # link() is an atomic no-clobber publication, including a concurrent writer.
        try:
            os.link(temporary, output)
        except FileExistsError as exc:
            raise IntegrityError(f"Output already exists: {output}") from exc
        temporary.unlink()


def _write_json(value: dict, output: Path, overwrite: bool) -> None:
    _check_output(output, overwrite)
    descriptor, temporary = _temporary(output)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as stream:
            json.dump(value, stream, ensure_ascii=False, sort_keys=True, indent=2)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        _publish(temporary, output, overwrite)
    finally:
        temporary.unlink(missing_ok=True)


def snapshot(root, output=None, *, overwrite: bool = False, exclude_paths=(),
             exact: bool = False) -> dict:
    """Hash files and optionally atomically write a JSON manifest.

    Default source-safe scope omits build output and common credentials. exact=True
    includes every regular file for immutable, pinned reference/cache trees. Both
    modes reject unsafe paths and symlinks and record explicit exclusions.
    """
    root = _root(root)
    paths = list(exclude_paths) if not isinstance(exclude_paths, (str, bytes)) else exclude_paths
    target = _output(output) if output is not None else None
    if target:
        _check_output(target, overwrite)
        own_path = _relative_if_inside(root, target)
        if own_path:
            if isinstance(paths, (str, bytes)):
                raise IntegrityError("exclude_paths must be a sequence")
            paths.append(own_path)
    policy = _policy(paths, exact=exact)
    entries, excluded = _walk(root, policy)
    files = {name: _read_file(path) for name, path in entries}
    manifest = {
        "schema": SCHEMA,
        "algorithm": "sha256",
        "exclusions": policy,
        "excluded": excluded,
        "files": files,
        "file_count": len(files),
        "total_bytes": sum(item["size"] for item in files.values()),
    }
    if target:
        _write_json(manifest, target, overwrite)
    return manifest


def _load_manifest(value) -> dict:
    if isinstance(value, (str, os.PathLike)):
        path = Path(value)
        try:
            if path.stat().st_size > MAX_MANIFEST_BYTES:
                raise IntegrityError("Manifest is too large")
            raw = path.read_bytes()
            if len(raw) > MAX_MANIFEST_BYTES:
                raise IntegrityError("Manifest is too large")
            def unique_pairs(pairs):
                result = {}
                for key, item in pairs:
                    if key in result:
                        raise IntegrityError(f"Duplicate JSON key: {key!r}")
                    result[key] = item
                return result
            value = json.loads(raw, object_pairs_hook=unique_pairs)
        except (OSError, UnicodeError, json.JSONDecodeError) as exc:
            raise IntegrityError(f"Cannot read manifest: {exc}") from exc
    if not isinstance(value, dict) or value.get("schema") != SCHEMA or value.get("algorithm") != "sha256":
        raise IntegrityError("Unsupported manifest schema or algorithm")
    policy = value.get("exclusions")
    if not isinstance(policy, dict) or set(policy) != {"directories", "file_patterns", "paths"}:
        raise IntegrityError("Invalid exclusion policy")
    exact = policy["directories"] == [] and policy["file_patterns"] == []
    if not exact and (policy["directories"] != list(DEFAULT_DIRECTORIES) or policy["file_patterns"] != list(DEFAULT_FILE_PATTERNS)):
        raise IntegrityError("Manifest exclusion rules differ from the supported policy")
    if not isinstance(policy["paths"], list) or _policy(policy["paths"], exact=exact) != policy:
        raise IntegrityError("Invalid or duplicate excluded paths")
    files = value.get("files")
    if not isinstance(files, dict) or len(files) > 100000:
        raise IntegrityError("Invalid manifest file mapping")
    nodes: dict = {}
    for name, entry in files.items():
        _path(name)
        _register(nodes, name, "file")
        if not isinstance(entry, dict) or set(entry) != {"sha256", "size"}:
            raise IntegrityError(f"Invalid file record: {name}")
        digest = entry["sha256"]
        if not isinstance(digest, str) or len(digest) != 64 or any(char not in "0123456789abcdef" for char in digest):
            raise IntegrityError(f"Invalid SHA-256 digest: {name}")
        if type(entry["size"]) is not int or entry["size"] < 0:
            raise IntegrityError(f"Invalid file size: {name}")
        parts = name.split("/")
        if _excluded(name, False, policy) or any(
            _excluded("/".join(parts[:number]), True, policy)
            for number in range(1, len(parts))
        ):
            raise IntegrityError(f"Manifest includes an excluded file: {name}")
    if type(value.get("file_count")) is not int or value["file_count"] != len(files):
        raise IntegrityError("Manifest file_count does not match its files")
    if type(value.get("total_bytes")) is not int or value["total_bytes"] != sum(item["size"] for item in files.values()):
        raise IntegrityError("Manifest total_bytes does not match its files")
    observed = value.get("excluded")
    if not isinstance(observed, list):
        raise IntegrityError("Invalid observed exclusion list")
    for entry in observed:
        if not isinstance(entry, dict) or set(entry) != {"path", "reason"}:
            raise IntegrityError("Invalid observed exclusion record")
        name = entry["path"]
        if not isinstance(name, str):
            raise IntegrityError("Invalid observed exclusion path")
        _path(name[:-1] if name.endswith("/") else name)
        if entry["reason"] not in {"explicit_path", "directory_rule", "file_pattern"}:
            raise IntegrityError("Invalid exclusion reason")
    return value


def verify(root, manifest) -> dict:
    """Compare current contents with a validated manifest; never trust mtimes."""
    baseline = _load_manifest(manifest)
    policy = baseline["exclusions"]
    current = snapshot(root, exclude_paths=policy["paths"],
                       exact=policy["directories"] == [] and policy["file_patterns"] == [])
    expected, actual = baseline["files"], current["files"]
    missing = sorted(expected.keys() - actual.keys())
    added = sorted(actual.keys() - expected.keys())
    modified = sorted(name for name in expected.keys() & actual.keys() if expected[name] != actual[name])
    return {
        "ok": not (missing or added or modified),
        "missing": missing, "added": added, "modified": modified,
        "checked_files": len(actual),
        "expected_files": len(expected),
    }


def compare(a, b) -> dict:
    """Compare two validated manifests; added/removed are relative to A."""
    left, right = _load_manifest(a), _load_manifest(b)
    first, second = left["files"], right["files"]
    added = sorted(second.keys() - first.keys())
    removed = sorted(first.keys() - second.keys())
    modified = sorted(name for name in first.keys() & second.keys() if first[name] != second[name])
    policy_equal = left["exclusions"] == right["exclusions"]
    return {"ok": not (added or removed or modified) and policy_equal,
            "added": added, "removed": removed, "modified": modified,
            "policy_equal": policy_equal,
            "unchanged_count": len(first.keys() & second.keys()) - len(modified)}


compare_manifests = compare


def _limits(overrides: dict) -> dict:
    if set(overrides) - set(DEFAULT_ZIP_LIMITS):
        raise IntegrityError("Unknown ZIP limit")
    result = {**DEFAULT_ZIP_LIMITS, **overrides}
    for name, value in result.items():
        if type(value) not in (int, float) or value <= 0 or value == float("inf") or value != value:
            raise IntegrityError(f"Invalid ZIP limit: {name}")
        if name != "max_ratio" and type(value) is not int:
            raise IntegrityError(f"ZIP count/size limit must be an integer: {name}")
    return result


def _zip_plan(archive: zipfile.ZipFile, limits: dict) -> list[tuple[zipfile.ZipInfo, str, str]]:
    members = archive.infolist()
    if len(members) > limits["max_members"]:
        raise IntegrityError("ZIP member count exceeds limit")
    nodes: dict = {}
    total = 0
    plan = []
    for member in members:
        if member.orig_filename != member.filename or "\x00" in member.orig_filename:
            raise IntegrityError("ZIP contains a NUL-truncated name")
        is_directory = member.is_dir()
        name = _path(member.filename[:-1] if is_directory else member.filename)
        kind = "directory" if is_directory else "file"
        mode = member.external_attr >> 16
        file_type = stat.S_IFMT(mode)
        if file_type not in (0, stat.S_IFREG, stat.S_IFDIR):
            raise IntegrityError(f"ZIP contains symlink or special file: {name}")
        if (file_type == stat.S_IFDIR and not is_directory) or (file_type == stat.S_IFREG and is_directory):
            raise IntegrityError(f"ZIP file type disagrees with its path: {name}")
        if member.flag_bits & 1:
            raise IntegrityError(f"Encrypted ZIP member cannot be verified: {name}")
        if member.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
            raise IntegrityError(f"Unsupported ZIP compression: {name}")
        if member.file_size < 0 or member.compress_size < 0:
            raise IntegrityError(f"Invalid ZIP member size: {name}")
        if is_directory and member.file_size:
            raise IntegrityError(f"ZIP directory contains file data: {name}")
        if member.file_size > limits["max_file_size"]:
            raise IntegrityError(f"ZIP member exceeds size limit: {name}")
        total += member.file_size
        if total > limits["max_total_size"]:
            raise IntegrityError("ZIP total uncompressed size exceeds limit")
        if member.file_size and (not member.compress_size or member.file_size / member.compress_size > limits["max_ratio"]):
            raise IntegrityError(f"ZIP compression ratio exceeds limit: {name}")
        _register(nodes, name, kind)
        plan.append((member, name, kind))
    return plan


def _read_member(archive: zipfile.ZipFile, member, limit: int, destination=None) -> dict:
    digest = hashlib.sha256()
    size = 0
    # Reading through EOF makes zipfile check each member's CRC, not just headers.
    with archive.open(member, "r") as stream:
        while chunk := stream.read(min(CHUNK, limit + 1)):
            size += len(chunk)
            if size > limit or size > member.file_size:
                raise IntegrityError(f"ZIP member expanded beyond its limit: {member.filename}")
            digest.update(chunk)
            if destination is not None:
                destination.write(chunk)
    if size != member.file_size:
        raise IntegrityError(f"ZIP member size mismatch: {member.filename}")
    return {"size": size, "sha256": digest.hexdigest()}


def _inspect_open(archive: zipfile.ZipFile, limits: dict) -> tuple[dict, list]:
    plan = _zip_plan(archive, limits)
    members = []
    for member, name, kind in plan:
        data = _read_member(archive, member, limits["max_file_size"])
        members.append({"path": name, "type": kind, **data,
                        "compressed_size": member.compress_size})
    return {
        "ok": True, "schema": "jh.integrity.zip-inspection.v1",
        "file_count": sum(item["type"] == "file" for item in members),
        "directory_count": sum(item["type"] == "directory" for item in members),
        "total_bytes": sum(item["size"] for item in members),
        "members": members, "limits": limits,
    }, plan


def inspect_zip(path, **limit_overrides) -> dict:
    """Inspect every entry and fully verify CRC/SHA-256 without extracting."""
    limits = _limits(limit_overrides)
    try:
        with zipfile.ZipFile(path, "r") as archive:
            report, _ = _inspect_open(archive, limits)
        return report
    except (OSError, zipfile.BadZipFile, NotImplementedError, RuntimeError, EOFError, zlib.error) as exc:
        raise IntegrityError(f"Cannot safely inspect ZIP: {exc}") from exc


def extract_zip(path, dest, **limit_overrides) -> dict:
    """Fully inspect first, then extract regular files to an exclusively new dir.

    Each file is published atomically. The new destination directory is visible
    during extraction and removed on failure; pre-existing destinations are never
    reused or overwritten. Source member data is rechecked while writing.
    """
    limits = _limits(limit_overrides)
    destination = _output(dest)
    if _exists(destination):
        raise IntegrityError(f"Extraction destination must be new: {destination}")
    created = False
    try:
        with zipfile.ZipFile(path, "r") as archive:
            report, plan = _inspect_open(archive, limits)
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.mkdir(mode=0o700)  # mkdir is an exclusive reservation.
            created = True
            baseline = {item["path"]: item for item in report["members"]}
            for member, name, kind in plan:
                target = destination.joinpath(*name.split("/"))
                if kind == "directory":
                    target.mkdir(parents=True, exist_ok=True)
                    continue
                descriptor, temporary = _temporary(target)
                try:
                    with os.fdopen(descriptor, "wb") as stream:
                        observed = _read_member(archive, member, limits["max_file_size"], stream)
                        stream.flush()
                        os.fsync(stream.fileno())
                    if any(observed[key] != baseline[name][key] for key in ("size", "sha256")):
                        raise IntegrityError(f"ZIP changed during extraction: {name}")
                    _publish(temporary, target, False)
                finally:
                    temporary.unlink(missing_ok=True)
        return {**report, "destination": str(destination)}
    except (IntegrityError, OSError, zipfile.BadZipFile, NotImplementedError, RuntimeError, EOFError, zlib.error) as exc:
        if created:
            shutil.rmtree(destination, ignore_errors=True)
        if isinstance(exc, IntegrityError):
            raise
        raise IntegrityError(f"Cannot safely extract ZIP: {exc}") from exc


def package(root, output, *, overwrite: bool = False, windows_release: bool = False,
            windows_apk_profile: str | None = None) -> dict:
    """Create a filtered ZIP after the known-regression gate, plus its manifest.

    A root 실행.cmd enables Windows delivery checks automatically. Explicit
    windows_release also catches a missing entrypoint. Ordinary source bundles
    retain their existing scope; any bundled PowerShell still gets known-error
    checks. A windows_apk_profile ID additionally requires Windows checks and an
    exact match to the independently reviewed required files in the fixed skill
    registry. This does not certify PowerShell syntax or Windows/device execution.
    Existing package pairs are immutable: a new candidate needs a new filename.
    The legacy overwrite flag is accepted only when neither output exists.
    """
    root = _root(root)
    target = _output(output)
    sidecar = target.with_name(target.name + ".manifest.json")
    if overwrite and (_exists(target) or _exists(sidecar)):
        raise IntegrityError("Existing ZIP/manifest must be preserved; use a new output filename")
    _check_output(target, False)
    _check_output(sidecar, False)
    exclusions = [name for path in (target, sidecar)
                  if (name := _relative_if_inside(root, path))]
    manifest = snapshot(root, exclude_paths=exclusions)
    try:
        from jh_learning import check_tree
        preflight = check_tree(root, files=manifest["files"],
                               windows_release=windows_release or windows_apk_profile is not None)
    except (ImportError, OSError, ValueError) as exc:
        raise IntegrityError(f"Development preflight unavailable: {exc}") from exc
    if not preflight["ok"]:
        raise IntegrityError("Development preflight rejected package: " +
                             json.dumps(preflight, ensure_ascii=False, sort_keys=True))
    manifest["development_preflight"] = preflight
    delivery_contract = None
    if windows_apk_profile is not None:
        try:
            from jh_windows_delivery import check_delivery
            delivery_contract = check_delivery(manifest["files"], windows_apk_profile)
        except (ImportError, OSError, ValueError) as exc:
            raise IntegrityError(f"Windows APK delivery contract rejected package: {exc}") from exc
        manifest["delivery_contract"] = delivery_contract
    descriptor, temporary = _temporary(target)
    os.close(descriptor)
    published = False
    try:
        with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            for name, expected in manifest["files"].items():
                info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
                info.create_system = 3
                info.external_attr = (stat.S_IFREG | 0o644) << 16
                info.compress_type = zipfile.ZIP_DEFLATED
                # The snapshot supplies the size; small Windows bundles need no ZIP64 header.
                info.file_size = expected["size"]
                with archive.open(info, "w") as stream:
                    observed = _read_file(root.joinpath(*name.split("/")), stream)
                if observed != expected:
                    raise IntegrityError(f"Source changed during packaging: {name}")
        # Detect files added/removed during packaging as well as content changes.
        result = verify(root, manifest)
        if not result["ok"]:
            raise IntegrityError(f"Source changed during packaging: {json.dumps(result, ensure_ascii=False)}")
        inspect_zip(temporary)
        with temporary.open("rb") as stream:
            os.fsync(stream.fileno())
        zip_digest = _read_file(temporary)["sha256"]
        _publish(temporary, target, False)
        published = True
        _write_json(manifest, sidecar, False)
        return {"ok": True, "zip": str(target), "manifest": str(sidecar),
                "zip_sha256": zip_digest, "file_count": manifest["file_count"],
                "total_bytes": manifest["total_bytes"], "development_preflight": preflight,
                **({"delivery_contract": delivery_contract} if delivery_contract is not None else {})}
    except Exception:
        # A failed sidecar publication must not leave a new, incomplete bundle.
        if published:
            target.unlink(missing_ok=True)
        raise
    finally:
        temporary.unlink(missing_ok=True)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    snap = sub.add_parser("snapshot")
    snap.add_argument("root")
    snap.add_argument("--output", required=True)
    snap.add_argument("--overwrite", action="store_true")
    snap.add_argument("--exact", action="store_true",
                      help="Include all regular files, including source-safe exclusions; for pinned reference trees")
    check = sub.add_parser("verify")
    check.add_argument("root")
    check.add_argument("--manifest", required=True)
    cmp = sub.add_parser("compare")
    cmp.add_argument("a")
    cmp.add_argument("b")
    for name in ("zip-inspect", "zip-extract"):
        command = sub.add_parser(name)
        command.add_argument("zip")
        if name == "zip-extract":
            command.add_argument("--dest", required=True)
        for option in DEFAULT_ZIP_LIMITS:
            command.add_argument("--" + option.replace("_", "-"),
                                 type=float if option == "max_ratio" else int)
    pack = sub.add_parser("package")
    pack.add_argument("root")
    pack.add_argument("--output", required=True)
    pack.add_argument("--overwrite", action="store_true",
                      help="Legacy flag; existing ZIP/manifest pairs are immutable, use a new output filename")
    pack.add_argument("--windows-release", action="store_true",
                      help="Require the standard Windows launch file and known-regression preflight")
    pack.add_argument("--windows-apk-profile", metavar="ID",
                      help="Require Windows checks and pinned delivery files from a reviewed fixed-registry profile")
    args = parser.parse_args(argv)
    try:
        if args.command == "snapshot":
            result = snapshot(args.root, args.output, overwrite=args.overwrite, exact=args.exact)
        elif args.command == "verify":
            result = verify(args.root, args.manifest)
        elif args.command == "compare":
            result = compare(args.a, args.b)
        elif args.command == "package":
            result = package(args.root, args.output, overwrite=args.overwrite,
                             windows_release=args.windows_release,
                             windows_apk_profile=args.windows_apk_profile)
        else:
            limits = {key: getattr(args, key) for key in DEFAULT_ZIP_LIMITS
                      if getattr(args, key) is not None}
            result = (inspect_zip(args.zip, **limits) if args.command == "zip-inspect"
                      else extract_zip(args.zip, args.dest, **limits))
        print(json.dumps(result, ensure_ascii=False, sort_keys=True))
        return 0 if result.get("ok", True) else 1
    except (IntegrityError, OSError, ValueError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
        return 2


if __name__ == "__main__":
    sys.exit(main())
