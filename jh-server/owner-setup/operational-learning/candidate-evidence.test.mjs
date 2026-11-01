import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, addLesson, evaluateLesson, ingest, setProposalStatus } from './engine.mjs';
import { bindRegression, runRegression } from './regression.mjs';
import { evaluateConstraints } from './constraints.mjs';
import { prepareRuleUse } from './rule-usage.mjs';
import { observeTask } from './host-observations.mjs';
import { prepareReview, createReviewedCandidate } from './curation.mjs';
import { registerReviewedCandidate } from './progress.mjs';
import { decideProposal } from './decisions.mjs';
import { ruleUseHash } from './rule-use-contract.mjs';
import { prepareCandidateEvidence } from './candidate-evidence.mjs';

// Synthetic in-memory registration/history fixtures. No operating memory, file,
// network, action replay, or claimed real improvement is involved.
const SCOPE = { domain: 'output', operation: 'summary.format', engine: 'synthetic-candidate-evidence',
  context: { platform: 'node', version: '1', environment: 'synthetic-test' } };
const OTHER = { ...SCOPE, operation: 'source.check' };
const COMMON = { ...SCOPE, domain: 'orchestration', operation: 'learning.scope' };
const EVALUATED = '2026-11-01T08:00:00Z';
const SELECTED = '2026-11-01T09:00:00Z';
const APPLIED = '2026-11-01T09:01:00Z';
const OBSERVED = '2026-11-01T09:02:00Z';
const RESULT = '2026-11-01T09:03:00Z';
const REGISTERED = '2026-11-01T10:00:00Z';
const AFTER = '2026-11-01T11:00:00Z';
const NOW = '2026-11-01T12:00:00Z';
const GUIDANCE = 'Retain the checked source with each synthetic result.';
const SUITE = { id: 'checked-source', version: '1', cases: [
  { id: 'present', input: { value: { source: 'fixture:checked' }, constraints: [{ path: ['source'], op: 'exists' }] }, expected: { passed: true, failed: [] } },
] };
const clone = value => structuredClone(value);
async function active(extra = {}) {
  const lesson = bindRegression({ id: 'old-common-rule', ...clone(COMMON), ruleVersion: '1', guidance: GUIDANCE,
    evidenceRefs: ['fixture:original-rule'], ...extra }, SUITE);
  const checked = await runRegression(lesson, SUITE, evaluateConstraints, { now: EVALUATED });
  return evaluateLesson(addLesson(createState(), lesson), lesson.id, checked.evaluation);
}
function record(state, { taskId = 'task-one', attemptId = 'attempt-one', scope = SCOPE,
  outcome = 'failure_verified', withUse = true, timestamp = RESULT, selectedAt = SELECTED, appliedAt = APPLIED,
  evidenceRefs = [], metrics, labels, tag = `${taskId}-${attemptId}-${Object.keys(state.events).length}` } = {}) {
  const observationRef = `source:result-${tag}`; const useRef = `source:use-${tag}`;
  const selection = withUse ? prepareRuleUse(state, { taskId, attemptId, lessonId: 'old-common-rule',
    scope: clone(scope), globalRecall: clone(COMMON) }, { now: selectedAt }).selection : null;
  const usage = withUse ? { useRef, selection, appliedAt, confirmation: 'applied_in_this_attempt', evidenceRefs: [useRef, `artifact:application-${tag}`] } : null;
  return observeTask(state, { taskId, attemptId, scope: clone(scope), observationRef, expectedRevision: state.revision,
    observation: { timestamp, outcome, source: 'host_verified', errorCode: 'SOURCE',
      evidenceRefs: [observationRef, `artifact:observed-${tag}`, ...(usage?.evidenceRefs ?? []), ...evidenceRefs],
      ...(usage ? { ruleUses: [usage] } : {}), ...(metrics ? { metrics } : {}), ...(labels ? { labels } : {}) } }, { now: NOW });
}
function reviewFor(packet, sourceEventIds, extra = {}) {
  return { proposalId: packet.proposal.id, baseRevision: packet.baseRevision, packetFingerprint: packet.packetFingerprint,
    maxAttempts: packet.maxAttempts, lessonId: 'improved-candidate', ruleVersion: '1', scope: clone(SCOPE),
    cause: 'A reviewed inference about synthetic source omissions.', resolution: 'Keep a checked source with the result.',
    expectedEffect: 'Allow the result source to be inspected.', guidance: 'Include the source verification field.',
    eventIds: sourceEventIds, reviewer: 'agent', ...extra };
}
function register(state, proposalId, sourceEventIds, extra) {
  const packet = prepareReview(state, { proposalId });
  const review = reviewFor(packet, sourceEventIds, extra);
  return { ...registerReviewedCandidate(state, review, SUITE, { now: REGISTERED }), review, packet };
}
async function fixture({ withUse = true, improvement = false, extra = {} } = {}) {
  let state = await active(extra); const sourceIds = []; const originalUseIds = [];
  for (const taskId of ['task-one', 'task-two']) {
    const started = record(state, { taskId, outcome: 'pending', timestamp: OBSERVED, withUse, metrics: { durationMs: 100 } });
    state = started.state; originalUseIds.push(started.event.eventId);
    const finished = record(state, { taskId, withUse, metrics: { durationMs: 10 } });
    state = finished.state; sourceIds.push(finished.event.eventId);
  }
  if (improvement) {
    const better = record(state, { taskId: 'separate-improvement', outcome: 'success_verified', withUse: false });
    state = better.state; sourceIds.push(better.event.eventId);
  }
  const proposalId = Object.values(state.proposals).find(value => value.kind === 'rule_fix').id;
  const registered = register(state, proposalId, sourceIds);
  return { ...registered, proposalId, sourceIds, originalUseIds,
    input: { proposalId, lessonId: registered.link.lessonId, ruleVersion: registered.link.ruleVersion, inputFingerprint: registered.link.inputFingerprint } };
}
const read = (state, input, options) => prepareCandidateEvidence(state, { ...input, ...(options ? { options } : {}) });
const rowFor = (result, taskId = 'task-one') => result.items.find(row => row.taskId === taskId);
function changedEvent(state, eventId, mutate) {
  const next = clone(state); mutate(next.events[eventId]);
  for (const [key, projected] of Object.entries(next.attempts)) if (projected.eventId === eventId) next.attempts[key] = clone(next.events[eventId]);
  return next;
}

