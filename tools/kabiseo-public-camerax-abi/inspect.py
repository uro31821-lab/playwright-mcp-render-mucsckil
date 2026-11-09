"""CameraX 1.4.2 vs 1.5.2 BYTECODE API surface check.
Vendor AAR/JAR treated as data only. No class loading, Gradle builds, phone,
private JH source, model execution, signing or release approval.
"""
from __future__ import annotations
import hashlib,importlib.util,io,json,os,pathlib,collections,urllib.request,urllib.error,zipfile
from datetime import datetime,timezone

ROOT=pathlib.Path('kabiseo-public-camerax-abi')
RAW=ROOT/'quarantine'
ROOT.mkdir(parents=True,exist_ok=True)
RAW.mkdir(parents=True,exist_ok=True)
BASE='https://dl.google.com/dl/android/maven2/androidx/camera/'
MODULES=('camera-core','camera-camera2','camera-lifecycle','camera-view')
VERSIONS=('1.4.2','1.5.2')
SOURCE_NAME='tools/kabiseo-abi-review/review.py'
MAX_AAR=35*1024*1024
def sha(b):return hashlib.sha256(b).hexdigest()
def get(url,limit):
    if not url.startswith(BASE):raise ValueError('EXTERNAL_REPOSITORY')
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'JH-CameraX-ABI-DataOnly/1'}),timeout=35) as r:
        if r.url!=url:raise ValueError('UNEXPECTED_REDIRECT')
        b=r.read(limit+1)
        if not b or len(b)>limit:raise ValueError('INPUT_LIMIT')
        return b
def check_archive(b):
    z=zipfile.ZipFile(io.BytesIO(b));seen=set();size=0
    for i in z.infolist():
        name=i.filename
        if name in seen or name.startswith('/') or '..' in name.split('/') or '\\' in name or ':' in name or i.flag_bits&1:
            raise ValueError('DANGEROUS_ARCHIVE_PATH')
        if ((i.external_attr>>16)&0o170000)==0o120000:raise ValueError('SYMLINK_REJECTED')
        if i.file_size>35*1024*1024 or (i.compress_size and i.file_size/i.compress_size>2000):raise ValueError('ZIP_BOMB_GUARD')
        size+=i.file_size;seen.add(name)
        if size>140*1024*1024:raise ValueError('ZIP_TOTAL')
    if z.testzip() is not None:raise ValueError('ZIP_CRC')
    return z
def static_reader():
    spec=importlib.util.spec_from_file_location('jh_public_classfile_inspector',SOURCE_NAME)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module
def aar(module,version,reader):
    stem=BASE+module+'/'+version+'/'+module+'-'+version
    payload=get(stem+'.aar',MAX_AAR)
    observed=sha(payload);checks=[]
    for algorithm in ('sha256','sha1'):
        try:
            side=get(stem+'.aar.'+algorithm,1024).decode('ascii').split()[0].lower()
            measured=hashlib.new(algorithm,payload).hexdigest()
            if side!=measured:raise ValueError('PUBLISHER_HASH_MISMATCH')
            checks.append({'algorithm':algorithm,'status':'MATCH'});break
        except urllib.error.HTTPError as e:
            if e.code!=404:raise
            checks.append({'algorithm':algorithm,'status':'SIDECAR_404'})
    if not any(x['status']=='MATCH' for x in checks):raise ValueError('NO_CANONICAL_CHECKSUM')
    archive=check_archive(payload)
    (RAW/(module+'-'+version+'.aar')).write_bytes(payload)
    if 'classes.jar' not in archive.namelist():raise ValueError('MISSING_CLASSES_JAR')
    classjar=archive.read('classes.jar')
    (RAW/(module+'-'+version+'-classes.jar')).write_bytes(classjar)
    classes=reader.classes(classjar)
    md={}
    path='META-INF/com/android/build/gradle/aar-metadata.properties'
    if path in archive.namelist():
        md=dict(x.split('=',1) for x in archive.read(path).decode('utf-8').splitlines() if '=' in x)
    so=[]
    for n in archive.namelist():
        if n.endswith('.so'):
            b=archive.read(n);file=RAW/(module+'-'+version+'-'+str(len(so))+'.so')
            file.write_bytes(b)
            so.append({'path':n,'sha256':sha(b),'bytes':len(b)})
    return classes,{'coordinate':'androidx.camera:'+module+':'+version,'bytes':len(payload),'sha256':observed,
      'checksum':checks,'aarMetadata':md,'classCount':len(classes),'nativeFiles':so}
def collect(versions):
    allc={};collisions=[]
    for module,cls in versions.items():
        for key,value in cls.items():
            if key in allc:collisions.append(key)
            else:allc[key]=value
    return allc,collisions
def public_symbols(c):
    if not (c.access & 1):return set()
    return set(('method',k[0],k[1]) for k,v in c.methods.items() if (v&5) and not (v&0x1000)) | set(('field',k[0],k[1]) for k,v in c.fields.items() if v&5 and not (v&0x1000))
