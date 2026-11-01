import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execute } from './cli.mjs';

// Every invocation uses a temporary synthetic owner store. No live memory or device is accessed.
const CLI = fileURLToPath(new URL('./cli.mjs', import.meta.url));
const OWNER = 'synthetic-host-observations-cli-owner';
const TIMES = ['2026-10-30T10:00:00.000Z', '2026-10-30T10:01:00.000Z', '2026-10-30T10:02:00.000Z'];
const SCOPE = { domain: 'output', operation: 'summary.format', engine: 'synthetic-cli',
  context: { platform: 'node', version: 'host-observations-cli-v1', environment: 'synthetic' } };

function request(id, expectedRevision = 0, options = {}) {
  const observationRef = 'source:cli-observation-' + id;
  const outcome = options.outcome ?? 'observed';
  return { taskId: options.taskId ?? 'cli-task', attemptId: options.attemptId ?? 'cli-attempt',
    observationRef, scope: structuredClone(SCOPE), expectedRevision,
    observation: { timestamp: options.timestamp ?? TIMES[0], outcome, source: options.source ?? 'host_verified',
      evidenceRefs: [observationRef, ...(['success_verified', 'failure_verified'].includes(outcome)
        ? ['artifact:synthetic-result-' + id] : [])],
      ...(options.errorCode === undefined ? {} : { errorCode: options.errorCode }) } };
}

function processCall(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
    child.stdin.on('error', reject);
    child.stdin.end(input === undefined ? '' : JSON.stringify(input));
  });
}

async function setup(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'jh-host-observations-cli-'));
  const file = path.join(directory, 'private', 'memory.json');
  const flags = ['--store', file, '--owner', OWNER];
  t.after(() => rm(directory, { recursive: true, force: true }));
  const run = (command, input, extra = []) => processCall([command, ...flags, ...extra], input);
  const ok = async (command, input, extra = []) => {
    const result = await run(command, input, extra);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.signal, null);
    assert.equal(result.stderr, '');
    return JSON.parse(result.stdout);
  };
  return { directory, file, flags, run, ok };
}

async function snapshot(file) {
  const [bytes, info] = await Promise.all([readFile(file, 'utf8'), stat(file, { bigint: true })]);
  return { bytes, inode: info.ino, modified: info.mtimeNs };
}

function rejected(result, code) {
  assert.equal(result.code, 1);
  assert.equal(result.signal, null);
  assert.equal(result.stdout, '');
  const error = JSON.parse(result.stderr);
  assert.deepEqual(Object.keys(error).sort(), ['code', 'ok']);
  assert.equal(error.ok, false);
  if (code !== undefined) assert.equal(error.code, code);
  return error;
}

test('CLI task-view reads an absent task without creating a memory file or directory', async t => {
  const { directory, run, ok } = await setup(t);
  const view = await ok('task-view', { taskId: 'missing-task' });
  assert.equal(view.schema, 'jh.learning-task-view.v1');
  assert.equal(view.revision, 0);
  assert.equal(view.taskFound, false);
  assert.equal(view.found, false);
  assert.equal(view.attemptId, null);
  assert.deepEqual(view.attempts, []);
  assert.equal(view.readOnly, true);
  assert.equal(view.externalEffects, false);
  assert.equal(view.replayAllowed, false);
  rejected(await run('task-view', { taskId: 'missing-task', unexpected: 'PRIVATE_PAYLOAD_MUST_NOT_LEAK' }));
  rejected(await run('observe', request('revision-option'), ['--revision', '0']));
  assert.deepEqual(await readdir(directory), []);
});

test('CLI observations persist across processes and exact stale retries preserve the original receipt and current projection', async t => {
  const { file, ok } = await setup(t);
  const original = request('first');
  const first = await ok('observe', original);
  assert.equal(first.recorded, true);
  assert.equal(first.duplicate, false);
  assert.equal(first.projectionChanged, true);
  assert.equal(first.event.taskId, original.taskId);
  assert.equal(first.event.sequence, 1);
  assert.equal(first.event.timestamp, original.observation.timestamp);
  assert.equal(first.externalEffects, false);
  assert.equal(first.replayAllowed, false);
  assert.equal(Object.hasOwn(first, 'state'), false);
  assert.deepEqual(first.newProposals, []);
  const other = await ok('observe', request('other', first.revision, { taskId: 'other-cli-task' }));
  const verified = await ok('observe', request('verified', other.revision,
    { timestamp: TIMES[1], outcome: 'success_verified' }));
  assert.equal(verified.event.sequence, 2);
  const before = await snapshot(file);
  // Each call starts a new process; neither an in-memory ID cache nor a fresh revision is available.
  const duplicate = await ok('observe', original);
  assert.equal(duplicate.recorded, false);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.projectionChanged, false);
  assert.equal(duplicate.revision, verified.revision);
  assert.deepEqual(duplicate.event, first.event);
  assert.equal(duplicate.current.projection.outcome, 'success_verified');
  assert.equal(duplicate.current.projection.eventId, verified.event.eventId);
  assert.equal(duplicate.current.eventCount, 2);
  assert.deepEqual(duplicate.newProposals, []);
  assert.deepEqual(await snapshot(file), before);
  const status = await ok('status');
  assert.equal(status.counts.events, 3);
  assert.equal(status.counts.attempts, 2);
});

