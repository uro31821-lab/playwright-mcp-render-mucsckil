/**
 * JH228 KaBiseo: native ChatGPT ImageGen handoff ONLY.
 *
 * This module cannot invoke ChatGPT's internal image tool or read ChatGPT
 * attachments by itself. All callbacks must be privileged, current-turn,
 * user-authorized host ports. No paid OpenAI API, API key, fetch, public URL,
 * hidden UI automation, or third-party image service is used.
 *
 * The returned example is a camera-composition illustration, not a promise
 * of an exact achievable photograph. Native artifacts may need host-side JPEG
 * conversion (readVerifiedNativeJpeg); the returned bytes must be verified.
 */
import {createHash} from 'node:crypto';
import {inspectJpegHeader56} from '../../camera-v2-secure-stage.mjs';
import {validEasyCameraLines} from './camera-v2-current-turn-pipeline.mjs';

export const NATIVE_PROVIDER='CHATGPT_NATIVE_IMAGEGEN';
const ID=v=>typeof v==='string'&&v.length>0&&v.length<=1024&&!/[\r\n\u0000]/u.test(v);
const OBJ=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const HASH=/^[a-f0-9]{64}$/;
const SHA=b=>createHash('sha256').update(b).digest('hex');
const error=code=>{throw Object.assign(Error(code),{code});};
function scopeMatches(a,b){
  return OBJ(a)&&a.threadId===b.threadId&&a.sourceRef===b.sourceRef&&
    a.attachmentId===b.attachmentId;
}

/**
 * Host ports are explicitly separate for generation and verifying its actual
 * output. Neither callback can authorize itself by setting a "verified" flag.
 * All artifact bytes stay in memory; raw user filenames and photos are not logged.
 */
