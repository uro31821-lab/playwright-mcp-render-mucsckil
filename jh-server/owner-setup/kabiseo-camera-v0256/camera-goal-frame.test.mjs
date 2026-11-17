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
 const result=await port(null,async()=>({result:receipt}))(request);assert.equal(result.ok,false);
});
