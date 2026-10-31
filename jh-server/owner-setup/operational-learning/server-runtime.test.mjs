import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServerLearning } from './server-runtime.mjs';
import { FileLearningStore } from './store.mjs';
import { createState, ingest, propose, addLesson, evaluateLesson, setProposalStatus } from './engine.mjs';

const CONTEXT = { platform: 'server', version: 'fixture-v1', environment: 'synthetic-test' };
const DIGEST = 'a'.repeat(64);
const NOW = '2026-10-31T18:00:00.000Z';

async function setup(t, ownerScope = 'fixture-owner') {
  const dir = await mkdtemp(path.join(tmpdir(), 'jh-server-learning-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'learning.json');
  const options = { file, ownerScope, runtimeId: 'fixture-runtime', context: CONTEXT, clock: () => NOW };
  const runtime = await createServerLearning(options);
  t.after(() => runtime.close());
  const store = new FileLearningStore({ file, ownerScope });
  return { dir, file, options, runtime, store };
}
function response() {
  return { content: [{ type: 'text', text: '{"ok":true,"signed":"UNCHANGED"}' }],
    structuredContent: { ok: true, signed: 'UNCHANGED' } };
}
function call(id, extra = {}) {
  return { name: 'life_android_action', commandId: 'private-command-' + id,
    requestId: 'private-request-' + id, ...extra };
}
function job(id, extra = {}) {
  return { id: 'private-job-' + id, type: 'ANDROID_ACTION', commandId: 'private-command-' + id,
    status: 'queued', ...extra };
}
function notice(value) {
  return value.content.slice(1).map(item => JSON.parse(item.text)).find(item => item.type === 'jh_operational_learning');
}
function event(id, extra = {}) {
  return { eventId: 'fixture-' + id, taskId: 'fixture-task-' + id, attemptId: 'fixture-attempt-' + id,
    sequence: 1, timestamp: NOW, domain: 'connection', operation: 'life_status', engine: 'jh-server',
    context: CONTEXT, outcome: 'failure_verified', source: 'host_verified',
    evidenceRefs: ['fixture:' + id], errorCode: 'FIXTURE_FAILURE', ...extra };
}

test('ordinary tool success is observed once without changing its return or exposing raw identity', async t => {
  const { runtime, store, file } = await setup(t);
  const original = response();
  let executions = 0;
  const result = await runtime.invoke(call('normal'), () => { executions++; return original; });
  assert.strictEqual(result, original);
  assert.equal(executions, 1);
  const state = await store.read();
  assert.equal(Object.keys(state.events).length, 1);
  assert.equal(Object.values(state.attempts)[0].outcome, 'observed');
  assert.equal(Object.keys(state.proposals).length, 0);
  const bytes = await readFile(file, 'utf8');
  assert.doesNotMatch(bytes, /private-command|private-request|UNCHANGED/);
  const status = await runtime.status();
  assert.equal(status.degraded, false);
  assert.equal(status.attemptOutcomes.observed, 1);
  assert.equal(status.librarySync, 'not_connected');
});

test('two controllers for the same configured owner preserve concurrent observations', async t => {
  const { runtime, options, store } = await setup(t);
  const other = await createServerLearning(options);
  t.after(() => other.close());
  await Promise.all([
    runtime.invoke(call('a'), () => response()),
    other.invoke(call('b'), () => response()),
  ]);
  assert.equal(Object.keys((await store.read()).attempts).length, 2);
  assert.equal((await runtime.status()).counts.events, 2);
  assert.equal((await other.status()).counts.events, 2);
});

test('different owners use different stores; a mismatched owner cannot read or overwrite one', async t => {
  const { runtime, options, file } = await setup(t);
  await runtime.invoke(call('owner-a'), () => response());
  const before = await readFile(file, 'utf8');
  const wrong = await createServerLearning({ ...options, ownerScope: 'another-owner' });
  t.after(() => wrong.close());
  let calls = 0;
  const original = response();
  assert.strictEqual(await wrong.invoke(call('wrong-owner'), () => { calls++; return original; }), original);
  assert.equal(calls, 1);
  assert.equal((await wrong.status()).degraded, true);
  assert.equal((await wrong.status()).stateAvailable, false);
  assert.equal(await readFile(file, 'utf8'), before);
  const separate = await createServerLearning({ ...options, file: path.join(path.dirname(file), 'other.json'),
    ownerScope: 'another-owner' });
  t.after(() => separate.close());
  assert.equal((await separate.status()).counts.events, 0);
  await separate.invoke(call('owner-b'), () => response());
  assert.equal((await runtime.status()).counts.events, 1);
  assert.equal((await separate.status()).counts.events, 1);
});

test('synchronous job creation and late completion after restart retain the original operation and task', async t => {
  const { runtime, options, store, file } = await setup(t);
  let executions = 0;
  await runtime.invoke(call('late'), () => {
    executions++;
    assert.equal(runtime.jobCreated(job('late')), undefined);
    return response();
  });
  let state = await store.read();
  assert.equal(Object.keys(state.attempts).length, 1);
  const before = Object.values(state.attempts)[0];
  assert.equal(before.operation, 'life_android_action');
  assert.equal(before.outcome, 'pending');
  await runtime.close();
  const restarted = await createServerLearning(options);
  t.after(() => restarted.close());
  restarted.jobCompleted(job('late', { status: 'complete', evidenceDigest: DIGEST }));
  assert.equal((await restarted.status()).attemptOutcomes.observed, 1);
  restarted.jobCompleted(job('late', { status: 'complete', verifiedOutcome: 'success_verified', evidenceDigest: DIGEST }));
  await restarted.status();
  state = await store.read();
  const after = Object.values(state.attempts)[0];
  assert.equal(Object.keys(state.attempts).length, 1);
  assert.equal(after.taskId, before.taskId);
  assert.equal(after.operation, before.operation);
  assert.equal(after.outcome, 'success_verified');
  assert.equal(after.sequence, 3);
  assert.equal(executions, 1);
  assert.doesNotMatch(await readFile(file, 'utf8'), /private-job|private-command/);
});

test('pending polls, repeated completion, and receipt calls do not add attempts or events', async t => {
  const { runtime, store } = await setup(t);
  await runtime.invoke(call('poll'), () => { runtime.jobCreated(job('poll')); return response(); });
  for (let n = 0; n < 5; n++) runtime.jobCreated(job('poll', { status: n % 2 ? 'queued' : 'in_progress' }));
  await runtime.status();
  const before = await store.read();
  for (const name of ['life_job_status', 'job_status', 'life_android_pending_approval_receipt_status',
    'life_android_action_approval_status', 'life_android_screen_consent_status']) {
    await runtime.invoke(call('poll-' + name, { name }), () => response());
  }
  await runtime.invoke(call('mode-status', { name: 'life_android_split_screen_assistant', mode: 'STATUS' }), () => response());
  assert.deepEqual(await store.read(), before);
  runtime.jobCompleted(job('poll', { status: 'complete', verifiedOutcome: 'success_verified', evidenceDigest: DIGEST }));
  await runtime.status();
  const completed = await store.read();
  for (let n = 0; n < 5; n++) runtime.jobCompleted(job('poll', {
    status: 'complete', verifiedOutcome: 'success_verified', evidenceDigest: DIGEST }));
  runtime.jobCreated(job('poll'));
  await runtime.status();
  assert.deepEqual(await store.read(), completed);
  await runtime.invoke(call('actual-read', { name: 'life_android_split_screen_assistant', mode: 'READ' }), () => response());
  assert.equal(Object.keys((await store.read()).attempts).length, 2);
});

test('unscoped calls share one task and cannot inflate independent failure proposals', async t => {
  const { runtime, store } = await setup(t);
  for (let n = 0; n < 3; n++) {
    await runtime.invoke(call('unscoped-' + n, { commandId: undefined }), () => {
      runtime.jobCreated(job('unscoped-' + n, { commandId: undefined }));
      runtime.jobCompleted(job('unscoped-' + n, { commandId: undefined, status: 'error',
        verifiedOutcome: 'failure_verified', evidenceDigest: DIGEST }));
      return response();
    });
  }
  const state = await store.read();
  assert.equal(new Set(Object.values(state.attempts).map(item => item.taskId)).size, 1);
  assert.equal(Object.values(state.proposals).filter(item => item.kind === 'rule_fix').length, 0);
});

test('exceptions preserve the original thrown value, mark uncertainty, and never replay work', async t => {
  const { runtime, store, file } = await setup(t);
  const original = Object.assign(new Error('PRIVATE_TOKEN_AND_URL_QUERY'), { code: 'PRIVATE_TOKEN_AND_URL_QUERY' });
  let executions = 0;
  await assert.rejects(runtime.invoke(call('throw'), () => {
    executions++;
    runtime.jobCreated(job('throw'));
    throw original;
  }), error => error === original);
  assert.equal(executions, 1);
  const attempt = Object.values((await store.read()).attempts)[0];
  assert.equal(attempt.outcome, 'completion_unknown');
  assert.equal(attempt.errorCode, 'HANDLER_EXCEPTION');
  assert.doesNotMatch(await readFile(file, 'utf8'), /PRIVATE_TOKEN|URL_QUERY/);
  runtime.jobCompleted(job('throw', { status: 'complete', verifiedOutcome: 'success_verified', evidenceDigest: DIGEST }));
  await runtime.status();
  assert.equal(Object.values((await store.read()).attempts)[0].outcome, 'success_verified');
  assert.equal(executions, 1);
});

test('corrupt storage preserves its bytes and does not replace handler returns or exceptions', async t => {
  const { runtime, options, file } = await setup(t);
  await runtime.close();
  await writeFile(file, '{not-json:PRIVATE_EXISTING_DATA');
  const corrupt = await createServerLearning(options);
  t.after(() => corrupt.close());
  const original = response();
  let executions = 0;
  assert.strictEqual(await corrupt.invoke(call('corrupt'), () => { executions++; return original; }), original);
  const thrown = new Error('ORIGINAL');
  await assert.rejects(corrupt.invoke(call('corrupt-throw'), () => { executions++; throw thrown; }), error => error === thrown);
  assert.equal(executions, 2);
  assert.equal(await readFile(file, 'utf8'), '{not-json:PRIVATE_EXISTING_DATA');
  const status = await corrupt.status();
  assert.equal(status.degraded, true);
  assert.equal(status.stateAvailable, false);
  assert.ok(status.diagnostics.codes.includes('LEARNING_STORE_CORRUPT'));
  assert.doesNotMatch(JSON.stringify(status), /PRIVATE_EXISTING_DATA|ORIGINAL/);
});

test('an exhausted event store reports degraded without changing the store or replaying the handler', async t => {
  const { runtime, file, options } = await setup(t);
  await runtime.close();
  const full = createState();
  for (let n = 0; n < 10000; n++) full.events['fixture-' + n] = event('capacity-' + n);
  const bytes = JSON.stringify({ schema: 'jh.operational-learning.store.v1', ownerScope: options.ownerScope, state: full });
  await writeFile(file, bytes);
  const exhausted = await createServerLearning(options);
  t.after(() => exhausted.close());
  let executions = 0;
  const original = response();
  assert.strictEqual(await exhausted.invoke(call('capacity'), () => { executions++; return original; }), original);
  assert.equal(executions, 1);
  assert.equal(await readFile(file, 'utf8'), bytes);
  assert.equal((await exhausted.status()).degraded, true);
});

test('matching verified lessons are offered separately while signed content and structuredContent stay intact', async t => {
  const { runtime, store } = await setup(t);
  const lesson = { id: 'fixture-lesson', domain: 'connection', operation: 'life_status', engine: 'jh-server',
    context: CONTEXT, guidance: 'Use the existing verified receipt before another action.',
    evidenceRefs: ['fixture:validated-guidance'], ruleVersion: '1', inputFingerprint: DIGEST };
  await store.transact(state => evaluateLesson(addLesson(state, lesson), lesson.id, {
    ruleVersion: '1', inputFingerprint: DIGEST, passed: 1, failed: 0, skipped: 0,
    evidenceRefs: ['fixture:passing-contract'], timestamp: NOW }));
  const original = response();
  const result = await runtime.invoke(call('advice', { name: 'life_status' }), () => original);
  assert.strictEqual(result.content[0], original.content[0]);
  assert.strictEqual(result.structuredContent, original.structuredContent);
  assert.equal(original.content.length, 1);
  assert.equal(notice(result).delivery, 'offered');
  assert.equal(notice(result).lessons[0].id, lesson.id);
  const second = response();
  assert.strictEqual(await runtime.invoke(call('advice', { name: 'life_status', requestId: 'another-request-in-same-task' }), () => second), second);
  const nextTask = await runtime.invoke(call('new-task', { name: 'life_status' }), () => response());
  assert.equal(notice(nextTask).lessons[0].id, lesson.id);
});

test('persisted open proposals remain available after restart and are offered once per task with stable IDs', async t => {
  const { runtime, store, options } = await setup(t);
  await store.transact(state => {
    state = ingest(state, event('proposal-a')).state;
    state = ingest(state, event('proposal-b')).state;
    return propose(state, { now: NOW });
  });
  const first = await runtime.invoke(call('proposal', { name: 'life_status' }), () => response());
  const proposalId = notice(first).proposals[0].id;
  const second = response();
  assert.strictEqual(await runtime.invoke(call('proposal', { name: 'life_status', requestId: 'new-request-same-task' }), () => second), second);
  const nextTask = await runtime.invoke(call('proposal-other-task', { name: 'life_status' }), () => response());
  assert.equal(notice(nextTask).proposals[0].id, proposalId);
  assert.equal((await runtime.status()).availableAdvice.proposals, 1);
  await runtime.close();
  const restarted = await createServerLearning(options);
  t.after(() => restarted.close());
  const after = await restarted.invoke(call('proposal-restart', { name: 'life_status' }), () => response());
  assert.equal(notice(after).proposals[0].id, proposalId);
  assert.equal(notice(after).delivery, 'offered');
  await store.transact(state => setProposalStatus(state, proposalId, 'dismissed'));
  assert.equal((await restarted.status()).availableAdvice.proposals, 0);
});

test('pending completion alone never activates a lesson or produces an automation proposal', async t => {
  const { runtime, store } = await setup(t);
  for (let n = 0; n < 4; n++) await runtime.invoke(call('normal-' + n), () => {
    runtime.jobCreated(job('normal-' + n));
    runtime.jobCompleted(job('normal-' + n, { status: 'complete', evidenceDigest: DIGEST }));
    return response();
  });
  const state = await store.read();
  assert.deepEqual(new Set(Object.values(state.attempts).map(item => item.outcome)), new Set(['observed']));
  assert.equal(Object.keys(state.lessons).length, 0);
  assert.equal(Object.keys(state.proposals).length, 0);
});

test('known pre-dispatch rejections produce scoped fixes, while unknown tool errors remain uncertain and masked', async t => {
  const { runtime, store, file } = await setup(t);
  for (const id of ['rejected-a', 'rejected-b']) {
    const original = { content: [{ type: 'text', text: JSON.stringify({ ok: false,
      code: 'active_trusted_secure56_device_required', privateDetails: 'PRIVATE_REJECTION_BODY' }) }] };
    const result = await runtime.invoke(call(id, { name: 'life_android_workflow_link', mode: 'BEGIN_COMMAND' }), () => original);
    assert.strictEqual(result.content[0], original.content[0]);
  }
  let state = await store.read();
  assert.equal(Object.values(state.attempts).filter(item => item.outcome === 'blocked').length, 2);
  const proposal = Object.values(state.proposals).find(item => item.kind === 'rule_fix');
  assert.ok(proposal);
  assert.equal(proposal.independentTaskCount, 2);
  const failed = { isError: true, content: [{ type: 'text', text: JSON.stringify({ ok: false,
    code: 'PRIVATE_UNKNOWN_ERROR_TOKEN', body: 'PRIVATE_REJECTION_BODY' }) }] };
  await runtime.invoke(call('uncertain-error'), () => failed);
  state = await store.read();
  assert.equal(Object.values(state.attempts).filter(item => item.outcome === 'completion_unknown').length, 1);
  assert.equal(Object.values(state.attempts).filter(item => item.outcome === 'failure_verified').length, 0);
  assert.doesNotMatch(await readFile(file, 'utf8'), /PRIVATE_REJECTION_BODY|PRIVATE_UNKNOWN_ERROR_TOKEN/);
  assert.ok(Object.values(state.events).every(item => item.evidenceRefs[0]?.startsWith('sha256:')));
});

test('a rejection returned after job creation cannot claim that the dispatched action was blocked', async t => {
  const { runtime, store } = await setup(t);
  await runtime.invoke(call('after-dispatch'), () => {
    runtime.jobCreated(job('after-dispatch'));
    return { content: [{ type: 'text', text: '{"ok":false,"code":"APPROVAL_REQUIRED"}' }] };
  });
  const attempt = Object.values((await store.read()).attempts)[0];
  assert.equal(attempt.outcome, 'completion_unknown');
  assert.equal(Object.keys((await store.read()).attempts).length, 1);
});

test('only the exact trusted BEGIN response binds its observed event to the command used by subsequent calls', async t => {
  const { runtime, store, file } = await setup(t);
  const commandId = '0123456789abcdef0123456789abcdef';
  const begin = { content: [{ type: 'text', text: JSON.stringify({ ok: true, commandId,
    activeTasks: 1, replayAllowed: false, compatibilityMode: null }) }] };
  await runtime.invoke(call('begin', { name: 'life_android_workflow_link', mode: 'BEGIN_COMMAND', commandId: undefined }), () => begin);
  await runtime.invoke(call('next', { commandId }), () => response());
  let attempts = Object.values((await store.read()).attempts);
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].taskId, attempts[1].taskId);
  assert.ok(attempts.every(item => item.outcome === 'observed'));
  await runtime.invoke(call('unrelated', { name: 'life_status', commandId: undefined }), () => begin);
  await runtime.invoke(call('unrelated-2', { name: 'life_status', commandId: undefined }), () => response());
  attempts = Object.values((await store.read()).attempts);
  assert.equal(attempts[2].taskId, attempts[3].taskId);
  assert.notEqual(attempts[2].taskId, attempts[0].taskId);
  assert.doesNotMatch(await readFile(file, 'utf8'), new RegExp(commandId));
});

