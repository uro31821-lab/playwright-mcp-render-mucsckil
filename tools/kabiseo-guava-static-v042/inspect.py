"""JH Guava 27 -> patched Android Guava static API and source provenance review.
Public Google Maven and Maven Central binaries only. No private JH/PhotoMaster
source, Android build, runtime class loading, model inference or installation.
"""
import hashlib,io,importlib.util,json,os,pathlib,urllib.request,urllib.error,urllib.parse,zipfile,xml.etree.ElementTree as ET
from datetime import datetime,timezone
ROOT=pathlib.Path('kabiseo-guava-static-v042');RAW=ROOT/'quarantine'
ROOT.mkdir(exist_ok=True);RAW.mkdir(exist_ok=True)
CENTRAL='https://repo.maven.apache.org/maven2/'
GOOGLE='https://dl.google.com/dl/android/maven2/'
VERSIONS=('27.0.1-android','33.8.0-android')
MEDIA=('tasks-core','tasks-vision')
def now():return datetime.now(timezone.utc).isoformat()
def sha(b):return hashlib.sha256(b).hexdigest()
def download(u,limit=45*1024*1024):
    req=urllib.request.Request(u,headers={'User-Agent':'JH-Guava-Candidate-Binary-DataReview/1'})
    with urllib.request.urlopen(req,timeout=35) as r:
        p=urllib.parse.urlsplit(r.url)
        if p.scheme!='https' or p.hostname not in ('repo.maven.apache.org','dl.google.com'):
            raise ValueError('UNTRUSTED_BINARY_REDIRECT')
        b=r.read(limit+1)
        if not b or len(b)>limit:raise ValueError('BINARY_SIZE_LIMIT')
        return b
def zip_checked(data):
    z=zipfile.ZipFile(io.BytesIO(data));seen=set();total=0
    if len(z.infolist())>16000:raise ValueError('ZIP_ENTRIES_EXCEEDED')
    for i in z.infolist():
        path=pathlib.PurePosixPath(i.filename)
        if i.filename in seen or path.is_absolute() or '..' in path.parts or '\\' in i.filename or ':' in i.filename or i.flag_bits&1:raise ValueError('ZIP_TRAVERSAL')
        if ((i.external_attr>>16)&0o170000)==0o120000:raise ValueError('ZIP_SYMLINK')
        seen.add(i.filename);total+=i.file_size
        if i.file_size>45*1024*1024 or total>170*1024*1024 or (i.compress_size and i.file_size/i.compress_size>2000):raise ValueError('ZIP_BOMB')
    if z.testzip() is not None:raise ValueError('ZIP_CRC')
    return z
def publisher_hash(u,b):
    checked=[]
    for algorithm in ('sha256','sha512','sha1'):
        try:
            expected=download(u+'.'+algorithm,1000).decode('ascii').strip().split()[0].lower()
            matched=expected==hashlib.new(algorithm,b).hexdigest()
            checked.append({'algorithm':algorithm,'matched':matched})
            if not matched:raise ValueError('PUBLISHER_CHECKSUM_MISMATCH')
            return checked
        except urllib.error.HTTPError as e:
            if e.code not in (404,403,410):raise
    return checked
def source_pom(data):
    if b'<!DOCTYPE' in data.upper() or b'<!ENTITY' in data.upper():raise ValueError('XML_EXTERNAL_ENTITY')
    root=ET.fromstring(data)
    byname=lambda x:x.tag.split('}')[-1]
    deps=[]
    for n in root.iter():
        if byname(n)=='dependencies':
            for d in n:
                if byname(d)!='dependency':continue
                attrs={byname(c):(c.text or '').strip() for c in d}
                if attrs.get('groupId') and attrs.get('artifactId'):
                    deps.append({k:attrs.get(k) for k in ('groupId','artifactId','version','scope','optional')})
    return deps
def read_guava(ver):
    stem=CENTRAL+'com/google/guava/guava/'+ver+'/guava-'+ver
    p=download(stem+'.pom',1024*1024)
    b=download(stem+'.jar',45*1024*1024)
    checks=publisher_hash(stem+'.jar',b)
    z=zip_checked(b)
    (RAW/('guava-'+ver+'.jar')).write_bytes(b)
    hasasc=False
    try:
        sig=download(stem+'.jar.asc',10000)
        hasasc=bool(sig)
    except urllib.error.HTTPError as e:
        if e.code!=404:raise
    return b,{'version':ver,'source':stem+'.jar','sha256':sha(b),'bytes':len(b),
       'pomSha256':sha(p),'pomDependencies':source_pom(p),
       'checksumEvidence':checks,'publisherSignatureObserved':hasasc,
       'signatureVerified':False,'zipEntries':len(z.namelist())}
def read_caller(name,reader):
    stem=GOOGLE+'com/google/mediapipe/'+name+'/1.1.1/'+name+'-1.1.1'
    p=download(stem+'.pom',1024*1024)
    b=download(stem+'.aar',60*1024*1024)
    checksum=publisher_hash(stem+'.aar',b)
    z=zip_checked(b)
    if 'classes.jar' not in z.namelist():raise ValueError('MISSING_AAR_CLASSES_JAR')
    so=[n for n in z.namelist() if n.endswith('.so')]
    (RAW/(name+'-1.1.1.aar')).write_bytes(b)
    jar=z.read('classes.jar');(RAW/(name+'-classes.jar')).write_bytes(jar)
    classes=reader.classes(jar)
    return classes,{'coordinate':'com.google.mediapipe:'+name+':1.1.1',
        'sha256':sha(b),'publisherChecksum':checksum,'classCount':len(classes),
        'nativeLibraryCount':len(so),'guavaPomRequirements':[d for d in source_pom(p) if d['groupId']=='com.google.guava' and d['artifactId']=='guava']}
