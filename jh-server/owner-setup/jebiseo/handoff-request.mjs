/**
 * One-way request preparation and manual guidance for the existing phone flow.
 * These are local, advisory values. There is no tool caller, receipt verifier,
 * action grant, phone-command creation, background retry or result collection.
 */
import {createHash} from 'node:crypto';

export const JEBISEO_HANDOFF_SCHEMA = 'jh.jebiseo-handoff.v1';
const GUIDE_SCHEMA = 'jh.jebiseo-manual-guide.v1';
const FEATURES = new Set(['ANDROID', 'YOUTUBE', 'VIDEO']);
const BASIS = new Set(['direct', 'contextual_user_request']);
const INPUT_KEYS = new Set(['taskRef', 'threadRef', 'sourceRef', 'intent', 'basis',
  'feature', 'requestText', 'target', 'youtubeUrl']);
const TRANSITION_KEYS = new Set(['taskRef', 'threadRef', 'sourceRef', 'requestDigest',
  'step', 'outcome', 'receiptRef']);
const STEPS = new Set(['OPEN', 'INPUT', 'SUBMIT']);
const UNCERTAIN = new Set(['PENDING', 'UNKNOWN', 'FAILED_AFTER_EFFECT',
  'PHONE_SCOPED_SITE_DISCARD', 'EFFECT_UNKNOWN', 'NEEDS_REVIEW_NO_REPLAY']);
const NO_EFFECT = new Set(['NOT_ATTEMPTED', 'VERIFIED_UNSUPPORTED_NO_EFFECT', 'FAILED_NO_EFFECT']);
const REPORTED = new Set(['VERIFIED_PASS', 'USER_REPORTED_DONE']);
const NEXT = Object.freeze({OPEN: 'INPUT', INPUT: 'SUBMIT', SUBMIT: 'VIEW_GEMINI_RESULT'});
const WEB_URL = 'https://gemini.google.com/app';
const digest = value => createHash('sha256').update(value, 'utf8').digest('hex');
const ref = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/.test(value);
const hex64 = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const flags = Object.freeze({advisoryOnly: true, authorityVerified: false,
  toolInvoked: false, requestSent: false, externalEffectVerified: false,
  resultVerified: false, geminiReplyVerified: false, screenVerified: false,
  automaticReplay: false, automaticResume: false, returnToGpt: false});

function dataObject(value, allowed) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  return Reflect.ownKeys(value).every(key => typeof key === 'string' &&
    (!allowed || allowed.has(key)) && (() => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor?.enumerable === true && Object.hasOwn(descriptor, 'value');
    })());
}

function text(value, maxBytes) {
  // Preserve selected content exactly. Never silently truncate or repair a
  // malformed string and send a different request from the one the user chose.
  return typeof value === 'string' && value.trim().length > 0 &&
    value.isWellFormed() && Buffer.byteLength(value, 'utf8') <= maxBytes &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
}

function rejected(code, extra = {}) {
  return Object.freeze({schema: JEBISEO_HANDOFF_SCHEMA, ok: false, active: false,
    status: 'BLOCKED', code, ...flags, ...extra});
}

function youtube(value) {
  if (!text(value, 2048) || value !== value.trim() || /\s/.test(value)) return null;
  let url;
  try {url = new URL(value);} catch {return null;}
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port)
    return null;
  let id;
  if (url.hostname === 'youtu.be') {
    const match = /^\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname);
    id = match?.[1];
  } else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com']
    .includes(url.hostname)) {
    if (/^\/watch\/?$/.test(url.pathname)) {
      const values = url.searchParams.getAll('v');
      if (values.length !== 1) return null;
      id = values[0];
    } else {
      id = /^\/(?:shorts|live|embed)\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[1];
    }
  }
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
  return {id, url: `https://www.youtube.com/watch?v=${id}`};
}

function requestDigest(request) {
  return digest(JSON.stringify([JEBISEO_HANDOFF_SCHEMA, request.taskRef,
    request.threadRef, request.sourceRef, request.intent, request.basis,
    request.feature, request.surface, request.target ?? null,
    request.youtubeVideoId ?? null, request.youtubeUrl ?? null, request.promptDigest,
    'LEFT_GPT_RIGHT_GEMINI', 'ANDROID_THEN_MANUAL', 'GEMINI', false,
    request.feature === 'VIDEO' ? ['EXISTING_PLAN_ONLY', 'NO_ADDITIONAL_PAYMENT'] : null]));
}

/**
 * The host supplies semantic invocation and only the current user-selected
 * request. Quoted examples, development, negation and ordinary discussion are
 * inactive; matching text such as "제비서" never activates an execution.
 *
 * @param {object} input
 * @returns {Readonly<object>} Request preparation only, never dispatch proof.
 */
