import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, addLesson, evaluateLesson, ingest, recallContexts } from './engine.mjs';
import { bindRegression, runRegression } from './regression.mjs';
import { evaluateConstraints } from './constraints.mjs';
import { prepareRuleUse } from './rule-usage.mjs';
import { ruleUseHash, ruleUseScopes } from './rule-use-contract.mjs';
import { observeTask, taskView } from './host-observations.mjs';

// All actions/outcomes below are synthetic in-memory fixtures, never production
// observations or evidence that a real device action or causal improvement occurred.
const EVALUATED = '2026-11-01T09:00:00.000Z';
const SELECTED = '2026-11-01T10:00:00.000Z';
const APPLIED = '2026-11-01T10:01:00.000Z';
const RECORDED = '2026-11-01T10:02:00.000Z';
const HOST_NOW = '2026-11-01T10:03:00.000Z';
const TASK = 'synthetic-use-task';
const ATTEMPT = 'synthetic-use-attempt';
const SCOPE = { domain: 'output', operation: 'summary.format', engine: 'synthetic-rule-use',
  context: { platform: 'node', version: '1', environment: 'synthetic-host-test' } };
const COMMON = { ...SCOPE, domain: 'orchestration', operation: 'learning.scope' };
const SUITE = { id: 'source-required', version: '1', cases: [
  { id: 'present', input: { value: { source: 'fixture:checked-source' },
    constraints: [{ path: ['source'], op: 'exists' }] }, expected: { passed: true, failed: [] } },
  { id: 'missing', input: { value: {}, constraints: [{ path: ['source'], op: 'exists' }] },
    expected: { passed: false, failed: [0] } },
] };
const clone = value => structuredClone(value);
async function active({ id = 'source-rule', scope = SCOPE, extra = {}, state = createState(), now = EVALUATED } = {}) {
  const lesson = bindRegression({ id, ...clone(scope), guidance: 'Include the checked source in the synthetic output.',
    evidenceRefs: ['fixture:source-rule-definition'], ruleVersion: '1', provenance: 'user_explicit', ...extra }, SUITE);
  const result = await runRegression(lesson, SUITE, evaluateConstraints, { now });
  return evaluateLesson(addLesson(state, lesson), id, result.evaluation);
}
function prepare(state, { lessonId = 'source-rule', taskId = TASK, attemptId = ATTEMPT,
  scope = SCOPE, globalRecall, now = SELECTED } = {}) {
  return prepareRuleUse(state, { taskId, attemptId, lessonId, scope: clone(scope),
    ...(globalRecall ? { globalRecall: clone(globalRecall) } : {}) }, { now }).selection;
}
function observation(state, { selection = prepare(state), observationRef = 'source:synthetic-result-one',
  useRef = 'source:synthetic-application-one', appliedAt = APPLIED, timestamp = RECORDED,
  outcome = 'success_verified', withUse = true, labels } = {}) {
  const usage = { useRef, selection: clone(selection), appliedAt,
    evidenceRefs: [useRef, 'artifact:synthetic-output-with-source'], confirmation: 'applied_in_this_attempt' };
  return { taskId: selection.taskId, attemptId: selection.attemptId, observationRef, scope: clone(selection.scope),
    observation: { timestamp, outcome, source: 'host_verified',
      evidenceRefs: [observationRef, 'artifact:synthetic-observed-result', ...(withUse ? usage.evidenceRefs : [])],
      ...(withUse ? { ruleUses: [usage] } : {}), ...(labels ? { labels } : {}) }, expectedRevision: state.revision };
}
function eventOf(input, eventId = 'synthetic-direct-use-event', sequence = 1) {
  return { eventId, taskId: input.taskId, attemptId: input.attemptId, sequence,
    ...clone(input.scope), ...clone(input.observation) };
}
function rehash(selection) {
  const { fingerprint, ...bound } = selection;
  selection.fingerprint = ruleUseHash(bound);
  return selection;
}
const record = (state, input, now = HOST_NOW) => observeTask(state, input, { now });

