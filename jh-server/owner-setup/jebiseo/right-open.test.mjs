import test from 'node:test';
import assert from 'node:assert/strict';
import {createJebiseoTask, createJebiseoRuntime, jebiseoTargetBindingDigest,
  jebiseoCapabilities} from './host-runtime.mjs';
import {createJebiseoMobilePort, JEBISEO_GEMINI_WEB_URL,
  unwrapJebiseoMobileReply} from './mobile-port.mjs';
import {fixtureFieldId, fixtureGuidedArguments} from './test-support.mjs';

const commandId = 'a'.repeat(32), deviceId = 'phone-open-fixture';
const secureSessionId = 'fixture-secure-open-session';
// Match the actual original mk() format, including short IDs seen on device.
const jobId = 'job_104';
const prompt = '이 공개 유튜브 링크를 요약해 주세요.';
const args = {field_id: fixtureFieldId,
  request_id: 'd'.repeat(32), text: prompt};
const task = (extra = {}) => createJebiseoTask({taskRef: 'task-open-fixture', threadRef: 'thread-open-fixture',
  deviceId, commandId, intent: 'assist', basis: 'direct', prompt, ...extra});
const envelope = value => ({content: [{type: 'text', text: JSON.stringify(value)}], structuredContent: null});

function fixture({reply = {code: 'OPEN_COMPLETION_PENDING', jobId}, ...options} = {}) {
  const calls = [], targets = [], reads = [];
  const binding = {deviceId, commandId, secureSessionId, runtimeMode: 'PHONE_RIGHT', focusProtected: true,
    durableDispatchProtected: true};
  const runtime = createJebiseoRuntime({runtimeMode: 'PHONE_RIGHT',
    callOriginalTool: async (name, parameters) => {
      calls.push({name, args: parameters});
      if (reply === null) throw Error('ORIGINAL_OPEN_OUTCOME_UNKNOWN');
      return envelope(reply);
    },
    readCurrentBinding: async query => {reads.push(query); return {...binding};},
    verifyGeminiTarget: async ({task: scope, operation, args: parameters}) => {
      targets.push(operation);
      return {source: 'ORIGINAL_SECURE56', provider: 'GEMINI', targetVerified: true,
        deviceId, commandId, secureSessionId, promptDigest: scope.promptDigest, windowId: 23,
        bindingDigest: jebiseoTargetBindingDigest(scope, operation, parameters),
        targetFieldId: parameters.field_id,
        editorVerified: true, draftEmpty: true, rightPaneVerified: true,
        workPackage: 'com.android.chrome', displayId: 0, guidedArgumentsVerified: true,
        guidedArguments: fixtureGuidedArguments()};
    }, ...options});
  return {runtime, binding, calls, targets, reads};
}
function openProof(opened, patch = {}) {
  return {source: 'ORIGINAL_SECURE56', taskRef: 'task-open-fixture', deviceId, commandId,
    secureSessionId,
    effectKey: opened.effectKey, operation: 'OPEN', jobId, url: JEBISEO_GEMINI_WEB_URL,
    outcome: 'VERIFIED_APPLIED', ...patch};
}

test('current explicit invocation defaults to visible, with open-only requiring no invented question', async () => {
  const open = task({intent: 'open', prompt: undefined});
  assert.equal(open.visibility, 'VISIBLE'); assert.equal(open.active, true);
  assert.equal(Object.hasOwn(open, 'prompt'), false);
  assert.throws(() => task({commandId: undefined}), /EXISTING_MOBILE_COMMAND_REQUIRED/);
  const f = fixture(), opened = await f.runtime.start({task: open});
  assert.equal(opened.requestedUrl, JEBISEO_GEMINI_WEB_URL);
  assert.deepEqual(f.calls, [{name: 'life_web_navigate',
    args: {command_id: commandId, url: JEBISEO_GEMINI_WEB_URL}}]);
  assert.equal(f.targets.length, 0, 'opening cannot demand a pre-existing Gemini editor');
  assert.equal(f.reads.length, 2, 'original owner binding is checked again before launch');
  for (const operation of ['TYPE', 'DISCOVER_INPUT', 'DISMISS_NOTICE', 'INSPECT_SUBMIT', 'PREPARE_SUBMIT', 'APPROVAL_REQUEST', 'EXECUTE_SUBMIT'])
    assert.equal((await f.runtime.runStep({task: open, operation, args})).code, 'JEBISEO_OPEN_ONLY_TASK');
  assert.equal(f.calls.length, 1);
  assert.equal(jebiseoCapabilities().productionRegistered, false);
  assert.equal(jebiseoCapabilities().geminiAssistanceAvailable, false);
});

test('hidden, development, quoted and negated tasks never auto-open', async () => {
  for (const change of [{visibility: 'INTERNAL'}, {intent: 'develop'}, {basis: 'quoted'}, {basis: 'negated'}]) {
    const f = fixture(); await f.runtime.start({task: task(change)});
    assert.deepEqual([f.reads.length, f.calls.length, f.targets.length], [0, 0, 0]);
  }
});

