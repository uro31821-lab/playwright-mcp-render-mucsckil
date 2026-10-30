/** JH167 V4: durable, read-only correlation between a phone-local
 * Secure56-approved Gemini SUBMIT attempt and a later signed visible reply.
 *
 * This does NOT send a Gemini message, authenticate Google's conversation,
 * confirm a Google message ID, assemble a full reply or publish into ChatGPT.
 * Both evidence providers are original-host-only ports. Same-turn visible
 * order is a candidate, NEVER an authority for external delivery.
 */
import {createHash} from 'node:crypto';
import {FileDurableExecutionStore} from '../deployment/jh-result-verification/file-durable-execution-store.mjs';

const H='com.google.android.googlequicksearchbox';
const sha=x=>createHash('sha256').update(String(x),'utf8').digest('hex');
const hex32=x=>typeof x==='string'&&/^[0-9a-f]{32}$/.test(x);
const hex64=x=>typeof x==='string'&&/^[0-9a-f]{64}$/.test(x);
const validId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{8,80}$/.test(x);
const obj=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const fail=code=>Object.freeze({ok:false,code,automaticReplay:false,
   googleMessageVerified:false,fullReplyVerified:false,chatGptDelivered:false});
const key=(commandId,taskId)=>'JH167_V4_GEMINI_PROOF:'+sha(commandId+'|'+taskId);
const ownerFields=['deviceId','sessionId','commandId','workSide','chatSide',
  'workWindowId','chatWindowId','workPackage','chatPackage','workBounds','chatBounds'];
const ownerDigest=o=>sha(JSON.stringify(ownerFields.map(k=>o[k])));
const sameOwner=(a,b)=>!!a&&!!b&&ownerFields.every(k=>a[k]===b[k]);
function validOwner(o,cmd,now){
 return obj(o)&&o.current===true&&o.secure56===true&&
  o.backend==='JH_ANDROID_NATIVE'&&o.commandId===cmd&&
  o.workSide==='RIGHT'&&o.chatSide==='LEFT'&&
  o.workPackage===H&&o.chatPackage==='com.openai.chatgpt'&&
  typeof o.deviceId==='string'&&o.deviceId.length>0&&
  typeof o.sessionId==='string'&&o.sessionId.length>0&&
  Number.isSafeInteger(o.workWindowId)&&o.workWindowId>=0&&
  Number.isSafeInteger(o.chatWindowId)&&o.chatWindowId>=0&&
  o.workWindowId!==o.chatWindowId&&
  typeof o.workBounds==='string'&&typeof o.chatBounds==='string'&&
  Number.isSafeInteger(o.observedAt)&&
  o.observedAt<=now&&now-o.observedAt<=10000;
}
function validTask(t,id,cmd,o){
 return obj(t)&&t.schema===4&&t.id===id&&t.commandId===cmd&&
  t.backend==='JH_ANDROID_NATIVE'&&
  t.workSide==='RIGHT'&&t.chatSide==='LEFT'&&
  t.deviceId===o.deviceId&&t.sessionId===o.sessionId&&
  ['YOUTUBE','VIDEO'].includes(t.mode)&&t.cancelled!==true&&
  hex64(t.promptDigest);
}
const stored=(r,cmd,id)=>obj(r)&&r.metadata?.jhV4AttestedLocalClick===true&&
 r.dedupeKey===key(cmd,id)&&r.replayAllowed===false&&
 r.metadata.commandDigest===sha(cmd)&&r.metadata.taskDigest===sha(id)&&
 r.metadata.source==='ORIGINAL_SIGNED_SECURE56_LOCAL_CLICK'&&
 hex64(r.metadata.promptDigest)&&hex64(r.metadata.localAttemptDigest)&&
 hex64(r.metadata.ownerDigest)&&hex64(r.metadata.originalJobDigest)&&
 Number.isSafeInteger(r.metadata.attestedAtMs)&&
 r.state==='NEEDS_REVIEW';