test('CLI task-view exposes persisted sequence history without rewriting protected verified outcomes', async t => {
  const { file, ok } = await setup(t);
  const verified = { ...structuredClone(SCOPE), eventId: 'legacy-verified', taskId: 'legacy-task',
    attemptId: 'legacy-attempt', sequence: 4, timestamp: TIMES[0], outcome: 'success_verified',
    source: 'host_verified', evidenceRefs: ['artifact:legacy-synthetic-result'] };
  const weak = { ...verified, eventId: 'legacy-weak', sequence: 7, timestamp: TIMES[1], outcome: 'observed',
    evidenceRefs: ['source:legacy-synthetic-poll'] };
  const other = { ...weak, eventId: 'legacy-other-attempt', attemptId: 'other-legacy-attempt', sequence: 1 };
  const ingested = await ok('ingest', [verified, weak, other]);
  assert.equal(ingested.recorded, 3);
  const baseline = await snapshot(file);
  const view = await ok('task-view', { taskId: verified.taskId, attemptId: verified.attemptId });
  assert.equal(view.revision, ingested.revision);
  assert.equal(view.taskFound, true);
  assert.equal(view.found, true);
  assert.equal(view.attempts.length, 1);
  assert.equal(view.counts.taskAttempts, 2);
  assert.equal(view.counts.taskEvents, 3);
  assert.equal(view.counts.matchingAttempts, 1);
  assert.equal(view.counts.matchingEvents, 2);
  assert.equal(view.attempts[0].maxSequence, 7);
  assert.equal(view.attempts[0].nextSequence, 8);
  assert.equal(view.attempts[0].projection.sequence, 4);
  assert.equal(view.attempts[0].projection.outcome, 'success_verified');
  assert.equal(view.attempts[0].latestObservation.sequence, 7);
  assert.equal(view.attempts[0].latestObservation.outcome, 'observed');
  const bounded = await ok('task-view', { taskId: verified.taskId, limit: 1 });
  assert.equal(bounded.counts.returnedAttempts, 1);
  assert.equal(bounded.omittedAttempts, 1);
  const absent = await ok('task-view', { taskId: verified.taskId, attemptId: 'missing-attempt' });
  assert.equal(absent.taskFound, true);
  assert.equal(absent.found, false);
  assert.deepEqual(await snapshot(file), baseline);
  const continued = request('legacy-continued', ingested.revision,
    { taskId: verified.taskId, attemptId: verified.attemptId, timestamp: TIMES[2] });
  const receipt = await ok('observe', continued);
  assert.equal(receipt.event.sequence, 8);
  assert.equal(receipt.projectionChanged, false);
  assert.equal(receipt.current.projection.eventId, verified.eventId);
});

test('CLI observe rejects changed identities, stale new writes, malformed evidence and foreign owners atomically', async t => {
  const { file, flags, run, ok } = await setup(t);
  const original = request('identity');
  const recorded = await ok('observe', original);
  const baseline = await snapshot(file);
  const changed = structuredClone(original);
  changed.observation.errorCode = 'CHANGED_OBSERVATION';
  rejected(await run('observe', changed), 'LEARNING_OBSERVATION_CONFLICT');
  rejected(await run('observe', request('stale')), 'LEARNING_REVISION_CONFLICT');
  rejected(await run('observe', request('older-observation', recorded.revision,
    { timestamp: '2026-10-30T09:59:00.000Z' })), 'LEARNING_OBSERVATION_STALE');
  rejected(await run('observe', original, ['--revision', String(recorded.revision)]));
  for (const invalid of [
    { ...request('missing-ref', recorded.revision), observationRef: 'source:not-in-evidence' },
    { ...request('unknown-field', recorded.revision), command: 'PRIVATE_PAYLOAD_MUST_NOT_LEAK' },
    { ...request('verification', recorded.revision), observation: {
      timestamp: TIMES[1], outcome: 'success_verified', source: 'host_verified',
      evidenceRefs: ['source:cli-observation-verification'] } },
    { ...request('reported', recorded.revision), observation: {
      timestamp: TIMES[1], outcome: 'success_verified', source: 'user_reported',
      evidenceRefs: ['source:cli-observation-reported', 'artifact:synthetic-result-reported'] } },
  ]) {
    const response = await run('observe', invalid);
    rejected(response);
    assert.equal(response.stderr.includes('PRIVATE_PAYLOAD_MUST_NOT_LEAK'), false);
    assert.deepEqual(await snapshot(file), baseline);
  }
  const foreignFlags = ['--store', file, '--owner', 'foreign-synthetic-owner'];
  rejected(await processCall(['task-view', ...foreignFlags], { taskId: original.taskId }), 'LEARNING_STORE_SCOPE_MISMATCH');
  rejected(await processCall(['observe', ...foreignFlags], original), 'LEARNING_STORE_SCOPE_MISMATCH');
  await assert.rejects(execute(['observe', ...flags, '--revision', String(recorded.revision)], original), /payload.expectedRevision/);
  assert.deepEqual(await snapshot(file), baseline);
});

