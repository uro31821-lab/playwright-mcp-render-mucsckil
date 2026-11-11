import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareJebiseoHandoff} from './handoff-request.mjs';
import {createJebiseoTextSelectionGuide, createJebiseoManualReturnGuide} from './text-selection-guide.mjs';

const prepare = (feature = 'ANDROID') => prepareJebiseoHandoff({
  taskRef: 'fixture-selection-task', threadRef: 'fixture-selection-thread',
  sourceRef: 'fixture-current-request', intent: 'execute', basis: 'direct', feature,
  requestText: '선택한 내용만 정확히 처리해 줘.\n줄바꿈과 기호 ✨도 유지해 줘.',
  ...(feature === 'YOUTUBE' ? {youtubeUrl: 'https://youtu.be/abcde12345_'} : {})
});
const noExecution = guide => {
  for (const key of ['authorityVerified', 'toolInvoked', 'receiverSurfaceVerified',
    'layoutVerified', 'screenVerified', 'requestSent', 'resultVerified',
    'externalEffectVerified', 'geminiReplyVerified', 'automaticReplay',
    'automaticResume', 'automaticOpen', 'authorizesExecution',
    'automaticReturnToGpt', 'requiresUserReply', 'collectsResult'])
    assert.equal(guide[key], false, key);
  assert.equal(guide.advisoryOnly, true);
};

test('READY preserves the selected request for all three features without opening or claiming a receiver', () => {
  for (const feature of ['ANDROID', 'YOUTUBE', 'VIDEO']) {
    const request = prepare(feature);
    const guide = createJebiseoTextSelectionGuide(request);
    assert.equal(guide.active, true); assert.equal(guide.nextAction, 'SELECT_TEXT');
    assert.equal(guide.preparedPrompt, request.prompt);
    assert.equal(guide.surface, 'ANDROID_TEXT_SELECTION_MENU');
    assert.equal(guide.requestSurface, request.surface);
    assert.equal(guide.targetApplication, 'Gemini');
    assert.equal(guide.nativeGeminiRequired, feature === 'ANDROID');
    assert.equal(guide.returnToGpt, feature === 'YOUTUBE');
    assert.equal(guide.resultDestination, feature === 'YOUTUBE' ? 'GPT_AFTER_MANUAL_SHARE' : 'GEMINI');
    assert.equal(guide.layout, 'LEFT_GPT_RIGHT_GEMINI');
    assert.equal(guide.threadRef, request.threadRef);
    assert.equal(guide.requestDigest, request.requestDigest);
    assert.equal(guide.userReported, false);
    assert.match(guide.manualSteps[0], /Gemini에게 물어보기/);
    assert.match(guide.instruction, /초안으로 남아 있을 때만 실행/);
    assert.match(guide.instruction, /이미 답변이나 작업이 진행 중/);
    assert.equal(Object.isFrozen(guide), true);
    assert.equal(Object.isFrozen(guide.manualSteps), true);
    noExecution(guide);
  }
});

test('reported progress hides the prompt and never directs the user back to the selection menu', () => {
  const request = prepare();
  for (const [step, action] of [['OPEN', 'CHECK_RECEIVED_TEXT'],
    ['HANDOFF', 'CHECK_RECEIVED_TEXT'], ['INPUT', 'SUBMIT_IF_DRAFT'],
    ['SUBMIT', 'VIEW_GEMINI_RESULT']]) {
    const guide = createJebiseoTextSelectionGuide(request, {step});
    assert.equal(guide.nextAction, action); assert.equal(guide.userReported, true);
    assert.equal(Object.hasOwn(guide, 'preparedPrompt'), false);
    assert.equal(Object.hasOwn(guide, 'prompt'), false);
    assert.doesNotMatch(guide.instruction, /Gemini에게 물어보기/);
    if (step === 'SUBMIT') {
      assert.equal(guide.manualSteps.length, 1);
      assert.equal(guide.manualExecutionRecommended, false);
    } else if (step === 'INPUT') assert.match(guide.instruction, /초안으로 남아 있을 때만 실행/);
    else {
      assert.equal(guide.manualExecutionRecommended, false);
      assert.equal(guide.manualSteps.length, 1);
      assert.doesNotMatch(guide.instruction, /실행하세요/);
    }
    noExecution(guide);
  }
});

