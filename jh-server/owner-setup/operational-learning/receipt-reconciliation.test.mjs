import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createServerLearning } from './server-runtime.mjs';
import { FileLearningStore } from './store.mjs';
import { ingest, propose } from './engine.mjs';

// Synthetic host callbacks and private temporary stores only. No device, job
// queue, real receipt, live proposal or user decision is created by this suite.
const NOW = '2026-11-01T05:00:00.000Z';
const CONTEXT = { platform: 'server', version: 'fixture-v1', environment: 'receipt-reconciliation-test' };
const DIGEST = 'a'.repeat(64);
const OTHER_DIGEST = 'b'.repeat(64);

async function setup(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'jh-receipt-reconciliation-'));
  const file = path.join(directory, 'memory.json');
  const ownerScope = 'synthetic-reconciliation-owner';
  const options = { file, ownerScope, runtimeId: 'synthetic-reconciliation-runtime', context: CONTEXT, clock: () => NOW };
  const controllers = [];
  const controller = async (overrides = {}) => {
    const runtime = await createServerLearning({ ...options, ...overrides });
    controllers.push(runtime);
    return runtime;
  };
  t.after(async () => {
    for (const runtime of controllers) await runtime.close();
    await rm(directory, { recursive: true, force: true });
  });
  return { file, runtime: await controller(), controller, store: new FileLearningStore({ file, ownerScope }) };
}

function call(id, extra = {}) {
  return { name: 'life_android_action', mode: 'SCROLL_ONCE', commandId: 'private-command-' + id,
    requestId: 'private-request-' + id, ...extra };
}

function job(id, extra = {}) {
  return { id: 'private-job-' + id, type: 'ANDROID_ACTION', commandId: 'private-command-' + id,
    status: 'queued', ...extra };
}

function receipt(id, extra = {}) {
  return job(id, { status: 'complete', verifiedOutcome: 'success_verified', evidenceDigest: DIGEST, ...extra });
}

function response(value = { ok: true, signed: 'PRIVATE_UNMODIFIED_RESULT' }) {
  return { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value };
}

async function seedJob(runtime, id, outcome = 'completion_unknown') {
  let executions = 0;
  const original = response();
  const result = await runtime.invoke(call(id), () => {
    executions++;
    runtime.jobCreated(job(id));
    if (outcome === 'completion_unknown') runtime.jobCompleted(job(id, { status: 'expired', code: 'JOB_EXPIRED' }));
    if (outcome === 'observed') runtime.jobCompleted(job(id, { status: 'complete' }));
    return original;
  });
  assert.equal(executions, 1);
  assert.strictEqual(result.content[0], original.content[0]);
  assert.strictEqual(result.structuredContent, original.structuredContent);
  return { original, executions };
}

const soleAttempt = state => {
  assert.equal(Object.keys(state.attempts).length, 1);
  return Object.values(state.attempts)[0];
};

const soleGap = state => {
  const gaps = Object.values(state.proposals).filter(item => item.kind === 'verification_gap');
  assert.equal(gaps.length, 1);
  return gaps[0];
};

async function acceptGap(runtime, proposalId) {
  const { packet } = await runtime.review('PREPARE', { proposalId });
  return runtime.review('DECIDE', { proposalId, decisionId: 'synthetic-receipt-improvement', decision: 'accept',
    expectedRevision: packet.baseRevision, packetFingerprint: packet.packetFingerprint, maxAttempts: packet.maxAttempts,
    reviewer: 'agent', sourceRef: 'source:synthetic-receipt-priority-review',
    reason: 'Keep this synthetic receipt improvement in the selected work list.',
    eventIds: packet.attempts.map(item => item.eventId) });
}

