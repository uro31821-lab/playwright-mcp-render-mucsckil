"""Inspect publisher dependencies as DATA ONLY; never run vendor code or build JH.
Purpose: avoid a blind CameraX toolchain upgrade or an unnecessary protobuf override.
Does not read/upload private PhotoMaster/JH source or grant release approval.
"""
from datetime import datetime, timezone
import hashlib, io, json, os, pathlib, re, urllib.request, urllib.error, zipfile
import xml.etree.ElementTree as ET
ROOT=pathlib.Path('kabiseo-compatible-inputs'); RAW=ROOT/'quarantine'
RAW.mkdir(parents=True,exist_ok=True)
BASE='https://dl.google.com/dl/android/maven2/'
COORDS=[('androidx.camera',a,'1.5.2') for a in ('camera-core','camera-camera2','camera-lifecycle','camera-view')]+[('com.google.mediapipe',a,'1.2.2') for a in ('tasks-core','tasks-vision')]
LIMIT=80*1024*1024

def sha(data):return hashlib.sha256(data).hexdigest()
def get(url,limit=LIMIT):
    if not url.startswith(BASE):raise ValueError('NON_CANONICAL_URL')
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'JH-Static-Camera-Compatibility/1'}),timeout=35) as r:
        if not r.url.startswith(BASE):raise ValueError('NON_CANONICAL_REDIRECT')
        data=r.read(limit+1)
        if len(data)>limit:raise ValueError('DOWNLOAD_LIMIT')
        return data

def pom_info(data,expected):
    if b'<!DOCTYPE' in data.upper() or b'<!ENTITY' in data.upper():raise ValueError('XML_ENTITY_FORBIDDEN')
    root=ET.fromstring(data); ns={'m':'http://maven.apache.org/POM/4.0.0'}
    def text(node,key):return node.findtext('m:'+key,default='',namespaces=ns)
    identity=tuple(text(root,k) for k in ('groupId','artifactId','version'))
    if identity!=expected:raise ValueError('POM_IDENTITY_MISMATCH')
    deps=[]
    for dep in root.findall('m:dependencies/m:dependency',ns):
        d={k:text(dep,k) for k in ('groupId','artifactId','version','scope','optional','type')}
        d['exclusions']=[{k:text(e,k) for k in ('groupId','artifactId')} for e in dep.findall('m:exclusions/m:exclusion',ns)]
        deps.append(d)
    return {'identity':':'.join(identity),'dependencies':deps,
        'licenses':[{'name':text(x,'name'),'url':text(x,'url')} for x in root.findall('m:licenses/m:license',ns)],
        'hasParent':root.find('m:parent',ns) is not None,
        'hasDependencyManagement':root.find('m:dependencyManagement',ns) is not None,
        'scope':'Published direct POM only, not a resolved Gradle graph'}

def inspect_archive(data,label,depth=0):
    result={'entries':0,'metadata':{},'native':[],'nested':[],'archiveSha256':sha(data)}
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        infos=z.infolist();seen=set();total=0
        if len(infos)>15000:raise ValueError('ZIP_MEMBER_LIMIT')
        for i in infos:
            p=pathlib.PurePosixPath(i.filename)
            if i.filename in seen or p.is_absolute() or '..' in p.parts or ':' in i.filename or '\\' in i.filename or i.flag_bits&1:raise ValueError('UNSAFE_ARCHIVE_MEMBER')
            if ((i.external_attr>>16)&0o170000)==0o120000:raise ValueError('SYMLINK_FORBIDDEN')
            seen.add(i.filename);total+=i.file_size
            if i.file_size>250*1024*1024 or total>700*1024*1024 or (i.compress_size and i.file_size/i.compress_size>2000):raise ValueError('ARCHIVE_SIZE_LIMIT')
            if i.is_dir():continue
            content=z.read(i);result['entries']+=1
            if i.filename.lower().endswith(('.exe','.cmd','.bat','.ps1','.sh')):raise ValueError('UNEXPECTED_INSTALLER')
            if i.filename=='META-INF/com/android/build/gradle/aar-metadata.properties':
                result['metadata']=dict(line.split('=',1) for line in content.decode('utf-8').splitlines() if '=' in line)
            if i.filename.endswith('.so'):
                result['native'].append({'path':i.filename,'bytes':len(content),'sha256':sha(content)})
                target=RAW/(label+'-'+str(result['entries'])+'.so');target.write_bytes(content)
            if i.filename.endswith('.jar'):
                if depth>=1:raise ValueError('UNEXPECTED_NESTING')
                (RAW/(label+'-'+str(result['entries'])+'.jar')).write_bytes(content)
                result['nested'].append(inspect_archive(content,label+'-jar',depth+1))
        result['unpackedBytes']=total
    return result

