/** 제비서 host composition over the existing signed JH Mobile13 tools.
 * No provider, credentials, BEGIN_COMMAND, cloud browser or autonomous loop is
 * created here. Host callbacks must be bound to the selected original owner.
 */
import {createHash} from 'node:crypto';
import {createJebiseoMobilePort, JEBISEO_GEMINI_WEB_URL} from './mobile-port.mjs';
import {verifyJebiseoReply} from './reply-proof.mjs';
import {prepareJebiseoGuidedCall} from './guided-form.mjs';

const guided = new Set(['DISCOVER_INPUT', 'DISMISS_NOTICE', 'TYPE']);
const effects = new Set(['OPEN', ...guided, 'APPROVAL_REQUEST', 'EXECUTE_SUBMIT']);
const recovery = new Set(['RECEIPT_STATUS', 'JOB_STATUS', 'APPROVAL_STATUS']);
const openOnlySteps = new Set(['OPEN', 'SNAPSHOT', 'FORM_SNAPSHOT', 'JOB_STATUS', 'RECEIPT_STATUS']);
const hex32 = value => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
const hex64 = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const ref = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/.test(value);
// Original mk() uses job_1, job_2, ...; task references have different lengths.
const originalJobId = value => typeof value === 'string' && value.length <= 200 && /^job_[0-9]+$/.test(value);
const digest = value => createHash('sha256').update(value, 'utf8').digest('hex');
const result = (code, extra = {}) => Object.freeze({
  schema: 'jh.jebiseo-host-result.v1', code, status: 'BLOCKED',
  toolInvoked: false, phoneDispatchVerified: false, externalEffectVerified: false,
  geminiReplyVerified: false, hiddenExecutionVerified: false,
  automaticReplay: false, automaticResume: false, ...extra
});
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function snapshot(value) {
  const copied = structuredClone(value);
  const freeze = item => {
    if (item && typeof item === 'object' && !Object.isFrozen(item)) {
      Object.freeze(item);
      for (const child of Object.values(item)) freeze(child);
    }
    return item;
  };
  return freeze(copied);
}

/** Encoding only, not authentication. The original host must independently
 * authenticate the Gemini surface and exact target/draft before returning this
 * binding digest from verifyGeminiTarget. No token or prompt is persisted here.
 */
export function jebiseoTargetBindingDigest(task, operation, args) {
  return digest(JSON.stringify(['jh.jebiseo-target.v1', task.taskRef, task.threadRef,
    task.deviceId, task.commandId, task.promptDigest, task.taskDigest ?? null,
    operation, operation === 'OPEN' ? JEBISEO_GEMINI_WEB_URL : null,
    Object.keys(args).sort().map(key => [key, args[key]])]));
}

function validTarget(proof, task, operation, args, bindingDigest) {
  if (!object(proof) || proof.source !== 'ORIGINAL_SECURE56' || proof.provider !== 'GEMINI' ||
      proof.targetVerified !== true || proof.deviceId !== task.deviceId ||
      proof.commandId !== task.commandId || proof.promptDigest !== task.promptDigest ||
      proof.bindingDigest !== bindingDigest || !Number.isSafeInteger(proof.windowId) || proof.windowId < 0)
    return false;
  if (guided.has(operation)) {
    if (proof.contextId !== args.context_id || proof.guidedArgumentsVerified !== true ||
        proof.rightPaneVerified !== true || proof.workPackage !== 'com.android.chrome' ||
        !Number.isSafeInteger(proof.displayId) || proof.displayId < 0 ||
        prepareJebiseoGuidedCall({operation, issuedArguments: proof.guidedArguments,
          text: args.text}).ok !== true) return false;
    if (operation === 'DISCOVER_INPUT') return proof.inputDiscoveryVerified === true;
    if (proof.targetItemRef !== args.target_item_ref) return false;
    if (operation === 'DISMISS_NOTICE') return proof.noticeDismissVerified === true &&
      proof.nonSensitiveVerified === true && proof.approvalRequired === false;
    return proof.editorVerified === true && proof.draftEmpty === true;
  }
  // The CU task/run scope belongs to the exact prepared action. Mobile13 TYPE
  // computes separate digests for its preflight/followup; there is no global
  // command taskDigest to invent or compare against the current binding.
  return hex64(args.task_digest) && proof.taskDigest === args.task_digest &&
    proof.runDigest === (args.run_digest ?? null) && proof.submitTargetVerified === true &&
    proof.draftMatchesPrompt === true;
}