test('registered source anchors survive newer outcomes and closed proposals without claiming historical content or reviewer acknowledgment', async () => {
  const base = await fixture(); let state = base.state;
  for (const taskId of ['task-one', 'task-two']) state = record(state, { taskId, outcome: 'success_verified', withUse: false, timestamp: AFTER, metrics: { durationMs: 5 } }).state;
  state = setProposalStatus(state, base.proposalId, 'dismissed'); const before = clone(state);
  const result = read(state, base.input); const row = rowFor(result);
  assert.equal(result.schema, 'jh.learning-candidate-evidence.v1');
  assert.equal(result.currentStatus, 'dismissed'); assert.equal(result.derivation, 'derived_from_registered_sources');
  assert.equal(result.coverage, 'registered_source_events'); assert.equal(result.candidate.bindingStatus, 'matched');
  assert.equal(result.candidate.bindingBasis, 'registered_identity_fields');
  assert.deepEqual(result.registration.sourceEventIds, base.link.sourceEventIds);
  assert.equal(row.sourceEventId, base.sourceIds[0]); assert.equal(row.sourceRecord.eventId, base.sourceIds[0]);
  assert.equal(row.sourceRecord.outcome, 'failure_verified'); assert.equal(row.currentProjection.outcome, 'success_verified');
  assert.equal(row.currentProjection.isRegisteredSource, false); assert.notEqual(row.currentProjection.eventId, row.sourceEventId);
  assert.equal(row.precedingUses.total, 2); assert.equal(row.precedingUses.items.length, 1); assert.equal(row.precedingUses.omitted, 1);
  assert.deepEqual(result.totals, { registeredSources: 2, availableSources: 2, missingSources: 0, recordedUses: 4,
    precedingUses: 4, nonPrecedingUses: 0, sourcesWithUses: 2, sourcesWithPrecedingUses: 2 });
  assert.equal(result.sourceAuthentication, 'host_attestation');
  for (const key of ['availableAtRegistrationVerified', 'sourceContentAtRegistrationVerified', 'reviewerAcknowledgementVerified',
    'independentApplicationVerified', 'preActionTimingVerified', 'causalEffectVerified', 'liveExecutionVerified',
    'liveImprovementVerified', 'modelTrainingPerformed', 'currentSelectionVerified', 'externalEffects', 'replayAllowed']) assert.equal(result[key], false);
  assert.equal(result.readOnly, true); assert.equal(result.advisoryOnly, true); assert.equal(result.historicalOnly, true);
  result.registration.sourceEventIds.push('copy-only'); result.candidate.scope.context.version = 'copy';
  row.sourceRecord.evidenceRefs.push('fixture:copy'); row.currentProjection.evidenceRefs.push('fixture:copy');
  row.precedingUses.items[0].definition.guidance = 'copy only'; assert.deepEqual(state, before);
});

