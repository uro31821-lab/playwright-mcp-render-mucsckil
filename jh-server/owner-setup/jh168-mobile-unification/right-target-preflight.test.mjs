import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRightNativeFirstPlanner56,verifyRightInputFocusCompletion56} from './right-target-preflight.mjs';

const commandId='a'.repeat(32);
const owner={deviceId:'phone-one',sessionId:'original-secure56-session',commandId,
 workSide:'RIGHT',chatSide:'LEFT',workPackage:'com.android.chrome',
 chatPackage:'com.openai.chatgpt',workWindowId:1559,chatWindowId:1554,
 workBounds:'1233,0,2448,1713',chatBounds:'0,0,1216,1713'};
const fRef='item_'+'f'.repeat(16),sRef='item_'+'e'.repeat(16),deepRef='item_'+'c'.repeat(16);
const focus={number:15,itemRef:fRef,label:'Google 검색 또는 URL 입력',
 editable:true,clickable:true,
 facts:{viewId:'com.android.chrome:id/url_bar',focused:false,
  boundsInScreen:'1300,100,2050,240',windowId:1559,packageName:'com.android.chrome'}};
const scroller={number:25,itemRef:sRef,label:'Article scroll region',
 editable:false,clickable:false,facts:{scrollable:true,visible:true,
 boundsInScreen:'1235,240,2445,1680',nodePath:[1,2],
 actions:['SCROLL_FORWARD'],windowId:1559,packageName:'com.android.chrome'}};
const nested={number:26,itemRef:deepRef,label:'Inner scroll region',
 editable:false,clickable:false,facts:{scrollable:true,visible:true,
 boundsInScreen:'1270,280,2400,1550',nodePath:[1,2,5],
 actions:['SCROLL_DOWN'],windowId:1559,packageName:'com.android.chrome'}};
const scene={ok:true,packageName:'com.android.chrome',windowId:1559,
 screenDigest:'d'.repeat(64),contextId:'ssc_'+'0'.repeat(32),
 capturedAt:95000,expiresAt:150000,
 layout:{arrangement:'LEFT_RIGHT',workWindowId:1559,
  workPackage:'com.android.chrome',chatPackage:'com.openai.chatgpt'},
 items:[focus,scroller,nested]};
