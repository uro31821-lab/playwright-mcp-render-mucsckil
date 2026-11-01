/**
 * JH168 one-read-only-status wait decision. Source-only function; no timers,
 * phone action, Browser or approval. The caller must obtain this observation
 * through the ORIGINAL signed Secure56 STATUS helper and retain its command
 * binding. This predicate is not a signature verifier or a new authority.
 *
 * Stage27 STATUS returned the stored context's items even after checking a
 * newer screen. Only the additive statusReadbackVersion=1 producer updates
 * that same context from verifyCurrent.currentScreen before serializing it.
 * A recent pair proof or a device success flag cannot upgrade the old shape.
 */
export function evaluateSignedMobile13Condition56({contextId,expectedText,observation,
 requestStartedAtMs,nowMs=Date.now()}={}){
 const reject=(code,rest={})=>({ok:false,code,conditionVerified:false,automaticReplay:false,...rest});
 const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
 const has=(v,keys)=>object(v)&&keys.every(key=>Object.hasOwn(v,key));
 const id=v=>Number.isSafeInteger(v)&&v>=0&&v<=2147483647;
 const wireId=v=>typeof v==='string'&&/^(?:0|[1-9]\d{0,9})$/.test(v)&&id(Number(v));
 if(typeof contextId!=='string'||!/^ssc_[a-f0-9]{32}$/.test(contextId))
  return reject('MOBILE_WAIT_CONTEXT_INVALID');
 if(typeof expectedText!=='string'||!expectedText.trim()||expectedText.length>160||
    /[\x00-\x1f\x7f]/.test(expectedText))return reject('MOBILE_WAIT_EXPECTED_TEXT_REQUIRED');
 if(!Number.isSafeInteger(nowMs)||nowMs<=0||!Number.isSafeInteger(requestStartedAtMs)||
    requestStartedAtMs<=0||requestStartedAtMs>nowMs||nowMs-requestStartedAtMs>45000)
  return reject('MOBILE_WAIT_CLOCK_INVALID');
 if(!has(observation,['ok','code','state','automaticReplay','manualStepPending'])||
    observation.ok!==true||observation.code!=='ready'||observation.state!=='ACTIVE'||
    observation.automaticReplay!==false||observation.manualStepPending!==false)
  return reject('MOBILE_WAIT_STATUS_UNVERIFIED');
 if(!Object.hasOwn(observation,'contextId')||observation.contextId!==contextId)
  return reject('MOBILE_WAIT_SCOPE_UNVERIFIED');
 if(!Object.hasOwn(observation,'statusReadbackVersion')||observation.statusReadbackVersion!==1)
  return reject('MOBILE_WAIT_FRESH_STATUS_REQUIRED');
 const p=observation.splitScreen;
 if(!has(observation,['splitScreenRequired','splitScreen'])||
    observation.splitScreenRequired!==true||!has(p,['kind','version','verified','layout',
      'chatPackage','chatKind','chatWindowId','chatBounds','workPackage','workWindowId','workBounds'])||
    p.kind!=='split_screen_evidence'||p.version!=='1'||p.verified!=='true'||
    p.layout!=='LEFT_RIGHT'||p.workPackage!=='com.android.chrome'||
    !wireId(p.workWindowId)||!wireId(p.chatWindowId)||p.workWindowId===p.chatWindowId||
    !((p.chatPackage==='com.openai.chatgpt'&&p.chatKind==='NATIVE')||
      (p.chatPackage==='com.android.chrome'&&p.chatKind==='BROWSER_VERIFIED')))
  return reject('MOBILE_WAIT_SCREEN_PROOF_INVALID');
 const rect=value=>{
  if(typeof value!=='string'||!/^\d+,\d+,\d+,\d+$/.test(value))return null;
  const n=value.split(',').map(Number);
  return n.every(v=>Number.isSafeInteger(v)&&v>=0&&v<=100000)&&
   n[2]-n[0]>=100&&n[3]-n[1]>=100?n:null;
 };
 const chat=rect(p.chatBounds),work=rect(p.workBounds);
 if(!chat||!work||work[0]<chat[2]||Math.min(chat[3],work[3])-Math.max(chat[1],work[1])<100)
  return reject('MOBILE_WAIT_SCREEN_PROOF_INVALID');
 if(!has(p,['chatDisplayId','workDisplayId','displayId','displayVerified'])||
    !wireId(p.chatDisplayId)||!wireId(p.workDisplayId)||!wireId(p.displayId)||
    p.chatDisplayId!==p.workDisplayId||p.displayId!==p.workDisplayId||p.displayVerified!=='true')
  return reject('MOBILE_WAIT_DISPLAY_UNVERIFIED');
 if(!Object.hasOwn(p,'observedAtMs')||typeof p.observedAtMs!=='string'||!/^\d{10,16}$/.test(p.observedAtMs))
  return reject('MOBILE_WAIT_SCREEN_PROOF_STALE');
 const observedAtMs=Number(p.observedAtMs);
 if(!Number.isSafeInteger(observedAtMs)||observedAtMs>nowMs+5000||
    observedAtMs<requestStartedAtMs||nowMs-observedAtMs>45000)
  return reject('MOBILE_WAIT_SCREEN_PROOF_STALE');
 const layout=observation.layout;
 if(!has(observation,['packageName','windowId','displayId','layout','capturedAt'])||
    !has(layout,['arrangement','chatPackage','chatWindowId','chatDisplayId',
      'workPackage','workWindowId','workDisplayId'])||layout.arrangement!=='LEFT_RIGHT'||
    layout.chatPackage!==p.chatPackage||layout.workPackage!==p.workPackage||
    observation.packageName!==p.workPackage||
    !id(layout.chatWindowId)||String(layout.chatWindowId)!==p.chatWindowId||
    !id(layout.workWindowId)||String(layout.workWindowId)!==p.workWindowId||
    !id(observation.windowId)||observation.windowId!==layout.workWindowId||
    !id(layout.chatDisplayId)||String(layout.chatDisplayId)!==p.chatDisplayId||
    !id(layout.workDisplayId)||String(layout.workDisplayId)!==p.workDisplayId||
    !id(observation.displayId)||observation.displayId!==layout.workDisplayId)
  return reject('MOBILE_WAIT_CONTEXT_SCREEN_MISMATCH');
 const capturedAt=observation.capturedAt;
 if(!Number.isSafeInteger(capturedAt)||capturedAt<requestStartedAtMs||
    capturedAt>observedAtMs||observedAtMs-capturedAt>5000)
  return reject('MOBILE_WAIT_CONTEXT_SCREEN_STALE');
 const items=observation.items;
 if(!Object.hasOwn(observation,'items')||!Array.isArray(items)||items.length<1||items.length>140)
  return reject('MOBILE_WAIT_ITEMS_UNVERIFIED');
 const refs=new Set();
 let found=false;
 for(const item of items){
  if(!has(item,['itemRef','label'])||typeof item.itemRef!=='string'||
     !/^item_[a-f0-9]{16}$/.test(item.itemRef)||refs.has(item.itemRef)||
     typeof item.label!=='string'||item.label.length<1||item.label.length>260)
   return reject('MOBILE_WAIT_ITEMS_UNVERIFIED');
  refs.add(item.itemRef);
  if(item.label.trim()===expectedText.trim())found=true;
 }
 // Exact text only. "NOT READY" must never satisfy expectedText="READY".
 return found?{ok:true,code:'MOBILE_WAIT_CONDITION_CONFIRMED',
  conditionVerified:true,automaticReplay:false,observedAtMs,capturedAt,
  workWindowId:p.workWindowId,displayId:p.workDisplayId}:
  reject('MOBILE_WAIT_CONDITION_NOT_MET',{observedAtMs});
}
export function signedMobileWaitConditionSource56(){
 return '\n  const jhMobile13EvaluateCondition56='+
  evaluateSignedMobile13Condition56.toString()+';\n';
}
