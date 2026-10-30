"""Small input/evidence adapter around the existing official REA CLI.

Never executes target source, accepts shell commands, or changes production.
Only committed regular JavaScript files in this repository can be staged.
"""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def git(*args: str) -> bytes:
    return subprocess.run(['git', *args], check=True, capture_output=True,
                          timeout=30).stdout


def write_json(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')


def read_request(path: Path) -> dict:
    if path.stat().st_size > 16384:
        raise ValueError('REQUEST_TOO_LARGE')
    request = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(request, dict) or set(request) != {'schema','request_id','source_commit','paths'}:
        raise ValueError('REQUEST_FIELDS_INVALID')
    if request['schema'] != 'JH_REA_REQUEST_V1':
        raise ValueError('REQUEST_SCHEMA_INVALID')
    if not isinstance(request['request_id'], str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,80}', request['request_id']):
        raise ValueError('REQUEST_ID_INVALID')
    if not isinstance(request['source_commit'], str) or not re.fullmatch(r'[0-9a-f]{40}', request['source_commit']):
        raise ValueError('SOURCE_COMMIT_REQUIRED')
    paths = request['paths']
    if not isinstance(paths, list) or not 1 <= len(paths) <= 32:
        raise ValueError('PATH_COUNT_INVALID')
    for value in paths:
        if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_./-]{1,240}', value):
            raise ValueError('PATH_INVALID')
        p = PurePosixPath(value)
        if (p.is_absolute() or str(p) != value or any(x.startswith('.') for x in p.parts)
            or p.suffix not in {'.js','.mjs','.cjs'}):
            raise ValueError('ONLY_RELATIVE_VISIBLE_JAVASCRIPT_PATHS_ALLOWED')
    if len(set(paths)) != len(paths):
        raise ValueError('DUPLICATE_PATH')
    return request


def prepare(request_path: Path, report: Path) -> None:
    request = read_request(request_path)
    commit = request['source_commit']
    if git('cat-file','-t',commit).strip() != b'commit':
        raise ValueError('SOURCE_IS_NOT_A_COMMIT')
    stage = report / 'target'
    stage.mkdir(parents=True, exist_ok=False)
    manifest = []
    total = 0
    for path in request['paths']:
        entries = git('ls-tree','-z',commit,'--',path).split(b'\0')
        entries = [entry for entry in entries if entry]
        if len(entries) != 1:
            raise ValueError('SOURCE_FILE_MISSING')
        metadata, actual = entries[0].split(b'\t',1)
        mode, kind, blob = metadata.split()
        if actual.decode('utf-8') != path or mode not in {b'100644',b'100755'} or kind != b'blob':
            raise ValueError('SOURCE_NOT_REGULAR_FILE')
        size = int(git('cat-file','-s',blob.decode()).strip())
        total += size
        if size > 2_000_000 or total > 8_000_000:
            raise ValueError('SOURCE_SIZE_LIMIT')
        data = git('cat-file','blob',blob.decode())
        data.decode('utf-8')
        if b'\0' in data:
            raise ValueError('BINARY_SOURCE_REFUSED')
        destination = stage / path
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
        manifest.append({'path':path,'git_blob':blob.decode(),'sha256':digest(data),'bytes':len(data)})
    write_json(stage/'package.json', {'name':'jh-rea-static-input','version':'1.0.0',
                                     'type':'module','main':request['paths'][0]})
    identity = {'source_commit':commit,'files':manifest,'node':'24.22.1','rea':'6.8.0',
                'command':'analyze-javascript-application --json --full-output',
                'adapter_sha256':digest(Path(__file__).read_bytes()),
                'workflow_sha256':digest(Path('.github/workflows/jh168-rea-cli-connection.yml').read_bytes())}
    evidence = {'schema':'JH_REA_INPUT_V1','request_id':request['request_id'], **identity,
                'input_key':digest(json.dumps(identity,sort_keys=True).encode()),
                'runner_commit':git('rev-parse','HEAD').decode().strip(),
                'run_id':os.getenv('GITHUB_RUN_ID'),'attempt':os.getenv('GITHUB_RUN_ATTEMPT'),
                'target_executed':False,'production_changed':False}
    write_json(report/'input.json', evidence)
    print('JH_REA_INPUT_READY '+evidence['input_key'])


