#!/usr/bin/env python3
"""Compile a supplied Android host against actual SDK35 and pinned public dependencies.
No source stubs, device connection, signing, install, Gradle substitution, or APK success claim.
Resource-only link output is NOT a usable APK and is deliberately named resources.ap_.
"""
import argparse, hashlib, json, os, subprocess, time, zipfile
from pathlib import Path
import xml.etree.ElementTree as ET

def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
 a=argparse.ArgumentParser();a.add_argument('--source',type=Path,required=True);a.add_argument('--kit',type=Path,required=True);a.add_argument('--output',type=Path,required=True);a.add_argument('--dex',action='store_true');args=a.parse_args()
 source=args.source.resolve();kit=args.kit.resolve();out=args.output.resolve()
 if out.exists() or source==out or source in out.parents: raise SystemExit('Use a NEW output directory outside source')
 m=json.loads((kit/'MANIFEST.json').read_text())
 for name,item in m['files'].items():
  p=kit/name
  if not p.is_file() or p.is_symlink() or not p.resolve().is_relative_to(kit) or p.stat().st_size!=item['size'] or sha(p)!=item['sha256']:raise SystemExit('Compiler-kit integrity failed: '+name)
 before={p.relative_to(source).as_posix():sha(p) for p in source.rglob('*') if p.is_file()}
 out.mkdir(parents=True);(out/'classes').mkdir();(out/'generated').mkdir();(out/'kotlin-classes').mkdir()
 report={'schema':'KABISEO_FULL_HOST_SOURCE_COMPILE_V1','kit_git_sha':m['git_sha'],'kit_run_id':m['run_id'],'actual_android_sdk':35,'kotlin_compiler':'1.9.24','jvm_target':17,'gradle_full_app_build':False,'apk_built':False,'signed':False,'phone_installed':False,'device_tested':False,'stubs_added':False,'steps':[],'source_sha256':before}
 def run(label,cmd):
  started=time.monotonic();print('RUN',label,flush=True)
  with (out/(label+'.log')).open('w') as f:
   f.write('COMMAND: '+json.dumps(cmd)+'\n');f.flush()
   r=subprocess.run(cmd,stdout=f,stderr=subprocess.STDOUT,timeout=240)
  report['steps'].append({'name':label,'exit_code':r.returncode,'seconds':round(time.monotonic()-started,3)})
  print('RESULT',label,r.returncode,flush=True)
  if r.returncode:raise RuntimeError(label+' failed')
 try:
  aapt=kit/'sdk/aapt2';aapt.chmod(0o755)
  run('aapt2-compile',[str(aapt),'compile','--dir',str(source/'app/src/main/res'),'-o',str(out/'resources.zip')])
  manifest=ET.parse(source/'app/src/main/AndroidManifest.xml');manifest.getroot().set('package','com.koreanlifehub.bridge')
  manifest.write(out/'verification-manifest.xml',encoding='utf-8',xml_declaration=True)
  run('aapt2-link',[str(aapt),'link','-o',str(out/'resources.ap_'),'-I',str(kit/'sdk/android.jar'),'--manifest',str(out/'verification-manifest.xml'),'--java',str(out/'generated'),'--min-sdk-version','26','--target-sdk-version','35',str(out/'resources.zip')])
  deps=sorted((kit/'deps').glob('*.jar'))
  cp=os.pathsep.join(map(str,[kit/'sdk/android.jar',*deps]))
  java=sorted((source/'app/src/main').rglob('*.java'))+sorted((out/'generated').rglob('*.java'))
  run('javac-host',['javac','--release','17','-encoding','UTF-8','-cp',cp,'-d',str(out/'classes'),*map(str,java)])
  kt=sorted((source/'app/src/main').rglob('*.kt'))
  compiler=os.pathsep.join(map(str,sorted((kit/'compiler').glob('*.jar'))))
  run('kotlinc-host',['java','-Xmx3g','-cp',compiler,'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler','-no-stdlib','-no-reflect','-no-jdk','-jvm-target','17','-module-name','JhHostCandidate','-classpath',cp+os.pathsep+str(out/'classes'),'-d',str(out/'kotlin-classes'),*map(str,kt)])
  report.update(kotlin_source_count=len(kt),java_source_count=len(java)-len(list((out/'generated').rglob('*.java'))),generated_resource_java_count=len(list((out/'generated').rglob('*.java'))))
  with zipfile.ZipFile(out/'host-classes.jar','w',zipfile.ZIP_DEFLATED) as z:
   for root in (out/'classes',out/'kotlin-classes'):
    for p in sorted(root.rglob('*')):
     if p.is_file():z.write(p,p.relative_to(root).as_posix())
  report['host_classes_sha256']=sha(out/'host-classes.jar')
  if args.dex:
   (out/'dex').mkdir();cmd=['java','-Xmx3g','-cp',str(kit/'sdk/d8.jar'),'com.android.tools.r8.D8','--release','--min-api','26','--lib',str(kit/'sdk/android.jar')]
   for dep in deps:cmd+=['--classpath',str(dep)]
   cmd+=['--output',str(out/'dex'),str(out/'host-classes.jar')]
   run('d8-host',cmd)
   report['dex_sha256']={p.name:sha(p) for p in sorted((out/'dex').glob('*.dex'))}
  report['status']='PASS_SOURCE_COMPILE'
 except (RuntimeError,subprocess.TimeoutExpired,Exception) as e:
  report['status']='FAIL';report['failure']=str(e);print('FAIL',e,flush=True)
 finally:
  after={p.relative_to(source).as_posix():sha(p) for p in source.rglob('*') if p.is_file()}
  report['source_unchanged']=before==after
  if not report['source_unchanged']:report['status']='FAIL_SOURCE_MUTATED'
  report['runtime_java']=subprocess.run(['java','-version'],capture_output=True,text=True).stderr.strip()
  (out/'RESULT.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
 return 0 if report['status']=='PASS_SOURCE_COMPILE' else 1
if __name__=='__main__':raise SystemExit(main())
