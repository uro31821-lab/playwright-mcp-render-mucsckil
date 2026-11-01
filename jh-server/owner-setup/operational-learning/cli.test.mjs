import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execute } from './cli.mjs';
import { evaluateConstraints } from './constraints.mjs';

test('CLI ingestion, recall, validation and suggestions survive independent invocations', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'jh-learning-cli-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const flags = ['--store', path.join(directory, 'memory.json'), '--owner', 'synthetic-owner'];
  const scope = { domain: 'output', operation: 'summary.format', engine: 'jh-test', context: { platform: 'chat', version: '1', environment: 'synthetic' } };
  const event = n => ({ eventId: 'event-' + n, taskId: 'task-' + n, attemptId: 'attempt-' + n,
    sequence: 1, timestamp: '2026-10-31T10:00:00.000Z', ...scope,
    outcome: 'correction', source: 'user_explicit', errorCode: 'OUTPUT_SOURCE_MISSING', evidenceRefs: ['fixture:output-' + n] });
  assert.equal((await execute(['status', ...flags])).persisted, false);
  const first = await execute(['ingest', ...flags], event(1));
  assert.equal(first.recorded, 1); assert.equal(first.newProposals.length, 0);
  const second = await execute(['ingest', ...flags], event(2));
  assert.equal(second.newProposals.length, 1);
  assert.equal((await execute(['ingest', ...flags], event(2))).duplicates, 1);
  const lesson = { id: 'output-format-v1', ...scope, guidance: 'A verified source identifier is required for a source-based summary.',
    ruleVersion: '1', evidenceRefs: ['fixture:format-correction'] };
  const suite = { id: 'source-format', version: '1', cases: [
    { id: 'present', input: { value: { source: 'fixture:article' }, constraints: [{ path: ['source'], op: 'exists' }] }, expected: { passed: true, failed: [] } },
    { id: 'missing', input: { value: {}, constraints: [{ path: ['source'], op: 'exists' }] }, expected: { passed: false, failed: [0] } },
  ] };
  const candidate = await execute(['candidate', ...flags], { lesson, suite });
  assert.equal(candidate.lesson.state, 'candidate');
  assert.deepEqual((await execute(['recall', ...flags], scope)).lessons, []);
  const checked = await execute(['check', ...flags], { lesson, suite });
  assert.equal(checked.report.passed, 2); assert.equal(checked.lessonState, 'active');
  assert.equal((await execute(['recall', ...flags], scope)).lessons.length, 1);
  const status = await execute(['status', ...flags]);
  assert.equal(status.persisted, true); assert.equal(status.counts.events, 2);
  assert.equal(status.counts.lessons, 1);
  const proposalId = second.newProposals[0].id;
  const packet = await execute(['review', ...flags], { proposalId });
  const decision = { proposalId, decisionId: 'synthetic-cli-accept', decision: 'accept',
    expectedRevision: packet.baseRevision, packetFingerprint: packet.packetFingerprint,
    reviewer: 'agent', sourceRef: 'source:synthetic-cli-review',
    reason: 'Select the recorded formatting improvement for follow-up.',
    eventIds: packet.attempts.map(item => item.eventId) };
  const selected = await execute(['decide', ...flags], decision);
  assert.equal(selected.proposal.status, 'accepted');
  assert.equal(selected.activatedByThisCall, false);
  assert.equal(selected.liveExecutionVerified, false);
  const repeated = await execute(['decide', ...flags], decision);
  assert.equal(repeated.duplicate, true);
  assert.equal(repeated.revision, selected.revision);
  assert.deepEqual(repeated.receipt, selected.receipt);
  const view = await execute(['decision-view', ...flags], { proposalId });
  assert.equal(view.currentStatus, 'accepted');
  assert.equal(view.decisionHistory.length, 1);
  assert.equal(view.readOnly, true);
  await assert.rejects(execute(['decide', ...flags, '--revision', String(selected.revision)], decision));
  assert.deepEqual((await execute(['status', ...flags])).counts, status.counts);
});

