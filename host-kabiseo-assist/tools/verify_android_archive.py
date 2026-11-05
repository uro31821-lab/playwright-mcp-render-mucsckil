#!/usr/bin/env python3
"""Inspect the real built read-only AAR and core JAR. Never claims APK or device success."""
from pathlib import Path
import hashlib, io, json, os, re, xml.etree.ElementTree as ET, zipfile
root=Path(__file__).resolve().parents[1]
a=root/'android/build/outputs/aar/android-debug.aar'
c=root/'core/build/libs/core.jar'
lint=root/'android/build/reports/lint-results-debug.xml'
ANDROID='{http://schemas.android.com/apk/res/android}'
def need(condition,message):
    if not condition: raise SystemExit('FAIL: '+message)
def class_names(data):
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        need(z.testzip() is None,'class archive CRC')
        return sorted(n for n in z.namelist() if n.endswith('.class'))
need(a.is_file() and c.is_file() and lint.is_file(),'AAR, core JAR and lint report must all exist')
with zipfile.ZipFile(a) as z:
    need(z.testzip() is None,'AAR CRC')
    manifest=ET.fromstring(z.read('AndroidManifest.xml'))
    forbidden={'uses-permission','uses-permission-sdk-23','permission','activity','activity-alias','service','receiver','provider','intent-filter','queries'}
    for element in manifest.iter():
        need(element.tag.rsplit('}',1)[-1] not in forbidden,'unexpected manifest permission or component')
    sdk=manifest.find('uses-sdk')
    need(sdk is not None and sdk.attrib.get(ANDROID+'minSdkVersion')=='34','expected minSdk 34')
    android_classes=class_names(z.read('classes.jar'))
    need(not any(n.endswith(('.dex','.apk','.so')) for n in z.namelist()),'unexpected executable payload')
core_classes=class_names(c.read_bytes())
for classes,package,tops in ((android_classes,'com/jh/pobiseo/assist/android/',{'CameraSurfaceInspector','JhCameraMetadataEndpoint'}),
                              (core_classes,'com/jh/pobiseo/assist/',{'CameraSurfacePolicy','CameraMetadataRoute'})):
    need(bool(classes),'empty compiled class set')
    for name in classes:
        need(name.startswith(package) and name[len(package):].split('$')[0].removesuffix('.class') in tops,'unexpected compiled class '+name)
    for top in tops: need(package+top+'.class' in classes,'missing expected top-level class')
sources=sorted((root/'core/src/main/java').rglob('*.java'))+sorted((root/'android/src/main/java').rglob('*.java'))
need(len(sources)==4,'read-only module source boundary changed')
for p in sources:
    text=p.read_text(encoding='utf-8')
    need(not re.search(r'\b(?:dispatchGesture|performAction|takeScreenshot|takeScreenshotOfWindow|startActivity|openCamera|sendBroadcast|getText|getContentDescription)\s*\(',text),'unexpected action, pixel or text API in '+p.name)
issues=[{'id':e.get('id'),'severity':e.get('severity')} for e in ET.parse(lint).getroot().findall('issue')]
need(not any(i['severity'] in ('Fatal','Error') for i in issues),'Android lint errors')
result={'schema':'KABISEO_ANDROID_READONLY_BUILD_V1','status':'PASS','scope':'4-source read-only Android library; NOT full JH app',
        'git_sha':os.getenv('GITHUB_SHA'),'run_id':os.getenv('GITHUB_RUN_ID'),
        'aar_sha256':hashlib.sha256(a.read_bytes()).hexdigest(),'core_jar_sha256':hashlib.sha256(c.read_bytes()).hexdigest(),
        'source_sha256':{p.relative_to(root).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in sources},
        'android_classes':len(android_classes),'core_classes':len(core_classes),'manifest_permissions':0,'manifest_components':0,
        'lint_issues':issues,'apk_built':False,'host_runtime_wired':False,'device_tested':False,'settings_changed':False}
out=root/'build/verification';out.mkdir(parents=True,exist_ok=True)
(out/'android-readonly-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('KABISEO_BUILD_RESULT='+json.dumps(result,ensure_ascii=False,sort_keys=True))
