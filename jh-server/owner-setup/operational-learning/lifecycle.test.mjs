import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createState, addLesson, evaluateLesson, recall, recallContext } from './engine.mjs';
import { bindRegression, runRegression } from './regression.mjs';
import { evaluateConstraints } from './constraints.mjs';
import { FileLearningStore } from './store.mjs';

const T0 = '2026-10-31T00:00:00.000Z';
const T1 = '2026-10-31T01:00:00.000Z';
const T2 = '2026-10-31T02:00:00.000Z';
const T3 = '2026-10-31T03:00:00.000Z';
const T4 = '2026-10-31T04:00:00.000Z';
const QUERY = { domain: 'output', operation: 'output.format', engine: 'jh-synthetic',
  context: { platform: 'chatgpt', version: '1', environment: 'test' } };
const SUITE = { id: 'fields', version: '1', cases: [{ id: 'required',
  input: { value: { ok: true }, constraints: [{ path: ['ok'], op: 'equals', expected: true }] },
  expected: { passed: true, failed: [] } }] };
const LEGACY_REGRESSION_FP = 'f9e1d62ad366f6c29a1a77195b2968e48d556fc2998fa358bd8a48194659b0ec';
const LEGACY_DEFAULT_FP = '8a9b565a9ab4c0079581463f6942d3d53c11ec64b9495374e630fccd81e83248';

function definition(id = 'legacy', overrides = {}) {
  return { id, ...structuredClone(QUERY), guidance: 'Keep the required fields.',
    evidenceRefs: ['fixture:reviewed'], ruleVersion: '1', ...overrides };
}
async function activate(state, lesson, now = T0) {
  const bound = bindRegression(lesson, SUITE);
  const result = await runRegression(bound, SUITE, evaluateConstraints, { now });
  return evaluateLesson(addLesson(state, bound), lesson.id, result.evaluation);
}
async function quarantine(state, id, now) {
  const lesson = state.lessons[id];
  const result = await runRegression(lesson, SUITE, () => ({ passed: false, failed: [0] }), { now });
  assert.equal(result.report.failed, 1);
  return evaluateLesson(state, id, result.evaluation);
}
const ids = context => context.lessons.map(lesson => lesson.id);
const at = (state, now = T1, options = {}) => recallContext(state, QUERY, { now, ...options });

test('an old v1 store and both old fingerprints remain unchanged on read and recall', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jh-legacy-memory-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'memory.json');
  const legacy = definition();
  const state = { schema: 'jh.operational-learning.v1', revision: 2, events: {}, attempts: {}, proposals: {},
    lessons: { legacy: { ...legacy, inputFingerprint: LEGACY_REGRESSION_FP, state: 'active', advisoryOnly: true,
      evaluation: { ruleVersion: '1', inputFingerprint: LEGACY_REGRESSION_FP,
        passed: 1, failed: 0, skipped: 0, evidenceRefs: ['fixture:old-executed-check'] } } } };
  const payload = JSON.stringify({ schema: 'jh.operational-learning.store.v1', ownerScope: 'legacy-owner', state });
  await writeFile(file, payload);
  const store = new FileLearningStore({ file, ownerScope: 'legacy-owner' });
  const loaded = await store.read();
  assert.deepEqual(loaded, state);
  assert.equal(bindRegression(legacy, SUITE).inputFingerprint, LEGACY_REGRESSION_FP);
  assert.equal(addLesson(createState(), legacy).lessons.legacy.inputFingerprint, LEGACY_DEFAULT_FP);
  assert.deepEqual(recall(loaded, QUERY), [state.lessons.legacy]);
  assert.deepEqual(ids(at(loaded)), ['legacy']);
  assert.equal(await readFile(file, 'utf8'), payload);
});

