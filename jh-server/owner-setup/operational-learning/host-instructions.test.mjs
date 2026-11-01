import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createHostInstructionCandidate, createInstructionCandidate } from './instructions.mjs';
import { createState, addLesson, evaluateLesson, recallContext } from './engine.mjs';
import { runRegression } from './regression.mjs';
import { evaluateConstraints } from './constraints.mjs';

// Synthetic instructions and in-memory state only. No operational memory or tools.
const NOW = '2026-11-01T01:00:00.000Z';
const SCOPE = { domain: 'output', operation: 'summary.format', engine: 'jh-agent',
  context: { platform: 'node', version: 'host-instruction-v1', environment: 'synthetic' } };
const COMMON = { ...SCOPE, domain: 'orchestration', operation: 'learning.scope' };
const SUITE = { id: 'host-explicit-source-format', version: '1', cases: [
  { id: 'source-present', input: { value: { source: 'fixture:article' }, constraints: [
    { path: ['source'], op: 'exists' },
  ] }, expected: { passed: true, failed: [] } },
  { id: 'source-missing', input: { value: {}, constraints: [
    { path: ['source'], op: 'exists' },
  ] }, expected: { passed: false, failed: [0] } },
] };
const sha = text => createHash('sha256').update(text, 'utf8').digest('hex');
function instruction(overrides = {}) {
  const text = '확인한 자료의 출처를 요약에 함께 적어 주세요.';
  return { lessonId: 'host-explicit-source-rule', ruleVersion: '1', text,
    sourceRef: 'user:synthetic-source-instruction', sourceSha256: sha(text),
    appliesTo: { kind: 'exact_scope' }, confirmation: 'explicit_user_instruction', ...overrides };
}
function prepare(state = createState(), input = instruction(), suite = SUITE, options = { scope: SCOPE }) {
  return createHostInstructionCandidate(state, input, suite, options);
}

test('host preparation preserves exact user bytes and remains an honest read-only candidate', () => {
  const state = createState(); const text = '  출처를 적습니다🙂\r\n확인한 범위를 구분합니다.\n  ';
  const input = instruction({ text, sourceSha256: sha(text), sourceRecordRef: 'library:synthetic-message-record' });
  const suite = structuredClone(SUITE); const options = { scope: structuredClone(SCOPE) };
  const before = structuredClone({ state, input, suite, options });
  const result = prepare(state, input, suite, options);
  assert.deepEqual({ state, input, suite, options }, before);
  assert.equal(result.lesson.guidance, text);
  assert.equal(result.lesson.domain, SCOPE.domain); assert.equal(result.lesson.operation, SCOPE.operation);
  assert.equal(result.lesson.engine, SCOPE.engine); assert.deepEqual(result.lesson.context, SCOPE.context);
  assert.equal(result.lesson.state, 'candidate'); assert.equal(result.lesson.provenance, 'user_explicit');
  assert.equal(result.lesson.memoryKind, 'procedure');
  assert.deepEqual(result.lesson.evidenceRefs, [input.sourceRef, 'sha256:' + sha(text), input.sourceRecordRef]);
  assert.equal(result.instructionSummary.sourceAuthentication, 'host_attestation');
  assert.equal(result.instructionSummary.sourceRetrievalVerified, false);
  assert.equal(result.instructionSummary.automaticInference, false);
  assert.equal(result.instructionSummary.candidateOnly, true);
  assert.equal(result.instructionSummary.activationPerformed, false);
  assert.equal(result.instructionSummary.externalEffects, false);
  assert.deepEqual(result.instructionSummary.appliesTo, { kind: 'exact_scope' });
  assert.deepEqual(recallContext(state, SCOPE, { now: NOW }).lessons, []);
  result.lesson.context.environment = 'changed-copy';
  result.instructionSummary.appliesTo.kind = 'changed-copy';
  result.suite.cases[0].id = 'changed-copy';
  assert.deepEqual({ state, input, suite, options }, before);
});

