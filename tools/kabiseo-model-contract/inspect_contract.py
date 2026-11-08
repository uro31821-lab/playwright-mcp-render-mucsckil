"""
Read-ONLY inspection of the exact already-pinned TensorFlow TFLite model and
compare the raw FlatBuffer schema against MediaPipe ObjectDetector's published
C++ graph expectations. Never run TFLite/MediaPipe, build Android, or access
private JH source. This is necessary evidence, not runtime compatibility.
"""
import hashlib, importlib.util, json, os, pathlib, sys
from datetime import datetime, timezone

ROOT=pathlib.Path('kabiseo-model-contract')
PUBLISHER_SHA='2e04c53bfeac0ac2a30c057c7e2a777594ce39baaac35a92f74fb1e8c4fc4e0b'
ARCHIVE_SHA='0799da1decd268958a9eb8341aab08eb99dee27b0ffdf9924e10ce428a97e854'
REFERENCE={
    'objectDetectorHeader':'https://github.com/google-ai-edge/mediapipe/blob/main/mediapipe/tasks/cc/vision/object_detector/object_detector.h',
    'postprocessor':'https://github.com/google-ai-edge/mediapipe/blob/main/mediapipe/tasks/cc/components/processors/detection_postprocessing_graph.cc',
    'metadataSchema':'https://github.com/google-ai-edge/mediapipe/blob/main/mediapipe/tasks/metadata/metadata_schema.fbs',
    'caveat':'Inspected current public source only; binary MediaPipe 1.1.1 native equivalence and Android inference unverified'
}

def load_prior():
    path=pathlib.Path('tools/kabiseo-model-provenance/inspect.py')
    spec=importlib.util.spec_from_file_location('jh_pinned_model_reader',path)
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def nested_table(f, parent, field_number):
    p=f.field(parent,field_number)
    return f.target(p) if p is not None else None

def find_metadata(f,root):
    buffers=f.tables(f.field(root,4))
    for t in f.tables(f.field(root,6)):
        if f.string(f.field(t,0))!='TFLITE_METADATA':continue
        idx=f.value(t,1,f.u32,0)
        if idx<0 or idx>=len(buffers):raise ValueError('METADATA_BUFFER_OUTSIDE')
        blob=f.bytes(f.field(buffers[idx],0))
        if len(blob)<8:raise ValueError('METADATA_TOO_SHORT')
        m=f.__class__(blob)
        model=m.u32(0)
        groups=m.tables(m.field(model,3))
        if len(groups)!=1:raise ValueError('EXPECTED_ONE_METADATA_SUBGRAPH')
        return m,model,groups[0]
    raise ValueError('TFLITE_MODEL_METADATA_MISSING')