test('optional metadata has strict kinds, origins, real dates, intervals and bounded fields', () => {
  const reflection = { assessment: 'reviewed_inference', cause: 'Reviewed cause.', resolution: 'Proposed fix.',
    expectedEffect: 'Fewer repeated failures.', eventIds: ['event-one'] };
  for (const invalid of [
    { memoryKind: 'memory' }, { provenance: 'toString' }, { validFrom: '2026-02-30T00:00:00Z' },
    { validUntil: '2026-10-31T24:00:00Z' }, { validFrom: '2026-10-31T00:00:00+24:00' },
    { validFrom: T2, validUntil: T1 }, { validFrom: T1, validUntil: T1 }, { validUntil: null },
    { conflictKey: '' }, { supersedes: 'old' }, { supersedes: ['same', 'same'] },
    { supersedes: Array.from({ length: 17 }, (_, n) => 'old-' + n) },
    { reflection: { ...reflection, assessment: 'verified' } },
    { reflection: { ...reflection, cause: 'x'.repeat(1025) } },
    { reflection: { ...reflection, eventIds: ['event-one', 'event-one'] } },
    { reflection: { ...reflection, eventIds: [] } }, { reflection: { ...reflection, execute: 'anything' } },
    { expiresAt: T2 }, { metadata: {} }, { supersessionHistory: [] },
  ]) assert.throws(() => addLesson(createState(), definition('invalid', invalid)));
  const accepted = addLesson(createState(), definition('valid', { memoryKind: 'episode', provenance: 'model_inferred',
    validFrom: '2028-02-29T00:00:00+09:00', reflection }));
  assert.deepEqual(accepted.lessons.valid.reflection, reflection);
});

test('metadata and reviewed reflection are bound to regression and cannot reuse old receipts', async () => {
  const old = bindRegression(definition(), SUITE);
  const previous = await runRegression(old, SUITE, evaluateConstraints, { now: T0 });
  const reflection = { assessment: 'reviewed_inference', cause: 'Observed pattern.', resolution: 'Candidate fix.',
    expectedEffect: 'Fewer omissions.', eventIds: ['event-one'] };
  for (const metadata of [
    { memoryKind: 'procedure' }, { provenance: 'user_explicit' }, { validFrom: T0 },
    { validUntil: T3 }, { supersedes: [] }, { conflictKey: 'required-fields' }, { reflection },
  ]) {
    const changed = bindRegression(definition('legacy', metadata), SUITE);
    assert.notEqual(changed.inputFingerprint, old.inputFingerprint);
    let state = addLesson(createState(), changed);
    assert.throws(() => evaluateLesson(state, 'legacy', previous.evaluation), /does not match/);
    let calls = 0;
    await assert.rejects(runRegression({ ...changed, inputFingerprint: old.inputFingerprint }, SUITE,
      () => { calls++; return {}; }), /fingerprint/);
    assert.equal(calls, 0);
    state = addLesson(createState(), old);
    assert.throws(() => addLesson(state, { ...changed, inputFingerprint: old.inputFingerprint }), /Existing lesson differs/);
  }
  const changedReflection = bindRegression(definition('legacy', { reflection: { ...reflection, cause: 'A different cause.' } }), SUITE);
  assert.notEqual(changedReflection.inputFingerprint, bindRegression(definition('legacy', { reflection }), SUITE).inputFingerprint);
});

test('validity boundaries, quarantine and all scope fields filter recall', async () => {
  let state = await activate(createState(), definition('window', { validFrom: T1, validUntil: T3 }));
  assert.deepEqual(ids(at(state, T0)), []);
  assert.deepEqual(ids(at(state, T1)), ['window']);
  assert.deepEqual(ids(at(state, T3)), []);
  for (const query of [
    { ...QUERY, domain: 'device' }, { ...QUERY, operation: 'output.other' }, { ...QUERY, engine: 'other' },
    ...['platform', 'version', 'environment'].map(key => ({ ...QUERY, context: { ...QUERY.context, [key]: 'other' } })),
  ]) assert.deepEqual(recallContext(state, query, { now: T2 }).lessons, []);
  state = await quarantine(state, 'window', T2);
  assert.deepEqual(ids(at(state, T2)), []);
});

test('an unverified or failing replacement leaves the old rule available', async () => {
  let state = await activate(createState(), definition('old', { provenance: 'user_explicit' }));
  const replacement = definition('replacement', { provenance: 'user_explicit', supersedes: ['old'], guidance: 'Use the corrected fields.' });
  const bound = bindRegression(replacement, SUITE);
  state = addLesson(state, bound);
  assert.deepEqual(ids(at(state)), ['old']);
  state = await quarantine(state, 'replacement', T1);
  assert.deepEqual(ids(at(state, T2)), ['old']);
  state = await activate(state, replacement, T2);
  assert.deepEqual(ids(at(state, T2)), ['replacement']);
  assert.equal(state.lessons.old.state, 'active');
  assert.equal(state.lessons.old.guidance, 'Keep the required fields.');
});