test('an attested use is attached atomically to the actual observation without extra attempts or automatic learning labels', async () => {
  const state = await active(); const before = clone(state); const input = observation(state);
  const saved = record(state, input);
  assert.equal(saved.recorded, true); assert.equal(saved.duplicate, false);
  assert.equal(Object.keys(saved.state.events).length, 1); assert.equal(Object.keys(saved.state.attempts).length, 1);
  assert.equal(Object.keys(saved.state.lessons).length, 1); assert.deepEqual(saved.state.proposals, {});
  assert.equal(saved.state.revision, state.revision + 1);
  assert.equal(saved.event.ruleUses[0].confirmation, 'applied_in_this_attempt');
  assert.equal(Object.hasOwn(saved.event, 'labels'), false);
  assert.equal(saved.current.ruleUses.total, 1); assert.equal(saved.current.ruleUses.omitted, 0);
  const use = saved.current.ruleUses.items[0];
  assert.equal(use.lessonId, 'source-rule'); assert.equal(use.recordedEventId, saved.event.eventId);
  assert.equal(use.definitionFingerprint, input.observation.ruleUses[0].selection.definitionFingerprint);
  assert.equal(use.selectionFingerprint, input.observation.ruleUses[0].selection.fingerprint);
  assert.equal(use.sourceAuthentication, 'host_attestation');
  assert.equal(use.applicationVerified, false); assert.equal(use.preActionTimingVerified, false);
  assert.equal(use.liveImprovementVerified, false);
  assert.equal(use.result.eventId, saved.event.eventId); assert.equal(use.result.outcome, 'success_verified');
  assert.equal(use.result.afterUse, true); assert.equal(use.result.verified, true);
  assert.equal(saved.current.projection.ruleUses.length, 1);
  assert.doesNotMatch(JSON.stringify(use), /"(?:guidance|caseResults|evaluation|selection|ruleRemediationTried|holdout)":/);
  assert.deepEqual(state, before);
  use.evidenceRefs.push('fixture:local-copy'); use.result.evidenceRefs.push('fixture:local-copy');
  assert.deepEqual(saved.state.events[saved.event.eventId].ruleUses, input.observation.ruleUses);
});

test('direct ingest validates new usages too and cannot bypass current binding, selection or evaluation gates', async () => {
  const state = await active(); const original = eventOf(observation(state));
  assert.equal(ingest(state, original).state.events[original.eventId].ruleUses.length, 1);
  for (const mutate of [
    use => { use.selection.definitionFingerprint = 'f'.repeat(64); rehash(use.selection); },
    use => { use.selection.inputFingerprint = 'f'.repeat(64); rehash(use.selection); },
    use => { use.selection.evaluationFingerprint = 'f'.repeat(64); rehash(use.selection); },
    use => { use.selection.recallFingerprint = 'f'.repeat(64); rehash(use.selection); },
    use => { use.selection.revision = state.revision + 1; rehash(use.selection); },
    use => { use.selection.ruleVersion = 'new-version'; rehash(use.selection); },
    use => { use.selection.lessonId = 'missing-rule'; rehash(use.selection); },
    use => { delete use.confirmation; },
  ]) {
    const event = clone(original); mutate(event.ruleUses[0]); const before = clone(state);
    assert.throws(() => ingest(state, event)); assert.deepEqual(state, before);
  }
});

test('unrelated event revisions may advance while an unchanged selection is revalidated without replaying work', async () => {
  const state = await active(); const input = observation(state);
  const unrelated = { eventId: 'unrelated-real-fixture', taskId: 'another-synthetic-task', attemptId: 'another-attempt', sequence: 1,
    ...clone(SCOPE), timestamp: '2026-11-01T10:00:30.000Z', outcome: 'observed', source: 'host_verified',
    evidenceRefs: ['fixture:unrelated-observation'] };
  const advanced = ingest(state, unrelated).state;
  assert.throws(() => record(advanced, input), error => error.code === 'LEARNING_REVISION_CONFLICT');
  const saved = record(advanced, { ...input, expectedRevision: advanced.revision });
  assert.equal(saved.current.ruleUses.total, 1);
  assert.equal(saved.event.ruleUses[0].selection.revision, state.revision);
  assert.equal(Object.keys(saved.state.attempts).length, 2);
});

