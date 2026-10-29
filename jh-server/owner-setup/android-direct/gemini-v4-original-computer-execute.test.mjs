import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {FileDurableExecutionStore} from '../deployment/jh-result-verification/file-durable-execution-store.mjs';
import {createV4OriginalGeminiPrepareLedger} from './gemini-v4-original-computer-durable.mjs';
import {nativeTaskIdDigest} from './gemini-v4-original-computer-task-id.mjs';
import {nativeGeminiPrepareOwnerDigest} from './gemini-v4-original-computer-owner-scope.mjs';
import {createV4OriginalGeminiApprovedExecuteGate} from './gemini-v4-original-computer-execute.mjs';

const TASK='gemini-task-001',CMD='a'.repeat(32),PREP='b'.repeat(32),
 APPROVAL='c'.repeat(32),EXEC='d'.repeat(32);
const PROMPT='1'.repeat(64),ACTION='2'.repeat(64),MAC='3'.repeat(64);
const NOW=1800000000000;
const H='com.google.android.googlequicksearchbox';
const hash=s=>createHash('sha256').update(s,'utf8').digest('hex');
const req=()=>({taskId:TASK,commandId:CMD,prepareOperationId:PREP,
 approvalOperationId:APPROVAL,executionOperationId:EXEC});
const owner=()=>({current:true,secure56:true,backend:'JH_ANDROID_NATIVE',
 deviceId:'signed-fold',sessionId:'secure56-session',commandId:CMD,
 workSide:'RIGHT',chatSide:'LEFT',workPackage:H,chatPackage:'com.openai.chatgpt',
 workWindowId:71,chatWindowId:72,
 workBounds:'1000,0,2000,1800',chatBounds:'0,0,1000,1800',
 observedAt:NOW-100});
const task=()=>({schema:4,id:TASK,commandId:CMD,
 backend:'JH_ANDROID_NATIVE',mode:'YOUTUBE',workSide:'RIGHT',chatSide:'LEFT',
 cancelled:false,deviceId:'signed-fold',sessionId:'secure56-session',
 promptDigest:PROMPT,pending:{kind:'SUBMIT'}});
const signed=j=>({secureMac:MAC,securePayloadDigest:MAC,
 secureNonce:'secure-original-nonce-1234567',secureExpiresAt:NOW+50000,...j});
