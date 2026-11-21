import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {AiCameraV2StageStore} from '../../camera-v2-secure-stage.mjs';
import {createJH228CameraV2Pipeline,validEasyCameraLines} from './camera-v2-current-turn-pipeline.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const sourceDigest=sha('bound-source-photo-reference');
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
  readVerifiedV2CameraStatus:async x=>({
   verifiedBySecure56:true,verifiedByDevice:true,
   sessionId:x.secureSessionId,deviceDigest:x.deviceDigest,
   code:'V2_CAMERA_UI_STATUS',appCameraFlow:'AI_CAMERA_V2',
   guideLocation:'LEFT_GPT_ONLY',guideInputButtonPresent:false,
   autoArmed:false,rightCameraPaneConfirmed:true
  }),
  resolveActiveSignedSession:async sid=>({
   verifiedBySecure56:true,sessionId:sid,deviceDigest:scope.deviceDigest,
   taskDigest:scope.taskDigest,commandId:scope.commandId,expiresAtMs:Date.now()+25000
  }),
  confirmImageGenerationReady:async input=>({ready:true,verifiedByHost:true,
   threadId:input.threadId,sourceRef:input.sourceRef,attachmentId:input.attachmentId,
   provider:'CHATGPT_NATIVE_IMAGEGEN',billingMode:'CHATGPT_PLAN',
   externalApiRequired:false,paidApiBillingAuthorized:false,
   nativeArtifactReadbackAvailable:true,nativeLeftRenderReceiptAvailable:true,
   sourceSha256:sourceDigest}),
  claimOneShot:async()=>{state.effects.push('claim');return {claimed:true};},
  createSingleExample:async req=>{
   state.effects.push('generate');
   return {count:1,sourceReferenceId:req.source.id,jpegBytes:jpeg,
    sourceSha256:sourceDigest,imageSha256:sha(jpeg),
    provider:'CHATGPT_NATIVE_IMAGEGEN',nativeArtifactVerified:true,
    movementLines:lines,suggestedZoom:1.25};
  },
  renderInLeftChat:async req=>{state.effects.push('present');return {
   shown:true,threadId:req.threadId,sourceRef:req.sourceRef,attachmentId:req.attachmentId,
   presentationId:'left_present_0123456789',imageSha256:req.imageSha256,
   linesSha256:req.linesSha256
  };},
  verifyLeftPresentationReceipt:async (receipt,binding)=>
   receipt.imageSha256===binding.imageSha256&&receipt.linesSha256===binding.linesSha256,
  verifySignedCameraApplyReceipt:async x=>({
   verifiedBySecure56:true,verifiedByDevice:true,sessionId:x.secureSessionId,
   deviceDigest:x.deviceDigest,taskDigest:x.taskDigest,commandId:x.commandId,
   referenceId:x.referenceId,imageSha256:x.imageSha256,
   operation:x.expectedOperation,deviceResultCode:x.deviceResult?.code
  }),
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
  readVerifiedV2CameraStatus:async x=>({
   verifiedBySecure56:true,verifiedByDevice:true,
   sessionId:x.secureSessionId,deviceDigest:x.deviceDigest,
   code:'V2_CAMERA_UI_STATUS',appCameraFlow:'AI_CAMERA_V2',
   guideLocation:'LEFT_GPT_ONLY',guideInputButtonPresent:false,
   autoArmed:false,rightCameraPaneConfirmed:true
  }),
  resolveActiveSignedSession:async()=>({}),
  confirmImageGenerationReady:async()=>({ready:true,verifiedByHost:true,
   threadId:turn.threadId,sourceRef:turn.sourceRef,attachmentId:turn.attachments[0].id,
   provider:'CHATGPT_NATIVE_IMAGEGEN',billingMode:'CHATGPT_PLAN',
   externalApiRequired:false,paidApiBillingAuthorized:false,
   nativeArtifactReadbackAvailable:true,nativeLeftRenderReceiptAvailable:true,
   sourceSha256:sourceDigest}),
  claimOneShot:async()=>{state.effects.push('claim')},
  createSingleExample:async()=>{},renderInLeftChat:async()=>{},
  verifyLeftPresentationReceipt:async()=>false,
  applySignedGoal:async()=>{},
  verifySignedCameraApplyReceipt:async()=>({})
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

