/** JH168 native ACCESSIBILITY FIRST right Chrome target planner.
 * Uses signed Android scene + exact node: focus, text, scroll. It does NOT
 * invoke Computer Use inspect/prepare or request extra Computer Use approval.
 * No action dispatch, permission grant, Playwright, fallback or retry.
 * Protected UI work stays under the ORIGINAL Secure56 phone-local approval.
 */
import {createHash} from 'node:crypto';
const H32=/^[a-f0-9]{32}$/;
const H64=/^[a-f0-9]{64}$/;
const ITEM=/^item_[a-f0-9]{16}$/;
const CONTEXT=/^ssc_[a-f0-9]{32}$/;
const CHROME='com.android.chrome';
const GPT='com.openai.chatgpt';
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const deny=(code,info={})=>Object.freeze({ok:false,code,dispatched:false,
  approvalGranted:false,automaticReplay:false,...info});
const goodRect=x=>{
  let a;
  if(typeof x==='string'&&/^\d{1,7},\d{1,7},\d{1,7},\d{1,7}$/.test(x))a=x.split(',').map(Number);
  else if(object(x))a=[x.left,x.top,x.right,x.bottom];
  else return null;
  if(!a.every(n=>Number.isSafeInteger(n)&&n>=0)||a[2]-a[0]<100||a[3]-a[1]<100)return null;
  return Object.freeze({left:a[0],top:a[1],right:a[2],bottom:a[3],
    width:a[2]-a[0],height:a[3]-a[1]});
};
const inside=(child,parent)=>!!child&&!!parent&&
 child.left>=parent.left&&child.top>=parent.top&&
 child.right<=parent.right&&child.bottom<=parent.bottom;
const sameOwner=(a,b)=>!!a&&!!b&&
 ['deviceId','sessionId','commandId','workWindowId','chatWindowId',
 'workPackage','chatPackage','workBounds','chatBounds'].every(k=>a[k]===b[k]);

function sceneScope(owner,scene,commandId,now){
  if(!object(owner)||!object(scene)||!H32.test(commandId||'')||
    owner.commandId!==commandId||!owner.deviceId||!owner.sessionId||
    owner.workSide!=='RIGHT'||owner.chatSide!=='LEFT'||
    owner.workPackage!==CHROME||owner.chatPackage!==GPT||
    !Number.isSafeInteger(owner.workWindowId)||
    !Number.isSafeInteger(owner.chatWindowId)||
    owner.workWindowId===owner.chatWindowId||
    scene.ok!==true||scene.packageName!==CHROME||
    scene.windowId!==owner.workWindowId||
    scene.layout?.arrangement!=='LEFT_RIGHT'||
    scene.layout?.workWindowId!==owner.workWindowId||
    scene.layout?.workPackage!==CHROME||
    scene.layout?.chatPackage!==GPT||
    !H64.test(scene.screenDigest||'')||
    !CONTEXT.test(scene.contextId||'')||
    !Number.isSafeInteger(scene.capturedAt)||scene.capturedAt>now||
    now-scene.capturedAt>15000||
    !Number.isSafeInteger(scene.expiresAt)||scene.expiresAt<=now||
    !Array.isArray(scene.items)||scene.items.length>5000)return null;
  const work=goodRect(owner.workBounds),chat=goodRect(owner.chatBounds);
  if(!work||!chat||chat.right>work.left)return null;
  return {work,chat,screenDigest:scene.screenDigest,contextId:scene.contextId,
   observedAt:scene.capturedAt,workWindowId:owner.workWindowId};
}
function pathOf(f){
 const p=f?.nodePath??f?.path;
 if(Array.isArray(p)&&p.length>0&&p.length<=64&&p.every(n=>
   Number.isSafeInteger(n)&&n>=0&&n<=100000))return p;
 return null;
}
function boundItem(item,owner,work){
 if(!object(item)||!Number.isSafeInteger(item.number)||item.number<0||
   !ITEM.test(item.itemRef||''))return false;
 const f=item.facts||{};
 if(f.windowId!==undefined&&Number(f.windowId)!==owner.workWindowId)return false;
 if(f.packageName!==undefined&&f.packageName!==CHROME)return false;
 const b=goodRect(f.boundsInScreen??f.nodeBounds??f.bounds);
 if(b&&!inside(b,work))return false;
 return true;
}
function exactFocusItem(items,owner,work){
 const hits=items.filter(x=>boundItem(x,owner,work)&&x.editable===true&&x.facts?.visible!==false&&
   x.facts?.focusable!==false&&(
     x.label==='Google 검색 또는 URL 입력'||
     x.facts?.viewId==='com.android.chrome:id/url_bar'||
     x.facts?.viewId==='com.android.chrome:id/search_box_text'
   ));
 return hits.length===1?hits[0]:null;
}
const scrollActions=f=>Array.isArray(f?.actions)?
 f.actions.map(x=>String(x).toUpperCase()):[];
