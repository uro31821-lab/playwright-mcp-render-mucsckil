/**
 * Review-only insertion into the ACTUAL assembled JH167 owner runtime.
 * Never replaces server-integration source, adds a public MCP tool,
 * starts a listener, changes Android grants or changes the live entrypoint.
 */
const HEADER="import {createAndroidDirectSecure56Host as jhMakeAndroidDirectHost56} from '../android-direct/host-port.mjs';\n";
const ANCHOR='function createMcp(){';
const HELPER=String.raw
/**
 * This function exists only in a generated, test-only runtime candidate.
 * It is not called during import, host bootstrap or normal MCP operation.
 */
export function jhCreateAndroidDirectReviewCandidate56(){
 if(process.env.JH_ANDROID_DIRECT_CANDIDATE!=='CI_SYNTHETIC_ONLY' ||
    process.env.JH_OWNER_DEFER_LISTEN!=='1' ||
    process.env.NODE_ENV!=='test' ||
    process.env.RENDER_SERVICE_ID!==undefined ||
    httpServer.listening)throw Error('JH_ANDROID_DIRECT_CANDIDATE_NOT_AUTHORIZED');
 return jhMakeAndroidDirectHost56({
   enabled:true,
   selectDevice:()=>chooseDevice(),
   deviceMeta:d=>devices.get(d),
   activeSession:d=>active56(d),
   requireCommand:d=>jhRequireCommand56(d),
   makeSnapshotJob:d=>mk('agent_snapshot',{},d),
   exactEnvelope:(tool,type,effect,args,extra)=>exactEnvelope56(tool,type,effect,args,extra),
   waitJob:(job,ms)=>waitJob(job,ms),
   getJob:id=>jobs.get(id),
   durableReady:()=>!!durableNativeHooks56 &&
     typeof durableNativeHooks56.uncertainEffectsForMaintenance==='function' &&
     durableNativeHooks56.uncertainEffectsForMaintenance()!==null
 });
}
;
const requireOnce=(s,x)=>{if(s.split(x).length!==2)throw Error('ANDROID_HOST_EXACT_SOURCE_ANCHOR');};
export function patchJH167AndroidDirectReview56(input){
 if(typeof input!=='string'||input.includes('jhCreateAndroidDirectReviewCandidate56')||
    input.includes(HEADER))throw Error('ANDROID_DIRECT_ALREADY_PRESENT_OR_INVALID');
 for(const x of [
   ANCHOR,
   'function mk(type,p={},deviceId=null) {',
   'function exactEnvelope56(',
   'function active56(deviceId)',
   'function jhRequireCommand56(device,workflowId=null){',
   'const jhInspectSplitEvidence155=',
   'const SECURE56_TOOL_CATALOG_DIGEST=',
   'let durableNativeHooks56=null;'
 ]) requireOnce(input,x);
 if(!input.startsWith('import ')||
    !input.includes('jhV2JobAdmission56();')||
    !input.includes('durableNativeHooks56?.beforeDispatch(')||
    !input.includes('durableNativeHooks56?.acceptedCompletion('))
   throw Error('ANDROID_DIRECT_DURABLE_SECURE56_GUARDS_NOT_FOUND');
 const output=HEADER+input.replace(ANCHOR,HELPER+'\n'+ANCHOR);
 if(!output.startsWith(HEADER)||output.slice(HEADER.length)
   .replace(HELPER+'\n'+ANCHOR,ANCHOR)!==input)
   throw Error('ANDROID_DIRECT_REVIEW_PATCH_SCOPE_CHANGED');
 return output;
}
