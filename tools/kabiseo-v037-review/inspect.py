"""Inspect binary supply chain of pinned CameraX 1.4.2 detached graph.
Only public Maven artifacts are downloaded into CI quarantine; never load classes,
build Android, upload private JH source, or publish third-party binary files.
"""
import concurrent.futures,hashlib,io,json,os,pathlib,re,subprocess,urllib.request,urllib.error,urllib.parse,zipfile,xml.etree.ElementTree as ET
from datetime import datetime,timezone
ROOT=pathlib.Path('kabiseo-v037-review');RAW=ROOT/'quarantine'
ROOT.mkdir(exist_ok=True);RAW.mkdir(exist_ok=True)
REPO='uro31821-lab/playwright-mcp-render-mucsckil'
ARTIFACT=13640123907
EXPECTED_SHA='17d981cdef704b430591badf267c80c73d27c377facb18d78b61e7d5b7ab9051'
SOURCES=('https://dl.google.com/dl/android/maven2/','https://repo.maven.apache.org/maven2/')
def sha(x):return hashlib.sha256(x).hexdigest()
def time():return datetime.now(timezone.utc).isoformat()
def get(u,maximum=70*1024*1024):
    req=urllib.request.Request(u,headers={'User-Agent':'JH-Binary-Provenance-ReadOnly/1'})
    with urllib.request.urlopen(req,timeout=27) as r:
        p=urllib.parse.urlsplit(r.url)
        if p.scheme!='https' or p.hostname not in ('dl.google.com','repo.maven.apache.org'):raise ValueError('UNSAFE_REDIRECT')
        b=r.read(maximum+1)
        if not b or len(b)>maximum:raise ValueError('RESPONSE_SIZE_LIMIT')
        return b
def safe_archive(b):
    z=zipfile.ZipFile(io.BytesIO(b));seen=set();total=0
    if len(z.infolist())>16000:raise ValueError('TOO_MANY_ZIP_ENTRIES')
    for i in z.infolist():
        n=i.filename;p=pathlib.PurePosixPath(n)
        if n in seen or p.is_absolute() or '..' in p.parts or '\\' in n or ':' in n or i.flag_bits&1:raise ValueError('BAD_ARCHIVE_PATH')
        if (i.external_attr>>16)&0o170000==0o120000:raise ValueError('ZIP_SYMLINK')
        seen.add(n);total+=i.file_size
        if i.file_size>90*1024*1024 or total>200*1024*1024 or (i.compress_size and i.file_size/i.compress_size>2000):raise ValueError('ZIP_SIZE')
    if z.testzip() is not None:raise ValueError('ZIP_CRC')
    return z
def prior_graph():
    target=ROOT/'prior.zip'
    with target.open('wb') as out:
        subprocess.run(['gh','api',f'repos/{REPO}/actions/artifacts/{ARTIFACT}/zip'],
                       stdout=out,stderr=subprocess.PIPE,check=True,timeout=80)
    b=target.read_bytes()
    if sha(b)!=EXPECTED_SHA:raise ValueError('PRIOR_ARTIFACT_SHA_MISMATCH')
    with safe_archive(b) as z:
        names=[n for n in z.namelist() if pathlib.PurePosixPath(n).name=='jhkotlin1924.json']
        if len(names)!=1:raise ValueError('PREVIOUS_GRAPH_FILE_MISSING')
        d=json.loads(z.read(names[0]))
    if d.get('schema')!='KABISEO_DETACHED_GRADLE_METADATA_ONLY_V032' or d.get('nodeCount')!=75 or d.get('unresolvedEdgeCount')!=0 or d.get('configuration')!='jhkotlin1924':raise ValueError('PREVIOUS_GRAPH_WRONG')
    expected={'androidx.camera:camera-core':'1.4.2','org.jetbrains.kotlin:kotlin-stdlib':'1.9.24','com.google.protobuf:protobuf-javalite':'4.36.2','com.google.mediapipe:tasks-vision':'1.1.1'}
    for k,v in expected.items():
        if d.get('selected',{}).get(k)!=v:raise ValueError('SELECTED_VERSION_MISMATCH_'+k)
    coords=[(x['group'],x['module'],x['version']) for x in d['nodes']]
    if len(coords)!=75 or len(set(coords))!=75 or any(not re.fullmatch(r'[A-Za-z0-9_.-]{1,170}',v) or '..' in v for x in coords for v in x):raise ValueError('INVALID_GRAPH_NODES')
    return coords,{'artifactId':ARTIFACT,'sha256':sha(b),'nodeCount':75,'edges':d.get('edgeCount'),'detachedPomOnly':True}
