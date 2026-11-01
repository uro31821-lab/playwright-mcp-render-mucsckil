import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, addLesson, evaluateLesson, recallContexts } from './engine.mjs';
import { bindRegression, runRegression } from './regression.mjs';
import { evaluateConstraints } from './constraints.mjs';
import { prepareRuleUse } from './rule-usage.mjs';
import { ruleDefinition, ruleUseHash, ruleUseScopes, validateRuleUseSelection, validateRuleUses } from './rule-use-contract.mjs';

// In-memory synthetic policies and observations only; no user memory, files,
// remote calls, business actions, or claims of demonstrated learning benefit.
const EVALUATED = '2026-11-01T08:00:00.000Z';
const SELECTED = '2026-11-01T09:00:00.000Z';
const APPLIED = '2026-11-01T09:01:00.000Z';
const OBSERVED = '2026-11-01T09:02:00.000Z';
const SCOPE = { domain: 'output', operation: 'summary.format', engine: 'jh-agent',
  context: { platform: 'node', version: 'rule-use-v1', environment: 'synthetic' } };
const COMMON = { ...SCOPE, domain: 'orchestration', operation: 'learning.scope' };
const SUITE = { id: 'source-field-required', version: '1', cases: [
  { id: 'present', input: { value: { source: 'fixture:checked-source' }, constraints: [
    { path: ['source'], op: 'exists' },
  ] }, expected: { passed: true, failed: [] } },
  { id: 'missing-detected', input: { value: {}, constraints: [
    { path: ['source'], op: 'exists' },
  ] }, expected: { passed: false, failed: [0] } },
] };
const clone = value => structuredClone(value);
function candidate(state = createState(), id = 'source-rule', extra = {}) {
  return addLesson(state, bindRegression({ id, ...clone(SCOPE), ruleVersion: '1',
    guidance: 'Include the checked source with the result.', evidenceRefs: ['fixture:original-policy'],
    ...extra }, SUITE));
}
async function checked(state = candidate(), id = 'source-rule', { now = EVALUATED, fail = false, omitTimestamp = false } = {}) {
  const result = await runRegression(state.lessons[id], SUITE,
    fail ? () => ({ mismatch: true }) : evaluateConstraints, { now });
  if (omitTimestamp) delete result.evaluation.timestamp;
  return evaluateLesson(state, id, result.evaluation);
}
function input(extra = {}) {
  return { taskId: 'synthetic-task', attemptId: 'synthetic-attempt', lessonId: 'source-rule', scope: clone(SCOPE), ...extra };
}
const prepare = (state, request = input(), options = { now: SELECTED }) => prepareRuleUse(state, request, options);
function rebind(selection) {
  const { fingerprint, ...bound } = selection;
  return { ...bound, fingerprint: ruleUseHash(bound) };
}
function eventFor(selection, overrides = {}) {
  const useRef = 'source:synthetic-rule-use';
  const usageEvidence = [useRef, 'artifact:synthetic-applied-output'];
  return { eventId: 'synthetic-outcome', taskId: selection.taskId, attemptId: selection.attemptId, sequence: 1,
    ...clone(selection.scope), timestamp: OBSERVED, outcome: 'success_verified', source: 'host_verified',
    evidenceRefs: ['source:synthetic-observation', 'artifact:synthetic-result', ...usageEvidence],
    ruleUses: [{ useRef, selection: clone(selection), appliedAt: APPLIED,
      evidenceRefs: usageEvidence, confirmation: 'applied_in_this_attempt' }], ...overrides };
}

test('preparation binds the full definition and full checked receipt without recording use or changing state', async () => {
  const definitionRefs = Array.from({ length: 12 }, (_, i) => 'fixture:source-' + i);
  const state = await checked(candidate(createState(), 'source-rule', {
    memoryKind: 'procedure', provenance: 'user_explicit', evidenceRefs: definitionRefs,
  }));
  const request = input(); const before = clone({ state, request });
  const result = prepare(state, request);
  assert.equal(result.schema, 'jh.learning-rule-use-preparation.v1');
  const selection = result.selection;
  assert.equal(selection.schema, 'jh.learning-rule-selection.v1');
  for (const key of ['taskId', 'attemptId', 'lessonId']) assert.equal(selection[key], request[key]);
  assert.deepEqual(selection.scope, SCOPE); assert.equal(selection.selectedAt, SELECTED);
  assert.equal(selection.revision, state.revision); assert.equal(selection.ruleVersion, '1');
  assert.equal(selection.inputFingerprint, state.lessons['source-rule'].inputFingerprint);
  // Independent engine receipts bind the same full definition and evaluation.
  assert.equal(selection.definitionFingerprint, state.lessons['source-rule'].evaluation.definitionFingerprint);
  assert.equal(selection.evaluationFingerprint, state.lessons['source-rule'].evaluationHistory.at(-1));
  assert.equal(ruleDefinition(state.lessons['source-rule']).evidenceRefs.length, 12);
  assert.equal(selection.recallFingerprint, recallContexts(state, [SCOPE], { now: SELECTED }).fingerprint);
  assert.equal(selection.limit, 5); assert.equal(selection.maxChars, 4000);
  assert.doesNotThrow(() => validateRuleUseSelection(selection));
  assert.equal(result.sourceAuthentication, 'host_attestation'); assert.equal(result.readOnly, true);
  for (const key of ['usageRecorded', 'externalEffects', 'preActionTimingVerified', 'applicationVerified', 'liveImprovementVerified']) {
    assert.equal(result[key], false, key);
  }
  assert.deepEqual({ state, request }, before);
  result.selection.scope.context.environment = 'mutated-return';
  assert.deepEqual({ state, request }, before);
  assert.deepEqual(state.events, {}); assert.deepEqual(state.attempts, {}); assert.deepEqual(state.proposals, {});
});

