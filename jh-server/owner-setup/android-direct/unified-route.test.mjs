import test from 'node:test';
import assert from 'node:assert/strict';
import {createUnifiedAndroidRoute,resolveAndroidWebTarget} from './unified-route.mjs';
const id='a'.repeat(32),id2='b'.repeat(32);
const now=1800000000000;
const owner=()=>({current:true,secure56:true,sameProcess:true,
 deviceId:'synthetic-fold',sessionId:'signed-session',commandId:id});
const cap=()=>({
 verifiedByExistingSecure56:true,
 source:'SIGNED_DEVICE_CAPABILITY_RECEIPT',
 deviceId:'synthetic-fold',sessionId:'signed-session',commandId:id,
 observedAtMs:now-1000,features:{LEFT_WEB_LINK_V1:true}
});
const signed=(status='complete',good=true)=>({
 receiptAuthenticatedByJH:true,
 jobId:'signed-open-1',deviceId:'synthetic-fold',sessionId:'signed-session',
 commandId:id,status,deviceReportedOk:good
});
const observed=()=>({ok:true,workPaneSide:'LEFT',chatPaneSide:'RIGHT',
 rightPaneDigest:'c'.repeat(64),workPackage:'com.android.chrome',
 physicalUnfoldVerified:false});
function make(opt={}){
 const log=[];let cur=owner(),deviceCap=cap(),job=signed(),
  view=observed(),addr=true,nowMs=now;
 let releaseCapability,releaseAddress;
 const capGate=new Promise(resolve=>releaseCapability=resolve);
 const addressGate=new Promise(resolve=>releaseAddress=resolve);
 const controller={
  capabilities:()=>({
   hostLocalOnly:true,existingSecure56Required:true,playwrightUsed:false,
   layoutMode:'LEFT_WEB_RIGHT_GPT',workPaneSide:'LEFT',
   ...opt.engine
  }),
  capture:async()=>{log.push(['capture']);return view},
  prepare:async({args})=>{log.push(['prepare',args]);return {ok:true,code:'PHONE_PREPARED',preparationId:'prepared-1'}},
  execute:async({operationId,preparationId})=>{
   log.push(['execute',operationId,preparationId]);return {ok:false,code:'PHONE_REPORTED_OK_UNVERIFIED'}},
  status:async({operationId})=>{
   log.push(['status',operationId]);return {ok:false,code:'PENDING_SAME_PHONE_JOB'}},
  cancelPreparation:()=>{log.push(['cancel']);return {ok:true,code:'PREPARATION_CANCELLED'}}
 };
 const router=createUnifiedAndroidRoute({
  controller,enabled:opt.enabled??true,clock:()=>nowMs,
  readOwner:()=>cur,readSignedCapability:async()=>{
    log.push(['capability']);if(opt.capDelay)await capGate;return deviceCap
  },
  openLeftWeb:async input=>{log.push(['open',input]);if(opt.openThrows)throw Error('link lost');return job},
  readOpenJob:async input=>{log.push(['open-status',input]);return job},
  readSignedAddress:async input=>{
   log.push(['address',input]);
   if(opt.addressDelay)await addressGate;
   if(!addr)return null;
   return {verifiedByExistingSecure56:true,source:'SIGNED_ANDROID_ADDRESS_READBACK',
     deviceId:'synthetic-fold',sessionId:'signed-session',
     commandId:id,rightPaneDigest:'c'.repeat(64),observedAtMs:nowMs-50,
     observedUrl:input.expectedUrl}
  }
 });
 return {
  router,log,req:(mode,rest={})=>({mode,commandId:id,...rest}),
  setCap:c=>{deviceCap=c},setOwner:x=>{cur=x},setJob:j=>{job=j},
  setView:x=>{view=x},setAddress:x=>{addr=x},tick:x=>{nowMs=x},
  unblockCapability:()=>releaseCapability(),
  unblockAddress:()=>releaseAddress(),
  io:()=>log.filter(x=>x[0]==='open')
 };
}
test('one phone engine is default-disabled; no Playwright route can be selected',async()=>{
 const s=make({enabled:false});
 assert.equal(s.router.capabilities().playwrightFallback,false);
 assert.equal(s.router.capabilities().engine,'ANDROID_SECURE56_SINGLE');
 assert.equal((await s.router.run(s.req('OPEN_WEB',{target:'네이버 메일',operationId:id2}))).code,
  'UNIFIED_ANDROID_DISABLED');
 assert.equal(s.log.length,0);
});
test('exact aliases resolve to HTTPS; unknown name is not guessed',()=>{
 assert.equal(resolveAndroidWebTarget('네이버 메일'),'https://mail.naver.com/');
 assert.equal(resolveAndroidWebTarget('naver mail'),'https://mail.naver.com/');
 assert.equal(resolveAndroidWebTarget('유튜브'),'https://www.youtube.com/');
 for(const x of ['네버멜','http://example.com','javascript:alert(1)',
  'file:///data','https://user:pass@example.com','https://127.0.0.1',
  'https://localhost','https://company.local','https://internal.internal',
  'https://example.com:8443',''])assert.equal(resolveAndroidWebTarget(x),null,x);
 assert.equal(resolveAndroidWebTarget('https://openai.com/'),'https://openai.com/');
});
test('no signed phone LEFT_WEB capability means no browser request',async()=>{
 const s=make();s.setCap({...cap(),features:{}});
 assert.equal((await s.router.run(s.req('OPEN_WEB',{target:'네이버 메일',operationId:id2}))).code,
  'SIGNED_PHONE_LEFT_WEB_CAPABILITY_REQUIRED');
 assert.equal(s.io().length,0);
});
test('stale and mismatched capability cannot enable old Android phone',async()=>{
 for(const v of [{...cap(),observedAtMs:now-60000},
   {...cap(),sessionId:'wrong'}, {...cap(),verifiedByExistingSecure56:false},
   {...cap(),source:'GUESSED_CAPABILITY'}]){
   const s=make();s.setCap(v);
   assert.equal((await s.router.run(s.req('OPEN_WEB',{target:'네이버 메일',operationId:id2}))).code,
    'SIGNED_PHONE_LEFT_WEB_CAPABILITY_REQUIRED');
   assert.equal(s.io().length,0);
 }
});
test('wrong owner command prevents opening and touching another session',async()=>{
 const s=make();s.setOwner({...owner(),sessionId:'changed',commandId:id2});
 assert.equal((await s.router.run(s.req('OPEN_WEB',{target:'네이버 메일',operationId:id2}))).code,
  'CURRENT_SIGNED_OWNER_COMMAND_REQUIRED');
 assert.equal(s.io().length,0);
});
test('left web/GPT split proof is required before phone OPEN',async()=>{
 const s=make();s.setView({...observed(),workPaneSide:'RIGHT',chatPaneSide:'LEFT'});
 assert.equal((await s.router.run(s.req('OPEN_WEB',{target:'네이버 메일',operationId:id2}))).code,
  'LEFT_BROWSER_RIGHT_GPT_NOT_CONFIRMED');
 assert.equal(s.io().length,0);
});
test('verified phone open uses only left_web_link and exact canonical URL',async()=>{
 const s=make();const r=await s.router.run(s.req('OPEN_WEB',{target:'네이버 메일',operationId:id2}));
 assert.equal(r.code,'LEFT_BROWSER_ADDRESS_CONFIRMED');
 assert.equal(r.ok,true);
 assert.equal(r.externalEffectVerified,false);
 assert.equal(r.pageContentVerified,false);
 assert.equal(s.io().length,1);
 assert.equal(s.io()[0][1].target,'left_web_link');
 assert.equal(s.io()[0][1].url,'https://mail.naver.com/');
 assert.equal(s.io()[0][1].expectedPaneDigest,'c'.repeat(64));
 assert.equal(s.log.some(x=>['playwright','browser','server-web'].includes(x[0])),false);
});
test('same OPEN operation repeated never opens second browser, even after success',async()=>{
 const s=make();
 await s.router.run(s.req('OPEN_WEB',{target:'네이버 메일',operationId:id2}));
 const again=await s.router.run(s.req('OPEN_WEB',{target:'네이버 메일',operationId:id2}));
 assert.equal(again.code,'OPEN_ALREADY_REQUESTED_NO_AUTO_REPLAY');
 assert.equal(s.io().length,1);
});
test('same id different web target is blocked, not silently redirected',async()=>{
 const s=make();
 await s.router.run(s.req('OPEN_WEB',{target:'네이버 메일',operationId:id2}));
 assert.equal((await s.router.run(s.req('OPEN_WEB',{target:'유튜브',operationId:id2}))).code,
  'OPEN_OPERATION_ID_CONFLICT');
 assert.equal(s.io().length,1);
});
test('phone queue response never claims URL opened or verified',async()=>{
 const s=make();s.setJob(signed('queued'));
 const r=await s.router.run(s.req('OPEN_WEB',{target:'네이버',operationId:id2}));
 assert.equal(r.code,'OPEN_QUEUED_READ_SAME_JOB');assert.equal(r.ok,false);
 assert.equal(r.status,'PENDING');
 s.setJob(signed('complete',true));
 const status=await s.router.run(s.req('STATUS_OPEN',{operationId:id2}));
 assert.equal(status.code,'LEFT_BROWSER_ADDRESS_CONFIRMED');
 assert.equal(s.io().length,1);
});
test('phone reported ok without independently signed address remains UNVERIFIED',async()=>{
 const s=make();s.setAddress(false);
 const r=await s.router.run(s.req('OPEN_WEB',{target:'네이버 메일',operationId:id2}));
 assert.equal(r.ok,false);
 assert.equal(r.code,'OPEN_PHONE_REPORTED_ADDRESS_UNVERIFIED');
 assert.equal(s.io().length,1);
});
test('phone action rejected is not called a successful browser open',async()=>{
 const s=make();s.setJob(signed('complete',false));
 const r=await s.router.run(s.req('OPEN_WEB',{target:'네이버 메일',operationId:id2}));
 assert.equal(r.code,'OPEN_DEVICE_REPORTED_FAILURE');
 assert.equal(r.ok,false);
});
test('browser transport exception is not auto-replayed',async()=>{
 const s=make({openThrows:true});
 const a=await s.router.run(s.req('OPEN_WEB',{target:'네이버 메일',operationId:id2}));
 assert.equal(a.code,'LEFT_WEB_OPEN_OUTCOME_UNKNOWN_NO_REPLAY');
 const b=await s.router.run(s.req('STATUS_OPEN',{operationId:id2}));
 assert.equal(b.code,'OPEN_DISPATCH_OUTCOME_UNKNOWN_NO_REPLAY');
 assert.equal(s.io().length,1);
});
test('unverified device receipt blocks success and further dispatch',async()=>{
 const s=make();s.setJob({...signed(),receiptAuthenticatedByJH:false});
 assert.equal((await s.router.run(s.req('OPEN_WEB',{target:'네이버 메일',operationId:id2}))).code,
  'LEFT_WEB_OPEN_RECEIPT_UNVERIFIED_NO_REPLAY');
 assert.equal(s.io().length,1);
});
test('user API has one route for screen observation, prepared action and status',async()=>{
 const s=make();
 const obs=await s.router.run(s.req('OBSERVE'));
 assert.equal(obs.code,'LEFT_BROWSER_RIGHT_GPT_OBSERVED');
 const p=await s.router.run(s.req('PREPARE_UI',{args:{action:'CLICK',x:150,y:200}}));
 assert.equal(p.preparationId,'prepared-1');
 const e=await s.router.run(s.req('EXECUTE_UI',{preparationId:'prepared-1',operationId:id2}));
 assert.equal(e.code,'PHONE_REPORTED_OK_UNVERIFIED');
 const r=await s.router.run(s.req('STATUS_UI',{operationId:id2}));
 assert.equal(r.code,'PENDING_SAME_PHONE_JOB');
 const c=await s.router.run(s.req('CANCEL_UI'));
 assert.equal(c.code,'PREPARATION_CANCELLED');
 assert.deepEqual(s.log.map(x=>x[0]),['capture','prepare','execute','status','cancel']);
});
test('OPEN_APP requests fail closed rather than choosing a different backend',async()=>{
 const s=make();
 assert.equal((await s.router.run(s.req('OPEN_APP',{target:'카카오톡'}))).code,
  'LEFT_NATIVE_APP_ADAPTER_NOT_VERIFIED');
 assert.equal(s.log.length,0);
});
test('unrecognized mode and bad owner fail without browser or phone mutations',async()=>{
 const s=make();
 assert.equal((await s.router.run(s.req('GO_TO_BROWSER'))).code,'UNIFIED_MODE_UNSUPPORTED');
 assert.equal((await s.router.run({mode:'OPEN_WEB',commandId:'wrong',target:'네이버'})).code,
  'CURRENT_SIGNED_OWNER_COMMAND_REQUIRED');
 assert.equal(s.io().length,0);
});
test('source of action readiness must be phone LEFT web not legacy RIGHT work',async()=>{
 const s=make({engine:{layoutMode:'LEGACY_LEFT_GPT_RIGHT_WORK',workPaneSide:'RIGHT'}});
 assert.equal((await s.router.run(s.req('OPEN_WEB',{target:'네이버',operationId:id2}))).code,
  'ANDROID_LEFT_WEB_ENGINE_NOT_READY');
 assert.equal(s.io().length,0);
});


