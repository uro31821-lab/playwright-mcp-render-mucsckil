import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, addLesson, evaluateLesson, ingest } from './engine.mjs';
import { bindRegression, runRegression } from './regression.mjs';
import { evaluateConstraints } from './constraints.mjs';
import { prepareRuleUse } from './rule-usage.mjs';
import { observeTask } from './host-observations.mjs';
import { prepareReview, createReviewedCandidate } from './curation.mjs';
import { decideProposal } from './decisions.mjs';
import { registerReviewedCandidate } from './progress.mjs';
import { ruleUseHash } from './rule-use-contract.mjs';
import { prepareReviewContext } from './review-context.mjs';

// Synthetic in-memory proposals and observations only. These tests never read or
// update operating memory, retrieve source contents, or replay actual work.
const SCOPE = { domain: 'output', operation: 'summary.format', engine: 'synthetic-review-context',
  context: { platform: 'node', version: '1', environment: 'synthetic-test' } };
const COMMON = { ...SCOPE, domain: 'orchestration', operation: 'learning.scope' };
const OTHER = { ...SCOPE, domain: 'research', operation: 'source.check' };
const EVALUATED = '2026-11-01T08:00:00Z';
const SELECTED = '2026-11-01T09:00:00Z';
const APPLIED = '2026-11-01T09:01:00Z';
const OBSERVED = '2026-11-01T09:02:00Z';
const LATER = '2026-11-01T09:03:00Z';
const NOW = '2026-11-01T10:00:00Z';
const GUIDANCE = 'Preserve the checked source when reporting the synthetic result.';
const SUITE = { id: 'source-present', version: '1', cases: [
  { id: 'present', input: { value: { source: 'fixture:source' }, constraints: [{ path: ['source'], op: 'exists' }] },
    expected: { passed: true, failed: [] } },
] };
const clone = value => structuredClone(value);
async function active(extra = {}) {
  const lesson = bindRegression({ id: 'common-rule', ...clone(COMMON), ruleVersion: '1', guidance: GUIDANCE,
    evidenceRefs: ['fixture:rule-definition'], ...extra }, SUITE);
  const checked = await runRegression(lesson, SUITE, evaluateConstraints, { now: EVALUATED });
  return evaluateLesson(addLesson(createState(), lesson), lesson.id, checked.evaluation);
}
function record(state, { taskId = 'task-one', attemptId = 'attempt-one', scope = SCOPE,
  withUse = true, outcome = 'failure_verified', timestamp = OBSERVED,
  selectedAt = SELECTED, appliedAt = APPLIED, evidenceRefs = [],
  tag = `${taskId}-${attemptId}-${Object.keys(state.events).length}` } = {}) {
  const observationRef = `source:observation-${tag}`; const useRef = `source:use-${tag}`;
  const selection = withUse ? prepareRuleUse(state, { taskId, attemptId, lessonId: 'common-rule',
    scope: clone(scope), globalRecall: clone(COMMON) }, { now: selectedAt }).selection : null;
  const usage = withUse ? { useRef, selection, appliedAt, confirmation: 'applied_in_this_attempt',
    evidenceRefs: [useRef, `artifact:application-${tag}`] } : null;
  return observeTask(state, { taskId, attemptId, scope: clone(scope), observationRef, expectedRevision: state.revision,
    observation: { timestamp, outcome, source: 'host_verified', errorCode: 'SOURCE',
      evidenceRefs: [observationRef, `artifact:result-${tag}`, ...(usage?.evidenceRefs ?? []), ...evidenceRefs],
      ...(usage ? { ruleUses: [usage] } : {}) } }, { now: NOW });
}
async function fixture(extra = {}) {
  let state = await active(extra);
  const firstUse = record(state, { outcome: 'pending' }); state = firstUse.state;
  const firstResult = record(state, { withUse: false, timestamp: LATER }); state = firstResult.state;
  const second = record(state, { taskId: 'task-two' }); state = second.state;
  const proposalId = Object.values(state.proposals).find(value => value.kind === 'rule_fix').id;
  return { state, proposalId, firstUseId: firstUse.event.eventId, firstResultId: firstResult.event.eventId, secondId: second.event.eventId };
}
const context = (state, proposalId, extra = {}) => prepareReviewContext(state, { proposalId, ...extra });
const firstRow = (view, taskId = 'task-one') => view.ruleUseEvidence.items.find(row => row.taskId === taskId);
function changedEvent(state, id, mutate) {
  const next = clone(state); mutate(next.events[id]);
  for (const [key, projected] of Object.entries(next.attempts)) if (projected.eventId === id) next.attempts[key] = clone(next.events[id]);
  return next;
}
function candidateReview(packet, eventIds) {
  return { proposalId: packet.proposal.id, baseRevision: packet.baseRevision, packetFingerprint: packet.packetFingerprint,
    maxAttempts: packet.maxAttempts, lessonId: 'reviewed-source-fix', ruleVersion: '1', scope: clone(SCOPE),
    cause: 'Reviewed synthetic inference about a missing source.', resolution: 'Retain the checked source.',
    expectedEffect: 'Make the source available for verification.', guidance: 'Include the checked source in the result.',
    eventIds, reviewer: 'agent' };
}

