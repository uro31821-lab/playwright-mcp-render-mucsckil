"""Offline revalidation of an existing verified REA artifact, not a REA runner."""
from __future__ import annotations
import json
from pathlib import Path
import re
import sys
import zipfile
from bridge import digest, read_request


def reuse(archive: Path, archive_sha256: str, request_path: Path,
          expected_input_key: str) -> dict:
    """Revalidate a trusted, previously downloaded Actions artifact offline.

    Both digests must come from the verified CI/checkpoint, NOT from the ZIP
    being checked. No extraction, subprocess, network, installation or REA call.
    This reuses static evidence only; it never replays a device operation.
    """
    request = read_request(request_path)
    if not all(re.fullmatch(r'[0-9a-f]{64}', x) for x in
               (archive_sha256, expected_input_key)):
        raise ValueError('TRUSTED_DIGEST_REQUIRED')
    if archive.stat().st_size > 32_000_000:
        raise ValueError('ARCHIVE_SIZE_LIMIT')
    if digest(archive.read_bytes()) != archive_sha256:
        raise ValueError('ARCHIVE_HASH_MISMATCH')
    required = {'input.json','analysis.json','exit-code.txt','node-version.txt',
                'rea-version.txt','dependency-lock.sha256'}
    allowed = required | {'receipt.json','analysis.stderr'}
    with zipfile.ZipFile(archive) as z:
        entries = z.infolist()
        names = [entry.filename for entry in entries]
        if (len(names) != len(set(names)) or not required <= set(names)
            or not set(names) <= allowed or sum(e.file_size for e in entries) > 32_000_000
            or any(e.file_size > 25_000_000 or e.flag_bits & 1 or
                   ((e.external_attr >> 16) & 0o170000) == 0o120000 for e in entries)):
            raise ValueError('ARTIFACT_MEMBERS_INVALID')
        files = {name:z.read(name) for name in names}
    identity = json.loads(files['input.json'])
    if not isinstance(identity, dict) or identity.get('schema') != 'JH_REA_INPUT_V1':
        raise ValueError('INPUT_SCHEMA_INVALID')
    fields = ('source_commit','files','node','rea','command','adapter_sha256','workflow_sha256')
    key = digest(json.dumps({k:identity[k] for k in fields},sort_keys=True).encode())
    if key != expected_input_key or identity.get('input_key') != key:
        raise ValueError('INPUT_KEY_MISMATCH')
    if (identity['source_commit'] != request['source_commit'] or
        [f['path'] for f in identity['files']] != request['paths']):
        raise ValueError('ANALYSIS_INPUT_CHANGED')
    if (identity['node'] != '24.22.1' or identity['rea'] != '6.8.0' or
        identity['command'] != 'analyze-javascript-application --json --full-output' or
        files['node-version.txt'].decode().strip() != 'v24.22.1' or
        files['rea-version.txt'].decode().strip() != '6.8.0' or
        identity.get('target_executed') is not False or
        identity.get('production_changed') is not False):
        raise ValueError('ANALYSIS_PROFILE_CHANGED')
    if not all(re.fullmatch(r'[1-9][0-9]*',str(identity.get(k,''))) for k in ('run_id','attempt')):
        raise ValueError('ORIGIN_RUN_MISSING')
    if files['exit-code.txt'].strip() != b'0':
        raise ValueError('ORIGINAL_REA_EXECUTION_FAILED')
    output = json.loads(files['analysis.json'])
    if not isinstance(output, dict) or output.get('ok') is not True:
        raise ValueError('REA_ANALYSIS_NOT_OK')
    data = output.get('data')
    if not isinstance(data, dict) or data.get('operation') != 'analyze_javascript_application':
        raise ValueError('REA_OPERATION_MISMATCH')
    normalized = data.get('normalized_result')
    if not isinstance(normalized, dict) or not isinstance(normalized.get('statistics'),dict):
        raise ValueError('REA_STATISTICS_MISSING')
    stats = normalized['statistics']
    counts = {'parsed_javascript_files':len(request['paths']), 'parse_failures':0,
              'invalid_utf8_files':0,'skipped_javascript_files':0}
    if any(type(stats.get(k)) is not int or stats[k] != value for k,value in counts.items()):
        raise ValueError('REA_PARTIAL_NOT_FULL_SUCCESS')
    limits = data.get('limitations',[]) + normalized.get('limitations',[])
    if not all(isinstance(v,str) for v in limits):
        raise ValueError('REA_LIMITATIONS_INVALID')
    analysis_sha = digest(files['analysis.json'])
    prior = json.loads(files['receipt.json']) if 'receipt.json' in files else None
    if prior is not None and (not isinstance(prior,dict) or
        any(prior.get(k) != value for k,value in identity.items()) or
        prior.get('analysis_sha256') != analysis_sha or prior.get('statistics') != stats or
        type(prior.get('exit_code')) is not int or prior['exit_code'] != 0 or
        prior.get('status') != 'STATIC_ANALYSIS_COMPLETE'):
        raise ValueError('PREVIOUS_RECEIPT_MISMATCH')
    return {'schema':'JH_REA_REUSE_V1',
            'status':'REUSED_PASS' if prior is not None else 'REVALIDATED_PASS',
            'request_id':request['request_id'], 'source_commit':identity['source_commit'],
            'input_key':key,'origin_run_id':identity['run_id'],'origin_attempt':identity['attempt'],
            'origin_runner_commit':identity['runner_commit'],'artifact_sha256':archive_sha256,
            'analysis_sha256':analysis_sha,'statistics':stats,
            'limitations':list(dict.fromkeys(limits)),
            'new_rea_invocations':0,'dependency_installs':0,'target_executed':False,
            'runtime_behavior_verified':False,'production_changed':False}


if __name__ == '__main__':
    try:
        if len(sys.argv) != 5:
            raise ValueError('USAGE_ZIP_SHA256_REQUEST_INPUTKEY')
        result = reuse(Path(sys.argv[1]),sys.argv[2],Path(sys.argv[3]),sys.argv[4])
        print(json.dumps(result,ensure_ascii=False,sort_keys=True))
    except (ValueError,KeyError,TypeError,OSError,zipfile.BadZipFile) as exc:
        code = str(exc) if re.fullmatch(r'[A-Z][A-Z0-9_]{2,100}',str(exc)) else type(exc).__name__
        print('JH_REA_REUSE_REFUSED '+code,file=sys.stderr)
        raise SystemExit(2)
