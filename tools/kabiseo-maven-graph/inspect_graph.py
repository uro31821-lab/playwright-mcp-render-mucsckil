"""Read-only Maven/Gradle metadata closure for JH camera delta.
POM/module DATA ONLY. Not Gradle resolution, Android build or supply-chain approval.
"""
import collections,datetime,hashlib,json,os,pathlib,re,urllib.request,urllib.error
import xml.etree.ElementTree as ET
BASE=('https://dl.google.com/dl/android/maven2/','https://repo.maven.apache.org/maven2/')
ROOTS=(('androidx.camera','camera-core','1.5.2'),('androidx.camera','camera-camera2','1.5.2'),('androidx.camera','camera-lifecycle','1.5.2'),('androidx.camera','camera-view','1.5.2'),('androidx.activity','activity-ktx','1.10.1'),('com.google.mediapipe','tasks-core','1.1.1'),('com.google.mediapipe','tasks-vision','1.1.1'),('com.google.protobuf','protobuf-javalite','4.36.2'))
STRICT={('com.google.protobuf','protobuf-javalite'):'4.36.2'}
LIMIT=140
def safe(s):return bool(re.fullmatch('[A-Za-z0-9_.-]{1,180}',s or '')) and '..' not in s and not s.startswith('.')
def get(g,a,v,ext):
    if not all(safe(x) for x in (g,a,v)):raise ValueError('COORDINATE_INVALID')
    suffix=g.replace('.','/')+'/'+a+'/'+v+'/'+a+'-'+v+'.'+ext
    order=BASE if g.startswith(('androidx.','com.google.android','com.google.mediapipe')) else BASE[::-1]
    last='NOT_FOUND'
    for root in order:
        try:
            with urllib.request.urlopen(urllib.request.Request(root+suffix,headers={'User-Agent':'JH-Metadata-Only/1'}),timeout=22) as response:
                if response.url!=root+suffix:raise ValueError('UNEXPECTED_REDIRECT')
                b=response.read(2_000_001)
                if not b or len(b)>2_000_000:raise ValueError('METADATA_SIZE')
                return b,hashlib.sha256(b).hexdigest()
        except urllib.error.HTTPError as e:
            if e.code not in (403,404,410):raise
            last='HTTP_'+str(e.code)
        except (urllib.error.URLError,TimeoutError) as e:last=type(e).__name__
    raise ValueError('METADATA_MISSING_'+last)
def elem(e,k):return next((x for x in e if x.tag.split('}')[-1]==k),None) if e is not None else None
def elems(e,k):return [x for x in e if x.tag.split('}')[-1]==k] if e is not None else []
def val(e,k):
    x=elem(e,k);return (x.text or '').strip() if x is not None else ''
def expand(s,p):
    for i in range(6):
        old=s
        for k,v in p.items():s=s.replace(chr(36)+'{'+k+'}',v)
        if s==old:break
    return s
def module(g,a,v):
    data,sha=get(g,a,v,'module');m=json.loads(data)
    candidates=[]
    for x in m.get('variants',[]):
        name=x.get('name','');attrs=x.get('attributes',{})
        if attrs.get('org.gradle.usage')!='java-runtime':continue
        if attrs.get('org.jetbrains.kotlin.platform.type','') not in ('','jvm','androidJvm'):continue
        if any(y in name.lower() for y in ('debug','source','javadoc')):continue
        score=10*('release' in name.lower())+4*('android' in name.lower())+3*(name.lower()=='runtimeelements')
        candidates.append((score,name,x))
    if not candidates:raise ValueError('RUNTIME_VARIANT_MISSING')
    candidates.sort(key=lambda x:(-x[0],x[1]));selected=candidates[0]
    result=[]
    for d in selected[2].get('dependencies',[]):
        vv=d.get('version',{})
        req=vv.get('strictly') or vv.get('requires') or vv.get('prefers') or '' if isinstance(vv,dict) else str(vv)
        exc=[(x.get('group',''),x.get('module','')) for x in d.get('excludes',[])]
        result.append((d.get('group',''),d.get('module',''),req,exc))
    return result,{'source':'MODULE','sha256':sha,'variant':selected[1]}
