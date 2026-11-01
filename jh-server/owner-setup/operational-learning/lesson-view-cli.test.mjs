import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Separate CLI processes against synthetic temporary owner stores only. These
// checks neither record operational experiences nor execute a user/device task.
const CLI = fileURLToPath(new URL('./cli.mjs', import.meta.url));
const OWNER = 'synthetic-lesson-view-owner';
const NOW = new Date().toISOString();
const SCOPE = { domain: 'output', operation: 'summary.format', engine: 'jh-agent',
  context: { platform: 'chatgpt', version: 'operational-learning-v1', environment: 'synthetic-lesson-view' } };
const COMMON = { ...SCOPE, domain: 'orchestration', operation: 'learning.scope' };
const RESEARCH = { ...SCOPE, domain: 'research', operation: 'source.check' };
const SUITE = { id: 'lesson-view-source-contract', version: '1', evaluator: 'jh.constraints.v1', cases: [
  { id: 'source-present', input: { value: { source: 'fixture:checked-source' },
    constraints: [{ path: ['source'], op: 'exists' }] }, expected: { passed: true, failed: [] } },
  { id: 'source-missing-detected', input: { value: {},
    constraints: [{ path: ['source'], op: 'exists' }] }, expected: { passed: false, failed: [0] } },
] };
const sha = text => createHash('sha256').update(text, 'utf8').digest('hex');

function instruction(overrides = {}) {
  const text = 'Keep the checked source in the summary.';
  return { lessonId: 'explicit-summary-source', ruleVersion: '1', text,
    sourceRef: 'user:synthetic-lesson-view-instruction', sourceSha256: sha(text),
    appliesTo: { kind: 'exact_scope' }, confirmation: 'explicit_user_instruction', ...overrides };
}
function request(overrides = {}) {
  return { instruction: instruction(), scope: structuredClone(SCOPE), suite: structuredClone(SUITE), ...overrides };
}
function viewInput(lessonId = 'explicit-summary-source', overrides = {}) {
  return { lessonId, query: structuredClone(SCOPE), options: { now: NOW }, ...overrides };
}

