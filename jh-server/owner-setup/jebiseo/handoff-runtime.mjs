/** Selection-menu handoff by default, with an explicit legacy OPEN option.
 * No input, submit, response capture, video export or new command is dispatched.
 * Manual progress is a user report, never an original-host success receipt.
 */
import {prepareJebiseoHandoff, createJebiseoManualHandoff} from './handoff-request.mjs';
import {createJebiseoTask} from './host-runtime.mjs';
import {createJebiseoTextSelectionGuide, createJebiseoManualReturnGuide} from './text-selection-guide.mjs';

const ref = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/.test(value);
const command = value => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
const job = value => typeof value === 'string' && /^job_[0-9]+$/.test(value);
const code = value => typeof value === 'string' && /^[A-Za-z0-9_:-]{1,160}$/.test(value) ? value : null;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const frozen = value => {
  const copy = structuredClone(value);
  const freeze = item => {
    if (item && typeof item === 'object' && !Object.isFrozen(item)) {
      Object.freeze(item); for (const child of Object.values(item)) freeze(child);
    }
    return item;
  };
  return freeze(copy);
};

/** request is the host's current semantic input, not a caller-authored proof.
 * createOriginalRuntime is a trusted binding service, never an MCP parameter.
 * The binding must reuse this session for the same task and current request.
 */
