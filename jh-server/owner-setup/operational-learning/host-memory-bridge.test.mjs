import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, ingest, addLesson, evaluateLesson } from './engine.mjs';
import { bindRegression, runRegression } from './regression.mjs';
import { HOST_MEMORY_CONTEXT, HOST_MEMORY_ENGINE, normalizeHostObservation,
  observeHostMemory, hostMemoryTaskView, hostMemoryContext } from './host-memory-bridge.mjs';

const NOW = '2026-11-01T16:00:00.000Z';
const AT = '2026-11-01T15:00:00.000Z';
const SCOPE = { domain: 'development', operation: 'memory.bridge', engine: HOST_MEMORY_ENGINE, context: HOST_MEMORY_CONTEXT };
const QUERY = { domain: SCOPE.domain, operation: SCOPE.operation };
function request(id = 'one', overrides = {}) {
  const observationRef = overrides.observationRef ?? `source:synthetic-host-memory/${id}`;
  return { taskRef: 'synthetic-task', attemptRef: 'synthetic-attempt', observationRef,
    domain: SCOPE.domain, operation: SCOPE.operation, expectedRevision: 0,
    ...structuredClone(overrides), observation: { timestamp: AT, outcome: 'observed', source: 'host_verified',
      evidenceRefs: [observationRef], ...structuredClone(overrides.observation ?? {}) } };
}
function write(state, id, overrides = {}) {
  return observeHostMemory(state, request(id, { expectedRevision: state.revision, ...overrides }), { now: NOW });
}
function context(state, overrides = {}, now = NOW) { return hostMemoryContext(state, { ...QUERY, ...overrides }, { now }); }
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
async function active(state, id, overrides = {}) {
  const suite = { id: `synthetic-${id}`, version: '1', cases: [{ id: 'same', input: true, expected: true }] };
  const definition = { id, ...structuredClone(SCOPE), guidance: `Synthetic advice ${id}.`, ruleVersion: '1',
    evidenceRefs: [`fixture:${id}`], memoryKind: 'procedure', provenance: 'host_verified', ...overrides };
  const lesson = bindRegression(definition, suite);
  const checked = await runRegression(lesson, suite, value => value, { now: AT });
  return evaluateLesson(addLesson(state, lesson), id, checked.evaluation);
}

test('fixed host scope and stable disjoint identities do not store caller task references', () => {
  const input = freeze(request());
  const normalized = normalizeHostObservation(input);
  assert.match(normalized.taskId, /^host-task-[a-f0-9]{64}$/);
  assert.match(normalized.attemptId, /^host-attempt-[a-f0-9]{64}$/);
  assert.deepEqual(normalized.scope, SCOPE);
  assert.deepEqual(normalized, normalizeHostObservation(request()));
  assert.notEqual(normalized.attemptId, normalizeHostObservation(request('one', { taskRef: 'other-task' })).attemptId);
  const state = freeze(createState());
  const result = observeHostMemory(state, input, { now: NOW });
  assert.equal(result.event.eventId.startsWith('host-observation-'), true);
  assert.equal(result.event.sequence, 1);
  assert.equal(result.recorded, true);
  assert.equal(result.readOnly, false);
  assert.equal(JSON.stringify(result.state).includes(input.taskRef), false);
  assert.equal(JSON.stringify(result.state).includes(input.attemptRef), false);
  assert.deepEqual(state, createState());
  result.current.scope.context.platform = 'changed-return';
  assert.equal(result.state.events[result.event.eventId].context.platform, 'chatgpt');
});

test('zero active rules still yields a scoped episode with explicit unverified provenance', () => {
  let state = write(createState(), 'first').state;
  state = write(state, 'other-scope', { taskRef: 'other', operation: 'other.operation' }).state;
  const before = structuredClone(state);
  const result = context(freeze(state));
  assert.equal(result.lessons.length, 0);
  assert.equal(result.episodes.length, 1);
  assert.equal(result.episodes[0].projection.observationRef, 'source:synthetic-host-memory/first');
  assert.equal(result.episodes[0].projection.outcome, 'observed');
  for (const value of [result, result.episodes[0]]) {
    assert.equal(value.sourceAuthentication, 'authenticated_owner_attestation');
    assert.equal(value.sourceRetrievalVerified, false);
    assert.equal(value.liveExecutionVerified, false);
    assert.equal(value.episodesRequireReview, true);
  }
  assert.equal(result.ordinaryChatsObserved, false);
  assert.equal(result.librarySync, 'not_connected');
  assert.equal(result.readOnly, true);
  assert.equal(result.activatedByThisCall, false);
  assert.deepEqual(state, before);
});

