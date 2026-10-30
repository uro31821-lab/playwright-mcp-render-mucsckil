"""Offline reuse tests; no REA install or target execution."""
import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile
import bridge
from reuse import reuse


class ReuseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.request = {'schema':'JH_REA_REQUEST_V1','request_id':'new-read',
                        'source_commit':'a'*40,'paths':['src/index.mjs']}
        self.reqfile = self.root/'request.json'
        self.reqfile.write_text(json.dumps(self.request))
        core = {'source_commit':'a'*40,'files':[{'path':'src/index.mjs',
                'git_blob':'b'*40,'sha256':'c'*64,'bytes':10}],
                'node':'24.22.1','rea':'6.8.0',
                'command':'analyze-javascript-application --json --full-output',
                'adapter_sha256':'d'*64,'workflow_sha256':'e'*64}
        self.key = bridge.digest(json.dumps(core,sort_keys=True).encode())
        self.identity = {**core,'schema':'JH_REA_INPUT_V1','input_key':self.key,
                         'request_id':'old-read','runner_commit':'f'*40,
                         'run_id':'123','attempt':'1','target_executed':False,
                         'production_changed':False}
        self.stats = {'parsed_javascript_files':1,'parse_failures':0,
                      'invalid_utf8_files':0,'skipped_javascript_files':0}
        self.result = {'ok':True,'data':{'operation':'analyze_javascript_application',
                       'normalized_result':{'statistics':self.stats},
                       'limitations':['Static analysis only.']}}

    def bundle(self, change=None, receipt=True):
        raw = json.dumps(self.result).encode()
        old = {**self.identity,'status':'STATIC_ANALYSIS_COMPLETE','exit_code':0,
               'analysis_sha256':bridge.digest(raw),'statistics':self.stats}
        files = {'input.json':json.dumps(self.identity).encode(),'analysis.json':raw,
                 'exit-code.txt':b'0\n','node-version.txt':b'v24.22.1\n',
                 'rea-version.txt':b'6.8.0\n','dependency-lock.sha256':b'1'*64+b' lock.json\n'}
        if receipt:
            files['receipt.json'] = json.dumps(old).encode()
        if change:
            change(files)
        path = self.root/'artifact.zip'
        with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED) as z:
            for key,value in files.items():
                z.writestr(key,value)
        return path,bridge.digest(path.read_bytes())

    def run_reuse(self, args=None, **kwargs):
        archive,sha = args or self.bundle(**kwargs)
        with patch.object(bridge.subprocess,'run',side_effect=AssertionError('No process allowed')):
            return reuse(archive,sha,self.reqfile,self.key)

    def test_exact_evidence_reused_without_process(self):
        value = self.run_reuse()
        self.assertEqual(value['status'],'REUSED_PASS')
        self.assertEqual(value['origin_run_id'],'123')
        self.assertEqual(value['new_rea_invocations'],0)
        self.assertEqual(value['dependency_installs'],0)
        self.assertEqual(value['request_id'],'new-read')
        self.assertFalse(value['runtime_behavior_verified'])

    def test_raw_result_without_receipt_is_revalidated_not_claimed_prior_pass(self):
        self.assertEqual(self.run_reuse(receipt=False)['status'],'REVALIDATED_PASS')

    def test_untrusted_archive_or_input_key_rejected(self):
        path,sha = self.bundle()
        for artifact,key in [('0'*64,self.key),(sha,'0'*64)]:
            with self.subTest(artifact=artifact),self.assertRaises(ValueError):
                reuse(path,artifact,self.reqfile,key)

    def test_changed_request_scope_rejected(self):
        for key,value in [('source_commit','b'*40),('paths',['other.mjs'])]:
            request = {**self.request,key:value}
            self.reqfile.write_text(json.dumps(request))
            with self.subTest(key=key),self.assertRaisesRegex(ValueError,'ANALYSIS_INPUT_CHANGED'):
                self.run_reuse()

    def test_execution_failure_and_tool_drift_rejected(self):
        for name,value in [('exit-code.txt',b'1'),('node-version.txt',b'v22.0.0'),
                           ('rea-version.txt',b'6.9.0')]:
            with self.subTest(name=name),self.assertRaises(ValueError):
                self.run_reuse(change=lambda files:files.update({name:value}))

    def test_partial_and_boolean_counts_rejected(self):
        for name,value in [('parse_failures',1),('skipped_javascript_files',1),
                           ('invalid_utf8_files',1),('parsed_javascript_files',0),
                           ('parsed_javascript_files',True)]:
            stats = copy.deepcopy(self.stats)
            self.stats[name] = value
            with self.subTest(name=name,value=value),self.assertRaises(ValueError):
                self.run_reuse()
            self.stats.clear();self.stats.update(stats)

    def test_wrong_operation_and_envelope_rejected(self):
        for result in [{'ok':False},{'ok':True,'data':{'operation':'inspect_android_package'}},
                       {'normalized_result':{'statistics':self.stats}}]:
            with self.subTest(result=result),self.assertRaises(ValueError):
                self.run_reuse(change=lambda files:files.update({'analysis.json':json.dumps(result).encode()}))

    def test_receipt_mismatch_rejected(self):
        def alter(files):
            old = json.loads(files['receipt.json']);old['analysis_sha256']='0'*64
            files['receipt.json']=json.dumps(old).encode()
        with self.assertRaisesRegex(ValueError,'PREVIOUS_RECEIPT_MISMATCH'):
            self.run_reuse(change=alter)

    def test_unexpected_archive_member_rejected_no_extraction(self):
        with self.assertRaisesRegex(ValueError,'ARTIFACT_MEMBERS_INVALID'):
            self.run_reuse(change=lambda files:files.update({'../unsafe':b'x'}))
        self.assertFalse((self.root.parent/'unsafe').exists())


if __name__ == '__main__':
    unittest.main()
