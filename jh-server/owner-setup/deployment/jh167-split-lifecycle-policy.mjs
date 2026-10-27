/** Narrow durable admission for JH split-screen context lifecycle only.
 * Not a device permission, authentication, grant, or retry mechanism.
 * The existing Secure56 signed device route and local approval rules still apply.
 */
const TYPES=new Map([
 ['split_screen_session_save_analysis','SAVE_ANALYSIS'],
 ['split_screen_session_finish','FINISH']
]);
const hex64=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const item=s=>typeof s==='string'&&/^item_[a-f0-9]{16}$/.test(s);
const denied=()=>Object.freeze({kind:'DENY',code:'DURABLE_EXACT_SPLIT_LIFECYCLE_SCOPE_REQUIRED'});
const allowed=(contextId,transition)=>Object.freeze({
 kind:'JOURNAL',
 // A fresh command, changed summary or new nonce must not evade an unknown
 // earlier operation on the same device + session context + transition.
 identityPayload:{contextId,transition},
 approvalGranted:false,screenConsentGranted:false
});
export function classifySplitLifecycleJob(job,payload){
 const transition=TYPES.get(job?.type);
 if(!transition)return null;
 if(!job||!payload||typeof payload!=='object'||Array.isArray(payload))return denied();
 const save=transition==='SAVE_ANALYSIS';
 const fields=new Set([
  'contextId','mcpToolName','secureRequestedEffect','taskDigest',
  'targetDeviceDigest','secureInvocationExpiresAt','containsCredential',
  'dataClass','commandId',...(save?
   ['summaryText','comparisonText','comparedItemRefs','recommendedItemRef','goal']:
   ['reason'])
 ]);
 const now=Date.now();
 if(job.mcpToolName!=='life_android_execute_computer_action'||
    job.secureRequestedEffect!=='REVERSIBLE_WRITE'||
    payload.mcpToolName!==job.mcpToolName||
    payload.secureRequestedEffect!==job.secureRequestedEffect||
    payload.containsCredential!==false||
    payload.dataClass!=='NON_SENSITIVE'||
    typeof job.secureSessionId!=='string'||!job.secureSessionId||
    typeof job.targetDeviceId!=='string'||!job.targetDeviceId||
    !/^[a-f0-9]{32}$/.test(job.commandId||'')||
    payload.commandId!==job.commandId||
    !hex64(payload.taskDigest)||!hex64(payload.targetDeviceDigest)||
    !Number.isSafeInteger(payload.secureInvocationExpiresAt)||
    payload.secureInvocationExpiresAt<=now||
    payload.secureInvocationExpiresAt>now+180000||
    !Object.keys(payload).every(k=>fields.has(k))||
    !/^ssc_[a-f0-9]{32}$/.test(payload.contextId||''))return denied();

 if(!save){
  return typeof payload.reason==='string'&&payload.reason.length<=80?
   allowed(payload.contextId,transition):denied();
 }
 const refs=payload.comparedItemRefs;
 if(typeof payload.summaryText!=='string'||
    !payload.summaryText.trim()||payload.summaryText.length>4000||
    (payload.comparisonText!==undefined&&
     (typeof payload.comparisonText!=='string'||!payload.comparisonText.trim()||
      payload.comparisonText.length>4000))||
    !Array.isArray(refs)||refs.length>20||!refs.every(item)||
    new Set(refs).size!==refs.length||
    !(payload.recommendedItemRef===''||item(payload.recommendedItemRef))||
    (payload.goal!==undefined&&
     (typeof payload.goal!=='string'||payload.goal.length>2000)))
   return denied();
 return allowed(payload.contextId,transition);
}
