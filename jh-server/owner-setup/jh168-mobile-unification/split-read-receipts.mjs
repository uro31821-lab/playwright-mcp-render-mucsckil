/** JH168 original Secure56 READ-ONLY split job receipt registry.
 * Process-local; scoped to exact device/session/command/job. No action dispatch,
 * grant creation, retry, background worker or raw-screen storage.
 */
import {randomBytes,createHash} from 'node:crypto';

const types=new Set(['split_screen_session_start','split_screen_session_status','split_comfort_status']);
const HEX32=/^[a-f0-9]{32}$/;
const HEX64=/^[a-f0-9]{64}$/;
const REF=/^srr_[A-Za-z0-9_-]{32}$/;
const sha=x=>createHash('sha256').update(x).digest('hex');
const plain=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
// Comfort STATUS shares this receipt only under its original read authority.
// Other comfort modes, including writes, are not admitted by the type allowlist.
const comfortAuthority=job=>job.type!=='split_comfort_status'||
  (Object.hasOwn(job,'mcpToolName')&&job.mcpToolName==='life_android_capture_work_window'&&
   Object.hasOwn(job,'secureRequestedEffect')&&job.secureRequestedEffect==='READ_ONLY');
const deny=(code,extra={})=>Object.freeze({ok:false,code,automaticReplay:false,
  newJobCreated:false,readOnly:true,...extra});

export function createSplitReadReceiptRegistry56({
  clock=Date.now,token=()=>randomBytes(24).toString('base64url'),
  maxEntries=96
}={}){
  if(typeof clock!=='function'||typeof token!=='function'||
     !Number.isSafeInteger(maxEntries)||maxEntries<1||maxEntries>128)
    throw Error('SPLIT_READ_RECEIPT_PORTS_INVALID');
  const refs=new Map();
  const tidy=()=>{
    const at=clock();
    for(const [k,v]of refs)if(at>=v.expiresAt)refs.delete(k);
  };
  function issue({job,deviceId,sessionId,commandId,taskDigest}={}){
    tidy();
    if(!plain(job)||!types.has(job.type)||!comfortAuthority(job)||
       !['queued','in_progress'].includes(job.status)||
       typeof job.id!=='string'||!/^job_[0-9]+$/.test(job.id)||
       typeof deviceId!=='string'||!deviceId||
       typeof sessionId!=='string'||!sessionId||
       !HEX32.test(commandId||'')||!HEX64.test(taskDigest||'')||
       job.targetDeviceId!==deviceId||job.secureSessionId!==sessionId||
       job.commandId!==commandId||job.taskDigest!==taskDigest||
       !Number.isSafeInteger(job.expiresAtMs)||
       job.expiresAtMs-clock()<3000||refs.size>=maxEntries)return null;
    const value='srr_'+token();
    if(!REF.test(value)||refs.has(value))return null;
    const expiresAt=Math.min(job.expiresAtMs,clock()+60000);
    refs.set(value,Object.freeze({id:job.id,type:job.type,deviceId,sessionId,
      commandId,taskDigest,expiresAt}));
    return Object.freeze({receiptRef:value,expiresAt,readOnly:true,
      automaticReplay:false});
  }
  /** The callback returns the same original job accepted by Secure56 HMAC;
   * the verifier is the original signed JH split/window proof policy.
   */
  function read({receiptRef,deviceId,sessionId,commandId}={},
                getOriginalJob,verifySplitProof){
    tidy();
    if(!REF.test(receiptRef||'')||typeof getOriginalJob!=='function'||
       typeof verifySplitProof!=='function')
      return deny('SPLIT_READ_RECEIPT_UNAVAILABLE');
    const record=refs.get(receiptRef);
    if(!record)return deny('SPLIT_READ_RECEIPT_UNAVAILABLE');
    if(deviceId!==record.deviceId||sessionId!==record.sessionId||
       commandId!==record.commandId)
      return deny('SPLIT_READ_RECEIPT_SCOPE_CHANGED');
    let job;
    try{job=getOriginalJob(record.id);}catch{return deny('SPLIT_READ_JOB_UNAVAILABLE')}
    if(!plain(job)||job.id!==record.id||job.type!==record.type||!comfortAuthority(job)||
       job.targetDeviceId!==deviceId||job.secureSessionId!==sessionId||
       job.commandId!==commandId||job.taskDigest!==record.taskDigest)
      return deny('SPLIT_READ_ORIGINAL_JOB_CHANGED');
    if(['queued','in_progress'].includes(job.status))
      return deny('SPLIT_READ_STILL_PENDING',{jobStatus:job.status,
        receiptRef,expiresAt:record.expiresAt});
    if(job.status!=='complete')
      return deny('SPLIT_READ_TERMINAL_UNCONFIRMED',{jobStatus:job.status||'unknown'});
    if(!plain(job.result)||job.result.ok!==true)
      return deny('SPLIT_READ_DEVICE_REPORTED_FAILURE');
    let proof=false;
    try{proof=verifySplitProof(job.result)===true}catch{proof=false}
    if(!proof)return deny('SPLIT_READ_SCREEN_PROOF_INVALID');
    return {...job.result,jobDigest:sha(job.id),taskDigest:record.taskDigest,
      receiptRecovered:true,readOnly:true,automaticReplay:false,newJobCreated:false};
  }
  return Object.freeze({issue,read});
}
