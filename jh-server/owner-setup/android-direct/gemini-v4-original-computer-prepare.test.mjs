import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {nativeTaskIdDigest} from './gemini-v4-original-computer-task-id.mjs';
import {createV4OriginalSecure56GeminiPreparePort} from './gemini-v4-original-computer-prepare.mjs';

const ID='gemini-task-001',CMD='a'.repeat(32),OP='c'.repeat(32);
const P='b'.repeat(64),H='com.google.android.googlequicksearchbox';
const NOW=1800000000000;
function realOriginalComputerPayload(){
 const src=readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '../server-integration/server.mjs'),'utf8');
 const i=src.indexOf('function computerPayload56(a={}){');
 const j=src.indexOf('function exactEnvelope56(',i);
 assert.ok(i>=0&&j>i);
 return vm.runInNewContext('('+src.slice(i,j).trim()+')');
}
const device=()=>({backend:'JH_ANDROID_NATIVE',current:true,secure56:true,
 deviceId:'current-fold',sessionId:'current-secure-session',commandId:CMD,
 workSide:'RIGHT',chatSide:'LEFT',
 workPackage:H,chatPackage:'com.openai.chatgpt',
 workWindowId:77,chatWindowId:76,
 workBounds:'1080,0,2160,1800',chatBounds:'0,0,1080,1800'});
const task=()=>({schema:4,id:ID,commandId:CMD,backend:'JH_ANDROID_NATIVE',
 mode:'YOUTUBE',workSide:'RIGHT',chatSide:'LEFT',
 deviceId:'current-fold',sessionId:'current-secure-session',
 cancelled:false,promptDigest:P,pending:{kind:'SUBMIT'}});
const click=()=>({taskId:ID,commandId:CMD,deviceId:'current-fold',
 sessionId:'current-secure-session',actionKind:'CLICK',
 purpose:'GEMINI_SUBMIT',packageName:H,windowId:77,
 promptDigest:P,screenDigest:'d'.repeat(64),actionDigest:'e'.repeat(64),
 globalX:1500,globalY:730,observedAtMs:NOW-400});
