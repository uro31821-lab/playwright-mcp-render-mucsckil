import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createV4GeminiOriginalLocalSendAttestor} from './gemini-v4-local-send-attribution.mjs';
const C='a'.repeat(32), T='gemini-task-001', J='original-phone-job-001', H='com.google.android.googlequicksearchbox';
const hash=s=>createHash('sha256').update(String(s),'utf8').digest('hex');
const D={taskDigest:'b'.repeat(64),promptDigest:hash('Example GEMINI prompt'),
 reviewBindingDigest:'c'.repeat(64),actionDigest:'d'.repeat(64)};
function receipt(){
 const p={schema:'JH_GEMINI_LOCAL_CLICK_V1',taskDigest:D.taskDigest,
  promptDigest:D.promptDigest,reviewBindingDigest:D.reviewBindingDigest,
  actionDigest:D.actionDigest,sourcePackage:H,sourceWindowId:18,
  workSide:'RIGHT',chatSide:'LEFT',localApprovedClickDispatched:true,
  googleSentMessageIdVerified:false,googleConversationIdVerified:false,
  fullReplyVerified:false,postObservationRequired:true};
 p.localAttemptDigest=hash('JH-GEMINI-LOCAL-CLICK-V1|'+[
  p.taskDigest,p.promptDigest,p.reviewBindingDigest,p.actionDigest,
  p.sourcePackage,p.sourceWindowId].join('|'));
 return p;
}
const owner=()=>({current:true,secure56:true,backend:'JH_ANDROID_NATIVE',
 deviceId:'trusted-phone',sessionId:'original56',commandId:C,workSide:'RIGHT',
 chatSide:'LEFT',workPackage:H,chatPackage:'com.openai.chatgpt',
 workWindowId:18,chatWindowId:17});
const task=()=>({id:T,commandId:C,deviceId:'trusted-phone',
 sessionId:'original56',workSide:'RIGHT',chatSide:'LEFT',
 mode:'YOUTUBE',cancelled:false,pending:{kind:'SUBMIT'},
 promptDigest:D.promptDigest});
const job=()=>({id:J,type:'computer_use_action_execute',status:'complete',
 targetDeviceId:'trusted-phone',secureSessionId:'original56',commandId:C,
 result:{dispatched:true,resultVerified:false,geminiLocalClickAttempt:receipt()}});
const scope=()=>({taskId:T,commandId:C,deviceId:'trusted-phone',
 sessionId:'original56',taskDigest:D.taskDigest,promptDigest:D.promptDigest,
 reviewBindingDigest:D.reviewBindingDigest,actionDigest:D.actionDigest,
 workPackage:H,workWindowId:18,workSide:'RIGHT'});
