import {createKabiseoMetadataProducer} from './metadata-producer.mjs';
const shared='\n// KABISEO_SERVER_METADATA_V010_BEGIN\n'+
  'const jhKabiseoMetadataProducer56=('+createKabiseoMetadataProducer.toString()+`)({
  enabled(){return process.env.JH_KABISEO_METADATA_REVIEW==='EXPLICIT_READ_ONLY_CAMERA_V1';},
  now(){return Date.now();},
  binding(){
    const deviceId=chooseDevice(),a=deviceId&&active56(deviceId),meta=deviceId&&devices.get(deviceId);
    if(!a||meta?.secureBridgeVersion!==56||meta.deviceDigest!==a.deviceDigest)return null;
    const commandId=jhRequireCommand56(deviceId);
    return {deviceId,commandId,sessionId:a.sessionId,trustId:a.trustId,ownerDigest:a.ownerDigest,
      deviceDigest:a.deviceDigest,runtimeDigest:jhWorkflowRuntimeDigest56,expiresAt:a.expiresAt,
      // Explicit host-owned negotiated capability. Current phone does NOT advertise it yet.
      supported:meta.kabiseoCameraMetadataVersion===1};
  },
  enqueue(payload,b){
    if(jhRequireCommand56(b.deviceId)!==b.commandId||active56(b.deviceId)?.sessionId!==b.sessionId)
      throw Error('kabiseo_binding_changed');
    const x=exactEnvelope56('life_android_kabiseo_metadata','kabiseo_camera_metadata','READ_ONLY',
      {device_id:b.deviceId,task_digest:payload.taskDigest,data_class:'NONE'},
      {requestId:payload.requestId,action:payload.action,cameraTargetPackage:payload.cameraTargetPackage});
    if(x.error||!x.job)throw Error('kabiseo_signed_dispatch_unavailable');
    return {id:x.job.id};
  },
  lookup(id){return jobs.get(id);},
  wait(id){const j=jobs.get(id);return j?waitJob(j,15000):Promise.resolve(null);}
});
// KABISEO_SERVER_METADATA_V010_END
`;
const registration=`
  // KABISEO_TOOL_V010_BEGIN
  registerOAuthTool('life_android_kabiseo_metadata',{
    title:'카비서 촬영 화면 메타데이터 확인',
    description:'Explicit read-only camera metadata candidate. STATUS never queues a job; READ requires current runtime_digest and one request_id; RESULT never retries. Not camera control or pixel access.',
    inputSchema:{mode:z.enum(['STATUS','READ','RESULT']),request_id:z.string().optional(),
      task_digest:z.string().optional(),runtime_digest:z.string().optional()},
    annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}
  },async(args)=>textResult(await jhKabiseoMetadataProducer56.handle(args)));
  // KABISEO_TOOL_V010_END
`;
const scope='function createMcp(){',anchor='  registerOAuthTool("life_status",{';
export function applyKabiseoMetadataPatch(source){
  if(typeof source!=='string'||source.includes('KABISEO_SERVER_METADATA_V010_BEGIN')
    ||source.includes("registerOAuthTool('life_android_kabiseo_metadata'")
    ||source.split(scope).length!==2||source.split(anchor).length!==2
    ||!source.includes('function exactEnvelope56(')||!source.includes('function jhRequireCommand56(')
    ||!source.includes('commandId:jhRequireCommand56(')||!source.includes('jhWorkflowRuntimeDigest56')
    ||!source.includes('jhCommandTool56(name,config,handler)'))throw Error('KABISEO_ORIGINAL_RUNTIME_REQUIRED');
  const out=source.replace(scope,shared+scope).replace(anchor,registration+anchor);
  if(reverseKabiseoMetadataPatch(out)!==source)throw Error('KABISEO_PATCH_NOT_REVERSIBLE');
  return out;
}
export function reverseKabiseoMetadataPatch(source){
  if(source.split(shared).length!==2||source.split(registration).length!==2)throw Error('KABISEO_PATCH_DRIFT');
  return source.replace(shared,'').replace(registration,'');
}
