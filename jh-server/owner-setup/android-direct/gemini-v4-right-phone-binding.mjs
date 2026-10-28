/** JH167 V4 RIGHT Gemini / LEFT GPT: fail-closed original phone-job binding.
 *
 * This is the future HOST-side adapter for the corrected Android BridgeService
 * 'right_gemini_existing' read-only request. It never opens an application,
 * sends a prompt, generates a video, grants phone approval, or replays an action.
 * All functions MUST be the authenticated in-process Secure56 host ports, and
 * no caller payload is accepted as a receipt or screen attestation.
 *
 * CANDIDATE ONLY. Not registered in production tools.
 */
const cmd=/^[a-f0-9]{32}$/, op=/^[a-f0-9]{32}$/;
const deny=(code,extra={})=>Object.freeze({ok:false,code,automaticReplay:false,...extra});
const rect=s=>{
 if(typeof s!=='string'||!/^(0|[1-9]\d{0,7}),(0|[1-9]\d{0,7}),(0|[1-9]\d{0,7}),(0|[1-9]\d{0,7})$/.test(s))return null;
 const [left,top,right,bottom]=s.split(',').map(Number);
 return [left,top,right,bottom].every(n=>Number.isSafeInteger(n)&&n>=0)&&
   right-left>=100&&bottom-top>=100?{left,top,right,bottom}:null;
};
function ownerShape(x,commandId,now){
 if(!x||x.backend!=='JH_ANDROID_NATIVE'||x.current!==true||x.secure56!==true||
  x.commandId!==commandId||x.workSide!=='RIGHT'||x.chatSide!=='LEFT'||
  x.workPackage!=='com.google.android.googlequicksearchbox'||
  x.chatPackage!=='com.openai.chatgpt'||x.nativeGeminiWindowVerified!==true||
  !Number.isSafeInteger(x.workWindowId)||x.workWindowId<0||
  !Number.isSafeInteger(x.chatWindowId)||x.chatWindowId<0||x.workWindowId===x.chatWindowId||
  !Number.isSafeInteger(x.observedAt)||x.observedAt>now||now-x.observedAt>10000||
  typeof x.deviceId!=='string'||!x.deviceId||
  typeof x.sessionId!=='string'||!x.sessionId)return false;
 const w=rect(x.workBounds),c=rect(x.chatBounds);
 return !!w&&!!c&&c.right<=w.left&&Math.min(w.bottom,c.bottom)-Math.max(w.top,c.top)>=100;
}
const same=(a,b)=>!!a&&!!b&&
 ['deviceId','sessionId','commandId','workWindowId','chatWindowId',
 'workBounds','chatBounds','workPackage','chatPackage','workSide','chatSide']
 .every(k=>a[k]===b[k]);
