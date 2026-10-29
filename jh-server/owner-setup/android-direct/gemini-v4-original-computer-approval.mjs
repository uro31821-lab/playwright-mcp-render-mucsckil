/**
 * JH167 V4 Gemini — original Secure56 ONE-TIME PHONE APPROVAL REQUEST.
 * Candidate, never registered in production. Reuses:
 *  - the original completed Secure56 PREPARE receipt and persisted operation,
 *  - the existing FileDurableExecutionStore for no-replay fencing,
 *  - the original exactEnvelope56 signing/queue (not a new sender),
 *  - original signed approval-request and approval-status job verifiers.
 *
 * The phone user's approval is NEVER assumed. No grant/lease/token escapes
 * to callers or is persisted. No Gemini SUBMIT/EXECUTE is performed here.
 */
import {createHash} from 'node:crypto';
import {FileDurableExecutionStore} from '../deployment/jh-result-verification/file-durable-execution-store.mjs';
import {nativeTaskIdDigest} from './gemini-v4-original-computer-task-id.mjs';
import {nativeGeminiPrepareOwnerDigest} from './gemini-v4-original-computer-owner-scope.mjs';

const H32=/^[a-f0-9]{32}$/,H64=/^[a-f0-9]{64}$/;
const TASK=/^[A-Za-z0-9_-]{8,80}$/;
const APP='com.google.android.googlequicksearchbox';
const sha=x=>createHash('sha256').update(x,'utf8').digest('hex');
const key=x=>'JH167_V4_GEMINI_APPROVAL:'+sha(x);
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const token=x=>typeof x==='string'&&x.length>=8&&x.length<=512;
const jobId=x=>typeof x==='string'&&x.length>=5&&x.length<=200;
const no=code=>Object.freeze({ok:false,code,dispatched:false,
 phoneLocalApprovalVerified:false,geminiMessageSent:false,
 chatGptDelivered:false,automaticReplay:false});
const yes=(code,more={})=>Object.freeze({ok:true,code,dispatched:false,
 phoneLocalApprovalVerified:false,geminiMessageSent:false,
 chatGptDelivered:false,automaticReplay:false,...more});
