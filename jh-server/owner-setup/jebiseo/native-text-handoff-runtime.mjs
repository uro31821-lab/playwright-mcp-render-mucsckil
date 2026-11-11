/** Automatic selection -> exact Gemini menu -> reviewed native submit.
 * This is connected by original-host-binding to its private registered tools,
 * jobs, request capability and Stage26 completion markers. It never accepts a
 * caller's success callback, job, receipt, grant, endpoint or execute function.
 */
import {randomBytes} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {prepareJebiseoHandoff} from './handoff-request.mjs';
import {unwrapJebiseoMobileReply} from './mobile-port.mjs';
import {JEBISEO_NATIVE_PHASES, createJebiseoNativeSelectionDescriptor,
  validateJebiseoNativeSelection, createJebiseoNativeWireScope,
  createJebiseoNativeWire, nativeHandoffArguments, nativeHandoffJobMatches,
  inspectJebiseoNativeOutcome, nativeHandoffHash} from './native-text-handoff-port.mjs';

const HEX32 = /^[a-f0-9]{32}$/, HEX64 = /^[a-f0-9]{64}$/;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = code => {throw Error(code);};
const safeCode = value => typeof value === 'string' && /^[A-Za-z0-9_:-]{1,160}$/.test(value)
  ? value : 'JEBISEO_NATIVE_ORIGINAL_CALL_UNCONFIRMED';
const copy = value => Object.freeze(structuredClone(value));
const time = value => Number.isSafeInteger(value) && value > 0;
const readers = ['getOriginalTool', 'readCurrentState', 'findOriginalReturnedJob',
  'readOriginalJob', 'readAuthenticatedRequestScope', 'readOriginalJobScope'];
const NO_DISPATCH_CODES = new Set(['JEBISEO_NATIVE_DURABLE_UNRESOLVED_EFFECT',
  'JEBISEO_NATIVE_DURABLE_STATE_UNAVAILABLE']);
const signedKeys = ['id', 'type', 'targetDeviceId', 'secureSessionId', 'secureNonce',
  'secureExpiresAt', 'securePayloadDigest', 'secureMac', 'commandId', 'createdAtMs',
  'action', 'text', 'value', 'mcpToolName', 'taskDigest', 'targetDeviceDigest',
  'secureRequestedEffect', 'containsCredential', 'dataClass', 'secureInvocationExpiresAt'];
const jobIdentity = job => Object.fromEntries(signedKeys.map(key => [key, job[key]]));
function ownerOf(state) {
  if (!plain(state) || typeof state.deviceId !== 'string' || !state.deviceId ||
      !HEX32.test(state.commandId ?? '') || typeof state.secureSessionId !== 'string' || !state.secureSessionId ||
      !HEX64.test(state.runtimeId ?? '') || !HEX64.test(state.deviceDigest ?? '') ||
      state.deviceDigest !== state.sessionDeviceDigest || state.secureBridgeVersion !== 56)
    fail('JEBISEO_NATIVE_ORIGINAL_PHONE_BINDING_REQUIRED');
  return {deviceId: state.deviceId, commandId: state.commandId, secureSessionId: state.secureSessionId,
    deviceDigest: state.deviceDigest, runtimeId: state.runtimeId};
}
function protectedState(state, hooks) {
  const focus = state.focus;
  if (focus?.state !== 'observed' || focus.present !== true || focus.active !== true ||
      focus.currentCommandMatches !== true || !Number.isFinite(focus.remainingMs) || focus.remainingMs <= 0 ||
      state.durableHooks !== hooks || ['capture', 'beforeDispatch', 'acceptedCompletion',
        'uncertainEffectsForMaintenance'].some(key => typeof hooks?.[key] !== 'function')) return false;
  try {const count = hooks.uncertainEffectsForMaintenance(); return Number.isSafeInteger(count) && count >= 0;}
  catch {return false;}
}

/** originalHost is supplied only by the installed private host boundary.
 * The public createHandoffRuntime facade never accepts or forwards it.
 */
