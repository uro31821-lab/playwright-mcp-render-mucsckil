#!/usr/bin/env python3
"""Prepared full Gradle verifier, NOT yet execution-tested. Requires NEW isolated source copy.
No ADB, signer, credentials, live server, network fallback or installer. Source identity retained,
so any unsigned APK produced is a review artifact, NOT a deployable current release.
"""
import argparse,hashlib,json,os,subprocess,time,xml.etree.ElementTree as ET,zipfile
from pathlib import Path

def run(a):
    source=a.source.resolve();kit=a.kit.resolve();evidence=a.evidence.resolve()
    if evidence==source or source in evidence.parents:raise ValueError('evidence must be outside source')
    expected=json.loads(a.source_manifest.read_text())
    def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
    def verify():
        for n,d in expected.items():
            file=source/n
            if not file.resolve().is_relative_to(source) or file.is_symlink() or not file.is_file() or sha(file)!=d:
                raise ValueError('source changed: '+n)
    if any(p.is_symlink() for p in source.rglob('*')):raise ValueError('source symlinks prohibited')
    actual={p.relative_to(source).as_posix() for p in source.rglob('*') if p.is_file()}
    if actual!=set(expected):raise ValueError('source must be an exact clean candidate; no added or missing files')
    verify()
    build=(source/'app/build.gradle.kts').read_text()
    if 'signingConfig = null' not in build:raise ValueError('unsigned build required')
    bridge=(source/'app/src/main/java/com/koreanlifehub/bridge/BridgeService.kt').read_text()
    if 'kabiseoCameraMetadataEnabled=false' not in bridge:raise ValueError('camera must remain OFF')
    if evidence.exists():raise ValueError('new evidence directory required')
    evidence.mkdir(parents=True)
    env=os.environ.copy();env.update(ANDROID_HOME=str(kit/'sdk'),ANDROID_SDK_ROOT=str(kit/'sdk'),GRADLE_USER_HOME=str(kit/'gradle-home'),JAVA_HOME=str(a.java_home.resolve()))
    command=[str(kit/'gradle-8.9/bin/gradle'),'--offline','--no-daemon','--console=plain','--max-workers=2','--continue','-Pkotlin.compiler.execution.strategy=in-process',':app:assembleRelease',':app:testReleaseUnitTest',':app:lintRelease']
    record={'scope':'isolated supplied review source, not proven installed source','command':command,'source_files':len(expected),'feature_enabled':False,'signed':False,'installed':False,'server_deployed':False,'status':'STARTING'}
    (evidence/'command.json').write_text(json.dumps(record,indent=2))
    start=time.monotonic()
    try:
        with (evidence/'gradle.log').open('w') as log:
            result=subprocess.run(command,cwd=source,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=900)
        record['gradle_exit_code']=result.returncode
        verify();record['source_preserved']=True
        files=sorted((source/'app/build/test-results/testReleaseUnitTest').glob('TEST-*.xml'))
        counts={k:0 for k in ('tests','failures','errors','skipped')}
        for f in files:
            root=ET.parse(f).getroot()
            for k in counts:counts[k]+=int(root.get(k,0))
        record['unit_tests']={'reports':len(files),**counts}
        lint=source/'app/build/reports/lint-results-release.xml'
        if lint.is_file():
            issues=[{'id':e.get('id'),'severity':e.get('severity'),'message':e.get('message')} for e in ET.parse(lint).getroot().findall('issue')]
            (evidence/'lint-summary.json').write_text(json.dumps(issues,indent=2))
            record['lint']={'errors':sum(i['severity'] in ('Error','Fatal') for i in issues),'warnings':sum(i['severity']=='Warning' for i in issues),'issues':len(issues)}
        else:record['lint']={'status':'MISSING_REPORT'}
        record['apks']=[]
        for apk in sorted((source/'app/build/outputs/apk/release').glob('*.apk')):
            with zipfile.ZipFile(apk) as z:
                if z.testzip():raise ValueError('APK CRC failure')
                record['apks'].append({'filename':apk.name,'bytes':apk.stat().st_size,'sha256':sha(apk),'dex_files':[n for n in z.namelist() if n.startswith('classes') and n.endswith('.dex')]})
        record['status']='PASS' if result.returncode==0 and files and record['apks'] and record['lint'].get('errors')==0 else 'FAILED_CHECKS'
    except (subprocess.TimeoutExpired,OSError,ValueError,ET.ParseError,zipfile.BadZipFile) as error:
        record['status']='BLOCKED';record['error_type']=type(error).__name__
    finally:
        record['seconds']=round(time.monotonic()-start,2)
        (evidence/'result.json').write_text(json.dumps(record,indent=2))
    print(json.dumps(record,indent=2))
    return 0 if record['status']=='PASS' else 1

if __name__=='__main__':
    p=argparse.ArgumentParser()
    for key in ('kit','source','source-manifest','evidence','java-home'):p.add_argument('--'+key,type=Path,required=True)
    a=p.parse_args()
    try:raise SystemExit(run(a))
    except (OSError,ValueError,KeyError) as e:raise SystemExit('BLOCKED: '+str(e))