test('constraints cover numeric and text output with explicit missing-field failures', () => {
  const constraints = [
    { path: ['count'], op: 'between', expected: { min: 2, max: 4 } },
    { path: ['text'], op: 'includes', expected: 'source' },
    { path: ['text'], op: 'excludes', expected: 'password' },
    { path: ['verified'], op: 'equals', expected: true },
  ];
  assert.deepEqual(evaluateConstraints({ value: { count: 3, text: 'source checked', verified: true }, constraints }), { passed: true, failed: [] });
  assert.deepEqual(evaluateConstraints({ value: {}, constraints }), { passed: false, failed: [0, 1, 2, 3] });
  assert.throws(() => evaluateConstraints({ value: {}, constraints: [{ path: ['__proto__'], op: 'exists' }] }));
  assert.throws(() => evaluateConstraints({ value: {}, constraints: [{ path: [], op: 'execute', expected: 'shell' }] }));
});

test('CLI rejects unsupported executable input and unknown commands', async () => {
  const flags = ['--store', path.join(tmpdir(), 'not-written-learning-test.json'), '--owner', 'synthetic-owner'];
  await assert.rejects(execute(['check', ...flags], { lesson: {}, suite: {}, script: 'anything' }));
  await assert.rejects(execute(['dispatch', ...flags], {}));
});

const CONTEXT_NOW = '2035-01-01T00:00:00.000Z';
const CONTEXT_NEXT = '2035-01-02T00:00:00.000Z';
const TARGET_SCOPE = { domain: 'output', operation: 'summary.format', engine: 'jh-agent',
  context: { platform: 'chatgpt', version: 'operational-learning-v1', environment: 'synthetic-cli' } };
const COMMON_SCOPE = { ...TARGET_SCOPE, domain: 'orchestration', operation: 'learning.scope' };
const THIRD_SCOPE = { ...TARGET_SCOPE, domain: 'research', operation: 'summary.sources' };
const CONTEXT_SUITE = { id: 'context-cli-fixture', version: '1', cases: [
  { id: 'present', input: { value: { source: 'fixture:article' }, constraints: [{ path: ['source'], op: 'exists' }] },
    expected: { passed: true, failed: [] } },
  { id: 'missing', input: { value: {}, constraints: [{ path: ['source'], op: 'exists' }] },
    expected: { passed: false, failed: [0] } },
] };

async function contextFixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'jh-context-cli-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'memory.json');
  const flags = ['--store', file, '--owner', 'synthetic-context-cli-owner'];
  const seed = async (id, scope, extra = {}, { candidate = false, suite = CONTEXT_SUITE } = {}) => {
    const lesson = { id, ...structuredClone(scope), guidance: `Apply ${id}.`, ruleVersion: '1',
      evidenceRefs: ['fixture:' + id], ...extra };
    return execute([candidate ? 'candidate' : 'check', ...flags], { lesson, suite });
  };
  const invoke = input => spawnSync(process.execPath, [fileURLToPath(new URL('./cli.mjs', import.meta.url)), 'context', ...flags],
    { input: JSON.stringify(input), encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024 });
  const context = input => {
    const result = invoke(input);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    return JSON.parse(result.stdout);
  };
  const snapshot = async () => {
    const [bytes, info] = await Promise.all([readFile(file, 'utf8'), stat(file, { bigint: true })]);
    return { bytes, inode: info.ino, modified: info.mtimeNs };
  };
  return { flags, seed, invoke, context, snapshot };
}

