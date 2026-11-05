/** Advisory guides for the phone's existing text-selection and share menus.
 * These helpers never open an app, invoke an Intent, submit text, inspect a
 * screen, collect a Gemini answer or bind an incoming share to a GPT thread.
 */
import {createJebiseoManualHandoff} from './handoff-request.mjs';

const FORWARD_SCHEMA = 'jh.jebiseo-text-selection-guide.v1';
const RETURN_SCHEMA = 'jh.jebiseo-manual-return-guide.v1';
const STEPS = new Set(['READY', 'OPEN', 'HANDOFF', 'INPUT', 'SUBMIT']);
const flags = Object.freeze({advisoryOnly: true, authorityVerified: false,
  toolInvoked: false, receiverSurfaceVerified: false, layoutVerified: false,
  screenVerified: false, requestSent: false, resultVerified: false,
  externalEffectVerified: false, geminiReplyVerified: false,
  automaticReplay: false, automaticResume: false, automaticOpen: false,
  authorizesExecution: false, automaticReturnToGpt: false,
  requiresUserReply: false, collectsResult: false});

const freeze = value => Object.freeze({...value,
  manualSteps: Object.freeze([...(value.manualSteps ?? [])])});

function validate(request) {
  const scope = {};
  if (request !== null && typeof request === 'object') {
    for (const key of ['taskRef', 'threadRef', 'sourceRef', 'requestDigest'])
      scope[key] = Object.getOwnPropertyDescriptor(request, key)?.value;
  }
  // Reuse the prepared-request validator without reading a caller's getter or
  // accepting the public object as independent execution evidence.
  return createJebiseoManualHandoff(request, {...scope,
    step: 'OPEN', outcome: 'NOT_ATTEMPTED'});
}

function rejected(schema, code) {
  return freeze({schema, ok: false, active: false, status: 'BLOCKED', code,
    nextAction: 'NONE', userReported: false, readbackRequired: false,
    manualExecutionRecommended: false, returnToGpt: false, ...flags});
}

function base(validated, schema) {
  return {schema, ok: true, active: true, taskRef: validated.taskRef,
    threadRef: validated.threadRef, sourceRef: validated.sourceRef,
    requestDigest: validated.requestDigest, promptDigest: validated.promptDigest,
    feature: validated.feature, requestSurface: validated.surface,
    layout: validated.layout, nativeGeminiRequired: validated.feature === 'ANDROID',
    userReported: false, readbackRequired: false, ...flags,
    returnToGpt: validated.returnToGpt === true, resultDestination: validated.resultDestination};
}

function inspectExisting(value) {
  const instruction = '오른쪽 Gemini의 기존 입력·요청·결과를 먼저 확인하세요. 선택 메뉴를 다시 누르거나 같은 요청을 다시 입력·전송하지 마세요.';
  return freeze({...value, status: 'OBSERVE_EXISTING',
    code: 'JEBISEO_EXISTING_OUTCOME_REVIEW_REQUIRED', nextAction: 'INSPECT_EXISTING',
    readbackRequired: true, manualExecutionRecommended: false,
    instruction, manualSteps: [instruction]});
}

function draftInstruction(feature) {
  const instruction = '요청이 초안으로 남아 있을 때만 실행하세요. 이미 답변이나 작업이 진행 중이면 다시 보내지 말고 그대로 확인하세요.';
  return feature === 'VIDEO'
    ? `영상 제작 요청인지 확인하세요. ${instruction} 추가 결제가 필요하면 진행하지 마세요.`
    : instruction;
}

/** preparedRequest is the unchanged result of prepareJebiseoHandoff().
 * Non-READY steps are optional user progress reports, never verified results.
 */
