import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {evaluateSignedMobile13Condition56 as decide,signedMobileWaitConditionSource56 as source} from './mobile13-wait-condition.mjs';

const now=1800000000000,started=now-2000,ctx='ssc_'+'a'.repeat(32);
const proof=()=>({kind:'split_screen_evidence',version:'1',verified:'true',layout:'LEFT_RIGHT',
 chatPackage:'com.openai.chatgpt',chatKind:'NATIVE',chatWindowId:'13',chatBounds:'0,0,500,1200',
 workPackage:'com.android.chrome',workWindowId:'19',workBounds:'500,0,1000,1200',
 chatDisplayId:'2',workDisplayId:'2',displayId:'2',displayVerified:'true',
 observedAtMs:String(now-500)});
// Actual STATUS shape after refreshStatus, plus the original BridgeService
// split proof. No imaginary resultScreen/scopeVerified fields are required.
const good=(label='READY')=>({ok:true,code:'ready',state:'ACTIVE',automaticReplay:false,
 manualStepPending:false,statusReadbackVersion:1,contextId:ctx,resultVerified:false,
 externalEffectVerified:false,packageName:'com.android.chrome',windowId:19,displayId:2,
 capturedAt:now-1000,layout:{arrangement:'LEFT_RIGHT',chatPackage:'com.openai.chatgpt',
  chatWindowId:13,chatDisplayId:2,workPackage:'com.android.chrome',workWindowId:19,workDisplayId:2},
 items:[{itemRef:'item_'+'b'.repeat(16),label}],splitScreenRequired:true,splitScreen:proof()});
const run=(observation=good(),expectedText='READY')=>
 decide({contextId:ctx,expectedText,observation,requestStartedAtMs:started,nowMs:now});

test('fresh original STATUS item confirms exact text only, without action success or replay',()=>{
 const observation=good(),before=structuredClone(observation),r=run(observation);
 assert.equal(r.conditionVerified,true);assert.equal(r.ok,true);
 assert.equal(r.code,'MOBILE_WAIT_CONDITION_CONFIRMED');assert.equal(r.automaticReplay,false);
 assert.equal(r.workWindowId,'19');assert.equal(r.displayId,'2');
 for(const field of ['items','resultScreen','expectedText','resultVerified','externalEffectVerified'])
  assert.equal(field in r,false,field+' must not be projected as action evidence or raw UI');
 assert.deepEqual(observation,before);
});

test('substring, unequal labels and supplied success flags cannot satisfy an exact condition',()=>{
 for(const label of ['NOT READY','READYING','READY: pending','ready','WAITING']){
  const observation={...good(label),resultVerified:true,scopeVerified:true,
   resultScreen:[{text:'READY'}],success_verified:true};
  assert.equal(run(observation).conditionVerified,false,label);
 }
});

test('old Stage27 cached items and the former synthetic resultScreen shape cannot pass',()=>{
 const cached=good();delete cached.statusReadbackVersion;
 assert.equal(run(cached).code,'MOBILE_WAIT_FRESH_STATUS_REQUIRED');
 const former={ok:true,contextId:ctx,scopeVerified:true,splitScreenRequired:true,
  splitScreen:proof(),resultScreen:[proof(),{package:'com.android.chrome',windowId:'19',text:'READY'}]};
 assert.equal(run(former).conditionVerified,false);
 assert.equal(run(Object.create(good())).conditionVerified,false,'only original own JSON result fields');
});

test('wrong context, inactive/manual state, missing receipt shape and replay fail closed',()=>{
 for(const value of [null,{}, {ok:true}, {...good(),contextId:'ssc_'+'b'.repeat(32)},
  {...good(),state:'COMPLETED'}, {...good(),code:'captured'},
  {...good(),manualStepPending:true}, {...good(),automaticReplay:true},
  {...good(),automaticReplay:undefined}, {...good(),statusReadbackVersion:'1'}])
  assert.equal(run(value).conditionVerified,false);
});

