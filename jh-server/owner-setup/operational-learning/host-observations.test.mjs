import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createState, ingest, propose } from './engine.mjs';
import { FileLearningStore } from './store.mjs';
import { taskView, observeTask } from './host-observations.mjs';

const NOW = '2026-11-01T05:00:00.000Z';
const AT = '2026-11-01T01:00:00.000Z';
const SCOPE = { domain: 'output', operation: 'summary.format', engine: 'host-observation-unit',
  context: { platform: 'node', version: '1', environment: 'synthetic-test' } };
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function request(id = 'one', overrides = {}) {
  const observationRef = overrides.observationRef ?? `source:synthetic-observation/${id}`;
  return { taskId: 'task-one', attemptId: 'attempt-one', observationRef,
    expectedRevision: 0, ...structuredClone(overrides),
    scope: { ...structuredClone(SCOPE), ...structuredClone(overrides.scope ?? {}) },
    observation: { timestamp: AT, outcome: 'observed', source: 'host_verified', evidenceRefs: [observationRef],
      ...structuredClone(overrides.observation ?? {}) } };
}
function observe(state, id, overrides = {}) {
  return observeTask(state, request(id, { expectedRevision: state.revision, ...overrides }), { now: NOW });
}
function legacy(id, overrides = {}) {
  return { eventId: id, taskId: 'task-one', attemptId: 'attempt-one', sequence: 1,
    timestamp: AT, ...structuredClone(SCOPE), outcome: 'observed', source: 'host_verified',
    evidenceRefs: [`fixture:${id}`], ...structuredClone(overrides) };
}
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

test('host observations derive stable identity, return a detached receipt, and leave source state intact', () => {
  const state = freeze(createState());
  const input = freeze(request());
  const result = observeTask(state, input, { now: NOW });
  const expectedId = 'host-observation-' + hash([input.taskId, input.attemptId, input.observationRef]);
  assert.equal(result.event.eventId, expectedId);
  assert.equal(result.event.sequence, 1);
  assert.equal(result.event.timestamp, AT);
  assert.equal(result.recorded, true);
  assert.equal(result.duplicate, false);
  assert.equal(result.projectionChanged, true);
  assert.equal(result.current.projection.observationRef, input.observationRef);
  assert.equal(result.current.maxSequence, 1);
  assert.equal(result.current.nextSequence, 2);
  assert.equal(result.externalEffects, false);
  assert.equal(result.replayAllowed, false);
  assert.deepEqual(state, createState());
  result.event.evidenceRefs.push('fixture:modified-return-value');
  result.current.scope.context.environment = 'modified-return-value';
  assert.deepEqual(result.state.events[expectedId].evidenceRefs, [input.observationRef]);
  assert.equal(result.state.events[expectedId].context.environment, 'synthetic-test');
});

test('lost-response retry keeps its original receipt while reporting the newer effective result', () => {
  const original = request('initial', { observation: { outcome: 'pending', source: 'user_reported' } });
  const first = observeTask(createState(), original, { now: NOW });
  const finished = observe(first.state, 'finished', { observation: { timestamp: '2026-11-01T02:00:00.000Z',
    outcome: 'success_verified', evidenceRefs: ['source:synthetic-observation/finished', 'artifact:synthetic-result'] } });
  const unrelated = observe(finished.state, 'other', { taskId: 'other-task', attemptId: 'other-attempt' });
  const before = structuredClone(unrelated.state);
  const retry = observeTask(freeze(unrelated.state), original, { now: '2026-11-02T05:00:00.000Z' });
  assert.equal(retry.state, unrelated.state);
  assert.equal(retry.recorded, false);
  assert.equal(retry.duplicate, true);
  assert.equal(retry.projectionChanged, false);
  assert.deepEqual(retry.event, first.event);
  assert.equal(retry.current.projection.outcome, 'success_verified');
  assert.equal(retry.current.latestObservation.eventId, finished.event.eventId);
  assert.deepEqual(retry.newProposals, []);
  assert.deepEqual(retry.state, before);
});

