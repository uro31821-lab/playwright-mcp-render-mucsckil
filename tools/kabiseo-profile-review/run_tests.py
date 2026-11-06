#!/usr/bin/env python3
"""Offline Java contract fixtures only. Uses existing JDK; no Gradle/npm/Node/server/phone."""
from pathlib import Path
import hashlib, json, os, re, shutil, subprocess, tempfile
ROOT=Path(__file__).resolve().parents[2]
HERE=Path(__file__).resolve().parent

def main():
    policy=ROOT/'host-kabiseo-assist/tools/runtime-proof/runtime-policy.json'
    hold=json.loads(policy.read_text())
    if hold.get('executionAllowed') is not False or hold.get('securityGateVerdict')!='REVIEW':
        raise SystemExit('Re-review execution boundaries before changing this workflow')
    java_home=os.environ.get('JAVA_HOME_17_X64')
    if not java_home: raise SystemExit('Existing JDK17 missing; no tool download fallback')
    java=Path(java_home)/'bin/java'; javac=Path(java_home)/'bin/javac'
    version=subprocess.run([str(javac),'--version'],check=True,text=True,capture_output=True).stdout.strip()
    if not version.startswith('javac 17.'):raise SystemExit('Existing JDK17 required')
    sources=[ROOT/'host-kabiseo-assist/core/src/main/java/com/jh/pobiseo/assist/CameraSurfacePolicy.java',HERE/'CameraProfileReview.java',HERE/'CameraProfileReviewTests.java']
    production=sources[:2]
    for file in production:
        text=file.read_text()
        if re.search(r'\b(?:dispatchGesture|performAction|takeScreenshot|takeScreenshotOfWindow|startActivity|openCamera|getText|getContentDescription)\s*\(',text):
            raise SystemExit('Unexpected device/text API')
    with tempfile.TemporaryDirectory(prefix='kabiseo-profile-jvm-') as out:
        subprocess.run([str(javac),'--release','17','-Xlint:all','-Werror','-encoding','UTF-8','-d',out,*map(str,sources)],check=True)
        p=subprocess.run([str(java),'-ea','-cp',out,'com.jh.pobiseo.assist.review.CameraProfileReviewTests'],check=True,capture_output=True,text=True,timeout=30)
    print(p.stdout,end='')
    matches=[x.split('=',1)[1] for x in p.stdout.splitlines() if x.startswith('PROFILE_REVIEW_RESULT=')]
    if len(matches)!=1:raise SystemExit('Missing test receipt')
    result={'schema':'KABISEO_OFFLINE_PROFILE_REVIEW_V019','status':'PASS_JVM_FIXTURES_ONLY','gitSha':os.environ.get('GITHUB_SHA'),
        'runId':os.environ.get('GITHUB_RUN_ID'),'compiler':version,'tests':json.loads(matches[0]),
        'sources':{p.relative_to(ROOT).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in sources},
        'runtimeHoldSha256':hashlib.sha256(policy.read_bytes()).hexdigest(),'runtimeHold':'REVIEW',
        'targetNodeExecuted':False,'androidRebuilt':False,'hostProfileProviderChanged':False,
        'physicalEvidenceVerified':False,'automaticZoomEnabled':False,'restoreVerified':False,'liveDeployment':False}
    folder=os.environ.get('KABISEO_PROFILE_EVIDENCE')
    if folder:
        target=Path(folder);target.mkdir(parents=True,exist_ok=True)
        (target/'profile-review-result.json').write_text(json.dumps(result,indent=2)+'\n')
    print('KABISEO_PROFILE_EVIDENCE='+json.dumps(result,sort_keys=True))
if __name__=='__main__':main()
