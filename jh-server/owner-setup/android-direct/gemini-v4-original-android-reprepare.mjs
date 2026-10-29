/**
 * Original Android approved Gemini SUBMIT re-PREPARE.
 * Uses ONLY exactOriginalEnvelope56's signed computer_use_action_prepare,
 * existing result queue/readback and the ORIGINAL phone-local grant.
 *
 * A signed but untrusted "READY" JSON is not enough. The Android Runtime must
 * report approvalDiagnostic=action_approval_exact_match, exact action digest,
 * and valid one-shot lease/grant expiries. This module does not CLICK/SUBMIT.
 */
import {nativeTaskIdDigest} from './gemini-v4-original-computer-task-id.mjs';
import {nativeGeminiPrepareOwnerDigest} from './gemini-v4-original-computer-owner-scope.mjs';

const H32=/^[a-f0-9]{32}$/,H64=/^[a-f0-9]{64}$/;
const token=x=>typeof x==='string'&&x.length>=8&&x.length<=512;
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const goodJob=x=>obj(x)&&typeof x.id==='string'&&x.id.length>=5&&
 H64.test(x.secureMac??'')&&H64.test(x.securePayloadDigest??'')&&
 typeof x.secureNonce==='string'&&x.secureNonce.length>=16&&
 Number.isSafeInteger(x.secureExpiresAt);
