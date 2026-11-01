import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createState, addLesson, evaluateLesson } from './engine.mjs';
import { bindRegression, runRegression } from './regression.mjs';
import { evaluateConstraints } from './constraints.mjs';
import { prepareRuleUse } from './rule-usage.mjs';
import { observeTask } from './host-observations.mjs';
import { FileLearningStore } from './store.mjs';
import { execute } from './cli.mjs';

// Synthetic owner-bound temporary stores and real CLI processes only. No
// production memory, external action, or causal improvement is asserted here.
const CLI = fileURLToPath(new URL('./cli.mjs', import.meta.url));
const OWNER = 'synthetic-rule-use-review-cli-owner';
const EVALUATED = '2026-11-01T00:00:00.000Z';
const SELECTED = '2026-11-01T00:01:00.000Z';
const APPLIED = '2026-11-01T00:02:00.000Z';
const RECORDED = '2026-11-01T00:03:00.000Z';
const SCOPE = { domain: 'output', operation: 'summary.format', engine: 'jh-agent',
  context: { platform: 'node', version: 'usage-review-v1', environment: 'synthetic-cli-test' } };
const COMMON = { ...SCOPE, domain: 'orchestration', operation: 'learning.scope' };
const RESEARCH = { ...SCOPE, domain: 'research', operation: 'source.check' };
const RULE = 'synthetic-common-source-rule';
const SUITE = { id: 'synthetic-source-review', version: '1', cases: [
  { id: 'source-present', input: { value: { source: 'fixture:checked-source' },
    constraints: [{ path: ['source'], op: 'exists' }] }, expected: { passed: true, failed: [] } },
  { id: 'source-missing', input: { value: {}, constraints: [{ path: ['source'], op: 'exists' }] },
    expected: { passed: false, failed: [0] } },
] };
const clone = value => structuredClone(value);

async function fixture() {
  const lesson = bindRegression({ id: RULE, ...clone(COMMON), ruleVersion: '1',
    guidance: 'Preserve the checked source of the synthetic result.',
    evidenceRefs: ['fixture:synthetic-common-rule'], provenance: 'user_explicit' }, SUITE);
  const checked = await runRegression(lesson, SUITE, evaluateConstraints, { now: EVALUATED });
  let state = evaluateLesson(addLesson(createState(), lesson), lesson.id, checked.evaluation);
  for (const [id, taskId, attemptId, outcome] of [
    ['repeat-a', 'task-repeat', 'attempt-a', 'failure_verified'],
    ['repeat-b', 'task-repeat', 'attempt-b', 'failure_verified'],
    ['independent', 'task-independent', 'attempt-a', 'failure_verified'],
    ['unknown', 'task-unknown', 'attempt-a', 'completion_unknown'],
  ]) state = use(state, { id, taskId, attemptId, outcome });
  return state;
}

function use(state, { id, taskId, attemptId = 'attempt-a', outcome = 'failure_verified', scope = SCOPE }) {
  const selection = prepareRuleUse(state, { taskId, attemptId, lessonId: RULE,
    scope: clone(scope), globalRecall: clone(COMMON) }, { now: SELECTED }).selection;
  const useRef = 'source:synthetic-use-' + id;
  const observationRef = 'source:synthetic-observation-' + id;
  return observeTask(state, { taskId, attemptId, observationRef, expectedRevision: state.revision,
    scope: clone(scope), observation: { timestamp: RECORDED, outcome, source: 'host_verified',
      errorCode: 'SYNTHETIC_SOURCE_MISSING',
      evidenceRefs: [observationRef, useRef, 'artifact:synthetic-result-' + id],
      ruleUses: [{ useRef, selection, appliedAt: APPLIED, evidenceRefs: [useRef],
        confirmation: 'applied_in_this_attempt' }] } }, { now: RECORDED }).state;
}

