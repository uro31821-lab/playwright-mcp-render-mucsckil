import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {AiCameraV2StageStore} from '../../camera-v2-secure-stage.mjs';
import {createJH228NativeChatGPTCaptureFlow}
 from './camera-v2-chatgpt-native-capture-flow.mjs';

const jpeg=Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABMNDhEODBMRDxEVFBMXHTAfHRoaHToqLCMwRT1JR0Q9Q0FMVm1dTFFoUkFDX4JgaHF1e3x7SlyGkIV3j214e3b/2wBDARQVFR0ZHTgfHzh2T0NPdnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnb/wAARCAAwAEADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAT/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCgChOAAAAAAAAAAAAAAAAAAAAAA//Z','base64');
const sha=x=>createHash('sha256').update(x).digest('hex');
const t={threadId:'native-chat-camera-001',sourceRef:'current-user-msg-001',
  utterance:'이 사진처럼 따뜻하게 촬영해 줘',
  attachments:[{id:'current-photo-attachment-001',role:'REFERENCE'}]};
const bound={threadId:t.threadId,sourceRef:t.sourceRef,
 referenceAttachmentId:t.attachments[0].id};
const binding={threadId:t.threadId,sourceRef:t.sourceRef,
 attachmentId:t.attachments[0].id};
const digest=sha('actual-original-attachment');
const session={verifiedByHost:true,verifiedBySecure56:true,
 threadId:t.threadId,sourceRef:t.sourceRef,
 referenceAttachmentId:t.attachments[0].id,
 cameraSessionStatus:'ACTIVE',secureSessionId:'secure_session_native_001',
 deviceDigest:'a'.repeat(64),taskDigest:'b'.repeat(64),commandId:'c'.repeat(32)};