test('all registered sources are covered, including a separate eligible improvement that was outside the original visible packet', async () => {
  const base = await fixture({ improvement: true }); const result = read(base.state, base.input);
  const improvementId = base.sourceIds.at(-1);
  assert.equal(base.packet.attempts.some(item => item.eventId === improvementId), false);
  assert.equal(result.totals.registeredSources, 3); assert.equal(result.items.length, 3);
  const row = result.items.find(item => item.sourceEventId === improvementId);
  assert.equal(row.sourceRecord.outcome, 'success_verified'); assert.deepEqual(row.precedingUses, { items: [], total: 0, omitted: 0 });
  assert.equal(row.nonPrecedingUseCount, 0); assert.equal(row.currentProjection.isRegisteredSource, true);
  const withoutUses = await fixture({ withUse: false }); const empty = read(withoutUses.state, withoutUses.input);
  assert.equal(empty.items.length, 2); assert.equal(empty.totals.recordedUses, 0);
  assert.ok(empty.items.every(item => item.precedingUses.total === 0));
});

test('candidate binding is identity-only; changed, missing and invalid current candidates never erase registration sources', async () => {
  const base = await fixture(); const original = read(base.state, base.input);
  for (const [status, mutate] of [
    ['changed', state => { state.lessons[base.link.lessonId].ruleVersion = '2'; }],
    ['changed', state => { state.lessons[base.link.lessonId].inputFingerprint = 'a'.repeat(64); }],
    ['changed', state => { state.lessons[base.link.lessonId].operation = 'different.operation'; }],
    ['missing', state => { delete state.lessons[base.link.lessonId]; }],
    ['invalid', state => { state.lessons[base.link.lessonId].guidance = ''; }],
  ]) {
    const state = clone(base.state); mutate(state); const result = read(state, base.input);
    assert.equal(result.candidate.bindingStatus, status); assert.deepEqual(result.registration, original.registration);
    assert.deepEqual(result.items, original.items); assert.deepEqual(result.totals, original.totals);
  }
  const changedText = clone(base.state); changedText.lessons[base.link.lessonId].guidance = 'Changed current candidate text.';
  const current = read(changedText, base.input);
  assert.equal(current.candidate.bindingStatus, 'matched'); assert.equal(current.candidate.bindingBasis, 'registered_identity_fields');
  assert.equal(Object.hasOwn(current.candidate, 'guidance'), false); assert.ok(!JSON.stringify(current).includes('Changed current candidate text.'));
  assert.notEqual(current.fingerprint, original.fingerprint);
});

test('used-rule guidance requires its recorded full definition digest and does not evaluate current availability', async () => {
  const base = await fixture(); const original = read(base.state, base.input);
  const exact = rowFor(original).precedingUses.items[0].definition;
  assert.equal(exact.status, 'matched'); assert.equal(exact.source, 'matching_stored_definition'); assert.equal(exact.guidance, GUIDANCE);
  for (const [status, mutate] of [
    ['changed', state => { state.lessons['old-common-rule'].guidance = 'NEW RULE TEXT'; }],
    ['missing', state => { delete state.lessons['old-common-rule']; }],
    ['invalid', state => { state.lessons['old-common-rule'].guidance = null; }],
  ]) {
    const state = clone(base.state); mutate(state); const result = read(state, base.input);
    const definition = rowFor(result).precedingUses.items[0].definition;
    assert.equal(definition.status, status); assert.equal(Object.hasOwn(definition, 'guidance'), false);
    assert.ok(!JSON.stringify(result).includes('NEW RULE TEXT')); assert.deepEqual(result.totals, original.totals);
    assert.notEqual(result.fingerprint, original.fingerprint);
  }
  const quarantined = clone(base.state); quarantined.lessons['old-common-rule'].state = 'quarantined';
  quarantined.lessons['old-common-rule'].evaluation = { notAValidCurrentEvaluation: true };
  assert.equal(rowFor(read(quarantined, base.input)).precedingUses.items[0].definition.status, 'matched');
});