test('common instructions use the supplied current binding without expanding engine or context', async () => {
  const state = createState(); const before = structuredClone(state);
  const common = prepare(state, instruction({ appliesTo: { kind: 'all_jh_tasks' } }), SUITE,
    { scope: SCOPE, globalRecall: COMMON });
  assert.equal(common.lesson.domain, 'orchestration'); assert.equal(common.lesson.operation, 'learning.scope');
  assert.equal(common.lesson.engine, SCOPE.engine); assert.deepEqual(common.lesson.context, SCOPE.context);
  const evaluated = await runRegression(common.lesson, common.suite, evaluateConstraints, { now: NOW });
  const active = evaluateLesson(addLesson(state, common.lesson), common.lesson.id, evaluated.evaluation);
  assert.equal(recallContext(active, COMMON, { now: NOW }).lessons.length, 1);
  for (const query of [SCOPE, { ...COMMON, engine: 'different-engine' },
    { ...COMMON, context: { ...COMMON.context, environment: 'different-environment' } }]) {
    assert.deepEqual(recallContext(active, query, { now: NOW }).lessons, []);
  }
  assert.deepEqual(state, before);
  assert.deepEqual(active.events, {}); assert.deepEqual(active.attempts, {}); assert.deepEqual(active.proposals, {});
  const exact = prepare(createState(), instruction(), SUITE, { scope: SCOPE, globalRecall: COMMON });
  assert.equal(exact.lesson.domain, SCOPE.domain); assert.equal(exact.lesson.operation, SCOPE.operation);
});

test('global binding is required for common applicability and validated even for exact applicability', () => {
  const state = createState(); const before = structuredClone(state);
  assert.throws(() => prepare(state, instruction({ appliesTo: { kind: 'all_jh_tasks' } })), /require.*globalRecall/);
  const invalidBindings = [undefined, null, {}, SCOPE,
    { ...COMMON, operation: 'jh.common.rules' }, { ...COMMON, domain: 'development' },
    { ...COMMON, engine: 'different-engine' }, { ...COMMON, ownerScope: 'other-owner' },
    { ...COMMON, context: { ...COMMON.context, platform: 'different-platform' } },
    { ...COMMON, context: { ...COMMON.context, version: 'different-version' } },
    { ...COMMON, context: { ...COMMON.context, environment: 'different-environment' } },
    { ...COMMON, context: { platform: 'node', version: 'host-instruction-v1' } },
  ];
  for (const kind of ['exact_scope', 'all_jh_tasks']) {
    for (const globalRecall of invalidBindings) {
      assert.throws(() => prepare(state, instruction({ appliesTo: { kind } }), SUITE, { scope: SCOPE, globalRecall }));
    }
  }
  assert.deepEqual(state, before);
});

test('host applicability cannot masquerade as a tool and the existing server boundary stays unchanged', () => {
  for (const appliesTo of [{ kind: 'tool', target_tool: 'summary.format' }, { kind: 'all' },
    { kind: 'exact_scope', scope: SCOPE }, { kind: 'all_jh_tasks', target_tool: 'life_status' }, {}]) {
    assert.throws(() => prepare(createState(), instruction({ appliesTo }), SUITE, { scope: SCOPE, globalRecall: COMMON }));
  }
  assert.throws(() => createInstructionCandidate(createState(), instruction(), SUITE, { scope: SCOPE }), /appliesTo kind/);
  const serverInput = instruction({ appliesTo: { kind: 'all_jh_tasks' } });
  const server = createInstructionCandidate(createState(), serverInput, SUITE, { scope: COMMON });
  const host = prepare(createState(), serverInput, SUITE, { scope: SCOPE, globalRecall: COMMON });
  assert.deepEqual(host.lesson, server.lesson); assert.deepEqual(host.suite, server.suite);
  assert.equal(host.instructionSummary.definitionFingerprint, server.instructionSummary.definitionFingerprint);
  const { sourceRetrievalVerified, ...hostSummary } = host.instructionSummary;
  assert.equal(sourceRetrievalVerified, false);
  assert.deepEqual(server.instructionSummary, { ...hostSummary, sourceAuthentication: 'authenticated_owner_attestation' });
  assert.equal(Object.hasOwn(server.instructionSummary, 'sourceRetrievalVerified'), false);
  assert.throws(() => createInstructionCandidate(createState(), serverInput, SUITE,
    { scope: COMMON, globalRecall: COMMON }), /options fields/);
});

