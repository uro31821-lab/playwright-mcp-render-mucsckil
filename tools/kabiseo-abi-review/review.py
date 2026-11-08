"""Inspect reused PUBLIC MediaPipe bytes and one candidate protobuf replacement.
No app source, Gradle, Java class loading, model inference, installation or signing.
Checksums are integrity observations, not publisher-signature or release approval.
"""
from __future__ import annotations
import hashlib, io, json, os, pathlib, re, shutil, struct, subprocess, urllib.request, urllib.error, zipfile
from datetime import datetime, timezone

ROOT=pathlib.Path('kabiseo-abi-review'); ROOT.mkdir(exist_ok=True)
REPO='uro31821-lab/playwright-mcp-render-mucsckil'
ARTIFACT_ID=13553160473
ARTIFACT_SHA='aa0cc643ae65363d77ab85d467909855ebc028f633d8129c0c26f0f03ae28bf4'
VERSION='4.36.2'
BASE='https://repo.maven.apache.org/maven2/com/google/protobuf/protobuf-javalite/'+VERSION+'/protobuf-javalite-'+VERSION
OBSERVED_SHA='8f4f93d08cb37130ecb0bc69d376d7d27c36ff04ddb1bb27430b06caa9fa062e'
# This pin is from the earlier exact HTTPS download, NOT a claimed publisher signature.
def sha(data): return hashlib.sha256(data).hexdigest()
def get(url,limit):
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'JH-ReadOnly-ABI-Review/1'}),timeout=35) as r:
        if not r.url.startswith('https://repo.maven.apache.org/maven2/com/google/protobuf/'):
            raise ValueError('UNAPPROVED_REDIRECT')
        data=r.read(limit+1)
        if len(data)>limit: raise ValueError('DOWNLOAD_SIZE_LIMIT')
        return data

def inspect_zip(data,limit=180*1024*1024):
    z=zipfile.ZipFile(io.BytesIO(data)); infos=z.infolist()
    if len(infos)>20000: raise ValueError('ARCHIVE_COUNT')
    total=0; names=set()
    for i in infos:
        p=pathlib.PurePosixPath(i.filename)
        if p.is_absolute() or '..' in p.parts or '\\' in i.filename or ':' in i.filename or i.flag_bits&1:
            raise ValueError('UNSAFE_ARCHIVE_PATH')
        if i.filename in names: raise ValueError('DUPLICATE_ARCHIVE_MEMBER')
        names.add(i.filename); total+=i.file_size
        if total>limit or i.file_size>80*1024*1024: raise ValueError('ARCHIVE_SIZE_LIMIT')
        if i.compress_size and i.file_size/i.compress_size>2000: raise ValueError('ARCHIVE_RATIO')
    if z.testzip() is not None: raise ValueError('ARCHIVE_CRC')
    return z

def only(z,suffix):
    names=[n for n in z.namelist() if n==suffix or n.endswith('/'+suffix)]
    if len(names)!=1: raise ValueError('EXACT_MEMBER_REQUIRED:'+suffix)
    return z.read(names[0])

class ClassFile:
    """Read definitions and symbolic references only; never load vendor classes."""
    def __init__(self,data):
        self.data=data; self.pos=0
        if self.u4()!=0xcafebabe: raise ValueError('CLASS_MAGIC')
        self.minor=self.u2(); self.major=self.u2(); count=self.u2(); cp=[None]*count; i=1
        while i<count:
            tag=self.u1()
            if tag==1:
                n=self.u2(); cp[i]=(tag,self.take(n).decode('utf-8',errors='replace'))
            elif tag in (3,4): cp[i]=(tag,self.take(4))
            elif tag in (5,6): cp[i]=(tag,self.take(8)); i+=1
            elif tag in (7,8,16,19,20): cp[i]=(tag,self.u2())
            elif tag in (9,10,11,12,17,18): cp[i]=(tag,self.u2(),self.u2())
            elif tag==15: cp[i]=(tag,self.u1(),self.u2())
            else: raise ValueError('CLASS_TAG_'+str(tag))
            i+=1
        self.cp=cp; self.access=self.u2(); self.name=self.cls(self.u2()); self.parent=self.cls(self.u2())
        self.interfaces=[self.cls(self.u2()) for _ in range(self.u2())]
        self.fields=self.members(); self.methods=self.members(); self.attrs()
        if self.pos!=len(data): raise ValueError('CLASS_TRAILING_BYTES')
        self.refs=[]
        for item in cp:
            if item and item[0] in (9,10,11):
                nat=cp[item[2]]
                self.refs.append((item[0],self.cls(item[1]),self.text(nat[1]),self.text(nat[2])))
    def take(self,n):
        if n<0 or self.pos+n>len(self.data): raise ValueError('CLASS_TRUNCATED')
        b=self.data[self.pos:self.pos+n]; self.pos+=n; return b
    def u1(self): return self.take(1)[0]
    def u2(self): return struct.unpack('>H',self.take(2))[0]
    def u4(self): return struct.unpack('>I',self.take(4))[0]
    def text(self,i):
        x=self.cp[i]
        if x is None or x[0]!=1: raise ValueError('CLASS_UTF8_REF')
        return x[1]
    def cls(self,i):
        if i==0: return None
        x=self.cp[i]
        if x[0]!=7: raise ValueError('CLASS_NAME_REF')
        return self.text(x[1])
    def attrs(self):
        for _ in range(self.u2()):
            self.u2(); self.take(self.u4())
    def members(self):
        out={}
        for _ in range(self.u2()):
            access=self.u2(); name=self.text(self.u2()); desc=self.text(self.u2()); self.attrs()
            out[(name,desc)]=access
        return out

