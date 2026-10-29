/** V4 native Gemini reviewed SUBMIT: original Secure56 read-only PREPARE.
 *
 * Calls existing exactEnvelope56 in-process with BOTH:
 *   task_id = original native task.id (Android TaskPolicy.taskId)
 *   task_digest = SHA256("JH-GEMINI-TASK-ID-V1|" + task.id)
 * No public MCP schema expansion, new key, approval grant, execution,
 * automatic retry, or Playwright fallback. The original phone must later
 * request and verify its own local send approval before an execute action.
 *
 * Isolated candidate only; no production registration or phone test.
 */
import {
  buildOriginalSecure56GeminiTaskIdentity,
  requireOriginalSecure56GeminiTaskFields
} from './gemini-v4-original-computer-task-id.mjs';

const HEX32=/^[a-f0-9]{32}$/;
const HEX64=/^[a-f0-9]{64}$/;
const H='com.google.android.googlequicksearchbox';
const obj=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const deny=code=>Object.freeze({ok:false,code,dispatched:false,
  approved:false,automaticReplay:false,phoneSendVerified:false,
  googleMessageVerified:false});
function rectangle(s){
 if(typeof s!=='string'||!/^(0|[1-9]\d{0,6}),(0|[1-9]\d{0,6}),(0|[1-9]\d{0,6}),(0|[1-9]\d{0,6})$/.test(s))return null;
 const [left,top,right,bottom]=s.split(',').map(Number);
 return right-left>=100&&bottom-top>=100?
   {left,top,right,bottom,width:right-left,height:bottom-top}:null;
}
function same(a,b){
 return !!a&&!!b&&
  ['deviceId','sessionId','commandId','workWindowId','chatWindowId',
   'workPackage','chatPackage','workBounds','chatBounds'].every(k=>a[k]===b[k]);
}
function validAction(a,t,o,now){
 const w=rectangle(o.workBounds);
 return !!w&&obj(a)&&a.taskId===t.id&&a.commandId===t.commandId&&
  a.deviceId===o.deviceId&&a.sessionId===o.sessionId&&
  a.actionKind==='CLICK'&&a.purpose==='GEMINI_SUBMIT'&&
  a.packageName===H&&a.windowId===o.workWindowId&&
  a.promptDigest===t.promptDigest&&
  HEX64.test(a.screenDigest??'')&&HEX64.test(a.actionDigest??'')&&
  Number.isSafeInteger(a.observedAtMs)&&a.observedAtMs<=now&&
  now-a.observedAtMs<=10000&&
  Number.isSafeInteger(a.globalX)&&Number.isSafeInteger(a.globalY)&&
  a.globalX>=w.left+2&&a.globalX<w.right-2&&
  a.globalY>=w.top+2&&a.globalY<w.bottom-2;
}
export function createV4OriginalSecure56GeminiPreparePort({
 readOwner,verifyOwner,readTask,verifyTask,
 readSignedSubmitTarget,verifySignedSubmitTarget,
 claimOriginalOperation,attachOriginalJob,exactOriginalEnvelope,
 verifyOriginalQueuedJob,enabled=false,clock=Date.now
}={}){
 if([readOwner,verifyOwner,readTask,verifyTask,readSignedSubmitTarget,
   verifySignedSubmitTarget,claimOriginalOperation,attachOriginalJob,
   exactOriginalEnvelope,verifyOriginalQueuedJob,clock].some(f=>typeof f!=='function'))
  throw Error('ORIGINAL_SECURE56_PHONE_PREPARE_PORTS_REQUIRED');
 const running=new Set();
 async function prepare({taskId,commandId,operationId}={}){
  if(!enabled)return deny('ORIGINAL_GEMINI_PHONE_PREPARE_DISABLED');
  if(!HEX32.test(commandId??'')||!HEX32.test(operationId??'')||
    typeof taskId!=='string'||taskId.length<8||taskId.length>80)
   return deny('SIGNED_GEMINI_PREPARE_SCOPE_REQUIRED');
  if(running.has(operationId))return deny('ORIGINAL_GEMINI_PREPARE_ALREADY_RUNNING');
  running.add(operationId);
  try{
   let o,t;
   try{o=await readOwner();t=await readTask(taskId)}
   catch{return deny('ORIGINAL_GEMINI_OWNER_TASK_UNAVAILABLE')}
   if(!obj(t)||t.id!==taskId||t.commandId!==commandId||
      t.pending?.kind!=='SUBMIT'||t.cancelled===true)
    return deny('ORIGINAL_GEMINI_SUBMIT_STATE_REQUIRED');
   let fields;
   try{fields=await buildOriginalSecure56GeminiTaskIdentity({
    task:t,owner:o,verifyOriginalTask:verifyTask,verifyOriginalOwner:verifyOwner
   })}catch{return deny('SIGNED_GEMINI_IDENTITY_UNVERIFIED')}
   let a;try{a=await readSignedSubmitTarget(t,o)}
   catch{return deny('ORIGINAL_SIGNED_GEMINI_TARGET_UNAVAILABLE')}
   if(!validAction(a,t,o,clock()))
    return deny('ORIGINAL_GEMINI_RIGHT_TARGET_INVALID');
   try{if(await verifySignedSubmitTarget(a,t,o)!==true)
     return deny('ORIGINAL_GEMINI_TARGET_NOT_AUTHENTICATED')}
   catch{return deny('ORIGINAL_GEMINI_TARGET_NOT_AUTHENTICATED')}
   // Re-read original command, package, window and saved pending SUBMIT
   // BEFORE durable reservation. A prior screen cannot authorize a new pane.
   let o2,t2;
   try{o2=await readOwner();t2=await readTask(taskId)}
   catch{return deny('GEMINI_SCOPE_CHANGED_BEFORE_PREPARATION')}
   if(!same(o,o2)||t2?.id!==t.id||t2?.commandId!==t.commandId||
      t2?.pending?.kind!=='SUBMIT'||t2?.promptDigest!==t.promptDigest||
      t2.cancelled===true)
    return deny('GEMINI_SCOPE_CHANGED_BEFORE_PREPARATION');
   try{if(await verifyOwner(o2,commandId)!==true||
       await verifyTask(t2,o2)!==true)
      return deny('ORIGINAL_GEMINI_SCOPE_AUTHENTICATION_LOST')}
   catch{return deny('ORIGINAL_GEMINI_SCOPE_AUTHENTICATION_LOST')}
   // Existing durable ledger must atomically reserve this original operation;
   // any result loss leaves the operation fenced, NOT eligible for replay.
   try{if(await claimOriginalOperation(operationId,{
      kind:'ORIGINAL_GEMINI_SUBMIT_PREPARE',
      commandId,taskId,taskDigest:fields.task_digest,
      ownerDeviceId:o.deviceId,ownerSessionId:o.sessionId,
      actionDigest:a.actionDigest
    })!==true)
      return deny('ORIGINAL_GEMINI_PREPARE_RESERVED_USE_STATUS')}
   catch{return deny('ORIGINAL_GEMINI_DURABLE_RESERVATION_UNAVAILABLE')}
   const originalFields=requireOriginalSecure56GeminiTaskFields(fields,t);
   const rect=rectangle(o.workBounds);
   const args=Object.freeze({
     ...originalFields,
     effect:'REVERSIBLE_WRITE',action:'CLICK',data_class:'NONE',
     index:0,max_actions_in_call:1,
     // Android mapPoint receives coordinates LOCAL to the verified RIGHT work
     // window, not global display coordinates.
     x:a.globalX-rect.left,y:a.globalY-rect.top,
     viewport_width:rect.width,viewport_height:rect.height,
     // Existing phone local approval is NOT auto granted by this stage.
     action_approval_grant_token:undefined
   });
   // The original exactEnvelope56 signs {...computerPayload56(args), ...extra}.
   // Its original computerPayload56 does NOT supply commandId/operationId;
   // they MUST be included before mk/signJob56, never assigned to job later.
   // The operation-scoped extra also avoids deduping an unrelated queued job.
   const signedScope=Object.freeze({
     screenConsentDigest:'',localActionApprovalDigest:'',
     commandId,operationId,actionDigest:a.actionDigest
   });
   let result;
   try{result=await exactOriginalEnvelope(
     'life_android_computer_prepare','computer_use_action_prepare',
     'READ_ONLY',args,signedScope)}
   catch{return deny('ORIGINAL_GEMINI_PREPARE_OUTCOME_UNKNOWN_NO_REPLAY')}
   const job=result?.job;
   // Original Secure56 must have created and signed this precise job.
   // A fabricated receipt or an unsigned job can never establish PREPARE.
   if(result?.error||result?.deviceId!==o.deviceId||
      !obj(job)||typeof job.id!=='string'||job.id.length===0||
      job.type!=='computer_use_action_prepare'||
      job.targetDeviceId!==o.deviceId||
      job.secureSessionId!==o.sessionId||
      !HEX64.test(job.securePayloadDigest??'')||
      !HEX64.test(job.secureMac??'')||
      typeof job.secureNonce!=='string'||job.secureNonce.length<16||
      !Number.isSafeInteger(job.secureExpiresAt)||
      job.secureExpiresAt<=clock()||
      job.commandId!==commandId||
      job.operationId!==operationId||
      job.actionDigest!==a.actionDigest||
      job.taskId!==t.id||job.taskDigest!==fields.task_digest||
      job.status!=='queued')
    return deny('ORIGINAL_GEMINI_QUEUED_PREPARE_UNVERIFIED_NO_REPLAY');
   try{if(await verifyOriginalQueuedJob(job,t,o,a)!==true)
     return deny('ORIGINAL_GEMINI_QUEUED_PREPARE_UNAUTHENTICATED_NO_REPLAY')}
   catch{return deny('ORIGINAL_GEMINI_QUEUED_PREPARE_UNAUTHENTICATED_NO_REPLAY')}
   // The phone job may already have been queued. Persist its ORIGINAL job ID
   // under the same non-replayable operation before calling preparation ready.
   // A failed journal attach is UNKNOWN, never permission to enqueue again.
   try{if(await attachOriginalJob(operationId,job.id,o,t)!==true)
     return deny('ORIGINAL_GEMINI_PREPARE_JOB_BINDING_UNKNOWN_NO_REPLAY')}
   catch{return deny('ORIGINAL_GEMINI_PREPARE_JOB_BINDING_UNKNOWN_NO_REPLAY')}
   return Object.freeze({ok:true,code:'SIGNED_GEMINI_SUBMIT_PREPARE_QUEUED',
     taskId,operationId,jobId:job.id,
     approved:false,dispatched:false,
     phoneLocalSendApprovalRequired:true,automaticReplay:false,
     phoneSendVerified:false,googleMessageVerified:false});
  }finally{running.delete(operationId)}
 }
 return Object.freeze({prepare,capabilities:()=>Object.freeze({
  enabled:enabled===true,originalSecure56Required:true,
  originalAndroidSingleEngine:true,
  phoneLocalApprovalBypassed:false,
  originalPhoneExecuteConnected:false,
  liveHostRegistered:false,automaticReplay:false
 })});
}
