#!/usr/bin/env python3
"""Assemble verified Windows delivery inputs; the JH release gate makes the ZIP.

Python 3.10+, standard library only. Run after the standalone JS build:
    python windows/prepare-assets.py --output /path/to/empty-delivery

An optional --downloads directory reuses only checksum-verified downloads.
Google's repository metadata is fetched anew for every assembly. There is no
fallback to an older, preview, alternate-host, or unverified binary.
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import sys
import tempfile
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
import xml.etree.ElementTree as ET
import zipfile


AUTOJS_VERSION = "6.8.0"
AUTOJS_APP_ID = "org.autojs.autojs6"
AUTOJS_COMMIT = "b7c88e117d70176058ae0c035194a7c188ffb8c2"
AUTOJS_APK_URL = (
    "https://github.com/SuperMonster003/AutoJs6/releases/download/v6.8.0/"
    "autojs6-v6.8.0-universal-98abef1b.apk"
)
AUTOJS_APK_SIZE = 37708838
AUTOJS_APK_SHA256 = "3a1415cb4f09123b7ed4911dd536280300ac722a97938d89043e48a7340a86fc"
AUTOJS_LICENSE_URL = (
    f"https://raw.githubusercontent.com/SuperMonster003/AutoJs6/{AUTOJS_COMMIT}/LICENSE"
)
# Verified against the upstream LICENSE blob at the pinned source commit.
AUTOJS_LICENSE_SIZE = 16725
AUTOJS_LICENSE_SHA256 = "1f256ecad192880510e84ad60474eab7589218784b9a50bc7ceee34c2b91f1d5"
REPOSITORY_URL = "https://dl.google.com/android/repository/repository2-1.xml"
GOOGLE_BASE_URL = "https://dl.google.com/android/repository/"
WINDOWS_INPUTS = (
    "RUN.ps1",
    "실행.cmd",
    "Confirm-Result.ps1",
    "00-START.txt",
    "POWER_SHELL_ERROR_CHECKLIST.txt",
    "THIRD_PARTY_NOTICES.txt",
)
REQUIRED_ADB_FILES = {
    "adb.exe": "adb.exe",
    "adbwinapi.dll": "AdbWinApi.dll",
    "adbwinusbapi.dll": "AdbWinUsbApi.dll",
    "notice.txt": "NOTICE.txt",
    "source.properties": "source.properties",
}
MAX_XML_BYTES = 16 * 1024 * 1024
MAX_ARCHIVE_BYTES = 256 * 1024 * 1024
MAX_EXTRACTED_BYTES = 256 * 1024 * 1024
MAX_MEMBER_BYTES = 64 * 1024 * 1024
GITHUB_RELEASE_HOSTS = frozenset({
    "github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com"
})
CHECKSUM_LENGTHS = {"sha1": 40, "sha256": 64}


class PreparationError(Exception):
    """An input or verified-source contract was not met."""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def require_regular_file(path: Path) -> None:
    if path.is_symlink() or not path.is_file():
        raise PreparationError(f"Required regular file is missing or is a symlink: {path}")


def hash_file(path: Path, algorithm: str = "sha256") -> str:
    require_regular_file(path)
    digest = hashlib.new(algorithm)
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def verify_file(path: Path, size: int, algorithm: str, expected: str) -> str:
    """Verify authoritative size/checksum and return an additional SHA-256."""
    require_regular_file(path)
    if algorithm not in CHECKSUM_LENGTHS:
        raise PreparationError(f"Unsupported checksum algorithm: {algorithm}")
    if not re.fullmatch(rf"[0-9a-fA-F]{{{CHECKSUM_LENGTHS[algorithm]}}}", expected):
        raise PreparationError("Invalid expected checksum")
    if size <= 0 or path.stat().st_size != size:
        raise PreparationError(f"Size mismatch for {path.name}; expected {size} bytes")
    actual = hash_file(path, algorithm)
    if not hmac.compare_digest(actual, expected.lower()):
        raise PreparationError(f"{algorithm.upper()} mismatch for {path.name}")
    return actual if algorithm == "sha256" else hash_file(path, "sha256")


def validate_https_url(url: str, allowed_hosts: frozenset[str]) -> None:
    parsed = urlsplit(url)
    try:
        port = parsed.port
    except ValueError as error:
        raise PreparationError("Invalid download port") from error
    if (
        parsed.scheme != "https"
        or parsed.hostname not in allowed_hosts
        or port not in (None, 443)
        or parsed.username is not None
        or parsed.password is not None
        or parsed.fragment
    ):
        raise PreparationError("Download URL must use an explicitly allowed HTTPS host")


class RestrictedRedirects(HTTPRedirectHandler):
    def __init__(self, allowed_hosts: frozenset[str]):
        super().__init__()
        self.allowed_hosts = allowed_hosts

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_https_url(newurl, self.allowed_hosts)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def download_file(
    url: str,
    target: Path,
    allowed_hosts: frozenset[str],
    *,
    max_bytes: int,
    size: int | None = None,
    algorithm: str | None = None,
    checksum: str | None = None,
) -> dict:
    """Fetch a fresh file atomically; never overwrite a cache entry."""
    validate_https_url(url, allowed_hosts)
    if target.exists() or target.is_symlink():
        raise PreparationError(f"Download destination already exists: {target}")
    target.parent.mkdir(parents=True, exist_ok=True)
    opener = build_opener(RestrictedRedirects(allowed_hosts))
    request = Request(url, headers={"User-Agent": "JebiseoLab-AssetPreparer/1.0"})
    fd, temporary_name = tempfile.mkstemp(prefix=".download-", dir=target.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(fd, "wb") as stream:
            try:
                with opener.open(request, timeout=30) as response:
                    validate_https_url(response.geturl(), allowed_hosts)
                    if response.status != 200:
                        raise PreparationError(f"Unexpected HTTP status: {response.status}")
                    declared = response.headers.get("Content-Length")
                    if declared is not None:
                        try:
                            declared_size = int(declared)
                        except ValueError as error:
                            raise PreparationError("Invalid HTTP Content-Length") from error
                        if declared_size < 0 or declared_size > max_bytes:
                            raise PreparationError("Download exceeds its allowed size")
                        if size is not None and declared_size != size:
                            raise PreparationError("HTTP Content-Length differs from expected size")
                    count = 0
                    while True:
                        block = response.read(1024 * 1024)
                        if not block:
                            break
                        count += len(block)
                        if count > max_bytes or (size is not None and count > size):
                            raise PreparationError("Download exceeds its allowed size")
                        stream.write(block)
            except HTTPError as error:
                raise PreparationError(f"HTTP {error.code} downloading {url}") from error
            except URLError as error:
                raise PreparationError(f"HTTPS download failed for {urlsplit(url).hostname}") from error
        if not temporary.stat().st_size:
            raise PreparationError("Downloaded an empty file")
        if size is not None:
            if algorithm is None or checksum is None:
                raise PreparationError("Expected size requires a checksum")
            sha256 = verify_file(temporary, size, algorithm, checksum)
        else:
            sha256 = hash_file(temporary)
        # link() is deliberately no-clobber, including when another process
        # creates the destination while the download is in progress.
        os.link(temporary, target)
        return {
            "sourceUrl": url,
            "acquisition": "downloaded",
            "verifiedAt": utc_now(),
            "size": temporary.stat().st_size,
            "sha256": sha256,
            "checksumAlgorithm": algorithm,
            "expectedChecksum": checksum,
        }
    finally:
        temporary.unlink(missing_ok=True)


def acquire_verified(
    url: str, cache: Path, name: str, allowed_hosts: frozenset[str],
    size: int, algorithm: str, checksum: str,
) -> tuple[Path, dict]:
    target = cache / name
    if target.exists() or target.is_symlink():
        sha256 = verify_file(target, size, algorithm, checksum)
        evidence = {
            "sourceUrl": url,
            "acquisition": "verified-cache",
            "verifiedAt": utc_now(),
            "size": size,
            "sha256": sha256,
            "checksumAlgorithm": algorithm,
            "expectedChecksum": checksum,
        }
    else:
        evidence = download_file(
            url, target, allowed_hosts, max_bytes=size,
            size=size, algorithm=algorithm, checksum=checksum,
        )
    return target, evidence


def local_name(element: ET.Element) -> str:
    return element.tag.rsplit("}", 1)[-1]


def children(element: ET.Element, name: str) -> list[ET.Element]:
    return [child for child in element if local_name(child) == name]


def one(element: ET.Element, name: str, *, optional: bool = False) -> ET.Element | None:
    found = children(element, name)
    if len(found) != 1:
        if optional and not found:
            return None
        raise PreparationError(f"Repository metadata must contain exactly one {name}")
    return found[0]


def text_of(element: ET.Element | None) -> str:
    return "" if element is None else "".join(element.itertext()).strip()


def revision_of(package: ET.Element) -> tuple[int, int, int]:
    revision = one(package, "revision")
    parts = []
    for name in ("major", "minor", "micro"):
        value = text_of(one(revision, name, optional=name != "major")) or "0"
        if not re.fullmatch(r"[0-9]+", value):
            raise PreparationError("Invalid platform-tools revision")
        parts.append(int(value))
    preview = one(revision, "preview", optional=True)
    if preview is not None and text_of(preview) != "0":
        raise PreparationError("Stable platform-tools metadata contains a preview revision")
    if parts[0] <= 0:
        raise PreparationError("Invalid platform-tools major version")
    return tuple(parts)


def select_platform_tools(xml_bytes: bytes) -> dict:
    """Select the newest explicitly stable Windows package, failing closed."""
    if not xml_bytes or len(xml_bytes) > MAX_XML_BYTES:
        raise PreparationError("Repository XML is empty or too large")
    if re.search(br"<!\s*(?:DOCTYPE|ENTITY)\b", xml_bytes, re.IGNORECASE):
        raise PreparationError("Repository XML must not define a DTD or entities")
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError as error:
        raise PreparationError("Invalid repository XML") from error
    stable = []
    for package in root.iter():
        if local_name(package) != "remotePackage" or package.get("path") != "platform-tools":
            continue
        channel = one(package, "channelRef", optional=True)
        if channel is None or channel.get("ref") != "channel-0":
            continue
        if package.get("obsolete", "false").lower() == "true":
            continue
        stable.append((revision_of(package), package))
    if not stable:
        raise PreparationError("No explicitly stable (channel-0) platform-tools package")
    newest = max(revision for revision, _ in stable)
    chosen = [package for revision, package in stable if revision == newest]
    if len(chosen) != 1:
        raise PreparationError("Ambiguous latest stable platform-tools package")
    package = chosen[0]
    version = ".".join(map(str, newest))
    archives = one(package, "archives")
    windows = [archive for archive in children(archives, "archive")
               if text_of(one(archive, "host-os", optional=True)) == "windows"]
    if len(windows) != 1:
        raise PreparationError("Latest stable package must have exactly one Windows archive")
    complete = one(windows[0], "complete")
    size_text = text_of(one(complete, "size"))
    if not re.fullmatch(r"[0-9]+", size_text):
        raise PreparationError("Invalid platform-tools archive size")
    size = int(size_text)
    if not 0 < size <= MAX_ARCHIVE_BYTES:
        raise PreparationError("Invalid platform-tools archive size")
    checksum_element = one(complete, "checksum")
    algorithm = checksum_element.get("type", "").lower()
    checksum = text_of(checksum_element).lower()
    if algorithm not in CHECKSUM_LENGTHS or not re.fullmatch(
        rf"[0-9a-f]{{{CHECKSUM_LENGTHS.get(algorithm, 0)}}}", checksum
    ):
        raise PreparationError("Missing or unsupported official archive checksum")
    url = urljoin(GOOGLE_BASE_URL, text_of(one(complete, "url")))
    validate_https_url(url, frozenset({"dl.google.com"}))
    parsed = urlsplit(url)
    expected_path = f"/android/repository/platform-tools_r{version}-win.zip"
    if parsed.path != expected_path or parsed.query:
        raise PreparationError("Archive URL does not name the selected stable Windows version")
    license_ref = one(package, "uses-license").get("ref")
    licenses = [element for element in root.iter()
                if local_name(element) == "license" and element.get("id") == license_ref]
    if not license_ref or len(licenses) != 1:
        raise PreparationError("Selected platform-tools license is missing or ambiguous")
    license_text = "".join(licenses[0].itertext())
    if not license_text.strip():
        raise PreparationError("Selected platform-tools license is empty")
    return {
        "version": version, "channel": "channel-0", "hostOs": "windows",
        "url": url, "size": size, "checksumAlgorithm": algorithm,
        "checksum": checksum, "licenseId": license_ref, "licenseText": license_text,
    }


def safe_member_path(member: zipfile.ZipInfo) -> PurePosixPath:
    name = member.filename
    if not name or "\\" in name or "\x00" in name or name.startswith("/"):
        raise PreparationError("Unsafe path in platform-tools archive")
    raw_parts = name.rstrip("/").split("/")
    reserved = re.compile(r"(?i)^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)")
    for part in raw_parts:
        if (
            part in ("", ".", "..") or part.endswith((".", " "))
            or re.search(r'[<>:"|?*\x00-\x1f]', part) or reserved.match(part)
        ):
            raise PreparationError("Unsafe Windows path in platform-tools archive")
    if raw_parts[0] != "platform-tools":
        raise PreparationError("Archive entry is outside the platform-tools directory")
    mode = member.external_attr >> 16
    kind = stat.S_IFMT(mode)
    if kind not in (0, stat.S_IFREG, stat.S_IFDIR) or member.flag_bits & 1:
        raise PreparationError("Archive contains a symlink, special file, or encrypted member")
    if member.file_size < 0 or member.file_size > MAX_MEMBER_BYTES:
        raise PreparationError("Archive member exceeds its size limit")
    return PurePosixPath(*raw_parts)


def source_properties_revision(data: bytes) -> str:
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        raise PreparationError("source.properties is not UTF-8") from error
    revisions = re.findall(r"(?m)^\s*Pkg\.Revision\s*=\s*([^\r\n]+?)\s*$", text)
    if len(revisions) != 1 or not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", revisions[0]):
        raise PreparationError("source.properties has no unambiguous stable revision")
    return revisions[0]


def extract_platform_tools(archive: Path, target: Path, version: str) -> list[str]:
    """Validate the whole archive, then copy ADB, all DLLs, and upstream notices."""
    if target.exists() or target.is_symlink():
        raise PreparationError("ADB extraction destination must not already exist")
    try:
        with zipfile.ZipFile(archive) as source:
            members = source.infolist()
            if not 0 < len(members) <= 512:
                raise PreparationError("Unexpected platform-tools archive entry count")
            seen = set()
            selected = []
            required = {}
            total = 0
            for member in members:
                path = safe_member_path(member)
                key = path.as_posix().casefold()
                if key in seen:
                    raise PreparationError("Duplicate or case-colliding archive path")
                seen.add(key)
                total += member.file_size
                if total > MAX_EXTRACTED_BYTES:
                    raise PreparationError("Archive exceeds the expanded size limit")
                if member.is_dir():
                    continue
                if len(path.parts) < 2:
                    raise PreparationError("platform-tools root must be a directory")
                relative = PurePosixPath(*path.parts[1:])
                root_key = relative.as_posix().casefold()
                if root_key in REQUIRED_ADB_FILES:
                    relative = PurePosixPath(REQUIRED_ADB_FILES[root_key])
                    required[root_key] = member
                elif relative.suffix.casefold() != ".dll":
                    continue
                if member.file_size == 0:
                    raise PreparationError("ADB binaries and notice files must not be empty")
                selected.append((member, relative))
            missing = set(REQUIRED_ADB_FILES).difference(required)
            if missing:
                raise PreparationError("ADB archive is missing: " + ", ".join(sorted(missing)))
            actual_version = source_properties_revision(source.read(required["source.properties"]))
            if actual_version != version:
                raise PreparationError("source.properties does not match the selected stable version")
            target.mkdir(parents=True)
            written = []
            for member, relative in selected:
                destination = target.joinpath(*relative.parts)
                destination.parent.mkdir(parents=True, exist_ok=True)
                with source.open(member) as read_stream, destination.open("xb") as write_stream:
                    shutil.copyfileobj(read_stream, write_stream, length=1024 * 1024)
                if destination.stat().st_size != member.file_size:
                    raise PreparationError("Extracted member size mismatch")
                written.append(relative.as_posix())
            return sorted(written)
    except (zipfile.BadZipFile, RuntimeError, NotImplementedError) as error:
        raise PreparationError("Invalid or unsupported platform-tools ZIP") from error


def require_empty_output(path: Path) -> None:
    if path.is_symlink():
        raise PreparationError("Output directory must not be a symlink")
    if path.exists() and (not path.is_dir() or any(path.iterdir())):
        raise PreparationError("Output directory must be absent or empty; existing files are preserved")


def nested_paths(first: Path, second: Path) -> bool:
    return first == second or first in second.parents or second in first.parents


def file_record(path: Path, root: Path) -> dict:
    return {
        "path": path.relative_to(root).as_posix(),
        "sha256": hash_file(path),
        "size": path.stat().st_size,
    }


def write_json(path: Path, value: dict) -> None:
    # ASCII JSON also parses consistently in Windows PowerShell 5.1.
    with path.open("x", encoding="ascii", newline="\n") as stream:
        json.dump(value, stream, ensure_ascii=True, indent=2, sort_keys=True)
        stream.write("\n")


def assemble(output: Path, downloads: Path | None = None, *, windows_dir: Path | None = None) -> dict:
    windows_dir = (windows_dir or Path(__file__).parent).resolve()
    output = output.expanduser().absolute()
    require_empty_output(output)
    output = output.resolve()
    script = windows_dir.parent / "dist" / "jebiseo-independent-test.js"
    inputs = [windows_dir / name for name in WINDOWS_INPUTS]
    for source in [*inputs, script]:
        require_regular_file(source)
        if not source.stat().st_size:
            raise PreparationError(f"Required input is empty: {source.name}")
    if nested_paths(output, windows_dir) or nested_paths(output, script.parent):
        raise PreparationError("Output must be separate from source inputs")
    if downloads is not None:
        downloads = downloads.expanduser().absolute()
        if downloads.is_symlink() or (downloads.exists() and not downloads.is_dir()):
            raise PreparationError("Download cache must be a regular directory")
        downloads = downloads.resolve()
        if nested_paths(downloads, output):
            raise PreparationError("Download cache and output must be separate")
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".jebiseo-assets-", dir=output.parent) as temporary_name:
        temporary = Path(temporary_name)
        stage = temporary / "delivery"
        stage.mkdir()
        cache = downloads if downloads is not None else temporary / "downloads"
        cache.mkdir(parents=True, exist_ok=True)
        xml_path = temporary / "repository2-1.xml"
        xml_evidence = download_file(
            REPOSITORY_URL, xml_path, frozenset({"dl.google.com"}), max_bytes=MAX_XML_BYTES
        )
        platform = select_platform_tools(xml_path.read_bytes())
        apk, apk_evidence = acquire_verified(
            AUTOJS_APK_URL, cache, f"autojs6-v{AUTOJS_VERSION}-universal.apk",
            GITHUB_RELEASE_HOSTS, AUTOJS_APK_SIZE, "sha256", AUTOJS_APK_SHA256,
        )
        tools_zip, tools_evidence = acquire_verified(
            platform["url"], cache, f"platform-tools_r{platform['version']}-win.zip",
            frozenset({"dl.google.com"}), platform["size"],
            platform["checksumAlgorithm"], platform["checksum"],
        )
        license_file, license_evidence = acquire_verified(
            AUTOJS_LICENSE_URL, cache, f"AutoJs6-{AUTOJS_COMMIT}-LICENSE.txt",
            frozenset({"raw.githubusercontent.com"}),
            AUTOJS_LICENSE_SIZE, "sha256", AUTOJS_LICENSE_SHA256,
        )
        for source in inputs:
            shutil.copyfile(source, stage / source.name)
        (stage / "payload").mkdir()
        (stage / "licenses").mkdir()
        shutil.copyfile(apk, stage / "payload" / "autojs6.apk")
        shutil.copyfile(script, stage / "payload" / "jebiseo-independent-test.js")
        shutil.copyfile(license_file, stage / "licenses" / "AutoJs6-MPL-2.0.txt")
        with (stage / "licenses" / "ANDROID_SDK_LICENSE.txt").open(
            "x", encoding="utf-8", newline=""
        ) as stream:
            stream.write(platform["licenseText"])
        retained = extract_platform_tools(
            tools_zip, stage / "tools" / "platform-tools", platform["version"]
        )
        # Verify the actual delivery copy, not only the cache used to create it.
        verify_file(stage / "payload" / "autojs6.apk", AUTOJS_APK_SIZE, "sha256", AUTOJS_APK_SHA256)
        evidence = {
            "schema": "jebiseo.windows.asset-evidence.v1", "createdAt": utc_now(),
            "autoJs6": {
                "appId": AUTOJS_APP_ID, "versionName": AUTOJS_VERSION,
                "sourceCommit": AUTOJS_COMMIT,
                "sourceUrl": f"https://github.com/SuperMonster003/AutoJs6/tree/{AUTOJS_COMMIT}",
                "apk": apk_evidence, "license": license_evidence,
            },
            "platformTools": {
                **{key: value for key, value in platform.items() if key != "licenseText"},
                "repository": xml_evidence, "archive": tools_evidence,
                "retainedFiles": retained, "sourcePropertiesRevision": platform["version"],
            },
            "deviceExecution": "NOT_RUN",
        }
        write_json(stage / "assets-evidence.json", evidence)
        files = [file_record(path, stage) for path in sorted(stage.rglob("*")) if path.is_file()]
        manifest = {
            "schema": "jebiseo.windows.assets.v1",
            "appId": AUTOJS_APP_ID, "versionName": AUTOJS_VERSION,
            "apk": file_record(stage / "payload" / "autojs6.apk", stage),
            "script": file_record(stage / "payload" / "jebiseo-independent-test.js", stage),
            "adb": {"path": "tools/platform-tools/adb.exe"},
            "files": files,
        }
        write_json(stage / "assets.json", manifest)
        require_empty_output(output)
        if output.exists():
            output.rmdir()  # rmdir fails, without deleting contents, if a writer raced us.
        stage.rename(output)
    return manifest


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path, help="Absent or empty delivery folder")
    parser.add_argument("--downloads", type=Path, help="Optional verified-download cache; never packaged")
    args = parser.parse_args(argv)
    try:
        manifest = assemble(args.output, args.downloads)
    except (PreparationError, OSError) as error:
        print(f"ASSET_PREPARATION_FAILED: {error}", file=sys.stderr)
        return 1
    print(json.dumps({
        "status": "ASSEMBLED", "output": str(args.output.resolve()),
        "manifest": "assets.json", "evidence": "assets-evidence.json",
        "fileCount": len(manifest["files"]), "apkSha256": manifest["apk"]["sha256"],
        "scriptSha256": manifest["script"]["sha256"], "zipCreated": False,
        "deviceExecution": "NOT_RUN",
    }, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
