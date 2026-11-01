import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createState, addLesson, evaluateLesson, recallContexts } from './engine.mjs';
import { createHostInstructionCandidate } from './instructions.mjs';
import { bindRegression, runRegression } from './regression.mjs';
import { evaluateConstraints } from './constraints.mjs';
import { lessonView } from './lesson-view.mjs';

// Pure synthetic state only: no owner file, source lookup, server or device action.
const NOW = '2026-11-01T10:00:00.000Z';
const LATER = '2026-11-01T11:00:00.000Z';
const SCOPE = { domain: 'output', operation: 'summary.format', engine: 'jh-agent',
  context: { platform: 'node', version: 'lesson-view-v1', environment: 'synthetic' } };
const COMMON = { ...SCOPE, domain: 'orchestration', operation: 'learning.scope' };
const SUITE = { id: 'include-source', version: '1', cases: [
  { id: 'source-present', input: { value: { source: 'fixture:checked' }, constraints: [
    { path: ['source'], op: 'exists' },
  ] }, expected: { passed: true, failed: [] } },
  { id: 'missing-source-detected', input: { value: {}, constraints: [
    { path: ['source'], op: 'exists' },
  ] }, expected: { passed: false, failed: [0] } },
] };
const clone = value => structuredClone(value);
function definition(id = 'source-rule', extra = {}) {
  return bindRegression({ id, ...clone(SCOPE), ruleVersion: '1',
    guidance: 'Preserve the checked source in the summary.', evidenceRefs: ['fixture:source-rule'], ...extra }, SUITE);
}
function candidate(id = 'source-rule', extra = {}, state = createState()) {
  return addLesson(state, definition(id, extra));
}
async function checked(state, id = 'source-rule', { now = NOW, failed = false, evidenceRefs = [] } = {}) {
  const result = await runRegression(state.lessons[id], SUITE,
    failed ? () => ({ syntheticMismatch: true }) : evaluateConstraints, { now });
  return evaluateLesson(state, id, { ...result.evaluation,
    evidenceRefs: [...result.evaluation.evidenceRefs, ...evidenceRefs] });
}
const view = (state, input = {}) => lessonView(state, { lessonId: 'source-rule', query: SCOPE, options: { now: NOW }, ...input });

test('a direct explicit candidate is inspectable without proposals and preserves exact source data as stored', () => {
  const text = '  확인한 출처🙂를 보존합니다.\r\n원문 e\u0301와 공백  ';
  const prepared = createHostInstructionCandidate(createState(), {
    lessonId: 'source-rule', ruleVersion: '1', text,
    sourceRef: 'user:synthetic-original-message', sourceSha256: createHash('sha256').update(text).digest('hex'),
    appliesTo: { kind: 'exact_scope' }, confirmation: 'explicit_user_instruction',
  }, SUITE, { scope: SCOPE });
  const state = addLesson(createState(), prepared.lesson); const before = clone(state);
  const input = { lessonId: 'source-rule', queries: [COMMON, SCOPE], options: { now: NOW } };
  const priorInput = clone(input); const result = lessonView(state, input);
  assert.equal(result.schema, 'jh.learning-lesson-view.v1');
  assert.equal(result.lessonId, 'source-rule'); assert.equal(result.revision, state.revision);
  assert.equal(result.checkedAt, NOW); assert.equal(result.definition.guidance, text);
  assert.deepEqual(result.definition.scope, SCOPE);
  assert.deepEqual(result.definition.evidenceRefs, prepared.lesson.evidenceRefs);
  assert.equal(result.definition.provenance, 'user_explicit');
  assert.equal(result.definition.memoryKind, 'procedure');
  assert.equal(result.lessonState, 'candidate'); assert.equal(result.evaluation.status, 'not_run');
  assert.equal(result.selectionStatus, 'candidate'); assert.equal(result.recallIncluded, false);
  assert.equal(result.scopeMatches, true); assert.equal(result.engineRecallIncluded, false);
  assert.deepEqual(state.proposals, {}); assert.deepEqual(state.events, {}); assert.deepEqual(state.attempts, {});
  for (const key of ['readOnly', 'advisoryOnly']) assert.equal(result[key], true);
  for (const key of ['externalEffects', 'pastApplicationVerified', 'liveImprovementVerified', 'liveExecutionVerified']) assert.equal(result[key], false);
  assert.doesNotMatch(JSON.stringify(result), /"(?:sourceAuthentication|sourceRetrievalVerified|appliesTo|suite|caseResults|evaluationHistory)":/);
  result.definition.scope.context.environment = 'changed-copy';
  result.definition.evidenceRefs.push('fixture:local');
  assert.deepEqual(state, before); assert.deepEqual(input, priorInput);
});

