"""Download ONLY canonical pinned PUBLIC inputs into quarantine; never execute them.
No Gradle, Android build, model inference, credential export or phone commands.
An artifact hash/static report is NOT release approval or a full dependency audit.
"""
import concurrent.futures, hashlib, io, json, os, pathlib, re, struct, urllib.request, urllib.error, zipfile
from datetime import datetime, timezone
ROOT=pathlib.Path('kabiseo-dependency-review')
RAW=ROOT/'quarantine'; EXTRACT=ROOT/'inspect'; RAW.mkdir(parents=True,exist_ok=True);EXTRACT.mkdir(exist_ok=True)
GOOGLE='https://dl.google.com/dl/android/maven2/'
COORDS=[('androidx.camera',a,v) for a in ('camera-core','camera-camera2','camera-lifecycle','camera-view') for v in ('1.4.2','1.6.2')]+[('androidx.activity','activity-ktx','1.10.1'),('androidx.activity','activity','1.10.1'),('com.google.mediapipe','tasks-core','1.1.1'),('com.google.mediapipe','tasks-vision','1.1.1')]
MODEL='https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float32/1/efficientdet_lite0.tflite'
def download(url,limit=80*1024*1024):
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'JH-Public-Dependency-Review/1'}),timeout=35) as r:
        if not r.url.startswith((GOOGLE,'https://storage.googleapis.com/mediapipe-models/')):raise ValueError('UNAPPROVED_REDIRECT')
        b=r.read(limit+1)
        if len(b)>limit:raise ValueError('DOWNLOAD_LIMIT')
        return b

def inspect_zip(data,tag,depth=0):
    rec={'entries':0,'unpackedBytes':0,'metadata':{},'nativeLibraries':[],'signatures':[]}
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        if len(z.infolist())>15000:raise ValueError('ZIP_ENTRY_LIMIT')
        for info in z.infolist():
            name=info.filename; p=pathlib.PurePosixPath(name)
            if p.is_absolute() or '..' in p.parts or '\\' in name or ':' in name or info.flag_bits&1:raise ValueError('UNSAFE_ZIP_PATH')
            if info.file_size>250*1024*1024:raise ValueError('ZIP_FILE_LIMIT')
            if info.compress_size and info.file_size/info.compress_size>2000:raise ValueError('ZIP_RATIO_LIMIT')
            rec['entries']+=1;rec['unpackedBytes']+=info.file_size
            if rec['unpackedBytes']>600*1024*1024:raise ValueError('ZIP_TOTAL_LIMIT')
            if info.is_dir():continue
            if name.lower().endswith(('.ps1','.exe','.cmd','.bat','.sh')):raise ValueError('UNEXPECTED_EXECUTABLE_INSTALLER')
            content=z.read(info)
            if name in ('AndroidManifest.xml','META-INF/com/android/build/gradle/aar-metadata.properties') or ('LICENSE' in name.upper() or 'NOTICE' in name.upper()):
                if len(content)<200000:rec['metadata'][name]=content.decode('utf-8',errors='replace')
            if name.endswith('.so'):rec['nativeLibraries'].append(name)
            if name.upper().endswith(('.RSA','.DSA','.EC','.SF')):rec['signatures'].append(name)
            dest=EXTRACT/tag/pathlib.Path(*p.parts);dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(content)
            if name.endswith('.jar') and depth==0:
                rec.setdefault('nestedJars',{})[name]=inspect_zip(content,tag+'-nested-'+re.sub('[^a-zA-Z0-9_.-]','_',name),1)
    return rec

def artifact(coord):
    g,a,v=coord;name=f'{g}.{a}-{v}';base=GOOGLE+g.replace('.','/')+'/'+a+'/'+v+'/'+a+'-'+v
    out={'coordinate':':'.join(coord),'sourceBase':base,'status':'NOT_READ','publisherSignatureVerified':False}
    try:
        pom=download(base+'.pom',1024*1024);(RAW/(name+'.pom')).write_bytes(pom);out['pom']=pom.decode('utf-8')
        aar=download(base+'.aar');(RAW/(name+'.aar')).write_bytes(aar)
        out['bytes']=len(aar);out['sha256']=hashlib.sha256(aar).hexdigest()
        try:
            digest=download(base+'.aar.sha256',1024).decode('ascii').strip().split()[0]
            out['publisherChecksumAlgorithm']='SHA-256';out['publisherChecksumMatched']=digest==out['sha256']
        except urllib.error.HTTPError as e:
            if e.code!=404:raise
            digest=download(base+'.aar.sha1',1024).decode('ascii').strip().split()[0]
            out['publisherChecksumAlgorithm']='SHA-1';out['publisherChecksumMatched']=digest==hashlib.sha1(aar).hexdigest()
        if not out['publisherChecksumMatched']:raise ValueError('PUBLISHER_CHECKSUM_MISMATCH')
        out['archive']=inspect_zip(aar,name);out['status']='STATIC_INPUT_INSPECTED_NOT_RELEASE_APPROVED'
    except Exception as e:out['status']='FAILED';out['failure']=type(e).__name__+': '+str(e)[:500]
    return out

