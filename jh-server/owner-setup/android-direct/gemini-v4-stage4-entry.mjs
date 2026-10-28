/** V4 first: one route over the EXISTING Stage4 Android engine and the
 * V4 Gemini native driver. Candidate only; no production startup registers it.
 * The original Secure56 host MUST independently authenticate every callback.
 */
const MODES=new Set(['GEMINI_START','GEMINI_STEP','GEMINI_STATUS','GEMINI_CANCEL']);
const ID=/^[A-Za-z0-9_-]{8,80}$/, HEX32=/^[a-f0-9]{32}$/, HEX64=/^[a-f0-9]{64}$/;
const no=(code,extra={})=>Object.freeze({ok:false,code,automaticReplay:false,automaticResume:false,...extra});
const same=(a,b)=>!!a&&!!b&&['deviceId','sessionId','commandId','workWindowId','chatWindowId','workSide','chatSide'].every(k=>a[k]===b[k]);
const plain=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
function ownerOk(o,commandId,now){
 return plain(o)&&o.current===true&&o.secure56===true&&o.backend==='JH_ANDROID_NATIVE'&&
  o.workSide==='RIGHT'&&o.chatSide==='LEFT'&&HEX32.test(o.commandId??'')&&o.commandId===commandId&&
  typeof o.deviceId==='string'&&o.deviceId.length>0&&o.deviceId.length<=200&&
  typeof o.sessionId==='string'&&o.sessionId.length>0&&o.sessionId.length<=200&&
  Number.isSafeInteger(o.workWindowId)&&Number.isSafeInteger(o.chatWindowId)&&
  o.workWindowId>=0&&o.chatWindowId>=0&&o.workWindowId!==o.chatWindowId&&
  Number.isSafeInteger(o.observedAt)&&o.observedAt<=now&&now-o.observedAt<=15000;
}
function storedOk(s,id,o){
 return plain(s)&&s.schema===4&&s.id===id&&s.commandId===o.commandId&&
  s.backend==='JH_ANDROID_NATIVE'&&s.workSide==='RIGHT'&&s.chatSide==='LEFT'&&
  ['ANDROID','YOUTUBE','VIDEO'].includes(s.mode)&&
  (s.deviceId===null||s.deviceId===o.deviceId)&&
  (s.sessionId===null||s.sessionId===o.sessionId)&&
  HEX64.test(s.promptDigest??'')&&Number.isSafeInteger(s.sequence)&&s.sequence>=0;
}
export function createStage4GeminiV4Entry({
 stage4,driver,original,readSignedOwner,verifySignedOwner,readStoredTask,
 verifyStoredTask,verifyChatDelivery,enabled=false,clock=Date.now
}={}){
 if(!stage4||typeof stage4.run!=='function'||typeof stage4.capabilities!=='function'||
  ![readSignedOwner,verifySignedOwner,readStoredTask,verifyStoredTask,verifyChatDelivery,clock].every(f=>typeof f==='function'))
  throw Error('ORIGINAL_STAGE4_AND_SECURE56_PORTS_REQUIRED');
 const cap=stage4.capabilities();
 if(cap?.engine!=='ANDROID_SECURE56_SINGLE'||cap?.existingJHApprovals!==true||
    cap?.playwrightFallback!==false)throw Error('STAGE4_UNIFIED_ANDROID_ENGINE_REQUIRED');
 const nativeReady=()=>enabled===true&&original?.usesOriginalSecure56===true&&
  original?.backend==='JH_ANDROID_NATIVE'&&typeof driver?.run==='function'&&
  driver.capabilities?.().geminiNativeOnly===true&&
  driver.capabilities?.().serverBrowserFallback===false;
 const locks=new Set();
 async function current(commandId){
  let a;try{a=await readSignedOwner()}catch{return null}
  if(!ownerOk(a,commandId,clock()))return null;
  try{if(await verifySignedOwner(a,commandId)!==true)return null}catch{return null}
  return a;
 }
 async function stored(id,o){
  let s;try{s=await readStoredTask(id)}catch{return {error:'ORIGINAL_GEMINI_LEDGER_UNAVAILABLE'}}
  if(s===null||s===undefined)return {absent:true};
  if(!storedOk(s,id,o))return {error:'GEMINI_STORED_SCOPE_CHANGED'};
  try{if(await verifyStoredTask(s,o)!==true)return {error:'ORIGINAL_GEMINI_LEDGER_UNVERIFIED'}}
  catch{return {error:'ORIGINAL_GEMINI_LEDGER_UNVERIFIED'}}
  return {task:s};
 }
 async function run(req){
  if(!plain(req)||typeof req.mode!=='string')return no('UNIFIED_MODE_UNSUPPORTED');
  if(!MODES.has(req.mode))return stage4.run(req);
  if(!nativeReady())return no('V4_GEMINI_NATIVE_HOST_NOT_ATTACHED');
  if(!ID.test(req.taskId??req.request?.id??'')||!HEX32.test(req.commandId??''))
   return no('GEMINI_TASK_AND_COMMAND_REQUIRED');
  const id=req.taskId??req.request?.id;
  if(req.mode==='GEMINI_START'&&(!plain(req.request)||req.request.id!==id))
   return no('GEMINI_START_ID_MISMATCH');
  const o=await current(req.commandId);
  if(!o)return no('CURRENT_SIGNED_LEFT_WORK_RIGHT_GPT_REQUIRED');
  if(locks.has(id))return no('GEMINI_TASK_ALREADY_IN_PROGRESS_READ_STATUS');
  locks.add(id);
  try{
   const record=await stored(id,o);
   if(record.error)return no(record.error);
   if(req.mode==='GEMINI_START'){
    if(!record.absent)return no('EXISTING_GEMINI_REQUEST_NO_RECREATE');
   }else if(record.absent)return no('ORIGINAL_GEMINI_TASK_NOT_FOUND');
   // All dispatches and phone approvals remain in the original V4 driver.
   // The stage4 engine is NOT asked to replay another driver operation.
   if(req.mode==='GEMINI_STATUS'){
    const s=record.task;
    let result=null,deliveredVerified=false;
    if(s.phase==='DELIVERED'&&s.result){
     try{deliveredVerified=await verifyChatDelivery(s,o)===true}catch{}
     if(deliveredVerified)result=s.result;
    }
    return Object.freeze({ok:true,code:deliveredVerified?'V4_GEMINI_DELIVERY_VERIFIED':'V4_GEMINI_CHECKPOINT_READ_ONLY',
     taskId:id,phase:s.phase,pendingKind:s.pending?.kind??null,result,
     fullReplyVerified:deliveredVerified&&result?.fullReplyVerified===true,
     automaticReplay:false,automaticResume:false});
   }
   const mode=req.mode;
   let r;try{r=await driver.run(req)}
   catch{return no('V4_GEMINI_DRIVER_RESULT_UNKNOWN_NO_REPLAY',{status:'UNKNOWN'})}
   const after=await current(req.commandId);
   if(!after||!same(o,after))
    return no('GEMINI_OWNER_CHANGED_AFTER_OPERATION_NO_REPLAY',{status:'UNKNOWN'});
   if(!plain(r)||typeof r.code!=='string')
    return no('V4_GEMINI_DRIVER_RESULT_UNVERIFIED_NO_REPLAY',{status:'UNKNOWN'});
   if(mode==='GEMINI_START'&&r.ok===true&&r.code!=='GEMINI_NATIVE_REQUEST_CREATED_NOT_EXECUTED')
    return no('GEMINI_START_UNEXPECTED_EFFECT_NO_REPLAY',{status:'UNKNOWN'});
   return Object.freeze({ok:r.ok===true,code:r.code,taskId:id,
    phase:typeof r.phase==='string'?r.phase:null,status:r.status??null,
    // A transport result is not evidence of a full Gemini reply or playable video.
    result:null,fullReplyVerified:false,videoDelivered:false,
    automaticReplay:false,automaticResume:false});
  }finally{locks.delete(id)}
 }
 return Object.freeze({run,capabilities:()=>Object.freeze({
  engine:'JH167_V4_ANDROID_SINGLE',androidLeftGptRightWork:true,
  stage4Unchanged:true,geminiNativeOnly:true,geminiHostAttached:nativeReady(),
  geminiModes:[...MODES],legacyPlaywrightPreserved:true,
  productionInstalled:false,automaticReplay:false,automaticResume:false
 })});
}