const nativeMap={FOCUS:'ACTION_FOCUS',TYPE:'set_text',SCROLL:'form_scroll'};
const risks={FOCUS:'SAFE_NAVIGATION',TYPE:'SAFE_INPUT',SCROLL:'SAFE_SCROLL'};
function fixture(options={}){
 let ownerReads=0,scenes=0,capabilities=0,riskReads=0,verifications=0;
 const cb={
  readOriginalOwner:async()=>++ownerReads===1?(options.owner1||owner):(options.owner2||owner),
  readOriginalScene:async()=>++scenes===1?(options.scene1||scene):(options.scene2||scene),
  verifyOriginalOwner:async()=>{verifications++;return options.verified!==false},
  verifyOriginalScene:async()=>{verifications++;return options.verified!==false},
  readOriginalNativeCapability:async({owner:o,scene:s,kind,candidate})=>{
   capabilities++;
   return options.capability||{source:'ORIGINAL_SIGNED_ANDROID_ACCESSIBILITY',
    deviceId:o.deviceId,sessionId:o.sessionId,commandId:o.commandId,
    workWindowId:o.workWindowId,workPackage:o.workPackage,screenDigest:s.screenDigest,
    action:nativeMap[kind],exactItemRefSupported:true,
    nativeAccessibility:true,computerUseRequired:false,
    ...(kind==='FOCUS'?{androidActionId:1,actionId:1,
      focusType:'FOCUS_INPUT',isEditable:true,isFocusable:true,
      targetItemRef:candidate.itemRef,targetNodeDigest:'9'.repeat(64),
      advertisedActionIds:[1]}:{})};
  },
  verifyOriginalNativeCapability:async()=>options.capValid!==false,
  readOriginalRisk:async({kind})=>{riskReads++;return options.risk||{
   safe:true,riskClass:risks[kind],ownerAdmissionBlocked:false,
   phoneLocalApprovalRequired:false}},
  verifyOriginalRisk:async()=>options.riskValid!==false,
  readOriginalInputFocus:async({owner:o,scene:s,candidate})=>{
    if(options.focusReport)return options.focusReport;
    const focused=options.inputFocusFocused??(candidate.facts?.focused===true);
    return {source:'ORIGINAL_SIGNED_ANDROID_FIND_FOCUS_INPUT',
      focusType:'FOCUS_INPUT',windowId:o.workWindowId,
      packageName:o.workPackage,deviceId:o.deviceId,sessionId:o.sessionId,
      commandId:o.commandId,screenDigest:s.screenDigest,
      targetItemRef:candidate.itemRef,isEditable:true,
      targetFocused:focused,nodeIsFocused:focused,
      focusedItemRef:focused?candidate.itemRef:null,
      isAccessibilityFocused:options.accessibilityFocused??false,
      checkedAt:98000};
  },
  verifyOriginalInputFocus:async()=>options.focusValid!==false,
  clock:()=>100000
 };
 return {cb,get hits(){return {ownerReads,scenes,capabilities,riskReads,verifications}}};
}
async function plan(options={},kind='FOCUS',more={}){
 const f=fixture(options),r=await createRightNativeFirstPlanner56(f.cb);
 return {res:await r.plan({kind,commandId,...more}),hits:f.hits};
}
test('normal safe FOCUS uses ORIGINAL accessibility, NEVER default Computer Use',async()=>{
 const {res,hits}=await plan();
 assert.equal(res.ok,true);assert.equal(res.code,'NATIVE_SAFE_ACTION_PLAN_READY');
 assert.equal(res.plan.route,'SIGNED_ANDROID_ACCESSIBILITY');
 assert.equal(res.plan.nativeAction,'ACTION_FOCUS');
 assert.equal(res.plan.androidActionId,1);
 assert.equal(res.plan.focusType,'FOCUS_INPUT');
 assert.equal(res.plan.requiresInputFocusReadback,true);
 assert.equal(res.plan.targetIndex,15);
 assert.equal(res.plan.computerUseInvoked,false);
 assert.equal(res.plan.computerUseApprovalRequested,false);
 assert.equal(res.plan.dispatched,false);
 assert.equal(res.plan.executionAuthorizationNotGranted,true);
 assert.equal(hits.capabilities,1);
});
test('normal safe SCROLL selects one provably deepest native accessibility node',async()=>{
 const {res}=await plan({},'SCROLL');
 assert.equal(res.ok,true);assert.equal(res.plan.nativeAction,'form_scroll');
 assert.equal(res.plan.targetIndex,26);assert.equal(res.plan.direction,'DOWN');
 assert.equal(res.plan.computerUseInvoked,false);
});
test('existing focused input requires no additional CLICK or Computer Use',async()=>{
 const curr={...scene,items:[{...focus,facts:{...focus.facts,focused:true}},scroller,nested]};
 const {res,hits}=await plan({scene1:curr});
 assert.equal(res.code,'NATIVE_FOCUS_ALREADY_PRESENT');
 assert.equal(hits.capabilities,0);assert.equal(hits.riskReads,0);
});
test('TYPE requires confirmed focused node and only passes value digest in plan',async()=>{
 const unfocused=await plan({},'TYPE',{value:'JH TEST'});
 assert.equal(unfocused.res.code,'NATIVE_INPUT_NOT_FOCUSED');
 const edited={...scene,items:[{...focus,facts:{...focus.facts,focused:true}},scroller,nested]};
 const {res}=await plan({scene1:edited,scene2:edited},'TYPE',{value:'JH TEST'});
 assert.equal(res.ok,true);
 assert.equal(res.plan.nativeAction,'set_text');
 assert.equal(res.plan.valueDigest,createHash('sha256').update('JH TEST').digest('hex'));
 assert.equal(JSON.stringify(res).includes('JH TEST'),false);
 assert.equal(res.plan.computerUseInvoked,false);
});
test('secret, OTP, card, empty or unexpected text never reaches a native action',async()=>{
 for(const txt of ['', 'OTP 123456', 'sk-proj-123456789abcde', '4111 1111 1111 1111']){
  const {res,hits}=await plan({},'TYPE',{value:txt});
  assert.equal(res.code,'RIGHT_NATIVE_ACTION_SCOPE_INVALID');
  assert.equal(hits.capabilities,0);
 }
});
test('native step missing/old targetRef protocol means stop, NOT Computer Use fallback',async()=>{
 const bad={source:'ORIGINAL_SIGNED_ANDROID_ACCESSIBILITY',deviceId:owner.deviceId,
  sessionId:owner.sessionId,commandId,workWindowId:1559,workPackage:'com.android.chrome',
  screenDigest:scene.screenDigest,action:'form_activate',
  nativeAccessibility:true,exactItemRefSupported:false,computerUseRequired:true};
 const {res}=await plan({capability:bad});
 assert.equal(res.code,'NATIVE_EXACT_TARGET_CAPABILITY_MISSING_NO_COMPUTER_USE_FALLBACK');
 assert.equal(res.dispatched,false);
});
test('protected or approval-required target stays behind ORIGINAL local phone boundary',async()=>{
 for(const risk of [{safe:false,riskClass:'PROTECTED',phoneLocalApprovalRequired:true},
  {safe:false,riskClass:'SAFE_NAVIGATION',phoneLocalApprovalRequired:true}]){
  const {res}=await plan({risk});
  assert.equal(res.code,'PROTECTED_ACTION_REQUIRES_ORIGINAL_PHONE_APPROVAL');
  assert.equal(res.originalApprovalBoundary,true);
  assert.equal(res.computerUseInvoked,false);
 }
});
test('OWNER_ADMISSION_BLOCKED cannot silently fall through to alternate executor',async()=>{
 const {res}=await plan({risk:{ownerAdmissionBlocked:true,safe:false}});
 assert.equal(res.code,'OWNER_ADMISSION_BLOCKED_NO_ALTERNATE_ROUTE');
 assert.equal(res.dispatched,false);assert.equal(res.automaticReplay,false);
});
test('untrusted signed native ability or risk report rejects before execution',async()=>{
 for(const opts of [{verified:false},{capValid:false},{riskValid:false},
  {risk:{safe:false,riskClass:'SAFE_NAVIGATION'}}]){
  const {res}=await plan(opts);
  assert.equal(res.ok,false);
  assert.equal(res.dispatched,false);
 }
});
test('foreign app, left pane, stale scene or wrong command never selects target',async()=>{
 for(const opts of [
  {owner1:{...owner,workPackage:'com.google.android.youtube'}},
  {owner1:{...owner,workSide:'LEFT'}},
  {owner1:{...owner,commandId:'e'.repeat(32)}},
  {scene1:{...scene,packageName:'com.android.settings'}},
  {scene1:{...scene,capturedAt:1}},
  {scene1:{...scene,expiresAt:99000}},
  {owner1:{...owner,workBounds:'0,0,1200,1700'}}
 ]){
  const {res,hits}=await plan(opts);
  assert.equal(res.ok,false);assert.equal(hits.capabilities,0);
 }
});
test('scene or work window changes before access return a STOP plan',async()=>{
 for(const opts of [
  {owner2:{...owner,sessionId:'changed'}},
  {scene2:{...scene,screenDigest:'9'.repeat(64)}},
  {scene2:{...scene,windowId:2000}},
  {scene2:{...scene,contextId:'ssc_'+'c'.repeat(32)}}
 ]){
  const {res}=await plan(opts);
  assert.equal(res.code,'NATIVE_SCENE_CHANGED_BEFORE_ACTION');
  assert.equal(res.dispatched,false);
 }
});
test('missing, ambiguous, off-screen or unadvertised scroll nodes have no fallback',async()=>{
 for(const items of [
  [focus], [focus,{...scroller,facts:{...scroller.facts,actions:[]}}],
  [focus,{...nested,facts:{...nested.facts,boundsInScreen:'0,0,500,600'}}],
  [focus,{...scroller,facts:{...scroller.facts,nodePath:[1,2]}},
    {...nested,facts:{...nested.facts,nodePath:[7,3]}}],
 ]){
  const {res,hits}=await plan({scene1:{...scene,items}},'SCROLL');
  assert.equal(res.code,'NATIVE_SCROLL_NODE_NOT_PROVEN');
  assert.equal(hits.capabilities,0);
 }
});
test('only declared normal actions allowed; no click-to-delete or payment shortcut',async()=>{
 for(const kind of ['PAY','DELETE','SEND','CLICK','AUTO','BACK']){
  const {res,hits}=await plan({},kind);
  assert.equal(res.code,'RIGHT_NATIVE_ACTION_SCOPE_INVALID');
  assert.equal(hits.capabilities,0);
 }
});
test('missing original signed phone capability callbacks reject at construction',()=>{
 assert.throws(()=>createRightNativeFirstPlanner56({readOriginalOwner:()=>{}}),
 /JH168_ORIGINAL_NATIVE_ACCESSIBILITY_PORTS_REQUIRED/);
});

