/**
 * JH167 V4 / original Secure56: guarded one-shot Gemini SUBMIT EXECUTE candidate.
 *
 * This module does NOT create a phone approval, a new executor, a signer or a
 * Google API request. The original host must independently verify a real
 * Android one-shot grant and perform a FRESH approved phone PREPARE before this
 * module may queue EXACTLY ONE original Secure56 EXECUTE job. No Android grant
 * schema is guessed or accepted from public MCP/caller JSON.
 *
 * Approval, local CLICK attempt, Google message acceptance and GPT delivery
 * are four separate results. Candidate only; not registered in production.
 */
import {createHash} from 'node:crypto';
import {FileDurableExecutionStore} from '../deployment/jh-result-verification/file-durable-execution-store.mjs';
import {nativeTaskIdDigest} from './gemini-v4-original-computer-task-id.mjs';
import {nativeGeminiPrepareOwnerDigest} from './gemini-v4-original-computer-owner-scope.mjs';

const H32=/^[a-f0-9]{32}$/,H64=/^[a-f0-9]{64}$/;
const ID=/^[A-Za-z0-9_-]{8,80}$/;
const H='com.google.android.googlequicksearchbox';
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const tok=x=>typeof x==='string'&&x.length>=8&&x.length<=512;
const jid=x=>typeof x==='string'&&x.length>=5&&x.length<=200;
const sha=x=>createHash('sha256').update(x,'utf8').digest('hex');
const approvalKey=id=>'JH167_V4_GEMINI_APPROVAL:'+sha(id);
const executionKey=id=>'JH167_V4_GEMINI_APPROVED_EXECUTE:'+sha(id);
const failure=code=>Object.freeze({ok:false,code,automaticReplay:false,
 executeQueued:false,localClickAttemptVerified:false,googleMessageVerified:false,
 fullReplyVerified:false,chatGptDelivered:false});
const answer=(code,extra={})=>Object.freeze({ok:true,code,automaticReplay:false,
 localClickAttemptVerified:false,googleMessageVerified:false,
 fullReplyVerified:false,chatGptDelivered:false,...extra});
const matching=(a,b)=>obj(a)&&obj(b)&&[
 'deviceId','sessionId','commandId','workSide','chatSide',
 'workPackage','chatPackage','workWindowId','chatWindowId',
 'workBounds','chatBounds'
].every(k=>a[k]===b[k]);
function validOwner(o,cmd,now){
 return obj(o)&&o.current===true&&o.secure56===true&&
  o.backend==='JH_ANDROID_NATIVE'&&o.commandId===cmd&&
  o.workSide==='RIGHT'&&o.chatSide==='LEFT'&&
  o.workPackage===H&&o.chatPackage==='com.openai.chatgpt'&&
  typeof o.deviceId==='string'&&o.deviceId.length>=5&&
  typeof o.sessionId==='string'&&o.sessionId.length>=5&&
  Number.isSafeInteger(o.workWindowId)&&Number.isSafeInteger(o.chatWindowId)&&
  o.workWindowId!==o.chatWindowId&&
  Number.isSafeInteger(o.observedAt)&&o.observedAt<=now&&
  now-o.observedAt<=10000;
}
function validTask(t,id,cmd,o){
 return obj(t)&&t.schema===4&&t.id===id&&t.commandId===cmd&&
  t.backend==='JH_ANDROID_NATIVE'&&t.workSide==='RIGHT'&&
  t.chatSide==='LEFT'&&['YOUTUBE','VIDEO'].includes(t.mode)&&
  t.cancelled!==true&&t.pending?.kind==='SUBMIT'&&
  t.deviceId===o.deviceId&&t.sessionId===o.sessionId&&
  H64.test(t.promptDigest??'');
}
const reqOk=q=>obj(q)&&ID.test(q.taskId??'')&&
 H32.test(q.commandId??'')&&H32.test(q.prepareOperationId??'')&&
 H32.test(q.approvalOperationId??'')&&H32.test(q.executionOperationId??'')&&
 new Set([q.prepareOperationId,q.approvalOperationId,q.executionOperationId]).size===3;
