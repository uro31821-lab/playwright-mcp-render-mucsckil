import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, ingest, propose, addLesson, evaluateLesson } from './engine.mjs';
import { prepareReview, createReviewedCandidate } from './curation.mjs';
import { decideProposal } from './decisions.mjs';
import { bindRegression, runRegression } from './regression.mjs';
import { evaluateConstraints } from './constraints.mjs';
import { registerReviewedCandidate, proposalProgressView } from './progress.mjs';

const NOW = '2026-11-01T10:00:00.000Z';
const LATER = '2026-11-01T11:00:00.000Z';
const SCOPE = { domain: 'output', operation: 'result.report', engine: 'synthetic-progress',
  context: { platform: 'node', version: '1', environment: 'synthetic-test' } };
const COMMON = { ...SCOPE, domain: 'orchestration', operation: 'jh.common.rules' };
const SUITE = { id: 'completion-report', version: '1', cases: [
  { id: 'unknown-preserved', input: { value: { status: 'completion_unknown' }, constraints: [
    { path: ['status'], op: 'equals', expected: 'completion_unknown' },
  ] }, expected: { passed: true, failed: [] } },
  { id: 'false-success-rejected', input: { value: { status: 'success_verified' }, constraints: [
    { path: ['status'], op: 'equals', expected: 'completion_unknown' },
  ] }, expected: { passed: false, failed: [0] } },
] };
const copy = value => structuredClone(value);
function event(id, overrides = {}) {
  return { eventId: id, taskId: 'task-' + id, attemptId: 'attempt-' + id, sequence: 1,
    timestamp: NOW, ...copy(SCOPE), outcome: 'failure_verified', source: 'host_verified',
    evidenceRefs: ['fixture:' + id], errorCode: 'RESULT_WITHOUT_RECEIPT', ...overrides };
}
function sourceState() {
  return propose(ingest(ingest(createState(), event('a')).state, event('b')).state, { now: NOW }).state;
}
const proposalId = state => Object.keys(state.proposals)[0];
function review(state, overrides = {}) {
  const packet = prepareReview(state, { proposalId: proposalId(state) });
  return { proposalId: packet.proposal.id, baseRevision: packet.baseRevision,
    packetFingerprint: packet.packetFingerprint, maxAttempts: packet.maxAttempts,
    lessonId: 'result-receipt-guidance', ruleVersion: '1', scope: copy(SCOPE),
    cause: 'Completion was confused with receipt confirmation in the reviewed evidence.',
    resolution: 'Read the bound receipt for the existing attempt before reporting success.',
    expectedEffect: 'Reduce unsupported success reports; no live effect is verified.',
    guidance: 'Preserve an unknown outcome until the existing attempt has a verified receipt.',
    eventIds: ['a', 'b'], reviewer: 'agent', ...overrides };
}
const register = (state = sourceState(), overrides = {}, now = NOW) =>
  registerReviewedCandidate(state, review(state, overrides), SUITE, { now });
const view = (state, options = {}) => proposalProgressView(state, { proposalId: proposalId(state) }, { now: NOW, ...options });
async function checked(state, lessonId, { now = NOW, fail = false, extraRefs = [] } = {}) {
  const result = await runRegression(state.lessons[lessonId], SUITE,
    fail ? () => ({ syntheticMismatch: true }) : evaluateConstraints, { now });
  return evaluateLesson(state, lessonId, { ...result.evaluation,
    evidenceRefs: [...result.evaluation.evidenceRefs, ...extraRefs] });
}
async function otherActive(state, id, overrides = {}, now = NOW) {
  const definition = bindRegression({ id, ...copy(SCOPE), guidance: 'Independent synthetic guidance ' + id,
    evidenceRefs: ['fixture:' + id], ruleVersion: '1', provenance: 'model_inferred', ...overrides }, SUITE);
  return checked(addLesson(state, definition), id, { now });
}