test('two concurrent OPEN requests with same operationId cannot both create phone job',async()=>{
 const s=make({capDelay:true});
 const first=s.router.run(s.req('OPEN_WEB',{target:'네이버 메일',operationId:id2}));
 try{
  const duplicate=await s.router.run(s.req('OPEN_WEB',{target:'네이버 메일',operationId:id2}));
  assert.equal(duplicate.code,'OPEN_PREFLIGHT_IN_PROGRESS');
  assert.equal(duplicate.ok,false);
  const status=await s.router.run(s.req('STATUS_OPEN',{operationId:id2}));
  assert.equal(status.code,'OPEN_PREFLIGHT_IN_PROGRESS');
  assert.equal(s.io().length,0);
 }finally{s.unblockCapability()}
 assert.equal((await first).code,'LEFT_BROWSER_ADDRESS_CONFIRMED');
 assert.equal(s.io().length,1);
});
test('failed preflight without device capability does not reserve an irreversible dispatch',async()=>{
 const s=make();s.setCap({...cap(),features:{}});
 const first=await s.router.run(s.req('OPEN_WEB',{target:'네이버 메일',operationId:id2}));
 assert.equal(first.code,'SIGNED_PHONE_LEFT_WEB_CAPABILITY_REQUIRED');
 s.setCap(cap());
 const next=await s.router.run(s.req('OPEN_WEB',{target:'네이버 메일',operationId:id2}));
 assert.equal(next.code,'LEFT_BROWSER_ADDRESS_CONFIRMED');
 assert.equal(s.io().length,1);
});
test('owner changed while signed address readback pending cannot confirm open',async()=>{
 const s=make({addressDelay:true});
 const first=s.router.run(s.req('OPEN_WEB',{target:'네이버 메일',operationId:id2}));
 // Give the asynchronous device job/capture to enter address readback.
 for(let i=0;i<20&&!s.log.some(x=>x[0]==='address');i++)await Promise.resolve();
 assert.ok(s.log.some(x=>x[0]==='address'));
 s.setOwner({...owner(),sessionId:'secure-new-session'});
 s.unblockAddress();
 const r=await first;
 assert.equal(r.code,'OWNER_CHANGED_DURING_ADDRESS_READBACK');
 assert.equal(r.ok,false);
 assert.equal(s.io().length,1);
});