test('exact retry does not recalculate proposals from other newly imported observations', () => {
  const original = request('no-proposal-retry');
  let state = observeTask(createState(), original, { now: NOW }).state;
  for (const id of ['independent-a', 'independent-b']) state = ingest(state, legacy(id, {
    taskId: id, attemptId: id, outcome: 'failure_verified', errorCode: 'E_SYNTHETIC',
  })).state;
  assert.equal(propose(state, { now: NOW }).proposals.length, 1);
  const retry = observeTask(state, original, { now: NOW });
  assert.equal(retry.state, state);
  assert.deepEqual(retry.newProposals, []);
  assert.equal(Object.keys(retry.state.proposals).length, 0);
});

test('changed content under one observation reference conflicts before stale revision handling', () => {
  const original = request('immutable');
  const first = observeTask(createState(), original, { now: NOW });
  const changed = request('immutable', { observation: { outcome: 'correction', source: 'user_explicit' } });
  const before = structuredClone(first.state);
  assert.throws(() => observeTask(first.state, changed, { now: NOW }), { code: 'LEARNING_OBSERVATION_CONFLICT' });
  assert.throws(() => observeTask(first.state, request('new-with-stale-revision'), { now: NOW }), { code: 'LEARNING_REVISION_CONFLICT' });
  assert.deepEqual(first.state, before);
});

test('all recorded sequences and timestamps govern new observations even when projection stays verified', () => {
  let state = ingest(createState(), legacy('verified', { sequence: 3, outcome: 'success_verified' })).state;
  state = ingest(state, legacy('later-pending', { sequence: 8, timestamp: '2026-11-01T03:00:00.000Z', outcome: 'pending' })).state;
  const view = taskView(state, { taskId: 'task-one' }).attempts[0];
  assert.equal(view.projection.sequence, 3);
  assert.equal(view.latestObservation.sequence, 8);
  assert.equal(view.maxSequence, 8);
  assert.equal(view.nextSequence, 9);
  assert.equal(view.latestObservedAt, '2026-11-01T03:00:00.000Z');
  const later = observe(state, 'later', { observation: { timestamp: '2026-11-01T04:00:00.000Z', outcome: 'observed' } });
  assert.equal(later.event.sequence, 9);
  assert.equal(later.current.projection.outcome, 'success_verified');
  assert.equal(later.current.latestObservation.outcome, 'observed');
  assert.equal(later.projectionChanged, false);
  const before = structuredClone(later.state);
  assert.throws(() => observe(later.state, 'stale-verified', { observation: {
    timestamp: '2026-11-01T03:30:00.000Z', outcome: 'failure_verified',
    evidenceRefs: ['source:synthetic-observation/stale-verified', 'artifact:synthetic-late-result'],
  } }), { code: 'LEARNING_OBSERVATION_STALE' });
  assert.deepEqual(later.state, before);
});

test('timestamp guard uses parsed instants across whole legacy history and permits equal instants', () => {
  let state = ingest(createState(), legacy('legacy-high-sequence', { sequence: 9, timestamp: '2026-11-01T02:00:00Z' })).state;
  state = ingest(state, legacy('legacy-low-sequence-later-clock', { sequence: 2, timestamp: '2026-11-01T04:00:00Z' })).state;
  assert.equal(taskView(state, { taskId: 'task-one' }).attempts[0].latestObservedAt, '2026-11-01T04:00:00Z');
  assert.throws(() => observe(state, 'clock-too-old', { observation: { timestamp: '2026-11-01T05:00:00+02:00' } }), { code: 'LEARNING_OBSERVATION_STALE' });
  const equalInstant = observe(state, 'same-instant', { observation: { timestamp: '2026-11-01T06:00:00+02:00' } });
  assert.equal(equalInstant.event.sequence, 10);
  const nextEqual = observe(equalInstant.state, 'same-instant-second', { observation: { timestamp: '2026-11-01T04:00:00Z' } });
  assert.equal(nextEqual.event.sequence, 11);
  assert.equal(nextEqual.current.latestObservation.eventId, nextEqual.event.eventId);
});

test('sequence exhaustion remains readable and never advertises an invalid next sequence', () => {
  const state = ingest(createState(), legacy('last-sequence', { sequence: 1e9 })).state;
  const view = taskView(state, { taskId: 'task-one' }).attempts[0];
  assert.equal(view.nextSequence, null);
  assert.equal(view.sequenceExhausted, true);
  assert.throws(() => observe(state, 'beyond-limit'), { code: 'LEARNING_SEQUENCE_EXHAUSTED' });
});

