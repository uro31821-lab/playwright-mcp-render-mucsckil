/**
 * JH168 one-read-only-status wait decision. Source-only function; no timers,
 * phone action, Browser or approval. The caller must validate signed Secure56
 * owner STATUS and scope before invoking this function.
 */
export function evaluateSignedMobile13Condition56({contextId,expectedText,observation,nowMs=Date.now()}={}){
 const reject=(code,rest={})=>({ok:false,code,conditionVerified:false,automaticReplay:false,...rest});
 if(typeof contextId!=='string'||!/^ssc_[a-f0-9]{32}$/.test(contextId))
  return reject('MOBILE_WAIT_CONTEXT_INVALID');
 if(typeof expectedText!=='string'||!expectedText.trim()||expectedText.length>160||
    /[\x00-\x1f\x7f]/.test(expectedText))return reject('MOBILE_WAIT_EXPECTED_TEXT_REQUIRED');
 if(!Number.isSafeInteger(nowMs)||nowMs<=0)return reject('MOBILE_WAIT_CLOCK_INVALID');
 if(!observation||typeof observation!=='object'||Array.isArray(observation)||
    observation.ok!==true||observation.automaticReplay===true)
  return reject('MOBILE_WAIT_STATUS_UNVERIFIED');
 // A device-reported success flag alone cannot prove signed owner readback.
 if(observation.contextId!==contextId||
    (observation.scopeVerified!==true&&observation.resultVerified!==true))
  return reject('MOBILE_WAIT_SCOPE_UNVERIFIED');
 const p=observation.splitScreen;
 if(observation.splitScreenRequired!==true||!p||
    p.kind!=='split_screen_evidence'||p.version!=='1'||p.verified!=='true'||
    p.layout!=='LEFT_RIGHT'||typeof p.workPackage!=='string'||
    p.workPackage.length>180||typeof p.workWindowId!=='string'||
    !/^\d{1,10}$/.test(p.workWindowId)||p.workWindowId===p.chatWindowId)
  return reject('MOBILE_WAIT_SCREEN_PROOF_INVALID');
 if(typeof p.observedAtMs!=='string'||!/^\d{10,16}$/.test(p.observedAtMs))
  return reject('MOBILE_WAIT_SCREEN_PROOF_STALE');
 const observedAtMs=Number(p.observedAtMs);
 if(!Number.isSafeInteger(observedAtMs)||observedAtMs>nowMs+5000||
    nowMs-observedAtMs>45000)return reject('MOBILE_WAIT_SCREEN_PROOF_STALE');
 const rows=observation.resultScreen;
 if(!Array.isArray(rows)||rows.length>4096)return reject('MOBILE_WAIT_ROWS_UNVERIFIED');
 const witness=rows.filter(r=>r&&r.kind==='split_screen_evidence');
 if(witness.length!==1)return reject('MOBILE_WAIT_ROW_PROOF_MISSING');
 for(const key of ['version','verified','layout','chatPackage','chatKind',
  'chatWindowId','chatBounds','workPackage','workWindowId','workBounds']){
  if(witness[0][key]!==p[key])return reject('MOBILE_WAIT_ROW_PROOF_CHANGED');
 }
 const rowAt=Number(witness[0].observedAtMs);
 if(!Number.isSafeInteger(rowAt)||rowAt>observedAtMs||observedAtMs-rowAt>5000)
  return reject('MOBILE_WAIT_ROW_PROOF_STALE');
 let found=false;
 for(const r of rows){
  if(!r||typeof r!=='object'||Array.isArray(r))return reject('MOBILE_WAIT_ROWS_UNVERIFIED');
  if(r.kind==='split_screen_evidence')continue;
  if(r.package!==p.workPackage||String(r.windowId)!==p.workWindowId)
   return reject('MOBILE_WAIT_ROW_WINDOW_MISMATCH');
  for(const field of ['text','label','contentDescription'])
   if(typeof r[field]==='string'&&r[field].trim()===expectedText.trim())found=true;
 }
 // Exact text only. "NOT READY" must never satisfy expectedText="READY".
 return found?{ok:true,code:'MOBILE_WAIT_CONDITION_CONFIRMED',
  conditionVerified:true,automaticReplay:false,observedAtMs,workWindowId:p.workWindowId}:
  reject('MOBILE_WAIT_CONDITION_NOT_MET',{observedAtMs});
}
export function signedMobileWaitConditionSource56(){
 return '\n  const jhMobile13EvaluateCondition56='+
  evaluateSignedMobile13Condition56.toString()+';\n';
}