function accepted(r,o){
 return r?.ok===true&&r.code==='GEMINI_EXISTING_RIGHT_WINDOW_BOUND'&&
  r.workWindowId===o.workWindowId&&r.chatWindowId===o.chatWindowId&&
  r.workPackage===o.workPackage&&r.workBounds===o.workBounds&&
  r.chatBounds===o.chatBounds&&r.workSide==='RIGHT'&&r.chatSide==='LEFT'&&
  r.requestSent===false&&r.resultVerified===false&&r.automaticReplayAllowed===false;
}
export function createV4RightGeminiPhoneBinding({
 readSignedOwner,verifySignedOwner,claimOriginalOperation,
 startOriginalSignedJob,readOriginalJob,verifyOriginalCompletion,
 enabled=false,clock=Date.now
}={}){
 if([readSignedOwner,verifySignedOwner,claimOriginalOperation,startOriginalSignedJob,
    readOriginalJob,verifyOriginalCompletion,clock].some(f=>typeof f!=='function'))
  throw Error('ORIGINAL_SECURE56_SIGNED_BINDING_PORTS_REQUIRED');
 const working=new Set();
 async function owner(commandId){
  let o;try{o=await readSignedOwner()}catch{return null}
  if(!ownerShape(o,commandId,clock()))return null;
  try{if(await verifySignedOwner(o,commandId)!==true)return null}catch{return null}
  return o;
 }
 async function bind({commandId,operationId}={}){
  if(!enabled)return deny('V4_RIGHT_GEMINI_BINDING_DISABLED');
  if(!cmd.test(commandId??'')||!op.test(operationId??''))
   return deny('SIGNED_COMMAND_AND_ORIGINAL_OPERATION_REQUIRED');
  if(working.has(operationId))return deny('BINDING_ALREADY_REQUESTED_STATUS_ONLY');
  const first=await owner(commandId);
  if(!first)return deny('CURRENT_SIGNED_LEFT_GPT_RIGHT_GEMINI_REQUIRED');
  working.add(operationId);
  try{
   // Atomic original durable reservation prevents a lost response from
   // being treated as permission to generate a second phone job.
   const payload=Object.freeze({
    type:'open_url',target:'right_gemini_existing',commandId,operationId,
    expectedWorkWindowId:first.workWindowId,
    expectedChatWindowId:first.chatWindowId,
    expectedWorkPackage:first.workPackage,
    expectedChatPackage:first.chatPackage,
    expectedWorkBounds:first.workBounds,
    expectedChatBounds:first.chatBounds
   });
   let claim;try{claim=await claimOriginalOperation(operationId,payload,first)}
   catch{return deny('ORIGINAL_DURABLE_JOURNAL_UNAVAILABLE')}
   if(claim!==true)return deny('ORIGINAL_OPERATION_ALREADY_RESERVED_READ_ONLY');
   if(!same(first,await owner(commandId)))
    return deny('SIGNED_GEMINI_PAIR_CHANGED_BEFORE_SEND_NO_REPLAY');
   let sent;try{sent=await startOriginalSignedJob(payload,first)}
   catch{return deny('GEMINI_PHONE_JOB_OUTCOME_UNKNOWN_NO_REPLAY')}
   if(!sent||typeof sent.jobId!=='string'||!sent.jobId)
    return deny('GEMINI_PHONE_JOB_RECEIPT_MISSING_NO_REPLAY');
   // Only the ORIGINAL host may authenticate completion. Any missing or
   // unverified status remains UNKNOWN; no automatic second command.
   return Object.freeze({ok:false,code:'RIGHT_GEMINI_BINDING_JOB_STARTED_READ_STATUS',
    jobId:sent.jobId,operationId,status:'PENDING',automaticReplay:false});
  }finally{working.delete(operationId)}
 }
 async function status({commandId,operationId}={}){
  if(!enabled)return deny('V4_RIGHT_GEMINI_BINDING_DISABLED');
  if(!cmd.test(commandId??'')||!op.test(operationId??''))
   return deny('SIGNED_COMMAND_AND_ORIGINAL_OPERATION_REQUIRED');
  const proof=await owner(commandId);
  if(!proof)return deny('CURRENT_SIGNED_LEFT_GPT_RIGHT_GEMINI_REQUIRED');
  let report;try{report=await readOriginalJob(operationId,commandId)}
  catch{return deny('ORIGINAL_GEMINI_STATUS_UNAVAILABLE_NO_REPLAY')}
  if(!report||report.operationId!==operationId||report.commandId!==commandId||
    report.deviceId!==proof.deviceId||report.sessionId!==proof.sessionId||
    report.status!=='COMPLETED')
    return deny('ORIGINAL_GEMINI_PHONE_BINDING_PENDING_OR_UNKNOWN');
  try{if(await verifyOriginalCompletion(report,proof)!==true)
    return deny('ORIGINAL_GEMINI_RECEIPT_NOT_AUTHENTICATED')}
  catch{return deny('ORIGINAL_GEMINI_RECEIPT_NOT_AUTHENTICATED')}
  if(!same(proof,await owner(commandId)))
   return deny('GEMINI_WINDOW_CHANGED_AFTER_READBACK');
  if(!accepted(report.payload,proof))
   return deny('GEMINI_RIGHT_PAIR_READBACK_MISMATCH');
  return Object.freeze({ok:true,code:'SIGNED_GEMINI_RIGHT_WINDOW_BOUND',
   workSide:'RIGHT',chatSide:'LEFT',windowBound:true,
   geminiDraftVerified:false,geminiAccountVerified:false,
   requestSent:false,geminiReplyVerified:false,videoVerified:false,
   automaticReplay:false});
 }
 return Object.freeze({bind,status,capabilities:()=>Object.freeze({
  enabled:enabled===true,mode:'LEFT_GPT_RIGHT_NATIVE_GEMINI',
  originalSecure56Required:true,readOnlyPhoneBinding:true,
  actualPhoneTested:false,productionRegistered:false,
  automaticReplay:false
 })});
}
