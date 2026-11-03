/** Read-only durable receipt for the ORIGINAL signed Secure56 Computer Use PREPARE/EXECUTE.
 * No Android dispatch, retry, approval, lease creation or replay.
 * PREPARE may return the ORIGINAL already-created lease only inside the exact same
 * device/session/command/task/run scope; the lease keeps its own expiry and authority.
 */
import {createHash,randomBytes} from 'node:crypto';
const H32=/^[a-f0-9]{32}$/,H64=/^[a-f0-9]{64}$/,JOB=/^job_[0-9]+$/;
const REF=/^cer_[A-Za-z0-9_-]{43}$/;
const ACTIONS=new Set(['CLICK','DOUBLE_CLICK','SCROLL','TYPE','KEYPRESS','DRAG','MOVE','WAIT','SCREENSHOT']);
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const sha=x=>createHash('sha256').update(x).digest('hex');
const fail=(code,executionStatus='UNKNOWN')=>Object.freeze({ok:false,code,executionStatus,lookupOnly:true,readOnly:true,newJobCreated:false,automaticReplay:false,actionReplayed:false});
const kind=j=>j?.type==='computer_use_action_prepare'&&j?.mcpToolName==='life_android_computer_prepare'&&j?.secureRequestedEffect==='READ_ONLY'?'PREPARE':
 j?.type==='computer_use_action_execute'&&j?.mcpToolName==='life_android_execute_computer_action'&&j?.secureRequestedEffect==='MUTATION'?'EXECUTE':null;
