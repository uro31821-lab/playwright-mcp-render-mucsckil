/** Builds a non-production variant of the existing authenticated native handler.
 * No new MCP tool, login scope, HTTP endpoint, approval bypass, or deployed startup.
 * New optional fields opt into native open-and-return; old calls retain exact code.
 */
import path from 'node:path';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildNativeQueueTruthCandidate} from './native-queue-truth-candidate.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const PREFIX='import {createVerifiedNativeRoundtrip} from "../deployment/verified-native-roundtrip.mjs";\n';
const HOOK='const browserEventTransport=withBrowserEvents(browserTransport);';
const HOST=`const verifiedNativeRoundtrip56=createVerifiedNativeRoundtrip({
 selectContext(){
  const d=chooseDevice(),m=d?devices.get(d):null,s=d?active56(d):null;
  if(!d||!s||m?.secureBridgeVersion!==56||Date.now()-(m.lastSeen||0)>90000)return null;
  return {deviceId:d,sessionId:s.sessionId};
 },
 requestJob(type,payload,deviceId){const before=seq;const job=mk(type,payload,deviceId);return {job,isNew:seq>before};},
 waitJob,
 jobView(job){return JSON.parse(jobResult(job).content[0].text);},
 cancelQueued(job,context){
  if(jobs.get(job.id)!==job||job.status!=="queued"||job.targetDeviceId!==context.deviceId||job.secureSessionId!==context.sessionId)return false;
  job.status="error";job.error="ORCHESTRATOR_STOPPED_BEFORE_DISPATCH";job.completedAt=new Date().toISOString();
  const q=queues.get(context.deviceId)||[];queues.set(context.deviceId,q.filter(id=>id!==job.id));return true;
 }
});
export function stopVerifiedNativeRoundtrip56(workflowId){return verifiedNativeRoundtrip56.stop(workflowId);}
`;
function once(source,before,after){
 if(source.split(before).length!==2||source.includes(after))throw Error('ROUNDTRIP_PATCH_ANCHOR');
 return source.replace(before,after);
}
export function buildVerifiedRoundtripRuntime(root){
 const parent=buildNativeQueueTruthCandidate(root),original=readFileSync(parent.file,'utf8');
 if(parent.productionEnabled!==false||sha(original)!==parent.candidateSha256)throw Error('ROUNDTRIP_PARENT_IDENTITY');
 const start=original.indexOf('  registerOAuthTool("life_android_open_and_snapshot",{');
 const end=original.indexOf('  registerOAuthTool("life_android_step_and_snapshot",{',start);
 if(start<0||end<=start)throw Error('ROUNDTRIP_HANDLER_MISSING');
 const block=original.slice(start,end);
 const schema='inputSchema:{target:z.string(),url:z.string().optional()}';
 const newSchema='inputSchema:{target:z.string(),url:z.string().optional(),workflow_id:z.string().optional(),return_to_origin:z.boolean().optional()}';
 const handler='},async({target,url})=>{';
 const newHandler='},async({target,url,workflow_id,return_to_origin})=>{\n    if(return_to_origin===true)return textResult(await verifiedNativeRoundtrip56.run({workflowId:workflow_id,target,url,explicitReturn:true}));';
 const revised=once(once(block,schema,newSchema),handler,newHandler);
 let candidate=once(original,block,revised);
 candidate=once(candidate,HOOK,HOST+HOOK);
 candidate=PREFIX+candidate;
 const reversed=candidate.slice(PREFIX.length).replace(HOST+HOOK,HOOK).replace(revised,block);
 if(reversed!==original)throw Error('ROUNDTRIP_PATCH_SCOPE');
 const file=path.join(root,'server-integration/server-verified-roundtrip-candidate.mjs');
 writeFileSync(file,candidate,{mode:0o600});
 if(readFileSync(file,'utf8')!==candidate)throw Error('ROUNDTRIP_BUILD_READBACK');
 return Object.freeze({file,parentSha256:parent.candidateSha256,candidateSha256:sha(candidate),productionEnabled:false,
  integration:'existing life_android_open_and_snapshot handler, opt-in return_to_origin',newMcpTools:0});
}
