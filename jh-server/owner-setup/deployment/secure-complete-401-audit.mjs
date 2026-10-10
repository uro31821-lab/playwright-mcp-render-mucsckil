/** Read-only categorization of an already-denied Secure56 completion.
 * Not an authorization oracle: never accepts, retries, consumes a nonce, or reads body.
 * Sends only fixed categorical labels, not job IDs, device labels, nonce, MAC or payload.
 */
const causes=[
 ['sessionAbsent','active_secure_session_absent'],
 ['jobSessionMismatch','job_secure_session_mismatch'],
 ['activeSessionMismatch','active_secure_session_mismatch'],
 ['deviceMismatch','secure_device_digest_mismatch'],
 ['bodyMismatch','result_body_digest_mismatch'],
 ['nonceInvalid','completion_nonce_format_invalid'],
 ['expired','completion_expired'],
 ['tooFar','completion_expiry_out_of_range'],
 ['signatureMismatch','completion_signature_mismatch'],
 ['nonceReplayed','completion_nonce_replayed']
];
export function classifyCompletionRejection(facts){
 if(!facts||typeof facts!=='object'||Array.isArray(facts))return 'completion_reason_unclassified';
 for(const [field,label] of causes){if(facts[field]===true)return label}
 return 'completion_reason_unclassified';
}
export function makeCompletionRejectionAudit({
 sink=x=>console.log('JH_COMPLETE_AUTH_REJECT '+JSON.stringify(x)),
 now=Date.now,limit=24,windowMs=60000}={}){
 if(!Number.isInteger(limit)||limit<1||limit>120||!Number.isInteger(windowMs)||windowMs<1000)
  throw Error('COMPLETE_AUDIT_CONFIG_INVALID');
 let windowStart=now(),count=0,suppressed=0;
 const startedAtUtc=new Date(windowStart).toISOString();
 const totals=Object.create(null);let total=0,lastReason=null,lastAtUtc=null;
 const observer=facts=>{
  try{
   const stamp=now();if(!Number.isFinite(stamp))return;
   const reason=classifyCompletionRejection(facts);
   total=Math.min(1000000000,total+1);
   totals[reason]=Math.min(1000000000,(totals[reason]||0)+1);
   lastReason=reason;lastAtUtc=new Date(stamp).toISOString();
   if(stamp<windowStart||stamp-windowStart>=windowMs){windowStart=stamp;count=0}
   if(count>=limit){suppressed=Math.min(1000000,suppressed+1);return}
   count++;
   sink(Object.freeze({schema:1,event:'complete_401_reason',atUtc:lastAtUtc,
    reason,suppressedSinceLastRecord:suppressed}));
   suppressed=0;
  }catch{/* diagnostics must not affect the already-rejected request */}
 };
 Object.defineProperty(observer,'summary',{value:()=>Object.freeze({
  schema:1,scope:'current_server_process_only',startedAtUtc,
  total,byReason:Object.freeze(Object.fromEntries([...causes.map(([,label])=>label),'completion_reason_unclassified'].map(k=>[k,totals[k]||0]))),
  lastReason,lastAtUtc,persisted:false,historicalCauseKnown:false,
  automaticRetryEnabled:false
 })});
 return observer;
}
export const auditSecureCompletionRejection=makeCompletionRejectionAudit();
export const getSecureCompletion401Summary=()=>auditSecureCompletionRejection.summary();