function eligibleScroll(item,owner,work,direction){
 if(!boundItem(item,owner,work))return false;
 const f=item.facts||{},actions=scrollActions(f);
 if(f.scrollable!==true||f.visible===false||!goodRect(f.boundsInScreen??f.nodeBounds??f.bounds))return false;
 const b=goodRect(f.boundsInScreen??f.nodeBounds??f.bounds);
 if(!inside(b,work))return false;
 const desired=direction==='DOWN'?['SCROLL_DOWN','DOWN']:['SCROLL_UP','UP'];
 const fallback=direction==='DOWN'?'SCROLL_FORWARD':'SCROLL_BACKWARD';
 const explicit=actions.some(x=>/^(SCROLL_)?(UP|DOWN|LEFT|RIGHT)$/.test(x));
 return desired.some(x=>actions.includes(x))||(!explicit&&actions.includes(fallback));
}
function pickScroll(items,owner,work,direction){
 const matches=items.filter(x=>eligibleScroll(x,owner,work,direction));
 if(matches.length===1)return matches[0];
 if(matches.length<2)return null;
 // JH167 FIX9: only a deepest child of a fully proven ancestor chain.
 const withPaths=matches.map(x=>({item:x,path:pathOf(x.facts)}));
 if(withPaths.some(x=>!x.path))return null;
 const descendants=withPaths.filter(x=>withPaths.every(y=>
   y.item===x.item||(
     y.path.length<x.path.length&&y.path.every((v,i)=>v===x.path[i])
   )));
 return descendants.length===1?descendants[0].item:null;
}
const allowedKinds=new Set(['FOCUS','TYPE','SCROLL']);
const nativeNames=Object.freeze({FOCUS:'ACTION_FOCUS',TYPE:'set_text',SCROLL:'form_scroll'});
const classifySecret=v=>/bearer\s+[a-z0-9._~+/=-]{8,}|\b(?:sk|rk|pk)-[a-z0-9_-]{8,}\b|(?<!\d)\d{6}-?\d{7}(?!\d)|(?<!\d)(?:\d[ -]?){13,19}(?!\d)|(?:otp|인증번호|보안코드|cvc|cvv|pin)\s*[:：]?\s*\d{3,8}/i.test(v);
const sha=v=>createHash('sha256').update(v,'utf8').digest('hex');
const riskNames=Object.freeze({FOCUS:'SAFE_NAVIGATION',TYPE:'SAFE_INPUT',SCROLL:'SAFE_SCROLL'});
function sameScene(a,b){
 return object(a)&&object(b)&&a.screenDigest===b.screenDigest&&
  a.contextId===b.contextId&&a.windowId===b.windowId&&
  a.packageName===b.packageName&&a.layout?.workWindowId===b.layout?.workWindowId;
}
function capabilityProof(cap,owner,scene,kind,candidate){
 const common=object(cap)&&cap.source==='ORIGINAL_SIGNED_ANDROID_ACCESSIBILITY'&&
  cap.deviceId===owner.deviceId&&cap.sessionId===owner.sessionId&&
  cap.commandId===owner.commandId&&cap.workWindowId===owner.workWindowId&&
  cap.workPackage===CHROME&&cap.screenDigest===scene.screenDigest&&
  cap.action===nativeNames[kind]&&cap.exactItemRefSupported===true&&
  cap.nativeAccessibility===true&&cap.computerUseRequired===false;
 if(!common)return false;
 if(kind!=='FOCUS')return true;
 // Android API: ACTION_FOCUS has action ID 1. Accessibility focus (64)
 // does NOT prove text input focus and MUST NOT be substituted here.
 return cap.actionId===1&&cap.focusType==='FOCUS_INPUT'&&
  cap.isEditable===true&&cap.isFocusable===true&&
  cap.targetItemRef===candidate.itemRef&&
  H64.test(cap.targetNodeDigest||'')&&
  Array.isArray(cap.advertisedActionIds)&&cap.advertisedActionIds.includes(1);
}
const INPUT_FOCUS='ORIGINAL_SIGNED_ANDROID_FIND_FOCUS_INPUT';
function inputFocusProof(report,owner,scene,candidate,now){
 if(!object(report)||report.source!==INPUT_FOCUS||
   report.focusType!=='FOCUS_INPUT'||report.windowId!==owner.workWindowId||
   report.packageName!==CHROME||report.deviceId!==owner.deviceId||
   report.sessionId!==owner.sessionId||report.commandId!==owner.commandId||
   report.screenDigest!==scene.screenDigest||
   report.targetItemRef!==candidate.itemRef||report.isEditable!==true||
   typeof report.targetFocused!=='boolean'||
   report.nodeIsFocused!==report.targetFocused||
   !Number.isSafeInteger(report.checkedAt)||report.checkedAt>now||
   now-report.checkedAt>15000||report.checkedAt<scene.capturedAt-2000)
   return false;
 // A focused result must be the RIGHT root's findFocus(FOCUS_INPUT) node
 // and the SAME node's isFocused(); isAccessibilityFocused is irrelevant.
 if(report.targetFocused&&report.focusedItemRef!==candidate.itemRef)return false;
 if(!report.targetFocused&&report.focusedItemRef===candidate.itemRef)return false;
 return true;
}
/** Read-only plan, not authority: actual signed AndroidAgent must confirm
 * capability + risk and re-resolve the exact nodeRef immediately before one
 * native step. We do not create another executor to evade OWNER_ADMISSION_BLOCKED.
 */