test('lost response retries recover the original event after newer evidence and revisions', () => {
  const original = request('queued', { observation: { outcome: 'pending', source: 'user_reported' } });
  const first = observeHostMemory(createState(), original, { now: NOW });
  const complete = write(first.state, 'completed', { observation: { timestamp: '2026-11-01T15:01:00.000Z',
    outcome: 'success_verified', evidenceRefs: ['source:synthetic-host-memory/completed', 'artifact:synthetic-build-proof'] } });
  const state = write(complete.state, 'unrelated', { taskRef: 'other' }).state;
  const before = structuredClone(state);
  const result = observeHostMemory(freeze(state), original, { now: '2027-01-01T00:00:00Z' });
  assert.equal(result.duplicate, true);
  assert.equal(result.recorded, false);
  assert.equal(result.readOnly, true);
  assert.deepEqual(result.event, first.event);
  assert.equal(result.current.projection.outcome, 'success_verified');
  assert.deepEqual(result.newProposals, []);
  assert.deepEqual(state, before);
  // The time check is for NEW observations, never an immutable receipt retry.
  assert.equal(observeHostMemory(state, original, { now: '2026-10-01T00:00:00Z' }).duplicate, true);
});

test('new stale writes, conflicting observation content and future observations are rejected without changes', () => {
  const original = request('original');
  const state = observeHostMemory(createState(), original, { now: NOW }).state;
  const before = structuredClone(state);
  assert.throws(() => observeHostMemory(state, request('new'), { now: NOW }), { code: 'LEARNING_REVISION_CONFLICT' });
  assert.throws(() => observeHostMemory(state, request('original', { observation: { outcome: 'correction', source: 'user_explicit' } }),
    { now: NOW }), { code: 'LEARNING_OBSERVATION_CONFLICT' });
  assert.throws(() => write(state, 'future', { observation: { timestamp: '2026-11-01T16:00:00.001Z' } }),
    { code: 'LEARNING_HOST_OBSERVATION_FUTURE' });
  assert.deepEqual(state, before);
});

test('host references cannot select original server attempts and forged host namespace rows fail closed', () => {
  const original = { eventId: 'event-synthetic-server', taskId: 'task-original-server', attemptId: 'job-original-server',
    sequence: 1, timestamp: AT, domain: 'device', operation: 'job.open_url', engine: 'jh-server',
    context: { platform: 'jh-mcp', version: 'server-learning-v1', environment: 'owner-service' },
    outcome: 'completion_unknown', source: 'host_verified', evidenceRefs: ['fixture:synthetic-server-original'] };
  const state = ingest(createState(), original).state;
  const before = structuredClone(state);
  const absent = hostMemoryTaskView(state, { taskRef: original.taskId, attemptRef: original.attemptId });
  assert.equal(absent.found, false);
  assert.deepEqual(context(state).episodes, []);
  const added = write(state, 'host', { taskRef: original.taskId, attemptRef: original.attemptId }).state;
  assert.deepEqual(added.events[original.eventId], original);
  assert.deepEqual(state, before);
});

test('preexisting nonhost scope under a reserved host identity is never read or advanced', () => {
  const normalized = normalizeHostObservation(request());
  const foreign = { eventId: 'host-observation-' + 'a'.repeat(64), taskId: normalized.taskId,
    attemptId: normalized.attemptId, sequence: 1, timestamp: AT, domain: 'device', operation: 'job.open_url',
    engine: 'jh-server', context: { platform: 'jh-mcp', version: 'server-learning-v1', environment: 'owner-service' },
    outcome: 'completion_unknown', source: 'host_verified', evidenceRefs: ['fixture:foreign-memory'] };
  const state = ingest(createState(), foreign).state;
  const before = structuredClone(state);
  for (const action of [() => context(state), () => hostMemoryTaskView(state, { taskRef: 'synthetic-task' }),
    () => write(state, 'new-host')]) assert.throws(action, { code: 'LEARNING_HOST_SCOPE_CONFLICT' });
  assert.deepEqual(state, before);
});

test('latest inconclusive observation cannot replace a previously verified projected episode', () => {
  const good = write(createState(), 'verified', { observation: { outcome: 'success_verified',
    evidenceRefs: ['source:synthetic-host-memory/verified', 'artifact:synthetic-proof'] } });
  const later = write(good.state, 'later', { observation: { timestamp: '2026-11-01T15:02:00.000Z', outcome: 'pending' } });
  const result = context(later.state);
  assert.equal(result.episodes.length, 1);
  assert.equal(result.episodes[0].eventCount, 2);
  assert.equal(result.episodes[0].projection.outcome, 'success_verified');
  assert.equal(result.episodes[0].latestObservation.outcome, 'pending');
  assert.equal(hostMemoryTaskView(later.state, { taskRef: 'synthetic-task', attemptRef: 'synthetic-attempt' })
    .attempts[0].projection.eventId, good.event.eventId);
});

