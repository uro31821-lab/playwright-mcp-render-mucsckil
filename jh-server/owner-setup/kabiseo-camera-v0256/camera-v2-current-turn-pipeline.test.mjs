import test from 'node:test';
import assert from 'node:assert/strict';
import {AiCameraV2StageStore} from '../../camera-v2-secure-stage.mjs';
import {createJH228CameraV2Pipeline,validEasyCameraLines} from './camera-v2-current-turn-pipeline.mjs';
const jpeg=Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABMNDhEODBMRDxEVFBMXHTAfHRoaHToqLCMwRT1JR0Q9Q0FMVm1dTFFoUkFDX4JgaHF1e3x7SlyGkIV3j214e3b/2wBDARQVFR0ZHTgfHzh2T0NPdnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnb/wAARCAAwAEADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAT/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCgChOAAAAAAAAAAAAAAAAAAAAAA//Z','base64');
const env={
 JH228_CAMERA_V2_STAGE_OPERATOR_ENABLE:'EXPLICIT_JH228_CAMERA_V2_STAGE_OPERATOR_V1',
 JH228_CAMERA_V2_UPSTREAM_E2E_GATE:'TRUSTED_HOST_PORTS_AND_DEVICE_VERIFIED_V1',
 JH_DURABLE_RELEASE:'SERVE_READY_V1',RENDER_SERVICE_ID:'srv-db0fjl2d0e5s73be114g'
};
const turn={threadId:'jh-thread-v2-001',sourceRef:'turn-source-100',
 utterance:'이 참고사진처럼 분위기 있게 찍어줘',
 attachments:[{id:'photo-user-reference-001',role:'REFERENCE'}]};
const scope={verifiedByHost:true,verifiedBySecure56:true,
 threadId:turn.threadId,sourceRef:turn.sourceRef,
 referenceAttachmentId:turn.attachments[0].id,cameraSessionStatus:'ACTIVE',
 secureSessionId:'secure_session_0123456789abc',
 deviceDigest:'a'.repeat(64),taskDigest:'b'.repeat(64),commandId:'c'.repeat(32)};
