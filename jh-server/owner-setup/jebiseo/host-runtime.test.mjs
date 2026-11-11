import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createJebiseoTask, createJebiseoRuntime, createJebiseoDeviceScheduler,
  jebiseoCapabilities, jebiseoTargetBindingDigest} from './host-runtime.mjs';
import {createDurableNativeHooks} from '../deployment/durable-native-host.mjs';
import {MOBILE13_ACTION_POLICY_MODE56} from '../jh168-mobile-unification/mobile13-action-policy.mjs';
import {fixtureFieldId, fixtureGuidedArguments, fixtureMobileReply,
  fixtureAndroidAppInspection} from './test-support.mjs';

const secureSessionId = 'fixture-secure-session';
const commandId = 'a'.repeat(32), taskDigest = 'b'.repeat(64), runDigest = '9'.repeat(64);
const prompt = '이 제안의 다른 관점을 알려 주세요.';
const task = (extra = {}) => createJebiseoTask({taskRef: 'task-gemini-001', threadRef: 'thread-current-01',
  intent: 'consult', basis: 'direct', visibility: 'VISIBLE', deviceId: 'phone-current-01',
  commandId, prompt, ...extra});
const input = {request_id: 'd'.repeat(32), field_id: fixtureFieldId, text: prompt};
const approval = {task_digest: taskDigest, run_digest: runDigest, index: 3};
const execute = {...approval, lease_token: 'fixture-lease-token',
  action_approval_grant_token: 'fixture-local-grant', local_action_approval_digest: '7'.repeat(64)};

