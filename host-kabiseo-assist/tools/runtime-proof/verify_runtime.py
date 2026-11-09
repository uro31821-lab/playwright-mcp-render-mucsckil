#!/usr/bin/env python3
"""Verify the exact public Node executable BEFORE executing it in disposable CI.
No production access, owner keys, private source upload, installer or npm extraction.
A scoped SAFE receipt is not a deployment approval or a malware-free guarantee.
"""
import argparse, datetime as dt, hashlib, json, os, posixpath, re, shutil, struct
import subprocess, tarfile
from pathlib import Path, PurePosixPath

VERSION = '26.13.0'
ROOT = 'node-v' + VERSION + '-linux-x64'
ARCHIVE = ROOT + '.tar.xz'
PRIMARY = 'C82FA3AE1CBEDC6BE46B9360C43CEC45C17AB93C'
KEY_COMMIT = '481637f813e912c4aa3622d7964ab426c97b8e8d'
DIST = 'https://nodejs.org/download/release/v' + VERSION + '/'
KEY_URL = 'https://raw.githubusercontent.com/nodejs/release-keys/' + KEY_COMMIT + '/keys/' + PRIMARY + '.asc'

class GateError(RuntimeError):
    pass

def need(ok, code):
    if not ok:
        raise GateError(code)

def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()

def command(args, timeout=120):
    result = subprocess.run(args, text=True, capture_output=True, timeout=timeout)
    need(result.returncode == 0, 'COMMAND_FAILED:' + Path(args[0]).name)
    return result.stdout

def download(url, dest, cap):
    final = command(['curl', '--fail', '--silent', '--show-error', '--location',
        '--proto', '=https', '--proto-redir', '=https', '--tlsv1.2', '--retry', '1',
        '--connect-timeout', '20', '--max-time', '180', '--max-filesize', str(cap),
        '--output', str(dest), '--write-out', '%{url_effective}', url], timeout=200)
    need(final == url, 'UNEXPECTED_REDIRECT')
    need(dest.is_file() and 0 < dest.stat().st_size <= cap, 'DOWNLOAD_SIZE')

def checksum(text):
    found = []
    for line in text.splitlines():
        match = re.fullmatch(r'([0-9a-f]{64})  (\S+)', line)
        need(match is not None, 'CHECKSUM_FORMAT')
        if match[2] == ARCHIVE:
            found.append(match[1])
    need(len(found) == 1, 'EXACT_ARCHIVE_CHECKSUM_REQUIRED')
    return found[0]

def signature(status):
    records = [line.split()[1:] for line in status.splitlines() if line.startswith('[GNUPG:] ')]
    bad = {'BADSIG', 'ERRSIG', 'EXPSIG', 'EXPKEYSIG', 'REVKEYSIG', 'KEYEXPIRED', 'SIGEXPIRED'}
    need(not any(r and r[0] in bad for r in records), 'SIGNATURE_REJECTED')
    valid = [r for r in records if r and r[0] == 'VALIDSIG']
    need(len(valid) == 1, 'ONE_VALID_SIGNATURE_REQUIRED')
    r = valid[0]
    # GnuPG VALIDSIG: signer, date, timestamp, expiry, version, reserved,
    # public-key algorithm, hash algorithm, class, optional primary fingerprint.
    need(len(r) in (10, 11), 'SIGNATURE_STATUS_FORMAT')
    need((r[10] if len(r) == 11 else r[1]) == PRIMARY, 'SIGNER_NOT_PINNED')
    need(r[8] in ('8', '9', '10', '11'), 'WEAK_SIGNATURE_HASH')
    return {'primaryFingerprint': PRIMARY, 'signingFingerprint': r[1], 'hashAlgorithm': r[8]}

def extract_only_node(archive, executable):
    """Inspect all names/types, but materialize ONLY the single regular ELF executable."""
    with tarfile.open(archive, 'r:xz') as t:
        members = t.getmembers()
        need(0 < len(members) <= 50000, 'ARCHIVE_ENTRY_LIMIT')
        need(sum(m.size for m in members) <= 1024 ** 3, 'ARCHIVE_EXPANSION_LIMIT')
        seen = set(); target = None; links = 0
        for m in members:
            name = m.name.rstrip('/')
            p = PurePosixPath(name)
            need(name and '\\' not in name and '\x00' not in name and not p.is_absolute()
                 and '..' not in p.parts and p.parts[0] == ROOT and name not in seen, 'ARCHIVE_PATH')
            seen.add(name)
            need(not (m.mode & 0o6000) and 0 <= m.size <= 384 * 1024 ** 2, 'ARCHIVE_MODE_OR_SIZE')
            need(m.isdir() or m.isfile() or m.issym(), 'ARCHIVE_SPECIAL_MEMBER')
            if m.issym():
                links += 1
                resolved = posixpath.normpath(posixpath.join(posixpath.dirname(name), m.linkname))
                need(not posixpath.isabs(m.linkname) and '\\' not in m.linkname
                     and resolved.startswith(ROOT + '/'), 'ARCHIVE_LINK_ESCAPE')
            if name == ROOT + '/bin/node':
                need(m.isfile() and m.size >= 64, 'NODE_REGULAR_FILE_REQUIRED')
                target = m
        need(target is not None, 'NODE_EXECUTABLE_MISSING')
        executable.parent.mkdir(parents=True, exist_ok=False)
        with t.extractfile(target) as src, executable.open('xb') as dst:
            shutil.copyfileobj(src, dst, 1024 * 1024)
        executable.chmod(0o600)  # never executable until signature, hash and AV pass
        with executable.open('rb') as f:
            header = f.read(64)
        need(header[:6] == b'\x7fELF\x02\x01' and struct.unpack('<H', header[18:20])[0] == 62,
             'NODE_ELF_X86_64_REQUIRED')
        return {'entriesChecked': len(members), 'linksCheckedNotExtracted': links,
                'extractedFiles': ['bin/node'], 'executableSha256': digest(executable)}