export function createJebiseoNativeTextHandoffRuntime({request, deviceId, commandId,
  nativeSelection = null, originalHost, scheduler, now = Date.now} = {}) {
  if (readers.some(key => typeof originalHost?.[key] !== 'function') ||
      typeof scheduler?.run !== 'function' || typeof now !== 'function')
    fail('JEBISEO_NATIVE_ORIGINAL_HOST_REQUIRED');
  const prepared = prepareJebiseoHandoff(request);
  if (prepared.active !== true) fail('JEBISEO_NATIVE_CURRENT_REQUEST_REQUIRED');
  const descriptor = nativeSelection ?? createJebiseoNativeSelectionDescriptor(prepared);
  if (!validateJebiseoNativeSelection(prepared, descriptor)) fail('JEBISEO_NATIVE_SELECTION_SCOPE_REQUIRED');
  const wireScope = createJebiseoNativeWireScope(prepared, descriptor);
  if (!originalHost.readAuthenticatedRequestScope()) fail('JEBISEO_AUTHENTICATED_REQUEST_REQUIRED');
  const state = originalHost.readCurrentState(), owner = copy(ownerOf(state)), hooks = state.durableHooks;
  if (deviceId !== owner.deviceId || commandId !== owner.commandId || !protectedState(state, hooks))
    fail('JEBISEO_NATIVE_ORIGINAL_DISPATCH_PROTECTION_REQUIRED');
  const scheduleScope = {deviceId, commandId, taskRef: prepared.taskRef};
  const plans = new Map(), completed = [], records = [];
  let started = false, running = null, phaseIndex = 0, previousReceipt = '', receiptExpiresAt = null;
  let pending = null, invoked = false, dispatched = false;
  let status = 'READY', code = 'JEBISEO_NATIVE_AUTO3_READY', submissionVerified = false;

  function currentScope() {
    const scope = originalHost.readAuthenticatedRequestScope();
    if (!scope) fail('JEBISEO_AUTHENTICATED_REQUEST_REQUIRED');
    const live = originalHost.readCurrentState();
    if (!isDeepStrictEqual(ownerOf(live), owner) || !protectedState(live, hooks))
      fail('JEBISEO_NATIVE_ORIGINAL_BINDING_CHANGED');
    return scope;
  }
  function view() {
    return Object.freeze({schema: 'jh.jebiseo-native-handoff.v1', deliveryMode: 'AUTO_TEXT_SELECTION',
      ok: status === 'COMPLETED', active: true,
      taskRef: prepared.taskRef, threadRef: prepared.threadRef, sourceRef: prepared.sourceRef,
      requestDigest: prepared.requestDigest, promptDigest: prepared.promptDigest,
      layout: 'LEFT_GPT_RIGHT_GEMINI', status, code,
      phase: JEBISEO_NATIVE_PHASES[Math.min(phaseIndex, 2)], completedPhases: Object.freeze([...completed]),
      toolInvoked: invoked, phoneActionDispatched: dispatched, requestSent: submissionVerified,
      selectionVerified: completed.includes('SELECT_REQUEST_TEXT'),
      menuClickVerified: completed.includes('CLICK_GEMINI_MENU'), submitClickVerified: submissionVerified,
      submissionVerified, resultVerified: false, businessResultVerified: false,
      geminiReplyVerified: false, automaticReplay: false, automaticResume: false,
      approvalPending: status === 'AWAITING_APPROVAL',
      canResume: ['AWAITING_APPROVAL', 'AWAITING_COMPLETION'].includes(status),
      readbackRequired: ['UNKNOWN', 'AWAITING_COMPLETION'].includes(status),
      ...(pending?.record ? {originalJobRef: 'jobDigest:' + nativeHandoffHash(pending.record.job.id)} : {})});
  }
  function terminate(nextStatus, nextCode) {status = nextStatus; code = safeCode(nextCode); return view();}
  function plan() {
    const phase = JEBISEO_NATIVE_PHASES[phaseIndex];
    if (!plans.has(phase)) plans.set(phase, createJebiseoNativeWire(wireScope, phase,
      randomBytes(16).toString('hex'), previousReceipt));
    return plans.get(phase);
  }
  function readCompletion(record) {
    if (!record || originalHost.readOriginalJob(record.job.id) !== record.job ||
        originalHost.readOriginalJobScope(record.job) !== record.scope ||
        !isDeepStrictEqual(jobIdentity(record.job), record.identity))
      fail('JEBISEO_NATIVE_ORIGINAL_JOB_CHANGED');
    const job = record.job;
    if (['queued', 'in_progress'].includes(job.status)) return null;
    // This exact error is produced by the candidate's poll admission BEFORE
    // original beforeDispatch reserves a row or the phone receives the job.
    // It is an original host denial, not a phone success receipt.
    if (job.status === 'error' && NO_DISPATCH_CODES.has(job.error) &&
        job.startedAtMs == null && job.result == null && job.stage26CompletionDigest56 == null)
      return {hostDispatchRejected: true, code: job.error};
    if (job.status !== 'complete' || !HEX64.test(job.stage26CompletionDigest56 ?? '') ||
        !plain(job.result) || typeof job.result.ok !== 'boolean' || job.error != null ||
        !time(job.startedAtMs) || job.startedAtMs < job.createdAtMs || typeof job.completedAt !== 'string')
      fail('JEBISEO_NATIVE_SIGNED_COMPLETION_REQUIRED');
    const ended = Date.parse(job.completedAt);
    if (!time(ended) || ended < job.startedAtMs || ended > now() ||
        new Date(ended).toISOString() !== job.completedAt)
      fail('JEBISEO_NATIVE_COMPLETION_TIME_INVALID');
    const completion = {marker: job.stage26CompletionDigest56, completedAt: job.completedAt,
      startedAtMs: job.startedAtMs, resultDigest: nativeHandoffHash(JSON.stringify(job.result))};
    if (record.completion && !isDeepStrictEqual(record.completion, completion))
      fail('JEBISEO_NATIVE_COMPLETION_CHANGED');
    record.completion ??= copy(completion);
    return structuredClone(job.result);
  }
  function recordReturned(raw, args, requestScope) {
    if (raw?.isError === true) fail('JEBISEO_NATIVE_ORIGINAL_RETURN_CHANGED');
    const job = originalHost.findOriginalReturnedJob({raw, toolName: 'life_android_step', args, requestScope});
    if (!plain(job) || !/^job_[0-9]+$/.test(job.id ?? '') || originalHost.readOriginalJob(job.id) !== job ||
        job.targetDeviceId !== owner.deviceId || job.secureSessionId !== owner.secureSessionId ||
        !time(job.createdAtMs) || job.createdAtMs > now() ||
        !HEX64.test(job.secureMac ?? '') || !HEX64.test(job.securePayloadDigest ?? '') ||
        !nativeHandoffJobMatches(job, args, owner.deviceDigest))
      fail('JEBISEO_NATIVE_ORIGINAL_JOB_REQUIRED');
    const scope = originalHost.readOriginalJobScope(job);
    if (!scope || scope.requestScope !== requestScope || scope.commandId !== commandId ||
        scope.deviceId !== deviceId || scope.secureSessionId !== owner.secureSessionId || scope.runtimeId !== owner.runtimeId)
      fail('JEBISEO_NATIVE_ORIGINAL_INVOCATION_REQUIRED');
    const returned = unwrapJebiseoMobileReply(raw);
    const hostDenied = returned?.status === 'error' && job.status === 'error' &&
      NO_DISPATCH_CODES.has(job.error) && returned.error === job.error && returned.result === null &&
      returned.completedAt === job.completedAt && job.startedAtMs == null && job.stage26CompletionDigest56 == null;
    if (!plain(returned) || returned.type !== 'agent_step' || returned.idDigest !== nativeHandoffHash(job.id) ||
        (!hostDenied && (returned.status === 'complete'
          ? job.status !== 'complete' || !isDeepStrictEqual(returned.result, job.result) ||
            returned.completedAt !== job.completedAt || (returned.error ?? null) !== (job.error ?? null)
          : !['queued', 'in_progress'].includes(returned.status) || returned.result !== null ||
            returned.error !== null || returned.completedAt !== null)))
      fail('JEBISEO_NATIVE_ORIGINAL_RETURN_CHANGED');
    const record = {job, scope, identity: copy(jobIdentity(job)), completion: null};
    records.push(record);
    return record;
  }
  function applyOutcome(record, wire) {
    const result = readCompletion(record);
    if (result === null) {
      pending = {wire, record}; return terminate('AWAITING_COMPLETION', 'JEBISEO_NATIVE_COMPLETION_PENDING');
    }
    if (result.hostDispatchRejected === true) {
      pending = null; return terminate('BLOCKED', result.code);
    }
    const outcome = inspectJebiseoNativeOutcome(result, wire, now());
    dispatched ||= outcome.dispatched;
    if (outcome.kind === 'APPROVAL_PENDING') {
      pending = {wire, record}; return terminate('AWAITING_APPROVAL', outcome.code);
    }
    if (outcome.kind !== 'VERIFIED') {
      pending = null; return terminate(outcome.kind, outcome.code);
    }
    completed.push(wire.phase); phaseIndex++; pending = null;
    if (outcome.submissionVerified === true) {
      submissionVerified = true; return terminate('COMPLETED', outcome.code);
    }
    previousReceipt = outcome.receipt; receiptExpiresAt = outcome.expiresAt;
    return null;
  }
  async function dispatch(wire) {
    const requestScope = currentScope(), original = originalHost.getOriginalTool('life_android_step');
    if (typeof original?.schema?.parse !== 'function' || typeof original.handler !== 'function')
      fail('JEBISEO_ORIGINAL_REGISTERED_TOOL_REQUIRED');
    const args = nativeHandoffArguments(wire, commandId), parsed = original.schema.parse(args);
    if (!isDeepStrictEqual(parsed, args)) fail('JEBISEO_NATIVE_ORIGINAL_SCHEMA_CHANGED');
    if (currentScope() !== requestScope) fail('JEBISEO_AUTHENTICATED_REQUEST_REQUIRED');
    // Liveness checks allow reading a retained pending job while its own row
    // is UNKNOWN. A NEW effect must wait for all original durable uncertainty
    // to be resolved; a fresh requestId/expiry cannot evade a restart fence.
    let unresolved;
    try {unresolved = hooks.uncertainEffectsForMaintenance();} catch {}
    if (!Number.isSafeInteger(unresolved) || unresolved < 0)
      return terminate('BLOCKED', 'JEBISEO_NATIVE_DURABLE_STATE_UNAVAILABLE');
    if (unresolved !== 0) return terminate('BLOCKED', 'JEBISEO_NATIVE_DURABLE_UNRESOLVED_EFFECT');
    invoked = true;
    const raw = await original.handler(parsed);
    if (currentScope() !== requestScope) fail('JEBISEO_AUTHENTICATED_REQUEST_REQUIRED');
    return applyOutcome(recordReturned(raw, parsed, requestScope), wire);
  }
  async function advance(resume) {
    let attempted = false;
    try {
      currentScope();
      if (resume && status === 'AWAITING_COMPLETION') {
        const outcome = applyOutcome(pending.record, pending.wire);
        if (outcome) return outcome;
      } else if (resume && status !== 'AWAITING_APPROVAL') return view();
      while (phaseIndex < JEBISEO_NATIVE_PHASES.length) {
        currentScope();
        if (phaseIndex > 0 && (!time(receiptExpiresAt) || receiptExpiresAt <= now()))
          return terminate('BLOCKED', 'JEBISEO_NATIVE_PHONE_RECEIPT_EXPIRED');
        status = 'RUNNING'; code = 'JEBISEO_NATIVE_STEP_RUNNING';
        attempted = true;
        const outcome = await dispatch(plan());
        if (outcome) return outcome;
      }
      return view();
    } catch (error) {
      // Once the original handler may have started, never turn a lost response
      // into another click. Only retained original completion can reconcile it.
      pending = null;
      return terminate(attempted ? 'UNKNOWN' : 'BLOCKED', safeCode(error?.message));
    }
  }
  function run(resume) {
    if (running) return running;
    running = scheduler.run(scheduleScope, () => advance(resume)).finally(() => {running = null;});
    return running;
  }
  function start() {
    if (started) return running ?? Promise.resolve(view());
    started = true; return run(false);
  }
  function resume() {
    if (!started || !['AWAITING_APPROVAL', 'AWAITING_COMPLETION'].includes(status))
      return Promise.resolve(view());
    return run(true);
  }
  return Object.freeze({start, resume, view});
}