test('preparation uses only the actual scope and its exact common binding, including a deduplicated common task', async () => {
  const state = await checked(candidate(createState(), 'source-rule', COMMON));
  assert.throws(() => prepare(state), error => error.code === 'LEARNING_RULE_NOT_SELECTABLE');
  const prepared = prepare(state, input({ globalRecall: clone(COMMON), options: { limit: 2, maxChars: 2000 } }));
  assert.deepEqual(ruleUseScopes(prepared.selection), [SCOPE, COMMON]);
  assert.equal(prepared.selection.recallFingerprint, recallContexts(state, [SCOPE, COMMON],
    { now: SELECTED, limit: 2, maxChars: 2000 }).fingerprint);
  const alreadyCommon = prepare(state, input({ scope: clone(COMMON), globalRecall: clone(COMMON) }));
  assert.deepEqual(ruleUseScopes(alreadyCommon.selection), [COMMON]);
  for (const globalRecall of [null, {}, SCOPE, { ...COMMON, operation: 'jh.common.rules' },
    { ...COMMON, engine: 'different-engine' },
    { ...COMMON, context: { ...COMMON.context, platform: 'different-platform' } },
    { ...COMMON, context: { ...COMMON.context, version: 'different-version' } },
    { ...COMMON, context: { ...COMMON.context, environment: 'different-environment' } }]) {
    assert.throws(() => prepare(state, input({ globalRecall })));
  }
});

test('candidate, quarantined, expired, future, conflicted and budget-omitted rules cannot become selections', async () => {
  const notSelectable = error => error.code === 'LEARNING_RULE_NOT_SELECTABLE';
  for (const state of [candidate(), await checked(candidate(), 'source-rule', { fail: true }),
    await checked(candidate(createState(), 'source-rule', { validUntil: SELECTED })),
    await checked(candidate(createState(), 'source-rule', { validFrom: OBSERVED }))]) {
    const before = clone(state);
    assert.throws(() => prepare(state), notSelectable); assert.deepEqual(state, before);
  }
  const active = await checked();
  assert.throws(() => prepare(active, input({ options: { maxChars: 1 } })), notSelectable);
  assert.throws(() => prepare(active, input({ scope: { ...SCOPE, operation: 'unrelated' } })), notSelectable);
  let conflicting = await checked(candidate(createState(), 'source-rule', { conflictKey: 'source-policy' }));
  conflicting = await checked(candidate(conflicting, 'competing-rule', { conflictKey: 'source-policy', guidance: 'Omit the source.' }), 'competing-rule');
  assert.throws(() => prepare(conflicting), notSelectable);
  assert.throws(() => prepare(active, input({ lessonId: 'missing-rule' })), error => error.code === 'LEARNING_LESSON_NOT_FOUND');
});

test('complete receipt validation and a timestamp preceding selection are required', async () => {
  const state = await checked();
  const damaged = clone(state); damaged.lessons['source-rule'].evaluation.caseResults[0].actualHash = 'invalid';
  assert.throws(() => prepare(damaged), error => error.code === 'LEARNING_RULE_NOT_SELECTABLE');
  for (const unprovable of [await checked(candidate(), 'source-rule', { omitTimestamp: true }),
    await checked(candidate(), 'source-rule', { now: OBSERVED })]) {
    assert.throws(() => prepare(unprovable), error => error.code === 'LEARNING_RULE_EVALUATION_TIME_INVALID');
  }
  const equal = prepare(state, input(), { now: EVALUATED });
  assert.equal(equal.selection.selectedAt, EVALUATED);
});

