/**
 * Original Secure56 Android one-shot approval wire adapter.
 *
 * Source contract: AndroidComputerUseTransport.actionApprovalStatus:
 * {ok:true, approved:Boolean, grantToken:String|null,
 *  grantExpiresAt:Long|null, automaticApprovalRetryAllowed:false}.
 * It is NOT the same as {code:"APPROVED"}.
 *
 * The status response alone CANNOT authorize a click. Only a verified original
 * signed phone job can yield a host-local grant; the original phone must then
 * independently check the exact grant in a FRESH prepare and atomically consume
 * it at dispatch. This module does not create approval, an executor, or a retry.
 */
import {nativeTaskIdDigest} from './gemini-v4-original-computer-task-id.mjs';
import {nativeGeminiPrepareOwnerDigest} from './gemini-v4-original-computer-owner-scope.mjs';

const H64=/^[a-f0-9]{64}$/;
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const token=x=>typeof x==='string'&&x.length>=8&&x.length<=512;
const id=x=>typeof x==='string'&&x.length>=5&&x.length<=200;
const payload=x=>{
 if(obj(x))return x;
 if(typeof x==='string'&&x.length<=10000){try{const y=JSON.parse(x);return obj(y)?y:null}catch{}}
 return null;
};
const scope=(owner,task,operation)=>({
 taskId:task.id,commandId:task.commandId,
 deviceId:owner.deviceId,sessionId:owner.sessionId,
 taskDigest:nativeTaskIdDigest(task.id),
 promptDigest:task.promptDigest,actionDigest:operation.actionDigest,
 ownerBindingDigest:nativeGeminiPrepareOwnerDigest(owner),
 prepareOperationId:operation.operationId
});

/** Explicitly classify the REAL Kotlin wire reply; never return its token. */
export function classifyV4OriginalAndroidApprovalWire(raw,now=Date.now()){
 const x=payload(raw);
 if(!x||x.ok!==true||x.automaticApprovalRetryAllowed!==false||
    typeof x.approved!=='boolean')
  return Object.freeze({ok:false,code:'ANDROID_APPROVAL_STATUS_CONTRACT_INVALID'});
 if(x.approved===false){
  if((x.grantToken!==null&&x.grantToken!==undefined)||
     (x.grantExpiresAt!==null&&x.grantExpiresAt!==undefined))
   return Object.freeze({ok:false,code:'ANDROID_UNAPPROVED_WITH_GRANT_FORBIDDEN'});
  return Object.freeze({ok:true,code:'ANDROID_PHONE_APPROVAL_NOT_CONFIRMED',
    approved:false});
 }
 if(!token(x.grantToken)||!Number.isSafeInteger(x.grantExpiresAt)||
    !Number.isSafeInteger(now)||x.grantExpiresAt<=now||
    x.grantExpiresAt-now>120000)
  return Object.freeze({ok:false,code:'ANDROID_APPROVED_GRANT_EXPIRED_OR_INVALID'});
 return Object.freeze({ok:true,code:'ANDROID_APPROVED_WITH_ACTIVE_ONE_SHOT_GRANT',
   approved:true,expiresAtMs:x.grantExpiresAt});
}