function effectBindingProblem(binding, task) {
  if (binding?.deviceId !== task.deviceId || binding?.runtimeMode !== 'PHONE_RIGHT')
    return 'JEBISEO_ORIGINAL_PHONE_BINDING_REQUIRED';
  if (binding.commandId !== task.commandId) return 'new_command_binding_required_or_discarded';
  if (binding.focusProtected !== true) return 'JEBISEO_ORIGINAL_DEVICE_FOCUS_REQUIRED';
  if (binding.durableDispatchProtected !== true) return 'JEBISEO_ORIGINAL_DURABLE_DISPATCH_REQUIRED';
  return null;
}
function reconciles(readback, pending, task) {
  return object(readback) && readback.source === 'ORIGINAL_SECURE56' &&
    readback.effectKey === pending.effectKey && readback.operation === pending.operation &&
    readback.taskRef === task.taskRef && readback.deviceId === task.deviceId &&
    readback.commandId === task.commandId &&
    (pending.operation !== 'OPEN' || (originalJobId(pending.jobId) && readback.jobId === pending.jobId &&
      readback.url === JEBISEO_GEMINI_WEB_URL)) &&
    ['VERIFIED_APPLIED', 'VERIFIED_NOT_APPLIED'].includes(readback.outcome);
}
function openFollowUp(pending, task) {
  return pending?.operation === 'OPEN' && originalJobId(pending.jobId)
    ? {tool: 'life_job_status', arguments: {job_id: pending.jobId, command_id: task.commandId},
      readOnly: true} : null;
}

export function jebiseoCapabilities() {
  return Object.freeze({schema: 'jh.jebiseo-capabilities.v1', provider: 'gemini',
    mobileRoute: 'android_right', runtimeMode: 'PHONE_RIGHT', defaultVisibility: 'VISIBLE',
    internalExecutionSupported: false, visibleExecutionSupported: false,
    geminiAssistanceAvailable: false, liveExecutionVerified: false,
    routingModel: 'ANDROID_THEN_MANUAL', installedApkBaseline: 'STAGE62_FIX3',
    codeCandidate: true, productionRegistered: false,
    visibleMobileCandidateSupported: true, commandCreationSupported: false,
    automaticReplay: false, requiresInternalProvider: false});
}

/** Invocation interpretation belongs to the host. Names inside development,
 * quotations or negation cannot cause a provider query. Only a digest is kept.
 */
export function createJebiseoTask(input = {}) {
  if (!ref(input.taskRef) || !ref(input.threadRef)) throw Error('JEBISEO_TASK_SCOPE_REQUIRED');
  const invoked = ['open', 'consult', 'assist'].includes(input.intent) &&
    ['direct', 'contextual_user_request'].includes(input.basis);
  // Latest explicit user choice: visible Gemini on the phone's RIGHT Chrome.
  // An explicitly requested hidden task still cannot fall back to a visible UI.
  const visibility = input.visibility ?? 'VISIBLE';
  if (!['INTERNAL', 'VISIBLE'].includes(visibility)) throw Error('JEBISEO_VISIBILITY_INVALID');
  if (!invoked) return Object.freeze({taskRef: input.taskRef, threadRef: input.threadRef,
    active: false, visibility, intent: input.intent ?? 'none', basis: input.basis ?? 'about_assistant'});
  const prompt = input.intent === 'open' ? '' : input.prompt;
  if (input.intent !== 'open' && (typeof prompt !== 'string' || !prompt.trim() || prompt.includes('\0') ||
      [...prompt].length > 1200 || Buffer.byteLength(prompt, 'utf8') > 2048))
    throw Error('JEBISEO_PROMPT_INVALID');
  // Internal capability checks do not require a phone or a new command.
  if (visibility === 'VISIBLE' && (!ref(input.deviceId) || !hex32(input.commandId)))
    throw Error('JEBISEO_EXISTING_MOBILE_COMMAND_REQUIRED');
  if (input.taskDigest !== undefined && !hex64(input.taskDigest))
    throw Error('JEBISEO_ORIGINAL_TASK_DIGEST_INVALID');
  return Object.freeze({taskRef: input.taskRef, threadRef: input.threadRef, active: true,
    intent: input.intent, basis: input.basis, visibility,
    deviceId: input.deviceId ?? null, commandId: input.commandId ?? null,
    taskDigest: input.taskDigest ?? null, promptDigest: digest(prompt)});
}

