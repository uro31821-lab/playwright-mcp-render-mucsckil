/** CI-only composition against ACTUAL generated JH167 Secure56 owner.
 * Does not register an MCP tool, open a listener, create credentials,
 * send a Gemini message, or modify the live server.
 */
const IMPORT="import {createV4GeminiSignedOwnerPort as jhMakeV4RightGeminiOwner56} from '../android-direct/gemini-v4-owner-port.mjs';\n";
const ANCHOR='function createMcp(){';
const SHARED=`
/** V4 actual original Secure56 binding review only (LEFT GPT / RIGHT Gemini).
 * A fresh app snapshot is issued only by explicit CI calls to .refresh().
 * No production credentials/keystore/signature data leave the owner process.
 */
export function jhCreateV4GeminiRightOriginalReview56(){
 if(process.env.CI!=='true'||
    process.env.NODE_ENV!=='test'||
    process.env.JH_OWNER_DEFER_LISTEN!=='1'||
    process.env.JH_ANDROID_DIRECT_CANDIDATE!=='CI_SYNTHETIC_ONLY'||
    process.env.JH_ANDROID_V4_GEMINI_CI_ONLY!=='1'||
    process.env.RENDER_SERVICE_ID!==undefined||
    httpServer.listening)
   throw Error('JH_V4_ORIGINAL_OWNER_CI_ONLY_REQUIRED');
 const host=jhMakeAndroidDirectHost56({
   enabled:true,layoutMode:'LEFT_GPT_RIGHT_NATIVE_GEMINI',
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
 const port=jhMakeV4RightGeminiOwner56({androidHost:host});
 const cap=port.capabilities();
 if(cap?.ready!==true||cap.geminiSubmitPermitted!==false||
    cap.geminiNativeOwnerOnly!==true)
   throw Error('JH_V4_SIGNED_OWNER_SCOPE_INVALID');
 return Object.freeze({
   refresh:()=>port.refresh(),
   read:()=>port.read(),
   verify:(owner,commandId)=>port.verify(owner,commandId),
   capabilities:()=>Object.freeze({...port.capabilities(),
     originalOwnerFunctionBinding:true,
     currentPhoneSignedReadbackRequired:true,
     phoneLocalSendApprovalImplemented:false,
     geminiHostLifecycleAttached:false,
     originalDurableClaimPortAttached:false,
     liveServerRegistered:false})
 });
}
`;
const once=(s,needle,error)=>{if(s.split(needle).length!==2)throw Error(error)};
export function patchJH167V4GeminiRightOwnerReview56(input){
 if(typeof input!=='string'||input.includes('jhCreateV4GeminiRightOriginalReview56')||
    input.includes(IMPORT)||!input.startsWith('import '))
  throw Error('V4_OWNER_ALREADY_PATCHED_OR_INVALID');
 for(const x of [ANCHOR,
 'function jhCreateAndroidDirectReviewCandidate56()',
 'function jhCreateUnifiedAndroidReviewCandidate56()',
 'function mk(type,p={},deviceId=null) {',
 'function active56(deviceId)',
 'function jhRequireCommand56(device,workflowId=null){',
 'let durableNativeHooks56=null;',
 'const SECURE56_TOOL_CATALOG_DIGEST=',
 'durableNativeHooks56?.beforeDispatch(',
 'durableNativeHooks56?.acceptedCompletion('])once(input,x,'V4_ORIGINAL_OWNER_SOURCE_SCOPE_CHANGED');
 const output=IMPORT+input.replace(ANCHOR,SHARED+'\n'+ANCHOR);
 if(!output.startsWith(IMPORT)||
   output.slice(IMPORT.length).replace(SHARED+'\n'+ANCHOR,ANCHOR)!==input)
  throw Error('V4_ORIGINAL_OWNER_REVERSE_PATCH_FAILED');
 return output;
}