test('same-snapshot wrapper preserves the exact legacy packet and separates original use events from current result events', async () => {
  const { state, proposalId, firstUseId, firstResultId } = await fixture(); const before = clone(state);
  const result = context(state, proposalId); const row = firstRow(result); const use = row.precedingUses.items[0];
  assert.equal(result.schema, 'jh.learning-review-context.v1');
  assert.deepEqual(result.packet, prepareReview(state, { proposalId }));
  assert.equal(result.ruleUseEvidence.coverage, 'visible_packet_attempts');
  assert.equal(result.ruleUseEvidence.reviewPacketFingerprint, result.packet.packetFingerprint);
  assert.equal(result.ruleUseEvidence.baseRevision, result.packet.baseRevision);
  assert.equal(result.ruleUseEvidence.selectedResultCount, 2);
  assert.deepEqual(result.ruleUseEvidence.totals, { recordedUses: 2, precedingUses: 2, nonPrecedingUses: 0, resultsWithUses: 2, resultsWithPrecedingUses: 2 });
  assert.equal(row.resultEventId, firstResultId); assert.equal(use.recordedEventId, firstUseId);
  assert.notEqual(use.recordedEventId, row.resultEventId); assert.equal(use.recordedSequence, 1); assert.equal(row.result.sequence, 2);
  assert.deepEqual(row.scope, SCOPE);
  assert.equal(use.definition.status, 'matched'); assert.equal(use.definition.source, 'matching_stored_definition');
  assert.equal(use.definition.guidance, GUIDANCE); assert.deepEqual(use.definition.scope, COMMON);
  assert.equal(use.definition.observedDefinitionFingerprint, use.definitionFingerprint);
  assert.equal(result.ruleUseEvidence.sourceAuthentication, 'host_attestation');
  assert.equal(result.ruleUseEvidence.historicalOnly, true);
  for (const key of ['independentApplicationVerified', 'preActionTimingVerified', 'causalEffectVerified', 'liveImprovementVerified', 'currentSelectionVerified']) assert.equal(result.ruleUseEvidence[key], false);
  for (const key of ['readOnly', 'advisoryOnly']) assert.equal(result[key], true);
  assert.equal(result.externalEffects, false); assert.equal(result.replayAllowed, false);
  assert.doesNotMatch(JSON.stringify(result.ruleUseEvidence), /"(?:sourceEventIds|eventIds|candidateEvidenceEligible|holdout|ruleRemediationTried)":/);
  use.definition.guidance = 'changed returned copy'; use.definition.scope.context.version = 'copy';
  use.evidenceRefs.push('fixture:copy'); row.result.evidenceRefs.push('fixture:copy');
  assert.deepEqual(state, before);
});

