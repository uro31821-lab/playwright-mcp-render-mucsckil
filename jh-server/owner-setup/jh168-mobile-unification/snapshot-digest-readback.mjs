/** Process-local read-only registry for ORIGINAL signed agent_snapshot jobs.
 * Keeps Android snapshot payload byte-compatible: command binding lives only on server.
 * No job creation, dispatch, approval, retry, lease creation, or raw job id output.
 */
import {createHash} from 'node:crypto';
const H32=/^[a-f0-9]{32}$/;
const H64=/^[a-f0-9]{64}$/;
const JOB=/^job_[0-9]+$/;
const sha=x=>createHash('sha256').update(String(x)).digest('hex');
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const deny=code=>Object.freeze({ok:false,code,lookupOnly:true,readOnly:true,
  newJobCreated:false,automaticReplay:false});

export function createSnapshotDigestReadbackRegistry56({now=Date.now,maxEntries=96,ttlMs=60000}={}){
 if(typeof now!=='function'||!Number.isSafeInteger(maxEntries)||maxEntries<1||maxEntries>128||
    !Number.isSafeInteger(ttlMs)||ttlMs<3000||ttlMs>120000)
   throw Error('SNAPSHOT_READBACK_CONFIG_INVALID');
 const records=new Map();
 const clean=()=>{for(const [k,v] of records)if(now()>=v.expiresAtMs)records.delete(k);};
 function issue({job,deviceId,deviceDigest,sessionId,commandId}={}){
   clean();
   if(!obj(job)||job.type!=='agent_snapshot'||!['queued','in_progress'].includes(job.status)||
      !JOB.test(job.id||'')||typeof deviceId!=='string'||!deviceId||
      !H64.test(deviceDigest||'')||typeof sessionId!=='string'||!sessionId||
      !H32.test(commandId||'')||job.targetDeviceId!==deviceId||
      job.secureSessionId!==sessionId||!H64.test(job.secureMac||'')||
      !H64.test(job.securePayloadDigest||'')||
      !Number.isSafeInteger(job.createdAtMs)||!Number.isSafeInteger(job.expiresAtMs)||
      !Number.isSafeInteger(job.secureExpiresAt)||records.size>=maxEntries)return null;
   const jobDigest=sha(job.id),existing=records.get(jobDigest);
   if(existing){
     if(existing.deviceId!==deviceId||existing.deviceDigest!==deviceDigest||
        existing.sessionId!==sessionId||existing.commandId!==commandId)return null;
     return Object.freeze({jobDigest,expiresAtMs:existing.expiresAtMs,readOnly:true,
       newJobCreated:false,automaticReplay:false});
   }
   const expiresAtMs=Math.min(job.expiresAtMs,now()+ttlMs);
   if(expiresAtMs-now()<3000)return null;
   records.set(jobDigest,Object.freeze({jobId:job.id,deviceId,deviceDigest,sessionId,commandId,
     createdAtMs:job.createdAtMs,jobExpiresAtMs:job.expiresAtMs,secureExpiresAt:job.secureExpiresAt,
     macDigest:sha(job.secureMac),payloadDigest:job.securePayloadDigest,expiresAtMs}));
   return Object.freeze({jobDigest,expiresAtMs,readOnly:true,newJobCreated:false,automaticReplay:false});
 }
 function read({jobDigest,deviceId,deviceDigest,sessionId,commandId}={},getOriginalJob){
   clean();
   if(!H64.test(jobDigest||'')||typeof getOriginalJob!=='function')
     return deny('SNAPSHOT_READBACK_ARGUMENTS_INVALID');
   const row=records.get(jobDigest);
   if(!row)return deny('SNAPSHOT_READBACK_UNAVAILABLE');
   if(row.deviceId!==deviceId||row.deviceDigest!==deviceDigest||
      row.sessionId!==sessionId||row.commandId!==commandId)
     return deny('SNAPSHOT_READBACK_SCOPE_CHANGED');
   let job;try{job=getOriginalJob(row.jobId)}catch{return deny('SNAPSHOT_READBACK_JOB_UNAVAILABLE');}
   const identityOk=obj(job)&&job.id===row.jobId&&job.type==='agent_snapshot'&&
      job.targetDeviceId===row.deviceId&&job.secureSessionId===row.sessionId&&
      job.createdAtMs===row.createdAtMs&&job.expiresAtMs===row.jobExpiresAtMs&&
      job.secureExpiresAt===row.secureExpiresAt;
   const signedStillPresent=identityOk&&H64.test(job.secureMac||'')&&
      H64.test(job.securePayloadDigest||'')&&sha(job.secureMac)===row.macDigest&&
      job.securePayloadDigest===row.payloadDigest;
   const completedRedacted=identityOk&&job.status==='complete'&&
      typeof job.completedAt==='string'&&!Number.isNaN(Date.parse(job.completedAt))&&
      !Object.hasOwn(job,'secureMac')&&!Object.hasOwn(job,'securePayloadDigest');
   if(!identityOk||(!signedStillPresent&&!completedRedacted))
     return deny('SNAPSHOT_READBACK_ORIGINAL_JOB_CHANGED');
   return Object.freeze({ok:true,code:'SNAPSHOT_READBACK_FOUND',job,lookupOnly:true,
     readOnly:true,newJobCreated:false,automaticReplay:false});
 }
 return Object.freeze({issue,read});
}
