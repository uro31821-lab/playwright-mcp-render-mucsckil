import test from 'node:test';
import assert from 'node:assert/strict';
import {createRightTargetPreflight56} from './right-target-preflight.mjs';

const commandId='a'.repeat(32),taskDigest='b'.repeat(64);
const owner=Object.freeze({
 deviceId:'phone-one',sessionId:'original-Secure56-session',commandId,
 workSide:'RIGHT',chatSide:'LEFT',workPackage:'com.android.chrome',
 chatPackage:'com.openai.chatgpt',workWindowId:1559,chatWindowId:1554,
 workBounds:'1233,0,2448,1713',chatBounds:'0,0,1216,1713'
});
const fref='item_'+'f'.repeat(16),sref='item_'+'e'.repeat(16),deep='item_'+'c'.repeat(16);
const bounds='1300,100,2050,240';
const focus={number:15,itemRef:fref,label:'Google 검색 또는 URL 입력',
 editable:true,clickable:true,
 facts:{viewId:'com.android.chrome:id/url_bar',focused:false,
   boundsInScreen:bounds,windowId:1559,packageName:'com.android.chrome'}};
const scroller={number:25,itemRef:sref,label:'Article scroll region',
 editable:false,clickable:false,facts:{scrollable:true,visible:true,
 boundsInScreen:'1235,240,2445,1680',nodePath:[1,2],
 actions:['SCROLL_FORWARD'],windowId:1559,packageName:'com.android.chrome'}};
const nested={number:26,itemRef:deep,label:'Inner scroll region',
 editable:false,clickable:false,facts:{scrollable:true,visible:true,
 boundsInScreen:'1270,280,2400,1550',nodePath:[1,2,5],
 actions:['SCROLL_DOWN'],windowId:1559,packageName:'com.android.chrome'}};
