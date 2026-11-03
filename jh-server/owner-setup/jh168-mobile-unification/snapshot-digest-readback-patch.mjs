/** Reversible source patch: durable readback for life_android_snapshot using its existing idDigest.
 * The digest lookup is same-device + same Secure56 session + same command only.
 * No new tool, no Android dispatch, no retry, no approval change.
 */
const IMPORT='import {resolveSnapshotDigestReadback56} from "../jh168-mobile-unification/snapshot-digest-readback.mjs";\n';
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
    const j=mk("agent_snapshot",{mcpToolName:"life_android_snapshot",
      secureRequestedEffect:"READ_ONLY",commandId,targetDeviceDigest:meta.deviceDigest},device);
    return jobResult(await waitJob(j));
  });`;
const STATUS_OLD=`  registerOAuthTool("life_job_status",{
    title:"Android job status",
    description:"Read a queued Android job result.",
    inputSchema:{job_id:z.string()}
  },async({job_id})=>jobResult(jobs.get(job_id)));`;
const STATUS_NEW=`  registerOAuthTool("life_job_status",{
    title:"Android job status",
    description:"Read a queued Android job result.",
    inputSchema:{job_id:z.string()}
  },async({job_id})=>{
    const digest=String(job_id||"");
    if(/^[a-f0-9]{64}$/.test(digest)){
      const device=chooseDevice(),auth=device&&active56(device),meta=device?devices.get(device):null;
      if(!device||!auth||!meta||meta.secureBridgeVersion!==56)
        return textResult({ok:false,code:"secure_bridge_device_not_active",automaticReplay:false});
      const commandId=jhRequireCommand56(device);
      const read=resolveSnapshotDigestReadback56({jobDigest:digest,deviceId:device,
        deviceDigest:meta.deviceDigest,sessionId:auth.sessionId,commandId},jobs.values());
      if(read.ok!==true)return textResult(read);
      return textResult({...safeJobView56(read.job),lookupOnly:true,readOnly:true,
        newJobCreated:false,automaticReplay:false});
    }
    return jobResult(jobs.get(job_id));
  });`;
const PAIRS=[[SNAP_OLD,SNAP_NEW],[STATUS_OLD,STATUS_NEW]];
export function applySnapshotDigestReadbackPatch56(source){
  if(typeof source!=='string'||source.startsWith(IMPORT)||
     !source.includes('jhRequireCommand56(')||!source.includes('safeJobView56(')||
     !source.includes('function signJob56('))
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
