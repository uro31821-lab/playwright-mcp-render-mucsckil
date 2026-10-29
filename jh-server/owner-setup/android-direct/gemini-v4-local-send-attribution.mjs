/** JH167 V4: authenticate ONLY a phone-local approved Gemini CLICK ATTEMPT.
 *
 * The original JH Secure56 completion and original task/action scope must be
 * verified independently by in-process callbacks before this module reads
 * geminiLocalClickAttempt. The contract does NOT attest a Google message ID,
 * conversation ID, model reply, or result delivered into ChatGPT.
 *
 * This is isolated development code; not enabled in the production host.
 */
import {createHash} from 'node:crypto';
const H='com.google.android.googlequicksearchbox';
const HEX64=/^[0-9a-f]{64}$/;
const HEX32=/^[0-9a-f]{32}$/;
const bad=code=>Object.freeze({ok:false,code,autoRetry:false,
 localClickAttemptVerified:false,googleSentMessageIdVerified:false,
 fullReplyVerified:false,chatGptDeliveryVerified:false});
const obj=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const digest=x=>createHash('sha256').update(x,'utf8').digest('hex');
// V2: phone and host independently bind the actual 8–80-character native task ID.
const taskIdentityDigest=id=>digest('JH-GEMINI-TASK-ID-V1|'+id);
function rehash(p){
 return digest('JH-GEMINI-LOCAL-CLICK-V2|'+[
   p.taskDigest,p.promptDigest,p.reviewBindingDigest,p.actionDigest,
   p.sourcePackage,p.sourceWindowId
 ].join('|'));
}
const shape=p=>obj(p)&&p.schema==='JH_GEMINI_LOCAL_CLICK_V2'&&
 p.sourcePackage===H&&Number.isSafeInteger(p.sourceWindowId)&&p.sourceWindowId>=0&&
 p.workSide==='RIGHT'&&p.chatSide==='LEFT'&&
 p.localApprovedClickDispatched===true&&
 p.googleSentMessageIdVerified===false&&
 p.googleConversationIdVerified===false&&p.fullReplyVerified===false&&
 p.postObservationRequired===true&&
 [p.taskDigest,p.promptDigest,p.reviewBindingDigest,
 p.actionDigest,p.localAttemptDigest].every(x=>HEX64.test(x??''))&&
 p.localAttemptDigest===rehash(p);
const ownerValid=(o,id)=>obj(o)&&o.current===true&&o.secure56===true&&
 o.commandId===id&&o.workSide==='RIGHT'&&o.chatSide==='LEFT'&&
 o.workPackage===H&&o.chatPackage==='com.openai.chatgpt'&&
 typeof o.deviceId==='string'&&o.deviceId.length>0&&
 typeof o.sessionId==='string'&&o.sessionId.length>0&&
 Number.isSafeInteger(o.workWindowId)&&o.workWindowId>=0;
const sameOwner=(a,b)=>!!a&&!!b&&[
 'deviceId','sessionId','commandId','workWindowId','workPackage',
 'workSide','chatSide','chatWindowId','chatPackage'
].every(k=>a[k]===b[k]);