export function createJebiseoHandoffSession({request, deviceId = null, commandId = null,
  deliveryMode = 'TEXT_SELECTION', requiresResultInspection = false, createOriginalRuntime} = {}) {
  if (!['TEXT_SELECTION', 'OPEN_MANUAL'].includes(deliveryMode))
    throw Error('JEBISEO_HANDOFF_DELIVERY_MODE_INVALID');
  if (typeof requiresResultInspection !== 'boolean')
    throw Error('JEBISEO_HANDOFF_INSPECTION_FLAG_INVALID');
  const prepared = prepareJebiseoHandoff(request);
  let original = null, current = prepared, startPromise = null, statusPromise = null;
  let originalJobId = null, originalEffectKey = null, openAttempted = false, manualReportedRank = -1;
  let priorEffectReadback = false;

  function manual(step, outcome, extra = {}) {
    if (prepared.active !== true) return prepared;
    const guide = createJebiseoManualHandoff(prepared, {
      taskRef: prepared.taskRef, threadRef: prepared.threadRef, sourceRef: prepared.sourceRef,
      requestDigest: prepared.requestDigest, step, outcome,
      ...(originalJobId ? {receiptRef: originalJobId} : {})
    });
    current = frozen({...guide, deliveryMode, automatedOpenAttempted: openAttempted,
      ...(originalJobId ? {originalJobId} : {}),
      ...(originalEffectKey ? {originalEffectKey} : {}),
      ...extra, returnToGpt: prepared.returnToGpt, automaticReturnToGpt: false,
      requiresUserReply: false,
      requestSent: false, resultVerified: false, externalEffectVerified: false,
      geminiReplyVerified: false, automaticReplay: false, authorizesExecution: false});
    return current;
  }

  function textSelection(step = 'READY') {
    current = frozen({...createJebiseoTextSelectionGuide(prepared,
      {step, requiresResultInspection}), deliveryMode, automatedOpenAttempted: false});
    return current;
  }

  function inspectExisting() {
    if (deliveryMode === 'TEXT_SELECTION') return textSelection();
    const guide = manual('OPEN', 'UNKNOWN', {reason: 'CURRENT_TASK_RESULT_INSPECTION_REQUIRED'});
    current = frozen({...guide, manualSteps: [guide.instruction]});
    return current;
  }

  function projectOpen(response) {
    const r = plain(response) ? response : {};
    // An older unresolved operation may be broader than this OPEN-only task.
    // Showing manual input steps must not turn that barrier into a replay path.
    priorEffectReadback = r.toolInvoked === false && r.readbackRequired === true;
    const followUp = r.followUp;
    if (followUp?.tool === 'life_job_status' && followUp.readOnly === true &&
        job(followUp.arguments?.job_id) && followUp.arguments.command_id === commandId &&
        Object.keys(followUp.arguments).every(key => ['job_id', 'command_id'].includes(key)))
      originalJobId = followUp.arguments.job_id;
    if (typeof r.effectKey === 'string' && /^[a-f0-9]{64}$/.test(r.effectKey))
      originalEffectKey = r.effectKey;
    if (current.userReported === true) {
      current = frozen({...current, ...(originalJobId ? {originalJobId} : {}),
        ...(originalEffectKey ? {originalEffectKey} : {})});
      return current;
    }
    // This wrapper deliberately makes no independent OPEN verification claim.
    // Even ok:true/RETURNED/queued is only an observation request for the user.
    const uncertain = r.toolInvoked !== false || r.readbackRequired === true ||
      ['PENDING', 'UNKNOWN', 'STOP_NO_REPLAY', 'UNVERIFIABLE'].includes(r.status);
    return manual('OPEN', uncertain ? (r.status === 'PENDING' ? 'PENDING' : 'UNKNOWN')
      : 'FAILED_NO_EFFECT', {originalCode: code(r.code),
      statusReadAvailable: !!originalJobId, promptPrepared: true});
  }

  async function startOnce() {
    if (prepared.active !== true) return prepared;
    if (requiresResultInspection) return inspectExisting();
    if (current.userReported === true) return current;
    // The user's existing selection menu owns the handoff. Do not also create
    // an automatic OPEN, input or submission before the user uses that menu.
    if (deliveryMode === 'TEXT_SELECTION') return textSelection();
    if (prepared.surface === 'GEMINI_NATIVE')
      return manual('OPEN', 'NOT_ATTEMPTED', {reason: 'NATIVE_GEMINI_MANUAL_HANDOFF'});
    if (typeof createOriginalRuntime !== 'function' || !ref(deviceId) || !command(commandId))
      return manual('OPEN', 'NOT_ATTEMPTED', {reason: 'EXISTING_PHONE_BINDING_UNAVAILABLE'});
    try {
      // An OPEN-only legacy task cannot type or send the prepared prompt.
      const task = createJebiseoTask({taskRef: prepared.taskRef, threadRef: prepared.threadRef,
        intent: 'open', basis: prepared.basis, deviceId, commandId});
      original = createOriginalRuntime(task);
      if (typeof original?.start !== 'function' || typeof original?.runStep !== 'function')
        return manual('OPEN', 'NOT_ATTEMPTED', {reason: 'ORIGINAL_RUNTIME_UNAVAILABLE'});
      openAttempted = true;
      return projectOpen(await original.start());
    } catch (error) {
      if (current.userReported === true) return current;
      // A lost response never permits another OPEN or manual replay.
      return manual('OPEN', 'UNKNOWN', {originalCode: code(error?.message),
        reason: 'ORIGINAL_OPEN_OBSERVATION_REQUIRED'});
    }
  }

  function start() {
    if (current.userReported === true) return Promise.resolve(current);
    if (startPromise) return startPromise.then(() => current);
    startPromise = Promise.resolve().then(startOnce);
    return startPromise;
  }

  async function readOpenStatusOnce() {
    if (prepared.active !== true || !original || !originalJobId) return current;
    try {
      const response = await original.runStep({operation: 'JOB_STATUS',
        args: {job_id: originalJobId, command_id: commandId}});
      // Receipt inspection may provide useful diagnostics, but cannot regress
      // a later manual user report or create a Gemini analysis success claim.
      if (current.userReported === true) return current;
      return manual('OPEN', 'UNKNOWN', {originalCode: code(response?.code),
        statusReadAvailable: true, originalStatusRead: true});
    } catch (error) {
      if (current.userReported === true) return current;
      return manual('OPEN', 'UNKNOWN', {originalCode: code(error?.message),
        statusReadAvailable: true, originalStatusRead: false});
    }
  }

  function readOpenStatus() {
    if (statusPromise) return statusPromise;
    statusPromise = Promise.resolve(startPromise).then(readOpenStatusOnce)
      .finally(() => {statusPromise = null;});
    return statusPromise;
  }

  function reportManualProgress({taskRef, threadRef, requestDigest, step} = {}) {
    if (prepared.active !== true) return prepared;
    const allowedSteps = deliveryMode === 'TEXT_SELECTION'
      ? ['OPEN', 'HANDOFF', 'INPUT', 'SUBMIT'] : ['OPEN', 'INPUT', 'SUBMIT'];
    if (taskRef !== prepared.taskRef || threadRef !== prepared.threadRef ||
        requestDigest !== prepared.requestDigest || !allowedSteps.includes(step))
      return frozen({ok: false, active: false, code: 'JEBISEO_HANDOFF_REPORT_SCOPE_MISMATCH',
        requestSent: false, resultVerified: false, authorizesExecution: false,
        automaticReplay: false, returnToGpt: false, automaticReturnToGpt: false});
    if (requiresResultInspection) return inspectExisting();
    const rank = {OPEN: 0, HANDOFF: 0, INPUT: 1, SUBMIT: 2}[step];
    if (rank <= manualReportedRank) return current;
    manualReportedRank = rank;
    // This changes only guidance. It cannot settle the original pending effect
    // or authorize a callback; the user can finish in Gemini without reporting.
    return deliveryMode === 'TEXT_SELECTION' ? textSelection(step)
      : manual(step, 'USER_REPORTED_DONE');
  }

  function presentation() {
    if (prepared.active !== true) return prepared;
    if (requiresResultInspection) return inspectExisting();
    if (deliveryMode === 'TEXT_SELECTION') return current === prepared
      ? frozen({...createJebiseoTextSelectionGuide(prepared), deliveryMode,
        automatedOpenAttempted: false}) : current;
    const next = current.nextAction;
    const viewing = next === 'VIEW_GEMINI_RESULT';
    const submitOnly = next === 'SUBMIT';
    const unresolvedBinding = next === 'INSPECT_EXISTING' && (!openAttempted || priorEffectReadback);
    // Showing the selected request is not executing it. In this adapter only
    // OPEN can have been attempted; an INPUT/SUBMIT uncertainty from another
    // workflow is never turned into an instruction to repeat that operation.
    let steps;
    const resultInstruction = prepared.feature === 'YOUTUBE'
      ? '오른쪽 Gemini에서 분석이 끝난 뒤, 분석 답변을 선택·공유해 GPT로 보내고 현재 대화에 받은 내용을 확인하세요.'
      : '결과는 Gemini에서 확인하세요. GPT로 돌아와 완료를 알릴 필요는 없습니다.';
    if (viewing) steps = [resultInstruction];
    else if (unresolvedBinding) steps = [current.instruction];
    else {
      steps = [];
      if (next !== 'INPUT' && !submitOnly) steps.push(next === 'INSPECT_EXISTING'
        ? '왼쪽 GPT를 유지하고 오른쪽 Gemini가 열렸는지 확인하세요. 같은 열기 작업을 반복하지 마세요.'
        : prepared.surface === 'GEMINI_NATIVE'
          ? '왼쪽 GPT를 유지하고 오른쪽에 Gemini 모바일 앱을 여세요.'
          : '왼쪽 GPT를 유지하고 오른쪽에서 Gemini를 여세요.');
      steps.push(submitOnly
        ? '오른쪽 Gemini의 기존 입력 문장을 확인하고, 아직 전송하지 않았다면 실행하세요. 문장을 다시 입력하지 마세요.'
        : prepared.feature === 'VIDEO'
          ? '오른쪽 Gemini가 열린 것을 확인한 뒤, 아직 요청하지 않았다면 영상 만들기를 선택하고 아래 제작 요청을 입력해 실행하세요. 추가 결제가 필요하면 진행하지 마세요.'
          : '오른쪽 Gemini가 열린 것을 확인한 뒤, 아직 요청하지 않았다면 아래 문장을 입력하고 실행하세요.');
      if (submitOnly && prepared.feature === 'VIDEO')
        steps[steps.length - 1] += ' 추가 결제가 필요하면 진행하지 마세요.';
      steps.push(resultInstruction);
    }
    return frozen({...current, manualSteps: steps,
      ...(!viewing && !submitOnly && !unresolvedBinding ? {preparedPrompt: prepared.prompt} : {}),
      requiresUserReply: false, returnToGpt: prepared.returnToGpt, automaticReturnToGpt: false});
  }

  function prepareManualReturn({requested} = {}) {
    if (prepared.active !== true) return prepared;
    return createJebiseoManualReturnGuide(prepared, {requested,
      requiresResultInspection: requiresResultInspection || priorEffectReadback});
  }

  return Object.freeze({request: prepared, deliveryMode, start, readOpenStatus, reportManualProgress,
    presentation, prepareManualReturn, view: () => current});
}
