import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createJH228OptInGPTImagePort,IMAGE_EDITS_ENDPOINT,IMAGE_EDITS_MODEL}
  from './camera-v2-opt-in-gpt-image-port.mjs';
const image=Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABMNDhEODBMRDxEVFBMXHTAfHRoaHToqLCMwRT1JR0Q9Q0FMVm1dTFFoUkFDX4JgaHF1e3x7SlyGkIV3j214e3b/2wBDARQVFR0ZHTgfHzh2T0NPdnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnb/wAARCAAwAEADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAT/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCgChOAAAAAAAAAAAAAAAAAAAAAA//Z','base64');
const hash=x=>createHash('sha256').update(x).digest('hex');
const binding={threadId:'thread-owner-123',sourceRef:'current-source-123',
 referenceAttachmentId:'user-reference-123'};
const secret='sk_test_private_mock_key_012345678901';
function fixture(overrides={}){
 const calls={read:0,fetch:0,plan:0,key:0,permit:0};
 const deps={
  trustedTurn:binding,
  verifyApiCostApproval:async a=>{
    calls.permit++;return {authorized:true,threadId:a.threadId,sourceRef:a.sourceRef,
      attachmentId:a.attachmentId,expiresAtMs:Date.now()+25000};
  },
  readVerifiedReference:async a=>{
    calls.read++;return {verifiedByHost:true,...a,mimeType:'image/jpeg',
      bytes:Buffer.from(image),sha256:hash(image)};
  },
  getSecretApiKey:async()=>{calls.key++;return secret;},
  fetchImpl:async (url,options)=>{
    calls.fetch++;
    assert.equal(url,IMAGE_EDITS_ENDPOINT);
    assert.equal(options.method,'POST');
    assert.equal(options.redirect,'error');
    assert.equal(options.headers.Authorization,'Bearer '+secret);
    const form=options.body;
    assert.equal(form.get('model'),IMAGE_EDITS_MODEL);
    assert.equal(form.get('n'),'1');
    assert.equal(form.get('output_format'),'jpeg');
    assert.equal(form.get('quality'),'medium');
    assert.equal(form.getAll('image[]').length,1);
    assert.match(form.get('prompt'),/camera viewpoint/i);
    assert.deepEqual(Buffer.from(await form.get('image[]').arrayBuffer()),image);
    return new Response(JSON.stringify({data:[{b64_json:image.toString('base64')}]}),
      {status:200,headers:{'content-type':'application/json'}});
  },
  planThreeCameraMovements:async x=>{
    calls.plan++;
    assert.equal(x.sourceSha256,hash(image));
    assert.equal(x.imageSha256,hash(image));
    assert.equal(x.sourceRef,binding.sourceRef);
    return {verifiedByHost:true,sourceSha256:x.sourceSha256,
      imageSha256:x.imageSha256,suggestedZoom:1.15,
      lines:['조금 더 가까이 가요.','제품 옆으로 돌아서요.','폰을 비스듬히 기울여요.']};
  },
  ...overrides
 };
 const create=createJH228OptInGPTImagePort(deps);
 const request={source:{id:binding.referenceAttachmentId,role:'REFERENCE'},
   mood:'따뜻하고 차분한 느낌',count:1,conservation:'ORIGINAL_OBJECT_AND_BACKGROUND',
   cameraViewpointChangesAllowed:true};
 return {create,request,calls};
}
test('default-off approval blocks paid API and reference read',async()=>{
 const {create,request,calls}=fixture({verifyApiCostApproval:async()=>({authorized:false})});
 await assert.rejects(create(request),/JH228_IMAGE_API_COST_APPROVAL_REQUIRED/);
 assert.equal(calls.fetch,0);assert.equal(calls.read,0);assert.equal(calls.key,0);
});
test('exact verified reference generates ONE JPEG via official opt-in API and matches three movements',async()=>{
 const {create,request,calls}=fixture();
 const imageResult=await create(request);
 assert.equal(imageResult.count,1);
 assert.equal(imageResult.sourceReferenceId,binding.referenceAttachmentId);
 assert.equal(imageResult.jpegBytes.equals(image),true);
 assert.equal(imageResult.movementLines.length,3);
 assert.equal(imageResult.suggestedZoom,1.15);
 assert.deepEqual([calls.read,calls.key,calls.fetch,calls.plan],[1,1,1,1]);
 await assert.rejects(create(request),/JH228_IMAGE_API_SINGLE_INVOCATION_ONLY/);
 assert.equal(calls.fetch,1);
});
test('wrong source, forged reference digest and API-key absence never invoke paid image edit',async()=>{
 const a=fixture();
 await assert.rejects(a.create({...a.request,source:{id:'other-attachment',role:'REFERENCE'}}),
  /JH228_IMAGE_API_INVALID_REQUEST/);
 assert.equal(a.calls.fetch,0);
 const b=fixture({readVerifiedReference:async x=>({verifiedByHost:true,...x,
   mimeType:'image/jpeg',bytes:image,sha256:hash('forged')})});
 await assert.rejects(b.create(b.request),/JH228_IMAGE_API_REFERENCE_UNVERIFIED/);
 assert.equal(b.calls.fetch,0);
 const c=fixture({getSecretApiKey:async()=>''});
 await assert.rejects(c.create(c.request),/JH228_IMAGE_API_SECRET_UNAVAILABLE/);
 assert.equal(c.calls.fetch,0);
});
test('server errors or non-JPEG return fail closed, with no automatic repeat',async()=>{
 const a=fixture({fetchImpl:async()=>new Response('{}',{status:503})});
 await assert.rejects(a.create(a.request),/JH228_IMAGE_API_NOT_SUCCESSFUL/);
 await assert.rejects(a.create(a.request),/JH228_IMAGE_API_SINGLE_INVOCATION_ONLY/);
 const b=fixture({fetchImpl:async()=>new Response(JSON.stringify({data:[{b64_json:'aGVsbG8='}]}),
  {status:200})});
 await assert.rejects(b.create(b.request),/JH228_IMAGE_API_JPEG_INVALID/);
});
test('planner must bind BOTH real output and input SHA; no invented camera directions',async()=>{
 const a=fixture({planThreeCameraMovements:async p=>({
  verifiedByHost:true,sourceSha256:p.sourceSha256,imageSha256:hash('forged'),
  lines:['조금 더 가까이 가요.','왼쪽으로 가요.','폰을 살짝 기울여요.']
 })});
 await assert.rejects(a.create(a.request),/JH228_IMAGE_API_MOVEMENT_PLAN_UNVERIFIED/);
 const b=fixture({planThreeCameraMovements:async p=>({
  verifiedByHost:true,sourceSha256:p.sourceSha256,imageSha256:p.imageSha256,
  lines:['조명을 켜요.','제품을 옮겨요.','폰을 기울여요.']
 })});
 await assert.rejects(b.create(b.request),/JH228_IMAGE_API_MOVEMENT_PLAN_UNVERIFIED/);
});