test('missing historical source IDs are explicit while a dangling current projection or invalid source is a hard error', async () => {
  const base = await fixture(); const latest = record(base.state, { outcome: 'success_verified', withUse: false, timestamp: AFTER });
  const missing = clone(latest.state); delete missing.events[base.sourceIds[0]];
  const result = read(missing, base.input); const row = result.items.find(item => item.sourceEventId === base.sourceIds[0]);
  assert.equal(row.sourceStatus, 'missing'); assert.equal(row.sourceRecord, null); assert.equal(row.currentProjection, null);
  assert.equal(row.taskId, null); assert.equal(row.attemptId, null); assert.equal(row.scope, null);
  assert.equal(result.totals.missingSources, 1); assert.equal(result.totals.availableSources, 1); assert.equal(result.totals.registeredSources, 2);
  assert.equal(row.precedingUses.total, 0);
  const dangling = clone(latest.state); delete dangling.events[latest.event.eventId]; assert.throws(() => read(dangling, base.input));
  const invalid = changedEvent(base.state, base.sourceIds[0], event => { event.outcome = 'completion_unknown'; });
  assert.throws(() => read(invalid, base.input));
});

test('uses after the registered source stay separate even when they precede a newer current result', async () => {
  const base = await fixture();
  let state = record(base.state, { timestamp: AFTER, selectedAt: '2026-11-01T10:50:00Z', appliedAt: '2026-11-01T10:51:00Z' }).state;
  state = record(state, { outcome: 'success_verified', withUse: false, timestamp: '2026-11-01T11:01:00Z' }).state;
  const result = read(state, base.input); const row = rowFor(result);
  assert.equal(row.precedingUses.total, 2); assert.equal(row.nonPrecedingUseCount, 1);
  assert.equal(row.currentProjection.outcome, 'success_verified'); assert.equal(row.sourceRecord.outcome, 'failure_verified');
  // Isolate the time condition: a lower sequence still cannot apply after source time.
  const selected = prepareRuleUse(state, { taskId: 'task-one', attemptId: 'attempt-one', lessonId: 'old-common-rule', scope: clone(SCOPE), globalRecall: clone(COMMON) }, { now: REGISTERED }).selection;
  const event = { eventId: 'time-after-source-low-sequence', taskId: 'task-one', attemptId: 'attempt-one', sequence: 0, ...clone(SCOPE),
    timestamp: AFTER, outcome: 'observed', source: 'host_verified', evidenceRefs: ['source:time-late-use', 'fixture:time-late'],
    ruleUses: [{ useRef: 'source:time-late-use', selection: selected, appliedAt: REGISTERED, confirmation: 'applied_in_this_attempt', evidenceRefs: ['source:time-late-use', 'fixture:time-late'] }] };
  state = ingest(state, event).state;
  assert.equal(rowFor(read(state, base.input)).nonPrecedingUseCount, 2);
  assert.equal(rowFor(read(state, base.input)).precedingUses.total, 2);
});

test('wildcard learning proposals retain only the concrete candidate registration sources and cannot widen a candidate scope', async () => {
  let state = await active(); const events = [];
  for (const input of [
    { taskId: 'training-one', scope: SCOPE, labels: { reviewed: true, ruleRemediationTried: true } },
    { taskId: 'training-two', scope: SCOPE, labels: { reviewed: true, ruleRemediationTried: true } },
    { taskId: 'training-other-operation', scope: OTHER, labels: { reviewed: true, ruleRemediationTried: true } },
    { taskId: 'heldout', scope: SCOPE, labels: { reviewed: true, holdout: true } },
  ]) { const saved = record(state, input); state = saved.state; events.push(saved.event); }
  const proposal = Object.values(state.proposals).find(value => value.kind === 'learning_evaluation');
  assert.equal(proposal.scope.operation, '*');
  const saved = register(state, proposal.id, [events[0].eventId, events[3].eventId]);
  const input = { proposalId: proposal.id, lessonId: saved.link.lessonId, ruleVersion: saved.link.ruleVersion, inputFingerprint: saved.link.inputFingerprint };
  const result = read(saved.state, input);
  assert.equal(result.totals.registeredSources, 2); assert.equal(result.totals.recordedUses, 2);
  assert.deepEqual(new Set(result.items.map(item => item.sourceEventId)), new Set(saved.link.sourceEventIds));
  assert.ok(result.items.every(item => item.scope.operation === SCOPE.operation));
  assert.ok(!JSON.stringify(result).includes('training-other-operation'));
  const broken = clone(saved.state); broken.proposals[proposal.id].candidateLinks[0].scope.operation = '*';
  assert.throws(() => read(broken, input));
});

