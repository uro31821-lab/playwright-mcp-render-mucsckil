"""Targeted follow-up: inspect exact PUBLIC protobuf replacement as data.
This does not resolve Gradle's graph, execute protobuf or approve app release.
"""
import hashlib, io, json, pathlib, urllib.request, urllib.error, zipfile
from datetime import datetime, timezone
ROOT=pathlib.Path('kabiseo-protobuf-review');ROOT.mkdir(exist_ok=True)
URL='https://repo.maven.apache.org/maven2/com/google/protobuf/protobuf-javalite/4.36.2/protobuf-javalite-4.36.2'
def get(url,limit):
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'JH-Dependency-Inspection/1'}),timeout=35) as r:
        if not r.url.startswith('https://repo.maven.apache.org/maven2/com/google/protobuf/'):raise ValueError('UNEXPECTED_REDIRECT')
        b=r.read(limit+1)
        if len(b)>limit:raise ValueError('SIZE_LIMIT')
        return b
r={'schema':'KABISEO_PROTOBUF_REPLACEMENT_REVIEW_V025','coordinate':'com.google.protobuf:protobuf-javalite:4.36.2','url':URL+'.jar','checkedAtUtc':datetime.now(timezone.utc).isoformat(),'securityGateVerdict':'REVIEW','bytecodeExecuted':False,'fullDependencyGraphResolved':False,'signatureVerified':False}
try:
    pom=get(URL+'.pom',1000000);data=get(URL+'.jar',8*1024*1024)
    r['pom']=pom.decode('utf-8');r['sha256']=hashlib.sha256(data).hexdigest();r['bytes']=len(data)
    expected=get(URL+'.jar.sha256',1024).decode('ascii').strip().split()[0]
    r['publisherChecksumMatches']=expected==r['sha256']
    if not r['publisherChecksumMatches']:raise ValueError('CHECKSUM_MISMATCH')
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        if len(z.infolist())>15000:raise ValueError('ENTRY_LIMIT')
        total=0;licenses={};classes=[]
        for f in z.infolist():
            p=pathlib.PurePosixPath(f.filename)
            if p.is_absolute() or '..' in p.parts or '\\' in f.filename or ':' in f.filename or f.flag_bits&1:raise ValueError('UNSAFE_ARCHIVE')
            total+=f.file_size
            if total>100*1024*1024 or f.file_size>20*1024*1024:raise ValueError('EXPANSION_LIMIT')
            if f.compress_size and f.file_size/f.compress_size>2000:raise ValueError('RATIO_LIMIT')
            if f.filename.endswith(('.exe','.dll','.so','.ps1','.cmd','.sh')):raise ValueError('UNEXPECTED_NATIVE_OR_INSTALLER')
            b=z.read(f)
            if 'LICENSE' in f.filename.upper() or 'NOTICE' in f.filename.upper():licenses[f.filename]=b.decode('utf-8',errors='replace')
            if f.filename.endswith('.class'):classes.append(f.filename)
        r['archiveCrcVerified']=z.testzip() is None;r['classes']=len(classes);r['licenses']=licenses
        r['requiredLiteClassesPresent']=all(x in classes for x in ['com/google/protobuf/Any.class','com/google/protobuf/Any$Builder.class','com/google/protobuf/GeneratedMessageLite.class','com/google/protobuf/GeneratedMessageLite$Builder.class'])
    (ROOT/'protobuf-javalite-4.36.2.jar').write_bytes(data);(ROOT/'protobuf-javalite-4.36.2.pom').write_bytes(pom)
    r['status']='ARTIFACT_INSPECTED_PENDING_AV_AND_ABI'
except Exception as e:r['status']='FAILED';r['error']=type(e).__name__+': '+str(e)[:400]
try:
    query={'package':{'ecosystem':'Maven','name':r['coordinate'].rsplit(':',1)[0]},'version':'4.36.2'}
    req=urllib.request.Request('https://api.osv.dev/v1/query',data=json.dumps(query).encode(),headers={'Content-Type':'application/json'},method='POST')
    with urllib.request.urlopen(req,timeout=30) as response:
        body=response.read(2*1024*1024+1)
        if len(body)>2*1024*1024:raise ValueError('OSV_RESPONSE_LIMIT')
        scan=json.loads(body)
    r['knownVulnerabilitiesQuery']={'provider':'OSV','query':query,'vulnerabilities':scan.get('vulns',[]),'notProofOfNoUnknownVulnerabilities':True}
except Exception as e:r['knownVulnerabilitiesQuery']={'status':'UNAVAILABLE','errorType':type(e).__name__}
(ROOT/'protobuf-review.json').write_text(json.dumps(r,ensure_ascii=False,indent=2),encoding='utf-8')
print('PROTOBUF_REVIEW',r['status'],r.get('sha256'),r.get('error'), 'knownVulns',len(r.get('knownVulnerabilitiesQuery',{}).get('vulnerabilities',[])))
if r['status']=='FAILED':raise SystemExit(2)