// Synthetic attestors only: these fixtures claim neither a live target nor a
// provider proof. Production must verify the original receipt independently.
function targetProof({task: scope, operation, args}) {
  return {source: 'ORIGINAL_SECURE56', provider: 'GEMINI', targetVerified: true,
    deviceId: scope.deviceId, commandId: scope.commandId, secureSessionId, promptDigest: scope.promptDigest,
    bindingDigest: jebiseoTargetBindingDigest(scope, operation, args), windowId: 23,
    ...(['TYPE', 'DISCOVER_INPUT', 'DISMISS_NOTICE'].includes(operation) ? {
      targetFieldId: args.field_id,
      editorVerified: true, draftEmpty: true, inputDiscoveryVerified: true,
      noticeDismissVerified: true, nonSensitiveVerified: true, approvalRequired: false, rightPaneVerified: true,
      workPackage: 'com.android.chrome', displayId: 0, guidedArgumentsVerified: true,
      guidedArguments: fixtureGuidedArguments(operation)} : {taskDigest: args.task_digest,
      runDigest: args.run_digest ?? null, submitTargetVerified: true, draftMatchesPrompt: true})};
}
function effectProof(response, operation, outcome = 'VERIFIED_APPLIED') {
  return {source: 'ORIGINAL_SECURE56', effectKey: response.effectKey, operation, outcome,
    taskRef: 'task-gemini-001', deviceId: 'phone-current-01', commandId, secureSessionId};
}
function setup(options = {}) {
  const calls = [], reads = [], targets = [];
  // Deliberately no global taskDigest: Mobile13 computes a digest per job.
  const binding = {deviceId: 'phone-current-01', commandId, secureSessionId, runtimeMode: 'PHONE_RIGHT',
    focusProtected: true, durableDispatchProtected: true};
  const runtime = createJebiseoRuntime({runtimeMode: 'PHONE_RIGHT',
    callOriginalTool: async (name, args) => {calls.push({name, args}); return fixtureMobileReply(name, args);},
    readCurrentBinding: async args => {reads.push(args); return {...binding};},
    verifyGeminiTarget: async request => {targets.push(request); return targetProof(request);}, ...options});
  return {runtime, calls, reads, targets, binding};
}
test('explicit internal consultation performs no phone read, target verification or invocation', async () => {
  const f = setup();
  const hidden = createJebiseoTask({taskRef: 'task-internal-01', threadRef: 'thread-current-01',
    intent: 'consult', basis: 'direct', visibility: 'INTERNAL', prompt});
  const r = await f.runtime.runStep({task: hidden, operation: 'SNAPSHOT'});
  assert.equal(r.code, 'HIDDEN_EXECUTION_UNAVAILABLE');
  assert.deepEqual([f.calls.length, f.targets.length, f.reads.length], [0, 0, 0]);
  assert.equal(jebiseoCapabilities().geminiAssistanceAvailable, false);
});
test('development, quotation and negation do not invoke Gemini', async () => {
  const f = setup();
  for (const [intent, basis] of [['develop', 'direct'], ['consult', 'quoted'], ['assist', 'negated']]) {
    const r = await f.runtime.runStep({task: task({intent, basis}), operation: 'SNAPSHOT'});
    assert.equal(r.code, 'JEBISEO_NO_CURRENT_CONSULTATION');
  }
  assert.equal(f.reads.length, 0);
});
test('visible input uses one original handler with same command/request and no global task digest', async () => {
  const f = setup(), r = await f.runtime.runStep({task: task(), operation: 'TYPE', args: input});
  assert.equal(r.status, 'RETURNED'); assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].name, 'life_android_step');
  assert.equal(f.calls[0].args.command_id, commandId);
  assert.equal(f.calls[0].args.text, fixtureGuidedArguments().text);
  assert.equal(f.calls[0].args.value, input.text);
  assert.equal(Object.hasOwn(f.calls[0].args, 'task_digest'), false);
  assert.equal(f.reads.length, 2); assert.equal(f.targets.length, 1);
  assert.match(r.effectKey, /^[a-f0-9]{64}$/); assert.equal(r.readbackRequired, true);
  assert.equal(r.geminiAcceptedVerified, false);
});
test('missing original focus/durable guard, wrong draft/device and lost command stop before invocation', async () => {
  for (const [change, args, code] of [
    [{focusProtected: false}, input, 'JEBISEO_ORIGINAL_DEVICE_FOCUS_REQUIRED'],
    [{secureSessionId: undefined}, input, 'JEBISEO_ORIGINAL_SECURE_SESSION_REQUIRED'],
    [{durableDispatchProtected: false}, input, 'JEBISEO_ORIGINAL_DURABLE_DISPATCH_REQUIRED'],
    [{commandId: 'f'.repeat(32)}, input, 'new_command_binding_required_or_discarded'],
    [{}, {...input, text: 'different'}, 'JEBISEO_REQUEST_TEXT_CHANGED'],
    [{}, {...input, device_id: 'another-phone'}, 'JEBISEO_DEVICE_MISMATCH']
  ]) {
    const f = setup(); Object.assign(f.binding, change);
    assert.equal((await f.runtime.runStep({task: task(), operation: 'TYPE', args})).code, code);
    assert.equal(f.calls.length, 0); assert.equal(f.targets.length, 0);
  }
});
test('same task cannot move to another thread, command or question', async () => {
  const f = setup(); await f.runtime.runStep({task: task(), operation: 'SNAPSHOT'});
  for (const change of [{threadRef: 'thread-another-02'}, {commandId: 'f'.repeat(32)}, {prompt: '새 질문'}]) {
    assert.equal((await f.runtime.runStep({task: task(change), operation: 'SNAPSHOT'})).code,
      'JEBISEO_TASK_BINDING_CHANGED');
  }
  assert.equal(f.calls.length, 1);
});
test('missing, false or caller-style target flags never authorize a Gemini effect', async () => {
  for (const verifyGeminiTarget of [undefined, async () => false, async () => true,
    async () => ({source: 'ORIGINAL_SECURE56', provider: 'GEMINI', targetVerified: true})]) {
    const f = setup({verifyGeminiTarget});
    const r = await f.runtime.runStep({task: task(), operation: 'TYPE', args: input});
    assert.match(r.code, /TARGET_(?:VERIFIER_REQUIRED|UNVERIFIED)$/);
    assert.equal(f.calls.length, 0);
  }
});
test('target attestation must bind provider, native window, original field and empty draft', async () => {
  for (const patch of [{provider: 'OTHER'}, {windowId: -1}, {deviceId: 'other-phone'},
    {commandId: 'f'.repeat(32)}, {secureSessionId: 'other-session'}, {targetFieldId: 'f_' + 'f'.repeat(24)}, {draftEmpty: false},
    {bindingDigest: 'f'.repeat(64)}, {promptDigest: 'f'.repeat(64)},
    {guidedArgumentsVerified: false}, {guidedArguments: undefined},
    {rightPaneVerified: false}, {workPackage: 'other.app'}, {displayId: -1}]) {
    const f = setup({verifyGeminiTarget: async request => ({...targetProof(request), ...patch})});
    assert.equal((await f.runtime.runStep({task: task(), operation: 'TYPE', args: input})).code,
      'JEBISEO_ORIGINAL_GEMINI_TARGET_UNVERIFIED');
    assert.equal(f.calls.length, 0);
  }
});
test('discovery and notice dismissal require their own verified original native carrier', async () => {
  for (const [operation, args, patches] of [
    ['DISCOVER_INPUT', {}, [{inputDiscoveryVerified: false}]],
    ['DISMISS_NOTICE', {field_id: input.field_id},
      [{noticeDismissVerified: false}, {nonSensitiveVerified: false}, {approvalRequired: true},
        {targetFieldId: 'f_' + 'f'.repeat(24)}]]
  ]) {
    const f = setup();
    const response = await f.runtime.runStep({task: task(), operation, args});
    assert.equal(response.toolInvoked, true);
    assert.equal(response.geminiAcceptedVerified, false);
    assert.deepEqual(f.calls, [{name: 'life_android_step',
      args: {...fixtureGuidedArguments(operation), command_id: commandId}}]);
    for (const patch of [...patches, {guidedArguments: fixtureGuidedArguments('TYPE')}]) {
      const blocked = setup({verifyGeminiTarget: async request => ({...targetProof(request), ...patch})});
      const rejection = await blocked.runtime.runStep({task: task(), operation, args});
      assert.equal(rejection.code, 'JEBISEO_ORIGINAL_GEMINI_TARGET_UNVERIFIED');
      assert.equal(blocked.calls.length, 0);
    }
  }
});
test('callers cannot supply native form arguments even when they match an issued shape', async () => {
  const f = setup();
  const response = await f.runtime.runStep({task: task(), operation: 'TYPE',
    args: {...input, guided_arguments: fixtureGuidedArguments()}});
  assert.equal(response.code, 'JEBISEO_CALLER_GUIDED_ARGUMENTS_FORBIDDEN');
  assert.equal(f.calls.length, 0); assert.equal(f.targets.length, 0);
});
test('trusted selection and original carrier must name the same native field before dispatch', async () => {
  const f = setup();
  const response = await f.runtime.runStep({task: task(), operation: 'TYPE',
    args: {...input, field_id: 'f_' + 'c'.repeat(24)}});
  assert.equal(response.code, 'JEBISEO_ORIGINAL_GEMINI_TARGET_UNVERIFIED');
  assert.equal(f.calls.length, 0);
});
test('an absent current native address remains a precise diagnostic and cannot authorize an effect', async () => {
  const f = setup({verifyGeminiTarget: async () => ({ok: false, code: 'PROVIDER_ADDRESS_UNVERIFIED'})});
  const response = await f.runtime.runStep({task: task(), operation: 'TYPE', args: input});
  assert.equal(response.verificationCode, 'PROVIDER_ADDRESS_UNVERIFIED');
  assert.equal(response.toolInvoked, false);
  assert.equal(f.calls.length, 0);
});
test('submit proof binds exact CU task/run and current prompt draft, not a global command digest', async () => {
  const valid = setup();
  assert.equal((await valid.runtime.runStep({task: task(), operation: 'APPROVAL_REQUEST', args: approval})).status,
    'RETURNED');
  for (const patch of [{taskDigest: 'f'.repeat(64)}, {runDigest: 'f'.repeat(64)},
    {draftMatchesPrompt: false}, {submitTargetVerified: false}]) {
    const f = setup({verifyGeminiTarget: async request => ({...targetProof(request), ...patch})});
    assert.equal((await f.runtime.runStep({task: task(), operation: 'APPROVAL_REQUEST', args: approval})).code,
      'JEBISEO_ORIGINAL_GEMINI_TARGET_UNVERIFIED');
    assert.equal(f.calls.length, 0);
  }
  const mismatch = setup();
  assert.equal((await mismatch.runtime.runStep({task: task({taskDigest: 'f'.repeat(64)}),
    operation: 'APPROVAL_REQUEST', args: approval})).code, 'JEBISEO_ORIGINAL_TASK_SCOPE_CHANGED');
});
test('command cancellation or protection loss during target verification stops dispatch', async () => {
  for (const change of [{commandId: 'f'.repeat(32)}, {secureSessionId: 'rotated-session'},
    {focusProtected: false}, {durableDispatchProtected: false}]) {
    const f = setup({verifyGeminiTarget: async request => {
      await Promise.resolve(); Object.assign(f.binding, change); return targetProof(request);
    }});
    assert.equal((await f.runtime.runStep({task: task(), operation: 'TYPE', args: input})).code,
      'JEBISEO_BINDING_CHANGED_AFTER_TARGET_VERIFICATION');
    assert.equal(f.calls.length, 0);
  }
});
test('invoked, queued, manual or unknown prior effect prevents every next effect; recovery stays available', async () => {
  for (const raw of [{ok: true}, {ok: true, status: 'queued'},
    {ok: true, provider: 'MANUAL', manualRequired: true}, null]) {
    const calls = [], f = setup({callOriginalTool: async (name, args) => {
      calls.push({name, args}); if (raw === null) throw Error('ORIGINAL_OUTCOME_UNKNOWN'); return raw;
    }});
    const typed = await f.runtime.runStep({task: task(), operation: 'TYPE', args: input});
    assert.equal(typed.toolInvoked, true);
    for (const [operation, args] of [['TYPE', input], ['APPROVAL_REQUEST', approval], ['EXECUTE_SUBMIT', execute]]) {
      const blocked = await f.runtime.runStep({task: task(), operation, args});
      assert.equal(blocked.code, 'JEBISEO_PRIOR_EFFECT_READBACK_REQUIRED');
      assert.equal(blocked.effectKey, typed.effectKey);
    }
    assert.equal(calls.length, 1);
    await f.runtime.runStep({task: task(), operation: 'JOB_STATUS', args: {job_id: 'original-job-01'}});
    assert.equal(calls.length, 2);
    assert.equal((await f.runtime.runStep({task: task(), operation: 'APPROVAL_REQUEST', args: approval})).code,
      'JEBISEO_PRIOR_EFFECT_READBACK_REQUIRED', 'a raw read response cannot clear the host barrier');
  }
});
test('only exact trusted outcome clears pending state, and each subsequent effect gets a new barrier', async () => {
  const f = setup();
  const typed = await f.runtime.runStep({task: task(), operation: 'TYPE', args: input});
  for (const patch of [{effectKey: 'f'.repeat(64)}, {taskRef: 'other-task'}, {deviceId: 'other-phone'},
    {commandId: 'f'.repeat(32)}, {secureSessionId: 'other-session'},
    {operation: 'EXECUTE_SUBMIT'}, {outcome: 'QUEUED'},
    {source: 'CALLER_JSON'}, {outcome: undefined, ok: true}]) {
    f.binding.effectReadback = {...effectProof(typed, 'TYPE'), ...patch};
    assert.equal((await f.runtime.runStep({task: task(), operation: 'APPROVAL_REQUEST', args: approval})).code,
      'JEBISEO_PRIOR_EFFECT_READBACK_REQUIRED');
  }
  assert.equal(f.calls.length, 1);
  f.binding.effectReadback = effectProof(typed, 'TYPE');
  const requested = await f.runtime.runStep({task: task(), operation: 'APPROVAL_REQUEST', args: approval});
  assert.equal(requested.status, 'RETURNED'); assert.notEqual(requested.effectKey, typed.effectKey);
  assert.equal((await f.runtime.runStep({task: task(), operation: 'EXECUTE_SUBMIT', args: execute})).code,
    'JEBISEO_PRIOR_EFFECT_READBACK_REQUIRED');
  f.binding.effectReadback = effectProof(requested, 'APPROVAL_REQUEST');
  const submitted = await f.runtime.runStep({task: task(), operation: 'EXECUTE_SUBMIT', args: execute});
  assert.equal(submitted.status, 'RETURNED'); assert.equal(submitted.geminiAcceptedVerified, false);
  f.binding.effectReadback = effectProof(submitted, 'EXECUTE_SUBMIT');
  assert.equal((await f.runtime.runStep({task: task(), operation: 'APPROVAL_REQUEST', args: approval})).code,
    'JEBISEO_SUBMISSION_SETTLED_READ_RESULT');
  assert.equal(f.calls.length, 3);
});
test('invalid arguments do not make a premature dispatch reservation or pending tombstone', async () => {
  const f = setup(), malformed = {...input}; delete malformed.request_id;
  const rejected = await f.runtime.runStep({task: task(), operation: 'TYPE', args: malformed});
  assert.equal(rejected.toolInvoked, false); assert.equal(f.calls.length, 0);
  assert.equal((await f.runtime.runStep({task: task(), operation: 'TYPE', args: input})).status, 'RETURNED');
  assert.equal(f.calls.length, 1);
});
test('stale command may only ask original receipt endpoint to decide readback', async () => {
  const f = setup(); f.binding.commandId = 'f'.repeat(32);
  const r = await f.runtime.runStep({task: task(), operation: 'RECEIPT_STATUS',
    args: {task_digest: taskDigest, receipt_token: 'original-receipt-token'}});
  assert.equal(r.status, 'RETURNED'); assert.equal(f.targets.length, 0);
  assert.equal(f.calls[0].name, 'life_android_pending_approval_receipt_status');
  assert.equal(f.calls[0].args.command_id, commandId);
});
test('same-device steps serialize; another task is rejected instead of queued', async () => {
  const scheduler = createJebiseoDeviceScheduler();
  let release; const gate = new Promise(resolve => {release = resolve;});
  const events = [], scope = {deviceId: 'phone-current-01', commandId, taskRef: 'task-gemini-001'};
  const first = scheduler.run(scope, async () => {events.push('first'); await gate; events.push('first-done');});
  const second = scheduler.run(scope, async () => {events.push('second');});
  const rejected = await scheduler.run({...scope, taskRef: 'task-gemini-002'}, async () => {events.push('bad');});
  assert.equal(rejected.code, 'JEBISEO_DEVICE_BUSY_OTHER_TASK');
  await scheduler.run({...scope, deviceId: 'phone-other-02'}, async () => {events.push('other');});
  release(); await Promise.all([first, second]);
  assert.ok(events.indexOf('second') > events.indexOf('first-done'));
  assert.ok(events.includes('other')); assert.ok(!events.includes('bad'));
});
test('queued input and target-verifier inputs are frozen before asynchronous work', async () => {
  let release; const gate = new Promise(resolve => {release = resolve;});
  let reads = 0;
  const f = setup({readCurrentBinding: async () => {if (++reads === 1) await gate; return {...f.binding};},
    verifyGeminiTarget: async request => {
      assert.ok(Object.isFrozen(request.task)); assert.ok(Object.isFrozen(request.args));
      assert.ok(Object.isFrozen(request.binding)); return targetProof(request);
    }});
  const a = {...input};
  const pending = f.runtime.runStep({task: task(), operation: 'TYPE', args: a});
  a.text = 'mutated'; release();
  assert.equal((await pending).status, 'RETURNED');
  assert.equal(f.calls[0].args.value, prompt);
});
test('native issuer arguments cannot change during the final asynchronous binding check', async () => {
  let originalProof, reads = 0;
  const f = setup({
    verifyGeminiTarget: async request => {originalProof = targetProof(request); return originalProof;},
    readCurrentBinding: async () => {
      if (++reads === 2) originalProof.guidedArguments.text = 'mutated-after-verification';
      return {...f.binding};
    }
  });
  const response = await f.runtime.runStep({task: task(), operation: 'TYPE', args: input});
  assert.equal(response.toolInvoked, true);
  assert.equal(f.calls[0].args.text, fixtureGuidedArguments().text);
});
test('facade reuses the actual original durable hook once and completion reconciles that same record', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'jebiseo-original-hooks-'));
  const hooks = createDurableNativeHooks({file: path.join(directory, 'fixture.sqlite'),
    key: Buffer.alloc(32, 6), namespace: '3'.repeat(64), mode: 'EXPLICIT_ONE_TIME',
    mobile13ActionMode: MOBILE13_ACTION_POLICY_MODE56});
  let dispatches = 0;
  try {
    const f = setup({callOriginalTool: async (name, args) => {
      assert.equal(name, 'life_android_step');
      // Synthetic queued job at the original authenticated handler boundary.
      // Real phone HMAC verification is outside this no-device regression.
      const payload = {...args, commandId: args.command_id};
      const job = {...payload, id: 'fixture-job', type: 'agent_step',
        targetDeviceId: 'phone-current-01', secureSessionId: 'fixture-session', status: 'queued'};
      hooks.capture(job, payload);
      assert.equal(hooks.beforeDispatch(job).allowed, true);
      dispatches++; assert.equal(hooks.uncertainEffectsForMaintenance(), 1);
      job.status = 'in_progress';
      assert.equal(hooks.acceptedCompletion(job, {ok: true}).allowed, true);
      assert.equal(hooks.uncertainEffectsForMaintenance(), 0);
      return fixtureMobileReply(name, args);
    }});
    const response = await f.runtime.runStep({task: task(), operation: 'TYPE', args: input});
    assert.equal(response.status, 'RETURNED'); assert.equal(dispatches, 1);
    assert.equal(response.readbackRequired, true, 'transport completion alone is not draft readback proof');
  } finally { hooks.close(); rmSync(directory, {recursive: true, force: true}); }
});