test('missing independent LEFT receipt verifier stops before claiming once',async()=>{
 const {pipeline,state,store}=setup({verifyLeftPresentationReceipt:undefined});
 const result=await pipeline.run({mood:'예쁘게'});
 assert.equal(result.code,'LEFT_GPT_RECEIPT_VERIFIER_NOT_CONNECTED');
 assert.deepEqual(state.effects,[]);
 store.close();
});
test('model-declared shown:true without image hash cannot trigger camera APPLY',async()=>{
 const {pipeline,state,store}=setup({renderInLeftChat:async p=>{
  state.effects.push('present');return {
   shown:true,threadId:p.threadId,sourceRef:p.sourceRef,
   attachmentId:p.attachmentId,presentationId:'left_present_0123456789'
  };
 }});
 const result=await pipeline.run({mood:'차분하게'});
 assert.equal(result.code,'LEFT_GPT_PRESENTATION_NOT_VERIFIED');
 assert.deepEqual(state.effects,['claim','generate','present']);
 assert.equal(store.pendingCount(),0);store.close();
});

test('unavailable image provider or invalid billing readiness DOES NOT consume one-shot journal',async()=>{
 const {pipeline,state,store}=setup({confirmImageGenerationReady:async()=>({
  ready:false,verifiedByHost:false,threadId:turn.threadId,sourceRef:turn.sourceRef,
  attachmentId:turn.attachments[0].id
 })});
 const result=await pipeline.run({mood:'차분한 느낌'});
 assert.equal(result.code,'PYEONBISEO_NATIVE_CHATGPT_NOT_READY');
 assert.deepEqual(state.effects,[]);store.close();
});
test('cross-thread image-provider readiness cannot authorize a generation',async()=>{
 const {pipeline,state,store}=setup({confirmImageGenerationReady:async()=>({
  ready:true,verifiedByHost:true,threadId:'ANOTHER_THREAD',
  sourceRef:turn.sourceRef,attachmentId:turn.attachments[0].id
 })});
 assert.equal((await pipeline.run({mood:'깔끔하게'})).code,'PYEONBISEO_NATIVE_CHATGPT_NOT_READY');
 assert.deepEqual(state.effects,[]);store.close();
});

test('missing independent signed apply receipt verifier denies before consuming journal',async()=>{
 const {pipeline,state,store}=setup({verifySignedCameraApplyReceipt:undefined});
 const result=await pipeline.run({mood:'차분한 구도'});
 assert.equal(result.code,'SIGNED_CAMERA_GOAL_RECEIPT_VERIFIER_NOT_CONNECTED');
 assert.deepEqual(state.effects,[]);
 store.close();
});
test('device text ok=true is insufficient without signed Secure56 job confirmation',async()=>{
 const {pipeline,state,store}=setup({verifySignedCameraApplyReceipt:async()=>({
  verifiedBySecure56:false,verifiedByDevice:false
 })});
 const result=await pipeline.run({mood:'밝은 구도'});
 assert.equal(result.ok,false);
 assert.equal(result.code,'CAMERA_SIGNED_APPLY_RECEIPT_UNVERIFIED');
 assert.equal(result.autoClickedByHost,false);
 assert.deepEqual(state.effects,['claim','generate','present','apply']);
 store.close();
});
test('signed receipt with a different camera command or image SHA cannot attest success',async()=>{
 const {pipeline,state,store}=setup({verifySignedCameraApplyReceipt:async x=>({
  verifiedBySecure56:true,verifiedByDevice:true,sessionId:x.secureSessionId,
  deviceDigest:x.deviceDigest,taskDigest:x.taskDigest,commandId:'d'.repeat(32),
  referenceId:x.referenceId,imageSha256:'0'.repeat(64),
  operation:x.expectedOperation,deviceResultCode:'V2_REFERENCE_APPLIED'
 })});
 const result=await pipeline.run({mood:'자연스러운 구도'});
 assert.equal(result.code,'CAMERA_SIGNED_APPLY_RECEIPT_UNVERIFIED');
 assert.equal(result.phoneReferenceVisible,undefined);
 store.close();
});

