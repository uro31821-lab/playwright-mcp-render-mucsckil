import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createJebiseoMobilePort, JEBISEO_ORIGINAL_MOBILE_TOOLS, JEBISEO_GEMINI_WEB_URL,
  unwrapJebiseoMobileReply} from './mobile-port.mjs';
import {patchJH168MobileWebCommands56} from '../jh168-mobile-unification/mobile-web-tool-patch.mjs';
import {fixtureFieldId, fixtureGuidedArguments, fixtureGuidedJob, fixtureMobileReply} from './test-support.mjs';
import {classifyJebiseoGuidedJob} from './guided-outcome.mjs';

const command = 'a'.repeat(32), context = `ssc_${'b'.repeat(32)}`;
const task = 'd'.repeat(64), request = 'e'.repeat(32), digest = 'f'.repeat(64);
const typeArgs = () => ({field_id: fixtureFieldId, request_id: request,
  text: '공개 예시 질문', guided_arguments: fixtureGuidedArguments()});
const submitArgs = () => ({device_id: 'test-phone', task_digest: task, index: 3,
  lease_token: 'original-lease-token', action_approval_grant_token: 'original-local-grant',
  local_action_approval_digest: digest});
const envelope = value => ({content: [{type: 'text', text: JSON.stringify(value)}]});
function fixture(reply = (name, args) => envelope(fixtureMobileReply(name, args))) {
  const calls = [];
  const port = createJebiseoMobilePort({runtimeMode: 'PHONE_RIGHT', callOriginalTool: async (name, args) => {
    calls.push({name, args}); return reply(name, args);
  }});
  const run = (operation, args = {}, extra = {}) => port.run({visibility: 'VISIBLE', command_id: command, operation, args, ...extra});
  return {port, calls, run};
}

test('hidden and unspecified visibility stop before every original tool call', async () => {
  const f = fixture();
  for (const visibility of ['HIDDEN', undefined, 'INTERNAL', null]) {
    const result = await f.run('SNAPSHOT', {}, {visibility});
    assert.equal(result.code, 'HIDDEN_EXECUTION_UNAVAILABLE');
    assert.equal(result.toolInvoked, false);
    assert.equal(result.phoneDispatchVerified, false);
  }
  assert.equal(f.calls.length, 0);
});

test('legacy and unset runtime modes cannot invoke same-named desktop tools', async () => {
  for (const runtimeMode of [null, 'ORIGINAL', 'PLAYWRIGHT']) {
    let calls = 0;
    const p = createJebiseoMobilePort({runtimeMode, callOriginalTool: async () => { calls++; }});
    assert.equal((await p.run({visibility: 'VISIBLE', operation: 'SNAPSHOT', command_id: command})).code,
      'ORIGINAL_PHONE_RIGHT_RUNTIME_REQUIRED');
    assert.equal(calls, 0);
  }
  assert.equal(JEBISEO_ORIGINAL_MOBILE_TOOLS.includes('life_android_workflow_link'), false);
  assert.equal(JEBISEO_ORIGINAL_MOBILE_TOOLS.includes('life_web_click'), false);
  assert.equal(JEBISEO_ORIGINAL_MOBILE_TOOLS.includes('life_web_type'), false);
});

test('unknown operations, mismatched command and extra action keys fail before dispatch', async () => {
  const f = fixture();
  assert.equal((await f.run('BEGIN_COMMAND')).code, 'JEBISEO_MOBILE_OPERATION_UNSUPPORTED');
  assert.equal((await f.run('SNAPSHOT', {command_id: 'b'.repeat(32)})).code, 'JEBISEO_COMMAND_MISMATCH');
  assert.equal((await f.run('TYPE', {...typeArgs(), element: '#send'})).code, 'JEBISEO_MOBILE_ARGUMENT_UNSUPPORTED');
  assert.equal(f.calls.length, 0);
});