test('lower authority, cross-scope, absent and self supersession cannot alter existing rules', async () => {
  const state = await activate(createState(), definition('owner-rule', { provenance: 'user_explicit' }));
  const before = structuredClone(state);
  for (const provenance of ['legacy', 'model_inferred', 'host_verified']) {
    assert.throws(() => addLesson(state, definition('weaker', { provenance, supersedes: ['owner-rule'] })), /lower-authority/);
  }
  assert.throws(() => addLesson(state, definition('wrong-scope', { provenance: 'user_explicit', operation: 'output.other', supersedes: ['owner-rule'] })), /scope/);
  assert.throws(() => addLesson(state, definition('missing', { supersedes: ['absent'] })), /already exist/);
  assert.throws(() => addLesson(state, definition('self', { supersedes: ['self'] })), /itself/);
  assert.deepEqual(state, before);
});

test('a future verified replacement becomes effective at its start and has no early effect', async () => {
  let state = await activate(createState(), definition('old'));
  state = await activate(state, definition('future', { validFrom: T2, validUntil: T3, supersedes: ['old'] }), T1);
  assert.deepEqual(ids(at(state, T1)), ['old']);
  assert.deepEqual(ids(at(state, T2)), ['future']);
  assert.deepEqual(ids(at(state, T3)), []);
  assert.deepEqual(ids(at(state, T4)), []);
});

test('quarantine before or exactly at a future start cancels it without retiring the predecessor', async () => {
  for (const failedAt of [T1, T2]) {
    let state = await activate(createState(), definition('old'));
    state = await activate(state, definition('future', { validFrom: T2, supersedes: ['old'] }), T0);
    state = await quarantine(state, 'future', failedAt);
    assert.deepEqual(ids(at(state, T3)), ['old']);
    assert.equal(state.lessons.future.supersessionHistory[0].endedAt, failedAt);
  }
});

test('an effective replacement stays retired after quarantine and restoration needs a new verified rule', async () => {
  let state = await activate(createState(), definition('old', { provenance: 'user_explicit' }));
  state = await activate(state, definition('corrected', { provenance: 'user_explicit', supersedes: ['old'] }), T1);
  assert.deepEqual(ids(at(state, T1)), ['corrected']);
  state = await quarantine(state, 'corrected', T2);
  assert.deepEqual(ids(at(state, T3)), []);
  const restoration = definition('restored-v2', { provenance: 'user_explicit', supersedes: ['corrected'] });
  state = addLesson(state, bindRegression(restoration, SUITE));
  assert.deepEqual(ids(at(state, T3)), []);
  state = await activate(state, restoration, T3);
  assert.deepEqual(ids(at(state, T4)), ['restored-v2']);
  assert.ok(state.lessons.old && state.lessons.corrected);
});

test('a replacement already expired at evaluation never disables its predecessor', async () => {
  let state = await activate(createState(), definition('old'));
  state = await activate(state, definition('expired', { supersedes: ['old'], validUntil: T1 }), T2);
  assert.deepEqual(ids(at(state, T3)), ['old']);
  assert.deepEqual(state.lessons.expired.supersessionHistory, []);
});

test('a future replacement retired before its own start cannot later retire its predecessor', async () => {
  for (const replacementAt of [T1, T3]) {
    let state = await activate(createState(), definition('original'));
    state = await activate(state, definition('planned', { supersedes: ['original'], validFrom: T3 }), T0);
    state = await activate(state, definition('cancel-plan', { supersedes: ['planned'] }), replacementAt);
    assert.deepEqual(ids(at(state, T4)), ['cancel-plan', 'original']);
  }
});

