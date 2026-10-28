import test from 'node:test';
import assert from 'node:assert/strict';
import {createGeminiV4CheckpointGate} from './gemini-v4-checkpoint.mjs';
const id='gemini-task-0001',commandId='a'.repeat(32);
const owner=()=>({backend:'JH_ANDROID_NATIVE',secure56:true,current:true,
 deviceId:'device1',sessionId:'session1',commandId,workSide:'LEFT',chatSide:'RIGHT',
 workWindowId:11,chatWindowId:12,observedAt:Date.now()});
const saved=()=>({schema:4,id,commandId,backend:'JH_ANDROID_NATIVE',workSide:'LEFT',chatSide:'RIGHT',
 mode:'YOUTUBE',phase:'GENERATING',sequence:2,deviceId:'device1',sessionId:'session1',pending:{kind:'SUBMIT'},
 result:{text:'not independently attested'},verified:true});
const q={mode:'GEMINI_STATUS',taskId:id,commandId};
const harness=(change={})=>{
 let called=0,reads=0;const x={readOwner:async()=>{called++;return owner()},verifyOwner:async()=>true,
  readStoredTask:async()=>{reads++;return saved()},verifyStoredTask:async()=>true,...change};
 return {gate:createGeminiV4CheckpointGate(x),counts:()=>({called,reads})};
};
test('read-only checkpoint validates both owner reads and returns no unverified answer',async()=>{
 const h=harness(),r=await h.gate.run(q);
 assert.equal(r.code,'ORIGINAL_DURABLE_CHECKPOINT_READ_ONLY');
 assert.equal(r.pendingKind,'SUBMIT');assert.equal(r.result,null);
 assert.equal(r.automaticReplay,false);assert.equal(r.automaticResume,false);
 assert.deepEqual(h.counts(),{called:2,reads:1});
});
test('no execution or automatic replay route is surfaced',async()=>{
 const h=harness();for(const mode of ['GEMINI_START','GEMINI_STEP','GEMINI_CANCEL','OPEN_APP'])
  assert.equal((await h.gate.run({...q,mode})).code,'LIFECYCLE_WRITES_NOT_CONNECTED');
 assert.deepEqual(h.counts(),{called:0,reads:0});
});
test('invalid task identifiers are rejected before looking up the ledger',async()=>{
 const h=harness();assert.equal((await h.gate.run({...q,taskId:'..'})).code,'SCOPED_TASK_AND_COMMAND_REQUIRED');
 assert.equal((await h.gate.run({...q,commandId:'wrong'})).ok,false);
 assert.deepEqual(h.counts(),{called:0,reads:0});
});
test('phone signed owner proof must be verified independently of booleans',async()=>{
 const h=harness({verifyOwner:async()=>false});assert.equal((await h.gate.run(q)).code,'ORIGINAL_OWNER_NOT_VERIFIED');
});
test('a forged durable task JSON does not replace original ledger verification',async()=>{
 const h=harness({verifyStoredTask:async()=>false});
 assert.equal((await h.gate.run(q)).code,'STORED_REQUEST_UNVERIFIED_NO_REPLAY');
});
test('wrong layout, command, or owner device is rejected',async()=>{
 for(const p of [{workSide:'RIGHT',chatSide:'LEFT'},{commandId:'b'.repeat(32)},{deviceId:'other'}]){
  const h=harness({readOwner:async()=>({...owner(),...p})});
  const r=await h.gate.run(q);assert.equal(r.ok,false);
 }
});
test('state with different device/session does not pass',async()=>{
 const h=harness({readStoredTask:async()=>({...saved(),sessionId:'old-session'})});
 assert.equal((await h.gate.run(q)).code,'STORED_REQUEST_UNVERIFIED_NO_REPLAY');
});
test('owner switch between first and second read fails closed',async()=>{
 let n=0;const h=harness({readOwner:async()=>({...owner(),workWindowId:++n})});
 assert.equal((await h.gate.run(q)).code,'OWNER_CHANGED_DURING_STATUS');
});
test('owner freshness is required',async()=>{
 const h=harness({readOwner:async()=>({...owner(),observedAt:Date.now()-35000})});
 assert.equal((await h.gate.run(q)).code,'ORIGINAL_OWNER_NOT_VERIFIED');
});
test('callback exceptions cannot trigger Gemini send',async()=>{
 const h=harness({readStoredTask:async()=>{throw Error('PRIVATE_ERROR')}});
 assert.equal((await h.gate.run(q)).code,'ORIGINAL_CHECKPOINT_STATUS_UNAVAILABLE');
});
test('same gate serializes simultaneous status queries without replay',async()=>{
 let release;const wait=new Promise(r=>release=r);
 const h=harness({readStoredTask:async()=>{await wait;return saved()}});
 const a=h.gate.run(q);await Promise.resolve();
 const b=await h.gate.run(q);assert.equal(b.code,'CONCURRENT_STATUS_UNCONFIRMED');
 release();assert.equal((await a).ok,true);
});
test('capabilities explicitly report no production or Gemini submission support',()=>{
 const caps=harness().gate.capabilities();
 assert.equal(caps.geminiSubmitEnabled,false);assert.equal(caps.productionInstalled,false);
});