test('original decision and candidate gates remain unchanged, including separate current verified improvement evidence', async () => {
  const base = await fixture();
  const improvement = record(base.state, { taskId: 'separate-improvement', withUse: false, outcome: 'success_verified', timestamp: NOW });
  const state = improvement.state; const wrapped = context(state, base.proposalId); const before = clone(state);
  const review = candidateReview(wrapped.packet, [base.firstResultId, improvement.event.eventId]);
  const candidate = createReviewedCandidate(state, review, SUITE);
  const registered = registerReviewedCandidate(state, review, SUITE, { now: NOW });
  const selectedIds = [base.firstResultId, improvement.event.eventId].sort();
  assert.deepEqual(candidate.reviewSummary.sourceEventIds, selectedIds);
  assert.deepEqual(registered.link.sourceEventIds, selectedIds);
  assert.equal(registered.link.packetFingerprint, wrapped.packet.packetFingerprint);
  assert.equal(wrapped.packet.attempts.some(row => row.eventId === improvement.event.eventId), false);
  assert.throws(() => createReviewedCandidate(state, { ...review, eventIds: [base.firstUseId] }, SUITE));
  assert.throws(() => createReviewedCandidate(state, { ...review, packetFingerprint: wrapped.ruleUseEvidence.fingerprint }, SUITE));
  const decision = { proposalId: base.proposalId, decisionId: 'review-context-decision', decision: 'accept', expectedRevision: state.revision,
    packetFingerprint: wrapped.packet.packetFingerprint, maxAttempts: wrapped.packet.maxAttempts,
    reviewer: 'agent', sourceRef: 'source:synthetic-review', reason: 'Review the existing scoped failure evidence.', eventIds: [base.firstResultId] };
  assert.equal(decideProposal(state, decision, { now: NOW }).proposal.status, 'accepted');
  assert.throws(() => decideProposal(state, { ...decision, packetFingerprint: wrapped.ruleUseEvidence.fingerprint }, { now: NOW }));
  assert.throws(() => decideProposal(state, { ...decision, eventIds: [improvement.event.eventId] }, { now: NOW }));
  assert.deepEqual(state, before);
});

test('visible packet attempts determine coverage, including a newer different attempt in the same task', async () => {
  const base = await fixture();
  let state = record(base.state, { taskId: 'task-one', attemptId: 'new-attempt', withUse: false, timestamp: '2026-11-01T09:04:00Z' }).state;
  state = record(state, { taskId: 'outside-task', scope: OTHER, outcome: 'success_verified' }).state;
  const wrapped = context(state, base.proposalId, { maxAttempts: 1 });
  assert.equal(wrapped.packet.attempts.length, 1); assert.equal(wrapped.packet.truncated, true);
  assert.equal(wrapped.ruleUseEvidence.selectedResultCount, 1);
  const row = wrapped.ruleUseEvidence.items[0];
  assert.equal(row.taskId, 'task-one'); assert.equal(row.attemptId, 'new-attempt');
  assert.equal(row.resultEventId, wrapped.packet.attempts[0].eventId);
  assert.deepEqual(row.precedingUses, { items: [], total: 0, omitted: 0 }); assert.equal(row.nonPrecedingUseCount, 0);
  assert.deepEqual(wrapped.ruleUseEvidence.totals, { recordedUses: 0, precedingUses: 0, nonPrecedingUses: 0, resultsWithUses: 0, resultsWithPrecedingUses: 0 });
  assert.doesNotMatch(JSON.stringify(wrapped.ruleUseEvidence), /outside-task|applicationVerified":true|used":false/);
});

test('no recorded use remains a zero-count row and no proposal is manufactured for an empty store', async () => {
  let state = await active();
  state = record(state, { taskId: 'no-use-one', withUse: false }).state;
  state = record(state, { taskId: 'no-use-two', withUse: false }).state;
  const proposalId = Object.keys(state.proposals)[0]; const before = clone(state); const wrapped = context(state, proposalId);
  assert.equal(wrapped.ruleUseEvidence.items.length, 2);
  for (const row of wrapped.ruleUseEvidence.items) {
    assert.deepEqual(row.precedingUses, { items: [], total: 0, omitted: 0 }); assert.equal(row.nonPrecedingUseCount, 0);
  }
  assert.equal(wrapped.ruleUseEvidence.totals.recordedUses, 0); assert.deepEqual(state, before);
  const empty = createState(); assert.throws(() => context(empty, 'unknown-proposal')); assert.deepEqual(empty, createState());
});