def one(coord):
    group,name,version=coord;stem=group+'.'+name+'-'+version
    url=BASE+group.replace('.','/')+'/'+name+'/'+version+'/'+name+'-'+version
    r={'coordinate':':'.join(coord),'sourceBase':url,'status':'NOT_READ','securityGateVerdict':'REVIEW','signatureVerified':False}
    try:
        pom=get(url+'.pom',1024*1024);r['pomSha256']=sha(pom);r['pom']=pom_info(pom,coord)
        data=get(url+'.aar');r.update(sha256=sha(data),bytes=len(data))
        r['publisherChecksums']=[]
        for algo in ('sha256','sha1'):
            try:
                side=get(url+'.aar.'+algo,2048).decode('ascii').strip().split()[0]
                actual=hashlib.new(algo,data).hexdigest()
                if side.lower()!=actual:raise ValueError('PUBLISHER_CHECKSUM_MISMATCH')
                r['publisherChecksums'].append({'algorithm':algo,'status':'MATCH'})
                break
            except urllib.error.HTTPError as e:
                if e.code!=404:raise
                r['publisherChecksums'].append({'algorithm':algo,'status':'SIDECAR_NOT_FOUND'})
        if not any(x['status']=='MATCH' for x in r['publisherChecksums']):raise ValueError('NO_MATCHING_PUBLISHER_CHECKSUM')
        r['archive']=inspect_archive(data,stem)
        (RAW/(stem+'.aar')).write_bytes(data)
        md=r['archive']['metadata']
        if md:
            sdk=int(md.get('minCompileSdk','0'))
            agp=tuple(int(x) for x in md.get('minAndroidGradlePluginVersion','0.0.0').split('.'))
            r['matchesExistingSdk35Agp873MetadataOnly']=sdk<=35 and agp<=(8,7,3)
        r['status']='PUBLISHER_ARTIFACT_STATIC_INSPECTION_COMPLETE'
    except Exception as e:
        r['status']='FAILED';r['error']={'type':type(e).__name__,'message':str(e)[:240]}
    return r

result={'schema':'KABISEO_COMPATIBLE_PUBLIC_INPUTS_V025','checkedAtUtc':datetime.now(timezone.utc).isoformat(),
    'head':os.environ.get('GITHUB_SHA'),'runId':os.environ.get('GITHUB_RUN_ID'),'artifacts':[one(c) for c in COORDS],
    'fullGradleGraphVerified':False,'privateV024ArchiveRead':False,'vendorBytecodeExecuted':False,'androidBuilt':False,
    'modelExecuted':False,'appSourceChanged':False,'phoneActions':0,'securityGateVerdict':'REVIEW','releaseApproved':False}
result['allArtifactsRead']=all(x['status']=='PUBLISHER_ARTIFACT_STATIC_INSPECTION_COMPLETE' for x in result['artifacts'])
(ROOT/'report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print('COMPATIBLE_INPUTS='+json.dumps({**{k:v for k,v in result.items() if k!='artifacts'},'artifacts':[{k:v for k,v in x.items() if k!='archive'}|{'aarMetadata':x.get('archive',{}).get('metadata'),'nativeLibraryCount':len(x.get('archive',{}).get('native',[]))} for x in result['artifacts']]},ensure_ascii=False,separators=(',',':')))
if not result['allArtifactsRead']:raise SystemExit(2)