function mapper(){
 const src=readFileSync(resolve(dirname(fileURLToPath(import.meta.url)),
  '../server-integration/server.mjs'),'utf8');
 const a=src.indexOf('function computerPayload56(a={}){');
 const b=src.indexOf('function exactEnvelope56(',a);
 assert.ok(a>0&&b>a);
 assert.match(src.slice(b,b+950),
  /const p=\{\.\.\.computerPayload56\(args\),\.\.\.extra,mcpToolName/);
 assert.match(src,/registerOAuthTool\("life_android_execute_computer_action"/);
 return vm.runInNewContext('('+src.slice(a,b).trim()+')');
}
async function fixture(fn,overrides={}){
 const dir=await mkdtemp(join(tmpdir(),'jh-v4-original-execute-'));
 try{
  const store=new FileDurableExecutionStore({directory:dir});
  const ledger=createV4OriginalGeminiPrepareLedger({store});
  let o=owner(),t=task(),contractReady=true,grantVerified=true,
   freshVerified=true,queuedVerified=true,completedVerified=true,
   fakeApproval=false,prepareThrows=false,executeThrows=false,
   freshCount=0,executeCount=0,attestVerified=true;
  const prepared=signed({
   id:'original-prepare-job',type:'computer_use_action_prepare',
   status:'complete',targetDeviceId:o.deviceId,secureSessionId:o.sessionId,
   commandId:CMD,operationId:PREP,taskId:TASK,
   taskDigest:nativeTaskIdDigest(TASK),promptDigest:PROMPT,
   ownerBindingDigest:nativeGeminiPrepareOwnerDigest(o),
   actionDigest:ACTION,action:'CLICK',effect:'REVERSIBLE_WRITE',
   dataClass:'NONE',maxActionsInCall:1,index:0,
   x:500,y:650,viewportWidth:1000,viewportHeight:1800,
   result:{ok:false,code:'APPROVAL_REQUIRED',requiresFreshApproval:true}
  });
  const body={kind:'ORIGINAL_GEMINI_SUBMIT_PREPARE',
   commandId:CMD,taskId:TASK,taskDigest:nativeTaskIdDigest(TASK),
   promptDigest:PROMPT,ownerDeviceId:o.deviceId,ownerSessionId:o.sessionId,
   ownerBindingDigest:nativeGeminiPrepareOwnerDigest(o),actionDigest:ACTION};
  assert.equal(await ledger.claim(PREP,body),true);
  assert.equal(await ledger.attachJob(PREP,prepared.id,o,t),true);
  const approvalJob=signed({
   id:'original-approval-job',type:'computer_use_action_approval_request',
   status:'complete',targetDeviceId:o.deviceId,secureSessionId:o.sessionId,
   commandId:CMD,taskId:TASK,taskDigest:nativeTaskIdDigest(TASK),
   promptDigest:PROMPT,actionDigest:ACTION,
   ownerBindingDigest:nativeGeminiPrepareOwnerDigest(o),
   prepareOperationId:PREP,approvalOperationId:APPROVAL,action:'CLICK',
   result:{ok:true,code:'REQUESTED',requestToken:'original-request-token-secret'}
  });
  const approvalRecord=await store.claim({
   dedupeKey:'JH167_V4_GEMINI_APPROVAL:'+hash(APPROVAL),
   scope:'JH167_GEMINI_PHONE_APPROVAL_REQUEST',
   intentId:APPROVAL,commandDigest:hash(CMD)
  },{
   state:'DISPATCHING',replayAllowed:false,effectKind:'EXTERNAL_EFFECT',
   dispatchStartedAt:new Date(NOW).toISOString(),
   metadata:{
    jhV4OriginalApprovalRequest:true,
    approvalOperationId:APPROVAL,prepareOperationId:PREP,
    commandId:CMD,taskId:TASK,
    taskDigest:nativeTaskIdDigest(TASK),promptDigest:PROMPT,
    actionDigest:ACTION,ownerBindingDigest:nativeGeminiPrepareOwnerDigest(o),
    deviceId:o.deviceId,sessionId:o.sessionId,jobId:approvalJob.id
   }
  });
  assert.equal(approvalRecord.created,true);
  let grant={
   source:'ORIGINAL_ANDROID_ONE_SHOT',phoneLocalApproved:true,
   consumed:false,taskId:TASK,commandId:CMD,
   prepareOperationId:PREP,approvalOperationId:APPROVAL,
   deviceId:o.deviceId,sessionId:o.sessionId,
   approvalRequestJobId:approvalJob.id,
   taskDigest:nativeTaskIdDigest(TASK),promptDigest:PROMPT,
   actionDigest:ACTION,ownerBindingDigest:nativeGeminiPrepareOwnerDigest(o),
   actionApprovalGrantToken:'approved-original-phone-token-PRIVATE',
   expiresAtMs:NOW+30000
  };
  const originalMap=mapper(),jobs=new Map(),calls=[];
  const callbacks={
   store,enabled:true,clock:()=>NOW,
   originalPhoneGrantContractReady:async()=>contractReady,
   readOriginalOwner:async()=>structuredClone(o),
   verifyOriginalOwner:async x=>x.commandId===o.commandId&&x.deviceId===o.deviceId,
   readOriginalTask:async()=>structuredClone(t),
   verifyOriginalTask:async x=>x.id===t.id&&x.promptDigest===t.promptDigest,
   readOriginalPrepareOperation:id=>ledger.lookup(id),
   verifyOriginalPrepareOperation:(v,id)=>ledger.verify(v,id),
   readOriginalPrepareJob:async()=>structuredClone(prepared),
   verifyOriginalPrepareJob:async j=>j.secureMac===MAC,
   readOriginalApprovalRequestJob:async()=>structuredClone(approvalJob),
   verifyOriginalApprovalRequestJob:async j=>j.secureMac===MAC,
   readOriginalPhoneOneShotGrant:async()=>fakeApproval?
    {...grant,source:'CALLER_SUPPLIED_JSON'}:structuredClone(grant),
   verifyOriginalPhoneOneShotGrant:async()=>grantVerified,
   prepareOriginalApprovedAction:async(g,pre,ownerValue,taskValue,r)=>{
    freshCount++;
    if(prepareThrows)throw Error('original phone outcome unknown');
    return signed({
     id:'original-fresh-prepare',type:'computer_use_action_prepare',
     status:'complete',targetDeviceId:ownerValue.deviceId,
     secureSessionId:ownerValue.sessionId,
     commandId:r.commandId,taskId:r.taskId,
     taskDigest:nativeTaskIdDigest(TASK),promptDigest:PROMPT,
     ownerBindingDigest:nativeGeminiPrepareOwnerDigest(ownerValue),
     actionDigest:ACTION,approvalOperationId:APPROVAL,
     executionOperationId:EXEC,action:'CLICK',
     x:pre.x,y:pre.y,viewportWidth:pre.viewportWidth,
     viewportHeight:pre.viewportHeight,
     result:{ok:true,code:'READY',requiresFreshApproval:false,
      leaseToken:'fresh-original-phone-lease-token'}
    });
   },
   verifyOriginalFreshPreparedJob:async()=>freshVerified,
   exactOriginalEnvelope:async(tool,type,effect,args,extra)=>{
    executeCount++;
    if(executeThrows)throw Error('queued but server lost ack');
    const p={...originalMap(args),...extra,mcpToolName:tool,
     taskDigest:args.task_digest,secureRequestedEffect:effect};
    calls.push({tool,type,effect,args,extra});
    const job=signed({id:'original-execute-job',
     type,status:'queued',targetDeviceId:o.deviceId,
     secureSessionId:o.sessionId,...p});
    jobs.set(job.id,job);
    return {deviceId:o.deviceId,job};
   },
   verifyOriginalQueuedJob:async j=>queuedVerified&&j.secureMac===MAC,
   readOriginalJob:async id=>jobs.get(id),
   verifyOriginalCompletedJob:async j=>completedVerified&&j.secureMac===MAC&&j.status==='complete',
   sendAttestor:{
    verify:async ({commandId,taskId,originalJobId})=>attestVerified?{
     ok:true,code:'ORIGINAL_SIGNED_GEMINI_APPROVED_LOCAL_CLICK_ATTEMPT',
     taskId,originalJobId,localClickAttemptVerified:true,
     localAttemptDigest:'4'.repeat(64),
     googleSentMessageIdVerified:false,chatGptDeliveryVerified:false
    }:{ok:false,code:'UNVERIFIED'}
   },
   ...overrides
  };
  const gate=createV4OriginalGeminiApprovedExecuteGate(callbacks);
  await fn({
   gate,store,dir,calls,jobs,ledger,prepared,approvalJob,
   grant:()=>grant,
   count:()=>({fresh:freshCount,execute:executeCount}),
   changeOwner:v=>{o={...o,...v}},
   changeTask:v=>{t={...t,...v}},
   changeGrant:v=>{grant={...grant,...v}},
   setReady:v=>{contractReady=v},
   setVerifier:(kind,v)=>{
    if(kind==='grant')grantVerified=v;
    if(kind==='fresh')freshVerified=v;
    if(kind==='queued')queuedVerified=v;
    if(kind==='completed')completedVerified=v;
    if(kind==='attest')attestVerified=v;
   },
   setFailure:(kind,v)=>{
    if(kind==='prepare')prepareThrows=v;
    if(kind==='execute')executeThrows=v;
    if(kind==='fake')fakeApproval=v;
   }
  });
 }finally{await rm(dir,{recursive:true,force:true})}
}
test('no phone execution without an independent original Android grant contract',async()=>{
 await fixture(async h=>{
  h.setReady(false);
  const r=await h.gate.execute(req());
  assert.equal(r.code,'ORIGINAL_ANDROID_ONESHOT_GRANT_CONTRACT_UNVERIFIED');
  assert.deepEqual(h.count(),{fresh:0,execute:0});
 });
});
test('original one-shot approval needs BOTH exact scope and original verifier',async()=>{
 await fixture(async h=>{
  h.setFailure('fake',true);
  assert.equal((await h.gate.execute(req())).code,
   'ORIGINAL_PHONE_APPROVAL_GRANT_SCOPE_UNVERIFIED');
  h.setFailure('fake',false);
  h.setVerifier('grant',false);
  assert.equal((await h.gate.execute(req())).code,
   'ORIGINAL_PHONE_ONESHOT_GRANT_NOT_AUTHENTICATED');
  h.setVerifier('grant',true);
  h.changeGrant({expiresAtMs:NOW-1});
  assert.equal((await h.gate.execute(req())).code,
   'ORIGINAL_PHONE_APPROVAL_GRANT_SCOPE_UNVERIFIED');
  assert.deepEqual(h.count(),{fresh:0,execute:0});
 });
});
test('a fresh approved PREPARE and original Secure56 EXECUTE are queued once',async()=>{
 await fixture(async h=>{
  const r=await h.gate.execute(req());
  assert.equal(r.ok,true);assert.equal(r.executeQueued,true);
  assert.equal(r.code,'ORIGINAL_SIGNED_GEMINI_CLICK_EXECUTE_QUEUED_NOT_SENT_PROOF');
  assert.equal(r.googleMessageVerified,false);
  assert.deepEqual(h.count(),{fresh:1,execute:1});
  assert.equal(h.calls[0].tool,'life_android_execute_computer_action');
  assert.equal(h.calls[0].type,'computer_use_action_execute');
  assert.equal(h.calls[0].effect,'MUTATION');
  assert.equal(h.calls[0].args.action,'CLICK');
  assert.equal(h.calls[0].args.task_id,TASK);
  assert.equal(h.calls[0].args.task_digest,nativeTaskIdDigest(TASK));
  assert.equal(h.calls[0].args.action_approval_grant_token,
   'approved-original-phone-token-PRIVATE');
  assert.equal(h.calls[0].extra.leaseToken,'fresh-original-phone-lease-token');
  assert.equal(h.calls[0].extra.promptDigest,PROMPT);
  assert.equal(h.calls[0].extra.actionDigest,ACTION);
  const dupe=await h.gate.execute({...req(),executionOperationId:'e'.repeat(32)});
  assert.equal(dupe.code,'ORIGINAL_GEMINI_EXECUTION_ALREADY_RESERVED_NO_REPLAY');
  assert.deepEqual(h.count(),{fresh:1,execute:1});
 });
});
test('a queued EXECUTE is not a sent message; signed completion and local click proof are separate',async()=>{
 await fixture(async h=>{
  await h.gate.execute(req());
  const pending=await h.gate.status(req());
  assert.equal(pending.code,'ORIGINAL_GEMINI_EXECUTE_JOB_PENDING_NOT_PROOF');
  assert.equal(pending.localClickAttemptVerified,false);
  const job=h.jobs.get('original-execute-job');
  job.status='complete';job.result={dispatched:true,resultVerified:false};
  h.setVerifier('completed',false);
  assert.equal((await h.gate.status(req())).code,
   'ORIGINAL_GEMINI_EXECUTION_COMPLETION_UNAUTHENTICATED');
  h.setVerifier('completed',true);h.setVerifier('attest',false);
  assert.equal((await h.gate.status(req())).code,'ORIGINAL_GEMINI_CLICK_NOT_ATTESTED');
  h.setVerifier('attest',true);
  const ok=await h.gate.status(req());
  assert.equal(ok.localClickAttemptVerified,true);
  assert.equal(ok.googleMessageVerified,false);
  assert.equal(ok.chatGptDelivered,false);
  assert.deepEqual(h.count(),{fresh:1,execute:1});
 });
});
test('changed task, owner or native approval cannot use a stale signed grant',async()=>{
 for(const which of ['task','window','cancel','grant']){
  await fixture(async h=>{
   if(which==='task')h.changeTask({promptDigest:'5'.repeat(64)});
   if(which==='window')h.changeOwner({workBounds:'1100,0,2100,1800'});
   if(which==='cancel')h.changeTask({cancelled:true});
   if(which==='grant')h.changeGrant({actionDigest:'6'.repeat(64)});
   const r=await h.gate.execute(req());
   assert.equal(r.ok,false,which);
   assert.deepEqual(h.count(),{fresh:0,execute:0},which);
  });
 }
});
test('fresh approved PREPARE failure is permanently fenced, never retried',async()=>{
 await fixture(async h=>{
  h.setFailure('prepare',true);
  const r=await h.gate.execute(req());
  assert.equal(r.code,'ORIGINAL_APPROVED_REPREPARE_OUTCOME_UNKNOWN_NO_REPLAY');
  h.setFailure('prepare',false);
  assert.equal((await h.gate.execute(req())).code,
   'ORIGINAL_GEMINI_EXECUTION_ALREADY_RESERVED_NO_REPLAY');
  assert.deepEqual(h.count(),{fresh:1,execute:0});
 });
});
test('signature failure after a fresh phone PREPARE cannot dispatch or retry',async()=>{
 await fixture(async h=>{
  h.setVerifier('fresh',false);
  assert.equal((await h.gate.execute(req())).code,
   'ORIGINAL_APPROVED_REPREPARE_UNAUTHENTICATED_NO_REPLAY');
  h.setVerifier('fresh',true);
  assert.equal((await h.gate.execute(req())).code,
   'ORIGINAL_GEMINI_EXECUTION_ALREADY_RESERVED_NO_REPLAY');
  assert.deepEqual(h.count(),{fresh:1,execute:0});
 });
});
test('an uncertain original Secure56 EXECUTE enqueue does not replay',async()=>{
 await fixture(async h=>{
  h.setFailure('execute',true);
  assert.equal((await h.gate.execute(req())).code,
   'ORIGINAL_GEMINI_EXECUTE_QUEUE_OUTCOME_UNKNOWN_NO_REPLAY');
  h.setFailure('execute',false);
  assert.equal((await h.gate.execute(req())).code,
   'ORIGINAL_GEMINI_EXECUTION_ALREADY_RESERVED_NO_REPLAY');
  assert.deepEqual(h.count(),{fresh:1,execute:1});
 });
});
test('original signed job verifier refusal preserves permanent no-replay fence',async()=>{
 await fixture(async h=>{
  h.setVerifier('queued',false);
  assert.equal((await h.gate.execute(req())).code,
   'ORIGINAL_GEMINI_EXECUTE_QUEUE_NOT_AUTHENTICATED_NO_REPLAY');
  h.setVerifier('queued',true);
  assert.equal((await h.gate.execute(req())).code,
   'ORIGINAL_GEMINI_EXECUTION_ALREADY_RESERVED_NO_REPLAY');
  assert.deepEqual(h.count(),{fresh:1,execute:1});
 });
});
test('raw grant and lease never persist to real original durable store',async()=>{
 await fixture(async h=>{
  await h.gate.execute(req());
  const text=await readFile(h.store.filePath,'utf8');
  for(const secret of ['approved-original-phone-token-PRIVATE',
   'fresh-original-phone-lease-token','original-request-token-secret']){
   assert.equal(text.includes(secret),false,secret);
  }
  const reread=new FileDurableExecutionStore({directory:h.dir,
   instanceId:'server-process-restart'});
  await reread.recoverInterrupted({force:true});
  const entries=await reread.list();
  const record=entries.find(x=>x.metadata?.jhV4ApprovedGeminiExecute===true);
  assert.equal(record?.replayAllowed,false);
  assert.equal(record?.state,'NEEDS_REVIEW');
  assert.equal(record?.metadata.jobId,'original-execute-job');
  assert.equal((await h.gate.execute(req())).code,
   'ORIGINAL_GEMINI_EXECUTION_ALREADY_RESERVED_NO_REPLAY');
  assert.deepEqual(h.count(),{fresh:1,execute:1});
 });
});
test('disabled candidate remains isolated from production Secure56 and Android',async()=>{
 await fixture(async h=>{
  const c=h.gate.capabilities();
  assert.equal(c.originalApprovedReprepareRequired,true);
  assert.equal(c.productionRegistered,false);
  assert.equal(c.chatGptDeliveryConnected,false);
  assert.equal(c.automaticReplay,false);
 });
});