test('task views distinguish missing tasks from missing attempts without creating either', () => {
  const empty = freeze(createState());
  const missing = taskView(empty, { taskId: 'missing-task' });
  assert.equal(missing.schema, 'jh.learning-task-view.v1');
  assert.equal(missing.found, false);
  assert.equal(missing.taskFound, false);
  assert.deepEqual(missing.attempts, []);
  assert.deepEqual(missing.counts, { taskAttempts: 0, taskEvents: 0, matchingAttempts: 0, matchingEvents: 0, returnedAttempts: 0 });
  assert.deepEqual(empty, createState());
  const state = freeze(observe(createState(), 'known').state);
  const absentAttempt = taskView(state, { taskId: 'task-one', attemptId: 'missing-attempt' });
  assert.equal(absentAttempt.taskFound, true);
  assert.equal(absentAttempt.found, false);
  assert.equal(absentAttempt.counts.taskAttempts, 1);
  assert.equal(absentAttempt.counts.matchingAttempts, 0);
  assert.equal(absentAttempt.readOnly, true);
  assert.equal(absentAttempt.externalEffects, false);
  assert.equal(absentAttempt.replayAllowed, false);
});

test('view bounds preserve a recoverable observation reference outside the visible evidence slice', () => {
  let state = createState();
  for (let index = 0; index < 10; index++) {
    const id = `bounded-${String(index).padStart(2, '0')}`;
    state = observe(state, id, { attemptId: id, observation: {
      evidenceRefs: [...Array.from({ length: 11 }, (_, number) => `artifact:synthetic-${number}`), `source:synthetic-observation/${id}`],
    } }).state;
  }
  state = observe(state, 'other-task', { taskId: 'other-task' }).state;
  const before = structuredClone(state);
  const view = taskView(freeze(state), { taskId: 'task-one' });
  assert.equal(view.limit, 8);
  assert.equal(view.attempts.length, 8);
  assert.equal(view.omittedAttempts, 2);
  assert.equal(view.counts.taskEvents, 10);
  assert.deepEqual(view.attempts.map(attempt => attempt.attemptId), Array.from({ length: 8 }, (_, index) => `bounded-0${index}`));
  const observation = view.attempts[0].latestObservation;
  assert.equal(observation.evidenceRefs.length, 8);
  assert.equal(observation.evidenceRefsOmitted, 4);
  assert.equal(observation.evidenceRefsTruncated, true);
  assert.equal(observation.observationRef, 'source:synthetic-observation/bounded-00');
  assert.ok(!observation.evidenceRefs.includes(observation.observationRef));
  assert.equal(taskView(state, { taskId: 'task-one', limit: 32 }).attempts.length, 10);
  assert.deepEqual(state, before);
});

test('legacy and mismatched host-looking IDs do not produce invented observation references', () => {
  const legacyEvent = legacy('legacy-observation');
  let state = ingest(createState(), legacyEvent).state;
  state = ingest(state, legacy('host-observation-' + 'f'.repeat(64), { attemptId: 'host-looking-attempt' })).state;
  const view = taskView(state, { taskId: 'task-one' });
  assert.equal(view.attempts.length, 2);
  for (const attempt of view.attempts) assert.equal(attempt.latestObservation.observationRef, null);
});

test('identity reference alone cannot verify a result and sources are never upgraded', () => {
  const malformed = [
    request('missing-own-reference', { observation: { evidenceRefs: ['artifact:other-only'] } }),
    request('identity-only-result', { observation: { outcome: 'success_verified' } }),
    request('reported-result', { observation: { outcome: 'failure_verified', source: 'user_reported',
      evidenceRefs: ['source:synthetic-observation/reported-result', 'artifact:synthetic-result'] } }),
  ];
  const state = freeze(createState());
  for (const input of malformed) assert.throws(() => observeTask(state, input, { now: NOW }), TypeError);
  const reported = observe(state, 'reported-correction', { observation: { outcome: 'correction', source: 'user_reported' } });
  assert.equal(reported.event.source, 'user_reported');
  const explicit = observe(reported.state, 'explicit-correction', { observationRef: 'user:synthetic-explicit-correction',
    observation: { outcome: 'correction', source: 'user_explicit', evidenceRefs: ['user:synthetic-explicit-correction'] } });
  assert.equal(explicit.event.source, 'user_explicit');
  assert.equal(explicit.event.outcome, 'correction');
});