const same=(a,b)=>obj(a)&&obj(b)&&[
 'deviceId','sessionId','commandId','workSide','chatSide',
 'workPackage','chatPackage','workWindowId','chatWindowId',
 'workBounds','chatBounds','promptDigest'
].every(k=>a[k]===b[k]);
const decode=x=>{
 if(obj(x))return x;
 if(typeof x==='string'&&x.length<10000){try{const v=JSON.parse(x);return obj(v)?v:null}catch{}}
 return null;
};
function validOwner(o,command,now){
 return obj(o)&&o.current===true&&o.secure56===true&&
  o.backend==='JH_ANDROID_NATIVE'&&o.commandId===command&&
  o.workSide==='RIGHT'&&o.chatSide==='LEFT'&&
  o.workPackage===APP&&o.chatPackage==='com.openai.chatgpt'&&
  typeof o.deviceId==='string'&&o.deviceId.length>=5&&
  typeof o.sessionId==='string'&&o.sessionId.length>=5&&
  Number.isSafeInteger(o.observedAt)&&o.observedAt<=now&&now-o.observedAt<=15000;
}
function validTask(t,taskId,command,o){
 return obj(t)&&t.schema===4&&t.id===taskId&&
  t.commandId===command&&t.backend==='JH_ANDROID_NATIVE'&&
  ['YOUTUBE','VIDEO'].includes(t.mode)&&t.cancelled!==true&&
  t.pending?.kind==='SUBMIT'&&t.workSide==='RIGHT'&&t.chatSide==='LEFT'&&
  t.deviceId===o.deviceId&&t.sessionId===o.sessionId&&
  H64.test(t.promptDigest??'');
}
function bounds(s){
 if(typeof s!=='string'||!/^\d{1,7},\d{1,7},\d{1,7},\d{1,7}$/.test(s))return null;
 const [l,t,r,b]=s.split(',').map(Number);
 return r>l&&b>t&&r-l>=100&&b-t>=100?{w:r-l,h:b-t}:null;
}
function preparedValid(j,op,o,task){
 const b=bounds(o.workBounds);
 return obj(j)&&jobId(j.id)&&j.id===op.jobId&&
  j.type==='computer_use_action_prepare'&&j.status==='complete'&&
  j.targetDeviceId===o.deviceId&&j.secureSessionId===o.sessionId&&
  j.commandId===o.commandId&&j.operationId===op.operationId&&
  j.ownerBindingDigest===op.ownerBindingDigest&&
  j.taskId===task.id&&j.taskDigest===nativeTaskIdDigest(task.id)&&
  j.promptDigest===task.promptDigest&&j.promptDigest===op.promptDigest&&
  j.actionDigest===op.actionDigest&&H64.test(j.secureMac??'')&&
  H64.test(j.securePayloadDigest??'')&&
  j.action==='CLICK'&&j.effect==='REVERSIBLE_WRITE'&&
  j.dataClass==='NONE'&&j.maxActionsInCall===1&&j.index===0&&
  b&&j.viewportWidth===b.w&&j.viewportHeight===b.h&&
  Number.isSafeInteger(j.x)&&Number.isSafeInteger(j.y)&&
  j.x>=2&&j.x<b.w-2&&j.y>=2&&j.y<b.h-2;
}
function signedJobValid(j,{type,owner,cmd,approvalId,prepareId,scope,action}){
 return obj(j)&&jobId(j.id)&&j.type===type&&
  j.targetDeviceId===owner.deviceId&&
  j.secureSessionId===owner.sessionId&&
  j.commandId===cmd&&j.approvalOperationId===approvalId&&
  j.prepareOperationId===prepareId&&
  j.ownerBindingDigest===scope.ownerBindingDigest&&
  j.actionDigest===scope.actionDigest&&j.taskId===scope.taskId&&
  j.taskDigest===scope.taskDigest&&j.promptDigest===scope.promptDigest&&
  j.action===(action??'')&&H64.test(j.secureMac??'')&&
  H64.test(j.securePayloadDigest??'')&&
  typeof j.secureNonce==='string'&&j.secureNonce.length>=16&&
  Number.isSafeInteger(j.secureExpiresAt);
}
function recordValid(r,req,o,op){
 return obj(r)&&r.dedupeKey===key(req.approvalOperationId)&&
  r.replayAllowed===false&&r.effectKind==='EXTERNAL_EFFECT'&&
  !!r.dispatchStartedAt&&['DISPATCHING','NEEDS_REVIEW'].includes(r.state)&&
  r.metadata?.jhV4OriginalApprovalRequest===true&&
  r.metadata.commandId===req.commandId&&r.metadata.taskId===req.taskId&&
  r.metadata.prepareOperationId===req.prepareOperationId&&
  r.metadata.approvalOperationId===req.approvalOperationId&&
  r.metadata.ownerBindingDigest===op.ownerBindingDigest&&
  r.metadata.actionDigest===op.actionDigest&&
  r.metadata.taskDigest===op.taskDigest&&
  r.metadata.promptDigest===op.promptDigest&&
  r.metadata.deviceId===o.deviceId&&r.metadata.sessionId===o.sessionId&&
  (r.metadata.jobId===null||jobId(r.metadata.jobId));
}
export function createV4OriginalGeminiPhoneApprovalPort({
 store,readOriginalOwner,verifyOriginalOwner,readOriginalTask,verifyOriginalTask,
 readOriginalPrepareOperation,verifyOriginalPrepareOperation,
 readOriginalPrepareJob,verifyOriginalPreparedJob,
 readOriginalPrepareStatus,exactOriginalEnvelope,readOriginalJob,
 verifyOriginalQueuedJob,verifyOriginalCompletedJob,
 waitOriginalJob,verifyOriginalPhoneApprovalStatus,
 clock=Date.now,enabled=false
}={}){
 if(!(store instanceof FileDurableExecutionStore)||
  [readOriginalOwner,verifyOriginalOwner,readOriginalTask,verifyOriginalTask,
   readOriginalPrepareOperation,verifyOriginalPrepareOperation,
   readOriginalPrepareJob,verifyOriginalPreparedJob,
   readOriginalPrepareStatus,exactOriginalEnvelope,readOriginalJob,
   verifyOriginalQueuedJob,verifyOriginalCompletedJob,waitOriginalJob,
   verifyOriginalPhoneApprovalStatus,clock].some(f=>typeof f!=='function'))
  throw Error('ORIGINAL_SECURE56_PHONE_APPROVAL_AND_DURABLE_PORTS_REQUIRED');
 const active=new Set();
 function validRequest(req){
  return obj(req)&&TASK.test(req.taskId??'')&&
   H32.test(req.commandId??'')&&H32.test(req.prepareOperationId??'')&&
   H32.test(req.approvalOperationId??'')&&
   req.prepareOperationId!==req.approvalOperationId;
 }
 async function context(req){
  let o,t,op,j,pre;
  try{
   o=await readOriginalOwner();
   t=await readOriginalTask(req.taskId);
   op=await readOriginalPrepareOperation(req.prepareOperationId);
  }catch{return null}
  if(!validOwner(o,req.commandId,clock())||
    !validTask(t,req.taskId,req.commandId,o)||
    !obj(op)||op.operationId!==req.prepareOperationId||
    op.commandId!==req.commandId||op.taskId!==req.taskId||
    op.taskDigest!==nativeTaskIdDigest(req.taskId)||
    op.promptDigest!==t.promptDigest||
    !H64.test(op.actionDigest??'')||
    op.ownerDeviceId!==o.deviceId||op.ownerSessionId!==o.sessionId||
    op.ownerBindingDigest!==nativeGeminiPrepareOwnerDigest(o)||
    !jobId(op.jobId)||!['DISPATCHING','NEEDS_REVIEW'].includes(op.state))
   return null;
  try{
   if(await verifyOriginalOwner(o,req.commandId)!==true||
      await verifyOriginalTask(t,o)!==true||
      await verifyOriginalPrepareOperation(op,req.prepareOperationId)!==true)
    return null;
   j=await readOriginalPrepareJob(op.jobId);
   if(!preparedValid(j,op,o,t)||
      await verifyOriginalPreparedJob(j,op,t,o)!==true)return null;
   pre=await readOriginalPrepareStatus({
    taskId:req.taskId,commandId:req.commandId,
    operationId:req.prepareOperationId
   });
  }catch{return null}
  if(pre?.ok!==true||
    !['ORIGINAL_GEMINI_PHONE_LOCAL_APPROVAL_REQUIRED',
      'ORIGINAL_GEMINI_PREPARE_READY_STILL_NEEDS_LOCAL_SEND_REVIEW'].includes(pre.code)||
    pre.phoneApprovalVerified!==false||
    pre.dispatched!==false)return null;
  const preparedResult=decode(j.result);
  if(!preparedResult||
    !(preparedResult.code==='APPROVAL_REQUIRED'||
      (preparedResult.code==='READY'&&preparedResult.ok===true&&
       preparedResult.requiresFreshApproval===false)))return null;
  return {o,t,op,j};
 }
 async function guarded(req,fn){
  if(!enabled)return no('ORIGINAL_GEMINI_APPROVAL_PORT_DISABLED');
  if(!validRequest(req))return no('SIGNED_GEMINI_APPROVAL_SCOPE_REQUIRED');
  if(active.has(req.approvalOperationId))
   return no('ORIGINAL_GEMINI_APPROVAL_OPERATION_BUSY');
  active.add(req.approvalOperationId);
  try{return await fn()}finally{active.delete(req.approvalOperationId)}
 }
 async function request(req={}){
  return guarded(req,async()=>{
   const first=await context(req);
   if(!first)return no('ORIGINAL_GEMINI_PREPARE_NOT_AUTHENTICATED');
   const second=await context(req);
   if(!second||!same(first.o,second.o)||
      first.t.promptDigest!==second.t.promptDigest||
      first.j.id!==second.j.id||first.op.revision!==second.op.revision)
    return no('GEMINI_OWNER_OR_PREPARE_CHANGED_BEFORE_APPROVAL');
   const {o,op,j}=second;
   // Claim is atomic and non-replayable even when queue/attach response is lost.
   try{
    const claim=await store.claim({
     dedupeKey:key(req.approvalOperationId),
     scope:'JH167_GEMINI_PHONE_APPROVAL_REQUEST',
     intentId:req.approvalOperationId,
     commandDigest:sha(req.commandId)
    },{
     state:'DISPATCHING',replayAllowed:false,
     effectKind:'EXTERNAL_EFFECT',
     dispatchStartedAt:new Date(clock()).toISOString(),
     metadata:{
      jhV4OriginalApprovalRequest:true,
      approvalOperationId:req.approvalOperationId,
      prepareOperationId:req.prepareOperationId,
      commandId:req.commandId,taskId:req.taskId,
      taskDigest:op.taskDigest,promptDigest:op.promptDigest,
      actionDigest:op.actionDigest,ownerBindingDigest:op.ownerBindingDigest,
      deviceId:o.deviceId,sessionId:o.sessionId,jobId:null
     }
    });
    if(claim.created!==true)
     return no('ORIGINAL_GEMINI_APPROVAL_ALREADY_RESERVED_NO_REPLAY');
   }catch{return no('ORIGINAL_GEMINI_APPROVAL_LEDGER_UNAVAILABLE')}
   // Original Computer Use payload fields, no caller-selected coordinates.
   const args=Object.freeze({
    device_id:o.deviceId,task_id:req.taskId,task_digest:op.taskDigest,
    effect:'REVERSIBLE_WRITE',action:'CLICK',data_class:'NONE',
    index:0,max_actions_in_call:1,
    x:j.x,y:j.y,viewport_width:j.viewportWidth,
    viewport_height:j.viewportHeight
   });
   const extras=Object.freeze({
    commandId:req.commandId,
    approvalOperationId:req.approvalOperationId,
    prepareOperationId:req.prepareOperationId,
    ownerBindingDigest:op.ownerBindingDigest,
    promptDigest:op.promptDigest,actionDigest:op.actionDigest
   });
   let envelope;
   try{envelope=await exactOriginalEnvelope(
    'life_android_action_approval_request',
    'computer_use_action_approval_request',
    'REVERSIBLE_WRITE',args,extras)}
   catch{return no('ORIGINAL_GEMINI_APPROVAL_QUEUE_UNKNOWN_NO_REPLAY')}
   const scope={taskId:req.taskId,taskDigest:op.taskDigest,
    promptDigest:op.promptDigest,ownerBindingDigest:op.ownerBindingDigest,actionDigest:op.actionDigest};
   const approval=envelope?.job;
   if(envelope?.error||envelope?.deviceId!==o.deviceId||
      !signedJobValid(approval,{type:'computer_use_action_approval_request',
       owner:o,cmd:req.commandId,approvalId:req.approvalOperationId,
       prepareId:req.prepareOperationId,scope,action:'CLICK'})||
      approval.status!=='queued')
    return no('ORIGINAL_GEMINI_APPROVAL_QUEUE_UNVERIFIED_NO_REPLAY');
   try{
    if(await verifyOriginalQueuedJob(approval,second.t,o,second.op)!==true)
     return no('ORIGINAL_GEMINI_APPROVAL_SIGNATURE_INVALID_NO_REPLAY');
   }catch{return no('ORIGINAL_GEMINI_APPROVAL_SIGNATURE_INVALID_NO_REPLAY')}
   try{
    await store.update(key(req.approvalOperationId),r=>{
     if(!recordValid(r,req,o,op)||r.metadata.jobId!==null)
      throw Error('APPROVAL_OPERATION_CHANGED');
     r.metadata.jobId=approval.id;r.replayAllowed=false;return r;
    });
   }catch{return no('ORIGINAL_GEMINI_APPROVAL_JOB_LINK_UNKNOWN_NO_REPLAY')}
   return yes('ORIGINAL_GEMINI_PHONE_APPROVAL_REQUEST_QUEUED',{
    taskId:req.taskId,approvalOperationId:req.approvalOperationId,
    phoneLocalApprovalRequired:true,phoneLocalApprovalRequested:true
   });
  });
 }
 async function saved(req){
  const c=await context(req);if(!c)return null;
  let record;
  try{record=await store.get(key(req.approvalOperationId))}
  catch{return null}
  if(!recordValid(record,req,c.o,c.op)||!jobId(record.metadata.jobId))
   return null;
  const j=await readOriginalJob(record.metadata.jobId).catch(()=>null);
  if(!signedJobValid(j,{type:'computer_use_action_approval_request',
    owner:c.o,cmd:req.commandId,approvalId:req.approvalOperationId,
    prepareId:req.prepareOperationId,scope:{
      taskId:req.taskId,taskDigest:c.op.taskDigest,
      promptDigest:c.op.promptDigest,ownerBindingDigest:c.op.ownerBindingDigest,
      actionDigest:c.op.actionDigest
    },action:'CLICK'}))return null;
  return {...c,record,approvalJob:j};
 }
 async function checkRequest(req={}){
  return guarded(req,async()=>{
   const c=await saved(req);
   if(!c)return no('ORIGINAL_GEMINI_APPROVAL_RECORD_OR_JOB_UNVERIFIED_NO_REPLAY');
   const j=c.approvalJob;
   try{
    if(j.status==='queued'||j.status==='in_progress'){
     if(await verifyOriginalQueuedJob(j,c.t,c.o,c.op)!==true)
      return no('ORIGINAL_GEMINI_APPROVAL_QUEUE_SIGNATURE_INVALID');
     return yes('ORIGINAL_GEMINI_PHONE_APPROVAL_REQUEST_PENDING');
    }
    if(j.status!=='complete'||
      await verifyOriginalCompletedJob(j,c.t,c.o,c.op)!==true)
     return no('ORIGINAL_GEMINI_APPROVAL_REQUEST_COMPLETION_UNVERIFIED');
   }catch{return no('ORIGINAL_GEMINI_APPROVAL_REQUEST_COMPLETION_UNVERIFIED')}
   const result=decode(j.result);
   if(!result||!token(result.requestToken))
    return no('ORIGINAL_GEMINI_PHONE_APPROVAL_REQUEST_TOKEN_MISSING');
   return yes('ORIGINAL_GEMINI_PHONE_APPROVAL_PROMPT_READY_TO_CHECK',{
    phoneLocalApprovalRequested:true,phoneLocalApprovalRequired:true
   });
  });
 }
 async function pollPhoneApproval(req={}){
  return guarded(req,async()=>{
   const c=await saved(req);
   if(!c)return no('ORIGINAL_GEMINI_APPROVAL_RECORD_OR_JOB_UNVERIFIED_NO_REPLAY');
   if(c.approvalJob.status!=='complete')
    return yes('ORIGINAL_GEMINI_PHONE_APPROVAL_REQUEST_PENDING');
   try{
    if(await verifyOriginalCompletedJob(c.approvalJob,c.t,c.o,c.op)!==true)
     return no('ORIGINAL_GEMINI_APPROVAL_REQUEST_COMPLETION_UNVERIFIED');
   }catch{return no('ORIGINAL_GEMINI_APPROVAL_REQUEST_COMPLETION_UNVERIFIED')}
   const prompt=decode(c.approvalJob.result);
   if(!token(prompt?.requestToken))
    return no('ORIGINAL_GEMINI_PHONE_APPROVAL_REQUEST_TOKEN_MISSING');
   // Original read-only status route; no new approval prompt and no replay.
   const args={
    device_id:c.o.deviceId,task_id:req.taskId,
    task_digest:c.op.taskDigest,request_token:prompt.requestToken
   };
   const extras={
    commandId:req.commandId,
    approvalOperationId:req.approvalOperationId,
    prepareOperationId:req.prepareOperationId,
    ownerBindingDigest:c.op.ownerBindingDigest,
    promptDigest:c.op.promptDigest,actionDigest:c.op.actionDigest
   };
   let e;
   try{e=await exactOriginalEnvelope(
    'life_android_action_approval_status',
    'computer_use_action_approval_status','READ_ONLY',args,extras)}
   catch{return no('ORIGINAL_GEMINI_PHONE_APPROVAL_STATUS_UNAVAILABLE')}
   const job=e?.job;
   const scope={taskId:req.taskId,taskDigest:c.op.taskDigest,
    promptDigest:c.op.promptDigest,ownerBindingDigest:c.op.ownerBindingDigest,actionDigest:c.op.actionDigest};
   if(e?.error||e?.deviceId!==c.o.deviceId||
    !signedJobValid(job,{type:'computer_use_action_approval_status',
     owner:c.o,cmd:req.commandId,approvalId:req.approvalOperationId,
     prepareId:req.prepareOperationId,scope,action:''}))
    return no('ORIGINAL_GEMINI_PHONE_APPROVAL_STATUS_SCOPE_INVALID');
   let completed;
   try{completed=await waitOriginalJob(job.id)}
   catch{return no('ORIGINAL_GEMINI_PHONE_APPROVAL_STATUS_UNKNOWN_NO_REPLAY')}
   if(completed?.status==='queued'||completed?.status==='in_progress')
    return yes('ORIGINAL_GEMINI_PHONE_APPROVAL_STATUS_PENDING');
   if(completed?.id!==job.id||completed.status!=='complete'||
    !signedJobValid(completed,{type:'computer_use_action_approval_status',
     owner:c.o,cmd:req.commandId,approvalId:req.approvalOperationId,
     prepareId:req.prepareOperationId,scope,action:''}))
    return no('ORIGINAL_GEMINI_PHONE_APPROVAL_STATUS_UNVERIFIED');
   try{
    if(await verifyOriginalCompletedJob(completed,c.t,c.o,c.op)!==true||
       await verifyOriginalPhoneApprovalStatus(completed,c.approvalJob,c.t,c.o)!==true)
     return no('ORIGINAL_GEMINI_PHONE_APPROVAL_STATUS_UNAUTHENTICATED');
   }catch{return no('ORIGINAL_GEMINI_PHONE_APPROVAL_STATUS_UNAUTHENTICATED')}
   const after=await context(req);
   if(!after||!same(c.o,after.o)||c.t.promptDigest!==after.t.promptDigest||
      c.op.revision!==after.op.revision||
      (await store.get(key(req.approvalOperationId)))?.revision!==c.record.revision)
    return no('ORIGINAL_GEMINI_OWNER_OR_APPROVAL_CHANGED');
   const result=decode(completed.result);
   if(!result)return no('ORIGINAL_GEMINI_PHONE_APPROVAL_STATUS_EMPTY');
   // No source-backed Android grant-token schema in this candidate. Even a
   // signed "APPROVED" response cannot authorize a Gemini CLICK/EXECUTE.
   if(['APPROVED','GRANTED','APPROVAL_GRANTED'].includes(result.code))
    return yes('ORIGINAL_PHONE_APPROVAL_REPORTED_GRANT_CONTRACT_UNVERIFIED',{
     phoneLocalApprovalRequired:true,executeAllowed:false
    });
   if(['DENIED','REJECTED','CANCELLED'].includes(result.code))
    return yes('ORIGINAL_PHONE_LOCAL_APPROVAL_REJECTED',{executeAllowed:false});
   return yes('ORIGINAL_PHONE_LOCAL_APPROVAL_NOT_CONFIRMED',{
    executeAllowed:false
   });
  });
 }
 return Object.freeze({request,checkRequest,pollPhoneApproval,
  capabilities:()=>Object.freeze({
   enabled:enabled===true,originalSecure56Required:true,
   originalFileDurableExecutionStore:true,
   originalPhoneApprovalPrompt:true,originalPhoneApprovalStatusRead:true,
   noApprovalWithoutOriginalAndroidGrantContract:true,
   originalPhoneExecuteConnected:false,
   productionRegistered:false,automaticReplay:false
  })
 });
}