def classes(data):
    z=inspect_zip(data); out={}
    for n in z.namelist():
        if n.endswith('.class') and not n.startswith('META-INF/versions/'):
            c=ClassFile(z.read(n));
            if c.name in out: raise ValueError('DUPLICATE_CLASS')
            out[c.name]=c
    return out

def resolve(table,owner,name,desc,field=False,seen=None):
    if seen is None: seen=set()
    if owner in seen or owner is None: return None
    seen.add(owner); c=table.get(owner)
    if c is None: return None
    if (name,desc) in (c.fields if field else c.methods): return owner
    if name=='<init>': return None
    for ancestor in [c.parent]+c.interfaces:
        hit=resolve(table,ancestor,name,desc,field,seen)
        if hit: return hit
    return None

OBJECT_METHODS={('equals','(Ljava/lang/Object;)Z'),('hashCode','()I'),('toString','()Ljava/lang/String;'),('getClass','()Ljava/lang/Class;'),('wait','()V'),('wait','(J)V'),('wait','(JI)V'),('notify','()V'),('notifyAll','()V'),('clone','()Ljava/lang/Object;'),('finalize','()V')}

def query_osv():
    query={'package':{'ecosystem':'Maven','name':'com.google.protobuf:protobuf-javalite'},'version':VERSION}
    req=urllib.request.Request('https://api.osv.dev/v1/query',data=json.dumps(query).encode(),headers={'Content-Type':'application/json'},method='POST')
    with urllib.request.urlopen(req,timeout=30) as r:
        body=r.read(2*1024*1024+1)
        if len(body)>2*1024*1024: raise ValueError('OSV_LIMIT')
        data=json.loads(body)
    return {'provider':'OSV','query':query,'checkedAtUtc':datetime.now(timezone.utc).isoformat(),'ids':[v['id'] for v in data.get('vulns',[])],'unknownVulnerabilitiesNotExcluded':True}

