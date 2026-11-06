import json, tempfile, unittest
from pathlib import Path
from unittest.mock import Mock
from execution_policy import SCHEMA, evaluate, read_policy, guarded_call

class ExecutionPolicyTests(unittest.TestCase):
    def test_recorded_advisory_holds_current_runtime(self):
        result = read_policy(Path(__file__).with_name('runtime-policy.json'), '26.13.0')
        self.assertFalse(result['executionAllowed']); self.assertFalse(result['productionDeploymentApproved'])
    def test_missing_malformed_or_wrong_identity_denied(self):
        for p in (None, [], {}, {'schema':SCHEMA,'version':'wrong'}):
            self.assertFalse(evaluate(p,'26.13.0')['executionAllowed'])
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'policy.json'
            self.assertFalse(read_policy(p,'26.13.0')['executionAllowed'])
            p.write_text('not json')
            self.assertFalse(read_policy(p,'26.13.0')['executionAllowed'])
    def test_safe_label_without_review_or_with_findings_is_insufficient(self):
        base={'schema':SCHEMA,'version':'26.13.0','executionAllowed':True,'securityGateVerdict':'SAFE',
              'unresolvedFindings':[],'clearanceReceiptSha256':'a'*64}
        for patch in ({'clearanceReceiptSha256':None},{'unresolvedFindings':['unresolved']},
                      {'securityGateVerdict':'REVIEW'},{'executionAllowed':'true'}):
            self.assertFalse(evaluate({**base,**patch},'26.13.0')['executionAllowed'])
        result=evaluate(base,'26.13.0')
        self.assertTrue(result['executionAllowed']); self.assertFalse(result['productionDeploymentApproved'])
    def test_hold_prevents_callback_and_symlink_policy(self):
        action=Mock()
        with self.assertRaisesRegex(RuntimeError,'SECURITY_HOLD'):
            guarded_call(Path(__file__).with_name('runtime-policy.json'),'26.13.0',action)
        action.assert_not_called()
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'link'; p.symlink_to(Path(__file__).with_name('runtime-policy.json').resolve())
            self.assertFalse(read_policy(p,'26.13.0')['executionAllowed'])

if __name__=='__main__': unittest.main()