const androidPackage = 'com.google.android.youtube';
const appTask = (extra = {}) => task({taskRef: 'task-android-001', intent: 'open_app', feature: 'ANDROID',
  action: 'OPEN_APP', appPackage: androidPackage, taskDigest, ...extra});
function appSetup(reply) {
  const appCalls = [];
  const f = setup({callOriginalTool: async (name, args) => {
    appCalls.push({name, args});
    if (reply) return reply(name, args);
    if (name === 'life_android_open') return {route: 'android_right', operation: 'native_app_open',
      queued: true, jobId: 'job_701', requiresFreshWindowReadback: true, screenVerified: false,
      automaticReplay: false};
    if (name === 'life_job_status') return {type: 'open_url', status: 'complete',
      result: {ok: true, code: 'RIGHT_PANE_VERIFIED', rightPaneVerified: true, launchAccepted: true}};
    return {type: 'computer_use_inspect', status: 'complete', error: null,
      result: fixtureAndroidAppInspection()};
  }});
  return {...f, calls: appCalls};
}
// A trusted-host test double only. The original-binding tests independently
// exercise authenticated job provenance, the native producer and later-job order.
function appEffectProof(opened, scope = appTask(), extra = {}) {
  return {source: 'ORIGINAL_SECURE56', effectKey: opened.effectKey, operation: 'OPEN_APP',
    outcome: 'VERIFIED_APPLIED', taskRef: scope.taskRef, deviceId: scope.deviceId,
    commandId: scope.commandId, secureSessionId, jobId: 'job_701', appPackage: scope.appPackage,
    appWindowVerified: true, observationScope: 'RIGHT_APP_WINDOW_ONLY', alreadyVisible: false, ...extra};
}

