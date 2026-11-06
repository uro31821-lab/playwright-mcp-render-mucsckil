"""Synthetic rejection tests for the importer, NOT actual Node security evidence."""
import io, struct, tarfile, tempfile, unittest
from pathlib import Path
from verify_runtime import ARCHIVE, ROOT, PRIMARY, GateError, checksum, signature, extract_only_node

class RuntimeGateTests(unittest.TestCase):
    def test_exact_checksum(self):
        self.assertEqual(checksum('a' * 64 + '  ' + ARCHIVE + '\n'), 'a' * 64)
    def test_wrong_or_duplicate_checksum(self):
        for text in ('', 'a' * 63 + '  ' + ARCHIVE, 'a' * 64 + '  wrong.tar.xz',
                     ('a' * 64 + '  ' + ARCHIVE + '\n') * 2):
            with self.subTest(text=text), self.assertRaises(GateError): checksum(text)
    def test_pinned_signature(self):
        s = '[GNUPG:] VALIDSIG ' + PRIMARY + ' 2026-10-28 1793174400 0 4 0 1 10 00 ' + PRIMARY
        self.assertEqual(signature(s)['primaryFingerprint'], PRIMARY)
    def test_signature_rejections(self):
        s = '[GNUPG:] VALIDSIG ' + PRIMARY + ' 2026-10-28 1793174400 0 4 0 1 10 00 ' + PRIMARY
        for text in ('', s + '\n' + s, s + '\n[GNUPG:] REVKEYSIG test', s.replace(PRIMARY, 'A' * 40),
                     s.replace('1 10 00', '1 2 00')):
            with self.subTest(text=text), self.assertRaises(GateError): signature(text)
    def archive(self, path, extras=(), elf=True):
        header = bytearray(64)
        if elf: header[:6] = b'\x7fELF\x02\x01'; header[18:20] = struct.pack('<H', 62)
        with tarfile.open(path, 'w:xz') as t:
            n = tarfile.TarInfo(ROOT + '/bin/node'); n.size = len(header); n.mode = 0o755
            t.addfile(n, io.BytesIO(header))
            for name, kind, link in extras:
                m = tarfile.TarInfo(name); m.type = kind; m.linkname = link
                t.addfile(m, io.BytesIO(b''))
    def test_only_node_materialized_without_execution_bit(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d); self.archive(root / 'in.xz', [(ROOT + '/bin/npm', tarfile.SYMTYPE, '../lib/npm.js')])
            out = root / 'out/bin/node'; r = extract_only_node(root / 'in.xz', out)
            self.assertEqual(r['extractedFiles'], ['bin/node']); self.assertEqual(out.stat().st_mode & 0o111, 0)
            self.assertFalse((out.parent / 'npm').exists())
    def test_unsafe_archive_members(self):
        for name, kind, link in [('../escape', tarfile.REGTYPE, ''), ('/absolute', tarfile.REGTYPE, ''),
                                (ROOT + '/bin/node', tarfile.REGTYPE, ''),
                                (ROOT + '/device', tarfile.CHRTYPE, ''),
                                (ROOT + '/bin/link', tarfile.SYMTYPE, '/etc/passwd'),
                                (ROOT + '/bin/link', tarfile.SYMTYPE, '../../../etc/passwd')]:
            with self.subTest(name=name, link=link), tempfile.TemporaryDirectory() as d:
                root = Path(d); self.archive(root / 'in.xz', [(name, kind, link)])
                with self.assertRaises(GateError): extract_only_node(root / 'in.xz', root / 'out/bin/node')
    def test_non_elf_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d); self.archive(root / 'in.xz', elf=False)
            with self.assertRaises(GateError): extract_only_node(root / 'in.xz', root / 'out/bin/node')

if __name__ == '__main__': unittest.main()
