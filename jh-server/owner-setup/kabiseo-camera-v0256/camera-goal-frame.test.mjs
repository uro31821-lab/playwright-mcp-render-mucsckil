import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createGoalFramePort} from './camera-goal-frame.mjs';
const request={args:{task_digest:'a'.repeat(64)},extra:{}};
const receipt={ok:true,code:'CURRENT_CAMERA_FRAME',frameId:'b'.repeat(32),sessionId:'camera:3',mimeType:'image/jpeg'};
function port(frame,runSecure){return createGoalFramePort({chooseDevice:()=> 'phone',active:()=>true,
 createWaiter:()=>({lease:'lease'}),awaitFrame:async()=>frame,runSecure,textResult:x=>x,
 sha:x=>createHash('sha256').update(x).digest('hex')});}
test('verified camera frame is returned only as ephemeral image and its buffer is erased',async()=>{
 const frame=Buffer.from([255,216,10,255,217]),original=Buffer.from(frame);let calls=0;
 const result=await port(frame,async r=>{calls++;assert.equal(r.extra.frameUploadLease,'lease');return{result:receipt};})(request);
 assert.equal(calls,1);assert.deepEqual(Buffer.from(result.content[1].data,'base64'),original);
 assert.ok(frame.every(x=>x===0));assert.equal(JSON.parse(result.content[0].text).persisted,false);
});
test('rejected or unconfirmed job never leaks a received frame, retries or exception text',async()=>{
 for(const run of [async()=>{throw Error('private');},async()=>({result:{...receipt,ok:false}}),async()=>({result:{...receipt,frameId:'stale'}})]){
  const frame=Buffer.from([255,216,10,255,217]);const result=await port(frame,run)(request);
  assert.equal(result.ok,false);assert.equal(result.automaticReplayAllowed,false);assert.ok(frame.every(x=>x===0));
  assert.equal(JSON.stringify(result).includes('private'),false);
 }
});
test('a late completion without a frame is unconfirmed',async()=>{
 const result=await port(null,async()=>({status:'complete',result:receipt}))(request);
 assert.deepEqual(result,{ok:false,code:'CAMERA_FRAME_UNCONFIRMED',failureStage:'FRAME_TRANSFER',automaticReplayAllowed:false});
});
test('verified native refusals retain only an allowlisted code and erase any received bytes',async()=>{
 for(const code of ['CAMERA_LOCAL_SHARING_REQUIRED','CAMERA_SETTINGS_STILL_APPLYING',
   'CAMERA_FRESH_FRAME_REQUIRED','CAMERA_NOT_READY','CAMERA_FRAME_UNCONFIRMED','GOAL_FRAME_UPLOAD_UNCONFIRMED']){
  const frame=Buffer.from([255,216,10,255,217]);let calls=0;
  const result=await port(frame,async()=>{calls++;return{status:'complete',result:{ok:false,code,
   privateDetail:'private',frameId:'private',sessionId:'private'}};})(request);
  assert.deepEqual(result,{ok:false,code,failureStage:'DEVICE_REPLY',automaticReplayAllowed:false});
  assert.equal(calls,1);assert.ok(frame.every(x=>x===0));
 }
});
test('uncompleted or unknown refusals cannot impersonate a verified native failure',async()=>{
 for(const status of [undefined,'queued','in_progress','error','expired']){
  const result=await port(null,async()=>({status,result:{ok:false,code:'CAMERA_LOCAL_SHARING_REQUIRED'}}))(request);
  assert.deepEqual(result,{ok:false,code:'CAMERA_FRAME_UNCONFIRMED',failureStage:'SIGNED_COMMAND',automaticReplayAllowed:false});
 }
 const result=await port(null,async()=>({status:'complete',error:'private',result:{ok:false,code:'private'}}))(request);
 assert.deepEqual(result,{ok:false,code:'CAMERA_FRAME_UNCONFIRMED',failureStage:'RECEIPT_VALIDATION',automaticReplayAllowed:false});
});
test('malformed signed frame receipts and invalid image bytes remain distinct and fail closed',async()=>{
 for(const changed of [{frameId:'invalid'},{sessionId:''},{mimeType:'image/png'}]){
  const frame=Buffer.from([255,216,10,255,217]);
  const result=await port(frame,async()=>({status:'complete',result:{...receipt,...changed}}))(request);
  assert.equal(result.failureStage,'RECEIPT_VALIDATION');assert.ok(frame.every(x=>x===0));
 }
 const frame=Buffer.from('private');
 const result=await port(frame,async()=>({status:'complete',result:receipt}))(request);
 assert.equal(result.failureStage,'FRAME_TRANSFER');assert.ok(frame.every(x=>x===0));
});
test('an early command rejection still waits for and erases late private bytes',async()=>{
 const frame=Buffer.from([255,216,10,255,217]);
 const result=await createGoalFramePort({chooseDevice:()=> 'phone',active:()=>true,
  createWaiter:()=>({lease:'lease'}),awaitFrame:()=>new Promise(resolve=>setTimeout(()=>resolve(frame),10)),
  runSecure:async()=>{throw Error('private');},textResult:x=>x,sha:()=>{throw Error('must not hash');}})(request);
 assert.equal(result.failureStage,'SIGNED_COMMAND');assert.ok(frame.every(x=>x===0));
 assert.equal(JSON.stringify(result).includes('private'),false);
});
