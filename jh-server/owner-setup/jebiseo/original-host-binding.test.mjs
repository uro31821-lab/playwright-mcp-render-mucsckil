import test from 'node:test';
import assert from 'node:assert/strict';
import {AsyncLocalStorage} from 'node:async_hooks';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {z} from 'zod';
import {createJebiseoTask} from './host-runtime.mjs';
import {createJebiseoOriginalHostBinding} from './original-host-binding.mjs';
import {JEBISEO_GEMINI_WEB_URL, unwrapJebiseoMobileReply} from './mobile-port.mjs';

// Synthetic, host-private unit fixtures. These readers model the composition's
// object-capability contract, not phone authentication. The separate generated
// composition suite exercises its actual command/registry/request seams.
const hash = value => createHash('sha256').update(value).digest('hex');
const deviceId = 'fixture-phone-1', commandId = '1'.repeat(32);
const field = `f_${'a'.repeat(24)}`, notice = `f_${'b'.repeat(24)}`;
const issuer = '11111111-2222-4333-8444-555555555555', revision = 'c'.repeat(64);
const protocol = 'com.koreanlifehub.bridge.protocol', prompt = 'fixture Gemini prompt';
const carrier = (op, target = '', option = '', value = '') => ({action: 'set_text',
  text: `__JH_FORM_V1__|${issuer}|fixture_request|${op}|${target}|${option}`, value});
const task = (overrides = {}) => createJebiseoTask({taskRef: 'fixture-task-1',
  threadRef: 'fixture-thread-1', intent: 'consult', basis: 'direct',
  deviceId, commandId, prompt, ...overrides});
const editor = () => ({fieldId: field, label: 'Ask Gemini', kind: 'TEXT',
  filled: false, enabled: true, ambiguous: false, error: '', labelSource: 'hint', controlRole: 'textbox'});
const page = () => ({ok: true, code: 'form_scanned', origin: 'gemini.google.com', revision,
  coverage: 'VISIBLE_ACCESSIBILITY_ONLY', hasSensitiveFields: false, siteErrors: [],
  fields: [editor()], buttons: [{targetId: notice, label: '주의사항 닫기', approvalRequired: false,
    activateToolArguments: carrier('form_activate', notice, 'visible-only')}]});
function pair(at) {
  return {kind: 'split_screen_evidence', package: protocol, version: '1', verified: 'true',
    layout: 'LEFT_RIGHT', chatPackage: 'com.openai.chatgpt', chatKind: 'NATIVE', chatWindowId: '11',
    workPackage: 'com.android.chrome', workWindowId: '22', chatBounds: '0,0,500,1000',
    workBounds: '500,0,1000,1000', chatDisplayId: '0', workDisplayId: '0', displayId: '0',
    displayVerified: 'true', observedAtMs: String(at)};
}
function snapshotResult(at, toolbar, form = page()) {
  const rows = [{package: protocol, guidedForm: JSON.stringify(form),
    inputSelection15ToolArguments: JSON.stringify(carrier('form15_discover'))},
    {kind: 'screen_scope', package: 'com.android.chrome', windowId: '22',
      workBounds: '500 0 1000 1000', chatBounds: '0 0 500 1000', placement: 'RIGHT',
      verifiedRightPane: 'true', verifiedWorkPane: 'true', workPaneSide: 'RIGHT'},
    pair(at), ...(toolbar ? [{kind: 'browser_address_readback', package: protocol,
      source: 'ANDROID_ACCESSIBILITY_TOOLBAR', workPackage: 'com.android.chrome',
      windowId: '22', displayId: '0', observedUrl: JEBISEO_GEMINI_WEB_URL,
      observedAtMs: String(at), pageContentVerified: 'false'}] : [])];
  return {ok: true, url: JSON.stringify(rows), splitScreenRequired: true, splitScreen: pair(at)};
}
function safeView(job) {
  return {idDigest: hash(job.id), type: job.type, status: job.status,
    result: structuredClone(job.result ?? null), error: job.error ?? null,
    completedAt: job.completedAt ?? null, targetDeviceDigest: null};
}
const reply = payload => ({content: [{type: 'text', text: JSON.stringify(payload)}]});