const lines=['조금 가까이 가요.','왼쪽 옆에 서요.','폰을 살짝 기울여요.'];
function setup(overrides={}){
 const state={effects:[],applied:null};
 const store=new AiCameraV2StageStore();
 const route={disposition:'camera',reason:'CAPTURE_REQUEST',
  threadId:turn.threadId,sourceRef:turn.sourceRef,pendingReadback:false};
 const ports={
  readCurrentTurn:async()=>turn,
  routeShootingTurn:async()=>route,verifyShootingRoute:async(t,r)=>t===turn&&r===route,
  interpretShooting:async()=>({}),
  readSignedCapture:async()=>scope,
  resolveActiveSignedSession:async sid=>({
   verifiedBySecure56:true,sessionId:sid,deviceDigest:scope.deviceDigest,
   taskDigest:scope.taskDigest,commandId:scope.commandId,expiresAtMs:Date.now()+25000
  }),
  claimOneShot:async()=>{state.effects.push('claim');return {claimed:true};},
  createSingleExample:async req=>{
   state.effects.push('generate');
   return {count:1,sourceReferenceId:req.source.id,jpegBytes:jpeg,
    movementLines:lines,suggestedZoom:1.25};
  },
  renderInLeftChat:async req=>{state.effects.push('present');return {
   shown:true,threadId:req.threadId,sourceRef:req.sourceRef,attachmentId:req.attachmentId,
   presentationId:'left_present_0123456789'
  };},
  applySignedGoal:async req=>{
   state.effects.push('apply');state.applied=req;
   return {ok:true,code:'V2_REFERENCE_APPLIED',referenceId:req.goal.referenceId,
    referenceVisible:true,autoArmed:false,instructionsLocation:'LEFT_GPT_ONLY'};
  },
  ...overrides
 };
 const pipeline=createJH228CameraV2Pipeline(ports,{env,stageStore:store});
 return {pipeline,state,store};
}
test('camera movements include diagonals, orbit, tilts rather than six directions',()=>{
 assert.equal(validEasyCameraLines(['폰을 비스듬히 기울여요.','왼쪽 위로 가요.','제품 옆으로 돌아서요.']),true);
 assert.equal(validEasyCameraLines(['제품을 옮겨요.','폰을 기울여요.','가까이 가요.']),false);
 assert.equal(validEasyCameraLines(['조명을 켜요.','폰을 기울여요.','가까이 가요.']),false);
 assert.equal(validEasyCameraLines(['가까이 가요.','멀리 가요.']),false);
});
test('candidate simulated complete route sends ONE valid goal, never AUTO',async()=>{
 const {pipeline,state,store}=setup();
 const result=await pipeline.run({mood:'따뜻하고 차분한 느낌'});
 assert.equal(result.ok,true,result.code);
 assert.equal(result.code,'EXAMPLE_APPLIED_AWAIT_LOCAL_AUTO');
 assert.deepEqual(state.effects,['claim','generate','present','apply']);
 assert.deepEqual([result.copyPasteOperations,result.autoClickedByHost,result.shutterTriggeredByHost],[0,false,false]);
 assert.equal(state.applied?.tool,'life_android_camera_goal_v1');
 assert.equal(state.applied?.action,'apply');
 assert.equal(state.applied?.goal?.v2Protocol,'JH_AI_CAMERA_V2_REFERENCE_V1');
 assert.equal(state.applied?.goal?.suggestedZoom,1.25);
 assert.equal(store.pendingCount(),1);
 store.close();
});
test('no authenticated GPT/phone port => no journal consumption or generation',async()=>{
 const {pipeline,state,store}=setup({createSingleExample:undefined});
 const result=await pipeline.run({mood:'밝은 느낌'});
 assert.equal(result.code,'PYEONBISEO_GENERATOR_NOT_CONNECTED');
 assert.deepEqual(state.effects,[]);store.close();
});
test('unverified/cross-turn router receipt blocks before claim',async()=>{
 const {pipeline,state,store}=setup({verifyShootingRoute:async()=>false});
 const result=await pipeline.run({mood:'귀여운 느낌'});
 assert.equal(result.code,'JH_ROUTE_RECEIPT_NOT_VERIFIED');
 assert.deepEqual(state.effects,[]);store.close();
});
test('missing operator E2E fence blocks before journal claim',async()=>{
 const {pipeline,state,store}=setup();
 const wrong=createJH228CameraV2Pipeline({
  readCurrentTurn:async()=>turn,routeShootingTurn:async()=>({
   disposition:'camera',reason:'CAPTURE_REQUEST',
   pendingReadback:false,threadId:turn.threadId,sourceRef:turn.sourceRef}),
  verifyShootingRoute:async()=>true,interpretShooting:async()=>({}),
  readSignedCapture:async()=>scope,
  resolveActiveSignedSession:async()=>({}),claimOneShot:async()=>{state.effects.push('claim')},
  createSingleExample:async()=>{},renderInLeftChat:async()=>{},
  applySignedGoal:async()=>{}
 },{env:{...env,JH228_CAMERA_V2_UPSTREAM_E2E_GATE:'unverified'},stageStore:store});
 const result=await wrong.run({mood:'귀여운 느낌'});
 assert.equal(result.code,'JH228_OPERATOR_E2E_GATE_NOT_VERIFIED');
 assert.deepEqual(state.effects,[]);store.close();
});
test('durable claim denial blocks image generation',async()=>{
 const {pipeline,state,store}=setup({claimOneShot:async()=>{state.effects.push('claim');return {claimed:false};}});
 const result=await pipeline.run({mood:'안정적인 느낌'});
 assert.equal(result.code,'JH228_ALREADY_CLAIMED_OR_UNCERTAIN');
 assert.deepEqual(state.effects,['claim']);store.close();
});
test('failed LEFT presentation does not stage or apply, and does not retry',async()=>{
 const {pipeline,state,store}=setup({renderInLeftChat:async()=>{state.effects.push('present');return {shown:false};}});
 const result=await pipeline.run({mood:'따뜻한 느낌'});
 assert.equal(result.code,'LEFT_GPT_PRESENTATION_NOT_VERIFIED');
 assert.deepEqual(state.effects,['claim','generate','present']);
 assert.equal(store.pendingCount(),0);store.close();
});
test('device result uncertainty is not labeled successful and has no remote auto',async()=>{
 const {pipeline,state,store}=setup({applySignedGoal:async()=>{state.effects.push('apply');return {ok:true,code:'V2_REFERENCE_APPLIED',
  referenceVisible:false,autoArmed:false};}});
 const result=await pipeline.run({mood:'따뜻한 느낌'});
 assert.equal(result.ok,false);
 assert.equal(result.code,'CAMERA_REFERENCE_APPLY_NOT_VERIFIED');
 assert.equal(result.autoClickedByHost,false);store.close();
});
test('signed camera scope cannot be replaced by a forged device or expired session',async()=>{
 const {pipeline,state,store}=setup({readSignedCapture:async()=>({...scope,deviceDigest:'x'.repeat(64)})});
 assert.equal((await pipeline.run({mood:'차분한 느낌'})).code,'SECURE56_SIGNED_CAPTURE_UNVERIFIED');
 assert.deepEqual(state.effects,[]);store.close();
});
