import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync, readFileSync, readdirSync, rmSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {durableNativeJobPolicy as originalPolicy} from '../deployment/durable-native-job-policy.mjs';
import {createDurableNativeHooks} from '../deployment/durable-native-host.mjs';
import {MOBILE13_ACTION_POLICY_MODE56 as MODE, mobile13DurableJobPolicy as policy} from './mobile13-action-policy.mjs';
import {
  MOBILE13_ACTION_HOST_BASE_SHA256, patchJH168Mobile13ActionPolicy56,
  reverseJH168Mobile13ActionPolicy56, patchJH168Mobile13ActionPolicyHost56,
  reverseJH168Mobile13ActionPolicyHost56
} from './mobile13-action-policy-patch.mjs';

const sha = (value) => createHash('sha256').update(value).digest('hex');
function request(action = 'SET_TEXT', {preflight = false, changes = {}, jobChanges = {}} = {}) {
  const payload = {
    contextId: 'ssc_' + 'a'.repeat(32), command: action === 'BACK' ? '오른쪽 작업 창 뒤로' : '연습 입력란 채우기',
    targetItemRef: action === 'BACK' ? '' : 'item_' + 'b'.repeat(16), action,
    mcpToolName: preflight ? 'life_android_capture_work_window' : 'life_android_execute_computer_action',
    secureRequestedEffect: preflight ? 'READ_ONLY' : 'REVERSIBLE_WRITE',
    taskDigest: sha('synthetic-task'), targetDeviceDigest: sha('synthetic-device'),
    secureInvocationExpiresAt: Date.now() + 45000, containsCredential: false,
    dataClass: 'NON_SENSITIVE', commandId: 'c'.repeat(32),
    ...(!preflight ? {requestId: 'd'.repeat(32)} : {}),
    ...(!preflight && action === 'SET_TEXT' ? {
      value: 'SYNTHETIC_PRIVATE_INPUT_VALUE', inputGrantToken: 'ipg_' + 'e'.repeat(32)
    } : {}), ...changes
  };
  const job = {id: 'job_synthetic', type: preflight ? 'split_screen_session_input_preflight' : 'split_screen_session_followup',
    status: 'queued', targetDeviceId: 'synthetic-device', secureSessionId: 'synthetic-session',
    ...payload, ...jobChanges};
  return {job, payload};
}
function temporaryJournal(fn, mobile = true) {
  const dir = mkdtempSync(path.join(tmpdir(), 'jh-mobile13-action-'));
  const options = {file: path.join(dir, 'journal.sqlite'), key: Buffer.alloc(32, 34),
    namespace: sha('synthetic-mobile13-owner'), ...(mobile ? {mobile13ActionMode: MODE} : {})};
  const state = {dir, options, hooks: createDurableNativeHooks({...options, mode: 'EXPLICIT_ONE_TIME'})};
  try { return fn(state); }
  finally { state.hooks.close(); rmSync(dir, {recursive: true, force: true}); }
}

test('input preflight admits only the existing exact read route and grants no authority', () => {
  const {job, payload} = request('SET_TEXT', {preflight: true});
  assert.deepEqual(policy(job, payload), {kind: 'READ', approvalGranted: false, screenConsentGranted: false});
  for (const changes of [{action: 'BACK'}, {value: 'value'}, {requestId: 'f'.repeat(32)},
    {inputGrantToken: 'ipg_' + 'f'.repeat(32)}, {targetItemRef: ''},
    {mcpToolName: 'life_android_execute_computer_action'}, {secureRequestedEffect: 'REVERSIBLE_WRITE'}]) {
    const changed = request('SET_TEXT', {preflight: true, changes});
    assert.equal(policy(changed.job, changed.payload).kind, 'DENY');
  }
});

test('SET_TEXT requires original phone input grant; BACK has no target or input authority', () => {
  for (const action of ['SET_TEXT', 'BACK']) {
    const {job, payload} = request(action), result = policy(job, payload);
    assert.equal(result.kind, 'JOURNAL');
    assert.equal(result.approvalGranted, false); assert.equal(result.screenConsentGranted, false);
    assert.deepEqual(result.identityPayload, {contract: 'MOBILE13_ACTION_V1', contextId: payload.contextId, action,
      ...(action === 'SET_TEXT' ? {targetItemRef: payload.targetItemRef} : {})});
    assert.equal(Object.isFrozen(result.identityPayload), true);
  }
  for (const changes of [{inputGrantToken: ''}, {inputGrantToken: 'synthetic-only'},
    {inputGrantToken: 'ipg_' + 'A'.repeat(32)}, {value: ''}, {value: ' '}, {value: 'x'.repeat(2001)},
    {value: 'bad\u0000value'}, {targetItemRef: ''}, {targetItemRef: 'item_invalid'}]) {
    const x = request('SET_TEXT', {changes}); assert.equal(policy(x.job, x.payload).kind, 'DENY');
  }
  for (const changes of [{targetItemRef: 'item_' + 'b'.repeat(16)}, {value: ''},
    {inputGrantToken: 'ipg_' + 'e'.repeat(32)}]) {
    const x = request('BACK', {changes}); assert.equal(policy(x.job, x.payload).kind, 'DENY');
  }
});