const scene=Object.freeze({
 ok:true,packageName:'com.android.chrome',windowId:1559,
 screenDigest:'d'.repeat(64),contextId:'ssc_'+'0'.repeat(32),
 capturedAt:95000,expiresAt:150000,
 layout:{arrangement:'LEFT_RIGHT',workWindowId:1559,
   workPackage:'com.android.chrome',chatPackage:'com.openai.chatgpt'},
 items:[focus,scroller,nested]
});
function withPorts({scene1=scene,scene2=scene,owner1=owner,owner2=owner,
 inspectCode,inspectExtra={},inspectStatus='complete',
 prepareCode='READY',throwPrepare=false}={}){
 let reads=0,inspects=0,prepares=0,verifiedOwner=0,verifiedScene=0,lastPlan;
 const cb={
  readOriginalOwner:async()=>++reads===1?owner1:owner2,
  readOriginalScene:async()=>reads===1?scene1:scene2,
  verifyOriginalOwner:async()=>{verifiedOwner++;return true},
  verifyOriginalScene:async()=>{verifiedScene++;return true},
  readOriginalInspect:async plan=>{
    inspects++;lastPlan=plan;
    return {status:inspectStatus,originalSecure56Verified:true,
      commandId:plan.commandId,deviceId:plan.deviceId,sessionId:plan.sessionId,
      result:{ok:true,
        code:inspectCode||(plan.action==='CLICK'?'click_target_ready':'nested_scroll_target_ready'),
        packageName:'com.android.chrome',windowId:1559,screenDigest:scene.screenDigest,
        targetDigest:'9'.repeat(64),index:plan.index,
        selectedAction:plan.direction,candidateCount:1,treeComplete:true,...inspectExtra}
    };
  },
  verifyOriginalInspect:async()=>true,
  verifyOriginalPreparedJob:async()=>true,
  prepareOriginal:async()=>{
    prepares++;
    if(throwPrepare)throw Error('transport lost');
    return {status:'complete',result:{ok:true,code:prepareCode}};
  },
  clock:()=>100000
 };
 return {cb,get calls(){return {reads,inspects,prepares,verifiedOwner,verifiedScene,lastPlan}}};
}
async function run(options={},action='CLICK',direction='DOWN'){
 const p=withPorts(options),controller=await createRightTargetPreflight56(p.cb);
 const result=await controller.prepare({commandId,taskDigest,action,direction});
 return {result,calls:p.calls};
}
test('exact current Chrome URL field: original inspect -> original prepare only',async()=>{
 const {result,calls}=await run();
 assert.equal(result.ok,true);assert.equal(result.code,'READY');
 assert.equal(result.targetIndex,15);assert.equal(result.dispatched,false);
 assert.equal(result.approvalGranted,false);assert.equal(result.actionPrepared,true);
 assert.equal(calls.inspects,1);assert.equal(calls.prepares,1);
 assert.equal(calls.verifiedOwner,2);assert.equal(calls.verifiedScene,2);
 assert.equal(calls.lastPlan.screenDigest,scene.screenDigest);
});
test('already focused URL input is read-only success without job dispatch',async()=>{
 const s={...scene,items:[{...focus,facts:{...focus.facts,focused:true}},scroller,nested]};
 const {result,calls}=await run({scene1:s});
 assert.equal(result.code,'FOCUS_ALREADY_PRESENT');assert.equal(result.dispatched,false);
 assert.equal(calls.inspects,0);assert.equal(calls.prepares,0);
});
test('visual-click target requires original signed screenshot consent; no coordinate fallback',async()=>{
 const {result,calls}=await run({inspectCode:'visual_click_target'});
 assert.equal(result.code,'FOCUS_REQUIRES_ORIGINAL_SCREENSHOT_CONSENT');
 assert.equal(calls.prepares,0);assert.equal(result.automaticReplay,false);
});
test('old signed owner and changed work window refuse any inspect',async()=>{
 const p=withPorts({owner1:{...owner,workWindowId:42}});
 const x=await(await createRightTargetPreflight56(p.cb)).prepare({action:'CLICK',commandId,taskDigest});
 assert.equal(x.code,'RIGHT_CHROME_SCENE_SCOPE_INVALID');
 assert.equal(p.calls.inspects,0);
});
test('foreign left-app, expired scene, wrong command and incorrect bounds fail closed',async()=>{
 const bad=[
  {owner1:{...owner,workPackage:'com.google.android.youtube'}},
  {scene1:{...scene,capturedAt:1000}},
  {scene1:{...scene,expiresAt:90000}},
  {owner1:{...owner,commandId:'e'.repeat(32)}},
  {owner1:{...owner,workBounds:'0,0,1100,1713'}}
 ];
 for(const opts of bad){
  const {result,calls}=await run(opts);
  assert.equal(result.ok,false,JSON.stringify(opts).slice(0,160));
  assert.equal(calls.inspects,0);assert.equal(calls.prepares,0);
 }
});
test('nested scroll target chooses deepest proven candidate and advertised DOWN',async()=>{
 const {result,calls}=await run({},'SCROLL','DOWN');
 assert.equal(result.ok,true);assert.equal(result.code,'READY');
 assert.equal(result.targetIndex,26);assert.equal(result.dispatched,false);
 assert.equal(calls.lastPlan.direction,'DOWN');assert.equal(calls.prepares,1);
});
test('unproven or ambiguous scroll tree stops before any phone inspect',async()=>{
 for(const items of [
 [focus],
 [focus,{...scroller,facts:{...scroller.facts,actions:[]}}],
 [focus,{...scroller,facts:{...scroller.facts,nodePath:[1,2]}},
    {...nested,facts:{...nested.facts,nodePath:[9,3]}}],
 [focus,{...scroller,facts:{...scroller.facts,boundsInScreen:'10,10,900,700'}}]
 ]){
  const {result,calls}=await run({scene1:{...scene,items}},'SCROLL');
  assert.equal(result.code,'SCROLL_UNIQUE_ADVERTISED_NODE_REQUIRED');
  assert.equal(calls.inspects,0);
 }
});
test('phone inspector must attest exact nested scroll action and target identity',async()=>{
 for(const changed of [
  {selectedAction:'UP'},{candidateCount:2},{treeComplete:false},
  {targetDigest:'invalid'},{screenDigest:'f'.repeat(64)},
  {packageName:'com.google.android.youtube'},{index:25}
 ]){
  const {result,calls}=await run({inspectExtra:changed},'SCROLL');
  assert.equal(result.ok,false,JSON.stringify(changed));
  assert.equal(calls.prepares,0);
 }
});
test('input focus inspect must not accept arbitrary click target or unsigned origin',async()=>{
 for(const code of ['click_not_found','target_ambiguous','scroll_target_ready']){
  const {result,calls}=await run({inspectCode:code});
  assert.equal(result.code,'FOCUS_ACCESSIBILITY_CLICK_NOT_VERIFIED');
  assert.equal(calls.prepares,0);
 }
});
test('device or UI change after inspection refuses PREPARE',async()=>{
 for(const changed of [
  {owner2:{...owner,sessionId:'different-secure-session'}},
  {scene2:{...scene,screenDigest:'7'.repeat(64)}},
  {scene2:{...scene,windowId:1999}},
 ]){
  const {result,calls}=await run(changed);
  assert.equal(result.ok,false);assert.equal(calls.prepares,0);
 }
});
test('pending original INSPECT returns same-job status, never a fresh or fallback inspect',async()=>{
 const {result,calls}=await run({inspectStatus:'in_progress'});
 assert.equal(result.code,'ORIGINAL_INSPECT_PENDING_USE_RECEIPT');
 assert.equal(result.noNewInspect,true);assert.equal(calls.inspects,1);
 assert.equal(calls.prepares,0);
});
test('phone-local approval requirement is preserved; no grant created',async()=>{
 const {result,calls}=await run({prepareCode:'APPROVAL_REQUIRED'});
 assert.equal(result.ok,true);assert.equal(result.requiresOriginalPhoneLocalApproval,true);
 assert.equal(result.actionPrepared,false);assert.equal(result.approvalGranted,false);
 assert.equal(calls.prepares,1);
});
test('owner admission error returns terminal no-bypass result',async()=>{
 const {result,calls}=await run({prepareCode:'OWNER_ADMISSION_BLOCKED'});
 assert.equal(result.ok,false);assert.equal(result.code,'OWNER_ADMISSION_BLOCKED_NO_BYPASS');
 assert.equal(result.automaticReplay,false);assert.equal(calls.prepares,1);
});
test('unknown original prepare result is not re-issued automatically',async()=>{
 const {result,calls}=await run({throwPrepare:true});
 assert.equal(result.code,'PREPARE_OUTCOME_UNKNOWN_NO_REPLAY');
 assert.equal(calls.prepares,1);
});
test('any malformed source ports reject upfront without creating authority',async()=>{
 await assert.rejects(createRightTargetPreflight56({readOriginalOwner:()=>{}}),
   /ORIGINAL_SECURE56_PREFLIGHT_PORTS_REQUIRED/);
});
