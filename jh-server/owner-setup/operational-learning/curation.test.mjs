import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, ingest, propose, addLesson, evaluateLesson, setProposalStatus, recall } from './engine.mjs';
import { prepareReview, createReviewedCandidate } from './curation.mjs';
import { bindRegression, runRegression } from './regression.mjs';
import { evaluateConstraints } from './constraints.mjs';

const NOW = '2026-10-31T10:00:00.000Z';
const SCOPE = { domain: 'output', operation: 'result.report', engine: 'synthetic-review',
  context: { platform: 'node', version: '1', environment: 'synthetic-test' } };
const SUITE = { id: 'completion-report', version: '1', cases: [
  { id: 'unknown-preserved', input: { value: { status: 'completion_unknown' }, constraints: [
    { path: ['status'], op: 'equals', expected: 'completion_unknown' },
  ] }, expected: { passed: true, failed: [] } },
  { id: 'false-success-rejected', input: { value: { status: 'success_verified' }, constraints: [
    { path: ['status'], op: 'equals', expected: 'completion_unknown' },
  ] }, expected: { passed: false, failed: [0] } },
] };
function event(id, overrides = {}) {
  return { eventId: id, taskId: 'task-' + id, attemptId: 'attempt-' + id, sequence: 1,
    timestamp: NOW, ...structuredClone(SCOPE), outcome: 'failure_verified', source: 'host_verified',
    evidenceRefs: ['fixture:' + id], errorCode: 'RESULT_WITHOUT_RECEIPT', ...overrides };
}
function sourceState(events = [event('a'), event('b')]) {
  let state = createState();
  for (const item of events) state = ingest(state, item).state;
  return propose(state, { now: NOW }).state;
}
function packet(state, overrides = {}) {
  return prepareReview(state, { proposalId: Object.keys(state.proposals)[0], ...overrides });
}
function review(state, overrides = {}, preparation = {}) {
  const source = packet(state, preparation);
  return { proposalId: source.proposal.id, baseRevision: source.baseRevision,
    packetFingerprint: source.packetFingerprint, maxAttempts: source.maxAttempts,
    lessonId: 'result-receipt-guidance', ruleVersion: '1', scope: structuredClone(SCOPE),
    cause: 'The reviewed evidence suggests that completion and receipt confirmation were conflated.',
    resolution: 'Keep an unknown result until the existing attempt has a verified receipt.',
    expectedEffect: 'Reduce false success statements; savings have not been measured.',
    guidance: 'Read the existing attempt receipt before reporting success; preserve an unknown outcome when receipt evidence is absent.',
    eventIds: ['a', 'b'], reviewer: 'agent', ...overrides };
}

test('review packets select independent current attempts and bound the visible evidence', () => {
  const initial = event('a');
  const polls = Array.from({ length: 6 }, (_, i) => event('poll-' + i, {
    taskId: initial.taskId, attemptId: initial.attemptId, sequence: i + 2,
  }));
  const state = sourceState([initial, ...polls, event('b'), event('c')]);
  const before = structuredClone(state);
  const result = packet(state, { maxAttempts: 2 });
  assert.equal(result.totalMatchingAttempts, 3);
  assert.equal(result.independentTaskCount, 3);
  assert.equal(result.attempts.length, 2);
  assert.equal(result.truncated, true);
  assert.equal(new Set(result.attempts.map(item => item.taskId)).size, 2);
  assert.equal(result.automaticInference, false);
  assert.equal(result.candidateEligible, true);
  assert.ok(result.attempts.every(item => !ownRawData(item)));
  assert.deepEqual(state, before);
  assert.deepEqual(packet(state, { maxAttempts: 2 }), result);
});
function ownRawData(value) { return ['messages', 'raw', 'rawTrace', 'responseBody', 'command'].some(key => Object.hasOwn(value, key)); }

test('multiple attempts in one task remain one independent task in the packet', () => {
  const state = sourceState([event('a'), event('retry', { taskId: 'task-a' }), event('b')]);
  const result = packet(state);
  assert.equal(result.totalMatchingAttempts, 3);
  assert.equal(result.independentTaskCount, 2);
  assert.equal(result.attempts.length, 2);
});

