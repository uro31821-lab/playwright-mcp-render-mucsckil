/**
 * One explicit step through the already authenticated PHONE_RIGHT registry.
 * `callOriginalTool` is trusted host code, never a caller-supplied MCP endpoint.
 * It must retain original command, device, journal and phone-local grant checks.
 * This adapter neither creates BEGIN_COMMAND nor interprets UI text as authority.
 */
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {prepareJebiseoGuidedCall} from './guided-form.mjs';
import {classifyJebiseoMobileOutcome} from './mobile-outcome.mjs';
import {classifyJebiseoGuidedJob} from './guided-outcome.mjs';
import {getJebiseoAndroidTarget} from './android-app.mjs';

// This destination is implementation-owned. Page text or a generated link must
// never turn a Gemini launch into navigation to a different service/account.
export const JEBISEO_GEMINI_WEB_URL = 'https://gemini.google.com/app';
const ROUTES = Object.freeze({
  OPEN: 'life_web_navigate',
  OPEN_APP: 'life_android_open',
  APP_OBSERVE: 'life_android_computer_inspect',
  SNAPSHOT: 'life_web_snapshot',
  FORM_SNAPSHOT: 'life_android_snapshot',
  DISCOVER_INPUT: 'life_android_step',
  DISMISS_NOTICE: 'life_android_step',
  TYPE: 'life_android_step',
  INSPECT_SUBMIT: 'life_android_computer_inspect',
  PREPARE_SUBMIT: 'life_android_computer_prepare',
  APPROVAL_REQUEST: 'life_android_action_approval_request',
  APPROVAL_STATUS: 'life_android_action_approval_status',
  EXECUTE_SUBMIT: 'life_android_execute_computer_action',
  RECEIPT_STATUS: 'life_android_pending_approval_receipt_status',
  JOB_STATUS: 'life_job_status'
});
export const JEBISEO_ORIGINAL_MOBILE_TOOLS = Object.freeze([...new Set(Object.values(ROUTES))]);
const GUIDED = new Set(['DISCOVER_INPUT', 'DISMISS_NOTICE', 'TYPE']);
const EFFECTS = new Set(['OPEN', 'OPEN_APP', ...GUIDED, 'APPROVAL_REQUEST', 'EXECUTE_SUBMIT']);
const SUBMIT = new Set(['INSPECT_SUBMIT', 'PREPARE_SUBMIT', 'APPROVAL_REQUEST', 'EXECUTE_SUBMIT']);
const HEX32 = /^[a-f0-9]{32}$/, HEX64 = /^[a-f0-9]{64}$/;
const CONTEXT = /^ssc_[a-f0-9]{32}$/, FIELD = /^f_[a-f0-9]{24}$/;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const matches = (pattern, value) => typeof value === 'string' && pattern.test(value);
const token = value => typeof value === 'string' && value.length >= 8 && value.length <= 512 && !/[\u0000-\u001f]/.test(value);
const text = (value, max = 2000) => typeof value === 'string' && value.length > 0 && value.length <= max && !value.includes('\0');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const CU_FIELDS = Object.freeze([
  'device_id', 'task_digest', 'run_digest', 'action', 'effect', 'data_class',
  'index', 'x', 'y', 'viewport_width', 'viewport_height',
  'based_on_screenshot_digest', 'current_screenshot_digest',
  'screen_grant_token', 'screen_consent_digest',
  'action_approval_grant_token', 'local_action_approval_digest', 'max_actions_in_call'
]);
const FIELDS = Object.freeze({
  OPEN: [],
  OPEN_APP: ['app_package'],
  APP_OBSERVE: ['task_digest'],
  SNAPSHOT: ['context_id', 'goal'],
  FORM_SNAPSHOT: [],
  DISCOVER_INPUT: ['guided_arguments'],
  DISMISS_NOTICE: ['field_id', 'guided_arguments'],
  TYPE: ['request_id', 'field_id', 'text', 'submit', 'guided_arguments'],
  APPROVAL_STATUS: ['device_id', 'task_digest', 'request_token'],
  RECEIPT_STATUS: ['device_id', 'task_digest', 'run_digest', 'receipt_token'],
  JOB_STATUS: ['job_id']
});
const base = operation => ({operation, backend: 'PHONE_RIGHT', hiddenUiSupported: false,
  automaticReplay: false, automaticResume: false, geminiAcceptedVerified: false,
  fullReplyVerified: false, chatGptDelivered: false, phoneDispatchVerified: false});