function fixture() {
  const request = new AsyncLocalStorage(), jobs = new Map(), scopes = new WeakMap(), returned = new WeakMap();
  const calls = [], parses = [], hookMutations = [];
  const hooks = {capture() {hookMutations.push('capture');}, beforeDispatch() {hookMutations.push('reserve');},
    acceptedCompletion() {hookMutations.push('completion');}, uncertainEffectsForMaintenance: () => 0};
  let clock = Date.parse('2026-11-05T12:00:00.000Z'), counter = 0;
  const state = {deviceId, commandId, secureSessionId: 'fixture-session',
    deviceDigest: 'd'.repeat(64), sessionDeviceDigest: 'd'.repeat(64),
    runtimeId: 'e'.repeat(64), secureBridgeVersion: 56, durableHooks: hooks,
    focus: {state: 'observed', present: true, active: true, currentCommandMatches: true, remainingMs: 10000}};
  const options = {toolbar: true, beforeParse: null, beforeReturn: null, beforeState: null,
    queueDiscover: false, queueType: false, snapshotPage: null,
    marker: true, captureSnapshot: true, hold: null};
  const current = () => request.getStore()?.live ? request.getStore().cap : null;
  const schemas = {
    life_web_navigate: z.object({url: z.string(), command_id: z.string()}),
    life_android_snapshot: z.object({command_id: z.string()}),
    life_android_step: z.object({action: z.string(), text: z.string().optional(), value: z.string().optional(), command_id: z.string()}),
    life_job_status: z.object({job_id: z.string(), command_id: z.string()})
  };
  function complete(job) {
    job.startedAtMs ??= clock;
    clock += 2;
    let result;
    if (job.type === 'agent_snapshot') result = snapshotResult(clock - 1, options.toolbar,
      options.snapshotPage?.() ?? page());
    else if (job.type === 'open_url') result = {ok: true, url: job.url, rightAddressConfirmed: true,
      splitScreenRequired: true, splitScreen: pair(clock - 1), pageContentVerified: false};
    else if (job.text.includes('|form15_discover|')) result = {ok: true, url: JSON.stringify({...page(),
      coverage: 'VISIBLE_ONLY', feature: 'input_selection_15',
      form15ToolArguments: {fields: [{fieldId: field, kind: 'TEXT', write: carrier('form15_type', field, '', '<값>')}]}})};
    else if (job.text.includes('|form15_type|')) result = {ok: true, url: JSON.stringify({ok: true,
      code: 'field_value_verified', operation: 'type', fieldId: field, actionAccepted: true,
      valueVerified: true, effectConfirmed: false, autoRetryAllowed: false})};
    else result = {ok: true, url: JSON.stringify({ok: true, code: 'low_risk_action_dispatched',
      actionAccepted: true, transactionSuccessVerified: false, autoRetryAllowed: false, rescanRequired: true})};
    job.result = result;
    job.completedAt = new Date(clock).toISOString(); job.status = 'complete';
    if (options.marker) job.stage26CompletionDigest56 = hash(JSON.stringify({result, originalHttpFixture: job.id}));
    return job;
  }
  const readers = {
    getOriginalTool(name) {
      if (!current() || !schemas[name]) return null;
      const cap = current();
      return {schema: {parse(args) {
        parses.push(name); options.beforeParse?.(name, args);
        return schemas[name].parse(args);
      }}, handler: async args => {
        assert.equal(current(), cap);
        calls.push({name, args: structuredClone(args), cap});
        let job;
        if (name === 'life_job_status') job = jobs.get(args.job_id);
        else {
          const type = name === 'life_web_navigate' ? 'open_url' : name === 'life_android_snapshot' ? 'agent_snapshot' : 'agent_step';
          job = {id: `job_${++counter}`, type, status: 'queued', createdAtMs: clock,
            targetDeviceId: state.deviceId, secureSessionId: state.secureSessionId,
            ...(type === 'agent_snapshot' ? {} : {commandId: args.command_id}),
            ...(type === 'open_url' ? {url: args.url, target: 'chrome'} :
              type === 'agent_step' ? {action: args.action, text: args.text, value: args.value} : {})};
          jobs.set(job.id, job);
          if (type === 'agent_snapshot' && options.captureSnapshot) scopes.set(job, Object.freeze({
            commandId: state.commandId, deviceId: state.deviceId, secureSessionId: state.secureSessionId,
            runtimeId: state.runtimeId, requestScope: cap}));
          const queued = (options.queueDiscover && job.text?.includes('|form15_discover|')) ||
            (options.queueType && job.text?.includes('|form15_type|'));
          if (!queued) complete(job);
        }
        let raw = reply(job ? {...safeView(job), ...(job.type === 'open_url' ? {jobId: job.id} : {})} : {error: 'not found'});
        if (options.hold) await options.hold;
        raw = options.beforeReturn?.({job, raw, name, args}) ?? raw;
        returned.set(raw, {cap, name, args: structuredClone(args), raw: structuredClone(raw), job});
        return raw;
      }};
    },
    readCurrentState() {options.beforeState?.(); return current() ? state : null;},
    readAuthenticatedRequestScope: current,
    readOriginalJob: id => current() ? jobs.get(id) ?? null : null,
    readOriginalJobScope: job => current() ? scopes.get(job) ?? null : null,
    findOriginalReturnedJob({raw, toolName, args, requestScope}) {
      const record = returned.get(raw);
      return current() === requestScope && record?.cap === requestScope && record.name === toolName &&
        isDeepStrictEqual(record.args, args) && isDeepStrictEqual(record.raw, raw) ? record.job : null;
    }, now: () => clock
  };
  const host = createJebiseoOriginalHostBinding(readers);
  return {host, state, jobs, calls, parses, hookMutations, options, complete, scopes,
    advance: n => {clock += n;}, now: () => clock,
    async within(callback) {
      const scope = {live: true, cap: Object.freeze({fixtureOnly: true})};
      return request.run(scope, async () => {try {return await callback();} finally {scope.live = false;}});
    }};
}
const run = (f, rt, operation, args = {}) => f.within(() => rt.runStep({operation, args}));
const make = (f, value = task()) => f.within(() => f.host.createRuntime(value));
const typeArgs = () => ({field_id: field, request_id: '2'.repeat(32), text: prompt, submit: false});
async function discovered(f, rt) {
  await run(f, rt, 'FORM_SNAPSHOT');
  const result = await run(f, rt, 'DISCOVER_INPUT');
  assert.equal(result.toolInvoked, true); assert.equal(result.status, 'RETURNED');
  return result;
}

