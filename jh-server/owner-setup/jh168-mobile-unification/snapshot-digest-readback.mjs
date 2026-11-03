/** Read-only recovery for an ORIGINAL signed agent_snapshot by opaque idDigest.
 * No job creation, Android dispatch, approval, retry, lease creation, or raw job id output.
 */
import {createHash} from 'node:crypto';
const H32=/^[a-f0-9]{32}$/;
const H64=/^[a-f0-9]{64}$/;
const JOB=/^job_[0-9]+$/;
const sha=x=>createHash('sha256').update(String(x)).digest('hex');
const fail=code=>Object.freeze({ok:false,code,lookupOnly:true,readOnly:true,newJobCreated:false,automaticReplay:false});

export function resolveSnapshotDigestReadback56({
  jobDigest,deviceId,deviceDigest,sessionId,commandId
}={},jobsIterable){
  if(!H64.test(jobDigest||'')||typeof deviceId!=='string'||!deviceId||
     !H64.test(deviceDigest||'')||typeof sessionId!=='string'||!sessionId||
     !H32.test(commandId||'')||!jobsIterable||typeof jobsIterable[Symbol.iterator]!=='function')
    return fail('SNAPSHOT_READBACK_ARGUMENTS_INVALID');
  let found=null;
  for(const job of jobsIterable){
    if(!job||typeof job!=='object'||!JOB.test(job.id||''))continue;
    if(sha(job.id)!==jobDigest)continue;
    if(found)return fail('SNAPSHOT_READBACK_DIGEST_COLLISION');
    found=job;
  }
  if(!found)return fail('SNAPSHOT_READBACK_UNAVAILABLE');
  if(found.type!=='agent_snapshot'||
     found.mcpToolName!=='life_android_snapshot'||
     found.secureRequestedEffect!=='READ_ONLY'||
     found.targetDeviceId!==deviceId||
     found.targetDeviceDigest!==deviceDigest||
     found.secureSessionId!==sessionId||
     found.commandId!==commandId||
     !H64.test(found.secureMac||'')||
     !H64.test(found.securePayloadDigest||''))
    return fail('SNAPSHOT_READBACK_SCOPE_CHANGED');
  return Object.freeze({ok:true,code:'SNAPSHOT_READBACK_FOUND',job:found,
    lookupOnly:true,readOnly:true,newJobCreated:false,automaticReplay:false});
}
