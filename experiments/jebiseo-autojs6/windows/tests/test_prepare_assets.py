"""Offline contract tests for release-source verification and safe assembly."""

from __future__ import annotations

from contextlib import ExitStack
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import stat
import tempfile
import unittest
from unittest.mock import Mock, patch
import warnings
from xml.sax.saxutils import escape
import zipfile


MODULE_PATH = Path(__file__).resolve().parents[1] / "prepare-assets.py"
SPEC = importlib.util.spec_from_file_location("prepare_assets", MODULE_PATH)
assets = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(assets)


def archive_xml(
    version="37.0.1", channel="channel-0", host="windows", *,
    size=101, checksum="a" * 40, algorithm="sha1", url=None, preview="",
):
    major, minor, micro = version.split(".")
    url = url or f"platform-tools_r{version}-win.zip"
    channel_xml = f'<channelRef ref="{channel}"/>' if channel else ""
    return f"""
      <remotePackage path="platform-tools">
        <revision><major>{major}</major><minor>{minor}</minor><micro>{micro}</micro>{preview}</revision>
        <uses-license ref="android-sdk-license"/>{channel_xml}
        <archives><archive><host-os>{host}</host-os><complete>
          <size>{size}</size><checksum type="{algorithm}">{checksum}</checksum>
          <url>{escape(url)}</url>
        </complete></archive></archives>
      </remotePackage>"""


def repository_xml(*packages, with_license=True):
    license_xml = '<license id="android-sdk-license">Official fixture license\nKeep this text.</license>' if with_license else ""
    return (
        '<repository xmlns="http://schemas.android.com/repository/android/generic/02">'
        + license_xml + "".join(packages) + "</repository>"
    ).encode("utf-8")


def platform_zip_bytes(extra=(), omitted=(), revision="37.0.1"):
    entries = {
        "platform-tools/adb.exe": b"fixture-adb-executable",
        "platform-tools/AdbWinApi.dll": b"fixture-api-dll",
        "platform-tools/AdbWinUsbApi.dll": b"fixture-usb-dll",
        "platform-tools/NOTICE.txt": b"Upstream notices remain unchanged.\r\n",
        "platform-tools/source.properties": f"Pkg.Desc=Android SDK Platform-Tools\nPkg.Revision={revision}\n".encode(),
        "platform-tools/fastboot.exe": b"unused-fixture-fastboot",
    }
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, content in entries.items():
            if name not in omitted:
                archive.writestr(name, content)
        for name, content in extra:
            archive.writestr(name, content)
    return stream.getvalue()


class TemporaryTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)

    def file(self, name, data):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return path