def candidate_urls(g,a,v,ext):
    path='/'.join((g.replace('.','/'),a,v,a+'-'+v+'.'+ext))
    sources=SOURCES if g.startswith(('androidx.','com.google.mediapipe','com.google.android')) else SOURCES[::-1]
    return [x+path for x in sources]
def read_artifact(g,a,v,ext):
    errors=[]
    for u in candidate_urls(g,a,v,ext):
        try:return get(u,1024*1024 if ext=='pom' else 70*1024*1024),u
        except urllib.error.HTTPError as e:
            if e.code in (403,404,410):errors.append(str(e.code));continue
            raise
        except urllib.error.URLError as e:errors.append('NETWORK');continue
    raise ValueError('NOT_IN_CANONICAL_REPOSITORIES_'+','.join(errors))
def check_pom(b):
    if b'<!DOCTYPE' in b.upper() or b'<!ENTITY' in b.upper():raise ValueError('XML_EXTERNAL_ENTITY')
    root=ET.fromstring(b)
    name=lambda x:x.tag.split('}')[-1]
    packaging=next((x.text for x in root if name(x)=='packaging' and x.text),'jar')
    license_names=[]
    for l in root.iter():
        if name(l)=='licenses':
            for lic in l:
                for sub in lic:
                    if name(sub)=='name' and sub.text:license_names.append(sub.text.strip()[:130])
    return packaging,license_names[:8]
def publisher_check(u,b):
    notices=[]
    for algo in ('sha256','sha512','sha1'):
        try:
            side=get(u+'.'+algo,4096).decode('ascii').strip().split()[0].lower()
            ok=side==hashlib.new(algo,b).hexdigest()
            notices.append({'algorithm':algo,'status':'MATCH' if ok else 'MISMATCH'})
            if not ok:raise ValueError('PUBLISHER_DIGEST_MISMATCH')
            return notices
        except urllib.error.HTTPError as e:
            if e.code not in (403,404,410):raise
            notices.append({'algorithm':algo,'status':'UNPUBLISHED'})
    return notices
def inspect_one(coord):
    g,a,v=coord
    row={'coordinate':f'{g}:{a}:{v}','status':'NOT_SCANNED','publisherSignatureVerified':False}
    try:
        pom,pomurl=read_artifact(g,a,v,'pom')
        packing,licenses=check_pom(pom)
        row.update(pomSha256=sha(pom),pomUrl=pomurl,packaging=packing,licenses=licenses)
        if packing=='pom':
            row['status']='POM_ONLY'
            return row
        preferred='aar' if packing=='aar' else 'jar'
        try:body,u=read_artifact(g,a,v,preferred);ext=preferred
        except ValueError:
            ext='jar' if preferred=='aar' else 'aar'
            body,u=read_artifact(g,a,v,ext)
        checks=publisher_check(u,body)
        z=safe_archive(body)
        local=RAW/(g.replace('.','_')+'_'+a+'_'+v+'.'+ext)
        local.write_bytes(body)
        nested=[];script=[]
        for name in z.namelist():
            if name.lower().endswith(('.jar','.so','.dex')):
                content=z.read(name)
                nested.append({'name':name[:220],'sha256':sha(content),'bytes':len(content)})
                (RAW/(local.stem+'_'+str(len(nested))+pathlib.PurePosixPath(name).suffix)).write_bytes(content)
            if name.lower().endswith(('.exe','.cmd','.ps1','.bat','.sh')):script.append(name[:180])
        row.update(status='BINARY_READ_ONLY',binaryUrl=u,extension=ext,sha256=sha(body),
           bytes=len(body),publishedChecksums=checks,publisherDigestMatches=any(c['status']=='MATCH' for c in checks),
           members=len(z.namelist()),nested=nested,unusualScripts=script)
    except Exception as e:
        row.update(status='INCOMPLETE',errorType=type(e).__name__,errorReason=str(e)[:150])
    return row
