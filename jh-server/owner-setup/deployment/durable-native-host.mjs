/** Host-only integration. The durable policy adds no authority to the signed phone request.
 * Writes are recorded before dispatch; diagnostic and consent-request routes keep their
 * original phone-local verification. No grants, secrets, or command text go into the DB.
 */
import {createHash} from 'node:crypto';
import {DurableManualCircuitFence} from './durable-manual-circuit-fence.mjs';
import {durableNativeJobPolicy} from './durable-native-job-policy.mjs';
const deny=(code,httpStatus=409)=>Object.freeze({allowed:false,code,httpStatus});
const allow=()=>Object.freeze({allowed:true});
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function createDurableNativeHooks({file,key,namespace,mode='read'}={}){
 const policies=new WeakMap(),records=new WeakMap(),proofs=new WeakMap();
 const journal=new DurableManualCircuitFence({file,key,namespace,mode,
  verifyAuthenticatedCompletion:({recordId,resultDigest,hostEvidence})=>{
   const p=hostEvidence&&typeof hostEvidence==='object'?proofs.get(hostEvidence):null;
   return !!p&&p.recordId===recordId&&p.resultDigest===resultDigest;
  }});
 let closed=false;
 const pass=p=>['READ','CONTROL','PROTECTED_READ'].includes(p?.kind);
 return Object.freeze({
  capture(job,payload){policies.set(job,durableNativeJobPolicy(job,payload));},
  beforeDispatch(job){
   const policy=policies.get(job);
   if(!policy)return deny('DURABLE_JOB_BINDING_REQUIRED');
   if(policy.kind==='DENY')return deny(policy.code);
   if(pass(policy))return allow();
   if(closed)return deny('DURABLE_STORAGE_UNAVAILABLE',503);
   if(policy.kind!=='JOURNAL'||job.status!=='queued'||!job.secureSessionId||!job.targetDeviceId)return deny('DURABLE_JOB_BINDING_REQUIRED');
   if(records.has(job))return deny('DURABLE_DISPATCH_ALREADY_RESERVED');
   try{
    const receipt=journal.reserveDispatch({deviceId:job.targetDeviceId,type:job.type,payload:policy.identityPayload});
    if(!receipt.allowed)return deny('DURABLE_PREVIOUS_OUTCOME_UNKNOWN');
    records.set(job,{recordId:receipt.recordId,sessionId:job.secureSessionId,deviceId:job.targetDeviceId,type:job.type});
    return allow();
   }catch{return deny('DURABLE_STORAGE_UNAVAILABLE',503)}
  },
  /** The candidate runtime invokes this ONLY after the existing HMAC/nonce checks. */
  acceptedCompletion(job,result){
   const policy=policies.get(job);
   if(!policy||policy.kind==='DENY')return deny('DURABLE_COMPLETION_BINDING_REQUIRED');
   if(pass(policy))return allow();
   if(closed)return deny('DURABLE_STORAGE_UNAVAILABLE',503);
   const record=records.get(job);
   if(!record||record.sessionId!==job.secureSessionId||record.deviceId!==job.targetDeviceId||record.type!==job.type||
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