test('an unresolved original effect overrides every forward progress state and suppresses the prompt', () => {
  for (const step of ['READY', 'OPEN', 'HANDOFF', 'INPUT', 'SUBMIT']) {
    const guide = createJebiseoTextSelectionGuide(prepare(), {step, requiresResultInspection: true});
    assert.equal(guide.nextAction, 'INSPECT_EXISTING');
    assert.equal(guide.readbackRequired, true);
    assert.equal(guide.manualExecutionRecommended, false);
    assert.equal(guide.manualSteps.length, 1);
    assert.equal(Object.hasOwn(guide, 'preparedPrompt'), false);
    assert.match(guide.instruction, /같은 요청을 다시 입력·전송하지 마세요/);
    noExecution(guide);
  }
});

test('both guides reject tampered request bindings and do not evaluate prepared-request getters', () => {
  const request = prepare();
  const getter = {...request};
  Object.defineProperty(getter, 'taskRef', {enumerable: true,
    get() {assert.fail('prepared request getter must not be evaluated');}});
  for (const altered of [undefined, {...request, prompt: '다른 요청'},
    {...request, threadRef: 'fixture-other-thread'}, {...request, requestSent: true}, getter]) {
    for (const create of [createJebiseoTextSelectionGuide, createJebiseoManualReturnGuide]) {
      const guide = create(altered);
      assert.equal(guide.active, false); assert.equal(guide.nextAction, 'NONE');
      assert.equal(guide.code, 'JEBISEO_HANDOFF_REQUEST_BINDING_INVALID');
      assert.equal(guide.returnToGpt, false);
      assert.equal(Object.hasOwn(guide, 'preparedPrompt'), false);
      assert.equal(guide.manualSteps.length, 0); noExecution(guide);
    }
  }
});

test('manual return is optional and describes actual share targets without collecting an answer or claiming a thread', () => {
  const request = prepare('ANDROID');
  const absent = createJebiseoManualReturnGuide(request);
  assert.equal(absent.active, false); assert.equal(absent.status, 'INACTIVE');
  assert.equal(absent.nextAction, 'NONE'); assert.equal(absent.manualSteps.length, 0);
  assert.equal(absent.manualReturnRequested, false); assert.equal(absent.returnToGpt, false); noExecution(absent);
  const guide = createJebiseoManualReturnGuide(request, {requested: true});
  assert.equal(guide.active, true); assert.equal(guide.nextAction, 'SHARE_TO_GPT');
  assert.equal(guide.targetApplication, 'ChatGPT');
  assert.equal(guide.returnToGpt, true); assert.equal(guide.resultDestination, 'GPT_AFTER_MANUAL_SHARE');
  assert.equal(guide.manualReturnRequested, true); assert.equal(guide.userReported, false);
  assert.equal(guide.resultReturned, false); assert.equal(guide.currentGptConversationVerified, false);
  assert.equal(guide.threadRef, request.threadRef);
  assert.match(guide.instruction, /주인님이 확인한 GPT 전송 메뉴/);
  assert.match(guide.instruction, /공유 목록에 ChatGPT가 없다면/);
  assert.match(guide.instruction, /현재 작업하던 방인지 확인/);
  assert.doesNotMatch(guide.instruction, /ChatGPT에게 물어보기/);
  for (const key of ['preparedPrompt', 'prompt', 'reply', 'resultText', 'tool', 'arguments'])
    assert.equal(Object.hasOwn(guide, key), false, key);
  assert.equal(Object.isFrozen(guide.manualSteps), true); noExecution(guide);
});

test('unresolved original effects keep return requests at inspection and never offer another share', () => {
    const absent = createJebiseoManualReturnGuide(prepare(), {requiresResultInspection: true});
    assert.equal(absent.active, false); assert.equal(absent.nextAction, 'NONE');
    assert.equal(absent.manualSteps.length, 0);
    const guide = createJebiseoManualReturnGuide(prepare(), {requested: true, requiresResultInspection: true});
    assert.equal(guide.nextAction, 'INSPECT_EXISTING');
    assert.equal(guide.readbackRequired, true);
    assert.equal(guide.manualExecutionRecommended, false);
    assert.equal(guide.manualSteps.length, 1);
    assert.doesNotMatch(guide.instruction, /GPT 전송 메뉴|붙여넣으세요/);
    assert.equal(guide.resultReturned, false); noExecution(guide);
});