test('CLI processes combine common and task scopes read-only while preserving the legacy single-query result', async t => {
  const { seed, context, snapshot } = await contextFixture(t);
  await seed('common-rule', COMMON_SCOPE, { provenance: 'user_explicit' });
  await seed('target-rule', TARGET_SCOPE);
  await seed('research-rule', THIRD_SCOPE);
  await seed('unrelated-rule', { ...TARGET_SCOPE, operation: 'other.operation' });
  const before = await snapshot(), options = { now: CONTEXT_NOW };
  const legacy = context({ query: TARGET_SCOPE, options });
  assert.deepEqual(legacy.lessons.map(item => item.id), ['target-rule']);
  assert.deepEqual(context({ queries: [TARGET_SCOPE], options }), legacy);
  const merged = context({ queries: [TARGET_SCOPE, COMMON_SCOPE], options });
  assert.deepEqual(merged.lessons.map(item => item.id), ['common-rule', 'target-rule']);
  assert.deepEqual(merged.conflicts, []);
  assert.equal(merged.omitted, 0);
  assert.equal(merged.revision, JSON.parse(before.bytes).state.revision);
  assert.deepEqual(context({ queries: [COMMON_SCOPE, TARGET_SCOPE], options }), merged);
  assert.deepEqual(context({ queries: [THIRD_SCOPE, TARGET_SCOPE, COMMON_SCOPE], options }).lessons.map(item => item.id),
    ['common-rule', 'research-rule', 'target-rule']);
  assert.deepEqual(await snapshot(), before);
});

test('CLI multi-scope selection resolves cross-scope conflicts and uses one deduplicated Unicode budget', async t => {
  const { seed, context, snapshot } = await contextFixture(t);
  await seed('a-owner', COMMON_SCOPE, { provenance: 'user_explicit', conflictKey: 'approval-mode', guidance: '원문🙂' });
  await seed('b-inferred', TARGET_SCOPE, { provenance: 'model_inferred', conflictKey: 'approval-mode', guidance: 'Skip confirmation.' });
  await seed('c-common-layout', COMMON_SCOPE, { provenance: 'host_verified', conflictKey: 'output-layout', guidance: 'Common layout.' });
  await seed('d-task-layout', TARGET_SCOPE, { provenance: 'host_verified', conflictKey: 'output-layout', guidance: 'Task layout.' });
  await seed('e-common-repeat', COMMON_SCOPE, { provenance: 'host_verified', guidance: '가🙂' });
  await seed('f-task-repeat', TARGET_SCOPE, { provenance: 'model_inferred', guidance: '가🙂' });
  await seed('g-task-extra', TARGET_SCOPE, { provenance: 'host_verified', guidance: '끝' });
  const before = await snapshot();
  const request = { queries: [TARGET_SCOPE, COMMON_SCOPE], options: { now: CONTEXT_NOW } };
  const merged = context(request);
  assert.deepEqual(merged.lessons.map(item => item.id), ['a-owner', 'e-common-repeat', 'g-task-extra']);
  assert.deepEqual(merged.conflicts, [{ conflictKey: 'output-layout',
    lessonIds: ['c-common-layout', 'd-task-layout'], reason: 'equal_authority_conflict' }]);
  assert.equal(merged.omitted, 4);
  const counted = context({ ...request, options: { ...request.options, limit: 2 } });
  assert.deepEqual(counted.lessons.map(item => item.id), ['a-owner', 'e-common-repeat']);
  assert.equal(counted.omitted, 5);
  const bounded = context({ ...request, options: { ...request.options, maxChars: 4 } });
  assert.deepEqual(bounded.lessons.map(item => item.id), ['a-owner', 'g-task-extra']);
  assert.equal(bounded.lessons.map(item => [...item.guidance].length).reduce((sum, value) => sum + value), 4);
  assert.equal(bounded.omitted, 5);
  assert.deepEqual(bounded.conflicts, merged.conflicts);
  assert.deepEqual(await snapshot(), before);
});

