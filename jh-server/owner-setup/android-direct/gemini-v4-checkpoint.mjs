/** JH167 V4: read-only Gemini checkpoint gate for the original Secure56 host.
 * No app execution, message submission, automatic resume, or browser fallback.
 * An original-host verifier, not the checkpoint JSON, establishes authenticity.
 */
const HEX32 = /^[a-f0-9]{32}$/;
const TASK_ID = /^[A-Za-z0-9_-]{8,80}$/;
const STATES = new Set(['READY','TYPED','SUBMITTED','GENERATING','RESULT_READY','DELIVERED','CANCELLED']);
const MODES = new Set(['ANDROID','YOUTUBE','VIDEO']);
const fail = code => Object.freeze({ok:false,code,automaticReplay:false,automaticResume:false});
const sameOwner = (a,b) => !!a&&!!b&&['deviceId','sessionId','commandId','workWindowId','chatWindowId','workSide','chatSide'].every(k=>a[k]===b[k]);
const validOwner = (o, commandId, now) => !!o && o.backend==='JH_ANDROID_NATIVE' &&
 o.secure56===true && o.current===true && o.workSide==='LEFT' && o.chatSide==='RIGHT' &&
 typeof o.deviceId==='string' && o.deviceId.length>0 && o.deviceId.length<=200 &&
 typeof o.sessionId==='string' && o.sessionId.length>0 && o.sessionId.length<=200 &&
 HEX32.test(o.commandId??'') && o.commandId===commandId &&
 Number.isSafeInteger(o.workWindowId) && o.workWindowId>=0 &&
 Number.isSafeInteger(o.chatWindowId) && o.chatWindowId>=0 &&
 o.workWindowId!==o.chatWindowId &&
 Number.isSafeInteger(o.observedAt) && o.observedAt<=now && now-o.observedAt<=15000;
const validTask = (s,id,commandId,owner) => s?.schema===4 && s.id===id &&
 s.commandId===commandId && s.backend==='JH_ANDROID_NATIVE' &&
 s.workSide==='LEFT' && s.chatSide==='RIGHT' && MODES.has(s.mode) &&
 STATES.has(s.phase) && Number.isSafeInteger(s.sequence) && s.sequence>=0 &&
 (s.deviceId===null || s.deviceId===owner.deviceId) &&
 (s.sessionId===null || s.sessionId===owner.sessionId) &&
 (s.pending===null || (typeof s.pending==='object' && typeof s.pending.kind==='string'));
/** All callbacks MUST run in the current authenticated original Secure56 process.
 * verifyOwner and verifyStoredTask must read original signed/ledger evidence,
 * NOT trust user-supplied verified:true flags.
 */
export function createGeminiV4CheckpointGate({readOwner,verifyOwner,readStoredTask,verifyStoredTask,clock=Date.now}={}){
 if([readOwner,verifyOwner,readStoredTask,verifyStoredTask,clock].some(f=>typeof f!=='function'))
  throw Error('ORIGINAL_SECURE56_CHECKPOINT_PORTS_REQUIRED');
 let inFlight=false;
 return Object.freeze({
  async run(q){
   if(q?.mode!=='GEMINI_STATUS')return fail('LIFECYCLE_WRITES_NOT_CONNECTED');
   if(!TASK_ID.test(q.taskId??'')||!HEX32.test(q.commandId??''))return fail('SCOPED_TASK_AND_COMMAND_REQUIRED');
   if(inFlight)return fail('CONCURRENT_STATUS_UNCONFIRMED');
   inFlight=true;
   try{
    const first=await readOwner(),at=clock();
    if(!validOwner(first,q.commandId,at)||await verifyOwner(first,q)!==true)
     return fail('ORIGINAL_OWNER_NOT_VERIFIED');
    const saved=await readStoredTask(q.taskId);
    if(!validTask(saved,q.taskId,q.commandId,first)||
       await verifyStoredTask(saved,q.taskId,q.commandId,first)!==true)
     return fail('STORED_REQUEST_UNVERIFIED_NO_REPLAY');
    const second=await readOwner();
    if(!sameOwner(first,second)||!validOwner(second,q.commandId,clock())||
       await verifyOwner(second,q)!==true)return fail('OWNER_CHANGED_DURING_STATUS');
    return Object.freeze({ok:true,code:'ORIGINAL_DURABLE_CHECKPOINT_READ_ONLY',
      taskId:saved.id,phase:saved.phase,pendingKind:saved.pending?.kind??null,
      readOnlyRecovery:true,automaticResume:false,automaticReplay:false,
      result:null,fullReplyVerified:false,videoDelivered:false});
   }catch{return fail('ORIGINAL_CHECKPOINT_STATUS_UNAVAILABLE')}
   finally{inFlight=false}
  },
  capabilities:()=>Object.freeze({statusReadOnly:true,productionInstalled:false,
   geminiSubmitEnabled:false,videoCreationEnabled:false,automaticResume:false,automaticReplay:false})
 });
}