test('canonical tool envelopes stay raw and nested job results are never promoted', async () => {
  const nested = {status: 'complete', result: {ok: true, approved: true}, receiptToken: 'original-only'};
  const raw = envelope(nested), f = fixture(() => raw);
  const result = await f.run('SNAPSHOT');
  assert.equal(result.raw, raw);
  assert.deepEqual(result.payload, nested);
  assert.equal(result.originalStatus, 'complete');
  assert.equal(result.geminiAcceptedVerified, false);
  assert.equal(result.fullReplyVerified, false);
  assert.equal(result.chatGptDelivered, false);
  assert.equal(result.phoneDispatchVerified, false);
  assert.deepEqual(unwrapJebiseoMobileReply({structuredContent: nested, content: []}), nested);
  assert.equal(unwrapJebiseoMobileReply({content: [{type: 'text', text: 'not JSON'}]}), null);
});

test('typed real-runtime learning appendix is distinct from the one primary result and MCP errors', async () => {
  const payload = {status: 'complete', result: {ok: true}, code: 'original_readback'};
  // Same fixed envelope shape as appendAdvice in operational-learning/server-runtime.mjs.
  const notice = {type: 'jh_operational_learning', delivery: 'offered', timing: 'after_execution',
    advisoryOnly: true, externalEffects: false, revision: 1, preflightTool: 'life_learning_context',
    lessons: [], proposals: [], observationScope: 'JH tool events only; ordinary chat is not observed',
    librarySync: 'not_connected'};
  const raw = {content: [...envelope(payload).content, ...envelope(notice).content]};
  assert.deepEqual(unwrapJebiseoMobileReply(raw), payload);
  const f = fixture(() => raw), result = await f.run('SNAPSHOT');
  assert.equal(result.raw, raw); assert.deepEqual(result.payload, payload);
  assert.equal(result.phoneDispatchVerified, false);
  assert.equal(unwrapJebiseoMobileReply({content: [...raw.content, ...envelope({ok: true}).content]}), null);
  assert.equal(unwrapJebiseoMobileReply({content: [...envelope(payload).content,
    ...envelope({...notice, advisoryOnly: false}).content]}), null);
  assert.equal(unwrapJebiseoMobileReply({content: [...raw.content,
    {type: 'text', text: 'an untyped explanation'}]}), null);
  assert.equal(unwrapJebiseoMobileReply({...raw, structuredContent: {ok: false}}), null);
  const errorRaw = {...raw, structuredContent: payload, isError: true};
  const errorFixture = fixture(() => errorRaw), errorResult = await errorFixture.run('SNAPSHOT');
  assert.equal(errorResult.ok, false); assert.equal(errorResult.raw.isError, true);
  assert.deepEqual(errorResult.payload, payload);
});

test('original lowercase command-discard and pending results survive unchanged', async () => {
  const f = fixture(() => envelope({ok: false, code: 'new_command_binding_required_or_discarded', status: 'UNKNOWN'}));
  const result = await f.run('RECEIPT_STATUS', {task_digest: task, receipt_token: 'original-receipt-token'});
  assert.equal(result.code, 'new_command_binding_required_or_discarded');
  assert.equal(result.originalStatus, 'UNKNOWN');
  assert.equal(result.status, 'UNKNOWN');
  assert.equal(f.calls[0].args.command_id, command);
});

test('typing forwards issued native carrier unchanged and replaces only its value', async () => {
  const f = fixture();
  await f.run('TYPE', typeArgs());
  assert.deepEqual(f.calls, [{name: 'life_android_step', args: {
    ...fixtureGuidedArguments(), value: typeArgs().text, command_id: command}}]);
  assert.equal((await f.run('TYPE', {...typeArgs(), submit: true})).code, 'MOBILE_SUBMIT_SEPARATE_ACTION_REQUIRED');
  assert.equal((await f.run('TYPE', {...typeArgs(), field_id: '#editor'})).code, 'JEBISEO_NATIVE_FIELD_ID_REQUIRED');
  assert.equal((await f.run('TYPE', {...typeArgs(), text: '가'.repeat(700)})).code, 'JEBISEO_SHARED_PHONE_TEXT_LIMIT');
  assert.equal(f.calls.length, 1);
});