async function setup(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'jh-rule-use-review-cli-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'private', 'memory.json');
  const flags = ['--store', file, '--owner', OWNER];
  const store = new FileLearningStore({ file, ownerScope: OWNER });
  const run = (command, input, { revision, owner = OWNER } = {}) => new Promise((resolve, reject) => {
    const args = [CLI, command, '--store', file, '--owner', owner];
    if (revision !== undefined) args.push('--revision', String(revision));
    const child = spawn(process.execPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Synthetic usage-review CLI timed out')); }, 20000);
    timeout.unref();
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', value => { stdout += value; });
    child.stderr.on('data', value => { stderr += value; });
    child.on('error', error => { clearTimeout(timeout); reject(error); });
    child.on('close', (code, signal) => { clearTimeout(timeout); resolve({ code, signal, stdout, stderr }); });
    child.stdin.on('error', error => { clearTimeout(timeout); reject(error); });
    child.stdin.end(input === undefined ? undefined : JSON.stringify(input));
  });
  const ok = async (command, input, options) => {
    const result = await run(command, input, options);
    assert.equal(result.code, 0, result.stderr); assert.equal(result.signal, null); assert.equal(result.stderr, '');
    return JSON.parse(result.stdout);
  };
  const rejected = async (command, input, options, expectedCode) => {
    const result = await run(command, input, options);
    assert.equal(result.code, 1); assert.equal(result.signal, null); assert.equal(result.stdout, '');
    const error = JSON.parse(result.stderr);
    assert.deepEqual(Object.keys(error).sort(), ['code', 'ok']); assert.equal(error.ok, false);
    if (expectedCode) assert.equal(error.code, expectedCode);
    assert.equal(result.stderr.includes('PRIVATE_SYNTHETIC'), false);
  };
  return { directory, file, flags, store, ok, rejected, seed: state => store.transact(() => state) };
}

async function snapshot(file) {
  const [bytes, info] = await Promise.all([readFile(file, 'utf8'), stat(file, { bigint: true })]);
  return { bytes, inode: info.ino, modified: info.mtimeNs };
}

test('CLI usage-review and opted-in context read an absent store without creating files', async t => {
  const { directory, ok, rejected } = await setup(t);
  const empty = await ok('usage-review', { query: SCOPE });
  assert.equal(empty.schema, 'jh.learning-rule-use-review.v1');
  assert.equal(empty.revision, 0); assert.deepEqual(empty.groups, []);
  assert.deepEqual(empty.totals, { matchingGroups: 0, recordedUses: 0, distinctAttempts: 0, independentTasks: 0 });
  assert.equal(empty.omitted, 0); assert.equal(empty.suppressed, 0);
  const legacy = await ok('context', { query: SCOPE });
  assert.equal(Object.hasOwn(legacy, 'usageReview'), false);
  const combined = await ok('context', { query: SCOPE, usageReview: {} });
  const { usageReview, ...advice } = combined;
  assert.deepEqual(advice, legacy); assert.deepEqual(usageReview, empty);
  await rejected('usage-review', { query: SCOPE }, { revision: 0 });
  await rejected('usage-review', { query: SCOPE, options: { now: SELECTED } });
  assert.deepEqual(await readdir(directory), []);
});

test('CLI reviews actual use groups with independent task counts and preserves all stored bytes', async t => {
  const { file, ok, seed } = await setup(t); const state = await fixture(); await seed(state);
  const before = await snapshot(file);
  const reviewed = await ok('usage-review', { queries: [COMMON, SCOPE] });
  assert.equal(reviewed.revision, state.revision); assert.equal(reviewed.groups.length, 1);
  assert.deepEqual(reviewed.totals, { matchingGroups: 1, recordedUses: 4, distinctAttempts: 4, independentTasks: 3 });
  assert.deepEqual(reviewed.groups[0].counts, { recordedUses: 4, distinctAttempts: 4, independentTasks: 3,
    successOnlyTasks: 0, failureOnlyTasks: 2, unconfirmedOnlyTasks: 1, mixedTasks: 0 });
  assert.equal(reviewed.groups[0].identity.lessonId, RULE);
  assert.deepEqual(reviewed.groups[0].identity.actualScope, SCOPE);
  assert.equal(reviewed.readOnly, true); assert.equal(reviewed.advisoryOnly, true);
  assert.equal(reviewed.sourceAuthentication, 'host_attestation');
  for (const key of ['externalEffects', 'replayAllowed', 'applicationVerified', 'preActionTimingVerified',
    'liveImprovementVerified', 'causalEffectVerified']) assert.equal(reviewed[key], false);
  assert.match(reviewed.fingerprint, /^[a-f0-9]{64}$/);
  assert.match(reviewed.groups[0].noticeFingerprint, /^[a-f0-9]{64}$/);
  assert.deepEqual(await ok('usage-review', { queries: [SCOPE, COMMON] }), reviewed);
  const original = await ok('context', { queries: [SCOPE, COMMON], proposals: {} });
  assert.equal(Object.hasOwn(original, 'usageReview'), false);
  const together = await ok('context', { queries: [SCOPE, COMMON], proposals: {}, usageReview: {} });
  const { usageReview, ...unchanged } = together;
  assert.deepEqual(unchanged, original); assert.deepEqual(usageReview, reviewed);
  assert.equal(together.revision, together.proposalContext.revision);
  assert.equal(together.revision, together.usageReview.revision);
  const usageOnly = await ok('context', { query: SCOPE, usageReview: {} });
  assert.equal(Object.hasOwn(usageOnly, 'proposalContext'), false);
  assert.deepEqual(usageOnly.usageReview.totals, reviewed.totals);
  assert.deepEqual(await snapshot(file), before);
});

test('CLI usage budgets and seen notices limit delivery without changing counts or storing acknowledgements', async t => {
  const { file, ok, seed } = await setup(t);
  const state = use(await fixture(), { id: 'research', taskId: 'task-research', scope: RESEARCH });
  await seed(state); const before = await snapshot(file);
  const queries = [SCOPE, RESEARCH];
  const all = await ok('usage-review', { queries, options: { limit: 10, maxChars: 32768 } });
  assert.equal(all.groups.length, 2); assert.equal(all.totals.matchingGroups, 2);
  assert.equal(all.totals.independentTasks, 4); assert.equal(all.totals.recordedUses, 5);
  const limited = await ok('usage-review', { queries, options: { limit: 1, maxChars: 32768 } });
  assert.equal(limited.groups.length, 1); assert.equal(limited.omitted, 1);
  assert.deepEqual(limited.totals, all.totals);
  const suppressed = await ok('usage-review', { queries, options: {
    seenNoticeFingerprints: all.groups.map(group => group.noticeFingerprint), maxChars: 32768 } });
  assert.deepEqual(suppressed.groups, []); assert.equal(suppressed.suppressed, 2); assert.equal(suppressed.omitted, 0);
  assert.deepEqual(suppressed.totals, all.totals);
  const tiny = await ok('context', { queries, usageReview: { maxChars: 1 } });
  assert.deepEqual(tiny.usageReview.groups, []); assert.equal(tiny.usageReview.omitted, 2);
  assert.deepEqual(tiny.usageReview.totals, all.totals);
  assert.deepEqual(await snapshot(file), before);
});

test('CLI scopes follow the actual task rather than the common rule and reject mixed owner environments', async t => {
  const { file, ok, rejected, seed } = await setup(t); await seed(await fixture()); const before = await snapshot(file);
  const common = await ok('usage-review', { query: COMMON });
  assert.deepEqual(common.groups, []); assert.equal(common.totals.recordedUses, 0);
  const unrelated = await ok('usage-review', { query: RESEARCH });
  assert.deepEqual(unrelated.groups, []); assert.equal(unrelated.totals.recordedUses, 0);
  for (const queries of [[], [SCOPE, SCOPE], [SCOPE, { ...RESEARCH, engine: 'other-agent' }],
    [SCOPE, { ...RESEARCH, context: { ...RESEARCH.context, environment: 'other-owner-context' } }],
    [SCOPE, COMMON, RESEARCH, { ...SCOPE, operation: 'fourth.operation' }]]) {
    await rejected('usage-review', { queries });
    await rejected('context', { queries, usageReview: {} });
  }
  await rejected('usage-review', { query: { ...SCOPE, operation: '*' } });
  assert.deepEqual(await snapshot(file), before);
});

test('CLI usage-review rejects unsupported arguments and preserves owner-bound memory without echoing input', async t => {
  const { file, ok, rejected, seed } = await setup(t); const state = await fixture(); await seed(state);
  const before = await snapshot(file);
  for (const input of [undefined, null, [], {}, { query: SCOPE, queries: [SCOPE] },
    { query: SCOPE, now: SELECTED }, { query: SCOPE, thresholds: { failures: 1 } },
    { query: SCOPE, expectedRevision: state.revision }, { query: SCOPE, note: 'PRIVATE_SYNTHETIC_SOURCE' },
    { query: SCOPE, options: null }, { query: SCOPE, options: { now: SELECTED } },
    { query: SCOPE, options: { thresholds: { failures: 1 } } }, { query: SCOPE, options: { limit: 0 } },
    { query: SCOPE, options: { limit: 11 } }, { query: SCOPE, options: { maxChars: 0 } },
    { query: SCOPE, options: { maxChars: 32769 } },
    { query: SCOPE, options: { seenNoticeFingerprints: ['PRIVATE_SYNTHETIC_NOT_A_HASH'] } },
    { query: SCOPE, options: { seenNoticeFingerprints: Array(65).fill('a'.repeat(64)) } }]) {
    await rejected('usage-review', input);
  }
  for (const usageReview of [null, [], { now: SELECTED }, { thresholds: {} }, { maxChars: 32769 }]) {
    await rejected('context', { query: SCOPE, usageReview });
  }
  await rejected('usage-review', { query: SCOPE }, { revision: state.revision });
  await rejected('usage-review', { query: SCOPE }, { owner: 'another-synthetic-owner' }, 'LEARNING_STORE_SCOPE_MISMATCH');
  assert.deepEqual((await ok('status')).counts,
    Object.fromEntries(['events', 'attempts', 'lessons', 'proposals'].map(key => [key, Object.keys(state[key]).length])));
  assert.deepEqual(await snapshot(file), before);
  assert.deepEqual(await readdir(path.dirname(file)), ['memory.json']);
});

test('execute uses one snapshot for all opt-in views and rejects executable options or scopes without invoking them', async t => {
  const { file, flags, seed } = await setup(t); const state = await fixture(); await seed(state);
  const before = await snapshot(file); const originalRead = FileLearningStore.prototype.read;
  let reads = 0, executions = 0;
  FileLearningStore.prototype.read = async function () { reads++; return reads === 1 ? clone(state) : createState(); };
  try {
    const combined = await execute(['context', ...flags], { queries: [COMMON, SCOPE], proposals: {}, usageReview: {} });
    assert.equal(reads, 1); assert.equal(combined.revision, state.revision);
    assert.equal(combined.proposalContext.revision, state.revision);
    assert.equal(combined.usageReview.revision, state.revision);
    assert.equal(combined.usageReview.groups[0].counts.failureOnlyTasks, 2);
    reads = 0;
    const standalone = await execute(['usage-review', ...flags], { query: SCOPE });
    assert.equal(reads, 1); assert.equal(standalone.revision, state.revision);
    reads = 0;
    await assert.rejects(execute(['usage-review', ...flags, '--revision', String(state.revision)], { query: SCOPE }), TypeError);
    assert.equal(reads, 0);
    const accessor = { get limit() { executions++; return 1; } };
    const proxy = new Proxy({}, { ownKeys() { executions++; return []; } });
    for (const options of [undefined, accessor, proxy, { seenNoticeFingerprints: [() => { executions++; }] }]) {
      await assert.rejects(execute(['usage-review', ...flags], { query: SCOPE, options }), TypeError);
      await assert.rejects(execute(['context', ...flags], { query: SCOPE, usageReview: options }), TypeError);
    }
    const scopeAccessor = { ...clone(SCOPE), get operation() { executions++; return 'summary.format'; } };
    const scopeProxy = new Proxy(clone(SCOPE), { getPrototypeOf() { executions++; return Object.prototype; } });
    for (const query of [scopeAccessor, scopeProxy]) {
      await assert.rejects(execute(['usage-review', ...flags], { query }), TypeError);
      await assert.rejects(execute(['context', ...flags], { query, usageReview: {} }), TypeError);
    }
    assert.equal(executions, 0);
  } finally { FileLearningStore.prototype.read = originalRead; }
  assert.deepEqual(await snapshot(file), before);
});