const reject = (operation, code) => Object.freeze({...base(operation), ok: false,
  status: 'BLOCKED', code, toolInvoked: false, raw: null, payload: null});

// Exact advisory envelope appended by operational-learning/server-runtime.mjs.
// Its suggestions never become an action result or execution authority.
const learningAside = value => value.type === 'jh_operational_learning' &&
  value.delivery === 'offered' && value.timing === 'after_execution' &&
  value.advisoryOnly === true && value.externalEffects === false &&
  value.preflightTool === 'life_learning_context' &&
  Array.isArray(value.lessons) && Array.isArray(value.proposals);

/** Decode exactly one original result, retaining nested job/result structures.
 * The known typed learning appendix is the only extra text envelope ignored.
 * A structured result and its identical JSON rendering are one representation;
 * disagreeing/second primary results or untyped commentary remain ambiguous.
 */
export function unwrapJebiseoMobileReply(raw) {
  if (!plain(raw)) return null;
  // MCP text-only results may explicitly serialize structuredContent:null.
  const structured = raw.structuredContent ?? undefined;
  if (structured !== undefined && (!plain(structured) || structured.type === 'jh_operational_learning')) return null;
  if (Array.isArray(raw.content)) {
    let primary = null;
    for (const block of raw.content) {
      if (block?.type !== 'text' || typeof block.text !== 'string') return null;
      let value;
      try { value = JSON.parse(block.text); } catch { return null; }
      if (!plain(value)) return null;
      if (learningAside(value)) continue;
      if (value.type === 'jh_operational_learning' || primary !== null) return null;
      primary = value;
    }
    if (structured !== undefined) {
      if (primary !== null && !isDeepStrictEqual(primary, structured)) return null;
      return structured;
    }
    return primary;
  }
  if (Object.hasOwn(raw, 'content')) return null;
  return structured ?? raw;
}