test('ANDROID tasks require explicit OPEN_APP identity, a supported package and an original task digest', () => {
  const created = appTask();
  assert.equal(created.active, true);
  assert.equal(created.feature, 'ANDROID');
  assert.equal(created.action, 'OPEN_APP');
  assert.equal(created.appPackage, androidPackage);
  assert.equal(created.taskDigest, taskDigest);
  assert.equal(Object.hasOwn(created, 'prompt'), false);
  assert.equal(created.promptDigest, appTask({prompt: 'This is never sent to Gemini.'}).promptDigest);
  assert.ok(Object.isFrozen(created));
  for (const extra of [{feature: undefined}, {intent: 'consult'}, {action: 'CLICK'},
    {appPackage: 'com.unknown.app'}, {appPackage: 'com.openai.chatgpt'},
    {appPackage: 'com.koreanlifehub.bridge'}, {taskDigest: undefined}, {taskDigest: 'invalid'}])
    assert.throws(() => appTask(extra), /JEBISEO_ANDROID_APP_TASK_REQUIRED/);
});

test('ANDROID start opens the exact app once and public completion or screen_ready cannot settle it', async () => {
  const f = appSetup(), scope = appTask();
  const opened = await f.runtime.start({task: scope});
  assert.deepEqual(f.calls, [{name: 'life_android_open',
    args: {target: '유튜브 앱', url: '', command_id: commandId}}]);
  assert.equal(f.targets.length, 0, 'app requests never query or authenticate a Gemini target');
  assert.equal(opened.appWindowVerified, false);
  assert.equal(opened.readbackRequired, true);
  assert.deepEqual(opened.followUp, {tool: 'life_job_status',
    arguments: {job_id: 'job_701', command_id: commandId}, readOnly: true});
  assert.equal((await f.runtime.runStep({task: scope, operation: 'JOB_STATUS',
    args: {job_id: 'job_702'}})).code, 'JEBISEO_ORIGINAL_OPEN_JOB_REQUIRED');
  await f.runtime.runStep({task: scope, operation: 'JOB_STATUS', args: {job_id: 'job_701'}});
  const observed = await f.runtime.runStep({task: scope, operation: 'APP_OBSERVE'});
  assert.equal(observed.appWindowVerified, false);
  assert.equal(observed.readbackRequired, true);
  assert.deepEqual(f.calls.at(-1), {name: 'life_android_computer_inspect',
    args: {action: 'WAIT', effect: 'READ_ONLY', data_class: 'NONE', max_actions_in_call: 1,
      task_digest: taskDigest, command_id: commandId}});
  assert.equal((await f.runtime.start({task: scope})).code, 'JEBISEO_PRIOR_EFFECT_READBACK_REQUIRED');
  assert.deepEqual(f.calls.map(call => call.name),
    ['life_android_open', 'life_job_status', 'life_android_computer_inspect']);
});