def complete_coverage(old,new):
    missing=[];added=[];missing_classes=[]
    for cls,v in new.items():
        if not cls.startswith('androidx/camera/'):continue
        exports=public_symbols(v)
        p=old.get(cls)
        if p is None:
            if exports:missing_classes.append(cls)
            continue
        left=public_symbols(p)
        for kind,name,desc in exports-left:missing.append({'owner':cls,'kind':kind,'name':name,'descriptor':desc})
    for cls,v in old.items():
        if cls not in new and public_symbols(v):
            added.append(cls)
    missing.sort(key=lambda x:(x['owner'],x['name'],x['descriptor']))
    return {'publicClassesNewerOnly':sorted(missing_classes),
      'publicMemberSignaturesNewerOnlyCount':len(missing),
      'publicMemberSignaturesNewerOnlyFirst150':missing[:150],
      'publicClassesOlderOnly':sorted(added),
      'restriction':'Classfile public flags only; not semver/Kotlin source-level compatibility or exact private app references'}
def name_members(table,owner,names):
    c=table.get(owner)
    if c is None:return {'owner':owner,'classPresent':False,'names':{}}
    return {'owner':owner,'classPresent':True,
      'names':{name:sorted(desc for (nm,desc) in c.methods if nm==name) for name in names}}
EXPECTED={
 'androidx/camera/core/CameraControl':['setZoomRatio','setLinearZoom','setExposureCompensationIndex','startFocusAndMetering','cancelFocusAndMetering'],
 'androidx/camera/core/CameraInfo':['getZoomState','getExposureState','getCameraState','getSensorRotationDegrees'],
 'androidx/camera/core/ImageProxy':['toBitmap','getPlanes','close'],
 'androidx/camera/core/ImageCapture':['takePicture','getResolutionInfo'],
 'androidx/camera/core/ImageCapture$Builder':['build','setTargetRotation'],
 'androidx/camera/core/ImageAnalysis$Builder':['build','setBackpressureStrategy','setOutputImageFormat'],
 'androidx/camera/core/Preview$Builder':['build'],
 'androidx/camera/lifecycle/ProcessCameraProvider':['getInstance','bindToLifecycle','unbind','unbindAll'],
 'androidx/camera/view/PreviewView':['getViewPort','getSurfaceProvider','getMeteringPointFactory'],
 'androidx/camera/core/FocusMeteringAction$Builder':['addPoint','build'],
 'androidx/camera/core/CameraSelector':['getDefaultLensFacing'],
 'androidx/camera/core/ZoomState':['getZoomRatio','getMinZoomRatio','getMaxZoomRatio'],
 'androidx/camera/core/ExposureState':['getExposureCompensationRange','getExposureCompensationIndex'],
 'androidx/camera/core/ViewPort$Builder':['build'],
}
def run():
    report={'schema':'KABISEO_PUBLIC_CAMERAX142_V152_API_V034',
      'checkedAtUtc':datetime.now(timezone.utc).isoformat(),
      'head':os.getenv('GITHUB_SHA'),'runId':os.getenv('GITHUB_RUN_ID'),
      'status':'NOT_RUN','source':BASE,'inputs':[],'comparison':None,
      'privateSourceRead':False,'privateAppExactUsageVerified':False,
      'verifiedMediaPipeCompatibility':False,'vendorBytecodeExecuted':False,
      'androidAppBuilt':False,'securityGateVerdict':'REVIEW','releaseApproved':False}
    try:
        reader=static_reader()
        collections_by_version={}
        for version in VERSIONS:
            by_module={}
            for module in MODULES:
                cls,receipt=aar(module,version,reader)
                by_module[module]=cls;report['inputs'].append(receipt)
            combined,dups=collect(by_module)
            collections_by_version[version]=combined
            if dups:raise ValueError('DUPLICATE_PUBLIC_CLASSES_'+str(len(dups)))
        old,new=collections_by_version[VERSIONS[0]],collections_by_version[VERSIONS[1]]
        delta=complete_coverage(old,new)
        signatures={}
        for owner,names in EXPECTED.items():
            signatures[owner]={
                'older':name_members(old,owner,names),
                'newer':name_members(new,owner,names)
            }
        missing_core=[]
        for owner,v in signatures.items():
            for name,decl in v['newer']['names'].items():
                if decl and not v['older']['names'].get(name):missing_core.append(owner+'.'+name)
        report['comparison']={
            **delta,'selectedClassCount142':len(old),'selectedClassCount152':len(new),
            'matchedCallNameCatalog':signatures,
            'knownCameraOperationNameMissingIn142':missing_core,
            'previousGradleKotlinStdlib142WithExplicit1924':'1.9.24',
            'previousGradleKotlinStdlib152WithExplicit1924':'2.0.21',
            'sourceCompleteNotVerified':True,
            'resultLimitedToPublicLibraryClassfile':True,
        }
        report['status']='PUBLIC_ABI_SURFACE_COMPARED_NOT_APP_VALIDATED'
    except Exception as e:
        report['status']='REVIEW_TOOL_FAILED'
        report['failure']={'type':type(e).__name__,'detail':str(e)[:200]}
    (ROOT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    summary={k:report.get(k) for k in ('schema','status','securityGateVerdict','releaseApproved','failure')}
    c=report.get('comparison') or {}
    summary['comparison']={k:c.get(k) for k in ('selectedClassCount142','selectedClassCount152',
       'publicMemberSignaturesNewerOnlyCount','publicClassesNewerOnly','knownCameraOperationNameMissingIn142')}
    print('KABISEO_CAMERAX_ABI='+json.dumps(summary,ensure_ascii=False,separators=(',',':')))
    if report['status']!='PUBLIC_ABI_SURFACE_COMPARED_NOT_APP_VALIDATED':raise SystemExit(2)
if __name__=='__main__':run()
