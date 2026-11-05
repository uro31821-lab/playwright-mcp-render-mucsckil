import {randomBytes,createHash} from 'node:crypto';
import {layoutFromStage61Receipt,routeStage61,verifyStage61Receipt,STAGE61_ROUTE_SCHEMA} from './stage61-right-pane-router.mjs';

const FINAL=new Set(['VERIFIED_PASS','VERIFIED_UNSUPPORTED_NO_EFFECT','FAILED_NO_EFFECT','FAILED_AFTER_EFFECT','UNKNOWN','PENDING','PHONE_SCOPED_SITE_DISCARD']);
const STOP=new Set(['VERIFIED_PASS','FAILED_AFTER_EFFECT','UNKNOWN','PENDING','PHONE_SCOPED_SITE_DISCARD']);
const CONTROL=new Set(['ACTION_APPROVAL_REQUEST','ACTION_APPROVAL_STATUS','SCREEN_CONSENT_REQUEST','SCREEN_CONSENT_STATUS','CAPTURE_FRAME']);
const token=()=>`s61_${randomBytes(18).toString('base64url')}`;
const now=()=>Date.now();
const hash=value=>createHash('sha256').update(String(value??'')).digest('hex');
const fail=(code,extra={})=>Object.freeze({ok:false,code,replayAllowed:false,automaticReplay:false,...extra});
const validToken=value=>typeof value==='string'&&value.length>=12&&value.length<=512;
const validHex64=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
const validExpiry=value=>Number.isSafeInteger(value)&&value>now();
const taskDigest=value=>validToken(value)?hash(`stage61-task|${value}`):null;
const tokenDigest=value=>validToken(value)?hash(`stage61-token|${value}`):null;
const emptyCheckpoint=()=>({state:'NONE',action:null,taskDigest:null,requestTokenDigest:null,grantTokenDigest:null,actionDigest:null,screenDigest:null,grantExpiresAt:null,lastCode:null});
const publicCheckpoint=c=>Object.freeze({state:c.state,action:c.action,taskDigest:c.taskDigest,requestTokenDigest:c.requestTokenDigest,grantTokenDigest:c.grantTokenDigest,actionDigest:c.actionDigest,screenDigest:c.screenDigest,grantExpiresAt:c.grantExpiresAt,lastCode:c.lastCode});

/**
 * Host-side Stage61 state. `readOriginalSignedResult` MUST resolve an opaque
 * original Secure56 completion reference. User JSON, booleans and copied
 * receipts are never trusted input to this object.
 *
 * Approval checkpoints do not grant anything. They only stop duplicate phone
 * prompts and bind the caller-supplied exact one-shot request/grant to the
 * already-authorized Stage61 route. The Android device remains the authority.
 */
