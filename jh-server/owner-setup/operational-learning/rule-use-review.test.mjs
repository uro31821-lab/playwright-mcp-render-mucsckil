import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, addLesson, evaluateLesson, ingest } from './engine.mjs';
import { bindRegression, runRegression } from './regression.mjs';
import { evaluateConstraints } from './constraints.mjs';
import { prepareRuleUse } from './rule-usage.mjs';
import { observeTask } from './host-observations.mjs';
import { ruleUseHash } from './rule-use-contract.mjs';
import { usageReview } from './rule-use-review.mjs';

// All fixtures are synthetic, in memory only. No operating memory, network,
// source retrieval, real task replay, or measured improvement is involved.
const SCOPE = { domain: 'output', operation: 'summary.format', engine: 'synthetic-use-review',
  context: { platform: 'node', version: '1', environment: 'synthetic-test' } };
const OTHER = { ...SCOPE, domain: 'research', operation: 'source.check' };
const COMMON = { ...SCOPE, domain: 'orchestration', operation: 'learning.scope' };
const EVALUATED = '2026-11-01T08:00:00Z';
const SELECTED = '2026-11-01T09:00:00Z';
const APPLIED = '2026-11-01T09:01:00Z';
const OBSERVED = '2026-11-01T09:02:00Z';
const LATER = '2026-11-01T09:03:00Z';
const NOW = '2026-11-01T10:00:00Z';
const SUITE = { id: 'checked-source', version: '1', cases: [
  { id: 'present', input: { value: { source: 'fixture:checked' }, constraints: [{ path: ['source'], op: 'exists' }] },
    expected: { passed: true, failed: [] } },
] };
const clone = value => structuredClone(value);
async function active(state = createState(), id = 'common-rule', extra = {}) {
  const lesson = bindRegression({ id, ...clone(COMMON), ruleVersion: '1',
    guidance: 'Retain the checked source when reporting a synthetic result.', evidenceRefs: ['fixture:definition'], ...extra }, SUITE);
  const checked = await runRegression(lesson, SUITE, evaluateConstraints, { now: EVALUATED });
  return evaluateLesson(addLesson(state, lesson), id, checked.evaluation);
}
function record(state, { taskId = 'task-one', attemptId = 'attempt-one', scope = SCOPE,
  lessonId = 'common-rule', outcome = 'failure_verified', withUse = true,
  timestamp = OBSERVED, selectedAt = SELECTED, appliedAt = APPLIED,
  errorCode = 'SOURCE', tag = `${taskId}-${attemptId}-${Object.keys(state.events).length}`,
  evidenceRefs = [], labels } = {}) {
  const useRef = `source:use-${tag}`; const observationRef = `source:observation-${tag}`;
  const selection = withUse ? prepareRuleUse(state, { taskId, attemptId, lessonId, scope: clone(scope), globalRecall: clone(COMMON) }, { now: selectedAt }).selection : null;
  const use = withUse ? { useRef, selection, appliedAt, confirmation: 'applied_in_this_attempt',
    evidenceRefs: [useRef, `artifact:application-${tag}`] } : null;
  return observeTask(state, { taskId, attemptId, observationRef, scope: clone(scope), expectedRevision: state.revision,
    observation: { timestamp, outcome, source: 'host_verified',
      evidenceRefs: [observationRef, `artifact:result-${tag}`, ...(use?.evidenceRefs ?? []), ...evidenceRefs],
      ...(withUse ? { ruleUses: [use] } : {}), ...(errorCode ? { errorCode } : {}), ...(labels ? { labels } : {}) } }, { now: NOW });
}
const view = (state, options = {}) => usageReview(state, [SCOPE], options);
const single = state => view(state, { maxChars: 32768 }).groups[0];
function changedEvent(state, eventId, mutate) {
  const changed = clone(state); mutate(changed.events[eventId]);
  for (const [key, projected] of Object.entries(changed.attempts)) {
    if (projected.eventId === eventId) changed.attempts[key] = clone(changed.events[eventId]);
  }
  return changed;
}
function rebind(selection) {
  const { fingerprint, ...rest } = selection; selection.fingerprint = ruleUseHash(rest);
}

