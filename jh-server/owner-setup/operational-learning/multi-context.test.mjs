import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, addLesson, evaluateLesson, recall, recallContext, recallContexts } from './engine.mjs';
import { bindRegression, runRegression } from './regression.mjs';
import { evaluateConstraints } from './constraints.mjs';

const T0 = '2026-10-31T00:00:00.000Z';
const T1 = '2026-10-31T01:00:00.000Z';
const T2 = '2026-10-31T02:00:00.000Z';
const T3 = '2026-10-31T03:00:00.000Z';
const TARGET = { domain: 'device', operation: 'life_android_control.click', engine: 'jh-server',
  context: { platform: 'jh-mcp', version: 'server-learning-v1', environment: 'owner-service' } };
const COMMON = { ...TARGET, domain: 'orchestration', operation: 'jh.common.rules' };
const WEB = { ...TARGET, domain: 'web', operation: 'life_web.search' };
const SUITE = { id: 'multi-context-fixture', version: '1', cases: [{ id: 'present',
  input: { value: { target: 'right' }, constraints: [{ path: ['target'], op: 'equals', expected: 'right' }] },
  expected: { passed: true, failed: [] } }] };
const LEGACY_CONTEXT_FP = '8c8eeab6e9b901ff515e90815e8b7ab643f72f1383506f921b1b87fb2ff9df5c';
const LEGACY_INPUT_FP = '32d98bafe26bb0c2ee48b5e543b0ee89a7659612f52bdd09ed23ce27e55db9da';

function definition(id, query = TARGET, overrides = {}) {
  return { id, ...structuredClone(query), guidance: `Apply ${id}.`, ruleVersion: '1',
    evidenceRefs: ['fixture:' + id], ...overrides };
}
async function activate(state, lesson, now = T0) {
  const bound = bindRegression(lesson, SUITE);
  const { evaluation } = await runRegression(bound, SUITE, evaluateConstraints, { now });
  return evaluateLesson(addLesson(state, bound), lesson.id, evaluation);
}
async function quarantine(state, id, now = T1) {
  const { evaluation } = await runRegression(state.lessons[id], SUITE,
    () => ({ passed: false, failed: [0] }), { now });
  assert.equal(evaluation.failed, 1);
  return evaluateLesson(state, id, evaluation);
}
const ids = result => result.lessons.map(lesson => lesson.id);
const at = (state, now = T1, options = {}) => recallContexts(state, [TARGET, COMMON], { now, ...options });

test('target and common scopes are combined without widening exact scope matching', async () => {
  let state = await activate(createState(), definition('target'));
  state = await activate(state, definition('common', COMMON, { provenance: 'user_explicit' }));
  state = await activate(state, definition('other-operation', { ...TARGET, operation: 'life_android_control.type' }));
  state = await activate(state, definition('other-domain', { ...TARGET, domain: 'routine' }));
  state = await activate(state, definition('other-engine', { ...COMMON, engine: 'another-engine' }));
  state = await activate(state, definition('other-environment', { ...COMMON,
    context: { ...COMMON.context, environment: 'another-owner-service' } }));
  const result = at(state);
  assert.deepEqual(ids(result), ['common', 'target']);
  assert.deepEqual(result.conflicts, []);
  assert.equal(result.omitted, 0);
  assert.equal(result.revision, state.revision);
  assert.equal(result.lessons[0].operation, COMMON.operation);
  assert.equal(result.lessons[1].operation, TARGET.operation);
});

test('one common source can accompany different target queries and three scopes are supported', async () => {
  let state = await activate(createState(), definition('device-rule'));
  state = await activate(state, definition('common-rule', COMMON));
  state = await activate(state, definition('web-rule', WEB));
  assert.deepEqual(ids(recallContexts(state, [WEB, COMMON], { now: T1 })), ['common-rule', 'web-rule']);
  assert.deepEqual(ids(recallContexts(state, [WEB, COMMON, TARGET], { now: T1 })), ['common-rule', 'device-rule', 'web-rule']);
  assert.equal(state.lessons['common-rule'].domain, 'orchestration');
  assert.equal(state.lessons['common-rule'].operation, 'jh.common.rules');
  assert.equal(state.lessons['device-rule'].operation, TARGET.operation);
});

