/**
 * Stage45: fail-closed READ-ONLY Android native <select> popup ownership proof.
 *
 * This is NOT a phone bridge, parser for arbitrary webpages, action-grant
 * issuer or workaround for ambiguous_work_window. The original Secure56
 * HMAC/nonce/device/session authentication MUST verify the phone-produced
 * observation before this pure module can be invoked.
 *
 * Design: official Android AccessibilityWindowInfo (id/display/type/layer,
 * active/focused/bounds) + Appium UiAutomator2 multi-window model.
 */
const EHEX=/^[a-f0-9]{32}$/,HEX64=/^[a-f0-9]{64}$/;
const CONTEXT=/^ssc_[a-f0-9]{32}$/,ITEM=/^item_[a-f0-9]{16}$/;
const WINDOW=/^[1-9][0-9]{0,9}$/;
const DISPLAY=/^(?:0|[1-9][0-9]{0,5})$/;
const PKG='com.android.chrome',CHAT='com.openai.chatgpt';
const P_TYPES=new Set(['TYPE_APPLICATION']);
const bad=(code,details={})=>Object.freeze({ok:false,code,readOnly:true,
  authorizedToPick:false,phoneActionDispatched:false,automaticReplay:false,
  originalActionResultVerified:false,...details});
const isObj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function box(x){
 if(!Array.isArray(x)||x.length!==4||!x.every(n=>Number.isSafeInteger(n)&&n>=0&&n<=100000))return null;
 if(x[2]<=x[0]||x[3]<=x[1])return null;
 return x;
}
function within(a,b){return a[0]>=b[0]&&a[1]>=b[1]&&a[2]<=b[2]&&a[3]<=b[3];}
const overlap=(a,b)=>Math.max(a[0],b[0])<Math.min(a[2],b[2])&&
 Math.max(a[1],b[1])<Math.min(a[3],b[3]);
