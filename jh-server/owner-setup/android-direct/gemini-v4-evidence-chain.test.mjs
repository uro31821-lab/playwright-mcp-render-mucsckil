import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {FileDurableExecutionStore} from '../deployment/jh-result-verification/file-durable-execution-store.mjs';
import {createV4OriginalGeminiEvidenceChain} from './gemini-v4-evidence-chain.mjs';

const C='a'.repeat(32),T='gemini-test-task-001',J='original-exec-job-001';
const P='b'.repeat(64),A='c'.repeat(64),H='com.google.android.googlequicksearchbox';
const sendReq={commandId:C,taskId:T,originalJobId:J};
const readReq={commandId:C,taskId:T};
function expectedOwner(t){
 return {backend:'JH_ANDROID_NATIVE',current:true,secure56:true,
  deviceId:'owner-phone-1',sessionId:'original-secure56',commandId:C,
  workSide:'RIGHT',chatSide:'LEFT',workWindowId:31,chatWindowId:30,
  workPackage:H,chatPackage:'com.openai.chatgpt',
  workBounds:'1100,0,2200,1800',chatBounds:'0,0,1100,1800',
  observedAt:t-500,nativeGeminiWindowVerified:true};
}
const task=()=>({schema:4,id:T,commandId:C,backend:'JH_ANDROID_NATIVE',
 deviceId:'owner-phone-1',sessionId:'original-secure56',
 workSide:'RIGHT',chatSide:'LEFT',mode:'YOUTUBE',cancelled:false,
 promptDigest:P,pending:{kind:'SUBMIT'},phase:'TYPED',
 sentMessageId:null});
const attempt=()=>({ok:true,code:'ORIGINAL_SIGNED_GEMINI_APPROVED_LOCAL_CLICK_ATTEMPT',
 taskId:T,originalJobId:J,localClickAttemptVerified:true,
 googleSentMessageIdVerified:false,chatGptDeliveryVerified:false,
 fullReplyVerified:false,promptDigest:P,localAttemptDigest:A});
const visible=()=>({ok:true,code:'SIGNED_GEMINI_VISIBLE_SEQUENCE_CANDIDATE_UNVERIFIED',
 taskId:T,visibleTurnCandidate:true,
 fullReplyVerified:false,requestTurnVerified:false,
 conversationVerified:false,sentMessageIdProven:false,
 masked:true,autoDeliver:false,fragmentCount:1,
 fragments:[{maskedText:'요약된 내용 일부만 확인',digest:'d'.repeat(64),
  visibleLength:13,nodePartial:true}]});