test('ANDROID and Gemini operations cannot be mixed or acquire caller-selected route arguments', async () => {
  const f = appSetup(), scope = appTask();
  for (const operation of ['OPEN', 'SNAPSHOT', 'FORM_SNAPSHOT', 'DISCOVER_INPUT', 'TYPE',
    'DISMISS_NOTICE', 'INSPECT_SUBMIT', 'PREPARE_SUBMIT', 'APPROVAL_REQUEST', 'EXECUTE_SUBMIT'])
    assert.equal((await f.runtime.runStep({task: scope, operation})).code,
      'JEBISEO_FEATURE_OPERATION_MISMATCH');
  for (const operation of ['OPEN_APP', 'APP_OBSERVE'])
    assert.equal((await f.runtime.runStep({task: task(), operation})).code,
      'JEBISEO_FEATURE_OPERATION_MISMATCH');
  for (const operation of ['OPEN_APP', 'APP_OBSERVE'])
    for (const args of [{target: '지메일 앱'}, {app_package: 'com.google.android.gm'},
      {action: 'CLICK'}, {task_digest: taskDigest}, {url: 'https://example.test/'}, {job_id: 'job_701'}])
      assert.equal((await f.runtime.runStep({task: scope, operation, args})).code,
        'JEBISEO_ANDROID_APP_ARGUMENTS_FIXED');
  assert.equal(f.calls.length, 0);
  assert.equal(f.targets.length, 0);
  assert.equal((await f.runtime.start({task: scope})).toolInvoked, true);
});