class FlatBuffer:
    def __init__(self,b):self.b=b
    def u16(self,p):return struct.unpack_from('<H',self.b,p)[0]
    def u32(self,p):return struct.unpack_from('<I',self.b,p)[0]
    def i32(self,p):return struct.unpack_from('<i',self.b,p)[0]
    def field(self,t,k):
        v=t-self.i32(t);off=4+2*k
        if off>=self.u16(v):return None
        x=self.u16(v+off);return t+x if x else None
    def target(self,p):return p+self.u32(p)
    def string(self,p):
        if p is None:return None
        t=self.target(p);n=self.u32(t)
        if n>200000:raise ValueError('MODEL_STRING_LIMIT')
        return self.b[t+4:t+4+n].decode('utf-8')
    def tables(self,p):
        if p is None:return []
        t=self.target(p);n=self.u32(t)
        if n>50000:raise ValueError('MODEL_TABLE_LIMIT')
        return [self.target(t+4+4*i) for i in range(n)]
    def bytes(self,p):
        t=self.target(p);n=self.u32(t);return self.b[t+4:t+4+n]

def model():
    out={'url':MODEL,'inferenceExecuted':False,'licenseVerified':False,'status':'NOT_READ'}
    try:
        b=download(MODEL);out.update(bytes=len(b),sha256=hashlib.sha256(b).hexdigest())
        if b[4:8]!=b'TFL3':raise ValueError('TFLITE_HEADER')
        f=FlatBuffer(b);root=f.u32(0);buffers=f.tables(f.field(root,4));meta=[]
        for entry in f.tables(f.field(root,6)):
            name=f.string(f.field(entry,0));idx=f.u32(f.field(entry,1));rec={'name':name,'buffer':idx}
            if name=='TFLITE_METADATA':
                payload=f.bytes(f.field(buffers[idx],0));m=FlatBuffer(payload);r=m.u32(0)
                rec['modelName']=m.string(m.field(r,0));rec['description']=m.string(m.field(r,1))
                rec['version']=m.string(m.field(r,2));rec['author']=m.string(m.field(r,4));rec['license']=m.string(m.field(r,5))
                out['embeddedModelMetadata']=rec
                out['licenseVerified']=bool(rec['license'] and ('Apache' in rec['license'] or 'apache.org/licenses/LICENSE-2.0' in rec['license']))
            meta.append(rec)
        out['metadata']=meta;out['status']='MODEL_BYTES_INSPECTED_NOT_EXECUTED'
        # Quarantine inspection, not bundling into an APK. Retain public model
        # only with an explicit Apache license inside these EXACT model bytes.
        if out['licenseVerified']:(RAW/'efficientdet-lite0.tflite').write_bytes(b)
        else:out['modelRetained']=False
    except Exception as e:out['status']='FAILED';out['failure']=type(e).__name__+': '+str(e)[:500]
    return out

with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:results=list(pool.map(artifact,COORDS))
result={'schema':'KABISEO_V025_DIRECT_INPUT_REVIEW','checkedAtUtc':datetime.now(timezone.utc).isoformat(),'artifacts':results,'model':model(),'fullTransitiveGraphVerified':False,'antivirus':'PENDING_WORKFLOW_SCAN','securityGateVerdict':'REVIEW','androidBuilt':False,'deviceActions':0,'privateSourceUploaded':False}
(ROOT/'direct-audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
for r in results:
 print('INPUT',r['coordinate'],r['status'],r.get('archive',{}).get('metadata',{}).get('META-INF/com/android/build/gradle/aar-metadata.properties',''),r.get('failure',''))
print('MODEL',json.dumps(result['model'],ensure_ascii=False))
print('DIRECT_REVIEW_ONLY_NOT_FULL_SECURITY_APPROVAL')
