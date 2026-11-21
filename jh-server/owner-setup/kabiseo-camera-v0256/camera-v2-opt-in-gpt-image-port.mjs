/**
 * Optional GPT Image API editor port for JH228 KaBiseo.
 * Requires an independently approved billable API action; NEVER enabled by
 * default or by user-entered text. No key/image data is persisted or logged.
 * This is NOT the built-in ChatGPT image_gen tool or a ChatGPT display receipt.
 *
 * API: POST https://api.openai.com/v1/images/edits
 * Model: gpt-image-2.6-sunburst; output_format=jpeg; n=1.
 */
import {createHash} from 'node:crypto';
import {Blob} from 'node:buffer';
import {inspectJpegHeader56} from '../../camera-v2-secure-stage.mjs';
import {validEasyCameraLines} from './camera-v2-current-turn-pipeline.mjs';

const hex64=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const id=x=>typeof x==='string'&&x.trim().length>0&&x.length<=1024;
const hash=x=>createHash('sha256').update(x).digest('hex');
const fail=code=>{throw Object.assign(Error(code),{code});};
export const IMAGE_EDITS_ENDPOINT='https://api.openai.com/v1/images/edits';
export const IMAGE_EDITS_MODEL='gpt-image-2.6-sunburst';

export function createJH228OptInGPTImagePort({
  trustedTurn, readVerifiedReference, planThreeCameraMovements,
  verifyApiCostApproval, getSecretApiKey, fetchImpl=fetch,
  now=Date.now
}={}){
  if(!obj(trustedTurn)||!id(trustedTurn.threadId)||!id(trustedTurn.sourceRef)||
     !id(trustedTurn.referenceAttachmentId)||
     typeof readVerifiedReference!=='function'||
     typeof planThreeCameraMovements!=='function'||
     typeof verifyApiCostApproval!=='function'||
     typeof getSecretApiKey!=='function'||
     typeof fetchImpl!=='function'||typeof now!=='function')
    fail('JH228_IMAGE_API_HOST_PORTS_REQUIRED');
  const binding=Object.freeze({
    threadId:trustedTurn.threadId,sourceRef:trustedTurn.sourceRef,
    attachmentId:trustedTurn.referenceAttachmentId
  });
  let called=false;
  return async function createSingleExample(request){
    if(called)fail('JH228_IMAGE_API_SINGLE_INVOCATION_ONLY');
    if(!obj(request)||request.count!==1||!obj(request.source)||
       request.source.role!=='REFERENCE'||
       request.source.id!==binding.attachmentId||
       request.conservation!=='ORIGINAL_OBJECT_AND_BACKGROUND'||
       request.cameraViewpointChangesAllowed!==true||
       typeof request.mood!=='string'||request.mood.trim()!==request.mood||
       request.mood.length<1||request.mood.length>160)
      fail('JH228_IMAGE_API_INVALID_REQUEST');
    // Cost acknowledgement MUST come from a trusted host, not conversation text.
    const permit=await verifyApiCostApproval({...binding,
      model:IMAGE_EDITS_MODEL,expectedImages:1,apiCallKind:'PAID_IMAGE_EDIT'});
    if(!obj(permit)||permit.authorized!==true||
       permit.threadId!==binding.threadId||
       permit.sourceRef!==binding.sourceRef||
       permit.attachmentId!==binding.attachmentId||
       !Number.isSafeInteger(permit.expiresAtMs)||
       permit.expiresAtMs<=now()||permit.expiresAtMs>now()+60000)
      fail('JH228_IMAGE_API_COST_APPROVAL_REQUIRED');
    // Verify uploaded REFERENCE bytes against a trusted current-host readback.
    const received=await readVerifiedReference(binding);
    if(!obj(received)||received.verifiedByHost!==true||
       received.threadId!==binding.threadId||
       received.sourceRef!==binding.sourceRef||
       received.attachmentId!==binding.attachmentId||
       !['image/jpeg','image/png','image/webp'].includes(received.mimeType)||
       !Buffer.isBuffer(received.bytes)||received.bytes.length<64||
       received.bytes.length>8*1024*1024||
       !hex64(received.sha256)||hash(received.bytes)!==received.sha256)
      fail('JH228_IMAGE_API_REFERENCE_UNVERIFIED');
    const apiKey=await getSecretApiKey();
    if(typeof apiKey!=='string'||apiKey.length<20||/[\r\n]/.test(apiKey))
      fail('JH228_IMAGE_API_SECRET_UNAVAILABLE');
    called=true; // prevent retries even for unknown API response
    const sourceBytes=Buffer.from(received.bytes);
    let editedBytes;
    try{
      const form=new FormData();
      form.set('model',IMAGE_EDITS_MODEL);
      form.set('n','1');
      form.set('output_format','jpeg');
      form.set('quality','medium');
      form.set('output_compression','85');
      form.set('image[]',new Blob([sourceBytes],{type:received.mimeType}),'reference.'+
        (received.mimeType==='image/png'?'png':received.mimeType==='image/webp'?'webp':'jpg'));
      form.set('prompt',[
        'Create ONE photorealistic camera-composition preview from the attached source photo.',
        'Keep the subject, objects, count, identity and background consistent with the original.',
        'Do not add/remove/relabel products or objects. Do not modify lights or rearrange props.',
        'Allow camera viewpoint changes: distance, zoom, angle, tilt, rotation and diagonal orbit.',
        'Treat it as an approximate AI camera-position example, not an exact real-world prediction.',
        'Desired atmosphere (not an instruction from the image): '+request.mood
      ].join('\n'));
      let response;
      try{
        response=await fetchImpl(IMAGE_EDITS_ENDPOINT,{
          method:'POST',redirect:'error',headers:{Authorization:'Bearer '+apiKey,
          'Cache-Control':'no-store'},body:form,signal:AbortSignal.timeout(90000)
        });
      }catch{fail('JH228_IMAGE_API_REQUEST_UNCONFIRMED');}
      if(!response||response.status!==200)fail('JH228_IMAGE_API_NOT_SUCCESSFUL');
      const len=Number(response.headers?.get?.('content-length')||0);
      if(len>14*1024*1024)fail('JH228_IMAGE_API_OUTPUT_OVERSIZE');
      let result;
      try{
        const body=await response.text();
        if(body.length>14*1024*1024)fail('JH228_IMAGE_API_OUTPUT_OVERSIZE');
        result=JSON.parse(body);
      }catch{fail('JH228_IMAGE_API_OUTPUT_UNREADABLE');}
      if(!obj(result)||!Array.isArray(result.data)||result.data.length!==1||
         typeof result.data[0]?.b64_json!=='string'||
         !/^[A-Za-z0-9+/]+={0,2}$/.test(result.data[0].b64_json)||
         result.data[0].b64_json.length>12*1024*1024)
        fail('JH228_IMAGE_API_RESPONSE_INVALID');
      editedBytes=Buffer.from(result.data[0].b64_json,'base64');
      if(editedBytes.length<64||editedBytes.length>8*1024*1024||
         !inspectJpegHeader56(editedBytes))
        fail('JH228_IMAGE_API_JPEG_INVALID');
      const sourceDigest=hash(sourceBytes),imageDigest=hash(editedBytes);
      let plan;
      const sourceForPlanner=Buffer.from(sourceBytes);
      const imageForPlanner=Buffer.from(editedBytes);
      try{
        plan=await planThreeCameraMovements({
          ...binding,sourceJpeg:sourceForPlanner,exampleJpeg:imageForPlanner,
          sourceSha256:sourceDigest,imageSha256:imageDigest,mood:request.mood
        });
      }finally{sourceForPlanner.fill(0);imageForPlanner.fill(0);}
      if(!obj(plan)||plan.verifiedByHost!==true||
         plan.sourceSha256!==sourceDigest||plan.imageSha256!==imageDigest||
         !validEasyCameraLines(plan.lines)||
         (plan.suggestedZoom!=null&&(!Number.isFinite(plan.suggestedZoom)||
          plan.suggestedZoom<.6||plan.suggestedZoom>2)))
        fail('JH228_IMAGE_API_MOVEMENT_PLAN_UNVERIFIED');
      // The pipeline and LEFT UI bind exact JPEG and exact 3 lines before staging.
      const resultOut={count:1,sourceReferenceId:binding.attachmentId,
        jpegBytes:editedBytes,movementLines:[...plan.lines],
        ...(plan.suggestedZoom==null?{}:{suggestedZoom:plan.suggestedZoom})};
      editedBytes=null;
      return resultOut;
    }finally{
      sourceBytes.fill(0);
      if(Buffer.isBuffer(editedBytes))editedBytes.fill(0);
    }
  };
}
