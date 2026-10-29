/**
 * Read ONLY the original Secure56 Gemini SUBMIT PREPARE result.
 * Does not request/approve/send/click/reprepare or release a phone lease.
 * This validates a durable original operation, original signed job and
 * original phone completion via independently authenticated host callbacks.
 * Candidate only; no production MCP or Android hook registered.
 */
import {nativeTaskIdDigest} from './gemini-v4-original-computer-task-id.mjs';
import {nativeGeminiPrepareOwnerDigest} from './gemini-v4-original-computer-owner-scope.mjs';
const H32=/^[a-f0-9]{32}$/,H64=/^[a-f0-9]{64}$/;
const TASK=/^[A-Za-z0-9_-]{8,80}$/;
const H='com.google.android.googlequicksearchbox';
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const id=x=>typeof x==='string'&&x.length>=5&&x.length<=200;
const fail=code=>Object.freeze({ok:false,code,automaticReplay:false,
 dispatched:false,phoneApprovalVerified:false,phoneSendVerified:false,
 googleMessageVerified:false,chatGptDelivered:false});
const same=(a,b)=>obj(a)&&obj(b)&&[
 'deviceId','sessionId','commandId','workSide','chatSide',
 'workPackage','chatPackage','workWindowId','chatWindowId',
 'workBounds','chatBounds'].every(k=>a[k]===b[k]);
const taskSame=(a,b)=>obj(a)&&obj(b)&&a.id===b.id&&
 a.commandId===b.commandId&&a.deviceId===b.deviceId&&
 a.sessionId===b.sessionId&&a.promptDigest===b.promptDigest&&
 a.pending?.kind==='SUBMIT'&&b.pending?.kind==='SUBMIT'&&
 a.cancelled!==true&&b.cancelled!==true;