test('only sequence-and-time preceding uses are displayed; later attestations cannot inherit an older verified outcome', async () => {
  const base = await fixture();
  let state = record(base.state, { outcome: 'pending', timestamp: '2026-11-01T09:04:00Z', selectedAt: LATER, appliedAt: LATER }).state;
  const sequenceCase = context(state, base.proposalId); const row = firstRow(sequenceCase);
  assert.equal(row.resultEventId, base.firstResultId); assert.equal(row.precedingUses.total, 1); assert.equal(row.nonPrecedingUseCount, 1);
  assert.equal(sequenceCase.ruleUseEvidence.totals.nonPrecedingUses, 1);
  const oldClockResult = { eventId: 'legacy-result-before-application', taskId: 'task-one', attemptId: 'attempt-one', sequence: 4,
    ...clone(SCOPE), timestamp: SELECTED, outcome: 'failure_verified', source: 'host_verified', errorCode: 'SOURCE', evidenceRefs: ['fixture:old-clock-result'] };
  state = ingest(state, oldClockResult).state;
  const timeCase = firstRow(context(state, base.proposalId));
  assert.equal(timeCase.result.sequence, 4); assert.equal(timeCase.result.timestamp, SELECTED);
  assert.deepEqual(timeCase.precedingUses, { items: [], total: 0, omitted: 0 }); assert.equal(timeCase.nonPrecedingUseCount, 2);
  const equality = changedEvent(base.state, base.firstUseId, event => {
    event.ruleUses[0].appliedAt = LATER; event.timestamp = LATER;
  });
  assert.equal(firstRow(context(equality, base.proposalId)).precedingUses.total, 1);
});

test('historical guidance is shown only on exact definition binding; changed, missing and invalid definitions do not leak text', async () => {
  const { state, proposalId } = await fixture(); const original = context(state, proposalId);
  for (const [expected, mutate, forbidden] of [
    ['changed', value => { value.lessons['common-rule'].guidance = 'CURRENT REPLACEMENT TEXT'; }, 'CURRENT REPLACEMENT TEXT'],
    ['changed', value => { value.lessons['common-rule'].ruleVersion = '2'; }, GUIDANCE],
    ['missing', value => { delete value.lessons['common-rule']; }, GUIDANCE],
    ['invalid', value => { value.lessons['common-rule'].guidance = ''; }, GUIDANCE],
    ['invalid', value => { value.lessons['common-rule'].id = 'wrong-stored-id'; }, GUIDANCE],
  ]) {
    const changed = clone(state); mutate(changed);
    const result = context(changed, proposalId);
    assert.deepEqual(result.packet, original.packet); // the common rule is outside the proposal's actual scope
    assert.equal(firstRow(result).precedingUses.items[0].definition.status, expected);
    assert.equal(Object.hasOwn(firstRow(result).precedingUses.items[0].definition, 'guidance'), false);
    assert.equal(Object.hasOwn(firstRow(result).precedingUses.items[0].definition, 'source'), false);
    assert.ok(!JSON.stringify(result.ruleUseEvidence).includes(forbidden));
    assert.notEqual(result.ruleUseEvidence.fingerprint, original.ruleUseEvidence.fingerprint);
  }
  const quarantined = clone(state);
  quarantined.lessons['common-rule'].state = 'quarantined';
  quarantined.lessons['common-rule'].evaluation = { invalidCurrentEvaluation: true };
  quarantined.lessons['common-rule'].evaluationHistory = [];
  const historical = context(quarantined, proposalId);
  assert.equal(firstRow(historical).precedingUses.items[0].definition.status, 'matched');
  assert.equal(firstRow(historical).precedingUses.items[0].definition.guidance, GUIDANCE);
  assert.equal(historical.ruleUseEvidence.currentSelectionVerified, false);
});

test('a matching definition digest alone cannot override a different recorded version or input identity', async () => {
  const { state, proposalId, firstUseId } = await fixture();
  for (const [key, value] of [['ruleVersion', 'another-version'], ['inputFingerprint', 'a'.repeat(64)]]) {
    const changed = changedEvent(state, firstUseId, event => {
      const selected = event.ruleUses[0].selection; selected[key] = value;
      const { fingerprint, ...bound } = selected; selected.fingerprint = ruleUseHash(bound);
    });
    const definition = firstRow(context(changed, proposalId)).precedingUses.items[0].definition;
    assert.equal(definition.status, 'changed'); assert.equal(Object.hasOwn(definition, 'guidance'), false);
  }
});