function jobSigned(j){
 return obj(j)&&jid(j.id)&&H64.test(j.secureMac??'')&&
  H64.test(j.securePayloadDigest??'')&&
  typeof j.secureNonce==='string'&&j.secureNonce.length>=16&&
  Number.isSafeInteger(j.secureExpiresAt);
}
function originalApprovalRecord(r,q,o,p){
 const m=r?.metadata;
 return obj(m)&&r.dedupeKey===approvalKey(q.approvalOperationId)&&
  r.scope==='JH167_GEMINI_PHONE_APPROVAL_REQUEST'&&
  r.replayAllowed===false&&r.effectKind==='EXTERNAL_EFFECT'&&
  !!r.dispatchStartedAt&&['DISPATCHING','NEEDS_REVIEW'].includes(r.state)&&
  m.jhV4OriginalApprovalRequest===true&&
  m.approvalOperationId===q.approvalOperationId&&
  m.prepareOperationId===q.prepareOperationId&&
  m.commandId===q.commandId&&m.taskId===q.taskId&&
  m.deviceId===o.deviceId&&m.sessionId===o.sessionId&&
  m.taskDigest===p.taskDigest&&m.promptDigest===p.promptDigest&&
  m.actionDigest===p.actionDigest&&
  m.ownerBindingDigest===p.ownerBindingDigest&&jid(m.jobId);
}
function validPrepareJob(j,p,t,o){
 return jobSigned(j)&&j.id===p.jobId&&
  j.type==='computer_use_action_prepare'&&j.status==='complete'&&
  j.targetDeviceId===o.deviceId&&j.secureSessionId===o.sessionId&&
  j.commandId===o.commandId&&j.operationId===p.operationId&&
  j.taskId===t.id&&j.taskDigest===p.taskDigest&&
  j.promptDigest===p.promptDigest&&
  j.actionDigest===p.actionDigest&&j.ownerBindingDigest===p.ownerBindingDigest&&
  j.action==='CLICK'&&j.effect==='REVERSIBLE_WRITE'&&
  j.dataClass==='NONE'&&j.maxActionsInCall===1&&j.index===0&&
  Number.isSafeInteger(j.x)&&Number.isSafeInteger(j.y)&&
  Number.isSafeInteger(j.viewportWidth)&&Number.isSafeInteger(j.viewportHeight)&&
  j.x>=0&&j.y>=0&&j.x<j.viewportWidth&&j.y<j.viewportHeight;
}
function validApprovalJob(j,q,p,o,approvalRecord){
 return jobSigned(j)&&j.id===approvalRecord.metadata.jobId&&
  j.type==='computer_use_action_approval_request'&&j.status==='complete'&&
  j.targetDeviceId===o.deviceId&&j.secureSessionId===o.sessionId&&
  j.commandId===q.commandId&&j.taskId===q.taskId&&
  j.approvalOperationId===q.approvalOperationId&&
  j.prepareOperationId===q.prepareOperationId&&
  j.taskDigest===p.taskDigest&&j.promptDigest===p.promptDigest&&
  j.actionDigest===p.actionDigest&&j.ownerBindingDigest===p.ownerBindingDigest&&
  j.action==='CLICK';
}
function validGrant(g,q,p,o,approvalJob,now){
 // This is an INTERNAL ORIGINAL-HOST adapter shape, not an Android wire schema.
 return obj(g)&&g.source==='ORIGINAL_ANDROID_ONE_SHOT'&&
  g.phoneLocalApproved===true&&g.consumed===false&&
  g.taskId===q.taskId&&g.commandId===q.commandId&&
  g.prepareOperationId===q.prepareOperationId&&
  g.approvalOperationId===q.approvalOperationId&&
  g.deviceId===o.deviceId&&g.sessionId===o.sessionId&&
  g.approvalRequestJobId===approvalJob.id&&
  g.taskDigest===p.taskDigest&&g.promptDigest===p.promptDigest&&
  g.actionDigest===p.actionDigest&&g.ownerBindingDigest===p.ownerBindingDigest&&
  tok(g.actionApprovalGrantToken)&&
  Number.isSafeInteger(g.expiresAtMs)&&g.expiresAtMs>now&&
  g.expiresAtMs-now<=120000;
}
function validFreshPrepare(j,req,ctx,now){
 const {p,t,o}=ctx;
 return jobSigned(j)&&j.secureExpiresAt>now&&
  j.type==='computer_use_action_prepare'&&j.status==='complete'&&
  j.targetDeviceId===o.deviceId&&j.secureSessionId===o.sessionId&&
  j.commandId===req.commandId&&j.taskId===req.taskId&&
  j.taskDigest===p.taskDigest&&j.promptDigest===p.promptDigest&&
  j.ownerBindingDigest===p.ownerBindingDigest&&
  j.actionDigest===p.actionDigest&&
  j.approvalOperationId===req.approvalOperationId&&
  j.executionOperationId===req.executionOperationId&&
  j.action==='CLICK'&&j.x===ctx.prepared.x&&j.y===ctx.prepared.y&&
  j.viewportWidth===ctx.prepared.viewportWidth&&
  j.viewportHeight===ctx.prepared.viewportHeight&&
  obj(j.result)&&j.result.ok===true&&j.result.code==='READY'&&
  j.result.requiresFreshApproval===false&&tok(j.result.leaseToken);
}
function validExecuteJob(j,req,ctx,now){
 const {p,o,prepared}=ctx;
 return jobSigned(j)&&j.secureExpiresAt>now&&
  j.type==='computer_use_action_execute'&&j.status==='queued'&&
  j.targetDeviceId===o.deviceId&&j.secureSessionId===o.sessionId&&
  j.commandId===req.commandId&&j.taskId===req.taskId&&
  j.taskDigest===p.taskDigest&&j.promptDigest===p.promptDigest&&
  j.ownerBindingDigest===p.ownerBindingDigest&&
  j.actionDigest===p.actionDigest&&
  j.prepareOperationId===req.prepareOperationId&&
  j.approvalOperationId===req.approvalOperationId&&
  j.executionOperationId===req.executionOperationId&&
  j.action==='CLICK'&&j.x===prepared.x&&j.y===prepared.y&&
  j.viewportWidth===prepared.viewportWidth&&
  j.viewportHeight===prepared.viewportHeight;
}
function executionRecord(r,q,c){
 const m=r?.metadata;
 return obj(m)&&r.dedupeKey===executionKey(q.approvalOperationId)&&
  r.replayAllowed===false&&r.effectKind==='EXTERNAL_EFFECT'&&
  !!r.dispatchStartedAt&&['DISPATCHING','NEEDS_REVIEW'].includes(r.state)&&
  m.jhV4ApprovedGeminiExecute===true&&
  m.commandId===q.commandId&&m.taskId===q.taskId&&
  m.prepareOperationId===q.prepareOperationId&&
  m.approvalOperationId===q.approvalOperationId&&
  m.executionOperationId===q.executionOperationId&&
  m.deviceId===c.o.deviceId&&m.sessionId===c.o.sessionId&&
  m.taskDigest===c.p.taskDigest&&m.promptDigest===c.p.promptDigest&&
  m.ownerBindingDigest===c.p.ownerBindingDigest&&
  m.actionDigest===c.p.actionDigest&&
  (m.jobId===null||jid(m.jobId));
}
export function createV4OriginalGeminiApprovedExecuteGate({
 store,enabled=false,clock=Date.now,
 originalPhoneGrantContractReady,readOriginalOwner,verifyOriginalOwner,
 readOriginalTask,verifyOriginalTask,
 readOriginalPrepareOperation,verifyOriginalPrepareOperation,
 readOriginalPrepareJob,verifyOriginalPrepareJob,
 readOriginalApprovalRequestJob,verifyOriginalApprovalRequestJob,
 readOriginalPhoneOneShotGrant,verifyOriginalPhoneOneShotGrant,
 prepareOriginalApprovedAction,verifyOriginalFreshPreparedJob,
 exactOriginalEnvelope,verifyOriginalQueuedJob,
 readOriginalJob,verifyOriginalCompletedJob,sendAttestor
}={}){
 const callbacks=[originalPhoneGrantContractReady,clock,readOriginalOwner,
  verifyOriginalOwner,readOriginalTask,verifyOriginalTask,
  readOriginalPrepareOperation,verifyOriginalPrepareOperation,
  readOriginalPrepareJob,verifyOriginalPrepareJob,
  readOriginalApprovalRequestJob,verifyOriginalApprovalRequestJob,
  readOriginalPhoneOneShotGrant,verifyOriginalPhoneOneShotGrant,
  prepareOriginalApprovedAction,verifyOriginalFreshPreparedJob,
  exactOriginalEnvelope,verifyOriginalQueuedJob,readOriginalJob,
  verifyOriginalCompletedJob];
 if(!(store instanceof FileDurableExecutionStore)||
  callbacks.some(f=>typeof f!=='function')||
  typeof sendAttestor?.verify!=='function')
  throw Error('ORIGINAL_SIGNED_GEMINI_EXECUTE_HOST_PORTS_REQUIRED');
 const locks=new Set();
 async function context(q){
  let o,t,p,prepared,r,approvalJob;
  try{
   o=await readOriginalOwner();
   t=await readOriginalTask(q.taskId);
   p=await readOriginalPrepareOperation(q.prepareOperationId);
  }catch{return null}
  if(!validOwner(o,q.commandId,clock())||
   !validTask(t,q.taskId,q.commandId,o)||!obj(p)||
   p.operationId!==q.prepareOperationId||p.commandId!==q.commandId||
   p.taskId!==q.taskId||p.taskDigest!==nativeTaskIdDigest(q.taskId)||
   p.promptDigest!==t.promptDigest||
   p.ownerBindingDigest!==nativeGeminiPrepareOwnerDigest(o)||
   p.ownerDeviceId!==o.deviceId||p.ownerSessionId!==o.sessionId||
   !jid(p.jobId)||!H64.test(p.actionDigest??'')||
   !['DISPATCHING','NEEDS_REVIEW'].includes(p.state))return null;
  try{
   if(await verifyOriginalOwner(o,q.commandId)!==true||
     await verifyOriginalTask(t,o)!==true||
     await verifyOriginalPrepareOperation(p,q.prepareOperationId)!==true)
     return null;
   prepared=await readOriginalPrepareJob(p.jobId);
   if(!validPrepareJob(prepared,p,t,o)||
     await verifyOriginalPrepareJob(prepared,p,t,o)!==true)return null;
   r=await store.get(approvalKey(q.approvalOperationId));
   if(!originalApprovalRecord(r,q,o,p))return null;
   approvalJob=await readOriginalApprovalRequestJob(r.metadata.jobId);
   if(!validApprovalJob(approvalJob,q,p,o,r)||
     await verifyOriginalApprovalRequestJob(approvalJob,p,t,o)!==true)
     return null;
  }catch{return null}
  return {o,t,p,prepared,approvalRecord:r,approvalJob};
 }
 async function locked(q,fn){
  if(!enabled)return failure('V4_GEMINI_EXECUTE_CANDIDATE_DISABLED');
  if(!reqOk(q))return failure('SIGNED_GEMINI_EXECUTE_SCOPE_REQUIRED');
  if(locks.has(q.approvalOperationId))
   return failure('ORIGINAL_GEMINI_EXECUTION_ALREADY_RUNNING');
  locks.add(q.approvalOperationId);
  try{return await fn()}finally{locks.delete(q.approvalOperationId)}
 }
 async function execute(q={}){
  return locked(q,async()=>{
   // Never turn the previous phone status string "APPROVED" into authority.
   try{
    if(await originalPhoneGrantContractReady()!==true)
     return failure('ORIGINAL_ANDROID_ONESHOT_GRANT_CONTRACT_UNVERIFIED');
   }catch{return failure('ORIGINAL_ANDROID_ONESHOT_GRANT_CONTRACT_UNVERIFIED')}
   const a=await context(q);
   if(!a)return failure('ORIGINAL_GEMINI_APPROVAL_AND_TASK_UNVERIFIED');
   let grant;
   try{grant=await readOriginalPhoneOneShotGrant(a.approvalJob,a.t,a.o,a.p)}
   catch{return failure('ORIGINAL_PHONE_ONESHOT_GRANT_UNAVAILABLE')}
   if(!validGrant(grant,q,a.p,a.o,a.approvalJob,clock()))
    return failure('ORIGINAL_PHONE_APPROVAL_GRANT_SCOPE_UNVERIFIED');
   try{
    if(await verifyOriginalPhoneOneShotGrant(grant,a.approvalJob,a.t,a.o,a.p)!==true)
     return failure('ORIGINAL_PHONE_ONESHOT_GRANT_NOT_AUTHENTICATED');
   }catch{return failure('ORIGINAL_PHONE_ONESHOT_GRANT_NOT_AUTHENTICATED')}
   const b=await context(q);
   if(!b||!matching(a.o,b.o)||a.t.promptDigest!==b.t.promptDigest||
     a.p.revision!==b.p.revision||
     a.approvalRecord.revision!==b.approvalRecord.revision||
     a.approvalJob.id!==b.approvalJob.id)
    return failure('GEMINI_CONTEXT_CHANGED_BEFORE_EXECUTION');
   // The approval ID is the dedupe key, even if someone changes the EXECUTE ID.
   // A lost queue result is permanently UNKNOWN, NEVER eligible for replay.
   try{
    const claimed=await store.claim({
     dedupeKey:executionKey(q.approvalOperationId),
     scope:'JH167_GEMINI_APPROVED_EXECUTE',
     intentId:q.executionOperationId,commandDigest:sha(q.commandId)
    },{
     state:'DISPATCHING',replayAllowed:false,effectKind:'EXTERNAL_EFFECT',
     dispatchStartedAt:new Date(clock()).toISOString(),
     metadata:{
      jhV4ApprovedGeminiExecute:true,
      taskId:q.taskId,commandId:q.commandId,
      prepareOperationId:q.prepareOperationId,
      approvalOperationId:q.approvalOperationId,
      executionOperationId:q.executionOperationId,
      taskDigest:b.p.taskDigest,promptDigest:b.p.promptDigest,
      actionDigest:b.p.actionDigest,
      ownerBindingDigest:b.p.ownerBindingDigest,
      deviceId:b.o.deviceId,sessionId:b.o.sessionId,jobId:null
     }
    });
    if(claim?.created!==true)
     return failure('ORIGINAL_GEMINI_EXECUTION_ALREADY_RESERVED_NO_REPLAY');
   }catch{return failure('ORIGINAL_GEMINI_EXECUTION_LEDGER_UNAVAILABLE')}
   // The ORIGINAL host sends a fresh approved PREPARE to the phone and checks
   // the original signed completion; this module does not invent a lease.
   let fresh;
   try{fresh=await prepareOriginalApprovedAction(grant,b.prepared,b.o,b.t,q)}
   catch{return failure('ORIGINAL_APPROVED_REPREPARE_OUTCOME_UNKNOWN_NO_REPLAY')}
   if(!validFreshPrepare(fresh,q,b,clock()))
    return failure('ORIGINAL_APPROVED_REPREPARE_SCOPE_INVALID_NO_REPLAY');
   try{
    if(await verifyOriginalFreshPreparedJob(fresh,grant,b.t,b.o,b.p)!==true)
     return failure('ORIGINAL_APPROVED_REPREPARE_UNAUTHENTICATED_NO_REPLAY');
   }catch{return failure('ORIGINAL_APPROVED_REPREPARE_UNAUTHENTICATED_NO_REPLAY')}
   const latest=await context(q);
   if(!latest||!matching(b.o,latest.o)||
    !validGrant(grant,q,latest.p,latest.o,latest.approvalJob,clock())||
    b.t.promptDigest!==latest.t.promptDigest||
    b.p.revision!==latest.p.revision||
    b.approvalRecord.revision!==latest.approvalRecord.revision)
    return failure('GEMINI_CONTEXT_CHANGED_AFTER_APPROVED_PREPARE_NO_REPLAY');
   try{
    if(await verifyOriginalPhoneOneShotGrant(
      grant,latest.approvalJob,latest.t,latest.o,latest.p)!==true)
     return failure('ORIGINAL_PHONE_ONESHOT_GRANT_EXPIRED_OR_REVOKED_NO_REPLAY');
   }catch{return failure('ORIGINAL_PHONE_ONESHOT_GRANT_EXPIRED_OR_REVOKED_NO_REPLAY')}
   // The existing Secure56 phone code validates the signed one-shot grant
   // AND the fresh lease at execution time. Nothing grants approval here.
   const args=Object.freeze({
    device_id:latest.o.deviceId,
    task_id:q.taskId,task_digest:latest.p.taskDigest,
    effect:'REVERSIBLE_WRITE',action:'CLICK',data_class:'NONE',
    index:0,max_actions_in_call:1,
    x:latest.prepared.x,y:latest.prepared.y,
    viewport_width:latest.prepared.viewportWidth,
    viewport_height:latest.prepared.viewportHeight,
    action_approval_grant_token:grant.actionApprovalGrantToken
   });
   const extra=Object.freeze({
    leaseToken:fresh.result.leaseToken,
    commandId:q.commandId,taskId:q.taskId,
    prepareOperationId:q.prepareOperationId,
    approvalOperationId:q.approvalOperationId,
    executionOperationId:q.executionOperationId,
    taskDigest:latest.p.taskDigest,promptDigest:latest.p.promptDigest,
    ownerBindingDigest:latest.p.ownerBindingDigest,
    actionDigest:latest.p.actionDigest
   });
   let result;
   try{result=await exactOriginalEnvelope(
    'life_android_execute_computer_action',
    'computer_use_action_execute','MUTATION',args,extra)}
   catch{return failure('ORIGINAL_GEMINI_EXECUTE_QUEUE_OUTCOME_UNKNOWN_NO_REPLAY')}
   const j=result?.job;
   if(result?.error||result?.deviceId!==latest.o.deviceId||
     !validExecuteJob(j,q,latest,clock()))
    return failure('ORIGINAL_GEMINI_EXECUTE_QUEUE_SCOPE_UNVERIFIED_NO_REPLAY');
   try{
    if(await verifyOriginalQueuedJob(j,latest.t,latest.o,latest.p)!==true)
     return failure('ORIGINAL_GEMINI_EXECUTE_QUEUE_NOT_AUTHENTICATED_NO_REPLAY');
   }catch{return failure('ORIGINAL_GEMINI_EXECUTE_QUEUE_NOT_AUTHENTICATED_NO_REPLAY')}
   try{
    await store.update(executionKey(q.approvalOperationId),r=>{
     if(!executionRecord(r,q,latest)||r.metadata.jobId!==null)
      throw Error('GEMINI_EXECUTION_LEDGER_CHANGED');
     r.metadata.jobId=j.id;r.replayAllowed=false;return r;
    });
   }catch{return failure('ORIGINAL_GEMINI_EXECUTE_JOB_BINDING_UNKNOWN_NO_REPLAY')}
   return answer('ORIGINAL_SIGNED_GEMINI_CLICK_EXECUTE_QUEUED_NOT_SENT_PROOF',{
    taskId:q.taskId,executionOperationId:q.executionOperationId,
    originalJobId:j.id,executeQueued:true
   });
  });
 }
 async function status(q={}){
  return locked(q,async()=>{
   const c=await context(q);
   if(!c)return failure('ORIGINAL_GEMINI_EXECUTION_CONTEXT_NOT_VERIFIED');
   let r;
   try{r=await store.get(executionKey(q.approvalOperationId))}
   catch{return failure('ORIGINAL_GEMINI_EXECUTION_LEDGER_UNAVAILABLE')}
   if(!executionRecord(r,q,c)||!jid(r.metadata.jobId))
    return failure('ORIGINAL_GEMINI_EXECUTION_JOB_UNKNOWN_NO_REPLAY');
   let job;
   try{job=await readOriginalJob(r.metadata.jobId)}
   catch{return failure('ORIGINAL_GEMINI_EXECUTION_JOB_READ_UNAVAILABLE')}
   if(!jobSigned(job)||job.id!==r.metadata.jobId||
     job.type!=='computer_use_action_execute'||
     job.targetDeviceId!==c.o.deviceId||
     job.secureSessionId!==c.o.sessionId||
     job.taskId!==q.taskId||job.commandId!==q.commandId||
     job.executionOperationId!==q.executionOperationId||
     job.approvalOperationId!==q.approvalOperationId||
     job.prepareOperationId!==q.prepareOperationId||
     job.actionDigest!==c.p.actionDigest||
     job.promptDigest!==c.p.promptDigest||
     job.ownerBindingDigest!==c.p.ownerBindingDigest)
    return failure('ORIGINAL_GEMINI_EXECUTE_JOB_SCOPE_INVALID');
   if(['queued','in_progress'].includes(job.status)){
    try{
     if(await verifyOriginalQueuedJob(job,c.t,c.o,c.p)!==true)
      return failure('ORIGINAL_GEMINI_PENDING_EXECUTE_NOT_AUTHENTICATED');
    }catch{return failure('ORIGINAL_GEMINI_PENDING_EXECUTE_NOT_AUTHENTICATED')}
    return answer('ORIGINAL_GEMINI_EXECUTE_JOB_PENDING_NOT_PROOF',{executeQueued:true});
   }
   if(job.status!=='complete')
    return failure('ORIGINAL_GEMINI_EXECUTE_OUTCOME_UNKNOWN_NO_REPLAY');
   try{
    if(await verifyOriginalCompletedJob(job,c.t,c.o,c.p)!==true)
     return failure('ORIGINAL_GEMINI_EXECUTION_COMPLETION_UNAUTHENTICATED');
   }catch{return failure('ORIGINAL_GEMINI_EXECUTION_COMPLETION_UNAUTHENTICATED')}
   const latest=await context(q);
   if(!latest||!matching(c.o,latest.o)||
     latest.t.promptDigest!==c.t.promptDigest||
     latest.approvalRecord.revision!==c.approvalRecord.revision)
    return failure('GEMINI_OWNER_CHANGED_DURING_EXECUTION_READBACK');
   let witness;
   try{witness=await sendAttestor.verify({
    commandId:q.commandId,taskId:q.taskId,originalJobId:job.id
   })}catch{return failure('ORIGINAL_GEMINI_CLICK_ATTESTATION_UNAVAILABLE')}
   if(witness?.ok!==true||
     witness.code!=='ORIGINAL_SIGNED_GEMINI_APPROVED_LOCAL_CLICK_ATTEMPT'||
     witness.taskId!==q.taskId||witness.originalJobId!==job.id||
     witness.localClickAttemptVerified!==true||
     !H64.test(witness.localAttemptDigest??'')||
     witness.googleSentMessageIdVerified!==false||
     witness.chatGptDeliveryVerified!==false)
    return failure('ORIGINAL_GEMINI_CLICK_NOT_ATTESTED');
   return answer('ORIGINAL_GEMINI_PHONE_LOCAL_CLICK_ATTEMPT_VERIFIED_NOT_GOOGLE_DELIVERY',{
    taskId:q.taskId,executeQueued:true,localClickAttemptVerified:true,
    localAttemptDigest:witness.localAttemptDigest
   });
  });
 }
 return Object.freeze({execute,status,capabilities:()=>Object.freeze({
  enabled:enabled===true,originalSecure56Required:true,
  originalAndroidOneShotGrantContractRequired:true,
  originalApprovedReprepareRequired:true,originalSignedExecuteRequired:true,
  originalDurableLedgerRequired:true,
  googleMessageVerified:false,fullReplyVerified:false,
  chatGptDeliveryConnected:false,productionRegistered:false,
  automaticReplay:false
 })});
}
