import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import {
  nativeTaskIdDigest,
  buildOriginalSecure56GeminiTaskIdentity,
  requireOriginalSecure56GeminiTaskFields
} from './gemini-v4-original-computer-task-id.mjs';
const C='a'.repeat(32);
const ID='gemini-task-001', P='b'.repeat(64);
const owner=()=>({
 backend:'JH_ANDROID_NATIVE',secure56:true,current:true,
 deviceId:'fold-device1',sessionId:'session-secure56',commandId:C,
 workSide:'RIGHT',chatSide:'LEFT',
 workPackage:'com.google.android.googlequicksearchbox',
 chatPackage:'com.openai.chatgpt'
});
const task=()=>({
 schema:4,id:ID,commandId:C,backend:'JH_ANDROID_NATIVE',
 mode:'YOUTUBE',workSide:'RIGHT',chatSide:'LEFT',cancelled:false,
 deviceId:'fold-device1',sessionId:'session-secure56',promptDigest:P
});
const auth={
 verifyOriginalTask:async()=>true,
 verifyOriginalOwner:async()=>true
};
const build=(t=task(),o=owner(),v=auth)=>
 buildOriginalSecure56GeminiTaskIdentity({task:t,owner:o,...v});

function getActualOriginalComputerPayload56(){
 const current=path.dirname(fileURLToPath(import.meta.url));
 const s=readFileSync(path.resolve(current,'../server-integration/server.mjs'),'utf8');
 const start=s.indexOf('function computerPayload56(a={}){');
 const stop=s.indexOf('function exactEnvelope56(',start);
 assert.ok(start>=0&&stop>start,'Original Secure56 contract missing');
 const source=s.slice(start,stop).trim();
 assert.match(source,/taskId:String\(a\.task_id\|\|a\.task_digest\|\|""\)/);
 assert.match(s.slice(stop,stop+850),/const taskDigest=String\(args\?\.task_digest\|\|""\)/);
 // Evaluate ONLY this pure original host mapper, not its server bootstrap
 // nor any private signing/credential/device functions.
 return vm.runInNewContext('('+source+')',{});
}
test('actual original Secure56 host maps raw task_id into Android TaskPolicy.taskId',async()=>{
 const raw=await build();
 const existing=getActualOriginalComputerPayload56();
 const mapped=existing(raw);
 assert.equal(mapped.taskId,ID);
 assert.equal(raw.task_id,ID);
 assert.equal(raw.phone_task_id,ID);
 assert.equal(raw.task_digest,nativeTaskIdDigest(ID));
 assert.match(raw.task_digest,/^[a-f0-9]{64}$/);
 assert.equal(mapped.effect,'READ_ONLY');
 assert.equal(mapped.maxActionsInCall,20);
 assert.equal(raw.phoneLocalApprovalSatisfied,false);
 assert.equal(raw.dispatched,false);
});
test('without original task_id phone would hash digest instead of native task id',async()=>{
 const raw=await build();const existing=getActualOriginalComputerPayload56();
 assert.equal(existing({task_digest:raw.task_digest}).taskId,raw.task_digest);
 assert.notEqual(existing({task_digest:raw.task_digest}).taskId,ID);
 assert.equal(existing(requireOriginalSecure56GeminiTaskFields(raw,task())).taskId,ID);
});
test('cross-language Kotlin V2 digest vector fixed and source contract unchanged',()=>{
 assert.equal(nativeTaskIdDigest(ID),
  '843bad59886e26f53c5fb9485050f76a226c03f3f4336cf1e618c4bead02e355');
});
test('caller-provided Boolean/JSON cannot impersonate original host authenticated task binding',async()=>{
 assert.throws(()=>requireOriginalSecure56GeminiTaskFields({
  task_id:ID,phone_task_id:ID,task_digest:nativeTaskIdDigest(ID),
  device_id:'fold-device1',nativeTaskIdentityVerifiedByOriginalHost:true,
  phoneLocalApprovalSatisfied:false,dispatched:false
 },task()),/V4_ORIGINAL_PHONE_TASK_ID_DIGEST_SCOPE_CHANGED/);
});
test('original task and owner auth functions must both succeed before fields are issued',async()=>{
 for(const v of [
  {verifyOriginalTask:async()=>false,verifyOriginalOwner:async()=>true},
  {verifyOriginalTask:async()=>true,verifyOriginalOwner:async()=>false},
  {verifyOriginalTask:async()=>{throw Error('no connection')},verifyOriginalOwner:async()=>true}
 ]) await assert.rejects(()=>build(task(),owner(),v),/ORIGINAL_GEMINI_TASK_OR_OWNER_AUTHENTICATION_REQUIRED/);
});
test('signed Gemini work side and owner session are not inferred from task claims',async()=>{
 const changes=[
  [{workSide:'LEFT',chatSide:'RIGHT'},{}],
  [{}, {workPackage:'com.android.chrome'}],
  [{deviceId:'other'}, {}],
  [{sessionId:'wrong'}, {}],
  [{commandId:'f'.repeat(32)}, {}],
  [{cancelled:true}, {}],
  [{mode:'OLD_PLAYWRIGHT'}, {}]
 ];
 for(const [t,o] of changes)
  await assert.rejects(()=>build({...task(),...t},{...owner(),...o}),
   /CURRENT_GEMINI_NATIVE_TASK_SCOPE_REQUIRED/);
});
test('old pre-V2 task digest and arbitrary mismatched fields must fail closed',async()=>{
 const original=await build();
 const modified={...original,task_digest:'0'.repeat(64)};
 assert.throws(()=>requireOriginalSecure56GeminiTaskFields(modified,task()),
 /V4_ORIGINAL_PHONE_TASK_ID_DIGEST_SCOPE_CHANGED/);
 assert.throws(()=>requireOriginalSecure56GeminiTaskFields(original,{
   ...task(),id:'different-task-001'
 }),/V4_ORIGINAL_PHONE_TASK_ID_DIGEST_SCOPE_CHANGED/);
});
test('only the same device can receive original Secure56 task identity',async()=>{
 const original=await build();
 assert.deepEqual(requireOriginalSecure56GeminiTaskFields(original,task()),{
  task_id:ID,task_digest:nativeTaskIdDigest(ID),device_id:'fold-device1'
 });
 const modified={...original,device_id:'foreign'};
 assert.throws(()=>requireOriginalSecure56GeminiTaskFields(modified,task()),
 /V4_ORIGINAL_PHONE_TASK_ID_DIGEST_SCOPE_CHANGED/);
});
test('raw prompt, approval tokens and Gemini signed results are not part of identity fields',async()=>{
 const original=await build();
 for(const forbidden of ['prompt','promptText','text_value','action_approval_grant_token','approved','autoRetry']){
  assert.equal(Object.hasOwn(original,forbidden),false,forbidden);
 }
});