export function createStage61HostAdapter({readOriginalSignedResult,ttlMs=10*60*1000,maxStates=16}={}){
 if(typeof readOriginalSignedResult!=='function')throw new TypeError('ORIGINAL_SIGNED_RESULT_READER_REQUIRED');
 const states=new Map();
 const purge=()=>{const t=now();for(const [k,v] of states)if(t>=v.expiresAt)states.delete(k);};
 const get=routeToken=>{purge();const s=states.get(routeToken);return s&&now()<s.expiresAt?s:null;};
 async function signed(ref){
  if(typeof ref!=='string'||ref.length<12||ref.length>256||!/^[A-Za-z0-9._:-]+$/.test(ref))return null;
  try{return await readOriginalSignedResult(ref);}catch{return null;}
 }
 function sameScope(a,b){return !!a&&!!b&&a.chatPackage===b.chatPackage&&a.chatWindowId===b.chatWindowId&&a.chatBounds===b.chatBounds&&a.chatDisplayId===b.chatDisplayId&&a.workPackage===b.workPackage&&a.workWindowId===b.workWindowId&&a.workBounds===b.workBounds&&a.workDisplayId===b.workDisplayId;}
 function view(routeToken,s){return Object.freeze({ok:true,routeToken,expiresAt:s.expiresAt,layout:s.layout,webOutcome:s.webOutcome,computerOutcome:s.computerOutcome,stopped:s.stopped,successReceiptDigest:s.successReceiptDigest,approval:publicCheckpoint(s.approval),screenConsent:publicCheckpoint(s.screenConsent),replayAllowed:false,automaticReplay:false});}
 function plannedComputer(s,action){
  const planned=routeStage61({action,layout:s.layout,webOutcome:s.webOutcome,computerOutcome:s.computerOutcome});
  return planned.provider==='ANDROID_COMPUTER_USE'&&planned.allowed===true?planned:null;
 }
 function exactScope(c,action,td){return c.action===String(action||'').toUpperCase()&&c.taskDigest===td;}
 function expireCheckpoint(c){
  if(c.state==='GRANT_READY'&&Number.isSafeInteger(c.grantExpiresAt)&&now()>c.grantExpiresAt){c.state='EXPIRED';c.lastCode='STAGE61_APPROVAL_GRANT_EXPIRED';c.grantTokenDigest=null;}
 }
 return Object.freeze({
  async begin({originalReceiptRef}={}){
   purge();if(states.size>=maxStates)return fail('STAGE61_ROUTE_STATE_CAPACITY');
   const result=await signed(originalReceiptRef),receipt=result?.stage61Router;
   const verified=verifyStage61Receipt(receipt,{provider:'ANDROID_WEB',action:'SNAPSHOT'});
   if(!verified.ok||receipt.outcome!=='READ_ONLY_VERIFIED')return fail(verified.ok?'STAGE61_INITIAL_READ_REQUIRED':verified.code);
   const layout=layoutFromStage61Receipt(receipt);if(!layout)return fail('STAGE61_LAYOUT_FIELDS_INVALID');
   const routeToken=token(),s={layout,scopeReceipt:receipt,webOutcome:'NOT_RUN',computerOutcome:'NOT_RUN',stopped:false,successReceiptDigest:null,approval:emptyCheckpoint(),screenConsent:emptyCheckpoint(),createdAt:now(),expiresAt:now()+ttlMs};
   states.set(routeToken,s);return view(routeToken,s);
  },
  plan({routeToken,action}={}){
   const s=get(routeToken);if(!s)return fail('STAGE61_ROUTE_STATE_NOT_FOUND');
   if(s.stopped)return fail('STAGE61_ROUTE_STATE_STOPPED');
   return Object.freeze({ok:true,...routeStage61({action,layout:s.layout,webOutcome:s.webOutcome,computerOutcome:s.computerOutcome}),routeToken,replayAllowed:false,automaticReplay:false});
  },
  phonePayload({routeToken,action,provider}={}){
   const s=get(routeToken);if(!s)return fail('STAGE61_ROUTE_STATE_NOT_FOUND');
   const planned=routeStage61({action,layout:s.layout,webOutcome:s.webOutcome,computerOutcome:s.computerOutcome});
   if(planned.provider!==provider||!planned.allowed)return fail('STAGE61_PROVIDER_NOT_AUTHORIZED');
   return Object.freeze({ok:true,stage61RouteSchema:STAGE61_ROUTE_SCHEMA,stage61Action:String(action||'').toUpperCase(),stage61WebOutcome:s.webOutcome,stage61ComputerOutcome:s.computerOutcome,routeToken,replayAllowed:false,automaticReplay:false});
  },
  /** Prevents a duplicate prompt or a status query for a different request. */
  controlPlan({routeToken,control,action,taskId,requestToken,grantToken}={}){
   const s=get(routeToken);if(!s)return fail('STAGE61_ROUTE_STATE_NOT_FOUND');
   if(s.stopped)return fail('STAGE61_ROUTE_STATE_STOPPED');
   control=String(control||'').toUpperCase();action=String(action||'').toUpperCase();
   if(!CONTROL.has(control))return fail('STAGE61_CONTROL_INVALID');
   if(!plannedComputer(s,action))return fail('STAGE61_COMPUTER_USE_NOT_AUTHORIZED');
   const td=taskDigest(taskId);
   if(control==='ACTION_APPROVAL_REQUEST'){
    if(!td)return fail('STAGE61_APPROVAL_TASK_REQUIRED');
    expireCheckpoint(s.approval);
    if(s.approval.state!=='NONE'){
     if(exactScope(s.approval,action,td)&&s.approval.state==='PENDING')return fail('STAGE61_APPROVAL_ALREADY_PENDING',{approval:publicCheckpoint(s.approval)});
     if(exactScope(s.approval,action,td)&&s.approval.state==='GRANT_READY')return fail('STAGE61_APPROVAL_GRANT_READY',{approval:publicCheckpoint(s.approval)});
     return fail('STAGE61_APPROVAL_CHECKPOINT_EXISTS_NO_REPEAT',{approval:publicCheckpoint(s.approval)});
    }
   }
   if(control==='ACTION_APPROVAL_STATUS'){
    const rd=tokenDigest(requestToken);
    if(!td)return fail('STAGE61_APPROVAL_TASK_REQUIRED');
    if(!rd)return fail('STAGE61_APPROVAL_REQUEST_TOKEN_REQUIRED');
    if(!['PENDING','GRANT_READY'].includes(s.approval.state))return fail('STAGE61_APPROVAL_STATUS_NOT_PENDING',{approval:publicCheckpoint(s.approval)});
    if(!exactScope(s.approval,action,td))return fail('STAGE61_APPROVAL_SCOPE_MISMATCH');
    if(s.approval.requestTokenDigest!==rd)return fail('STAGE61_APPROVAL_REQUEST_TOKEN_MISMATCH');
   }
   if(control==='SCREEN_CONSENT_REQUEST'){
    if(!td)return fail('STAGE61_SCREEN_CONSENT_TASK_REQUIRED');
    expireCheckpoint(s.screenConsent);
    if(s.screenConsent.state!=='NONE'){
     if(exactScope(s.screenConsent,action,td)&&s.screenConsent.state==='PENDING')return fail('STAGE61_SCREEN_CONSENT_ALREADY_PENDING',{screenConsent:publicCheckpoint(s.screenConsent)});
     if(exactScope(s.screenConsent,action,td)&&s.screenConsent.state==='GRANT_READY')return fail('STAGE61_SCREEN_CONSENT_GRANT_READY',{screenConsent:publicCheckpoint(s.screenConsent)});
     return fail('STAGE61_SCREEN_CONSENT_CHECKPOINT_EXISTS_NO_REPEAT',{screenConsent:publicCheckpoint(s.screenConsent)});
    }
   }
   if(control==='SCREEN_CONSENT_STATUS'){
    const rd=tokenDigest(requestToken);
    if(!td)return fail('STAGE61_SCREEN_CONSENT_TASK_REQUIRED');
    if(!rd)return fail('STAGE61_SCREEN_CONSENT_REQUEST_TOKEN_REQUIRED');
    if(!['PENDING','GRANT_READY'].includes(s.screenConsent.state))return fail('STAGE61_SCREEN_CONSENT_STATUS_NOT_PENDING',{screenConsent:publicCheckpoint(s.screenConsent)});
    if(!exactScope(s.screenConsent,action,td))return fail('STAGE61_SCREEN_CONSENT_SCOPE_MISMATCH');
    if(s.screenConsent.requestTokenDigest!==rd)return fail('STAGE61_SCREEN_CONSENT_REQUEST_TOKEN_MISMATCH');
   }
   if(control==='CAPTURE_FRAME'){
    expireCheckpoint(s.screenConsent);
    const gd=tokenDigest(grantToken);
    if(!td)return fail('STAGE61_SCREEN_CONSENT_TASK_REQUIRED');
    if(s.screenConsent.state!=='GRANT_READY')return fail('STAGE61_SCREEN_CONSENT_GRANT_REQUIRED',{screenConsent:publicCheckpoint(s.screenConsent)});
    if(!exactScope(s.screenConsent,action,td))return fail('STAGE61_SCREEN_CONSENT_SCOPE_MISMATCH');
    if(!gd||gd!==s.screenConsent.grantTokenDigest)return fail('STAGE61_SCREEN_CONSENT_GRANT_MISMATCH');
   }
   return Object.freeze({ok:true,control,action,taskDigest:td,requestTokenDigest:tokenDigest(requestToken),grantTokenDigest:tokenDigest(grantToken),replayAllowed:false,automaticReplay:false});
  },
  /** Checks a known one-shot action grant before PREPARE/EXECUTE; Android rechecks it again. */
  approvalUsePlan({routeToken,action,taskId,grantToken}={}){
   const s=get(routeToken);if(!s)return fail('STAGE61_ROUTE_STATE_NOT_FOUND');
   if(s.stopped)return fail('STAGE61_ROUTE_STATE_STOPPED');
   action=String(action||'').toUpperCase();
   if(!plannedComputer(s,action))return fail('STAGE61_COMPUTER_USE_NOT_AUTHORIZED');
   expireCheckpoint(s.approval);
   if(s.approval.state==='NONE')return Object.freeze({ok:true,approvalCheckpoint:false,replayAllowed:false,automaticReplay:false});
   if(s.approval.state==='PENDING')return fail('STAGE61_APPROVAL_PENDING_LOCAL_TAP',{approval:publicCheckpoint(s.approval)});
   if(s.approval.state!=='GRANT_READY')return fail('STAGE61_APPROVAL_NOT_REUSABLE',{approval:publicCheckpoint(s.approval)});
   const td=taskDigest(taskId),gd=tokenDigest(grantToken);
   if(!exactScope(s.approval,action,td))return fail('STAGE61_APPROVAL_SCOPE_MISMATCH');
   if(!gd||gd!==s.approval.grantTokenDigest)return fail('STAGE61_APPROVAL_GRANT_MISMATCH');
   return Object.freeze({ok:true,approvalCheckpoint:true,approval:publicCheckpoint(s.approval),replayAllowed:false,automaticReplay:false});
  },
  async recordControl({routeToken,control,originalReceiptRef,action,taskId,requestToken,grantToken}={}){
   const s=get(routeToken);if(!s)return fail('STAGE61_ROUTE_STATE_NOT_FOUND');
   if(s.stopped)return fail('STAGE61_ROUTE_STATE_STOPPED');
   control=String(control||'').toUpperCase();action=String(action||'').toUpperCase();
   if(!CONTROL.has(control))return fail('STAGE61_CONTROL_INVALID');
   if(!plannedComputer(s,action))return fail('STAGE61_COMPUTER_USE_NOT_AUTHORIZED');
   const td=taskDigest(taskId);
   if(!td)return fail(control.startsWith('SCREEN_')||control==='CAPTURE_FRAME'?'STAGE61_SCREEN_CONSENT_TASK_REQUIRED':'STAGE61_APPROVAL_TASK_REQUIRED');
   const result=await signed(originalReceiptRef);if(!result||typeof result!=='object')return fail('STAGE61_CONTROL_SIGNED_RESULT_MISSING');
   if(control==='ACTION_APPROVAL_REQUEST'){
    if(result.ok!==true||!validToken(result.requestToken)||!validHex64(result.actionDigest)||!validHex64(result.screenDigest))
     return fail(result?.code||'STAGE61_APPROVAL_REQUEST_RESULT_INVALID');
    if(!['local_action_approval_required','local_action_approval_already_pending'].includes(String(result.code)))
     return fail('STAGE61_APPROVAL_REQUEST_CODE_INVALID');
    s.approval={state:'PENDING',action,taskDigest:td,requestTokenDigest:tokenDigest(result.requestToken),grantTokenDigest:null,actionDigest:result.actionDigest,screenDigest:result.screenDigest,grantExpiresAt:null,lastCode:String(result.code)};
   }else if(control==='ACTION_APPROVAL_STATUS'){
    const rd=tokenDigest(requestToken);
    if(!exactScope(s.approval,action,td))return fail('STAGE61_APPROVAL_SCOPE_MISMATCH');
    if(!rd||s.approval.requestTokenDigest!==rd)return fail('STAGE61_APPROVAL_REQUEST_TOKEN_MISMATCH');
    const code=String(result.code||'');
    if(result.approved===true){
     if(!validToken(result.grantToken)||!validExpiry(result.grantExpiresAt))return fail('STAGE61_APPROVAL_GRANT_RESULT_INVALID');
     s.approval.state='GRANT_READY';s.approval.grantTokenDigest=tokenDigest(result.grantToken);s.approval.grantExpiresAt=result.grantExpiresAt;s.approval.lastCode=code||'action_approval_grant_ready';
    }else if(code==='action_approval_pending_local_tap'){
     s.approval.state='PENDING';s.approval.lastCode=code;
    }else{
     s.approval.state=code.includes('expired')?'EXPIRED':'DENIED';s.approval.grantTokenDigest=null;s.approval.lastCode=code||'action_approval_closed';
    }
   }else if(control==='SCREEN_CONSENT_REQUEST'){
    if(result.ok!==true||!validToken(result.requestToken))return fail(result?.code||'STAGE61_SCREEN_CONSENT_REQUEST_RESULT_INVALID');
    s.screenConsent={state:'PENDING',action,taskDigest:td,requestTokenDigest:tokenDigest(result.requestToken),grantTokenDigest:null,actionDigest:null,screenDigest:null,grantExpiresAt:null,lastCode:String(result.code||'screen_consent_required')};
   }else if(control==='SCREEN_CONSENT_STATUS'){
    const rd=tokenDigest(requestToken);
    if(!exactScope(s.screenConsent,action,td))return fail('STAGE61_SCREEN_CONSENT_SCOPE_MISMATCH');
    if(!rd||s.screenConsent.requestTokenDigest!==rd)return fail('STAGE61_SCREEN_CONSENT_REQUEST_TOKEN_MISMATCH');
    const code=String(result.code||'');
    if(result.approved===true){
     if(!validToken(result.grantToken))return fail('STAGE61_SCREEN_CONSENT_GRANT_RESULT_INVALID');
     s.screenConsent.state='GRANT_READY';s.screenConsent.grantTokenDigest=tokenDigest(result.grantToken);s.screenConsent.grantExpiresAt=Number.isSafeInteger(result.grantExpiresAt)?result.grantExpiresAt:now()+ttlMs;s.screenConsent.lastCode=code||'screen_consent_grant_ready';
    }else if(code==='screen_consent_pending_local_tap'){
     s.screenConsent.state='PENDING';s.screenConsent.lastCode=code;
    }else{
     s.screenConsent.state=code.includes('expired')?'EXPIRED':'DENIED';s.screenConsent.grantTokenDigest=null;s.screenConsent.lastCode=code||'screen_consent_closed';
    }
   }else if(control==='CAPTURE_FRAME'){
    if(result.ok!==true)return fail(result?.code||'STAGE61_CAPTURE_RESULT_INVALID');
    if(!exactScope(s.screenConsent,action,td))return fail('STAGE61_SCREEN_CONSENT_SCOPE_MISMATCH');
    if(s.screenConsent.state==='GRANT_READY'&&tokenDigest(grantToken)!==s.screenConsent.grantTokenDigest)
     return fail('STAGE61_SCREEN_CONSENT_GRANT_MISMATCH');
   }
   s.expiresAt=now()+ttlMs;
   return Object.freeze({...view(routeToken,s),control,controlCode:String(result.code||'ok')});
  },
  async recordVerifiedPreDispatchNoEffect({routeToken,originalReceiptRef,expectedProvider,expectedAction}={}){
   const s=get(routeToken);if(!s)return fail('STAGE61_ROUTE_STATE_NOT_FOUND');
   if(s.stopped)return fail('STAGE61_ROUTE_STATE_STOPPED');
   if(!['ANDROID_WEB','ANDROID_COMPUTER_USE'].includes(expectedProvider))
    return fail('STAGE61_NO_EFFECT_PROVIDER_INVALID');
   const result=await signed(originalReceiptRef);
   const rv=result?.resultVerification;
   const exact=!!result&&result.ok===false&&result.code==='OWNER_ADMISSION_BLOCKED'&&
    result.executed===false&&result.duplicate===false&&result.resultVerified===false&&
    result.externalEffectVerified===false&&rv?.status==='OWNER_ADMISSION_BLOCKED'&&
    rv.verified===false&&rv.effectConfirmed===false&&rv.duplicate===false&&
    rv.executed===false&&rv.state==='FAILED_PRE_DISPATCH'&&
    rv.reason==='owner_admission_rejected_no_dispatch'&&
    typeof rv.executionId==='string'&&rv.executionId.length>8;
   if(!exact)return fail('STAGE61_SIGNED_PREDISPATCH_NO_EFFECT_REQUIRED');
   if(expectedProvider==='ANDROID_WEB')s.webOutcome='FAILED_NO_EFFECT';
   else s.computerOutcome='FAILED_NO_EFFECT';
   s.expiresAt=now()+ttlMs;
   return Object.freeze({...view(routeToken,s),recordedOutcome:'FAILED_NO_EFFECT',
    receiptDigest:hash('stage61-predispatch-noeffect|'+expectedProvider+'|'+
      String(expectedAction||'').toUpperCase()+'|'+rv.executionId),
    verifiedPreDispatchNoEffect:true});
  },
  async record({routeToken,originalReceiptRef,expectedProvider,expectedAction,terminal=true}={}){
   const s=get(routeToken);if(!s)return fail('STAGE61_ROUTE_STATE_NOT_FOUND');
   if(s.stopped)return fail('STAGE61_ROUTE_STATE_STOPPED');
   const result=await signed(originalReceiptRef),receipt=result?.stage61Router;
   const verified=verifyStage61Receipt(receipt,{provider:expectedProvider,action:expectedAction});
   if(!verified.ok)return fail(verified.code);
   if(!sameScope(receipt,s.scopeReceipt))return fail('STAGE61_SCOPE_CHANGED_NO_REPLAY');
   if(terminal&&FINAL.has(receipt.outcome)){
    if(expectedProvider==='ANDROID_WEB')s.webOutcome=receipt.outcome;
    if(expectedProvider==='ANDROID_COMPUTER_USE')s.computerOutcome=receipt.outcome;
   }
   if(expectedProvider==='ANDROID_COMPUTER_USE'&&result?.approvalConsumed===true){
    s.approval.state='CONSUMED';s.approval.grantTokenDigest=null;s.approval.lastCode='action_approval_consumed_once';
   }
   if(receipt.outcome==='VERIFIED_PASS')s.successReceiptDigest=verified.receiptDigest;
   if(STOP.has(receipt.outcome))s.stopped=true;
   s.expiresAt=now()+ttlMs;
   return Object.freeze({...view(routeToken,s),recordedOutcome:receipt.outcome,receiptDigest:verified.receiptDigest});
  },
  status({routeToken}={}){const s=get(routeToken);return s?view(routeToken,s):fail('STAGE61_ROUTE_STATE_NOT_FOUND');},
  discard({routeToken}={}){const existed=states.delete(routeToken);return Object.freeze({ok:existed,code:existed?'STAGE61_ROUTE_STATE_DISCARDED':'STAGE61_ROUTE_STATE_NOT_FOUND',replayAllowed:false,automaticReplay:false});}
 });
}