async function setup(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'jh-lesson-view-cli-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'private', 'memory.json');
  const run = (command, input, { revision, owner = OWNER } = {}) => new Promise((resolve, reject) => {
    const args = [CLI, command, '--store', file, '--owner', owner];
    if (revision !== undefined) args.push('--revision', String(revision));
    const child = spawn(process.execPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Synthetic lesson-view CLI timed out')); }, 20000);
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
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.signal, null); assert.equal(result.stderr, '');
    return JSON.parse(result.stdout);
  };
  const rejected = async (command, input, options, code = 'LEARNING_INPUT_OR_OPERATION_FAILED') => {
    const result = await run(command, input, options);
    assert.equal(result.code, 1); assert.equal(result.signal, null);
    assert.equal(result.stdout, '');
    assert.deepEqual(JSON.parse(result.stderr), { ok: false, code });
    return result;
  };
  const register = async input => {
    const prepared = await ok('instruction', input);
    const saved = await ok('candidate', { lesson: prepared.lesson, suite: prepared.suite },
      { revision: prepared.baseRevision });
    return { prepared, saved };
  };
  const check = registered => ok('check', { lesson: registered.saved.lesson, suite: registered.prepared.suite });
  const activate = async input => {
    const registered = await register(input);
    const checked = await check(registered);
    assert.equal(checked.lessonState, 'active');
    return { ...registered, checked };
  };
  return { directory, file, ok, rejected, register, check, activate };
}
async function snapshot(file) {
  const [bytes, info] = await Promise.all([readFile(file, 'utf8'), stat(file, { bigint: true })]);
  return { bytes, inode: info.ino, modified: info.mtimeNs };
}
function assertNoEffects(view) {
  assert.equal(view.readOnly, true); assert.equal(view.advisoryOnly, true);
  for (const flag of ['externalEffects', 'pastApplicationVerified', 'liveImprovementVerified', 'liveExecutionVerified']) {
    assert.equal(view[flag], false, flag);
  }
}

test('CLI lesson-view follows an explicit instruction from a stored candidate to checked recall without creating experience', async t => {
  const { file, ok, register, check } = await setup(t);
  const text = '  확인한 출처🙂를 포함합니다.\r\n원문 e\u0301와 공백을 유지합니다.  ';
  const input = request({ instruction: instruction({ text, sourceSha256: sha(text),
    sourceRecordRef: 'artifact:synthetic-original-source' }) });
  const registered = await register(input);
  const before = await snapshot(file);
  const candidate = await ok('lesson-view', viewInput());
  assert.equal(candidate.schema, 'jh.learning-lesson-view.v1');
  assert.equal(candidate.lessonId, input.instruction.lessonId);
  assert.equal(candidate.revision, registered.saved.revision); assert.equal(candidate.checkedAt, NOW);
  assert.equal(candidate.lessonState, 'candidate'); assert.equal(candidate.evaluation.status, 'not_run');
  assert.equal(candidate.scopeMatches, true); assert.equal(candidate.recallIncluded, false);
  assert.equal(candidate.engineRecallIncluded, false); assert.equal(candidate.selectionStatus, 'candidate');
  assert.equal(candidate.definition.guidance, text);
  assert.equal(candidate.definition.provenance, 'user_explicit'); assert.equal(candidate.definition.memoryKind, 'procedure');
  assert.deepEqual(candidate.definition.scope, SCOPE);
  assert.deepEqual(candidate.definition.evidenceRefs, [input.instruction.sourceRef, 'sha256:' + sha(text), input.instruction.sourceRecordRef]);
  assert.equal(candidate.definition.inputFingerprint, registered.saved.lesson.inputFingerprint);
  assertNoEffects(candidate);
  assert.deepEqual(await snapshot(file), before);

  const checked = await check(registered);
  const afterCheck = await snapshot(file);
  const active = await ok('lesson-view', viewInput());
  assert.equal(active.revision, checked.revision); assert.equal(active.lessonState, 'active');
  assert.equal(active.evaluation.status, 'passed'); assert.equal(active.evaluation.passed, 2);
  assert.equal(active.evaluation.failed, 0); assert.equal(active.evaluation.skipped, 0);
  assert.equal(active.temporalStatus, 'in_window'); assert.equal(active.recallIncluded, true);
  assert.equal(active.engineRecallIncluded, true); assert.equal(active.selectionStatus, 'included');
  assert.deepEqual(active.definition, candidate.definition);
  const recalled = await ok('context', { query: SCOPE, options: { now: NOW } });
  assert.equal(active.recallFingerprint, recalled.fingerprint); assert.equal(active.recallOmitted, recalled.omitted);
  assert.deepEqual(recalled.lessons.map(item => item.id), [active.lessonId]);
  assertNoEffects(active);
  assert.deepEqual((await ok('status')).counts, { events: 0, attempts: 0, lessons: 1, proposals: 0 });
  assert.deepEqual(await snapshot(file), afterCheck);
});

test('CLI lesson-view matches combined context, scope isolation and exact recall budgets', async t => {
  const { file, ok, activate } = await setup(t);
  const common = request({ instruction: instruction({ lessonId: 'a-common-rule', appliesTo: { kind: 'all_jh_tasks' } }),
    globalRecall: structuredClone(COMMON) });
  await activate(common);
  const text = 'Use the requested summary heading order.';
  await activate(request({ instruction: instruction({ lessonId: 'z-exact-rule', text, sourceSha256: sha(text) }) }));
  const before = await snapshot(file);
  for (const options of [{ now: NOW }, { now: NOW, limit: 1, maxChars: 4000 }, { now: NOW, limit: 5, maxChars: 1 }]) {
    const queries = [COMMON, SCOPE];
    const context = await ok('context', { queries, options });
    for (const lessonId of ['a-common-rule', 'z-exact-rule']) {
      const view = await ok('lesson-view', { lessonId, queries, options });
      assert.equal(view.scopeMatches, true); assert.equal(view.lessonState, 'active');
      assert.equal(view.evaluation.status, 'passed');
      const included = context.lessons.some(item => item.id === lessonId);
      assert.equal(view.recallIncluded, included); assert.equal(view.engineRecallIncluded, included);
      assert.equal(view.selectionStatus, included ? 'included' : 'not_selected');
      assert.equal(view.recallFingerprint, context.fingerprint); assert.equal(view.recallOmitted, context.omitted);
      assert.deepEqual(view.recallBudget, { limit: options.limit ?? 5, maxChars: options.maxChars ?? 4000 });
      assertNoEffects(view);
    }
  }
  for (const query of [RESEARCH, { ...SCOPE, engine: 'other-agent' },
    { ...SCOPE, context: { ...SCOPE.context, environment: 'other-environment' } }]) {
    const view = await ok('lesson-view', viewInput('z-exact-rule', { query }));
    assert.equal(view.lessonState, 'active'); assert.equal(view.evaluation.status, 'passed');
    assert.equal(view.scopeMatches, false); assert.equal(view.recallIncluded, false);
    assert.equal(view.selectionStatus, 'not_in_scope');
  }
  const commonOnly = await ok('lesson-view', viewInput('a-common-rule', { query: SCOPE }));
  assert.equal(commonOnly.scopeMatches, false); assert.equal(commonOnly.recallIncluded, false);
  assert.deepEqual(await snapshot(file), before);
});

test('CLI lesson-view separates quarantined checks and expired active rules from usable advice', async t => {
  const { file, ok, register, check, activate } = await setup(t);
  const failedSuite = structuredClone(SUITE);
  failedSuite.cases[0].expected = { passed: false, failed: [0] };
  const failed = await register(request({ suite: failedSuite }));
  const checked = await check(failed);
  assert.equal(checked.lessonState, 'quarantined');
  const text = 'Keep a synthetic historical source policy.';
  await activate(request({ instruction: instruction({ lessonId: 'expired-policy', text, sourceSha256: sha(text),
    validUntil: '2020-01-01T00:00:00.000Z' }) }));
  const before = await snapshot(file);
  const quarantined = await ok('lesson-view', viewInput());
  assert.equal(quarantined.lessonState, 'quarantined'); assert.equal(quarantined.evaluation.status, 'failed');
  assert.equal(quarantined.evaluation.passed, 1); assert.equal(quarantined.evaluation.failed, 1);
  assert.equal(quarantined.scopeMatches, true); assert.equal(quarantined.recallIncluded, false);
  assert.equal(quarantined.selectionStatus, 'quarantined'); assertNoEffects(quarantined);
  const expired = await ok('lesson-view', viewInput('expired-policy'));
  assert.equal(expired.lessonState, 'active'); assert.equal(expired.evaluation.status, 'passed');
  assert.equal(expired.temporalStatus, 'expired'); assert.equal(expired.recallIncluded, false);
  assert.equal(expired.selectionStatus, 'expired'); assertNoEffects(expired);
  assert.deepEqual((await ok('context', { query: SCOPE, options: { now: NOW } })).lessons, []);
  assert.deepEqual(await snapshot(file), before);
});

test('CLI lesson-view missing stores and unknown IDs never create files or change existing memory', async t => {
  const { directory, file, ok, rejected, register } = await setup(t);
  await rejected('lesson-view', viewInput(), undefined, 'LEARNING_LESSON_NOT_FOUND');
  assert.deepEqual(await readdir(directory), []);
  await register(request());
  const before = await snapshot(file);
  await rejected('lesson-view', viewInput('unknown-lesson'), undefined, 'LEARNING_LESSON_NOT_FOUND');
  assert.deepEqual(await snapshot(file), before);
  assert.deepEqual(await readdir(path.dirname(file)), ['memory.json']);
  assert.deepEqual((await ok('status')).counts, { events: 0, attempts: 0, lessons: 1, proposals: 0 });
});

test('CLI lesson-view rejects owner, revision and malformed scope selectors without writes or source leakage', async t => {
  const { file, ok, rejected, register } = await setup(t);
  const text = 'PRIVATE_SYNTHETIC_SOURCE: retain the supplied exact source.';
  const registered = await register(request({ instruction: instruction({ text, sourceSha256: sha(text) }) }));
  const before = await snapshot(file);
  const malformed = [
    null, [], {},
    { lessonId: 'explicit-summary-source' },
    { ...viewInput(), queries: [SCOPE] },
    { ...viewInput(), arbitrary: text },
    { ...viewInput(), proposals: {} },
    { ...viewInput(), expectedRevision: registered.saved.revision },
    { ...viewInput(), lessonId: text },
    { ...viewInput(), query: { ...SCOPE, operation: '*' } },
    { ...viewInput(), query: { ...SCOPE, context: { ...SCOPE.context, secret: text } } },
    { lessonId: 'explicit-summary-source', queries: [] },
    { lessonId: 'explicit-summary-source', queries: [SCOPE, SCOPE] },
    { lessonId: 'explicit-summary-source', queries: [SCOPE, { ...COMMON, engine: 'other-engine' }] },
    { ...viewInput(), options: { now: NOW, limit: 0 } },
    { ...viewInput(), options: { now: NOW, maxChars: 16385 } },
    { ...viewInput(), options: { now: 'not-a-timestamp' } },
  ];
  for (const input of malformed) {
    const result = await rejected('lesson-view', input);
    assert.equal(result.stderr.includes(text), false);
  }
  await rejected('lesson-view', viewInput(), { revision: registered.saved.revision });
  await rejected('lesson-view', viewInput(), { owner: 'synthetic-other-owner' }, 'LEARNING_STORE_SCOPE_MISMATCH');
  assert.deepEqual(await snapshot(file), before);
  assert.deepEqual(await readdir(path.dirname(file)), ['memory.json']);
  assert.deepEqual((await ok('status')).counts, { events: 0, attempts: 0, lessons: 1, proposals: 0 });
});