test('different validated modes use different lesson scopes and receipt modes add no experience', async t => {
  const { runtime, store } = await setup(t);
  const tool = 'life_android_split_screen_assistant';
  await runtime.invoke(call('read', { name: tool, mode: 'READ' }), () => response());
  await runtime.invoke(call('start', { name: tool, mode: 'START' }), () => response());
  await runtime.invoke(call('status', { name: tool, mode: 'STATUS' }), () => response());
  const operations = new Set(Object.values((await store.read()).attempts).map(item => item.operation));
  assert.deepEqual(operations, new Set([tool + '.read', tool + '.start']));
  assert.ok([...operations].every(item => item.length <= 128));
});

test('unscoped requests can receive existing advice again while receipt polling never repeats it', async t => {
  const { runtime, store } = await setup(t);
  await store.transact(state => propose(ingest(ingest(state, event('offer-a')).state, event('offer-b')).state, { now: NOW }));
  const first = await runtime.invoke(call('unscoped-offer-a', { name: 'life_status', commandId: undefined }), () => response());
  const second = await runtime.invoke(call('unscoped-offer-b', { name: 'life_status', commandId: undefined }), () => response());
  assert.equal(notice(first).proposals[0].id, notice(second).proposals[0].id);
  const receipt = response();
  assert.strictEqual(await runtime.invoke(call('receipt-offer', { name: 'life_job_status', commandId: undefined }), () => receipt), receipt);
});