/** Cooperative per-device sequencing within this host instance only. The
 * original Stage44 focus + owner journal still decide cross-room/process work.
 * A different task never gets queued for automatic later execution.
 */
export function createJebiseoDeviceScheduler() {
  const devices = new Map();
  return Object.freeze({
    async run({deviceId, commandId, taskRef}, operation) {
      const current = devices.get(deviceId);
      if (current && (current.commandId !== commandId || current.taskRef !== taskRef))
        return result('JEBISEO_DEVICE_BUSY_OTHER_TASK');
      const entry = current ?? {commandId, taskRef, tail: Promise.resolve(), users: 0};
      devices.set(deviceId, entry); entry.users++;
      const pending = entry.tail.then(operation);
      entry.tail = pending.catch(() => {});
      try { return await pending; }
      finally {
        if (--entry.users === 0 && devices.get(deviceId) === entry) devices.delete(deviceId);
      }
    }
  });
}

/** All callbacks are trusted original-host services, not MCP argument objects.
 * callOriginalTool must retain the ORIGINAL queue and durableNativeHooks:
 * capture -> beforeDispatch -> authenticated acceptedCompletion. Never reserve
 * the dispatch a second time in this facade or add an independent journal.
 *
 * readCurrentBinding returns actual current device/command/runtime/focus and
 * durableDispatchProtected only when that original hook chain is installed.
 * An optional effectReadback must independently reconcile the exact effectKey
 * with its original request/receipt, task, command, device and operation. Only
 * VERIFIED_APPLIED / VERIFIED_NOT_APPLIED clear the local pending barrier;
 * queued, ok:true and a signed click receipt alone do not prove Gemini sent.
 * For OPEN, effectReadback must also bind the original jobId and fixed URL.
 * RIGHT address confirmation alone never proves the Gemini editor is ready.
 *
 * verifyGeminiTarget must authenticate a fresh original provider/window and
 * context/item (TYPE/DISMISS_NOTICE), or prepared CU task/run/target plus exact prompt draft
 * (approval/submit), then return the fields checked by validTarget. Unlabelled
 * icon geometry and caller booleans are not provider/target proof. OPEN is the
 * separate fixed-URL navigation step, so it does not require a Gemini window
 * before launching. Original focus/durable checks still precede that dispatch.
 * For guided actions it must resolve the exact carrier from the original fresh
 * native snapshot or form15 discovery, verify the same RIGHT Gemini surface,
 * and return guidedArgumentsVerified + guidedArguments. Parsing the carrier
 * alone is never authentication. Callers cannot inject these arguments.
 * No producer for that attestation is invented here; absent proof blocks effects.
 *
 * Task bindings and pending barriers here are process-local coordination only.
 * Existing original owner receipts/journal remain authoritative after restart.
 */
