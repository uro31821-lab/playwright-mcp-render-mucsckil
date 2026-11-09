#!/usr/bin/env python3
"""Run against an explicitly supplied original source; no production writes or installation."""
import argparse,importlib.util,json,shutil,tempfile,unittest
from pathlib import Path
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('patch',root/'tools/apply_host_patch.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
parser=argparse.ArgumentParser();parser.add_argument('--source',required=True,type=Path);args=parser.parse_args()
BASE=args.source.resolve();GUARDS=json.loads((root/'integration/host-baseline.json').read_text())['guarded_source_sha256']
class PatchTests(unittest.TestCase):
 def setUp(self):
  self.t=tempfile.TemporaryDirectory();self.base=Path(self.t.name)/'source';self.out=Path(self.t.name)/'output'
  for name in GUARDS:
   p=self.base/name;p.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(BASE/name,p)
 def tearDown(self):self.t.cleanup()
 def test_success_is_off_and_no_apk(self):
  r=mod.apply(self.base,self.out);self.assertFalse(r['runtime_feature_enabled']);self.assertFalse(r['full_host_build_passed']);self.assertEqual(len(r['added']),6)
 def test_existing_output_refused(self):
  self.out.mkdir()
  with self.assertRaises(ValueError):mod.apply(self.base,self.out)
 def test_same_root_refused(self):
  with self.assertRaises(ValueError):mod.apply(self.base,self.base)
 def test_nested_output_refused(self):
  with self.assertRaises(ValueError):mod.apply(self.base,self.base/'nested')
 def test_parent_output_refused(self):
  with self.assertRaises(ValueError):mod.apply(self.base,self.base.parent)
 def test_changed_bridge_refused(self):self.change_guard('BridgeService.kt')
 def test_changed_verifier_refused(self):self.change_guard('SecureBridge56.kt')
 def test_changed_manifest_refused(self):self.change_guard('AndroidManifest.xml')
 def test_changed_gradle_refused(self):self.change_guard('build.gradle.kts')
 def change_guard(self,suffix):
  name=next(n for n in GUARDS if n.endswith(suffix));p=self.base/name;p.write_text(p.read_text()+'\n// newer revision\n')
  with self.assertRaises(ValueError):mod.apply(self.base,self.out)
  self.assertFalse(self.out.exists())
 def test_symlink_refused(self):
  (self.base/'link').symlink_to(self.base/'app')
  with self.assertRaises(ValueError):mod.apply(self.base,self.out)
 def test_original_not_modified(self):
  before={n:mod.sha(self.base/n) for n in GUARDS};mod.apply(self.base,self.out);self.assertEqual(before,{n:mod.sha(self.base/n) for n in GUARDS})
unittest.main(argv=['test_host_patch.py'],verbosity=2)
