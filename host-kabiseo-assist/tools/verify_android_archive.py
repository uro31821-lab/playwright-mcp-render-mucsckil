#!/usr/bin/env python3
"""Inspect the built read-only AAR/core JAR. Not a full JH APK or host-integration test."""
from pathlib import Path
import hashlib, io, json, os, re, xml.etree.ElementTree as ET, zipfile
root=Path(__file__).resolve().parents[1]
a=root/'android/build/outputs/aar/android-debug.aar';c=root/'core/build/libs/core.jar';lint=root/'android/build/reports/lint-results-debug.xml'
ANDROID='{http://schemas.android.com/apk/res/android}'
def need(condition,message):
    if not condition: raise SystemExit('FAIL: '+message)
def names(data):
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        need(z.testzip() is None,'class archive CRC');return sorted(n for n in z.namelist() if n.endswith('.class'))
need(a.is_file() and c.is_file() and lint.is_file(),'AAR, core JAR and lint report must exist')
with zipfile.ZipFile(a) as z:
    need(z.testzip() is None,'AAR CRC');manifest=ET.fromstring(z.read('AndroidManifest.xml'))
    forbidden={'uses-permission','uses-permission-sdk-23','permission','activity','activity-alias','service','receiver','provider','intent-filter','queries'}
    for e in manifest.iter():need(e.tag.rsplit('}',1)[-1] not in forbidden,'manifest permission/component')
    sdk=manifest.find('uses-sdk');need(sdk is not None and sdk.attrib.get(ANDROID+'minSdkVersion')=='34','library minSdk34')
    android_classes=names(z.read('classes.jar'));need(not any(n.endswith(('.dex','.apk','.so')) for n in z.namelist()),'unexpected executable')
core_classes=names(c.read_bytes())
for classes,package,tops in ((android_classes,'com/jh/pobiseo/assist/android/',{'CameraSurfaceInspector','JhCameraMetadataEndpoint','JhCameraMetadataRuntime'}),
    (core_classes,'com/jh/pobiseo/assist/',{'CameraSurfacePolicy','CameraMetadataRoute','CameraCommandGate'})):
    need(bool(classes),'empty class set')
    for n in classes:need(n.startswith(package) and n[len(package):].split('$')[0].removesuffix('.class') in tops,'unexpected class '+n)
    for top in tops:need(package+top+'.class' in classes,'missing '+top)
sources=sorted((root/'core/src/main/java').rglob('*.java'))+sorted((root/'android/src/main/java').rglob('*.java'))
need(len(sources)==6,'six-source boundary changed')
for p in sources:
    need(not re.search(r'\b(?:dispatchGesture|performAction|takeScreenshot|takeScreenshotOfWindow|startActivity|openCamera|sendBroadcast|getText|getContentDescription)\s*\(',p.read_text()),'unexpected effect/pixel/text API in '+p.name)
issues=[{'id':e.get('id'),'severity':e.get('severity')} for e in ET.parse(lint).getroot().findall('issue')]
need(not any(i['severity'] in ('Fatal','Error') for i in issues),'lint error')
r={'schema':'KABISEO_V07_ANDROID_READONLY_BUILD','status':'PASS','scope':'six-source library, NOT BridgeService/full app',
'git_sha':os.getenv('GITHUB_SHA'),'run_id':os.getenv('GITHUB_RUN_ID'),'aar_sha256':hashlib.sha256(a.read_bytes()).hexdigest(),
'core_jar_sha256':hashlib.sha256(c.read_bytes()).hexdigest(),'source_sha256':{p.relative_to(root).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in sources},
'android_classes':len(android_classes),'core_classes':len(core_classes),'lint_issues':issues,'manifest_permissions':0,'manifest_components':0,
'apk_built':False,'host_runtime_wired':False,'device_tested':False,'settings_changed':False}
out=root/'build/verification';out.mkdir(parents=True,exist_ok=True);(out/'android-readonly-result.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n')
print('KABISEO_BUILD_RESULT='+json.dumps(r,ensure_ascii=False,sort_keys=True))
