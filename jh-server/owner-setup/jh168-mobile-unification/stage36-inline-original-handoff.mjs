/**
 * Stage36 — attach the already-authorized Stage35 opaque reference to the
 * ORIGINAL, screen-verified Stage155 FOLLOW_UP result. Never issues a command.
 *
 * Stage:
 * - after original phone signed completion and original Stage155 proof
 * - original Stage35 host issues the handle for the exact same completed job
 * - store only in a per-response WeakMap, not in SQLite/logs or global cache
 *
 * Finish:
 * - AFTER runProtectedJHAction verifies the same original screen evidence
 * - include handle only in this existing successful MCP result
 * - no duplicate, failed, stale, expired or not-executed result can expose it
 *
 * Nothing here is a new approval, bearer authorization, replay or UI proof.
 */
const ROUTE='life_android_original_completion_handle_status';
const PREFIX='s35_v1_';
const safeHandle=h=>typeof h==='string'&&
 h.length>=50&&h.length<=1800&&
 h.startsWith(PREFIX)&&/^[A-Za-z0-9_-]+$/.test(h.slice(PREFIX.length));
const safeNow=clock=>{
 try{const t=clock();return Number.isSafeInteger(t)&&t>0?t:null}catch{return null}
};
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export function createStage36InlineOriginalHandoff({clock=Date.now}={}){
 if(typeof clock!=='function')throw Error('STAGE36_CLOCK_REQUIRED');
 const privateHandoff=new WeakMap();
 const alreadyIssued=new WeakSet();
 function stage({receipt,deviceResult,scope,issue}={}){
  if(!object(receipt)||!object(deviceResult)||!object(scope)||
     typeof issue!=='function')return false;
  if(scope.type!=='split_screen_session_followup'||
     scope.effect!=='REVERSIBLE_WRITE'||
     scope.tool!=='life_android_execute_computer_action'||
     scope.action!=='CLICK'||scope.jobStatus!=='complete'||
     typeof scope.originalJobId!=='string'||!/^job_[0-9]+$/.test(scope.originalJobId)||
     typeof scope.currentCommandId!=='string'||!/^[a-f0-9]{32}$/.test(scope.currentCommandId)||
     scope.originalCommandId!==scope.currentCommandId||
     typeof scope.deviceId!=='string'||!scope.deviceId||
     typeof scope.originalDeviceId!=='string'||scope.originalDeviceId!==scope.deviceId||
     typeof scope.deviceDigest!=='string'||!/^[a-f0-9]{64}$/.test(scope.deviceDigest)||
     scope.originalDeviceDigest!==scope.deviceDigest||
     typeof scope.originalSessionId!=='string'||!scope.originalSessionId||
     scope.currentSessionId!==scope.originalSessionId||
     scope.originalAction!=='CLICK'||
     deviceResult.ok!==true||deviceResult.resultVerified!==true)
   return false;
  if(alreadyIssued.has(receipt))return false; // one issue for this result lifetime
  const now=safeNow(clock);
  if(now===null)return false;
  let result;
  try{result=issue()}catch{return false}
  if(result?.ok!==true||
     result.code!=='STAGE35_SEALED_ORIGINAL_REFERENCE_ISSUED'||
     result.sealedHandleIssued!==true||
     result.expiresAtNotExtended!==true||
     result.taskSuccessVerified!==false||
     result.uiTransitionVerified!==false||
     result.automaticReplay!==false||
     !safeHandle(result.sealedHandle)||
     !Number.isSafeInteger(result.expiresAtMs)||result.expiresAtMs<=now)
   return false;
  privateHandoff.set(receipt,Object.freeze({
   sealed_handle:result.sealedHandle,
   expires_at_ms:result.expiresAtMs,
   read_tool:ROUTE,
   receipt_scope:'ORIGINAL_SIGNED_DEVICE_RESULT_RECEIVED',
   ui_transition_verified_by_handle:false,
   task_success_verified_by_handle:false,
   new_job_created:false,
   original_job_reexecuted:false,
   automatic_replay:false
  }));
  alreadyIssued.add(receipt);
  return true;
 }
 function finish({receipt,verified}={}){
  if(!object(receipt)||!object(verified))return null;
  const candidate=privateHandoff.get(receipt);
  if(!candidate)return null;
  // Consume at most once. Even a duplicate read of the same result won't
  // cause a new issue, a replay, or another bearer-like handoff.
  privateHandoff.delete(receipt);
  const now=safeNow(clock);
  if(now===null||now>=candidate.expires_at_ms||
     receipt.ok!==true||receipt.resultVerified!==true||
     verified.verified!==true||verified.executed!==true||
     verified.duplicate===true)
   return null;
  return candidate;
 }
 return Object.freeze({stage,finish,readTool:ROUTE,
  automaticReplay:false,noAndroidAction:true,
  ephemeralOnly:true,noPersistentHandleStorage:true});
}