test('packet exposes only the matching scope and caps current lesson summaries', () => {
  let state = sourceState();
  for (let i = 0; i < 22; i++) state = addLesson(state, {
    id: 'same-scope-' + i, ...SCOPE, guidance: 'Synthetic scoped advice.', evidenceRefs: ['fixture:prior'], ruleVersion: '1',
  });
  state = addLesson(state, { id: 'foreign-scope', ...SCOPE, operation: 'other.operation',
    guidance: 'Unrelated advice.', evidenceRefs: ['fixture:other'], ruleVersion: '1' });
  const result = packet(state);
  assert.equal(result.currentLessons.length, 20);
  assert.equal(result.currentLessonsTruncated, true);
  assert.ok(result.currentLessons.every(item => item.operation === SCOPE.operation && item.state === 'candidate'));
});

test('a reviewed candidate binds actual fixtures and cannot activate itself or change observed outcomes', async () => {
  const state = sourceState(); const before = structuredClone(state);
  const result = createReviewedCandidate(state, review(state), SUITE);
  assert.deepEqual(state, before);
  assert.equal(result.lesson.state, 'candidate');
  assert.equal(result.lesson.memoryKind, 'procedure');
  assert.equal(result.lesson.provenance, 'model_inferred');
  assert.equal(result.lesson.reflection.assessment, 'reviewed_inference');
  assert.deepEqual(result.lesson.reflection.eventIds, ['a', 'b']);
  assert.equal(result.reviewSummary.activationPerformed, false);
  assert.equal(result.reviewSummary.externalEffects, false);
  assert.equal(result.reviewSummary.independentTaskCount, 2);
  const saved = addLesson(state, result.lesson);
  assert.deepEqual(recall(saved, SCOPE), []);
  const tested = await runRegression(result.lesson, result.suite, evaluateConstraints, { now: NOW });
  assert.equal(tested.report.passed, 2);
  const active = evaluateLesson(saved, result.lesson.id, tested.evaluation);
  assert.equal(active.lessons[result.lesson.id].state, 'active');
  assert.equal(active.lessons[result.lesson.id].reflection.assessment, 'reviewed_inference');
  assert.deepEqual(active.events, before.events);
  assert.deepEqual(active.proposals, before.proposals);
});

test('revision, packet contents, and preparation bounds must still match', () => {
  const state = sourceState(); const original = review(state);
  const changed = ingest(state, event('new-event')).state;
  assert.throws(() => createReviewedCandidate(changed, original, SUITE), /revision/);
  assert.throws(() => createReviewedCandidate(state, { ...original, packetFingerprint: '0'.repeat(64) }, SUITE), /packet/);
  assert.throws(() => createReviewedCandidate(state, { ...original, maxAttempts: 1 }, SUITE), /packet/);
  assert.throws(() => packet(state, { maxAttempts: 33 }), /maxAttempts/);
  assert.throws(() => packet(state, { maxAttempts: 0 }), /maxAttempts/);
});

test('closed proposals are never implicitly reopened by review or curation', () => {
  for (const status of ['dismissed', 'implemented', 'verified', 'resolved']) {
    let state = sourceState(); const id = Object.keys(state.proposals)[0];
    // Terminal variants represent previously persisted statuses, not transitions performed by curation.
    state = structuredClone(state); state.proposals[id].status = status;
    const before = structuredClone(state);
    assert.throws(() => packet(state), /open or accepted/);
    assert.deepEqual(state, before);
  }
  let state = sourceState(); const id = Object.keys(state.proposals)[0];
  state = setProposalStatus(state, id, 'accepted');
  assert.equal(packet(state).proposal.status, 'accepted');
});

