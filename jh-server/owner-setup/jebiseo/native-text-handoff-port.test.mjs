import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareJebiseoHandoff} from './handoff-request.mjs';
import {createJebiseoNativeSelectionDescriptor, validateJebiseoNativeSelection,
  createJebiseoNativeWireScope, createJebiseoNativeWire, nativeHandoffArguments,
  readJebiseoNativeCarrier, createJebiseoNativeSignedPayload, inspectJebiseoNativeOutcome,
  nativeHandoffPromptFits, nativeHandoffRunDigest, nativeHandoffHash} from './native-text-handoff-port.mjs';

const input = {taskRef: 'fixture-task-123', threadRef: 'fixture-thread-123', sourceRef: 'fixture-source-123',
  intent: 'execute', basis: 'direct', feature: 'ANDROID', requestText: '내일 오전 9시에 일정 등록'};
const prepared = prepareJebiseoHandoff(input), descriptor = createJebiseoNativeSelectionDescriptor(prepared);
const scope = createJebiseoNativeWireScope(prepared, descriptor), commandId = '1'.repeat(32);
const wire = phase => createJebiseoNativeWire(scope, phase, '2'.repeat(32),
  phase === 'SELECT_REQUEST_TEXT' ? '' : 'jhr_' + '3'.repeat(48));
const args = phase => nativeHandoffArguments(wire(phase), commandId);

test('descriptor binds the exact current task/thread/source/request/prompt, without claiming screen evidence', () => {
  assert.equal(validateJebiseoNativeSelection(prepared, descriptor), true);
  for (const key of ['taskRef', 'threadRef', 'sourceRef', 'requestDigest', 'promptDigest'])
    assert.equal(validateJebiseoNativeSelection(prepared, {...descriptor, [key]: descriptor[key] + 'x'}), false);
  assert.equal(validateJebiseoNativeSelection(prepared, {...descriptor, screenVerified: true}), false);
  assert.throws(() => createJebiseoNativeWireScope(prepared, {...descriptor, threadRef: 'another-thread'}), /SCOPE_REQUIRED/);
});

test('native carrier and length-prefixed run hash use the Android contract exactly', () => {
  const w = wire('SELECT_REQUEST_TEXT'), a = args(w.phase);
  assert.deepEqual(readJebiseoNativeCarrier(a, {commandId}), w);
  const expected = [w.schema, w.taskId, w.threadDigest, w.sourceDigest, w.promptDigest]
    .map(value => `${value.length}:${value}`).join('|');
  assert.equal(nativeHandoffRunDigest(w), nativeHandoffHash(expected));
  for (const mutate of [
    value => ({...value, phase: 'SUBMIT_GEMINI'}),
    value => ({...value, preparedPrompt: value.preparedPrompt + ' changed'}),
    value => ({...value, runDigest: '0'.repeat(64)}),
    value => ({...value, injectedAuthority: true})
  ]) assert.throws(() => readJebiseoNativeCarrier({...a, value: JSON.stringify(mutate(w))}, {commandId}), /WIRE_INVALID/);
  assert.throws(() => readJebiseoNativeCarrier({...a, value: a.value.replace('{', '{"phase":"SUBMIT_GEMINI",')}, {commandId}), /WIRE_INVALID/);
  assert.throws(() => readJebiseoNativeCarrier({...a, task_digest: '4'.repeat(64)}, {commandId}), /CARRIER_INVALID/);
});

test('signed producer supplies task/device/effect metadata before the original signing path', () => {
  const {command_id, ...carrier} = args('CLICK_GEMINI_MENU');
  const payload = createJebiseoNativeSignedPayload(carrier, {deviceDigest: '4'.repeat(64), nowMs: 1000, expiresAtMs: 46000});
  assert.equal(payload.mcpToolName, 'life_android_step');
  assert.equal(payload.taskDigest, scope.runDigest);
  assert.equal(payload.targetDeviceDigest, '4'.repeat(64));
  assert.equal(payload.secureRequestedEffect, 'REVERSIBLE_WRITE');
  assert.equal(payload.dataClass, 'NON_SENSITIVE');
  assert.equal(payload.containsCredential, false);
  assert.equal(Object.hasOwn(payload, 'leaseToken'), false);
  assert.throws(() => createJebiseoNativeSignedPayload({...carrier, mcpToolName: 'override'},
    {deviceDigest: '4'.repeat(64), nowMs: 1000, expiresAtMs: 46000}), /CARRIER_INVALID/);
});

test('native prompt byte/codepoint/control constraints match the phone contract without truncation', () => {
  assert.equal(nativeHandoffPromptFits('한글\nEnglish'), true);
  for (const value of ['\ud800', '\tsecret', 'zero\u200bwidth', '😀'.repeat(601), 'a'.repeat(1201)])
    assert.equal(nativeHandoffPromptFits(value), false);
});

test('only exact signed-result contents advance phases; receipt expiry and false proof cannot', () => {
  const w = wire('SELECT_REQUEST_TEXT'), now = 1000;
  const r = {schema: 'JH_JEBISEO_AUTO3_RESULT_V1', phase: w.phase, requestId: w.requestId,
    runDigest: w.runDigest, ok: true, code: 'jebiseo_selection_verified', selectionVerified: true,
    phoneActionDispatched: true, resultVerified: true, automaticReplay: false,
    businessResultVerified: false, receipt: 'jhr_' + '5'.repeat(48), expiresAt: now + 120000};
  assert.equal(inspectJebiseoNativeOutcome(r, w, now).kind, 'VERIFIED');
  for (const change of [{selectionVerified: false}, {requestId: '9'.repeat(32)},
    {businessResultVerified: true}, {expiresAt: now}, {receipt: 'caller-success'}, {ok: 'true'}])
    assert.equal(inspectJebiseoNativeOutcome({...r, ...change}, w, now).kind, 'UNKNOWN');
});

test('approval is pending without a dispatch; unverified submit remains UNKNOWN', () => {
  const w = wire('SUBMIT_GEMINI');
  const base = {schema: 'JH_JEBISEO_AUTO3_RESULT_V1', phase: w.phase, requestId: w.requestId,
    runDigest: w.runDigest, ok: false, resultVerified: false, automaticReplay: false, businessResultVerified: false};
  assert.equal(inspectJebiseoNativeOutcome({...base, code: 'local_action_approval_required',
    approvalPending: true, phoneActionDispatched: false}, w, 1000).kind, 'APPROVAL_PENDING');
  assert.equal(inspectJebiseoNativeOutcome({...base, code: 'gemini_submit_dispatched_unverified',
    phoneActionDispatched: true}, w, 1000).kind, 'UNKNOWN');
  assert.equal(inspectJebiseoNativeOutcome({...base, ok: true, code: 'clicked',
    phoneActionDispatched: true}, w, 1000).kind, 'UNKNOWN');
});
