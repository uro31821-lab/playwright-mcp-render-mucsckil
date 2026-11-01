import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Separate CLI processes and synthetic temporary memory only; no operational store,
// original chat retrieval, server, external service, or device action is involved.
const CLI = fileURLToPath(new URL('./cli.mjs', import.meta.url));
const OWNER = 'synthetic-host-instruction-cli-owner';
const SCOPE = { domain: 'output', operation: 'summary.format', engine: 'jh-agent',
  context: { platform: 'chatgpt', version: 'operational-learning-v1', environment: 'synthetic-host-instructions' } };
const COMMON = { ...SCOPE, domain: 'orchestration', operation: 'learning.scope' };
const RESEARCH = { ...SCOPE, domain: 'research', operation: 'source.check' };
const SHA = value => createHash('sha256').update(value, 'utf8').digest('hex');
const SUITE = { id: 'host-source-required', version: '1', evaluator: 'jh.constraints.v1', cases: [
  { id: 'present', input: { value: { source: 'fixture:checked-source' }, constraints: [{ path: ['source'], op: 'exists' }] },
    expected: { passed: true, failed: [] } },
  { id: 'missing', input: { value: {}, constraints: [{ path: ['source'], op: 'exists' }] },
    expected: { passed: false, failed: [0] } },
] };

function instruction(overrides = {}) {
  const text = 'Include the checked source when reporting a source-based result.';
  return { lessonId: 'host-source-policy', ruleVersion: '1', text,
    sourceRef: 'user:synthetic-host-instruction', sourceSha256: SHA(text),
    sourceRecordRef: 'artifact:synthetic-user-source-record',
    confirmation: 'explicit_user_instruction', appliesTo: { kind: 'exact_scope' }, ...overrides };
}
function request(overrides = {}) {
  return { instruction: instruction(), suite: structuredClone(SUITE), scope: structuredClone(SCOPE), ...overrides };
}