test('actual fixed route uses original schema once and never adds a second journal dispatch', async () => {
  const f = fixture(), rt = await make(f);
  const opened = await f.within(() => rt.start());
  assert.equal(opened.toolInvoked, true); assert.equal(opened.readbackRequired, true);
  assert.equal(opened.geminiPageVerified, false); assert.equal(opened.fullReplyVerified, false);
  assert.deepEqual(f.calls[0].args, {url: JEBISEO_GEMINI_WEB_URL, command_id: commandId});
  assert.deepEqual(f.parses, ['life_web_navigate']); assert.deepEqual(f.hookMutations, []);
  await run(f, rt, 'FORM_SNAPSHOT');
  const next = await run(f, rt, 'DISCOVER_INPUT');
  assert.equal(next.status, 'RETURNED'); assert.equal(next.toolInvoked, true);
  assert.equal(rt.capabilities().productionRegistered, false);
  assert.equal(rt.capabilities().liveExecutionVerified, false);
});

test('task facade survives later authenticated requests without resetting pending or permitting a new taskRef', async () => {
  const f = fixture(), rt = await make(f);
  f.options.beforeReturn = ({job, raw}) => {
    if (job.type !== 'open_url') return raw;
    job.result.rightAddressConfirmed = false;
    job.result.ok = false;
    job.stage26CompletionDigest56 = hash('fixture failed original completion');
    return reply({...safeView(job), jobId: job.id});
  };
  await f.within(() => rt.start());
  assert.equal(await make(f), rt);
  assert.equal((await run(f, rt, 'OPEN')).code, 'JEBISEO_PRIOR_EFFECT_READBACK_REQUIRED');
  await assert.rejects(() => make(f, task({taskRef: 'replacement-task'})), /ORIGINAL_TASK_BINDING_REQUIRED/);
  assert.equal((await rt.start()).code, 'JEBISEO_AUTHENTICATED_REQUEST_REQUIRED');
  assert.equal(f.calls.length, 1);
});

