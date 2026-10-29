import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {FileDurableExecutionStore} from '../deployment/jh-result-verification/file-durable-execution-store.mjs';
import {createV4GeminiOriginalLocalSendAttestor} from './gemini-v4-local-send-attribution.mjs';
import {createV4GeminiVisibleReplyObserver} from './gemini-v4-visible-reply.mjs';
import {createV4OriginalGeminiEvidenceChain} from './gemini-v4-evidence-chain.mjs';

const sha=s=>createHash('sha256').update(String(s),'utf8').digest('hex');
const H='com.google.android.googlequicksearchbox';
const CID='a'.repeat(32),TASK='gemini-full-port-001',JOB='secure56-signed-submit-job';
const PROMPT='https://www.youtube.com/watch?v=jNQXAC9IVRw\n영상 세 줄 요약';
const ANSWER='영상 내용을 확인 중인 부분 답변입니다.';
const TASK_HASH='b'.repeat(64),REVIEW='c'.repeat(64),ACTION='d'.repeat(64);
const req={commandId:CID,taskId:TASK,originalJobId:JOB};
const readReq={commandId:CID,taskId:TASK};
function getOwner(now){
 return {backend:'JH_ANDROID_NATIVE',current:true,secure56:true,
  deviceId:'original-fold',sessionId:'original-secure56',commandId:CID,
  workSide:'RIGHT',chatSide:'LEFT',workPackage:H,chatPackage:'com.openai.chatgpt',
  workWindowId:31,chatWindowId:30,workBounds:'1100,0,2200,1800',
  chatBounds:'0,0,1100,1800',observedAt:now-200,
  nativeGeminiWindowVerified:true};
}
const originalTask=()=>({schema:4,id:TASK,commandId:CID,backend:'JH_ANDROID_NATIVE',
 deviceId:'original-fold',sessionId:'original-secure56',mode:'YOUTUBE',
 workSide:'RIGHT',chatSide:'LEFT',cancelled:false,
 promptDigest:sha(PROMPT),pending:{kind:'SUBMIT'},phase:'TYPED',sentMessageId:null});
function localClick(){
 const p={schema:'JH_GEMINI_LOCAL_CLICK_V1',
  taskDigest:TASK_HASH,promptDigest:sha(PROMPT),
  reviewBindingDigest:REVIEW,actionDigest:ACTION,sourcePackage:H,sourceWindowId:31,
  workSide:'RIGHT',chatSide:'LEFT',localApprovedClickDispatched:true,
  googleSentMessageIdVerified:false,googleConversationIdVerified:false,
  fullReplyVerified:false,postObservationRequired:true};
 p.localAttemptDigest=sha('JH-GEMINI-LOCAL-CLICK-V1|'+[
  p.taskDigest,p.promptDigest,p.reviewBindingDigest,p.actionDigest,
  p.sourcePackage,p.sourceWindowId].join('|'));
 return p;
}
function scope(){
 return {taskId:TASK,commandId:CID,deviceId:'original-fold',
  sessionId:'original-secure56',taskDigest:TASK_HASH,
  promptDigest:sha(PROMPT),reviewBindingDigest:REVIEW,actionDigest:ACTION,
  workPackage:H,workWindowId:31,workSide:'RIGHT'};
}
const split=now=>({kind:'split_screen_evidence',version:'1',verified:'true',
 layout:'LEFT_RIGHT',chatPackage:'com.openai.chatgpt',chatKind:'NATIVE',
 chatWindowId:'30',chatBounds:'0,0,1100,1800',
 workPackage:H,workWindowId:'31',workBounds:'1100,0,2200,1800',
 observedAtMs:String(now-100)});