test('item capture and split proof must follow this STATUS request and be mutually fresh',()=>{
 for(const change of [
  o=>{o.capturedAt=started-1},
  o=>{o.capturedAt=Number(o.splitScreen.observedAtMs)+1},
  o=>{o.capturedAt=now-6001},
  o=>{o.capturedAt=String(now-1000)},
  o=>{o.splitScreen.observedAtMs=String(started-1)},
  o=>{o.splitScreen.observedAtMs=String(now+5001)},
  o=>{o.splitScreen.observedAtMs=String(now-45001)}
 ]){
  const observation=good();change(observation);
  assert.equal(run(observation).conditionVerified,false);
 }
});

test('context, LEFT/RIGHT geometry, measured display and package identities must agree',()=>{
 for(const change of [
  o=>{o.windowId=20},o=>{o.packageName='com.other.app'},
  o=>{o.layout.workWindowId=20},o=>{o.layout.chatWindowId=14},
  o=>{o.layout.arrangement='TOP_BOTTOM'},o=>{o.layout.chatPackage='com.other.app'},
  o=>{o.splitScreen.chatKind='UNVERIFIED'},o=>{o.splitScreen.verified='false'},
  o=>{o.splitScreen.workPackage='com.other.app'},
  o=>{o.splitScreen.workBounds='250,0,750,1200'},
  o=>{o.splitScreen.workBounds='500,1500,1000,2700'},
  o=>{o.splitScreen.chatWindowId=o.splitScreen.workWindowId},
  o=>{o.displayId=null},o=>{delete o.displayId},o=>{o.displayId=0},
  o=>{o.layout.workDisplayId=0},o=>{o.layout.chatDisplayId=0},
  o=>{o.splitScreen.workDisplayId='0'},o=>{o.splitScreen.chatDisplayId='unknown'},
  o=>{o.splitScreen.displayId='unknown'},o=>{o.splitScreen.displayVerified='false'}
 ]){
  const observation=good();change(observation);
  assert.equal(run(observation).conditionVerified,false);
 }
 const browserChat=good();browserChat.layout.chatPackage='com.android.chrome';
 browserChat.splitScreen.chatPackage='com.android.chrome';browserChat.splitScreen.chatKind='BROWSER_VERIFIED';
 assert.equal(run(browserChat).conditionVerified,true,'original verified browser ChatGPT pane remains supported');
});

test('missing, malformed and duplicate item references cannot provide text evidence',()=>{
 for(const items of [undefined,null,[],{},[{}],
  [{itemRef:'item_'+'b'.repeat(16),label:'READY'}, {itemRef:'item_'+'b'.repeat(16),label:'READY'}],
  [{itemRef:'old-css-target',label:'READY'}],
  [{itemRef:'item_'+'b'.repeat(16),label:'x'.repeat(261)}],
  Array.from({length:141},(_,i)=>({itemRef:'item_'+i.toString(16).padStart(16,'0'),label:'READY'}))
 ])assert.equal(run({...good(),items}).conditionVerified,false);
});

test('invalid context, expected text and request clock never report true',()=>{
 for(const label of ['', ' '.repeat(8),'x'.repeat(161),'READY\nOK'])
  assert.equal(run(good(),label).conditionVerified,false);
 assert.equal(decide({contextId:'bad',expectedText:'READY',observation:good(),
  requestStartedAtMs:started,nowMs:now}).conditionVerified,false);
 for(const at of [undefined,NaN,0,now+1,now-45001])
  assert.equal(decide({contextId:ctx,expectedText:'READY',observation:good(),
   requestStartedAtMs:at,nowMs:now}).conditionVerified,false);
 assert.equal(decide({contextId:ctx,expectedText:'READY',observation:good(),
  requestStartedAtMs:started,nowMs:NaN}).conditionVerified,false);
});

test('same self-contained predicate serializes into the generated owner scope',()=>{
 const scope={};
 vm.runInNewContext(source()+'\nthis.exposed=jhMobile13EvaluateCondition56;',scope);
 assert.equal(typeof scope.exposed,'function');
 assert.equal(scope.exposed({contextId:ctx,expectedText:'READY',observation:good(),
  requestStartedAtMs:started,nowMs:now}).code,'MOBILE_WAIT_CONDITION_CONFIRMED');
});