test('editability plus original ACTION_FOCUS supports nonclickable input fields',async()=>{
 const s={...scene,items:[{...focus,clickable:false,facts:{...focus.facts,focusable:true}},scroller,nested]};
 const {res}=await plan({scene1:s,scene2:s});
 assert.equal(res.ok,true);
 assert.equal(res.plan.nativeAction,'ACTION_FOCUS');
 assert.equal(res.plan.computerUseApprovalRequested,false);
});
test('ACTION_ACCESSIBILITY_FOCUS (64) cannot substitute for ACTION_FOCUS (1)',async()=>{
 for(const changed of [
  {action:'ACTION_ACCESSIBILITY_FOCUS',actionId:64,advertisedActionIds:[64]},
  {actionId:64,advertisedActionIds:[64]},
  {actionId:1,advertisedActionIds:[64]},
  {actionId:1,focusType:'FOCUS_ACCESSIBILITY'},
  {isFocusable:false},{isEditable:false},{targetItemRef:'item_'+'0'.repeat(16)}
 ]){
  const f=fixture();
  const cap=await f.cb.readOriginalNativeCapability({
   owner,scene,kind:'FOCUS',candidate:focus
  });
  const {res}=await plan({capability:{...cap,...changed}});
  assert.equal(res.code,'NATIVE_EXACT_TARGET_CAPABILITY_MISSING_NO_COMPUTER_USE_FALLBACK');
  assert.equal(res.dispatched,false);
 }
});
test('isAccessibilityFocused alone is NOT keyboard input focus',async()=>{
 const f=fixture();
 const negative=await f.cb.readOriginalInputFocus({owner,scene,candidate:focus});
 const {res}=await plan({focusReport:{
  ...negative,targetFocused:false,nodeIsFocused:false,
  focusedItemRef:null,isAccessibilityFocused:true
 }});
 assert.equal(res.ok,true);
 assert.equal(res.plan.nativeAction,'ACTION_FOCUS');
 assert.equal(res.plan.focusType,'FOCUS_INPUT');
});
test('existing focus requires signed RIGHT root findFocus(FOCUS_INPUT) even if scene says focused',async()=>{
 const s={...scene,items:[{...focus,facts:{...focus.facts,focused:true}},scroller,nested]};
 const {res}=await plan({scene1:s,focusValid:false});
 assert.equal(res.code,'ORIGINAL_INPUT_FOCUS_READBACK_UNVERIFIED');
 assert.equal(res.dispatched,false);
});
test('TYPE cannot rely on accessibility focus instead of input focus',async()=>{
 const focusedScene={...scene,items:[{...focus,facts:{...focus.facts,focused:true}},scroller,nested]};
 const f=fixture(),report=await f.cb.readOriginalInputFocus({owner,scene,candidate:focus});
 const {res}=await plan({scene1:focusedScene,
   focusReport:{...report,targetFocused:false,nodeIsFocused:false,
    isAccessibilityFocused:true,focusedItemRef:null}
 },'TYPE',{value:'test'});
 assert.equal(res.code,'NATIVE_INPUT_NOT_FOCUSED');
});
async function afterAction(plan,changes={}){
 const defaultAction={
   type:'agent_step',status:'complete',result:{ok:true},
   action:'ACTION_FOCUS',commandId:plan.commandId,
   deviceId:owner.deviceId,secureSessionId:owner.sessionId,
   screenDigest:plan.screenDigest,targetNodeDigest:plan.focusTargetDigest,
   targetItemRef:plan.targetItemRef,windowId:plan.workWindowId
 };
 const defaultFocus={
   source:'ORIGINAL_SIGNED_ANDROID_FIND_FOCUS_INPUT',
   focusType:'FOCUS_INPUT',deviceId:owner.deviceId,
   sessionId:owner.sessionId,commandId:plan.commandId,
   windowId:plan.workWindowId,packageName:'com.android.chrome',
   screenDigest:scene.screenDigest,isEditable:true,
   targetFocused:true,nodeIsFocused:true,
   focusedTargetDigest:plan.focusTargetDigest,
   checkedAt:99000,isAccessibilityFocused:false
 };
 return verifyRightInputFocusCompletion56({
  plan,actionReceipt:{...defaultAction,...changes.actionReceipt},
  freshOwner:changes.owner||owner,freshScene:changes.scene||scene,
  focusReport:{...defaultFocus,...changes.focusReport},
  verifyOriginalActionReceipt:async()=>changes.actionProof!==false,
  verifyOriginalOwner:async()=>true,
  verifyOriginalScene:async()=>true,
  verifyOriginalInputFocus:async()=>changes.focusProof!==false,
  clock:()=>100000
 });
}
test('only exact original ACTION_FOCUS plus fresh FOCUS_INPUT + isFocused proves success',async()=>{
 const {res}=await plan();
 const checked=await afterAction(res.plan);
 assert.equal(checked.ok,true);
 assert.equal(checked.focusVerified,true);
 assert.equal(checked.focusType,'FOCUS_INPUT');
 assert.equal(checked.computerUseInvoked,false);
});
test('performAction returned true alone never proves focus',async()=>{
 const {res}=await plan();
 for(const changed of [
  {focusReport:{targetFocused:false,nodeIsFocused:false}},
  {focusReport:{nodeIsFocused:false}},
  {focusReport:{focusedTargetDigest:'f'.repeat(64)}},
  {focusReport:{focusType:'FOCUS_ACCESSIBILITY',isAccessibilityFocused:true}},
  {focusReport:{windowId:9999}},
  {focusReport:{packageName:'com.openai.chatgpt'}},
  {focusReport:{checkedAt:75000}},
  {actionReceipt:{status:'queued'}},
  {actionReceipt:{action:'ACTION_ACCESSIBILITY_FOCUS'}},
  {actionReceipt:{commandId:'a'.repeat(31)+'b'}},
  {actionReceipt:{deviceId:'other-phone'}},
  {actionReceipt:{secureSessionId:'other-session'}},
  {actionReceipt:{screenDigest:'7'.repeat(64)}},
  {actionReceipt:{targetNodeDigest:'8'.repeat(64)}},
  {focusProof:false},{actionProof:false}
 ]){
   const checked=await afterAction(res.plan,changed);
   assert.equal(checked.ok,false,JSON.stringify(changed));
   assert.equal(checked.focusVerified,false);
 }
});
test('changing RIGHT Chrome window before post-action input-focus check fails',async()=>{
 const {res}=await plan();
 const checked=await afterAction(res.plan,{owner:{...owner,workWindowId:2000}});
 assert.equal(checked.code,'FOCUS_RIGHT_WORK_WINDOW_CHANGED');
});