test('empty and single-success reviews remain read-only observations without an improvement or training claim', async () => {
  const empty = view(createState());
  assert.deepEqual(empty.groups, []);
  assert.deepEqual(empty.totals, { matchingGroups: 0, recordedUses: 0, distinctAttempts: 0, independentTasks: 0 });
  const state = record(await active(), { outcome: 'success_verified' }).state; const before = clone(state);
  const result = view(state); const group = result.groups[0];
  assert.deepEqual(group.counts, { recordedUses: 1, distinctAttempts: 1, independentTasks: 1,
    successOnlyTasks: 1, failureOnlyTasks: 0, unconfirmedOnlyTasks: 0, mixedTasks: 0 });
  assert.deepEqual(group.reasonCodes, ['INSUFFICIENT_REPEATED_EVIDENCE']);
  assert.deepEqual(group.nextSteps, [{ code: 'WAIT_FOR_INDEPENDENT_OBSERVATIONS' }]);
  assert.equal(group.relatedProposals.total, 0);
  assert.equal(result.readOnly, true); assert.equal(result.advisoryOnly, true);
  assert.equal(result.sourceAuthentication, 'host_attestation');
  for (const key of ['externalEffects', 'replayAllowed', 'applicationVerified', 'preActionTimingVerified', 'liveImprovementVerified', 'causalEffectVerified']) assert.equal(result[key], false);
  assert.deepEqual(state, before); assert.deepEqual(state.proposals, {});
  assert.doesNotMatch(JSON.stringify(result), /"(?:holdout|ruleRemediationTried|learningReadiness|savings|guidance)":/);
  group.identity.actualScope.context.environment = 'changed-copy';
  group.samples.items[0].uses.items[0].result.evidenceRefs.push('fixture:copy-only');
  result.queries[0].operation = 'changed-copy'; assert.deepEqual(state, before);
});

test('same-task retries and repeated uses do not become independent failures; task buckets are exclusive', async () => {
  let state = await active();
  for (const input of [
    { taskId: 'failure-one', attemptId: 'a' }, { taskId: 'failure-one', attemptId: 'a' },
    { taskId: 'failure-one', attemptId: 'b' }, { taskId: 'failure-two', attemptId: 'a' },
    { taskId: 'success', outcome: 'success_verified' },
    { taskId: 'unknown', outcome: 'completion_unknown' },
    { taskId: 'mixed', attemptId: 'bad', outcome: 'failure_verified' },
    { taskId: 'mixed', attemptId: 'good', outcome: 'success_verified' },
  ]) state = record(state, input).state;
  const group = single(state); const before = clone(state);
  assert.deepEqual(group.counts, { recordedUses: 8, distinctAttempts: 7, independentTasks: 5,
    successOnlyTasks: 1, failureOnlyTasks: 2, unconfirmedOnlyTasks: 1, mixedTasks: 1 });
  assert.equal(group.counts.independentTasks, ['successOnlyTasks', 'failureOnlyTasks', 'unconfirmedOnlyTasks', 'mixedTasks'].reduce((sum, key) => sum + group.counts[key], 0));
  assert.deepEqual(group.reasonCodes, ['REPEATED_FAILURE_AFTER_ATTESTED_USE', 'POST_USE_RESULT_UNCONFIRMED', 'MIXED_TASK_OUTCOMES']);
  assert.ok(group.relatedProposals.items.every(item => item.relationship === 'current_result_pattern' && item.causalEffectVerified === false));
  assert.ok(group.nextSteps.some(item => item.code === 'PREPARE_EXISTING_REVIEW' && state.proposals[item.proposalId]));
  assert.deepEqual(state, before);
});

test('follow-up results without copied uses replace the linked result, while an earlier sticky success cannot prove a later use', async () => {
  let state = record(await active(), { outcome: 'completion_unknown' }).state;
  const before = single(state);
  state = record(state, { outcome: 'success_verified', withUse: false, timestamp: LATER }).state;
  const after = single(state);
  assert.equal(after.counts.recordedUses, 1); assert.equal(after.counts.successOnlyTasks, 1);
  assert.notEqual(after.noticeFingerprint, before.noticeFingerprint);
  assert.equal(after.relatedProposals.total, 0); // resolved verification gap
  assert.equal(after.samples.items[0].uses.items[0].result.timestamp, LATER);
  state = record(state, { outcome: 'pending', selectedAt: LATER, appliedAt: LATER, timestamp: '2026-11-01T09:04:00Z' }).state;
  const sticky = single(state);
  assert.equal(sticky.counts.mixedTasks, 1); assert.equal(sticky.counts.successOnlyTasks, 0);
  const byUse = Object.values(state.events).find(event => event.outcome === 'pending').ruleUses[0].useRef;
  const onlyLater = clone(state);
  for (const event of Object.values(onlyLater.events)) if (event.ruleUses?.[0].useRef !== byUse) delete event.ruleUses;
  for (const projected of Object.values(onlyLater.attempts)) delete projected.ruleUses;
  const later = single(onlyLater).samples.items[0].uses.items[0];
  assert.equal(later.result.outcome, 'success_verified'); assert.equal(later.result.afterUse, false); assert.equal(later.result.verified, false);
  assert.equal(single(onlyLater).counts.unconfirmedOnlyTasks, 1);
});

