#!/usr/bin/env python3
"""Use actual reviewed host source; no device, network, secrets or install."""
import argparse, importlib.util, shutil, tempfile, unittest
from pathlib import Path
MODULE=Path(__file__).with_name('prepare_host_candidate.py')
spec=importlib.util.spec_from_file_location('candidate',MODULE); candidate=importlib.util.module_from_spec(spec);spec.loader.exec_module(candidate)
SOURCE=None
class CandidateTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory(prefix='kabiseo-v08-tests-');self.root=Path(self.temp.name)
 def tearDown(self):self.temp.cleanup()
 def copy_source(self):
  dest=self.root/'source';shutil.copytree(SOURCE,dest);return dest
 def test_exact_input_changes_only_three_and_adds_six(self):
  before=candidate.digest_tree(SOURCE);out=self.root/'candidate';r=candidate.prepare(SOURCE,out)
  self.assertEqual(len(r['changed']),3);self.assertEqual(len(r['added']),6);self.assertEqual(r['unchanged_original_files'],430)
  self.assertTrue(r['manifest_unchanged'] and r['app_gradle_unchanged']);self.assertFalse(r['runtime_enabled']);self.assertFalse(r['upstream_release_archive_verified'])
  self.assertEqual(candidate.digest_tree(SOURCE),before);self.assertIn(candidate.NEW,(out/candidate.AGENT).read_text())
 def test_changed_agent_rejected(self):
  s=self.copy_source();p=s/candidate.AGENT;p.write_text(p.read_text()+'\n// changed\n')
  with self.assertRaises(ValueError):candidate.prepare(s,self.root/'out')
  self.assertFalse((self.root/'out').exists())
 def test_previously_unguarded_source_change_rejected(self):
  s=self.copy_source();p=s/'app/src/main/assets/jh-release.json';p.write_text(p.read_text()+'\n')
  with self.assertRaises(ValueError):candidate.prepare(s,self.root/'out')
 def test_additional_file_rejected(self):
  s=self.copy_source();(s/'unexpected.txt').write_text('x')
  with self.assertRaises(ValueError):candidate.prepare(s,self.root/'out')
 def test_missing_file_rejected(self):
  s=self.copy_source();(s/'gradle.properties').unlink()
  with self.assertRaises(ValueError):candidate.prepare(s,self.root/'out')
 def test_symbolic_link_rejected(self):
  s=self.copy_source();(s/'alias').symlink_to(s/'gradle.properties')
  with self.assertRaises(ValueError):candidate.prepare(s,self.root/'out')
 def test_existing_output_preserved(self):
  out=self.root/'out';out.mkdir();(out/'marker').write_text('keep')
  with self.assertRaises(ValueError):candidate.prepare(SOURCE,out)
  self.assertEqual((out/'marker').read_text(),'keep')
 def test_output_inside_input_rejected(self):
  with self.assertRaises(ValueError):candidate.prepare(SOURCE,SOURCE/'nested-output')
 def test_stage75_changed_baseline_not_silently_downgraded(self):
  s=self.copy_source();p=s/candidate.AGENT;p.write_text(p.read_text().replace(candidate.OLD,candidate.NEW))
  before=candidate.digest_tree(s)
  with self.assertRaises(ValueError):candidate.prepare(s,self.root/'out')
  self.assertEqual(candidate.digest_tree(s),before)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--source',required=True,type=Path);args,other=p.parse_known_args();SOURCE=args.source.resolve()
 unittest.main(argv=['test_prepare_candidate.py',*other])