test('mobile admission rejects missing, extra, inherited, accessor and signed-job mismatched fields', () => {
  for (const action of ['SET_TEXT', 'BACK']) {
    const initial = request(action);
    for (const field of Object.keys(initial.payload)) {
      const {job, payload} = request(action); delete payload[field];
      assert.equal(policy(job, payload).kind, 'DENY', action + ' missing ' + field);
      const x = request(action); x.job[field] = typeof x.payload[field] === 'string' ? x.payload[field] + 'changed' : null;
      assert.equal(policy(x.job, x.payload).kind, 'DENY', action + ' mismatched ' + field);
    }
    for (const field of ['mcpToolName', 'secureRequestedEffect', 'commandId', 'taskDigest']) {
      const {job, payload} = request(action), value = payload[field];
      delete payload[field]; Object.setPrototypeOf(payload, {[field]: value});
      assert.equal(policy(job, payload).kind, 'DENY', action + ' inherited ' + field);
      const x = request(action); Object.defineProperty(x.payload, field, {get: () => value, enumerable: true});
      assert.equal(policy(x.job, x.payload).kind, 'DENY', action + ' accessor ' + field);
      const y = request(action); Object.defineProperty(y.payload, field, {value, enumerable: false});
      assert.equal(policy(y.job, y.payload).kind, 'DENY', action + ' hidden ' + field);
    }
    const x = request(action); x.payload[Symbol('hidden-scope')] = true;
    assert.equal(policy(x.job, x.payload).kind, 'DENY');
  }
});

test('wrong original command, device/session, effect, expiry and unreviewed action fields fail closed', () => {
  for (const changes of [{commandId: 'bad'}, {requestId: 'bad'}, {contextId: 'ssc_bad'},
    {taskDigest: 'bad'}, {targetDeviceDigest: 'bad'}, {command: ''}, {command: 'x'.repeat(2001)},
    {command: 'bad\u0000command'}, {secureInvocationExpiresAt: Date.now() - 1},
    {secureInvocationExpiresAt: Date.now() + 200000}, {secureInvocationExpiresAt: String(Date.now() + 45000)},
    {mcpToolName: 'life_android_capture_work_window'}, {secureRequestedEffect: 'READ_ONLY'},
    {secureRequestedEffect: 'MUTATION'}, {screenGrantToken: 'wrong-authority'},
    {actionApprovalGrantToken: 'wrong-authority'}, {workflowId: 'wrong-workflow'}, {selector: '#target'},
    {script: 'unreviewed'}, {x: 5}, {leaseToken: 'unrelated'}, {containsCredential: true}, {dataClass: 'SECRET'}]) {
    const x = request('SET_TEXT', {changes}); assert.equal(policy(x.job, x.payload).kind, 'DENY');
  }
  for (const jobChanges of [{secureSessionId: ''}, {targetDeviceId: ''}, {commandId: 'f'.repeat(32)}]) {
    const x = request('SET_TEXT', {jobChanges}); assert.equal(policy(x.job, x.payload).kind, 'DENY');
  }
  for (const secret of ['bearer abcdefghijkl', 'sk-abcdefghijk', '123456-1234567', '1234 5678 9012 3456', 'OTP:123456']) {
    for (const field of ['command', 'value']) {
      const x = request('SET_TEXT', {changes: {[field]: secret}});
      assert.equal(policy(x.job, x.payload).kind, 'DENY');
    }
  }
});

test('all unrelated routes and existing CLICK delegate exactly to the unchanged original policy', () => {
  const existing = [request('CLICK'), request('AUTO'), request('SCROLL'), request('SET_TEXT', {jobChanges: {type: 'unrelated'}})];
  for (const type of ['agent_snapshot', 'open_url', 'agent_step', 'computer_use_inspect',
    'computer_use_action_prepare', 'computer_use_capture_frame', 'split_comfort_status',
    'split_screen_session_start', 'split_screen_session_status', 'split_screen_session_save_analysis',
    'split_screen_session_finish', 'computer_use_action_execute']) {
    existing.push(request('WAIT', {jobChanges: {type}}));
  }
  for (const {job, payload} of existing) assert.deepEqual(policy(job, payload), originalPolicy(job, payload));
  const original = readFileSync(new URL('../deployment/durable-native-job-policy.mjs', import.meta.url));
  assert.equal(sha(original), 'cad7cbb2458946900ac6ad3de5e942175da9d1e24a53922eb35851e6349a017e');
});

