"""Read publisher camera patch metadata/Kotlin module headers and Guava parent POM.
Data only, no Android build, class loading, model execution or JH source disclosure.
"""
import datetime,hashlib,io,json,os,pathlib,struct,urllib.request,urllib.error,zipfile,xml.etree.ElementTree as ET
ROOT=pathlib.Path('kabiseo-metadata-compat');RAW=ROOT/'quarantine';RAW.mkdir(parents=True,exist_ok=True)
GOOGLE='https://dl.google.com/dl/android/maven2/'
CENTRAL='https://repo.maven.apache.org/maven2/'
TARGETS=[('androidx.camera',a,'1.5.3') for a in ('camera-core','camera-camera2','camera-lifecycle','camera-view')]+[('androidx.activity','activity-ktx','1.10.1')]
def digest(x):return hashlib.sha256(x).hexdigest()
def fetch(g,a,v,ext,origin):
    path='/'.join((g.replace('.','/'),a,v,a+'-'+v+'.'+ext));url=origin+path
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'JH-Pinned-Publisher-Metadata/1'}),timeout=28) as r:
        if r.url!=url:raise ValueError('unexpected redirect')
        data=r.read(85*1024*1024+1)
        if not data or len(data)>85*1024*1024:raise ValueError('artifact over limit')
        return data
def child(n,key):return next((x for x in n if x.tag.split('}')[-1]==key),None) if n is not None else None
def children(n,key):return [x for x in n if x.tag.split('}')[-1]==key] if n is not None else []
def field(n,key):
    x=child(n,key);return (x.text or '').strip() if x is not None else ''
def pom(g,a,v,origin):
    raw=fetch(g,a,v,'pom',origin)
    if b'<!DOCTYPE' in raw.upper() or b'<!ENTITY' in raw.upper():raise ValueError('XML_ENTITY')
    root=ET.fromstring(raw);parent=child(root,'parent')
    return raw,{'parent':{k:field(parent,k) for k in ('groupId','artifactId','version')},
                'properties':{x.tag.split('}')[-1]:(x.text or '').strip() for x in (child(root,'properties') or [])},
                'managed':[{k:field(x,k) for k in ('groupId','artifactId','version','scope','type')}
                  for x in children(child(child(root,'dependencyManagement'),'dependencies'),'dependency')]}
def module_version(b):
    if len(b)<8:return None
    n=int.from_bytes(b[:4],'big')
    if n<1 or n>5 or len(b)<4+4*n:return None
    version=[int.from_bytes(b[4+i*4:8+i*4],'big') for i in range(n)]
    return version if all(0<=x<1000 for x in version) else None
def inspect_aar(g,a,v):
    raw=fetch(g,a,v,'aar',GOOGLE);side=fetch(g,a,v,'aar.sha256',GOOGLE).decode('ascii').split()[0]
    if digest(raw)!=side.lower():raise ValueError('SHA256_MISMATCH')
    path=RAW/(a+'-'+v+'.aar');path.write_bytes(raw)
    item={'coordinate':':'.join((g,a,v)),'bytes':len(raw),'sha256':digest(raw),
          'sidecarVerified':True,'kotlinModules':[],'aarMetadata':{},'nativeFiles':[]}
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        names=set();total=0
        for info in z.infolist():
            name=info.filename
            if name in names or name.startswith('/') or '\\' in name or '..' in name.split('/') or info.flag_bits&1:raise ValueError('ZIP_MEMBER_RISK')
            names.add(name);total+=info.file_size
            if total>250*1024*1024 or info.file_size>70*1024*1024:raise ValueError('ZIP_SIZE')
            if name.endswith('.so'):item['nativeFiles'].append(name)
            if name=='META-INF/com/android/build/gradle/aar-metadata.properties':
                item['aarMetadata']={a:b for a,b in (x.split('=',1) for x in z.read(name).decode().splitlines() if '=' in x)}
            if name.endswith('.jar') and info.file_size<40*1024*1024:
                jar=z.read(name)
                with zipfile.ZipFile(io.BytesIO(jar)) as j:
                    for entry in j.namelist():
                        if entry.endswith('.kotlin_module'):
                            vdata=j.read(entry)
                            item['kotlinModules'].append({'name':entry,'metadataVersion':module_version(vdata)})
    return item
def parse_guava():
    raw,p= pom('com.google.guava','guava','27.0.1-android',CENTRAL)
    parent=p['parent'];props=p['properties']
    if not all(parent.get(k) for k in ('groupId','artifactId','version')):raise ValueError('MISSING_PARENT')
    raw2,p2=pom(parent['groupId'],parent['artifactId'],parent['version'],CENTRAL)
    managed={':'.join((d['groupId'],d['artifactId'])):d['version'] for d in p2['managed']}
    return {'guavaPomSha256':digest(raw),'parent':parent,'parentPomSha256':digest(raw2),
            'parentProperties':{k:v for k,v in p2['properties'].items() if k.endswith('.version') and 'animal' in k},
            'wantedManagedVersions':{k:managed.get(k) for k in (
              'com.google.code.findbugs:jsr305','org.checkerframework:checker-compat-qual',
              'com.google.errorprone:error_prone_annotations','com.google.j2objc:j2objc-annotations',
              'org.codehaus.mojo:animal-sniffer-annotations')}}
def main():
    result={'schema':'KABISEO_KOTLIN_AND_GUAVA_METADATA_V031',
            'checkedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'head':os.getenv('GITHUB_SHA'),'runId':os.getenv('GITHUB_RUN_ID'),
            'originalJHCompiler':'Kotlin Gradle plugin 1.9.24, AGP 8.7.3, compileSdk 35',
            'newCameraArtifacts':[], 'guavaParent':None,'failures':[],
            'vendorCodeExecuted':False,'androidBuild':False,'privateJHRead':False,
            'securityGateVerdict':'REVIEW','releaseApproved':False}
    for c in TARGETS:
        try:result['newCameraArtifacts'].append(inspect_aar(*c))
        except Exception as e:result['failures'].append({'coordinate':':'.join(c),'reason':type(e).__name__+': '+str(e)[:160]})
    try:result['guavaParent']=parse_guava()
    except Exception as e:result['failures'].append({'coordinate':'com.google.guava:guava:27.0.1-android','reason':type(e).__name__+': '+str(e)[:160]})
    (ROOT/'report.json').write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding='utf-8')
    short={k:result[k] for k in ('schema','head','securityGateVerdict','releaseApproved','failures')}
    short['artifacts']=[{k:v for k,v in a.items() if k in ('coordinate','sha256','kotlinModules','aarMetadata')} for a in result['newCameraArtifacts']]
    short['guavaParent']=result['guavaParent']
    print('KABISEO_COMPILER_METADATA='+json.dumps(short,ensure_ascii=False,separators=(',',':')))
    if result['failures']:raise SystemExit(2)
if __name__=='__main__':main()