test('same-key equal-authority conflict is held back regardless of which evaluation is newer', async () => {
  let state = await activate(createState(), definition('a', { conflictKey: 'layout', provenance: 'user_explicit', guidance: 'Use layout A.' }));
  state = await activate(state, definition('b', { conflictKey: 'layout', provenance: 'user_explicit', guidance: 'Use layout B.' }), T1);
  const result = at(state, T2);
  assert.deepEqual(result.lessons, []);
  assert.deepEqual(result.conflicts, [{ conflictKey: 'layout', lessonIds: ['a', 'b'], reason: 'equal_authority_conflict' }]);
  assert.equal(result.omitted, 2);
  assert.deepEqual(recall(state, QUERY), []);
  result.conflicts[0].lessonIds.push('fabricated');
  assert.deepEqual(at(state, T2).conflicts[0].lessonIds, ['a', 'b']);
});

test('source authority outranks recency and duplicate identical guidance is returned once', async () => {
  let state = await activate(createState(), definition('owner', { conflictKey: 'layout', provenance: 'user_explicit', guidance: 'Use owner layout.' }));
  state = await activate(state, definition('inferred', { conflictKey: 'layout', provenance: 'model_inferred', guidance: 'Use guessed layout.' }), T2);
  state = await activate(state, definition('owner-duplicate', { conflictKey: 'layout', provenance: 'user_explicit', guidance: 'Use owner layout.' }), T1);
  const result = at(state, T3);
  assert.deepEqual(ids(result), ['owner']);
  assert.deepEqual(result.conflicts, []);
  assert.equal(result.omitted, 2);
});

test('bounded recall preserves complete Unicode guidance while legacy recall keeps all results', async () => {
  let state = createState();
  for (let index = 0; index < 7; index++) {
    state = await activate(state, definition('rule-' + index, { guidance: index === 0 ? '가나다🙂' : 'five!' }));
  }
  assert.equal(recall(state, QUERY).length, 7);
  assert.equal(at(state).lessons.length, 5);
  assert.equal(at(state).omitted, 2);
  const tiny = at(state, T1, { maxChars: 4, limit: 2 });
  assert.deepEqual(ids(tiny), ['rule-0']);
  assert.equal(tiny.lessons[0].guidance, '가나다🙂');
  assert.equal(tiny.omitted, 6);
  tiny.lessons[0].guidance = 'changed copy';
  assert.equal(state.lessons['rule-0'].guidance, '가나다🙂');
});

test('context fingerprint is stable across unrelated revisions and changes when valid guidance changes', async () => {
  let state = await activate(createState(), definition('stable', { validUntil: T3 }));
  const first = at(state, T1);
  state = await activate(state, definition('other', { operation: 'output.other' }), T1);
  const second = at(state, T2);
  assert.equal(first.fingerprint, second.fingerprint);
  assert.notEqual(first.revision, second.revision);
  assert.notEqual(second.fingerprint, at(state, T3).fingerprint);
  assert.notEqual(second.fingerprint, at(state, T2, { limit: 1 }).fingerprint);
});

test('recall rejects unknown options, invalid times, unbounded limits and unknown query fields', async () => {
  const state = await activate(createState(), definition());
  for (const options of [
    { limit: 0 }, { limit: 21 }, { limit: 1.5 }, { limit: Infinity }, { maxChars: 0 },
    { maxChars: 16385 }, { maxChars: NaN }, { now: '2026-02-30T00:00:00Z' },
    { now: 'today' }, { now: null }, { limit: null }, { maxChars: null }, { allowExpired: true },
  ]) assert.throws(() => recallContext(state, QUERY, options));
  assert.throws(() => recallContext(state, { ...QUERY, owner: 'other' }));
});

test('new replacement evaluation requires time and internal history does not alter its regression fingerprint', async () => {
  let state = await activate(createState(), definition('old'));
  const replacement = definition('new', { supersedes: ['old'] });
  const bound = bindRegression(replacement, SUITE);
  const result = await runRegression(bound, SUITE, evaluateConstraints, { now: T1 });
  state = addLesson(state, bound);
  const { timestamp, ...withoutTime } = result.evaluation;
  assert.throws(() => evaluateLesson(state, 'new', withoutTime), /timestamp/);
  state = evaluateLesson(state, 'new', result.evaluation);
  assert.equal(bindRegression(state.lessons.new, SUITE).inputFingerprint, bound.inputFingerprint);
  assert.equal(state.lessons.new.supersessionHistory[0].effectiveAt, T1);
});

