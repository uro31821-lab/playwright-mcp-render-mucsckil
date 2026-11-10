import assert from 'node:assert/strict';
import {runCameraSettingsFlow} from './camera-flow.mjs';
import {CAMERA_EXTENSION,EXTENSION_DIGEST,cameraContractFingerprint} from './camera-contract.mjs';

assert.equal(cameraContractFingerprint(),EXTENSION_DIGEST);
const calls=[];
const runSecure=async req=>{
  calls.push(req);
  if(req.jobType==='kabiseo_camera_binding_status')return {targetDeviceId:'phone-1',result:{ok:true,sessionId:'activity:7',rightWindowId:77}};
  return {targetDeviceId:'phone-1',result:{ok:true,resultVerified:true}};
};
const result=await runCameraSettingsFlow({
  args:{request_text:'음식을 시원하고 고급스럽게 찍어줘',task_digest:'a'.repeat(64),command_id:'b'.repeat(32)},
  runSecure,nowMs:()=>1000
});
assert.equal(result.ok,true);assert.equal(result.userVisibleResult,false);assert.equal(calls.length,2);
assert.equal(calls[0].effect,'READ_ONLY');assert.equal(calls[1].effect,'WRITE_REVERSIBLE');
assert.deepEqual(calls[0].extra.cameraExtension,CAMERA_EXTENSION);assert.deepEqual(calls[1].extra.cameraExtension,CAMERA_EXTENSION);
assert.equal(calls[1].extra.directRequest,'음식을 시원하고 고급스럽게 찍어줘');
assert.equal(calls[1].extra.cameraTarget.sessionId,'activity:7');assert.equal(calls[1].extra.cameraTarget.rightWindowId,77);
assert.equal(calls[1].extra.cameraExpiresAtMs,11000);

let configCalled=false;
const notReady=await runCameraSettingsFlow({args:{request_text:'인물 모드',task_digest:'a'.repeat(64),command_id:'c'.repeat(32)},runSecure:async req=>{
  if(req.jobType==='kabiseo_camera_config')configCalled=true;
  return {targetDeviceId:'phone-1',result:{ok:false}};
}});
assert.equal(notReady.ok,false);assert.equal(configCalled,false);

await assert.rejects(()=>runCameraSettingsFlow({args:{request_text:'',task_digest:'a'.repeat(64),command_id:'d'.repeat(32)},runSecure}),/camera request invalid/);
await assert.rejects(()=>runCameraSettingsFlow({args:{request_text:'음식 모드',task_digest:'bad',command_id:'d'.repeat(32)},runSecure}),/task_digest invalid/);
console.log('KABISEO_SERVER_FLOW_PASS=14');