test('host preparation cannot override provenance, attestation, applicability or exact-source binding', () => {
  const state = createState(); const before = structuredClone(state);
  const invalid = [
    { sourceSha256: '0'.repeat(64) }, { sourceSha256: instruction().sourceSha256.toUpperCase() },
    { text: instruction().text + ' ' }, { confirmation: 'inferred_user_instruction' },
    { confirmation: undefined }, { sourceRef: 'source:synthetic-message' },
    { sourceRecordRef: 'https://example.invalid/message' },
    { sourceAuthentication: 'authenticated_owner_attestation' }, { sourceRetrievalVerified: true },
    { provenance: 'user_explicit' }, { ownerScope: 'another-owner' }, { scope: COMMON },
    { state: 'active' }, { evaluation: { passed: 2 } },
  ];
  for (const overrides of invalid) assert.throws(() => prepare(state, instruction(overrides)));
  for (const options of [{}, { scope: SCOPE, ownerScope: 'another-owner' },
    { scope: { ...SCOPE, operation: '*' } }, { scope: { ...SCOPE, context: { ...SCOPE.context, owner: 'another-owner' } } },
    { scope: SCOPE, sourceAuthentication: 'authenticated_owner_attestation' }]) {
    assert.throws(() => prepare(state, instruction(), SUITE, options));
  }
  assert.deepEqual(state, before);
});

test('credential-shaped data in host scope or references is rejected without echoing it', () => {
  const credential = 'ghp_' + 'SYNTHETIC0'.repeat(4);
  const state = createState(); const before = structuredClone(state);
  const reject = action => assert.throws(action, error => error instanceof TypeError && !error.message.includes(credential));
  reject(() => prepare(state, instruction({ sourceRecordRef: 'source:' + credential })));
  for (const key of ['operation', 'engine']) {
    reject(() => prepare(state, instruction(), SUITE, { scope: { ...SCOPE, [key]: credential } }));
  }
  for (const key of ['platform', 'version', 'environment']) {
    reject(() => prepare(state, instruction(), SUITE,
      { scope: { ...SCOPE, context: { ...SCOPE.context, [key]: credential } } }));
  }
  reject(() => prepare(state, instruction({ appliesTo: { kind: 'all_jh_tasks' } }), SUITE,
    { scope: { ...SCOPE, engine: credential }, globalRecall: { ...COMMON, engine: credential } }));
  assert.deepEqual(state, before);
});

test('host input objects never invoke getters or proxy traps during validation', () => {
  let invoked = 0;
  const getter = (value, key) => Object.defineProperty(value, key, { enumerable: true,
    get() { invoked++; throw new Error('must not run'); } });
  const proxy = value => new Proxy(value, { get() { invoked++; throw new Error('must not run'); },
    ownKeys() { invoked++; throw new Error('must not run'); }, getPrototypeOf() { invoked++; throw new Error('must not run'); } });
  for (const bad of [getter(instruction(), 'text'), proxy(instruction()),
    instruction({ appliesTo: getter({}, 'kind') }), instruction({ appliesTo: proxy({ kind: 'exact_scope' }) })]) {
    assert.throws(() => prepare(createState(), bad));
  }
  for (const bad of [getter({}, 'scope'), proxy({ scope: SCOPE }),
    { scope: getter(structuredClone(SCOPE), 'context') }, { scope: proxy(SCOPE) },
    { scope: SCOPE, globalRecall: getter(structuredClone(COMMON), 'engine') },
    { scope: SCOPE, globalRecall: { ...COMMON, context: proxy(COMMON.context) } }]) {
    assert.throws(() => prepare(createState(), instruction(), SUITE, bad));
  }
  assert.throws(() => prepare(createState(), instruction(), proxy(SUITE)));
  assert.equal(invoked, 0);
});