class RepositorySelectionTests(unittest.TestCase):
    def test_newer_canary_does_not_replace_latest_stable(self):
        result = assets.select_platform_tools(repository_xml(
            archive_xml("37.0.2", "channel-3"),
            archive_xml("36.0.0"), archive_xml("37.0.1"),
        ))
        self.assertEqual(result["version"], "37.0.1")
        self.assertEqual(result["channel"], "channel-0")
        self.assertEqual(result["hostOs"], "windows")
        self.assertEqual(result["url"], "https://dl.google.com/android/repository/platform-tools_r37.0.1-win.zip")
        self.assertEqual(result["licenseText"], "Official fixture license\nKeep this text.")

    def test_no_implicit_stable_or_preview_fallback(self):
        for package in [archive_xml(channel="channel-3"), archive_xml(channel=""),
                        archive_xml(preview="<preview>1</preview>")]:
            with self.subTest(package=package):
                with self.assertRaises(assets.PreparationError):
                    assets.select_platform_tools(repository_xml(package))

    def test_ambiguous_stable_package_is_rejected(self):
        with self.assertRaisesRegex(assets.PreparationError, "Ambiguous"):
            assets.select_platform_tools(repository_xml(archive_xml(), archive_xml()))

    def test_latest_missing_windows_does_not_fall_back_to_older(self):
        with self.assertRaisesRegex(assets.PreparationError, "Windows archive"):
            assets.select_platform_tools(repository_xml(
                archive_xml("36.0.0"), archive_xml("37.0.1", host="linux")
            ))

    def test_archive_url_must_match_official_host_and_selected_version(self):
        bad_urls = [
            "https://example.com/platform-tools_r37.0.1-win.zip",
            "http://dl.google.com/android/repository/platform-tools_r37.0.1-win.zip",
            "https://dl.google.com.evil.example/android/repository/platform-tools_r37.0.1-win.zip",
            "https://user@dl.google.com/android/repository/platform-tools_r37.0.1-win.zip",
            "platform-tools_r37.0.0-win.zip", "platform-tools-latest-windows.zip",
            "platform-tools_r37.0.1-win.zip?alternate=1", "../platform-tools_r37.0.1-win.zip",
        ]
        for url in bad_urls:
            with self.subTest(url=url), self.assertRaises(assets.PreparationError):
                assets.select_platform_tools(repository_xml(archive_xml(url=url)))

    def test_official_absolute_url_and_sha256_supported(self):
        result = assets.select_platform_tools(repository_xml(archive_xml(
            algorithm="sha256", checksum="B" * 64,
            url="https://dl.google.com/android/repository/platform-tools_r37.0.1-win.zip",
        )))
        self.assertEqual(result["checksumAlgorithm"], "sha256")
        self.assertEqual(result["checksum"], "b" * 64)

    def test_invalid_size_or_checksum_and_missing_license_are_rejected(self):
        for options in [dict(size=0), dict(size=assets.MAX_ARCHIVE_BYTES + 1),
                        dict(checksum=""), dict(checksum="z" * 40),
                        dict(algorithm="md5", checksum="a" * 32)]:
            with self.subTest(options=options), self.assertRaises(assets.PreparationError):
                assets.select_platform_tools(repository_xml(archive_xml(**options)))
        with self.assertRaisesRegex(assets.PreparationError, "license"):
            assets.select_platform_tools(repository_xml(archive_xml(), with_license=False))

    def test_dtd_entities_and_malformed_xml_are_rejected(self):
        for data in [b'<!DOCTYPE x [<!ENTITY y "bad">]><x>&y;</x>', b"<broken>"]:
            with self.subTest(data=data), self.assertRaises(assets.PreparationError):
                assets.select_platform_tools(data)