test('ANDROID request package and ownership stay immutable across later reads and another task', async () => {
  const f = appSetup(), scope = appTask();
  await f.runtime.start({task: scope});
  for (const extra of [{appPackage: 'com.google.android.gm'}, {taskDigest: '8'.repeat(64)},
    {threadRef: 'thread-another-02'}, {commandId: 'f'.repeat(32)}])
    assert.equal((await f.runtime.runStep({task: appTask(extra), operation: 'APP_OBSERVE'})).code,
      'JEBISEO_TASK_BINDING_CHANGED');
  assert.equal((await f.runtime.start({task: appTask({taskRef: 'task-android-002'})})).code,
    'JEBISEO_ORIGINAL_TASK_BINDING_REQUIRED');
  assert.equal(f.calls.length, 1);
});

test('ANDROID unknown open cannot be replayed or replaced by a new job after a read', async () => {
  const f = appSetup(async name => {
    if (name === 'life_android_open') throw Error('ORIGINAL_OUTCOME_UNKNOWN');
    return {type: 'computer_use_inspect', status: 'complete', error: null,
      result: fixtureAndroidAppInspection()};
  }), scope = appTask();
  const opened = await f.runtime.start({task: scope});
  assert.equal(opened.status, 'UNKNOWN');
  assert.equal(opened.readbackRequired, true);
  assert.equal(opened.appWindowVerified, false);
  assert.equal(opened.followUp, null, 'unknown job identity is never invented');
  assert.equal((await f.runtime.runStep({task: scope, operation: 'JOB_STATUS',
    args: {job_id: 'job_701'}})).code, 'JEBISEO_ORIGINAL_OPEN_JOB_REQUIRED');
  const observed = await f.runtime.runStep({task: scope, operation: 'APP_OBSERVE'});
  assert.equal(observed.appWindowVerified, false);
  assert.equal((await f.runtime.start({task: scope})).code, 'JEBISEO_PRIOR_EFFECT_READBACK_REQUIRED');
  assert.deepEqual(f.calls.map(call => call.name), ['life_android_open', 'life_android_computer_inspect']);
});