test('registration atomically binds a candidate to the proposal without changing outcomes or activating it', () => {
  const state = sourceState(); const before = copy(state); const request = review(state);
  const result = registerReviewedCandidate(state, request, SUITE, { now: NOW });
  assert.equal(result.state.revision, state.revision + 1);
  assert.equal(result.duplicate, false);
  assert.equal(result.lesson.state, 'candidate');
  assert.equal(result.reviewSummary.activationPerformed, false);
  assert.deepEqual(result.state.events, state.events);
  assert.deepEqual(result.state.attempts, state.attempts);
  assert.equal(result.state.proposals[request.proposalId].status, 'open');
  assert.deepEqual(result.link, {
    schema: 'jh.learning-proposal-candidate-link.v1', lessonId: result.lesson.id,
    ruleVersion: '1', inputFingerprint: result.lesson.inputFingerprint, scope: SCOPE,
    registeredAt: NOW, baseRevision: state.revision, recordedRevision: state.revision + 1,
    reviewer: 'agent', provenance: 'model_inferred', packetFingerprint: request.packetFingerprint,
    sourceEventIds: ['a', 'b'], regression: { evaluator: 'jh.constraints.v1', suiteId: SUITE.id,
      suiteVersion: SUITE.version, validationScope: 'json_contract' },
  });
  const row = view(result.state).candidates[0];
  assert.equal(row.bindingStatus, 'matched');
  assert.equal(row.evaluation.status, 'not_run');
  assert.equal(row.recallIncluded, false);
  const persisted = copy(result.state);
  result.link.sourceEventIds.push('local-copy'); result.lesson.guidance = 'local-copy';
  result.suite.cases[0].expected.passed = false; result.reviewSummary.sourceEventIds.push('local-copy');
  assert.deepEqual(result.state, persisted);
  assert.deepEqual(state, before);
});

test('fresh retries preserve the first link and canonical active lesson while stale retries and quarantine fail closed', async () => {
  const initial = sourceState(); const originalRequest = review(initial);
  const result = registerReviewedCandidate(initial, originalRequest, SUITE, { now: NOW });
  const state = await checked(result.state, result.lesson.id); const before = copy(state);
  const duplicate = register(state, { lessonId: 'requested-alias', eventIds: ['b', 'a'] }, LATER);
  assert.strictEqual(duplicate.state, state);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.lesson.id, result.lesson.id);
  assert.equal(duplicate.lesson.state, 'active');
  assert.deepEqual(duplicate.link, result.link);
  assert.equal(Object.hasOwn(state.lessons, 'requested-alias'), false);
  assert.throws(() => registerReviewedCandidate(state, originalRequest, SUITE, { now: NOW }),
    { code: 'LEARNING_REVISION_CONFLICT' });
  assert.deepEqual(state, before);
  const quarantined = await checked(state, result.lesson.id, { now: LATER, fail: true });
  const quarantinedBefore = copy(quarantined);
  assert.throws(() => register(quarantined, { lessonId: 'revival-alias' }), /cannot be revived/);
  assert.deepEqual(quarantined, quarantinedBefore);
  assert.equal(view(quarantined).candidates[0].lessonState, 'quarantined');
});

test('invalid evidence, changed packets and closed proposals cannot leave orphan lessons or links', () => {
  const state = sourceState(); const before = copy(state); const request = review(state);
  for (const patch of [{ eventIds: ['missing'] }, { packetFingerprint: '0'.repeat(64) },
    { scope: { ...SCOPE, operation: 'foreign.operation' } }, { provenance: 'user_explicit' },
    { unsafeAuthority: true }]) {
    assert.throws(() => registerReviewedCandidate(state, { ...request, ...patch }, SUITE, { now: NOW }));
    assert.deepEqual(state, before);
  }
  for (const status of ['dismissed', 'resolved', 'implemented', 'verified']) {
    const closed = copy(state); closed.proposals[proposalId(closed)].status = status;
    assert.throws(() => registerReviewedCandidate(closed, request, SUITE, { now: NOW }), /open or accepted/);
    assert.deepEqual(closed.lessons, {});
    assert.equal(Object.hasOwn(closed.proposals[proposalId(closed)], 'candidateLinks'), false);
  }
});

test('legacy lessons stay unlinked until an explicit fresh registration links the existing candidate', () => {
  const initial = sourceState(); const prepared = createReviewedCandidate(initial, review(initial), SUITE);
  const state = addLesson(initial, prepared.lesson);
  assert.deepEqual(view(state).candidates, []);
  const result = register(state, { lessonId: 'new-requested-alias' });
  assert.equal(result.duplicate, false);
  assert.equal(result.state.revision, state.revision + 1);
  assert.deepEqual(result.state.lessons, state.lessons);
  assert.equal(result.link.lessonId, prepared.lesson.id);
  assert.equal(result.state.proposals[proposalId(state)].candidateLinks.length, 1);
});

