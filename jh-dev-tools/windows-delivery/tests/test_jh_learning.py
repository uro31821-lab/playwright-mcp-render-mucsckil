"""Behavioral regression tests for the JH development lesson gate."""
from __future__ import annotations

import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import jh_integrity as integrity
import jh_learning as learning


class LearningGateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.root = self.base / "한글 공백 작업"
        self.root.mkdir()

    def write(self, name, text, *, bom=False):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes((b"\xef\xbb\xbf" if bom else b"") + text.encode("utf-8"))
        return path

    def entrypoint(self):
        self.write("실행.cmd", '@echo off\r\npowershell.exe -NoProfile -File "%~dp0data\\run.ps1"\r\n')

    def ids(self, report):
        return {item["check_id"] for item in report["findings"]}

    def test_alias_collisions_have_source_locations(self):
        for declaration in ("function H", "filter history", "function script:GHY",
                            "function global:r", "filter ihy"):
            with self.subTest(declaration=declaration):
                self.write("data/run.ps1", "# header\n" + declaration + " { Write-Output 'x' }\n")
                report = learning.check_tree(self.root)
                self.assertFalse(report["ok"])
                hits = [f for f in report["findings"] if f["check_id"] == "PS_ALIAS_COLLISION"]
                self.assertTrue(hits)
                self.assertEqual(hits[0]["path"], "data/run.ps1")
                self.assertEqual(hits[0]["line"], 2)

    def test_comments_strings_and_here_strings_are_not_code(self):
        self.write("run.ps1", '''# function H { $Host = 9 }
<# filter history { $Matches = @{} } #>
$single = 'function ghy { $Home = 1 }'
$double = "filter r { $PID = 8 }"
$literal = @'
function ihy { $Input = 2 }
'@
$expandable = @"
function H { $Args = 5 }
"@
function Invoke-HistoryCache { Write-Output 'fine' }
''')
        report = learning.check_tree(self.root)
        self.assertTrue(report["ok"], report)

    def test_direct_automatic_variable_writes_are_rejected(self):
        for statement in ("$Matches = @{}", "$HOME = 'x'", "$Host = 'x'",
                          "$global:PID += 1", "$Input++", "$Args = @()"):
            with self.subTest(statement=statement):
                self.write("run.ps1", statement + "\n")
                report = learning.check_tree(self.root)
                self.assertFalse(report["ok"])
                self.assertIn("PS_AUTOMATIC_VARIABLE", self.ids(report))

    def test_environment_assignments_and_automatic_variable_reads_are_allowed(self):
        self.write("run.ps1", "$env:HOME = 'workspace'\n$env:HOST = 'test'\n"
                   "$value = $Matches[0]\nWrite-Output $Host.Name\n")
        self.assertTrue(learning.check_tree(self.root)["ok"])

    def test_windows_non_ascii_powershell_requires_bom(self):
        self.entrypoint()
        self.write("data/run.ps1", "Write-Output '완료'\r\n")
        report = learning.check_tree(self.root)
        self.assertFalse(report["ok"])
        self.assertIn("PS_ENCODING", self.ids(report))
        self.write("data/run.ps1", "Write-Output '완료'\r\n", bom=True)
        fixed = learning.check_tree(self.root)
        self.assertTrue(fixed["ok"], fixed)

    def test_source_only_unicode_powershell_does_not_require_windows_encoding(self):
        self.write("tools/sample.ps1", "Write-Output '완료'\n")
        report = learning.check_tree(self.root)
        self.assertTrue(report["ok"], report)
        self.assertNotIn("PS_ENCODING", self.ids(report))

    def test_explicit_windows_package_requires_entrypoint(self):
        self.write("data/run.ps1", "Write-Output 'ready'\r\n")
        report = learning.check_tree(self.root, windows_release=True)
        self.assertFalse(report["ok"])
        self.assertIn("WINDOWS_ENTRYPOINT", self.ids(report))

    def test_cmd_encoding_rejects_lf_and_non_ascii(self):
        self.write("data/run.ps1", "Write-Output 'ready'\r\n")
        for content in ("@echo off\necho ready\n", "@echo off\r\necho 완료\r\n"):
            with self.subTest(content=content):
                self.write("실행.cmd", content)
                report = learning.check_tree(self.root)
                self.assertFalse(report["ok"])
                self.assertIn("CMD_ENCODING", self.ids(report))

    def test_same_input_fingerprint_is_stable_and_change_invalidates_it(self):
        self.write("run.ps1", "Write-Output 'first'\n")
        first = learning.check_tree(self.root)
        self.assertEqual(first["fingerprint"], learning.check_tree(self.root)["fingerprint"])
        self.write("run.ps1", "Write-Output 'second'\n")
        self.assertNotEqual(first["fingerprint"], learning.check_tree(self.root)["fingerprint"])

    def test_supplied_snapshot_scope_is_respected(self):
        self.write("good.ps1", "Write-Output 'ready'\n")
        self.write("excluded.ps1", "function h {}\n")
        manifest = integrity.snapshot(self.root, exclude_paths=["excluded.ps1"])
        report = learning.check_tree(self.root, files=manifest["files"])
        self.assertTrue(report["ok"], report)

    def test_static_checks_do_not_claim_powershell_or_windows_execution(self):
        self.entrypoint()
        self.write("data/run.ps1", "Write-Output 'ready'\r\n")
        report = learning.check_tree(self.root)
        self.assertTrue(report["ok"], report)
        self.assertEqual(report["powershell_syntax"], "not_run")
        self.assertEqual(report["windows_execution"], "not_run")

    def test_bad_source_stops_packaging_before_output_publication(self):
        self.write("tools/broken.ps1", "function H {}\n")
        output = self.base / "candidate.zip"
        with self.assertRaises(integrity.IntegrityError):
            integrity.package(self.root, output)
        self.assertFalse(output.exists())
        self.assertFalse(output.with_name(output.name + ".manifest.json").exists())

    def test_windows_encoding_gate_is_automatic_in_package(self):
        self.entrypoint()
        self.write("data/run.ps1", "Write-Output '완료'\r\n")
        output = self.base / "candidate.zip"
        with self.assertRaises(integrity.IntegrityError):
            integrity.package(self.root, output)
        self.assertFalse(output.exists())
        self.write("data/run.ps1", "Write-Output '완료'\r\n", bom=True)
        result = integrity.package(self.root, output)
        self.assertTrue(result["ok"])
        self.assertTrue(result["development_preflight"]["ok"])
        self.assertTrue(output.is_file())

    def test_plain_source_zip_preserves_existing_packaging_behavior(self):
        self.write("app.py", "print('source only')\n")
        output = self.base / "source.zip"
        result = integrity.package(self.root, output)
        self.assertTrue(result["ok"])
        self.assertTrue(result["development_preflight"]["ok"])
        self.assertTrue(output.with_name(output.name + ".manifest.json").is_file())

    def test_existing_package_bytes_are_preserved_even_with_overwrite(self):
        self.write("app.py", "print('first candidate')\n")
        output = self.base / "source.zip"
        integrity.package(self.root, output)
        sidecar = output.with_name(output.name + ".manifest.json")
        original = (output.read_bytes(), sidecar.read_bytes())
        self.write("app.py", "print('different candidate')\n")
        with self.assertRaises(integrity.IntegrityError):
            integrity.package(self.root, output, overwrite=True)
        self.assertEqual((output.read_bytes(), sidecar.read_bytes()), original)

    def test_new_package_sidecar_failure_removes_new_zip_with_overwrite(self):
        self.write("app.py", "print('new candidate')\n")
        output = self.base / "source.zip"
        with mock.patch.object(integrity, "_write_json", side_effect=OSError("injected sidecar failure")):
            with self.assertRaises(OSError):
                integrity.package(self.root, output, overwrite=True)
        self.assertFalse(output.exists())
        self.assertFalse(output.with_name(output.name + ".manifest.json").exists())

    def ledger(self):
        path = self.base / "lessons.json"
        path.write_text(json.dumps({"schema": "jh.development-lessons.v1", "lessons": []}), encoding="utf-8")
        return path

    def incident(self):
        return {"id": "TEST-PS-001", "kind": "incident", "state": "verified",
                "scope": ["powershell"], "symptom": "Local helper shadows a shell alias",
                "cause": "Helper used an existing alias name", "resolution": "Use a distinct helper name",
                "checks": ["PS_ALIAS_COLLISION"],
                "evidence": [{"role": role, "ref": "test-fixture:" + role}
                             for role in ("failure", "fix", "success")]}

    def test_lesson_append_and_identical_duplicate_are_idempotent(self):
        path, entry = self.ledger(), self.incident()
        learning.record_lesson(entry, path)
        original = path.read_bytes()
        learning.record_lesson(copy.deepcopy(entry), path)
        self.assertEqual(path.read_bytes(), original)
        self.assertEqual(json.loads(original)["lessons"], [entry])

    def test_existing_lesson_cannot_be_silently_rewritten(self):
        path, entry = self.ledger(), self.incident()
        learning.record_lesson(entry, path)
        original = path.read_bytes()
        changed = copy.deepcopy(entry)
        changed["resolution"] = "Replacement without a new record"
        with self.assertRaises(ValueError):
            learning.record_lesson(changed, path)
        self.assertEqual(path.read_bytes(), original)

    def test_verified_incident_requires_evidence_and_a_regression_check(self):
        for missing in ("failure", "fix", "success", "checks"):
            with self.subTest(missing=missing):
                path, entry = self.ledger(), self.incident()
                if missing == "checks":
                    entry["checks"] = []
                else:
                    entry["evidence"] = [e for e in entry["evidence"] if e["role"] != missing]
                original = path.read_bytes()
                with self.assertRaises(ValueError):
                    learning.record_lesson(entry, path)
                self.assertEqual(path.read_bytes(), original)

    def test_invalid_evidence_role_is_rejected_without_clobber(self):
        path, entry = self.ledger(), self.incident()
        entry["evidence"].append({"role": "execute", "ref": "arbitrary code"})
        original = path.read_bytes()
        with self.assertRaises(ValueError):
            learning.record_lesson(entry, path)
        self.assertEqual(path.read_bytes(), original)

    def test_registry_and_user_scripts_are_data_not_executable_instructions(self):
        path, entry = self.ledger(), self.incident()
        marker = self.base / "must-not-exist.txt"
        entry["resolution"] = f"__import__('pathlib').Path({str(marker)!r}).write_text('executed')"
        learning.record_lesson(entry, path)
        self.write("run.ps1", f"Set-Content -LiteralPath '{marker}' -Value 'executed'\n")
        report = learning.check_tree(self.root, registry=path)
        self.assertTrue(report["ok"], report)
        self.assertFalse(marker.exists())


if __name__ == "__main__":
    unittest.main()
