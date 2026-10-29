import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {FileDurableExecutionStore} from '../deployment/jh-result-verification/file-durable-execution-store.mjs';
import {createV4OriginalGeminiPrepareLedger} from './gemini-v4-original-computer-durable.mjs';
import {nativeTaskIdDigest} from './gemini-v4-original-computer-task-id.mjs';
import {nativeGeminiPrepareOwnerDigest} from './gemini-v4-original-computer-owner-scope.mjs';
import {createV4OriginalGeminiPhoneApprovalPort} from './gemini-v4-original-computer-approval.mjs';

const TASK='gemini-task-001',CMD='a'.repeat(32),
 PREP='b'.repeat(32),APPROVAL='c'.repeat(32);
const DIGEST='d'.repeat(64),PROMPT='e'.repeat(64),MAC='f'.repeat(64);
const NOW=1800000000000;
const H='com.google.android.googlequicksearchbox';
const request=()=>({taskId:TASK,commandId:CMD,prepareOperationId:PREP,
 approvalOperationId:APPROVAL});
const owner=()=>({current:true,secure56:true,backend:'JH_ANDROID_NATIVE',
 deviceId:'signed-fold',sessionId:'secure56-session',commandId:CMD,
 workSide:'RIGHT',chatSide:'LEFT',workPackage:H,
 chatPackage:'com.openai.chatgpt',
 workWindowId:71,chatWindowId:72,
 workBounds:'1000,0,2000,1800',chatBounds:'0,0,1000,1800',
 observedAt:NOW-100});
const task=()=>({schema:4,id:TASK,commandId:CMD,
 backend:'JH_ANDROID_NATIVE',mode:'YOUTUBE',
 workSide:'RIGHT',chatSide:'LEFT',cancelled:false,
 deviceId:'signed-fold',sessionId:'secure56-session',
 promptDigest:PROMPT,pending:{kind:'SUBMIT'}});
