#!/usr/bin/env python3
"""Reproduce reviewed v0.8 host candidate, NOT install or overwrite current JH.
Accepts only the complete 433-file historical source fingerprint; adds v0.7 wiring
and the exact functional Stage75/PR165 Kotlin fix in a NEW output directory.
Does not claim byte-identical Stage75 release archive or change app release identity.
"""
import argparse,hashlib,importlib.util,json,os,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
AGENT='app/src/main/java/com/koreanlifehub/bridge/AndroidAgent.kt'
OLD='        if(TripAgentTransport.matches(step))return TripAgentTransport.execute(service,step)\n        SplitComfortRuntime.gate(service)?.let { return it }\n        when {'
NEW='        if(TripAgentTransport.matches(step)) TripAgentTransport.execute(service,step)\n        else SplitComfortRuntime.gate(service) ?: when {'
def digest_tree(root):
 if any(p.is_symlink() for p in root.rglob('*')):raise ValueError('symlinks are not accepted')
 entries={p.relative_to(root).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(root.rglob('*')) if p.is_file()}
 return entries,hashlib.sha256(json.dumps(entries,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def prepare(source,output):
 source=Path(source).resolve();output=Path(output).resolve()
 if output.exists() or output==source or source in output.parents or output in source.parents:raise ValueError('output must be NEW and separate')
 baseline=json.loads((ROOT/'integration/host-source-tree-v08.json').read_text())
 before,tree_sha=digest_tree(source)
 if len(before)!=baseline['files'] or tree_sha!=baseline['source_tree_sha256']:raise ValueError('unknown/newer/incomplete baseline; reconcile instead of overwrite')
 original=(source/AGENT).read_text()
 if original.count(OLD)!=1:raise ValueError('upstream repair anchor is not unique')
 spec=importlib.util.spec_from_file_location('v07_patch',ROOT/'tools/apply_host_patch.py');patch=importlib.util.module_from_spec(spec);spec.loader.exec_module(patch)
 output.parent.mkdir(parents=True,exist_ok=True)
 with tempfile.TemporaryDirectory(prefix='kabiseo-review-',dir=output.parent) as temp:
  candidate=Path(temp)/'candidate';patch.apply(source,candidate)
  p=candidate/AGENT;p.write_text(original.replace(OLD,NEW,1))
  after,after_sha=digest_tree(candidate)
  changed=sorted(n for n in before if before[n]!=after.get(n));added=sorted(set(after)-set(before))
  expected=sorted([AGENT,'app/src/main/java/com/koreanlifehub/bridge/BridgeService.kt','app/src/main/java/com/koreanlifehub/bridge/SecureBridge56.kt'])
  if changed!=expected or len(added)!=6 or set(before)-set(after):raise ValueError('unexpected mutation')
  bridge=(candidate/expected[1]).read_text()
  if 'kabiseoCameraMetadataEnabled=false' not in bridge:raise ValueError('camera route must remain disabled')
  if digest_tree(source)[1]!=tree_sha:raise ValueError('input source changed during preparation')
  if output.exists():raise ValueError('output appeared during preparation')
  # New directory only; no original/installed project is replaced.
  os.rename(candidate,output)
 report={'schema':'KABISEO_V08_HOST_CANDIDATE','source_tree_sha256':tree_sha,'candidate_tree_sha256':after_sha,
  'changed':changed,'added':added,'unchanged_original_files':len(before)-len(changed),
  'upstream_repair_commit':'e7c6fc94776ebbf8392377624c41c95f0c90fb8a','upstream_repair_pr':165,
  'upstream_release_archive_verified':False,'runtime_enabled':False,'apk_built':False,'installed':False,
  'settings_changed':False,'manifest_unchanged':before['app/src/main/AndroidManifest.xml']==after['app/src/main/AndroidManifest.xml'],
  'app_gradle_unchanged':before['app/build.gradle.kts']==after['app/build.gradle.kts']}
 (output.parent/(output.name+'-v08-report.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
 return report
if __name__=='__main__':
 a=argparse.ArgumentParser();a.add_argument('--source',type=Path,required=True);a.add_argument('--output',type=Path,required=True);x=a.parse_args()
 try:print(json.dumps(prepare(x.source,x.output),ensure_ascii=False,indent=2))
 except (ValueError,OSError) as e:raise SystemExit('BLOCKED: '+str(e))
