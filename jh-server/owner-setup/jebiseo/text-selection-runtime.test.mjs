import test from 'node:test';
import assert from 'node:assert/strict';
import {createJebiseoHandoffSession} from './handoff-runtime.mjs';

const request = (feature = 'ANDROID', overrides = {}) => ({
  taskRef: 'fixture-selection-task', threadRef: 'fixture-selection-thread',
  sourceRef: 'fixture-user-request', intent: 'execute', basis: 'direct', feature,
  requestText: '현재 선택한 내용으로 요청해 줘',
  ...(feature === 'YOUTUBE' ? {youtubeUrl: 'https://youtu.be/abcde12345_'} : {}),
  ...overrides
});
const options = feature => ({request: request(feature), deliveryMode: 'TEXT_SELECTION', deviceId: 'fixture-phone',
  commandId: '1'.repeat(32), createOriginalRuntime() {
    assert.fail('selection menu must not construct any original phone runtime');
  }});
const report = (session, step) => ({taskRef: session.request.taskRef,
  threadRef: session.request.threadRef, requestDigest: session.request.requestDigest, step});

test('all three features use manual selection only when TEXT_SELECTION is explicitly chosen', async () => {
  for (const feature of ['ANDROID', 'YOUTUBE', 'VIDEO']) {
    const session = createJebiseoHandoffSession(options(feature));
    assert.equal(session.deliveryMode, 'TEXT_SELECTION');
    assert.equal(session.presentation().preparedPrompt, session.request.prompt);
    const [first, second] = await Promise.all([session.start(), session.start()]);
    assert.equal(first, second); assert.equal(first.nextAction, 'SELECT_TEXT');
    assert.equal(first.preparedPrompt, session.request.prompt);
    assert.equal(first.automatedOpenAttempted, false);
    assert.equal(first.requestSent, false); assert.equal(first.returnToGpt, feature === 'YOUTUBE');
    assert.equal(first.automaticReturnToGpt, false);
    assert.equal(first.resultDestination, feature === 'YOUTUBE' ? 'GPT_AFTER_MANUAL_SHARE' : 'GEMINI');
    assert.equal(first.requiresUserReply, false);
    assert.equal(await session.start(), first);
    assert.equal(await session.readOpenStatus(), first);
    assert.match(first.manualSteps.join(' '), /Gemini에게 물어보기/);
  }
});

test('selection reports advance once without resending the selected text', async () => {
  const session = createJebiseoHandoffSession(options('YOUTUBE')); await session.start();
  const handed = session.reportManualProgress(report(session, 'HANDOFF'));
  assert.equal(handed.nextAction, 'CHECK_RECEIVED_TEXT');
  assert.equal(handed.preparedPrompt, undefined);
  assert.equal(session.reportManualProgress(report(session, 'OPEN')), handed);
  const draft = session.reportManualProgress(report(session, 'INPUT'));
  assert.equal(draft.nextAction, 'SUBMIT_IF_DRAFT');
  assert.equal(draft.preparedPrompt, undefined);
  const submitted = session.reportManualProgress(report(session, 'SUBMIT'));
  assert.equal(submitted.nextAction, 'VIEW_GEMINI_RESULT');
  assert.equal(session.reportManualProgress(report(session, 'HANDOFF')), submitted);
  assert.equal(session.reportManualProgress(report(session, 'INPUT')), submitted);
  assert.equal(await session.start(), submitted);
  assert.equal(session.presentation().preparedPrompt, undefined);
  assert.equal(submitted.requestSent, false); assert.equal(submitted.resultVerified, false);
});

test('selection progress is bound to the current task and request', async () => {
  const session = createJebiseoHandoffSession(options('ANDROID'));
  const before = await session.start();
  for (const bad of [{threadRef: 'different-thread'}, {taskRef: 'different-task'},
    {requestDigest: '0'.repeat(64)}, {step: 'AUTO_SENT'}]) {
    assert.equal(session.reportManualProgress({...report(session, 'HANDOFF'), ...bad}).ok, false);
    assert.equal(session.view(), before);
  }
});

test('a current unresolved effect blocks both selection and legacy modes without another phone call', async () => {
  for (const deliveryMode of ['TEXT_SELECTION', 'OPEN_MANUAL']) {
    const session = createJebiseoHandoffSession({...options('VIDEO'), deliveryMode,
      requiresResultInspection: true});
    assert.equal(session.presentation().nextAction, 'INSPECT_EXISTING');
    assert.equal((await session.start()).nextAction, 'INSPECT_EXISTING');
    assert.equal(session.presentation().preparedPrompt, undefined);
    assert.equal(session.reportManualProgress(report(session, 'SUBMIT')).nextAction, 'INSPECT_EXISTING');
    assert.equal(session.prepareManualReturn().active, false);
    assert.equal(session.prepareManualReturn({requested: true}).nextAction, 'INSPECT_EXISTING');
  }
});

test('YouTube defaults to manual return; other features opt in, with no result read or forward mutation', async () => {
  for (const feature of ['ANDROID', 'YOUTUBE', 'VIDEO']) {
    const session = createJebiseoHandoffSession(options(feature));
    const before = await session.start();
    assert.equal(session.prepareManualReturn().active, feature === 'YOUTUBE');
    assert.equal(session.prepareManualReturn({requested: false}).active, false);
    const reverse = session.prepareManualReturn({requested: true});
    assert.equal(reverse.nextAction, 'SHARE_TO_GPT');
    assert.equal(reverse.requestSent, false); assert.equal(reverse.returnToGpt, true);
    assert.equal(reverse.automaticReturnToGpt, false); assert.equal(reverse.resultReturned, false);
    assert.equal(reverse.resultVerified, false);
    assert.equal(reverse.preparedPrompt, undefined);
    assert.equal(session.view(), before);
  }
});

test('invalid mode or inspection flag cannot silently select an execution path', () => {
  assert.throws(() => createJebiseoHandoffSession({...options('VIDEO'), deliveryMode: 'AUTO_SHARE'}),
    /DELIVERY_MODE_INVALID/);
  assert.throws(() => createJebiseoHandoffSession({...options('VIDEO'), requiresResultInspection: 'false'}),
    /INSPECTION_FLAG_INVALID/);
});

test('a quoted or development request stays inactive in both sharing directions', async () => {
  const session = createJebiseoHandoffSession({...options('ANDROID'), request: request('ANDROID', {intent: 'develop'})});
  assert.equal((await session.start()).active, false);
  assert.equal(session.presentation().active, false);
  assert.equal(session.prepareManualReturn({requested: true}).active, false);
});
