import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, ingest, propose } from './engine.mjs';
import { prepareReview } from './curation.mjs';
import { decideProposal, proposalDecisionView, decisionSummary } from './decisions.mjs';

// Private synthetic state only. These fixtures are not independent real-world
// experience, approval receipts, device actions, or a completed improvement.
const NOW = '2026-11-01T02:00:00.000Z';
const SCOPE = { domain: 'device', operation: 'life_android_open', engine: 'jh-server',
  context: { platform: 'fixture', version: '1', environment: 'decision-test' } };
function event(id, extra = {}) {
  return { ...structuredClone(SCOPE), eventId: id, taskId: 'task-' + id, attemptId: 'attempt-' + id,
    sequence: 1, timestamp: NOW, outcome: 'completion_unknown', source: 'host_verified',
    evidenceRefs: ['fixture:' + id.replaceAll(':', '-')], ...extra };
}
function sourceState(events = [event('a'), event('b')]) {
  let state = createState();
  for (const item of events) state = ingest(state, item).state;
  return propose(state, { now: NOW }).state;
}
function request(state, extra = {}) {
  const packet = prepareReview(state, { proposalId: extra.proposalId ?? Object.keys(state.proposals)[0],
    maxAttempts: extra.maxAttempts ?? 12 });
  return { proposalId: packet.proposal.id, decisionId: 'decision-accept', decision: 'accept',
    expectedRevision: state.revision, packetFingerprint: packet.packetFingerprint,
    reviewer: 'agent', sourceRef: 'source:fixture-review',
    reason: 'Prioritize checking the existing receipt before considering another action.',
    eventIds: packet.attempts.slice(0, 16).map(item => item.eventId), ...extra };
}
const decide = (state, input, options = { now: NOW }) => decideProposal(state, input, options);
const dismiss = state => request(state, { decisionId: 'decision-dismiss', decision: 'dismiss',
  reason: 'Do not pursue this proposal; preserve the original uncertain observation.' });

test('accepting an actual review packet records one decision without inventing evidence or success', () => {
  const state = sourceState(); const before = structuredClone(state); const input = request(state);
  assert.equal(prepareReview(state, { proposalId: input.proposalId }).candidateEligible, false);
  const result = decide(state, input);
  assert.deepEqual(state, before);
  assert.equal(result.duplicate, false);
  assert.equal(result.state.revision, state.revision + 1);
  assert.equal(result.proposal.status, 'accepted');
  assert.deepEqual(result.state.events, state.events);
  assert.deepEqual(result.state.attempts, state.attempts);
  assert.deepEqual(result.state.lessons, state.lessons);
  assert.equal(Object.keys(result.state.proposals).length, 1);
  assert.equal(result.receipt.fromStatus, 'open');
  assert.equal(result.receipt.toStatus, 'accepted');
  assert.equal(result.receipt.timestamp, NOW);
  assert.equal(result.receipt.baseRevision, state.revision);
  assert.equal(result.receipt.recordedRevision, result.state.revision);
  assert.deepEqual(result.receipt.eventIds, ['a', 'b']);
  assert.deepEqual(new Set(result.receipt.evidenceRefs), new Set(['source:fixture-review', 'event:a', 'event:b', 'fixture:a', 'fixture:b']));
  assert.equal(result.proposal.verification, undefined);
  assert.deepEqual(result.proposal.decisionHistory, [result.receipt]);
});

test('reviewer/source attestations must agree and never change source-event authority', () => {
  const state = sourceState();
  const result = decide(state, request(state, { reviewer: 'user', sourceRef: 'user:explicit-fixture-choice' }));
  assert.equal(result.receipt.reviewer, 'user');
  assert.equal(result.receipt.sourceRef, 'user:explicit-fixture-choice');
  assert.deepEqual(result.state.events, state.events);
  assert.equal(result.receipt.provenance, undefined);
  for (const extra of [
    { reviewer: 'user', sourceRef: 'source:agent-claim' },
    { reviewer: 'agent', sourceRef: 'user:claimed-user' },
    { reviewer: 'host' }, { sourceRef: 'https://example.test/raw-chat' }, { sourceRef: 'source:raw text' },
  ]) assert.throws(() => decide(state, request(state, extra)), TypeError);
});