test('unknown, unverified, missing, foreign-scope and repeated source evidence is rejected', () => {
  let state = sourceState();
  for (const item of [event('unknown', { outcome: 'completion_unknown' }),
    event('reported', { outcome: 'correction', source: 'user_reported' }),
    event('foreign', { operation: 'other.operation' })]) state = ingest(state, item).state;
  for (const eventIds of [['a', 'missing'], ['a', 'unknown'], ['a', 'reported'], ['a', 'foreign'], ['a', 'a']]) {
    assert.throws(() => createReviewedCandidate(state, review(state, { eventIds }), SUITE));
  }
  assert.throws(() => createReviewedCandidate(state, review(state, { scope: { ...SCOPE, operation: 'other.operation' } }), SUITE));
});

test('historical polls from a current attempt cannot be double-counted as evidence', () => {
  let state = sourceState();
  state = ingest(state, event('a-new', { taskId: 'task-a', attemptId: 'attempt-a', sequence: 2 })).state;
  assert.throws(() => createReviewedCandidate(state, review(state, { eventIds: ['a', 'a-new'] }), SUITE), /current attempt/);
  const result = createReviewedCandidate(state, review(state, { eventIds: ['a-new', 'b'] }), SUITE);
  assert.equal(result.reviewSummary.independentTaskCount, 2);
});

test('verified same-scope fix evidence may supplement the matching failure pattern', () => {
  const state = ingest(sourceState(), event('fixed', { outcome: 'success_verified', errorCode: undefined })).state;
  const result = createReviewedCandidate(state, review(state, { eventIds: ['a', 'fixed'] }), SUITE);
  assert.deepEqual(result.lesson.reflection.eventIds, ['a', 'fixed']);
  assert.throws(() => createReviewedCandidate(state, review(state, { eventIds: ['fixed'] }), SUITE), /proposal pattern/);
});

test('explicit corrections can support inferred guidance but cannot increase its authority', () => {
  const state = sourceState([event('a', { outcome: 'correction', source: 'user_explicit' }),
    event('b', { outcome: 'correction', source: 'user_explicit' })]);
  const result = createReviewedCandidate(state, review(state), SUITE);
  assert.equal(result.lesson.provenance, 'model_inferred');
  for (const provenance of ['user_explicit', 'host_verified', 'legacy']) {
    assert.throws(() => createReviewedCandidate(state, review(state, { provenance }), SUITE), /higher provenance/);
  }
  assert.throws(() => createReviewedCandidate(state, review(state, { outcome: 'success_verified' }), SUITE), /fields/);
});

test('verification gaps and blocked attempts yield review packets, not verified candidates', () => {
  for (const outcome of ['completion_unknown', 'blocked']) {
    const state = sourceState([event('a', { outcome }), event('b', { outcome })]);
    assert.equal(packet(state).candidateEligible, false);
    assert.throws(() => createReviewedCandidate(state, review(state), SUITE), /verified or an explicit correction/);
  }
});

test('definition and suite equality deduplicate candidates across requested IDs without mutating state', () => {
  const state = sourceState();
  const first = createReviewedCandidate(state, review(state), SUITE);
  const saved = addLesson(state, first.lesson); const before = structuredClone(saved);
  const again = createReviewedCandidate(saved, review(saved, { lessonId: 'another-requested-id', eventIds: ['b', 'a'] }), structuredClone(SUITE));
  assert.equal(again.reviewSummary.duplicateLessonId, first.lesson.id);
  assert.equal(again.lesson.id, first.lesson.id);
  assert.equal(again.reviewSummary.definitionFingerprint, first.reviewSummary.definitionFingerprint);
  assert.deepEqual(addLesson(saved, again.lesson), saved);
  assert.deepEqual(saved, before);
  const changedSuite = structuredClone(SUITE); changedSuite.cases[0].expected = { passed: false, failed: [0] };
  const changed = createReviewedCandidate(saved, review(saved, { lessonId: 'changed-suite-candidate' }), changedSuite);
  assert.equal(changed.reviewSummary.duplicateLessonId, undefined);
  assert.notEqual(changed.lesson.inputFingerprint, first.lesson.inputFingerprint);
});

