/** Decode only the original agent_step result of the guided action just called.
 * This parser is not a receipt verifier and never clears a dispatch reservation.
 * Original raw/job evidence stays with the caller. Page text, nextQuestion,
 * nested recommendations and step_and_snapshot envelopes are not traversed.
 */
import {classifyJebiseoMobileOutcome} from './mobile-outcome.mjs';

const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const unknownCodes = new Set(['dispatch_uncertain_do_not_retry',
  'operation_incomplete_do_not_retry', 'form_operation_failed_do_not_retry', 'field_value_unverified']);
const rank = Object.freeze({UNKNOWN: 7, PENDING: 6, STOP_NO_REPLAY: 5,
  UNVERIFIABLE: 4, MANUAL: 3, BLOCKED: 2, RETURNED: 1});
const unverifiable = () => ({ok: false, status: 'UNVERIFIABLE', manualRequired: false, readbackRequired: true});
const combine = (outer, inner) => Object.freeze({
  ...(rank[outer.status] >= rank[inner.status] ? outer : inner), readbackRequired: true
});

function matchesSuccess(value, operation, identity) {
  const expectedOperation = {TYPE: 'form15_type', DISCOVER_INPUT: 'form15_discover',
    DISMISS_NOTICE: 'form_activate'}[operation];
  if (!plain(identity) || !expectedOperation || identity.operation !== expectedOperation) return false;
  if (operation !== 'DISCOVER_INPUT' && !/^f_[0-9a-f]{24}$/.test(identity.fieldId ?? '')) return false;
  if (operation === 'DISCOVER_INPUT') return value.code === 'form_scanned' &&
    value.feature === 'input_selection_15' && value.coverage === 'VISIBLE_ONLY' &&
    Array.isArray(value.fields) && plain(value.form15ToolArguments) &&
    Array.isArray(value.form15ToolArguments.fields);
  if (operation === 'TYPE') return value.code === 'field_value_verified' &&
    value.operation === 'type' && value.fieldId === identity?.fieldId &&
    value.actionAccepted === true && value.valueVerified === true &&
    value.effectConfirmed === false && value.autoRetryAllowed === false;
  if (operation === 'DISMISS_NOTICE') return value.code === 'low_risk_action_dispatched' &&
    value.actionAccepted === true && value.transactionSuccessVerified === false &&
    value.autoRetryAllowed === false && value.rescanRequired === true;
  return false;
}

export function classifyJebiseoGuidedJob(payload, {operation, identity, isError = false} = {}) {
  const outer = classifyJebiseoMobileOutcome(payload, {isError});
  const undecoded = () => Object.freeze({
    outcome: outer.ok ? Object.freeze(unverifiable()) : outer, nativeCode: null, nativePayload: null
  });
  // Direct server gates and queued/expired jobs keep their original negative
  // state. A generic ok:true is insufficient for a completed guided response.
  if (!plain(payload) || payload.type !== 'agent_step' || payload.status !== 'complete') return undecoded();
  const wire = payload.result;
  if (!plain(wire) || typeof wire.ok !== 'boolean' || typeof wire.url !== 'string' ||
      Buffer.byteLength(wire.url, 'utf8') > 2 * 1024 * 1024)
    return Object.freeze({outcome: combine(outer, unverifiable()), nativeCode: null, nativePayload: null});
  let native;
  try { native = JSON.parse(wire.url); } catch { return Object.freeze({
    outcome: combine(outer, unverifiable()), nativeCode: null, nativePayload: null
  }); }
  if (!plain(native) || typeof native.ok !== 'boolean' ||
      typeof native.code !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(native.code))
    return Object.freeze({outcome: combine(outer, unverifiable()), nativeCode: null, nativePayload: null});
  let inner = classifyJebiseoMobileOutcome(native);
  if (unknownCodes.has(native.code)) {
    // FormTransport also uses actionAccepted:false after a possibly effectful
    // exception. It is never proof that repeating the operation is harmless.
    inner = {ok: false, status: 'UNKNOWN', manualRequired: false, readbackRequired: true};
  } else if (wire.ok !== native.ok || (inner.ok && !matchesSuccess(native, operation, identity))) {
    inner = unverifiable();
  }
  return Object.freeze({outcome: combine(outer, inner), nativeCode: native.code,
    nativePayload: Object.freeze(native)});
}