function msg(raw,type){
 return {package:H,windowId:'31',
  viewId:H+':id/'+(type==='USER'?'assistant_robin_user_message_text':'assistant_robin_text'),
  geminiReadbackSchema:'NATIVE_V4',
  sensitive:'false',geminiFullReplyVerified:'false',
  geminiPlainText:raw,geminiTextDigest:sha(raw),
  geminiTextPartial:'false',geminiVisibleTextLength:String(raw.length),
  bounds:'1210,250,2030,1100'};
}
async function setup(fn){
 const dir=await mkdtemp(join(tmpdir(),'jh-v4-real-ports-'));
 try{
  let now=Date.now(),task=originalTask(),screen=[split(now),msg(PROMPT,'USER'),msg(ANSWER,'ASSISTANT')];
  let sendJob={id:JOB,type:'computer_use_action_execute',status:'complete',
   targetDeviceId:'original-fold',secureSessionId:'original-secure56',
   commandId:CID,secureMac:'authenticated-by-original-hmac',
   result:{dispatched:true,resultVerified:false,geminiLocalClickAttempt:localClick()}};
  let alteredOwner={},scopeData=scope(),snapshots=0;
  const original={
   readOriginalOwner:async()=>({...getOwner(now),...alteredOwner}),
   verifyOriginalOwner:async(o)=>o.backend==='JH_ANDROID_NATIVE'&&o.current===true,
   readOriginalTask:async()=>({...task}),
   verifyOriginalTask:async t=>t.id===TASK&&t.commandId===CID,
  };
  const attestor=createV4GeminiOriginalLocalSendAttestor({
   ...original,enabled:true,clock:()=>now,
   readOriginalJob:async()=>structuredClone(sendJob),
   verifyOriginalCompletedJob:async j=>j.secureMac==='authenticated-by-original-hmac',
   resolveOriginalActionScope:async()=>({...scopeData}),
   verifyOriginalActionScope:async s=>s.taskId===TASK&&s.commandId===CID
  });
  const reply=createV4GeminiVisibleReplyObserver({
   ...original,enabled:true,clock:()=>now,
   createOriginalSnapshot:async()=>{
    snapshots++;return {id:'original-snapshot-'+snapshots,type:'agent_snapshot',
     targetDeviceId:'original-fold',secureSessionId:'original-secure56',
     commandId:CID,status:'queued',secureMac:'signed-snapshot'};
   },
   waitOriginalSnapshot:async job=>{
    const p=split(now),rows=screen.map(row=>row.kind==='split_screen_evidence'?p:row);
    return {...job,status:'complete',result:{
     ok:true,url:JSON.stringify(rows),splitScreenRequired:true,splitScreen:p}};
   },
   verifyOriginalSnapshot:async done=>done.secureMac==='signed-snapshot'
  });
  const file='same-original-jh-store.json';
  const store=new FileDurableExecutionStore({directory:dir,filename:file,clock:()=>now});
  const chain=createV4OriginalGeminiEvidenceChain({
   store,sendAttestor:attestor,visibleReply:reply,...original,
   enabled:true,clock:()=>now
  });
  await fn({chain,store,dir,file,attestor,reply,
   changeTask:fields=>{task={...task,...fields}},
   changeOwner:fields=>{alteredOwner={...alteredOwner,...fields}},
   changeScope:fields=>{scopeData={...scopeData,...fields}},
   changeJobResult:fields=>{sendJob.result={...sendJob.result,...fields}},
   changeRows:rows=>{screen=rows},
   markSent:()=>{task={...task,pending:null,phase:'WAITING',
     sentMessageId:'original-signed-visible-message-1'}},
   screenshots:()=>snapshots});
 }finally{await rm(dir,{recursive:true,force:true})}
}
test('actual signed phone submit attestor + original disk ledger + signed Gemini snapshot observer compose',async()=>{
 await setup(async x=>{
  const click=await x.chain.recordApprovedClick(req);
  assert.equal(click.code,'ORIGINAL_GEMINI_CLICK_WITNESS_SAVED_NO_DELIVERY');
  assert.equal(click.ok,true);assert.equal(click.googleMessageVerified,false);
  x.markSent();
  const partial=await x.chain.inspectVisibleCandidate(readReq);
  assert.equal(partial.code,'GEMINI_VISIBLE_PARTIAL_CORRELATED_NEEDS_GOOGLE_TURN_PROOF');
  assert.equal(partial.fragments[0].maskedText,ANSWER);
  assert.equal(partial.googleMessageVerified,false);
  assert.equal(partial.fullReplyVerified,false);
  assert.equal(partial.chatGptDelivered,false);
  assert.equal(x.screenshots(),1);
  assert.equal((await x.chain.recordApprovedClick(req)).code,
    'GEMINI_CLICK_PROOF_ALREADY_RECORDED_READ_ONLY');
 });
});
test('real local phone attestor rejects substituted review action before original ledger claim',async()=>{
 await setup(async x=>{
  x.changeScope({actionDigest:'0'.repeat(64)});
  const r=await x.chain.recordApprovedClick(req);
  assert.equal(r.code,'ORIGINAL_LOCAL_CLICK_ATTEMPT_NOT_AUTHENTICATED');
  assert.equal((await x.store.list()).length,0);
 });
});
test('real signed screen reader cannot match a different visible user question',async()=>{
 await setup(async x=>{
  await x.chain.recordApprovedClick(req);x.markSent();
  x.changeRows([split(Date.now()),msg('다른 질문입니다','USER'),msg(ANSWER,'ASSISTANT')]);
  const r=await x.chain.inspectVisibleCandidate(readReq);
  assert.equal(r.code,'GEMINI_VISIBLE_REPLY_NOT_BOUND_TO_VERIFIED_REQUEST');
 });
});
test('real original reply reader rejects mixed-package accessibility nodes',async()=>{
 await setup(async x=>{
  await x.chain.recordApprovedClick(req);x.markSent();
  x.changeRows([split(Date.now()),msg(PROMPT,'USER'),{...msg(ANSWER,'ASSISTANT'),package:'com.android.chrome'}]);
  const r=await x.chain.inspectVisibleCandidate(readReq);
  assert.equal(r.code,'GEMINI_VISIBLE_REPLY_NOT_BOUND_TO_VERIFIED_REQUEST');
 });
});
test('real original disk witness remains non-replayable after new host process reload',async()=>{
 await setup(async x=>{
  await x.chain.recordApprovedClick(req);
  const data=await x.store.list();
  assert.equal(data.length,1);assert.equal(data[0].replayAllowed,false);
  const saved=new FileDurableExecutionStore({
   directory:x.dir,filename:x.file,instanceId:'new-original-host'});
  const original=await saved.list();
  assert.equal(original.length,1);
  assert.equal(original[0].state,'NEEDS_REVIEW');
  assert.equal(original[0].replayAllowed,false);
 });
});
