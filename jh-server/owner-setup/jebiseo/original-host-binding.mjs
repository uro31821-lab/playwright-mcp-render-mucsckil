/**
 * Process-local candidate binding to the ORIGINAL Secure56 host closures.
 * Only original-host-composition supplies these readers in a deployed host.
 * They are private capabilities, never MCP arguments or a public JSON proof.
 * No journal is reserved here: the original handler retains capture ->
 * beforeDispatch -> authenticated acceptedCompletion -> Stage26 marker.
 */
import {AsyncLocalStorage} from 'node:async_hooks';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {createJebiseoRuntime, createJebiseoDeviceScheduler,
  jebiseoTargetBindingDigest} from './host-runtime.mjs';
import {JEBISEO_GEMINI_WEB_URL, JEBISEO_ORIGINAL_MOBILE_TOOLS,
  unwrapJebiseoMobileReply} from './mobile-port.mjs';
import {prepareJebiseoGuidedCall} from './guided-form.mjs';
import {inspectJebiseoNativeScreen, inspectJebiseoPostActionObservation} from './native-screen-proof.mjs';
import {describeOpenCompletion} from '../deployment/jh167-open-completion.mjs';
import {getJebiseoAndroidTarget, inspectJebiseoAndroidAppObservation} from './android-app.mjs';
import {prepareJebiseoHandoff} from './handoff-request.mjs';
import {createJebiseoHandoffSession} from './handoff-runtime.mjs';

const ROUTES = Object.freeze({OPEN: 'life_web_navigate', SNAPSHOT: 'life_web_snapshot',
  OPEN_APP: 'life_android_open', APP_OBSERVE: 'life_android_computer_inspect',
  FORM_SNAPSHOT: 'life_android_snapshot', DISCOVER_INPUT: 'life_android_step',
  DISMISS_NOTICE: 'life_android_step', TYPE: 'life_android_step',
  INSPECT_SUBMIT: 'life_android_computer_inspect', PREPARE_SUBMIT: 'life_android_computer_prepare',
  APPROVAL_REQUEST: 'life_android_action_approval_request',
  APPROVAL_STATUS: 'life_android_action_approval_status',
  EXECUTE_SUBMIT: 'life_android_execute_computer_action',
  RECEIPT_STATUS: 'life_android_pending_approval_receipt_status', JOB_STATUS: 'life_job_status'});
const ALLOWED = new Set(JEBISEO_ORIGINAL_MOBILE_TOOLS);
const GUIDED = new Set(['DISCOVER_INPUT', 'DISMISS_NOTICE', 'TYPE']);
const EFFECTS = new Set(['OPEN', 'OPEN_APP', ...GUIDED, 'APPROVAL_REQUEST', 'EXECUTE_SUBMIT']);
const RECOVERY = new Set(['JOB_STATUS', 'RECEIPT_STATUS', 'APPROVAL_STATUS']);
const H64 = /^[0-9a-f]{64}$/, H32 = /^[0-9a-f]{32}$/, JOB = /^job_[0-9]+$/;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const nonempty = value => typeof value === 'string' && value.length > 0 && value.length <= 200;
const hex64 = value => typeof value === 'string' && H64.test(value);
const time = value => Number.isSafeInteger(value) && value > 0;
const hash = value => createHash('sha256').update(value, 'utf8').digest('hex');
const APP_INSPECT_FIXED = Object.freeze({action: 'WAIT', effect: 'READ_ONLY', dataClass: 'NONE',
  mcpToolName: 'life_android_computer_inspect', secureRequestedEffect: 'READ_ONLY',
  index: 0, viewportWidth: 0, viewportHeight: 0, scrollX: 0, scrollY: 0, waitMs: 0,
  maxActionsInCall: 1, containsCredential: false});
const APP_INSPECT_FORBIDDEN = ['x', 'y', 'keys', 'dragPath', 'textDigest', 'textValue',
  'basedOnScreenshotDigest', 'currentScreenshotDigest', 'screenGrantToken',
  'actionApprovalGrantToken', 'requestToken', 'runDigest', 'leaseToken', 'screenConsentDigest',
  'localActionApprovalDigest'];
const appArguments = (task, operation) => operation === 'OPEN_APP'
  ? {target: getJebiseoAndroidTarget(task.appPackage)?.target, url: '', command_id: task.commandId}
  : {action: 'WAIT', effect: 'READ_ONLY', data_class: 'NONE', max_actions_in_call: 1,
    task_digest: task.taskDigest, command_id: task.commandId};