test('YouTube returns by manual share after completed analysis by default while Android and video stay optional', () => {
  const youtube = prepare('YOUTUBE');
  for (const step of ['READY', 'OPEN', 'HANDOFF', 'INPUT', 'SUBMIT']) {
    const forward = createJebiseoTextSelectionGuide(youtube, {step});
    assert.equal(forward.returnToGpt, true);
    assert.equal(forward.resultDestination, 'GPT_AFTER_MANUAL_SHARE');
    assert.match(forward.instruction, /분석이 끝난 뒤 답변 텍스트를 선택·공유해 GPT로 보내고/);
    if (step === 'SUBMIT') assert.equal(forward.nextAction, 'VIEW_GEMINI_RESULT');
    noExecution(forward);
    const pending = createJebiseoTextSelectionGuide(youtube, {step, requiresResultInspection: true});
    assert.equal(pending.nextAction, 'INSPECT_EXISTING');
    assert.doesNotMatch(pending.instruction, /공유해 GPT로|붙여넣으세요/);
    assert.equal(pending.manualSteps.length, 1); noExecution(pending);
  }
  const returning = createJebiseoManualReturnGuide(youtube);
  assert.equal(returning.active, true); assert.equal(returning.nextAction, 'SHARE_TO_GPT');
  assert.equal(returning.returnToGpt, true); assert.equal(returning.manualReturnRequested, true);
  assert.match(returning.instruction, /유튜브 분석이 끝난 뒤/);
  assert.equal(returning.resultReturned, false); noExecution(returning);
  const pendingReturn = createJebiseoManualReturnGuide(youtube, {requiresResultInspection: true});
  assert.equal(pendingReturn.nextAction, 'INSPECT_EXISTING');
  assert.doesNotMatch(pendingReturn.instruction, /GPT 전송 메뉴|붙여넣으세요/);
  noExecution(pendingReturn);
  for (const requiresResultInspection of [false, true]) {
    const disabled = createJebiseoManualReturnGuide(youtube, {requested: false, requiresResultInspection});
    assert.equal(disabled.active, false); assert.equal(disabled.nextAction, 'NONE');
    assert.equal(disabled.manualReturnRequested, false); assert.equal(disabled.manualSteps.length, 0);
    noExecution(disabled);
  }
  for (const feature of ['ANDROID', 'VIDEO']) {
    const request = prepare(feature);
    const forward = createJebiseoTextSelectionGuide(request, {step: 'SUBMIT'});
    assert.equal(forward.returnToGpt, false); assert.equal(forward.resultDestination, 'GEMINI');
    assert.doesNotMatch(forward.instruction, /공유해 GPT로/);
    const absent = createJebiseoManualReturnGuide(request);
    assert.equal(absent.active, false); assert.equal(absent.returnToGpt, false);
    const explicit = createJebiseoManualReturnGuide(request, {requested: true});
    assert.equal(explicit.nextAction, 'SHARE_TO_GPT'); assert.equal(explicit.returnToGpt, true);
    assert.equal(explicit.resultReturned, false); noExecution(explicit);
  }
});

test('invalid step and nonboolean options cannot enable a manual handoff or opt in to result return', () => {
  const request = prepare();
  for (const options of [{step: 'SEND'}, {step: 'ready'}, {requiresResultInspection: 'true'}]) {
    const guide = createJebiseoTextSelectionGuide(request, options);
    assert.equal(guide.active, false); assert.equal(guide.nextAction, 'NONE');
    assert.equal(guide.manualSteps.length, 0); noExecution(guide);
  }
  for (const options of [{requested: 'true'}, {requested: 1}, {requiresResultInspection: 'false'}]) {
    const guide = createJebiseoManualReturnGuide(request, options);
    assert.equal(guide.active, false); assert.equal(guide.nextAction, 'NONE');
    assert.equal(guide.manualSteps.length, 0); noExecution(guide);
  }
});
