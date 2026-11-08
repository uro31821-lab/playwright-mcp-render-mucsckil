"""Read public version-specific model data in quarantine. No model inference,
third-party package, private source upload, app build, install or phone action.
A publisher-model alternative is NEVER silently substituted into the JH app.
"""
import hashlib, io, json, os, pathlib, struct, tarfile, urllib.parse, urllib.request, zipfile
from datetime import datetime, timezone
ROOT=pathlib.Path('kabiseo-model-provenance')
RAW=ROOT/'quarantine'
LIMIT=32*1024*1024
CARD='https://www.kaggle.com/models/tensorflow/efficientdet/tfLite/lite0-detection-metadata/1'
PUBLISHER='https://www.kaggle.com/api/v1/models/tensorflow/efficientdet/tfLite/lite0-detection-metadata/1/download'
COMPARISON='https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite'
HOSTS={'www.kaggle.com','kaggle.com','storage.googleapis.com','www.googleapis.com','storage.cloud.google.com','tfhub.dev','www.tfhub.dev'}
def digest(b):return hashlib.sha256(b).hexdigest()
def allowed(url):
    p=urllib.parse.urlparse(url)
    return p.scheme=='https' and p.hostname in HOSTS and not p.username and not p.password
class Redirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        if not allowed(newurl):raise ValueError('UNAPPROVED_REDIRECT')
        return super().redirect_request(req,fp,code,msg,headers,newurl)
def read(url):
    if not allowed(url):raise ValueError('UNAPPROVED_SOURCE')
    op=urllib.request.build_opener(Redirect())
    req=urllib.request.Request(url,headers={'User-Agent':'JH-Public-Model-Provenance/1'})
    with op.open(req,timeout=35) as r:
        b=r.read(LIMIT+1)
        if not b or len(b)>LIMIT:raise ValueError('DOWNLOAD_SIZE')
        if not allowed(r.url):raise ValueError('UNAPPROVED_FINAL_SOURCE')
        # Never store signed URLs/query parameters or response cookies.
        return b,{'requestedUrl':url,'finalHost':urllib.parse.urlparse(r.url).hostname,
                  'contentType':r.headers.get('Content-Type',''),'bytes':len(b),'sha256':digest(b)}
def safe_name(name):
    p=pathlib.PurePosixPath(name)
    return bool(name) and not p.is_absolute() and '..' not in p.parts and '\\' not in name and ':' not in name

def publisher_model(b):
    if len(b)>8 and b[4:8]==b'TFL3':return b,{'format':'RAW_TFLITE','fileName':'1.tflite','rawFilenameFromCard':True}
    entries=[];models=[];total=0
    if zipfile.is_zipfile(io.BytesIO(b)):
        with zipfile.ZipFile(io.BytesIO(b)) as z:
            if len(z.infolist())>40:raise ValueError('ARCHIVE_ENTRY_LIMIT')
            for x in z.infolist():
                if not safe_name(x.filename) or x.flag_bits&1 or ((x.external_attr>>16)&0o170000)==0o120000:raise ValueError('ARCHIVE_PATH_OR_TYPE')
                total+=x.file_size
                if x.file_size>LIMIT or total>LIMIT or (x.compress_size and x.file_size/x.compress_size>2000):raise ValueError('ARCHIVE_SIZE')
                if x.is_dir():continue
                data=z.read(x);entries.append({'name':x.filename,'bytes':len(data),'sha256':digest(data)})
                if x.filename.endswith('.tflite'):models.append((x.filename,data))
                elif not x.filename.lower().endswith(('.txt','.md','.json','license','notice')):raise ValueError('UNEXPECTED_PAYLOAD')
        fmt='ZIP'
    else:
        with tarfile.open(fileobj=io.BytesIO(b),mode='r:*') as t:
            for x in t:
                if len(entries)>40 or not safe_name(x.name):raise ValueError('ARCHIVE_ENTRY_OR_PATH')
                if x.isdir():continue
                if not x.isfile():raise ValueError('ARCHIVE_SPECIAL_FILE')
                total+=x.size
                if x.size>LIMIT or total>LIMIT:raise ValueError('ARCHIVE_SIZE')
                f=t.extractfile(x)
                if f is None:raise ValueError('ARCHIVE_UNREADABLE')
                data=f.read(LIMIT+1)
                if len(data)!=x.size:raise ValueError('ARCHIVE_LENGTH')
                entries.append({'name':x.name,'bytes':len(data),'sha256':digest(data)})
                if x.name.endswith('.tflite'):models.append((x.name,data))
                elif not x.name.lower().endswith(('.txt','.md','.json','license','notice')):raise ValueError('UNEXPECTED_PAYLOAD')
        fmt='TAR'
    if len(models)!=1 or pathlib.PurePosixPath(models[0][0]).name!='1.tflite':raise ValueError('EXPECTED_ONE_PUBLISHER_MODEL')
    return models[0][1],{'format':fmt,'fileName':models[0][0],'entries':entries}