test('accept then dismiss preserves both decisions and offers a readonly closed-proposal view', () => {
  const first = decide(sourceState(), request(sourceState()));
  const second = decide(first.state, dismiss(first.state));
  assert.equal(second.proposal.status, 'dismissed');
  assert.deepEqual(second.proposal.decisionHistory.map(item => [item.fromStatus, item.toStatus]),
    [['open', 'accepted'], ['accepted', 'dismissed']]);
  assert.equal(second.state.revision, first.state.revision + 1);
  const view = proposalDecisionView(second.state, { proposalId: second.proposal.id });
  assert.equal(view.currentStatus, 'dismissed');
  assert.deepEqual(view.allowedDecisions, []);
  assert.equal(view.readOnly, true);
  assert.equal(view.externalEffects, false);
  assert.equal(view.liveExecutionVerified, false);
  assert.equal(view.decisionHistory.length, 2);
  assert.equal(view.latestDecision.decisionId, 'decision-dismiss');
  assert.throws(() => prepareReview(second.state, { proposalId: second.proposal.id }), /open or accepted/);
  view.decisionHistory[0].reason = 'Changed local result'; view.scope.context.version = 'different';
  assert.equal(second.proposal.decisionHistory[0].reason, first.receipt.reason);
  assert.equal(second.state.proposals[second.proposal.id].scope.context.version, '1');
});

test('a lost-response retry recognizes normalized original payload before checking its old revision', () => {
  const original = sourceState(); const input = request(original);
  const accepted = decide(original, input);
  const dismissed = decide(accepted.state, dismiss(accepted.state));
  const before = structuredClone(dismissed.state);
  const repeat = decide(dismissed.state, { ...input, eventIds: [...input.eventIds].reverse(),
    maxAttempts: 12, reason: '  ' + input.reason + '  ' }, { now: '2026-11-02T00:00:00Z' });
  assert.equal(repeat.duplicate, true);
  assert.strictEqual(repeat.state, dismissed.state);
  assert.deepEqual(repeat.receipt, accepted.receipt);
  assert.equal(repeat.proposal.status, 'dismissed');
  assert.deepEqual(dismissed.state, before);
  repeat.receipt.reason = 'Only a response copy';
  assert.deepEqual(dismissed.state, before);
});

test('a decision ID cannot be reused for changed content or another proposal in the same owner store', () => {
  const original = sourceState([event('a'), event('b'), event('foreign', { operation: 'life_android_other' })]);
  const input = request(original); const accepted = decide(original, input);
  for (const extra of [{ reason: 'A different judgment' }, { decision: 'dismiss' },
    { eventIds: ['a'] }, { sourceRef: 'source:different-review' }, { expectedRevision: accepted.state.revision }]) {
    assert.throws(() => decide(accepted.state, { ...input, ...extra }), { code: 'LEARNING_DECISION_CONFLICT' });
  }
  const otherId = Object.keys(accepted.state.proposals).find(id => id !== input.proposalId);
  assert.throws(() => decide(accepted.state, request(accepted.state, { proposalId: otherId, decisionId: input.decisionId })),
    { code: 'LEARNING_DECISION_CONFLICT' });
});

test('a fresh ID cannot count the same status again or promote implementation or verification', () => {
  const state = sourceState(); const accepted = decide(state, request(state));
  assert.throws(() => decide(accepted.state, request(accepted.state, { decisionId: 'another-accept' })),
    { code: 'LEARNING_DECISION_CONFLICT' });
  for (const decision of ['implemented', 'verified', 'resolved', 'open', 'accept ']) {
    assert.throws(() => decide(state, { ...request(state), decision }), TypeError);
  }
  for (const status of ['implemented', 'verified', 'dismissed', 'resolved']) {
    const closed = structuredClone(state); closed.proposals[request(state).proposalId].status = status;
    assert.throws(() => decide(closed, request(state)), { code: 'LEARNING_DECISION_CONFLICT' });
  }
  assert.equal(accepted.proposal.decisionHistory.length, 1);
});

test('new decisions reject stale revisions and altered packets without changing the input state', () => {
  const original = sourceState(); const input = request(original);
  const updated = propose(ingest(original, event('later')).state, { now: NOW }).state;
  const before = structuredClone(updated);
  assert.throws(() => decide(updated, input), { code: 'LEARNING_REVISION_CONFLICT' });
  assert.throws(() => decide(updated, { ...input, expectedRevision: updated.revision }), { code: 'LEARNING_DECISION_CONFLICT' });
  assert.throws(() => decide(original, { ...input, packetFingerprint: '0'.repeat(64) }), { code: 'LEARNING_DECISION_CONFLICT' });
  assert.deepEqual(updated, before);
});