test('repreparing saved and active instructions reuses the original rule without changing its state', async () => {
  const first = prepare(); const candidateState = addLesson(createState(), first.lesson);
  const evaluated = await runRegression(first.lesson, first.suite, evaluateConstraints, { now: NOW });
  assert.equal(evaluated.report.passed, 2);
  const activeState = evaluateLesson(candidateState, first.lesson.id, evaluated.evaluation);
  for (const state of [candidateState, activeState]) {
    const before = structuredClone(state);
    for (const lessonId of [first.lesson.id, 'retry-with-another-requested-id']) {
      const again = prepare(state, instruction({ lessonId }));
      assert.equal(again.lesson.id, first.lesson.id);
      assert.equal(again.instructionSummary.duplicateLessonId, first.lesson.id);
      assert.equal(again.instructionSummary.existingLessonState, state.lessons[first.lesson.id].state);
      assert.equal(again.instructionSummary.definitionFingerprint, first.instructionSummary.definitionFingerprint);
      assert.deepEqual(addLesson(state, again.lesson), before);
    }
    assert.deepEqual(state, before);
  }
  assert.equal(recallContext(activeState, SCOPE, { now: NOW }).lessons.length, 1);
  assert.deepEqual(recallContext(activeState, COMMON, { now: NOW }).lessons, []);
});

test('similar wording does not merge different source, suite or applicability and conflicting IDs fail', () => {
  const first = prepare(); const state = addLesson(createState(), first.lesson); const before = structuredClone(state);
  for (const [input, suite, options] of [
    [instruction({ lessonId: 'new-source', sourceRef: 'user:different-original-message' }), SUITE, { scope: SCOPE }],
    [instruction({ lessonId: 'new-suite' }), { ...SUITE, version: '2' }, { scope: SCOPE }],
    [instruction({ lessonId: 'common-rule', appliesTo: { kind: 'all_jh_tasks' } }), SUITE, { scope: SCOPE, globalRecall: COMMON }],
  ]) {
    const result = prepare(state, input, suite, options);
    assert.equal(result.lesson.id, input.lessonId);
    assert.equal(Object.hasOwn(result.instructionSummary, 'duplicateLessonId'), false);
    assert.notEqual(result.instructionSummary.definitionFingerprint, first.instructionSummary.definitionFingerprint);
  }
  const text = '다른 명시 지시입니다.';
  assert.throws(() => prepare(state, instruction({ text, sourceSha256: sha(text) })), /Existing lesson differs/);
  assert.deepEqual(state, before);
});

test('quarantined host instructions cannot be revived with another ID or weaker suite', async () => {
  const first = prepare();
  const failed = await runRegression(first.lesson, first.suite, () => ({ passed: true, failed: [] }), { now: NOW });
  assert.equal(failed.report.failed, 1);
  const state = evaluateLesson(addLesson(createState(), first.lesson), first.lesson.id, failed.evaluation);
  assert.equal(state.lessons[first.lesson.id].state, 'quarantined');
  const before = structuredClone(state);
  for (const suite of [SUITE, { ...SUITE, cases: [SUITE.cases[0]] }]) {
    assert.throws(() => prepare(state, instruction({ lessonId: 'attempted-revival' }), suite), /cannot be revived/);
  }
  assert.deepEqual(state, before);
});

test('a prepared replacement preserves existing guidance and cannot supersede across host scopes', async () => {
  const first = prepare(); const evaluated = await runRegression(first.lesson, SUITE, evaluateConstraints, { now: NOW });
  const state = evaluateLesson(addLesson(createState(), first.lesson), first.lesson.id, evaluated.evaluation);
  const before = structuredClone(state); const text = '출처와 확인 시점을 요약에 함께 적어 주세요.';
  const input = instruction({ lessonId: 'replacement-rule', ruleVersion: '2', text, sourceSha256: sha(text),
    supersedes: [first.lesson.id], conflictKey: 'source-format', validFrom: NOW, validUntil: '2026-12-01T01:00:00.000Z' });
  const replacement = prepare(state, input);
  assert.deepEqual(replacement.lesson.supersedes, [first.lesson.id]);
  assert.equal(replacement.lesson.state, 'candidate'); assert.equal(replacement.lesson.validFrom, NOW);
  assert.throws(() => prepare(state, { ...input, appliesTo: { kind: 'all_jh_tasks' } }, SUITE,
    { scope: SCOPE, globalRecall: COMMON }), /Supersession cannot cross/);
  assert.deepEqual(state, before);
  assert.equal(recallContext(state, SCOPE, { now: NOW }).lessons[0].guidance, first.lesson.guidance);
});
