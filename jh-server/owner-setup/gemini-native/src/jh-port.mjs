import {NATIVE_BACKEND,GEMINI_HOST,hash,bound,text} from './contract.mjs';
const token=x=>typeof x==='string'&&x.length>=8&&x.length<=512;
const blocked=code=>({status:'NOT_DISPATCHED',code,automaticReplay:false});
const sameScreen=(a,b)=>bound(a,b)&&['taskId','packageName','windowId','screenDigest','workSide','chatSide','accountBinding','conversationId']
 .every(k=>a?.[k]===b?.[k]);
/** Exact action adapter around ORIGINAL JH prepare/execute and local approvals.
 * Its functions must be host-local. validatePrepared authenticates the original
 * signed job and resolves its actual schema; a caller's JSON is never enough.
 * saveDispatched is an atomic durable claim in the EXISTING JH journal, returning
 * true once and false for duplicates (not merely a logging callback).
 */
export async function executeWithJh(action,{prepare,execute,validatePrepared,readBinding,saveDispatched,
 isCancelled=()=>false}={}){
 if(!['TYPE','SUBMIT'].includes(action?.kind)||
  [prepare,execute,validatePrepared,readBinding,saveDispatched,isCancelled].some(f=>typeof f!=='function'))
  return blocked('ORIGINAL_HOST_PORT_REQUIRED');
 if(isCancelled())return blocked('CANCELLED_BEFORE_PREPARE');
 const binding=await readBinding(action);
 if(isCancelled())return blocked('CANCELLED_BEFORE_PREPARE');
 if(!binding||binding.backend!==NATIVE_BACKEND||binding.taskId!==action.taskId||
   !bound(binding,action)||binding.packageName!==GEMINI_HOST||binding.workSide!=='RIGHT'||binding.chatSide!=='LEFT'||
   !text(binding.screenDigest,200)||!Number.isSafeInteger(binding.windowId)||binding.windowId<0||
   binding.accountBinding!==action.accountBinding||binding.conversationId!==action.conversationId)
   return blocked('NATIVE_GEMINI_BINDING_CHANGED');
 // The exact target must be resolved afresh by the current Android native host.
 // No old Playwright locator, screenshot coordinate or Google-web cookie enters this path.
 const request={...action,packageName:binding.packageName,windowId:binding.windowId,
  screenDigest:binding.screenDigest,target:action.target,maxActionsInCall:1,
  textDigest:action.kind==='TYPE'?hash(action.text):null,requiresLocalSendReview:action.kind==='SUBMIT'};
 const prepared=await prepare(request);
 if(isCancelled())return blocked('CANCELLED_DURING_PREPARE');
 const v=await validatePrepared(prepared,request);
 if(isCancelled())return blocked('CANCELLED_DURING_PREPARE');
 if(v?.status!=='READY')return blocked(v?.code??'ORIGINAL_PHONE_PREPARATION_REQUIRED');
 if(!token(v.leaseToken)||!v.executeArgs||!bound(v,action)||
   v.actionId!==action.id||v.screenDigest!==binding.screenDigest||
   v.promptDigest!==action.promptDigest)return blocked('PHONE_LEASE_SCOPE_MISMATCH');
 // Gemini SUBMIT is consequential even when generic UI calls look like clicks.
 // The one-shot grant must be authenticated and exact to this draft/screen/action.
 if(action.kind==='SUBMIT'&&(v.localApprovalVerified!==true||!token(v.approvalGrantToken)||
   v.approvalActionDigest!==v.actionDigest||!text(v.actionDigest,200)))
    return blocked('EXACT_PHONE_LOCAL_SEND_APPROVAL_REQUIRED');
 const fresh=await readBinding(action);
 if(isCancelled()||!sameScreen(fresh,binding))return blocked('CANCELLED_OR_NATIVE_CONTEXT_CHANGED');
 const claimed=await saveDispatched(action.id,request);
 if(claimed!==true)return {status:'READ_ONLY',code:'ACTION_ALREADY_RESERVED_READ_SAME_JOB',automaticReplay:false};
 // Cancellation after the durable fence leaves a tombstone; never free it to replay.
 if(isCancelled())return blocked('CANCELLED_AFTER_RESERVATION_NO_REPLAY');
 try{return {status:'RECEIPT_REQUIRES_VALIDATION',raw:await execute(v.executeArgs,request),automaticReplay:false}}
 catch{return {status:'UNKNOWN',code:'DO_NOT_RESUBMIT_READ_EXISTING_RESULT',automaticReplay:false}}
}
/** A facade over ONE existing, authenticated JH native engine. No web/device
 * selection, new server, new credentials, approval substitute or API billing.
 * Original host receipts are returned unchanged so outer verifiers authenticate
 * their real identity and evidence. All callbacks below must be attached at
 * the actual Secure56 host; this library never claims that attachment is live.
 */
export function createJhNativeGeminiPort({original,verifyObservation,clock=Date.now}={}){
 if(original?.backend!==NATIVE_BACKEND||original?.usesOriginalSecure56!==true||
  typeof original.observe!=='function'||typeof verifyObservation!=='function'||
  typeof original.isCurrent!=='function')throw Error('ONE_ORIGINAL_SECURE56_ENGINE_REQUIRED');
 const cancelled=new Set();
 async function read(q){
  const o=await original.observe(q);
  if(!o||o.taskId!==q.taskId||o.commandId!==q.commandId||o.backend!==NATIVE_BACKEND||
   o.workSide!=='RIGHT'||o.chatSide!=='LEFT'||o.splitVerified!==true||
   !Number.isSafeInteger(o.observedAt)||o.observedAt>clock()||clock()-o.observedAt>15000||
   !await verifyObservation(o,q))throw Error('AUTHENTICATED_NATIVE_OBSERVATION_REQUIRED');
  return o;
 }
 async function invoke(kind,a,o){
  if(cancelled.has(a.taskId)||!await original.isCurrent(a))throw Error('COMMAND_CANCELLED_OR_CHANGED');
  if(cancelled.has(a.taskId))throw Error('CANCELLED');
  if(typeof original[kind]!=='function')throw Error('ORIGINAL_NATIVE_OPERATION_NOT_CONNECTED');
  // Cancellation callback must also be consulted by the original executor just
  // before its phone-job dispatch; native callbacks cannot be force-stopped here.
  return original[kind](a,o,{isCancelled:()=>cancelled.has(a.taskId)});
 }
 return Object.freeze({backend:NATIVE_BACKEND,observe:read,
  type:(a,o)=>invoke('type',a,o),submit:(a,o)=>invoke('submit',a,o),openApp:(a,o)=>invoke('openApp',a,o),
  exportExistingVideo:(a,o)=>invoke('exportExistingVideo',a,o),
  lookupExport:id=>original.lookupExport?.(id),
  cancelPending:id=>{cancelled.add(id);original.cancelPending?.(id)},
  capabilities:()=>({singleAndroidEngine:true,serverBrowserUsed:false,productionInstalled:false})});
}
