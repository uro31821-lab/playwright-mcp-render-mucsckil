/** Server-side capability handshake candidate. Existing secure_device_status only.
 * Host callbacks and jobs are trusted INTERNAL adapters, never request JSON.
 * The existing Secure56 signer/completion verifier remains the sole authority.
 * Capability is not a camera profile, permission, pixel grant or zoom approval.
 * No live entry imports this file. Current Android capability reply is NOT wired.
 */
export function createKabiseoCapabilityProbe(host) {
  const records=new Map(),latest=new Map(),MAX=256,TTL=30000;
  const fields=['deviceId','sessionId','trustId','ownerDigest','deviceDigest','commandId','runtimeDigest','expiresAt'];
  const hex=(s,n)=>typeof s==='string'&&new RegExp('^[a-f0-9]{'+n+'}$').test(s);
  const ident=s=>typeof s==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(s);
  const now=()=>{const n=host.now();if(!Number.isSafeInteger(n)||n<0)throw Error('clock');return n;};
  const safe=(code,extra={})=>Object.freeze({ok:false,code,deviceSupported:false,capabilityVerified:false,
    readOnly:true,pixelsRead:false,gestureDispatched:false,cameraSettingsChanged:false,
    automaticZoomEnabled:false,restoreVerified:false,cameraSurfaceMatched:false,automaticReplay:false,...extra});
  const capture=()=>{
    if(host.enabled()!==true){latest.clear();throw Error('disabled');}
    const b=host.binding();
    if(!b||!ident(b.deviceId)||!ident(b.sessionId)||!ident(b.trustId)||!hex(b.ownerDigest,64)
      ||!hex(b.deviceDigest,64)||!hex(b.commandId,32)||!hex(b.runtimeDigest,64)
      ||!Number.isSafeInteger(b.expiresAt)||b.expiresAt<=now())throw Error('unbound');
    return Object.freeze(Object.fromEntries(fields.map(k=>[k,b[k]])));
  };
  const same=(a,b)=>!!a&&!!b&&fields.every(k=>a[k]===b[k]);
  const scope=b=>JSON.stringify(fields.map(k=>b[k]));
  const matches=(j,r)=>!!j&&j.id===r.jobId&&j.type==='secure_device_status'
    &&j.mcpToolName==='life_android_secure_status'&&j.secureRequestedEffect==='READ_ONLY'
    &&j.commandId===r.binding.commandId&&j.targetDeviceId===r.binding.deviceId
    &&j.targetDeviceDigest===r.binding.deviceDigest&&j.secureSessionId===r.binding.sessionId
    &&j.requestId===r.requestId&&j.taskDigest===r.taskDigest
    &&j.capabilityChallenge==='KABISEO_CAMERA_METADATA_V1';
  const claim=(j,r)=>{
    const c=j?.result?.kabiseoCameraMetadata;
    if(j?.result?.ok!==true||!c||c.schema!=='KABISEO_CAMERA_METADATA_CAPABILITY_V1'
      ||c.requestId!==r.requestId||c.version!==1||c.enabled!==true
      ||c.cameraTargetPackage!=='com.openai.chatgpt'||c.readOnly!==true
      ||['pixelsRead','gestureDispatched','cameraSettingsChanged','automaticZoomEnabled','restoreVerified','cameraSurfaceMatched']
        .some(k=>c[k]!==false))return null;
    // Store only an allowlisted scalar claim. Never persist arbitrary status text.
    return JSON.stringify({schema:c.schema,requestId:c.requestId,version:c.version,enabled:c.enabled,
      cameraTargetPackage:c.cameraTargetPackage,readOnly:c.readOnly,pixelsRead:c.pixelsRead,
      gestureDispatched:c.gestureDispatched,cameraSettingsChanged:c.cameraSettingsChanged,
      automaticZoomEnabled:c.automaticZoomEnabled,restoreVerified:c.restoreVerified,cameraSurfaceMatched:c.cameraSurfaceMatched});
  };
  const intact=r=>{
    const j=host.lookup(r.jobId);
    return !!r.issued&&j===r.issued&&matches(j,r)&&j.secureExpiresAt===r.signedExpiry;
  };
  const live=r=>same(r.binding,capture())&&latest.get(scope(r.binding))===r
    &&now()>=r.began&&now()<r.validUntil;
  function supported(binding) {
    try {
      if(!same(binding,capture()))return false;
      const r=latest.get(scope(binding));
      return !!r?.accepted&&live(r)&&intact(r)&&r.issued.status==='complete'
        &&r.issued.result===r.acceptedResult&&claim(r.issued,r)===r.accepted;
    } catch {return false;}
  }
  const finish=(r,historical)=>{
    if(!live(r))return safe('capability_scope_changed_or_expired',{historical});
    if(!intact(r))return safe('capability_job_unverified',{historical});
    const j=r.issued;
    if(j.status!=='complete')return safe('capability_result_unconfirmed_use_result',{historical});
    const verified=claim(j,r);
    if(!verified)return safe('device_capability_not_supported',{historical});
    if(r.accepted&&(r.acceptedResult!==j.result||r.accepted!==verified))return safe('capability_receipt_changed',{historical});
    r.accepted=verified;r.acceptedResult=j.result;
    if(!supported(r.binding))return safe('capability_scope_changed_or_expired',{historical});
    return safe('camera_metadata_capability_verified',{ok:true,deviceSupported:true,capabilityVerified:true,historical});
  };
  return Object.freeze({supported,async handle(args){
    try {
      if(!args||Object.getPrototypeOf(args)!==Object.prototype||Object.keys(args).some(k=>
        !['mode','request_id','task_digest','runtime_digest'].includes(k)))return safe('capability_request_invalid');
      if(!['STATUS','PROBE','RESULT'].includes(args.mode))return safe('capability_request_invalid');
      if(host.enabled()!==true){latest.clear();return safe('camera_metadata_disabled');}
      const b=capture();
      if(args.mode==='STATUS'){
        if(Object.keys(args).length!==1)return safe('capability_request_invalid');
        const yes=supported(b);
        return safe('capability_status',{runtimeDigest:b.runtimeDigest,deviceSupported:yes,capabilityVerified:yes});
      }
      if(!hex(args.request_id,32)||!hex(args.task_digest,64)||!hex(args.runtime_digest,64))return safe('capability_request_invalid');
      if(args.runtime_digest!==b.runtimeDigest)return safe('capability_runtime_changed_no_replay');
      const k=b.deviceDigest+':'+b.commandId+':'+args.request_id,old=records.get(k);
      if(old){
        if(!same(old.binding,b)||old.taskDigest!==args.task_digest)return safe('capability_request_scope_changed');
        if(args.mode==='PROBE')return safe('capability_already_requested_use_result');
        return finish(old,true);
      }
      if(args.mode==='RESULT')return safe('capability_request_not_found_no_recreation');
      if(records.size>=MAX)return safe('capability_capacity_no_eviction');
      const began=now(),r={binding:b,requestId:args.request_id,taskDigest:args.task_digest,
        began,validUntil:Math.min(began+TTL,b.expiresAt),jobId:null,issued:null,accepted:null};
      records.set(k,r);latest.set(scope(b),r); // consumes request and revokes prior support BEFORE enqueue
      if(!same(b,capture()))return safe('capability_scope_changed_or_expired');
      const sent=host.enqueue(Object.freeze({requestId:r.requestId,taskDigest:r.taskDigest,
        capabilityChallenge:'KABISEO_CAMERA_METADATA_V1'}),b);
      if(!sent||!ident(sent.id))return safe('capability_submission_uncertain_no_retry');
      r.jobId=sent.id;const j=host.lookup(r.jobId);
      if(!live(r)||!matches(j,r)||!hex(j.secureMac,64)||!['queued','in_progress'].includes(j.status)
        ||j.result!==undefined||!Number.isSafeInteger(j.secureExpiresAt)||j.secureExpiresAt<=began
        ||j.secureExpiresAt-began>60000)return safe('capability_signed_submission_unverified');
      r.issued=j;r.signedExpiry=j.secureExpiresAt;r.validUntil=Math.min(r.validUntil,r.signedExpiry);
      await host.wait(j.id);
      return finish(r,false);
    }catch{return safe('capability_unavailable_no_retry');}
  }});
}