test('CLI merged recall respects each scope lifetime and excludes unvalidated or quarantined candidates', async t => {
  const { seed, context, snapshot } = await contextFixture(t);
  await seed('a-current', COMMON_SCOPE, { validFrom: CONTEXT_NOW, validUntil: CONTEXT_NEXT });
  await seed('b-future', TARGET_SCOPE, { validFrom: CONTEXT_NEXT });
  await seed('c-expired', COMMON_SCOPE, { validUntil: CONTEXT_NOW });
  await seed('d-candidate', TARGET_SCOPE, {}, { candidate: true });
  const badSuite = structuredClone(CONTEXT_SUITE);
  badSuite.id = 'context-cli-failing-fixture';
  badSuite.cases[0].expected = { passed: false, failed: [0] };
  const quarantined = await seed('e-quarantined', COMMON_SCOPE, {}, { suite: badSuite });
  assert.equal(quarantined.lessonState, 'quarantined');
  await seed('f-active', TARGET_SCOPE);
  const before = await snapshot(), queries = [TARGET_SCOPE, COMMON_SCOPE];
  const current = context({ queries, options: { now: CONTEXT_NOW } });
  assert.deepEqual(current.lessons.map(item => item.id), ['a-current', 'f-active']);
  assert.equal(current.omitted, 0);
  const next = context({ queries, options: { now: CONTEXT_NEXT } });
  assert.deepEqual(next.lessons.map(item => item.id), ['b-future', 'f-active']);
  assert.notEqual(next.fingerprint, current.fingerprint);
  assert.equal(next.revision, current.revision);
  assert.deepEqual(await snapshot(), before);
});

test('CLI rejects ambiguous envelopes, malformed scopes and widened runtime identities without changing memory', async t => {
  const { seed, invoke, snapshot } = await contextFixture(t);
  await seed('context-rule', TARGET_SCOPE);
  const before = await snapshot();
  const invalid = [null, [], {}, { options: {} }, { query: TARGET_SCOPE, queries: [COMMON_SCOPE] },
    { query: TARGET_SCOPE, queries: null }, { queries: [] }, { queries: TARGET_SCOPE },
    { queries: [TARGET_SCOPE, TARGET_SCOPE] }, { queries: [TARGET_SCOPE, COMMON_SCOPE, THIRD_SCOPE, { ...THIRD_SCOPE, operation: 'fourth' }] },
    { queries: [null] }, { queries: [{ ...TARGET_SCOPE, ownerScope: 'other' }] },
    { queries: [TARGET_SCOPE], owner: 'other' }, { queries: [TARGET_SCOPE], options: { maxLessons: 10 } },
    { queries: [TARGET_SCOPE], options: { limit: 21 } }, { queries: [TARGET_SCOPE], options: { now: '2035-02-30T00:00:00Z' } },
    { queries: [TARGET_SCOPE, { ...COMMON_SCOPE, engine: 'other-engine' }] },
    ...['platform', 'version', 'environment'].map(key => ({ queries: [TARGET_SCOPE, { ...COMMON_SCOPE,
      context: { ...COMMON_SCOPE.context, [key]: 'other' } }] })),
  ];
  for (const input of invalid) {
    const result = invoke(input);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.deepEqual(JSON.parse(result.stderr), { ok: false, code: 'LEARNING_INPUT_OR_OPERATION_FAILED' });
  }
  assert.deepEqual(await snapshot(), before);
});

test('CLI context envelope rejects non-JSON properties without invoking accessors or proxy traps', async t => {
  const { flags, seed, snapshot } = await contextFixture(t);
  await seed('context-rule', TARGET_SCOPE);
  const before = await snapshot();
  let calls = 0;
  const accessor = { get queries() { calls++; return [TARGET_SCOPE]; } };
  const proxy = new Proxy({ queries: [TARGET_SCOPE] }, { getPrototypeOf() { calls++; return Object.prototype; } });
  const hidden = { queries: [TARGET_SCOPE] };
  Object.defineProperty(hidden, 'options', { value: {}, enumerable: false });
  const symbol = { queries: [TARGET_SCOPE], [Symbol('owner')]: 'other' };
  for (const input of [accessor, proxy, hidden, symbol, Object.create({ queries: [TARGET_SCOPE] }), new Date()]) {
    await assert.rejects(execute(['context', ...flags], input), TypeError);
  }
  assert.equal(calls, 0);
  assert.deepEqual(await snapshot(), before);
});
