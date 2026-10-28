/**
 * Review-only insertion into the ACTUAL assembled JH167 owner runtime.
 * Never replaces server-integration source, adds a public MCP tool,
 * starts a listener, changes Android grants or changes the live entrypoint.
 */
const HEADER="import {createAndroidDirectSecure56Host as jhMakeAndroidDirectHost56} from '../android-direct/host-port.mjs';\n";
const ANCHOR='function createMcp(){';
const HELPER="/**\n * This function exists only in a generated, test-only runtime candidate.\n * It is not called during import, host bootstrap or normal MCP operation.\n */\nexport function jhCreateAndroidDirectReviewCandidate56(){\n if(process.env.JH_ANDROID_DIRECT_CANDIDATE!=='CI_SYNTHETIC_ONLY' ||\n    process.env.JH_OWNER_DEFER_LISTEN!=='1' ||\n    process.env.NODE_ENV!=='test' ||\n    process.env.RENDER_SERVICE_ID!==undefined ||\n    httpServer.listening)throw Error('JH_ANDROID_DIRECT_CANDIDATE_NOT_AUTHORIZED');\n return jhMakeAndroidDirectHost56({\n   enabled:true,\n   selectDevice:()=>chooseDevice(),\n   deviceMeta:d=>devices.get(d),\n   activeSession:d=>active56(d),\n   requireCommand:d=>jhRequireCommand56(d),\n   makeSnapshotJob:d=>mk('agent_snapshot',{},d),\n   exactEnvelope:(tool,type,effect,args,extra)=>exactEnvelope56(tool,type,effect,args,extra),\n   waitJob:(job,ms)=>waitJob(job,ms),\n   getJob:id=>jobs.get(id),\n   durableReady:()=>!!durableNativeHooks56 &&\n     typeof durableNativeHooks56.uncertainEffectsForMaintenance==='function' &&\n     durableNativeHooks56.uncertainEffectsForMaintenance()!==null\n });\n}";
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
