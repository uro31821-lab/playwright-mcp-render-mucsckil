/** Reversible source patch: readback for life_android_snapshot using existing idDigest.
 * Snapshot payload sent to Android is unchanged. Server registry binds digest to the current
 * device/session/command and life_job_status only reads the ORIGINAL job.
 */
const IMPORT='import {createSnapshotDigestReadbackRegistry56} from "../jh168-mobile-unification/snapshot-digest-readback.mjs";\n';
const STATE_OLD='const computerExecutionReceipts56=createComputerExecutionReceiptRegistry56();';
const STATE_NEW=STATE_OLD+'\nconst snapshotDigestReadbacks56=createSnapshotDigestReadbackRegistry56();';
const SNAP_OLD=`  registerOAuthTool("life_android_snapshot",{
    title:"Read Android UI",
    description:"Read Android accessibility UI for native-app-only workflows.",
    inputSchema:{}
  },async()=>{
    const j=mk("agent_snapshot");
    return jobResult(await waitJob(j));
  });`;
const SNAP_NEW=`  registerOAuthTool("life_android_snapshot",{
    title:"Read Android UI",
    description:"Read Android accessibility UI for native-app-only workflows.",
    inputSchema:{}
  },async()=>{
    const device=chooseDevice(),auth=device&&active56(device),meta=device?devices.get(device):null;
    if(!device||!auth||!meta||meta.secureBridgeVersion!==56)
      return textResult({ok:false,code:"secure_bridge_device_not_active",automaticReplay:false});
    const commandId=jhRequireCommand56(device);
    recentJobs.delete(device+"|agent_snapshot|{}");
    const j=mk("agent_snapshot",{},device);
    snapshotDigestReadbacks56.issue({job:j,deviceId:device,deviceDigest:meta.deviceDigest,
      sessionId:auth.sessionId,commandId});
    return jobResult(await waitJob(j));
  });`;
const STATUS_OLD=`  registerOAuthTool("life_job_status",{
    title:"Android job status",
    description:"Read the existing Android job only. For an OPEN_COMPLETION_PENDING result, reuse the same job_id and command_id here; never BEGIN_COMMAND or reopen the app. Waits up to 10 seconds for that open job receipt. Missing receipt is not execution failure.",
    inputSchema:{job_id:z.string()}
  },async({job_id})=>{
    cleanupJobs();const job=jobs.get(job_id);
    if(job?.type!=="open_url")return jobResult(job);
    const completion=await jhOpenCompletion56(job,jhOpenStatusWait56);
    return textResult({jobId:job_id,...completion});
  });`;
const STATUS_NEW=`  registerOAuthTool("life_job_status",{
    title:"Android job status",
    description:"Read the existing Android job only. For an OPEN_COMPLETION_PENDING result, reuse the same job_id and command_id here; never BEGIN_COMMAND or reopen the app. Waits up to 10 seconds for that open job receipt. Missing receipt is not execution failure.",
    inputSchema:{job_id:z.string()}
  },async({job_id})=>{
    const digest=String(job_id||"");
    if(/^[a-f0-9]{64}$/.test(digest)){
      const device=chooseDevice(),auth=device&&active56(device),meta=device?devices.get(device):null;
      if(!device||!auth||!meta||meta.secureBridgeVersion!==56)
        return textResult({ok:false,code:"secure_bridge_device_not_active",automaticReplay:false});
      const commandId=jhRequireCommand56(device);
      const read=snapshotDigestReadbacks56.read({jobDigest:digest,deviceId:device,
        deviceDigest:meta.deviceDigest,sessionId:auth.sessionId,commandId},id=>jobs.get(id));
      if(read.ok!==true)return textResult(read);
      return textResult({...safeJobView56(read.job),lookupOnly:true,readOnly:true,
        newJobCreated:false,automaticReplay:false});
    }
    cleanupJobs();const job=jobs.get(job_id);
    if(job?.type!=="open_url")return jobResult(job);
    const completion=await jhOpenCompletion56(job,jhOpenStatusWait56);
    return textResult({jobId:job_id,...completion});
  });`;
const PAIRS=[[STATE_OLD,STATE_NEW],[SNAP_OLD,SNAP_NEW],[STATUS_OLD,STATUS_NEW]];
export function applySnapshotDigestReadbackPatch56(source){
  if(typeof source!=='string'||source.startsWith(IMPORT)||
     !source.includes('jhRequireCommand56(')||!source.includes('safeJobView56(')||
     !source.includes('function signJob56(')||!source.includes(STATE_OLD))
    throw Error('SNAPSHOT_READBACK_ORIGINAL_SECURE56_REQUIRED');
  let out=source;
  for(const [before,after] of PAIRS){
    if(out.split(before).length!==2||out.includes(after))
      throw Error('SNAPSHOT_READBACK_ANCHOR_DRIFT');
    out=out.replace(before,after);
  }
  out=IMPORT+out;
  if(reverseSnapshotDigestReadbackPatch56(out)!==source)
    throw Error('SNAPSHOT_READBACK_NOT_REVERSIBLE');
  return out;
}
export function reverseSnapshotDigestReadbackPatch56(source){
  if(typeof source!=='string'||!source.startsWith(IMPORT))
    throw Error('SNAPSHOT_READBACK_PREFIX_MISSING');
  let out=source.slice(IMPORT.length);
  for(const [before,after] of PAIRS.slice().reverse()){
    if(out.split(after).length!==2)throw Error('SNAPSHOT_READBACK_REVERSE_ANCHOR');
    out=out.replace(after,before);
  }
  return out;
}