export function prepareJebiseoHandoff(input = {}) {
  if (!dataObject(input, INPUT_KEYS)) return rejected('JEBISEO_HANDOFF_ARGUMENTS_INVALID');
  if (!ref(input.taskRef) || !ref(input.threadRef) || !ref(input.sourceRef))
    return rejected('JEBISEO_HANDOFF_SOURCE_SCOPE_REQUIRED');
  const scope = {taskRef: input.taskRef, threadRef: input.threadRef, sourceRef: input.sourceRef};
  if (input.intent !== 'execute' || !BASIS.has(input.basis))
    return rejected('JEBISEO_NO_CURRENT_EXECUTION_REQUEST', {...scope, status: 'INACTIVE'});
  if (!FEATURES.has(input.feature)) return rejected('JEBISEO_HANDOFF_FEATURE_INVALID', scope);
  if (!text(input.requestText, 16000)) return rejected('JEBISEO_HANDOFF_REQUEST_INVALID', scope);
  if (input.target !== undefined && (input.feature !== 'ANDROID' ||
      !text(input.target, 320) || /[\r\n\t]/.test(input.target)))
    return rejected('JEBISEO_HANDOFF_TARGET_INVALID', scope);
  if (input.feature !== 'YOUTUBE' && input.youtubeUrl !== undefined)
    return rejected('JEBISEO_HANDOFF_FEATURE_ARGUMENT_MISMATCH', scope);
  const video = input.feature === 'YOUTUBE' ? youtube(input.youtubeUrl) : null;
  if (input.feature === 'YOUTUBE' && !video)
    return rejected('JEBISEO_YOUTUBE_VIDEO_URL_REQUIRED', scope);

  const surface = input.feature === 'ANDROID' ? 'GEMINI_NATIVE' : 'GEMINI_WEB';
  const prompt = input.feature === 'YOUTUBE'
    ? `유튜브 링크: ${video.url}\n분석 요청: ${input.requestText}`
    : input.feature === 'VIDEO'
      ? `영상 제작 요청:\n${input.requestText}\n\n현재 계정의 기존 구독에 포함된 범위에서만 진행하고, 추가 결제는 진행하지 마세요.`
      : input.target === undefined ? input.requestText : `대상: ${input.target}\n요청: ${input.requestText}`;
  const prepared = {schema: JEBISEO_HANDOFF_SCHEMA, ok: true, active: true,
    status: 'REQUEST_READY', code: 'JEBISEO_HANDOFF_READY', ...scope,
    intent: 'execute', basis: input.basis, feature: input.feature, surface,
    ...(input.target === undefined ? {} : {target: input.target}),
    ...(video ? {youtubeUrl: video.url, youtubeVideoId: video.id, existenceVerified: false} : {}),
    prompt, promptDigest: digest(prompt),
    automaticInputFits: [...prompt].length <= 1200 && Buffer.byteLength(prompt, 'utf8') <= 2048,
    layout: 'LEFT_GPT_RIGHT_GEMINI', routingModel: 'ANDROID_THEN_MANUAL',
    resultDestination: 'GEMINI', manualAllowed: true,
    nativeGeminiRequired: surface === 'GEMINI_NATIVE',
    supportsCurrentTargetVerified: false,
    ...(surface === 'GEMINI_WEB' ? {openUrl: WEB_URL} : {}),
    ...(input.feature === 'VIDEO' ? {existingPlanOnly: true, additionalPaymentAllowed: false,
      availabilityVerified: false} : {}),
    ...flags};
  return Object.freeze({...prepared, requestDigest: requestDigest(prepared)});
}

function validPrepared(request) {
  if (!dataObject(request) || request.schema !== JEBISEO_HANDOFF_SCHEMA ||
      request.ok !== true || request.active !== true || request.status !== 'REQUEST_READY' ||
      !ref(request.taskRef) || !ref(request.threadRef) || !ref(request.sourceRef) ||
      request.intent !== 'execute' || !BASIS.has(request.basis) || !FEATURES.has(request.feature) ||
      !text(request.prompt, 18000) || request.promptDigest !== digest(request.prompt) ||
      !hex64(request.requestDigest) || request.requestDigest !== requestDigest(request) ||
      request.layout !== 'LEFT_GPT_RIGHT_GEMINI' || request.routingModel !== 'ANDROID_THEN_MANUAL' ||
      request.resultDestination !== 'GEMINI' || request.manualAllowed !== true ||
      request.supportsCurrentTargetVerified !== false ||
      Object.entries(flags).some(([key, value]) => request[key] !== value)) return false;
  const native = request.feature === 'ANDROID';
  if (request.surface !== (native ? 'GEMINI_NATIVE' : 'GEMINI_WEB') ||
      request.nativeGeminiRequired !== native ||
      (native ? Object.hasOwn(request, 'openUrl') : request.openUrl !== WEB_URL)) return false;
  if (request.feature === 'YOUTUBE') {
    const video = youtube(request.youtubeUrl);
    if (!video || video.id !== request.youtubeVideoId || video.url !== request.youtubeUrl ||
        request.existenceVerified !== false) return false;
  }
  if (request.feature === 'VIDEO' && (request.existingPlanOnly !== true ||
      request.additionalPaymentAllowed !== false || request.availabilityVerified !== false)) return false;
  return true;
}