test('host mode defaults to original policy and rejects all unreviewed explicit options', () => {
  temporaryJournal(({hooks}) => {
    for (const x of [request('SET_TEXT', {preflight: true}), request('SET_TEXT'), request('BACK')]) {
      hooks.capture(x.job, x.payload); assert.equal(hooks.beforeDispatch(x.job).allowed, false);
    }
    const x = request('CLICK'); hooks.capture(x.job, x.payload);
    assert.equal(hooks.beforeDispatch(x.job).allowed, true);
  }, false);
  for (const value of [null, false, true, 'PHONE_RIGHT', 'true', {}, () => ({kind: 'READ'})])
    assert.throws(() => createDurableNativeHooks({mobile13ActionMode: value}), /DURABLE_MOBILE13_ACTION_MODE_INVALID/);
});

test('phone preflight read does not create an action receipt or consume action authority', () => {
  temporaryJournal(({hooks}) => {
    const {job, payload} = request('SET_TEXT', {preflight: true});
    hooks.capture(job, payload); assert.equal(hooks.beforeDispatch(job).allowed, true);
    assert.equal(hooks.uncertainEffectsForMaintenance(), 0);
    const action = request('SET_TEXT'); action.payload.inputGrantToken = 'not-a-phone-token';
    action.job.inputGrantToken = action.payload.inputGrantToken;
    hooks.capture(action.job, action.payload); assert.equal(hooks.beforeDispatch(action.job).allowed, false);
    assert.equal(hooks.uncertainEffectsForMaintenance(), 0);
  });
});

for (const action of ['SET_TEXT', 'BACK']) test(action + ' reserves once before dispatch and persists uncertainty across fresh IDs/grants/session', () => {
  temporaryJournal((state) => {
    const first = request(action), before = structuredClone(first);
    state.hooks.capture(first.job, first.payload);
    assert.equal(state.hooks.beforeDispatch(first.job).allowed, true);
    assert.equal(state.hooks.beforeDispatch(first.job).code, 'DURABLE_DISPATCH_ALREADY_RESERVED');
    assert.equal(state.hooks.uncertainEffectsForMaintenance(), 1);
    assert.deepEqual(first, before, 'policy and journal must not alter original signed request');
    first.job.status = 'in_progress'; state.hooks.close();
    state.hooks = createDurableNativeHooks(state.options);
    const second = request(action, {changes: {requestId: 'f'.repeat(32), commandId: '1'.repeat(32),
      taskDigest: sha('new-task'), command: '새 명령 표현',
      ...(action === 'SET_TEXT' ? {value: 'NEW_PRIVATE_VALUE', inputGrantToken: 'ipg_' + '2'.repeat(32)} : {})},
      jobChanges: {id: 'job_after_restart', secureSessionId: 'new-synthetic-session'}});
    state.hooks.capture(second.job, second.payload);
    assert.equal(state.hooks.beforeDispatch(second.job).code, 'DURABLE_PREVIOUS_OUTCOME_UNKNOWN');
    assert.equal(state.hooks.acceptedCompletion(first.job, {ok: true}).allowed, false,
      'no historical job recovery from an absent transient record');
  });
});

test('only original job/session/device/type and classified authenticated completion close its receipt', () => {
  temporaryJournal(({hooks}) => {
    const {job, payload} = request(); hooks.capture(job, payload);
    assert.equal(hooks.acceptedCompletion(job, {ok: true}).allowed, false);
    assert.equal(hooks.beforeDispatch(job).allowed, true);
    assert.equal(hooks.acceptedCompletion(job, {ok: true}).allowed, false);
    job.status = 'in_progress';
    for (const field of ['secureSessionId', 'targetDeviceId', 'type']) {
      const prior = job[field]; job[field] += '_changed';
      assert.equal(hooks.acceptedCompletion(job, {ok: true}).allowed, false); job[field] = prior;
    }
    for (const result of [null, [], {}, {ok: 'true'}])
      assert.equal(hooks.acceptedCompletion(job, result).allowed, false);
    const receivedFailure = {ok: false, code: 'SYNTHETIC_PHONE_TARGET_CHANGED', resultVerified: false};
    assert.equal(hooks.acceptedCompletion(job, receivedFailure).allowed, true);
    assert.equal(hooks.uncertainEffectsForMaintenance(), 0);
    assert.equal(hooks.acceptedCompletion(job, receivedFailure).allowed, true);
    assert.equal(hooks.acceptedCompletion(job, {ok: true}).code, 'DURABLE_RESULT_CONFLICT');
    assert.deepEqual(receivedFailure, {ok: false, code: 'SYNTHETIC_PHONE_TARGET_CHANGED', resultVerified: false});
    const next = request('SET_TEXT', {changes: {requestId: 'f'.repeat(32)}, jobChanges: {id: 'job_next'}});
    hooks.capture(next.job, next.payload); assert.equal(hooks.beforeDispatch(next.job).allowed, true);
  });
});