test('closed request, hidden scope, open-only intent and changed original session cannot dispatch', async () => {
  const hidden = fixture(), internal = await make(hidden, task({visibility: 'INTERNAL'}));
  assert.equal((await hidden.within(() => internal.start())).code, 'HIDDEN_EXECUTION_UNAVAILABLE');
  assert.equal(hidden.calls.length, 0);
  const f = fixture(), rt = await make(f, task({intent: 'open'}));
  assert.equal((await run(f, rt, 'TYPE', typeArgs())).code, 'JEBISEO_OPEN_ONLY_TASK');
  assert.equal((await f.within(() => rt.runStep({task: task(), operation: 'OPEN'}))).code, 'JEBISEO_BOUND_TASK_ONLY');
  f.state.secureSessionId = 'rotated-session';
  assert.equal((await f.within(() => rt.start())).toolInvoked, false);
  assert.equal(f.calls.length, 0);
});

test('actual session digest, bridge version, focus and original live hooks are required before OPEN', async () => {
  for (const mutate of [f => {f.state.sessionDeviceDigest = '0'.repeat(64);},
    f => {f.state.secureBridgeVersion = 55;}]) {
    const f = fixture(); mutate(f);
    await assert.rejects(() => make(f), /ORIGINAL_PHONE_BINDING_REQUIRED/);
    assert.equal(f.calls.length, 0);
  }
  for (const mutate of [f => {f.state.focus.active = false;},
    f => {f.state.durableHooks.uncertainEffectsForMaintenance = () => null;}]) {
    const f = fixture(), rt = await make(f); mutate(f);
    assert.equal((await f.within(() => rt.start())).toolInvoked, false);
    assert.equal(f.calls.length, 0);
  }
});

test('snapshot command provenance, Stage26 marker and current provider address are independently required', async () => {
  for (const mutate of [f => {f.options.captureSnapshot = false;},
    f => {f.options.marker = false;}, f => {f.options.toolbar = false;}]) {
    const f = fixture(), rt = await make(f); mutate(f);
    await run(f, rt, 'FORM_SNAPSHOT');
    const outcome = await run(f, rt, 'DISCOVER_INPUT');
    assert.equal(outcome.toolInvoked, false);
    assert.equal(f.calls.length, 1);
  }
});

test('DISCOVER requires a later independent snapshot and preserves canonical f ID and exact carrier', async () => {
  const f = fixture(), rt = await make(f);
  await discovered(f, rt);
  assert.equal((await run(f, rt, 'TYPE', typeArgs())).code, 'JEBISEO_PRIOR_EFFECT_READBACK_REQUIRED');
  // The next job starts in the SAME server millisecond as discovery completed.
  // A different original job plus private invocation order must permit this.
  await run(f, rt, 'FORM_SNAPSHOT');
  const typed = await run(f, rt, 'TYPE', typeArgs());
  assert.equal(typed.status, 'RETURNED'); assert.equal(typed.toolInvoked, true);
  const original = f.calls.at(-1).args;
  assert.deepEqual(original, {...carrier('form15_type', field, '', prompt), command_id: commandId});
  assert.equal(Object.hasOwn(original, 'request_id'), false);
  assert.equal(Object.hasOwn(original, 'context_id'), false);
  assert.equal(typed.fullReplyVerified, false);
  await run(f, rt, 'FORM_SNAPSHOT');
  const after = await run(f, rt, 'DISMISS_NOTICE', {field_id: notice});
  assert.equal(after.code, 'JEBISEO_PRIOR_EFFECT_READBACK_REQUIRED');
  assert.equal(after.pendingOperation, 'TYPE');
});