test('actual remediation can preserve a correction under the same task without inflating task counts', () => {
  let state = observe(createState(), 'correction-a', { observation: {
    outcome: 'correction', source: 'user_explicit', errorCode: 'MISSING_SECTION',
  } }).state;
  const remediation = observe(state, 'remediation-a', { attemptId: 'actual-remediation', observation: {
    outcome: 'success_verified', evidenceRefs: ['source:synthetic-observation/remediation-a', 'artifact:synthetic-corrected-output'],
  } });
  assert.equal(remediation.newProposals.length, 0);
  state = remediation.state;
  const repeatedSameTask = observe(state, 'correction-a-second-attempt', { attemptId: 'actual-other-output', observation: {
    outcome: 'correction', source: 'user_explicit', errorCode: 'MISSING_SECTION',
  } });
  assert.equal(repeatedSameTask.newProposals.length, 0);
  const independent = observe(repeatedSameTask.state, 'correction-b', { taskId: 'independent-task', observation: {
    outcome: 'correction', source: 'user_explicit', errorCode: 'MISSING_SECTION',
  } });
  assert.equal(independent.newProposals.length, 1);
  assert.equal(independent.newProposals[0].kind, 'rule_fix');
  assert.equal(independent.newProposals[0].independentTaskCount, 2);
  const originals = taskView(independent.state, { taskId: 'task-one' });
  assert.equal(originals.counts.taskAttempts, 3);
  assert.equal(originals.attempts.find(attempt => attempt.attemptId === 'attempt-one').projection.outcome, 'correction');
  assert.equal(originals.attempts.find(attempt => attempt.attemptId === 'actual-remediation').projection.outcome, 'success_verified');
});

test('strict host input validation never invokes accessors, proxies, executable values, or array extras', () => {
  let invoked = 0;
  const invalid = [];
  const accessor = request('accessor');
  Object.defineProperty(accessor.scope.context, 'platform', { enumerable: true, get() { invoked++; return 'node'; } });
  invalid.push(accessor);
  const arrayAccessor = request('array-accessor');
  Object.defineProperty(arrayAccessor.observation.evidenceRefs, '0', { enumerable: true, get() { invoked++; return 'source:array'; } });
  invalid.push(arrayAccessor);
  const executable = request('executable');
  executable.observation.metrics = { durationMs() { invoked++; return 1; } };
  invalid.push(executable);
  invalid.push(new Proxy(request('proxy'), { get() { invoked++; throw new Error('not reached'); }, ownKeys() { invoked++; throw new Error('not reached'); } }));
  const extendedArray = request('array-extra');
  extendedArray.observation.evidenceRefs.extra = 'unrecognized';
  invalid.push(extendedArray);
  const sparse = request('sparse');
  sparse.observation.evidenceRefs = new Array(1);
  invalid.push(sparse);
  const symbol = request('symbol');
  symbol[Symbol('hidden')] = true;
  invalid.push(symbol);
  const hidden = request('non-enumerable');
  Object.defineProperty(hidden, 'hidden', { value: true });
  invalid.push(hidden);
  const state = freeze(createState());
  for (const input of invalid) assert.throws(() => observeTask(state, input, { now: NOW }), TypeError);
  assert.equal(invoked, 0);
  assert.deepEqual(state, createState());
});

