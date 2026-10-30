/**
 * JH167 V4 — real Secure56 local-port composition for RIGHT Gemini readback.
 *
 * The existing owner supplies:
 * - an authenticated RIGHT-Gemini/LEFT-GPT Stage4 window proof,
 * - its CURRENT Secure56 device/session/command authority,
 * - its EXISTING mk('open_url',payload,deviceId) signing/queue primitive,
 * - its EXISTING durable operation ledger and signed-completion verifier.
 *
 * No new MAC, server, key, Google login, UI executor, approval grant or retry.
 * This module is deliberately NOT wired into the production MCP catalog.
 */
import {createV4RightGeminiPhoneBinding} from './gemini-v4-right-phone-binding.mjs';

const hex32=x=>typeof x==='string'&&/^[a-f0-9]{32}$/.test(x);
const obj=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const fail=code=>Object.freeze({ok:false,code,automaticReplay:false});
const FNS=['selectDevice','deviceMeta','activeSession','requireCommand',
 'makeOriginalJob','getOriginalJob','verifyOriginalQueuedJob',
 'verifyOriginalCompletedJob'];
const LEDGER=['claim','attachJob','lookup','verify'];
const SAME_OWNER=['deviceId','sessionId','commandId','workWindowId',
 'chatWindowId','workBounds','chatBounds','workPackage','chatPackage',
 'workSide','chatSide'];