export function createRightNativeFirstPlanner56({
 readOriginalOwner,readOriginalScene,verifyOriginalOwner,verifyOriginalScene,
 readOriginalNativeCapability,verifyOriginalNativeCapability,
 readOriginalRisk,verifyOriginalRisk,
 readOriginalInputFocus,verifyOriginalInputFocus,clock=Date.now
}={}){
 const ports=[readOriginalOwner,readOriginalScene,verifyOriginalOwner,
  verifyOriginalScene,readOriginalNativeCapability,verifyOriginalNativeCapability,
  readOriginalRisk,verifyOriginalRisk,
  readOriginalInputFocus,verifyOriginalInputFocus,clock];
 if(ports.some(f=>typeof f!=='function'))
  throw Error('JH168_ORIGINAL_NATIVE_ACCESSIBILITY_PORTS_REQUIRED');
 async function plan({kind,commandId,direction='DOWN',value}={}){
  if(!allowedKinds.has(kind)||!H32.test(commandId||'')||
   !['UP','DOWN'].includes(direction)|| 
   (kind==='TYPE'&&(typeof value!=='string'||!value.trim()||
     value.length>2000||classifySecret(value)))||
   (kind!=='TYPE'&&value!==undefined))
    return deny('RIGHT_NATIVE_ACTION_SCOPE_INVALID');
  let owner,scene;
  try{owner=await readOriginalOwner();scene=await readOriginalScene(owner)}
  catch{return deny('ORIGINAL_ANDROID_SCENE_UNAVAILABLE')}
  const scope=sceneScope(owner,scene,commandId,clock());
  if(!scope)return deny('RIGHT_CHROME_SCENE_SCOPE_INVALID');
  try{if(await verifyOriginalOwner(owner,commandId)!==true||
    await verifyOriginalScene(scene,owner)!==true)
    return deny('RIGHT_ORIGINAL_SCENE_NOT_AUTHENTICATED')}
  catch{return deny('RIGHT_ORIGINAL_SCENE_NOT_AUTHENTICATED')}
  const candidate=kind==='SCROLL'?pickScroll(scene.items,owner,scope.work,direction):
   exactFocusItem(scene.items,owner,scope.work);
  if(!candidate)return deny(kind==='SCROLL'?
    'NATIVE_SCROLL_NODE_NOT_PROVEN':'NATIVE_FOCUS_NODE_NOT_PROVEN');
  if(kind==='FOCUS'||kind==='TYPE'){
    let focusState,authenticated=false;
    try{
      focusState=await readOriginalInputFocus({owner,scene,candidate});
      authenticated=await verifyOriginalInputFocus(focusState,owner,scene,candidate);
    }catch{return deny('ORIGINAL_INPUT_FOCUS_READBACK_UNAVAILABLE')}
    if(authenticated!==true||
       !inputFocusProof(focusState,owner,scene,candidate,clock()))
      return deny('ORIGINAL_INPUT_FOCUS_READBACK_UNVERIFIED');
    if(kind==='TYPE'&&!focusState.targetFocused)
      return deny('NATIVE_INPUT_NOT_FOCUSED');
    if(kind==='FOCUS'&&focusState.targetFocused)
      return Object.freeze({ok:true,code:'NATIVE_FOCUS_ALREADY_PRESENT',
        focusType:'FOCUS_INPUT',inputFocusVerified:true,
        route:'SIGNED_ANDROID_ACCESSIBILITY',dispatched:false,
        computerUseInvoked:false,computerUseApprovalRequested:false,
        approvalGranted:false});
  }
  // Only the phone's current signed native action protocol can authoritatively
  // assert support. Old public itemRef alone cannot authorize a native step.
  let cap,risk;
  try{
    cap=await readOriginalNativeCapability({owner,scene,kind,candidate,direction});
    risk=await readOriginalRisk({owner,scene,kind,candidate,valueClass:kind==='TYPE'?'NON_SENSITIVE':'NONE'});
    if(await verifyOriginalNativeCapability(cap,owner,scene)!==true||
       await verifyOriginalRisk(risk,owner,scene,candidate)!==true)
      return deny('NATIVE_ORIGINAL_PROOF_NOT_AUTHENTICATED');
  }catch{return deny('NATIVE_ORIGINAL_CAPABILITY_UNAVAILABLE')}
  if(risk?.ownerAdmissionBlocked===true)
    return deny('OWNER_ADMISSION_BLOCKED_NO_ALTERNATE_ROUTE');
  if(risk?.phoneLocalApprovalRequired===true||risk?.riskClass==='PROTECTED')
    return deny('PROTECTED_ACTION_REQUIRES_ORIGINAL_PHONE_APPROVAL',{
      originalApprovalBoundary:true,computerUseInvoked:false});
  if(risk?.safe!==true||risk?.riskClass!==riskNames[kind])
    return deny('NATIVE_SAFE_RISK_NOT_CONFIRMED');
  if(!capabilityProof(cap,owner,scene,kind,candidate))
    return deny('NATIVE_EXACT_TARGET_CAPABILITY_MISSING_NO_COMPUTER_USE_FALLBACK');
  let latestOwner,latestScene;
  try{
    latestOwner=await readOriginalOwner();
    latestScene=await readOriginalScene(latestOwner);
    if(await verifyOriginalOwner(latestOwner,commandId)!==true||
       await verifyOriginalScene(latestScene,latestOwner)!==true)
      return deny('NATIVE_FRESH_SCENE_UNVERIFIED');
  }catch{return deny('NATIVE_FRESH_SCENE_UNAVAILABLE')}
  if(!sameOwner(owner,latestOwner)||!sameScene(scene,latestScene)||
     !sceneScope(latestOwner,latestScene,commandId,clock()))
    return deny('NATIVE_SCENE_CHANGED_BEFORE_ACTION');
  const plan=Object.freeze({
    route:'SIGNED_ANDROID_ACCESSIBILITY',nativeAction:nativeNames[kind],
    kind,commandId,contextId:scope.contextId,
    ...(kind==='FOCUS'?{androidActionId:1,focusType:'FOCUS_INPUT',
      requiresInputFocusReadback:true,focusTargetDigest:cap.targetNodeDigest}:{}),
    screenDigest:scope.screenDigest,workWindowId:scope.workWindowId,
    targetItemRef:candidate.itemRef,targetIndex:candidate.number,
    ...(kind==='SCROLL'?{direction}:{}),
    ...(kind==='TYPE'?{valueDigest:sha(value)}:{}),
    originalSignedPhoneRequired:true,executionAuthorizationNotGranted:true,
    computerUseInvoked:false,computerUseApprovalRequested:false,
    dispatched:false,automaticReplay:false
  });
  return Object.freeze({ok:true,code:'NATIVE_SAFE_ACTION_PLAN_READY',plan,
    dispatched:false,automaticReplay:false});
 }
 return Object.freeze({plan});
}
 
