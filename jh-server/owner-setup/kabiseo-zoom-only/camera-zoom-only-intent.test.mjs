import test from 'node:test';
import assert from 'node:assert/strict';
import {makeZoomOnlyGoal} from './camera-zoom-only-intent.mjs';
const time=1795290000000;
const scope={threadId:'r1',sourceRef:'m1',taskDigest:'a'.repeat(64),
  deviceDigest:'b'.repeat(64),cameraCommandId:'c'.repeat(32),
  secureSessionId:'secure-session-001',currentCameraSessionId:'camera-session-right-001',
  currentRightWindowId:3};
const status={code:'V2_CAMERA_UI_STATUS',appCameraFlow:'AI_CAMERA_V2',
  autoArmed:false,autoVisualActive:false,manualZoomOverride:false,
  cameraReadiness:{ready:true},actualZoom:1.5,sessionId:scope.currentCameraSessionId,
  rightWindowId:3,secureSessionId:scope.secureSessionId,
  taskDigest:scope.taskDigest,deviceDigest:scope.deviceDigest,receivedAtMs:time};
const intent={kind:'SUBJECT_SIZE',userRequested:true,threadId:scope.threadId,
  sourceRef:scope.sourceRef,direction:'INCREASE',amount:'SLIGHT',
  perspectiveChangeNeeded:false};
const go=(x={})=>makeZoomOnlyGoal({
  intent,deviceStatus:status,scope,nowMs:time,
  verifyCurrentSignedStatus:()=>true,verifyCurrentUserIntent:()=>true,...x});
test('valid signed size-only intent yields +15% no image or AUTO',()=>{
 const r=go();assert.equal(r.ok,true);assert.equal(r.goal.relativeSubjectScale,1.15);
 assert.equal(r.deviceAction,false);assert.equal(r.noRemoteAuto,true);
 assert.equal(r.externalImageTransfer,false);assert.equal(r.goal.purpose,'SUBJECT_SIZE_ONLY');
});
test('all approved amount mappings and actual zoom metadata',()=>{
 for(const [direction,amount,factor] of [
   ['DECREASE','SLIGHT',.85],['DECREASE','MODERATE',.75],['INCREASE','MODERATE',1.25]
 ]){
  const r=go({intent:{...intent,direction,amount}});
  assert.equal(r.goal.relativeSubjectScale,factor);assert.equal(r.goal.expectedZoom,status.actualZoom);
 }
});
test('perspective change requires physical movement',()=>{
 assert.equal(go({intent:{...intent,perspectiveChangeNeeded:true}}).code,'CAMERA_MOVEMENT_REQUIRED');
 assert.equal(go({intent:{...intent,perspectiveChangeNeeded:undefined}}).ok,false);
});
test('host proofs cannot be invented',()=>{
 for(const bad of [
  {verifyCurrentSignedStatus:()=>false},{verifyCurrentSignedStatus:()=>{throw Error('offline')}},
  {verifyCurrentUserIntent:()=>false},{verifyCurrentUserIntent:undefined}
 ])assert.equal(go(bad).ok,false);
});
test('stale/cross-thread/other-device requests reject',()=>{
 for(const bad of [
  {intent:{...intent,sourceRef:'old'}},{scope:{...scope,deviceDigest:'d'.repeat(64)}},
  {deviceStatus:{...status,receivedAtMs:time-20000}},
  {deviceStatus:{...status,sessionId:'another-session'}}
 ])assert.equal(go(bad).ok,false);
});
test('AUTO, manual zoom, or camera not ready denies',()=>{
 for(const bad of [{autoArmed:true},{autoVisualActive:true},{manualZoomOverride:true},
  {cameraReadiness:{ready:false}}, {manualZoomOverride:undefined}
 ])assert.equal(go({deviceStatus:{...status,...bad}}).ok,false);
});
test('no free-form script commands or other photo edit intents',()=>{
 for(const bad of [{kind:'EDIT_EXISTING'},{userRequested:false},{amount:'FREEFORM'},
  {direction:'ROTATE'}])assert.equal(go({intent:{...intent,...bad}}).ok,false);
});
test('unknown goal application must use readback, never auto-replay',()=>{
 const r=go();assert.equal(r.code,'ZOOM_GOAL_READY_NOT_APPLIED');
 assert.equal(r.canRetryUnknownEffect,false);
 assert.equal(r.afterAction,'READ_GOAL_STATUS_AND_REQUIRE_ZOOM_APPLIED_VERIFIED');
});

test('missing Secure56 session and chat identity fail closed even with a permissive host verifier',()=>{
 for(const scopeMissing of [
   {...scope,secureSessionId:undefined},
   {...scope,secureSessionId:''},
   {...scope,threadId:undefined},
   {...scope,sourceRef:''}
 ]){
   const deviceStatus={...status,secureSessionId:scopeMissing.secureSessionId};
   assert.equal(go({scope:scopeMissing,deviceStatus}).ok,false);
 }
 assert.equal(go({deviceStatus:{...status,secureSessionId:undefined}}).ok,false);
 assert.equal(go({deviceStatus:{...status,secureSessionId:'short'}}).ok,false);
});

test('whitespace-only Secure56 session tokens fail closed',()=>{
 const r=go({scope:{...scope,secureSessionId:'        '},
   deviceStatus:{...status,secureSessionId:'        '}});
 assert.equal(r.ok,false);assert.equal(r.deviceAction,false);
});
test('whitespace-only native camera session fails closed',()=>{
 assert.equal(go({scope:{...scope,currentCameraSessionId:'        '},
   deviceStatus:{...status,sessionId:'        '}}).ok,false);
});
test('expiry timestamp must be a safe integer',()=>{
 const max=Number.MAX_SAFE_INTEGER;
 assert.equal(go({nowMs:max,deviceStatus:{...status,receivedAtMs:max}}).ok,false);
});
test('right-pane IDs outside safe integer range fail closed',()=>{
 const unsafe=Number.MAX_SAFE_INTEGER+1;
 assert.equal(go({scope:{...scope,currentRightWindowId:unsafe},
   deviceStatus:{...status,rightWindowId:unsafe}}).ok,false);
});