function validateArgs(operation, args, commandId) {
  if (!plain(args)) return {error: 'JEBISEO_MOBILE_ARGUMENTS_REQUIRED'};
  if (args.command_id !== undefined && args.command_id !== commandId)
    return {error: 'JEBISEO_COMMAND_MISMATCH'};
  const allowed = SUBMIT.has(operation)
    ? [...CU_FIELDS, ...(operation === 'EXECUTE_SUBMIT' ? ['lease_token'] : [])]
    : FIELDS[operation];
  if (Object.keys(args).some(key => key !== 'command_id' && !allowed.includes(key)))
    return {error: 'JEBISEO_MOBILE_ARGUMENT_UNSUPPORTED'};
  const value = {...args, command_id: commandId};
  if (args.device_id !== undefined && !text(args.device_id, 200))
    return {error: 'JEBISEO_DEVICE_ID_INVALID'};
  if (operation === 'OPEN') {
    value.url = JEBISEO_GEMINI_WEB_URL;
  } else if (operation === 'OPEN_APP') {
    const target = getJebiseoAndroidTarget(args.app_package);
    if (!target) return {error: 'JEBISEO_ANDROID_APP_TARGET_UNAVAILABLE'};
    return {value: {target: target.target, url: '', command_id: commandId}};
  } else if (operation === 'APP_OBSERVE') {
    if (!matches(HEX64, args.task_digest)) return {error: 'JEBISEO_ORIGINAL_TASK_DIGEST_REQUIRED'};
    // INSPECT of WAIT is a current accessibility read, never execute WAIT,
    // snapshot recovery, a screenshot, an approval request or a generic action.
    return {value: {action: 'WAIT', effect: 'READ_ONLY', data_class: 'NONE',
      max_actions_in_call: 1, task_digest: args.task_digest, command_id: commandId}};
  } else if (operation === 'FORM_SNAPSHOT') {
    // Original signed native snapshot exposes issued guided-form arguments.
    // A generic RIGHT item reference must never be converted to a native ID.
  } else if (operation === 'DISCOVER_INPUT' || operation === 'DISMISS_NOTICE') {
    if (operation === 'DISMISS_NOTICE' && !matches(FIELD, args.field_id))
      return {error: 'JEBISEO_NATIVE_FIELD_ID_REQUIRED'};
  } else if (operation === 'SNAPSHOT') {
    if (args.context_id !== undefined && !matches(CONTEXT, args.context_id))
      return {error: 'MOBILE_CONTEXT_ID_INVALID'};
    if (args.goal !== undefined && !text(args.goal)) return {error: 'MOBILE_READ_GOAL_INVALID'};
  } else if (operation === 'TYPE') {
    if (!matches(FIELD, args.field_id)) return {error: 'JEBISEO_NATIVE_FIELD_ID_REQUIRED'};
    if (!matches(HEX32, args.request_id)) return {error: 'MOBILE_REQUEST_ID_REQUIRED'};
    if (args.submit !== undefined && args.submit !== false)
      return {error: 'MOBILE_SUBMIT_SEPARATE_ACTION_REQUIRED'};
    if (!text(args.text) || [...args.text].length > 1200 || Buffer.byteLength(args.text, 'utf8') > 2048)
      return {error: 'JEBISEO_SHARED_PHONE_TEXT_LIMIT'};
    value.submit = false;
  } else if (operation === 'JOB_STATUS') {
    if (!text(args.job_id, 200)) return {error: 'JEBISEO_ORIGINAL_JOB_ID_REQUIRED'};
  } else {
    if (!matches(HEX64, args.task_digest)) return {error: 'JEBISEO_ORIGINAL_TASK_DIGEST_REQUIRED'};
    if (args.run_digest !== undefined && !matches(HEX64, args.run_digest))
      return {error: 'JEBISEO_ORIGINAL_RUN_DIGEST_INVALID'};
    if (operation === 'APPROVAL_STATUS' && !token(args.request_token))
      return {error: 'JEBISEO_ORIGINAL_APPROVAL_TOKEN_REQUIRED'};
    if (operation === 'RECEIPT_STATUS' && !token(args.receipt_token))
      return {error: 'JEBISEO_ORIGINAL_RECEIPT_TOKEN_REQUIRED'};
  }
  if (SUBMIT.has(operation)) {
    if ((args.action !== undefined && args.action !== 'CLICK') ||
        (args.effect !== undefined && args.effect !== 'IRREVERSIBLE') ||
        (args.max_actions_in_call !== undefined && args.max_actions_in_call !== 1))
      return {error: 'JEBISEO_EXACT_ONE_SHOT_SUBMIT_REQUIRED'};
    if (args.data_class !== undefined && !['NONE', 'PUBLIC', 'NON_SENSITIVE', 'PERSONAL', 'SENSITIVE'].includes(args.data_class))
      return {error: 'JEBISEO_SUBMIT_DATA_CLASS_INVALID'};
    const indexed = Number.isSafeInteger(args.index) && args.index >= 0;
    const pointed = ['x', 'y', 'viewport_width', 'viewport_height'].every(k => Number.isFinite(args[k])) &&
      args.x >= 0 && args.y >= 0 && args.viewport_width > args.x && args.viewport_height > args.y;
    if (!indexed && !pointed) return {error: 'JEBISEO_ORIGINAL_SUBMIT_TARGET_REQUIRED'};
    if (args.index !== undefined && !indexed) return {error: 'JEBISEO_ORIGINAL_SUBMIT_TARGET_REQUIRED'};
    for (const key of ['based_on_screenshot_digest', 'current_screenshot_digest', 'screen_consent_digest', 'local_action_approval_digest']) {
      if (args[key] !== undefined && !matches(HEX64, args[key]))
        return {error: 'JEBISEO_ORIGINAL_ACTION_DIGEST_INVALID'};
    }
    for (const key of ['screen_grant_token', 'action_approval_grant_token']) {
      if (args[key] !== undefined && !token(args[key])) return {error: 'JEBISEO_ORIGINAL_GRANT_TOKEN_INVALID'};
    }
    if (operation === 'EXECUTE_SUBMIT' && (!token(args.lease_token) ||
        !token(args.action_approval_grant_token) || !matches(HEX64, args.local_action_approval_digest)))
      return {error: 'EXACT_PHONE_LOCAL_SEND_APPROVAL_REQUIRED'};
    // Setting the declared effect cannot grant it: original Secure56 and Android
    // still authenticate the exact target, task, lease and one-shot local grant.
    Object.assign(value, {action: 'CLICK', effect: 'IRREVERSIBLE',
      data_class: args.data_class ?? 'NON_SENSITIVE', max_actions_in_call: 1});
  }
  if (GUIDED.has(operation)) {
    const prepared = prepareJebiseoGuidedCall({operation,
      issuedArguments: args.guided_arguments, text: args.text});
    if (prepared.ok !== true) return {error: prepared.code};
    if (operation !== 'DISCOVER_INPUT' && prepared.identity.fieldId !== args.field_id)
      return {error: 'JEBISEO_GUIDED_TARGET_MISMATCH'};
    // The canonical target is the original native f_ ID. Mobile13 item_ IDs
    // have no public same-node mapping to it. Only the exact issued carrier is
    // forwarded; the external request value remains host coordination only.
    return {value: {...prepared.arguments, command_id: commandId}, identity: prepared.identity};
  }
  return {value};
}