test('native target must equal the issued field; web context and item references cannot replace it', async () => {
  const f = fixture();
  assert.equal((await f.run('TYPE', {...typeArgs(), field_id: 'f_' + '1'.repeat(24)})).code,
    'JEBISEO_GUIDED_TARGET_MISMATCH');
  for (const extra of [{target_item_ref: 'item_' + 'c'.repeat(16)}, {context_id: context}]) {
    assert.equal((await f.run('TYPE', {...typeArgs(), ...extra})).code,
      'JEBISEO_MOBILE_ARGUMENT_UNSUPPORTED');
  }
  assert.equal((await f.run('TYPE', {...typeArgs(), field_id: 'item_' + 'c'.repeat(16)})).code,
    'JEBISEO_NATIVE_FIELD_ID_REQUIRED');
  assert.equal(f.calls.length, 0);
});

test('concurrent or changed-request duplicate writes invoke original tool only once', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const f = fixture(async () => { await gate; return envelope({status: 'queued'}); });
  const first = f.run('TYPE', typeArgs());
  const second = await f.run('TYPE', {...typeArgs(), request_id: '1'.repeat(32)});
  assert.equal(second.code, 'JEBISEO_ACTION_ALREADY_ATTEMPTED_READ_ORIGINAL_RESULT');
  release(); await first;
  assert.equal(f.calls.length, 1);
});

test('unknown effect stays reserved while same original job can be read repeatedly', async () => {
  const f = fixture((name) => {
    if (name === 'life_android_step') throw Error('new_command_binding_required_or_discarded');
    return envelope({status: 'in_progress'});
  });
  const first = await f.run('TYPE', typeArgs());
  assert.equal(first.status, 'UNKNOWN');
  assert.equal(first.code, 'new_command_binding_required_or_discarded');
  assert.equal((await f.run('TYPE', typeArgs())).toolInvoked, false);
  await f.run('JOB_STATUS', {job_id: 'original-job-id'});
  await f.run('JOB_STATUS', {job_id: 'original-job-id'});
  assert.deepEqual(f.calls.map(c => c.name), ['life_android_step', 'life_job_status', 'life_job_status']);
  assert.ok(f.calls.every(c => c.args.command_id === command));
  assert.equal(f.port.capabilities().processLocalReservationsOnly, true);
});

test('submit requires existing exact local grant and calls original Computer Use once', async () => {
  const f = fixture(() => envelope({status: 'in_progress'}));
  const args = submitArgs();
  const {action_approval_grant_token: omitted, ...withoutGrant} = args;
  assert.equal((await f.run('EXECUTE_SUBMIT', withoutGrant)).code, 'EXACT_PHONE_LOCAL_SEND_APPROVAL_REQUIRED');
  assert.equal(f.calls.length, 0);
  await f.run('EXECUTE_SUBMIT', args);
  assert.equal(f.calls[0].name, 'life_android_execute_computer_action');
  assert.deepEqual(f.calls[0].args, {...args, command_id: command, action: 'CLICK',
    effect: 'IRREVERSIBLE', data_class: 'NON_SENSITIVE', max_actions_in_call: 1});
  assert.equal((await f.run('EXECUTE_SUBMIT', {...args, lease_token: 'a-new-unused-lease'})).code,
    'JEBISEO_ACTION_ALREADY_ATTEMPTED_READ_ORIGINAL_RESULT');
  assert.equal(f.calls.length, 1);
});

test('prepare, local approval request and status never auto-execute a ready action', async () => {
  const f = fixture(() => envelope({ok: true, code: 'READY', approved: true}));
  const args = {task_digest: task, index: 3};
  await f.run('PREPARE_SUBMIT', args);
  await f.run('APPROVAL_REQUEST', args);
  await f.run('APPROVAL_STATUS', {task_digest: task, request_token: 'original-request-token'});
  assert.deepEqual(f.calls.map(c => c.name), [
    'life_android_computer_prepare', 'life_android_action_approval_request', 'life_android_action_approval_status'
  ]);
  assert.equal((await f.run('APPROVAL_REQUEST', args)).toolInvoked, false);
});

test('submit cannot downgrade effect, batch actions, send SECRET data or accept missing target', async () => {
  const f = fixture();
  for (const change of [{effect: 'READ_ONLY'}, {action: 'TYPE'}, {max_actions_in_call: 2}, {data_class: 'SECRET'}, {index: -1}]) {
    assert.equal((await f.run('EXECUTE_SUBMIT', {...submitArgs(), ...change})).toolInvoked, false);
  }
  assert.equal(f.calls.length, 0);
});