function receiptRef(value) {
  // Keep a reference to the original job/receipt only, never receipt tokens,
  // signed payloads, account IDs or provider response text.
  return typeof value === 'string' && value.length <= 180 &&
    /^(?:job_[0-9]{1,20}|(?:receipt[_:]|observation:)[A-Za-z0-9][A-Za-z0-9._:-]*)$/.test(value);
}

function instruction(action, request) {
  if (action === 'OPEN') return request.surface === 'GEMINI_NATIVE'
    ? '왼쪽 GPT를 유지하고 오른쪽에 Gemini 모바일 앱을 여세요.'
    : '왼쪽 GPT를 유지하고 오른쪽에서 Gemini를 여세요.';
  if (action === 'INPUT') return request.feature === 'VIDEO'
    ? '오른쪽 Gemini에서 영상 만들기를 선택하고 준비된 제작 요청을 입력하세요. 추가 결제가 필요하면 진행하지 마세요.'
    : '오른쪽 Gemini 입력창에 준비된 요청을 입력하세요.';
  if (action === 'SUBMIT') return '오른쪽 Gemini에 입력된 요청을 확인하고 실행 버튼을 누르세요.';
  return '진행 상황과 결과는 오른쪽 Gemini에서 확인하세요.';
}

/**
 * The original host may translate its known step outcome into an advisory.
 * A caller-supplied outcome is NOT authenticated evidence or an action grant.
 * Even VERIFIED_PASS or a user acknowledgement never verifies a provider
 * submission, Samsung operation, analysis result or video in this function.
 */
export function createJebiseoManualHandoff(request, transition = {}) {
  const fail = code => Object.freeze({schema: GUIDE_SCHEMA, ok: false, active: false,
    status: 'BLOCKED', code, nextAction: 'NONE', userReported: false, ...flags});
  if (!validPrepared(request)) return fail('JEBISEO_HANDOFF_REQUEST_BINDING_INVALID');
  if (!dataObject(transition, TRANSITION_KEYS)) return fail('JEBISEO_HANDOFF_TRANSITION_INVALID');
  if (['taskRef', 'threadRef', 'sourceRef', 'requestDigest'].some(key => transition[key] !== request[key]))
    return fail('JEBISEO_HANDOFF_TRANSITION_SCOPE_MISMATCH');
  if (!STEPS.has(transition.step) ||
      ![NO_EFFECT, UNCERTAIN, REPORTED].some(group => group.has(transition.outcome)))
    return fail('JEBISEO_HANDOFF_TRANSITION_INVALID');
  if (transition.receiptRef !== undefined && !receiptRef(transition.receiptRef))
    return fail('JEBISEO_HANDOFF_RECEIPT_REFERENCE_INVALID');

  const base = {schema: GUIDE_SCHEMA, ok: true, active: true,
    taskRef: request.taskRef, threadRef: request.threadRef, sourceRef: request.sourceRef,
    requestDigest: request.requestDigest, promptDigest: request.promptDigest,
    feature: request.feature, surface: request.surface, layout: request.layout,
    resultDestination: 'GEMINI', step: transition.step,
    outcomeReported: transition.outcome, userReported: transition.outcome === 'USER_REPORTED_DONE',
    ...(transition.receiptRef === undefined ? {} : {receiptRef: transition.receiptRef}),
    ...flags};
  if (UNCERTAIN.has(transition.outcome)) return Object.freeze({...base,
    status: 'OBSERVE_EXISTING', code: 'JEBISEO_EXISTING_OUTCOME_REVIEW_REQUIRED',
    nextAction: 'INSPECT_EXISTING', readbackRequired: true,
    manualExecutionRecommended: false,
    instruction: transition.step === 'OPEN'
      ? '오른쪽에 Gemini가 이미 열렸는지 현재 화면을 확인하세요. 같은 열기 작업을 반복하지 마세요.'
      : '오른쪽 Gemini의 기존 입력·요청·결과를 먼저 확인하세요. 같은 요청을 다시 입력하거나 실행하지 마세요.'});
  const nextAction = REPORTED.has(transition.outcome) ? NEXT[transition.step] : transition.step;
  return Object.freeze({...base,
    status: nextAction === 'VIEW_GEMINI_RESULT' ? 'VIEW_IN_GEMINI' : 'MANUAL_GUIDE',
    code: transition.outcome === 'USER_REPORTED_DONE' ? 'JEBISEO_MANUAL_STEP_USER_REPORTED' : 'JEBISEO_MANUAL_GUIDE_READY',
    nextAction, readbackRequired: false,
    manualExecutionRecommended: nextAction !== 'VIEW_GEMINI_RESULT',
    instruction: instruction(nextAction, request),
    ...(nextAction === 'INPUT' ? {prompt: request.prompt} : {})});
}