class ArchiveTests(TemporaryTest):
    def extract(self, data):
        return assets.extract_platform_tools(self.file("download.zip", data), self.root / "adb", "37.0.1")

    def test_retains_adb_all_dlls_and_exact_notices_only(self):
        names = self.extract(platform_zip_bytes(extra=[
            ("platform-tools/Additional.DLL", b"more-dll"),
            ("platform-tools/subdir/Dependency.dll", b"nested-dll"),
            ("platform-tools/unused.txt", b"unused"),
        ]))
        self.assertEqual(set(names), {
            "adb.exe", "AdbWinApi.dll", "AdbWinUsbApi.dll", "NOTICE.txt",
            "source.properties", "Additional.DLL", "subdir/Dependency.dll",
        })
        self.assertEqual((self.root / "adb" / "NOTICE.txt").read_bytes(), b"Upstream notices remain unchanged.\r\n")
        self.assertFalse((self.root / "adb" / "fastboot.exe").exists())

    def test_unsafe_member_even_when_not_selected_is_rejected(self):
        bad_paths = [
            "../outside.txt", "platform-tools/../outside.txt", "/platform-tools/adb.exe",
            "platform-tools\\evil.dll", "C:/platform-tools/evil.dll",
            "platform-tools/CON.txt", "platform-tools/name. /evil.dll",
            "platform-tools/./evil.dll", "platform-tools/double//evil.dll",
            "other/ignored.txt",
        ]
        for index, name in enumerate(bad_paths):
            with self.subTest(name=name), self.assertRaises(assets.PreparationError):
                assets.extract_platform_tools(
                    self.file(f"unsafe-{index}.zip", platform_zip_bytes(extra=[(name, b"unsafe")])),
                    self.root / f"output-{index}", "37.0.1",
                )
        self.assertFalse((self.root / "outside.txt").exists())

    def test_case_collision_is_rejected_before_extraction(self):
        with self.assertRaisesRegex(assets.PreparationError, "case-colliding"):
            self.extract(platform_zip_bytes(extra=[("platform-tools/ADB.EXE", b"duplicate")]))
        self.assertFalse((self.root / "adb").exists())

    def test_duplicate_member_is_rejected(self):
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", UserWarning)
            data = platform_zip_bytes(extra=[("platform-tools/adb.exe", b"duplicate")])
        with self.assertRaisesRegex(assets.PreparationError, "Duplicate"):
            self.extract(data)

    def test_symlink_is_rejected_even_when_unused(self):
        symlink = zipfile.ZipInfo("platform-tools/unused-link")
        symlink.create_system = 3
        symlink.external_attr = (stat.S_IFLNK | 0o777) << 16
        with self.assertRaisesRegex(assets.PreparationError, "symlink"):
            self.extract(platform_zip_bytes(extra=[(symlink, b"../../outside")]))

    def test_missing_required_dll_is_rejected(self):
        with self.assertRaisesRegex(assets.PreparationError, "adbwinusbapi.dll"):
            self.extract(platform_zip_bytes(omitted=["platform-tools/AdbWinUsbApi.dll"]))

    def test_missing_notices_is_rejected(self):
        with self.assertRaisesRegex(assets.PreparationError, "notice.txt"):
            self.extract(platform_zip_bytes(omitted=["platform-tools/NOTICE.txt"]))

    def test_revision_mismatch_is_rejected_before_extraction(self):
        with self.assertRaisesRegex(assets.PreparationError, "selected stable version"):
            self.extract(platform_zip_bytes(revision="37.0.2"))
        self.assertFalse((self.root / "adb").exists())

    def test_malformed_zip_is_rejected(self):
        with self.assertRaisesRegex(assets.PreparationError, "ZIP"):
            self.extract(b"not a zip")


class IntegrityAndDownloadTests(TemporaryTest):
    def test_size_and_checksum_are_both_required(self):
        path = self.file("data", b"verified bytes")
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        self.assertEqual(assets.verify_file(path, 14, "sha256", digest), digest)
        with self.assertRaisesRegex(assets.PreparationError, "Size mismatch"):
            assets.verify_file(path, 13, "sha256", digest)
        with self.assertRaisesRegex(assets.PreparationError, "SHA256 mismatch"):
            assets.verify_file(path, 14, "sha256", "0" * 64)

    def test_verified_cache_is_reused_without_network(self):
        data = b"verified bytes"
        digest = hashlib.sha256(data).hexdigest()
        self.file("cached.bin", data)
        with patch.object(assets, "download_file", side_effect=AssertionError("network attempted")):
            path, evidence = assets.acquire_verified(
                "https://dl.google.com/android/repository/fixed.zip", self.root, "cached.bin",
                frozenset({"dl.google.com"}), len(data), "sha256", digest,
            )
        self.assertEqual(path.read_bytes(), data)
        self.assertEqual(evidence["acquisition"], "verified-cache")

    def test_corrupt_cache_fails_without_silent_redownload(self):
        self.file("cached.bin", b"bad bytes")
        with patch.object(assets, "download_file", side_effect=AssertionError("network attempted")):
            with self.assertRaises(assets.PreparationError):
                assets.acquire_verified(
                    "https://dl.google.com/android/repository/fixed.zip", self.root, "cached.bin",
                    frozenset({"dl.google.com"}), 9, "sha256", "0" * 64,
                )
        self.assertEqual((self.root / "cached.bin").read_bytes(), b"bad bytes")

    def test_redirect_validation_does_not_accept_http_or_other_hosts(self):
        for url in ["http://dl.google.com/x", "https://example.com/x", "https://dl.google.com:444/x"]:
            with self.subTest(url=url), self.assertRaises(assets.PreparationError):
                assets.RestrictedRedirects(frozenset({"dl.google.com"})).redirect_request(
                    None, None, 302, "redirect", {}, url
                )

    def test_bad_download_checksum_leaves_no_partial_target(self):
        class Response(io.BytesIO):
            status = 200
            headers = {"Content-Length": "3"}

            def geturl(self):
                return "https://dl.google.com/test.bin"

        response = Response(b"bad")
        opener = Mock()
        opener.open.return_value = response
        with patch.object(assets, "build_opener", return_value=opener):
            with self.assertRaisesRegex(assets.PreparationError, "SHA256 mismatch"):
                assets.download_file(
                    "https://dl.google.com/test.bin", self.root / "asset.bin",
                    frozenset({"dl.google.com"}), max_bytes=3, size=3,
                    algorithm="sha256", checksum="0" * 64,
                )
        self.assertEqual(list(self.root.iterdir()), [])

    def test_download_cannot_overwrite_existing_target(self):
        target = self.file("asset.bin", b"keep")
        with patch.object(assets, "build_opener", side_effect=AssertionError("network attempted")):
            with self.assertRaisesRegex(assets.PreparationError, "already exists"):
                assets.download_file(
                    "https://dl.google.com/test.bin", target, frozenset({"dl.google.com"}), max_bytes=10
                )
        self.assertEqual(target.read_bytes(), b"keep")


