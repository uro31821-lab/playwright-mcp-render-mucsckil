/** Negative-state projection of an already unwrapped original mobile result.
 * This is not a receipt verifier, dispatcher, retry policy or Gemini success
 * detector. The caller retains the original code/payload and every reservation.
 */
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const state = value => typeof value === 'string' ? value.toUpperCase() : '';
const UNKNOWN = new Set(['UNKNOWN', 'EFFECT_UNKNOWN', 'UNCONFIRMED', 'EXPIRED']);
const PENDING = new Set(['PENDING', 'QUEUED', 'LEASED', 'RUNNING', 'IN_PROGRESS']);
const REVIEW = new Set(['NEEDS_REVIEW', 'NEEDS_REVIEW_NO_REPLAY']);
const STOP = new Set(['STOP_NO_REPLAY', 'FAILED_AFTER_EFFECT', 'PHONE_SCOPED_SITE_DISCARD']);
const BLOCKED = new Set(['BLOCKED', 'DENIED', 'FAILED', 'ERROR', 'FAILED_PRE_DISPATCH',
  'FAILED_NO_EFFECT', 'VERIFIED_UNSUPPORTED_NO_EFFECT', 'OWNER_ADMISSION_BLOCKED']);
const PENDING_CODES = new Set(['OPEN_COMPLETION_PENDING',
  'action_approval_pending_local_tap', 'screen_consent_pending_local_tap']);
// Original safeJobView/cleanup/native-readback errors. A missing or expired
// receipt does not prove that its effect was never dispatched.
const UNKNOWN_ERRORS = new Set(['not found', 'job_timeout', 'DISPATCH_OUTCOME_UNKNOWN_NO_AUTO_REPLAY']);
const RECEIPT_SCHEMA = 'JH168_STAGE61_UNIFIED_RECEIPT_V1';
const result = (ok, status, manualRequired = false, readbackRequired = false) =>
  Object.freeze({ok, status, manualRequired, readbackRequired});

function currentStates(value) {
  const verification = object(value.resultVerification) ? value.resultVerification : null;
  const receipt = value.stage61Router?.schema === RECEIPT_SCHEMA ? value.stage61Router : null;
  return [value.status, value.executionStatus, value.jobStatus, value.deliveryStatus,
    verification?.status, verification?.state, receipt?.outcome,
    value.stage61RouterHost?.recordedOutcome].map(state);
}

/**
 * Read only the primary result and the original job's single `result` slot.
 * Do not recurse into UI items, labels, page text, advice, acted/snapshot pairs
 * or arbitrary JSON. The guided-form adapter must decode its known result.url
 * envelope before calling this function; this function never parses URL text.
 *
 * RETURNED/ok:true means no explicit negative state was found, not that an
 * action was applied or Gemini accepted/replied/delivered anything. In
 * particular field_value_verified proves neither a submit nor a full feature.
 *
 * Stage61's next-provider and secondary schema diagnostics are not the current
 * result. VERIFIED_PASS normally leads to stage61NextProvider STOP_NO_REPLAY;
 * treating that as a failure would falsely make a completed action incomplete.
 * A next MANUAL hint likewise cannot erase an applied receipt or prove a manual
 * action happened. Only a direct MANUAL requirement is classified as MANUAL.
 *
 * MANUAL and readbackRequired:false are never proof of no dispatch/no effect.
 * They cannot release a reservation, clear an existing pending barrier, renew
 * an approval or authorize automatic/manual replay. The original exact signed
 * readback remains authoritative, including after this classifier returns.
 */
export function classifyJebiseoMobileOutcome(payload, {isError = false} = {}) {
  if (!object(payload)) return result(false, 'UNVERIFIABLE', false, true);
  const current = [payload, ...(object(payload.result) ? [payload.result] : [])];
  const states = current.flatMap(currentStates);
  const requestedReadback = current.some(value => value.readbackRequired === true || value.rescanRequired === true);

  // Uncertainty wins over a MANUAL hint: asking the user to repeat an effect is
  // not an acceptable substitute for reading the unresolved original result.
  if (states.some(value => UNKNOWN.has(value)) || current.some(value => UNKNOWN_ERRORS.has(value.error)))
    return result(false, 'UNKNOWN', false, true);
  if (states.some(value => PENDING.has(value)) || current.some(value => PENDING_CODES.has(value.code)))
    return result(false, 'PENDING', false, true);
  // The original duplicate guard can return executed:false for a duplicate
  // whose PRIOR dispatch is unresolved. That is still no-replay, not no-effect.
  if (states.some(value => REVIEW.has(value)) || current.some(value => value.code === 'NEEDS_REVIEW_NO_REPLAY'))
    return result(false, 'STOP_NO_REPLAY', false, true);
  if (states.some(value => STOP.has(value)) || current.some(value => value.provider === 'STOP_NO_REPLAY'))
    return result(false, 'STOP_NO_REPLAY', false, requestedReadback ||
      states.some(value => value === 'FAILED_AFTER_EFFECT' || value === 'PHONE_SCOPED_SITE_DISCARD'));
  if (current.some(value => value.manualRequired === true || value.provider === 'MANUAL') ||
      states.some(value => value === 'MANUAL' || value === 'MANUAL_REQUIRED'))
    return result(false, 'MANUAL', true, requestedReadback);
  if (isError === true || current.some(value => value.ok === false || value.allowed === false ||
      (typeof value.error === 'string' && value.error.trim().length > 0)) ||
      states.some(value => BLOCKED.has(value)))
    return result(false, 'BLOCKED', false, requestedReadback);
  return result(true, 'RETURNED', false, requestedReadback);
}
