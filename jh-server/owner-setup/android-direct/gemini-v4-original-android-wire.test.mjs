import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {nativeTaskIdDigest} from './gemini-v4-original-computer-task-id.mjs';
import {nativeGeminiPrepareOwnerDigest} from './gemini-v4-original-computer-owner-scope.mjs';
import {
 classifyV4OriginalAndroidApprovalWire,
 createV4OriginalAndroidOneShotGrantAdapter
} from './gemini-v4-original-android-approval-wire.mjs';
import {createV4OriginalAndroidApprovedRepreparePort}
 from './gemini-v4-original-android-reprepare.mjs';

const TASK='gemini-task-001',CMD='a'.repeat(32),
 PREP='b'.repeat(32),APPROVAL='c'.repeat(32),EXEC='d'.repeat(32),
 P='e'.repeat(64),ACT='f'.repeat(64),NOW=1800000000000;
const MAC='1'.repeat(64),HASH='2'.repeat(64);
const owner=()=>({backend:'JH_ANDROID_NATIVE',current:true,secure56:true,
 deviceId:'signed-fold',sessionId:'secure56-session',commandId:CMD,
 workSide:'RIGHT',chatSide:'LEFT',
 workPackage:'com.google.android.googlequicksearchbox',
 chatPackage:'com.openai.chatgpt',workWindowId:41,chatWindowId:42,
 workBounds:'1000,0,2000,1800',chatBounds:'0,0,1000,1800'});
const task=()=>({schema:4,id:TASK,commandId:CMD,
 deviceId:'signed-fold',sessionId:'secure56-session',
 backend:'JH_ANDROID_NATIVE',promptDigest:P,
 pending:{kind:'SUBMIT'}});
const op=o=>({operationId:PREP,taskDigest:nativeTaskIdDigest(TASK),
 promptDigest:P,actionDigest:ACT,
 ownerBindingDigest:nativeGeminiPrepareOwnerDigest(o)});
const approvalResponse=()=>({ok:true,approved:true,grantToken:'real-phone-grant-test',
 grantExpiresAt:NOW+40000,automaticApprovalRetryAllowed:false,
 approvalUiState:'CONFIRMED'});
const requestJob=o=>({id:'original-approval-job',type:'computer_use_action_approval_request',
 status:'complete',targetDeviceId:o.deviceId,secureSessionId:o.sessionId,
 commandId:CMD,taskId:TASK,taskDigest:nativeTaskIdDigest(TASK),
 promptDigest:P,actionDigest:ACT,
 ownerBindingDigest:nativeGeminiPrepareOwnerDigest(o),
 approvalOperationId:APPROVAL,prepareOperationId:PREP,
 result:{ok:true,code:'local_action_approval_required',
 requestToken:'original-request-token',expiresAt:NOW+120000}});
const statusJob=(o,body=approvalResponse())=>({
 id:'signed-phone-approval-status',type:'computer_use_action_approval_status',
 status:'complete',targetDeviceId:o.deviceId,secureSessionId:o.sessionId,
 commandId:CMD,taskId:TASK,taskDigest:nativeTaskIdDigest(TASK),
 promptDigest:P,actionDigest:ACT,
 ownerBindingDigest:nativeGeminiPrepareOwnerDigest(o),
 approvalOperationId:APPROVAL,prepareOperationId:PREP,
 requestToken:'original-request-token',action:'',
 secureMac:MAC,securePayloadDigest:HASH,
 secureExpiresAt:NOW+10000,result:body});
const args={taskId:TASK,commandId:CMD,prepareOperationId:PREP,
 approvalOperationId:APPROVAL,executionOperationId:EXEC};