const prepareResult=result=>{
 const keys=['ok','code','reason','actionDigest','screenDigest','executorOp','requiresFreshApproval','requiresScreenshotConsent','stopAfterAction','approvalDiagnostic','approvalGrantSupplied','approvalGrantExpiresAt','automaticApprovalRetryAllowed','leaseToken','leaseExpiresAt','stage61Router'];
 const out={};for(const k of keys)if(Object.hasOwn(result,k))out[k]=result[k];return Object.freeze(out);
};
export function createComputerExecutionReceiptRegistry56({now=Date.now,newToken=()=>randomBytes(32).toString('base64url'),maxEntries=96,ttlMs=300000}={}){
 if(typeof now!=='function'||typeof newToken!=='function'||!Number.isSafeInteger(maxEntries)||maxEntries<1||maxEntries>128||!Number.isSafeInteger(ttlMs)||ttlMs<1000||ttlMs>600000)throw Error('COMPUTER_EXECUTION_RECEIPT_CONFIG_INVALID');
 const records=new Map();
 function clean(){for(const [key,row]of records)if(now()>=row.expiresAtMs)records.delete(key);}
 function valid(j){
   const k=kind(j);if(!k)return false;
   return obj(j)&&JOB.test(j.id||'')&&ACTIONS.has(j.action)&&typeof j.targetDeviceId==='string'&&!!j.targetDeviceId&&
    H64.test(j.targetDeviceDigest||'')&&typeof j.secureSessionId==='string'&&!!j.secureSessionId&&H32.test(j.commandId||'')&&
    H64.test(j.taskDigest||'')&&(!j.runDigest||H64.test(j.runDigest))&&H64.test(j.secureMac||'')&&H64.test(j.securePayloadDigest||'')&&
    Number.isSafeInteger(j.expiresAtMs)&&Number.isSafeInteger(j.secureExpiresAt)&&Number.isSafeInteger(j.secureInvocationExpiresAt)&&
    (k==='PREPARE'||(typeof j.leaseToken==='string'&&j.leaseToken.length>=16&&j.leaseToken.length<=512));
 }
 function issue({job,deviceId,deviceDigest,sessionId,commandId,taskDigest,runDigest=''}={}){
   clean();const k=kind(job);
   if(!k||!valid(job)||!['queued','in_progress'].includes(job.status)||records.size>=maxEntries||
      job.targetDeviceId!==deviceId||job.targetDeviceDigest!==deviceDigest||job.secureSessionId!==sessionId||
      job.commandId!==commandId||job.taskDigest!==taskDigest||String(job.runDigest||'')!==runDigest)return null;
   const at=now(),expiresAtMs=at+ttlMs;if(!Number.isSafeInteger(at)||!Number.isSafeInteger(expiresAtMs))return null;
   const receiptToken='cer_'+newToken();if(!REF.test(receiptToken)||records.has(sha(receiptToken)))return null;
   records.set(sha(receiptToken),Object.freeze({jobId:job.id,kind:k,deviceId,deviceDigest,sessionId,commandId,taskDigest,runDigest,
     action:job.action,macDigest:sha(job.secureMac),payloadDigest:job.securePayloadDigest,
     leaseDigest:k==='EXECUTE'?sha(job.leaseToken):null,expiresAtMs}));
   return Object.freeze({receiptToken,receiptExpiresAtMs:expiresAtMs,receiptKind:k,readOnly:true,newJobCreated:false,automaticReplay:false,actionReplayed:false});
 }
 function read({receiptToken,deviceId,deviceDigest,sessionId,commandId,taskDigest,runDigest=''}={},getOriginalJob){
   clean();if(!REF.test(receiptToken||'')||typeof getOriginalJob!=='function')return fail('COMPUTER_EXECUTION_RECEIPT_UNAVAILABLE');
   const row=records.get(sha(receiptToken));if(!row)return fail('COMPUTER_EXECUTION_RECEIPT_UNAVAILABLE');
   if(row.deviceId!==deviceId||row.deviceDigest!==deviceDigest||row.sessionId!==sessionId||row.commandId!==commandId||row.taskDigest!==taskDigest||row.runDigest!==runDigest)return fail('COMPUTER_EXECUTION_RECEIPT_SCOPE_CHANGED');
   let j;try{j=getOriginalJob(row.jobId)}catch{return fail('COMPUTER_EXECUTION_ORIGINAL_JOB_UNAVAILABLE');}
   if(!valid(j)||kind(j)!==row.kind||j.id!==row.jobId||j.targetDeviceId!==row.deviceId||j.targetDeviceDigest!==row.deviceDigest||
      j.secureSessionId!==row.sessionId||j.commandId!==row.commandId||j.taskDigest!==row.taskDigest||String(j.runDigest||'')!==row.runDigest||
      j.action!==row.action||sha(j.secureMac)!==row.macDigest||j.securePayloadDigest!==row.payloadDigest||
      (row.kind==='EXECUTE'&&sha(j.leaseToken)!==row.leaseDigest))return fail('COMPUTER_EXECUTION_ORIGINAL_JOB_CHANGED');
   if(['queued','in_progress'].includes(j.status))return Object.freeze({ok:true,code:row.kind==='PREPARE'?'COMPUTER_PREPARE_STILL_PENDING':'COMPUTER_EXECUTION_STILL_PENDING',receiptKind:row.kind,executionStatus:'PENDING',jobStatus:j.status,lookupOnly:true,readOnly:true,newJobCreated:false,automaticReplay:false,actionReplayed:false});
   if(j.status!=='complete')return fail(row.kind==='PREPARE'?'COMPUTER_PREPARE_OUTCOME_UNKNOWN':'COMPUTER_EXECUTION_OUTCOME_UNKNOWN');
   const result=j.result;if(!obj(result)||typeof result.ok!=='boolean')return fail('COMPUTER_EXECUTION_RESULT_UNCLASSIFIED');
   if(row.kind==='PREPARE')return Object.freeze({ok:true,code:'COMPUTER_PREPARE_RESULT_RECEIVED',receiptKind:row.kind,executionStatus:'RESULT_RECEIVED',originalResult:prepareResult(result),lookupOnly:true,readOnly:true,newJobCreated:false,automaticReplay:false,actionReplayed:false});
   return Object.freeze({ok:true,code:'COMPUTER_EXECUTION_RESULT_RECEIVED',receiptKind:row.kind,executionStatus:'RESULT_RECEIVED',
     deviceReportedCode:typeof result.code==='string'&&result.code.length<=96?result.code:null,deviceReportedOk:result.ok,
     deviceReportedDispatched:result.dispatched===true,deviceReportedVerified:result.resultVerified===true,userTaskVerified:false,
     lookupOnly:true,readOnly:true,newJobCreated:false,automaticReplay:false,actionReplayed:false});
 }
 return Object.freeze({issue,read});
}
