import test from 'node:test';
import assert from 'node:assert/strict';
import {createStage4GeminiNativeDriver} from './gemini-v4-driver.mjs';
import {createStage4GeminiV4Entry} from './gemini-v4-stage4-entry.mjs';
const cid='a'.repeat(32),id='gemini-v4-live-fixture';
const request={id,mode:'YOUTUBE',url:'https://youtu.be/jNQXAC9IVRw',instruction:'핵심 내용을 알려주세요.'};
const start={mode:'GEMINI_START',commandId:cid,request};
const cmd=(mode)=>({mode,commandId:cid,taskId:id});
function harness(overrides={}){
 const ledger=new Map(),effects=[],device={deviceId:'original-android',sessionId:'signed-session',commandId:cid};
 let current=cid,verifyCount=0,claimCount=0,observeCount=0;
 const original={usesOriginalSecure56:true,backend:'JH_ANDROID_NATIVE',
  isCurrent:async()=>current===cid,
  observe:async()=>{observeCount++;return null},
  type:async()=>{effects.push('TYPE');return {ok:true}},
  submit:async()=>{effects.push('SUBMIT');return {ok:true}},
  openApp:async()=>{effects.push('OPEN_APP');return {ok:true}},
  exportExistingVideo:async()=>{effects.push('EXPORT');return {ok:true}}};
 const host={original,currentCommand:async()=>current,
  claimTask:async(key,state)=>{claimCount++;if(ledger.has(key))return false;ledger.set(key,state);return true},
  save:async(key,state)=>{if(!ledger.has(key))throw Error('ORIGINAL_RECORD_NOT_FOUND');ledger.set(key,state)},
  verifyObservation:async()=>{verifyCount++;return false},verifyReceipt:async()=>false,
  delivery:{publish:async()=>{effects.push('PUBLISH');return null}},...overrides};
 return {host,driver:createStage4GeminiNativeDriver({host,enabled:true}),ledger,effects,device,
  current:set=>{current=set},counts:()=>({claimCount,observeCount,verifyCount})};
}
test('real Gemini v0.5 task is created once in the original durable claim, not sent on START',async()=>{
 const h=harness(),r=await h.driver.run(start);
 assert.equal(r.code,'GEMINI_NATIVE_REQUEST_CREATED_NOT_EXECUTED');
 assert.equal(h.ledger.get(id)?.schema,4);assert.equal(h.ledger.get(id)?.workSide,'LEFT');
 assert.equal(h.ledger.get(id)?.chatSide,'RIGHT');assert.deepEqual(h.effects,[]);
 assert.equal((await h.driver.run(start)).code,'EXISTING_REQUEST_USE_STATUS_NO_RECREATE');
 assert.equal(h.counts().claimCount,1);
});
test('real V4 STEP waits for authentic phone snapshot, never trusts claimed input success',async()=>{
 const h=harness();await h.driver.run(start);
 const r=await h.driver.run(cmd('GEMINI_STEP'));
 assert.equal(r.code,'FRESH_SIGNED_NATIVE_OBSERVATION_REQUIRED');
 assert.deepEqual(h.effects,[]);assert.equal(h.counts().observeCount,1);
});
test('wrong command prevents host-claimed task creation',async()=>{
 const h=harness();assert.equal((await h.driver.run({...start,commandId:'b'.repeat(32)})).code,'CURRENT_SECURE56_COMMAND_REQUIRED');
 assert.equal(h.ledger.size,0);
});
test('a server restart cannot recreate a V4 Gemini request or auto-send',async()=>{
 const h=harness();await h.driver.run(start);
 const newDriver=createStage4GeminiNativeDriver({host:h.host,enabled:true});
 assert.equal((await newDriver.run(start)).code,'EXISTING_DURABLE_REQUEST_NO_RECREATE');
 assert.equal((await newDriver.run(cmd('GEMINI_STEP'))).code,'GEMINI_NOT_ACTIVE_AFTER_RESTART_READ_ORIGINAL_STATUS');
 assert.deepEqual(h.effects,[]);
});
test('native host lacking original Secure56 cannot activate',async()=>{
 const h=harness();const driver=createStage4GeminiNativeDriver({host:{...h.host,original:{...h.host.original,usesOriginalSecure56:false}},enabled:true});
 assert.equal((await driver.run(start)).code,'ORIGINAL_GEMINI_V4_HOST_NOT_READY');
});
test('original host cancellation ends V4 without producing an unseen Gemini send',async()=>{
 const h=harness();await h.driver.run(start);
 assert.equal((await h.driver.run(cmd('GEMINI_CANCEL'))).code,'CANCELLED_BEFORE_DISPATCH');
 assert.equal((await h.driver.run(cmd('GEMINI_STEP'))).code,'CANCELLED_NO_NEW_ACTIONS');
 assert.deepEqual(h.effects,[]);
});
test('same task status is read-only and never represents verified ChatGPT output',async()=>{
 const h=harness();await h.driver.run(start);
 const r=await h.driver.run(cmd('GEMINI_STATUS'));
 assert.equal(r.code,'GEMINI_MEMORY_STATUS_NOT_DURABLE_PROOF');
 assert.equal(r.phase,'READY');assert.equal(r.result,null);
 assert.equal(r.automaticReplay,false);
});
test('in-flight V4 STEP rejects a duplicate without retrying screen or submit',async()=>{
 let resume,signal;const wait=new Promise(r=>resume=r),entered=new Promise(r=>signal=r);
 const h=harness({original:{usesOriginalSecure56:true,backend:'JH_ANDROID_NATIVE',isCurrent:async()=>true,
  observe:async()=>{signal();await wait;return null}}});
 await h.driver.run(start);
 const first=h.driver.run(cmd('GEMINI_STEP'));await entered;
 const second=await h.driver.run(cmd('GEMINI_STEP'));
 assert.equal(second.code,'EXISTING_GEMINI_OPERATION_READ_STATUS');
 resume();await first;assert.deepEqual(h.effects,[]);
});
test('CANCEL is allowed during in-flight screen read; pending action stays unsent',async()=>{
 let resume,signal;const wait=new Promise(r=>resume=r),entered=new Promise(r=>signal=r);
 const h=harness({original:{usesOriginalSecure56:true,backend:'JH_ANDROID_NATIVE',
  isCurrent:async()=>true,observe:async()=>{signal();await wait;return null},
  cancelPending:()=>{}}});
 await h.driver.run(start);
 const inProgress=h.driver.run(cmd('GEMINI_STEP'));await entered;
 const cancel=h.driver.run(cmd('GEMINI_CANCEL'));
 resume();await inProgress;
 const r=await cancel;assert.match(r.code,/CANCELLED/);
 assert.deepEqual(h.effects,[]);
});
test('current command changed after durable task claim does not create another command',async()=>{
 const h=harness();let n=0;
 h.host.currentCommand=async()=>++n===1?cid:'f'.repeat(32);
 const driver=createStage4GeminiNativeDriver({host:h.host,enabled:true});
 const r=await driver.run(start);
 assert.equal(r.code,'COMMAND_CHANGED_AFTER_DURABLE_CLAIM_NO_REPLAY');
 assert.equal(h.ledger.size,1);assert.deepEqual(h.effects,[]);
});
test('real V4 driver joins Stage4 route without creating a second app executor',async()=>{
 const h=harness();const stage4={run:async q=>({ok:true,code:'STAGE4_UNCHANGED',mode:q.mode}),
  capabilities:()=>({engine:'ANDROID_SECURE56_SINGLE',leftWebRightGpt:true,playwrightFallback:false})};
 const owner=()=>({backend:'JH_ANDROID_NATIVE',current:true,secure56:true,deviceId:'original-android',
  sessionId:'signed-session',commandId:cid,workSide:'LEFT',chatSide:'RIGHT',
  workWindowId:13,chatWindowId:14,observedAt:Date.now()});
 const route=createStage4GeminiV4Entry({stage4,driver:h.driver,original:h.host.original,enabled:true,
  readSignedOwner:async()=>owner(),verifySignedOwner:async()=>true,
  readStoredTask:async key=>h.ledger.get(key)??null,verifyStoredTask:async()=>true,
  verifyChatDelivery:async()=>false});
 assert.equal((await route.run({mode:'OBSERVE',commandId:cid})).code,'STAGE4_UNCHANGED');
 assert.equal((await route.run(start)).code,'GEMINI_NATIVE_REQUEST_CREATED_NOT_EXECUTED');
 assert.equal((await route.run(cmd('GEMINI_STEP'))).code,'FRESH_SIGNED_NATIVE_OBSERVATION_REQUIRED');
 assert.equal((await route.run(cmd('GEMINI_STATUS'))).phase,'READY');
 assert.deepEqual(h.effects,[]);
});
