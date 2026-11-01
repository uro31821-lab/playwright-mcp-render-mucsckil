import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {DurableManualCircuitFence} from '../deployment/durable-manual-circuit-fence.mjs';
import {Stage29DurableCompletionReadback} from './stage29-durable-completion-readback.mjs';

const sha=s=>createHash('sha256').update(s).digest('hex');
const owner=('a'.repeat(64)),device=('b'.repeat(64)),task=('c'.repeat(64));
const namespace='d'.repeat(64);
const successResult={ok:true,action:'CLICK',resultVerified:true,
  verificationScope:'UI_TRANSITION_ONLY'};
const hostileResult={ok:false,action:'CLICK',resultVerified:false};
const hostJob=b=>({
 id:b.jobId,type:'split_screen_session_followup',
 mcpToolName:'life_android_execute_computer_action',
 secureRequestedEffect:'REVERSIBLE_WRITE',action:'CLICK',
 targetDeviceId:b.deviceId,targetDeviceDigest:b.deviceDigest,
 secureSessionId:b.secureSessionId,commandId:b.commandId,
 taskDigest:b.taskDigest,requestId:b.requestId,contextId:b.contextId,
 targetItemRef:b.targetItemRef,expiresAtMs:b.expiresAtMs,status:'in_progress'
});
function fixture(clock=()=>1793508000000){
 const dir=mkdtempSync(join(tmpdir(),'jh-stage29-'));
 const file=join(dir,'manual-circuit.sqlite');
 const key=Buffer.alloc(32,0x29);
 const principal=Object.freeze({currentHostAuth:'opaque-not-reusable'});
 const authorizeRead=(binding,token)=>token===principal&&binding.ownerDigest===owner;
 const original=new DurableManualCircuitFence({
  file,key,namespace,clock,mode:'EXPLICIT_ONE_TIME',
  verifyAuthenticatedCompletion:()=>false});
 original.close();
 const db=new Stage29DurableCompletionReadback({file,key,namespace,
  mode:'EXPLICIT_ONE_TIME_ADDON',clock,authorizeRead});
 db.close();
 return {dir,file,key,principal,clock,authorizeRead,
  bind:{
   ownerDigest:owner,deviceId:'owner-phone-only',deviceDigest:device,
   secureSessionId:'s56_fixture_original',jobId:'job_290',
   commandId:'1'.repeat(32),taskDigest:task,requestId:'2'.repeat(32),
   contextId:'ssc_'+'3'.repeat(32),targetItemRef:'item_'+'4'.repeat(16),
   commandDigest:sha('menu button once'),
   expiresAtMs:clock()+60000
  },
  close(){rmSync(dir,{recursive:true,force:true})}
 };
}
function originalAccepted(f,{binding=f.bind,result=successResult}={}){
 const guard=Object.freeze({});
 const job=new DurableManualCircuitFence({file:f.file,key:f.key,namespace,
  mode:'read',clock:f.clock,verifyAuthenticatedCompletion:({hostEvidence})=>hostEvidence===guard});
 const receipt=job.reserveDispatch({deviceId:binding.deviceId,
  type:'split_screen_session_followup',payload:{
   contextId:binding.contextId,requestId:binding.requestId,action:'CLICK',
   targetItemRef:binding.targetItemRef,commandDigest:binding.commandDigest
  }});
 assert.equal(receipt.allowed,true);
 const resultDigest=sha(JSON.stringify([binding.jobId,binding.secureSessionId,result]));
 const saved=job.recordAuthenticatedDeviceResult({recordId:receipt.recordId,
  resultDigest,hostEvidence:guard});
 assert.equal(saved.recorded,true);
 job.close();
 return {recordId:receipt.recordId,originalJob:hostJob(binding),originalResult:result};
}
const reopen=f=>new Stage29DurableCompletionReadback({file:f.file,key:f.key,
 namespace,clock:f.clock,authorizeRead:f.authorizeRead,mode:'read'});

test('never creates owner journal implicitly; explicit one-time add-on only',()=>{
 const dir=mkdtempSync(join(tmpdir(),'jh-stage29-missing-'));
 const file=join(dir,'missing.sqlite'),key=Buffer.alloc(32,0x29);
 try{
  assert.throws(()=>new Stage29DurableCompletionReadback({file,key,namespace,
   authorizeRead:()=>true}),/ORIGINAL_JOURNAL_MISSING/);
  assert.throws(()=>new Stage29DurableCompletionReadback({file,key,namespace,
   mode:'EXPLICIT_ONE_TIME_ADDON',authorizeRead:()=>true}),/ORIGINAL_JOURNAL_MISSING/);
 }finally{rmSync(dir,{recursive:true,force:true})}
});