/** Verification AFTER original signed ACTION_FOCUS has been attempted once.
 * Merely returning performAction(true), ACTION_ACCESSIBILITY_FOCUS, or
 * accessibilityFocused=true cannot be promoted to input focus success.
 */
export async function verifyRightInputFocusCompletion56({
 plan,actionReceipt,freshOwner,freshScene,focusReport,
 verifyOriginalActionReceipt,verifyOriginalOwner,verifyOriginalScene,
 verifyOriginalInputFocus,clock=Date.now
}={}){
 const denied=code=>deny(code,{focusVerified:false});
 if(!object(plan)||plan.kind!=='FOCUS'||
    plan.nativeAction!=='ACTION_FOCUS'||plan.androidActionId!==1||
    plan.focusType!=='FOCUS_INPUT'||!H64.test(plan.focusTargetDigest||'')||
    plan.originalSignedPhoneRequired!==true||
    [verifyOriginalActionReceipt,verifyOriginalOwner,verifyOriginalScene,
     verifyOriginalInputFocus,clock].some(fn=>typeof fn!=='function'))
   return denied('FOCUS_VERIFICATION_SCOPE_INVALID');
 if(!object(actionReceipt)||actionReceipt.type!=='agent_step'||
   actionReceipt.status!=='complete'||actionReceipt.result?.ok!==true||
   actionReceipt.action!=='ACTION_FOCUS'||
   actionReceipt.commandId!==plan.commandId||
   actionReceipt.deviceId!==freshOwner?.deviceId||
   actionReceipt.secureSessionId!==freshOwner?.sessionId||
   actionReceipt.screenDigest!==plan.screenDigest||
   actionReceipt.targetNodeDigest!==plan.focusTargetDigest||
   actionReceipt.targetItemRef!==plan.targetItemRef||
   actionReceipt.windowId!==plan.workWindowId)
   return denied('ORIGINAL_FOCUS_ACTION_UNCONFIRMED');
 try{if(await verifyOriginalActionReceipt(actionReceipt,plan)!==true)
   return denied('ORIGINAL_FOCUS_ACTION_UNAUTHENTICATED')}
 catch{return denied('ORIGINAL_FOCUS_ACTION_UNAUTHENTICATED')}
 if(!object(freshOwner)||freshOwner.commandId!==plan.commandId||
    freshOwner.workWindowId!==plan.workWindowId||
    !sceneScope(freshOwner,freshScene,plan.commandId,clock()))
   return denied('FOCUS_RIGHT_WORK_WINDOW_CHANGED');
 try{if(await verifyOriginalOwner(freshOwner,plan.commandId)!==true||
         await verifyOriginalScene(freshScene,freshOwner)!==true||
         await verifyOriginalInputFocus(focusReport,freshOwner,freshScene)!==true)
   return denied('FOCUS_FRESH_PROOF_NOT_AUTHENTICATED')}
 catch{return denied('FOCUS_FRESH_PROOF_NOT_AUTHENTICATED')}
 if(!object(focusReport)||focusReport.source!==INPUT_FOCUS||
    focusReport.focusType!=='FOCUS_INPUT'||
    focusReport.deviceId!==freshOwner.deviceId||
    focusReport.sessionId!==freshOwner.sessionId||
    focusReport.commandId!==plan.commandId||
    focusReport.windowId!==plan.workWindowId||
    focusReport.packageName!==CHROME||
    focusReport.screenDigest!==freshScene.screenDigest||
    focusReport.targetFocused!==true||focusReport.nodeIsFocused!==true||
    focusReport.isEditable!==true||
    focusReport.focusedTargetDigest!==plan.focusTargetDigest||
    !Number.isSafeInteger(focusReport.checkedAt)||
    focusReport.checkedAt<freshScene.capturedAt-2000||
    focusReport.checkedAt>clock()||
    clock()-focusReport.checkedAt>15000)
    return denied('FOCUS_INPUT_NOT_CONFIRMED_ON_EXACT_TARGET');
 return Object.freeze({ok:true,code:'RIGHT_CHROME_INPUT_FOCUS_VERIFIED',
   focusVerified:true,focusType:'FOCUS_INPUT',
   originalActionVerified:true,phoneLocalApprovalBypassed:false,
   computerUseInvoked:false,dispatched:false,automaticReplay:false});
}
