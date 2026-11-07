/** Exact candidate wire for the real Android text-selection executor.
 * This module issues no grant and never treats a caller descriptor as screen
 * evidence. The host joins its result to the original signed completion first.
 */
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

export const JEBISEO_NATIVE_WIRE_SCHEMA = 'JH_JEBISEO_AUTO3_V1';
export const JEBISEO_NATIVE_RESULT_SCHEMA = 'JH_JEBISEO_AUTO3_RESULT_V1';
export const JEBISEO_NATIVE_MARKER = '__JH_JEBISEO_TEXT_HANDOFF_V1__';
export const JEBISEO_NATIVE_PHASES = Object.freeze([
  'SELECT_REQUEST_TEXT', 'CLICK_GEMINI_MENU', 'SUBMIT_GEMINI'
]);
export const JEBISEO_NATIVE_ACTIONS = Object.freeze({
  SELECT_REQUEST_TEXT: 'jebiseo_select_request_text',
  CLICK_GEMINI_MENU: 'jebiseo_click_gemini_menu',
  SUBMIT_GEMINI: 'jebiseo_submit_gemini'
});
const ACTIONS = new Set(Object.values(JEBISEO_NATIVE_ACTIONS));
const WIRE_KEYS = ['schema', 'phase', 'taskId', 'threadDigest', 'sourceDigest',
  'promptDigest', 'runDigest', 'preparedPrompt', 'requestId', 'previousReceipt'];
const DESCRIPTOR_KEYS = ['schema', 'taskRef', 'threadRef', 'sourceRef', 'requestDigest', 'promptDigest'];
const HEX32 = /^[a-f0-9]{32}$/, HEX64 = /^[a-f0-9]{64}$/;
const RECEIPT = /^jhr_[a-f0-9]{48}$/;
const PHASE_PROOF = Object.freeze({SELECT_REQUEST_TEXT: ['jebiseo_selection_verified', 'selectionVerified'],
  CLICK_GEMINI_MENU: ['jebiseo_gemini_draft_verified', 'draftVerified'],
  SUBMIT_GEMINI: ['jebiseo_submission_verified', 'submissionVerified']});