test('scope, chronology, explicit source and separate use evidence are validated before any write', async () => {
  const state = await active(); const original = observation(state);
  const before = clone(state);
  for (const mutate of [
    input => { input.observation.ruleUses[0].selection.taskId = 'different-task'; rehash(input.observation.ruleUses[0].selection); },
    input => { input.observation.ruleUses[0].selection.attemptId = 'different-attempt'; rehash(input.observation.ruleUses[0].selection); },
    input => { input.observation.ruleUses[0].selection.scope.operation = 'different.operation'; rehash(input.observation.ruleUses[0].selection); },
    input => { input.observation.ruleUses[0].appliedAt = '2026-11-01T09:59:00.000Z'; },
    input => { input.observation.ruleUses[0].appliedAt = '2026-11-01T10:02:01.000Z'; },
    input => { input.observation.source = 'user_explicit'; },
    input => { input.observation.ruleUses[0].confirmation = 'selected_only'; },
    input => { input.observation.ruleUses[0].evidenceRefs.push('artifact:not-in-the-result'); },
    input => {
      input.observation.ruleUses[0].useRef = input.observationRef;
      input.observation.ruleUses[0].evidenceRefs = [input.observationRef];
    },
  ]) { const input = clone(original); mutate(input); assert.throws(() => record(state, input)); }
  assert.throws(() => record(state, original, SELECTED), error => error.code === 'LEARNING_RULE_USE_FUTURE');
  assert.deepEqual(state, before);
});

test('selection cannot predate its recorded regression even if a caller recomputes all public hashes', async () => {
  const state = await active(); const event = eventOf(observation(state)); const selected = event.ruleUses[0].selection;
  selected.selectedAt = '2026-11-01T08:59:00.000Z';
  selected.recallFingerprint = recallContexts(state, ruleUseScopes(selected),
    { now: selected.selectedAt, limit: selected.limit, maxChars: selected.maxChars }).fingerprint;
  rehash(selected);
  assert.throws(() => ingest(state, event), /dated evaluation/);
});

test('a use identity alone is not result evidence while an actual application artifact may also evidence the result', async () => {
  const state = await active(); const original = observation(state); const before = clone(state);
  for (const outcome of ['success_verified', 'failure_verified']) {
    const identityOnly = clone(original); const usage = identityOnly.observation.ruleUses[0];
    identityOnly.observation.outcome = outcome;
    usage.evidenceRefs = [usage.useRef];
    identityOnly.observation.evidenceRefs = [identityOnly.observationRef, usage.useRef];
    assert.throws(() => record(state, identityOnly), /separate result evidence/);
    assert.deepEqual(state, before);
  }
  const sharedArtifact = clone(original); const usage = sharedArtifact.observation.ruleUses[0];
  sharedArtifact.observation.evidenceRefs = [sharedArtifact.observationRef, ...usage.evidenceRefs];
  const saved = record(state, sharedArtifact);
  assert.equal(saved.recorded, true);
  assert.equal(saved.current.ruleUses.items[0].result.verified, true);
  assert.equal(saved.current.ruleUses.items[0].result.evidenceRefs.includes('artifact:synthetic-output-with-source'), true);
});

test('a rule may expire before recording only when it was selected and applied within its valid interval', async () => {
  const state = await active({ extra: { validUntil: '2026-11-01T10:01:30.000Z' } });
  const input = observation(state);
  assert.equal(recallContexts(state, [SCOPE], { now: HOST_NOW }).lessons.length, 0);
  const saved = record(state, input);
  assert.equal(saved.current.ruleUses.total, 1);
  const late = observation(state, { appliedAt: '2026-11-01T10:01:30.000Z' });
  assert.throws(() => record(state, late), /application context/);
});

test('new uses reject changed definitions, rerun evaluations and quarantined current rules', async () => {
  const state = await active(); const input = observation(state);
  for (const mutate of [
    lesson => { lesson.guidance = 'Changed guidance'; },
    lesson => { lesson.state = 'candidate'; },
    lesson => { lesson.evaluation.passed += 1; },
  ]) {
    const changed = clone(state); mutate(changed.lessons['source-rule']); const before = clone(changed);
    assert.throws(() => record(changed, input)); assert.deepEqual(changed, before);
  }
  for (const fail of [false, true]) {
    const result = await runRegression(state.lessons['source-rule'], SUITE,
      fail ? () => ({ mismatch: true }) : evaluateConstraints, { now: APPLIED });
    const changed = evaluateLesson(state, 'source-rule', result.evaluation);
    assert.throws(() => record(changed, { ...input, expectedRevision: changed.revision }));
  }
});

