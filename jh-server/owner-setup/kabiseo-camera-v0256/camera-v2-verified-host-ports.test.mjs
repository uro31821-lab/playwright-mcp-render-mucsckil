import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {AiCameraV2StageStore} from '../../camera-v2-secure-stage.mjs';
import {createJH228HostDeliveryPorts} from './camera-v2-verified-host-ports.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const jpg=Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABMNDhEODBMRDxEVFBMXHTAfHRoaHToqLCMwRT1JR0Q9Q0FMVm1dTFFoUkFDX4JgaHF1e3x7SlyGkIV3j214e3b/2wBDARQVFR0ZHTgfHzh2T0NPdnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnb/wAARCAAwAEADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAT/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCgChOAAAAAAAAAAAAAAAAAAAAAA//Z','base64');
const scope={secureSessionId:'secure_session_0123456789abc',deviceDigest:'a'.repeat(64),
 taskDigest:'b'.repeat(64),commandId:'c'.repeat(32)};
const turn={threadId:'thread-7788',sourceRef:'turn-jh-7788',referenceAttachmentId:'reference-photo-7788'};
function make({render,resolve,store}={}){
 const imageStore=store??new AiCameraV2StageStore();
 const ports=createJH228HostDeliveryPorts({currentTurn:turn,signedScope:scope,store:imageStore,
  resolveActiveSignedSession:resolve??(async()=>({verifiedBySecure56:true,
   sessionId:scope.secureSessionId,deviceDigest:scope.deviceDigest,taskDigest:scope.taskDigest,
   commandId:scope.commandId,expiresAtMs:Date.now()+20000})),
  renderInLeftChat:render??(async x=>({shown:true,threadId:x.threadId,sourceRef:x.sourceRef,
   attachmentId:x.attachmentId,presentationId:'shown_left_0123456789'}))});
 const payload={threadId:turn.threadId,referenceId:'generated_photo_reference_1',
  bytes:jpg,size:jpg.length,sha256:sha(jpg),dimensions:{width:64,height:48},
  ...scope,verifiedBySecure56:false};
 const left={sourceReferenceId:turn.referenceAttachmentId,exampleJpeg:jpg,
  lines:['조금 가까이 가요.','왼쪽 옆에 서요.','폰을 살짝 기울여요.'],
  referenceIsSimulated:true,caption:'AI 예시'};
 return {ports,imageStore,payload,left};
}
test('verified current LEFT image receipt gates server-local Secure56 stage writer',async()=>{
 const {ports,imageStore,payload,left}=make();
 assert.equal((await ports.imageStage.stageVerifiedJpeg(payload)).acknowledged,false);
 assert.equal((await ports.chat.showLeft(left)).shown,true);
 const stage=await ports.imageStage.stageVerifiedJpeg(payload);
 assert.equal(stage.acknowledged,true);
 assert.equal(imageStore.describe(stage.stageLease).sha256,sha(jpg));
 assert.equal((await ports.imageStage.stageVerifiedJpeg(payload)).acknowledged,false);
 assert.equal((await ports.chat.showLeft(left)).shown,false);
 imageStore.close();
});
test('wrong, forged or missing LEFT display receipt never permits staging',async()=>{
 const {ports,imageStore,payload,left}=make({render:async x=>({shown:true,
  threadId:'OTHER',sourceRef:x.sourceRef,attachmentId:x.attachmentId,presentationId:'shown_left_0123456789'})});
 assert.equal((await ports.chat.showLeft(left)).shown,false);
 assert.equal((await ports.imageStage.stageVerifiedJpeg(payload)).acknowledged,false);
 assert.equal(imageStore.pendingCount(),0); imageStore.close();
});
test('current signed job and device must match the trusted server readback',async()=>{
 const {ports,imageStore,payload,left}=make({resolve:async()=>({
  verifiedBySecure56:true,sessionId:scope.secureSessionId,deviceDigest:scope.deviceDigest,
  taskDigest:scope.taskDigest,commandId:'d'.repeat(32),expiresAtMs:Date.now()+20000
 })});
 assert.equal((await ports.chat.showLeft(left)).shown,true);
 assert.equal((await ports.imageStage.stageVerifiedJpeg(payload)).acknowledged,false);
 assert.equal(imageStore.pendingCount(),0); imageStore.close();
});
test('cross-thread image and same-turn concurrent stage attempts fail closed',async()=>{
 const {ports,imageStore,payload,left}=make();
 assert.equal((await ports.chat.showLeft(left)).shown,true);
 const [a,b]=await Promise.all([ports.imageStage.stageVerifiedJpeg(payload),
  ports.imageStage.stageVerifiedJpeg({...payload,threadId:'forged'})]);
 assert.equal([a.acknowledged,b.acknowledged].filter(Boolean).length,1);
 assert.equal(imageStore.pendingCount(),1);imageStore.close();
});
