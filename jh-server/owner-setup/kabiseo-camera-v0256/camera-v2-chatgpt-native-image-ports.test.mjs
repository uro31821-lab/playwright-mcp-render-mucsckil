import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createNativeChatGPTImagePorts,NATIVE_PROVIDER}
  from './camera-v2-chatgpt-native-image-ports.mjs';

const jpg=Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABMNDhEODBMRDxEVFBMXHTAfHRoaHToqLCMwRT1JR0Q9Q0FMVm1dTFFoUkFDX4JgaHF1e3x7SlyGkIV3j214e3b/2wBDARQVFR0ZHTgfHzh2T0NPdnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnb/wAARCAAwAEADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAT/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCgChOAAAAAAAAAAAAAAAAAAAAAA//Z','base64');
const sha=x=>createHash('sha256').update(x).digest('hex');
const current={threadId:'camera-thread-001',sourceRef:'turn-source-001',
 referenceAttachmentId:'reference-photo-001'};
const binding={threadId:current.threadId,sourceRef:current.sourceRef,
 attachmentId:current.referenceAttachmentId};
const sourceDigest=sha('actual-reference-image-bound-by-host');
const refId='native-source-handle-private-001';
const generationId='native-generation-001';
const imageAssetId='native-rendered-artifact-001';
const mood='따뜻한 분위기';
const lines=['조금 더 가까이 가요.','왼쪽 옆으로 가요.','폰을 살짝 기울여요.'];
const preflight={...binding,mood,count:1};
const request={source:{id:binding.attachmentId,role:'REFERENCE'},mood,count:1,
 conservation:'ORIGINAL_OBJECT_AND_BACKGROUND',cameraViewpointChangesAllowed:true};

function harness(overrides={}){
 const trace=[];
 const adapters={
  currentTurn:current,
  readCurrentVerifiedReference:async x=>{
    trace.push('readReference');
    return {...x,verifiedByHost:true,role:'REFERENCE',
      assetHandle:refId,sha256:sourceDigest,mimeType:'image/jpeg'};
  },
  verifyNativeImageCapability:async x=>{
    trace.push('capability');
    return {...x,verifiedByHost:true,provider:NATIVE_PROVIDER,
      canInvokeNativeImageTool:true,nativeArtifactReadbackAvailable:true,
      nativeLeftRenderReceiptAvailable:true,externalApiRequired:false,
      paidApiBillingAuthorized:false};
  },
  requestNativeImageEdit:async x=>{
    trace.push('nativeGenerate');
    assert.equal(x.sourceAssetHandle,refId);
    assert.equal(x.numberOfImages,1);
    assert.equal(x.originalObjectsUnchanged,true);
    assert.equal(x.approximateReferenceOnly,true);
    return {...binding,provider:NATIVE_PROVIDER,generationId,imageAssetId,
      numberOfImages:1,sourceSha256:sourceDigest};
  },
  verifyNativeGenerationReceipt:async (rec, evidence)=>{
    trace.push('verifyReceipt');
    return rec.generationId===evidence.generationId&&
      rec.imageAssetId===evidence.imageAssetId&&
      rec.sourceSha256===evidence.sourceSha256;
  },
  readVerifiedNativeJpeg:async x=>{
    trace.push('readArtifact');
    return {...binding,verifiedByHost:true,generationId:x.generationId,
      imageAssetId:x.imageAssetId,jpegBytes:Buffer.from(jpg),imageSha256:sha(jpg)};
  },
  planThreeCameraMovements:async x=>{
    trace.push('plan');
    return {...binding,verifiedByHost:true,sourceSha256:x.sourceSha256,
      imageSha256:x.imageSha256,lines,suggestedZoom:1.2};
  },
  ...overrides
 };
 return {ports:createNativeChatGPTImagePorts(adapters),trace};
}