test('active advice, proposals and episodes share one serialized budget and omit whole items honestly', async () => {
  let state = await active(createState(), 'common', { domain: 'orchestration', operation: 'learning.scope' });
  state = await active(state, 'scoped', { guidance: 'S'.repeat(1100) });
  state = await active(state, 'other', { operation: 'unrelated.operation' });
  for (let index = 0; index < 5; index++) state = write(state, 'failure-' + index, {
    taskRef: 'independent-' + index, observation: { outcome: 'failure_verified', errorCode: 'SYNTHETIC_FAILURE',
      evidenceRefs: [`source:synthetic-host-memory/failure-${index}`, `artifact:synthetic-proof-${index}`] },
  }).state;
  const before = structuredClone(state);
  const large = context(state, { max_chars: 16000 });
  assert.equal(large.lessons.length, 2);
  assert.equal(large.proposals.length, 1);
  assert.equal(large.episodes.length, 5);
  for (const max_chars of [256, 700, 1800, 6000]) {
    const result = context(state, { max_chars, limit: 3 });
    const selected = { lessons: result.lessons, conflicts: result.conflicts, proposals: result.proposals, episodes: result.episodes };
    assert.equal(result.budget.selectedChars, JSON.stringify(selected).length);
    assert.ok(result.budget.selectedChars <= max_chars);
    assert.equal(result.lessons.length + result.omitted.lessons, 2);
    assert.equal(result.proposals.length + result.omitted.proposals, 1);
    assert.equal(result.episodes.length + result.omitted.episodes, 5);
    assert.ok(Object.values(selected).every(items => items.length <= 3));
    for (const lesson of result.lessons) assert.equal(lesson.guidance, lesson.id === 'scoped' ? 'S'.repeat(1100) : 'Synthetic advice common.');
  }
  assert.deepEqual(state, before);
});

test('common-scope requests are not duplicated and same-authority conflicting advice stays withheld', async () => {
  let state = await active(createState(), 'rule-a', { conflictKey: 'same-rule', guidance: 'First advice' });
  state = await active(state, 'rule-b', { conflictKey: 'same-rule', guidance: 'Second advice' });
  const result = context(state);
  assert.equal(result.lessons.length, 0);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].reason, 'equal_authority_conflict');
  const common = hostMemoryContext(state, { domain: 'orchestration', operation: 'learning.scope' }, { now: NOW });
  assert.deepEqual(common.lessons, []);
  assert.equal(common.readOnly, true);
});

test('unknown selectors, rule-use payloads, URLs, credentials and executable-shaped values are rejected', () => {
  const state = createState(); let invoked = 0;
  const malformed = [
    { ...request(), ownerScope: 'another-owner' }, { ...request(), file: '/private/memory.json' },
    { ...request(), engine: 'jh-server' }, { ...request(), context: HOST_MEMORY_CONTEXT },
    { ...request(), taskId: 'server-task' }, { ...request(), attemptId: 'job_14' },
    request('bad-ref', { taskRef: 'https://private.invalid/' }),
    request('long-ref', { attemptRef: 'a'.repeat(97) }),
    request('bad-url', { operation: 'file:///private' }),
    request('secret', { observation: { errorCode: 'ghp_' + 'a'.repeat(32) } }),
    request('rule-use', { observation: { ruleUses: [] } }),
    request('raw-body', { observation: { body: 'private result text' } }),
  ];
  const getter = request();
  Object.defineProperty(getter, 'domain', { enumerable: true, get() { invoked++; return 'development'; } });
  malformed.push(getter, new Proxy(request(), { get() { invoked++; return undefined; } }));
  for (const input of malformed) assert.throws(() => observeHostMemory(state, input, { now: NOW }));
  assert.equal(invoked, 0);
  assert.deepEqual(state, createState());
  for (const input of [{ ...QUERY, engine: 'jh-server' }, { ...QUERY, max_chars: 255 }, { ...QUERY, limit: 11 }]) {
    assert.throws(() => hostMemoryContext(state, input, { now: NOW }));
  }
  assert.throws(() => hostMemoryTaskView(state, { taskRef: 'task', command_id: 'original-command' }));
});

test('verified outcomes require distinct evidence and user reports remain unverified', () => {
  for (const observation of [
    { outcome: 'success_verified' },
    { outcome: 'failure_verified', source: 'user_reported', evidenceRefs: ['source:synthetic-host-memory/proof', 'artifact:synthetic-extra'] },
  ]) assert.throws(() => write(createState(), 'proof', { observation }));
  const result = write(createState(), 'reported', { observation: { source: 'user_reported', outcome: 'observed' } });
  assert.equal(context(result.state).episodes[0].projection.source, 'user_reported');
  assert.equal(result.liveExecutionVerified, false);
});

test('empty and bounded task views leave memory unchanged and cannot enumerate another host task', () => {
  let state = createState();
  const absent = hostMemoryTaskView(state, { taskRef: 'missing' });
  assert.equal(absent.found, false);
  assert.equal(absent.readOnly, true);
  for (let index = 0; index < 12; index++) state = write(state, `many-${index}`, { attemptRef: `attempt-${index}` }).state;
  const before = structuredClone(state);
  const view = hostMemoryTaskView(state, { taskRef: 'synthetic-task', limit: 10 });
  assert.equal(view.counts.matchingAttempts, 12);
  assert.equal(view.attempts.length + view.omittedAttempts, 12);
  assert.equal(view.counts.returnedAttempts, view.attempts.length);
  assert.ok(view.budget.selectedChars <= 16000);
  assert.equal(hostMemoryTaskView(state, { taskRef: 'missing' }).found, false);
  assert.deepEqual(state, before);
});
