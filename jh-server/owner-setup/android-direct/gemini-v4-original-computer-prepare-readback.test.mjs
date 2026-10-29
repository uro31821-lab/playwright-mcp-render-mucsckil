import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {FileDurableExecutionStore} from '../deployment/jh-result-verification/file-durable-execution-store.mjs';
import {nativeTaskIdDigest} from './gemini-v4-original-computer-task-id.mjs';
import {nativeGeminiPrepareOwnerDigest} from './gemini-v4-original-computer-owner-scope.mjs';
import {createV4OriginalGeminiPrepareLedger} from './gemini-v4-original-computer-durable.mjs';
import {createV4OriginalSecure56GeminiPreparePort} from './gemini-v4-original-computer-prepare.mjs';
import {createV4OriginalGeminiPrepareStatusPort} from './gemini-v4-original-computer-prepare-status.mjs';

const TASK='gemini-task-001',CMD='a'.repeat(32),OP='b'.repeat(32);
const P='c'.repeat(64),ACT='d'.repeat(64),MAC='e'.repeat(64);
const HOST='com.google.android.googlequicksearchbox';
const now=Date.now();
const owner=()=>({backend:'JH_ANDROID_NATIVE',current:true,secure56:true,
 deviceId:'real-fold',sessionId:'session-secure56',commandId:CMD,
 workSide:'RIGHT',chatSide:'LEFT',workPackage:HOST,
 chatPackage:'com.openai.chatgpt',
 workWindowId:21,chatWindowId:22,
 workBounds:'1000,0,2000,1800',chatBounds:'0,0,1000,1800',
 observedAt:now-100});
const task=()=>({schema:4,id:TASK,commandId:CMD,
 backend:'JH_ANDROID_NATIVE',mode:'YOUTUBE',
 workSide:'RIGHT',chatSide:'LEFT',deviceId:'real-fold',
 sessionId:'session-secure56',cancelled:false,
 promptDigest:P,pending:{kind:'SUBMIT'}});
const target=()=>({taskId:TASK,commandId:CMD,
 deviceId:'real-fold',sessionId:'session-secure56',
 actionKind:'CLICK',purpose:'GEMINI_SUBMIT',
 packageName:HOST,windowId:21,
 promptDigest:P,screenDigest:'f'.repeat(64),
 actionDigest:ACT,globalX:1500,globalY:700,observedAtMs:now-100});
