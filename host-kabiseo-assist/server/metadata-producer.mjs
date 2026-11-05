/** Camera metadata ONLY. Host callbacks are trusted internal adapters, never request JSON.
 * No retries. A new server runtime identity invalidates old requests after a restart.
 * This factory is embedded by the review-only source composer; no live entry imports it.
 */
export function createKabiseoMetadataProducer(host) {
  const records=new Map(),MAX_RECORDS=256;
  const hex=(s,n)=>typeof s==='string'&&new RegExp('^[a-f0-9]{'+n+'}$').test(s);
  const ident=s=>typeof s==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(s);
  const safe=(code,more={})=>Object.freeze({ok:false,code,readOnly:true,pixelsRead:false,
    gestureDispatched:false,cameraSettingsChanged:false,automaticZoomEnabled:false,restoreVerified:false,
    automaticReplay:false,...more});
  const capture=()=>{
    if(host.enabled()!==true)throw Error('disabled');
    const b=host.binding();
    if(!b||!ident(b.deviceId)||!ident(b.sessionId)||!ident(b.trustId)||!hex(b.ownerDigest,64)
      ||!hex(b.deviceDigest,64)||!hex(b.commandId,32)||!hex(b.runtimeDigest,64)
      ||!Number.isSafeInteger(b.expiresAt)||b.expiresAt<=host.now())throw Error('unbound');
    return Object.freeze({...b});
  };
  const same=(a,b)=>['deviceId','sessionId','trustId','ownerDigest','deviceDigest','commandId','runtimeDigest','expiresAt','supported']
    .every(k=>a[k]===b[k]);
  const current=b=>same(b,capture());
  const key=(b,a)=>b.deviceDigest+':'+b.commandId+':'+a.request_id;
  const summarize=(record,b,historical)=>{
    if(!current(b)||!same(record.binding,b))return safe('binding_changed');
    if(!record.jobId)return safe('submission_uncertain_no_retry');
    const j=host.lookup(record.jobId);
    if(!j||j.id!==record.jobId||j.type!=='kabiseo_camera_metadata'||j.commandId!==b.commandId
      ||j.targetDeviceId!==b.deviceId||j.targetDeviceDigest!==b.deviceDigest||j.secureSessionId!==b.sessionId
      ||j.mcpToolName!=='life_android_kabiseo_metadata'||j.taskDigest!==record.taskDigest
      ||j.action!=='KABISEO_CAMERA_METADATA'||j.cameraTargetPackage!=='com.openai.chatgpt'
      ||j.secureRequestedEffect!=='READ_ONLY'||!hex(j.secureMac,64))return safe('job_binding_unverified');
    if(j.status!=='complete')return safe('result_unconfirmed_use_result',{historical});
    const r=j.result;
    if(!r||r.readOnly!==true||r.pixelsRead!==false||r.gestureDispatched!==false||r.cameraSettingsChanged!==false
      ||r.automaticZoomEnabled!==false||r.restoreVerified!==false)return safe('receipt_boundary_invalid');
    if(!current(b))return safe('binding_changed');
    if(r.ok===true&&r.code==='kabiseo_camera_metadata_verified')return safe('camera_metadata_verified',{
      ok:true,historical,cameraSurfaceMatched:true,currentFrameVerified:false});
    if(r.ok===false&&r.code==='kabiseo_profile_not_enrolled')return safe('camera_profile_required',{historical});
    return safe('device_did_not_verify_camera',{historical});
  };
  return Object.freeze({async handle(args) {
    try {
      if(!args||Object.getPrototypeOf(args)!==Object.prototype||Object.keys(args).some(k=>
        !['mode','request_id','task_digest','runtime_digest'].includes(k)))return safe('request_invalid');
      if(!['STATUS','READ','RESULT'].includes(args.mode))return safe('mode_invalid');
      if(host.enabled()!==true)return safe('camera_metadata_disabled');
      const b=capture();
      if(args.mode==='STATUS') {
        if(Object.keys(args).length!==1)return safe('request_invalid');
        return safe('metadata_status',{runtimeDigest:b.runtimeDigest,deviceSupported:b.supported===true});
      }
      if(!hex(args.request_id,32)||!hex(args.task_digest,64)||!hex(args.runtime_digest,64))return safe('request_invalid');
      if(args.runtime_digest!==b.runtimeDigest)return safe('runtime_changed_no_replay');
      const k=key(b,args),previous=records.get(k);
      if(previous) {
        if(!same(previous.binding,b)||previous.taskDigest!==args.task_digest)return safe('request_scope_changed');
        if(args.mode==='READ')return safe('already_requested_use_result');
        return summarize(previous,b,true);
      }
      if(args.mode==='RESULT')return safe('request_not_found_no_recreation');
      if(b.supported!==true)return safe('device_camera_metadata_not_supported');
      if(records.size>=MAX_RECORDS)return safe('request_capacity_no_eviction');
      if(!current(b))return safe('binding_changed');
      const record={binding:b,taskDigest:args.task_digest,jobId:null};
      records.set(k,record); // reserve BEFORE signing/queueing; any exception remains consumed
      const payload=Object.freeze({requestId:args.request_id,taskDigest:args.task_digest,
        action:'KABISEO_CAMERA_METADATA',cameraTargetPackage:'com.openai.chatgpt'});
      const submitted=host.enqueue(payload,b);
      if(!submitted||!ident(submitted.id))return safe('submission_uncertain_no_retry');
      record.jobId=submitted.id;
      await host.wait(submitted.id);
      return summarize(record,b,false);
    } catch { return safe('metadata_unavailable_no_retry'); }
  }});
}