test('JH227 or wrong RIGHT pane status cannot consume image budget or durable one-shot',async()=>{
 const scenarios=[
  {code:'CAMERA_NOT_READY'}, {appCameraFlow:'LEGACY_CAMERA'},
  {rightCameraPaneConfirmed:false}, {guideInputButtonPresent:true},
  {autoArmed:true}, {verifiedBySecure56:false}
 ];
 for(const mismatch of scenarios){
  const {pipeline,state,store}=setup({readVerifiedV2CameraStatus:async x=>({
   verifiedBySecure56:true,verifiedByDevice:true,
   sessionId:x.secureSessionId,deviceDigest:x.deviceDigest,
   code:'V2_CAMERA_UI_STATUS',appCameraFlow:'AI_CAMERA_V2',
   guideLocation:'LEFT_GPT_ONLY',guideInputButtonPresent:false,
   autoArmed:false,rightCameraPaneConfirmed:true,...mismatch
  })});
  const result=await pipeline.run({mood:'자연스러운 분위기'});
  assert.equal(result.code,'V2_CAMERA_UI_NOT_READY',JSON.stringify(mismatch));
  assert.deepEqual(state.effects,[]);
  assert.equal(store.pendingCount(),0);
  store.close();
 }
});
test('missing authenticated JH228 v2 camera-status port denies before spending',async()=>{
 const {pipeline,state,store}=setup({readVerifiedV2CameraStatus:undefined});
 assert.equal((await pipeline.run({mood:'차분한 구도'})).code,'V2_CAMERA_STATUS_PORT_NOT_CONNECTED');
 assert.deepEqual(state.effects,[]);store.close();
});

test('paid external API readiness is refused before claim, image generation, or phone transfer',async()=>{
 const {pipeline,state,store}=setup({confirmImageGenerationReady:async input=>({
  ready:true,verifiedByHost:true,
  threadId:input.threadId,sourceRef:input.sourceRef,attachmentId:input.attachmentId,
  provider:'OPENAI_API_IMAGE_EDIT',billingMode:'EXTERNAL_API',
  externalApiRequired:true,paidApiBillingAuthorized:true,
  nativeArtifactReadbackAvailable:false,nativeLeftRenderReceiptAvailable:false,
  sourceSha256:sourceDigest
 })});
 const result=await pipeline.run({mood:'자연스럽게'});
 assert.equal(result.ok,false);
 assert.equal(result.code,'PYEONBISEO_NATIVE_CHATGPT_NOT_READY');
 assert.deepEqual(state.effects,[]);
 assert.equal(store.pendingCount(),0);
 store.close();
});
test('native ChatGPT result with wrong current source SHA or generated JPEG digest cannot be staged',async()=>{
 for(const mismatch of [
  {sourceSha256:sha('other-photo')},
  {imageSha256:sha('wrong-image')},
  {provider:'PAID_EXTERNAL_IMAGE_API'},
  {nativeArtifactVerified:false}
 ]){
  const {pipeline,state,store}=setup({createSingleExample:async req=>{
   state.effects.push('generate');
   return {count:1,sourceReferenceId:req.source.id,jpegBytes:jpeg,
    sourceSha256:sourceDigest,imageSha256:sha(jpeg),
    provider:'CHATGPT_NATIVE_IMAGEGEN',nativeArtifactVerified:true,
    movementLines:lines,suggestedZoom:1.25,...mismatch};
  }});
  const result=await pipeline.run({mood:'고급스럽게'});
  assert.equal(result.ok,false,JSON.stringify(mismatch));
  assert.equal(result.code,'PYEONBISEO_RESULT_INVALID');
  assert.deepEqual(state.effects,['claim','generate']);
  assert.equal(store.pendingCount(),0);
  store.close();
 }
});