class FB:
    def __init__(self,b):self.b=b
    def unpack(self,fmt,p):
        size=struct.calcsize(fmt)
        if not isinstance(p,int) or p<0 or p+size>len(self.b):raise ValueError('FLATBUFFER_BOUNDS')
        return struct.unpack_from(fmt,self.b,p)[0]
    def u32(self,p):return self.unpack('<I',p)
    def i32(self,p):return self.unpack('<i',p)
    def u16(self,p):return self.unpack('<H',p)
    def u8(self,p):return self.unpack('<B',p)
    def field(self,t,k):
        v=t-self.i32(t);pos=4+2*k
        if pos>=self.u16(v):return None
        off=self.u16(v+pos)
        return t+off if off else None
    def target(self,p):return p+self.u32(p)
    def vector(self,p):
        if p is None:return None,0
        t=self.target(p);n=self.u32(t)
        if n>20000000:raise ValueError('VECTOR_LIMIT')
        return t+4,n
    def tables(self,p):
        t,n=self.vector(p)
        if n>100000:raise ValueError('TABLE_LIMIT')
        return [self.target(t+i*4) for i in range(n)]
    def ints(self,p):
        t,n=self.vector(p)
        if n>4096:raise ValueError('INT_VECTOR_LIMIT')
        return [self.i32(t+i*4) for i in range(n)]
    def string(self,p):
        if p is None:return None
        t,n=self.vector(p)
        if n>200000 or t+n>len(self.b):raise ValueError('STRING_LIMIT')
        return self.b[t:t+n].decode('utf-8')
    def bytes(self,p):
        t,n=self.vector(p)
        if t is None or t+n>len(self.b):raise ValueError('BUFFER_LIMIT')
        return self.b[t:t+n]
    def value(self,t,k,reader,default):
        p=self.field(t,k);return default if p is None else reader(p)