test('existing verified receipt corrects an unknown original attempt and resolves only its open verification gap', async t => {
  const { runtime, store, file } = await setup(t);
  await seedJob(runtime, 'late');
  const before = await store.read();
  const original = soleAttempt(before);
  assert.equal(original.outcome, 'completion_unknown');
  assert.equal(soleGap(before).status, 'open');
  assert.equal(runtime.receiptObserved(receipt('late', {
    result: { privateScreen: 'PRIVATE_SCREEN_CONTENT' }, commandText: 'PRIVATE_COMMAND_TEXT',
  })), undefined);
  const status = await runtime.status();
  const after = await store.read();
  const corrected = soleAttempt(after);
  assert.equal(corrected.taskId, original.taskId);
  assert.equal(corrected.attemptId, original.attemptId);
  assert.equal(corrected.operation, 'life_android_action.scroll_once');
  for (const key of ['domain', 'engine', 'context']) assert.deepEqual(corrected[key], original[key]);
  assert.equal(corrected.sequence, original.sequence + 1);
  assert.equal(corrected.outcome, 'success_verified');
  assert.equal(corrected.source, 'host_verified');
  assert.deepEqual(corrected.evidenceRefs, ['sha256:' + DIGEST]);
  assert.equal(Object.keys(after.events).length, Object.keys(before.events).length + 1);
  assert.equal(soleGap(after).status, 'resolved');
  assert.equal(soleGap(after).verification, undefined, 'resolved is not verified improvement effectiveness');
  assert.equal(status.capabilities.existingReceiptReconciliation, true);
  assert.equal(status.capabilities.reviewReadiness, true);
  assert.equal(status.degraded, false);
  assert.doesNotMatch(await readFile(file, 'utf8'), /private-job|private-command|PRIVATE_SCREEN_CONTENT|PRIVATE_COMMAND_TEXT|PRIVATE_UNMODIFIED_RESULT/);
});

test('a complete verified receipt can finish pending and observed attempts without creating another attempt', async t => {
  for (const outcome of ['pending', 'observed']) {
    const { runtime, store } = await setup(t);
    await seedJob(runtime, outcome, outcome);
    const before = await store.read();
    const original = soleAttempt(before);
    assert.equal(original.outcome, outcome);
    runtime.receiptObserved(receipt(outcome, { verifiedOutcome: 'failure_verified', code: 'JOB_ERROR' }));
    await runtime.status();
    const after = await store.read();
    assert.equal(soleAttempt(after).outcome, 'failure_verified');
    assert.equal(soleAttempt(after).sequence, original.sequence + 1);
    assert.equal(soleAttempt(after).errorCode, 'JOB_ERROR');
    assert.equal(soleAttempt(after).attemptId, original.attemptId);
    assert.equal(Object.keys(after.events).length, Object.keys(before.events).length + 1);
  }
});

test('repeated and concurrent reads of the same verified receipt record one correction', async t => {
  const { runtime, store, file, controller } = await setup(t);
  await seedJob(runtime, 'repeated');
  const before = await store.read();
  const other = await controller();
  runtime.receiptObserved(receipt('repeated'));
  other.receiptObserved(receipt('repeated'));
  await Promise.all([runtime.status(), other.status()]);
  const corrected = await store.read();
  assert.equal(Object.keys(corrected.events).length, Object.keys(before.events).length + 1);
  const baseline = await readFile(file, 'utf8');
  for (let index = 0; index < 4; index++) runtime.receiptObserved(receipt('repeated'));
  await runtime.status();
  assert.equal(await readFile(file, 'utf8'), baseline);
  assert.deepEqual(await store.read(), corrected);
  assert.equal(soleAttempt(corrected).sequence, soleAttempt(before).sequence + 1);
});

test('missing original jobs, missing bindings and mismatched commands never create or alter attempts', async t => {
  const { runtime, store, file } = await setup(t);
  runtime.receiptObserved(receipt('never-dispatched'));
  const empty = await runtime.status();
  assert.equal(empty.counts.events, 0);
  assert.equal(empty.counts.attempts, 0);
  await assert.rejects(readFile(file), { code: 'ENOENT' });
  await seedJob(runtime, 'bound');
  const baseline = await readFile(file, 'utf8');
  for (const input of [receipt('bound', { commandId: undefined }), receipt('bound', { commandId: '' }),
    receipt('bound', { commandId: 'private-command-other-task' }), receipt('unknown-job')]) {
    runtime.receiptObserved(input);
  }
  const status = await runtime.status();
  assert.equal(await readFile(file, 'utf8'), baseline);
  assert.equal(soleAttempt(await store.read()).outcome, 'completion_unknown');
  assert.equal(status.degraded, false);
});