const plain=(x,max=100)=>typeof x==='string'&&x.length>0&&x.length<=max;
function same(a,b){return a===b&&plain(a);}
function win(w){
 return isObj(w)&&WINDOW.test(String(w.windowId||''))&&DISPLAY.test(String(w.displayId??''))&&
  plain(w.packageName,120)&&plain(w.type,64)&&
  Number.isSafeInteger(w.layer)&&w.layer>=0&&w.layer<=10000&&
  typeof w.active==='boolean'&&typeof w.focused==='boolean'&&!!box(w.bounds);
}
export function classifyMobile13SelectOpenIncident56({open,snapshot,inspect,splitComfort}={}){
 // Current incident is UNKNOWN-effect, not an authorization to replay OPEN.
 if(open?.executed===true&&open?.resultVerified===false&&
   open?.code==='split_screen_changed_or_missing'&&
   snapshot?.code==='split_screen_changed_or_missing'&&
   inspect?.code==='ambiguous_work_window'&&
   splitComfort?.code==='AMBIGUOUS_WORK')
   return bad('NATIVE_SELECT_POSSIBLE_MULTI_WINDOW_UNPROVEN',
     {originalOpenOutcome:'NEEDS_REVIEW_NO_REPLAY',
      requiresPhoneProducerEvidence:true});
 return bad('NATIVE_SELECT_INCIDENT_UNCLASSIFIED',{originalOpenOutcome:'UNKNOWN'});
}
export function verifyMobile13SignedSelectPopup56({origin,observation,now=Date.now()}={}){
 if(!isObj(origin)||!isObj(observation))return bad('POPUP_EVIDENCE_REQUIRED');
 if(!CONTEXT.test(origin.contextId||'')||!EHEX.test(origin.commandId||'')||
    !ITEM.test(origin.targetItemRef||'')||!HEX64.test(origin.deviceDigest||'')||
    !plain(origin.secureSessionId)||origin.workPackage!==PKG||origin.chatPackage!==CHAT||
    origin.layout!=='LEFT_RIGHT'||!WINDOW.test(String(origin.workWindowId||''))||
    !WINDOW.test(String(origin.chatWindowId||''))||
    !DISPLAY.test(String(origin.displayId??''))||!box(origin.workBounds)||!box(origin.chatBounds)||
    overlap(origin.workBounds,origin.chatBounds))
  return bad('POPUP_ORIGINAL_SPLIT_BINDING_INVALID');
 // Boolean is only a marker provided by the ORIGINAL signed phone receipt
 // reader, never accepted as standalone authentication.
 if(observation.signedPhoneReadVerified!==true||observation.schema!=='JH168_NATIVE_SELECT_WINDOW_PROOF_V1')
  return bad('POPUP_ORIGINAL_SIGNED_READ_REQUIRED');
 if(!same(observation.contextId,origin.contextId)||
    !same(observation.commandId,origin.commandId)||
    !same(observation.secureSessionId,origin.secureSessionId)||
    !same(observation.deviceDigest,origin.deviceDigest)||
    observation.displayId!==origin.displayId)
  return bad('POPUP_SESSION_OR_COMMAND_MISMATCH');
 const at=observation.observedAtMs,old=origin.observedAtMs;
 if(!Number.isSafeInteger(now)||!Number.isSafeInteger(at)||!Number.isSafeInteger(old)||
   at<old||at>now+5000||now-at>30000||at-old>30000)
  return bad('POPUP_EVIDENCE_STALE_OR_REORDERED');
 const windows=observation.windows;
 if(!Array.isArray(windows)||windows.length!==3||!windows.every(win))
  return bad('POPUP_WINDOW_LIST_INCOMPLETE_OR_AMBIGUOUS');
 const ids=new Set(windows.map(w=>w.displayId+'|'+w.windowId));
 if(ids.size!==windows.length)return bad('POPUP_DUPLICATE_WINDOW_ID');
 if(windows.some(w=>w.displayId!==origin.displayId))
  return bad('POPUP_CROSS_DISPLAY');
 const chat=windows.find(w=>String(w.windowId)===String(origin.chatWindowId));
 const chrome=windows.find(w=>String(w.windowId)===String(origin.workWindowId));
 const popup=windows.find(w=>String(w.windowId)===String(observation.popupWindowId));
 if(!chat||!chrome||!popup||popup===chat||popup===chrome)
  return bad('POPUP_PARENT_OR_TARGET_WINDOW_MISSING');
 if(chat.packageName!==CHAT||chrome.packageName!==PKG||popup.packageName!==PKG)
  return bad('POPUP_OWNER_PACKAGE_MISMATCH');
 if(chat.active||chat.focused||chrome.active||chrome.focused||!popup.active||!popup.focused)
  return bad('POPUP_FOREGROUND_FOCUS_UNPROVEN');
 if(!P_TYPES.has(popup.type)||popup.layer<=chrome.layer||
   !within(popup.bounds,origin.workBounds)||overlap(popup.bounds,origin.chatBounds))
  return bad('POPUP_LAYOUT_LAYER_INVALID');
 if(!Array.isArray(observation.options)||observation.options.length<2||
    observation.options.length>12)
  return bad('POPUP_OPTIONS_NOT_VERIFIED');
 if(String(popup.parentWindowId||'')!==String(origin.workWindowId)||popup.anchorItemRef!==origin.targetItemRef)
  return bad('POPUP_ANCHOR_NOT_ORIGINAL_SELECT');
 const refs=new Set();
 for(const o of observation.options){
  if(!isObj(o)||!ITEM.test(o.itemRef||'')||refs.has(o.itemRef)||o.windowId!==popup.windowId||
     o.role!=='option'||o.clickable!==true||o.sensitive===true)
    return bad('POPUP_OPTION_REF_UNVERIFIED');
  refs.add(o.itemRef);
 }
 // A successful classification does NOT authorize a PICK. That separate
 // phone-origin signed request will require original CAS, focused option,
 // one-shot action identity, local approvals and new post-action screen proof.
 return Object.freeze({ok:true,code:'POPUP_READ_ONLY_EVIDENCE_GROUNDED',
    workWindowId:String(origin.workWindowId),popupWindowId:String(popup.windowId),
    displayId:popup.displayId,optionCount:observation.options.length,
    readOnly:true,authorizedToPick:false,phoneActionDispatched:false,
    automaticReplay:false,originalActionResultVerified:false});
}