test('omitted historical uses, rows and changed source contents remain in the fingerprint without registration-time content claims', async () => {
  const base = await fixture(); const original = read(base.state, base.input);
  const changed = changedEvent(base.state, base.originalUseIds[0], event => {
    event.ruleUses[0].evidenceRefs.push('fixture:omitted-use-proof'); event.evidenceRefs.push('fixture:omitted-use-proof');
  });
  const next = read(changed, base.input);
  assert.deepEqual(next.items, original.items); assert.notEqual(next.fingerprint, original.fingerprint);
  const hidden = read(base.state, base.input, { maxChars: 1 }); const hiddenNext = read(changed, base.input, { maxChars: 1 });
  assert.deepEqual(hidden.items, []); assert.equal(hidden.omittedSources, 2); assert.deepEqual(hidden.totals, original.totals);
  assert.notEqual(hidden.fingerprint, hiddenNext.fingerprint);
  const differentSource = changedEvent(base.state, base.sourceIds[0], event => { event.outcome = 'success_verified'; });
  const currentBody = read(differentSource, base.input);
  assert.equal(rowFor(currentBody).sourceRecord.outcome, 'success_verified'); assert.equal(currentBody.sourceContentAtRegistrationVerified, false);
  assert.notEqual(currentBody.fingerprint, original.fingerprint);
  assert.deepEqual(currentBody.registration, original.registration);
});

test('current original metrics are fingerprinted even when the projection retains an earlier maximum', async () => {
  const base = await fixture(); const saved = record(base.state, { outcome: 'success_verified', withUse: false, timestamp: AFTER, metrics: { durationMs: 5 } });
  const state = saved.state; const key = ruleUseHash(['task-one', 'attempt-one']);
  assert.equal(state.attempts[key].metrics.durationMs, 100); assert.equal(state.events[saved.event.eventId].metrics.durationMs, 5);
  const original = read(state, base.input); const changed = clone(state);
  changed.events[saved.event.eventId].metrics.durationMs = 6;
  const next = read(changed, base.input);
  assert.deepEqual(next.items, original.items); assert.deepEqual(next.totals, original.totals); assert.notEqual(next.fingerprint, original.fingerprint);
});

test('whole-source Unicode budgets and normalized use limits preserve complete receipt summaries', async () => {
  const base = await fixture({ extra: { guidance: '확인한 출처를 함께 기록한다. 😀' } });
  const full = read(base.state, base.input, { maxChars: 32768, maxUsesPerSource: 4 });
  assert.ok(full.items.every(row => row.precedingUses.items.length === 2));
  const row = full.items[0]; const length = [...JSON.stringify(row)].length;
  assert.ok(length < JSON.stringify(row).length);
  const exact = read(base.state, base.input, { maxUsesPerSource: 4, maxChars: length });
  assert.equal(exact.items[0].sourceEventId, row.sourceEventId);
  const short = read(base.state, base.input, { maxUsesPerSource: 4, maxChars: length - 1 });
  assert.equal(short.items.some(item => item.sourceEventId === row.sourceEventId), false);
  assert.deepEqual(short.totals, full.totals);
  assert.deepEqual(read(base.state, base.input), read(base.state, base.input, { maxUsesPerSource: 1, maxChars: 12000 }));
});

test('full currently stored use history above one MiB is counted and fingerprinted without the input hash limit', async () => {
  const base = await fixture(); const state = clone(base.state); const template = state.events[base.originalUseIds[0]];
  const extraRefs = Array.from({ length: 7 }, (_, index) => `artifact:large-evidence-${index}-` + 'x'.repeat(200));
  for (let index = 0; index < 320; index++) {
    const event = clone(template); event.eventId = `large-older-use-${index}`; event.sequence = 0;
    const useRef = `source:large-use-${index}`;
    event.ruleUses[0].useRef = useRef; event.ruleUses[0].evidenceRefs = [useRef, ...extraRefs];
    event.evidenceRefs = [`source:large-observation-${index}`, useRef, ...extraRefs]; state.events[event.eventId] = event;
  }
  state.revision += 320;
  assert.ok(JSON.stringify(Object.values(state.events).filter(event => event.taskId === 'task-one')).length > 1024 * 1024);
  const result = read(state, base.input, { maxChars: 32768 });
  assert.equal(result.totals.recordedUses, 324); assert.equal(rowFor(result).precedingUses.total, 322);
  assert.equal(result.availableAtRegistrationVerified, false); assert.match(result.fingerprint, /^[a-f0-9]{64}$/);
});