export const nativeHandoffHash = value => createHash('sha256').update(value, 'utf8').digest('hex');
const fail = code => {throw Error(code);};
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
function exact(value, fields) {
  return plain(value) && Reflect.ownKeys(value).length === fields.length &&
    fields.every(key => Object.hasOwn(value, key) && Object.getOwnPropertyDescriptor(value, key)?.enumerable === true &&
      Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'));
}
export function nativeHandoffPromptFits(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.isWellFormed() &&
    [...value].length <= 1200 && Buffer.byteLength(value, 'utf8') <= 2048 &&
    !/[\p{Cf}\p{Zl}\p{Zp}\p{Co}\p{Cn}]/u.test(value) && !/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/u.test(value);
}
export function createJebiseoNativeSelectionDescriptor(prepared) {
  return Object.freeze({schema: 'jh.jebiseo-native-selection.v1', taskRef: prepared.taskRef,
    threadRef: prepared.threadRef, sourceRef: prepared.sourceRef,
    requestDigest: prepared.requestDigest, promptDigest: prepared.promptDigest});
}
export function validateJebiseoNativeSelection(prepared, descriptor) {
  return exact(descriptor, DESCRIPTOR_KEYS) &&
    isDeepStrictEqual(descriptor, createJebiseoNativeSelectionDescriptor(prepared));
}
export function nativeHandoffRunDigest({schema, taskId, threadDigest, sourceDigest, promptDigest}) {
  return nativeHandoffHash([schema, taskId, threadDigest, sourceDigest, promptDigest]
    .map(value => `${value.length}:${value}`).join('|'));
}
export function createJebiseoNativeWireScope(prepared, descriptor) {
  if (prepared?.active !== true || !validateJebiseoNativeSelection(prepared, descriptor))
    fail('JEBISEO_NATIVE_SELECTION_SCOPE_REQUIRED');
  if (!nativeHandoffPromptFits(prepared.prompt) || nativeHandoffHash(prepared.prompt) !== prepared.promptDigest)
    fail('JEBISEO_NATIVE_PROMPT_UNSUPPORTED');
  const scope = {schema: JEBISEO_NATIVE_WIRE_SCHEMA,
    taskId: 'jh3_' + nativeHandoffHash(JSON.stringify([prepared.taskRef, prepared.requestDigest])),
    threadDigest: nativeHandoffHash(JSON.stringify(['jh.jebiseo-thread.v1', prepared.threadRef])),
    sourceDigest: nativeHandoffHash(JSON.stringify(['jh.jebiseo-source.v1', prepared.threadRef,
      prepared.sourceRef, prepared.requestDigest])), promptDigest: prepared.promptDigest};
  return Object.freeze({...scope, runDigest: nativeHandoffRunDigest(scope), preparedPrompt: prepared.prompt});
}
export function createJebiseoNativeWire(scope, phase, requestId, previousReceipt = '') {
  const wire = {schema: scope.schema, phase, taskId: scope.taskId,
    threadDigest: scope.threadDigest, sourceDigest: scope.sourceDigest,
    promptDigest: scope.promptDigest, runDigest: scope.runDigest,
    preparedPrompt: scope.preparedPrompt, requestId, previousReceipt};
  if (!validWire(wire)) fail('JEBISEO_NATIVE_WIRE_INVALID');
  return Object.freeze(wire);
}
function validWire(wire) {
  return exact(wire, WIRE_KEYS) && wire.schema === JEBISEO_NATIVE_WIRE_SCHEMA &&
    Object.hasOwn(JEBISEO_NATIVE_ACTIONS, wire.phase) &&
    typeof wire.taskId === 'string' && /^[A-Za-z0-9_.-]{1,96}$/.test(wire.taskId) &&
    ['threadDigest', 'sourceDigest', 'promptDigest', 'runDigest'].every(key => HEX64.test(wire[key] ?? '')) &&
    nativeHandoffPromptFits(wire.preparedPrompt) && nativeHandoffHash(wire.preparedPrompt) === wire.promptDigest &&
    nativeHandoffRunDigest(wire) === wire.runDigest && HEX32.test(wire.requestId ?? '') &&
    (wire.phase === 'SELECT_REQUEST_TEXT' ? wire.previousReceipt === '' : RECEIPT.test(wire.previousReceipt ?? ''));
}
export function isJebiseoNativeCarrier(args) {
  return plain(args) && (ACTIONS.has(args.action) || args.text === JEBISEO_NATIVE_MARKER);
}
export function readJebiseoNativeCarrier(args, {commandId = null} = {}) {
  const fields = commandId === null ? ['action', 'text', 'value'] : ['action', 'text', 'value', 'command_id'];
  if (!exact(args, fields) || args.text !== JEBISEO_NATIVE_MARKER || !ACTIONS.has(args.action) ||
      typeof args.value !== 'string' || Buffer.byteLength(args.value, 'utf8') > 8192 ||
      (commandId !== null && (!HEX32.test(commandId) || args.command_id !== commandId)))
    fail('JEBISEO_NATIVE_CARRIER_INVALID');
  let wire;
  try {wire = JSON.parse(args.value);} catch {fail('JEBISEO_NATIVE_WIRE_INVALID');}
  // The producer emits one canonical object. Reject duplicate keys or a
  // different serialization before signing it for the phone's JSON reader.
  if (!validWire(wire) || JSON.stringify(wire) !== args.value || JEBISEO_NATIVE_ACTIONS[wire.phase] !== args.action)
    fail('JEBISEO_NATIVE_WIRE_INVALID');
  return Object.freeze(wire);
}
export function nativeHandoffArguments(wire, commandId) {
  const args = {action: JEBISEO_NATIVE_ACTIONS[wire.phase], text: JEBISEO_NATIVE_MARKER,
    value: JSON.stringify(wire), command_id: commandId};
  readJebiseoNativeCarrier(args, {commandId});
  return Object.freeze(args);
}
/** Called only by the candidate's authenticated ORIGINAL handler overlay,
 * immediately before mk signs the payload. No caller can provide metadata.
 */
export function createJebiseoNativeSignedPayload(args, {deviceDigest, nowMs, expiresAtMs} = {}) {
  const wire = readJebiseoNativeCarrier(args);
  if (!HEX64.test(deviceDigest ?? '') || !Number.isSafeInteger(nowMs) || nowMs <= 0 ||
      !Number.isSafeInteger(expiresAtMs) || expiresAtMs <= nowMs || expiresAtMs - nowMs > 60000)
    fail('JEBISEO_NATIVE_ENVELOPE_SCOPE_INVALID');
  return {...args, mcpToolName: 'life_android_step', taskDigest: wire.runDigest,
    targetDeviceDigest: deviceDigest, secureRequestedEffect: 'REVERSIBLE_WRITE',
    containsCredential: false, dataClass: 'NON_SENSITIVE', secureInvocationExpiresAt: expiresAtMs};
}
export function nativeHandoffJobMatches(job, args, deviceDigest) {
  let wire;
  try {wire = readJebiseoNativeCarrier(args, {commandId: args.command_id});} catch {return false;}
  return job?.type === 'agent_step' && ['action', 'text', 'value'].every(key => job[key] === args[key]) &&
    job.commandId === args.command_id && job.mcpToolName === 'life_android_step' &&
    job.taskDigest === wire.runDigest && job.targetDeviceDigest === deviceDigest &&
    job.secureRequestedEffect === 'REVERSIBLE_WRITE' && job.containsCredential === false &&
    job.dataClass === 'NON_SENSITIVE' && Number.isSafeInteger(job.secureInvocationExpiresAt);
}
/** Input must already be the result of the exact original authenticated job.
 * Receipts remain private capabilities. Presentation never exposes them.
 */
export function inspectJebiseoNativeOutcome(result, wire, nowMs) {
  const invalid = () => ({kind: 'UNKNOWN', code: 'JEBISEO_NATIVE_READBACK_UNVERIFIED', dispatched: true});
  if (!plain(result) || result.schema !== JEBISEO_NATIVE_RESULT_SCHEMA || result.phase !== wire.phase ||
      result.requestId !== wire.requestId || result.runDigest !== wire.runDigest ||
      typeof result.ok !== 'boolean' || typeof result.phoneActionDispatched !== 'boolean' ||
      typeof result.resultVerified !== 'boolean' || result.automaticReplay !== false ||
      result.businessResultVerified !== false || typeof result.code !== 'string' ||
      !/^[A-Za-z0-9_:-]{1,160}$/.test(result.code)) return invalid();
  if (result.approvalPending === true) {
    return result.ok === false && result.code === 'local_action_approval_required' &&
      wire.phase !== 'SELECT_REQUEST_TEXT' && result.phoneActionDispatched === false && result.resultVerified === false &&
      !Object.hasOwn(result, 'receipt')
      ? {kind: 'APPROVAL_PENDING', code: result.code, dispatched: false} : invalid();
  }
  const [expectedCode, proof] = PHASE_PROOF[wire.phase];
  if (result.ok === true) {
    if (result.code !== expectedCode || result.resultVerified !== true || result[proof] !== true)
      return invalid();
    if (wire.phase === 'SUBMIT_GEMINI') {
      if (result.phoneActionDispatched !== true) return invalid();
      return {kind: 'VERIFIED', code: result.code, dispatched: true, submissionVerified: true};
    }
    if (!RECEIPT.test(result.receipt ?? '') || !Number.isSafeInteger(result.expiresAt) ||
        result.expiresAt <= nowMs || result.expiresAt > nowMs + 125000) return invalid();
    return {kind: 'VERIFIED', code: result.code, dispatched: result.phoneActionDispatched,
      receipt: result.receipt, expiresAt: result.expiresAt};
  }
  if (result.resultVerified !== false || Object.hasOwn(result, 'receipt')) return invalid();
  return {kind: result.phoneActionDispatched ? 'UNKNOWN' : 'BLOCKED',
    code: result.code, dispatched: result.phoneActionDispatched};
}
