import test from 'node:test';
import assert from 'node:assert/strict';
import {createUnifiedAndroidRoute} from './unified-route.mjs';
import {createStage4GeminiV4Entry} from './gemini-v4-stage4-entry.mjs';
const cid='a'.repeat(32),id='v4-task-01',digest='b'.repeat(64);
const owner=()=>({current:true,secure56:true,backend:'JH_ANDROID_NATIVE',
 deviceId:'android-1',sessionId:'trusted-1',commandId:cid,
 workSide:'LEFT',chatSide:'RIGHT',workWindowId:101,chatWindowId:102,
 workPackage:'com.google.android.googlequicksearchbox',accountBinding:'opaque-account',
 observedAt:Date.now()});
const task=()=>({schema:4,id,commandId:cid,backend:'JH_ANDROID_NATIVE',
 mode:'YOUTUBE',workSide:'LEFT',chatSide:'RIGHT',deviceId:'android-1',
 sessionId:'trusted-1',promptDigest:digest,sequence:2,phase:'WAITING',
 pending:{kind:'SUBMIT'},result:null});
const command=(mode,more={})=>({mode,commandId:cid,taskId:id,...more});
function make(opts={}){
 const signed=owner(),saved=new Map(),calls=[],control={capabilities:()=>({
  hostLocalOnly:true,existingSecure56Required:true,playwrightUsed:false,
  layoutMode:'LEFT_WEB_RIGHT_GPT',workPaneSide:'LEFT'}),
 capture:async()=>({ok:true,workPaneSide:'LEFT',chatPaneSide:'RIGHT',rightPaneDigest:digest}),
 prepare:async()=>({code:'PREPARE_SAFE'}),execute:async()=>({code:'EXECUTE_SAFE'}),
 status:async()=>({code:'STATUS_SAFE'}),cancelPreparation:()=>({code:'CANCEL_SAFE'})};
 const stage4=createUnifiedAndroidRoute({enabled:true,controller:control,readOwner:()=>({...signed,sameProcess:true}),
  readSignedCapability:async()=>null,openLeftWeb:async()=>null,
  readOpenJob:async()=>null,readSignedAddress:async()=>null});
 const driver={
  capabilities:()=>({geminiNativeOnly:true,serverBrowserFallback:false}),
  run:async q=>{calls.push(q);if(q.mode==='GEMINI_START'){
   saved.set(id,task());return {ok:true,code:'GEMINI_NATIVE_REQUEST_CREATED_NOT_EXECUTED'};
  }
  if(q.mode==='GEMINI_STEP')return {ok:true,code:'SUBMISSION_READBACK_CONFIRMED',result:{text:'UNVERIFIED_REPLY'}};
  if(q.mode==='GEMINI_CANCEL')return {ok:true,code:'CANCELLED'};
  throw Error('NO_LEGACY_EXECUTION')},
 };
 const original={usesOriginalSecure56:true,backend:'JH_ANDROID_NATIVE'};
 const ports={stage4,driver,original,enabled:true,readSignedOwner:async()=>({...signed}),
  verifySignedOwner:async()=>true,readStoredTask:async k=>saved.get(k)??null,
  verifyStoredTask:async()=>true,verifyChatDelivery:async()=>false,...opts};
 const entry=createStage4GeminiV4Entry(ports);
 return {entry,stage4,original,saved,calls,owner:signed};
}
test('actual Stage4 remains the single base route for non-Gemini actions',async()=>{
 const h=make(),r=await h.entry.run(command('OPEN_APP'));
 assert.equal(r.code,'LEFT_NATIVE_APP_ADAPTER_NOT_VERIFIED');
 assert.equal(h.calls.length,0);assert.equal(h.entry.capabilities().stage4Unchanged,true);
});
test('enabled=false refuses Gemini without touching original host',async()=>{
 let count=0;const h=make({enabled:false,readSignedOwner:async()=>{count++;return owner()}});
 assert.equal((await h.entry.run(command('GEMINI_START',{request:{id}}))).code,'V4_GEMINI_NATIVE_HOST_NOT_ATTACHED');
 assert.equal(count,0);assert.equal(h.calls.length,0);
});
test('V4 routes native START once, then rejects recreate from original stored task',async()=>{
 const h=make(),r=await h.entry.run(command('GEMINI_START',{request:{id}}));
 assert.equal(r.code,'GEMINI_NATIVE_REQUEST_CREATED_NOT_EXECUTED');
 assert.equal(r.result,null);
 assert.equal((await h.entry.run(command('GEMINI_START',{request:{id}}))).code,'EXISTING_GEMINI_REQUEST_NO_RECREATE');
 assert.equal(h.calls.length,1);
});
test('phone original owner and signatures are independently verified',async()=>{
 const h=make({verifySignedOwner:async()=>false});
 assert.equal((await h.entry.run(command('GEMINI_START',{request:{id}}))).code,'CURRENT_SIGNED_LEFT_WORK_RIGHT_GPT_REQUIRED');
 assert.equal(h.calls.length,0);
});
test('refuses opposite split or outdated owner snapshot',async()=>{
 for(const bad of [{workSide:'RIGHT',chatSide:'LEFT'},{observedAt:Date.now()-90000},{workWindowId:102}]){
  const h=make({readSignedOwner:async()=>({...owner(),...bad})});
  assert.equal((await h.entry.run(command('GEMINI_START',{request:{id}}))).code,'CURRENT_SIGNED_LEFT_WORK_RIGHT_GPT_REQUIRED');
 }
});
test('mismatched command and task cannot dispatch',async()=>{
 const h=make();
 assert.equal((await h.entry.run(command('GEMINI_START',{request:{id:'different-task'}}))).code,'GEMINI_START_ID_MISMATCH');
 assert.equal((await h.entry.run({...command('GEMINI_START',{request:{id}}),commandId:'c'.repeat(32)})).code,'CURRENT_SIGNED_LEFT_WORK_RIGHT_GPT_REQUIRED');
 assert.equal(h.calls.length,0);
});
test('STATUS reads original record without calling Gemini driver or auto-resume',async()=>{
 const h=make();h.saved.set(id,task());
 const r=await h.entry.run(command('GEMINI_STATUS'));
 assert.equal(r.ok,true);assert.equal(r.code,'V4_GEMINI_CHECKPOINT_READ_ONLY');
 assert.equal(r.pendingKind,'SUBMIT');assert.equal(r.result,null);
 assert.equal(r.automaticReplay,false);assert.equal(r.automaticResume,false);assert.equal(h.calls.length,0);
});
test('partially delivered text or video never returned as finished without host proof',async()=>{
 const h=make();h.saved.set(id,{...task(),phase:'DELIVERED',
  result:{kind:'TEXT',text:'DO_NOT_EXPOSE',fullReplyVerified:true}});
 const r=await h.entry.run(command('GEMINI_STATUS'));
 assert.equal(r.result,null);assert.equal(r.fullReplyVerified,false);
});
test('only independent original delivery proof exposes verified result',async()=>{
 const h=make({verifyChatDelivery:async()=>true});h.saved.set(id,{...task(),phase:'DELIVERED',
  result:{kind:'TEXT',text:'ORIGINALLY_VERIFIED',fullReplyVerified:false}});
 const r=await h.entry.run(command('GEMINI_STATUS'));
 assert.equal(r.code,'V4_GEMINI_DELIVERY_VERIFIED');
 assert.equal(r.result?.text,'ORIGINALLY_VERIFIED');
 assert.equal(r.fullReplyVerified,false);
});
test('STEP requires original persisted signed task, not caller supplied verified:true',async()=>{
 const h=make({verifyStoredTask:async()=>false});h.saved.set(id,{...task(),verified:true});
 assert.equal((await h.entry.run(command('GEMINI_STEP'))).code,'ORIGINAL_GEMINI_LEDGER_UNVERIFIED');
 assert.equal(h.calls.length,0);
});
test('STEP never returns forged submitted Gemini reply from phone transport',async()=>{
 const h=make();h.saved.set(id,task());
 const r=await h.entry.run(command('GEMINI_STEP'));
 assert.equal(r.ok,true);assert.equal(r.code,'SUBMISSION_READBACK_CONFIRMED');
 assert.equal(r.result,null);assert.equal(r.videoDelivered,false);
 assert.equal(h.calls.length,1);
});
test('changed owner during effect is UNKNOWN with no automatic retry',async()=>{
 let n=0;const h=make({readSignedOwner:async()=>({...owner(),sessionId:++n===1?'trusted-1':'different'})});
 h.saved.set(id,task());const r=await h.entry.run(command('GEMINI_STEP'));
 assert.equal(r.code,'GEMINI_OWNER_CHANGED_AFTER_OPERATION_NO_REPLAY');
 assert.equal(r.automaticReplay,false);assert.equal(h.calls.length,1);
});
test('lost device response is unknown and never automatically re-sent',async()=>{
 const h=make({driver:{capabilities:()=>({geminiNativeOnly:true,serverBrowserFallback:false}),
 run:async()=>{throw Error('response lost')}}});h.saved.set(id,task());
 const r=await h.entry.run(command('GEMINI_STEP'));
 assert.equal(r.code,'V4_GEMINI_DRIVER_RESULT_UNKNOWN_NO_REPLAY');
});
test('changed original task device or command blocks duplicate execution',async()=>{
 for(const change of [{deviceId:'other-device'},{commandId:'c'.repeat(32)},
  {workSide:'RIGHT',chatSide:'LEFT'},{schema:2}]){
  const h=make();h.saved.set(id,{...task(),...change});
  assert.equal((await h.entry.run(command('GEMINI_STEP'))).code,'GEMINI_STORED_SCOPE_CHANGED');
  assert.equal(h.calls.length,0);
 }
});
test('cancel is scoped to an existing verified task, not a blanket permission',async()=>{
 const h=make();assert.equal((await h.entry.run(command('GEMINI_CANCEL'))).code,'ORIGINAL_GEMINI_TASK_NOT_FOUND');
 h.saved.set(id,task());assert.equal((await h.entry.run(command('GEMINI_CANCEL'))).code,'CANCELLED');
 assert.equal(h.calls.length,1);
});
test('concurrent duplicate same task is not dispatched twice',async()=>{
 const h=make();h.saved.set(id,task());let release;
 const locked=new Promise(r=>release=r);
 const driver={capabilities:()=>({geminiNativeOnly:true,serverBrowserFallback:false}),
 run:async q=>{h.calls.push(q);await locked;return {ok:true,code:'READBACK'}}};
 const e=createStage4GeminiV4Entry({stage4:h.stage4,driver,original:h.original,enabled:true,
  readSignedOwner:async()=>owner(),verifySignedOwner:async()=>true,
  readStoredTask:async()=>h.saved.get(id),verifyStoredTask:async()=>true,verifyChatDelivery:async()=>false});
 const a=e.run(command('GEMINI_STEP'));
 for(let i=0;i<10&&h.calls.length===0;i++)await Promise.resolve();
 const b=await e.run(command('GEMINI_STEP'));
 assert.equal(b.code,'GEMINI_TASK_ALREADY_IN_PROGRESS_READ_STATUS');
 release();await a;assert.equal(h.calls.length,1);
});
test('Gemini driver with web fallback cannot be activated',async()=>{
 const h=make({driver:{capabilities:()=>({geminiNativeOnly:true,serverBrowserFallback:true}),run:async()=>({ok:true})}});
 assert.equal((await h.entry.run(command('GEMINI_START',{request:{id}}))).code,'V4_GEMINI_NATIVE_HOST_NOT_ATTACHED');
});