function ownerValid(o,c,now){
 return obj(o)&&o.current===true&&o.secure56===true&&
  o.backend==='JH_ANDROID_NATIVE'&&o.commandId===c&&
  o.workSide==='RIGHT'&&o.chatSide==='LEFT'&&
  o.workPackage===H&&o.chatPackage==='com.openai.chatgpt'&&
  id(o.deviceId)&&id(o.sessionId)&&
  Number.isSafeInteger(o.workWindowId)&&Number.isSafeInteger(o.chatWindowId)&&
  o.workWindowId!==o.chatWindowId&&
  typeof o.workBounds==='string'&&typeof o.chatBounds==='string'&&
  Number.isSafeInteger(o.observedAt)&&o.observedAt<=now&&
  now-o.observedAt<=15000;
}
function taskValid(t,taskId,c,o){
 return obj(t)&&t.schema===4&&t.id===taskId&&t.commandId===c&&
  t.backend==='JH_ANDROID_NATIVE'&&
  ['YOUTUBE','VIDEO'].includes(t.mode)&&t.workSide==='RIGHT'&&
  t.chatSide==='LEFT'&&t.cancelled!==true&&
  t.pending?.kind==='SUBMIT'&&
  t.deviceId===o.deviceId&&t.sessionId===o.sessionId&&
  H64.test(t.promptDigest??'');
}
function jobValid(j,operation,task,owner){
 return obj(j)&&id(j.id)&&j.id===operation.jobId&&
  j.type==='computer_use_action_prepare'&&
  j.targetDeviceId===owner.deviceId&&j.secureSessionId===owner.sessionId&&
  j.commandId===owner.commandId&&
  j.operationId===operation.operationId&&
  j.actionDigest===operation.actionDigest&&
  j.ownerBindingDigest===operation.ownerBindingDigest&&
  j.taskId===task.id&&j.taskDigest===nativeTaskIdDigest(task.id)&&
  j.promptDigest===task.promptDigest&&
  H64.test(j.securePayloadDigest??'')&&H64.test(j.secureMac??'')&&
  typeof j.secureNonce==='string'&&j.secureNonce.length>=16&&
  Number.isSafeInteger(j.secureExpiresAt);
}
function originalPayload(raw){
 if(obj(raw))return raw;
 if(typeof raw==='string'&&raw.length<=10000){
  try{const parsed=JSON.parse(raw);return obj(parsed)?parsed:null}catch{}
 }
 return null;
}
const safeCode=x=>typeof x==='string'&&/^[A-Z][A-Z0-9_]{0,79}$/.test(x)?x:null;
export function createV4OriginalGeminiPrepareStatusPort({
 readOriginalOwner,verifyOriginalOwner,readOriginalTask,verifyOriginalTask,
 durable,readOriginalJob,verifyOriginalQueuedJob,verifyOriginalCompletedJob,
 clock=Date.now,enabled=false
}={}){
 if([readOriginalOwner,verifyOriginalOwner,readOriginalTask,verifyOriginalTask,
  readOriginalJob,verifyOriginalQueuedJob,verifyOriginalCompletedJob,clock]
   .some(f=>typeof f!=='function')||
  durable?.source!=='ORIGINAL_JH_PERSISTENT_OPERATION_LEDGER'||
  typeof durable.lookup!=='function'||typeof durable.verify!=='function')
  throw Error('ORIGINAL_SECURE56_PREPARE_READBACK_PORTS_REQUIRED');
 const running=new Set();
 async function readContext(taskId,commandId){
  let o,t;
  try{o=await readOriginalOwner();t=await readOriginalTask(taskId)}catch{return null}
  if(!ownerValid(o,commandId,clock())||!taskValid(t,taskId,commandId,o))
   return null;
  try{if(await verifyOriginalOwner(o,commandId)!==true||
      await verifyOriginalTask(t,o)!==true)return null}
  catch{return null}
  return {o,t};
 }
 async function status({taskId,commandId,operationId}={}){
  if(!enabled)return fail('ORIGINAL_GEMINI_PREPARE_STATUS_DISABLED');
  if(!TASK.test(taskId??'')||!H32.test(commandId??'')||
     !H32.test(operationId??''))
   return fail('ORIGINAL_GEMINI_PREPARE_SCOPE_REQUIRED');
  if(running.has(operationId))
   return fail('ORIGINAL_GEMINI_PREPARE_STATUS_BUSY');
  running.add(operationId);
  try{
   const before=await readContext(taskId,commandId);
   if(!before)return fail('ORIGINAL_GEMINI_TASK_OR_OWNER_UNVERIFIED');
   let op;
   try{op=await durable.lookup(operationId)}
   catch{return fail('ORIGINAL_GEMINI_PREPARE_LEDGER_UNAVAILABLE')}
   if(!obj(op)||op.operationId!==operationId||op.commandId!==commandId||
     op.taskId!==taskId||op.taskDigest!==nativeTaskIdDigest(taskId)||
     op.promptDigest!==before.t.promptDigest||
     op.ownerDeviceId!==before.o.deviceId||
     op.ownerSessionId!==before.o.sessionId||
     op.ownerBindingDigest!==nativeGeminiPrepareOwnerDigest(before.o)||
     !H64.test(op.actionDigest??'')||
     !id(op.jobId)||!Number.isSafeInteger(op.revision)||
     !['DISPATCHING','NEEDS_REVIEW'].includes(op.state))
    return fail('ORIGINAL_GEMINI_PREPARE_OPERATION_UNKNOWN_NO_REPLAY');
   try{if(await durable.verify(op,operationId)!==true)
     return fail('ORIGINAL_GEMINI_PREPARE_LEDGER_UNVERIFIED')}
   catch{return fail('ORIGINAL_GEMINI_PREPARE_LEDGER_UNVERIFIED')}
   let job;
   try{job=await readOriginalJob(op.jobId)}
   catch{return fail('ORIGINAL_GEMINI_PREPARE_JOB_UNAVAILABLE_NO_REPLAY')}
   if(!jobValid(job,op,before.t,before.o))
    return fail('ORIGINAL_GEMINI_PREPARE_JOB_SCOPE_CHANGED');
   let outcome;
   if(job.status==='queued'){
    try{if(await verifyOriginalQueuedJob(job,before.t,before.o,op)!==true)
      return fail('ORIGINAL_GEMINI_PREPARE_QUEUE_NOT_AUTHENTICATED')}
    catch{return fail('ORIGINAL_GEMINI_PREPARE_QUEUE_NOT_AUTHENTICATED')}
    outcome='QUEUED';
   }else if(job.status==='complete'){
    try{if(await verifyOriginalCompletedJob(job,before.t,before.o,op)!==true)
      return fail('ORIGINAL_GEMINI_PREPARE_COMPLETION_NOT_AUTHENTICATED')}
    catch{return fail('ORIGINAL_GEMINI_PREPARE_COMPLETION_NOT_AUTHENTICATED')}
    outcome='COMPLETED';
   }else return fail('ORIGINAL_GEMINI_PREPARE_PENDING_OR_UNKNOWN_NO_REPLAY');
   // A changed signed owner/task or updated original durable record cannot
   // authorize interpretation of an old phone receipt.
   const after=await readContext(taskId,commandId);
   if(!after||!same(before.o,after.o)||!taskSame(before.t,after.t))
    return fail('ORIGINAL_GEMINI_OWNER_OR_TASK_CHANGED_NO_REPLAY');
   try{if(await durable.verify(op,operationId)!==true)
     return fail('ORIGINAL_GEMINI_PREPARE_LEDGER_CHANGED_NO_REPLAY')}
   catch{return fail('ORIGINAL_GEMINI_PREPARE_LEDGER_CHANGED_NO_REPLAY')}
   if(outcome==='QUEUED')
    return Object.freeze({ok:true,code:'ORIGINAL_GEMINI_PREPARE_QUEUED_READ_ONLY',
     taskId,operationId,prepareReceiptVerified:false,
     phoneApprovalVerified:false,dispatched:false,
     phoneSendVerified:false,googleMessageVerified:false,
     chatGptDelivered:false,automaticReplay:false});
   const result=originalPayload(job.result);
   if(!result)return fail('ORIGINAL_GEMINI_PHONE_PREPARE_RESULT_UNREADABLE');
   if(result.code==='APPROVAL_REQUIRED'||result.requiresFreshApproval===true)
    return Object.freeze({ok:true,code:'ORIGINAL_GEMINI_PHONE_LOCAL_APPROVAL_REQUIRED',
     taskId,operationId,prepareReceiptVerified:true,
     phoneLocalApprovalRequired:true,phoneApprovalVerified:false,
     dispatched:false,phoneSendVerified:false,
     googleMessageVerified:false,chatGptDelivered:false,automaticReplay:false});
   if(result.ok===true&&result.code==='READY'&&
     result.requiresFreshApproval===false&&
     typeof result.leaseToken==='string'&&
     result.leaseToken.length>=8&&result.leaseToken.length<=512)
    return Object.freeze({ok:true,code:'ORIGINAL_GEMINI_PREPARE_READY_STILL_NEEDS_LOCAL_SEND_REVIEW',
     taskId,operationId,prepareReceiptVerified:true,leaseAvailable:true,
     phoneLocalApprovalRequired:true,phoneApprovalVerified:false,
     dispatched:false,phoneSendVerified:false,
     googleMessageVerified:false,chatGptDelivered:false,automaticReplay:false});
   return fail(safeCode(result.code)?'ORIGINAL_GEMINI_PHONE_PREPARE_NOT_READY_NO_REPLAY':
     'ORIGINAL_GEMINI_PHONE_PREPARE_RESULT_INVALID');
  }finally{running.delete(operationId)}
 }
 return Object.freeze({status,capabilities:()=>Object.freeze({
  enabled:enabled===true,originalSecure56Required:true,
  originalPersistentLedgerRequired:true,readOnlyResult:true,
  rawLeaseExposed:false,phoneLocalApprovalBypassed:false,
  originalPhoneExecuteConnected:false,liveHostRegistered:false,
  automaticReplay:false
 })});
}