const same=(a,b)=>!!a&&!!b&&SAME_OWNER.every(k=>a[k]===b[k]);
const readPayload=raw=>{
 if(obj(raw))return raw;
 if(typeof raw==='string'&&raw.length<10000){
  try{const j=JSON.parse(raw);return obj(j)?j:null}catch{}
 }
 return null;
};
/** Only original host callbacks may be injected, not MCP request JSON. */
export function createOriginalSecure56V4RightGeminiHost({
 pane, original, durable, enabled=false,clock=Date.now
}={}){
 if(!pane||['read','verify','capabilities'].some(k=>typeof pane[k]!=='function')||
   !original||FNS.some(k=>typeof original[k]!=='function')||
   !durable||LEDGER.some(k=>typeof durable[k]!=='function')||
   typeof clock!=='function')throw Error('ORIGINAL_SECURE56_HOST_AND_DURABLE_PORTS_REQUIRED');
 // Reject any accidentally supplied short-lived, in-memory "durable" flag:
 // a real owner must intentionally grant its existing persistent ledger port.
 if(durable.source!=='ORIGINAL_JH_PERSISTENT_OPERATION_LEDGER')
  throw Error('ORIGINAL_PERSISTENT_LEDGER_REQUIRED');
 const issued=new WeakMap();
 function identity(o){
  if(!obj(o)||o.backend!=='JH_ANDROID_NATIVE'||o.secure56!==true||
    o.workSide!=='RIGHT'||o.chatSide!=='LEFT'||!hex32(o.commandId)||
    o.workPackage!=='com.google.android.googlequicksearchbox'||
    o.chatPackage!=='com.openai.chatgpt')return false;
  let d,s,meta,current;
  try{
   d=original.selectDevice();s=original.activeSession(d);
   meta=original.deviceMeta(d);current=original.requireCommand(d);
  }catch{return false}
  return o.deviceId===d&&o.sessionId===s?.sessionId&&
    meta?.secureBridgeVersion===56&&meta?.secureActive===true&&
    meta?.deviceDigest===s?.deviceDigest&&current===o.commandId&&
    pane.verify(o,o.commandId)===true;
 }
 async function owner(){
  let o;try{o=pane.read()}catch{return null}
  return identity(o)?o:null;
 }
 const binder=createV4RightGeminiPhoneBinding({
  enabled:enabled===true,clock,
  readSignedOwner:owner,
  verifySignedOwner:async(o,commandId)=>o.commandId===commandId&&identity(o),
  claimOriginalOperation:async(id,payload,o)=>{
   if(!identity(o)||payload?.operationId!==id||payload?.commandId!==o.commandId||
      payload?.target!=='right_gemini_existing'||payload?.type!=='open_url')return false;
   return await durable.claim(id,{
    commandId:o.commandId,deviceId:o.deviceId,sessionId:o.sessionId,
    target:'right_gemini_existing',payload:structuredClone(payload),
    state:'RESERVED_NO_REPLAY'
   })===true;
  },
  startOriginalSignedJob:async(payload,o)=>{
   if(!identity(o))throw Error('CURRENT_SECURE56_GEMINI_OWNER_LOST');
   const op=payload.operationId;
   // Original makeOriginalJob = original mk('open_url', payload, deviceId),
   // *not* an invented signed envelope or unsigned generic tool call.
   const job=await original.makeOriginalJob('open_url',{
    target:'right_gemini_existing',
    commandId:o.commandId,operationId:op,
    expectedWorkWindowId:o.workWindowId,
    expectedChatWindowId:o.chatWindowId,
    expectedWorkPackage:o.workPackage,
    expectedChatPackage:o.chatPackage,
    expectedWorkBounds:o.workBounds,
    expectedChatBounds:o.chatBounds
   },o.deviceId);
   if(!obj(job)||typeof job.id!=='string'||!job.id||
      job.type!=='open_url'||job.status!=='queued'||
      job.targetDeviceId!==o.deviceId||
      job.secureSessionId!==o.sessionId||
      job.operationId!==op||job.commandId!==o.commandId||
      await original.verifyOriginalQueuedJob(job,o)!==true)
    throw Error('ORIGINAL_SIGNED_PHONE_QUEUE_REFUSED');
   // If this persist fails, the signed phone action MAY already be queued.
   // The operation remains reserved/UNKNOWN; it is never re-created.
   if(await durable.attachJob(op,job.id,o)!==true)
    throw Error('DURABLE_JOB_BINDING_UNCONFIRMED_NO_REPLAY');
   return {jobId:job.id,status:job.status};
  },
  readOriginalJob:async(id,commandId)=>{
   const op=await durable.lookup(id);
   if(!obj(op)||op.commandId!==commandId||op.state==='CANCELLED'||
      typeof op.jobId!=='string'||!op.jobId)return null;
   if(await durable.verify(op,id)!==true)return null;
   const job=await original.getOriginalJob(op.jobId);
   if(!obj(job)||job.id!==op.jobId||job.operationId!==id||
      job.commandId!==commandId||job.targetDeviceId!==op.deviceId||
      job.secureSessionId!==op.sessionId||job.type!=='open_url')return null;
   const status=job.status==='complete'?'COMPLETED':
     job.status==='queued'||job.status==='in_progress'?'PENDING':'UNKNOWN';
   const report={operationId:id,commandId,deviceId:op.deviceId,
     sessionId:op.sessionId,status,payload:status==='COMPLETED'?
       readPayload(job.result):null};
   issued.set(report,{op,job});
   return report;
  },
  verifyOriginalCompletion:async(report,o)=>{
   const proof=issued.get(report);
   if(!proof||!identity(o)||!same(o,{
    deviceId:proof.op.deviceId,sessionId:proof.op.sessionId,
    commandId:proof.op.commandId,
    workWindowId:proof.op.payload?.expectedWorkWindowId,
    chatWindowId:proof.op.payload?.expectedChatWindowId,
    workBounds:proof.op.payload?.expectedWorkBounds,
    chatBounds:proof.op.payload?.expectedChatBounds,
    workPackage:proof.op.payload?.expectedWorkPackage,
    chatPackage:proof.op.payload?.expectedChatPackage,
    workSide:'RIGHT',chatSide:'LEFT'
   }))return false;
   return await durable.verify(proof.op,report.operationId)===true&&
     await original.verifyOriginalCompletedJob(proof.job,proof.op,o)===true;
  }
 });
 return Object.freeze({
  bind:request=>binder.bind(request),
  status:request=>binder.status(request),
  // Preview mode is read-only; this never creates a secondary executor.
  capabilities:()=>Object.freeze({...binder.capabilities(),
   originalJHQueueUsed:true,originalPersistentLedgerRequired:true,
   phoneSignaturesReused:true,liveHostRegistered:false,mediaDelivered:false})
 });
}