test('evidence fingerprints cannot replace existing packet gates and the read does not modify candidate registration', async () => {
  const base = await fixture(); const before = clone(base.state); const result = read(base.state, base.input);
  const packet = prepareReview(base.state, { proposalId: base.proposalId }); const review = reviewFor(packet, base.sourceIds);
  assert.doesNotThrow(() => createReviewedCandidate(base.state, review, SUITE));
  assert.throws(() => createReviewedCandidate(base.state, { ...review, packetFingerprint: result.fingerprint }, SUITE));
  assert.throws(() => registerReviewedCandidate(base.state, { ...review, packetFingerprint: result.fingerprint }, SUITE, { now: NOW }));
  assert.throws(() => decideProposal(base.state, { proposalId: base.proposalId, decisionId: 'not-evidence-authorization', decision: 'accept',
    expectedRevision: base.state.revision, packetFingerprint: result.fingerprint, reviewer: 'agent', sourceRef: 'source:review',
    reason: 'Review only actual packet evidence.', eventIds: [base.sourceIds[0]] }, { now: NOW }));
  assert.deepEqual(base.state, before);
});

test('exact registered identities and bounded options reject external selection, clocks, revisions and wrong links', async () => {
  const base = await fixture();
  for (const input of [null, [], {}, { ...base.input, eventIds: base.sourceIds }, { ...base.input, packet: base.packet },
    { ...base.input, query: SCOPE }, { ...base.input, now: NOW }, { ...base.input, revision: base.state.revision },
    { ...base.input, owner: 'different' }, { ...base.input, ruleVersion: 'unregistered-version' },
    { ...base.input, inputFingerprint: 'a'.repeat(64) }, { ...base.input, lessonId: 'old-common-rule' },
    { ...base.input, options: null }, { ...base.input, options: { maxUsesPerSource: 0 } },
    { ...base.input, options: { maxUsesPerSource: 5 } }, { ...base.input, options: { maxChars: 0 } },
    { ...base.input, options: { maxChars: 32769 } }, { ...base.input, options: { maxUsesPerSource: 1.5 } }]) assert.throws(() => prepareCandidateEvidence(base.state, input));
  assert.throws(() => read(base.state, { ...base.input, ruleVersion: 'unregistered' }), error => error.code === 'LEARNING_CANDIDATE_LINK_NOT_FOUND');
});

test('corrupt global history, duplicate source attempts and executable data fail before any historical summary is made', async () => {
  const base = await fixture(); const outside = record(base.state, { taskId: 'outside', scope: OTHER, outcome: 'success_verified' });
  const mutations = [
    state => { state.events[outside.event.eventId].ruleUses[0].selection.fingerprint = 'a'.repeat(64); },
    state => { delete state.attempts[ruleUseHash(['outside', 'attempt-one'])]; },
    state => { state.proposals[base.proposalId].candidateLinks[0].sourceEventIds = [base.originalUseIds[0], base.sourceIds[0]].sort(); },
    state => { state.proposals[base.proposalId].candidateLinks[0].recordedRevision = state.revision + 1; },
  ];
  for (const mutate of mutations) { const state = clone(outside.state); mutate(state); assert.throws(() => read(state, base.input)); }
  let invoked = 0;
  const getter = clone(base.state); Object.defineProperty(getter.lessons['old-common-rule'], 'guidance', { enumerable: true, get() { invoked++; return GUIDANCE; } });
  const proxy = new Proxy({}, { get() { invoked++; }, getPrototypeOf() { invoked++; } });
  const proxyState = clone(base.state); proxyState.events.bad = proxy;
  const cycle = clone(base.state); cycle.proposals.cycle = cycle;
  const sparse = clone(base.state); sparse.lessons['old-common-rule'].evidenceRefs = new Array(1);
  for (const state of [getter, proxyState, cycle, sparse]) assert.throws(() => read(state, base.input));
  const input = clone(base.input); Object.defineProperty(input, 'options', { enumerable: true, get() { invoked++; return {}; } });
  assert.throws(() => prepareCandidateEvidence(base.state, input)); assert.throws(() => prepareCandidateEvidence(base.state, proxy));
  assert.equal(invoked, 0);
  const secret = 'github_pat_' + 'Q'.repeat(40); const secretState = clone(base.state); secretState.proposals.unrelated = { reason: secret };
  assert.throws(() => read(secretState, base.input), error => error instanceof TypeError && !error.message.includes(secret));
});