def pom(g,a,v):
    b,sha=get(g,a,v,'pom')
    if b'<!DOCTYPE' in b.upper() or b'<!ENTITY' in b.upper():raise ValueError('XML_ENTITY')
    root=ET.fromstring(b);pr=elem(root,'properties')
    props={x.tag.split('}')[-1]:(x.text or '').strip() for x in (pr or [])}
    props.update({'project.version':v,'project.groupId':g,'project.artifactId':a,'pom.version':v})
    managed={}
    for d in elems(elem(elem(root,'dependencyManagement'),'dependencies'),'dependency'):
        mg,ma,mv=(expand(val(d,k),props) for k in ('groupId','artifactId','version'))
        if mg and ma and mv:managed[(mg,ma)]=mv
    result=[]
    for d in elems(elem(root,'dependencies'),'dependency'):
        dg,da,dv=(expand(val(d,k),props) for k in ('groupId','artifactId','version'))
        dv=dv or managed.get((dg,da),'')
        if val(d,'scope') not in ('','compile','runtime') or val(d,'optional')=='true':continue
        if val(d,'type') not in ('','aar','jar','bundle'):continue
        exc=[(val(e,'groupId'),val(e,'artifactId')) for e in elems(elem(d,'exclusions'),'exclusion')]
        result.append((dg,da,dv,exc))
    return result,{'source':'POM','sha256':sha,'parent':None if elem(root,'parent') is None else ':'.join(val(elem(root,'parent'),k) for k in ('groupId','artifactId','version'))}
def literal(v):
    if v.startswith('[') and v.endswith(']') and ',' not in v:v=v[1:-1]
    return v if safe(v) else None
def main():
    todo=collections.deque((g,a,v,0,[]) for g,a,v in ROOTS)
    seen=set();rows=[];edges=[];issues=[];versions=collections.defaultdict(set)
    while todo:
        g,a,v,depth,excl=todo.popleft();v=STRICT.get((g,a),v);v=literal(v or '')
        if not v or not safe(g) or not safe(a):
            issues.append({'reason':'UNRESOLVED_COORDINATE','coordinate':':'.join((g,a,v or '?'))});continue
        key=(g,a,v)
        if key in seen:continue
        if len(seen)>=LIMIT:issues.append({'reason':'GRAPH_LIMIT','pending':len(todo)+1});break
        seen.add(key);versions[(g,a)].add(v);row={'coordinate':':'.join(key),'depth':depth}
        try:
            try:deps,proof=module(g,a,v)
            except ValueError:deps,proof=pom(g,a,v)
            row['metadata']=proof;row['directDependencyCount']=len(deps)
            for dg,da,dv,ex in deps:
                if (dg,da) in excl or (dg,'*') in excl:continue
                dv=STRICT.get((dg,da),dv)
                edges.append({'from':row['coordinate'],'to':':'.join((dg,da,dv))})
                vv=literal(dv or '')
                if not vv or not safe(dg) or not safe(da):
                    issues.append({'reason':'UNRESOLVED_DEPENDENCY','from':row['coordinate'],'dependency':':'.join((dg,da,dv))})
                else:todo.append((dg,da,vv,depth+1,excl+ex))
        except Exception as e:
            row['error']=type(e).__name__+': '+str(e)[:100]
            issues.append({'reason':'METADATA_READ_FAILED','coordinate':row['coordinate'],'detail':row['error']})
        rows.append(row)
    conflicts=[{'module':':'.join(k),'versions':sorted(v)} for k,v in versions.items() if len(v)>1]
    report={'schema':'KABISEO_TRANSITIVE_METADATA_V030','checkedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceHead':os.getenv('GITHUB_SHA'),'runId':os.getenv('GITHUB_RUN_ID'),'roots':[':'.join(x) for x in ROOTS],'count':len(rows),'edgeCount':len(edges),'issueCount':len(issues),'conflictCount':len(conflicts),'issues':issues,'conflicts':conflicts,'rows':rows,'edges':edges,'metadataOnly':True,'isExactGradleResolution':False,'originalJHUnmodified':True,'thirdPartyCodeExecuted':False,'androidBuilt':False,'securityGateVerdict':'REVIEW','releaseApproved':False}
    pathlib.Path('kabiseo-maven-graph').mkdir(exist_ok=True)
    pathlib.Path('kabiseo-maven-graph/report.json').write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf-8')
    short={k:report[k] for k in ('schema','count','edgeCount','issueCount','conflictCount','securityGateVerdict','releaseApproved')}
    short['issuesFirst']=issues[:16];short['conflictsFirst']=conflicts[:16]
    print('KABISEO_MAVEN_CLOSURE='+json.dumps(short,ensure_ascii=False,separators=(',',':')))
if __name__=='__main__':main()
