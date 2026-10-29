/**
 * Original JH FileDurableExecutionStore adapter for exactly one V4 Gemini
 * Secure56 SUBMIT PREPARE. Never a second data store or a replay worker.
 * Only IDs/hashes and the original queued job ID are persisted.
 * Candidate only: the production host has NOT registered this adapter.
 */
import {createHash} from 'node:crypto';
import {FileDurableExecutionStore} from '../deployment/jh-result-verification/file-durable-execution-store.mjs';
import {nativeTaskIdDigest} from './gemini-v4-original-computer-task-id.mjs';

const sha=x=>createHash('sha256').update(x,'utf8').digest('hex');
const H32=/^[a-f0-9]{32}$/,H64=/^[a-f0-9]{64}$/;
const ID=/^[A-Za-z0-9_-]{8,80}$/;
const val=x=>typeof x==='string'&&x.length>0&&x.length<=200;
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const key=id=>'JH167_V4_GEMINI_PREPARE:'+sha(id);
const fields=['operationId','commandId','taskId','taskDigest','promptDigest',
 'ownerDeviceId','ownerSessionId','ownerBindingDigest','actionDigest','jobId'];
function valid(id,b){
 if(!H32.test(id??'')||!obj(b)||b.kind!=='ORIGINAL_GEMINI_SUBMIT_PREPARE'||
   !H32.test(b.commandId??'')||!ID.test(b.taskId??'')||
   !H64.test(b.taskDigest??'')||!H64.test(b.promptDigest??'')||
   !H64.test(b.actionDigest??'')||
   !H64.test(b.ownerBindingDigest??'')||
   !val(b.ownerDeviceId)||!val(b.ownerSessionId))return false;
 return b.taskDigest===nativeTaskIdDigest(b.taskId);
}
function recordOk(rec,id){
 const m=rec?.metadata;
 return obj(m)&&rec.dedupeKey===key(id)&&
  rec.scope==='JH167_GEMINI_SUBMIT_PREPARE'&&rec.intentId===id&&
  rec.commandDigest===sha(m.commandId??'')&&
  rec.replayAllowed===false&&rec.effectKind==='EXTERNAL_EFFECT'&&
  !!rec.dispatchStartedAt&&['DISPATCHING','NEEDS_REVIEW'].includes(rec.state)&&
  m.jhV4OriginalGeminiPrepare===true&&m.operationId===id&&
  valid(id,{...m,kind:'ORIGINAL_GEMINI_SUBMIT_PREPARE'})&&
  (m.jobId===null||val(m.jobId));
}
const snapshot=rec=>Object.freeze({
 ...Object.fromEntries(fields.map(f=>[f,rec.metadata[f]??null])),
 revision:rec.revision,state:rec.state
});
export function createV4OriginalGeminiPrepareLedger({store}={}){
 if(!(store instanceof FileDurableExecutionStore))
  throw Error('ORIGINAL_JH_FILE_DURABLE_STORE_REQUIRED');
 return Object.freeze({
  source:'ORIGINAL_JH_PERSISTENT_OPERATION_LEDGER',
  async claim(id,body){
   if(!valid(id,body))return false;
   const metadata={
    jhV4OriginalGeminiPrepare:true,operationId:id,
    commandId:body.commandId,taskId:body.taskId,
    taskDigest:body.taskDigest,promptDigest:body.promptDigest,
    ownerDeviceId:body.ownerDeviceId,
    ownerSessionId:body.ownerSessionId,
    ownerBindingDigest:body.ownerBindingDigest,actionDigest:body.actionDigest,
    jobId:null
   };
   try{
    const r=await store.claim({
     dedupeKey:key(id),scope:'JH167_GEMINI_SUBMIT_PREPARE',
     intentId:id,commandDigest:sha(body.commandId)
    },{
     state:'DISPATCHING',replayAllowed:false,effectKind:'EXTERNAL_EFFECT',
     dispatchStartedAt:new Date().toISOString(),metadata
    });
    return r.created===true;
   }catch{return false}
  },
  async attachJob(id,jobId,owner,task){
   if(!H32.test(id??'')||!val(jobId)||!obj(owner)||!obj(task))return false;
   try{
    await store.update(key(id),r=>{
     if(!recordOk(r,id)||r.metadata.jobId!==null||
       r.metadata.commandId!==owner.commandId||
       r.metadata.taskId!==task.id||
       r.metadata.ownerDeviceId!==owner.deviceId||
       r.metadata.ownerSessionId!==owner.sessionId)
      throw Error('ORIGINAL_GEMINI_PREPARE_OPERATION_CHANGED');
     r.metadata.jobId=jobId;
     r.replayAllowed=false;
     return r;
    });
    return true;
   }catch{return false}
  },
  async lookup(id){
   if(!H32.test(id??''))return null;
   try{
    const rec=await store.get(key(id));
    return recordOk(rec,id)?snapshot(rec):null;
   }catch{return null}
  },
  async verify(operation,id){
   if(!H32.test(id??'')||!obj(operation)||operation.operationId!==id)
    return false;
   try{
    const rec=await store.get(key(id));
    if(!recordOk(rec,id)||rec.revision!==operation.revision||
      rec.state!==operation.state)return false;
    const current=snapshot(rec);
    return fields.every(f=>operation[f]===current[f]);
   }catch{return false}
  },
  capabilities:()=>Object.freeze({
   originalFileStore:true,originalSignedQueueRequired:true,
   oneTimeReservation:true,automaticReplay:false,liveHostRegistered:false
  })
 });
}