def validate(report: Path) -> None:
    identity = json.loads((report/'input.json').read_text(encoding='utf-8'))
    exit_code = int((report/'exit-code.txt').read_text().strip())
    raw = (report/'analysis.json').read_bytes()
    if len(raw) > 25_000_000:
        raise ValueError('REPORT_SIZE_LIMIT')
    result = json.loads(raw)
    if not isinstance(result, dict) or result.get('ok') is not True:
        raise ValueError('REA_ANALYSIS_NOT_OK')
    data = result.get('data')
    if not isinstance(data, dict) or data.get('operation') != 'analyze_javascript_application':
        raise ValueError('REA_OPERATION_MISMATCH')
    normalized = data.get('normalized_result')
    if not isinstance(normalized, dict) or not isinstance(normalized.get('statistics'),dict):
        raise ValueError('REA_STATISTICS_MISSING')
    stats = normalized['statistics']
    expected_path = str((report/'target').resolve())
    if data.get('parameters',{}).get('input_path') != expected_path:
        raise ValueError('REA_TARGET_MISMATCH')
    for record in identity['files']:
        if digest((report/'target'/record['path']).read_bytes()) != record['sha256']:
            raise ValueError('STAGED_INPUT_CHANGED')
    complete = (exit_code == 0 and stats.get('parsed_javascript_files') == len(identity['files'])
                and all(stats.get(k) == 0 for k in
                        ('parse_failures','invalid_utf8_files','skipped_javascript_files')))
    limitations = data.get('limitations',[]) + normalized.get('limitations',[])
    receipt = {**identity,'status':'STATIC_ANALYSIS_COMPLETE' if complete else 'PARTIAL',
               'exit_code':exit_code,'analysis_sha256':digest(raw),'statistics':stats,
               'limitations':list(dict.fromkeys(limitations)),
               'runtime_behavior_verified':False,'apk_analysis_verified':False,
               'chatgpt_direct_mcp_connected':False,
               'node_version':(report/'node-version.txt').read_text().strip(),
               'rea_version':(report/'rea-version.txt').read_text().strip(),
               'dependency_lock_sha256':(report/'dependency-lock.sha256').read_text().strip().split()[0]}
    write_json(report/'receipt.json',receipt)
    summary = 'JH_REA_RECEIPT '+json.dumps(receipt,ensure_ascii=False,sort_keys=True)
    print(summary)
    summary_path = os.getenv('GITHUB_STEP_SUMMARY')
    if summary_path:
        with open(summary_path,'a',encoding='utf-8') as out:
            out.write('## REA static analysis receipt\n\n```json\n'+json.dumps(receipt,ensure_ascii=False,indent=2)+'\n```\n')
    if not complete:
        raise ValueError('REA_PARTIAL_NOT_FULL_SUCCESS')


def main() -> None:
    if len(sys.argv) == 4 and sys.argv[1] == 'prepare':
        prepare(Path(sys.argv[2]),Path(sys.argv[3]))
    elif len(sys.argv) == 3 and sys.argv[1] == 'validate':
        validate(Path(sys.argv[2]))
    else:
        raise ValueError('USAGE_prepare_request_report_OR_validate_report')


if __name__ == '__main__':
    try:
        main()
    except (ValueError,KeyError,OSError,subprocess.SubprocessError) as exc:
        code = str(exc) if re.fullmatch(r'[A-Z][A-Z0-9_]{2,100}',str(exc)) else type(exc).__name__
        print('JH_REA_ADAPTER_FAILED '+code,file=sys.stderr)
        raise SystemExit(2)