test('proposal regeneration preserves candidate links and decision history, and progress reads every status without source attempts', () => {
  const registered = register(); const packet = prepareReview(registered.state, { proposalId: proposalId(registered.state) });
  const accepted = decideProposal(registered.state, { proposalId: packet.proposal.id,
    decisionId: 'synthetic-accept', decision: 'accept', expectedRevision: registered.state.revision,
    packetFingerprint: packet.packetFingerprint, reviewer: 'agent', sourceRef: 'source:synthetic-reviewer',
    reason: 'Prioritize the reviewed proposal.', eventIds: ['a', 'b'] }, { now: NOW }).state;
  const regenerated = propose(ingest(accepted, event('c')).state, { now: LATER }).state;
  assert.deepEqual(regenerated.proposals[packet.proposal.id].candidateLinks, accepted.proposals[packet.proposal.id].candidateLinks);
  assert.deepEqual(regenerated.proposals[packet.proposal.id].decisionHistory, accepted.proposals[packet.proposal.id].decisionHistory);
  for (const status of ['open', 'accepted', 'implemented', 'verified', 'dismissed', 'resolved']) {
    const historical = copy(regenerated); historical.proposals[packet.proposal.id].status = status;
    historical.events = {}; historical.attempts = {};
    const before = copy(historical); const result = view(historical);
    assert.equal(result.currentStatus, status);
    assert.equal(result.candidates.length, 1);
    assert.deepEqual(historical, before);
  }
});

test('progress follows current passing and failed receipts with bounded opaque evidence and no live success claim', async () => {
  const registered = register();
  const state = await checked(registered.state, registered.lesson.id,
    { extraRefs: Array.from({ length: 12 }, (_, i) => 'test:bounded-evidence-' + i) });
  const before = copy(state); const result = view(state); const row = result.candidates[0];
  assert.equal(row.lessonState, 'active'); assert.equal(row.evaluation.status, 'passed');
  assert.equal(row.evaluation.passed, 2); assert.equal(row.evaluation.failed, 0);
  assert.equal(row.evaluation.timestamp, NOW);
  assert.deepEqual(row.evaluation.evidenceRefs, state.lessons[registered.lesson.id].evaluation.evidenceRefs.slice(0, 8));
  assert.equal(row.evaluation.evidenceRefsTruncated, true);
  assert.equal(row.evaluation.definitionFingerprint, state.lessons[registered.lesson.id].evaluation.definitionFingerprint);
  assert.equal(row.recallIncluded, true); assert.equal(row.pastApplicationVerified, false);
  assert.equal(row.liveImprovementVerified, false); assert.equal(result.liveExecutionVerified, false);
  assert.equal(result.currentStatus, 'open'); assert.equal(result.readOnly, true);
  assert.equal(result.advisoryOnly, true); assert.equal(result.externalEffects, false);
  assert.doesNotMatch(JSON.stringify(result), /"(?:caseResults|actualHash|guidance|input)":/);
  row.link.sourceEventIds.push('local'); row.evaluation.evidenceRefs.push('local');
  assert.deepEqual(state, before);
  const failed = await checked(state, registered.lesson.id, { now: LATER, fail: true });
  const failedRow = view(failed).candidates[0];
  assert.equal(failedRow.lessonState, 'quarantined'); assert.equal(failedRow.evaluation.status, 'failed');
  assert.equal(failedRow.evaluation.failed, 2); assert.equal(failedRow.recallIncluded, false);
  assert.deepEqual(failed.proposals, state.proposals);
});

test('damaged evaluation bindings and raw evidence are never presented as passing or reusable', async () => {
  const registered = register(); const state = await checked(registered.state, registered.lesson.id);
  for (const mutate of [
    lesson => { lesson.evaluation.definitionFingerprint = 'f'.repeat(64); },
    lesson => { lesson.evaluation.passed += 1; },
    lesson => { lesson.evaluation.evidenceRefs = ['https://private.invalid/raw']; },
    lesson => { lesson.guidance = 'Changed text while keeping a stale fingerprint.'; },
  ]) {
    const damaged = copy(state); mutate(damaged.lessons[registered.lesson.id]);
    const before = copy(damaged); const row = view(damaged).candidates[0];
    assert.equal(row.evaluation.status, 'invalid'); assert.equal(row.recallIncluded, false);
    assert.deepEqual(row.evaluation.evidenceRefs, []); assert.equal(row.pastApplicationVerified, false);
    assert.deepEqual(damaged, before);
  }
});

