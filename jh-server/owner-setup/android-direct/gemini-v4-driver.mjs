/** Stage4 host driver for the exact JH167 Gemini v0.5 native workflow.
 * All callbacks are existing, authenticated Secure56 host-local ports.
 * No Gemini API, web browser login, fresh permission, background loop or
 * automatic task resume. Production inclusion is OFF until original host ports
 * and the new phone APK are independently validated.
 */
import {createGeminiNativeTask,GeminiNativeWorkflow,createJhNativeGeminiPort}
 from '../gemini-native/src/index.mjs';
const hex32=s=>typeof s==='string'&&/^[a-f0-9]{32}$/.test(s);
const id=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{8,80}$/.test(s);
const fail=code=>Object.freeze({ok:false,code,automaticReplay:false,automaticResume:false});
const safeCode=code=>typeof code==='string'&&/^[A-Z][A-Z0-9_]{0,99}$/.test(code)?code:'V4_NATIVE_HOST_REVIEW_REQUIRED';
export function createStage4GeminiNativeDriver({host,enabled=false,clock=Date.now}={}){
 const tasks=new Map(),starting=new Set(),working=new Set();
 const ready=()=>enabled===true&&host?.original?.usesOriginalSecure56===true&&
  host.original.backend==='JH_ANDROID_NATIVE'&&
  typeof host.currentCommand==='function'&&typeof host.claimTask==='function'&&
  typeof host.save==='function'&&typeof host.verifyObservation==='function'&&
  typeof host.verifyReceipt==='function'&&typeof host.original.observe==='function'&&
  typeof host.original.isCurrent==='function';
 async function run(q){
  if(!ready())return fail('ORIGINAL_GEMINI_V4_HOST_NOT_READY');
  if(!['GEMINI_START','GEMINI_STEP','GEMINI_STATUS','GEMINI_CANCEL'].includes(q?.mode)||
   !hex32(q?.commandId))return fail('GEMINI_V4_MODE_OR_COMMAND_INVALID');
  let current;try{current=await host.currentCommand()}catch{return fail('SECURE56_COMMAND_UNAVAILABLE')}
  if(current!==q.commandId)return fail('CURRENT_SECURE56_COMMAND_REQUIRED');
  const key=q.taskId??q.request?.id;
  if(!id(key))return fail('GEMINI_V4_TASK_ID_REQUIRED');
  if(q.mode==='GEMINI_START'&&(q.taskId!==undefined&&q.taskId!==q.request?.id||
   q.request?.id!==key))return fail('GEMINI_V4_START_ID_MISMATCH');
  if(starting.has(key)||q.mode==='GEMINI_STEP'&&working.has(key))
   return fail('EXISTING_GEMINI_OPERATION_READ_STATUS');
  if(q.mode==='GEMINI_START'){
   if(tasks.has(key))return fail('EXISTING_REQUEST_USE_STATUS_NO_RECREATE');
   if(tasks.size>=64)return fail('V4_GEMINI_ACTIVE_TASK_CAPACITY_REVIEW_REQUIRED');
   starting.add(key);
   try{
    const state=createGeminiNativeTask(q.request,q.commandId);
    const engine=createJhNativeGeminiPort({original:host.original,
      verifyObservation:host.verifyObservation,clock});
    // This MUST be an atomic durable claim by the original Secure56 host.
    if(await host.claimTask(key,structuredClone(state))!==true)
     return fail('EXISTING_DURABLE_REQUEST_NO_RECREATE');
    // A command change after claiming creates an inert durable record, not
    // permission to retry with a new command or to auto-resume after restart.
    if(await host.currentCommand()!==q.commandId)
     return fail('COMMAND_CHANGED_AFTER_DURABLE_CLAIM_NO_REPLAY');
    const workflow=new GeminiNativeWorkflow(state,{
      save:s=>host.save(key,s),engine,delivery:host.delivery,
      verifyObservation:host.verifyObservation,verifyReceipt:host.verifyReceipt,clock});
    tasks.set(key,workflow);
    return Object.freeze({ok:true,code:'GEMINI_NATIVE_REQUEST_CREATED_NOT_EXECUTED',
      taskId:key,phase:state.phase,automaticReplay:false,automaticResume:false});
   }catch(e){return fail(safeCode(e?.message||'GEMINI_V4_START_FAILED'))}
   finally{starting.delete(key)}
  }
  const w=tasks.get(key);
  // Reconstructing a workflow with an old non-READY checkpoint is intentionally
  // excluded: only the original durable store may answer a STATUS after restart.
  if(!w)return fail('GEMINI_NOT_ACTIVE_AFTER_RESTART_READ_ORIGINAL_STATUS');
  if(w.state.commandId!==q.commandId)return fail('GEMINI_WORKFLOW_COMMAND_MISMATCH');
  if(q.mode==='GEMINI_STATUS')return Object.freeze({ok:true,code:'GEMINI_MEMORY_STATUS_NOT_DURABLE_PROOF',
   taskId:key,phase:w.state.phase,pendingKind:w.state.pending?.kind??null,
   result:null,automaticReplay:false,automaticResume:false});
  // CANCEL is allowed while STEP awaits the phone: V4 cancel() immediately
  // raises the no-further-send fence before waiting for the in-flight step.
  if(q.mode==='GEMINI_STEP')working.add(key);
  try{
   const reply=q.mode==='GEMINI_CANCEL'?await w.cancel():await w.advance();
   if(await host.currentCommand()!==q.commandId)
    return fail('SECURE56_COMMAND_CHANGED_AFTER_GEMINI_ACTION_NO_REPLAY');
   return Object.freeze({ok:true,code:safeCode(reply?.code),taskId:key,
     phase:w.state.phase,status:reply?.status??'UNKNOWN',
     result:null,fullReplyVerified:false,videoDelivered:false,
     automaticReplay:false,automaticResume:false});
  }catch{return fail('GEMINI_ORIGINAL_ACTION_RESULT_UNKNOWN_NO_REPLAY')}
  finally{if(q.mode==='GEMINI_STEP')working.delete(key)}
 }
 return Object.freeze({run,capabilities:()=>Object.freeze({
  geminiNativeOnly:true,serverBrowserFallback:false,
  originalSecure56Required:true,geminiHostAttached:ready(),
  productionInstalled:false,automaticResume:false,automaticReplay:false
 })});
}
