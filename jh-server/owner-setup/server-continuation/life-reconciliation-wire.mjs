/** Recovery is limited to an immutable result ALREADY staged by the authenticated read host.
 * No caller-supplied success, new evidence, provider retry, lease renewal or terminal reset. */
import {exact, fail, isId, isHex, sha, canonical} from './life-checkpoint-wire.mjs';
import {contentRecord, contentTime, contentCanonical, decodePayload} from './life-content-wire.mjs';

export function reconciliationRequest(x) {
  if (!x || x.version !== 1 || !isId(x.requestId) || !isId(x.workflowId) || !isHex(x.planDigest) || !isId(x.taskId)) fail('reconcile_request_invalid');
  if (!['inspect','commit'].includes(x.operation)) fail('reconcile_operation_invalid');
  exact(x, 'version requestId operation workflowId planDigest taskId' +
    (x.operation === 'commit' ? ' expectedRevision expectedFence candidateDigest' : ''));
  if (x.operation === 'commit' && (!Number.isSafeInteger(x.expectedRevision) || x.expectedRevision < 1 ||
      !Number.isSafeInteger(x.expectedFence) || x.expectedFence < 1 || !isHex(x.candidateDigest))) fail('reconcile_observation_invalid');
  return x;
}

/** Comes from the reviewed host's exact plan registry, NEVER from JSON submitted by a client. */
export function reconciliationTask(context, taskId) {
  if (!context || !isHex(context.workerDigest) || !Number.isSafeInteger(context.expiresAt) ||
      !(context.readOnlyTasks instanceof Set) || !context.readOnlyTasks.has(taskId) ||
      !(context.resultTaskIds instanceof Set) || !context.resultTaskIds.has(taskId) ||
      !(context.contentClasses instanceof Set) || !context.contentClasses.has('RESULT_TEXT') ||
      !(context.recoveryTasks instanceof Map)) fail('reconcile_scope_denied');
  const spec = context.recoveryTasks.get(taskId);
  exact(spec, 'kind verificationKey');
  if (!['MEMORIA','BOOKTOON'].includes(spec.kind) || typeof spec.verificationKey !== 'string' ||
      !/^[a-z][a-z0-9_.-]{0,63}$/.test(spec.verificationKey) ||
      /(password|passwd|otp|one.?time|token|cookie|authorization|card|cvv|cvc|pin|secret|credential|session|account|routing|email|phone|recipient|url)/i.test(spec.verificationKey)) fail('reconcile_spec_invalid');
  return spec;
}

/** Same verification-v1 single-fact digest as the existing Kotlin ResultVerificationEngine.
 * This verifies durable provenance/integrity; it is NOT independent factual/semantic certification. */
export function stagedEvidenceDigest(workflow, r, spec) {
  const payload = decodePayload(r.payload);
  try {
    const value = r.proofDigest === null ? sha(payload) : sha(sha(payload) + '|' + r.proofDigest);
    const fact = [spec.verificationKey,'true',value,'VERIFIED',r.factSource].join('\u001e');
    return sha(['verification-v1',workflow,r.taskId,'READ_ONLY',r.providerId,r.actionDigest,
      r.providerId,r.actionDigest,'true','NOT_APPLICABLE',String(r.verifiedAt),fact].join('\u001d'));
  } finally { payload.fill(0); }
}

export function verifiedStagedResult(cp, entry, dispatch, raw, spec, context, now) {
  const r = contentRecord(raw); contentTime(r, now);
  if (r.workflowId !== cp.workflowId || r.planDigest !== cp.planDigest || r.category !== 'RESULT_TEXT' ||
      r.taskId !== entry.taskId || r.providerId !== entry.providerId || r.kind !== spec.kind ||
      r.expiresAt > context.expiresAt || dispatch.taskId !== entry.taskId || dispatch.attempt !== entry.invocations ||
      r.actionDigest !== dispatch.actionDigest || now-r.verifiedAt > 600000) fail('reconcile_result_binding');
  if (stagedEvidenceDigest(cp.workflowId,r,spec) !== r.evidenceDigest) fail('reconcile_evidence_mismatch');
  return r;
}

export function candidateBinding(cp, fence, entry, dispatch, record) {
  return {workflowId:cp.workflowId,planDigest:cp.planDigest,taskId:entry.taskId,
    checkpointRevision:cp.revision,workerFence:fence,attempt:entry.invocations,
    actionDigest:dispatch.actionDigest,recordDigest:sha(contentCanonical(record))};
}
export function candidateDigest(cp, fence, entry, dispatch, record) {
  return sha(canonical(candidateBinding(cp,fence,entry,dispatch,record)));
}