test('the bounded query list rejects duplicates, holes, accessors and unknown fields', () => {
  const state = createState();
  const accessorList = [TARGET];
  let accessorCalls = 0;
  Object.defineProperty(accessorList, '0', { get() { accessorCalls++; return TARGET; } });
  const extraList = [TARGET]; extraList.owner = 'other';
  const symbolList = [TARGET]; symbolList[Symbol('owner')] = 'other';
  for (const queries of [
    null, {}, TARGET, [], [TARGET, COMMON, WEB, { ...TARGET, operation: 'fourth' }],
    [TARGET, structuredClone(TARGET)], [TARGET, { context: structuredClone(TARGET.context),
      engine: TARGET.engine, operation: TARGET.operation, domain: TARGET.domain }],
    Array(1), [TARGET, , COMMON], accessorList, extraList, symbolList,
    [null], [{ ...TARGET, owner: 'other' }], [{ ...TARGET, domain: 'any' }],
    [{ ...TARGET, context: { ...TARGET.context, owner: 'other' } }],
  ]) assert.throws(() => recallContexts(state, queries, { now: T1 }), TypeError);
  assert.equal(accessorCalls, 0);
});

test('scopes from different engines or any different context field cannot be combined', () => {
  const state = createState();
  const incompatible = [{ ...COMMON, engine: 'other-engine' },
    ...['platform', 'version', 'environment'].map(key => ({ ...COMMON,
      context: { ...COMMON.context, [key]: 'other' } }))];
  for (const query of incompatible) {
    assert.throws(() => recallContexts(state, [TARGET, query], { now: T1 }), /same engine and context/);
  }
});

test('multi-context options keep the existing strict time and budget limits', () => {
  const state = createState();
  for (const options of [null, { now: null }, { now: '2026-02-30T00:00:00Z' }, { now: 'today' },
    { limit: 0 }, { limit: 21 }, { limit: 1.5 }, { limit: Infinity }, { maxChars: 0 },
    { maxChars: 16385 }, { maxChars: NaN }, { allowExpired: true }, { limit: undefined }]) {
    assert.throws(() => recallContexts(state, [TARGET, COMMON], options), TypeError);
  }
});

test('equal-authority cross-scope contradictions are withheld without using recency', async () => {
  const keyed = { provenance: 'user_explicit', conflictKey: 'output-layout' };
  let state = await activate(createState(), definition('target-layout', TARGET, { ...keyed, guidance: 'Use target layout.' }));
  state = await activate(state, definition('common-layout', COMMON, { ...keyed, guidance: 'Use common layout.' }), T1);
  state = await activate(state, definition('weaker-layout', COMMON, { conflictKey: 'output-layout',
    provenance: 'model_inferred', guidance: 'Use inferred layout.' }), T2);
  state = await activate(state, definition('unrelated-rule'));
  assert.deepEqual(ids(recallContext(state, TARGET, { now: T2 })), ['target-layout', 'unrelated-rule']);
  assert.deepEqual(ids(recallContext(state, COMMON, { now: T2 })), ['common-layout']);
  const result = at(state, T2);
  assert.deepEqual(ids(result), ['unrelated-rule']);
  assert.deepEqual(result.conflicts, [{ conflictKey: 'output-layout',
    lessonIds: ['common-layout', 'target-layout', 'weaker-layout'], reason: 'equal_authority_conflict' }]);
  assert.equal(result.omitted, 3);
});

test('higher provenance wins a shared conflict key regardless of the source scope', async () => {
  let state = await activate(createState(), definition('common-owner', COMMON, {
    provenance: 'user_explicit', conflictKey: 'claim-a' }));
  state = await activate(state, definition('target-inferred', TARGET, {
    provenance: 'model_inferred', conflictKey: 'claim-a' }), T2);
  state = await activate(state, definition('target-owner', TARGET, {
    provenance: 'user_explicit', conflictKey: 'claim-b' }));
  state = await activate(state, definition('common-host', COMMON, {
    provenance: 'host_verified', conflictKey: 'claim-b' }), T2);
  const result = at(state, T2);
  assert.deepEqual(ids(result), ['common-owner', 'target-owner']);
  assert.deepEqual(result.conflicts, []);
  assert.equal(result.omitted, 2);
});