class AssemblyTests(TemporaryTest):
    def fixture(self):
        windows = self.root / "experiment" / "windows"
        windows.mkdir(parents=True)
        for name in assets.WINDOWS_INPUTS:
            (windows / name).write_text(f"fixture {name}\n", encoding="utf-8")
        self.file("experiment/dist/jebiseo-independent-test.js", b'"ui"; /* fixture */\n')
        tools_zip = platform_zip_bytes()
        xml = repository_xml(archive_xml(
            size=len(tools_zip), checksum=hashlib.sha1(tools_zip).hexdigest()
        ))
        apk = b"unchanged-fixture-apk"
        license_bytes = b"Mozilla Public License Version 2.0\nfixture"
        downloads = {
            assets.REPOSITORY_URL: xml,
            assets.AUTOJS_APK_URL: apk,
            "https://dl.google.com/android/repository/platform-tools_r37.0.1-win.zip": tools_zip,
            assets.AUTOJS_LICENSE_URL: license_bytes,
        }

        def fixture_download(url, target, allowed_hosts, *, max_bytes, size=None, algorithm=None, checksum=None):
            data = downloads[url]
            self.assertLessEqual(len(data), max_bytes)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            sha256 = assets.verify_file(target, size, algorithm, checksum) if size else assets.hash_file(target)
            return {
                "sourceUrl": url, "acquisition": "offline-test-fixture", "size": len(data),
                "sha256": sha256, "checksumAlgorithm": algorithm, "expectedChecksum": checksum,
            }

        stack = ExitStack()
        self.addCleanup(stack.close)
        stack.enter_context(patch.object(assets, "AUTOJS_APK_SIZE", len(apk)))
        stack.enter_context(patch.object(assets, "AUTOJS_APK_SHA256", hashlib.sha256(apk).hexdigest()))
        stack.enter_context(patch.object(assets, "AUTOJS_LICENSE_SIZE", len(license_bytes)))
        stack.enter_context(patch.object(assets, "AUTOJS_LICENSE_SHA256", hashlib.sha256(license_bytes).hexdigest()))
        stack.enter_context(patch.object(assets, "download_file", side_effect=fixture_download))
        return windows

    def test_manifest_covers_every_delivery_file_and_excludes_cache(self):
        windows = self.fixture()
        output = self.root / "delivery"
        cache = self.root / "cache"
        manifest = assets.assemble(output, cache, windows_dir=windows)
        self.assertEqual(manifest["schema"], "jebiseo.windows.assets.v1")
        self.assertEqual(manifest["appId"], "org.autojs.autojs6")
        self.assertEqual(manifest["versionName"], "6.8.0")
        self.assertEqual(manifest["adb"]["path"], "tools/platform-tools/adb.exe")
        actual = {path.relative_to(output).as_posix() for path in output.rglob("*") if path.is_file()}
        covered = {entry["path"] for entry in manifest["files"]}
        self.assertEqual(covered, actual - {"assets.json"})
        for entry in manifest["files"]:
            path = output / entry["path"]
            self.assertEqual(entry["size"], path.stat().st_size)
            self.assertEqual(entry["sha256"], hashlib.sha256(path.read_bytes()).hexdigest())
        self.assertIn("assets-evidence.json", covered)
        self.assertIn("licenses/AutoJs6-MPL-2.0.txt", covered)
        self.assertIn("licenses/ANDROID_SDK_LICENSE.txt", covered)
        self.assertFalse(any(path.endswith(".zip") for path in covered))
        evidence = json.loads((output / "assets-evidence.json").read_text())
        self.assertEqual(evidence["platformTools"]["version"], "37.0.1")
        self.assertEqual(evidence["deviceExecution"], "NOT_RUN")
        self.assertEqual(evidence["autoJs6"]["apk"]["acquisition"], "offline-test-fixture")
        self.assertGreater(len(list(cache.iterdir())), 0)

    def test_nonempty_output_is_preserved_before_any_network(self):
        output = self.root / "delivery"
        existing = self.file("delivery/RESULT.txt", b"keep the user's result")
        with patch.object(assets, "download_file", side_effect=AssertionError("network attempted")):
            with self.assertRaisesRegex(assets.PreparationError, "absent or empty"):
                assets.assemble(output, windows_dir=self.root / "missing-sources")
        self.assertEqual(existing.read_bytes(), b"keep the user's result")

    def test_empty_output_is_allowed(self):
        windows = self.fixture()
        output = self.root / "delivery"
        output.mkdir()
        assets.assemble(output, windows_dir=windows)
        self.assertTrue((output / "assets.json").is_file())

    def test_missing_local_input_fails_before_network(self):
        windows = self.root / "windows"
        windows.mkdir()
        with patch.object(assets, "download_file", side_effect=AssertionError("network attempted")):
            with self.assertRaisesRegex(assets.PreparationError, "Required regular file"):
                assets.assemble(self.root / "delivery", windows_dir=windows)
        self.assertFalse((self.root / "delivery").exists())

    def test_failed_acquisition_does_not_publish_partial_delivery(self):
        windows = self.fixture()
        output = self.root / "delivery"
        output.mkdir()
        with patch.object(assets, "acquire_verified", side_effect=assets.PreparationError("checksum mismatch")):
            with self.assertRaisesRegex(assets.PreparationError, "checksum mismatch"):
                assets.assemble(output, windows_dir=windows)
        self.assertEqual(list(output.iterdir()), [])
        self.assertFalse(any(self.root.glob(".jebiseo-assets-*")))

    def test_cache_cannot_be_inside_delivery(self):
        windows = self.fixture()
        with self.assertRaisesRegex(assets.PreparationError, "cache and output"):
            assets.assemble(self.root / "delivery", self.root / "delivery" / "cache", windows_dir=windows)

    def test_output_symlink_is_rejected(self):
        real = self.root / "real"
        real.mkdir()
        link = self.root / "delivery"
        try:
            link.symlink_to(real, target_is_directory=True)
        except (OSError, NotImplementedError):
            self.skipTest("Symlinks unavailable in this test environment")
        with self.assertRaisesRegex(assets.PreparationError, "symlink"):
            assets.require_empty_output(link)


if __name__ == "__main__":
    unittest.main()
