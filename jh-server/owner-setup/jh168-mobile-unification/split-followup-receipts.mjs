/**
 * Read-only receipts for an existing, signed JH168 split FOLLOW_UP CLICK.
 * This module never creates or dispatches jobs, accepts approvals, or retries clicks.
 * Process-local by design: restart or expired original state remains UNKNOWN.
 */
import {createHash, randomBytes} from 'node:crypto';

const H32=/^[a-f0-9]{32}$/;
const H64=/^[a-f0-9]{64}$/;
const JOB=/^job_[0-9]+$/;
const CONTEXT=/^ssc_[a-f0-9]{32}$/;
const ITEM=/^item_[a-f0-9]{16}$/;
const REF=/^sfr_[A-Za-z0-9_-]{32}$/;
const sha=value=>createHash('sha256').update(value).digest('hex');
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const fail=(code,extra={})=>Object.freeze({ok:false,code,readOnly:true,
  newJobCreated:false,automaticReplay:false,executionStatus:'UNKNOWN',...extra});

export function createSplitFollowupReceiptRegistry56({
  clock=Date.now,
  token=()=>randomBytes(24).toString('base64url'),
  maxEntries=96
}={}){
  if(typeof clock!=='function'||typeof token!=='function'||
     !Number.isSafeInteger(maxEntries)||maxEntries<1||maxEntries>128)
    throw Error('SPLIT_FOLLOWUP_RECEIPT_PORTS_INVALID');
  const entries=new Map();
  function clean(){
    const now=clock();
    for(const [key,record] of entries)if(now>=record.expiresAt)entries.delete(key);
  }
  function matches(job,record){
    return object(job)&&JOB.test(job.id||'')&&job.id===record.jobId&&
      job.type==='split_screen_session_followup'&&
      job.mcpToolName==='life_android_execute_computer_action'&&
      job.secureRequestedEffect==='REVERSIBLE_WRITE'&&
      job.action==='CLICK'&&job.targetDeviceId===record.deviceId&&
      job.targetDeviceDigest===record.deviceDigest&&
      job.secureSessionId===record.sessionId&&
      job.commandId===record.commandId&&
      job.taskDigest===record.taskDigest&&
      job.requestId===record.requestId&&
      job.contextId===record.contextId&&
      job.targetItemRef===record.targetItemRef;
  }
  function issue({job,deviceId,deviceDigest,sessionId,commandId,taskDigest}={}){
    clean();
    if(!object(job)||!JOB.test(job.id||'')||
       !['queued','in_progress'].includes(job.status)||
       typeof deviceId!=='string'||!deviceId||
       !H64.test(deviceDigest||'')||
       typeof sessionId!=='string'||!sessionId||
       !H32.test(commandId||'')||!H64.test(taskDigest||'')||
       !H32.test(job.requestId||'')||
       !CONTEXT.test(job.contextId||'')||
       !ITEM.test(job.targetItemRef||'')||
       !Number.isSafeInteger(job.expiresAtMs)||
       job.expiresAtMs-clock()<3000||entries.size>=maxEntries)
      return null;
    const record={jobId:job.id,deviceId,deviceDigest,sessionId,
      commandId,taskDigest,requestId:job.requestId,
      contextId:job.contextId,targetItemRef:job.targetItemRef,
      expiresAt:Math.min(job.expiresAtMs,clock()+90000)};
    if(!matches(job,record))return null;
    const ref='sfr_'+token();
    if(!REF.test(ref)||entries.has(sha(ref)))return null;
    entries.set(sha(ref),Object.freeze(record));
    return Object.freeze({receiptRef:ref,expiresAt:record.expiresAt,
      readOnly:true,automaticReplay:false,newJobCreated:false});
  }
  function read({receiptRef,deviceId,deviceDigest,sessionId,commandId}={},getOriginalJob,verifyRightPane){
    clean();
    if(!REF.test(receiptRef||'')||typeof getOriginalJob!=='function'||
       typeof verifyRightPane!=='function')
      return fail('SPLIT_FOLLOWUP_RECEIPT_UNAVAILABLE');
    const record=entries.get(sha(receiptRef));
    if(!record)return fail('SPLIT_FOLLOWUP_RECEIPT_UNAVAILABLE');
    if(record.deviceId!==deviceId||record.deviceDigest!==deviceDigest||
       record.sessionId!==sessionId||record.commandId!==commandId)
      return fail('SPLIT_FOLLOWUP_RECEIPT_SCOPE_CHANGED');
    let job;
    try{job=getOriginalJob(record.jobId)}
    catch{return fail('SPLIT_FOLLOWUP_ORIGINAL_JOB_UNAVAILABLE')}
    if(!matches(job,record))return fail('SPLIT_FOLLOWUP_ORIGINAL_JOB_CHANGED');
    if(['queued','in_progress'].includes(job.status))
      return fail('SPLIT_FOLLOWUP_STILL_PENDING',{
        executionStatus:'PENDING',jobStatus:job.status,receiptRef,
        expiresAt:record.expiresAt});
    // Timeout, missing job, or a server-side terminal error is not proof that
    // the phone never executed the click.
    if(job.status!=='complete')
      return fail('SPLIT_FOLLOWUP_TERMINAL_UNKNOWN',{jobStatus:String(job.status||'unknown')});
    const result=job.result;
    if(!object(result)||typeof result.ok!=='boolean')
      return fail('SPLIT_FOLLOWUP_SIGNED_RESULT_INVALID');
    if(result.ok===false){
      const preDispatch=result.clickOcclusionDiagnostic?.actionDispatched===false||
        result.actionDispatched===false;
      const reason=typeof result.reason==='string'&&result.reason.length<96?result.reason:null;
      return fail(preDispatch?'SPLIT_FOLLOWUP_CLICK_BLOCKED':'SPLIT_FOLLOWUP_DEVICE_FAILURE',{
        executionStatus:preDispatch?'NOT_DISPATCHED':'UNKNOWN',
        deviceReportedCode:typeof result.code==='string'?result.code:null,
        deviceReportedReason:reason,
        ...(preDispatch?{actionDispatched:false}:{})
      });
    }
    if(result.action!==undefined&&result.action!=='CLICK')
      return fail('SPLIT_FOLLOWUP_ACTION_PROOF_MISMATCH');
    let proof=false;
    try{proof=verifyRightPane(result)===true}catch{proof=false}
    if(result.resultVerified!==true||!proof)
      return fail('SPLIT_FOLLOWUP_CLICK_UNCONFIRMED',{
        deviceReportedCode:typeof result.code==='string'?result.code:null});
    return Object.freeze({ok:true,code:'SPLIT_FOLLOWUP_CLICK_VERIFIED',
      executionStatus:'CONFIRMED',confirmationScope:'SIGNED_CLICK_AND_RIGHT_PANE_AT_RECEIPT',
      resultVerified:true,jobDigest:sha(job.id),taskDigest:record.taskDigest,
      receiptRecovered:true,readOnly:true,newJobCreated:false,automaticReplay:false});
  }
  return Object.freeze({issue,read});
}