def main():
    result={'schema':'KABISEO_PUBLIC_BINARY_ABI_V025_FOLLOWUP','checkedAtUtc':datetime.now(timezone.utc).isoformat(),
        'sourceHead':os.getenv('GITHUB_SHA'),'runId':os.getenv('GITHUB_RUN_ID'),
        'securityGateVerdict':'REVIEW','releaseApproved':False,'privateSourceRead':False,
        'privateV024Patched':False,'androidBuilt':False,'bytecodeExecuted':False,'modelInference':False,'phoneActions':0}
    try:
        gh=shutil.which('gh')
        if not gh: raise ValueError('EXISTING_GH_REQUIRED')
        archive=ROOT/'reused-public-inputs.zip'
        with archive.open('wb') as f:
            subprocess.run([gh,'api',f'repos/{REPO}/actions/artifacts/{ARTIFACT_ID}/zip'],stdout=f,stderr=subprocess.PIPE,check=True,timeout=90)
        b=archive.read_bytes()
        if len(b)>80*1024*1024 or sha(b)!=ARTIFACT_SHA: raise ValueError('PRIOR_ARTIFACT_PIN_MISMATCH')
        old=inspect_zip(b,650*1024*1024)
        prior=json.loads(only(old,'direct-audit.json'))
        result['reusedArtifact']={'id':ARTIFACT_ID,'sha256':ARTIFACT_SHA,'sourceRun':42320520575,'hashMatches':True}
        result['priorInputSummary']=[{'coordinate':r['coordinate'],'status':r['status'],'sha256':r.get('sha256'),
            'aarMetadata':r.get('archive',{}).get('metadata',{}).get('META-INF/com/android/build/gradle/aar-metadata.properties'),
            'pom':r.get('pom'),'failure':r.get('failure')} for r in prior['artifacts']]
        result['modelMetadata']=prior.get('model')
        # Prior AV is evidence of that old artifact only; current JAR is separately scanned.
        result['priorAvReports']={n:json.loads(old.read(n)) for n in old.namelist() if n.endswith('antivirus.json')}
        jar=get(BASE+'.jar',8*1024*1024)
        if sha(jar)!=OBSERVED_SHA: raise ValueError('OBSERVED_REPLACEMENT_SHA_CHANGED')
        checks=[]
        for algo in ('sha256','sha512','sha1'):
            try:
                expected=get(BASE+'.jar.'+algo,1024).decode('ascii').strip().split()[0].lower()
                if not re.fullmatch('[a-f0-9]{'+str(hashlib.new(algo).digest_size*2)+'}',expected): raise ValueError('BAD_CHECKSUM_TEXT')
                ok=hashlib.new(algo,jar).hexdigest()==expected
                checks.append({'algorithm':algo,'status':'MATCH' if ok else 'MISMATCH'})
                if not ok: raise ValueError('PUBLISHER_CHECKSUM_MISMATCH')
                break
            except urllib.error.HTTPError as e:
                if e.code!=404: raise
                checks.append({'algorithm':algo,'status':'PUBLISHER_SIDECAR_NOT_FOUND'})
        if not any(c['status']=='MATCH' for c in checks): raise ValueError('NO_PUBLISHER_CHECKSUM')
        target=ROOT/('protobuf-javalite-'+VERSION+'.jar'); target.write_bytes(jar)
        result['replacement']={'coordinate':'com.google.protobuf:protobuf-javalite:'+VERSION,'bytes':len(jar),
            'sha256':sha(jar),'sourceUrl':BASE+'.jar','matchesPriorObservedSha256':True,'checksums':checks,
            'publisherSignatureVerified':False,'checksumIsNotSignature':True}
        candidate=classes(jar)
        result['replacement']['classCount']=len(candidate)
        callers={}; source_inputs=[]
        for record in prior['artifacts']:
            if not record['coordinate'].startswith('com.google.mediapipe:'): continue
            if record['status']!='STATIC_INPUT_INSPECTED_NOT_RELEASE_APPROVED': raise ValueError('PRIOR_MEDIAPIPE_FAILED')
            g,a,v=record['coordinate'].split(':'); filename=f'{g}.{a}-{v}.aar'
            aar=only(old,filename)
            if sha(aar)!=record['sha256']: raise ValueError('REUSED_AAR_HASH_MISMATCH')
            ar=inspect_zip(aar,600*1024*1024); content=ar.read('classes.jar')
            for name,c in classes(content).items():
                if name in callers: raise ValueError('MEDIAPIPE_CLASS_DUPLICATE')
                callers[name]=c
            source_inputs.append({'coordinate':record['coordinate'],'sha256':record['sha256'],'bytes':len(aar)})
        if len(source_inputs)!=2: raise ValueError('TWO_MEDIAPIPE_ARTIFACTS_REQUIRED')
        refs={}
        for caller,c in callers.items():
            for tag,owner,name,desc in c.refs:
                if owner.startswith('com/google/protobuf/'):
                    key=(tag,owner,name,desc); refs.setdefault(key,[]).append(caller)
        if not refs: raise ValueError('NO_PROTOBUF_REFERENCES_FOUND')
        unresolved=[]; resolved=0; object_fallback=0; build_refs=[]
        for (tag,owner,name,desc),uses in sorted(refs.items()):
            hit=resolve(candidate,owner,name,desc,tag==9)
            obj=tag!=9 and (name,desc) in OBJECT_METHODS and owner in candidate
            if hit: resolved+=1
            elif obj: object_fallback+=1
            else: unresolved.append({'kind':tag,'owner':owner,'name':name,'descriptor':desc,'callers':uses})
            if owner=='com/google/protobuf/Any$Builder' and name=='build':
                build_refs.append({'descriptor':desc,'resolvedOwner':hit,'callers':uses})
        result['abi']={'inputs':source_inputs,'mediapipeClassCount':len(callers),'uniqueProtobufReferences':len(refs),
            'resolvedDefinitions':resolved,'javaLangObjectSignatures':object_fallback,'unresolved':unresolved,
            'anyBuilderBuildReferences':build_refs,'scope':'Static classfile symbolic references; not Android linkage/runtime or behavioral compatibility',
            'accessOpcodeNativeJniAndFullDependencyGraphNotVerified':True}
        try: result['knownVulnerabilities']=query_osv()
        except Exception as e: result['knownVulnerabilities']={'status':'UNAVAILABLE','errorType':type(e).__name__}
        result['status']='STATIC_REFERENCES_MATCH' if not unresolved else 'STATIC_REFERENCES_MISMATCH'
    except Exception as e:
        result['status']='FAILED'
        result['error']={'type':type(e).__name__,'detail':str(e)[:300] if not isinstance(e,subprocess.CalledProcessError) else 'PRIOR_ARTIFACT_FETCH_FAILED'}
    (ROOT/'review.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print('KABISEO_ABI_REVIEW='+json.dumps(result,ensure_ascii=False,separators=(',',':')))
    if result['status']!='STATIC_REFERENCES_MATCH': raise SystemExit(2)

if __name__=='__main__': main()