test('omitted uses and omitted rows remain bound to the sidecar without changing the original packet fingerprint', async () => {
  const base = await fixture(); let state = base.state;
  for (let index = 0; index < 5; index++) state = record(state, { timestamp: LATER, selectedAt: LATER, appliedAt: LATER }).state;
  const full = context(state, base.proposalId); const row = firstRow(full);
  assert.equal(row.precedingUses.total, 6); assert.equal(row.precedingUses.items.length, 1); assert.equal(row.precedingUses.omitted, 5);
  const four = context(state, base.proposalId, { usageOptions: { maxUsesPerResult: 4 } });
  assert.equal(firstRow(four).precedingUses.items.length, 4); assert.equal(firstRow(four).precedingUses.omitted, 2);
  assert.notEqual(four.ruleUseEvidence.fingerprint, full.ruleUseEvidence.fingerprint);
  const changed = changedEvent(state, base.firstUseId, event => {
    event.ruleUses[0].evidenceRefs.push('fixture:omitted-application-evidence'); event.evidenceRefs.push('fixture:omitted-application-evidence');
  });
  const next = context(changed, base.proposalId);
  assert.deepEqual(next.packet, full.packet); assert.deepEqual(next.ruleUseEvidence.items, full.ruleUseEvidence.items);
  assert.notEqual(next.ruleUseEvidence.fingerprint, full.ruleUseEvidence.fingerprint);
  const hidden = context(state, base.proposalId, { usageOptions: { maxChars: 1 } });
  const hiddenChanged = context(changed, base.proposalId, { usageOptions: { maxChars: 1 } });
  assert.deepEqual(hidden.ruleUseEvidence.items, []); assert.equal(hidden.ruleUseEvidence.omittedResults, hidden.packet.attempts.length);
  assert.equal(hidden.ruleUseEvidence.totals.recordedUses, 7);
  assert.notEqual(hidden.ruleUseEvidence.fingerprint, hiddenChanged.ruleUseEvidence.fingerprint);
});

test('full current-result evidence beyond both displayed limits changes the sidecar fingerprint', async () => {
  const base = await fixture();
  const latest = record(base.state, { withUse: false, timestamp: '2026-11-01T09:05:00Z',
    evidenceRefs: Array.from({ length: 20 }, (_, index) => `fixture:result-extra-${index}`) });
  const full = context(latest.state, base.proposalId);
  const changed = changedEvent(latest.state, latest.event.eventId, event => { event.evidenceRefs[event.evidenceRefs.length - 1] = 'fixture:changed-hidden-result-evidence'; });
  const next = context(changed, base.proposalId);
  assert.deepEqual(next.packet, full.packet); assert.deepEqual(next.ruleUseEvidence.items, full.ruleUseEvidence.items);
  assert.notEqual(next.ruleUseEvidence.fingerprint, full.ruleUseEvidence.fingerprint);
  const row = firstRow(full);
  assert.equal(row.result.evidenceRefs.length, 8); assert.equal(row.result.evidenceRefsOmitted, 14); assert.equal(row.result.evidenceRefsTruncated, true);
});

test('whole-row Unicode budgets and definition text preserve complete receipts, with totals computed before omissions', async () => {
  const guidance = '검증된 결과와 출처를 함께 기록한다. 😀';
  const { state, proposalId } = await fixture({ guidance });
  const full = context(state, proposalId, { maxAttempts: 1 }); const row = full.ruleUseEvidence.items[0];
  assert.equal(row.precedingUses.items[0].definition.guidance, guidance);
  const chars = [...JSON.stringify(row)].length;
  assert.ok(chars < JSON.stringify(row).length);
  const exact = context(state, proposalId, { maxAttempts: 1, usageOptions: { maxChars: chars } });
  const short = context(state, proposalId, { maxAttempts: 1, usageOptions: { maxChars: chars - 1 } });
  assert.equal(exact.ruleUseEvidence.items.length, 1); assert.deepEqual(short.ruleUseEvidence.items, []);
  assert.equal(short.ruleUseEvidence.omittedResults, 1); assert.deepEqual(short.ruleUseEvidence.totals, full.ruleUseEvidence.totals);
  assert.deepEqual(exact.packet, short.packet);
});