const q={commandId:C,taskId:T,originalJobId:J};
function harness(patch={}){
 const counts={readOwner:0,readTask:0,readJob:0,verifyCompletion:0};
 let a=owner(),t=task(),j=job(),s=scope();
 const ports={enabled:true,
 readOriginalOwner:async()=>{counts.readOwner++;return {...a}},
 verifyOriginalOwner:async()=>true,
 readOriginalTask:async()=>{counts.readTask++;return {...t}},
 verifyOriginalTask:async()=>true,
 readOriginalJob:async()=>{counts.readJob++;return structuredClone(j)},
 verifyOriginalCompletedJob:async()=>{counts.verifyCompletion++;return true},
 resolveOriginalActionScope:async()=>({...s}),
 verifyOriginalActionScope:async()=>true,...patch};
 return {attestor:createV4GeminiOriginalLocalSendAttestor(ports),counts,
 setOwner:v=>{a={...a,...v}},setTask:v=>{t={...t,...v}},
 setJob:v=>{j={...j,...v}},setReceipt:v=>{j.result.geminiLocalClickAttempt={...j.result.geminiLocalClickAttempt,...v}},
 setScope:v=>{s={...s,...v}}};
}
test('valid original Secure56 phone receipt attests only local approved CLICK',async()=>{
 const h=harness(),r=await h.attestor.verify(q);
 assert.equal(r.code,'ORIGINAL_SIGNED_GEMINI_APPROVED_LOCAL_CLICK_ATTEMPT');
 assert.equal(r.ok,true);assert.equal(r.localClickAttemptVerified,true);
 assert.equal(r.promptDigest,D.promptDigest);assert.equal(r.localAttemptDigest,receipt().localAttemptDigest);
 assert.equal(r.googleSentMessageIdVerified,false);
 assert.equal(r.googleConversationIdVerified,false);
 assert.equal(r.requestTurnVerified,false);
 assert.equal(r.chatGptDeliveryVerified,false);
 assert.equal(r.fullReplyVerified,false);
 assert.equal(r.requiresSignedVisibleMessageReadback,true);
 assert.equal(h.counts.verifyCompletion,1);
});
test('unconnected/disabled attestor never reads task or phone',async()=>{
 const h=harness({enabled:false});
 assert.equal((await h.attestor.verify(q)).code,'V4_LOCAL_SEND_ATTESTOR_DISABLED');
 assert.equal(h.counts.readOwner,0);
});
test('original host callback set is mandatory; no ad hoc signed result',()=>{
 assert.throws(()=>createV4GeminiOriginalLocalSendAttestor({}),
 /ORIGINAL_SECURE56_SEND_ATTESTATION_PORTS_REQUIRED/);
});
test('wrong command, task or phone job identifiers never touch original phone',async()=>{
 const h=harness();
 for(const x of [{...q,commandId:'broken'},{...q,taskId:'x'},
  {...q,originalJobId:'bad'}]){
  assert.equal((await h.attestor.verify(x)).ok,false);
 }
 assert.equal(h.counts.readJob,0);
});
test('original owner identity is separately authenticated',async()=>{
 const h=harness({verifyOriginalOwner:async()=>false});
 assert.equal((await h.attestor.verify(q)).code,'ORIGINAL_GEMINI_RIGHT_OWNER_REQUIRED');
});
test('original durable task must have pending reviewed SUBMIT, not merely requested Gemini work',async()=>{
 for(const patch of [{pending:null},{pending:{kind:'TYPE'}},
  {workSide:'LEFT',chatSide:'RIGHT'}, {cancelled:true},
  {deviceId:'different'},{promptDigest:'bad'}, {mode:'ANDROID'}]){
  const h=harness();h.setTask(patch);
  assert.equal((await h.attestor.verify(q)).code,'ORIGINAL_PENDING_SUBMIT_TASK_REQUIRED',JSON.stringify(patch));
 }
});
test('forged task verified:true cannot replace the original task verifier',async()=>{
 const h=harness({verifyOriginalTask:async()=>false});
 assert.equal((await h.attestor.verify(q)).code,'ORIGINAL_SUBMIT_TASK_UNAUTHENTICATED');
});
test('only signed computer-use execution receipt is accepted, not a prepare/read response',async()=>{
 for(const patch of [{type:'computer_use_action_prepare'},{status:'queued'},
  {targetDeviceId:'wrong'}, {secureSessionId:'wrong'}, {commandId:'f'.repeat(32)},
  {result:{dispatched:false,resultVerified:false,geminiLocalClickAttempt:receipt()}}]){
  const h=harness();h.setJob(patch);
  assert.equal((await h.attestor.verify(q)).code,'ORIGINAL_LOCAL_CLICK_JOB_REQUIRED',JSON.stringify(patch));
 }
});
test('fake successful phone JSON without authentic host completion never attests',async()=>{
 const h=harness({verifyOriginalCompletedJob:async()=>false});
 assert.equal((await h.attestor.verify(q)).code,'ORIGINAL_LOCAL_CLICK_COMPLETION_UNAUTHENTICATED');
});
test('masked phone metadata has no actual Google message ID and tampering is rejected',async()=>{
 for(const patch of [{localAttemptDigest:'0'.repeat(64)},
  {promptDigest:'0'.repeat(64)},{schema:'not-v1'},{googleSentMessageIdVerified:true},
  {localApprovedClickDispatched:false},{fullReplyVerified:true},
  {postObservationRequired:false},{workSide:'LEFT',chatSide:'RIGHT'},
  {sourceWindowId:11},{sourcePackage:'com.android.chrome'}]){
  const h=harness();h.setReceipt(patch);
  assert.equal((await h.attestor.verify(q)).code,'GEMINI_LOCAL_CLICK_ATTEMPT_SCHEMA_MISMATCH',JSON.stringify(patch));
 }
});
test('original scoped action must match prompt, task, command, phone and window',async()=>{
 for(const patch of [{taskDigest:'f'.repeat(64)},{promptDigest:'0'.repeat(64)},
  {taskId:'other'}, {commandId:'f'.repeat(32)},
  {deviceId:'wrong'},{actionDigest:'0'.repeat(64)},
  {workSide:'LEFT'}, {workWindowId:88}]){
  const h=harness();h.setScope(patch);
  assert.equal((await h.attestor.verify(q)).code,'GEMINI_LOCAL_ACTION_OR_REQUEST_SCOPE_CHANGED',JSON.stringify(patch));
 }
});
test('caller JSON with verified:true cannot replace original action-scope verifier',async()=>{
 const h=harness({verifyOriginalActionScope:async()=>false});
 const r=await h.attestor.verify({...q,verified:true});
 assert.equal(r.code,'ORIGINAL_LOCAL_ACTION_SCOPE_UNAUTHENTICATED');
});
test('changing signed original phone window AFTER completion is denied',async()=>{
 let n=0;
 const h=harness({readOriginalOwner:async()=>({...owner(),workWindowId:++n===1?18:99})});
 assert.equal((await h.attestor.verify(q)).code,'ORIGINAL_GEMINI_OWNER_CHANGED_AFTER_COMPLETION');
});
test('same job cannot be inspected concurrently by a second reader',async()=>{
 let release,enter;
 const wait=new Promise(r=>release=r),started=new Promise(r=>enter=r);
 const h=harness({readOriginalJob:async()=>{enter();await wait;return job()}});
 const first=h.attestor.verify(q);
 await started;
 const second=await h.attestor.verify(q);
 assert.equal(second.code,'SEND_ATTESTATION_ALREADY_READING');
 release();const a=await first;assert.equal(a.ok,true);
});
test('unavailable original phone completion is never retried as another action',async()=>{
 const h=harness({readOriginalJob:async()=>{throw Error('network')}})
 const r=await h.attestor.verify(q);
 assert.equal(r.code,'ORIGINAL_TASK_OR_JOB_UNAVAILABLE');
 assert.equal(r.autoRetry,false);
});
test('capabilities expose only original readback, never production Gemini send or ChatGPT delivery',()=>{
 const c=harness().attestor.capabilities();
 assert.equal(c.productionAttached,false);
 assert.equal(c.noNewExecutionTool,true);
 assert.equal(c.googleSentMessageIdVerified,false);
 assert.equal(c.originalPhoneLocalApprovalRequired,true);
});
