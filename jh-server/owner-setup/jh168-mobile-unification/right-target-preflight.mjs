/** JH168 RIGHT Chrome target binding / read-only preflight.
 * Inspired by DroidBridge AccessibilitySceneProof + JH167 FIX9 nested scroll
 * selection. This module never dispatches, approves, clicks, types or scrolls.
 * The ORIGINAL Secure56 host must attest all phone responses and execute
 * actions only through inspect -> prepare -> phone local grant -> execute.
 */
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
 const hits=items.filter(x=>boundItem(x,owner,work)&&x.editable===true&&
   x.clickable===true&&(
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
function checkOriginalInspection(i,plan){
 if(!object(i)||i.status!=='complete'||i.result?.ok!==true||
   i.originalSecure56Verified!==true||
   i.commandId!==plan.commandId||
   i.deviceId!==plan.deviceId||
   i.sessionId!==plan.sessionId)return deny('ORIGINAL_INSPECTION_NOT_ATTESTED');
 const v=i.result;
 if(v.packageName!==CHROME||v.windowId!==plan.workWindowId||
   v.screenDigest!==plan.screenDigest||
   v.targetDigest===undefined||!H64.test(v.targetDigest)||
   v.index!==plan.index)return deny('ORIGINAL_INSPECTION_TARGET_CHANGED');
 if(plan.action==='CLICK'){
   if(v.code==='visual_click_target')return deny('FOCUS_REQUIRES_ORIGINAL_SCREENSHOT_CONSENT');
   if(!['click_target_ready','accessibility_click_target'].includes(v.code))
     return deny('FOCUS_ACCESSIBILITY_CLICK_NOT_VERIFIED');
 }else{
   if(!['scroll_target_ready','nested_scroll_target_ready'].includes(v.code)||
     v.selectedAction!==(plan.direction==='DOWN'?'DOWN':'UP')||
     v.candidateCount!==1||v.treeComplete!==true)
     return deny('SCROLL_ACCESSIBILITY_TARGET_NOT_VERIFIED');
 }
 return {ok:true,code:'ORIGINAL_ACCESSIBILITY_TARGET_VERIFIED',
   targetDigest:v.targetDigest,originalInspection:i};
}
/** Optional phone inspection evidence is REQUIRED before an action can be
 * prepared. A bare scene-derived index is only a read-only candidate.
 */
export async function createRightTargetPreflight56({
 readOriginalOwner,readOriginalScene,verifyOriginalOwner,verifyOriginalScene,
 readOriginalInspect,verifyOriginalInspect,prepareOriginal,verifyOriginalPreparedJob,
 clock=Date.now
}={}){
 const ports=[readOriginalOwner,readOriginalScene,verifyOriginalOwner,
  verifyOriginalScene,readOriginalInspect,verifyOriginalInspect,prepareOriginal,
  verifyOriginalPreparedJob,clock];
 if(ports.some(f=>typeof f!=='function'))throw Error('ORIGINAL_SECURE56_PREFLIGHT_PORTS_REQUIRED');
 async function prepare({action,commandId,direction='DOWN',taskDigest}={}){
  if(!['CLICK','SCROLL'].includes(action)||!H32.test(commandId||'')||
    !H64.test(taskDigest||'')||!['DOWN','UP'].includes(direction))
   return deny('RIGHT_ACTION_SCOPE_INVALID');
  let owner,scene;
  try{owner=await readOriginalOwner();scene=await readOriginalScene(owner)}
  catch{return deny('RIGHT_SIGNED_SCENE_UNAVAILABLE')}
  const scope=sceneScope(owner,scene,commandId,clock());
  if(!scope)return deny('RIGHT_CHROME_SCENE_SCOPE_INVALID');
  try{if(await verifyOriginalOwner(owner,commandId)!==true||
      await verifyOriginalScene(scene,owner)!==true)
      return deny('ORIGINAL_RIGHT_SCENE_NOT_AUTHENTICATED')}
  catch{return deny('ORIGINAL_RIGHT_SCENE_NOT_AUTHENTICATED')}
  const candidate=action==='CLICK'?
    exactFocusItem(scene.items,owner,scope.work):
    pickScroll(scene.items,owner,scope.work,direction);
  if(!candidate)return deny(action==='CLICK'?
      'FOCUS_UNIQUE_EDITABLE_TARGET_REQUIRED':'SCROLL_UNIQUE_ADVERTISED_NODE_REQUIRED',
      {candidatesDispatched:0});
  if(action==='CLICK'&&candidate.facts?.focused===true)
    return {ok:true,code:'FOCUS_ALREADY_PRESENT',dispatched:false,
      targetIndex:candidate.number,focusVerified:true};
  const plan={action,commandId,deviceId:owner.deviceId,sessionId:owner.sessionId,
    workWindowId:scope.workWindowId,screenDigest:scope.screenDigest,
    contextId:scope.contextId,index:candidate.number,itemRef:candidate.itemRef,
    direction,taskDigest};
  // One ORIGINAL READ_ONLY inspection of this exact candidate. No fallback
  // to coordinate guesses or re-issuing a pending inspect.
  let inspected;
  try{inspected=await readOriginalInspect(plan)}
  catch{return deny('ORIGINAL_INSPECT_OUTCOME_UNKNOWN_NO_REPLAY')}
  if(inspected?.status==='queued'||inspected?.status==='in_progress')
    return deny('ORIGINAL_INSPECT_PENDING_USE_RECEIPT',{
      originalReceiptToken:inspected.receiptToken??inspected.receiptRef??null,noNewInspect:true});
  try{if(await verifyOriginalInspect(inspected,plan)!==true)
    return deny('ORIGINAL_INSPECT_NOT_AUTHENTICATED')}
  catch{return deny('ORIGINAL_INSPECT_NOT_AUTHENTICATED')}
  const proof=checkOriginalInspection(inspected,plan);
  if(!proof.ok)return proof;
  let freshOwner,freshScene;
  try{freshOwner=await readOriginalOwner();freshScene=await readOriginalScene(freshOwner)}
  catch{return deny('RIGHT_SCENE_REFRESH_UNAVAILABLE')}
  if(!sameOwner(owner,freshOwner)||!sceneScope(freshOwner,freshScene,commandId,clock())||
    freshScene.screenDigest!==scope.screenDigest||
    freshScene.windowId!==scope.workWindowId)
    return deny('RIGHT_SCREEN_CHANGED_BEFORE_PREPARE');
  try{if(await verifyOriginalOwner(freshOwner,commandId)!==true||
      await verifyOriginalScene(freshScene,freshOwner)!==true)
      return deny('ORIGINAL_RIGHT_REFRESH_UNVERIFIED')}
  catch{return deny('ORIGINAL_RIGHT_REFRESH_UNVERIFIED')}
  // Delegate to the ORIGINAL Secure56 PREPARE. It is the only issuer of
  // a phone action lease or local approval boundary.
  let prepared;
  try{prepared=await prepareOriginal({...plan,targetDigest:proof.targetDigest})}
  catch{return deny('PREPARE_OUTCOME_UNKNOWN_NO_REPLAY')}
  if(prepared?.code==='OWNER_ADMISSION_BLOCKED'||prepared?.result?.code==='OWNER_ADMISSION_BLOCKED')
    return deny('OWNER_ADMISSION_BLOCKED_NO_BYPASS');
  if(prepared?.status!=='complete')
    return deny('ORIGINAL_PREPARE_NOT_CONFIRMED',{
      originalReceiptToken:prepared?.receiptToken??prepared?.receiptRef??null});
  try{if(await verifyOriginalPreparedJob(prepared,plan)!==true)
    return deny('ORIGINAL_PREPARE_NOT_AUTHENTICATED')}
  catch{return deny('ORIGINAL_PREPARE_NOT_AUTHENTICATED')}
  if(prepared?.result?.ok!==true &&
      !['APPROVAL_REQUIRED','SCREENSHOT_CONSENT_REQUIRED'].includes(prepared?.result?.code))
    return deny('ORIGINAL_PREPARE_NOT_CONFIRMED');
  if(!['READY','APPROVAL_REQUIRED','SCREENSHOT_CONSENT_REQUIRED'].includes(prepared.result.code))
    return deny('ORIGINAL_PREPARE_RESULT_UNSUPPORTED');
  return Object.freeze({ok:true,code:prepared.result.code,
    targetIndex:plan.index,originalPrepareJobId:prepared.id??null,
    requiresOriginalPhoneLocalApproval:prepared.result.code!=='READY',
    actionPrepared:prepared.result.code==='READY',
    dispatched:false,approvalGranted:false,automaticReplay:false});
 }
 return Object.freeze({prepare});
}