function appInspectJob(job, task) {
  return job.type === 'computer_use_inspect' && job.taskDigest === task.taskDigest &&
    job.taskId === task.taskDigest && Object.entries(APP_INSPECT_FIXED).every(([key, value]) => job[key] === value) &&
    APP_INSPECT_FORBIDDEN.every(key => !Object.hasOwn(job, key));
}
const fail = code => {throw Error(code);};
const blocked = code => Object.freeze({schema: 'jh.jebiseo-host-result.v1', code,
  ok: false, status: 'BLOCKED', toolInvoked: false, phoneDispatchVerified: false,
  externalEffectVerified: false, geminiReplyVerified: false, automaticReplay: false,
  automaticResume: false});

function frozenCopy(value) {
  const copy = structuredClone(value);
  const freeze = item => {
    if (item && typeof item === 'object' && !Object.isFrozen(item)) {
      Object.freeze(item);
      for (const child of Object.values(item)) freeze(child);
    }
    return item;
  };
  return freeze(copy);
}
function completedTime(value) {
  if (typeof value !== 'string' || value.length > 40) return null;
  const n = Date.parse(value);
  return time(n) && new Date(n).toISOString() === value ? n : null;
}
function durableLive(hooks) {
  if (!hooks || ['capture', 'beforeDispatch', 'acceptedCompletion',
    'uncertainEffectsForMaintenance'].some(key => typeof hooks[key] !== 'function')) return false;
  // This is the original read-only liveness check, NOT a second reservation or
  // a claim that other tasks' unresolved journal records have been settled.
  try {
    const count = hooks.uncertainEffectsForMaintenance();
    return Number.isSafeInteger(count) && count >= 0;
  } catch {return false;}
}
function focusCurrent(focus) {
  return focus?.state === 'observed' && focus.present === true && focus.active === true &&
    focus.currentCommandMatches === true && Number.isFinite(focus.remainingMs) && focus.remainingMs > 0;
}
function stateIdentity(state) {
  return plain(state) && nonempty(state.deviceId) && H32.test(state.commandId ?? '') &&
    nonempty(state.secureSessionId) && hex64(state.runtimeId) && hex64(state.deviceDigest) &&
    state.sessionDeviceDigest === state.deviceDigest && state.secureBridgeVersion === 56;
}
function sameOwner(a, b) {
  return a.deviceId === b.deviceId && a.secureSessionId === b.secureSessionId &&
    a.deviceDigest === b.deviceDigest && a.runtimeId === b.runtimeId;
}
function identity(job, commandId) {
  return {id: job.id, type: job.type, deviceId: job.targetDeviceId,
    secureSessionId: job.secureSessionId, commandId, createdAtMs: job.createdAtMs,
    ...Object.fromEntries(['action', 'text', 'value', 'url', 'target',
      ...(job.type === 'computer_use_inspect' ? [...Object.keys(APP_INSPECT_FIXED),
        ...APP_INSPECT_FORBIDDEN, 'taskId', 'taskDigest', 'secureInvocationExpiresAt'] : [])]
      .filter(key => Object.hasOwn(job, key)).map(key => [key, job[key]]))};
}

/**
 * The composition authenticates the exact returned object/parsed arguments
 * against its private invocation record. This second join checks the known
 * original job envelope, never arbitrary nested page text or diagnostic JSON.
 */
function returnedCompletionMatches(raw, job) {
  if (raw?.isError === true) return false;
  const p = unwrapJebiseoMobileReply(raw);
  const views = [p, ...(plain(p?.job) ? [unwrapJebiseoMobileReply(p.job)] : [])];
  return views.some(view => plain(view) && view.type === job.type && view.status === job.status &&
    view.idDigest === hash(job.id) && Object.hasOwn(view, 'result') &&
    isDeepStrictEqual(view.result, job.result ?? null) &&
    (view.error ?? null) === (job.error ?? null) &&
    (view.completedAt ?? null) === (job.completedAt ?? null));
}
function returnedPendingMatches(raw, job) {
  if (raw?.isError === true) return false;
  const p = unwrapJebiseoMobileReply(raw);
  const views = [p, ...(plain(p?.job) ? [unwrapJebiseoMobileReply(p.job)] : [])];
  return views.some(view => plain(view) && view.type === job.type &&
    ['queued', 'in_progress'].includes(view.status) && view.idDigest === hash(job.id) &&
    view.result === null && view.error === null && view.completedAt === null);
}
function returnedAppQueueMatches(raw, job) {
  if (raw?.isError === true) return false;
  const p = unwrapJebiseoMobileReply(raw);
  return plain(p) && p.route === 'android_right' && p.operation === 'native_app_open' &&
    typeof p.queued === 'boolean' && p.jobId === job.id && p.requiresFreshWindowReadback === true &&
    p.screenVerified === false && p.automaticReplay === false &&
    Object.keys(p).every(key => ['route', 'operation', 'queued', 'jobId',
      'requiresFreshWindowReadback', 'screenVerified', 'automaticReplay'].includes(key));
}

