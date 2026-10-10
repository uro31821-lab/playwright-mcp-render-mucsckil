/** Exact host-side routing policy. Does not grant phone approval, capture consent or a lease.
 * Operation identities exclude ephemeral authorization material, so a fresh token cannot
 * bypass a pending identical action. The sealed device still validates every grant.
 */
const readTools=new Map([
 ['secure_device_status','life_android_secure_status'],
 ['computer_use_inspect','life_android_computer_inspect'],
 ['computer_use_action_prepare','life_android_computer_prepare'],
 ['computer_use_action_approval_status','life_android_action_approval_status'],
 ['computer_use_screen_consent_status','life_android_screen_consent_status']
]);
const controlTools=new Map([
 ['computer_use_action_approval_request','life_android_action_approval_request'],
 ['computer_use_screen_consent_request','life_android_screen_consent_request']
]);
const mutating=new Set(['CLICK','DOUBLE_CLICK','SCROLL','TYPE','KEYPRESS','DRAG','MOVE']);
const semanticFields=['action','x','y','viewportWidth','viewportHeight','scrollX','scrollY','keys','dragPath','textDigest','textValue'];
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const token=x=>typeof x==='string'&&x.length>0&&x.length<=512;
const answer=(kind,extra={})=>Object.freeze({kind,...extra});
const deny=code=>answer('DENY',{code});
export function durableNativeJobPolicy(job,payload){
 if(!object(job)||!object(payload))return deny('DURABLE_PAYLOAD_REQUIRED');
 if(payload.containsCredential===true||String(payload.dataClass||'NONE').toUpperCase()==='SECRET')return deny('DURABLE_SECRET_FORBIDDEN');
 if(job.type==='agent_snapshot')return answer('READ');
 if(readTools.has(job.type))return job.secureRequestedEffect==='READ_ONLY'&&job.mcpToolName===readTools.get(job.type)
  ?answer('READ'):deny('DURABLE_EXACT_ROUTE_REQUIRED');
 if(controlTools.has(job.type))return job.secureRequestedEffect==='REVERSIBLE_WRITE'&&job.mcpToolName===controlTools.get(job.type)
  ?answer('CONTROL',{approvalGranted:false,screenConsentGranted:false}):deny('DURABLE_EXACT_ROUTE_REQUIRED');
 if(job.type==='computer_use_capture_frame')return job.secureRequestedEffect==='READ_ONLY'&&job.mcpToolName==='life_android_capture_work_window'&&
  token(payload.leaseToken)&&token(payload.screenGrantToken)&&token(payload.frameUploadLease)
  ?answer('PROTECTED_READ',{screenConsentGranted:false}):deny('DURABLE_CAPTURE_SCOPE_REQUIRED');
 if(job.type==='open_url'||job.type==='agent_step')return answer('JOURNAL',{identityPayload:structuredClone(payload)});
 if(job.type!=='computer_use_action_execute'||job.mcpToolName!=='life_android_execute_computer_action'||job.secureRequestedEffect!=='MUTATION')return deny('DURABLE_OPERATION_NOT_SUPPORTED');
 if(!token(payload.leaseToken))return deny('DURABLE_ACTION_LEASE_REQUIRED');
 const action=String(payload.action||'');
 if(action==='WAIT')return Number.isSafeInteger(payload.waitMs)&&payload.waitMs>=0&&payload.waitMs<=60000
  ?answer('READ'):deny('DURABLE_WAIT_INVALID');
 if(action==='SCREENSHOT')return token(payload.screenGrantToken)
  ?answer('PROTECTED_READ',{screenConsentGranted:false}):deny('DURABLE_CAPTURE_SCOPE_REQUIRED');
 if(!mutating.has(action))return deny('DURABLE_ACTION_NOT_SUPPORTED');
 const identityPayload={};
 for(const key of semanticFields)if(Object.hasOwn(payload,key))identityPayload[key]=structuredClone(payload[key]);
 return answer('JOURNAL',{identityPayload,approvalGranted:false});
}