export function createJebiseoRuntime({callOriginalTool, readCurrentBinding, verifyGeminiTarget,
  verifyObservation, runtimeMode = null, scheduler = createJebiseoDeviceScheduler()} = {}) {
  if (typeof readCurrentBinding !== 'function' || typeof scheduler?.run !== 'function')
    throw Error('JEBISEO_ORIGINAL_HOST_BINDING_REQUIRED');
  const port = createJebiseoMobilePort({callOriginalTool, runtimeMode});
  const tasks = new Map(), commandTasks = new Map();
  const pendingEffects = new Map(), settledSubmits = new Set();

  async function readBinding(scope) {
    return snapshot(await readCurrentBinding({deviceId: scope.deviceId, commandId: scope.commandId,
      taskRef: scope.taskRef, pendingEffectKey: pendingEffects.get(scope.taskRef)?.effectKey ?? null}));
  }

  async function runStep({task, operation, args = {}} = {}) {
    if (task?.active !== true) return result('JEBISEO_NO_CURRENT_CONSULTATION');
    if (task.visibility !== 'VISIBLE') return result('HIDDEN_EXECUTION_UNAVAILABLE', {
      requiredCapability: 'gemini-internal-provider', capabilities: jebiseoCapabilities()});
    if (task.intent === 'open' && !openOnlySteps.has(operation)) return result('JEBISEO_OPEN_ONLY_TASK');
    if (!ref(task.taskRef) || !ref(task.threadRef) || !ref(task.deviceId) ||
        !hex32(task.commandId) || !hex64(task.promptDigest)) return result('JEBISEO_TASK_SCOPE_REQUIRED');
    if (!args || typeof args !== 'object' || Array.isArray(args)) return result('JEBISEO_ARGUMENTS_INVALID');
    // Snapshot inputs before waiting; caller mutation must not change a queued step.
    let scope, parameters;
    try { scope = snapshot(task); parameters = snapshot(args); }
    catch { return result('JEBISEO_ARGUMENTS_INVALID'); }
    const identity = JSON.stringify([scope.threadRef, scope.deviceId, scope.commandId,
      scope.promptDigest, scope.taskDigest ?? null, scope.visibility, scope.intent]);
    const previous = tasks.get(scope.taskRef);
    if (previous !== undefined && previous !== identity) return result('JEBISEO_TASK_BINDING_CHANGED');
    const commandScope = JSON.stringify([scope.deviceId, scope.commandId]);
    const originalTask = commandTasks.get(commandScope);
    if (originalTask !== undefined && originalTask !== scope.taskRef)
      return result('JEBISEO_ORIGINAL_TASK_BINDING_REQUIRED');
    if (tasks.size >= 256 && previous === undefined) return result('JEBISEO_TASK_CAPACITY');
    tasks.set(scope.taskRef, identity);
    commandTasks.set(commandScope, scope.taskRef);
    return scheduler.run(scope, async () => {
      let binding;
      try { binding = await readBinding(scope); }
      catch { return result('JEBISEO_ORIGINAL_BINDING_UNAVAILABLE'); }
      if (binding?.deviceId !== scope.deviceId || binding?.runtimeMode !== 'PHONE_RIGHT')
        return result('JEBISEO_ORIGINAL_PHONE_BINDING_REQUIRED');
      // Only original readback endpoints may see an old command; they retain
      // their own receipt-token/owner checks and may still reject the read.
      if (binding.commandId !== scope.commandId && !recovery.has(operation))
        return result('new_command_binding_required_or_discarded');
      if (parameters.command_id !== undefined && parameters.command_id !== scope.commandId)
        return result('JEBISEO_COMMAND_MISMATCH');
      if (parameters.device_id !== undefined && parameters.device_id !== scope.deviceId)
        return result('JEBISEO_DEVICE_MISMATCH');
      if (Object.hasOwn(parameters, 'guided_arguments'))
        return result('JEBISEO_CALLER_GUIDED_ARGUMENTS_FORBIDDEN');
      const existingPending = pendingEffects.get(scope.taskRef);
      if (operation === 'JOB_STATUS' && existingPending?.operation === 'OPEN' &&
          (!originalJobId(existingPending.jobId) || parameters.job_id !== existingPending.jobId))
        return result('JEBISEO_ORIGINAL_OPEN_JOB_REQUIRED', {
          readbackRequired: true, followUp: openFollowUp(existingPending, scope)});
      if (operation === 'TYPE' && (typeof parameters.text !== 'string' || digest(parameters.text) !== scope.promptDigest))
        return result('JEBISEO_REQUEST_TEXT_CHANGED');
      if (scope.taskDigest !== null && scope.taskDigest !== undefined &&
          parameters.task_digest !== undefined && parameters.task_digest !== scope.taskDigest)
        return result('JEBISEO_ORIGINAL_TASK_SCOPE_CHANGED');
      if (effects.has(operation)) {
        const bindingProblem = effectBindingProblem(binding, scope);
        if (bindingProblem) return result(bindingProblem);
        const pending = pendingEffects.get(scope.taskRef);
        if (pending) {
          if (!reconciles(binding.effectReadback, pending, scope))
            return result('JEBISEO_PRIOR_EFFECT_READBACK_REQUIRED', {
              effectKey: pending.effectKey, pendingOperation: pending.operation, readbackRequired: true,
              followUp: openFollowUp(pending, scope)});
          pendingEffects.delete(scope.taskRef);
          if (pending.operation === 'EXECUTE_SUBMIT') settledSubmits.add(scope.taskRef);
        }
        if (settledSubmits.has(scope.taskRef)) return result('JEBISEO_SUBMISSION_SETTLED_READ_RESULT');
        if (operation !== 'OPEN' && typeof verifyGeminiTarget !== 'function')
          return result('JEBISEO_ORIGINAL_GEMINI_TARGET_VERIFIER_REQUIRED');
        let target, targetDigest;
        try {
          targetDigest = jebiseoTargetBindingDigest(scope, operation, parameters);
          if (operation !== 'OPEN')
            target = snapshot(await verifyGeminiTarget({task: scope, operation, args: parameters, binding}));
        } catch { return result('JEBISEO_ORIGINAL_GEMINI_TARGET_UNVERIFIED'); }
        if (operation !== 'OPEN' && !validTarget(target, scope, operation, parameters, targetDigest))
          return result('JEBISEO_ORIGINAL_GEMINI_TARGET_UNVERIFIED');
        // Target verification may await a signed read. Recheck original command
        // and installed dispatch protections; never create or renew a command.
        let fresh;
        try { fresh = await readBinding(scope); }
        catch { return result('JEBISEO_BINDING_CHANGED_AFTER_TARGET_VERIFICATION'); }
        if (effectBindingProblem(fresh, scope)) return result('JEBISEO_BINDING_CHANGED_AFTER_TARGET_VERIFICATION');
        const effectKey = digest(JSON.stringify(['jh.jebiseo-effect.v1', targetDigest]));
        const response = await port.run({visibility: 'VISIBLE', command_id: scope.commandId,
          operation, args: guided.has(operation)
            ? {...parameters, guided_arguments: target.guidedArguments} : parameters});
        if (response.toolInvoked === true) {
          const pending = Object.freeze({effectKey, operation,
            ...(operation === 'OPEN' ? {jobId: originalJobId(response.payload?.jobId) ? response.payload.jobId : null} : {})});
          pendingEffects.set(scope.taskRef, pending);
          return Object.freeze({...response, effectKey, readbackRequired: true,
            ...(operation === 'OPEN' ? {requestedUrl: JEBISEO_GEMINI_WEB_URL,
              followUp: openFollowUp(pending, scope), geminiPageVerified: false} : {})});
        }
        return response;
      }
      return port.run({visibility: 'VISIBLE', command_id: scope.commandId, operation, args: parameters});
    });
  }

  return Object.freeze({capabilities: jebiseoCapabilities, runStep,
    // A current user invocation starts by opening the phone surface itself.
    // The user is not asked to open Google/Gemini or arrange panes beforehand.
    // This never sends a prompt, loops, or invents a command/approval.
    start: ({task} = {}) => runStep({task, operation: 'OPEN'}),
    verifyReply: ({task, observation, now} = {}) => verifyJebiseoReply({task, observation,
      verifyObservation, ...(now === undefined ? {} : {now})})});
}