test('queued discovery receipt refresh keeps original identity and completes only after an independent snapshot', async () => {
  const f = fixture(), rt = await make(f); f.options.queueDiscover = true;
  await run(f, rt, 'FORM_SNAPSHOT');
  const pending = await run(f, rt, 'DISCOVER_INPUT');
  assert.equal(pending.status, 'PENDING');
  const original = [...f.jobs.values()].at(-1);
  f.complete(original);
  await run(f, rt, 'JOB_STATUS', {job_id: original.id});
  await run(f, rt, 'FORM_SNAPSHOT');
  assert.equal((await run(f, rt, 'TYPE', typeArgs())).status, 'RETURNED');
});

test('original pending reply racing accepted completion retains its exact original job correlation', async () => {
  const f = fixture(), rt = await make(f); f.options.queueDiscover = true;
  f.options.beforeReturn = ({job, raw}) => {
    if (job.status === 'queued') f.complete(job);
    return raw; // original pending envelope remains byte-identical
  };
  await run(f, rt, 'FORM_SNAPSHOT');
  assert.equal((await run(f, rt, 'DISCOVER_INPUT')).status, 'PENDING');
  await run(f, rt, 'FORM_SNAPSHOT');
  assert.equal((await run(f, rt, 'TYPE', typeArgs())).status, 'RETURNED');
});

test('complete result mismatch and later original object/marker changes cannot be laundered through JOB_STATUS', async () => {
  for (const change of [job => {job.stage26CompletionDigest56 = 'f'.repeat(64);},
    job => {job.result.url = job.result.url.replace('Ask Gemini', 'Different editor');}]) {
    const f = fixture(), rt = await make(f);
    await discovered(f, rt);
    const original = [...f.jobs.values()].at(-1); change(original);
    await run(f, rt, 'JOB_STATUS', {job_id: original.id});
    await run(f, rt, 'FORM_SNAPSHOT');
    assert.equal((await run(f, rt, 'TYPE', typeArgs())).code, 'JEBISEO_PRIOR_EFFECT_READBACK_REQUIRED');
  }
  const f = fixture(), rt = await make(f);
  f.options.beforeReturn = ({job, raw}) => {
    if (job.type === 'agent_snapshot') job.result.url = '[]';
    return raw; // typed complete response no longer agrees with the real job
  };
  await run(f, rt, 'FORM_SNAPSHOT');
  assert.equal((await run(f, rt, 'DISCOVER_INPUT')).toolInvoked, false);
});

test('expired/changed native evidence is checked again after the original schema and before the handler', async () => {
  for (const mutation of [f => f.advance(46000), f => {
    const job = [...f.jobs.values()][0]; job.result.url = '[]';
  }]) {
    const f = fixture(), rt = await make(f);
    await run(f, rt, 'FORM_SNAPSHOT');
    f.options.beforeParse = name => {if (name === 'life_android_step') mutation(f);};
    const result = await run(f, rt, 'DISCOVER_INPUT');
    assert.equal(result.code, 'JEBISEO_NATIVE_TARGET_CHANGED_BEFORE_DISPATCH');
    assert.equal(f.calls.length, 1);
  }
});

test('argument snapshots and private per-task step scope prevent mutation, concurrency and nested re-entry', async () => {
  const f = fixture(), mutable = {...task()}, rt = await make(f, mutable);
  mutable.commandId = '9'.repeat(32);
  let release; f.options.hold = new Promise(resolve => {release = resolve;});
  const first = f.within(() => rt.start());
  await Promise.resolve(); await Promise.resolve();
  const second = await run(f, rt, 'OPEN');
  assert.equal(second.code, 'JEBISEO_ORIGINAL_STEP_ALREADY_RUNNING');
  release(); await first;
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].args.command_id, commandId);
  assert.equal(unwrapJebiseoMobileReply((await run(f, rt, 'JOB_STATUS', {job_id: 'job_1'})).raw).idDigest, hash('job_1'));
});

