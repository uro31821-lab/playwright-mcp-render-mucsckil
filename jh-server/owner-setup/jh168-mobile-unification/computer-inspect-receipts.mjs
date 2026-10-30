/** JH168 read-only receipt for an existing Secure56 Computer Use INSPECT.
 * Never issues Android jobs, leases, approvals, screenshots or grants.
 * The only capability returned is readback of the ORIGINAL authenticated job.
 */
import {createHash,randomBytes} from 'node:crypto';
const H32=/^[a-f0-9]{32}$/,H64=/^[a-f0-9]{64}$/;
const REF=/^cir_[A-Za-z0-9_-]{43}$/;
const hex=v=>typeof v==='string'&&H64.test(v);
const same=v=>typeof v==='string'&&H32.test(v);
const obj=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const hash=x=>createHash('sha256').update(x).digest('hex');
const denied=code=>Object.freeze({ok:false,code,lookupOnly:true,
  automaticReplay:false,newJobCreated:false});
export function createComputerInspectReceiptRegistry56({
  now=Date.now,newToken=()=>randomBytes(32).toString('base64url'),
  maxEntries=96
}={}){
  if(typeof now!=='function'||typeof newToken!=='function'||
    !Number.isSafeInteger(maxEntries)||maxEntries<1||maxEntries>128)
    throw Error('COMPUTER_INSPECT_REGISTRY_INPUT_INVALID');
  const refs=new Map();
  function expire(){
    const t=now();
    for(const [key,entry] of refs)if(t>=entry.expiresAtMs)refs.delete(key);
  }
  function issue({job,deviceId,deviceDigest,sessionId,commandId,
                  taskDigest,runDigest=''}={}){
    expire();
    if(!obj(job)||job.type!=='computer_use_inspect'||
      job.mcpToolName!=='life_android_computer_inspect'||
      job.secureRequestedEffect!=='READ_ONLY'||
      !['queued','in_progress'].includes(job.status)||
      !/^job_[0-9]+$/.test(job.id||'')||
      typeof deviceId!=='string'||!deviceId||
      typeof sessionId!=='string'||!sessionId||
      !same(commandId)||!hex(deviceDigest)||!hex(taskDigest)||
      (runDigest!==''&&!hex(runDigest))||
      job.targetDeviceId!==deviceId||job.targetDeviceDigest!==deviceDigest||
      job.secureSessionId!==sessionId||job.commandId!==commandId||
      job.taskDigest!==taskDigest||String(job.runDigest||'')!==runDigest||
      !Number.isSafeInteger(job.expiresAtMs)||job.expiresAtMs<=now()||
      refs.size>=maxEntries)return null;
    const token='cir_'+newToken();
    if(!REF.test(token)||refs.has(hash(token)))return null;
    const expiresAtMs=Math.min(job.expiresAtMs,now()+60000);
    refs.set(hash(token),Object.freeze({
      jobId:job.id,deviceId,deviceDigest,sessionId,commandId,
      taskDigest,runDigest,expiresAtMs
    }));
    return Object.freeze({receiptToken:token,receiptExpiresAtMs:expiresAtMs,
      readOnly:true,automaticReplay:false});
  }
  function read({receiptToken,deviceId,deviceDigest,sessionId,commandId,
                 taskDigest,runDigest=''}={},getOriginalJob){
    expire();
    if(!REF.test(receiptToken||'')||typeof getOriginalJob!=='function')
      return denied('COMPUTER_INSPECT_RECEIPT_UNAVAILABLE');
    const record=refs.get(hash(receiptToken));
    if(!record||record.deviceId!==deviceId||
      record.deviceDigest!==deviceDigest||record.sessionId!==sessionId||
      record.commandId!==commandId||record.taskDigest!==taskDigest||
      record.runDigest!==runDigest)
      return denied('COMPUTER_INSPECT_RECEIPT_SCOPE_CHANGED');
    let job;try{job=getOriginalJob(record.jobId)}catch{
      return denied('COMPUTER_INSPECT_ORIGINAL_JOB_UNAVAILABLE');
    }
    if(!obj(job)||job.id!==record.jobId||
      job.type!=='computer_use_inspect'||
      job.mcpToolName!=='life_android_computer_inspect'||
      job.secureRequestedEffect!=='READ_ONLY'||
      job.targetDeviceId!==deviceId||job.targetDeviceDigest!==deviceDigest||
      job.secureSessionId!==sessionId||job.commandId!==commandId||
      job.taskDigest!==taskDigest||String(job.runDigest||'')!==runDigest)
      return denied('COMPUTER_INSPECT_ORIGINAL_JOB_CHANGED');
    // 'ok' means only that the original job was found. It says nothing about
    // Android execution success. The caller must inspect job.status/result.
    return Object.freeze({ok:true,job,lookupOnly:true,readOnly:true,
      newJobCreated:false,automaticReplay:false,
      receiptExpiresAtMs:record.expiresAtMs});
  }
  return Object.freeze({issue,read});
}