test('unsupported fields, missing required values, raw URLs, known credentials, and invalid limits fail closed', () => {
  const invalid = [
    request('unknown-field', { eventId: 'caller-cannot-override-event' }),
    request('scope-field', { scope: { sequence: 99 } }),
    request('observation-field', { observation: { sequence: 99 } }),
    request('raw-url', { observationRef: 'https://example.invalid/private' }),
    request('credential', { observationRef: 'source:ghp_' + 'a'.repeat(24) }),
    request('negative-revision', { expectedRevision: -1 }),
    request('non-json', { observation: { metrics: undefined } }),
  ];
  const missing = request('missing-revision');
  delete missing.expectedRevision;
  invalid.push(missing);
  for (const input of invalid) assert.throws(() => observeTask(createState(), input, { now: NOW }), TypeError);
  for (const limit of [0, 33, -1, 1.5, '8', null]) assert.throws(() => taskView(createState(), { taskId: 'task-one', limit }), TypeError);
  assert.throws(() => taskView(createState(), { taskId: 'task-one', attemptId: undefined }), TypeError);
  assert.throws(() => taskView(createState(), { taskId: 'task-one', extra: true }), TypeError);
  assert.throws(() => observeTask(createState(), request('bad-clock'), { now: 'not-a-time' }), TypeError);
  assert.throws(() => observeTask(createState(), request('bad-options'), { thresholds: {} }), TypeError);
});

test('stored event and projection bindings are checked without trusting editable summaries', () => {
  const initial = observe(createState(), 'binding');
  const attempt = Object.keys(initial.state.attempts)[0];
  const mutations = [
    state => { state.attempts[attempt].outcome = 'correction'; },
    state => { state.events[initial.event.eventId].eventId = 'different-id'; },
    state => { delete state.attempts[attempt]; },
    state => { state.attempts.invalidKey = state.attempts[attempt]; delete state.attempts[attempt]; },
  ];
  for (const change of mutations) {
    const bad = structuredClone(initial.state);
    change(bad);
    assert.throws(() => taskView(bad, { taskId: 'task-one' }), TypeError);
  }
  let invoked = 0;
  const getterState = structuredClone(initial.state);
  Object.defineProperty(getterState.events[initial.event.eventId], 'outcome', { enumerable: true, get() { invoked++; return 'observed'; } });
  assert.throws(() => taskView(getterState, { taskId: 'task-one' }), TypeError);
  assert.equal(invoked, 0);
  assert.throws(() => observe(initial.state, 'scope-change', { scope: { operation: 'different.operation' } }), TypeError);
});

test('projection metrics can retain earlier measurements while the immutable event receipt stays exact', () => {
  const first = observe(createState(), 'metrics-first', { observation: { metrics: { toolCalls: 5, durationMs: 50 } } });
  const next = observe(first.state, 'metrics-next', { observation: { metrics: { toolCalls: 1 } } });
  assert.deepEqual(next.event.metrics, { toolCalls: 1 });
  assert.deepEqual(next.current.projection.metrics, { toolCalls: 5, durationMs: 50 });
  const view = taskView(next.state, { taskId: 'task-one' });
  assert.deepEqual(view.attempts[0].latestObservation.metrics, { toolCalls: 1 });
  assert.deepEqual(view.attempts[0].projection.metrics, { toolCalls: 5, durationMs: 50 });
});

test('real file readback and exact observation retry do not rewrite memory or create a missing store', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'jh-host-observation-unit-'));
  try {
    const absentPath = path.join(directory, 'not-created', 'memory.json');
    const absent = new FileLearningStore({ file: absentPath, ownerScope: 'synthetic-unit-owner' });
    assert.equal(taskView(await absent.read(), { taskId: 'missing-task' }).found, false);
    await assert.rejects(stat(path.dirname(absentPath)), { code: 'ENOENT' });
    const file = path.join(directory, 'memory.json');
    const store = new FileLearningStore({ file, ownerScope: 'synthetic-unit-owner' });
    const original = request('persistent');
    await store.transact(state => observeTask(state, original, { now: NOW }));
    const before = await stat(file, { bigint: true });
    const bytes = await readFile(file, 'utf8');
    const restarted = new FileLearningStore({ file, ownerScope: 'synthetic-unit-owner' });
    assert.equal(taskView(await restarted.read(), { taskId: 'task-one' }).found, true);
    const retry = await restarted.transact(state => observeTask(state, original, { now: NOW }));
    assert.equal(retry.duplicate, true);
    assert.equal(await readFile(file, 'utf8'), bytes);
    const after = await stat(file, { bigint: true });
    assert.equal(after.ino, before.ino);
    assert.equal(after.mtimeNs, before.mtimeNs);
    assert.equal(after.size, before.size);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