test('a current command change allows only original read-only receipt recovery and never rebinds effects', async () => {
  const f = fixture(), rt = await make(f);
  await f.within(() => rt.start());
  f.state.commandId = '9'.repeat(32);
  const status = await run(f, rt, 'JOB_STATUS', {job_id: 'job_1'});
  assert.equal(status.toolInvoked, true);
  assert.equal(f.calls.at(-1).args.command_id, commandId);
  assert.equal((await run(f, rt, 'OPEN')).toolInvoked, false);
  assert.equal(f.calls.filter(call => call.name === 'life_web_navigate').length, 1);
});

function assertPostDiagnostic(result, operation, code, completionReceived, observationValidated) {
  assert.equal(result.code, 'JEBISEO_PRIOR_EFFECT_READBACK_REQUIRED');
  assert.equal(result.pendingOperation, operation);
  assert.equal(result.toolInvoked, false);
  assert.equal(result.readbackRequired, true);
  const observed = result.postActionObservation;
  assert.equal(observed.code, code);
  assert.equal(observed.completionReceived, completionReceived);
  assert.equal(observed.observationValidated, observationValidated);
  assert.equal(observed.readbackRequired, true);
  for (const key of ['ok', 'authorityVerified', 'currentValueVerified', 'noticeDismissedVerified'])
    assert.equal(observed[key], false, key);
  return observed;
}

test('post TYPE diagnostics report a filled field without settling the original pending effect', async () => {
  const f = fixture(), rt = await make(f);
  await discovered(f, rt);
  await run(f, rt, 'FORM_SNAPSHOT');
  const typed = await run(f, rt, 'TYPE', typeArgs());
  assert.equal(typed.status, 'RETURNED');
  const original = [...f.jobs.values()].at(-1);
  assert.equal(JSON.parse(original.result.url).valueVerified, true);
  f.options.snapshotPage = () => ({...page(), revision: 'f'.repeat(64),
    fields: [{...editor(), filled: true}]});
  await run(f, rt, 'FORM_SNAPSHOT');
  const before = f.calls.length;
  const first = await run(f, rt, 'TYPE', typeArgs());
  const observed = assertPostDiagnostic(first, 'TYPE', 'NATIVE_POST_TYPE_VALUE_UNVERIFIED', true, true);
  assert.equal(observed.facts.targetFieldFilled, true);
  assert.equal(observed.facts.formRevisionChanged, true);
  assert.equal(observed.facts.visibleScopeOnly, true);
  assert.ok(Object.values(observed.facts).every(value => typeof value === 'boolean'));
  const serialized = JSON.stringify(observed);
  for (const privateValue of [original.id, deviceId, commandId, f.state.secureSessionId,
    field, issuer, prompt, hash(prompt), 'gemini.google.com'])
    assert.equal(serialized.includes(privateValue), false, privateValue);
  assert.equal(await make(f), rt);
  const again = await run(f, rt, 'TYPE', typeArgs());
  assertPostDiagnostic(again, 'TYPE', 'NATIVE_POST_TYPE_VALUE_UNVERIFIED', true, true);
  assert.equal(again.effectKey, first.effectKey);
  assert.equal(f.calls.length, before);
  assert.deepEqual(f.hookMutations, []);
});

test('post DISMISS diagnostics keep absent visible controls separate from verified notice dismissal', async () => {
  const f = fixture(), rt = await make(f);
  await run(f, rt, 'FORM_SNAPSHOT');
  const dismissed = await run(f, rt, 'DISMISS_NOTICE', {field_id: notice});
  assert.equal(dismissed.status, 'RETURNED');
  f.options.snapshotPage = () => ({...page(), revision: 'f'.repeat(64), buttons: []});
  await run(f, rt, 'FORM_SNAPSHOT');
  const before = f.calls.length;
  const result = await run(f, rt, 'OPEN');
  const observed = assertPostDiagnostic(result, 'DISMISS_NOTICE',
    'NATIVE_POST_NOTICE_STATE_UNVERIFIED', true, true);
  assert.equal(observed.facts.noticeTargetVisible, false);
  assert.equal(observed.facts.noticeExplicitLabelVisible, false);
  assert.equal(observed.facts.visibleScopeOnly, true);
  assert.equal((await run(f, rt, 'DISMISS_NOTICE', {field_id: notice})).effectKey, result.effectKey);
  assert.equal(f.calls.length, before);
  assert.deepEqual(f.hookMutations, []);
});