function make(patch={}){
 let o=device(),st=task(),a=click();let reserved=new Set(),attached=new Map(),jobs=[],verifications=[];
 const original=realOriginalComputerPayload();
 const port=createV4OriginalSecure56GeminiPreparePort({
  enabled:true,clock:()=>NOW,
  readOwner:async()=>({...o}),verifyOwner:async()=>true,
  readTask:async()=>({...st}),verifyTask:async()=>true,
  readSignedSubmitTarget:async()=>({...a}),verifySignedSubmitTarget:async()=>true,
  claimOriginalOperation:async(id)=>{if(reserved.has(id))return false;reserved.add(id);return true},
  attachOriginalJob:async(id,jobId)=>{if(!reserved.has(id)||attached.has(id))return false;attached.set(id,jobId);return true},
  exactOriginalEnvelope:async (tool,type,effect,args,extra)=>{
   const p=original(args);const job={
    id:'signed-original-prep-001',type,status:'queued',
    targetDeviceId:o.deviceId,secureSessionId:o.sessionId,
    commandId:o.commandId,taskId:p.taskId,taskDigest:args.task_digest,
    secureMac:'signed-by-original-secure56',
    ...p
   };jobs.push({tool,type,effect,args,extra,job});return {deviceId:o.deviceId,job};
  },
  verifyOriginalQueuedJob:async(job)=>{verifications.push(job.id);
   return job.secureMac==='signed-by-original-secure56'},
  ...patch
 });
 return {port,jobs,verifications,reserved,attached,
  setOwner:c=>{o={...o,...c}},setTask:c=>{st={...st,...c}},
  setClick:c=>{a={...a,...c}}};
}
const req={taskId:ID,commandId:CMD,operationId:OP};
test('real Secure56 computerPayload56 receives raw ID and V2 hash for read-only phone PREPARE',async()=>{
 const h=make();
 const r=await h.port.prepare(req);
 assert.equal(r.ok,true);assert.equal(r.code,'SIGNED_GEMINI_SUBMIT_PREPARE_QUEUED');
 assert.equal(r.approved,false);assert.equal(r.dispatched,false);
 assert.equal(r.phoneLocalSendApprovalRequired,true);
 assert.equal(r.automaticReplay,false);
 assert.equal(h.jobs.length,1);
 const entry=h.jobs[0];
 assert.equal(entry.tool,'life_android_computer_prepare');
 assert.equal(entry.type,'computer_use_action_prepare');
 assert.equal(entry.effect,'READ_ONLY');
 assert.equal(entry.job.taskId,ID);
 assert.equal(entry.job.taskDigest,nativeTaskIdDigest(ID));
 assert.equal(entry.args.task_id,ID);
 assert.equal(entry.args.task_digest,nativeTaskIdDigest(ID));
 assert.equal(entry.args.action,'CLICK');
 assert.equal(entry.args.effect,'REVERSIBLE_WRITE');
 assert.equal(entry.args.data_class,'NONE');
 assert.equal(entry.args.index,0);
 assert.equal(entry.args.max_actions_in_call,1);
 assert.equal(entry.args.viewport_width,1080);
 assert.equal(entry.args.viewport_height,1800);
 assert.equal(entry.args.x,420);assert.equal(entry.args.y,730);
 assert.equal(entry.args.action_approval_grant_token,undefined);
 assert.equal(entry.job.secureSessionId,'current-secure-session');
 assert.deepEqual(h.verifications,['signed-original-prep-001']);
 assert.equal(h.attached.get(OP),'signed-original-prep-001');
});
test('never queue before original durable operation reservation',async()=>{
 const h=make({claimOriginalOperation:async()=>false});
 const r=await h.port.prepare(req);
 assert.equal(r.code,'ORIGINAL_GEMINI_PREPARE_RESERVED_USE_STATUS');
 assert.equal(h.jobs.length,0);assert.equal(r.automaticReplay,false);
});
test('old/wrong task state, owner or screen cannot make a phone job',async()=>{
 for(const [kind,change] of [
  ['task',{pending:{kind:'TYPE'}}],
  ['task',{cancelled:true}],
  ['owner',{workSide:'LEFT',chatSide:'RIGHT'}],
  ['owner',{workPackage:'com.android.chrome'}],
  ['owner',{sessionId:'different-secure-session'}],
  ['click',{globalX:80}],
  ['click',{globalX:1079}],
  ['click',{windowId:98}],
  ['click',{actionKind:'TYPE'}],
  ['click',{observedAtMs:NOW-18000}]
 ]){
  const h=make();
  if(kind==='task')h.setTask(change);
  else if(kind==='owner')h.setOwner(change);
  else h.setClick(change);
  const result=await h.port.prepare(req);
  assert.equal(result.ok,false,JSON.stringify([kind,change]));
  assert.equal(h.jobs.length,0);
 }
});
test('original stored task and owner verifier cannot be replaced by self-reported verified:true',async()=>{
 for(const p of [
  {verifyOwner:async()=>false},
  {verifyTask:async()=>false},
  {verifySignedSubmitTarget:async()=>false}
 ]){
  const h=make(p);const r=await h.port.prepare({...req,verified:true});
  assert.equal(r.ok,false);assert.equal(h.jobs.length,0);
 }
});
test('original signed queued job receipt must be authenticated, never inferred from JSON ok',async()=>{
 const h=make({verifyOriginalQueuedJob:async()=>false});
 const r=await h.port.prepare(req);
 assert.equal(r.code,'ORIGINAL_GEMINI_QUEUED_PREPARE_UNAUTHENTICATED_NO_REPLAY');
 assert.equal(r.dispatched,false);assert.equal(r.automaticReplay,false);
 assert.equal(h.reserved.size,1);
});
test('a failed original queue outcome cannot trigger a retry or fresh reservation',async()=>{
 const h=make({exactOriginalEnvelope:async()=>{throw Error('phone queue uncertain')}});
 const r=await h.port.prepare(req);
 assert.equal(r.code,'ORIGINAL_GEMINI_PREPARE_OUTCOME_UNKNOWN_NO_REPLAY');
 assert.equal(r.automaticReplay,false);assert.equal(h.reserved.size,1);
});
test('repeated original operation IDs cannot create two signed phone PREPARE jobs',async()=>{
 const h=make();await h.port.prepare(req);
 const b=await h.port.prepare(req);
 assert.equal(b.code,'ORIGINAL_GEMINI_PREPARE_RESERVED_USE_STATUS');
 assert.equal(h.jobs.length,1);
});
test('queued phone PREPARE with missing durable job association is UNKNOWN and never resent',async()=>{
 const h=make({attachOriginalJob:async()=>false});
 const first=await h.port.prepare(req);
 assert.equal(first.ok,false);
 assert.equal(first.code,'ORIGINAL_GEMINI_PREPARE_JOB_BINDING_UNKNOWN_NO_REPLAY');
 assert.equal(first.automaticReplay,false);
 assert.equal(h.jobs.length,1);
 assert.equal(h.reserved.size,1);
 assert.equal((await h.port.prepare(req)).code,'ORIGINAL_GEMINI_PREPARE_RESERVED_USE_STATUS');
 assert.equal(h.jobs.length,1);
});
test('preparation capabilities explicitly keep local send approval and execute disconnected',()=>{
 const c=make().port.capabilities();
 assert.equal(c.originalSecure56Required,true);
 assert.equal(c.phoneLocalApprovalBypassed,false);
 assert.equal(c.originalPhoneExecuteConnected,false);
 assert.equal(c.liveHostRegistered,false);
});
