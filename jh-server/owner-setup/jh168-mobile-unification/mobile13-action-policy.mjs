/** Exact host admission for the explicitly selected mobile-right action mode.
 * This policy is not a signature verifier, an input grant, local approval, or a
 * success classifier. The existing Secure56 and Android checks remain required.
 */
import {durableNativeJobPolicy} from '../deployment/durable-native-job-policy.mjs';

export const MOBILE13_ACTION_POLICY_MODE56 = 'EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1';
const PREFLIGHT = 'split_screen_session_input_preflight';
const FOLLOWUP = 'split_screen_session_followup';
const READ_TOOL = 'life_android_capture_work_window';
const WRITE_TOOL = 'life_android_execute_computer_action';
const HEX32 = /^[a-f0-9]{32}$/;
const HEX64 = /^[a-f0-9]{64}$/;
const CONTEXT = /^ssc_[a-f0-9]{32}$/;
const ITEM = /^item_[a-f0-9]{16}$/;
const GRANT = /^ipg_[a-f0-9]{32}$/;
const BASE_FIELDS = Object.freeze([
  'contextId', 'command', 'targetItemRef', 'action', 'mcpToolName',
  'secureRequestedEffect', 'taskDigest', 'targetDeviceDigest',
  'secureInvocationExpiresAt', 'containsCredential', 'dataClass', 'commandId'
]);
const answer = (kind, extra = {}) => Object.freeze({kind, ...extra});
const denied = () => answer('DENY', {code: 'DURABLE_EXACT_MOBILE13_ACTION_SCOPE_REQUIRED'});
const matches = (pattern, value) => typeof value === 'string' && pattern.test(value);
const text = (value) => typeof value === 'string' && value.trim().length > 0 &&
  value.length <= 2000 && !value.includes('\u0000');
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const ownData = (value, name) => {
  const descriptor = Object.getOwnPropertyDescriptor(value, name);
  return descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable
    ? descriptor : null;
};
// Same text-only rejection as the original split-screen MCP producer. Device
// target-sensitive classification and grant consumption are still mandatory.
const localOnly = (value) => /bearer\s+[a-z0-9._~+/=-]{8,}/i.test(value) ||
  /\b(?:sk|rk|pk)-[a-z0-9_-]{8,}\b/i.test(value) ||
  /(?<!\d)\d{6}-?\d{7}(?!\d)/.test(value) ||
  /(?<!\d)(?:\d[ -]?){13,19}(?!\d)/.test(value) ||
  /(?:otp|인증번호|보안코드|cvc|cvv|pin)\s*[:：]?\s*\d{3,8}/i.test(value);

function exactSignedScope(job, payload, preflight, fields) {
  if (!record(job) || !record(payload) || Reflect.ownKeys(payload).length !== fields.length)
    return false;
  // mk() copies the exact payload to the original signed job before capture.
  // Inherited, hidden, accessor, extra, or job-mismatched fields are not scope.
  for (const field of fields) {
    const value = ownData(payload, field), bound = ownData(job, field);
    if (!value || !bound || value.value !== bound.value) return false;
  }
  const type = ownData(job, 'type');
  if (!type || type.value !== (preflight ? PREFLIGHT : FOLLOWUP)) return false;
  const session = ownData(job, 'secureSessionId'), device = ownData(job, 'targetDeviceId');
  if (!session || typeof session.value !== 'string' || !session.value ||
      !device || typeof device.value !== 'string' || !device.value) return false;
  const now = Date.now();
  return payload.mcpToolName === (preflight ? READ_TOOL : WRITE_TOOL) &&
    payload.secureRequestedEffect === (preflight ? 'READ_ONLY' : 'REVERSIBLE_WRITE') &&
    payload.containsCredential === false && payload.dataClass === 'NON_SENSITIVE' &&
    matches(HEX32, payload.commandId) && matches(CONTEXT, payload.contextId) &&
    matches(HEX64, payload.taskDigest) && matches(HEX64, payload.targetDeviceDigest) &&
    Number.isSafeInteger(payload.secureInvocationExpiresAt) &&
    payload.secureInvocationExpiresAt > now && payload.secureInvocationExpiresAt <= now + 180000 &&
    text(payload.command) && !localOnly(payload.command);
}

/** Called only by the host configured with MOBILE13_ACTION_POLICY_MODE56.
 * All unrelated routes, including CLICK, delegate to the untouched old policy.
 */
export function mobile13DurableJobPolicy(job, payload) {
  const preflight = job?.type === PREFLIGHT;
  const action = payload?.action;
  if (!preflight && !(job?.type === FOLLOWUP && (action === 'SET_TEXT' || action === 'BACK')))
    return durableNativeJobPolicy(job, payload);
  const fields = [...BASE_FIELDS, ...(preflight ? [] : ['requestId']),
    ...(!preflight && action === 'SET_TEXT' ? ['value', 'inputGrantToken'] : [])];
  if (!exactSignedScope(job, payload, preflight, fields)) return denied();

  if (preflight) {
    // This original phone route reads the exact current editable target and may
    // issue its own 30-second, one-use scoped token. The host issues no token.
    if (action !== 'SET_TEXT' || !matches(ITEM, payload.targetItemRef)) return denied();
    return answer('READ', {approvalGranted: false, screenConsentGranted: false});
  }
  if (!matches(HEX32, payload.requestId)) return denied();
  if (action === 'SET_TEXT') {
    if (!matches(ITEM, payload.targetItemRef) || !matches(GRANT, payload.inputGrantToken) ||
        !text(payload.value) || localOnly(payload.value)) return denied();
  } else if (payload.targetItemRef !== '') return denied();

  // Conservative uncertainty identity: changing request/command/session, input
  // value, or a freshly issued token cannot bypass an unresolved action on this
  // context/target. The original journal also keys device + job type. No raw
  // command, value, grant, or authorization material enters the durable store.
  const identityPayload = Object.freeze({
    contract: 'MOBILE13_ACTION_V1', contextId: payload.contextId, action,
    ...(action === 'SET_TEXT' ? {targetItemRef: payload.targetItemRef} : {})
  });
  return answer('JOURNAL', {identityPayload, approvalGranted: false, screenConsentGranted: false});
}
