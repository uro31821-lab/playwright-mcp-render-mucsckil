import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {FileDurableExecutionStore} from '../deployment/jh-result-verification/file-durable-execution-store.mjs';
import {createV4OriginalGeminiSecure56Composition} from './gemini-v4-original-composition.mjs';
import {nativeTaskIdDigest} from './gemini-v4-original-computer-task-id.mjs';
import {nativeGeminiPrepareOwnerDigest} from './gemini-v4-original-computer-owner-scope.mjs';

const TASK='gemini-task-001',CMD='a'.repeat(32);
const PREP='b'.repeat(32),APPROVAL='c'.repeat(32),EXECUTE='d'.repeat(32);
const PROMPT='e'.repeat(64),ACTION='f'.repeat(64),MAC='1'.repeat(64);
const NOW=1800000000000,PKG='com.google.android.googlequicksearchbox';
const q={taskId:TASK,commandId:CMD,operationId:PREP};
const aq={taskId:TASK,commandId:CMD,prepareOperationId:PREP,
 approvalOperationId:APPROVAL};
const eq={...aq,executionOperationId:EXECUTE};
const sha=x=>createHash('sha256').update(x,'utf8').digest('hex');
function realOriginalMapper(){
 const p=resolve(dirname(fileURLToPath(import.meta.url)),
  '../server-integration/server.mjs');
 const source=readFileSync(p,'utf8');
 const i=source.indexOf('function computerPayload56(a={}){');
 const e=source.indexOf('function exactEnvelope56(',i);
 assert.ok(i>=0&&e>i);
 assert.match(source.slice(e,e+1000),
  /const p=\{\.\.\.computerPayload56\(args\),\.\.\.extra,mcpToolName/);
 return vm.runInNewContext('('+source.slice(i,e).trim()+')');
}
function owner(){return {current:true,secure56:true,backend:'JH_ANDROID_NATIVE',
 deviceId:'fold-device',sessionId:'original-session',commandId:CMD,
 workSide:'RIGHT',chatSide:'LEFT',
 workPackage:PKG,chatPackage:'com.openai.chatgpt',
 workWindowId:71,chatWindowId:72,
 workBounds:'1000,0,2000,1800',chatBounds:'0,0,1000,1800',
 observedAt:NOW-100};}
function task(){return {schema:4,id:TASK,commandId:CMD,backend:'JH_ANDROID_NATIVE',
 mode:'YOUTUBE',workSide:'RIGHT',chatSide:'LEFT',
 deviceId:'fold-device',sessionId:'original-session',
 cancelled:false,promptDigest:PROMPT,pending:{kind:'SUBMIT'}};}
function target(){return {taskId:TASK,commandId:CMD,deviceId:'fold-device',
 sessionId:'original-session',actionKind:'CLICK',purpose:'GEMINI_SUBMIT',
 packageName:PKG,windowId:71,promptDigest:PROMPT,
 screenDigest:'2'.repeat(64),actionDigest:ACTION,
 globalX:1500,globalY:730,observedAtMs:NOW-200};}
async function fixture(action,patch={}){
 const dir=await mkdtemp(join(tmpdir(),'jh167-v4-composition-'));
 try{
  const store=new FileDurableExecutionStore({directory:dir});
  const mapper=realOriginalMapper();
  const jobs=new Map();const dispatches=[];
  let currentOwner=owner(),currentTask=task(),ready=false,
    approvalValid=true,grantValid=true,sequence=0;
  const signed=j=>({
   secureMac:MAC,securePayloadDigest:MAC,secureNonce:'original-secure-nonce-abc123',
   secureExpiresAt:NOW+45000,...j
  });
  const original={
   backend:'JH_ANDROID_NATIVE',usesOriginalSecure56:true,
   readOriginalOwner:async()=>structuredClone(currentOwner),
   verifyOriginalOwner:async(o,id)=>o.deviceId===currentOwner.deviceId&&
    o.sessionId===currentOwner.sessionId&&id===currentOwner.commandId&&
    o.workWindowId===currentOwner.workWindowId,
   readOriginalTask:async()=>structuredClone(currentTask),
   verifyOriginalTask:async(t)=>t.id===currentTask.id&&
    t.promptDigest===currentTask.promptDigest&&t.commandId===currentTask.commandId,
   readSignedSubmitTarget:async()=>target(),
   verifySignedSubmitTarget:async()=>true,
   exactOriginalEnvelope:async(tool,type,effect,args,extra)=>{
    const p={...mapper(args),...extra,mcpToolName:tool,taskDigest:args.task_digest,
     secureRequestedEffect:effect};
    const j=signed({
     id:'original-job-'+(++sequence),type,status:'queued',
     targetDeviceId:currentOwner.deviceId,
     secureSessionId:currentOwner.sessionId,...p
    });
    jobs.set(j.id,j);dispatches.push({jobId:j.id,type,tool,effect});
    return {deviceId:currentOwner.deviceId,job:j};
   },
   readOriginalJob:async id=>jobs.get(id)??null,
   verifyOriginalQueuedJob:async j=>j.secureMac===MAC&&j.targetDeviceId==='fold-device',
   verifyOriginalCompletedJob:async j=>j.secureMac===MAC&&j.status==='complete',
   waitOriginalJob:async id=>{
    const j=jobs.get(id);
    if(j?.type==='computer_use_action_approval_status'){
     j.status='complete';
     j.result={ok:true,approved:true,
      grantToken:'not-an-authority',
      grantExpiresAt:NOW+30000,
      automaticApprovalRetryAllowed:false};
    }
    return j;
   },
   verifyOriginalPreparedJob:async j=>j.type==='computer_use_action_prepare'&&j.status==='complete',
   verifyOriginalApprovalRequestJob:async j=>j.type==='computer_use_action_approval_request'&&j.status==='complete',
   verifyOriginalPhoneApprovalStatus:async()=>approvalValid,
   originalPhoneGrantContractReady:async()=>ready,
   readOriginalPhoneOneShotGrant:async approvalJob=>({
    source:'ORIGINAL_ANDROID_ONE_SHOT',
    phoneLocalApproved:true,consumed:false,
    taskId:TASK,commandId:CMD,
    prepareOperationId:PREP,approvalOperationId:APPROVAL,
    deviceId:'fold-device',sessionId:'original-session',
    approvalRequestJobId:approvalJob.id,
    taskDigest:nativeTaskIdDigest(TASK),promptDigest:PROMPT,
    actionDigest:ACTION,
    ownerBindingDigest:nativeGeminiPrepareOwnerDigest(currentOwner),
    actionApprovalGrantToken:'original-test-grant-private',
    expiresAtMs:NOW+30000
   }),
   verifyOriginalPhoneOneShotGrant:async()=>grantValid,
   prepareOriginalApprovedAction:async (grant,prepared,o,t,req)=>signed({
    id:'original-fresh-prep',
    type:'computer_use_action_prepare',status:'complete',
    targetDeviceId:o.deviceId,secureSessionId:o.sessionId,
    commandId:req.commandId,taskId:req.taskId,
    taskDigest:nativeTaskIdDigest(TASK),
    promptDigest:PROMPT,
    ownerBindingDigest:nativeGeminiPrepareOwnerDigest(o),
    actionDigest:ACTION,approvalOperationId:APPROVAL,
    executionOperationId:EXECUTE,
    action:'CLICK',x:prepared.x,y:prepared.y,
    viewportWidth:prepared.viewportWidth,viewportHeight:prepared.viewportHeight,
    result:{ok:true,code:'READY',requiresFreshApproval:false,
     approvalDiagnostic:'action_approval_exact_match',
     approvalGrantSupplied:true,
     approvalGrantExpiresAt:NOW+30000,
     leaseExpiresAt:NOW+20000,
     actionDigest:ACTION,screenDigest:'8'.repeat(64),
     leaseToken:'original-test-fresh-lease'}
   }),
   verifyOriginalFreshPreparedJob:async j=>j.id==='original-fresh-prep',
   ...patch
  };
  const sendAttestor={
   verify:async({commandId,taskId,originalJobId})=>({
    ok:true,code:'ORIGINAL_SIGNED_GEMINI_APPROVED_LOCAL_CLICK_ATTEMPT',
    taskId,originalJobId,localClickAttemptVerified:true,
    localAttemptDigest:'3'.repeat(64),
    googleSentMessageIdVerified:false,chatGptDeliveryVerified:false
   })
  };
  const port=createV4OriginalGeminiSecure56Composition({
   store,original,sendAttestor,clock:()=>NOW,enabled:true
  });
  const api={
   port,store,dir,jobs,dispatches,
   setContractReady:v=>{ready=v},
   setApprovalVerifier:v=>{approvalValid=v},
   setGrantVerifier:v=>{grantValid=v},
   setOwner:v=>{currentOwner={...currentOwner,...v}},
   setTask:v=>{currentTask={...currentTask,...v}},
   finishLast:(type,result)=>{
    const j=[...jobs.values()].findLast(x=>x.type===type);
    assert.ok(j,'original job missing '+type);
    j.status='complete';j.result=result;
    return j;
   }
  };
  await action(api);
 }finally{await rm(dir,{recursive:true,force:true})}
}
test('isolated composition rejects fake durable storage and second Android executor',async()=>{
 await fixture(async h=>{
  assert.throws(()=>createV4OriginalGeminiSecure56Composition({store:{},original:{}}),
   /ORIGINAL_JH_SECURE56_IN_PROCESS_PORTS_REQUIRED/);
  const cap=h.port.capabilities();
  assert.equal(cap.productionRegistered,false);
  assert.equal(cap.oneOriginalDurableLedger,true);
  assert.equal(cap.autoExecuteAfterPhoneStatus,false);
  assert.equal(cap.androidApkBuilt,false);
  assert.equal(cap.physicalPhoneTested,false);
 });
});
test('PREPARE -> original phone approval -> status stays explicit and non-sending',async()=>{
 await fixture(async h=>{
  assert.equal((await h.port.prepareOriginalSubmit(q)).code,
   'SIGNED_GEMINI_SUBMIT_PREPARE_QUEUED');
  assert.equal((await h.port.inspectOriginalPrepare(q)).code,
   'ORIGINAL_GEMINI_PREPARE_QUEUED_READ_ONLY');
  h.finishLast('computer_use_action_prepare',
   {ok:false,code:'APPROVAL_REQUIRED',requiresFreshApproval:true});
  assert.equal((await h.port.inspectOriginalPrepare(q)).code,
   'ORIGINAL_GEMINI_PHONE_LOCAL_APPROVAL_REQUIRED');
  assert.equal((await h.port.requestPhoneApproval(aq)).code,
   'ORIGINAL_GEMINI_PHONE_APPROVAL_REQUEST_QUEUED');
  assert.equal((await h.port.inspectPhoneApprovalRequest(aq)).code,
   'ORIGINAL_GEMINI_PHONE_APPROVAL_REQUEST_PENDING');
  h.finishLast('computer_use_action_approval_request',
   {ok:true,code:'REQUESTED',requestToken:'private-phone-token'});
  assert.equal((await h.port.inspectPhoneApprovalRequest(aq)).code,
   'ORIGINAL_GEMINI_PHONE_APPROVAL_PROMPT_READY_TO_CHECK');
  const status=await h.port.inspectPhoneApproval(aq);
  assert.equal(status.code,'ORIGINAL_PHONE_LOCAL_APPROVAL_REPORTED_ACTIVE_GRANT_UNVERIFIED');
  assert.equal(status.phoneLocalApprovalVerified,false);
  assert.equal(status.executeAllowed,false);
  assert.equal(h.dispatches.filter(d=>d.type==='computer_use_action_execute').length,0);
  assert.equal((await h.port.executeOnlyAfterOriginalGrant(eq)).code,
   'ORIGINAL_ANDROID_ONESHOT_GRANT_CONTRACT_UNVERIFIED');
  const disk=await readFile(h.store.filePath,'utf8');
  for(const phrase of ['private-phone-token','original-test-grant-private',
   'original-test-fresh-lease'])
   assert.equal(disk.includes(phrase),false,phrase);
 });
});
test('synthetic original-host proof: accepted grant queues ONLY one signed EXECUTE; result remains partial',async()=>{
 await fixture(async h=>{
  await h.port.prepareOriginalSubmit(q);
  h.finishLast('computer_use_action_prepare',
   {ok:false,code:'APPROVAL_REQUIRED',requiresFreshApproval:true});
  await h.port.requestPhoneApproval(aq);
  h.finishLast('computer_use_action_approval_request',
   {ok:true,code:'REQUESTED',requestToken:'private-phone-token'});
  h.setContractReady(true); // synthetic original-host fixture only, not live phone
  const r=await h.port.executeOnlyAfterOriginalGrant(eq);
  assert.equal(r.code,'ORIGINAL_SIGNED_GEMINI_CLICK_EXECUTE_QUEUED_NOT_SENT_PROOF');
  assert.equal(r.executeQueued,true);
  assert.equal(r.googleMessageVerified,false);
  assert.equal(h.dispatches.filter(d=>d.type==='computer_use_action_execute').length,1);
  assert.equal((await h.port.inspectOriginalExecution(eq)).code,
   'ORIGINAL_GEMINI_EXECUTE_JOB_PENDING_NOT_PROOF');
  assert.equal((await h.port.executeOnlyAfterOriginalGrant({...eq,executionOperationId:'7'.repeat(32)})).code,
   'ORIGINAL_GEMINI_EXECUTION_ALREADY_RESERVED_NO_REPLAY');
  h.finishLast('computer_use_action_execute',{dispatched:true,resultVerified:false});
  const result=await h.port.inspectOriginalExecution(eq);
  assert.equal(result.code,'ORIGINAL_GEMINI_PHONE_LOCAL_CLICK_ATTEMPT_VERIFIED_NOT_GOOGLE_DELIVERY');
  assert.equal(result.localClickAttemptVerified,true);
  assert.equal(result.googleMessageVerified,false);
  assert.equal(result.chatGptDelivered,false);
  const raw=await readFile(h.store.filePath,'utf8');
  assert.equal(raw.includes('original-test-grant-private'),false);
  assert.equal(raw.includes('original-test-fresh-lease'),false);
 });
});
test('changed signed work window or cancelled task blocks the next original job',async()=>{
 for(const variant of ['window','cancel','prompt']){
  await fixture(async h=>{
   await h.port.prepareOriginalSubmit(q);
   h.finishLast('computer_use_action_prepare',
    {ok:false,code:'APPROVAL_REQUIRED',requiresFreshApproval:true});
   if(variant==='window')h.setOwner({workWindowId:77});
   if(variant==='cancel')h.setTask({cancelled:true});
   if(variant==='prompt')h.setTask({promptDigest:'9'.repeat(64)});
   const result=await h.port.requestPhoneApproval(aq);
   assert.equal(result.ok,false,variant);
   assert.equal(h.dispatches.filter(d=>d.type==='computer_use_action_approval_request').length,0);
  });
 }
});
test('same PREPARE and same approval can never be requeued after restart',async()=>{
 await fixture(async h=>{
  await h.port.prepareOriginalSubmit(q);
  h.finishLast('computer_use_action_prepare',
   {ok:false,code:'APPROVAL_REQUIRED',requiresFreshApproval:true});
  await h.port.requestPhoneApproval(aq);
  assert.equal((await h.port.prepareOriginalSubmit(q)).ok,false);
  assert.equal((await h.port.requestPhoneApproval(aq)).ok,false);
  const recovered=new FileDurableExecutionStore({directory:h.dir,instanceId:'new-test-process'});
  await recovered.recoverInterrupted({force:true});
  const entries=await recovered.list();
  assert.equal(entries.length,2);
  assert.ok(entries.every(x=>x.replayAllowed===false));
  assert.equal(h.dispatches.length,2);
 });
});

test('optional original Android wire path is wired but cannot bypass unsigned installed phone',async()=>{
 await fixture(async h=>{
  const cap=h.port.capabilities();
  assert.equal(cap.originalAndroidWireAdapterAvailable,true);
  assert.equal(cap.originalAndroidExactReprepareAvailable,true);
  assert.equal(cap.productionRegistered,false);
  assert.equal((await h.port.executeOnlyAfterOriginalGrant(eq)).code,
    'ORIGINAL_ANDROID_ONESHOT_GRANT_CONTRACT_UNVERIFIED');
  assert.equal(h.dispatches.length,0);
 }, {
  readSignedOriginalStatusJob:async()=>null,
  verifySignedOriginalStatusJob:async()=>true,
  verifyInstalledAndroidApprovalContract:async()=>false
 });
});