def verify(work, evidence, db):
    work.mkdir(parents=True, exist_ok=False)
    evidence.mkdir(parents=True, exist_ok=False)
    receipt = {'schema': 'KABISEO_EXACT_NODE_SECURITY_V018', 'securityGateVerdict': 'REVIEW',
        'scope': 'Public Node Linux x64 executable for isolated CI only', 'version': VERSION,
        'source': DIST + ARCHIVE, 'keySource': KEY_URL, 'keyCommit': KEY_COMMIT,
        'checkedAtUtc': dt.datetime.now(dt.timezone.utc).isoformat(), 'runtimeExecuted': False,
        'productionChanged': False, 'deploymentApproved': False, 'externalSampleUpload': False}
    try:
        for tool in ('curl', 'gpg', 'clamscan'):
            need(shutil.which(tool), 'MISSING_TOOL:' + tool)
        key, sums, sig, archive = (work / n for n in ('release-key.asc', 'SHASUMS256.txt', 'SHASUMS256.txt.sig', ARCHIVE))
        for url, dest, cap in ((KEY_URL, key, 100000), (DIST + sums.name, sums, 100000),
                               (DIST + sig.name, sig, 100000)):
            download(url, dest, cap)
        home = work / 'gpg'; home.mkdir(mode=0o700)
        gpg = ['gpg', '--no-options', '--homedir', str(home), '--batch', '--no-auto-key-retrieve']
        command(gpg + ['--import', str(key)])
        listing = command(gpg + ['--with-colons', '--fingerprint', '--list-keys'])
        first = next((line.split(':')[9] for line in listing.splitlines() if line.startswith('fpr:')), None)
        need(first == PRIMARY, 'IMPORTED_KEY_FINGERPRINT')
        receipt['signatureEvidence'] = signature(command(gpg + ['--status-fd', '1', '--verify', str(sig), str(sums)]))
        expected = checksum(sums.read_text())
        download(DIST + ARCHIVE, archive, 128 * 1024 ** 2)
        need(digest(archive) == expected, 'ARCHIVE_CHECKSUM_MISMATCH')
        receipt.update(provenanceVerified=True, archiveSha256=expected, checksumsSha256=digest(sums))
        executable = work / 'verified-runtime' / 'bin' / 'node'
        receipt['structure'] = extract_only_node(archive, executable)
        av_version = command(['clamscan', '--database=' + str(db), '--version']).strip()
        parts = av_version.split('/', 2)
        need(len(parts) == 3, 'ANTIVIRUS_DATABASE_VERSION_REQUIRED')
        stamp = dt.datetime.strptime(parts[2], '%a %b %d %H:%M:%S %Y').replace(tzinfo=dt.timezone.utc)
        age = (dt.datetime.now(dt.timezone.utc) - stamp).total_seconds()
        need(-86400 <= age <= 7 * 86400, 'ANTIVIRUS_DATABASE_NOT_FRESH')
        scan = subprocess.run(['clamscan', '--database=' + str(db), '--no-summary',
            '--max-filesize=384M', '--max-scansize=512M', '--alert-exceeds-max=yes', str(executable)],
            text=True, capture_output=True, timeout=240)
        (evidence / 'antivirus.log').write_text(scan.stdout + scan.stderr)
        need(scan.returncode == 0 and scan.stdout.strip().endswith(': OK'), 'ANTIVIRUS_NOT_CLEAN_OR_INCOMPLETE')
        receipt['antivirusEvidence'] = {'version': av_version, 'exitCode': scan.returncode,
            'scope': 'The only extracted/executed ELF; no unused npm, headers or fonts materialized',
            'logSha256': digest(evidence / 'antivirus.log')}
        receipt['securityGateVerdict'] = 'SAFE'
        receipt['unresolvedSecurityFindings'] = []
        receipt['limitations'] = ['Not a proof of absolute safety', 'No approval of JH dependencies or production deployment']
        (evidence / 'runtime-security-result.json').write_text(json.dumps(receipt, indent=2) + '\n')
        executable.chmod(0o500)
        observed = subprocess.run([str(executable), '--version'], env={'PATH': os.environ.get('PATH', '')},
            text=True, capture_output=True, timeout=20)
        need(observed.returncode == 0 and observed.stdout.strip() == 'v' + VERSION, 'EXECUTED_VERSION_MISMATCH')
        receipt.update(runtimeExecuted=True, observedVersion=observed.stdout.strip(), executable=str(executable))
        with open(os.environ['GITHUB_OUTPUT'], 'a') as out:
            out.write('node_bin=' + str(executable) + '\n')
    except Exception as error:
        receipt['securityGateVerdict'] = 'BLOCK' if isinstance(error, GateError) and any(
            marker in str(error) for marker in ('MISMATCH', 'ARCHIVE_PATH', 'ARCHIVE_LINK', 'SIGNATURE_REJECTED', 'ANTIVIRUS_NOT_CLEAN')) else 'REVIEW'
        receipt['unresolvedSecurityFindings'] = [str(error)[:240]]
        raise
    finally:
        (evidence / 'runtime-security-result.json').write_text(json.dumps(receipt, indent=2) + '\n')
        print('KABISEO_RUNTIME_SECURITY=' + json.dumps(receipt, sort_keys=True))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    for name in ('work', 'evidence', 'db'):
        parser.add_argument('--' + name, required=True, type=Path)
    args = parser.parse_args()
    verify(args.work.resolve(), args.evidence.resolve(), args.db.resolve())