/**
 * Required functions must read the actual generated host's private maps and
 * request scope. Supplying lookalike JSON/readers in an application is a test
 * fixture, not production authentication. No secrets or original job objects
 * are returned by the facade. It is intentionally opt-in and process-local.
 */
export function createJebiseoOriginalHostBinding({getOriginalTool, readCurrentState,
  findOriginalReturnedJob, readOriginalJob, readAuthenticatedRequestScope,
  readOriginalJobScope, now = Date.now} = {}) {
  if ([getOriginalTool, readCurrentState, findOriginalReturnedJob, readOriginalJob,
    readAuthenticatedRequestScope, readOriginalJobScope, now].some(fn => typeof fn !== 'function'))
    fail('JEBISEO_ORIGINAL_HOST_READERS_REQUIRED');
  const steps = new AsyncLocalStorage(), scheduler = createJebiseoDeviceScheduler();
  const entries = new Map(), commandTasks = new Map(), handoffs = new Map();
  let nextInvocationOrdinal = 0;

  function currentStep(entry) {
    const step = steps.getStore();
    if (!step || step.entry !== entry || step.live !== true ||
        readAuthenticatedRequestScope() !== step.requestScope)
      fail('JEBISEO_AUTHENTICATED_REQUEST_REQUIRED');
    return step;
  }
  function currentState(entry, {recovery = false} = {}) {
    currentStep(entry);
    const state = readCurrentState();
    if (!stateIdentity(state) || state.deviceId !== entry.task.deviceId)
      fail('JEBISEO_ORIGINAL_PHONE_BINDING_REQUIRED');
    // Stale receipt reads retain the original handler's independent checks.
    // They cannot become current target evidence or clear an effect barrier.
    if (!recovery && (!sameOwner(state, entry.owner) || state.commandId !== entry.task.commandId))
      fail('JEBISEO_ORIGINAL_BINDING_CHANGED');
    return state;
  }
  function recordJob(entry, step, raw, toolName, args) {
    const job = findOriginalReturnedJob({raw, toolName, args, requestScope: step.requestScope});
    if (!plain(job) || !JOB.test(job.id ?? '') || readOriginalJob(job.id) !== job ||
        job.targetDeviceId !== entry.task.deviceId || job.secureSessionId !== entry.owner.secureSessionId ||
        !time(job.createdAtMs) || job.createdAtMs > now()) return null;
    if (step.operation === 'JOB_STATUS') {
      const retained = [...entry.effects.values()].find(effect => effect.operation === 'OPEN_APP' &&
        effect.record?.job === job && effect.record.identity.id === args.job_id)?.record;
      if (retained) return returnedPendingMatches(raw, job) ||
        (returnedCompletionMatches(raw, job) && originalCompletion(entry, retained)) ? retained : null;
    }
    let commandId = job.commandId;
    let snapshotScope = null;
    if (job.type === 'agent_snapshot' || ['OPEN_APP', 'APP_OBSERVE'].includes(step.operation)) {
      snapshotScope = readOriginalJobScope(job);
      if (!snapshotScope || snapshotScope.requestScope !== step.requestScope ||
          snapshotScope.commandId !== entry.task.commandId || snapshotScope.deviceId !== entry.task.deviceId ||
          snapshotScope.secureSessionId !== entry.owner.secureSessionId ||
          snapshotScope.runtimeId !== entry.owner.runtimeId ||
          (commandId !== undefined && commandId !== snapshotScope.commandId)) return null;
      commandId = snapshotScope.commandId;
    }
    if (commandId !== entry.task.commandId ||
        (job.targetDeviceDigest !== undefined && job.targetDeviceDigest !== null &&
          job.targetDeviceDigest !== entry.owner.deviceDigest)) return null;
    if (step.operation === 'OPEN' && (job.type !== 'open_url' || job.url !== JEBISEO_GEMINI_WEB_URL)) return null;
    if (step.operation === 'OPEN_APP' && (job.type !== 'open_url' || job.url !== '' ||
        job.target !== getJebiseoAndroidTarget(entry.task.appPackage)?.target || !returnedAppQueueMatches(raw, job)))
      return null;
    if (step.operation === 'APP_OBSERVE' && !appInspectJob(job, entry.task)) return null;
    if (GUIDED.has(step.operation) && (job.type !== 'agent_step' ||
        ['action', 'text', 'value'].some(key => job[key] !== args[key]))) return null;
    const record = {job, identity: frozenCopy(identity(job, commandId)), snapshotScope,
      requestScope: step.requestScope, completion: null, operation: step.operation,
      capturedAtMs: now(), invocationOrdinal: step.invocationOrdinal};
    // The original wait can return a typed pending view immediately before
    // authenticated completion mutates that same registered job. Preserve the
    // exact correlation in that race; a mismatched COMPLETE view is rejected.
    if (job.status === 'complete' &&
        (!(returnedCompletionMatches(raw, job) || returnedPendingMatches(raw, job) ||
           (step.operation === 'OPEN_APP' && returnedAppQueueMatches(raw, job))) ||
          !originalCompletion(entry, record)))
      return null;
    return record;
  }
  function originalCompletion(entry, record) {
    if (!record || readOriginalJob(record.identity.id) !== record.job) return null;
    const job = record.job, saved = record.identity;
    if (!isDeepStrictEqual(identity(job, job.type === 'agent_snapshot'
      ? record.snapshotScope?.commandId : job.commandId), saved)) return null;
    if (record.snapshotScope) {
      const scope = readOriginalJobScope(job);
      if (scope !== record.snapshotScope || scope.requestScope !== record.requestScope ||
          scope.runtimeId !== entry.owner.runtimeId ||
          (job.commandId !== undefined && job.commandId !== scope.commandId)) return null;
    }
    if (job.status !== 'complete' || !hex64(job.stage26CompletionDigest56) ||
        !plain(job.result) || typeof job.result.ok !== 'boolean' ||
        (job.targetDeviceDigest !== undefined && job.targetDeviceDigest !== null &&
          job.targetDeviceDigest !== entry.owner.deviceDigest)) return null;
    const at = completedTime(job.completedAt);
    if (!time(job.startedAtMs) || job.startedAtMs < saved.createdAtMs ||
        at === null || at < job.startedAtMs || at > now()) return null;
    // Stage26 hashes the original HTTP body AFTER existing HMAC/nonce and
    // durable acceptance. It is NOT sha256(JSON.stringify(result)). The marker
    // is trusted only on this captured, still-registered original job object.
    const accepted = {marker: job.stage26CompletionDigest56, startedAtMs: job.startedAtMs,
      completedAt: job.completedAt, resultDigest: hash(JSON.stringify(job.result)),
      error: job.error ?? null};
    if (record.completion && !isDeepStrictEqual(record.completion, accepted)) return null;
    if (!record.completion) record.completion = frozenCopy(accepted);
    // Only the narrow original observation shape reaches the pure inspector.
    return frozenCopy({type: job.type, status: job.status, result: job.result,
      error: job.error ?? null, createdAtMs: saved.createdAtMs,
      startedAtMs: job.startedAtMs, completedAt: job.completedAt,
      ...(record.operation === 'APP_OBSERVE' ? Object.fromEntries(
        ['mcpToolName', 'secureRequestedEffect', 'action', 'effect', 'dataClass', 'taskDigest']
          .map(key => [key, job[key]])) : {})});
  }
  function inspection(entry, operation) {
    const snapshot = originalCompletion(entry, entry.snapshot);
    const discovery = originalCompletion(entry, entry.discovery);
    if (!snapshot) return {ok: false, code: 'JEBISEO_ORIGINAL_NATIVE_SNAPSHOT_REQUIRED'};
    return inspectJebiseoNativeScreen({snapshot, ...(discovery ? {discovery} : {}), operation, now: now()});
  }
  function readback(entry, effectKey) {
    const pending = effectKey ? entry.effects.get(effectKey) : null;
    if (!pending || !pending.record) return null;
    const complete = originalCompletion(entry, pending.record);
    if (!complete) return null;
    let applied = false, appReadback = null;
    if (pending.operation === 'OPEN' && pending.record.job.type === 'open_url' &&
        pending.record.job.url === JEBISEO_GEMINI_WEB_URL) {
      applied = describeOpenCompletion(pending.record.job, {commandId: entry.task.commandId,
        sessionId: entry.owner.secureSessionId}).executionStatus === 'EFFECT_CONFIRMED';
    } else if (pending.operation === 'OPEN_APP') {
      const r = complete.result, target = getJebiseoAndroidTarget(entry.task.appPackage);
      const opened = target && pending.record.job.type === 'open_url' &&
        pending.record.job.target === target.target && pending.record.job.url === '' &&
        complete.error === null && r.ok === true && r.rightPaneVerified === true &&
        r.pageOrScrollRestored === false && r.resultVerified === false &&
        ((r.code === 'RIGHT_PANE_VERIFIED' && r.launchAccepted === true) ||
          (r.code === 'RIGHT_PANE_ALREADY_VISIBLE' && r.launchAccepted === false));
      const record = entry.appObservation, observation = originalCompletion(entry, record);
      const after = completedTime(complete.completedAt);
      if (opened && observation && after !== null && record.job !== pending.record.job &&
          record.identity.id !== pending.record.identity.id &&
          record.invocationOrdinal > pending.record.invocationOrdinal &&
          observation.createdAtMs >= after && observation.startedAtMs >= after &&
          appInspectJob(record.job, entry.task)) {
        const inspected = inspectJebiseoAndroidAppObservation({job: observation,
          taskDigest: entry.task.taskDigest, expectedPackage: entry.task.appPackage, now: now()});
        if (inspected.ok === true) {
          applied = true;
          appReadback = {appPackage: entry.task.appPackage, appWindowVerified: true,
            observationScope: inspected.evidence.scope,
            alreadyVisible: r.code === 'RIGHT_PANE_ALREADY_VISIBLE'};
        }
      }
    } else if (pending.operation === 'DISCOVER_INPUT' && entry.discovery === pending.record) {
      // Discovery can settle only after an independent, later signed snapshot
      // joins the same original issuer/revision/empty field. Its completion
      // alone is not sufficient, even though it is nominally a read action.
      const snapshot = originalCompletion(entry, entry.snapshot);
      const after = completedTime(complete.completedAt);
      if (snapshot && entry.snapshot.identity.id !== pending.record.identity.id &&
          entry.snapshot.invocationOrdinal > pending.record.invocationOrdinal &&
          snapshot.createdAtMs >= after && snapshot.startedAtMs >= after) {
        const proof = inspection(entry, 'TYPE');
        applied = proof.ok === true && proof.evidence.snapshotCompletedAtMs >= after &&
          proof.evidence.observedAtMs + 5000 >= after && pending.target &&
          ['windowId', 'displayId', 'chatWindowId', 'formRevision', 'origin']
            .every(key => proof.evidence[key] === pending.target[key]) &&
          isDeepStrictEqual(proof.evidence.workBounds, pending.target.workBounds) &&
          isDeepStrictEqual(proof.evidence.chatBounds, pending.target.chatBounds);
      }
    }
    // TYPE's field_value_verified and DISMISS's actionAccepted are not an
    // independent current value/notice-absence proof. No such post-action
    // producer exists here; leave their pending barrier intact. Likewise no
    // Gemini send, response identity or original three-feature success is
    // inferred, and no generic failure is promoted to VERIFIED_NOT_APPLIED.
    if (!applied) return null;
    return Object.freeze({source: 'ORIGINAL_SECURE56', effectKey,
      operation: pending.operation, taskRef: entry.task.taskRef, deviceId: entry.task.deviceId,
      commandId: entry.task.commandId, secureSessionId: entry.owner.secureSessionId,
      outcome: 'VERIFIED_APPLIED', jobId: pending.record.identity.id,
      ...(appReadback ?? {}),
      ...(pending.operation === 'OPEN' ? {url: JEBISEO_GEMINI_WEB_URL} : {})});
  }
  // Diagnostics never reconcile an effect. Only the exact pending original
  // completion and a separate later original snapshot may reach the inspector.
  function postActionObservation(entry, effectKey, operation) {
    const pending = effectKey ? entry.effects.get(effectKey) : null;
    if (!pending || pending.operation !== operation || !['TYPE', 'DISMISS_NOTICE'].includes(operation))
      return null;
    const diagnostic = (code, completionReceived = false, inspected = null) => frozenCopy({
      code, ok: false, authorityVerified: false, readbackRequired: true,
      currentValueVerified: false, noticeDismissedVerified: false, completionReceived,
      observationValidated: inspected?.observationValidated === true,
      ...(inspected?.observationValidated === true ? {facts: inspected.facts} : {})
    });
    try {
      currentState(entry);
      const complete = originalCompletion(entry, pending.record);
      currentState(entry);
      if (!complete) return diagnostic('JEBISEO_ORIGINAL_EFFECT_COMPLETION_REQUIRED');
      const record = entry.snapshot, snapshot = originalCompletion(entry, record);
      currentState(entry);
      const after = completedTime(complete.completedAt);
      if (!snapshot || !pending.target || after === null ||
          record.job === pending.record.job || record.identity.id === pending.record.identity.id ||
          record.invocationOrdinal <= pending.record.invocationOrdinal ||
          snapshot.createdAtMs < after || snapshot.startedAtMs < after)
        return diagnostic('JEBISEO_ORIGINAL_POST_ACTION_SNAPSHOT_REQUIRED', true);
      const inspected = inspectJebiseoPostActionObservation({
        operation, beforeEvidence: pending.target, afterSnapshot: snapshot, now: now()});
      currentState(entry);
      if (!plain(inspected) || !/^[A-Z][A-Z0-9_]{1,159}$/.test(inspected.code ?? '') ||
          (inspected.observationValidated === true && (!plain(inspected.facts) ||
            !Object.values(inspected.facts).every(value => typeof value === 'boolean'))))
        return diagnostic('JEBISEO_POST_ACTION_OBSERVATION_UNAVAILABLE', true);
      return diagnostic(inspected.code, true, inspected);
    } catch {
      // A closed request or changed owner cannot expose a previously valid
      // observation. The original runtime's pending result remains unchanged.
      return diagnostic('JEBISEO_POST_ACTION_OBSERVATION_UNAVAILABLE');
    }
  }
  function callbacks(entry) {
    return {
      readCurrentBinding({taskRef, deviceId, commandId, pendingEffectKey}) {
        const step = currentStep(entry);
        if (taskRef !== entry.task.taskRef || deviceId !== entry.task.deviceId || commandId !== entry.task.commandId)
          fail('JEBISEO_BOUND_TASK_ONLY');
        const state = currentState(entry, {recovery: RECOVERY.has(step.operation)});
        const isCurrent = sameOwner(state, entry.owner) && state.commandId === entry.task.commandId;
        return {deviceId: state.deviceId, commandId: state.commandId,
          secureSessionId: state.secureSessionId, runtimeMode: 'PHONE_RIGHT',
          focusProtected: focusCurrent(state.focus),
          durableDispatchProtected: state.durableHooks === entry.durableHooks && durableLive(state.durableHooks),
          effectReadback: isCurrent ? readback(entry, pendingEffectKey) : null};
      },
      verifyGeminiTarget({task, operation, args, binding}) {
        const step = currentStep(entry), state = currentState(entry);
        if (!isDeepStrictEqual(task, entry.task) || operation !== step.operation ||
            !isDeepStrictEqual(args, step.args) || binding.secureSessionId !== state.secureSessionId)
          return null;
        // Prepared CU submit/draft proof and real Gemini message attribution
        // require their own original producers. A native editor is not one.
        if (!GUIDED.has(operation)) return {code: 'JEBISEO_ORIGINAL_SUBMIT_PROOF_UNAVAILABLE'};
        const candidate = inspection(entry, operation);
        if (candidate.ok !== true) return {code: candidate.code};
        const e = candidate.evidence;
        if (operation !== 'DISCOVER_INPUT' && args.field_id !== e.nativeTarget?.fieldId) return null;
        const prepared = prepareJebiseoGuidedCall({operation, issuedArguments: e.issuedArguments, text: args.text});
        if (!prepared.ok) return null;
        step.target = frozenCopy({evidence: e, arguments: {...prepared.arguments, command_id: entry.task.commandId}});
        return {source: 'ORIGINAL_SECURE56', provider: 'GEMINI', targetVerified: true,
          deviceId: entry.task.deviceId, commandId: entry.task.commandId, secureSessionId: state.secureSessionId,
          promptDigest: entry.task.promptDigest, bindingDigest: step.targetDigest,
          windowId: e.windowId, displayId: e.displayId, workPackage: e.workPackage,
          rightPaneVerified: true, formRevision: e.formRevision,
          guidedArgumentsVerified: true, guidedArguments: e.issuedArguments,
          ...(operation === 'DISCOVER_INPUT' ? {inputDiscoveryVerified: true} :
            operation === 'TYPE' ? {targetFieldId: e.nativeTarget.fieldId, editorVerified: true, draftEmpty: true} :
            {targetFieldId: e.nativeTarget.fieldId, noticeDismissVerified: true,
              nonSensitiveVerified: true, approvalRequired: false})};
      },
      async callOriginalTool(toolName, args) {
        const step = currentStep(entry);
        if (!ALLOWED.has(toolName) || ROUTES[step.operation] !== toolName || step.called)
          fail('JEBISEO_EXACT_ORIGINAL_CALL_REQUIRED');
        currentState(entry, {recovery: RECOVERY.has(step.operation)});
        if (args.command_id !== entry.task.commandId ||
            (args.device_id !== undefined && args.device_id !== entry.task.deviceId))
          fail('JEBISEO_ORIGINAL_CALL_BINDING_CHANGED');
        if (step.operation === 'OPEN' && (args.url !== JEBISEO_GEMINI_WEB_URL ||
            Object.keys(args).some(key => !['url', 'command_id'].includes(key))))
          fail('JEBISEO_FIXED_OPEN_TARGET_REQUIRED');
        if (['OPEN_APP', 'APP_OBSERVE'].includes(step.operation) &&
            (entry.task.feature !== 'ANDROID' || entry.task.intent !== 'open_app' ||
              entry.task.action !== 'OPEN_APP' || !getJebiseoAndroidTarget(entry.task.appPackage) ||
              !hex64(entry.task.taskDigest) || !isDeepStrictEqual(args, appArguments(entry.task, step.operation))))
          fail('JEBISEO_ANDROID_APP_ARGUMENTS_FIXED');
        if (GUIDED.has(step.operation) && (!step.target || !isDeepStrictEqual(args, step.target.arguments)))
          fail('JEBISEO_ORIGINAL_ISSUED_ARGUMENTS_REQUIRED');
        const original = getOriginalTool(toolName);
        if (typeof original?.schema?.parse !== 'function' || typeof original.handler !== 'function')
          fail('JEBISEO_ORIGINAL_REGISTERED_TOOL_REQUIRED');
        const parsed = original.schema.parse(args); // Original validation, exactly once.
        if (!plain(parsed) || parsed.command_id !== entry.task.commandId ||
            (GUIDED.has(step.operation) && !isDeepStrictEqual(parsed, step.target.arguments)) ||
            (['OPEN_APP', 'APP_OBSERVE'].includes(step.operation) &&
              !isDeepStrictEqual(parsed, appArguments(entry.task, step.operation))) ||
            (step.operation === 'OPEN' && parsed.url !== JEBISEO_GEMINI_WEB_URL))
          fail('JEBISEO_ORIGINAL_SCHEMA_BINDING_CHANGED');
        // Check actual current metadata again after any schema/target callback.
        const state = currentState(entry, {recovery: RECOVERY.has(step.operation)});
        if (EFFECTS.has(step.operation) && (!focusCurrent(state.focus) ||
            state.durableHooks !== entry.durableHooks || !durableLive(state.durableHooks)))
          fail('JEBISEO_ORIGINAL_DISPATCH_PROTECTION_CHANGED');
        if (GUIDED.has(step.operation)) {
          // No phone call: re-read the original registered objects and inspect
          // the same evidence immediately before dispatch. An async runtime
          // binding check must not make an expired/changed target reusable.
          const fresh = inspection(entry, step.operation);
          if (fresh.ok !== true || !isDeepStrictEqual(fresh.evidence, step.target.evidence))
            fail('JEBISEO_NATIVE_TARGET_CHANGED_BEFORE_DISPATCH');
          currentState(entry);
        }
        step.called = true;
        let effect = null;
        if (EFFECTS.has(step.operation)) {
          effect = {operation: step.operation, record: null, target: step.target?.evidence ?? null};
          entry.effects.set(step.effectKey, effect);
        }
        // Actual handler/extras are held by the composition's request closure.
        // A throw is UNKNOWN and retained by the original runtime/owner journal.
        const raw = await original.handler(parsed);
        currentStep(entry);
        const record = recordJob(entry, step, raw, toolName, parsed);
        if (record) {
          if (effect) effect.record = record;
          if (step.operation === 'FORM_SNAPSHOT' && record.job.type === 'agent_snapshot') entry.snapshot = record;
          if (step.operation === 'DISCOVER_INPUT' && record.job.type === 'agent_step') entry.discovery = record;
          if (step.operation === 'APP_OBSERVE' && record.job.type === 'computer_use_inspect') entry.appObservation = record;
          // A status call can refresh only the already retained original job.
          if (step.operation === 'JOB_STATUS') {
            for (const pending of entry.effects.values()) {
              if (pending.record?.job === record.job && pending.record.identity.id === args.job_id) {
                // Preserve ORIGINAL invocation order/provenance. Updating the
                // record would also break the retained discovery identity.
                originalCompletion(entry, pending.record);
              }
            }
          }
        }
        return raw;
      }
    };
  }

  function createRuntime(task) {
    let bound;
    try {bound = frozenCopy(task);} catch {fail('JEBISEO_TASK_SCOPE_REQUIRED');}
    if (!plain(bound) || !nonempty(bound.taskRef) || !nonempty(bound.threadRef))
      fail('JEBISEO_TASK_SCOPE_REQUIRED');
    if (!readAuthenticatedRequestScope()) fail('JEBISEO_AUTHENTICATED_REQUEST_REQUIRED');
    const existing = entries.get(bound.taskRef);
    if (existing) {
      if (!isDeepStrictEqual(existing.task, bound)) fail('JEBISEO_TASK_BINDING_CHANGED');
      return existing.facade; // Never reset a pending barrier between MCP calls.
    }
    if (entries.size >= 256) fail('JEBISEO_TASK_CAPACITY');
    const state = readCurrentState();
    if (!stateIdentity(state) || bound.deviceId !== state.deviceId || bound.commandId !== state.commandId)
      fail('JEBISEO_ORIGINAL_PHONE_BINDING_REQUIRED');
    const key = JSON.stringify([state.runtimeId, state.deviceId, state.commandId]);
    if (commandTasks.has(key) && commandTasks.get(key) !== bound.taskRef)
      fail('JEBISEO_ORIGINAL_TASK_BINDING_REQUIRED');
    const entry = {task: bound, owner: frozenCopy({deviceId: state.deviceId,
      secureSessionId: state.secureSessionId, deviceDigest: state.deviceDigest, runtimeId: state.runtimeId}),
      durableHooks: state.durableHooks, effects: new Map(), snapshot: null, discovery: null, appObservation: null,
      busy: false, facade: null};
    const runtime = createJebiseoRuntime({...callbacks(entry), runtimeMode: 'PHONE_RIGHT', scheduler});
    async function runStep(input = {}) {
      let request;
      try {request = frozenCopy(input);} catch {return blocked('JEBISEO_ARGUMENTS_INVALID');}
      if (!plain(request) || Object.keys(request).some(key => !['operation', 'args'].includes(key)))
        return blocked('JEBISEO_BOUND_TASK_ONLY');
      const args = request.args ?? {};
      if (!plain(args)) return blocked('JEBISEO_ARGUMENTS_INVALID');
      const requestScope = readAuthenticatedRequestScope();
      if (!requestScope) return blocked('JEBISEO_AUTHENTICATED_REQUEST_REQUIRED');
      if (entry.busy || steps.getStore()) return blocked('JEBISEO_ORIGINAL_STEP_ALREADY_RUNNING');
      const targetDigest = jebiseoTargetBindingDigest(bound, request.operation, args);
      const step = {entry, operation: request.operation, args, requestScope, targetDigest,
        effectKey: hash(JSON.stringify(['jh.jebiseo-effect.v1', targetDigest])),
        invocationOrdinal: ++nextInvocationOrdinal, live: true, called: false, target: null};
      entry.busy = true;
      // Invalidate before schema/current-owner checks can throw. A failed new
      // read must never recycle an earlier observation when focus recovers.
      if (request.operation === 'APP_OBSERVE') entry.appObservation = null;
      return steps.run(step, async () => {
        try {
          const response = await runtime.runStep({task: bound, operation: request.operation, args});
          if (response.code !== 'JEBISEO_PRIOR_EFFECT_READBACK_REQUIRED') return response;
          const observation = postActionObservation(entry, response.effectKey, response.pendingOperation);
          return observation ? Object.freeze({...response, postActionObservation: observation}) : response;
        }
        finally {step.live = false; entry.busy = false;}
      });
    }
    entry.facade = Object.freeze({capabilities: runtime.capabilities, runStep,
      start: (input = {}) => plain(input) && Object.keys(input).length === 0
        ? runStep({operation: bound.feature === 'ANDROID' ? 'OPEN_APP' : 'OPEN'})
        : Promise.resolve(blocked('JEBISEO_BOUND_TASK_ONLY'))});
    entries.set(bound.taskRef, entry); commandTasks.set(key, bound.taskRef);
    return entry.facade;
  }
  function createHandoffRuntime({request, deviceId = null, commandId = null,
    deliveryMode = 'TEXT_SELECTION', requiresResultInspection = false} = {}) {
    if (!['TEXT_SELECTION', 'OPEN_MANUAL'].includes(deliveryMode))
      fail('JEBISEO_HANDOFF_DELIVERY_MODE_INVALID');
    if (typeof requiresResultInspection !== 'boolean')
      fail('JEBISEO_HANDOFF_INSPECTION_FLAG_INVALID');
    const prepared = prepareJebiseoHandoff(request);
    if (prepared.active !== true) return createJebiseoHandoffSession({request, deliveryMode,
      requiresResultInspection});
    const key = prepared.taskRef;
    const identity = JSON.stringify([prepared.threadRef, prepared.sourceRef,
      prepared.requestDigest, deviceId, commandId, deliveryMode, requiresResultInspection]);
    const saved = handoffs.get(key);
    if (saved) {
      if (saved.identity !== identity) fail('JEBISEO_HANDOFF_TASK_BINDING_CHANGED');
      return saved.facade;
    }
    if (handoffs.size >= 256) fail('JEBISEO_HANDOFF_TASK_CAPACITY');
    const facade = createJebiseoHandoffSession({request, deviceId, commandId, deliveryMode,
      requiresResultInspection,
      createOriginalRuntime: createRuntime});
    handoffs.set(key, {identity, facade});
    return facade;
  }
  return Object.freeze({createRuntime, createHandoffRuntime});
}