async function setup(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'jh-host-instruction-cli-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'private', 'memory.json');
  const run = (command, input, { revision, owner = OWNER } = {}) => new Promise((resolve, reject) => {
    const args = [CLI, command, '--store', file, '--owner', owner];
    if (revision !== undefined) args.push('--revision', String(revision));
    const child = spawn(process.execPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Synthetic CLI timed out')); }, 20000);
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
  const prepareAndRegister = async input => {
    const prepared = await ok('instruction', input);
    const registered = await ok('candidate', { lesson: prepared.lesson, suite: prepared.suite },
      { revision: prepared.baseRevision });
    return { prepared, registered };
  };
  const activate = async input => {
    const result = await prepareAndRegister(input);
    const checked = await ok('check', { lesson: result.registered.lesson, suite: result.prepared.suite });
    assert.equal(checked.lessonState, 'active');
    return { ...result, checked };
  };
  return { directory, file, run, ok, rejected, prepareAndRegister, activate };
}

async function snapshot(file) {
  const [bytes, info] = await Promise.all([readFile(file, 'utf8'), stat(file, { bigint: true })]);
  return { bytes, inode: info.ino, modified: info.mtimeNs };
}
const emptyExperienceCounts = { events: 0, attempts: 0, lessons: 1, proposals: 0 };

test('CLI instruction preserves exact UTF-8 through candidate response, check and combined context without preparing a store', async t => {
  const { directory, file, ok } = await setup(t);
  const text = '  확인한 출처🙂를 결과에 포함합니다.\r\n원문 e\u0301와 공백을 보존합니다.  ';
  const input = request({ instruction: instruction({ text, sourceSha256: SHA(text) }) });
  const prepared = await ok('instruction', input);
  assert.equal(prepared.baseRevision, 0);
  assert.equal(prepared.readOnly, true); assert.equal(prepared.externalEffects, false);
  assert.equal(prepared.activatedByThisCall, false);
  assert.equal(prepared.lesson.state, 'candidate');
  assert.equal(prepared.lesson.guidance, text);
  assert.equal(prepared.lesson.provenance, 'user_explicit');
  assert.equal(prepared.lesson.memoryKind, 'procedure');
  assert.deepEqual(prepared.suite, SUITE);
  assert.equal(prepared.instructionSummary.sourceAuthentication, 'host_attestation');
  assert.equal(prepared.instructionSummary.sourceRetrievalVerified, false);
  assert.equal(prepared.instructionSummary.automaticInference, false);
  assert.equal(prepared.instructionSummary.activationPerformed, false);
  assert.deepEqual(prepared.instructionSummary.appliesTo, { kind: 'exact_scope' });
  const references = [input.instruction.sourceRef, 'sha256:' + SHA(text), input.instruction.sourceRecordRef];
  assert.deepEqual(prepared.lesson.evidenceRefs, references);
  assert.deepEqual(await readdir(directory), []);
  assert.deepEqual((await ok('context', { queries: [COMMON, SCOPE], proposals: {} })).lessons, []);
  assert.deepEqual(await readdir(directory), []);

  const registered = await ok('candidate', { lesson: prepared.lesson, suite: prepared.suite },
    { revision: prepared.baseRevision });
  assert.deepEqual(Object.keys(registered).sort(), ['lesson', 'revision']);
  assert.equal(registered.lesson.state, 'candidate');
  assert.equal(registered.lesson.inputFingerprint, prepared.lesson.inputFingerprint);
  assert.deepEqual((await ok('context', { queries: [COMMON, SCOPE] })).lessons, []);
  // The candidate response includes persisted state/advisoryOnly, but no suite.
  // CHECK must accept that lesson with the exact original prepared suite.
  const checked = await ok('check', { lesson: registered.lesson, suite: prepared.suite });
  assert.equal(checked.lessonState, 'active');
  assert.equal(checked.report.passed, 2); assert.equal(checked.report.failed, 0);
  assert.equal(checked.report.inputFingerprint, prepared.lesson.inputFingerprint);
  const beforeRecall = await snapshot(file);
  const recalled = await ok('context', { queries: [COMMON, SCOPE], proposals: {} });
  assert.deepEqual(recalled.lessons.map(item => item.id), [input.instruction.lessonId]);
  assert.equal(recalled.lessons[0].guidance, text);
  assert.equal(recalled.lessons[0].provenance, 'user_explicit');
  assert.deepEqual(recalled.lessons[0].evidenceRefs, references);
  assert.deepEqual(recalled.proposalContext.items, []);
  const stored = JSON.parse(beforeRecall.bytes).state.lessons[input.instruction.lessonId];
  assert.equal(SHA(stored.guidance), input.instruction.sourceSha256);
  assert.deepEqual((await ok('status')).counts, emptyExperienceCounts);
  assert.deepEqual(await snapshot(file), beforeRecall);
});

test('CLI common host instructions use the supplied binding and outrank inferred task advice while exact rules remain scoped', async t => {
  const { file, ok, activate } = await setup(t);
  const commonInput = request({ instruction: instruction({ lessonId: 'common-source-rule',
    appliesTo: { kind: 'all_jh_tasks' }, conflictKey: 'source-reporting' }), globalRecall: structuredClone(COMMON) });
  const common = await activate(commonInput);
  for (const key of ['domain', 'operation', 'engine', 'context']) assert.deepEqual(common.prepared.lesson[key], COMMON[key]);
  const inferred = { id: 'inferred-task-rule', ...structuredClone(SCOPE),
    guidance: 'Synthetic inferred advice may omit the source.', evidenceRefs: ['fixture:synthetic-inferred-advice'],
    ruleVersion: '1', memoryKind: 'procedure', provenance: 'model_inferred', conflictKey: 'source-reporting' };
  const inferredCandidate = await ok('candidate', { lesson: inferred, suite: SUITE }, { revision: common.checked.revision });
  await ok('check', { lesson: inferredCandidate.lesson, suite: SUITE });
  const exactText = 'Keep the requested summary field order.';
  await activate(request({ instruction: instruction({ lessonId: 'exact-format-rule', text: exactText,
    sourceSha256: SHA(exactText) }), globalRecall: structuredClone(COMMON) }));

  const before = await snapshot(file);
  const combined = await ok('context', { queries: [COMMON, SCOPE] });
  assert.deepEqual(combined.lessons.map(item => item.id).sort(), ['common-source-rule', 'exact-format-rule']);
  assert.deepEqual(combined.conflicts, []);
  assert.equal(combined.omitted, 1);
  // Common advice is explicitly combined with the current task; exact rules do not
  // become global merely because a valid globalRecall was present while preparing.
  assert.deepEqual((await ok('context', { queries: [COMMON, RESEARCH] })).lessons.map(item => item.id), ['common-source-rule']);
  assert.deepEqual((await ok('context', { query: RESEARCH })).lessons, []);
  assert.deepEqual((await ok('context', { query: SCOPE })).lessons.map(item => item.id).sort(),
    ['exact-format-rule', 'inferred-task-rule']);
  for (const changed of [{ engine: 'other-agent' }, { context: { ...SCOPE.context, environment: 'other-environment' } }]) {
    const queries = [COMMON, SCOPE].map(scope => ({ ...scope, ...changed }));
    assert.deepEqual((await ok('context', { queries })).lessons, []);
  }
  assert.deepEqual((await ok('status')).counts, { ...emptyExperienceCounts, lessons: 3 });
  assert.deepEqual(await snapshot(file), before);
});

test('CLI instruction recovers lost candidate responses through a fresh revision without downgrading an active duplicate', async t => {
  const { file, ok, rejected, prepareAndRegister } = await setup(t);
  const input = request();
  const stale = await ok('instruction', input);
  const unrelatedText = 'Keep an unrelated synthetic output field.';
  await prepareAndRegister(request({ instruction: instruction({ lessonId: 'unrelated-candidate',
    text: unrelatedText, sourceSha256: SHA(unrelatedText) }) }));
  let before = await snapshot(file);
  await rejected('candidate', { lesson: stale.lesson, suite: stale.suite },
    { revision: stale.baseRevision }, 'LEARNING_REVISION_CONFLICT');
  assert.deepEqual(await snapshot(file), before);

  const fresh = await ok('instruction', input);
  await ok('candidate', { lesson: fresh.lesson, suite: fresh.suite }, { revision: fresh.baseRevision });
  // Simulate a lost successful registration response. Its old CAS is not an
  // observe-style idempotent retry; reprepare from persisted state instead.
  before = await snapshot(file);
  await rejected('candidate', { lesson: fresh.lesson, suite: fresh.suite },
    { revision: fresh.baseRevision }, 'LEARNING_REVISION_CONFLICT');
  const recovered = await ok('instruction', request({ instruction: instruction({ lessonId: 'retry-new-id' }) }));
  assert.equal(recovered.baseRevision, JSON.parse(before.bytes).state.revision);
  assert.equal(recovered.lesson.id, input.instruction.lessonId);
  assert.equal(recovered.instructionSummary.duplicateLessonId, input.instruction.lessonId);
  assert.equal(recovered.instructionSummary.existingLessonState, 'candidate');
  assert.equal(recovered.lesson.inputFingerprint, fresh.lesson.inputFingerprint);
  const duplicate = await ok('candidate', { lesson: recovered.lesson, suite: recovered.suite },
    { revision: recovered.baseRevision });
  assert.equal(duplicate.revision, recovered.baseRevision);
  assert.deepEqual(await snapshot(file), before);
  const checked = await ok('check', { lesson: duplicate.lesson, suite: recovered.suite });
  assert.equal(checked.lessonState, 'active');

  before = await snapshot(file);
  const active = await ok('instruction', request({ instruction: instruction({ lessonId: 'retry-active-id' }) }));
  assert.equal(active.instructionSummary.existingLessonState, 'active');
  assert.equal(active.lesson.id, input.instruction.lessonId);
  assert.equal(active.lesson.state, 'candidate'); // A preparation is not a new activation.
  const activeDuplicate = await ok('candidate', { lesson: active.lesson, suite: active.suite },
    { revision: active.baseRevision });
  assert.equal(activeDuplicate.lesson.state, 'active');
  assert.equal(activeDuplicate.revision, checked.revision);
  assert.deepEqual((await ok('context', { queries: [COMMON, SCOPE] })).lessons.map(item => item.id), [input.instruction.lessonId]);
  assert.deepEqual((await ok('status')).counts, { ...emptyExperienceCounts, lessons: 2 });
  assert.deepEqual(await snapshot(file), before);
});

test('CLI instruction rejects altered sources, authority and scope claims, executable evaluators and revision selectors without writes or echoed inputs', async t => {
  const { file, rejected, prepareAndRegister } = await setup(t);
  const { registered } = await prepareAndRegister(request());
  const before = await snapshot(file);
  const privateText = 'PRIVATE_SYNTHETIC_SOURCE: preserve this exact synthetic instruction.';
  const original = request({ instruction: instruction({ lessonId: 'invalid-source-policy',
    text: privateText, sourceSha256: SHA(privateText) }) });
  const mutations = [
    value => { delete value.suite; },
    value => { value.expectedRevision = registered.revision; },
    value => { value.instructionSummary = { sourceAuthentication: 'authenticated_owner_attestation' }; },
    value => { value.instruction.text += ' changed after hashing'; },
    value => { value.instruction.confirmation = 'model_inferred'; },
    value => { value.instruction.appliesTo = { kind: 'tool', target_tool: 'summary.format' }; },
    value => { value.instruction.appliesTo = { kind: 'all_jh_tasks' }; },
    value => {
      value.instruction.appliesTo = { kind: 'all_jh_tasks' };
      value.globalRecall = { ...COMMON, context: { ...COMMON.context, environment: 'other-environment' } };
    },
    value => { value.suite.evaluator = 'run-shell'; },
  ];
  for (const mutate of mutations) {
    const input = structuredClone(original); mutate(input);
    const result = await rejected('instruction', input);
    assert.equal(result.stderr.includes(privateText), false);
    assert.deepEqual(await snapshot(file), before);
  }
  await rejected('instruction', original, { revision: registered.revision });
  await rejected('instruction', original, { owner: 'synthetic-other-owner' }, 'LEARNING_STORE_SCOPE_MISMATCH');
  await rejected('check', { lesson: registered.lesson, suite: SUITE }, { revision: registered.revision });
  assert.deepEqual(await snapshot(file), before);
  assert.deepEqual(await readdir(path.dirname(file)), ['memory.json']);
});

test('CLI failed instruction checks quarantine the rule and preparation cannot revive it with a new ID or weaker suite', async t => {
  const { file, ok, rejected, prepareAndRegister } = await setup(t);
  const failing = structuredClone(SUITE);
  failing.cases[0].expected = { passed: false, failed: [0] };
  const input = request({ suite: failing });
  const { prepared, registered } = await prepareAndRegister(input);
  const checked = await ok('check', { lesson: registered.lesson, suite: prepared.suite });
  assert.equal(checked.lessonState, 'quarantined');
  assert.equal(checked.report.passed, 1); assert.equal(checked.report.failed, 1);
  const before = await snapshot(file);
  assert.deepEqual((await ok('context', { queries: [COMMON, SCOPE] })).lessons, []);
  const weaker = { ...SUITE, cases: [structuredClone(SUITE.cases[1])] };
  for (const suite of [failing, weaker]) {
    await rejected('instruction', request({ instruction: instruction({ lessonId: 'revived-rule-id' }), suite }));
    assert.deepEqual(await snapshot(file), before);
  }
  assert.deepEqual((await ok('status')).counts, emptyExperienceCounts);
  assert.equal(JSON.parse(before.bytes).state.lessons[input.instruction.lessonId].state, 'quarantined');
});