/** Trusted in-process adapter only, never attach methods to an MCP tool. */
export function createV4OriginalAndroidOneShotGrantAdapter({
 readSignedOriginalStatusJob,verifySignedOriginalStatusJob,
 verifyInstalledAndroidApprovalContract,clock=Date.now,enabled=false
}={}){
 if([readSignedOriginalStatusJob,verifySignedOriginalStatusJob,
  verifyInstalledAndroidApprovalContract,clock].some(f=>typeof f!=='function'))
  throw Error('ORIGINAL_ANDROID_SIGNED_APPROVAL_PORTS_REQUIRED');
 const issued=new WeakMap();
 const ready=async()=>{
  if(!enabled)return false;
  try{return await verifyInstalledAndroidApprovalContract()===true}
  catch{return false}
 };
 async function read(approvalRequestJob,task,owner,operation){
  if(!await ready()||!obj(approvalRequestJob)||!obj(task)||!obj(owner)||!obj(operation))
   return null;
  if(approvalRequestJob.type!=='computer_use_action_approval_request'||
     approvalRequestJob.status!=='complete'||!id(approvalRequestJob.id)||
     approvalRequestJob.taskId!==task.id||
     approvalRequestJob.commandId!==task.commandId||
     approvalRequestJob.secureSessionId!==owner.sessionId||
     approvalRequestJob.targetDeviceId!==owner.deviceId||
     approvalRequestJob.prepareOperationId!==operation.operationId||
     !id(approvalRequestJob.approvalOperationId))
   return null;
  let b;
  try{b=scope(owner,task,operation)}catch{return null}
  if(approvalRequestJob.taskDigest!==b.taskDigest||
     approvalRequestJob.promptDigest!==b.promptDigest||
     approvalRequestJob.actionDigest!==b.actionDigest||
     approvalRequestJob.ownerBindingDigest!==b.ownerBindingDigest)return null;
  const request=payload(approvalRequestJob.result);
  if(request?.ok!==true||
    request.code!=='local_action_approval_required'||
    !token(request.requestToken)||!Number.isSafeInteger(request.expiresAt))
   return null;
  let signed;
  try{signed=await readSignedOriginalStatusJob(approvalRequestJob,task,owner,operation)}
  catch{return null}
  const j=signed;
  if(!obj(j)||j.type!=='computer_use_action_approval_status'||
    j.status!=='complete'||!id(j.id)||
    j.targetDeviceId!==owner.deviceId||j.secureSessionId!==owner.sessionId||
    j.commandId!==b.commandId||j.taskId!==b.taskId||
    j.taskDigest!==b.taskDigest||j.promptDigest!==b.promptDigest||
    j.actionDigest!==b.actionDigest||
    j.ownerBindingDigest!==b.ownerBindingDigest||
    j.prepareOperationId!==b.prepareOperationId||
    j.approvalOperationId!==approvalRequestJob.approvalOperationId||
    j.requestToken!==request.requestToken||
    !H64.test(j.secureMac??'')||!H64.test(j.securePayloadDigest??'')||
    !Number.isSafeInteger(j.secureExpiresAt)||j.secureExpiresAt<=clock())
   return null;
  let verified;
  try{verified=await verifySignedOriginalStatusJob(j,approvalRequestJob,task,owner,operation)}
  catch{return null}
  if(verified!==true)return null;
  const wire=payload(j.result);
  if(classifyV4OriginalAndroidApprovalWire(wire,clock()).code!==
     'ANDROID_APPROVED_WITH_ACTIVE_ONE_SHOT_GRANT')
   return null;
  // The phone status is only a current, unconsumed grant candidate.
  // The Android fresh PREPARE must still checkExact and bind action/screen.
  const grant=Object.freeze({
   source:'ORIGINAL_ANDROID_ONE_SHOT',phoneLocalApproved:true,
   consumed:false,
   ...b,approvalOperationId:approvalRequestJob.approvalOperationId,
   approvalRequestJobId:approvalRequestJob.id,
   actionApprovalGrantToken:wire.grantToken,
   expiresAtMs:wire.grantExpiresAt
  });
  issued.set(grant,{job:j,approvalRequestJob,task,owner,operation});
  return grant;
 }
 async function verify(grant,approvalRequestJob,task,owner,operation){
  const z=issued.get(grant);
  if(!z||!await ready()||!obj(approvalRequestJob)||!obj(task)||
     !obj(owner)||!obj(operation)||grant.expiresAtMs<=clock()||
     grant.consumed!==false||
     grant.approvalRequestJobId!==approvalRequestJob.id||
     grant.approvalOperationId!==approvalRequestJob.approvalOperationId||
     grant.prepareOperationId!==operation.operationId||
     grant.taskId!==task.id||grant.commandId!==task.commandId||
     grant.deviceId!==owner.deviceId||grant.sessionId!==owner.sessionId||
     grant.taskDigest!==nativeTaskIdDigest(task.id)||
     grant.promptDigest!==task.promptDigest||
     grant.actionDigest!==operation.actionDigest||
     grant.ownerBindingDigest!==nativeGeminiPrepareOwnerDigest(owner)||
     grant.actionApprovalGrantToken!==payload(z.job.result)?.grantToken||
     z.job.secureExpiresAt<=clock())
   return false;
  try{return await verifySignedOriginalStatusJob(z.job,approvalRequestJob,task,owner,operation)===true}
  catch{return false}
 }
 return Object.freeze({
  originalPhoneGrantContractReady:ready,
  readOriginalPhoneOneShotGrant:read,
  verifyOriginalPhoneOneShotGrant:verify,
  capabilities:()=>Object.freeze({
   enabled:enabled===true,originalSecure56Required:true,
   phoneTokenPrivateToOriginalHost:true,
   originalAndroidExactGrantReprepareRequired:true,
   productionRegistered:false,automaticReplay:false
  })
 });
}