const request=()=>({taskId:TASK,commandId:CMD,operationId:OP});
async function withFixture(fn){
 const dir=await mkdtemp(join(tmpdir(),'jh-v4-prepare-original-'));
 try{
  const store=new FileDurableExecutionStore({directory:dir});
  const ledger=createV4OriginalGeminiPrepareLedger({store});
  let currentOwner=owner(),currentTask=task(),signedJob=null;
  let dispatched=0;
  const funcs={
   clock:()=>now,enabled:true,
   readOwner:async()=>structuredClone(currentOwner),
   verifyOwner:async x=>x.deviceId===currentOwner.deviceId&&
     x.sessionId===currentOwner.sessionId&&x.commandId===currentOwner.commandId,
   readTask:async()=>structuredClone(currentTask),
   verifyTask:async x=>x.id===currentTask.id&&
     x.commandId===currentTask.commandId&&x.promptDigest===currentTask.promptDigest,
   readSignedSubmitTarget:async()=>target(),
   verifySignedSubmitTarget:async()=>true,
   claimOriginalOperation:(id,data)=>ledger.claim(id,data),
   attachOriginalJob:(id,jobId,o,t)=>ledger.attachJob(id,jobId,o,t),
   exactOriginalEnvelope:async (tool,type,effect,args,extra)=>{
    dispatched++;
    signedJob={
     id:'job-original-001',type,status:'queued',
     targetDeviceId:currentOwner.deviceId,
     secureSessionId:currentOwner.sessionId,
     taskId:args.task_id,taskDigest:args.task_digest,
     secureMac:MAC,securePayloadDigest:'f'.repeat(64),
     secureNonce:'real-secure56-nonce-string',
     secureExpiresAt:now+60000,
     ...extra
    };
    return {deviceId:currentOwner.deviceId,job:signedJob};
   },
   verifyOriginalQueuedJob:async j=>j.secureMac===MAC
  };
  const prepare=createV4OriginalSecure56GeminiPreparePort(funcs);
  let completedOk=true,queuedOk=true;
  const readback=createV4OriginalGeminiPrepareStatusPort({
   enabled:true,clock:()=>now,durable:ledger,
   readOriginalOwner:funcs.readOwner,verifyOriginalOwner:funcs.verifyOwner,
   readOriginalTask:funcs.readTask,verifyOriginalTask:funcs.verifyTask,
   readOriginalJob:async()=>signedJob,
   verifyOriginalQueuedJob:async j=>queuedOk&&j.secureMac===MAC,
   verifyOriginalCompletedJob:async j=>completedOk&&j.status==='complete'&&
     j.secureMac===MAC
  });
  await fn({store,dir,ledger,prepare,readback,
    job:()=>signedJob,count:()=>dispatched,
    changeOwner:v=>{currentOwner={...currentOwner,...v}},
    changeTask:v=>{currentTask={...currentTask,...v}},
    completedValid:v=>{completedOk=v},
    queuedValid:v=>{queuedOk=v}});
 }finally{await rm(dir,{recursive:true,force:true})}
}
test('prepare ledger requires the real original FileDurableExecutionStore',()=>{
 assert.throws(()=>createV4OriginalGeminiPrepareLedger({store:{}}),
  /ORIGINAL_JH_FILE_DURABLE_STORE_REQUIRED/);
});
test('signed Secure56 PREPARE is queued once then read back, without a second executor',async()=>{
 await withFixture(async h=>{
  const first=await h.prepare.prepare(request());
  assert.equal(first.ok,true);
  assert.equal(first.code,'SIGNED_GEMINI_SUBMIT_PREPARE_QUEUED');
  assert.equal(h.count(),1);
  const pending=await h.readback.status(request());
  assert.equal(pending.ok,true);
  assert.equal(pending.code,'ORIGINAL_GEMINI_PREPARE_QUEUED_READ_ONLY');
  assert.equal(pending.dispatched,false);
  assert.equal((await h.prepare.prepare(request())).ok,false);
  assert.equal(h.count(),1);
  const op=await h.ledger.lookup(OP);
  assert.equal(await h.ledger.verify(op,OP),true);
  assert.equal(op.taskDigest,nativeTaskIdDigest(TASK));
  assert.equal(op.ownerBindingDigest,nativeGeminiPrepareOwnerDigest(owner()));
  assert.equal(op.jobId,first.jobId);
 });
});
test('verified phone READY never exposes a raw lease or claims local send approval',async()=>{
 await withFixture(async h=>{
  await h.prepare.prepare(request());
  h.job().status='complete';
  h.job().result={ok:true,code:'READY',leaseToken:'original-phone-lease-secret',
   requiresFreshApproval:false};
  const r=await h.readback.status(request());
  assert.equal(r.code,'ORIGINAL_GEMINI_PREPARE_READY_STILL_NEEDS_LOCAL_SEND_REVIEW');
  assert.equal(r.ok,true);assert.equal(r.prepareReceiptVerified,true);
  assert.equal(r.phoneLocalApprovalRequired,true);
  assert.equal(r.phoneApprovalVerified,false);assert.equal(r.dispatched,false);
  assert.equal(r.phoneSendVerified,false);assert.equal(r.googleMessageVerified,false);
  assert.equal(JSON.stringify(r).includes('original-phone-lease-secret'),false);
  assert.equal(h.count(),1);
 });
});
test('verified original phone APPROVAL_REQUIRED remains a user-only boundary',async()=>{
 await withFixture(async h=>{
  await h.prepare.prepare(request());
  h.job().status='complete';
  h.job().result={ok:false,code:'APPROVAL_REQUIRED',requiresFreshApproval:true};
  const r=await h.readback.status(request());
  assert.equal(r.code,'ORIGINAL_GEMINI_PHONE_LOCAL_APPROVAL_REQUIRED');
  assert.equal(r.phoneApprovalVerified,false);
  assert.equal(r.phoneSendVerified,false);
  assert.equal(h.count(),1);
 });
});
test('unsigned phone result or changed signed scope cannot become READY',async()=>{
 await withFixture(async h=>{
  await h.prepare.prepare(request());
  h.job().status='complete';
  h.job().result={ok:true,code:'READY',leaseToken:'legitimate-phone-lease',
   requiresFreshApproval:false};
  h.completedValid(false);
  assert.equal((await h.readback.status(request())).code,
   'ORIGINAL_GEMINI_PREPARE_COMPLETION_NOT_AUTHENTICATED');
  h.completedValid(true);
  h.job().ownerBindingDigest='0'.repeat(64);
  assert.equal((await h.readback.status(request())).code,
   'ORIGINAL_GEMINI_PREPARE_JOB_SCOPE_CHANGED');
  h.job().ownerBindingDigest=nativeGeminiPrepareOwnerDigest(owner());
  h.job().operationId='f'.repeat(32);
  assert.equal((await h.readback.status(request())).code,
   'ORIGINAL_GEMINI_PREPARE_JOB_SCOPE_CHANGED');
  assert.equal(h.count(),1);
 });
});
test('owner or pending task changed after queue rejects old phone result',async()=>{
 await withFixture(async h=>{
  await h.prepare.prepare(request());
  h.job().status='complete';
  h.job().result={ok:true,code:'READY',leaseToken:'original-phone-lease-secret',
   requiresFreshApproval:false};
  h.changeOwner({workWindowId:99});
  assert.equal((await h.readback.status(request())).code,
   'ORIGINAL_GEMINI_PREPARE_OPERATION_UNKNOWN_NO_REPLAY');
 });
});
test('cancelled task or wrong command never reads a stale lease',async()=>{
 await withFixture(async h=>{
  await h.prepare.prepare(request());
  h.job().status='complete';
  h.job().result={ok:true,code:'READY',leaseToken:'original-phone-lease-secret',
   requiresFreshApproval:false};
  h.changeTask({cancelled:true});
  assert.equal((await h.readback.status(request())).code,
   'ORIGINAL_GEMINI_TASK_OR_OWNER_UNVERIFIED');
  assert.equal((await h.readback.status({...request(),commandId:'1'.repeat(32)})).ok,false);
 });
});
test('durable operation is never recreated after restart and contains no raw prompt or approval token',async()=>{
 await withFixture(async h=>{
  await h.prepare.prepare(request());
  const doc=await readFile(h.store.filePath,'utf8');
  for(const forbidden of ['approvalGrantToken','leaseToken','promptText','token-secret']){
   assert.equal(doc.includes(forbidden),false,forbidden);
  }
  const reopened=new FileDurableExecutionStore({
   directory:h.dir,instanceId:'another-original-server-process'
  });
  const after=createV4OriginalGeminiPrepareLedger({store:reopened});
  assert.equal(await after.claim(OP,{kind:'ORIGINAL_GEMINI_SUBMIT_PREPARE',
   commandId:CMD,taskId:TASK,taskDigest:nativeTaskIdDigest(TASK),
   promptDigest:P,
   ownerDeviceId:'real-fold',ownerSessionId:'session-secure56',
   ownerBindingDigest:nativeGeminiPrepareOwnerDigest(owner()),actionDigest:ACT}),false);
  const recovered=await reopened.recoverInterrupted({force:true});
  assert.ok(recovered.some(r=>r.toState==='NEEDS_REVIEW'));
  const record=await after.lookup(OP);
  assert.equal(record.state,'NEEDS_REVIEW');
  assert.equal(await after.verify(record,OP),true);
 });
});
test('claimed operation with lost phone job attachment cannot trigger replay',async()=>{
 await withFixture(async h=>{
  const body={kind:'ORIGINAL_GEMINI_SUBMIT_PREPARE',
   commandId:CMD,taskId:TASK,taskDigest:nativeTaskIdDigest(TASK),
   promptDigest:P,
   ownerDeviceId:'real-fold',ownerSessionId:'session-secure56',
   ownerBindingDigest:nativeGeminiPrepareOwnerDigest(owner()),actionDigest:ACT};
  assert.equal(await h.ledger.claim(OP,body),true);
  assert.equal((await h.readback.status(request())).code,
   'ORIGINAL_GEMINI_PREPARE_OPERATION_UNKNOWN_NO_REPLAY');
  assert.equal((await h.prepare.prepare(request())).code,
   'ORIGINAL_GEMINI_PREPARE_RESERVED_USE_STATUS');
  assert.equal(h.count(),0);
 });
});
