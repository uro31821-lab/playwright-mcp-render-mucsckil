/** Host-only integration. No listener, enrollment, action approval, or implicit initialization.
 * Native open_url and agent_step writes are journaled. Known inspection calls remain read-only.
 * Unsupported device job types fail closed pending separate integration review.
 */
import {createHash} from 'node:crypto';
import {DurableManualCircuitFence} from './durable-manual-circuit-fence.mjs';
const reads=new Set(['agent_snapshot','secure_device_status','computer_use_inspect',
 'computer_use_action_prepare','computer_use_action_approval_status','computer_use_screen_consent_status']);
const writes=new Set(['open_url','agent_step']);
const deny=(code,httpStatus=409)=>Object.freeze({allowed:false,code,httpStatus});
const allow=()=>Object.freeze({allowed:true});
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function createDurableNativeHooks({file,key,namespace,mode='read'}={}){
 const commands=new WeakMap(),records=new WeakMap(),proofs=new WeakMap();
 const journal=new DurableManualCircuitFence({file,key,namespace,mode,
  verifyAuthenticatedCompletion:({recordId,resultDigest,hostEvidence})=>{
   const p=hostEvidence&&typeof hostEvidence==='object'?proofs.get(hostEvidence):null;
   return !!p&&p.recordId===recordId&&p.resultDigest===resultDigest;
  }});
 let closed=false;
 const isRead=j=>reads.has(j?.type)&&(j.type==='agent_snapshot'||j.secureRequestedEffect==='READ_ONLY');
 return Object.freeze({
  capture(job,payload){
   if(writes.has(job.type))commands.set(job,structuredClone(payload));
  },
  beforeDispatch(job){
   if(isRead(job))return allow();
   if(closed)return deny('DURABLE_STORAGE_UNAVAILABLE',503);
   if(!writes.has(job?.type))return deny('DURABLE_OPERATION_NOT_SUPPORTED');
   if(job.status!=='queued'||!job.secureSessionId||!job.targetDeviceId||!commands.has(job))return deny('DURABLE_JOB_BINDING_REQUIRED');
   if(records.has(job))return deny('DURABLE_DISPATCH_ALREADY_RESERVED');
   try{
    const receipt=journal.reserveDispatch({deviceId:job.targetDeviceId,type:job.type,payload:commands.get(job)});
    if(!receipt.allowed)return deny('DURABLE_PREVIOUS_OUTCOME_UNKNOWN');
    records.set(job,{recordId:receipt.recordId,sessionId:job.secureSessionId,deviceId:job.targetDeviceId});
    return allow();
   }catch{return deny('DURABLE_STORAGE_UNAVAILABLE',503)}
  },
  /** Called exclusively AFTER the sealed completion route validates its HMAC and nonce.
   * A client-provided field cannot manufacture the private WeakMap evidence capability.
   */
  acceptedCompletion(job,result){
   if(isRead(job))return allow();
   if(closed)return deny('DURABLE_STORAGE_UNAVAILABLE',503);
   const record=records.get(job);
   if(!record||record.sessionId!==job.secureSessionId||record.deviceId!==job.targetDeviceId||
      !['in_progress','complete'].includes(job.status))return deny('DURABLE_COMPLETION_BINDING_REQUIRED');
   if(!result||typeof result!=='object'||Array.isArray(result)||typeof result.ok!=='boolean')return deny('DURABLE_RESULT_NOT_CLASSIFIED');
   const resultDigest=digest([job.id,job.secureSessionId,result]);
   const evidence=Object.freeze({});proofs.set(evidence,{recordId:record.recordId,resultDigest});
   try{
    journal.recordAuthenticatedDeviceResult({recordId:record.recordId,resultDigest,hostEvidence:evidence});
    return allow();
   }catch(e){
    return deny(e?.code==='JOURNAL_RESULT_CONFLICT'?'DURABLE_RESULT_CONFLICT':'DURABLE_RECEIPT_NOT_SAVED',e?.code==='JOURNAL_RESULT_CONFLICT'?409:503);
   }finally{proofs.delete(evidence)}
  },
  close(){if(closed)return;closed=true;journal.close()}
 });
}