test('a changed runtime identity cannot guess an old job binding, while the same identity survives restart', async t => {
  const { runtime, store, file, controller } = await setup(t);
  await seedJob(runtime, 'restart');
  await runtime.close();
  const baseline = await readFile(file, 'utf8');
  const changed = await controller({ runtimeId: 'synthetic-different-runtime' });
  changed.receiptObserved(receipt('restart'));
  await changed.status();
  assert.equal(await readFile(file, 'utf8'), baseline);
  assert.equal(soleAttempt(await store.read()).outcome, 'completion_unknown');
  const same = await controller();
  same.receiptObserved(receipt('restart'));
  await same.status();
  assert.equal(soleAttempt(await store.read()).outcome, 'success_verified');
  assert.equal(Object.keys((await store.read()).attempts).length, 1);
});

test('receipt reconciliation requires the original platform, version and environment', async t => {
  const { runtime, file, controller } = await setup(t);
  await seedJob(runtime, 'context');
  const baseline = await readFile(file, 'utf8');
  for (const field of ['platform', 'version', 'environment']) {
    const other = await controller({ context: { ...CONTEXT, [field]: 'other-' + field } });
    other.receiptObserved(receipt('context'));
    assert.equal((await other.status()).degraded, false);
    assert.equal(await readFile(file, 'utf8'), baseline);
  }
});

test('foreign-engine and untrusted-source records cannot be adopted as original host attempts', async t => {
  for (const [field, value] of [['engine', 'other-engine'], ['source', 'user_reported']]) {
    const { runtime, store, file } = await setup(t);
    await seedJob(runtime, field, 'pending');
    // Model a pre-existing imported record in this disposable store. Both the
    // immutable event and its current projection retain the same foreign value.
    await store.transact(state => {
      const original = soleAttempt(state);
      state.events[original.eventId][field] = value;
      original[field] = value;
      state.revision++;
      return state;
    });
    const baseline = await readFile(file, 'utf8');
    runtime.receiptObserved(receipt(field));
    assert.equal((await runtime.status()).degraded, false);
    assert.equal(await readFile(file, 'utf8'), baseline);
  }
});

test('ambiguous stored attempt identities are not resolved by selecting the first matching record', async t => {
  const { runtime, store, file } = await setup(t);
  await seedJob(runtime, 'ambiguous', 'pending');
  await store.transact(state => {
    const original = soleAttempt(state);
    return ingest(state, { ...original, eventId: 'synthetic-ambiguous-import', taskId: 'synthetic-other-task' }).state;
  });
  const baseline = await readFile(file, 'utf8');
  assert.equal(Object.keys((await store.read()).attempts).length, 2);
  runtime.receiptObserved(receipt('ambiguous'));
  assert.equal((await runtime.status()).degraded, false);
  assert.equal(await readFile(file, 'utf8'), baseline);
});

test('a conflicting verified outcome or digest never replaces the stored verified receipt', async t => {
  const { runtime, store, file } = await setup(t);
  await seedJob(runtime, 'verified', 'pending');
  runtime.receiptObserved(receipt('verified'));
  await runtime.status();
  const baseline = await readFile(file, 'utf8');
  for (const input of [receipt('verified', { verifiedOutcome: 'failure_verified', code: 'JOB_ERROR' }),
    receipt('verified', { evidenceDigest: OTHER_DIGEST }),
    receipt('verified', { verifiedOutcome: 'failure_verified', evidenceDigest: OTHER_DIGEST })]) {
    runtime.receiptObserved(input);
  }
  assert.equal((await runtime.status()).degraded, false);
  assert.equal(await readFile(file, 'utf8'), baseline);
  assert.equal(soleAttempt(await store.read()).outcome, 'success_verified');
  assert.deepEqual(soleAttempt(await store.read()).evidenceRefs, ['sha256:' + DIGEST]);
});

test('incomplete or unverified receipt reads cannot downgrade or resolve an unknown attempt', async t => {
  const { runtime, store, file } = await setup(t);
  await seedJob(runtime, 'unverified');
  const baseline = await readFile(file, 'utf8');
  for (const input of [receipt('unverified', { status: 'queued' }), receipt('unverified', { status: 'error' }),
    receipt('unverified', { verifiedOutcome: undefined }), receipt('unverified', { verifiedOutcome: 'observed' }),
    receipt('unverified', { evidenceDigest: undefined }), receipt('unverified', { evidenceDigest: 'not-a-digest' })]) {
    runtime.receiptObserved(input);
  }
  assert.equal((await runtime.status()).degraded, false);
  assert.equal(await readFile(file, 'utf8'), baseline);
  assert.equal(soleGap(await store.read()).status, 'open');
});