def known_osv():
    data={'queries':[{'package':{'ecosystem':'Maven','name':'com.google.guava:guava'},'version':v} for v in VERSIONS]}
    req=urllib.request.Request('https://api.osv.dev/v1/querybatch',data=json.dumps(data).encode(),method='POST',
       headers={'Content-Type':'application/json','User-Agent':'JH-Maven-Guava-Advisory-Review/1'})
    try:
        with urllib.request.urlopen(req,timeout=40) as r:
            if urllib.parse.urlsplit(r.url).hostname!='api.osv.dev':raise ValueError('OSV_REDIRECT')
            doc=json.loads(r.read(1000000))
        if len(doc.get('results',[]))!=len(VERSIONS):raise ValueError('OSV_RESPONSE_COUNT')
        return {v:[x.get('id') for x in row.get('vulns',[])] for v,row in zip(VERSIONS,doc['results'])}
    except Exception as e:return {'status':'UNAVAILABLE','reason':type(e).__name__}
def main():
    r={'schema':'KABISEO_GUAVA27_TO3380_STATIC_LINK_V042','checkedAtUtc':now(),
       'sourceHead':os.environ.get('GITHUB_SHA'),'runId':os.environ.get('GITHUB_RUN_ID'),
       'status':'NOT_STARTED','securityGateVerdict':'REVIEW','releaseApproved':False,
       'privateSourceRead':False,'vendorBytecodeExecuted':False,'androidBuilt':False}
    try:
        spec=importlib.util.spec_from_file_location('jh_static_classfile_reader','tools/kabiseo-abi-review/review.py')
        reader=importlib.util.module_from_spec(spec);spec.loader.exec_module(reader)
        olds,old_info=read_guava(VERSIONS[0])
        news,new_info=read_guava(VERSIONS[1])
        old_classes=reader.classes(olds);new_classes=reader.classes(news)
        callers={};inputs=[]
        for name in MEDIA:
            table,receipt=read_caller(name,reader)
            for cls,obj in table.items():
                if cls in callers:raise ValueError('MEDIA_CLASS_COLLISION')
                callers[cls]=obj
            inputs.append(receipt)
        refs={}
        for caller,obj in callers.items():
            for tag,owner,name,desc in obj.refs:
                if owner.startswith('com/google/common/'):
                    refs.setdefault((tag,owner,name,desc),set()).add(caller)
        prior_hit=0;new_hit=0;regressions=[];older_unknown=[]
        for (tag,owner,name,desc),users in sorted(refs.items()):
            old=reader.resolve(old_classes,owner,name,desc,tag==9)
            new=reader.resolve(new_classes,owner,name,desc,tag==9)
            if old:prior_hit+=1
            else:older_unknown.append({'owner':owner,'name':name,'descriptor':desc,'callers':sorted(users)})
            if new:new_hit+=1
            if old and not new:regressions.append({'owner':owner,'name':name,'descriptor':desc,'callers':sorted(users)})
        r['packages']=[old_info,new_info]
        r['callers']=inputs
        r['result']={'oldGuavaClasses':len(old_classes),'newGuavaClasses':len(new_classes),
            'mediaPipeClassfiles':len(callers),'uniqueGuavaSymbolReferences':len(refs),
            'previouslyResolved':prior_hit,'newVersionResolved':new_hit,
            'oldVersionUnresolvedCount':len(older_unknown),'oldVersionUnresolvedExamples':older_unknown[:10],
            'newVersionRegressionCount':len(regressions),'newVersionRegressions':regressions,
            'nativeLinkageUnverified':True,'AndroidClassLoadingUnverified':True,
            'otherTransitiveCallersNotExamined':True,'privateJHAppNotCompiled':True}
        r['osv']=known_osv()
        r['status']='PUBLIC_GUAVA_LINKAGE_STATIC_REVIEW_COMPLETE'
    except Exception as e:
        r['status']='STATIC_REVIEW_FAILED';r['failure']={'type':type(e).__name__,'detail':str(e)[:180]}
    (ROOT/'report.json').write_text(json.dumps(r,indent=2,ensure_ascii=False),encoding='utf-8')
    small={k:r.get(k) for k in ('schema','status','securityGateVerdict','failure','osv')}
    small['packages']=[{k:x[k] for k in ('version','sha256','bytes','publisherSignatureObserved','signatureVerified')} for x in r.get('packages',[])]
    small['result']=r.get('result')
    small['callers']=r.get('callers')
    print('KABISEO_GUAVA_V042='+json.dumps(small,ensure_ascii=False,separators=(',',':'))[:18000])
    if r['status']!='PUBLIC_GUAVA_LINKAGE_STATIC_REVIEW_COMPLETE':raise SystemExit(2)
if __name__=='__main__':main()