test('in-memory reservation capacity fails closed instead of evicting unknown actions', async () => {
  let calls = 0;
  const port = createJebiseoMobilePort({runtimeMode: 'PHONE_RIGHT', maxReservations: 1,
    callOriginalTool: async () => { calls++; return envelope({status: 'queued'}); }});
  const q = {visibility: 'VISIBLE', operation: 'TYPE', command_id: command, args: typeArgs()};
  await port.run(q);
  assert.equal((await port.run({...q, command_id: '2'.repeat(32)})).code, 'JEBISEO_LOCAL_RESERVATION_CAPACITY');
  assert.equal(calls, 1);
});

test('adapter preserves the real generated Mobile13 fixed OPEN and RIGHT read handlers', async () => {
  const source = readFileSync(new URL('../../server.mjs', import.meta.url), 'utf8');
  const start = '  registerOAuthTool("life_web_navigate",{';
  const prerequisites = [
    '  let jhRightWebOpen56=null;', '  function jhSplitScreenJob56(){}',
    '  function jhSplitScreenContextId56(){}', '  function jhSplitScreenPayloadHasLocalOnly56(){}',
    '  function jhRequireCommand56(device){}', "  registerOAuthTool('life_android_split_screen_assistant',{});"
  ].join('\n') + '\n';
  const patched = patchJH168MobileWebCommands56(source.replace(start, prerequisites + start));
  const a = patched.indexOf('  // JH168: all nine historical web commands');
  const b = patched.indexOf('  registerOAuthTool("life_android_devices",{', a);
  const handlers = new Map(), jobs = [], opens = [];
  const z = new Proxy(() => z, {get: () => z, apply: () => z});
  vm.runInNewContext(patched.slice(a, b), {
    URL, z, textResult: envelope, randomBytes: n => Buffer.alloc(n, 1),
    registerOAuthTool: (name, config, handler) => handlers.set(name, handler),
    jhSplitScreenContextId56: value => /^ssc_[a-f0-9]{32}$/.test(value),
    jhSplitScreenPayloadHasLocalOnly56: () => false,
    jhRightWebOpen56: async args => {opens.push(args); return envelope({code: 'OPEN_COMPLETION_PENDING'});},
    jhSplitScreenJob56: async (type, payload, effect, tool) => {
      jobs.push({type, payload, effect, tool});
      return type === 'split_screen_session_input_preflight'
        ? {inputAllowed: true, inputGrantToken: `ipg_${'3'.repeat(32)}`}
        : {ok: true, status: 'queued'};
    }
  }, {timeout: 2000});
  const port = createJebiseoMobilePort({runtimeMode: 'PHONE_RIGHT',
    callOriginalTool: (name, args) => handlers.get(name)(args)});
  const opened = await port.run({visibility: 'VISIBLE', operation: 'OPEN', command_id: command});
  assert.equal(opened.code, 'OPEN_COMPLETION_PENDING');
  assert.deepEqual(JSON.parse(JSON.stringify(opens)), [{service: JEBISEO_GEMINI_WEB_URL}]);
  await port.run({visibility: 'VISIBLE', operation: 'SNAPSHOT', command_id: command, args: {context_id: context}});
  assert.deepEqual(jobs.map(j => j.type), ['split_screen_session_status']);
});

test('native snapshot and guided TYPE use original registered Android job carriers', async () => {
  const source = readFileSync(new URL('../../server.mjs', import.meta.url), 'utf8');
  const a = source.indexOf('  registerOAuthTool("life_android_snapshot",{');
  const b = source.indexOf('  registerOAuthTool("open_on_android",', a);
  assert.ok(a >= 0 && b > a);
  const handlers = new Map(), jobs = [];
  const z = new Proxy(() => z, {get: () => z, apply: () => z});
  vm.runInNewContext(source.slice(a, b), {z,
    registerOAuthTool: (name, config, handler) => handlers.set(name, handler),
    mk: (type, payload = {}) => {const job = {type, payload}; jobs.push(job); return job;},
    waitJob: async job => ({...job, status: 'complete', result: {ok: true}}), jobResult: envelope
  });
  const port = createJebiseoMobilePort({runtimeMode: 'PHONE_RIGHT',
    callOriginalTool: (name, args) => handlers.get(name)(args)});
  await port.run({visibility: 'VISIBLE', operation: 'FORM_SNAPSHOT', command_id: command});
  const typed = await port.run({visibility: 'VISIBLE', operation: 'TYPE', command_id: command, args: typeArgs()});
  assert.deepEqual(jobs.map(j => j.type), ['agent_snapshot', 'agent_step']);
  assert.deepEqual(jobs[1].payload, {...fixtureGuidedArguments(), value: typeArgs().text, command_id: command});
  assert.equal(typed.geminiAcceptedVerified, false);
});