test('a second controller can complete a just-created job before its first write without losing caller scope', async t => {
  const { runtime, options, store } = await setup(t);
  const other = await createServerLearning(options);
  t.after(() => other.close());
  let executions = 0;
  await runtime.invoke(call('cross-controller'), () => {
    executions++;
    runtime.jobCreated(job('cross-controller'));
    other.jobCompleted(job('cross-controller', { status: 'complete', verifiedOutcome: 'success_verified', evidenceDigest: DIGEST }));
    return response();
  });
  await other.status();
  const attempts = Object.values((await store.read()).attempts);
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].operation, 'life_android_action');
  assert.equal(attempts[0].outcome, 'success_verified');
  assert.equal(executions, 1);
});

test('close drains a running handler and flushes its final observation before returning', async t => {
  const { runtime, store } = await setup(t);
  let start;
  let finish;
  const started = new Promise(resolve => { start = resolve; });
  const original = response();
  let executions = 0;
  const running = runtime.invoke(call('shutdown-finish'), () => {
    executions++;
    start();
    return new Promise(resolve => { finish = resolve; });
  });
  await started;
  const closing = runtime.close();
  finish(original);
  assert.strictEqual(await running, original);
  assert.equal((await closing).drained, true);
  assert.equal(executions, 1);
  assert.equal(Object.values((await store.read()).attempts)[0].outcome, 'observed');
  assert.equal((await runtime.status()).queuedWrites, 0);
});