test('fixed destination rejects caller URLs, native targets, extra grants and duplicate navigation', async () => {
  const calls = [];
  const port = createJebiseoMobilePort({runtimeMode: 'PHONE_RIGHT',
    callOriginalTool: async (name, value) => {calls.push({name, value}); return envelope({jobId});}});
  const run = args => port.run({visibility: 'VISIBLE', command_id: commandId, operation: 'OPEN', args});
  for (const args of [{url: 'https://example.com'}, {url: JEBISEO_GEMINI_WEB_URL},
    {target: '제미나이 앱'}, {request_id: 'e'.repeat(32)}, {action_approval_grant_token: 'unrelated'}])
    assert.equal((await run(args)).toolInvoked, false);
  assert.equal(calls.length, 0);
  assert.equal((await run({})).toolInvoked, true);
  assert.equal((await run({})).code, 'JEBISEO_ACTION_ALREADY_ATTEMPTED_READ_ORIGINAL_RESULT');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'life_web_navigate');
});

test('text-only MCP with structuredContent null is readable, conflicting structured data remains rejected', () => {
  const payload = {code: 'OPEN_COMPLETION_PENDING', jobId};
  assert.deepEqual(unwrapJebiseoMobileReply(envelope(payload)), payload);
  assert.equal(unwrapJebiseoMobileReply({...envelope(payload), structuredContent: {jobId: 'other'}}), null);
});

test('pending or unknown OPEN blocks repeat open, input and send; original job read never becomes a replay', async () => {
  for (const reply of [{code: 'OPEN_COMPLETION_PENDING', jobId}, {ok: true, jobId}, null]) {
    const f = fixture({reply}), scope = task();
    const opened = await f.runtime.start({task: scope});
    for (const operation of ['OPEN', 'TYPE', 'APPROVAL_REQUEST', 'EXECUTE_SUBMIT']) {
      const blocked = await f.runtime.runStep({task: scope, operation, args: operation === 'TYPE' ? args : {}});
      assert.equal(blocked.code, 'JEBISEO_PRIOR_EFFECT_READBACK_REQUIRED');
      assert.equal(blocked.effectKey, opened.effectKey);
    }
    assert.equal(f.calls.length, 1);
    const read = await f.runtime.runStep({task: scope, operation: 'JOB_STATUS', args: {job_id: jobId}});
    if (reply === null) {
      assert.equal(read.code, 'JEBISEO_ORIGINAL_OPEN_JOB_REQUIRED');
      assert.equal(opened.followUp, null, 'a missing original job must not be invented');
    } else {
      assert.equal(read.toolInvoked, true);
      assert.deepEqual(opened.followUp.arguments, {job_id: jobId, command_id: commandId});
      assert.equal(f.calls[1].name, 'life_job_status');
      assert.equal((await f.runtime.runStep({task: scope, operation: 'JOB_STATUS',
        args: {job_id: 'different-original-job'}})).code, 'JEBISEO_ORIGINAL_OPEN_JOB_REQUIRED');
    }
    assert.equal((await f.runtime.runStep({task: scope, operation: 'TYPE', args})).code,
      'JEBISEO_PRIOR_EFFECT_READBACK_REQUIRED');
  }
});

test('OPEN readback must bind the original effect, job, URL and owner; TYPE still verifies the fresh editor', async () => {
  const f = fixture(), scope = task(), opened = await f.runtime.start({task: scope});
  for (const patch of [{jobId: 'wrong-original-job'}, {url: 'https://example.com/'},
    {effectKey: 'e'.repeat(64)}, {commandId: 'f'.repeat(32)}, {outcome: 'QUEUED'},
    {source: 'CALLER_JSON'}, {operation: 'TYPE'}]) {
    f.binding.effectReadback = openProof(opened, patch);
    assert.equal((await f.runtime.runStep({task: scope, operation: 'TYPE', args})).code,
      'JEBISEO_PRIOR_EFFECT_READBACK_REQUIRED');
  }
  assert.equal(f.targets.length, 0);
  f.binding.effectReadback = openProof(opened);
  const typed = await f.runtime.runStep({task: scope, operation: 'TYPE', args});
  assert.equal(typed.toolInvoked, true);
  assert.deepEqual(f.targets, ['TYPE']);
  assert.deepEqual(f.calls.map(call => call.name), ['life_web_navigate', 'life_android_step']);
  assert.equal(typed.geminiAcceptedVerified, false);
});

test('a new task reference under the same original device/command cannot evade an unresolved OPEN', async () => {
  const f = fixture();
  await f.runtime.start({task: task()});
  const substitute = task({taskRef: 'task-substitute-fixture'});
  for (const operation of ['OPEN', 'TYPE', 'SNAPSHOT']) {
    const blocked = await f.runtime.runStep({task: substitute, operation, args: operation === 'TYPE' ? args : {}});
    assert.equal(blocked.code, 'JEBISEO_ORIGINAL_TASK_BINDING_REQUIRED');
  }
  assert.equal(f.calls.length, 1);
  assert.equal(f.targets.length, 0);
});

test('OPEN preserves focus and durable fencing, including a changed command during the final binding check', async () => {
  for (const change of [{focusProtected: false}, {durableDispatchProtected: false}, {commandId: 'f'.repeat(32)}]) {
    const f = fixture(); Object.assign(f.binding, change);
    assert.equal((await f.runtime.start({task: task()})).toolInvoked, false);
    assert.equal(f.calls.length, 0);
  }
  let reads = 0;
  const f = fixture({readCurrentBinding: async () => ({...f.binding,
    ...(++reads > 1 ? {commandId: 'e'.repeat(32)} : {})})});
  assert.equal((await f.runtime.start({task: task()})).code, 'JEBISEO_BINDING_CHANGED_AFTER_TARGET_VERIFICATION');
  assert.equal(f.calls.length, 0);
});