test('ANDROID original private app readback settles only its retained app-open effect and prevents reopening', async () => {
  for (const alreadyVisible of [false, true]) {
    const f = appSetup(), scope = appTask();
    const opened = await f.runtime.start({task: scope});
    f.binding.effectReadback = appEffectProof(opened, scope, {alreadyVisible});
    const observed = await f.runtime.runStep({task: scope, operation: 'APP_OBSERVE'});
    assert.equal(observed.code, 'JEBISEO_ANDROID_APP_OBSERVED');
    assert.equal(observed.status, 'VERIFIED');
    assert.equal(observed.appPackage, androidPackage);
    assert.equal(observed.appWindowVerified, true);
    assert.equal(observed.appOpenReceiptVerified, true);
    assert.equal(observed.observationScope, 'RIGHT_APP_WINDOW_ONLY');
    assert.equal(observed.alreadyVisible, alreadyVisible);
    assert.equal(observed.readbackRequired, false);
    assert.equal(observed.phoneDispatchVerified, false);
    assert.equal(observed.externalEffectVerified, false);
    assert.equal(observed.geminiReplyVerified, false);
    assert.equal((await f.runtime.start({task: scope})).code, 'JEBISEO_ANDROID_APP_SETTLED_READ_ONLY');
    assert.deepEqual(f.calls.map(call => call.name), ['life_android_open', 'life_android_computer_inspect']);
  }
});

