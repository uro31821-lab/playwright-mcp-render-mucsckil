import {randomBytes} from 'node:crypto';
import {layoutFromStage61Receipt,nextStage61Request,routeStage61,verifyStage61Receipt,STAGE61_ROUTE_SCHEMA} from './stage61-right-pane-router.mjs';

const FINAL=new Set(['VERIFIED_PASS','VERIFIED_UNSUPPORTED_NO_EFFECT','FAILED_NO_EFFECT','FAILED_AFTER_EFFECT','UNKNOWN','PENDING','PHONE_SCOPED_SITE_DISCARD']);
const STOP=new Set(['VERIFIED_PASS','FAILED_AFTER_EFFECT','UNKNOWN','PENDING','PHONE_SCOPED_SITE_DISCARD']);
const token=()=>`s61_${randomBytes(18).toString('base64url')}`;
const now=()=>Date.now();
const fail=code=>Object.freeze({ok:false,code,replayAllowed:false,automaticReplay:false});

/**
 * Host-side Stage61 state. `readOriginalSignedResult` MUST resolve an opaque
 * original Secure56 completion reference. User JSON, booleans and copied
 * receipts are never trusted input to this object.
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
 function view(routeToken,s){return Object.freeze({ok:true,routeToken,expiresAt:s.expiresAt,layout:s.layout,webOutcome:s.webOutcome,computerOutcome:s.computerOutcome,stopped:s.stopped,successReceiptDigest:s.successReceiptDigest,replayAllowed:false,automaticReplay:false});}
 return Object.freeze({
  async begin({originalReceiptRef}={}){
   purge();if(states.size>=maxStates)return fail('STAGE61_ROUTE_STATE_CAPACITY');
   const result=await signed(originalReceiptRef),receipt=result?.stage61Router;
   const verified=verifyStage61Receipt(receipt,{provider:'ANDROID_WEB',action:'SNAPSHOT'});
   if(!verified.ok||receipt.outcome!=='READ_ONLY_VERIFIED')return fail(verified.ok?'STAGE61_INITIAL_READ_REQUIRED':verified.code);
   const layout=layoutFromStage61Receipt(receipt);if(!layout)return fail('STAGE61_LAYOUT_FIELDS_INVALID');
   const routeToken=token(),s={layout,scopeReceipt:receipt,webOutcome:'NOT_RUN',computerOutcome:'NOT_RUN',stopped:false,successReceiptDigest:null,createdAt:now(),expiresAt:now()+ttlMs};
   states.set(routeToken,s);return view(routeToken,s);
  },
  plan({routeToken,action,playwrightMobileAvailable=false}={}){
   const s=get(routeToken);if(!s)return fail('STAGE61_ROUTE_STATE_NOT_FOUND');
   if(s.stopped)return fail('STAGE61_ROUTE_STATE_STOPPED');
   return Object.freeze({ok:true,...routeStage61({action,layout:s.layout,webOutcome:s.webOutcome,computerOutcome:s.computerOutcome,playwrightMobileAvailable}),routeToken,replayAllowed:false,automaticReplay:false});
  },
  phonePayload({routeToken,action,provider}={}){
   const s=get(routeToken);if(!s)return fail('STAGE61_ROUTE_STATE_NOT_FOUND');
   const planned=routeStage61({action,layout:s.layout,webOutcome:s.webOutcome,computerOutcome:s.computerOutcome,playwrightMobileAvailable:provider==='PLAYWRIGHT_MOBILE'});
   if(planned.provider!==provider||!planned.allowed&&provider!=='PLAYWRIGHT_MOBILE')return fail('STAGE61_PROVIDER_NOT_AUTHORIZED');
   return Object.freeze({ok:true,stage61RouteSchema:STAGE61_ROUTE_SCHEMA,stage61Action:String(action||'').toUpperCase(),stage61WebOutcome:s.webOutcome,stage61ComputerOutcome:s.computerOutcome,stage61PlaywrightMobileAvailable:provider==='PLAYWRIGHT_MOBILE',routeToken,replayAllowed:false,automaticReplay:false});
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
   if(receipt.outcome==='VERIFIED_PASS')s.successReceiptDigest=verified.receiptDigest;
   if(STOP.has(receipt.outcome))s.stopped=true;
   s.expiresAt=now()+ttlMs;
   return Object.freeze({...view(routeToken,s),recordedOutcome:receipt.outcome,receiptDigest:verified.receiptDigest});
  },
  status({routeToken}={}){const s=get(routeToken);return s?view(routeToken,s):fail('STAGE61_ROUTE_STATE_NOT_FOUND');},
  discard({routeToken}={}){const existed=states.delete(routeToken);return Object.freeze({ok:existed,code:existed?'STAGE61_ROUTE_STATE_DISCARDED':'STAGE61_ROUTE_STATE_NOT_FOUND',replayAllowed:false,automaticReplay:false});}
 });
}