def inspect(b):
    if len(b)<16 or b[4:8]!=b'TFL3':raise ValueError('NOT_TFLITE')
    f=FB(b);root=f.u32(0)
    groups=f.tables(f.field(root,2))
    if not groups or len(groups)>20:raise ValueError('SUBGRAPH_COUNT')
    g=groups[0];tensors=f.tables(f.field(g,0))
    def tensor(idx):
        if idx<0 or idx>=len(tensors):raise ValueError('TENSOR_INDEX')
        t=tensors[idx];typ=f.value(t,1,f.u8,0)
        return {'name':f.string(f.field(t,3)),'shape':f.ints(f.field(t,0)),
                'typeCode':typ,'typeName':{0:'FLOAT32',1:'FLOAT16',2:'INT32',3:'UINT8',9:'INT8'}.get(typ,'OTHER')}
    out={'sha256':digest(b),'bytes':len(b),'schemaVersion':f.value(root,0,f.u32,0),
         'inputs':[tensor(i) for i in f.ints(f.field(g,1))],
         'outputs':[tensor(i) for i in f.ints(f.field(g,2))],
         'metadata':[],'inferenceExecuted':False}
    buffers=f.tables(f.field(root,4))
    for t in f.tables(f.field(root,6)):
        name=f.string(f.field(t,0));idx=f.value(t,1,f.u32,0)
        m={'name':name}
        if name=='TFLITE_METADATA':
            if idx>=len(buffers):raise ValueError('METADATA_BUFFER_INDEX')
            data=f.bytes(f.field(buffers[idx],0));md=FB(data);r=md.u32(0)
            m.update(modelName=md.string(md.field(r,0)),author=md.string(md.field(r,4)),embeddedLicense=md.string(md.field(r,5)))
        out['metadata'].append(m)
    if zipfile.is_zipfile(io.BytesIO(b)):
        with zipfile.ZipFile(io.BytesIO(b)) as z:
            if len(z.infolist())>20:raise ValueError('ASSOCIATED_FILES_LIMIT')
            associated=[]
            for x in z.infolist():
                if not safe_name(x.filename) or x.flag_bits&1 or x.file_size>1024*1024:raise ValueError('ASSOCIATED_FILE_INVALID')
                data=z.read(x)
                associated.append({'name':x.filename,'bytes':len(data),'sha256':digest(data)})
            out['associatedFiles']=associated
    out['candidateInputMatches320Rgb']=len(out['inputs'])==1 and out['inputs'][0]['shape']==[1,320,320,3]
    out['metadataPresent']=any(x['name']=='TFLITE_METADATA' for x in out['metadata'])
    out['appCompatibilityVerified']=False
    return out

def main():
    ROOT.mkdir(exist_ok=True);RAW.mkdir(exist_ok=True)
    observation=json.loads(pathlib.Path('tools/kabiseo-model-provenance/publisher-observation.json').read_text(encoding='utf-8'))
    result={'schema':'KABISEO_PUBLISHER_MODEL_INSPECTION_V026','head':os.environ.get('GITHUB_SHA'),
            'runId':os.environ.get('GITHUB_RUN_ID'),'checkedAtUtc':datetime.now(timezone.utc).isoformat(),
            'publisherLicenseObservation':observation,'status':'NOT_RUN','securityGateVerdict':'REVIEW',
            'appSourceChanged':False,'privateV024Read':False,'modelExecuted':False,'androidBuilt':False,
            'installed':False,'releaseApproved':False,'originalFloat32LicenseResolved':False}
    try:
        packaged,receipt=read(PUBLISHER);b,archive=publisher_model(packaged)
        info=inspect(b)
        result['publisherDownload']=receipt;result['publisherArchive']=archive;result['publisherModel']=info
        (RAW/'publisher-lite0-detection-metadata-v1.tflite').write_bytes(b)
        result['publisherVersionDownloadVerified']=True
        result['licenseBoundToPublisherVariant']=observation['handle']=='tensorflow/efficientdet/tfLite/lite0-detection-metadata/1' and observation['observedLicenseLabel']=='Apache 2.0'
        try:
            c,cr=read(COMPARISON);ci=inspect(c)
            result['mediapipeInt8Comparison']={'download':cr,'model':ci,'byteIdenticalToPublisher':c==b}
            (RAW/'mediapipe-lite0-int8-v1.tflite').write_bytes(c)
        except Exception as exc:
            result['mediapipeInt8Comparison']={'status':'UNAVAILABLE','errorType':type(exc).__name__}
        result['status']='PUBLISHER_VARIANT_INSPECTED_NOT_APP_APPROVED'
    except Exception as exc:
        result['status']='BLOCKED'
        result['error']={'type':type(exc).__name__,'httpStatus':getattr(exc,'code',None)}
    (ROOT/'report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print('MODEL_PROVENANCE='+json.dumps(result,ensure_ascii=False,separators=(',',':')))
    if result['status']=='BLOCKED':raise SystemExit(2)
if __name__=='__main__':main()