test('current passing and failed receipts are bounded and inspection never changes stored evaluation', async () => {
  const refs = Array.from({ length: 12 }, (_, i) => 'fixture:definition-' + i);
  let state = await checked(candidate('source-rule', { evidenceRefs: refs }), 'source-rule',
    { evidenceRefs: Array.from({ length: 12 }, (_, i) => 'test:evaluation-' + i) });
  const before = clone(state); const result = view(state);
  assert.equal(result.lessonState, 'active'); assert.equal(result.evaluation.status, 'passed');
  assert.equal(result.evaluation.passed, 2); assert.equal(result.evaluation.failed, 0);
  assert.equal(result.evaluation.skipped, 0); assert.equal(result.evaluation.timestamp, NOW);
  assert.equal(result.definition.evidenceRefs.length, 8); assert.equal(result.definition.evidenceRefsTruncated, true);
  assert.equal(result.evaluation.evidenceRefs.length, 8); assert.equal(result.evaluation.evidenceRefsTruncated, true);
  assert.equal(result.evaluation.definitionFingerprint, state.lessons['source-rule'].evaluation.definitionFingerprint);
  assert.equal(result.recallIncluded, true); assert.equal(result.engineRecallIncluded, true);
  assert.equal(result.selectionStatus, 'included');
  assert.deepEqual(state, before);
  result.evaluation.evidenceRefs.push('fixture:local'); assert.deepEqual(state, before);
  state = await checked(state, 'source-rule', { now: LATER, failed: true });
  const failed = view(state);
  assert.equal(failed.lessonState, 'quarantined'); assert.equal(failed.evaluation.status, 'failed');
  assert.equal(failed.evaluation.failed, 2); assert.equal(failed.selectionStatus, 'quarantined');
  assert.equal(failed.recallIncluded, false); assert.equal(failed.engineRecallIncluded, false);
});

test('legacy metadata and unbound legacy receipts are not relabeled as newly authenticated instructions', () => {
  let state = candidate();
  const legacyEvaluation = { ruleVersion: '1', inputFingerprint: state.lessons['source-rule'].inputFingerprint,
    passed: 1, failed: 0, skipped: 0, timestamp: NOW, evidenceRefs: ['test:legacy-regression'] };
  state = evaluateLesson(state, 'source-rule', legacyEvaluation);
  const before = clone(state); const result = view(state);
  assert.equal(result.evaluation.status, 'passed'); assert.equal(result.recallIncluded, true);
  for (const key of ['memoryKind', 'provenance', 'reflection', 'validFrom', 'validUntil', 'sourceAuthentication']) {
    assert.equal(Object.hasOwn(result.definition, key), false);
  }
  assert.equal(Object.hasOwn(result.evaluation, 'definitionFingerprint'), false);
  assert.deepEqual(state, before);
});