test('blocked and cancelled attempts are not silently resumed by an observed receipt', async t => {
  for (const outcome of ['blocked', 'cancelled']) {
    const { runtime, store, file } = await setup(t);
    await seedJob(runtime, outcome, 'pending');
    await store.transact(state => {
      const original = soleAttempt(state);
      const next = ingest(state, { ...original, eventId: 'synthetic-' + outcome, sequence: original.sequence + 1,
        outcome, errorCode: outcome === 'blocked' ? 'ACCESS_DENIED' : 'CANCELLED' }).state;
      return propose(next, { now: NOW });
    });
    const baseline = await readFile(file, 'utf8');
    runtime.receiptObserved(receipt(outcome));
    assert.equal((await runtime.status()).degraded, false);
    assert.equal(await readFile(file, 'utf8'), baseline);
  }
});

test('a receipt read preserves its original return and never reruns the original target handler', async t => {
  const { runtime, store } = await setup(t);
  const originalTask = await seedJob(runtime, 'handler');
  const before = await store.read();
  const original = response({ ok: true, job_id: 'private-job-handler', receiptText: 'PRIVATE_RECEIPT_RESPONSE' });
  let reads = 0;
  const result = await runtime.invoke(call('different-read-command', { name: 'life_job_status', mode: undefined }), () => {
    reads++;
    runtime.receiptObserved(receipt('handler'));
    return original;
  });
  assert.strictEqual(result, original);
  assert.equal(reads, 1);
  assert.equal(originalTask.executions, 1);
  const after = await store.read();
  assert.equal(Object.keys(after.events).length, Object.keys(before.events).length + 1);
  assert.equal(Object.keys(after.attempts).length, 1);
  assert.equal(soleAttempt(after).outcome, 'success_verified');
  assert.equal((await runtime.status()).activity.calls, 2, 'one target call and one receipt read');
  assert.equal(JSON.stringify(after).includes('PRIVATE_RECEIPT_RESPONSE'), false);
});

test('an open gap stays open until every original uncertain attempt in its scope is reconciled', async t => {
  const { runtime, store } = await setup(t);
  await seedJob(runtime, 'scope-first');
  await seedJob(runtime, 'scope-second');
  assert.equal(soleGap(await store.read()).independentTaskCount, 2);
  runtime.receiptObserved(receipt('scope-first'));
  await runtime.status();
  const partial = await store.read();
  assert.equal(soleGap(partial).status, 'open');
  assert.equal(soleGap(partial).independentTaskCount, 1);
  assert.equal(Object.values(partial.attempts).filter(item => item.outcome === 'completion_unknown').length, 1);
  runtime.receiptObserved(receipt('scope-second'));
  await runtime.status();
  const complete = await store.read();
  assert.equal(soleGap(complete).status, 'resolved');
  assert.equal(Object.keys(complete.attempts).length, 2);
  assert.equal(Object.values(complete.attempts).every(item => item.outcome === 'success_verified'), true);
});

test('accepted improvement work and its decision history remain separate from reconciled execution outcomes', async t => {
  const { runtime, store } = await setup(t);
  await seedJob(runtime, 'accepted-first');
  await seedJob(runtime, 'accepted-second');
  const proposalId = soleGap(await store.read()).id;
  const accepted = await acceptGap(runtime, proposalId);
  assert.equal(accepted.ok, true);
  for (const id of ['accepted-first', 'accepted-second']) {
    runtime.receiptObserved(receipt(id));
    await runtime.status();
    const state = await store.read();
    assert.equal(state.proposals[proposalId].status, 'accepted');
    assert.deepEqual(state.proposals[proposalId].decisionHistory, [accepted.receipt]);
    assert.equal(state.proposals[proposalId].verification, undefined);
  }
  const complete = await store.read();
  assert.equal(Object.values(complete.attempts).every(item => item.outcome === 'success_verified'), true);
  assert.equal(Object.keys(complete.attempts).length, 2);
  assert.equal(Object.keys(complete.lessons).length, 0);
});