function originalComputerMapper(){
 const s=readFileSync(resolve(dirname(fileURLToPath(import.meta.url)),
  '../server-integration/server.mjs'),'utf8');
 const i=s.indexOf('function computerPayload56(a={}){');
 const j=s.indexOf('function exactEnvelope56(',i);
 assert.ok(i>=0&&j>i);
 assert.match(s,/registerOAuthTool\("life_android_action_approval_request"/);
 assert.match(s,/registerOAuthTool\("life_android_action_approval_status"/);
 assert.match(s.slice(j,j+950),/const p=\{\.\.\.computerPayload56\(args\),\.\.\.extra,mcpToolName/);
 return vm.runInNewContext('('+s.slice(i,j).trim()+')');
}
async function fixture(fn,patch={}){
 const dir=await mkdtemp(join(tmpdir(),'jh-v4-original-approval-'));
 try{
  const store=new FileDurableExecutionStore({directory:dir});
  const ledger=createV4OriginalGeminiPrepareLedger({store});
  let o=owner(),t=task(),verifyPrep=true,verifyQueue=true,verifyCompletion=true,
    verifyStatus=true,mutateJob=null,statusResult={code:'APPROVED',approvalGrantToken:'FAKE'},
    approvalResult={ok:true,code:'REQUESTED',requestToken:'signed-original-request-token'};
  const jobs=new Map(),calls=[];
  const map=originalComputerMapper();
  const body={kind:'ORIGINAL_GEMINI_SUBMIT_PREPARE',commandId:CMD,
   taskId:TASK,taskDigest:nativeTaskIdDigest(TASK),
   promptDigest:PROMPT,ownerDeviceId:o.deviceId,ownerSessionId:o.sessionId,
   ownerBindingDigest:nativeGeminiPrepareOwnerDigest(o),actionDigest:DIGEST};
  assert.equal(await ledger.claim(PREP,body),true);
  assert.equal(await ledger.attachJob(PREP,'original-prep-job',o,t),true);
  let prepared={id:'original-prep-job',
   type:'computer_use_action_prepare',status:'complete',
   targetDeviceId:o.deviceId,secureSessionId:o.sessionId,
   commandId:CMD,operationId:PREP,taskId:TASK,
   taskDigest:nativeTaskIdDigest(TASK),ownerBindingDigest:body.ownerBindingDigest,
   actionDigest:DIGEST,promptDigest:PROMPT,
   secureMac:MAC,securePayloadDigest:MAC,secureNonce:'secure-original-nonce-123',
   secureExpiresAt:NOW+100000,
   action:'CLICK',effect:'REVERSIBLE_WRITE',dataClass:'NONE',
   index:0,maxActionsInCall:1,x:500,y:650,viewportWidth:1000,
   viewportHeight:1800,
   result:{ok:false,code:'APPROVAL_REQUIRED',requiresFreshApproval:true}};
  const original={
   store,clock:()=>NOW,enabled:true,
   readOriginalOwner:async()=>structuredClone(o),
   verifyOriginalOwner:async x=>x.commandId===o.commandId&&x.deviceId===o.deviceId,
   readOriginalTask:async()=>structuredClone(t),
   verifyOriginalTask:async x=>x.id===t.id&&x.promptDigest===t.promptDigest,
   readOriginalPrepareOperation:id=>ledger.lookup(id),
   verifyOriginalPrepareOperation:(op,id)=>ledger.verify(op,id),
   readOriginalPrepareJob:async()=>structuredClone(prepared),
   verifyOriginalPreparedJob:async j=>verifyPrep&&j.secureMac===MAC,
   readOriginalPrepareStatus:async()=>({
    ok:true,code:'ORIGINAL_GEMINI_PHONE_LOCAL_APPROVAL_REQUIRED',
    phoneApprovalVerified:false,dispatched:false
   }),
   exactOriginalEnvelope:async(tool,type,effect,args,extra)=>{
    const p={...map(args),...extra,mcpToolName:tool,taskDigest:args.task_digest,
     secureRequestedEffect:effect};
    calls.push({tool,type,effect,args:structuredClone(args),
     extra:structuredClone(extra)});
    const job={id:'original-phone-job-'+calls.length,
     type,status:'queued',targetDeviceId:o.deviceId,
     secureSessionId:o.sessionId,secureMac:MAC,
     securePayloadDigest:MAC,secureNonce:'secure-original-nonce-123',
     secureExpiresAt:NOW+100000,...p};
    if(mutateJob)mutateJob(job);
    jobs.set(job.id,job);
    return {deviceId:o.deviceId,job};
   },
   readOriginalJob:async id=>jobs.get(id),
   verifyOriginalQueuedJob:async j=>verifyQueue&&j.secureMac===MAC,
   verifyOriginalCompletedJob:async j=>verifyCompletion&&j.secureMac===MAC&&j.status==='complete',
   waitOriginalJob:async id=>{
    const job=jobs.get(id);
    if(job?.type==='computer_use_action_approval_status'){
     job.status='complete';
     job.result=structuredClone(statusResult);
    }
    return job;
   },
   verifyOriginalPhoneApprovalStatus:async()=>verifyStatus
  };
  const ports={...original,...patch};
  const gate=createV4OriginalGeminiPhoneApprovalPort(ports);
  await fn({
   gate,store,ledger,prepared:()=>prepared,jobs,calls,dir,
   setPrepared:change=>{prepared={...prepared,...change}},
   setOwner:change=>{o={...o,...change}},
   setTask:change=>{t={...t,...change}},
   setApprovalResult:change=>{approvalResult={...approvalResult,...change}},
   completeRequest:()=>{
    const req=jobs.get('original-phone-job-1');
    if(req){req.status='complete';req.result=structuredClone(approvalResult)}
   },
   setStatus:change=>{statusResult={...statusResult,...change}},
   setVerifier:(key,v)=>{if(key==='prep')verifyPrep=v;
     if(key==='queue')verifyQueue=v;
     if(key==='complete')verifyCompletion=v;
     if(key==='status')verifyStatus=v},
   mutateJob:fn=>{mutateJob=fn}
  });
 }finally{await rm(dir,{recursive:true,force:true})}
}
test('only a REAL original file durable store and host verifiers are accepted',()=>{
 assert.throws(()=>createV4OriginalGeminiPhoneApprovalPort({store:{}}),
  /ORIGINAL_SECURE56_PHONE_APPROVAL_AND_DURABLE_PORTS_REQUIRED/);
});
test('one original signed local approval prompt is queued, never clicked or automatically approved',async()=>{
 await fixture(async h=>{
  const r=await h.gate.request(request());
  assert.equal(r.code,'ORIGINAL_GEMINI_PHONE_APPROVAL_REQUEST_QUEUED');
  assert.equal(r.phoneLocalApprovalVerified,false);
  assert.equal(r.dispatched,false);
  assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].tool,'life_android_action_approval_request');
  assert.equal(h.calls[0].type,'computer_use_action_approval_request');
  assert.equal(h.calls[0].effect,'REVERSIBLE_WRITE');
  assert.equal(h.calls[0].args.task_id,TASK);
  assert.equal(h.calls[0].args.task_digest,nativeTaskIdDigest(TASK));
  assert.equal(h.calls[0].args.x,500);
  assert.equal(h.calls[0].extra.prepareOperationId,PREP);
  assert.equal(h.calls[0].extra.approvalOperationId,APPROVAL);
  assert.equal(h.calls[0].extra.ownerBindingDigest,nativeGeminiPrepareOwnerDigest(owner()));
  assert.equal(h.calls[0].extra.promptDigest,PROMPT);
  assert.equal((await h.gate.request(request())).code,
   'ORIGINAL_GEMINI_APPROVAL_ALREADY_RESERVED_NO_REPLAY');
  assert.equal(h.calls.length,1);
 });
});
test('an approval request receipt only reports a phone prompt, never grants execution',async()=>{
 await fixture(async h=>{
  await h.gate.request(request());
  assert.equal((await h.gate.checkRequest(request())).code,
   'ORIGINAL_GEMINI_PHONE_APPROVAL_REQUEST_PENDING');
  h.completeRequest();
  const r=await h.gate.checkRequest(request());
  assert.equal(r.ok,true);
  assert.equal(r.code,'ORIGINAL_GEMINI_PHONE_APPROVAL_PROMPT_READY_TO_CHECK');
  assert.equal(r.phoneLocalApprovalVerified,false);
  assert.equal(h.calls.length,1);
  assert.equal(JSON.stringify(r).includes('signed-original-request-token'),false);
 });
});
test('read-only phone approval status cannot turn a reported APPROVED into a grant or execute',async()=>{
 await fixture(async h=>{
  await h.gate.request(request());h.completeRequest();
  const result=await h.gate.pollPhoneApproval(request());
  assert.equal(result.ok,true);
  assert.equal(result.code,'ORIGINAL_PHONE_APPROVAL_REPORTED_GRANT_CONTRACT_UNVERIFIED');
  assert.equal(result.phoneLocalApprovalVerified,false);
  assert.equal(result.executeAllowed,false);
  assert.equal(result.geminiMessageSent,false);
  assert.equal(h.calls[1].tool,'life_android_action_approval_status');
  assert.equal(h.calls[1].type,'computer_use_action_approval_status');
  assert.equal(h.calls[1].effect,'READ_ONLY');
  assert.equal(h.calls[1].args.request_token,'signed-original-request-token');
  assert.equal(h.calls[1].args.task_id,TASK);
  assert.equal(h.calls[1].args.task_digest,nativeTaskIdDigest(TASK));
  assert.equal(JSON.stringify(result).includes('signed-original-request-token'),false);
  assert.equal(h.calls.filter(x=>x.type==='computer_use_action_execute').length,0);
 });
});
test('denied or pending local approval does not dispatch a phone action',async()=>{
 await fixture(async h=>{
  await h.gate.request(request());h.completeRequest();
  h.setStatus({code:'DENIED'});
  const denied=await h.gate.pollPhoneApproval(request());
  assert.equal(denied.code,'ORIGINAL_PHONE_LOCAL_APPROVAL_REJECTED');
  h.setStatus({code:'PENDING'});
  const pending=await h.gate.pollPhoneApproval(request());
  assert.equal(pending.code,'ORIGINAL_PHONE_LOCAL_APPROVAL_NOT_CONFIRMED');
  assert.equal(pending.dispatched,false);
 });
});
test('no queued request when original prepared receipt, task or signed right window changes',async()=>{
 for(const variation of ['unsigned','window','task','cancel','type','no-review']){
  await fixture(async h=>{
   if(variation==='unsigned')h.setVerifier('prep',false);
   if(variation==='window')h.setOwner({workWindowId:99});
   if(variation==='task')h.setTask({promptDigest:'0'.repeat(64)});
   if(variation==='cancel')h.setTask({cancelled:true});
   if(variation==='type')h.setPrepared({action:'TYPE'});
   if(variation==='no-review')h.setPrepared({result:{ok:false,code:'FAILED'}});
   const r=await h.gate.request(request());
   assert.equal(r.ok,false,variation);
   assert.equal(h.calls.length,0,variation);
  });
 }
});
test('unsigned, wrong-scoped or uncertain original approval job never allows replay',async()=>{
 await fixture(async h=>{
  h.mutateJob(j=>{j.commandId='0'.repeat(32)});
  const r=await h.gate.request(request());
  assert.equal(r.code,'ORIGINAL_GEMINI_APPROVAL_QUEUE_UNVERIFIED_NO_REPLAY');
  assert.equal(h.calls.length,1);
  h.mutateJob(null);
  const again=await h.gate.request(request());
  assert.equal(again.code,'ORIGINAL_GEMINI_APPROVAL_ALREADY_RESERVED_NO_REPLAY');
  assert.equal(h.calls.length,1);
 });
});
test('original status completion requires both real signed job and original phone verifier',async()=>{
 await fixture(async h=>{
  await h.gate.request(request());h.completeRequest();
  h.setVerifier('status',false);
  assert.equal((await h.gate.pollPhoneApproval(request())).code,
   'ORIGINAL_GEMINI_PHONE_APPROVAL_STATUS_UNAUTHENTICATED');
  h.setVerifier('status',true);
  h.setVerifier('complete',false);
  assert.equal((await h.gate.pollPhoneApproval(request())).code,
   'ORIGINAL_GEMINI_APPROVAL_REQUEST_COMPLETION_UNVERIFIED');
 });
});
test('current signed device and task must match when checking the existing request',async()=>{
 await fixture(async h=>{
  await h.gate.request(request());h.completeRequest();
  h.setOwner({workBounds:'1200,0,2200,1800'});
  assert.equal((await h.gate.pollPhoneApproval(request())).ok,false);
  assert.equal((await h.gate.checkRequest(request())).ok,false);
 });
});
test('nonreplayable request survives actual file store restart with no raw approval tokens',async()=>{
 await fixture(async h=>{
  await h.gate.request(request());h.completeRequest();
  const doc=await readFile(h.store.filePath,'utf8');
  for(const v of ['signed-original-request-token','FAKE',
   'approvalGrantToken','promptText','leaseToken']){
   assert.equal(doc.includes(v),false,v);
  }
  const reopened=new FileDurableExecutionStore({
   directory:h.dir,instanceId:'second-server-process'
  });
  await reopened.recoverInterrupted({force:true});
  const records=await reopened.list();
  const approval=records.find(x=>x.metadata?.jhV4OriginalApprovalRequest);
  assert.equal(approval?.replayAllowed,false);
  assert.equal(approval?.state,'NEEDS_REVIEW');
  const second=createV4OriginalGeminiPhoneApprovalPort({
   ...{},store:reopened,
   readOriginalOwner:async()=>owner(),verifyOriginalOwner:async()=>true,
   readOriginalTask:async()=>task(),verifyOriginalTask:async()=>true,
   readOriginalPrepareOperation:id=>h.ledger.lookup(id),
   verifyOriginalPrepareOperation:(op,id)=>h.ledger.verify(op,id),
   readOriginalPrepareJob:async()=>h.prepared(),verifyOriginalPreparedJob:async()=>true,
   readOriginalPrepareStatus:async()=>({
     ok:true,code:'ORIGINAL_GEMINI_PHONE_LOCAL_APPROVAL_REQUIRED',
     phoneApprovalVerified:false,dispatched:false}),
   exactOriginalEnvelope:async()=>{throw Error('SHOULD_NOT_QUEUE')},
   readOriginalJob:async()=>null,verifyOriginalQueuedJob:async()=>true,
   verifyOriginalCompletedJob:async()=>true,waitOriginalJob:async()=>null,
   verifyOriginalPhoneApprovalStatus:async()=>true,
   clock:()=>NOW,enabled:true
  });
  const result=await second.request(request());
  assert.equal(result.code,'ORIGINAL_GEMINI_APPROVAL_ALREADY_RESERVED_NO_REPLAY');
 });
});
test('capabilities do not claim live phone execution, Android grant proof or ChatGPT delivery',async()=>{
 await fixture(async h=>{
  const c=h.gate.capabilities();
  assert.equal(c.originalPhoneExecuteConnected,false);
  assert.equal(c.noApprovalWithoutOriginalAndroidGrantContract,true);
  assert.equal(c.productionRegistered,false);
 });
});