test('invalid receipts cannot be reused and a stronger view explicitly distinguishes the raw engine selection', async () => {
  const state = await checked(candidate('source-rule', { provenance: 'user_explicit' }));
  let sawRawEngineSelection = false;
  for (const mutate of [
    lesson => { lesson.evaluation.passed += 1; },
    lesson => { lesson.evaluation.caseResults[0].actualHash = 'not-a-hash'; },
    lesson => { lesson.evaluation.evidenceRefs = ['https://private.invalid/raw']; },
    lesson => { lesson.evaluation.definitionFingerprint = 'f'.repeat(64); },
    lesson => { lesson.guidance = 'Changed text with an old evaluation.'; },
  ]) {
    const damaged = clone(state); mutate(damaged.lessons['source-rule']); const before = clone(damaged);
    const result = view(damaged);
    const actualEngineIncluded = recallContexts(damaged, [SCOPE], { now: NOW }).lessons.some(item => item.id === 'source-rule');
    assert.equal(result.evaluation.status, 'invalid'); assert.deepEqual(result.evaluation.evidenceRefs, []);
    assert.equal(result.evaluation.passed, null); assert.equal(result.recallIncluded, false);
    assert.equal(result.selectionStatus, 'invalid_evaluation');
    assert.equal(result.engineRecallIncluded, actualEngineIncluded);
    assert.equal(result.recallFingerprint, recallContexts(damaged, [SCOPE], { now: NOW }).fingerprint);
    sawRawEngineSelection ||= actualEngineIncluded;
    assert.deepEqual(damaged, before);
  }
  assert.equal(sawRawEngineSelection, true);
});

test('validity boundaries and current scope mismatch are distinct from stored active state and passing evaluation', async () => {
  const state = await checked(candidate('source-rule', { validFrom: '2026-11-01T12:00:00.000Z',
    validUntil: '2026-11-01T13:00:00.000Z' })); const before = clone(state);
  for (const [now, status, included] of [
    [NOW, 'not_yet_valid', false], ['2026-11-01T12:00:00.000Z', 'in_window', true],
    ['2026-11-01T13:00:00.000Z', 'expired', false],
  ]) {
    const result = view(state, { options: { now } });
    assert.equal(result.lessonState, 'active'); assert.equal(result.evaluation.status, 'passed');
    assert.equal(result.temporalStatus, status); assert.equal(result.recallIncluded, included);
    assert.equal(result.selectionStatus, included ? 'included' : status);
  }
  for (const patch of [{ operation: 'other.operation' }, { engine: 'different-agent' },
    { context: { ...SCOPE.context, environment: 'other-env' } }]) {
    const result = view(state, { query: { ...SCOPE, ...patch } });
    assert.equal(result.scopeMatches, false); assert.equal(result.selectionStatus, 'not_in_scope');
    assert.equal(result.recallIncluded, false); assert.equal(result.evaluation.status, 'passed');
  }
  assert.deepEqual(state, before);
});

test('historically superseded rules remain not selected when the replacing rule has expired', async () => {
  let state = await checked(candidate('source-rule', { provenance: 'model_inferred' }));
  state = candidate('replacement', { supersedes: ['source-rule'], provenance: 'user_explicit',
    validUntil: '2026-11-01T12:00:00.000Z' }, state);
  state = await checked(state, 'replacement', { now: LATER });
  const before = clone(state); const result = view(state, { options: { now: '2026-11-01T13:00:00.000Z' } });
  assert.equal(result.lessonState, 'active'); assert.equal(result.evaluation.status, 'passed');
  assert.equal(result.temporalStatus, 'in_window'); assert.equal(result.recallIncluded, false);
  assert.equal(result.selectionStatus, 'not_selected'); assert.deepEqual(result.conflicts, []);
  assert.deepEqual(state, before);
});

test('common and task conflicts use the exact requested scopes and remain distinct from higher authority selection', async () => {
  let state = await checked(candidate('source-rule', { provenance: 'model_inferred', conflictKey: 'source-format' }));
  state = await checked(candidate('common-rule', { ...COMMON, guidance: 'Different common source guidance.',
    provenance: 'model_inferred', conflictKey: 'source-format' }, state), 'common-rule');
  assert.equal(view(state).recallIncluded, true);
  const request = { lessonId: 'source-rule', queries: [COMMON, SCOPE], options: { now: NOW } };
  const combined = lessonView(state, request);
  assert.equal(combined.recallIncluded, false); assert.equal(combined.selectionStatus, 'not_selected');
  assert.deepEqual(combined.conflicts, [{ conflictKey: 'source-format', reason: 'equal_authority_conflict',
    lessonIds: ['common-rule', 'source-rule'] }]);
  state = await checked(candidate('explicit-common', { ...COMMON, guidance: 'Follow the actual explicit common policy.',
    provenance: 'user_explicit', conflictKey: 'source-format' }, state), 'explicit-common');
  const lower = lessonView(state, request);
  assert.equal(lower.evaluation.status, 'passed'); assert.equal(lower.recallIncluded, false);
  assert.equal(lower.selectionStatus, 'not_selected'); assert.deepEqual(lower.conflicts, []);
  assert.equal(lessonView(state, { ...request, lessonId: 'explicit-common' }).recallIncluded, true);
});