test('common usage requires its actual common binding and changed combined selection is not silently accepted', async () => {
  let state = await active({ scope: COMMON, extra: { conflictKey: 'source-format' } });
  const selection = prepare(state, { globalRecall: COMMON }); const input = observation(state, { selection });
  assert.equal(record(state, input).current.ruleUses.items[0].lessonId, 'source-rule');
  const withoutCommon = clone(input); delete withoutCommon.observation.ruleUses[0].selection.globalRecall;
  rehash(withoutCommon.observation.ruleUses[0].selection);
  assert.throws(() => record(state, withoutCommon));
  state = await active({ id: 'conflicting-task-rule', state, extra: {
    conflictKey: 'source-format', guidance: 'Different same-authority task instruction.' } });
  assert.throws(() => record(state, { ...input, expectedRevision: state.revision }), /recalled context/);
});

test('exact event retries and historical task views survive later quarantine or missing current definitions', async () => {
  const state = await active(); const input = observation(state); const saved = record(state, input);
  const failed = await runRegression(saved.state.lessons['source-rule'], SUITE, () => ({ mismatch: true }), { now: HOST_NOW });
  const quarantined = evaluateLesson(saved.state, 'source-rule', failed.evaluation);
  for (const current of [quarantined, { ...clone(quarantined), lessons: {} }]) {
    const before = clone(current);
    // The old CAS and even an earlier host clock cannot reclassify an already
    // committed exact receipt. No new work or new usage is performed.
    const retried = record(current, input, SELECTED);
    assert.equal(retried.duplicate, true); assert.equal(retried.recorded, false);
    assert.strictEqual(retried.state, current); assert.equal(retried.current.ruleUses.total, 1);
    assert.equal(taskView(current, { taskId: TASK, attemptId: ATTEMPT }).attempts[0].ruleUses.total, 1);
    assert.deepEqual(current, before);
    const rawRetry = ingest(current, clone(saved.event));
    assert.strictEqual(rawRetry.state, current); assert.equal(rawRetry.duplicate, true);
  }
  const altered = clone(input); altered.observation.ruleUses[0].appliedAt = SELECTED;
  assert.throws(() => record(quarantined, altered), error => error.code === 'LEARNING_OBSERVATION_CONFLICT');
});

test('a use reference is single-observation evidence across all tasks and cannot be copied into follow-up events', async () => {
  const state = await active(); const input = observation(state); const saved = record(state, input);
  const copied = clone(input); copied.observationRef = 'source:synthetic-followup-copy';
  copied.observation.timestamp = HOST_NOW;
  copied.observation.evidenceRefs[0] = copied.observationRef; copied.expectedRevision = saved.state.revision;
  assert.throws(() => record(saved.state, copied), /already belongs/);
  const otherSelection = prepare(saved.state, { taskId: 'different-synthetic-task', attemptId: 'different-synthetic-attempt', now: HOST_NOW });
  const other = observation(saved.state, { selection: otherSelection, appliedAt: HOST_NOW, timestamp: HOST_NOW,
    observationRef: 'source:different-synthetic-result' });
  assert.throws(() => record(saved.state, other), /already belongs/);
  assert.throws(() => ingest(saved.state, eventOf(other, 'different-direct-event')), /already belongs/);
});

test('later actual outcomes link to retained original usage without copying usage or inflating its count', async () => {
  const state = await active(); const first = record(state, observation(state, { outcome: 'completion_unknown' }));
  const later = observation(first.state, { observationRef: 'source:synthetic-final-result', withUse: false,
    timestamp: HOST_NOW, selection: first.event.ruleUses[0].selection });
  const saved = record(first.state, later); const before = clone(saved.state);
  const result = taskView(saved.state, { taskId: TASK, attemptId: ATTEMPT }); const attempt = result.attempts[0];
  assert.equal(attempt.eventCount, 2); assert.equal(attempt.ruleUses.total, 1);
  assert.equal(Object.hasOwn(attempt.projection, 'ruleUses'), false);
  assert.equal(attempt.ruleUses.items[0].recordedEventId, first.event.eventId);
  assert.equal(attempt.ruleUses.items[0].result.eventId, saved.event.eventId);
  assert.equal(attempt.ruleUses.items[0].result.afterUse, true);
  assert.equal(attempt.ruleUses.items[0].result.verified, true);
  assert.equal(attempt.ruleUses.items[0].liveImprovementVerified, false);
  assert.deepEqual(saved.state, before);
});

