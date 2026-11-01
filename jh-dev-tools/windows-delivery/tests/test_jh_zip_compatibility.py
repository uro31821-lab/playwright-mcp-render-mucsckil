"""Check delivered ZIP bytes, including headers consumed by Windows readers."""
from __future__ import annotations

import hashlib
from pathlib import Path
import struct
import sys
import tempfile
import unittest
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import jh_integrity as integrity


class ZipCompatibilityTests(unittest.TestCase):
    def test_small_bundle_has_zip20_headers_and_preserves_unicode_and_empty_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            root = base / "source"
            root.mkdir()
            files = {
                "실행.cmd": b'@echo off\r\npowershell.exe -NoProfile -File "%~dp0data\\run.ps1"\r\n',
                "data/run.ps1": b"Write-Output 'ready'\r\n",
                "data/payload.bin": bytes(range(256)) * 17,
                "data/empty.txt": b"",
                "사용안내.txt": "전체 압축 해제 후 실행\n".encode("utf-8"),
                "POWER_SHELL_ERROR_CHECKLIST.txt": b"Check paths and preserve prior results.\n",
            }
            for name, contents in files.items():
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(contents)
            output = base / "Windows_Compatible.zip"
            result = integrity.package(root, output, windows_release=True)
            self.assertTrue(result["ok"])
            raw = output.read_bytes()
            # A normal single-disk EOCD terminates this small archive.
            eocd = struct.unpack("<IHHHHIIH", raw[-22:])
            self.assertEqual(eocd[:5], (0x06054B50, 0, 0, len(files), len(files)))
            self.assertEqual(eocd[-1], 0)
            self.assertEqual(eocd[5] + eocd[6], len(raw) - 22)
            with zipfile.ZipFile(output) as archive:
                self.assertIsNone(archive.testzip())
                self.assertEqual(set(archive.namelist()), set(files))
                for info in archive.infolist():
                    with self.subTest(name=info.filename):
                        self.assertEqual(info.extract_version, 20)
                        self.assertEqual(info.compress_type, zipfile.ZIP_DEFLATED)
                        self.assertEqual(info.extra, b"")
                        header = struct.unpack_from("<IHHHHHIIIHH", raw, info.header_offset)
                        self.assertEqual(header[0], 0x04034B50)
                        self.assertEqual(header[1], 20)
                        self.assertEqual(header[2] & 0x0009, 0)  # No encryption or descriptor.
                        self.assertEqual(header[3], zipfile.ZIP_DEFLATED)
                        self.assertEqual(header[6:9], (info.CRC, info.compress_size, info.file_size))
                        self.assertEqual(header[10], 0)  # No local ZIP64 extra.
                        self.assertEqual(archive.read(info), files[info.filename])
                extracted = base / "extracted"
                archive.extractall(extracted)
            for name, contents in files.items():
                self.assertEqual(hashlib.sha256((extracted / name).read_bytes()).digest(),
                                 hashlib.sha256(contents).digest())


if __name__ == "__main__":
    unittest.main()