export function createV4GeminiOriginalLocalSendAttestor({
 readOriginalOwner,verifyOriginalOwner,readOriginalTask,verifyOriginalTask,
 readOriginalJob,verifyOriginalCompletedJob,
 resolveOriginalActionScope,verifyOriginalActionScope,
 clock=Date.now,enabled=false
}={}){
 if([readOriginalOwner,verifyOriginalOwner,readOriginalTask,verifyOriginalTask,
 readOriginalJob,verifyOriginalCompletedJob,resolveOriginalActionScope,
 verifyOriginalActionScope,clock].some(f=>typeof f!=='function'))
  throw Error('ORIGINAL_SECURE56_SEND_ATTESTATION_PORTS_REQUIRED');
 const locked=new Set();
 async function owner(commandId){
  let x;try{x=await readOriginalOwner()}catch{return null}
  if(!ownerValid(x,commandId))return null;
  try{if(await verifyOriginalOwner(x,commandId)!==true)return null}
  catch{return null}
  return x;
 }
 async function verify({commandId,taskId,originalJobId}={}){
  if(!enabled)return bad('V4_LOCAL_SEND_ATTESTOR_DISABLED');
  if(!HEX32.test(commandId??'')||typeof taskId!=='string'||
     !/^[a-zA-Z0-9_-]{8,80}$/.test(taskId)||
     typeof originalJobId!=='string'||originalJobId.length<5||originalJobId.length>200)
   return bad('SIGNED_TASK_COMMAND_AND_JOB_REQUIRED');
  if(locked.has(originalJobId))return bad('SEND_ATTESTATION_ALREADY_READING');
  locked.add(originalJobId);
  try{
   const first=await owner(commandId);
   if(!first)return bad('ORIGINAL_GEMINI_RIGHT_OWNER_REQUIRED');
   let task,job,scope;
   try{task=await readOriginalTask(taskId);
       job=await readOriginalJob(originalJobId)}
   catch{return bad('ORIGINAL_TASK_OR_JOB_UNAVAILABLE')}
   if(!obj(task)||task.id!==taskId||task.commandId!==commandId||
      !['YOUTUBE','VIDEO'].includes(task.mode)||
      task.workSide!=='RIGHT'||task.chatSide!=='LEFT'||
      task.deviceId!==first.deviceId||task.sessionId!==first.sessionId||
      task.cancelled===true||task.pending?.kind!=='SUBMIT'||
      !HEX64.test(task.promptDigest??''))
    return bad('ORIGINAL_PENDING_SUBMIT_TASK_REQUIRED');
   try{if(await verifyOriginalTask(task,first)!==true)return bad('ORIGINAL_SUBMIT_TASK_UNAUTHENTICATED')}
   catch{return bad('ORIGINAL_SUBMIT_TASK_UNAUTHENTICATED')}
   if(!obj(job)||job.id!==originalJobId||
      job.type!=='computer_use_action_execute'||job.status!=='complete'||
      job.targetDeviceId!==first.deviceId||job.secureSessionId!==first.sessionId||
      job.commandId!==commandId||job.result?.dispatched!==true||
      job.result?.resultVerified!==false)return bad('ORIGINAL_LOCAL_CLICK_JOB_REQUIRED');
   try{if(await verifyOriginalCompletedJob(job,first)!==true)
      return bad('ORIGINAL_LOCAL_CLICK_COMPLETION_UNAUTHENTICATED')}
   catch{return bad('ORIGINAL_LOCAL_CLICK_COMPLETION_UNAUTHENTICATED')}
   const p=job.result.geminiLocalClickAttempt;
   if(!shape(p)||p.promptDigest!==task.promptDigest||
      p.taskDigest!==taskIdentityDigest(task.id))
    return bad('GEMINI_LOCAL_CLICK_ATTEMPT_SCHEMA_MISMATCH');
   try{scope=await resolveOriginalActionScope(job,task,first)}
   catch{return bad('ORIGINAL_LOCAL_ACTION_SCOPE_UNAVAILABLE')}
   if(!obj(scope)||scope.commandId!==commandId||
      scope.taskId!==taskId||
      scope.deviceId!==first.deviceId||scope.sessionId!==first.sessionId||
      scope.taskDigest!==p.taskDigest||scope.promptDigest!==p.promptDigest||
      scope.reviewBindingDigest!==p.reviewBindingDigest||
      scope.actionDigest!==p.actionDigest||
      scope.workPackage!==H||
      scope.workWindowId!==p.sourceWindowId||scope.workSide!=='RIGHT')
    return bad('GEMINI_LOCAL_ACTION_OR_REQUEST_SCOPE_CHANGED');
   try{if(await verifyOriginalActionScope(scope,job,task,first)!==true)
      return bad('ORIGINAL_LOCAL_ACTION_SCOPE_UNAUTHENTICATED')}
   catch{return bad('ORIGINAL_LOCAL_ACTION_SCOPE_UNAUTHENTICATED')}
   const second=await owner(commandId);
   if(!sameOwner(first,second))
    return bad('ORIGINAL_GEMINI_OWNER_CHANGED_AFTER_COMPLETION');
   return Object.freeze({
    ok:true,code:'ORIGINAL_SIGNED_GEMINI_APPROVED_LOCAL_CLICK_ATTEMPT',
    taskId,originalJobId,localAttemptDigest:p.localAttemptDigest,
    promptDigest:p.promptDigest,localClickAttemptVerified:true,
    requiresSignedVisibleMessageReadback:true,
    googleSentMessageIdVerified:false,googleConversationIdVerified:false,
    requestTurnVerified:false,fullReplyVerified:false,
    chatGptDeliveryVerified:false,autoRetry:false
   });
  }finally{locked.delete(originalJobId)}
 }
 return Object.freeze({verify,capabilities:()=>Object.freeze({
  enabled:enabled===true,
  originalSecure56Required:true,originalPhoneLocalApprovalRequired:true,
  noNewExecutionTool:true,fullReplyVerified:false,
  googleSentMessageIdVerified:false,productionAttached:false,autoRetry:false
 })});
}