test('after-use requires both sequence and timestamp, including valid legacy out-of-order historical observations', async () => {
  let state = record(await active(), { outcome: 'pending' }).state;
  const previous = Object.values(state.events)[0];
  const earlierTime = { eventId: 'historical-result-before-use', taskId: previous.taskId, attemptId: previous.attemptId,
    sequence: 2, ...clone(SCOPE), timestamp: SELECTED, outcome: 'success_verified', source: 'host_verified', evidenceRefs: ['fixture:older-clock-result'] };
  state = ingest(state, earlierTime).state;
  const group = single(state); const result = group.samples.items[0].uses.items[0].result;
  assert.equal(result.sequence, 2); assert.equal(result.afterUse, false); assert.equal(result.verified, false);
  assert.equal(group.counts.unconfirmedOnlyTasks, 1);
  const equality = record(await active(), { outcome: 'success_verified', selectedAt: SELECTED, appliedAt: SELECTED, timestamp: SELECTED }).state;
  assert.equal(single(equality).samples.items[0].uses.items[0].result.afterUse, true);
});

test('common rule uses stay in actual scopes; query order is stable and overall task totals do not sum duplicate group membership', async () => {
  let state = await active();
  state = record(state, { taskId: 'one-task', attemptId: 'output', outcome: 'success_verified' }).state;
  state = record(state, { taskId: 'one-task', attemptId: 'research', scope: OTHER, outcome: 'failure_verified' }).state;
  assert.deepEqual(usageReview(state, [COMMON]).groups, []);
  const output = view(state); assert.equal(output.totals.recordedUses, 1); assert.deepEqual(output.groups[0].identity.actualScope, SCOPE);
  const combined = usageReview(state, [SCOPE, OTHER], { maxChars: 32768 });
  assert.equal(combined.groups.length, 2);
  assert.deepEqual(combined.totals, { matchingGroups: 2, recordedUses: 2, distinctAttempts: 2, independentTasks: 1 });
  assert.equal(combined.groups.reduce((sum, group) => sum + group.counts.independentTasks, 0), 2);
  assert.deepEqual(combined, usageReview(state, [OTHER, SCOPE], { maxChars: 32768 }));
  assert.equal(output.fingerprint, usageReview(state, [SCOPE]).fingerprint);
  assert.equal(output.groups[0].noticeFingerprint, combined.groups.find(group => group.identity.actualScope.domain === 'output').noticeFingerprint);
});

test('historical identity separates ID, version, input and full definition, without consulting a current rule evaluation', async () => {
  let state = await active();
  for (let index = 0; index < 5; index++) state = record(state, { taskId: `identity-${index}` }).state;
  const events = Object.values(state.events);
  for (const [index, key, value] of [[1, 'lessonId', 'old-rule-id'], [2, 'ruleVersion', 'old-version'],
    [3, 'inputFingerprint', 'a'.repeat(64)], [4, 'definitionFingerprint', 'b'.repeat(64)]]) {
    state = changedEvent(state, events[index].eventId, event => { event.ruleUses[0].selection[key] = value; rebind(event.ruleUses[0].selection); });
  }
  const before = usageReview(state, [SCOPE], { limit: 10, maxChars: 32768 });
  assert.equal(before.groups.length, 5); assert.equal(before.totals.matchingGroups, 5);
  state.lessons['common-rule'].state = 'quarantined';
  state.lessons['common-rule'].guidance = 'A changed current policy does not rewrite past receipts.';
  state.lessons['common-rule'].evaluation.failed = 1; state.revision++;
  const after = usageReview(state, [SCOPE], { limit: 10, maxChars: 32768 });
  assert.deepEqual(after.groups, before.groups); assert.equal(after.fingerprint, before.fingerprint);
  delete state.lessons['common-rule'];
  assert.equal(usageReview(state, [SCOPE], { limit: 10, maxChars: 32768 }).fingerprint, before.fingerprint);
});