test('only current source event IDs visible in the exact prepared packet can support a decision', () => {
  const state = sourceState([event('a'), event('b'), event('foreign', { operation: 'other-operation' })]);
  const input = request(state, { maxAttempts: 1 });
  assert.equal(input.eventIds.length, 1);
  const hidden = ['a', 'b'].find(id => !input.eventIds.includes(id));
  for (const eventIds of [[hidden], ['foreign'], ['missing']]) assert.throws(() => decide(state, { ...input, eventIds }), TypeError);
  assert.throws(() => decide(state, { ...request(state), maxAttempts: 1 }), { code: 'LEARNING_DECISION_CONFLICT' });
  const previous = event('old');
  const replaced = sourceState([previous, event('new', { taskId: previous.taskId, attemptId: previous.attemptId, sequence: 2 })]);
  assert.throws(() => decide(replaced, { ...request(replaced), eventIds: ['old'] }), TypeError);
});

test('unknown fields, malformed IDs, non-JSON data and invalid bounds fail without a mutation', () => {
  const state = sourceState(); const before = structuredClone(state); const input = request(state);
  const cases = [
    { ...input, ownerScope: 'another-owner' }, { ...input, verification: { passed: 1 } },
    { ...input, decisionId: '' }, { ...input, expectedRevision: -1 },
    { ...input, reason: ' ' }, { ...input, reason: 'x'.repeat(513) }, { ...input, reason: 'bad\u0000text' },
    { ...input, reason: '\ud800' }, { ...input, eventIds: [] }, { ...input, eventIds: ['a', 'a'] },
    { ...input, eventIds: Array.from({ length: 17 }, (_, i) => 'case-' + i) },
    ...[null, 0, 33, 1.5, NaN].map(maxAttempts => ({ ...input, maxAttempts })),
  ];
  for (const value of cases) assert.throws(() => decide(state, value), TypeError);
  assert.deepEqual(state, before);
});

test('credential-shaped text, accessors and proxies are rejected before caller behavior can execute', () => {
  const state = sourceState(); const input = request(state); let calls = 0;
  for (const reason of ['Bearer ' + 'x'.repeat(30), 'sk-proj-' + 'a'.repeat(24),
    '-----BEGIN PRIVATE KEY-----', 'eyJabc.def.ghi']) assert.throws(() => decide(state, { ...input, reason }), TypeError);
  assert.throws(() => decide(state, { ...input, sourceRef: 'source:ghp_' + 'a'.repeat(24) }), TypeError);
  const getter = { ...input }; Object.defineProperty(getter, 'reason', { enumerable: true, get() { calls++; return 'unsafe'; } });
  const arrayGetter = [...input.eventIds]; Object.defineProperty(arrayGetter, '0', { enumerable: true, get() { calls++; return 'a'; } });
  const proxy = new Proxy(input, { get() { calls++; throw Error('do not run'); }, ownKeys() { calls++; throw Error('do not run'); } });
  const sparse = new Array(2); sparse[1] = 'a';
  const hidden = { ...input }; Object.defineProperty(hidden, 'private', { value: 'not JSON', enumerable: false });
  const inherited = [...input.eventIds]; const prototype = Object.create(Array.prototype);
  for (const key of ['forEach', 'map', Symbol.iterator]) prototype[key] = () => { calls++; throw Error('do not run'); };
  Object.setPrototypeOf(inherited, prototype);
  for (const value of [getter, proxy, hidden, { ...input, [Symbol('extra')]: true },
    { ...input, eventIds: arrayGetter }, { ...input, eventIds: sparse },
    { ...input, eventIds: inherited }]) assert.throws(() => decide(state, value), TypeError);
  assert.equal(calls, 0);
});