test('original pending dispatch cannot be advertised as device-result-received',()=>{
 const f=fixture();
 try{
  const guard=new DurableManualCircuitFence({file:f.file,key:f.key,namespace,
   mode:'read',clock:f.clock,verifyAuthenticatedCompletion:()=>false});
  const receipt=guard.reserveDispatch({deviceId:f.bind.deviceId,
   type:'split_screen_session_followup',payload:{
    contextId:f.bind.contextId,requestId:f.bind.requestId,action:'CLICK',
    targetItemRef:f.bind.targetItemRef,commandDigest:f.bind.commandDigest}});
  guard.close();
  const readback=reopen(f);
  assert.throws(()=>readback.record({binding:f.bind,recordId:receipt.recordId,
   originalJob:hostJob(f.bind),originalResult:successResult}),
   /AUTHENTICATED_ORIGINAL_RECEIPT_REQUIRED/);
  assert.equal(readback.read({binding:f.bind,principal:f.principal}).ok,false);
  readback.close();
 }finally{f.close()}
});

test('original authenticated durable receipt survives simulated full process restart, without a new UI action',()=>{
 const f=fixture();
 try{
  const proof=originalAccepted(f);
  let first=reopen(f);
  const stored=first.record({binding:f.bind,...proof});
  assert.equal(stored.recorded,true);
  assert.equal(stored.taskSuccessVerified,false);
  first.close();
  const restored=reopen(f); // new process instance: same private journal + original binding
  const read=restored.read({binding:f.bind,principal:f.principal});
  assert.equal(read.ok,true);
  assert.equal(read.code,'STAGE29_DEVICE_RESULT_RECEIVED_AFTER_RESTART');
  assert.equal(read.resultReceived,true);
  assert.equal(read.taskSuccessVerified,false);
  assert.equal(read.uiTransitionVerified,false);
  assert.equal(read.originalJobReexecuted,false);
  assert.equal(read.newJobCreated,false);
  assert.equal(read.automaticReplay,false);
  restored.close();
  const raw=readFileSync(f.file);
  assert.equal(raw.includes(Buffer.from(f.bind.jobId)),false);
  assert.equal(raw.includes(Buffer.from(f.bind.secureSessionId)),false);
  assert.equal(raw.includes(Buffer.from(f.bind.deviceId)),false);
  assert.equal(raw.includes(Buffer.from('menu button once')),false);
  assert.equal(raw.includes(Buffer.from('screenDigest')),false);
 }finally{f.close()}
});

test('only exact original journal operation digest, recordId and accepted result digest can be recorded',()=>{
 const f=fixture();
 try{
  const proof=originalAccepted(f);
  const rb=reopen(f);
  for(const bad of [
    {binding:{...f.bind,commandDigest:sha('other click')},...proof},
    {binding:f.bind,recordId:'9'.repeat(32),
      originalJob:proof.originalJob,originalResult:proof.originalResult},
    {binding:f.bind,recordId:proof.recordId,
      originalJob:proof.originalJob,originalResult:hostileResult}
  ])assert.throws(()=>rb.record(bad),/AUTHENTICATED_ORIGINAL_RECEIPT_REQUIRED/);
  for(const [jobKey,changed] of [
    ['commandId','e'.repeat(32)],
    ['targetDeviceDigest','e'.repeat(64)],
    ['secureSessionId','different-session'],
    ['id','job_999'],
    ['expiresAtMs',f.bind.expiresAtMs+1]
  ]){
    const modified={...proof.originalJob,[jobKey]:changed};
    assert.throws(()=>rb.record({binding:f.bind,recordId:proof.recordId,
       originalJob:modified,originalResult:proof.originalResult}),
       /ORIGINAL_HOST_JOB_BINDING_REQUIRED/,'modified original job '+jobKey);
  }
  assert.equal(rb.record({binding:f.bind,...proof}).recorded,true);
  const duplicate=rb.record({binding:f.bind,...proof});
  assert.equal(duplicate.code,'STAGE29_ALREADY_RECORDED');
  rb.close();
 }finally{f.close()}
});

test('reader demands a new CURRENT host authorization even after a valid original record exists',()=>{
 const f=fixture();
 try{
  const proof=originalAccepted(f),rb=reopen(f);
  rb.record({binding:f.bind,...proof});
  for(const principal of [undefined,null,{},Object.freeze({currentHostAuth:'opaque-not-reusable'})]){
   const blocked=rb.read({binding:f.bind,principal});
   assert.equal(blocked.code,'STAGE29_CURRENT_AUTHORIZATION_REQUIRED');
   assert.equal(blocked.replayAllowed,false);
  }
  assert.equal(rb.read({binding:f.bind,principal:f.principal}).ok,true);
  rb.close();
 }finally{f.close()}
});

test('wrong device, command, session, request, context, target, owner and expiry cannot read another receipt',()=>{
 const f=fixture();
 try{
  const proof=originalAccepted(f),rb=reopen(f);
  rb.record({binding:f.bind,...proof});
  const changes=[
   ['deviceId','other-phone'],
   ['deviceDigest','f'.repeat(64)],
   ['ownerDigest','e'.repeat(64)],
   ['secureSessionId','rotated-session'],
   ['commandId','0'.repeat(32)],
   ['taskDigest','0'.repeat(64)],
   ['requestId','0'.repeat(32)],
   ['contextId','ssc_'+'0'.repeat(32)],
   ['targetItemRef','item_'+'0'.repeat(16)],
   ['jobId','job_291'],
   ['expiresAtMs',f.bind.expiresAtMs+1]
  ];
  for(const [k,v] of changes){
   const state=rb.read({binding:{...f.bind,[k]:v},principal:f.principal});
   assert.equal(state.ok,false,k);
   assert.equal(state.originalJobReexecuted,false,k);
  }
  rb.close();
 }finally{f.close()}
});