test('all uses and attempts are counted before sample limits; compact repeated-use groups fit the default budget', async () => {
  let state = await active();
  for (let task = 0; task < 4; task++) for (let use = 0; use < 4; use++) state = record(state, { taskId: `compact-${task}`, attemptId: 'one' }).state;
  const standard = view(state); const group = standard.groups[0];
  assert.equal(standard.groups.length, 1); assert.equal(standard.omitted, 0);
  assert.ok([...JSON.stringify(group)].length <= 12000);
  assert.equal(group.counts.recordedUses, 16); assert.equal(group.counts.distinctAttempts, 4); assert.equal(group.counts.independentTasks, 4);
  assert.equal(group.samples.items.length, 4);
  for (const sample of group.samples.items) { assert.equal(sample.uses.items.length, 1); assert.equal(sample.uses.total, 4); assert.equal(sample.uses.omitted, 3); }
  for (let index = 0; index < 33; index++) state = record(state, { taskId: 'many-attempts', attemptId: `a-${index}` }).state;
  const full = single(state);
  assert.equal(full.counts.recordedUses, 49); assert.equal(full.counts.distinctAttempts, 37); assert.equal(full.counts.independentTasks, 5);
  assert.equal(full.samples.total, 5); assert.equal(full.samples.items.length, 4); assert.equal(full.samples.omitted, 1);
  const omitted = view(state, { maxChars: 1 });
  assert.equal(omitted.groups.length, 0); assert.equal(omitted.omitted, 1); assert.equal(omitted.totals.recordedUses, 49);
});

test('a notice binds omitted uses, omitted evidence and all current results, and ignores unrelated revisions or map order', async () => {
  let state = await active();
  for (let index = 0; index < 6; index++) state = record(state, { taskId: `fingerprint-${index}`,
    evidenceRefs: Array.from({ length: 10 }, (_, ref) => `fixture:extra-${index}-${ref}`) }).state;
  const original = single(state); const target = Object.values(state.events).find(event => event.taskId === 'fingerprint-5');
  const omittedUse = changedEvent(state, target.eventId, event => {
    event.ruleUses[0].evidenceRefs.push('fixture:new-application-evidence'); event.evidenceRefs.push('fixture:new-application-evidence');
  });
  const changed = single(omittedUse);
  assert.deepEqual(changed.samples, original.samples); assert.notEqual(changed.noticeFingerprint, original.noticeFingerprint);
  const visible = Object.values(state.events).find(event => event.taskId === 'fingerprint-0');
  const hiddenEvidence = changedEvent(state, visible.eventId, event => { event.evidenceRefs[event.evidenceRefs.length - 1] = 'fixture:changed-omitted-result-evidence'; });
  const changedEvidence = single(hiddenEvidence);
  assert.deepEqual(changedEvidence.samples, original.samples); assert.notEqual(changedEvidence.noticeFingerprint, original.noticeFingerprint);
  const unrelated = record(state, { taskId: 'unrelated', scope: OTHER, withUse: false, outcome: 'observed' }).state;
  assert.equal(single(unrelated).noticeFingerprint, original.noticeFingerprint);
  assert.equal(view(unrelated).fingerprint, view(state).fingerprint);
  const reordered = clone(state);
  for (const key of ['events', 'attempts', 'lessons', 'proposals']) reordered[key] = Object.fromEntries(Object.entries(reordered[key]).reverse());
  assert.deepEqual(view(reordered), view(state));
});

test('seen checkpoints and character/count budgets keep complete groups and all totals; changed notices are delivered again', async () => {
  const state = record(await active(), { outcome: 'success_verified' }).state;
  const full = view(state); const group = full.groups[0]; const size = [...JSON.stringify(group)].length;
  assert.equal(view(state, { maxChars: size }).groups.length, 1);
  assert.equal(view(state, { maxChars: size - 1 }).groups.length, 0);
  const suppressed = view(state, { maxChars: 1, seenNoticeFingerprints: [group.noticeFingerprint] });
  assert.equal(suppressed.suppressed, 1); assert.equal(suppressed.omitted, 0); assert.deepEqual(suppressed.totals, full.totals);
  const eventId = Object.keys(state.events)[0];
  const changed = changedEvent(state, eventId, event => { event.evidenceRefs.push('fixture:additional-result'); });
  const returned = view(changed, { seenNoticeFingerprints: [group.noticeFingerprint] });
  assert.equal(returned.groups.length, 1); assert.equal(returned.suppressed, 0);
  const two = record(state, { taskId: 'other-scope', scope: OTHER, outcome: 'success_verified' }).state;
  const limited = usageReview(two, [SCOPE, OTHER], { limit: 1, maxChars: 32768 });
  assert.equal(limited.groups.length, 1); assert.equal(limited.omitted, 1); assert.equal(limited.totals.matchingGroups, 2);
});

