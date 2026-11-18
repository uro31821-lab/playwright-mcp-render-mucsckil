/**
 * G3 / STAB-03 — NO-IO read-only structural validator for supplied host traces.
 * This is NOT the JH router, does not execute tools, and does not prove
 * authenticity of the event source or external side effects.
 * Excludes prompt text, photos, secrets, locations, approval and device data.
 */
const states = new Set(['completed','blocked','not_used']);
const events = new Set(['route_plan','feature_result','response_check','visible_delivery']);
const own = (x,k) => Object.prototype.hasOwnProperty.call(x,k);
const valid = s => typeof s === 'string' && s.length > 0 && s.length <= 120 && /^[A-Za-z0-9._:-]+$/.test(s);
const bad = code => ({status:'BLOCKED',reason:code,hostE2EProven:false,externalSuccessProven:false});
const unchanged = code => ({status:'UNOBSERVED',reason:code,hostE2EProven:false,externalSuccessProven:false});

export function inspectG3HostTrace(trace) {
  if (trace == null) return unchanged('HOST_TRACE_NOT_AVAILABLE');
  if (typeof trace !== 'object' || Array.isArray(trace)) return bad('INVALID_TRACE');
  const allow = new Set(['schema','binding','observations','plannedFeatures','returnedFeatures','responseCheck','redaction']);
  if (Object.keys(trace).some(k => !allow.has(k))) return bad('UNEXPECTED_TRACE_FIELD');
  if (trace.schema !== 'jh.g3.host-readback.v1' || trace.redaction !== 'NO_PRIVATE_PAYLOAD') return bad('BAD_TRACE_CONTRACT');
  const b=trace.binding;
  if (!b || !valid(b.sourceRef) || !valid(b.threadId) || (b.taskId !== null && !valid(b.taskId))
      || (b.conditionRevision !== null
          && (!Number.isSafeInteger(b.conditionRevision) || b.conditionRevision < 0))
      || Object.keys(b).some(k=>!['sourceRef','threadId','taskId','conditionRevision'].includes(k))) return bad('INVALID_BINDING');
  const obs=trace.observations;
  if (!Array.isArray(obs) || obs.length < 3 || obs.length > 40) return unchanged('HOST_CALL_OBSERVATIONS_MISSING');
  let previousSeq=-1;
  for(const o of obs){
    if(!o || typeof o!=='object'||Array.isArray(o) || Object.keys(o).some(k=>!['phase','seq','binding','receiptRef'].includes(k)))return bad('INVALID_OBSERVATION');
    if(!events.has(o.phase) || !Number.isSafeInteger(o.seq)||o.seq<=previousSeq || !valid(o.receiptRef))return bad('INVALID_OBSERVATION_ORDER');
    previousSeq=o.seq;
    const x=o.binding;
    if(!x || Object.keys(b).some(k=>x[k]!==b[k]) || Object.keys(x).length!==Object.keys(b).length) return bad('FOREIGN_OR_STALE_CALL');
  }
  const phaseList=obs.map(x=>x.phase);
  if(phaseList[0]!=='route_plan' || phaseList.at(-1)!=='visible_delivery' || phaseList.filter(x=>x==='response_check').length!==1) return bad('REQUIRED_HOST_CALL_MISSING');
  const checkPos=phaseList.indexOf('response_check');
  if(checkPos<=0||checkPos>=phaseList.length-1) return bad('CHECK_NOT_PRE_DELIVERY');
  // A single routed request has one initial plan and one final delivery.
  // Duplicate phases make a source-only packet look as if it represented
  // multiple executions; do not accept that as one correlated host trace.
  if(phaseList.filter(p=>p==='route_plan').length!==1
      || phaseList.filter(p=>p==='visible_delivery').length!==1)
    return bad('DUPLICATE_HOST_BOUNDARY');
  const plan=trace.plannedFeatures, returns=trace.returnedFeatures;
  // A returned helper result must have an observed phase before the response
  // contract check. JSON results alone do not establish a helper invocation.
  if(returns.length && !phaseList.slice(1,checkPos).includes('feature_result'))
    return bad('FEATURE_RESULT_CALL_MISSING');
  if(phaseList.slice(checkPos+1,-1).includes('feature_result'))
    return bad('FEATURE_RESULT_AFTER_RESPONSE_CHECK');
  if(!Array.isArray(plan)||!Array.isArray(returns)||plan.length>20||returns.length>20) return bad('INVALID_FEATURE_ARRAY');
  const seen=new Set();
  for(const f of plan){
    if(!f||!valid(f.id)||!valid(f.owner)||!['planned','deferred','blocked','suppressed','unavailable'].includes(f.status)||seen.has(f.id))return bad('INVALID_PLANNED_FEATURE');
    seen.add(f.id);
  }
  const returned=new Set();
  for(const f of returns){
    if(!f||!valid(f.id)||!valid(f.owner)||!states.has(f.status)||returned.has(f.id))return bad('INVALID_RETURNED_FEATURE');
    returned.add(f.id);
    const declared=plan.find(x=>x.id===f.id);
    if(!declared||declared.owner!==f.owner||declared.status!=='planned')return bad('UNPLANNED_OR_WRONG_OWNER');
    if(f.status==='completed' && (!Array.isArray(f.evidenceRefs)||!f.evidenceRefs.length||f.evidenceRefs.some(x=>!valid(x))))return bad('RESULT_EVIDENCE_NOT_RECORDED');
    if(f.status!=='completed' && !valid(f.reason))return bad('BLOCKED_REASON_NOT_RECORDED');
  }
  for(const f of plan)if(f.status==='planned'&&!returned.has(f.id))return bad('FEATURE_RESULT_MISSING');
  const check=trace.responseCheck;
  if(!check||typeof check!=='object'||check.operation!=='route.check_response'||!valid(check.receiptRef)||!Array.isArray(check.errorCodes)||check.errorCodes.some(x=>!valid(x)))return unchanged('RESPONSE_CHECK_READBACK_MISSING');
  if(check.ok!==true || check.errorCodes.length) return bad('RESPONSE_CHECK_FAILED');
  if(obs[checkPos].receiptRef!==check.receiptRef)return bad('RESPONSE_CHECK_RECEIPT_MISMATCH');
  // Evidence is only an opaque claim until checked by its originating provider.
  return {status:'TRACE_CONTRACT_PASS',reason:null,hostE2EProven:false,externalSuccessProven:false,
    message:'Host execution and provider receipts must be independently authenticated.'};
}