def scan_osv(coords):
    req=urllib.request.Request('https://api.osv.dev/v1/querybatch',
       data=json.dumps({'queries':[{'package':{'ecosystem':'Maven','name':g+':'+a},'version':v} for g,a,v in coords]}).encode(),
       method='POST',headers={'Content-Type':'application/json','User-Agent':'JH-Public-Maven-Advisory-Check/1'})
    try:
        with urllib.request.urlopen(req,timeout=45) as r:
            if urllib.parse.urlsplit(r.url).hostname!='api.osv.dev':raise ValueError('OSV_HOST_CHANGE')
            data=json.loads(r.read(3000000))
        if len(data.get('results',[]))!=len(coords):raise ValueError('OSV_COUNT')
        affected=[]
        for i,z in enumerate(data['results']):
            if z.get('vulns'):affected.append({'coordinate':':'.join(coords[i]),'ids':[x.get('id') for x in z['vulns']]})
        return {'status':'CHECKED','checkedAtUtc':time(),'affected':affected,'count':len(affected)}
    except Exception as e:
        return {'status':'UNAVAILABLE','errorType':type(e).__name__,'error':str(e)[:150]}
def main():
    r={'schema':'KABISEO_DETACHED_75_BINARY_REVIEW_V037','checkedAtUtc':time(),'head':os.getenv('GITHUB_SHA'),
       'runId':os.getenv('GITHUB_RUN_ID'),'securityGateVerdict':'REVIEW','releaseApproved':False,
       'privateSourceRead':False,'vendorCodeExecuted':False,'appBuilt':False,
       'status':'NOT_STARTED','records':[]}
    try:
        coords,origin=prior_graph();r['reusedGraph']=origin
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:r['records']=list(pool.map(inspect_one,coords))
        r['status']='DETACHED_PUBLIC_BINARY_INPUTS_INSPECTED'
        r['osv']=scan_osv(coords)
        r['totals']={'coordinates':len(coords),
           'binaries':sum(x['status']=='BINARY_READ_ONLY' for x in r['records']),
           'pomOnly':sum(x['status']=='POM_ONLY' for x in r['records']),
           'incomplete':sum(x['status']=='INCOMPLETE' for x in r['records']),
           'digestMatched':sum(x.get('publisherDigestMatches') is True for x in r['records']),
           'nativeFiles':sum(sum(y['name'].endswith('.so') for y in x.get('nested',[])) for x in r['records'])}
    except Exception as e:
        r['status']='PRIOR_GRAPH_UNAVAILABLE'
        r['errorType']=type(e).__name__;r['errorMessage']=str(e)[:160]
    (ROOT/'report.json').write_text(json.dumps(r,indent=2,ensure_ascii=False),encoding='utf-8')
    brief={k:r.get(k) for k in ('schema','status','reusedGraph','totals','securityGateVerdict','errorType','errorMessage')}
    brief['firstFailures']=[{'name':x['coordinate'],'reason':x.get('errorReason')} for x in r['records'] if x['status']=='INCOMPLETE'][:12]
    brief['osv']=r.get('osv')
    print('KABISEO_V037='+json.dumps(brief,ensure_ascii=False,separators=(',',':')))
    if r['status']!='DETACHED_PUBLIC_BINARY_INPUTS_INSPECTED':raise SystemExit(2)
if __name__=='__main__':main()
