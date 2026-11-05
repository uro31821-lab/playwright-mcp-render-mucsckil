import test from 'node:test';
import assert from 'node:assert/strict';
import {createJebiseoHandoffSession} from './handoff-runtime.mjs';

const request = (overrides = {}) => ({taskRef: 'auto-select-task-001',
  threadRef: 'auto-select-thread-001', sourceRef: 'auto-select-user-001',
  intent: 'execute', basis: 'direct', feature: 'YOUTUBE',
  youtubeUrl: 'https://youtu.be/abcde12345_', requestText: '이 영상의 핵심을 정리해 줘.', ...overrides});
const options = (extra = {}) => ({request: request(), deviceId: 'auto-select-phone-001',
  commandId: '1'.repeat(32), createOriginalRuntime() {assert.fail('no separate OPEN');}, ...extra});

test('automatic three-step delivery is the default and an absent native connection never becomes a manual success', async () => {
  const session = createJebiseoHandoffSession(options());
  assert.equal(session.deliveryMode, 'AUTO_TEXT_SELECTION');
  assert.equal(session.presentation().preparedPrompt, session.request.prompt);
  assert.deepEqual(session.presentation().automationStages,
    ['SELECT_REQUEST_TEXT', 'CLICK_GEMINI_MENU', 'SUBMIT_GEMINI']);
  const blocked = await session.start();
  assert.equal(blocked.code, 'JEBISEO_NATIVE_TEXT_HANDOFF_NOT_CONNECTED');
  assert.equal(blocked.manualExecutionRecommended, false);
  assert.equal(blocked.selectionVerified, false);
  assert.equal(blocked.menuClickVerified, false);
  assert.equal(blocked.submitClickVerified, false);
  assert.equal(blocked.requestSent, false);
});

test('the prepared source binding reaches only the original native factory and starts once', async () => {
  let made = 0, starts = 0, resumes = 0, received;
  const session = createJebiseoHandoffSession(options({createNativeTextHandoffRuntime(args) {
    made++; received = args;
    return {async start() {starts++; return {status: 'APPROVAL_PENDING', nextAction: 'APPROVE_ON_PHONE',
      selectionVerified: true, menuClickVerified: false, submitClickVerified: false, requestSent: false};},
    async resume() {resumes++; return {status: 'SUBMIT_CLICK_DISPATCHED', selectionVerified: true,
      menuClickVerified: true, submitClickVerified: true, requestSent: false};}};
  }}));
  const [a, b] = await Promise.all([session.start(), session.start()]);
  assert.equal(a, b); assert.equal(made, 1); assert.equal(starts, 1);
  assert.deepEqual(received.request, request());
  assert.deepEqual(received.nativeSelection, {schema: 'jh.jebiseo-native-selection.v1',
    taskRef: session.request.taskRef, threadRef: session.request.threadRef,
    sourceRef: session.request.sourceRef, requestDigest: session.request.requestDigest,
    promptDigest: session.request.promptDigest});
  assert.equal(received.deviceId, 'auto-select-phone-001');
  assert.equal(received.commandId, '1'.repeat(32));
  const [c, d] = await Promise.all([session.resumeAutomation(), session.resumeAutomation()]);
  assert.equal(c, d); assert.equal(resumes, 1);
  assert.equal(c.submitClickVerified, true);
  assert.equal(c.requestSent, false); assert.equal(c.resultVerified, false);
  assert.equal(c.geminiReplyVerified, false); assert.equal(c.externalEffectVerified, false);
  assert.equal(c.returnToGpt, true); assert.equal(c.automaticReturnToGpt, false);
  assert.equal(await session.start(), c); assert.equal(starts, 1);
});

test('a resume cannot overtake the first original native operation', async () => {
  let release, entered, resumed = false;
  const started = new Promise(resolve => {entered = resolve;});
  const session = createJebiseoHandoffSession(options({createNativeTextHandoffRuntime() {
    return {start() {entered(); return new Promise(resolve => {release = resolve;});},
      async resume() {resumed = true; return {status: 'OBSERVE_EXISTING', requestSent: false};}};
  }}));
  const first = session.start(); await started;
  const later = session.resumeAutomation(); await Promise.resolve();
  assert.equal(resumed, false);
  release({status: 'APPROVAL_PENDING', requestSent: false});
  await first; await later; assert.equal(resumed, true);
});

test('manual progress reports cannot manufacture selection, menu or submit evidence in automatic mode', async () => {
  const session = createJebiseoHandoffSession(options()); const before = await session.start();
  for (const step of ['OPEN', 'HANDOFF', 'INPUT', 'SUBMIT']) {
    const report = session.reportManualProgress({taskRef: session.request.taskRef,
      threadRef: session.request.threadRef, requestDigest: session.request.requestDigest, step});
    assert.equal(report.code, 'JEBISEO_NATIVE_PROGRESS_REQUIRES_ORIGINAL_RECEIPT');
    assert.equal(session.view(), before);
  }
});

test('a retained uncertain operation blocks all three actions and result return without constructing a native runtime', async () => {
  const session = createJebiseoHandoffSession(options({requiresResultInspection: true,
    createNativeTextHandoffRuntime() {assert.fail('must inspect original effect');}}));
  for (const state of [session.presentation(), await session.start(), await session.resumeAutomation()]) {
    assert.equal(state.nextAction, 'INSPECT_EXISTING');
    assert.equal(state.preparedPrompt, undefined); assert.equal(state.prompt, undefined);
    assert.equal(state.requestSent, false);
  }
  assert.equal(session.prepareManualReturn().nextAction, 'INSPECT_EXISTING');
});

test('the native size limit blocks before selection and does not shorten the selected request', async () => {
  const longText = '가'.repeat(800);
  const session = createJebiseoHandoffSession(options({request: request({requestText: longText}),
    createNativeTextHandoffRuntime() {assert.fail('native prompt exceeds byte limit');}}));
  assert.ok(session.request.prompt.includes(longText));
  assert.equal((await session.start()).code, 'JEBISEO_NATIVE_PROMPT_LIMIT_EXCEEDED');
});

test('development and quoted requests do not create any selection or click operation', async () => {
  for (const intent of ['development', 'quote']) {
    const session = createJebiseoHandoffSession(options({request: request({intent}),
      createNativeTextHandoffRuntime() {assert.fail('not an execution request');}}));
    assert.equal((await session.start()).active, false);
    assert.equal((await session.resumeAutomation()).active, false);
  }
});