export function createNativeChatGPTImagePorts({
  currentTurn,
  readCurrentVerifiedReference,
  verifyNativeImageCapability,
  requestNativeImageEdit,
  verifyNativeGenerationReceipt,
  readVerifiedNativeJpeg,
  planThreeCameraMovements
}={}){
  if(!OBJ(currentTurn)||!ID(currentTurn.threadId)||!ID(currentTurn.sourceRef)||
     !ID(currentTurn.referenceAttachmentId)||
     [readCurrentVerifiedReference,verifyNativeImageCapability,requestNativeImageEdit,
      verifyNativeGenerationReceipt,readVerifiedNativeJpeg,planThreeCameraMovements]
       .some(fn=>typeof fn!=='function'))
    error('JH228_NATIVE_CHATGPT_PORTS_REQUIRED');

  const binding=Object.freeze({threadId:currentTurn.threadId,
    sourceRef:currentTurn.sourceRef,attachmentId:currentTurn.referenceAttachmentId});
  let ready=null, attempted=false;
  function publicReadiness(){
    const {sourceHandle,sourceSha256,...view}=ready;
    return {...view}; // opaque current-attachment handle never escapes preflight
  }

  async function confirmImageGenerationReady(request){
    if(attempted||!scopeMatches(request,binding)||request.count!==1||
       typeof request.mood!=='string'||!request.mood.trim()||
       request.mood.trim().length>160)return {ready:false};
    if(ready)return publicReadiness();
    try{
      // This readback must come from the authenticated current-turn attachment
      // store, never a previous chat message or a model-supplied URL.
      const source=await readCurrentVerifiedReference(binding);
      if(!scopeMatches(source,binding)||source.verifiedByHost!==true||
         source.role!=='REFERENCE'||!ID(source.assetHandle)||
         !HASH.test(source.sha256??'')||
         !['image/jpeg','image/png','image/webp'].includes(source.mimeType))
        return {ready:false};
      const capability=await verifyNativeImageCapability(binding);
      if(!scopeMatches(capability,binding)||
         capability.verifiedByHost!==true||
         capability.provider!==NATIVE_PROVIDER||
         capability.canInvokeNativeImageTool!==true||
         capability.nativeArtifactReadbackAvailable!==true||
         capability.nativeLeftRenderReceiptAvailable!==true||
         capability.externalApiRequired!==false||
         capability.paidApiBillingAuthorized!==false)
        return {ready:false};
      ready=Object.freeze({...binding,ready:true,verifiedByHost:true,
        provider:NATIVE_PROVIDER,billingMode:'CHATGPT_PLAN',
        externalApiRequired:false,paidApiBillingAuthorized:false,
        nativeArtifactReadbackAvailable:true,
        nativeLeftRenderReceiptAvailable:true,
        sourceHandle:source.assetHandle,sourceSha256:source.sha256});
      return publicReadiness();
    }catch{return {ready:false};}
  }

  async function createSingleExample(request){
    if(attempted)error('JH228_NATIVE_IMAGE_ONCE_ONLY');
    if(!ready?.ready||ready.provider!==NATIVE_PROVIDER)
      error('JH228_NATIVE_IMAGE_NOT_READY');
    if(!OBJ(request)||request.count!==1||request.conservation!=='ORIGINAL_OBJECT_AND_BACKGROUND'||
       request.cameraViewpointChangesAllowed!==true||
       !OBJ(request.source)||request.source.role!=='REFERENCE'||
       request.source.id!==binding.attachmentId||
       typeof request.mood!=='string'||!request.mood.trim()||request.mood.trim().length>160)
      error('JH228_NATIVE_IMAGE_REQUEST_INVALID');
    attempted=true; // if any effect becomes uncertain, never repeat automatically
    let generated,artifact,verified;
    try{
      // This function MUST be implemented by the native ChatGPT runtime;
      // it is not an OpenAI Platform REST call and uses no API key.
      generated=await requestNativeImageEdit({
        ...binding,sourceAssetHandle:ready.sourceHandle,
        sourceSha256:ready.sourceSha256,mood:request.mood.trim(),
        numberOfImages:1,outputPurpose:'CAMERA_VIEWPOINT_EXAMPLE',
        originalObjectsUnchanged:true,allowCameraMove:true,
        forbidObjectRelocation:true,forbidLightingManipulation:true,
        approximateReferenceOnly:true
      });
      if(!OBJ(generated)||!ID(generated.generationId)||!ID(generated.imageAssetId)||
         generated.provider!==NATIVE_PROVIDER||
         generated.numberOfImages!==1||
         !scopeMatches(generated,binding)||
         generated.sourceSha256!==ready.sourceSha256)
        error('JH228_NATIVE_GENERATION_RECEIPT_REQUIRED');

      // Must be independent of the text/model output. A model cannot forge
      // a completed native image or bypass a missing host artifact readback.
      verified=await verifyNativeGenerationReceipt(generated,{
        ...binding,sourceSha256:ready.sourceSha256,provider:NATIVE_PROVIDER,
        imageAssetId:generated.imageAssetId,generationId:generated.generationId
      });
      if(verified!==true)error('JH228_NATIVE_GENERATION_NOT_ATTESTED');

      artifact=await readVerifiedNativeJpeg({
        ...binding,provider:NATIVE_PROVIDER,
        generationId:generated.generationId,imageAssetId:generated.imageAssetId
      });
      if(!OBJ(artifact)||!scopeMatches(artifact,binding)||
         artifact.verifiedByHost!==true||
         artifact.generationId!==generated.generationId||
         artifact.imageAssetId!==generated.imageAssetId||
         !Buffer.isBuffer(artifact.jpegBytes)||
         artifact.jpegBytes.length>8*1024*1024||
         !HASH.test(artifact.imageSha256??'')||
         SHA(artifact.jpegBytes)!==artifact.imageSha256||
         !inspectJpegHeader56(artifact.jpegBytes))
        error('JH228_NATIVE_JPEG_ARTIFACT_INVALID');

      const movementPlan=await planThreeCameraMovements({
        ...binding,provider:NATIVE_PROVIDER,mood:request.mood.trim(),
        sourceSha256:ready.sourceSha256,imageSha256:artifact.imageSha256,
        imageAssetId:generated.imageAssetId,generationId:generated.generationId
      });
      if(!OBJ(movementPlan)||movementPlan.verifiedByHost!==true||
         !scopeMatches(movementPlan,binding)||
         movementPlan.sourceSha256!==ready.sourceSha256||
         movementPlan.imageSha256!==artifact.imageSha256||
         !validEasyCameraLines(movementPlan.lines)||
         (movementPlan.suggestedZoom!=null&&
          (!Number.isFinite(movementPlan.suggestedZoom)||
           movementPlan.suggestedZoom<.6||movementPlan.suggestedZoom>2)))
        error('JH228_NATIVE_MOVEMENT_PLAN_INVALID');
      return {
        count:1,sourceReferenceId:binding.attachmentId,
        provider:NATIVE_PROVIDER,nativeArtifactVerified:true,
        sourceSha256:ready.sourceSha256,imageSha256:artifact.imageSha256,
        jpegBytes:Buffer.from(artifact.jpegBytes),
        movementLines:[...movementPlan.lines],
        ...(movementPlan.suggestedZoom==null?{}:{suggestedZoom:movementPlan.suggestedZoom})
      };
    }catch(e){
      // No error message/user prompt/returned image bytes may be serialized.
      if(typeof e?.code==='string'&&/^JH228_NATIVE_[A-Z_]+$/.test(e.code))throw e;
      error('JH228_NATIVE_GENERATION_UNCONFIRMED');
    }
  }

  return Object.freeze({confirmImageGenerationReady,createSingleExample});
}