function safeFragment(f){
 return obj(f)&&typeof f.maskedText==='string'&&f.maskedText.length>0&&
  f.maskedText.length<=800&&hex64(f.digest)&&
  Number.isSafeInteger(f.visibleLength)&&f.visibleLength>0&&
  typeof f.nodePartial==='boolean';
}
/** store is the EXISTING original JH file-based execution store, not a new DB. */
export function createV4OriginalGeminiEvidenceChain({
 store,sendAttestor,visibleReply,readOriginalOwner,verifyOriginalOwner,
 readOriginalTask,verifyOriginalTask,clock=Date.now,enabled=false
}={}){
 if(!(store instanceof FileDurableExecutionStore)||
  [readOriginalOwner,verifyOriginalOwner,readOriginalTask,verifyOriginalTask,clock]
   .some(x=>typeof x!=='function')||
  typeof sendAttestor?.verify!=='function'||
  typeof visibleReply?.read!=='function'||
  sendAttestor.capabilities?.()?.originalSecure56Required!==true||
  visibleReply.capabilities?.()?.originalSecure56Required!==true)
  throw Error('ORIGINAL_SECURE56_EVIDENCE_CHAIN_PORTS_REQUIRED');
 const active=new Set();
 async function owner(commandId){
  let o;try{o=await readOriginalOwner()}catch{return null}
  if(!validOwner(o,commandId,clock()))return null;
  try{if(await verifyOriginalOwner(o,commandId)!==true)return null}
  catch{return null}
  return o;
 }
 async function task(id,cmd,o){
  let t;try{t=await readOriginalTask(id)}catch{return null}
  if(!validTask(t,id,cmd,o))return null;
  try{if(await verifyOriginalTask(t,o)!==true)return null}
  catch{return null}
  return t;
 }
 async function recordApprovedClick({commandId,taskId,originalJobId}={}){
  if(!enabled)return fail('V4_EVIDENCE_CHAIN_DISABLED');
  if(!hex32(commandId)||!validId(taskId)||typeof originalJobId!=='string'||
   originalJobId.length<5||originalJobId.length>200)
   return fail('SIGNED_GEMINI_TASK_AND_ORIGINAL_JOB_REQUIRED');
  const k=key(commandId,taskId);
  if(active.has(k))return fail('GEMINI_EVIDENCE_WORK_ALREADY_IN_PROGRESS');
  active.add(k);
  try{
   // No repeated verification of the same original phone operation and NEVER
   // re-dispatch a click after an ambiguous or successful prior claim.
   let prior;
   try{prior=await store.get(k)}
   catch{return fail('ORIGINAL_GEMINI_DURABLE_EVIDENCE_STORE_UNAVAILABLE')}
   if(prior)return fail('GEMINI_CLICK_PROOF_ALREADY_RECORDED_READ_ONLY');
   const o=await owner(commandId);
   if(!o)return fail('ORIGINAL_GEMINI_OWNER_REQUIRED');
   const t=await task(taskId,commandId,o);
   if(!t||t.pending?.kind!=='SUBMIT')
    return fail('ORIGINAL_PENDING_APPROVED_SUBMIT_REQUIRED');
   let a;try{a=await sendAttestor.verify({commandId,taskId,originalJobId})}
   catch{return fail('ORIGINAL_LOCAL_CLICK_ATTESTATION_UNAVAILABLE')}
   if(!obj(a)||a.ok!==true||
      a.code!=='ORIGINAL_SIGNED_GEMINI_APPROVED_LOCAL_CLICK_ATTEMPT'||
      a.taskId!==taskId||a.originalJobId!==originalJobId||
      a.localClickAttemptVerified!==true||
      a.googleSentMessageIdVerified!==false||
      a.chatGptDeliveryVerified!==false||
      a.fullReplyVerified!==false||
      !hex64(a.promptDigest)||!hex64(a.localAttemptDigest)||
      a.promptDigest!==t.promptDigest)
    return fail('ORIGINAL_LOCAL_CLICK_ATTEMPT_NOT_AUTHENTICATED');
   const after=await owner(commandId);
   const second=after&&await task(taskId,commandId,after);
   if(!sameOwner(o,after)||!second||
     second.promptDigest!==t.promptDigest||second.pending?.kind!=='SUBMIT')
    return fail('GEMINI_PHONE_OR_SUBMIT_CHANGED_DURING_ATTESTATION');
   // After a real, authenticated local click, create one immutable,
   // non-replayable witness record (only hashes/scope, no prompt text).
   const when=clock();
   try{
    const claim=await store.claim({
     dedupeKey:k,scope:'JH167_GEMINI_LOCAL_CLICK_CORRELATION',
     intentId:sha(taskId),commandDigest:sha(commandId)
    },{
     state:'NEEDS_REVIEW',replayAllowed:false,
     effectKind:'EXTERNAL_EFFECT',dispatchStartedAt:new Date(when).toISOString(),
     metadata:{
      jhV4AttestedLocalClick:true,
      source:'ORIGINAL_SIGNED_SECURE56_LOCAL_CLICK',
      commandDigest:sha(commandId),taskDigest:sha(taskId),
      originalJobDigest:sha(originalJobId),
      ownerDigest:ownerDigest(o),promptDigest:a.promptDigest,
      localAttemptDigest:a.localAttemptDigest,attestedAtMs:when
     }
    });
    if(claim?.created!==true)return fail('GEMINI_CLICK_PROOF_ALREADY_RECORDED_READ_ONLY');
   }catch{return fail('ORIGINAL_GEMINI_DURABLE_EVIDENCE_STORE_UNAVAILABLE')}
   return Object.freeze({
    ok:true,code:'ORIGINAL_GEMINI_CLICK_WITNESS_SAVED_NO_DELIVERY',
    taskId,localClickAttemptVerified:true,
    googleMessageVerified:false,fullReplyVerified:false,
    chatGptDelivered:false,automaticReplay:false
   });
  }finally{active.delete(k)}
 }
 async function inspectVisibleCandidate({commandId,taskId}={}){
  if(!enabled)return fail('V4_EVIDENCE_CHAIN_DISABLED');
  if(!hex32(commandId)||!validId(taskId))
   return fail('SIGNED_GEMINI_TASK_REQUIRED');
  const k=key(commandId,taskId);
  if(active.has(k))return fail('GEMINI_EVIDENCE_WORK_ALREADY_IN_PROGRESS');
  active.add(k);
  try{
   let r;try{r=await store.get(k)}catch{return fail('ORIGINAL_GEMINI_DURABLE_EVIDENCE_STORE_UNAVAILABLE')}
   if(!stored(r,commandId,taskId))
    return fail('PERSISTED_ORIGINAL_GEMINI_CLICK_WITNESS_REQUIRED');
   if(clock()<r.metadata.attestedAtMs||
      clock()-r.metadata.attestedAtMs>2*60*60*1000)
    return fail('SIGNED_GEMINI_CLICK_WITNESS_EXPIRED');
   const o=await owner(commandId);
   if(!o||ownerDigest(o)!==r.metadata.ownerDigest)
    return fail('GEMINI_ORIGINAL_OWNER_CHANGED_SINCE_CLICK');
   const t=await task(taskId,commandId,o);
   if(!t||t.promptDigest!==r.metadata.promptDigest||
      !['WAITING','RESULT_READY','DELIVERED'].includes(t.phase)||
      typeof t.sentMessageId!=='string'||!t.sentMessageId)
    return fail('ORIGINAL_GEMINI_SENT_MESSAGE_STATE_REQUIRED');
   let v;try{v=await visibleReply.read({commandId,taskId})}
   catch{return fail('SIGNED_GEMINI_VISIBLE_READBACK_UNAVAILABLE')}
   // A visible sequence is only a partial candidate. Even this path
   // never calls ChatGPT delivery or claims an authenticated Gemini turn.
   if(!obj(v)||v.ok!==true||v.taskId!==taskId||
     v.code!=='SIGNED_GEMINI_VISIBLE_SEQUENCE_CANDIDATE_UNVERIFIED'||
     v.visibleTurnCandidate!==true||
     v.fullReplyVerified!==false||v.requestTurnVerified!==false||
     v.conversationVerified!==false||v.sentMessageIdProven!==false||
     v.autoDeliver!==false||v.masked!==true||v.fragmentCount!==1||
     !Array.isArray(v.fragments)||v.fragments.length!==1||
     !safeFragment(v.fragments[0]))
    return fail('GEMINI_VISIBLE_REPLY_NOT_BOUND_TO_VERIFIED_REQUEST');
   const after=await owner(commandId);
   const t2=after&&await task(taskId,commandId,after);
   if(!sameOwner(o,after)||!t2||t2.promptDigest!==t.promptDigest||
     t2.sentMessageId!==t.sentMessageId||t2.mode!==t.mode||
     !['WAITING','RESULT_READY','DELIVERED'].includes(t2.phase))
    return fail('GEMINI_MESSAGE_OR_WINDOW_CHANGED_DURING_READBACK');
   return Object.freeze({
    ok:true,code:'GEMINI_VISIBLE_PARTIAL_CORRELATED_NEEDS_GOOGLE_TURN_PROOF',
    taskId,sendClickAttested:true,visibleTurnCandidate:true,
    fragments:Object.freeze([Object.freeze({
     maskedText:v.fragments[0].maskedText,nodePartial:v.fragments[0].nodePartial,
     digest:v.fragments[0].digest
    })]),
    googleMessageVerified:false,fullReplyVerified:false,
    conversationVerified:false,chatGptDelivered:false,
    automaticReplay:false,autoDeliver:false,requiresGoogleTurnProof:true
   });
  }finally{active.delete(k)}
 }
 return Object.freeze({recordApprovedClick,inspectVisibleCandidate,
  capabilities:()=>Object.freeze({enabled:enabled===true,originalJHPersistentStore:true,
    originalSecure56Required:true,readOnlyCorrelation:true,
    googleMessageVerified:false,fullReplyVerified:false,
    chatGptDeliveryAttached:false,productionRegistered:false,automaticReplay:false})
 });
}