test('identical guidance is deduplicated across all selected scopes after authority ranking', async () => {
  const guidance = 'Keep the original certificate.';
  let state = await activate(createState(), definition('a-host', TARGET, { guidance, provenance: 'host_verified' }));
  state = await activate(state, definition('b-inferred', COMMON, { guidance, provenance: 'model_inferred', conflictKey: 'claim-a' }));
  state = await activate(state, definition('z-owner', COMMON, { guidance, provenance: 'user_explicit', conflictKey: 'claim-b' }));
  state = await activate(state, definition('zz-owner-copy', TARGET, { guidance, provenance: 'user_explicit', conflictKey: 'claim-b' }));
  const result = at(state);
  assert.deepEqual(ids(result), ['z-owner']);
  assert.deepEqual(result.conflicts, []);
  assert.equal(result.omitted, 3);
  assert.equal(result.lessons[0].guidance, guidance);
});

test('count and Unicode character budgets apply once to the merged guidance set', async () => {
  let state = await activate(createState(), definition('a-target', TARGET, { guidance: '가🙂' }));
  state = await activate(state, definition('b-common', COMMON, { guidance: '나🙂' }));
  state = await activate(state, definition('c-target', TARGET, { guidance: 'long-rule!' }));
  state = await activate(state, definition('d-common', COMMON, { guidance: '끝' }));
  assert.deepEqual(ids(at(state, T1, { limit: 2 })), ['a-target', 'b-common']);
  const fourCharacters = at(state, T1, { maxChars: 4 });
  assert.deepEqual(ids(fourCharacters), ['a-target', 'b-common']);
  assert.equal(fourCharacters.omitted, 2);
  const threeCharacters = at(state, T1, { maxChars: 3 });
  assert.deepEqual(ids(threeCharacters), ['a-target', 'd-common']);
  assert.equal(threeCharacters.lessons.map(lesson => [...lesson.guidance].length).reduce((a, b) => a + b), 3);
  assert.equal(threeCharacters.lessons[0].guidance, '가🙂');
});

test('the default five-lesson budget is shared rather than granted to every scope', async () => {
  let state = createState();
  for (let index = 0; index < 6; index++) {
    state = await activate(state, definition('rule-' + index, index % 2 ? COMMON : TARGET));
  }
  const result = at(state);
  assert.equal(result.lessons.length, 5);
  assert.equal(result.omitted, 1);
  assert.equal(at(state, T1, { limit: 6 }).lessons.length, 6);
});

test('candidate, invalid active proof, future, expired and quarantined lessons stay out of the merged set', async () => {
  let state = await activate(createState(), definition('window', COMMON, { validFrom: T1, validUntil: T3 }));
  state = await activate(state, definition('future', TARGET, { validFrom: T3 }));
  state = await activate(state, definition('expired', COMMON, { validUntil: T1 }));
  state = await activate(state, definition('quarantined', TARGET));
  state = await quarantine(state, 'quarantined', T1);
  state = addLesson(state, bindRegression(definition('candidate', COMMON), SUITE));
  state = addLesson(state, bindRegression(definition('missing-proof', TARGET), SUITE));
  state.lessons['missing-proof'].state = 'active';
  assert.deepEqual(ids(at(state, T1)), ['window']);
  assert.equal(at(state, T1).omitted, 0);
  assert.deepEqual(ids(at(state, T2)), ['window']);
  assert.deepEqual(ids(at(state, T3)), ['future']);
});