const read=x=>{
 if(obj(x))return x;
 if(typeof x==='string'&&x.length<=10000){
  try{const y=JSON.parse(x);return obj(y)?y:null}catch{}
 }
 return null;
};
const bound=(j,g,p,o,t,q)=>{
 if(!goodJob(j)||!obj(g)||!obj(p)||!obj(o)||!obj(t)||!obj(q))return false;
 return j.type==='computer_use_action_prepare'&&
  j.targetDeviceId===o.deviceId&&j.secureSessionId===o.sessionId&&
  j.commandId===t.commandId&&j.taskId===t.id&&
  j.taskDigest===nativeTaskIdDigest(t.id)&&
  j.promptDigest===t.promptDigest&&
  j.ownerBindingDigest===nativeGeminiPrepareOwnerDigest(o)&&
  j.actionDigest===p.actionDigest&&
  j.prepareOperationId===q.prepareOperationId&&
  j.approvalOperationId===q.approvalOperationId&&
  j.executionOperationId===q.executionOperationId&&
  j.action==='CLICK'&&j.effect==='REVERSIBLE_WRITE'&&
  j.dataClass==='NONE'&&j.index===0&&j.maxActionsInCall===1&&
  j.x===p.x&&j.y===p.y&&
  j.viewportWidth===p.viewportWidth&&
  j.viewportHeight===p.viewportHeight&&
  j.actionApprovalGrantToken===g.actionApprovalGrantToken;
};
function phoneReady(job,p,now){
 const result=read(job?.result);
 return obj(result)&&result.ok===true&&result.code==='READY'&&
  result.requiresFreshApproval===false&&
  result.approvalDiagnostic==='action_approval_exact_match'&&
  result.approvalGrantSupplied===true&&
  result.actionDigest===p.actionDigest&&H64.test(result.screenDigest??'')&&
  Number.isSafeInteger(result.approvalGrantExpiresAt)&&
  result.approvalGrantExpiresAt>now&&
  Number.isSafeInteger(result.leaseExpiresAt)&&
  result.leaseExpiresAt>now&&token(result.leaseToken);
}
export function createV4OriginalAndroidApprovedRepreparePort({
 exactOriginalEnvelope,waitOriginalJob,verifyOriginalQueuedJob,
 verifyOriginalCompletedJob,clock=Date.now,enabled=false
}={}){
 if([exactOriginalEnvelope,waitOriginalJob,verifyOriginalQueuedJob,
     verifyOriginalCompletedJob,clock].some(x=>typeof x!=='function'))
  throw Error('ORIGINAL_ANDROID_REPREPARE_SIGNED_PORTS_REQUIRED');
 const issued=new WeakMap();
 async function prepare(g,p,o,t,q){
  if(!enabled)throw Error('ORIGINAL_ANDROID_APPROVED_REPREPARE_DISABLED');
  if(!obj(g)||!obj(p)||!obj(o)||!obj(t)||!obj(q)||
     g.source!=='ORIGINAL_ANDROID_ONE_SHOT'||g.phoneLocalApproved!==true||
     g.consumed!==false||!token(g.actionApprovalGrantToken)||
     !Number.isSafeInteger(g.expiresAtMs)||g.expiresAtMs<=clock()||
     g.taskId!==t.id||g.commandId!==t.commandId||
     g.deviceId!==o.deviceId||g.sessionId!==o.sessionId||
     g.taskDigest!==nativeTaskIdDigest(t.id)||
     g.promptDigest!==t.promptDigest||g.actionDigest!==p.actionDigest||
     g.ownerBindingDigest!==nativeGeminiPrepareOwnerDigest(o)||
     g.prepareOperationId!==q.prepareOperationId||
     g.approvalOperationId!==q.approvalOperationId||
     !H32.test(q.executionOperationId??'')||
     !Number.isSafeInteger(p.x)||!Number.isSafeInteger(p.y)||
     !Number.isSafeInteger(p.viewportWidth)||!Number.isSafeInteger(p.viewportHeight)||
     p.action!=='CLICK'||p.effect!=='REVERSIBLE_WRITE'||
     p.index!==0||p.maxActionsInCall!==1)
   throw Error('ORIGINAL_APPROVED_REPREPARE_SCOPE_REQUIRED');
  const args={
   device_id:o.deviceId,task_id:t.id,task_digest:g.taskDigest,
   effect:'REVERSIBLE_WRITE',action:'CLICK',data_class:'NONE',
   index:0,max_actions_in_call:1,
   x:p.x,y:p.y,viewport_width:p.viewportWidth,
   viewport_height:p.viewportHeight,
   action_approval_grant_token:g.actionApprovalGrantToken
  };
  const extra={
   commandId:t.commandId,prepareOperationId:q.prepareOperationId,
   approvalOperationId:q.approvalOperationId,
   executionOperationId:q.executionOperationId,
   promptDigest:t.promptDigest,
   ownerBindingDigest:g.ownerBindingDigest,actionDigest:p.actionDigest
  };
  const result=await exactOriginalEnvelope('life_android_computer_prepare',
   'computer_use_action_prepare','READ_ONLY',args,extra);
  const job=result?.job;
  if(result?.error||result.deviceId!==o.deviceId||
     job?.status!=='queued'||!bound(job,g,p,o,t,q)||
     job.secureExpiresAt<=clock()||
     await verifyOriginalQueuedJob(job,g,p,o,t,q)!==true)
   throw Error('ORIGINAL_REPREPARE_SIGNED_QUEUE_INVALID_NO_REPLAY');
  const completed=await waitOriginalJob(job.id);
  if(!completed||completed.id!==job.id||
     completed.status!=='complete'||!bound(completed,g,p,o,t,q)||
     completed.secureExpiresAt<=clock()||
     await verifyOriginalCompletedJob(completed,g,p,o,t,q)!==true||
     !phoneReady(completed,p,clock()))
   throw Error('ORIGINAL_REPREPARE_PHONE_CHECK_EXACT_NOT_VERIFIED_NO_REPLAY');
  issued.set(completed,{g,p,o,t,q});
  return completed;
 }
 async function verify(completed,g,t,o,p){
  const item=issued.get(completed);
  if(!item||!enabled||
     item.g!==g||g.expiresAtMs<=clock()||
     item.t.id!==t.id||item.t.commandId!==t.commandId||
     t.promptDigest!==item.t.promptDigest||
     o.deviceId!==item.o.deviceId||o.sessionId!==item.o.sessionId||
     nativeGeminiPrepareOwnerDigest(o)!==g.ownerBindingDigest||
     p.actionDigest!==item.p.actionDigest||
     !bound(completed,g,item.p,o,t,item.q)||
     completed.secureExpiresAt<=clock()||
     !phoneReady(completed,p,clock()))return false;
  try{return await verifyOriginalCompletedJob(completed,g,item.p,o,t,item.q)===true}
  catch{return false}
 }
 return Object.freeze({
  prepareOriginalApprovedAction:prepare,
  verifyOriginalFreshPreparedJob:verify,
  capabilities:()=>Object.freeze({enabled:enabled===true,
   originalSecure56Required:true,exactAndroidCheckRequired:true,
   phoneExecuteConnected:false,productionRegistered:false,
   automaticReplay:false})
 });
}