def inspect(b,reader):
    f=reader.FB(b)
    model=f.u32(0)
    graphs=f.tables(f.field(model,2))
    if len(graphs)!=1:raise ValueError('EXPECTED_ONE_TFLITE_SUBGRAPH')
    graph=graphs[0]
    outputs=f.ints(f.field(graph,2))
    inputs=f.ints(f.field(graph,1))
    codes=f.tables(f.field(model,1))
    operators=f.tables(f.field(graph,3))
    if len(codes)>2000 or len(operators)>25000:raise ValueError('OPERATOR_LIMIT')
    matches=[i for i,c in enumerate(codes)
             if f.string(f.field(c,1))=='TFLite_Detection_PostProcess']
    connected=[]
    for operator in operators:
        codeidx=f.value(operator,0,f.u32,0)
        if codeidx in matches:
            connected.append({
                'outputIds':f.ints(f.field(operator,2)),
                'inputCount':len(f.ints(f.field(operator,1)))
            })
    m,metadata,submeta=find_metadata(f,model)
    outmeta=m.tables(m.field(submeta,3))
    inmeta=m.tables(m.field(submeta,2))
    names=[m.string(m.field(x,0)) for x in outmeta]
    label_records=[]
    for tensor in outmeta:
        for linked in m.tables(m.field(tensor,6)):
            label_records.append({
                'tensorName':m.string(m.field(tensor,0)),
                'fileName':m.string(m.field(linked,0)),
                'associatedType':m.value(linked,2,m.u8,0)})
    bbox={}
    if outmeta:
        content=nested_table(m,outmeta[0],3)
        if content is not None:
            propertytype=m.value(content,0,m.u8,0)
            properties=nested_table(m,content,1)
            bbox={'contentPropertyType':propertytype}
            if properties is not None and propertytype==3:
                bbox.update(
                    boxType=m.value(properties,1,m.u8,0),
                    coordinateType=m.value(properties,2,m.u8,0))
    tests={
        'singleTfliteSubgraph':len(graphs)==1,
        'uint8Rgb320Input':len(inputs)==1 and len(reader.inspect(b)['inputs'])==1
            and reader.inspect(b)['inputs'][0]['shape']==[1,320,320,3]
            and reader.inspect(b)['inputs'][0]['typeName']=='UINT8',
        'fourGraphOutputTensors':len(outputs)==4,
        'fourMetadataOutputTensors':len(outmeta)==4,
        'metadataInputCountMatches':len(inmeta)==len(inputs),
        'detectionPostprocessCustomOpcodePresent':len(matches)>0,
        'detectionPostprocessOperatorConnected':any(
            len(op['outputIds'])==4 and op['outputIds']==outputs for op in connected),
        'boundingBoxPropertyPresent':bbox.get('contentPropertyType')==3,
        'boundingBoxTypeBoundaries':bbox.get('boxType')==1,
        'boundingBoxCoordinatesRatio':bbox.get('coordinateType')==0,
        'allOutputsFloat32':all(x['typeName']=='FLOAT32' for x in reader.inspect(b)['outputs']),
        'categoryLabelsAssociated':any(
            z['associatedType']==3 and z['fileName'] and z['fileName'] in {
                item['name'] for item in reader.inspect(b).get('associatedFiles',[])}
            for z in label_records)
    }
    mandatory=[x for x in tests if x!='categoryLabelsAssociated']
    return {
        'graphInputCount':len(inputs),'graphOutputCount':len(outputs),
        'metadataInputCount':len(inmeta),'metadataOutputCount':len(outmeta),
        'metadataOutputNames':names,'bboxMetadata':bbox,
        'postprocessOpcodeIndices':matches,'postprocessOperators':connected,
        'labelAssociatedFiles':label_records,'checks':tests,'requiredChecks':mandatory,
        'requiredPass':all(tests[x] for x in mandatory),
        'staticOnly':True,'mediaPipe1_1_1ApiBinaryLinked':False,
        'onDeviceInferenceVerified':False,
        'noAutomaticModelReplacement':True
    }

def main():
    ROOT.mkdir(exist_ok=True)
    result={
        'schema':'KABISEO_PINNED_TFLITE_MEDIAPIPE_METADATA_CONTRACT_V027',
        'sourceHead':os.environ.get('GITHUB_SHA'),
        'runId':os.environ.get('GITHUB_RUN_ID'),
        'checkedAtUtc':datetime.now(timezone.utc).isoformat(),
        'previousLicenseSource':'TensorFlow Kaggle lite0-detection-metadata/1, license Apache-2.0 on publisher card and exact embedded model',
        'pinnedModelSha256':PUBLISHER_SHA,
        'publicSourceReferences':REFERENCE,
        'status':'NOT_RUN','privatePhotoMasterSourceRead':False,
        'androidAppBuilt':False,'androidApiLinked':False,
        'thirdPartyModelExecuted':False,'phoneAccessAttempted':False,
        'securityGateVerdict':'REVIEW','releaseApproved':False
    }
    try:
        reader=load_prior()
        packaged,download=reader.read(reader.PUBLISHER)
        if download['sha256']!=ARCHIVE_SHA:raise ValueError('PINNED_PUBLISHER_ARCHIVE_CHANGED')
        model,archive=reader.publisher_model(packaged)
        if hashlib.sha256(model).hexdigest()!=PUBLISHER_SHA:raise ValueError('PINNED_MODEL_BYTES_CHANGED')
        result['publisherArchiveSha256']=download['sha256']
        result['publisherModelBytes']=len(model)
        result['contract']=inspect(model,reader)
        if result['contract']['requiredPass']:
            result['status']='STATIC_METADATA_CONTRACT_CANDIDATE_ONLY'
        else:result['status']='STATIC_METADATA_CONTRACT_MISMATCH'
    except Exception as e:
        result['status']='BLOCKED'
        result['failureType']=type(e).__name__
        result['failureReason']=str(e)[:180]
    (ROOT/'report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    summary={k:result.get(k) for k in ('schema','sourceHead','status','pinnedModelSha256','securityGateVerdict','releaseApproved','failureType','failureReason')}
    if 'contract' in result:summary['contract']={k:result['contract'].get(k) for k in
        ('graphOutputCount','metadataOutputCount','metadataOutputNames','postprocessOpcodeIndices','bboxMetadata','checks','requiredPass')}
    print('KABISEO_MODEL_CONTRACT='+json.dumps(summary,ensure_ascii=False,separators=(',',':')))
    if result['status']=='BLOCKED':raise SystemExit(2)
if __name__=='__main__':main()