test('public inputs cannot choose a clock, arbitrary scopes, stored flags or use status', async () => {
  const state = await checked(); const before = clone(state);
  for (const request of [null, [], {}, input({ now: EVALUATED }), input({ options: { now: EVALUATED } }),
    input({ queries: [SCOPE] }), input({ ownerScope: 'other-owner' }), input({ sourceAuthentication: 'authenticated' }),
    input({ usageRecorded: true }), input({ taskId: '' }), input({ attemptId: '*' }),
    input({ globalRecall: undefined }), input({ options: null }), input({ options: { limit: 0 } }),
    input({ options: { maxChars: 16385 } })]) assert.throws(() => prepare(state, request));
  for (const options of [{ now: null }, { now: '2026-02-30T00:00:00Z' }, { now: SELECTED, source: 'trusted' }]) {
    assert.throws(() => prepare(state, input(), options));
  }
  assert.deepEqual(state, before);
});

test('selection hashes bind identities, budgets, scope, timing and complete definition receipts', async () => {
  const selection = prepare(await checked()).selection;
  for (const [key, value] of [['taskId', 'another-task'], ['attemptId', 'another-attempt'],
    ['lessonId', 'another-rule'], ['ruleVersion', '2'], ['inputFingerprint', '0'.repeat(64)],
    ['definitionFingerprint', '1'.repeat(64)], ['evaluationFingerprint', '2'.repeat(64)],
    ['recallFingerprint', '3'.repeat(64)], ['revision', selection.revision + 1], ['selectedAt', APPLIED],
    ['limit', 10], ['maxChars', 1000]]) {
    assert.throws(() => validateRuleUseSelection({ ...selection, [key]: value }), /fingerprint/);
  }
  for (const change of [{ schema: 'unknown' }, { limit: 0 }, { maxChars: 16385 },
    { revision: -1 }, { revision: Number.MAX_SAFE_INTEGER }, { selectedAt: '2026-02-30T00:00:00Z' },
    { scope: { ...SCOPE, operation: '*' } }, { globalRecall: { ...COMMON, engine: 'different' } }]) {
    assert.throws(() => validateRuleUseSelection(rebind({ ...selection, ...change })));
  }
  assert.throws(() => validateRuleUseSelection({ ...selection, sourceAuthentication: 'authenticated' }));
});

test('a real observation can structurally bind explicit use and separate application evidence without changing it', async () => {
  const selection = prepare(await checked()).selection;
  const event = eventFor(selection); const before = clone(event);
  assert.doesNotThrow(() => validateRuleUses(event));
  assert.deepEqual(event, before);
  const simultaneous = eventFor(selection);
  simultaneous.ruleUses[0].appliedAt = SELECTED; simultaneous.timestamp = SELECTED;
  assert.doesNotThrow(() => validateRuleUses(simultaneous));
  const { ruleUses, ...legacy } = event;
  assert.doesNotThrow(() => validateRuleUses(legacy));
});

test('use requires explicit confirmation, host source and references present in the same actual event', async () => {
  const event = eventFor(prepare(await checked()).selection);
  const mutations = [
    value => { delete value.ruleUses[0].confirmation; },
    value => { value.ruleUses[0].confirmation = 'selected_only'; },
    value => { value.source = 'user_explicit'; },
    value => { value.source = 'user_reported'; },
    value => { value.ruleUses[0].evidenceRefs = []; },
    value => { value.ruleUses[0].evidenceRefs = ['artifact:synthetic-applied-output']; },
    value => { value.evidenceRefs = ['source:synthetic-observation']; },
    value => { value.ruleUses[0].evidenceRefs.push('artifact:unbound-evidence'); },
    value => { value.ruleUses[0].useRef = 'https://private.invalid/raw'; },
    value => { value.ruleUses[0].applicationVerified = true; },
  ];
  for (const mutate of mutations) { const altered = clone(event); mutate(altered); assert.throws(() => validateRuleUses(altered)); }
});

test('a valid selection cannot be reused for a different task, attempt, actual scope or chronology', async () => {
  const event = eventFor(prepare(await checked()).selection);
  const mutations = [
    value => { value.taskId = 'other-task'; }, value => { value.attemptId = 'other-attempt'; },
    value => { value.operation = 'different-operation'; }, value => { value.engine = 'different-engine'; },
    value => { value.context.environment = 'different-environment'; },
    value => { value.ruleUses[0].appliedAt = EVALUATED; },
    value => { value.ruleUses[0].appliedAt = '2026-11-01T09:03:00Z'; },
    value => { value.ruleUses[0].appliedAt = '2026-02-30T00:00:00Z'; },
  ];
  for (const mutate of mutations) { const altered = clone(event); mutate(altered); assert.throws(() => validateRuleUses(altered)); }
});

