/** JH168 same-command ORIGINAL phone-local approval checkpoint.
 * Binds ALREADY-QUEUED Secure56 signed approval jobs and receipt tokens.
 * Never issues approval requests, mints grants, executes Android actions,
 * auto-polls, replays failed steps or replaces the one-shot phone approval.
 */
import {createHash} from 'node:crypto';
const hex32=v=>typeof v==='string'&&/^[a-f0-9]{32}$/.test(v);
const hex64=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const receipt=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{43,128}$/.test(v);
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const sha=x=>createHash('sha256').update(x).digest('hex');
const stop=(code,extra={})=>Object.freeze({
 ok:false,code,approvalGranted:false,actionDispatched:false,
 automaticReplay:false,newApprovalRequested:false,...extra
});
const bindingFields=['deviceId','sessionId','commandId','workWindowId',
 'workPackage','taskDigest','actionDigest','targetDigest','screenDigest','action'];
function exactScope(s,now){
 return obj(s)&&typeof s.deviceId==='string'&&s.deviceId.length>0&&
 typeof s.sessionId==='string'&&s.sessionId.length>0&&
 hex32(s.commandId)&&Number.isSafeInteger(s.workWindowId)&&
 s.workPackage==='com.android.chrome'&&
 hex64(s.taskDigest)&&hex64(s.actionDigest)&&
 hex64(s.targetDigest)&&hex64(s.screenDigest)&&
 ['CLICK','TYPE','SCROLL'].includes(s.action)&&
 Number.isSafeInteger(s.expiresAt)&&s.expiresAt>now&&
 s.expiresAt-now<=600000;
}
const identity=s=>sha(JSON.stringify(bindingFields.map(x=>s[x])));
export function createSameCommandApprovalCheckpoint56({
 clock=Date.now,verifyOriginalOwner,verifyOriginalQueuedApproval,
 readOriginalApprovalReceipt,verifyOriginalApprovalReadback
}={}){
 const functions=[clock,verifyOriginalOwner,verifyOriginalQueuedApproval,
  readOriginalApprovalReceipt,verifyOriginalApprovalReadback];
 if(functions.some(x=>typeof x!=='function'))
  throw Error('ORIGINAL_SECURE56_APPROVAL_PORTS_REQUIRED');
 const records=new Map();
 function cleanup(){const t=clock();for(const [k,v] of records)
   if(t>=v.expiresAt)records.delete(k)}
 async function bind({operationId,scope,originalApprovalJob,receiptToken}={}){
  cleanup();
  if(!hex32(operationId)||!exactScope(scope,clock())||!receipt(receiptToken)||
   !obj(originalApprovalJob)||
   originalApprovalJob.type!=='computer_use_action_approval_request'||
   !['queued','in_progress'].includes(originalApprovalJob.status)||
   originalApprovalJob.targetDeviceId!==scope.deviceId||
   originalApprovalJob.secureSessionId!==scope.sessionId||
   originalApprovalJob.commandId!==scope.commandId||
   originalApprovalJob.taskDigest!==scope.taskDigest||
   !Number.isSafeInteger(originalApprovalJob.expiresAtMs)||
   originalApprovalJob.expiresAtMs<=clock())
   return stop('ORIGINAL_APPROVAL_SCOPE_UNVERIFIED');
  let ownerOk,requestOk;
  try{
   ownerOk=await verifyOriginalOwner(scope);
   requestOk=await verifyOriginalQueuedApproval(originalApprovalJob,scope);
  }catch{return stop('ORIGINAL_APPROVAL_NOT_AUTHENTICATED')}
  if(ownerOk!==true||requestOk!==true)
   return stop('ORIGINAL_APPROVAL_NOT_AUTHENTICATED');
  const key=operationId,scopeFingerprint=identity(scope);
  const existing=records.get(key);
  if(existing){
   if(existing.scopeFingerprint!==scopeFingerprint||
      existing.receiptHash!==sha(receiptToken))
    return stop('ORIGINAL_APPROVAL_DIFFERENT_SCOPE_REJECTED');
   return Object.freeze({ok:true,code:'EXISTING_APPROVAL_RECEIPT_REUSED',
    receiptToken,approvalGranted:false,actionDispatched:false,
    newApprovalRequested:false,automaticReplay:false});
  }
  const expiresAt=Math.min(scope.expiresAt,originalApprovalJob.expiresAtMs);
  records.set(key,{scope:{...scope},scopeFingerprint,receiptHash:sha(receiptToken),
   receiptToken,expiresAt,terminal:false});
  return Object.freeze({ok:true,code:'ORIGINAL_PHONE_APPROVAL_PENDING',
   receiptToken,approvalGranted:false,actionDispatched:false,
   newApprovalRequested:false,automaticReplay:false});
 }
 async function status({operationId,currentScope}={}){
  cleanup();
  const record=records.get(operationId);
  if(!record)return stop('ORIGINAL_APPROVAL_RECEIPT_UNKNOWN');
  if(!exactScope(currentScope,clock())||
   identity(currentScope)!==record.scopeFingerprint)
   return stop('ORIGINAL_APPROVAL_SCOPE_CHANGED');
  if(record.terminal)return stop('ORIGINAL_APPROVAL_TERMINAL');
  try{if(await verifyOriginalOwner(currentScope)!==true)
   return stop('ORIGINAL_APPROVAL_OWNER_CHANGED')}
  catch{return stop('ORIGINAL_APPROVAL_OWNER_CHANGED')}
  let response,verified=false;
  try{
   response=await readOriginalApprovalReceipt({
    receiptToken:record.receiptToken,taskDigest:record.scope.taskDigest,
    deviceId:record.scope.deviceId,commandId:record.scope.commandId
   });
   verified=await verifyOriginalApprovalReadback(response,record.scope);
  }catch{return stop('ORIGINAL_APPROVAL_STATUS_UNAVAILABLE')}
  if(verified!==true||!obj(response)||response.lookupOnly!==true||
     !['queued','in_progress','complete','error','expired'].includes(response.status))
   return stop('ORIGINAL_APPROVAL_STATUS_NOT_AUTHENTICATED');
  if(['queued','in_progress'].includes(response.status))
   return stop('PHONE_LOCAL_APPROVAL_STILL_PENDING',{
    receiptToken:record.receiptToken,lookupOnly:true});
  record.terminal=true;
  if(response.status!=='complete'||response.result?.ok!==true)
   return stop('PHONE_LOCAL_APPROVAL_DENIED_OR_UNKNOWN');
  if(response.result?.approved!==true||
     response.result?.phoneLocalApproved!==true)
   return stop('PHONE_LOCAL_APPROVAL_NOT_PROVEN');
  // Signed approval status is NOT a grant. The original executor must freshly
  // inspect, prepare and check the phone-local one-shot grant again.
  return Object.freeze({ok:true,
    code:'ORIGINAL_PHONE_APPROVAL_VERIFIED_REPREPARE_REQUIRED',
    originalScopeDigest:record.scopeFingerprint,
    approvalGranted:false,actionDispatched:false,
    newApprovalRequested:false,automaticReplay:false,
    next:'ORIGINAL_PHONE_PREPARE_WITH_FRESH_SCREEN'});
 }
 return Object.freeze({bind,status});
}