/**
 * Process-local reservations only prevent accidental repeated calls here.
 * They are NOT durable receipts. The original host journal remains authoritative
 * after restart, changed command, unknown outcome or adapter replacement.
 */
export function createJebiseoMobilePort({callOriginalTool, runtimeMode = null, maxReservations = 256} = {}) {
  if (typeof callOriginalTool !== 'function') throw new TypeError('ORIGINAL_REGISTERED_MOBILE_CALL_REQUIRED');
  if (!Number.isSafeInteger(maxReservations) || maxReservations < 1 || maxReservations > 4096)
    throw new TypeError('JEBISEO_RESERVATION_LIMIT_INVALID');
  const reserved = new Set();
  return Object.freeze({
    capabilities: () => Object.freeze({backend: 'PHONE_RIGHT', available: runtimeMode === 'PHONE_RIGHT',
      hiddenUiSupported: false, originalToolNames: JEBISEO_ORIGINAL_MOBILE_TOOLS,
      routingModel: 'ANDROID_THEN_MANUAL', nativeGuidedArgumentsRequired: true,
      createsCommand: false, automaticReplay: false, processLocalReservationsOnly: true,
      originalDurableFenceRequired: true, realGeminiE2EVerified: false}),
    async run({visibility, command_id: commandId, operation, args = {}} = {}) {
      // The requested internal/hidden mode must never open or inspect the phone.
      if (visibility !== 'VISIBLE') return reject(operation, 'HIDDEN_EXECUTION_UNAVAILABLE');
      if (runtimeMode !== 'PHONE_RIGHT') return reject(operation, 'ORIGINAL_PHONE_RIGHT_RUNTIME_REQUIRED');
      if (!Object.hasOwn(ROUTES, operation)) return reject(operation, 'JEBISEO_MOBILE_OPERATION_UNSUPPORTED');
      if (!matches(HEX32, commandId)) return reject(operation, 'JEBISEO_CURRENT_COMMAND_REQUIRED');
      const checked = validateArgs(operation, args, commandId);
      if (checked.error) return reject(operation, checked.error);
      if (EFFECTS.has(operation)) {
        const identity = operation === 'OPEN'
          ? [operation, commandId, JEBISEO_GEMINI_WEB_URL]
          : operation === 'OPEN_APP'
          ? [operation, commandId, args.app_package]
          : GUIDED.has(operation)
          ? [operation, commandId, args.field_id ?? null]
          : [operation, commandId, args.device_id ?? null, args.task_digest];
        const key = hash(identity);
        if (reserved.has(key)) return reject(operation, 'JEBISEO_ACTION_ALREADY_ATTEMPTED_READ_ORIGINAL_RESULT');
        if (reserved.size >= maxReservations) return reject(operation, 'JEBISEO_LOCAL_RESERVATION_CAPACITY');
        reserved.add(key); // Before await; unknown/rejected outcomes never release it.
      }
      let raw;
      try { raw = await callOriginalTool(ROUTES[operation], checked.value); }
      catch (error) {
        // Preserve a bounded original machine code; never expose arbitrary exception text.
        const code = /^[A-Za-z0-9_-]{1,160}$/.test(error?.message ?? '')
          ? error.message : 'ORIGINAL_MOBILE_OUTCOME_UNKNOWN';
        return Object.freeze({...base(operation), ok: false, status: 'UNKNOWN', code,
          toolInvoked: true, raw: null, payload: null});
      }
      const payload = unwrapJebiseoMobileReply(raw);
      // `raw` and `payload` are private host evidence. In particular a complete
      // job or ok:true is not Google receipt, full reply, or ChatGPT delivery proof.
      const native = GUIDED.has(operation) ? classifyJebiseoGuidedJob(payload, {
        operation, identity: checked.identity, isError: raw?.isError === true
      }) : null;
      const outcome = native?.outcome ?? classifyJebiseoMobileOutcome(payload, {isError: raw?.isError === true});
      return Object.freeze({...base(operation), ...outcome,
        code: typeof payload?.code === 'string' ? payload.code : native?.nativeCode ?? 'ORIGINAL_MOBILE_RESULT',
        ...(native ? {nativeCode: native.nativeCode, nativePayload: native.nativePayload} : {}),
        originalStatus: payload?.status ?? null, toolInvoked: true, raw, payload});
    }
  });
}