test('scope-local replacement history is respected before start and after expiry or quarantine', async () => {
  for (const ending of ['expiry', 'quarantine']) {
    let state = await activate(createState(), definition('old-target'));
    state = await activate(state, definition('common-rule', COMMON));
    state = await activate(state, definition('new-target', TARGET, {
      supersedes: ['old-target'], validFrom: T2, ...(ending === 'expiry' ? { validUntil: T3 } : {}) }), T1);
    assert.deepEqual(ids(at(state, T1)), ['common-rule', 'old-target']);
    assert.deepEqual(ids(at(state, T2)), ['common-rule', 'new-target']);
    if (ending === 'quarantine') state = await quarantine(state, 'new-target', T3);
    assert.deepEqual(ids(at(state, T3)), ['common-rule']);
    assert.ok(state.lessons['old-target']);
    assert.throws(() => addLesson(state, definition('cross-scope', COMMON, {
      supersedes: ['old-target'] })), /cannot cross lesson scope/);
  }
});

test('merged recall changes no state or query and returns detached lesson and conflict data', async () => {
  let state = await activate(createState(), definition('selected', COMMON, { provenance: 'user_explicit' }));
  state = await activate(state, definition('conflict-a', TARGET, { conflictKey: 'layout' }));
  state = await activate(state, definition('conflict-b', COMMON, { conflictKey: 'layout' }));
  const queries = [structuredClone(TARGET), structuredClone(COMMON)];
  const options = { now: T1, limit: 3, maxChars: 100 };
  const before = structuredClone({ state, queries, options });
  const result = recallContexts(state, queries, options);
  assert.deepEqual({ state, queries, options }, before);
  result.lessons[0].guidance = 'Changed returned copy.';
  result.lessons[0].context.environment = 'different';
  result.lessons[0].evidenceRefs.push('fixture:unrelated');
  result.conflicts[0].lessonIds.push('fabricated');
  assert.deepEqual({ state, queries, options }, before);
  assert.deepEqual(recallContexts(state, queries, options).conflicts[0].lessonIds, ['conflict-a', 'conflict-b']);
});

test('multi-context fingerprints ignore query ordering and unrelated revisions but identify the scope set and budget', async () => {
  let state = await activate(createState(), definition('target'));
  state = await activate(state, definition('common', COMMON));
  const initial = recallContexts(state, [TARGET, COMMON, WEB], { now: T1 });
  assert.deepEqual(recallContexts(state, [WEB, TARGET, COMMON], { now: T1 }), initial);
  state = await activate(state, definition('unrelated', { ...WEB, operation: 'web.unrelated' }));
  const revised = recallContexts(state, [COMMON, WEB, TARGET], { now: T2 });
  assert.equal(revised.fingerprint, initial.fingerprint);
  assert.notEqual(revised.revision, initial.revision);
  assert.notEqual(at(state).fingerprint, initial.fingerprint);
  assert.notEqual(at(state, T1, { limit: 1 }).fingerprint, at(state).fingerprint);
  state = await activate(state, definition('web', WEB));
  assert.notEqual(recallContexts(state, [TARGET, COMMON, WEB], { now: T2 }).fingerprint, initial.fingerprint);
});

test('the original single-scope fingerprints and one-query result stay byte-for-byte compatible', async () => {
  const lesson = definition('legacy-target', TARGET, { guidance: 'Keep the exact target.' });
  const bound = bindRegression(lesson, SUITE);
  assert.equal(bound.inputFingerprint, LEGACY_INPUT_FP);
  const state = await activate(createState(), lesson);
  const single = recallContext(state, TARGET, { now: T1 });
  assert.equal(single.fingerprint, LEGACY_CONTEXT_FP);
  assert.deepEqual(recallContexts(state, [TARGET], { now: T1 }), single);
  assert.deepEqual(recall(state, TARGET), single.lessons);
});

test('legacy recall and one-scope context preserve repeated guidance and their original result counts', async () => {
  let state = createState();
  for (let index = 0; index < 7; index++) {
    state = await activate(state, definition('legacy-' + index, TARGET, { guidance: 'Keep all required fields.' }));
  }
  const single = recallContext(state, TARGET, { now: T1 });
  assert.equal(recall(state, TARGET).length, 7);
  assert.equal(single.lessons.length, 5);
  assert.equal(single.omitted, 2);
  assert.deepEqual(recallContexts(state, [TARGET], { now: T1 }), single);
  assert.equal(at(state).lessons.length, 1);
  assert.equal(at(state).omitted, 6);
});