test('proposal links require exact current after-use patterns; stale, closed, wrong-error and wildcard scopes are excluded', async () => {
  let state = record(await active(), { taskId: 'p-one' }).state;
  state = record(state, { taskId: 'p-two' }).state;
  const correct = Object.values(state.proposals).find(item => item.kind === 'rule_fix');
  assert.ok(correct);
  const original = single(state); assert.deepEqual(original.relatedProposals.items.map(item => item.proposalId), [correct.id]);
  const noisy = clone(state);
  for (const status of ['dismissed', 'resolved', 'implemented', 'verified']) {
    const id = `closed-${status}`; noisy.proposals[id] = { ...clone(correct), id, status };
  }
  noisy.proposals['wrong-error'] = { ...clone(correct), id: 'wrong-error', patternKey: ruleUseHash({ scope: correct.scope, pattern: ['failure_verified', 'ANOTHER'] }) };
  noisy.proposals['other-scope'] = { ...clone(correct), id: 'other-scope', scope: clone(OTHER) };
  noisy.proposals['learning-wildcard'] = { ...clone(correct), id: 'learning-wildcard', kind: 'learning_evaluation',
    scope: { ...clone(SCOPE), operation: '*' }, patternKey: ruleUseHash({ scope: { ...SCOPE, operation: '*' }, pattern: 'reviewed-cross-operation-failures' }) };
  assert.deepEqual(single(noisy).relatedProposals, original.relatedProposals);
  assert.equal(single(noisy).noticeFingerprint, original.noticeFingerprint);
  const accepted = clone(state); accepted.proposals[correct.id].status = 'accepted';
  assert.equal(single(accepted).relatedProposals.items[0].status, 'accepted');
  assert.notEqual(single(accepted).noticeFingerprint, original.noticeFingerprint);
  state = record(state, { taskId: 'p-one', withUse: false, outcome: 'success_verified', timestamp: LATER }).state;
  state = record(state, { taskId: 'p-two', withUse: false, outcome: 'success_verified', timestamp: LATER }).state;
  assert.equal(state.proposals[correct.id].status, 'open');
  assert.equal(single(state).relatedProposals.total, 0);
});

test('omitted matching proposals still bind the notice and cannot supply packet authorization or selected source events', async () => {
  let state = await active();
  for (let pattern = 0; pattern < 5; pattern++) for (let task = 0; task < 2; task++) {
    state = record(state, { taskId: `proposal-${pattern}-${task}`, errorCode: `ERROR-${pattern}` }).state;
  }
  const group = single(state);
  assert.equal(group.relatedProposals.total, 5); assert.equal(group.relatedProposals.items.length, 4); assert.equal(group.relatedProposals.omitted, 1);
  assert.equal(group.nextSteps.filter(item => item.code === 'PREPARE_EXISTING_REVIEW').length, 4);
  const omittedId = Object.keys(state.proposals).sort().at(-1);
  const changed = clone(state); changed.proposals[omittedId].reason += ' Review the existing scoped observations.';
  const next = single(changed);
  assert.deepEqual(next.relatedProposals, group.relatedProposals); assert.notEqual(next.noticeFingerprint, group.noticeFingerprint);
  assert.doesNotMatch(JSON.stringify(group), /"(?:packetFingerprint|eventIds|baseRevision|reviewed|holdout|ruleRemediationTried)":/);
});

test('incomplete legacy proposals do not break counts or become links, while non-data proposal contents remain a hard error', async () => {
  const state = record(await active(), { outcome: 'success_verified' }).state; const original = view(state);
  const legacy = clone(state); legacy.proposals.legacy = { status: 'open', scope: { operation: 'unrelated' } };
  assert.deepEqual(view(legacy), original);
  legacy.proposals.legacy = { id: 'legacy', status: 'open', kind: 'rule_fix', patternKey: 'invalid' };
  assert.deepEqual(view(legacy), original);
  let accessed = false;
  Object.defineProperty(legacy.proposals.legacy, 'reason', { enumerable: true, get() { accessed = true; return 'do not execute'; } });
  assert.throws(() => view(legacy)); assert.equal(accessed, false);
});