test('post diagnostics wait for the original completion and reject a snapshot made before that completion', async () => {
  const f = fixture(), rt = await make(f);
  await discovered(f, rt);
  await run(f, rt, 'FORM_SNAPSHOT');
  f.options.queueType = true;
  assert.equal((await run(f, rt, 'TYPE', typeArgs())).status, 'PENDING');
  const original = [...f.jobs.values()].at(-1);
  await run(f, rt, 'FORM_SNAPSHOT');
  const before = f.calls.length;
  assertPostDiagnostic(await run(f, rt, 'TYPE', typeArgs()), 'TYPE',
    'JEBISEO_ORIGINAL_EFFECT_COMPLETION_REQUIRED', false, false);
  assert.equal(f.calls.length, before);
  f.complete(original);
  await run(f, rt, 'JOB_STATUS', {job_id: original.id});
  assertPostDiagnostic(await run(f, rt, 'TYPE', typeArgs()), 'TYPE',
    'JEBISEO_ORIGINAL_POST_ACTION_SNAPSHOT_REQUIRED', true, false);
  // A status read must not promote the earlier snapshot's private invocation.
  assert.equal(f.calls.length, before + 1);
  await run(f, rt, 'FORM_SNAPSHOT');
  assertPostDiagnostic(await run(f, rt, 'TYPE', typeArgs()), 'TYPE',
    'NATIVE_POST_TYPE_VALUE_UNVERIFIED', true, true);
  assert.equal(f.calls.length, before + 2);
  assert.deepEqual(f.hookMutations, []);
});

test('post diagnostics retain original job, marker, snapshot scope and current owner checks', async () => {
  const cases = [
    {change(f, original) {original.stage26CompletionDigest56 = '0'.repeat(64);},
      code: 'JEBISEO_ORIGINAL_EFFECT_COMPLETION_REQUIRED', completion: false},
    {change(f, original) {f.jobs.set(original.id, {...original});},
      code: 'JEBISEO_ORIGINAL_EFFECT_COMPLETION_REQUIRED', completion: false},
    {change(f, original, after) {after.stage26CompletionDigest56 = '0'.repeat(64);},
      code: 'JEBISEO_ORIGINAL_POST_ACTION_SNAPSHOT_REQUIRED', completion: true},
    {change(f, original, after) {f.scopes.set(after, Object.freeze({...f.scopes.get(after)}));},
      code: 'JEBISEO_ORIGINAL_POST_ACTION_SNAPSHOT_REQUIRED', completion: true},
    {change(f) {f.state.secureSessionId = 'rotated-post-action-session';}, code: null},
    {change(f) {
      let reads = 0;
      f.options.beforeState = () => {
        if (++reads === 2) f.state.secureSessionId = 'rotated-during-diagnostic';
      };
    }, code: 'JEBISEO_POST_ACTION_OBSERVATION_UNAVAILABLE', completion: false}
  ];
  for (const example of cases) {
    const f = fixture(), rt = await make(f);
    await discovered(f, rt);
    await run(f, rt, 'FORM_SNAPSHOT');
    assert.equal((await run(f, rt, 'TYPE', typeArgs())).status, 'RETURNED');
    const original = [...f.jobs.values()].at(-1);
    await run(f, rt, 'FORM_SNAPSHOT');
    const after = [...f.jobs.values()].at(-1);
    example.change(f, original, after);
    const before = f.calls.length;
    const result = await run(f, rt, 'TYPE', typeArgs());
    if (example.code) {
      const observed = assertPostDiagnostic(result, 'TYPE', example.code, example.completion, false);
      assert.equal(Object.hasOwn(observed, 'facts'), false);
    } else {
      assert.equal(result.toolInvoked, false);
      assert.equal(Object.hasOwn(result, 'postActionObservation'), false);
    }
    assert.equal(f.calls.length, before);
    assert.deepEqual(f.hookMutations, []);
  }
});