test('valid raw historical evidence above the small hash helper limit is fingerprinted without a 1 MiB cap', async () => {
  const base = await fixture(); const state = clone(base.state); const template = clone(state.events[base.firstUseId]);
  const longEvidence = Array.from({ length: 7 }, (_, index) => `artifact:large-${index}-` + 'q'.repeat(200));
  let finalEvent;
  for (let index = 0; index < 320; index++) {
    const event = clone(template); event.eventId = `large-history-${index}`; event.sequence = index + 10;
    event.timestamp = LATER; event.outcome = 'failure_verified';
    const useRef = `source:large-use-${index}`;
    event.ruleUses[0].useRef = useRef; event.ruleUses[0].evidenceRefs = [useRef, ...longEvidence];
    event.evidenceRefs = [`source:large-result-${index}`, useRef, ...longEvidence];
    state.events[event.eventId] = event; finalEvent = event;
  }
  state.attempts[ruleUseHash([finalEvent.taskId, finalEvent.attemptId])] = clone(finalEvent);
  state.revision += 320;
  assert.ok(JSON.stringify(Object.values(state.events).filter(event => event.taskId === 'task-one')).length > 1024 * 1024);
  const before = clone(state); const result = context(state, base.proposalId, { usageOptions: { maxChars: 32768 } });
  assert.equal(result.ruleUseEvidence.totals.recordedUses, 322);
  assert.equal(firstRow(result).precedingUses.total, 321);
  assert.match(result.ruleUseEvidence.fingerprint, /^[a-f0-9]{64}$/); assert.deepEqual(state, before);
});

test('queries, external packets, revision selectors, clocks and invalid usage budgets are not accepted by the pure API', async () => {
  const { state, proposalId } = await fixture(); const before = clone(state);
  for (const input of [null, [], {}, { proposalId, packet: prepareReview(state, { proposalId }) },
    { proposalId, queries: [SCOPE] }, { proposalId, revision: state.revision }, { proposalId, now: NOW },
    { proposalId, owner: 'another' }, { proposalId, maxAttempts: 0 }, { proposalId, maxAttempts: 33 },
    { proposalId, usageOptions: null }, { proposalId, usageOptions: { maxUsesPerResult: 0 } },
    { proposalId, usageOptions: { maxUsesPerResult: 5 } }, { proposalId, usageOptions: { maxChars: 0 } },
    { proposalId, usageOptions: { maxChars: 32769 } }, { proposalId, usageOptions: { seenNoticeFingerprints: [] } }]) {
    assert.throws(() => prepareReviewContext(state, input));
  }
  assert.deepEqual(state, before);
});

test('global raw-history validation prevents out-of-scope corruption and executable state before the older curation path', async () => {
  const base = await fixture(); const added = record(base.state, { taskId: 'outside', scope: OTHER, outcome: 'success_verified' });
  const state = added.state;
  for (const mutate of [
    value => { value.events[added.event.eventId].ruleUses[0].selection.fingerprint = '0'.repeat(64); },
    value => { delete value.attempts[ruleUseHash(['outside', 'attempt-one'])]; },
    value => { value.attempts[ruleUseHash(['outside', 'attempt-one'])].outcome = 'failure_verified'; },
  ]) { const broken = clone(state); mutate(broken); assert.throws(() => context(broken, base.proposalId)); }
  let invoked = 0;
  const getter = clone(state); Object.defineProperty(getter.lessons['common-rule'], 'guidance', { enumerable: true, get() { invoked++; return GUIDANCE; } });
  const proxy = new Proxy({}, { get() { invoked++; }, getPrototypeOf() { invoked++; } });
  const proxyState = clone(state); proxyState.events.hidden = proxy;
  const cycle = clone(state); cycle.proposals.cycle = cycle;
  const sparse = clone(state); sparse.lessons['common-rule'].evidenceRefs = new Array(1);
  for (const bad of [getter, proxyState, cycle, sparse]) assert.throws(() => context(bad, base.proposalId));
  const input = { proposalId: base.proposalId }; Object.defineProperty(input, 'usageOptions', { enumerable: true, get() { invoked++; return {}; } });
  assert.throws(() => prepareReviewContext(state, input)); assert.throws(() => prepareReviewContext(state, proxy));
  assert.equal(invoked, 0);
  const secret = 'github_pat_' + 'Q'.repeat(40); const secretState = clone(state); secretState.proposals.unrelated = { reason: secret };
  assert.throws(() => context(secretState, base.proposalId), error => error instanceof TypeError && !error.message.includes(secret));
});