test('a quarantined definition is not resurrected by requesting a new lesson ID', async () => {
  let state = sourceState();
  const candidate = createReviewedCandidate(state, review(state), SUITE);
  state = addLesson(state, candidate.lesson);
  const failed = await runRegression(candidate.lesson, SUITE, () => ({ passed: true, failed: [] }), { now: NOW });
  assert.equal(failed.report.failed, 1);
  state = evaluateLesson(state, candidate.lesson.id, failed.evaluation);
  const before = structuredClone(state);
  assert.throws(() => createReviewedCandidate(state, review(state, { lessonId: 'revive-under-new-id' }), SUITE), /cannot be revived/);
  assert.deepEqual(state, before);
});

test('review content, regression inputs and permitted metadata remain in the definition fingerprint', () => {
  const state = sourceState();
  const result = createReviewedCandidate(state, review(state, { memoryKind: 'procedure', conflictKey: 'receipt-policy',
    validFrom: NOW, validUntil: '2026-11-30T10:00:00.000Z' }), SUITE);
  assert.equal(result.lesson.conflictKey, 'receipt-policy');
  assert.equal(bindRegression(result.lesson, SUITE).inputFingerprint, result.lesson.inputFingerprint);
  const altered = { ...result.lesson, reflection: { ...result.lesson.reflection, cause: 'Different reviewed inference.' } };
  assert.notEqual(bindRegression(altered, SUITE).inputFingerprint, result.lesson.inputFingerprint);
  assert.throws(() => createReviewedCandidate(state, review(state, { cause: 'x'.repeat(1025) }), SUITE));
  assert.throws(() => createReviewedCandidate(state, review(state), { ...SUITE, cases: [] }));
});

test('review data cannot invoke getters or carry an executable field', () => {
  const state = sourceState(); let invoked = false;
  const hostile = review(state);
  Object.defineProperty(hostile, 'cause', { enumerable: true, get() { invoked = true; return 'unsafe'; } });
  assert.throws(() => createReviewedCandidate(state, hostile, SUITE), /Accessors/);
  assert.equal(invoked, false);
  assert.throws(() => createReviewedCandidate(state, review(state, { command: 'do-something' }), SUITE), /fields/);
});

test('credential-shaped review text is rejected without echoing values or changing state', () => {
  const state = sourceState(); const before = structuredClone(state);
  const credentials = [
    'Bearer ' + 'A'.repeat(32),
    'sk-' + 'A'.repeat(32),
    'sk-proj-' + 'A'.repeat(32),
    'ghp_' + 'A'.repeat(32),
    'github_pat_' + 'A'.repeat(32),
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzeW50aGV0aWMifQ.c3ludGhldGljc2lnbmF0dXJl',
    '-----BEGIN PRIVATE KEY-----\nSYNTHETIC-NOT-A-KEY\n-----END PRIVATE KEY-----',
    '-----BEGIN RSA PRIVATE KEY-----\nSYNTHETIC-NOT-A-KEY\n-----END RSA PRIVATE KEY-----',
  ];
  for (const field of ['cause', 'resolution', 'expectedEffect', 'guidance']) {
    for (const credential of credentials) {
      const input = review(state, { [field]: `Synthetic review prefix: ${credential} suffix.` });
      const originalInput = structuredClone(input);
      assert.throws(() => createReviewedCandidate(state, input, SUITE), error => {
        assert.equal(error.message, `Invalid ${field}`);
        assert.equal(error.message.includes(credential), false);
        return true;
      });
      assert.deepEqual(input, originalInput);
      assert.deepEqual(state, before);
    }
  }
});

test('ordinary redaction and authentication guidance remains valid review text', () => {
  const state = sourceState();
  const candidate = createReviewedCandidate(state, review(state, {
    cause: 'The reviewed evidence suggests that the Bearer header was not checked.',
    resolution: 'Preserve the existing authentication flow and request a fresh receipt.',
    expectedEffect: 'Avoid repeating the action while its outcome is unknown.',
    guidance: 'Keep credentials out of logs and retain opaque evidence references.',
  }), SUITE);
  assert.equal(candidate.lesson.state, 'candidate');
  assert.equal(candidate.lesson.reflection.assessment, 'reviewed_inference');
});