test('direct CLI execute preserves caller input and returned receipt changes cannot alter persisted memory', async t => {
  const { file, flags, ok } = await setup(t);
  const input = request('immutable');
  const original = structuredClone(input);
  const receipt = await execute(['observe', ...flags], input);
  assert.deepEqual(input, original);
  const storedReceipt = structuredClone(receipt.event);
  const baseline = await snapshot(file);
  receipt.event.evidenceRefs.push('source:caller-only-change');
  receipt.current.projection.outcome = 'failure_verified';
  const duplicate = await execute(['observe', ...flags], input);
  assert.deepEqual(duplicate.event, storedReceipt);
  assert.deepEqual(input, original);
  assert.equal(duplicate.current.projection.outcome, 'observed');
  const view = await ok('task-view', { taskId: input.taskId });
  assert.equal(view.attempts[0].projection.outcome, 'observed');
  assert.deepEqual(await snapshot(file), baseline);
});

test('concurrent CLI processes commit one new observation at a shared revision and reject the stale writer', async t => {
  const { file, run, ok } = await setup(t);
  const inputs = [request('concurrent-a'), request('concurrent-b', 0, { taskId: 'other-concurrent-task' })];
  const results = await Promise.all(inputs.map(input => run('observe', input)));
  const winner = results.findIndex(result => result.code === 0);
  const loser = results.findIndex(result => result.code !== 0);
  assert.notEqual(winner, -1);
  assert.notEqual(loser, -1);
  const receipt = JSON.parse(results[winner].stdout);
  rejected(results[loser], 'LEARNING_REVISION_CONFLICT');
  const state = JSON.parse(await readFile(file, 'utf8')).state;
  assert.equal(Object.keys(state.events).length, 1);
  assert.equal(Object.keys(state.attempts).length, 1);
  assert.deepEqual(Object.values(state.events), [receipt.event]);
  const rebased = await ok('observe', { ...inputs[loser], expectedRevision: receipt.revision });
  assert.equal(rebased.recorded, true);
  assert.equal((await ok('status')).counts.events, 2);
});

test('concurrent exact retries create one event and later retries perform no file write', async t => {
  const { file, run, ok } = await setup(t);
  const input = request('concurrent-identical');
  const results = await Promise.all([run('observe', input), run('observe', input)]);
  assert.deepEqual(results.map(result => result.code), [0, 0]);
  const receipts = results.map(result => JSON.parse(result.stdout));
  assert.deepEqual(receipts.map(receipt => receipt.duplicate).sort(), [false, true]);
  assert.deepEqual(receipts[0].event, receipts[1].event);
  assert.equal(receipts[0].revision, receipts[1].revision);
  assert.equal((await ok('status')).counts.events, 1);
  const baseline = await snapshot(file);
  assert.equal((await ok('observe', input)).duplicate, true);
  assert.deepEqual(await snapshot(file), baseline);
});

test('CLI proposal thresholds count continued attempts as one task and recognize a separate user goal', async t => {
  const { ok } = await setup(t);
  let revision = 0;
  for (let index = 0; index < 3; index++) {
    const receipt = await ok('observe', request('continued-failure-' + index, revision,
      { attemptId: 'continued-attempt-' + index, outcome: 'failure_verified', errorCode: 'SYNTHETIC_FORMAT_FAILURE' }));
    revision = receipt.revision;
    assert.deepEqual(receipt.newProposals, []);
  }
  const firstGoal = await ok('task-view', { taskId: 'cli-task' });
  assert.equal(firstGoal.counts.taskAttempts, 3);
  assert.equal(firstGoal.counts.taskEvents, 3);
  assert.deepEqual((await ok('status')).proposals, []);
  const separateGoal = await ok('observe', request('separate-goal', revision,
    { taskId: 'separate-cli-task', outcome: 'failure_verified', errorCode: 'SYNTHETIC_FORMAT_FAILURE' }));
  assert.equal(separateGoal.newProposals.length, 1);
  assert.equal(separateGoal.newProposals[0].kind, 'rule_fix');
  assert.equal(separateGoal.newProposals[0].independentTaskCount, 2);
  assert.equal(separateGoal.newProposals[0].externalEffects, false);
  assert.equal((await ok('status')).counts.events, 4);
});