test('durable journal stores no raw input, command, grant, context, request or job identifiers', () => {
  temporaryJournal(({hooks, dir}) => {
    const {job, payload} = request(); hooks.capture(job, payload);
    assert.equal(hooks.beforeDispatch(job).allowed, true); hooks.close();
    const bytes = Buffer.concat(readdirSync(dir).map((name) => readFileSync(path.join(dir, name))));
    for (const value of [payload.command, payload.value, payload.inputGrantToken, payload.contextId,
      payload.requestId, payload.commandId, job.id, job.secureSessionId, job.targetDeviceId])
      assert.equal(bytes.includes(Buffer.from(value)), false);
  });
});

test('three host changes reverse to exact original bytes; unrelated host changes are rejected', () => {
  const host = readFileSync(new URL('../deployment/durable-native-host.mjs', import.meta.url), 'utf8');
  const original = reverseJH168Mobile13ActionPolicyHost56(host);
  assert.equal(sha(original), MOBILE13_ACTION_HOST_BASE_SHA256);
  assert.equal(patchJH168Mobile13ActionPolicyHost56(original), host);
  assert.throws(() => reverseJH168Mobile13ActionPolicyHost56(host.replace('const allow=()=>Object.freeze({allowed:true});',
    'const allow=()=>Object.freeze({allowed:false});')), /HOST_BASE_CHANGED/);
  assert.throws(() => reverseJH168Mobile13ActionPolicyHost56(host.replace("mode='read'", "mode='write'")), /HOST_REVERSE_CHANGED/);
  assert.throws(() => patchJH168Mobile13ActionPolicyHost56(original + '\n'), /HOST_BASE_CHANGED/);
});

// Source fixture of the existing install and surrounding security anchors. The
// separate generated Stage25 integration exercises the actual runtime/host.
const runtime = [
  'unchanged-prefix\n',
  'export function installDurableNativeCircuit56(options){\n',
  ' if(durableNativeHooks56||httpServer.listening||jobs.size||devices.size)throw Error("DURABLE_INSTALL_BEFORE_LISTEN_ONLY");\n',
  ' durableNativeHooks56=createDurableNativeHooks(options);\n',
  ' jhV2Install56();\n}\n',
  'if(durableNativeHooks56)durableNativeHooks56.capture(j,p);\n',
  'durableNativeHooks56?.beforeDispatch(next);\n',
  'durableNativeHooks56?.acceptedCompletion(j,body.result);\n',
  '!eqHex56(mac,hmac56(a.secret,"complete|"+sid+"|"+j.id+"|"+dev+"|"+nonce+"|"+exp+"|"+rd))||!seen56(a.seenComplete,nonce);\n',
  'commandId:jhRequireCommand56(targetDeviceId,p.workflowId)\n',
  'unchanged-suffix\n'
].join('');
test('runtime patch changes only the host install option and reverses all source bytes', () => {
  const next = patchJH168Mobile13ActionPolicy56(runtime);
  assert.equal(reverseJH168Mobile13ActionPolicy56(next), runtime);
  assert.equal(next.replace('createDurableNativeHooks({...options,mobile13ActionMode:' + JSON.stringify(MODE) + '})',
    'createDurableNativeHooks(options)'), runtime);
  assert.throws(() => patchJH168Mobile13ActionPolicy56(next), /ANCHOR_CHANGED/);
  assert.throws(() => reverseJH168Mobile13ActionPolicy56(next.replace(MODE, 'PHONE_RIGHT')), /ANCHOR_CHANGED/);
  assert.throws(() => patchJH168Mobile13ActionPolicy56(runtime + runtime), /ANCHOR_CHANGED/);
  for (const guard of ['DURABLE_INSTALL_BEFORE_LISTEN_ONLY', 'beforeDispatch(next)',
    'acceptedCompletion(j,body.result)', 'seen56(a.seenComplete,nonce)', 'jhRequireCommand56(targetDeviceId,p.workflowId)'])
    assert.throws(() => patchJH168Mobile13ActionPolicy56(runtime.replace(guard, 'changed')), /ANCHOR_CHANGED/);
});