async function fixture(fn){
 const dir=await mkdtemp(join(tmpdir(),'jh-v4-evidence-chain-'));
 try{
  // The ORIGINAL file lock uses mtimeMs from the actual filesystem.
  // Keep its clock aligned with that filesystem during concurrency tests;
  // a synthetic future date would falsely mark a live lock as stale.
  let now=Date.now(),own=expectedOwner(now),t=task(),att=attempt(),vis=visible();
  const calls={attest:0,visible:0,readTask:0,readOwner:0,verifyTask:0};
  const file='jh-original-execution-store.json';
  const store=new FileDurableExecutionStore({directory:dir,filename:file,clock:()=>now});
  await store.init();
  let onAttest=null,onVisible=null,onReadTask=null;
  const sendAttestor={
   verify:async()=>{calls.attest++;if(onAttest)await onAttest();return {...att}},
   capabilities:()=>({originalSecure56Required:true})
  };
  const visibleReply={
   read:async()=>{calls.visible++;if(onVisible)await onVisible();return structuredClone(vis)},
   capabilities:()=>({originalSecure56Required:true})
  };
  const opts={store,sendAttestor,visibleReply,enabled:true,clock:()=>now,
   readOriginalOwner:async()=>{calls.readOwner++;return {...own}},
   verifyOriginalOwner:async()=>true,
   readOriginalTask:async()=>{calls.readTask++;if(onReadTask)await onReadTask(calls.readTask);return {...t}},
   verifyOriginalTask:async()=>{calls.verifyTask++;return true}
  };
  const chain=createV4OriginalGeminiEvidenceChain(opts);
  const set=(part,fields)=>{
   if(part==='task')t={...t,...fields};
   if(part==='owner')own={...own,...fields};
   if(part==='attest')att={...att,...fields};
   if(part==='visible')vis={...vis,...fields};
  };
  const advance=()=>set('task',{pending:null,phase:'WAITING',sentMessageId:'verified-saved-message-1'});
  await fn({dir,file,store,chain,opts,calls,set,advance,
   tick:ms=>{now+=ms;own.observedAt=now-500},
   onAttest:f=>{onAttest=f},onVisible:f=>{onVisible=f},onReadTask:f=>{onReadTask=f}
  });
 }finally{await rm(dir,{recursive:true,force:true})}
}
test('host cannot construct evidence chain without actual original persistent file store and in-process ports',()=>{
 assert.throws(()=>createV4OriginalGeminiEvidenceChain({}),/ORIGINAL_SECURE56_EVIDENCE_CHAIN_PORTS_REQUIRED/);
});
test('signed approved phone click creates one original durable NON-REPLAYABLE witness',async()=>{
 await fixture(async x=>{
  const r=await x.chain.recordApprovedClick(sendReq);
  assert.equal(r.code,'ORIGINAL_GEMINI_CLICK_WITNESS_SAVED_NO_DELIVERY');
  assert.equal(r.ok,true);assert.equal(r.localClickAttemptVerified,true);
  assert.equal(r.googleMessageVerified,false);assert.equal(r.chatGptDelivered,false);
  assert.equal(x.calls.attest,1);
  const saved=await x.store.list();
  assert.equal(saved.length,1);
  assert.equal(saved[0].state,'NEEDS_REVIEW');assert.equal(saved[0].replayAllowed,false);
  assert.equal(saved[0].effectKind,'EXTERNAL_EFFECT');
  assert.equal(saved[0].metadata.localAttemptDigest,A);
  const raw=await readFile(x.store.filePath,'utf8');
  for(const xtra of ['original-exec-job-001','owner-phone-1','original-secure56',
   'verified-saved-message-1','Gemini password','approvalGrantToken'])
   assert.equal(raw.includes(xtra),false,xtra);
 });
});
test('before receiving a signed local click, later visible screen cannot be treated as request result',async()=>{
 await fixture(async x=>{
  const r=await x.chain.inspectVisibleCandidate(readReq);
  assert.equal(r.code,'PERSISTED_ORIGINAL_GEMINI_CLICK_WITNESS_REQUIRED');
  assert.equal(x.calls.visible,0);
 });
});
test('after click, only WAITING task with original sentMessageId can be correlated',async()=>{
 await fixture(async x=>{
  await x.chain.recordApprovedClick(sendReq);
  const blocked=await x.chain.inspectVisibleCandidate(readReq);
  assert.equal(blocked.code,'ORIGINAL_GEMINI_SENT_MESSAGE_STATE_REQUIRED');
  assert.equal(x.calls.visible,0);
  x.advance();
  const r=await x.chain.inspectVisibleCandidate(readReq);
  assert.equal(r.ok,true);
  assert.equal(r.code,'GEMINI_VISIBLE_PARTIAL_CORRELATED_NEEDS_GOOGLE_TURN_PROOF');
  assert.equal(r.sendClickAttested,true);assert.equal(r.visibleTurnCandidate,true);
  assert.equal(r.fragments[0].maskedText,'요약된 내용 일부만 확인');
  assert.equal(r.googleMessageVerified,false);
  assert.equal(r.fullReplyVerified,false);
  assert.equal(r.conversationVerified,false);
  assert.equal(r.chatGptDelivered,false);
  assert.equal(r.autoDeliver,false);assert.equal(r.automaticReplay,false);
  assert.equal(r.requiresGoogleTurnProof,true);
 });
});
test('the second signed owner/session/window must match original click witness',async()=>{
 await fixture(async x=>{
  await x.chain.recordApprovedClick(sendReq);x.advance();
  x.set('owner',{workWindowId:32});
  assert.equal((await x.chain.inspectVisibleCandidate(readReq)).code,
   'GEMINI_ORIGINAL_OWNER_CHANGED_SINCE_CLICK');
  assert.equal(x.calls.visible,0);
 });
});
test('current saved prompt must match original approved click prompt hash',async()=>{
 await fixture(async x=>{
  await x.chain.recordApprovedClick(sendReq);x.advance();
  x.set('task',{promptDigest:'f'.repeat(64)});
  assert.equal((await x.chain.inspectVisibleCandidate(readReq)).code,
   'ORIGINAL_GEMINI_SENT_MESSAGE_STATE_REQUIRED');
  assert.equal(x.calls.visible,0);
 });
});
test('cancelled task or changed session cannot be resumed to send or read',async()=>{
 await fixture(async x=>{
  await x.chain.recordApprovedClick(sendReq);x.advance();
  x.set('task',{cancelled:true});
  assert.equal((await x.chain.inspectVisibleCandidate(readReq)).ok,false);
  assert.equal(x.calls.visible,0);
 });
});
test('invalid or forged local-click attestation never writes durable evidence',async()=>{
 for(const change of [
  {ok:false},{code:'GOOGLE_SENT'},{promptDigest:'f'.repeat(64)},
  {googleSentMessageIdVerified:true},{localClickAttemptVerified:false},
  {localAttemptDigest:'not-hash'},{chatGptDeliveryVerified:true}
 ]){
  await fixture(async x=>{
   x.set('attest',change);
   const r=await x.chain.recordApprovedClick(sendReq);
   assert.equal(r.code,'ORIGINAL_LOCAL_CLICK_ATTEMPT_NOT_AUTHENTICATED',JSON.stringify(change));
   assert.equal((await x.store.list()).length,0);
  });
 }
});
test('duplicate same task is read-only across repeated calls and does not attest or click again',async()=>{
 await fixture(async x=>{
  assert.equal((await x.chain.recordApprovedClick(sendReq)).ok,true);
  const second=await x.chain.recordApprovedClick(sendReq);
  assert.equal(second.code,'GEMINI_CLICK_PROOF_ALREADY_RECORDED_READ_ONLY');
  assert.equal(x.calls.attest,1);
 });
});
test('persisted click witness is visible after PROCESS RESTART through original store',async()=>{
 await fixture(async x=>{
  await x.chain.recordApprovedClick(sendReq);x.advance();
  const reopened=new FileDurableExecutionStore({directory:x.dir,filename:x.file,clock:x.opts.clock,
   instanceId:'new-host-process'});
  const next=createV4OriginalGeminiEvidenceChain({...x.opts,store:reopened});
  const r=await next.inspectVisibleCandidate(readReq);
  assert.equal(r.ok,true);
  assert.equal((await next.recordApprovedClick(sendReq)).code,'GEMINI_CLICK_PROOF_ALREADY_RECORDED_READ_ONLY');
  const history=await reopened.recoverInterrupted({force:true});
  assert.ok(Array.isArray(history));
  const saved=await reopened.list();
  assert.equal(saved[0].replayAllowed,false);
  assert.equal(saved[0].state,'NEEDS_REVIEW');
 });
});
test('two simultaneous records in one process must never both attest',async()=>{
 await fixture(async x=>{
  let started,release;
  const begun=new Promise(r=>started=r),gate=new Promise(r=>release=r);
  x.onAttest(async()=>{started();await gate});
  const first=x.chain.recordApprovedClick(sendReq);
  await begun;
  const other=await x.chain.recordApprovedClick(sendReq);
  assert.equal(other.code,'GEMINI_EVIDENCE_WORK_ALREADY_IN_PROGRESS');
  release();assert.equal((await first).ok,true);
  assert.equal(x.calls.attest,1);
 });
});
test('two independent host instances share atomic original durable file claim',async()=>{
 await fixture(async x=>{
  const second=createV4OriginalGeminiEvidenceChain({...x.opts});
  const r=await Promise.all([
   x.chain.recordApprovedClick(sendReq),second.recordApprovedClick(sendReq)
  ]);
  assert.equal(r.filter(v=>v.ok).length,1);
  assert.equal((await x.store.list()).length,1);
 });
});
test('misbound visible reply, forged full reply and multiple fragments never become verified',async()=>{
 for(const patch of [
  {ok:false},{code:'RESULT_IN_CHATGPT'}, {taskId:'other-task-id'},
  {fullReplyVerified:true},{requestTurnVerified:true},
  {conversationVerified:true},{sentMessageIdProven:true},
  {autoDeliver:true},{visibleTurnCandidate:false},
  {fragmentCount:2},{fragments:[]},{fragments:[{maskedText:'x',digest:'bad',visibleLength:1,nodePartial:false}]}
 ]){
  await fixture(async x=>{
   await x.chain.recordApprovedClick(sendReq);x.advance();
   x.set('visible',patch);
   const r=await x.chain.inspectVisibleCandidate(readReq);
   assert.equal(r.code,'GEMINI_VISIBLE_REPLY_NOT_BOUND_TO_VERIFIED_REQUEST',JSON.stringify(patch));
  });
 }
});
test('if original phone owner changes DURING readback, no partial is released',async()=>{
 await fixture(async x=>{
  await x.chain.recordApprovedClick(sendReq);x.advance();
  x.onVisible(async()=>x.set('owner',{chatWindowId:60}));
  assert.equal((await x.chain.inspectVisibleCandidate(readReq)).code,
   'GEMINI_MESSAGE_OR_WINDOW_CHANGED_DURING_READBACK');
 });
});
test('if stored sent-message state changes during readback, no partial is released',async()=>{
 await fixture(async x=>{
  await x.chain.recordApprovedClick(sendReq);x.advance();
  x.onVisible(async()=>x.set('task',{sentMessageId:'another-sent-message'}));
  assert.equal((await x.chain.inspectVisibleCandidate(readReq)).code,
   'GEMINI_MESSAGE_OR_WINDOW_CHANGED_DURING_READBACK');
 });
});
test('old approved click witness expires without automatically issuing any new phone command',async()=>{
 await fixture(async x=>{
  await x.chain.recordApprovedClick(sendReq);x.advance();
  x.tick(2*60*60*1000+1);
  const r=await x.chain.inspectVisibleCandidate(readReq);
  assert.equal(r.code,'SIGNED_GEMINI_CLICK_WITNESS_EXPIRED');
  assert.equal(x.calls.visible,0);
 });
});
test('read-only reply in progress denies a simultaneous second reply read',async()=>{
 await fixture(async x=>{
  await x.chain.recordApprovedClick(sendReq);x.advance();
  let started,release;const began=new Promise(r=>started=r),gate=new Promise(r=>release=r);
  x.onVisible(async()=>{started();await gate});
  const first=x.chain.inspectVisibleCandidate(readReq);
  await began;
  const second=await x.chain.inspectVisibleCandidate(readReq);
  assert.equal(second.code,'GEMINI_EVIDENCE_WORK_ALREADY_IN_PROGRESS');
  release();assert.equal((await first).ok,true);
  assert.equal(x.calls.visible,1);
 });
});
test('no live UI, new executor, or automatic delivery is advertised by this candidate',async()=>{
 await fixture(async x=>{
  const c=x.chain.capabilities();
  assert.equal(c.originalJHPersistentStore,true);
  assert.equal(c.readOnlyCorrelation,true);
  assert.equal(c.chatGptDeliveryAttached,false);
  assert.equal(c.productionRegistered,false);
  assert.equal(c.googleMessageVerified,false);
 });
});

test('an unavailable original ledger is reported as blocked, not success or automatic retry',async()=>{
 await fixture(async x=>{
  x.store.get=async()=>{throw Error('encrypted store unavailable')};
  const r=await x.chain.recordApprovedClick(sendReq);
  assert.equal(r.code,'ORIGINAL_GEMINI_DURABLE_EVIDENCE_STORE_UNAVAILABLE');
  assert.equal(r.automaticReplay,false);
  assert.equal(x.calls.attest,0);
 });
});
test('Gemini task phase changing during signed screen readback revokes the partial result',async()=>{
 await fixture(async x=>{
  await x.chain.recordApprovedClick(sendReq);x.advance();
  x.onVisible(async()=>x.set('task',{phase:'TYPED'}));
  const r=await x.chain.inspectVisibleCandidate(readReq);
  assert.equal(r.code,'GEMINI_MESSAGE_OR_WINDOW_CHANGED_DURING_READBACK');
  assert.equal(r.chatGptDelivered,false);
 });
});