test('subsequent proposal generation preserves accepted and dismissed decision histories', () => {
  const original = sourceState(); const accepted = decide(original, request(original));
  const acceptedLater = propose(ingest(accepted.state, event('c')).state, { now: NOW });
  assert.equal(acceptedLater.state.proposals[accepted.proposal.id].status, 'accepted');
  assert.deepEqual(acceptedLater.state.proposals[accepted.proposal.id].decisionHistory, accepted.proposal.decisionHistory);
  assert.deepEqual(acceptedLater.proposals, []);
  const dismissed = decide(acceptedLater.state, dismiss(acceptedLater.state));
  const dismissedLater = propose(ingest(dismissed.state, event('d')).state, { now: NOW });
  assert.equal(dismissedLater.state.proposals[dismissed.proposal.id].status, 'dismissed');
  assert.deepEqual(dismissedLater.state.proposals[dismissed.proposal.id].decisionHistory, dismissed.proposal.decisionHistory);
  assert.deepEqual(dismissedLater.proposals, []);
  assert.equal(dismissedLater.state.proposals[dismissed.proposal.id].independentTaskCount, 4);
});

test('decision views support every existing status and expose a bounded summary without changing state', () => {
  const original = sourceState(); const id = Object.keys(original.proposals)[0];
  assert.equal(decisionSummary(original.proposals[id]), null);
  for (const status of ['open', 'accepted', 'implemented', 'verified', 'dismissed', 'resolved']) {
    const state = structuredClone(original); state.proposals[id].status = status; const before = structuredClone(state);
    const view = proposalDecisionView(state, { proposalId: id });
    assert.equal(view.currentStatus, status);
    assert.deepEqual(view.allowedDecisions, status === 'open' ? ['accept', 'dismiss'] : status === 'accepted' ? ['dismiss'] : []);
    assert.deepEqual(state, before);
  }
  const saved = decide(original, request(original));
  assert.deepEqual(Object.keys(decisionSummary(saved.proposal)).sort(),
    ['decisionId', 'decision', 'fromStatus', 'toStatus', 'timestamp', 'reviewer', 'sourceRef'].sort());
  assert.throws(() => proposalDecisionView(original, { proposalId: 'unknown' }), TypeError);
  assert.throws(() => proposalDecisionView(original, { proposalId: id, owner: 'other' }), TypeError);
});

test('derived evidence is bounded, retains source events, and reports truncation instead of inventing references', () => {
  const events = ['a:one', 'b'].map(id => event(id, {
    evidenceRefs: Array.from({ length: 64 }, (_, i) => 'fixture:' + id.replace(':', '-') + '-' + i),
  }));
  const state = sourceState(events); const result = decide(state, request(state));
  assert.equal(result.receipt.evidenceRefs.length, 64);
  assert.equal(result.receipt.evidenceRefsTruncated, true);
  assert.equal(result.receipt.evidenceRefs[0], 'source:fixture-review');
  assert.match(result.receipt.evidenceRefs[1], /^sha256:[a-f0-9]{64}$/);
  assert.equal(result.receipt.evidenceRefs[2], 'event:b');
  assert.ok(result.receipt.evidenceRefs.slice(3).every(ref => events.some(item => item.evidenceRefs.includes(ref))));
});

test('invalid server time and corrupt stored decision bindings cannot be presented as valid decisions', () => {
  const state = sourceState(); const input = request(state);
  for (const now of ['not-a-date', '2026-02-30T10:00:00Z', '2026-11-01T00:00:00+25:00']) {
    assert.throws(() => decide(state, input, { now }), TypeError);
  }
  assert.throws(() => decide(state, input, { now: NOW, owner: 'other' }), TypeError);
  const saved = decide(state, input); const damaged = structuredClone(saved.state);
  damaged.proposals[input.proposalId].decisionHistory[0].requestFingerprint = '0'.repeat(64);
  assert.throws(() => proposalDecisionView(damaged, { proposalId: input.proposalId }), TypeError);
  assert.throws(() => decide(damaged, input), TypeError);
  assert.equal(saved.state.proposals[input.proposalId].decisionHistory.length, 1);
});

test('unrelated legacy records without decision history do not block status hints or a valid decision', () => {
  const state = sourceState(); const validId = Object.keys(state.proposals)[0];
  const damaged = { ...structuredClone(state.proposals[validId]), id: 'legacy-without-scope', scope: null };
  state.proposals[damaged.id] = damaged; state.revision++;
  assert.equal(decisionSummary(damaged), null);
  const result = decide(state, request(state, { proposalId: validId }));
  assert.equal(result.proposal.status, 'accepted');
  assert.deepEqual(result.state.proposals[damaged.id], damaged);
  assert.throws(() => proposalDecisionView(state, { proposalId: damaged.id }), TypeError);
});