test('corrupt historical uses and projections are rejected even outside the requested scopes', async () => {
  let state = record(await active(), { outcome: 'success_verified' }).state;
  state = record(state, { taskId: 'outside', scope: OTHER, outcome: 'success_verified' }).state;
  const outside = Object.values(state.events).find(event => event.taskId === 'outside');
  const inside = Object.values(state.events).find(event => event.taskId !== 'outside');
  const mutations = [
    value => { value.events[outside.eventId].eventId = 'changed-id'; },
    value => { value.events[outside.eventId].ruleUses[0].selection.fingerprint = 'a'.repeat(64); },
    value => { value.events[outside.eventId].ruleUses[0].confirmation = 'selected_only'; },
    value => { delete value.attempts[ruleUseHash([outside.taskId, outside.attemptId])]; },
    value => { value.attempts[ruleUseHash([outside.taskId, outside.attemptId])].outcome = 'failure_verified'; },
    value => { value.attempts['wrong-key'] = value.attempts[ruleUseHash([outside.taskId, outside.attemptId])]; },
    value => { value.events[outside.eventId].ruleUses[0].useRef = inside.ruleUses[0].useRef;
      value.events[outside.eventId].ruleUses[0].evidenceRefs.push(inside.ruleUses[0].useRef);
      value.events[outside.eventId].evidenceRefs.push(inside.ruleUses[0].useRef); },
  ];
  for (const mutate of mutations) { const broken = clone(state); mutate(broken); assert.throws(() => view(broken)); }
  const before = clone(state); assert.doesNotThrow(() => view(state)); assert.deepEqual(state, before);
});

test('queries and options reject widening, duplicates, clocks, unauthorized fields and invalid budgets', () => {
  const state = createState();
  for (const queries of [null, [], [SCOPE, SCOPE], [SCOPE, OTHER, COMMON, { ...SCOPE, operation: 'fourth' }],
    [{ ...SCOPE, operation: '*' }], [SCOPE, { ...OTHER, engine: 'different' }],
    [SCOPE, { ...OTHER, context: { ...OTHER.context, version: '2' } }], [{ ...SCOPE, owner: 'other' }]]) assert.throws(() => usageReview(state, queries));
  for (const options of [null, [], { now: NOW }, { scope: SCOPE }, { owner: 'other' }, { threshold: 1 },
    { limit: 0 }, { limit: 11 }, { limit: 1.1 }, { maxChars: 0 }, { maxChars: 32769 },
    { seenNoticeFingerprints: ['not-sha'] }, { seenNoticeFingerprints: ['a'.repeat(64), 'a'.repeat(64)] },
    { seenNoticeFingerprints: Array.from({ length: 65 }, (_, index) => index.toString(16).padStart(64, '0')) }]) assert.throws(() => view(state, options));
});

test('data-only boundaries prevent getters, proxies, cycles, sparse arrays and credentials before any lookup or output', () => {
  let invoked = 0;
  const getter = {}; Object.defineProperty(getter, 'events', { enumerable: true, get() { invoked++; return {}; } });
  const proxy = new Proxy({}, { get() { invoked++; }, getPrototypeOf() { invoked++; } });
  const cyclic = createState(); cyclic.events.self = cyclic;
  const symbol = createState(); symbol[Symbol('bad')] = true;
  const arrayExtra = [clone(SCOPE)]; arrayExtra.hidden = true;
  for (const state of [getter, proxy, cyclic, symbol, { ...createState(), revision: Infinity },
    { ...createState(), events: { date: new Date() } }, { ...createState(), events: { code() {} } }]) assert.throws(() => view(state));
  for (const queries of [new Array(1), arrayExtra, [proxy], [getter]]) assert.throws(() => usageReview(createState(), queries));
  assert.equal(invoked, 0);
  const secret = 'github_pat_' + 'Q'.repeat(40);
  const bad = createState(); bad.proposals.legacy = { reason: secret };
  assert.throws(() => view(bad), error => error instanceof TypeError && !error.message.includes(secret));
  const deep = createState(); let pointer = deep.lessons;
  for (let index = 0; index < 65; index++) pointer = pointer.next = {};
  assert.throws(() => view(deep));
});