test('use arrays are bounded and cannot duplicate a rule or reference', async () => {
  const event = eventFor(prepare(await checked()).selection);
  for (const uses of [[], Array.from({ length: 5 }, () => clone(event.ruleUses[0]))]) {
    assert.throws(() => validateRuleUses({ ...event, ruleUses: uses }));
  }
  const sameRule = clone(event); const extra = clone(event.ruleUses[0]);
  extra.useRef = 'source:another-use'; extra.evidenceRefs = [extra.useRef];
  sameRule.evidenceRefs.push(extra.useRef); sameRule.ruleUses.push(extra);
  assert.throws(() => validateRuleUses(sameRule), /Duplicate/);
  const sameReference = clone(event); const differentRule = clone(event.ruleUses[0]);
  differentRule.selection = rebind({ ...differentRule.selection, lessonId: 'another-rule' });
  sameReference.ruleUses.push(differentRule);
  assert.throws(() => validateRuleUses(sameReference), /Duplicate/);
  const tooManyRefs = clone(event);
  tooManyRefs.ruleUses[0].evidenceRefs.push(...Array.from({ length: 7 }, (_, i) => 'fixture:more-' + i));
  tooManyRefs.evidenceRefs.push(...tooManyRefs.ruleUses[0].evidenceRefs.slice(2));
  assert.throws(() => validateRuleUses(tooManyRefs));
});

test('historical structural receipts stay readable when a later current evaluation changes', async () => {
  const state = await checked(); const before = clone(state);
  const prepared = prepare(state); const event = eventFor(prepared.selection);
  const changed = await checked(state, 'source-rule', { now: OBSERVED, fail: true });
  assert.equal(changed.lessons['source-rule'].state, 'quarantined');
  assert.throws(() => prepare(changed), error => error.code === 'LEARNING_RULE_NOT_SELECTABLE');
  assert.doesNotThrow(() => validateRuleUseSelection(prepared.selection));
  assert.doesNotThrow(() => validateRuleUses(event));
  assert.equal(ruleUseHash(ruleDefinition(changed.lessons['source-rule'])), prepared.selection.definitionFingerprint);
  assert.notEqual(ruleUseHash(changed.lessons['source-rule'].evaluation), prepared.selection.evaluationFingerprint);
  assert.deepEqual(state, before);
});

test('known credentials are rejected without echoing raw input', async () => {
  const state = await checked(); const secret = 'ghp_' + 'SYNTHETIC0'.repeat(4);
  const reject = action => assert.throws(action, error => error instanceof TypeError && !error.message.includes(secret));
  reject(() => prepare(state, input({ taskId: secret })));
  reject(() => prepare(state, input({ scope: { ...SCOPE, engine: secret } })));
  reject(() => ruleUseHash({ hidden: secret }));
  reject(() => ruleDefinition({ ...state.lessons['source-rule'], guidance: secret }));
  const event = eventFor(prepare(state).selection);
  event.ruleUses[0].useRef = 'source:' + secret;
  reject(() => validateRuleUses(event));
});

test('getters, proxies, cycles and malformed or oversized arrays never execute input behavior', async () => {
  const state = await checked(); const selection = prepare(state).selection;
  let invoked = 0;
  const getter = (value, key) => Object.defineProperty(value, key, { enumerable: true,
    get() { invoked++; throw new Error('must not run'); } });
  const proxy = value => new Proxy(value, { get() { invoked++; throw new Error('must not run'); },
    ownKeys() { invoked++; throw new Error('must not run'); }, getPrototypeOf() { invoked++; throw new Error('must not run'); } });
  for (const bad of [getter(input(), 'scope'), proxy(input()), input({ scope: proxy(SCOPE) })]) {
    assert.throws(() => prepare(state, bad));
  }
  assert.throws(() => validateRuleUseSelection(getter(clone(selection), 'fingerprint')));
  assert.throws(() => ruleUseScopes(proxy({ scope: SCOPE })));
  assert.throws(() => ruleDefinition(proxy(state.lessons['source-rule'])));
  const event = eventFor(selection); event.ruleUses = getter([clone(event.ruleUses[0])], '0');
  assert.throws(() => validateRuleUses(event));
  const cyclic = {}; cyclic.self = cyclic;
  const sparse = []; sparse.length = 1;
  const extended = []; extended.extra = true;
  for (const value of [cyclic, sparse, extended, new Date(), () => {}, Symbol('invalid'), Infinity,
    'x'.repeat(1024 * 1024 + 1), Array(10001).fill(null)]) assert.throws(() => ruleUseHash(value));
  assert.equal(invoked, 0);
});
