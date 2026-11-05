import {createHash} from 'node:crypto';
import {nextStage64FeatureProvider} from './stage64-feature-fallback.mjs';

export const STAGE61_ROUTE_SCHEMA='JH168_STAGE61_ROUTE_REQUEST_V1';
export const STAGE61_RECEIPT_SCHEMA='JH168_STAGE61_UNIFIED_RECEIPT_V1';
export const STAGE61_VERSION='JH168_STAGE61_RIGHT_PANE_ROUTER_V3';

const PROVIDERS=new Set(['ANDROID_WEB','ANDROID_COMPUTER_USE','PLAYWRIGHT_MOBILE','STOP_NO_REPLAY']);
const OUTCOMES=new Set(['NOT_RUN','READ_ONLY_VERIFIED','PREPARED','VERIFIED_PASS','VERIFIED_UNSUPPORTED_NO_EFFECT','FAILED_NO_EFFECT','FAILED_AFTER_EFFECT','UNKNOWN','PENDING','PHONE_SCOPED_SITE_DISCARD']);
const ACTIONS=new Set(['OPEN','SNAPSHOT','CLICK','TYPE','SCROLL','BACK','SELECT_OPEN','SELECT_PICK','KEYPRESS_ENTER_TAB','NATIVE_APP_ACTION','READ_ONLY_INSPECT']);
const uncertain=new Set(['UNKNOWN','PENDING','PHONE_SCOPED_SITE_DISCARD','FAILED_AFTER_EFFECT']);
const webFirst=new Set(['OPEN','SNAPSHOT','CLICK','TYPE','BACK','SELECT_OPEN','SELECT_PICK','KEYPRESS_ENTER_TAB']);
const computerNative=new Set(['CLICK','TYPE','SCROLL','BACK','SELECT_OPEN','SELECT_PICK','KEYPRESS_ENTER_TAB','NATIVE_APP_ACTION','READ_ONLY_INSPECT']);
const sha=x=>createHash('sha256').update(String(x)).digest('hex');
const fail=(code,action='SNAPSHOT')=>Object.freeze({provider:'STOP_NO_REPLAY',action,code,allowed:false,replayAllowed:false,fallbackEligible:false});

function parseBox(v){
 if(typeof v!=='string'||!/^\d+,\d+,\d+,\d+$/.test(v))return null;
 const [left,top,right,bottom]=v.split(',').map(Number);
 if(![left,top,right,bottom].every(Number.isSafeInteger)||left<0||top<0||right<=left||bottom<=top)return null;
 return {left,top,right,bottom};
}
export function layoutFromStage61Receipt(receipt){
 const chat=parseBox(receipt?.chatBounds),work=parseBox(receipt?.workBounds);
 if(!chat||!work)return null;
 return {arrangement:'LEFT_RIGHT',chatPackage:receipt.chatPackage,chatWindowId:receipt.chatWindowId,
  chatLeft:chat.left,chatRight:chat.right,chatDisplayId:receipt.chatDisplayId,
  workPackage:receipt.workPackage,workWindowId:receipt.workWindowId,
  workLeft:work.left,workRight:work.right,workDisplayId:receipt.workDisplayId};
}

export function fixedLayoutStage61(layout){
 if(!layout||layout.arrangement!=='LEFT_RIGHT')return {ok:false,code:'LEFT_GPT_RIGHT_WORK_LAYOUT_REQUIRED'};
 if(layout.chatPackage!=='com.openai.chatgpt')return {ok:false,code:'LEFT_GPT_REQUIRED'};
 if(typeof layout.chatWindowId!=='number'||typeof layout.workWindowId!=='number'||layout.chatWindowId===layout.workWindowId)
  return {ok:false,code:'WINDOW_BINDING_INVALID'};
 if(typeof layout.chatLeft!=='number'||typeof layout.chatRight!=='number'||typeof layout.workLeft!=='number'||typeof layout.workRight!=='number')
  return {ok:false,code:'WINDOW_BOUNDS_REQUIRED'};
 if(layout.chatLeft<0||layout.chatRight<=layout.chatLeft||layout.workRight<=layout.workLeft)
  return {ok:false,code:'WINDOW_BOUNDS_INVALID'};
 if(layout.chatRight>layout.workLeft||layout.chatLeft+layout.chatRight>=layout.workLeft+layout.workRight)
  return {ok:false,code:'LEFT_GPT_RIGHT_WORK_LAYOUT_REQUIRED'};
 if(layout.chatDisplayId!=null&&layout.workDisplayId!=null&&layout.chatDisplayId!==layout.workDisplayId)
  return {ok:false,code:'CHAT_AND_WORK_DISPLAY_CHANGED'};
 if(typeof layout.workPackage!=='string'||!layout.workPackage||layout.workPackage==='com.openai.chatgpt'||layout.workPackage==='com.koreanlifehub.bridge')
  return {ok:false,code:'RIGHT_WORK_PACKAGE_INVALID'};
 return {ok:true,code:'LEFT_GPT_RIGHT_WORK_VERIFIED'};
}