test('temporal progress uses inclusive start and exclusive expiry without changing the stored lesson', async () => {
  const registered = register(sourceState(), { validFrom: '2026-11-01T12:00:00.000Z', validUntil: '2026-11-01T13:00:00.000Z' });
  const state = await checked(registered.state, registered.lesson.id); const before = copy(state);
  for (const [now, temporalStatus, included] of [
    [NOW, 'not_yet_valid', false], ['2026-11-01T12:00:00.000Z', 'in_window', true],
    ['2026-11-01T13:00:00.000Z', 'expired', false],
  ]) {
    const row = view(state, { now }).candidates[0];
    assert.equal(row.temporalStatus, temporalStatus); assert.equal(row.recallIncluded, included);
    assert.equal(row.lessonState, 'active'); assert.equal(row.evaluation.status, 'passed');
  }
  assert.deepEqual(state, before);
});

test('historically superseded candidates remain excluded when their replacement expires', async () => {
  const registered = register(); let state = await checked(registered.state, registered.lesson.id);
  state = await otherActive(state, 'replacement', { supersedes: [registered.lesson.id],
    validUntil: '2026-11-01T12:00:00.000Z' }, LATER);
  const row = view(state, { now: '2026-11-01T13:00:00.000Z' }).candidates[0];
  assert.equal(row.temporalStatus, 'in_window'); assert.equal(row.evaluation.status, 'passed');
  assert.equal(row.lessonState, 'active'); assert.equal(row.recallIncluded, false);
  assert.deepEqual(row.conflicts, []);
});

test('common-scope conflicts and higher authority are evaluated together only within the same engine context', async () => {
  const registered = register(sourceState(), { conflictKey: 'completion-report' });
  let state = await checked(registered.state, registered.lesson.id);
  state = await otherActive(state, 'common-inferred', { ...copy(COMMON), conflictKey: 'completion-report' });
  assert.equal(view(state).recallScope, 'candidate_only');
  assert.equal(view(state).candidates[0].recallIncluded, true);
  const common = view(state, { commonScope: COMMON });
  assert.equal(common.recallScope, 'candidate_and_common');
  assert.equal(common.candidates[0].recallIncluded, false);
  assert.deepEqual(common.candidates[0].conflicts, [{ conflictKey: 'completion-report',
    reason: 'equal_authority_conflict', lessonIds: ['common-inferred', registered.lesson.id].sort() }]);
  state = await otherActive(state, 'common-explicit', { ...copy(COMMON), conflictKey: 'completion-report', provenance: 'user_explicit' });
  assert.equal(view(state, { commonScope: COMMON }).candidates[0].recallIncluded, false);
  assert.deepEqual(view(state, { commonScope: COMMON }).candidates[0].conflicts, []);
  assert.throws(() => view(state, { commonScope: { ...COMMON, engine: 'foreign-engine' } }), /engine and context/);
  assert.throws(() => view(state, { commonScope: { ...COMMON, context: { ...COMMON.context, environment: 'foreign-env' } } }), /engine and context/);
});

test('recall budget omission is not reported as a failed evaluation', async () => {
  const registered = register(); let state = await checked(registered.state, registered.lesson.id);
  for (let index = 0; index < 20; index++) state = await otherActive(state, 'preferred-' + index, { provenance: 'user_explicit' });
  const result = view(state); const row = result.candidates[0];
  assert.deepEqual(result.recallBudget, { limit: 20, maxChars: 16384 });
  assert.equal(row.evaluation.status, 'passed'); assert.equal(row.temporalStatus, 'in_window');
  assert.equal(row.recallIncluded, false); assert.deepEqual(row.conflicts, []);
});

test('missing or changed current definitions remain visible without inventing an application or duplicate registration', () => {
  const registered = register(); const missing = copy(registered.state);
  delete missing.lessons[registered.lesson.id];
  const row = view(missing).candidates[0];
  assert.equal(row.bindingStatus, 'missing'); assert.equal(row.lessonState, null); assert.equal(row.recallIncluded, false);
  assert.throws(() => register(missing), /definition is missing/);
  assert.deepEqual(missing.lessons, {});
  for (const patch of [{ ruleVersion: '2' }, { inputFingerprint: 'f'.repeat(64) }, { operation: 'different.operation' }]) {
    const changed = copy(registered.state); Object.assign(changed.lessons[registered.lesson.id], patch);
    const changedRow = view(changed).candidates[0];
    assert.equal(changedRow.bindingStatus, 'changed'); assert.equal(changedRow.recallIncluded, false);
    assert.deepEqual(changedRow.link, registered.link);
  }
});