test('manual and unresolved outcomes remain reserved and never fall back to an old input alias', async () => {
  for (const payload of [{ok: true, provider: 'MANUAL', allowed: false, manualRequired: true},
    {ok: false, status: 'EFFECT_UNKNOWN'}, {ok: true, status: 'queued'}]) {
    const f = fixture(() => envelope(payload));
    const first = await f.run('TYPE', typeArgs());
    assert.equal(first.ok, false);
    assert.deepEqual(first.payload, payload);
    assert.equal((await f.run('TYPE', {...typeArgs(), request_id: '1'.repeat(32)})).toolInvoked, false);
    assert.deepEqual(f.calls.map(c => c.name), ['life_android_step']);
  }
});

test('typed native job decoding preserves uncertainty and never promotes a mismatched input result', async () => {
  const successful = JSON.parse(fixtureGuidedJob().result.url);
  for (const [inner, status] of [
    [successful, 'RETURNED'],
    [{...successful, fieldId: 'f_' + 'c'.repeat(24)}, 'UNVERIFIABLE'],
    [{...successful, operation: 'select'}, 'UNVERIFIABLE'],
    [{ok: false, code: 'field_changed_rescan', actionAccepted: false}, 'BLOCKED'],
    [{ok: true, code: 'manual_required', provider: 'MANUAL'}, 'MANUAL'],
    ...['field_value_unverified', 'dispatch_uncertain_do_not_retry',
      'operation_incomplete_do_not_retry', 'form_operation_failed_do_not_retry'].map(code =>
      [{ok: false, code, actionAccepted: false}, 'UNKNOWN'])
  ]) {
    const payload = fixtureGuidedJob('TYPE', inner), f = fixture(() => envelope(payload));
    const response = await f.run('TYPE', typeArgs());
    assert.equal(response.status, status, inner.code);
    assert.equal(response.nativeCode, inner.code); assert.equal(response.readbackRequired, true);
    assert.deepEqual(response.payload, payload);
    assert.equal(response.geminiAcceptedVerified, false);
    assert.equal((await f.run('TYPE', typeArgs())).toolInvoked, false);
  }
});

test('guided result parser reads only the exact original job slot and current action', async () => {
  const good = fixtureGuidedJob(), inner = JSON.parse(good.result.url);
  const missingField = {...inner}; delete missingField.fieldId;
  assert.equal(classifyJebiseoGuidedJob(fixtureGuidedJob('TYPE', missingField), {
    operation: 'TYPE', identity: {operation: 'form15_type'}
  }).outcome.status, 'UNVERIFIABLE');
  for (const payload of [{ok: true}, {...good, type: 'agent_snapshot'},
    {...good, result: {...good.result, url: 'not-json'}},
    {...good, result: {...good.result, ok: false}},
    {acted: good, snapshot: {ok: true}}, fixtureGuidedJob('DISCOVER_INPUT')]) {
    const response = await fixture(() => envelope(payload)).run('TYPE', typeArgs());
    assert.equal(response.ok, false); assert.equal(response.readbackRequired, true);
  }
  const decorated = fixtureGuidedJob('TYPE', {...inner, nextQuestion: {status: 'UNKNOWN'},
    detail: '{"manualRequired":true}', observations: [{label: 'STOP_NO_REPLAY'}]});
  assert.equal((await fixture(() => envelope(decorated)).run('TYPE', typeArgs())).status, 'RETURNED');
  const guarded = {...good, executionStatus: 'EFFECT_UNKNOWN'};
  assert.equal((await fixture(() => envelope(guarded)).run('TYPE', typeArgs())).status, 'UNKNOWN');
});