test('close has a bounded drain and records an unfinished handler as unknown without replay', async t => {
  const { runtime, store } = await setup(t);
  let start;
  let finish;
  const started = new Promise(resolve => { start = resolve; });
  let executions = 0;
  const original = response();
  const running = runtime.invoke(call('shutdown-pending'), () => {
    executions++;
    start();
    return new Promise(resolve => { finish = resolve; });
  });
  await started;
  const began = Date.now();
  const result = await runtime.close();
  assert.equal(result.drained, false);
  assert.ok(Date.now() - began < 3500);
  assert.equal(Object.values((await store.read()).attempts)[0].outcome, 'completion_unknown');
  finish(original);
  assert.strictEqual(await running, original);
  assert.equal(executions, 1);
  assert.equal((await runtime.status()).degraded, true);
});

test('a lesson quarantined while the handler runs is not offered from a stale pre-call recall', async t => {
  const { runtime, store } = await setup(t);
  const lesson = { id: 'fixture-late-quarantine', domain: 'connection', operation: 'life_status', engine: 'jh-server',
    context: CONTEXT, guidance: 'Previously validated fixture guidance.',
    evidenceRefs: ['fixture:reviewed'], ruleVersion: '1', inputFingerprint: DIGEST };
  await store.transact(state => evaluateLesson(addLesson(state, lesson), lesson.id, {
    ruleVersion: '1', inputFingerprint: DIGEST, passed: 1, failed: 0, skipped: 0,
    evidenceRefs: ['fixture:initial-pass'], timestamp: NOW }));
  const original = response();
  const result = await runtime.invoke(call('late-quarantine', { name: 'life_status' }), async () => {
    await store.transact(state => evaluateLesson(state, lesson.id, {
      ruleVersion: '1', inputFingerprint: DIGEST, passed: 0, failed: 1, skipped: 0,
      evidenceRefs: ['fixture:later-failure'], timestamp: '2026-10-31T18:01:00.000Z' }));
    return original;
  });
  assert.strictEqual(result, original);
  assert.equal((await runtime.status()).availableAdvice.lessons, 0);
});
