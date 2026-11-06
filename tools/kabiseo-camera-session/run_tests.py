#!/usr/bin/env python3
"""Existing JDK17 only; no app/Node/REA/APK/package acquisition or phone interaction."""
import hashlib,json,os,re,subprocess,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
HERE=Path(__file__).resolve().parent
policy=ROOT/'host-kabiseo-assist/tools/runtime-proof/runtime-policy.json'
POLICY_SHA='b2854b74ab80c2bdb6b79d7847e810764e1ce56514d74117f41ab44cd30312e6'
assert hashlib.sha256(policy.read_bytes()).hexdigest()==POLICY_SHA,'Existing hold must remain byte-identical'
home=os.environ.get('JAVA_HOME_17_X64')
if not home: raise SystemExit('Existing JDK17 unavailable; no download fallback')
java=Path(home)/'bin/java';javac=Path(home)/'bin/javac'
version=subprocess.run([str(javac),'--version'],check=True,text=True,capture_output=True).stdout.strip()
assert version.startswith('javac 17.')
source=HERE/'CameraSettingsSession.java';test=HERE/'CameraSettingsSessionTests.java'
text=source.read_text()
assert not re.search(r'\b(dispatchGesture|performAction|openCamera|takeScreenshot|startActivity|exec|loadLibrary)\s*\(',text)
with tempfile.TemporaryDirectory(prefix='kabiseo-session-') as out:
    subprocess.run([str(javac),'--release','17','-Xlint:all','-Werror','-d',out,str(source),str(test)],check=True)
    p=subprocess.run([str(java),'-ea','-cp',out,'com.jh.kabiseo.session.CameraSettingsSessionTests'],check=True,text=True,capture_output=True,timeout=30)
print(p.stdout,end='')
records=[json.loads(s.split('=',1)[1]) for s in p.stdout.splitlines() if s.startswith('SESSION_RESULT=')]
assert len(records)==1
result={'schema':'KABISEO_CAMERA_APP_PATTERNS_V021','status':'PASS_SIMULATION_ONLY','compiler':version,'tests':records[0],
        'gitSha':os.environ.get('GITHUB_SHA'),'runId':os.environ.get('GITHUB_RUN_ID'),
        'sourceSha256':{x.name:hashlib.sha256(x.read_bytes()).hexdigest() for x in (source,test)},
        'reaExecuted':False,'externalApkAnalyzed':False,'sourceReviewMethod':'Direct public Kotlin source inspection, not REA',
        'runtimeHoldUnchanged':True,'targetNodeExecuted':False,'androidRebuilt':False,'cameraBackendImplemented':False,
        'gptCameraReplaced':False,'physicalRestoreVerified':False,'phoneActions':0,'deployment':False}
evidence=os.environ.get('KABISEO_SESSION_EVIDENCE')
if evidence:
    dest=Path(evidence);dest.mkdir(parents=True,exist_ok=True)
    (dest/'camera-session-result.json').write_text(json.dumps(result,indent=2)+'\n')
print('KABISEO_SESSION_EVIDENCE='+json.dumps(result,sort_keys=True))