function mapper(){
 const source=readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '../server-integration/server.mjs'),'utf8');
 const i=source.indexOf('function computerPayload56(a={}){');
 const j=source.indexOf('function exactEnvelope56(',i);
 assert.ok(i>=0&&j>i);
 assert.match(source.slice(j,j+950),/const p=\{\.\.\.computerPayload56\(args\),\.\.\.extra,mcpToolName/);
 return vm.runInNewContext('('+source.slice(i,j).trim()+')');
}
test('actual Kotlin boolean grant wire shape, not text APPROVED',()=>{
 const a=classifyV4OriginalAndroidApprovalWire(approvalResponse(),NOW);
 assert.equal(a.code,'ANDROID_APPROVED_WITH_ACTIVE_ONE_SHOT_GRANT');
 assert.equal(a.approved,true);assert.equal(a.expiresAtMs,NOW+40000);
 assert.equal(JSON.stringify(a).includes('real-phone-grant-test'),false);
 for(const input of [
  {code:'APPROVED',grantToken:'fake'},
  {...approvalResponse(),approved:'true'},
  {...approvalResponse(),automaticApprovalRetryAllowed:true},
  {...approvalResponse(),grantExpiresAt:NOW-1},
  {...approvalResponse(),grantExpiresAt:NOW+120001},
  {...approvalResponse(),grantToken:''},
  {...approvalResponse(),grantToken:123},
  {...approvalResponse(),ok:'true'}
 ]){
  assert.equal(classifyV4OriginalAndroidApprovalWire(input,NOW).ok,false,
   JSON.stringify(input).slice(0,160));
 }
 const pending=classifyV4OriginalAndroidApprovalWire({
  ok:true,approved:false,grantToken:null,grantExpiresAt:null,
  automaticApprovalRetryAllowed:false
 },NOW);
 assert.equal(pending.code,'ANDROID_PHONE_APPROVAL_NOT_CONFIRMED');
 assert.equal(classifyV4OriginalAndroidApprovalWire({
  ok:true,approved:false,grantToken:'wrong',grantExpiresAt:null,
  automaticApprovalRetryAllowed:false
 },NOW).ok,false);
});
test('only original signed phone status and verified installed version can yield internal token',async()=>{
 const o=owner(),t=task(),p=op(o),a=requestJob(o),job=statusJob(o);
 let verified=true,installed=false;
 const bridge=createV4OriginalAndroidOneShotGrantAdapter({
  enabled:true,clock:()=>NOW,
  verifyInstalledAndroidApprovalContract:async()=>installed,
  readSignedOriginalStatusJob:async()=>job,
  verifySignedOriginalStatusJob:async()=>verified
 });
 assert.equal(await bridge.readOriginalPhoneOneShotGrant(a,t,o,p),null);
 installed=true;
 const grant=await bridge.readOriginalPhoneOneShotGrant(a,t,o,p);
 assert.equal(grant.source,'ORIGINAL_ANDROID_ONE_SHOT');
 assert.equal(grant.actionApprovalGrantToken,'real-phone-grant-test');
 assert.equal(grant.consumed,false);
 assert.equal(grant.ownerBindingDigest,nativeGeminiPrepareOwnerDigest(o));
 // Server calls verify again with freshly read original owner/task objects.
 assert.equal(await bridge.verifyOriginalPhoneOneShotGrant(
  grant,structuredClone(a),structuredClone(t),structuredClone(o),structuredClone(p)),true);
 assert.equal(bridge.capabilities().productionRegistered,false);
 verified=false;
 assert.equal(await bridge.verifyOriginalPhoneOneShotGrant(
  grant,a,t,o,p),false);
});
test('forged signed metadata or unapproved/mismatched phone grant fails closed',async()=>{
 for(const mutate of [
  j=>{j.commandId='4'.repeat(32)},
  j=>{j.actionDigest='3'.repeat(64)},
  j=>{j.requestToken='wrong'},
  j=>{j.secureMac='bad'},
  j=>{j.secureExpiresAt=NOW-1},
  j=>{j.result.approved='true'},
  j=>{j.result.grantExpiresAt=NOW-1},
  j=>{j.result.approved=false;j.result.grantToken=null;j.result.grantExpiresAt=null},
  j=>{j.result.automaticApprovalRetryAllowed=true}
 ]){
  const o=owner(),t=task(),p=op(o),a=requestJob(o),j=statusJob(o);
  mutate(j);
  const bridge=createV4OriginalAndroidOneShotGrantAdapter({
   enabled:true,clock:()=>NOW,
   verifyInstalledAndroidApprovalContract:async()=>true,
   readSignedOriginalStatusJob:async()=>j,
   verifySignedOriginalStatusJob:async()=>true
  });
  assert.equal(await bridge.readOriginalPhoneOneShotGrant(a,t,o,p),null);
 }
});
test('original Secure56 mapper transports the real grant field to Android once',async()=>{
 const m=mapper();
 const p=m({task_id:TASK,task_digest:nativeTaskIdDigest(TASK),
  action_approval_grant_token:'real-phone-grant-test',
  effect:'REVERSIBLE_WRITE',action:'CLICK',data_class:'NONE',
  index:0,max_actions_in_call:1,x:500,y:730,
  viewport_width:1000,viewport_height:1800});
 assert.equal(p.actionApprovalGrantToken,'real-phone-grant-test');
 assert.equal(p.taskId,TASK);assert.equal(p.action,'CLICK');
});
test('original Android re-PREPARE checks checkExact before any EXECUTE',async()=>{
 const o=owner(),t=task(),p={...op(o),id:'original-prep-job',
  type:'computer_use_action_prepare',status:'complete',
  x:500,y:730,viewportWidth:1000,viewportHeight:1800,
  action:'CLICK',effect:'REVERSIBLE_WRITE',index:0,maxActionsInCall:1};
 const grant={source:'ORIGINAL_ANDROID_ONE_SHOT',phoneLocalApproved:true,
  consumed:false,taskId:TASK,commandId:CMD,deviceId:o.deviceId,
  sessionId:o.sessionId,taskDigest:p.taskDigest,promptDigest:P,
  actionDigest:ACT,ownerBindingDigest:p.ownerBindingDigest,
  prepareOperationId:PREP,approvalOperationId:APPROVAL,
  actionApprovalGrantToken:'real-phone-grant-test',expiresAtMs:NOW+40000};
 let enqueued=0,resultOverride=null;
 const bridge=createV4OriginalAndroidApprovedRepreparePort({
  enabled:true,clock:()=>NOW,
  exactOriginalEnvelope:async(tool,type,effect,input,extra)=>{
   enqueued++;
   assert.equal(tool,'life_android_computer_prepare');
   assert.equal(type,'computer_use_action_prepare');assert.equal(effect,'READ_ONLY');
   const j={...mapper()(input),...extra,
    id:'signed-reprepare-01',type,status:'queued',targetDeviceId:o.deviceId,
    secureSessionId:o.sessionId,
    secureMac:MAC,securePayloadDigest:HASH,
    secureNonce:'secure-nonce-original-123',secureExpiresAt:NOW+30000,
    mcpToolName:tool,taskDigest:input.task_digest};
   assert.equal(j.actionApprovalGrantToken,grant.actionApprovalGrantToken);
   return {deviceId:o.deviceId,job:j};
  },
  verifyOriginalQueuedJob:async()=>true,
  waitOriginalJob:async()=>({result:{
   ok:true,code:'READY',requiresFreshApproval:false,
   approvalDiagnostic:'action_approval_exact_match',
   approvalGrantSupplied:true,approvalGrantExpiresAt:NOW+40000,
   leaseExpiresAt:NOW+30000,leaseToken:'lease-original-123',
   actionDigest:ACT,screenDigest:HASH,
   ...resultOverride
  },...lastQueued}),
  verifyOriginalCompletedJob:async()=>true
 });
 // To return the actual same signed queued receipt with status updated,
 // fill lastQueued through wrapper below (no real phone is contacted).
 let lastQueued;
 // Override only this one fixture's result-producing adapter by constructing
 // the exact host with a shared original queued record.
 const original=createV4OriginalAndroidApprovedRepreparePort({
  enabled:true,clock:()=>NOW,
  exactOriginalEnvelope:async(tool,type,effect,input,extra)=>{
   enqueued++;
   const job={...mapper()(input),...extra,
    id:'signed-reprepare-02',type,status:'queued',targetDeviceId:o.deviceId,
    secureSessionId:o.sessionId,
    secureMac:MAC,securePayloadDigest:HASH,
    secureNonce:'secure-nonce-original-123',secureExpiresAt:NOW+30000,
    taskDigest:input.task_digest};
   assert.equal(job.actionApprovalGrantToken,grant.actionApprovalGrantToken);
   lastQueued=job;return {deviceId:o.deviceId,job};
  },
  verifyOriginalQueuedJob:async()=>true,
  waitOriginalJob:async()=>({...lastQueued,status:'complete',result:{
   ok:true,code:'READY',requiresFreshApproval:false,
   approvalDiagnostic:'action_approval_exact_match',
   approvalGrantSupplied:true,approvalGrantExpiresAt:NOW+40000,
   leaseExpiresAt:NOW+30000,leaseToken:'lease-original-123',
   actionDigest:ACT,screenDigest:HASH
  }}),
  verifyOriginalCompletedJob:async()=>true
 });
 const job=await original.prepareOriginalApprovedAction(grant,p,o,t,args);
 assert.equal(job.result.code,'READY');
 assert.equal(await original.verifyOriginalFreshPreparedJob(job,grant,t,o,p),true);
 assert.equal(enqueued,1);
 assert.equal(original.capabilities().phoneExecuteConnected,false);
});
test('Android re-PREPARE refuses READY without exact phone approval diagnostic',async()=>{
 const o=owner(),t=task(),p={...op(o),x:500,y:730,
  viewportWidth:1000,viewportHeight:1800,
  action:'CLICK',effect:'REVERSIBLE_WRITE',index:0,maxActionsInCall:1};
 const grant={source:'ORIGINAL_ANDROID_ONE_SHOT',phoneLocalApproved:true,
  consumed:false,taskId:TASK,commandId:CMD,deviceId:o.deviceId,
  sessionId:o.sessionId,taskDigest:nativeTaskIdDigest(TASK),
  promptDigest:P,actionDigest:ACT,
  ownerBindingDigest:nativeGeminiPrepareOwnerDigest(o),
  prepareOperationId:PREP,approvalOperationId:APPROVAL,
  actionApprovalGrantToken:'real-phone-grant-test',expiresAtMs:NOW+40000};
 for(const bad of [
  {approvalDiagnostic:'unauthorized'},
  {approvalGrantSupplied:false},
  {actionDigest:'9'.repeat(64)},
  {approvalGrantExpiresAt:NOW-1},
  {leaseExpiresAt:NOW-1}
 ]){
  let queued;
  const port=createV4OriginalAndroidApprovedRepreparePort({
   enabled:true,clock:()=>NOW,
   exactOriginalEnvelope:async(tool,type,effect,input,extra)=>{
    queued={...mapper()(input),...extra,
     id:'reprepare-queued',type,status:'queued',
     targetDeviceId:o.deviceId,secureSessionId:o.sessionId,
     secureMac:MAC,securePayloadDigest:HASH,
     secureNonce:'secure-nonce-original-123',secureExpiresAt:NOW+30000,
     taskDigest:input.task_digest};
    return {deviceId:o.deviceId,job:queued};
   },
   verifyOriginalQueuedJob:async()=>true,
   waitOriginalJob:async()=>({...queued,status:'complete',result:{
    ok:true,code:'READY',requiresFreshApproval:false,
    approvalDiagnostic:'action_approval_exact_match',
    approvalGrantSupplied:true,approvalGrantExpiresAt:NOW+40000,
    leaseExpiresAt:NOW+30000,leaseToken:'lease-original-123',
    actionDigest:ACT,screenDigest:HASH,...bad
   }}),
   verifyOriginalCompletedJob:async()=>true
  });
  await assert.rejects(port.prepareOriginalApprovedAction(grant,p,o,t,args),
   /CHECK_EXACT_NOT_VERIFIED_NO_REPLAY/);
 }
});