export function routeStage61({action,layout,webOutcome='NOT_RUN',computerOutcome='NOT_RUN',playwrightMobileAvailable=false,compatibilityDirectComputerUse=false}={}){
 action=String(action||'').toUpperCase();webOutcome=String(webOutcome||'NOT_RUN').toUpperCase();computerOutcome=String(computerOutcome||'NOT_RUN').toUpperCase();
 if(!ACTIONS.has(action)||!OUTCOMES.has(webOutcome)||!OUTCOMES.has(computerOutcome))return fail('INVALID_STAGE61_ROUTE_INPUT',action||'SNAPSHOT');
 const fixed=fixedLayoutStage61(layout);if(!fixed.ok)return fail(fixed.code,action);
 if(uncertain.has(webOutcome)||uncertain.has(computerOutcome))return fail('PREVIOUS_EFFECT_UNCERTAIN',action);
 if(webOutcome==='VERIFIED_PASS'||computerOutcome==='VERIFIED_PASS')return fail('ALREADY_VERIFIED_NO_REPEAT',action);
 if(compatibilityDirectComputerUse&&computerNative.has(action)&&computerOutcome==='NOT_RUN')
  return {provider:'ANDROID_COMPUTER_USE',action,code:'EXPLICIT_COMPUTER_USE_COMPATIBILITY',allowed:true,replayAllowed:false,fallbackEligible:false};
 const next=nextStage64FeatureProvider({action,webOutcome,computerOutcome,playwrightMobileAvailable});
 return next.provider==='STOP_NO_REPLAY'?fail(next.code,action):next;
}

export function verifyStage61Receipt(receipt,expected={}){
 if(!receipt||receipt.schema!==STAGE61_RECEIPT_SCHEMA||receipt.routerVersion!==STAGE61_VERSION)return {ok:false,code:'STAGE61_RECEIPT_SCHEMA_INVALID'};
 if(!PROVIDERS.has(receipt.provider)||!ACTIONS.has(receipt.action)||!OUTCOMES.has(receipt.outcome))return {ok:false,code:'STAGE61_RECEIPT_VALUE_INVALID'};
 if(receipt.replayAllowed!==false||receipt.automaticReplay!==false)return {ok:false,code:'STAGE61_REPLAY_FLAG_INVALID'};
 if(receipt.fixedLayout!=='LEFT_GPT_RIGHT_WORK'||receipt.leftGptProtected!==true||receipt.rightWorkVerified!==true||receipt.sameDisplay!==true)return {ok:false,code:'STAGE61_LAYOUT_PROOF_MISSING'};
 const layout=layoutFromStage61Receipt(receipt);const fixed=layout&&fixedLayoutStage61(layout);
 if(!layout||!fixed.ok)return {ok:false,code:fixed?.code||'STAGE61_LAYOUT_FIELDS_INVALID'};
 if(typeof receipt.unifiedReceiptDigest!=='string'||!/^[0-9a-f]{64}$/.test(receipt.unifiedReceiptDigest))return {ok:false,code:'STAGE61_RECEIPT_DIGEST_INVALID'};
 if(expected.provider&&receipt.provider!==expected.provider)return {ok:false,code:'STAGE61_PROVIDER_MISMATCH'};
 if(expected.action&&receipt.action!==expected.action)return {ok:false,code:'STAGE61_ACTION_MISMATCH'};
 if(receipt.successReceipt===true&&receipt.outcome!=='VERIFIED_PASS')return {ok:false,code:'STAGE61_FALSE_SUCCESS_RECEIPT'};
 if(receipt.verifiedUnsupportedNoEffect===true&&receipt.outcome!=='VERIFIED_UNSUPPORTED_NO_EFFECT')return {ok:false,code:'STAGE61_FALSE_UNSUPPORTED_RECEIPT'};
 return {ok:true,code:'STAGE61_RECEIPT_VERIFIED',receiptDigest:sha(receipt.unifiedReceiptDigest+'|'+receipt.provider+'|'+receipt.action+'|'+receipt.outcome),success:receipt.outcome==='VERIFIED_PASS'};
}

export function nextStage61Request({action,layout,receipts=[],playwrightMobileAvailable=false}={}){
 let webOutcome='NOT_RUN',computerOutcome='NOT_RUN';
 for(const receipt of receipts){
  const verified=verifyStage61Receipt(receipt);if(!verified.ok)return fail(verified.code,String(action||'SNAPSHOT').toUpperCase());
  if(receipt.provider==='ANDROID_WEB')webOutcome=receipt.outcome;
  if(receipt.provider==='ANDROID_COMPUTER_USE')computerOutcome=receipt.outcome;
  if(receipt.outcome==='VERIFIED_PASS')return fail('ALREADY_VERIFIED_NO_REPEAT',String(action||'SNAPSHOT').toUpperCase());
 }
 return routeStage61({action,layout,webOutcome,computerOutcome,playwrightMobileAvailable});
}