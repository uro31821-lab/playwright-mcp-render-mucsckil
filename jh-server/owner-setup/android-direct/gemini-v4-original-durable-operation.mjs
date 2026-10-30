/** V4 exact adapter to the EXISTING JH result-execution durable file store.
 *
 * This does not create a second database or a new retry policy. The caller
 * must inject an already initialized original FileDurableExecutionStore.
 * All reservations are permanently non-replayable, including if the process
 * stops between queueing the signed phone job and persisting its job ID.
 * Only scope metadata is stored; never a Gemini prompt, answer, password
 * or Android approval grant. This is a CI-only candidate, not live startup.
 */
import {createHash} from 'node:crypto';
import {FileDurableExecutionStore} from '../deployment/jh-result-verification/file-durable-execution-store.mjs';
const hex32=x=>typeof x==='string'&&/^[a-f0-9]{32}$/.test(x);
const val=x=>typeof x==='string'&&x.length>0&&x.length<=256;
const allowed=(r,id)=>r&&r.type==='open_url'&&r.target==='right_gemini_existing'&&
  hex32(id)&&hex32(r.commandId)&&val(r.deviceId)&&val(r.sessionId)&&
  r.payload?.target==='right_gemini_existing'&&r.payload?.operationId===id&&
  r.payload?.commandId===r.commandId&&
  r.payload?.type==='open_url';
const key=id=>'JH167_V4_RIGHT_GEMINI:'+createHash('sha256').update(id).digest('hex');
const scope=r=>Object.freeze({
  operationId:r.operationId,commandId:r.commandId,
  deviceId:r.deviceId,sessionId:r.sessionId,
  payload:structuredClone(r.payload),
  target:r.target,jobId:r.jobId??null
});
const validRecord=(rec,id)=>rec?.metadata?.jhV4RightGemini===true&&
  rec?.dedupeKey===key(id)&&rec?.replayAllowed===false&&
  rec?.effectKind==='EXTERNAL_EFFECT'&&rec?.dispatchStartedAt&&
  rec?.metadata?.operationId===id&&
  allowed({...rec.metadata,payload:rec.metadata.payload,type:'open_url'},id);
export function createV4OriginalPersistentOperationLedger({store}={}){
 if(!(store instanceof FileDurableExecutionStore))
  throw Error('ORIGINAL_FILE_DURABLE_EXECUTION_STORE_REQUIRED');
 return Object.freeze({
  source:'ORIGINAL_JH_PERSISTENT_OPERATION_LEDGER',
  async claim(id,body){
   if(!allowed({...body,type:'open_url',operationId:id},id))return false;
   const m=scope({...body,operationId:id});
   if(!val(m.payload.expectedWorkPackage)||!val(m.payload.expectedChatPackage)||
      m.payload.expectedWorkPackage!=='com.google.android.googlequicksearchbox'||
      m.payload.expectedChatPackage!=='com.openai.chatgpt')return false;
   const identity={dedupeKey:key(id),scope:'JH167_RIGHT_GEMINI_BINDING',
     intentId:id,commandDigest:createHash('sha256').update(m.commandId).digest('hex')};
   try{
    const r=await store.claim(identity,{
     state:'DISPATCHING',replayAllowed:false,effectKind:'EXTERNAL_EFFECT',
     dispatchStartedAt:new Date().toISOString(),
     metadata:{jhV4RightGemini:true,...m},
    });
    return r.created===true;
   }catch{return false}
  },
  async attachJob(id,jobId,o){
   if(!hex32(id)||!val(jobId)||!o)return false;
   try{
    await store.update(key(id),r=>{
     if(!validRecord(r,id)||r.metadata.jobId||
        r.metadata.commandId!==o.commandId||
        r.metadata.deviceId!==o.deviceId||
        r.metadata.sessionId!==o.sessionId)
      throw Error('ORIGINAL_V4_OPERATION_SCOPE_CHANGED');
     r.metadata.jobId=jobId;
     // Preserve DISPATCHING and replayAllowed=false across all restarts.
     r.state='DISPATCHING';r.replayAllowed=false;
     return r;
    });
    return true;
   }catch{return false}
  },
  async lookup(id){
   if(!hex32(id))return null;
   try{
    const rec=await store.get(key(id));
    if(!validRecord(rec,id))return null;
    return Object.freeze({...scope(rec.metadata),
      revision:rec.revision,operationId:id});
   }catch{return null}
  },
  async verify(op,id){
   if(!hex32(id)||!op||op.operationId!==id)return false;
   try{
    const rec=await store.get(key(id));
    if(!validRecord(rec,id)||rec.revision!==op.revision)return false;
    const stable=scope(rec.metadata);
    return ['commandId','deviceId','sessionId','jobId','target'].every(k=>stable[k]===op[k])&&
      JSON.stringify(stable.payload)===JSON.stringify(op.payload);
   }catch{return false}
  }
 });
}
