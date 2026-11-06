"""Default-deny local policy. Read-only and Python-only; never downloads or executes Node."""
import json, re
from pathlib import Path

SCHEMA = 'KABISEO_RUNTIME_EXECUTION_POLICY_V018'

def evaluate(policy, version):
    if not isinstance(policy, dict) or policy.get('schema') != SCHEMA or policy.get('version') != version:
        return {'executionAllowed': False, 'reason': 'POLICY_IDENTITY_MISSING_OR_MISMATCH'}
    valid = (policy.get('executionAllowed') is True and policy.get('securityGateVerdict') == 'SAFE'
             and policy.get('unresolvedFindings') == []
             and isinstance(policy.get('clearanceReceiptSha256'), str)
             and re.fullmatch(r'[a-f0-9]{64}', policy['clearanceReceiptSha256']) is not None)
    return {'executionAllowed': bool(valid), 'reason': 'SCOPED_EXECUTION_CLEARANCE_PRESENT' if valid else 'SECURITY_HOLD',
            'productionDeploymentApproved': False}

def read_policy(path, version):
    path = Path(path)
    try:
        if path.is_symlink() or not path.is_file() or path.stat().st_size > 16384:
            raise ValueError('invalid policy file')
        return evaluate(json.loads(path.read_text()), version)
    except (OSError, ValueError, TypeError):
        return {'executionAllowed': False, 'reason': 'POLICY_UNREADABLE', 'productionDeploymentApproved': False}

def guarded_call(path, version, action):
    result = read_policy(path, version)
    if not result['executionAllowed']:
        raise RuntimeError('KABISEO_RUNTIME_SECURITY_HOLD')
    return action()

if __name__ == '__main__':
    print(json.dumps(read_policy(Path(__file__).with_name('runtime-policy.json'), '26.13.0')))