test('32 immutable links are the capacity, with no orphan lesson on the next registration and no growth for a fresh duplicate', () => {
  let state = sourceState(); let last;
  for (let index = 0; index < 32; index++) {
    last = register(state, { lessonId: 'candidate-' + index, guidance: 'Distinct reviewed candidate ' + index });
    state = last.state;
  }
  assert.equal(view(state).candidates.length, 32);
  const before = copy(state);
  assert.throws(() => register(state, { lessonId: 'candidate-33', guidance: 'Additional reviewed candidate' }),
    { code: 'LEARNING_PROGRESS_CAPACITY' });
  assert.deepEqual(state, before);
  assert.equal(Object.hasOwn(state.lessons, 'candidate-33'), false);
  const duplicate = register(state, { lessonId: 'alias-at-capacity', guidance: 'Distinct reviewed candidate 31' });
  assert.equal(duplicate.duplicate, true); assert.strictEqual(duplicate.state, state);
  assert.deepEqual(duplicate.link, last.link);
});

test('malformed links reject unknown fields, cross-scope values, nonstring suites and invalid provenance', () => {
  const registered = register();
  for (const mutate of [
    link => { link.rawMessage = 'private'; }, link => { link.scope.operation = 'other.operation'; },
    link => { link.regression.suiteId = 1; }, link => { link.regression.suiteVersion = 1; },
    link => { link.regression.validationScope = 'live_execution'; }, link => { link.reviewer = 'user'; },
    link => { link.provenance = 'user_explicit'; }, link => { link.recordedRevision += 10; },
    link => { link.sourceEventIds = ['a', 'a']; }, link => { link.sourceEventIds = ['b', 'a']; },
    link => { link.inputFingerprint = 'invalid'; },
  ]) {
    const damaged = copy(registered.state); mutate(damaged.proposals[proposalId(damaged)].candidateLinks[0]);
    const before = copy(damaged);
    assert.throws(() => view(damaged)); assert.throws(() => register(damaged));
    assert.deepEqual(damaged, before);
  }
  const duplicate = copy(registered.state);
  duplicate.proposals[proposalId(duplicate)].candidateLinks.push(copy(registered.link));
  assert.throws(() => view(duplicate));
});

test('pure progress APIs reject getters, proxies, custom array methods and toJSON hooks without executing them', () => {
  const state = sourceState(); let invoked = 0;
  const accessor = review(state);
  Object.defineProperty(accessor, 'guidance', { enumerable: true, get() { invoked++; return 'unsafe'; } });
  assert.throws(() => registerReviewedCandidate(state, accessor, SUITE, { now: NOW }));
  const custom = review(state); const prototype = Object.create(Array.prototype);
  prototype.map = prototype.forEach = prototype[Symbol.iterator] = () => { invoked++; throw new Error('must not execute'); };
  Object.setPrototypeOf(custom.eventIds, prototype);
  assert.throws(() => registerReviewedCandidate(state, custom, SUITE, { now: NOW }));
  const suite = { ...SUITE, toJSON() { invoked++; return {}; } };
  assert.throws(() => registerReviewedCandidate(state, review(state), suite, { now: NOW }));
  const proxy = new Proxy(state, { get() { invoked++; throw new Error('must not execute'); },
    ownKeys() { invoked++; throw new Error('must not execute'); } });
  assert.throws(() => proposalProgressView(proxy, { proposalId: proposalId(state) }, { now: NOW }));
  assert.throws(() => proposalProgressView(state, new Proxy({}, { get() { invoked++; } }), { now: NOW }));
  assert.equal(invoked, 0);
  assert.throws(() => view(state, { now: '2026-02-30T10:00:00.000Z' }));
  assert.throws(() => view(state, { rawCommand: 'forbidden' }));
  assert.throws(() => registerReviewedCandidate(state, review(state), SUITE, { now: NOW, commonScope: COMMON }));
});