test('native ChatGPT readiness has zero paid API and leaks no private asset handle',async()=>{
 const {ports,trace}=harness();
 const readiness=await ports.confirmImageGenerationReady(preflight);
 assert.equal(readiness.ready,true);
 assert.equal(readiness.provider,NATIVE_PROVIDER);
 assert.equal(readiness.billingMode,'CHATGPT_PLAN');
 assert.equal(readiness.externalApiRequired,false);
 assert.equal(readiness.paidApiBillingAuthorized,false);
 assert.equal(readiness.sourceSha256,sourceDigest);
 assert.equal('sourceHandle' in readiness,false);
 assert.deepEqual(trace,['readReference','capability']);
});
test('one native ChatGPT image artifact is verified, read back as JPEG, and planned once',async()=>{
 const {ports,trace}=harness();
 await ports.confirmImageGenerationReady(preflight);
 const generated=await ports.createSingleExample(request);
 assert.equal(generated.count,1);
 assert.equal(generated.provider,NATIVE_PROVIDER);
 assert.equal(generated.nativeArtifactVerified,true);
 assert.equal(generated.sourceSha256,sourceDigest);
 assert.equal(generated.imageSha256,sha(jpg));
 assert.equal(generated.jpegBytes.equals(jpg),true);
 assert.deepEqual(generated.movementLines,lines);
 assert.equal(generated.suggestedZoom,1.2);
 assert.deepEqual(trace,['readReference','capability','nativeGenerate','verifyReceipt',
   'readArtifact','plan']);
 await assert.rejects(ports.createSingleExample(request),/JH228_NATIVE_IMAGE_ONCE_ONLY/);
});
test('no capability means no generation call or API fallback',async()=>{
 const {ports,trace}=harness({verifyNativeImageCapability:async x=>{
   trace.push('capability');return {...x,verifiedByHost:true,
     provider:'OPENAI_EXTERNAL_PAID_API',canInvokeNativeImageTool:false,
     nativeArtifactReadbackAvailable:false,nativeLeftRenderReceiptAvailable:false,
     externalApiRequired:true,paidApiBillingAuthorized:true};
 }});
 assert.equal((await ports.confirmImageGenerationReady(preflight)).ready,false);
 await assert.rejects(ports.createSingleExample(request),/JH228_NATIVE_IMAGE_NOT_READY/);
 assert.deepEqual(trace,['readReference','capability']);
});
test('foreign chat attachment cannot pass current native image reference proof',async()=>{
 const {ports,trace}=harness({readCurrentVerifiedReference:async x=>{
   trace.push('readReference');return {...x,attachmentId:'other-chat-image',
     verifiedByHost:true,role:'REFERENCE',assetHandle:refId,
     sha256:sourceDigest,mimeType:'image/jpeg'};
 }});
 assert.equal((await ports.confirmImageGenerationReady(preflight)).ready,false);
 assert.deepEqual(trace,['readReference']);
});
test('model self-reported generated image cannot replace independent host receipt',async()=>{
 const {ports,trace}=harness({verifyNativeGenerationReceipt:async()=>{
   trace.push('verifyReceipt');return false;
 }});
 await ports.confirmImageGenerationReady(preflight);
 await assert.rejects(ports.createSingleExample(request),/JH228_NATIVE_GENERATION_NOT_ATTESTED/);
 assert.deepEqual(trace,['readReference','capability','nativeGenerate','verifyReceipt']);
});
test('wrong image digest, foreign generation ID and invalid JPEG are all rejected',async()=>{
 for(const change of [
   {imageSha256:sha('forged')},
   {generationId:'wrong-generation-001'},
   {jpegBytes:Buffer.alloc(256,1),imageSha256:sha(Buffer.alloc(256,1))}
 ]){
   const {ports}=harness({readVerifiedNativeJpeg:async x=>({
      ...binding,verifiedByHost:true,
      generationId:x.generationId,imageAssetId:x.imageAssetId,
      jpegBytes:Buffer.from(jpg),imageSha256:sha(jpg),...change
   })});
   await ports.confirmImageGenerationReady(preflight);
   await assert.rejects(ports.createSingleExample(request),
     /JH228_NATIVE_JPEG_ARTIFACT_INVALID/);
 }
});
test('camera plan must bind source + image SHA, and must not relocate objects/lights',async()=>{
 const {ports}=harness({planThreeCameraMovements:async x=>({
   ...binding,verifiedByHost:true,sourceSha256:x.sourceSha256,
   imageSha256:x.imageSha256,
   lines:['제품을 옮겨요.','불을 켜요.','폰을 기울여요.']
 })});
 await ports.confirmImageGenerationReady(preflight);
 await assert.rejects(ports.createSingleExample(request),
  /JH228_NATIVE_MOVEMENT_PLAN_INVALID/);
});
test('unauthorized count, source or malformed mood cannot trigger native generation',async()=>{
 const {ports,trace}=harness();
 assert.equal((await ports.confirmImageGenerationReady({...preflight,count:2})).ready,false);
 await ports.confirmImageGenerationReady(preflight);
 await assert.rejects(ports.createSingleExample({...request,count:2}),
  /JH228_NATIVE_IMAGE_REQUEST_INVALID/);
 assert.equal(trace.includes('nativeGenerate'),false);
});