const env={
 JH228_CAMERA_V2_STAGE_OPERATOR_ENABLE:'EXPLICIT_JH228_CAMERA_V2_STAGE_OPERATOR_V1',
 JH228_CAMERA_V2_UPSTREAM_E2E_GATE:'TRUSTED_HOST_PORTS_AND_DEVICE_VERIFIED_V1',
 JH_DURABLE_RELEASE:'SERVE_READY_V1',
 RENDER_SERVICE_ID:'srv-db0fjl2d0e5s73be114g'
};
function scenario({capability,readTurn,cameraOverrides}={}){
 const events=[],store=new AiCameraV2StageStore(),route={
  disposition:'camera',reason:'CAPTURE_REQUEST',
  threadId:t.threadId,sourceRef:t.sourceRef,pendingReadback:false
 };
 const nativePorts={
  readCurrentVerifiedReference:async()=>{events.push('read-ref');return {
   ...binding,verifiedByHost:true,role:'REFERENCE',
   sha256:digest,mimeType:'image/jpeg',assetHandle:'native-asset-private-current'
  };},
  verifyNativeImageCapability:async()=>{events.push('capability');return {
   ...binding,verifiedByHost:true,provider:'CHATGPT_NATIVE_IMAGEGEN',
   canInvokeNativeImageTool:true,nativeArtifactReadbackAvailable:true,
   nativeLeftRenderReceiptAvailable:true,externalApiRequired:false,
   paidApiBillingAuthorized:false,...(capability??{})
  };},
  requestNativeImageEdit:async input=>{events.push('native-gen');return {
   ...binding,provider:'CHATGPT_NATIVE_IMAGEGEN',generationId:'native-generate-001',
   imageAssetId:'native-generated-artifact-001',numberOfImages:1,
   sourceSha256:input.sourceSha256
  };},
  verifyNativeGenerationReceipt:async()=>{events.push('native-verify');return true;},
  readVerifiedNativeJpeg:async input=>{events.push('native-read');return {
   ...binding,verifiedByHost:true,generationId:input.generationId,
   imageAssetId:input.imageAssetId,jpegBytes:jpeg,imageSha256:sha(jpeg)
  };},
  planThreeCameraMovements:async input=>{events.push('three-lines');return {
   ...binding,verifiedByHost:true,sourceSha256:input.sourceSha256,
   imageSha256:input.imageSha256,
   lines:['조금 가까이 가요.','왼쪽 옆으로 가요.','폰을 비스듬히 기울여요.'],
   suggestedZoom:1.1
  };}
 };
 const camera={
  readCurrentTurn:readTurn??(async()=>t),
  routeShootingTurn:async()=>route,verifyShootingRoute:async()=>true,
  interpretShooting:async()=>({}),
  readSignedCapture:async()=>session,
  readVerifiedV2CameraStatus:async x=>({
   verifiedBySecure56:true,verifiedByDevice:true,
   sessionId:x.secureSessionId,deviceDigest:x.deviceDigest,
   code:'V2_CAMERA_UI_STATUS',appCameraFlow:'AI_CAMERA_V2',
   guideLocation:'LEFT_GPT_ONLY',guideInputButtonPresent:false,
   autoArmed:false,rightCameraPaneConfirmed:true
  }),
  resolveActiveSignedSession:async()=>({
   verifiedBySecure56:true,sessionId:session.secureSessionId,
   deviceDigest:session.deviceDigest,taskDigest:session.taskDigest,
   commandId:session.commandId,expiresAtMs:Date.now()+25000
  }),
  claimOneShot:async()=>{events.push('claim');return {claimed:true};},
  renderInLeftChat:async x=>{events.push('left');return {
   shown:true,threadId:x.threadId,sourceRef:x.sourceRef,
   attachmentId:x.attachmentId,imageSha256:x.imageSha256,
   linesSha256:x.linesSha256,presentationId:'left-native-present-001'
  };},
  verifyLeftPresentationReceipt:async (receipt,bind)=>
   receipt.imageSha256===bind.imageSha256&&receipt.linesSha256===bind.linesSha256,
  applySignedGoal:async x=>{events.push('signed-apply');return {
   ok:true,code:'V2_REFERENCE_APPLIED',
   referenceId:x.goal.referenceId,referenceVisible:true,
   autoArmed:false,instructionsLocation:'LEFT_GPT_ONLY'
  };},
  verifySignedCameraApplyReceipt:async x=>{events.push('signed-receipt');return {
   verifiedBySecure56:true,verifiedByDevice:true,
   sessionId:x.secureSessionId,deviceDigest:x.deviceDigest,
   taskDigest:x.taskDigest,commandId:x.commandId,
   referenceId:x.referenceId,imageSha256:x.imageSha256,
   operation:x.expectedOperation,deviceResultCode:'V2_REFERENCE_APPLIED'
  };},
  ...cameraOverrides
 };
 const flow=createJH228NativeChatGPTCaptureFlow({
  currentTurn:bound,chatgptHostPorts:nativePorts,
  cameraHostPorts:camera,stageStore:store,env
 });
 return {flow,events,store};
}
test('composed first-party-only native artifact reaches signed APPLY without remote AUTO',async()=>{
 const {flow,events,store}=scenario();
 assert.equal(flow.mode,'CHATGPT_NATIVE_IMAGEGEN_ONLY');
 const result=await flow.run({mood:'따뜻한 분위기'});
 assert.equal(result.ok,true,result.code);
 assert.equal(result.code,'EXAMPLE_APPLIED_AWAIT_LOCAL_AUTO');
 assert.deepEqual(events,[
  'read-ref','capability','claim','native-gen','native-verify','native-read',
  'three-lines','left','signed-apply','signed-receipt'
 ]);
 assert.equal(result.autoClickedByHost,false);
 assert.equal(result.shutterTriggeredByHost,false);
 assert.equal(result.copyPasteOperations,0);
 assert.equal(store.pendingCount(),1);
 store.close();
});
test('legacy paid-image callbacks cannot override the native-only composition',async()=>{
 let paidCalls=0;
 const {flow,events,store}=scenario({cameraOverrides:{
  confirmImageGenerationReady:async()=>{paidCalls++;return {ready:true};},
  createSingleExample:async()=>{paidCalls++;return {count:1};}
 }});
 const result=await flow.run({mood:'차분한 느낌'});
 assert.equal(result.ok,true,result.code);
 assert.equal(paidCalls,0);
 assert.equal(events.includes('native-gen'),true);
 store.close();
});
test('stale current reference from another chat is blocked before any image effect',async()=>{
 const {flow,events,store}=scenario({readTurn:async()=>({
   ...t,sourceRef:'someone-else-chat'
 })});
 assert.equal((await flow.run({mood:'따뜻하게'})).code,'JH_CURRENT_REFERENCE_TURN_REQUIRED');
 assert.deepEqual(events,[]);
 store.close();
});
test('native generator not available blocks before SQLite one-shot claim',async()=>{
 const {flow,events,store}=scenario({capability:{
   canInvokeNativeImageTool:false,nativeArtifactReadbackAvailable:false
 }});
 const result=await flow.run({mood:'담백한 느낌'});
 assert.equal(result.ok,false);
 assert.equal(result.code,'PYEONBISEO_NATIVE_CHATGPT_NOT_READY');
 assert.deepEqual(events,['read-ref','capability']);
 assert.equal(store.pendingCount(),0);
 store.close();
});