export function createJebiseoTextSelectionGuide(preparedRequest,
  {step = 'READY', requiresResultInspection = false} = {}) {
  const validated = validate(preparedRequest);
  if (validated.active !== true) return rejected(FORWARD_SCHEMA, validated.code);
  if (!STEPS.has(step) || typeof requiresResultInspection !== 'boolean')
    return rejected(FORWARD_SCHEMA, 'JEBISEO_TEXT_SELECTION_STEP_INVALID');
  const value = {...base(validated, FORWARD_SCHEMA),
    direction: 'GPT_TO_GEMINI', surface: 'ANDROID_TEXT_SELECTION_MENU',
    targetApplication: 'Gemini', step,
    userReported: step !== 'READY',
    outcomeReported: step === 'READY' ? 'NOT_ATTEMPTED' : 'USER_REPORTED_DONE'};
  if (requiresResultInspection) return inspectExisting(value);

  let nextAction, steps;
  const checkReceived = validated.feature === 'ANDROID'
    ? '왼쪽 GPT·오른쪽 Gemini 배치를 확인하고, Gemini 모바일 앱에서 받은 내용과 현재 입력 상태를 확인하세요.'
    : '왼쪽 GPT·오른쪽 Gemini 배치를 확인하고, Gemini에서 받은 내용과 현재 입력 상태를 확인하세요.';
  if (step === 'READY') {
    nextAction = 'SELECT_TEXT';
    steps = ['아래 요청 문장만 선택하고, 선택 메뉴의 ‘Gemini에게 물어보기’를 누르세요.',
      checkReceived, draftInstruction(validated.feature)];
  } else if (step === 'OPEN' || step === 'HANDOFF') {
    nextAction = 'CHECK_RECEIVED_TEXT';
    steps = [`${checkReceived} 같은 문장을 다시 선택하거나 입력하지 마세요. 이미 답변이나 작업이 진행 중이면 현재 진행을 확인하세요.`];
  } else if (step === 'INPUT') {
    nextAction = 'SUBMIT_IF_DRAFT';
    steps = ['오른쪽 Gemini의 기존 입력 문장을 확인하세요. 문장을 다시 입력하지 마세요.',
      draftInstruction(validated.feature)];
  } else {
    nextAction = 'VIEW_GEMINI_RESULT';
    steps = [validated.feature === 'YOUTUBE'
      ? '오른쪽 Gemini에서 유튜브 분석이 끝났는지 확인하세요.'
      : '진행 상황과 결과는 오른쪽 Gemini에서 확인하세요. GPT로 돌아와 완료를 알릴 필요는 없습니다.'];
  }
  if (validated.feature === 'YOUTUBE')
    steps.push('분석이 끝난 뒤 답변 텍스트를 선택·공유해 GPT로 보내고, 현재 작업하던 GPT 대화에 받은 내용을 확인하세요.');
  return freeze({...value, status: step === 'SUBMIT' ? 'VIEW_IN_GEMINI' : 'MANUAL_GUIDE',
    code: step === 'READY' ? 'JEBISEO_TEXT_SELECTION_GUIDE_READY' : 'JEBISEO_TEXT_SELECTION_PROGRESS_USER_REPORTED',
    nextAction, manualExecutionRecommended: step === 'READY' || step === 'INPUT',
    instruction: steps.join(' '), manualSteps: steps,
    ...(step === 'READY' ? {preparedPrompt: preparedRequest.prompt} : {})});
}

/** YouTube includes a manual return after analysis; other features opt in.
 * An explicit false suppresses this guide. No answer text is collected
 * and no claim is made that a share target opens this existing GPT conversation.
 */
export function createJebiseoManualReturnGuide(preparedRequest,
  {requested, requiresResultInspection = false} = {}) {
  const validated = validate(preparedRequest);
  if (validated.active !== true) return rejected(RETURN_SCHEMA, validated.code);
  if ((requested !== undefined && typeof requested !== 'boolean') || typeof requiresResultInspection !== 'boolean')
    return rejected(RETURN_SCHEMA, 'JEBISEO_MANUAL_RETURN_ARGUMENTS_INVALID');
  const enabled = requested === undefined ? validated.feature === 'YOUTUBE' : requested;
  const value = {...base(validated, RETURN_SCHEMA), direction: 'GEMINI_TO_GPT',
    surface: 'ANDROID_TEXT_SHARE_MENU', targetApplication: 'ChatGPT',
    manualReturnRequested: enabled, resultReturned: false,
    ...(enabled ? {returnToGpt: true, resultDestination: 'GPT_AFTER_MANUAL_SHARE'} : {}),
    currentGptConversationVerified: false};
  if (!enabled) return freeze({...value, active: false, status: 'INACTIVE',
    code: 'JEBISEO_MANUAL_RETURN_NOT_REQUESTED', nextAction: 'NONE',
    manualExecutionRecommended: false});
  if (requiresResultInspection) return inspectExisting(value);
  const steps = [validated.feature === 'YOUTUBE'
    ? 'Gemini에서 유튜브 분석이 끝난 뒤 가져올 답변 텍스트만 선택하세요.'
    : 'Gemini에서 가져올 답변 텍스트만 선택하세요.',
    '선택한 텍스트의 공유 메뉴 또는 주인님이 확인한 GPT 전송 메뉴를 이용하세요. 실제 공유 목록에 ChatGPT가 보이면 선택하세요.',
    '공유 목록에 ChatGPT가 없다면 선택한 텍스트를 복사해 현재 GPT 대화에 붙여넣으세요.',
    '내용을 받은 GPT 대화가 왼쪽의 현재 작업하던 방인지 확인하세요. 다른 방이면 원래 대화에 붙여넣어 이어가세요.'];
  return freeze({...value, status: 'MANUAL_RETURN_GUIDE',
    code: 'JEBISEO_MANUAL_RETURN_GUIDE_READY', nextAction: 'SHARE_TO_GPT',
    manualExecutionRecommended: true, instruction: steps.join(' '), manualSteps: steps});
}
