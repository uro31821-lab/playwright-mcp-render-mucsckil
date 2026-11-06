import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('audit_apk', Path(__file__).resolve().parents[1] / 'audit-apk.py')
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)

class CertificateOutputTests(unittest.TestCase):
    def test_actual_build_tools_37_verified_v2_output(self):
        # Actual apksigner output from run 42221253440, original pinned AutoJs6 APK.
        digest = '31a681fcfffb3e428420cae280ded89292b12a3b0f59e19b7a73e32a8ae4c213'
        output = ('Verifies\nVerified using v2 scheme (APK Signature Scheme v2): true\n'
                  f'V2 Signer: certificate SHA-256 digest: {digest}\n'
                  'V2 Signer: public key SHA-256 digest: 5d52e305411b3c34a1142887e8bbb3d9c4f5abcdf2ecfcce36c8cc7162d19aa1\n')
        self.assertEqual(audit.certificate_digests(output), [digest])

    def test_legacy_and_v3_sdk_range_signer_formats(self):
        digest = 'ab' * 32
        for label in ['Signer #1', 'Signer (minSdkVersion=28, maxSdkVersion=2147483647)',
                      'Signer (minSdkVersion=33 (dev release=true), maxSdkVersion=2147483647)']:
            with self.subTest(label=label):
                self.assertEqual(audit.certificate_digests(f'{label} certificate SHA-256 digest: {digest}\r\n'), [digest])

    def test_source_stamp_other_digest_and_malformed_values_do_not_count_as_apk_signer(self):
        digest = 'ab' * 32
        for line in [f'Source Stamp Signer certificate SHA-256 digest: {digest}',
                     f'Signer #1 certificate SHA-1 digest: {digest}',
                     'Signer #1 certificate SHA-256 digest: BAD',
                     f'Signer (unrecognized) certificate SHA-256 digest: {digest}']:
            with self.subTest(line=line):
                self.assertEqual(audit.certificate_digests(line), [])

if __name__ == '__main__':
    unittest.main()