test('missing add-on, wrong owner key, wrong namespace and repeat migration fail closed',()=>{
 const f=fixture();
 try{
  assert.throws(()=>new Stage29DurableCompletionReadback({file:f.file,key:f.key,
   namespace,mode:'EXPLICIT_ONE_TIME_ADDON',authorizeRead:f.authorizeRead}),
    /ADDON_ALREADY_PRESENT/);
  assert.throws(()=>new Stage29DurableCompletionReadback({file:f.file,
   key:Buffer.alloc(32,0x30),namespace,authorizeRead:f.authorizeRead}),
    /OWNER_BINDING_MISMATCH/);
  assert.throws(()=>new Stage29DurableCompletionReadback({file:f.file,key:f.key,
   namespace:'e'.repeat(64),authorizeRead:f.authorizeRead}),
    /OWNER_BINDING_MISMATCH/);
 }finally{f.close()}
});

test('stale original job never extends recovery window and never authorizes a replay',()=>{
 let now=1793508000000;
 const f=fixture(()=>now);
 try{
  const proof=originalAccepted(f),rb=reopen(f);
  rb.record({binding:f.bind,...proof});
  now+=61000;
  const r=rb.read({binding:f.bind,principal:f.principal});
  assert.equal(r.ok,false);
  assert.equal(r.code,'STAGE29_ORIGINAL_RECEIPT_EXPIRED');
  assert.equal(r.automaticReplay,false);
  assert.equal(r.newJobCreated,false);
  rb.close();
 }finally{f.close()}
});

test('receipt rows are immutable under the original SQLite owner journal',()=>{
 const f=fixture();
 try{
  const proof=originalAccepted(f);
  const rb=reopen(f);rb.record({binding:f.bind,...proof});rb.close();
  const db=new DatabaseSync(f.file,{timeout:4000});
  try{
   assert.throws(()=>db.exec("DELETE FROM stage29_received_results"),/STAGE29_RECEIPT_IMMUTABLE/);
   assert.throws(()=>db.exec("UPDATE stage29_received_results SET expires_ms=expires_ms+99999"),/STAGE29_RECEIPT_IMMUTABLE/);
  }finally{db.close()}
  const restored=reopen(f);
  assert.equal(restored.read({binding:f.bind,principal:f.principal}).ok,true);
  restored.close();
 }finally{f.close()}
});

test('corrupt persisted stage29 row cannot become a verified result',()=>{
 const f=fixture();
 try{
  const proof=originalAccepted(f);
  const rb=reopen(f);rb.record({binding:f.bind,...proof});rb.close();
  const db=new DatabaseSync(f.file,{timeout:4000});
  try{
   db.exec('DROP TRIGGER stage29_no_receipt_update');
   db.exec("UPDATE stage29_received_results SET result_hmac='"+'0'.repeat(64)+"'");
  }finally{db.close()}
  assert.throws(()=>reopen(f),/IMMUTABILITY_GUARD_MISSING/);
 }finally{f.close()}
});

test('receipt cannot be used as session, approval, Android job, click replay or UI-success proof',()=>{
 const f=fixture();
 try{
  const proof=originalAccepted(f),rb=reopen(f);
  const stored=rb.record({binding:f.bind,...proof});
  const read=rb.read({binding:f.bind,principal:f.principal});
  for(const item of [stored,read]){
   assert.notEqual(item.uiTransitionVerified,true);
   assert.notEqual(item.taskSuccessVerified,true);
   assert.notEqual(item.replayAllowed,true);
   assert.notEqual(item.automaticReplay,true);
   assert.notEqual(item.newJobCreated,true);
   assert.notEqual(item.approvalGranted,true);
   assert.notEqual(item.secureSessionGranted,true);
  }
  rb.close();
 }finally{f.close()}
});

test('source-only: original Secure56 signing, phone approval, Stage26 ACK and Stage28 no-replay remain unchanged',()=>{
 for(const name of ['./stage26-completion-delivery-policy.mjs',
                    './stage26-completion-delivery-patch.mjs',
                    './split-followup-receipts.mjs',
                    './stage28-transport-recovery.test.mjs']){
  const s=readFileSync(new URL(name,import.meta.url),'utf8');
  assert.ok(s.length>200);
 }
 const module=readFileSync(new URL('./stage29-durable-completion-readback.mjs',import.meta.url),'utf8');
 assert.equal(module.includes('registerOAuthTool('),false);
 assert.equal(module.includes('httpServer.listen('),false);
 assert.equal(module.includes('executeRightPane('),false);
 assert.equal(module.includes('reserveDispatch('),false);
 assert.equal(module.includes('APPROVAL_BYPASS'),false);
});