test('budget and guidance deduplication exclusions do not invent a failed check or detailed exclusion reason', async () => {
  let state = await checked(candidate('source-rule', { provenance: 'user_explicit' }));
  state = await checked(candidate('a-earlier-rule', { provenance: 'user_explicit', guidance: 'Earlier guidance.' }, state), 'a-earlier-rule');
  for (const options of [{ now: NOW, limit: 1 }, { now: NOW, maxChars: 1 }]) {
    const result = view(state, { options });
    assert.equal(result.recallIncluded, false); assert.equal(result.evaluation.status, 'passed');
    assert.equal(result.selectionStatus, 'not_selected'); assert.deepEqual(result.conflicts, []);
    const actual = recallContexts(state, [SCOPE], options);
    assert.equal(result.recallFingerprint, actual.fingerprint); assert.equal(result.recallOmitted, actual.omitted);
  }
  state = await checked(candidate('a-common-duplicate', { ...COMMON, provenance: 'user_explicit' }, state), 'a-common-duplicate');
  const result = lessonView(state, { lessonId: 'source-rule', queries: [COMMON, SCOPE], options: { now: NOW } });
  assert.equal(result.recallIncluded, false); assert.equal(result.evaluation.status, 'passed');
  assert.equal(result.selectionStatus, 'not_selected');
});

