/** JH167 V4: original Secure56 Stage4 signed Gemini LEFT-window owner port.
 * Uses the real Stage4 host's authenticated snapshot/binding, never a Gemini
 * text claim, caller-provided "verified" flag or a second Android executor.
 * READ_ONLY owner identity: not draft/account proof, consent or task success.
 */
const failure=code=>Object.freeze({ok:false,code,automaticReplay:false,automaticResume:false});
const P='com.google.android.googlequicksearchbox';
export function createV4GeminiSignedOwnerPort({androidHost,clock=Date.now}={}){
 for(const name of ['capture','nativeOwnerEvidence','verifyNativeOwnerEvidence','capabilities']){
  if(typeof androidHost?.[name]!=='function')throw Error('ORIGINAL_STAGE4_SECURE56_SIGNED_OWNER_REQUIRED');
 }
 if(typeof clock!=='function')throw Error('CLOCK_REQUIRED');
 const valid=(p)=>!!p&&p.backend==='JH_ANDROID_NATIVE'&&p.current===true&&p.secure56===true&&
  p.workSide==='RIGHT'&&p.chatSide==='LEFT'&&p.workPackage===P&&
  p.nativeGeminiWindowVerified===true&&
  p.geminiSurfaceVerified===false&&p.geminiAccountVerified===false&&
  typeof p.commandId==='string'&&/^[a-f0-9]{32}$/.test(p.commandId)&&
  Number.isSafeInteger(p.workWindowId)&&Number.isSafeInteger(p.chatWindowId)&&
  p.workWindowId!==p.chatWindowId&&Number.isSafeInteger(p.observedAt)&&
  p.observedAt<=clock()&&clock()-p.observedAt<=10000;
 function capabilities(){
  const c=androidHost.capabilities();
  return Object.freeze({singleOriginalSecure56:true,
   ready:c?.hostLocalOnly===true&&c?.existingSecure56Required===true&&
    c?.playwrightUsed===false&&c?.layoutMode==='LEFT_GPT_RIGHT_NATIVE_GEMINI'&&
    c?.workPaneSide==='RIGHT',
   geminiNativeOwnerOnly:true,geminiSubmitPermitted:false,
   automaticReplay:false,automaticResume:false});
 }
 function read(){
  if(!capabilities().ready)return null;
  const evidence=androidHost.nativeOwnerEvidence();
  return valid(evidence)&&androidHost.verifyNativeOwnerEvidence(evidence)===true
    ?evidence:null;
 }
 function verify(owner,commandId){
  if(!capabilities().ready||!valid(owner)||owner.commandId!==commandId)return false;
  return androidHost.verifyNativeOwnerEvidence(owner)===true;
 }
 async function refresh(){
  if(!capabilities().ready)return failure('ORIGINAL_GEMINI_SIGNED_HOST_DISABLED');
  // Only one signed agent_snapshot. Does not click, type, send or restart work.
  let r;try{r=await androidHost.capture()}catch{return failure('SIGNED_GEMINI_SNAPSHOT_NOT_CONFIRMED')}
  if(r?.ok!==true||r.code!=='SIGNED_LEFT_GPT_RIGHT_NATIVE_GEMINI_OBSERVED')
   return failure(r?.code||'SIGNED_GEMINI_SNAPSHOT_NOT_CONFIRMED');
  const o=read();
  if(!o)return failure('CURRENT_GEMINI_LEFT_GPT_RIGHT_OWNER_UNVERIFIED');
  return Object.freeze({ok:true,code:'ORIGINAL_SIGNED_GEMINI_WINDOW_CAPTURED',
   commandId:o.commandId,workSide:'RIGHT',chatSide:'LEFT',workPackage:o.workPackage,
   nativeGeminiWindowVerified:true,geminiDraftVerified:false,
   geminiAccountVerified:false,automaticReplay:false,automaticResume:false});
 }
 return Object.freeze({read,verify,refresh,capabilities});
}