test('ANDROID caller-shaped or mismatched app readback never clears the pending open', async () => {
  const f = appSetup(), scope = appTask(), opened = await f.runtime.start({task: scope});
  for (const patch of [{source: 'CALLER_JSON'}, {effectKey: 'f'.repeat(64)}, {jobId: 'job_702'},
    {appPackage: 'com.google.android.gm'}, {taskRef: 'task-other-002'}, {deviceId: 'phone-other-02'},
    {commandId: 'f'.repeat(32)}, {secureSessionId: 'other-session'}, {operation: 'OPEN'},
    {outcome: 'VERIFIED_NOT_APPLIED'}, {outcome: 'UNKNOWN'}, {appWindowVerified: 'true'},
    {observationScope: 'APP_ACTION_COMPLETED'}]) {
    f.binding.effectReadback = appEffectProof(opened, scope, patch);
    const observed = await f.runtime.runStep({task: scope, operation: 'APP_OBSERVE'});
    assert.equal(observed.appWindowVerified, false);
    assert.equal(observed.readbackRequired, true);
    assert.equal((await f.runtime.start({task: scope})).code, 'JEBISEO_PRIOR_EFFECT_READBACK_REQUIRED');
  }
  assert.equal(f.calls.filter(call => call.name === 'life_android_open').length, 1);
});

test('ANDROID hidden, non-invoking and changed-current-binding requests cannot report a verified app', async () => {
  const hidden = appSetup();
  assert.equal((await hidden.runtime.start({task: appTask({visibility: 'INTERNAL'})})).code,
    'HIDDEN_EXECUTION_UNAVAILABLE');
  for (const basis of ['quoted', 'negated'])
    assert.equal((await hidden.runtime.start({task: appTask({basis})})).code,
      'JEBISEO_NO_CURRENT_CONSULTATION');
  assert.deepEqual([hidden.calls.length, hidden.reads.length, hidden.targets.length], [0, 0, 0]);
  for (const change of [{commandId: 'f'.repeat(32)}, {secureSessionId: 'other-session'},
    {focusProtected: false}, {durableDispatchProtected: false}]) {
    const f = appSetup(async name => {
      if (name === 'life_android_open') return {jobId: 'job_701', queued: true};
      Object.assign(f.binding, change);
      return {type: 'computer_use_inspect', status: 'complete', error: null,
        result: fixtureAndroidAppInspection()};
    }), scope = appTask();
    const opened = await f.runtime.start({task: scope});
    f.binding.effectReadback = appEffectProof(opened, scope);
    const observed = await f.runtime.runStep({task: scope, operation: 'APP_OBSERVE'});
    assert.equal(observed.appWindowVerified, false);
    assert.equal(observed.readbackRequired, true);
  }
});

test('ANDROID settled apps require a successful current read and private proof again without reopening', async () => {
  let observation = {type: 'computer_use_inspect', status: 'complete', error: null,
    result: fixtureAndroidAppInspection()};
  const f = appSetup(async name => name === 'life_android_open'
    ? {jobId: 'job_701', queued: true} : observation), scope = appTask();
  const opened = await f.runtime.start({task: scope});
  f.binding.effectReadback = appEffectProof(opened, scope);
  assert.equal((await f.runtime.runStep({task: scope, operation: 'APP_OBSERVE'})).appWindowVerified, true);

  observation = {type: 'computer_use_inspect', status: 'complete', error: null,
    result: {ok: false, code: 'screen_unavailable'}};
  const failedRead = await f.runtime.runStep({task: scope, operation: 'APP_OBSERVE'});
  assert.equal(failedRead.appWindowVerified, false, 'a retained proof cannot promote a failed current read');
  assert.equal(failedRead.readbackRequired, true);

  observation = {type: 'computer_use_inspect', status: 'complete', error: null,
    result: fixtureAndroidAppInspection()};
  delete f.binding.effectReadback;
  const lostProof = await f.runtime.runStep({task: scope, operation: 'APP_OBSERVE'});
  assert.equal(lostProof.appWindowVerified, false, 'a settled effect does not make the current screen authoritative');
  assert.equal(lostProof.readbackRequired, true);
  assert.equal((await f.runtime.start({task: scope})).code, 'JEBISEO_ANDROID_APP_SETTLED_READ_ONLY');

  f.binding.effectReadback = appEffectProof(opened, scope);
  assert.equal((await f.runtime.runStep({task: scope, operation: 'APP_OBSERVE'})).appWindowVerified, true);
  assert.deepEqual(f.calls.map(call => call.name), ['life_android_open',
    ...Array(4).fill('life_android_computer_inspect')]);
});