test('an older retained verified projection cannot be credited to a later observed rule use', async () => {
  const state = await active();
  const earlier = observation(state, { withUse: false, timestamp: '2026-11-01T09:59:00.000Z' });
  const first = record(state, earlier);
  const later = observation(first.state, { observationRef: 'source:synthetic-later-observed-use', outcome: 'observed' });
  const saved = record(first.state, later); const attempt = saved.current;
  assert.equal(attempt.projection.eventId, first.event.eventId);
  assert.equal(attempt.latestObservation.eventId, saved.event.eventId);
  assert.equal(attempt.ruleUses.items[0].result.outcome, 'success_verified');
  assert.equal(attempt.ruleUses.items[0].result.afterUse, false);
  assert.equal(attempt.ruleUses.items[0].result.verified, false);
  assert.equal(attempt.ruleUses.items[0].liveImprovementVerified, false);
});

test('attempt usage summaries are bounded and retain the original latest-first event order', async () => {
  let state = await active();
  for (let index = 0; index < 10; index++) {
    const minute = String(index + 10).padStart(2, '0'); const at = `2026-11-01T10:${minute}:00.000Z`;
    const input = observation(state, { selection: prepare(state, { now: at }), appliedAt: at, timestamp: at,
      observationRef: 'source:synthetic-result-' + index, useRef: 'source:synthetic-application-' + index, outcome: 'observed' });
    state = ingest(state, eventOf(input, 'synthetic-event-' + index, index + 1)).state;
  }
  const before = clone(state); const result = taskView(state, { taskId: TASK, attemptId: ATTEMPT }).attempts[0];
  assert.equal(result.ruleUses.total, 10); assert.equal(result.ruleUses.items.length, 8); assert.equal(result.ruleUses.omitted, 2);
  assert.equal(result.ruleUses.items[0].useRef, 'source:synthetic-application-9');
  assert.equal(result.ruleUses.items.at(-1).useRef, 'source:synthetic-application-2');
  assert.equal(result.eventCount, 10); assert.deepEqual(state, before);
});

test('non-usage observations and task views retain their previous shape', async () => {
  const state = await active(); const result = record(state, observation(state, { withUse: false,
    labels: { reviewed: false, ruleRemediationTried: false, holdout: false } }));
  assert.equal(Object.hasOwn(result.event, 'ruleUses'), false);
  assert.equal(Object.hasOwn(result.current, 'ruleUses'), false);
  assert.equal(Object.hasOwn(result.current.projection, 'ruleUses'), false);
  assert.equal(Object.hasOwn(result.current.latestObservation, 'ruleUses'), false);
  assert.deepEqual(result.event.labels, { reviewed: false, ruleRemediationTried: false, holdout: false });
});

test('malformed stored usage data and input-defined getters are never executed by historical reading', async () => {
  const state = await active(); const saved = record(state, observation(state));
  const corrupt = clone(saved.state);
  corrupt.events[saved.event.eventId].ruleUses[0].selection.fingerprint = 'f'.repeat(64);
  assert.throws(() => taskView(corrupt, { taskId: TASK }));
  let invoked = 0;
  for (const mutate of [
    input => { Object.defineProperty(input.observation.ruleUses[0], 'selection', { enumerable: true, get() { invoked++; } }); },
    input => { input.observation.ruleUses[0].selection = new Proxy({}, { ownKeys() { invoked++; throw new Error('must not run'); } }); },
  ]) { const input = observation(state); mutate(input); assert.throws(() => record(state, input)); }
  const historical = clone(saved.state);
  Object.defineProperty(historical.events[saved.event.eventId].ruleUses[0].selection, 'lessonId', {
    enumerable: true, get() { invoked++; throw new Error('must not run'); } });
  assert.throws(() => taskView(historical, { taskId: TASK }));
  assert.equal(invoked, 0);
});