test('recall fingerprints and explicit options match the original context including order and null-prototype data', async () => {
  const state = await checked(candidate());
  for (const queries of [[SCOPE], [SCOPE, COMMON], [COMMON, SCOPE]]) {
    const options = { now: NOW, limit: 3, maxChars: 777 };
    const actual = recallContexts(state, queries, options);
    const result = lessonView(state, { lessonId: 'source-rule', queries, options });
    assert.equal(result.recallFingerprint, actual.fingerprint); assert.equal(result.recallOmitted, actual.omitted);
    assert.deepEqual(result.recallBudget, { limit: 3, maxChars: 777 });
  }
  const nullScope = Object.assign(Object.create(null), SCOPE,
    { context: Object.assign(Object.create(null), SCOPE.context) });
  assert.equal(view(state, { query: nullScope }).scopeMatches, true);
  const defaults = lessonView(state, { lessonId: 'source-rule', query: SCOPE });
  assert.deepEqual(defaults.recallBudget, { limit: 5, maxChars: 4000 });
  assert.match(defaults.checkedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('stored reflection and lifecycle metadata are preserved while conflict and evidence lists remain bounded', async () => {
  const reflection = { assessment: 'reviewed_inference', cause: 'Synthetic cause.', resolution: 'Synthetic resolution.',
    expectedEffect: 'Expected only, not demonstrated.', eventIds: ['synthetic-reviewed-event'] };
  let state = await checked(candidate('source-rule', { provenance: 'model_inferred', memoryKind: 'procedure',
    conflictKey: 'source-format', reflection }));
  for (let index = 0; index < 20; index++) {
    const id = 'conflicting-' + index;
    state = await checked(candidate(id, { provenance: 'model_inferred', conflictKey: 'source-format',
      guidance: 'Independent conflicting guidance ' + index }, state), id);
  }
  const before = clone(state); const result = view(state);
  assert.deepEqual(result.definition.reflection, reflection); assert.equal(result.definition.provenance, 'model_inferred');
  assert.equal(result.conflicts.length, 1); assert.equal(result.conflicts[0].lessonIds.length, 16);
  assert.equal(result.conflictsTruncated, true);
  result.definition.reflection.cause = 'changed-copy'; result.conflicts[0].lessonIds.push('local');
  assert.deepEqual(state, before);
});

test('missing IDs and malformed requests never substitute a recent or inferred lesson or scope', () => {
  const state = candidate(); const before = clone(state);
  assert.throws(() => lessonView(state, { lessonId: 'missing-rule', query: SCOPE }),
    error => error.code === 'LEARNING_LESSON_NOT_FOUND' && !error.message.includes('missing-rule'));
  assert.throws(() => lessonView(createState(), { lessonId: 'constructor', query: SCOPE }),
    error => error.code === 'LEARNING_LESSON_NOT_FOUND');
  for (const input of [
    { lessonId: 'source-rule' }, { lessonId: 'source-rule', query: SCOPE, queries: [SCOPE] },
    { lessonId: 'source-rule', query: SCOPE, revision: 1 }, { lessonId: 'source-rule', query: SCOPE, suite: SUITE },
    { lessonId: 'source-rule', queries: [] }, { lessonId: 'source-rule', queries: [SCOPE, SCOPE] },
    { lessonId: 'source-rule', queries: [SCOPE, { ...COMMON, engine: 'other' }] },
    { lessonId: 'source-rule', query: { ...SCOPE, unexpected: true } },
    { lessonId: 'source-rule', query: SCOPE, options: { limit: 0 } },
    { lessonId: 'source-rule', query: SCOPE, options: { limit: 21 } },
    { lessonId: 'source-rule', query: SCOPE, options: { maxChars: 16385 } },
    { lessonId: 'source-rule', query: SCOPE, options: { now: '2026-02-30T00:00:00Z' } },
    { lessonId: 'source-rule', query: SCOPE, options: { commonScope: COMMON } },
  ]) assert.throws(() => lessonView(state, input));
  assert.deepEqual(state, before);
});

test('corrupt stored definitions and unsupported metadata cannot be returned as safe stored guidance', () => {
  for (const mutate of [
    lesson => { lesson.id = 'another-id'; }, lesson => { lesson.guidance = 'x'.repeat(2049); },
    lesson => { lesson.guidance = '\ud800'; }, lesson => { lesson.evidenceRefs = ['https://private.invalid/raw']; },
    lesson => { lesson.state = 'unknown'; }, lesson => { lesson.advisoryOnly = false; },
    lesson => { lesson.sourceAuthentication = 'authenticated_owner_attestation'; },
  ]) {
    const state = candidate(); mutate(state.lessons['source-rule']); const before = clone(state);
    assert.throws(() => view(state)); assert.deepEqual(state, before);
  }
});

test('getters proxies hidden fields custom array behavior and cyclic data are rejected without execution', async () => {
  const state = await checked(candidate()); let invoked = 0;
  const accessor = (object, key) => Object.defineProperty(object, key, { enumerable: true,
    get() { invoked++; throw new Error('must not run'); } });
  const proxy = value => new Proxy(value, { get() { invoked++; throw new Error('must not run'); },
    ownKeys() { invoked++; throw new Error('must not run'); }, getPrototypeOf() { invoked++; throw new Error('must not run'); } });
  for (const input of [proxy({ lessonId: 'source-rule', query: SCOPE }),
    accessor({ lessonId: 'source-rule' }, 'query'),
    { lessonId: 'source-rule', query: proxy(SCOPE) },
    { lessonId: 'source-rule', query: SCOPE, options: accessor({}, 'now') },
    { lessonId: 'source-rule', queries: Object.assign([SCOPE], { some() { invoked++; } }) },
    Object.defineProperty({ lessonId: 'source-rule', query: SCOPE }, 'hidden', { value: 1 }),
  ]) assert.throws(() => lessonView(state, input));
  for (const mutate of [
    copy => { copy.lessons = proxy(copy.lessons); },
    copy => { accessor(copy.lessons['source-rule'], 'guidance'); },
    copy => { copy.lessons['source-rule'].evaluation = proxy(copy.lessons['source-rule'].evaluation); },
    copy => { accessor(copy.lessons['source-rule'].evaluation.caseResults[0], 'actualHash'); },
    copy => { copy.events.toJSON = () => { invoked++; }; },
  ]) { const copy = clone(state); mutate(copy); assert.throws(() => view(copy)); }
  const cyclic = { lessonId: 'source-rule', query: SCOPE }; cyclic.options = cyclic;
  assert.throws(() => lessonView(state, cyclic));
  assert.equal(invoked, 0);
});
