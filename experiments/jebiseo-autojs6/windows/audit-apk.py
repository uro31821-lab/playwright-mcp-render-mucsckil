#!/usr/bin/env python3
"""Verify the pinned upstream release APK with Android's actual build tools."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def certificate_digests(signature_output):
    # Android apksig prints numbered legacy signers or explicit v3 SDK ranges.
    # Source: AOSP apksig 184702d9d18877edf9e5296c4e191cf0aa2b5fbb, ApkSignerTool.java.
    pattern = re.compile(r'^Signer (?:#\d+|\(minSdkVersion=\d+(?: \(dev release=true\))?, maxSdkVersion=\d+\)) certificate SHA-256 digest: ([a-fA-F0-9]{64})$')
    return [match[1].lower() for line in signature_output.splitlines()
            if (match := pattern.fullmatch(line.strip()))]

def main():
    root = Path(sys.argv[1]).resolve()
    manifest_path = root / 'assets.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    apk = root / 'payload/autojs6.apk'
    expected = '3a1415cb4f09123b7ed4911dd536280300ac722a97938d89043e48a7340a86fc'
    if apk.stat().st_size != 37708838 or digest(apk) != expected:
        raise RuntimeError('OFFICIAL_APK_BYTES_MISMATCH')
    sdk = Path(os.environ.get('ANDROID_HOME') or os.environ.get('ANDROID_SDK_ROOT') or '/usr/local/lib/android/sdk')
    candidates = [p for p in (sdk / 'build-tools').glob('*') if (p / 'aapt').is_file() and (p / 'apksigner').is_file()]
    if not candidates:
        raise RuntimeError('ANDROID_AUDIT_TOOLS_MISSING')
    build_tools = sorted(candidates, key=lambda p: tuple(int(v) for v in re.findall(r'\d+', p.name)), reverse=True)[0]
    def output(tool, *args):
        return subprocess.run([str(build_tools / tool), *map(str, args)], check=True, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT).stdout
    badging = output('aapt', 'dump', 'badging', apk)
    package = re.search(r"^package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'", badging, re.M)
    if not package or package[1] != 'org.autojs.autojs6' or package[3] != '6.8.0':
        raise RuntimeError('APK_IDENTITY_MISMATCH')
    signature = output('apksigner', 'verify', '--verbose', '--print-certs', apk)
    certificates = certificate_digests(signature)
    if not certificates:
        print(signature[:16000], file=sys.stderr)
        raise RuntimeError('APK_CERTIFICATE_NOT_OBSERVED')
    audit = {'schema': 'jebiseo.upstream-apk-audit.v1', 'package': package[1], 'versionName': package[3],
        'versionCode': int(package[2]), 'sha256': expected, 'size': apk.stat().st_size,
        'signatureVerified': True, 'certificateSha256': sorted(set(certificates)),
        'signatureToolOutput': signature[:16000],
        'modifiedOrResigned': False, 'deviceInstalled': False, 'buildTools': build_tools.name,
        'sourceCommit': os.environ.get('GITHUB_SHA'), 'runId': os.environ.get('GITHUB_RUN_ID'),
        'officialRelease': 'https://github.com/SuperMonster003/AutoJs6/releases/tag/v6.8.0',
        'officialSourceCommit': 'b7c88e117d70176058ae0c035194a7c188ffb8c2'}
    audit_path = root / 'apk-audit.json'
    audit_path.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    manifest['versionCode'] = int(package[2])
    manifest['files'].append({'path': 'apk-audit.json', 'sha256': digest(audit_path), 'size': audit_path.stat().st_size})
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(audit, ensure_ascii=False))

if __name__ == '__main__':
    main()
