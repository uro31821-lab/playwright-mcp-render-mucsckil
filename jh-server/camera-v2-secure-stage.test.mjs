import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash, createHmac, randomBytes} from 'node:crypto';
import {createServer} from 'node:http';
import {
  AiCameraV2StageStore, createSecure56StageVerifier, serveStagedJpeg,
  inspectJpegHeader56, sharedCameraV2StageStore
} from './camera-v2-secure-stage.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
function fixture(){
  const bytes=Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABMNDhEODBMRDxEVFBMXHTAfHRoaHToqLCMwRT1JR0Q9Q0FMVm1dTFFoUkFDX4JgaHF1e3x7SlyGkIV3j214e3b/2wBDARQVFR0ZHTgfHzh2T0NPdnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnb/wAARCAAwAEADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAT/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCgChOAAAAAAAAAAAAAAAAAAAAAA//Z','base64');
  const secret=Buffer.alloc(32,7),sessionId='test_session_secure56_00001';
  const scope={verifiedBySecure56:true,secureSessionId:sessionId,
    deviceDigest:sha('device'),taskDigest:sha('task'),commandId:'b'.repeat(32)};
  return {bytes,secret,scope};
}
test('process-shared stage store is private and initially empty',()=>{
  assert.ok(sharedCameraV2StageStore instanceof AiCameraV2StageStore);
  assert.equal(sharedCameraV2StageStore.pendingCount(),0);
});
test('JPEG segment preflight checks true frame size, not just SOI/EOI',()=>{
  const {bytes,scope}=fixture(),store=new AiCameraV2StageStore();
  assert.deepEqual(inspectJpegHeader56(bytes),{width:64,height:48});
  assert.equal(inspectJpegHeader56(Buffer.concat([Buffer.from([255,216]),Buffer.alloc(100,0),Buffer.from([255,217])])),null);
  const params={...scope,referenceId:'reference_example_0000',sha256:sha(bytes),
    bytes,size:bytes.length,dimensions:{width:64,height:47}};
  assert.equal(store.stageVerifiedJpeg(params).acknowledged,false);
  assert.equal(store.stageVerifiedJpeg({...params,dimensions:{width:64,height:48}}).acknowledged,true);
  store.close();
});
test('no unverified or tampered image is stageable',()=>{
  const {bytes,scope}=fixture(),store=new AiCameraV2StageStore();
  const x={...scope,referenceId:'reference_example_0001',sha256:sha(bytes),
    size:bytes.length,bytes,dimensions:{width:64,height:48}};
  assert.equal(store.stageVerifiedJpeg({...x,verifiedBySecure56:false}).acknowledged,false);
  assert.equal(store.stageVerifiedJpeg({...x,sha256:sha('tampered')}).acknowledged,false);
  assert.equal(store.stageVerifiedJpeg({...x,bytes:Buffer.alloc(128,0)}).acknowledged,false);
  assert.equal(store.pendingCount(),0);
});
test('Secure56 signed JPEG download accepts exactly one request, rejects forged HMAC', async()=>{
  const {bytes,secret,scope}=fixture(),store=new AiCameraV2StageStore();
  const stage=store.stageVerifiedJpeg({...scope,bytes,size:bytes.length,sha256:sha(bytes),
    referenceId:'reference_example_0002',dimensions:{width:64,height:48}});
  assert.equal(stage.acknowledged,true);
  const seen=new Set();
  const verifier=createSecure56StageVerifier({
    store,lookupActiveSession:async sid=>sid===scope.secureSessionId?
      {verifiedBySecure56:true,sessionId:sid,deviceDigest:scope.deviceDigest,
       secret,expiresAtMs:Date.now()+60000}:null,
    claimNonce:async ({nonce})=>{if(seen.has(nonce))return false;seen.add(nonce);return true;}
  });
  const server=createServer(async(req,res)=>{
    if(!await serveStagedJpeg(req,res,{store,verifyActiveDeviceSession:verifier}))
      res.writeHead(404).end('OTHER_PATH');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const origin='http://127.0.0.1:'+server.address().port,lease=stage.stageLease;
    const exp=Date.now()+20000,nonce=randomBytes(18).toString('base64url');
    const mac=createHmac('sha256',secret).update([
      'frame',scope.secureSessionId,lease,scope.deviceDigest,nonce,exp,scope.taskDigest,stage.sha256,stage.size
    ].join('|')).digest('hex');
    const headers={
      'x-jh-stage-lease':lease,'x-jh-session':scope.secureSessionId,
      'x-jh-device':scope.deviceDigest,'x-jh-task-digest':scope.taskDigest,
      'x-jh-command-id':scope.commandId,'x-jh-image-sha256':stage.sha256,
      'x-jh-byte-count':String(stage.size),'x-jh-nonce':nonce,
      'x-jh-expires':String(exp),'x-jh-mac':mac
    };
    const path='/device/camera-v2-example';
    const forged=await fetch(origin+path,{headers:{...headers,'x-jh-mac':'f'.repeat(64)}});
    assert.equal(forged.status,403);
    assert.equal(store.pendingCount(),1);
    const withQuery=await fetch(origin+path+'?lease='+lease,{headers});
    assert.equal(withQuery.status,400);
    const res=await fetch(origin+path,{headers});
    assert.equal(res.status,200);
    assert.equal(res.headers.get('content-type'),'image/jpeg');
    assert.equal(res.headers.get('x-jh-image-sha256'),sha(bytes));
    assert.deepEqual(Buffer.from(await res.arrayBuffer()),bytes);
    const replay=await fetch(origin+path,{headers});
    assert.equal(replay.status,403); // A consumed lease is indistinguishable from an invalid proof.
    assert.equal(store.pendingCount(),0);
    const unmatched=await fetch(origin+'/health',{headers});
    assert.equal(unmatched.status,404);
  } finally {await new Promise(resolve=>server.close(resolve));store.close();}
});
test('expired lease removes bytes from server state',()=>{
  let now=1000000000000;
  const {bytes,scope}=fixture(),store=new AiCameraV2StageStore({now:()=>now});
  const s=store.stageVerifiedJpeg({...scope,bytes,sha256:sha(bytes),size:bytes.length,
    referenceId:'reference_example_0003',dimensions:{width:64,height:48}});
  assert.equal(s.acknowledged,true);
  now+=30001;
  assert.equal(store.describe(s.stageLease),null);
  assert.equal(store.pendingCount(),0);
});
