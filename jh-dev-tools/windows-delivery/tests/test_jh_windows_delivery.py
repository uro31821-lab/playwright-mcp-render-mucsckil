"""Synthetic delivery-contract regressions; never build or install an APK."""
from __future__ import annotations

import contextlib
import copy
import hashlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import jh_integrity as integrity
import jh_windows_delivery as delivery


# The trusted fixture is independent of whatever files a candidate later has.
# These bytes are synthetic text/payload, not a real Android application.
PINNED_FILES = {
    "실행.cmd": b'@echo off\r\npowershell.exe -NoProfile -File "%~dp0data\\run.ps1"\r\n',
    "data/run.ps1": b"Write-Output 'ready'\r\n",
    "payload/app.apk": b"synthetic-payload-not-a-real-apk\x00\x01\x02",
    "POWER_SHELL_ERROR_CHECKLIST.txt": b"Synthetic checklist: verify paths, hashes and prior results.\n",
}


def identity(raw):
    return {"sha256": hashlib.sha256(raw).hexdigest(), "size": len(raw)}


class WindowsDeliveryTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.base = Path(temporary.name)
        self.root = self.base / "한글 공백 후보"
        self.root.mkdir()
        for name, raw in PINNED_FILES.items():
            self.write(name, raw)
        self.profile = {
            "schema": "jh.windows-apk-profile.v1", "id": "SYNTHETIC-WINDOWS-APK",
            "version": "1", "entrypoint": "실행.cmd",
            "required_files": {name: identity(raw) for name, raw in PINNED_FILES.items()},
            "evidence_refs": ["fixture:independent-reviewed-bytes"],
            "limitations": ["Synthetic fixture; no Windows or Android execution has occurred."],
            "review_status": "reviewed",
        }
        self.registry = self.base / "trusted-registry.json"
        self.save_registry()
        patched = mock.patch.object(delivery, "PROFILE_REGISTRY", self.registry)
        patched.start()
        self.addCleanup(patched.stop)

    def write(self, name, raw):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(raw)
        return path

    def save_registry(self, profiles=None):
        self.registry.write_text(json.dumps({"schema": "jh.windows-apk-profiles.v1",
                                            "profiles": profiles if profiles is not None else [self.profile]},
                                           ensure_ascii=False), encoding="utf-8")

    def pack(self, name="candidate.zip", **options):
        return integrity.package(self.root, self.base / name,
                                 windows_apk_profile=self.profile["id"], **options)

    def assert_blocked_before_writes(self, *, profile_id=None, pattern=None):
        output = self.base / "blocked.zip"
        with mock.patch.object(integrity, "_temporary", side_effect=AssertionError("output creation preceded gate")):
            with self.assertRaises(integrity.IntegrityError) as caught:
                integrity.package(self.root, output,
                                  windows_apk_profile=profile_id if profile_id is not None else self.profile["id"])
        if pattern:
            self.assertIn(pattern, str(caught.exception))
        self.assertFalse(output.exists())
        self.assertFalse(output.with_name(output.name + ".manifest.json").exists())

    def test_reviewed_profile_checks_actual_packaged_files_and_binds_sidecar_report(self):
        result = self.pack()
        report = result["delivery_contract"]
        self.assertTrue(result["development_preflight"]["ok"])
        self.assertEqual(report["runtime_status"], "not_run")
        self.assertEqual(report["validation_scope"], "pinned_packaged_files")
        self.assertEqual(report["profile_id"], self.profile["id"])
        self.assertEqual(report["profile_version"], "1")
        self.assertEqual(report["matched_files"], sorted(PINNED_FILES))
        self.assertEqual(report["required_file_count"], 4)
        self.assertEqual(report["packaged_file_count"], 4)
        self.assertEqual(report["checker_sha256"], hashlib.sha256(Path(delivery.__file__).read_bytes()).hexdigest())
        self.assertEqual(report["registry_sha256"], hashlib.sha256(self.registry.read_bytes()).hexdigest())
        manifest = json.loads(Path(result["manifest"]).read_text(encoding="utf-8"))
        self.assertEqual(manifest["delivery_contract"], report)
        self.assertEqual(manifest["files"], self.profile["required_files"])
        with zipfile.ZipFile(result["zip"]) as archive:
            self.assertEqual({name: archive.read(name) for name in archive.namelist()}, PINNED_FILES)

    def test_profile_selection_requires_windows_preflight_even_without_explicit_flag(self):
        (self.root / "실행.cmd").unlink()
        self.assert_blocked_before_writes(pattern="WINDOWS_ENTRYPOINT")

    def test_all_required_script_payload_checklist_and_entrypoint_files_are_mandatory(self):
        for name, raw in PINNED_FILES.items():
            with self.subTest(name=name):
                (self.root / name).unlink()
                self.assert_blocked_before_writes()
                self.write(name, raw)

    def test_same_size_tampering_is_detected_against_independent_profile(self):
        for name, original in PINNED_FILES.items():
            with self.subTest(name=name):
                # Case changes keep shell syntax/encoding valid while changing bytes.
                changed = original.replace(b"powershell.exe", b"PowerShell.exe", 1) if name.endswith(".cmd") else (
                    original.replace(b"ready", b"other", 1) if name.endswith(".ps1") else
                    bytes([original[0] ^ 1]) + original[1:])
                self.assertEqual(len(changed), len(original))
                self.assertNotEqual(changed, original)
                self.write(name, changed)
                self.assert_blocked_before_writes(pattern="differs from its trusted profile")
                self.write(name, original)

    def test_size_changes_are_detected(self):
        self.write("payload/app.apk", PINNED_FILES["payload/app.apk"] + b"extra")
        self.assert_blocked_before_writes(pattern="differs from its trusted profile")

    def test_unknown_blocked_candidate_and_missing_registries_fail_closed(self):
        self.assert_blocked_before_writes(profile_id="UNKNOWN-PROFILE", pattern="Unknown")
        for status in ("blocked", "candidate"):
            with self.subTest(status=status):
                self.profile["review_status"] = status
                self.save_registry()
                self.assert_blocked_before_writes(pattern="not reviewed")
        self.registry.unlink()
        self.assert_blocked_before_writes(pattern="unavailable or invalid")

    def test_blocked_incomplete_original_can_coexist_with_reviewed_replacement(self):
        blocked = copy.deepcopy(self.profile)
        blocked["id"] = "SYNTHETIC-BLOCKED-ORIGINAL"
        blocked["review_status"] = "blocked"
        del blocked["required_files"]["POWER_SHELL_ERROR_CHECKLIST.txt"]
        self.save_registry([blocked, self.profile])
        self.assert_blocked_before_writes(profile_id=blocked["id"], pattern="not reviewed")
        self.assertTrue(self.pack()["ok"])

    def test_source_local_self_declared_profile_cannot_replace_fixed_registry(self):
        self.write("data/run.ps1", b"Write-Output 'changed'\r\n")
        untrusted = copy.deepcopy(self.profile)
        untrusted["required_files"]["data/run.ps1"] = identity((self.root / "data/run.ps1").read_bytes())
        self.write("references/windows-apk-profiles.json",
                   json.dumps({"schema": delivery.REGISTRY_SCHEMA, "profiles": [untrusted]}).encode("utf-8"))
        self.assert_blocked_before_writes(pattern="differs from its trusted profile")
        self.assert_blocked_before_writes(profile_id=str(self.registry), pattern="registered ID, not a path")

    def test_required_file_under_excluded_build_path_is_missing_from_real_package(self):
        self.write("build/app.apk", PINNED_FILES["payload/app.apk"])
        self.profile["required_files"]["build/app.apk"] = identity(PINNED_FILES["payload/app.apk"])
        self.save_registry()
        manifest = integrity.snapshot(self.root)
        self.assertTrue((self.root / "build/app.apk").is_file())
        self.assertNotIn("build/app.apk", manifest["files"])
        self.assert_blocked_before_writes(pattern="missing required packaged file: build/app.apk")

    def test_existing_static_regression_is_checked_before_delivery_contract(self):
        self.write("data/run.ps1", b"function H {}\r\n")
        with mock.patch.object(delivery, "check_delivery", side_effect=AssertionError("static gate was bypassed")):
            self.assert_blocked_before_writes(pattern="PS_ALIAS_COLLISION")

    def test_existing_zip_or_sidecar_is_never_clobbered(self):
        output = self.base / "existing.zip"
        sidecar = output.with_name(output.name + ".manifest.json")
        for existing in ((output,), (sidecar,), (output, sidecar)):
            with self.subTest(existing=[item.name for item in existing]):
                for item in existing:
                    item.write_bytes(b"preserve-existing-output")
                for overwrite in (False, True):
                    with self.assertRaises(integrity.IntegrityError):
                        integrity.package(self.root, output, windows_apk_profile=self.profile["id"], overwrite=overwrite)
                    for item in existing:
                        self.assertEqual(item.read_bytes(), b"preserve-existing-output")
                for item in existing:
                    item.unlink()

    def test_profiled_new_zip_is_removed_if_sidecar_publication_fails(self):
        with mock.patch.object(integrity, "_write_json", side_effect=OSError("synthetic sidecar failure")):
            with self.assertRaises(OSError):
                self.pack()
        self.assertFalse((self.base / "candidate.zip").exists())
        self.assertFalse((self.base / "candidate.zip.manifest.json").exists())

    def test_fingerprint_binds_all_packaged_files_and_profile_metadata(self):
        first = self.pack("first.zip")["delivery_contract"]
        same = self.pack("same.zip")["delivery_contract"]
        self.assertEqual(first["fingerprint"], same["fingerprint"])
        self.write("README.txt", b"Additional packaged context.\n")
        additional = self.pack("additional.zip")["delivery_contract"]
        self.assertEqual(first["profile_sha256"], additional["profile_sha256"])
        self.assertNotEqual(first["files_sha256"], additional["files_sha256"])
        self.assertNotEqual(first["fingerprint"], additional["fingerprint"])
        self.profile["version"] = "2"
        self.save_registry()
        changed_profile = self.pack("changed-profile.zip")["delivery_contract"]
        self.assertEqual(additional["files_sha256"], changed_profile["files_sha256"])
        self.assertNotEqual(additional["profile_sha256"], changed_profile["profile_sha256"])
        self.assertNotEqual(additional["fingerprint"], changed_profile["fingerprint"])

    def test_profile_schema_bounds_and_portable_file_names_are_enforced(self):
        variants = []
        for field, value in (("schema", "other"), ("id", "../profile"), ("version", ""),
                             ("entrypoint", "custom.cmd"), ("review_status", "approved"),
                             ("evidence_refs", []), ("evidence_refs", ["https://example.invalid"]),
                             ("limitations", []), ("limitations", ["x" * 1025]), ("execute", "anything")):
            candidate = copy.deepcopy(self.profile)
            candidate[field] = value
            variants.append(candidate)
        for record in ({"sha256": "a" * 63, "size": 1}, {"sha256": "a" * 64, "size": -1},
                       {"sha256": "a" * 64, "size": True}, {"sha256": "a" * 64, "size": 1, "command": "ignored"}):
            candidate = copy.deepcopy(self.profile)
            candidate["required_files"]["payload/app.apk"] = record
            variants.append(candidate)
        for name in ("../escape.apk", "/absolute.apk", "C:/drive.apk", "payload\\wrong.apk", "CON.txt",
                     "payload/../app.apk", "payload/*.apk", "DATA/run.ps1", "data/run.ps1/child"):
            candidate = copy.deepcopy(self.profile)
            candidate["required_files"][name] = identity(b"invalid-path-fixture")
            variants.append(candidate)
        for name in ("실행.cmd", "POWER_SHELL_ERROR_CHECKLIST.txt"):
            candidate = copy.deepcopy(self.profile)
            del candidate["required_files"][name]
            variants.append(candidate)
        for candidate in variants:
            with self.subTest(candidate=candidate):
                self.save_registry([candidate])
                self.assert_blocked_before_writes()

    def test_duplicate_json_ids_oversized_and_symlink_registries_are_rejected(self):
        raw = self.registry.read_bytes()
        self.registry.write_bytes(raw.replace(b'"profiles":', b'"schema":"jh.windows-apk-profiles.v1","profiles":', 1))
        self.assert_blocked_before_writes(pattern="Duplicate JSON key")
        self.save_registry([self.profile, self.profile])
        self.assert_blocked_before_writes(pattern="Duplicate Windows APK profile ID")
        self.registry.write_bytes(b" " * (delivery.MAX_REGISTRY_BYTES + 1))
        self.assert_blocked_before_writes(pattern="bounded regular file")
        self.registry.unlink()
        target = self.base / "linked-registry-target.json"
        target.write_bytes(raw)
        self.registry.symlink_to(target)
        self.assert_blocked_before_writes(pattern="regular file")

    def test_plain_source_and_legacy_windows_packages_do_not_require_registry(self):
        self.registry.unlink()
        source = self.base / "plain-source"
        source.mkdir()
        (source / "app.py").write_text("print('ordinary source')\n", encoding="utf-8")
        plain = integrity.package(source, self.base / "plain.zip")
        windows = integrity.package(self.root, self.base / "windows.zip", windows_release=True)
        for result in (plain, windows):
            self.assertTrue(result["ok"])
            self.assertNotIn("delivery_contract", result)
            manifest = json.loads(Path(result["manifest"]).read_text(encoding="utf-8"))
            self.assertNotIn("delivery_contract", manifest)

    def test_cli_profile_flag_runs_same_contract_and_reports_no_runtime_execution(self):
        captured = io.StringIO()
        with contextlib.redirect_stdout(captured):
            code = integrity.main(["package", str(self.root), "--output", str(self.base / "cli.zip"),
                                   "--windows-apk-profile", self.profile["id"]])
        result = json.loads(captured.getvalue())
        self.assertEqual(code, 0)
        self.assertTrue(result["delivery_contract"]["ok"])
        self.assertEqual(result["delivery_contract"]["runtime_status"], "not_run")


if __name__ == "__main__":
    unittest.main()