test('copying inputFingerprint cannot replay a real receipt onto another ID, guidance, source or evidence', async () => {
  const original = bindRegression(definition(), SUITE);
  const { evaluation } = await runRegression(original, SUITE, evaluateConstraints, { now: T0 });
  assert.equal(evaluation.lessonId, original.id);
  assert.match(evaluation.definitionFingerprint, /^[a-f0-9]{64}$/);
  for (const changed of [
    { id: 'another-lesson' }, { guidance: 'A different procedure.' },
    { evidenceRefs: ['fixture:different-source'] }, { provenance: 'user_explicit' },
    { memoryKind: 'fact' }, { validUntil: T4 }, { conflictKey: 'a-new-claim' },
    { reflection: { assessment: 'reviewed_inference', cause: 'A different inferred cause.',
      resolution: 'A new suggested fix.', expectedEffect: 'A possible benefit.', eventIds: ['event-new'] } },
  ]) {
    const copied = { ...original, ...changed, inputFingerprint: original.inputFingerprint };
    const candidateState = addLesson(createState(), copied);
    const before = structuredClone(candidateState);
    assert.throws(() => evaluateLesson(candidateState, copied.id, evaluation), /complete lesson definition binding/);
    // Merely editing the receipt's target ID does not supply a new definition proof.
    assert.throws(() => evaluateLesson(candidateState, copied.id, { ...evaluation, lessonId: copied.id }), /complete lesson definition binding/);
    assert.deepEqual(candidateState, before);
  }
});

test('new metadata requires a complete definition binding even when an old receipt hash is copied', async () => {
  const original = bindRegression(definition(), SUITE);
  const { evaluation } = await runRegression(original, SUITE, evaluateConstraints, { now: T0 });
  const { lessonId, definitionFingerprint, ...oldReceipt } = evaluation;
  for (const metadata of [
    { memoryKind: 'procedure' }, { provenance: 'legacy' }, { validFrom: T0 },
    { validUntil: T4 }, { supersedes: [] }, { conflictKey: 'fields' },
    { reflection: { assessment: 'reviewed_inference', cause: 'A reviewed pattern.', resolution: 'A proposed fix.',
      expectedEffect: 'Less repetition.', eventIds: ['event-one'] } },
  ]) {
    const candidateState = addLesson(createState(), { ...original, ...metadata });
    for (const incomplete of [oldReceipt, { ...oldReceipt, lessonId }, { ...oldReceipt, definitionFingerprint }]) {
      assert.throws(() => evaluateLesson(candidateState, original.id, incomplete), /complete lesson definition binding/);
    }
  }
  const legacyActive = evaluateLesson(addLesson(createState(), original), original.id, oldReceipt);
  assert.deepEqual(ids(at(legacyActive)), ['legacy']);
  const alteredStoredRecord = structuredClone(legacyActive);
  alteredStoredRecord.lessons.legacy.provenance = 'user_explicit';
  assert.deepEqual(ids(at(alteredStoredRecord)), []);
});

test('legacy receipts remain accepted for old definitions but supplied binding fields are never ignored', async () => {
  const original = bindRegression(definition(), SUITE);
  const { evaluation } = await runRegression(original, SUITE, evaluateConstraints, { now: T0 });
  const candidateState = addLesson(createState(), original);
  const { lessonId, definitionFingerprint, ...oldReceipt } = evaluation;
  assert.deepEqual(ids(at(evaluateLesson(candidateState, original.id, oldReceipt))), ['legacy']);
  for (const mismatched of [
    { ...oldReceipt, lessonId }, { ...oldReceipt, definitionFingerprint },
    { ...evaluation, lessonId: 'wrong-target' }, { ...evaluation, definitionFingerprint: '0'.repeat(64) },
    { ...evaluation, definitionFingerprint: null },
  ]) assert.throws(() => evaluateLesson(candidateState, original.id, mismatched), /complete lesson definition binding/);
  const correct = evaluateLesson(candidateState, original.id, evaluation);
  assert.deepEqual(ids(at(correct)), ['legacy']);
});
