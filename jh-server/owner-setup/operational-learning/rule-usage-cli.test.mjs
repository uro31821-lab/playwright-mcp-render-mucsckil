import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Real CLI processes, isolated synthetic stores, no operational memory or actions.
const CLI = fileURLToPath(new URL('./cli.mjs', import.meta.url));
const OWNER = 'synthetic-rule-usage-owner';
const SCOPE = { domain: 'output', operation: 'summary.format', engine: 'jh-agent',
  context: { platform: 'chatgpt', version: 'operational-learning-v1', environment: 'synthetic-rule-usage' } };
const COMMON = { ...SCOPE, domain: 'orchestration', operation: 'learning.scope' };
const SUITE = { id: 'synthetic-usage-source', version: '1', evaluator: 'jh.constraints.v1', cases: [
  { id: 'source-present', input: { value: { source: 'fixture:checked-source' },
    constraints: [{ path: ['source'], op: 'exists' }] }, expected: { passed: true, failed: [] } },
  { id: 'missing-source-detected', input: { value: {},
    constraints: [{ path: ['source'], op: 'exists' }] }, expected: { passed: false, failed: [0] } },
] };
const prepareInput = (overrides = {}) => ({ taskId: 'synthetic-task', attemptId: 'synthetic-attempt',
  lessonId: 'summary-source-rule', scope: structuredClone(SCOPE), ...overrides });

async function setup(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'jh-rule-usage-cli-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'private', 'memory.json');
  const run = (command, input, { revision, owner = OWNER } = {}) => new Promise((resolve, reject) => {
    const args = [CLI, command, '--store', file, '--owner', owner];
    if (revision !== undefined) args.push('--revision', String(revision));
    const child = spawn(process.execPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Synthetic rule-use CLI timed out')); }, 20000);
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
    return error;
  };
  const activate = async (id = 'summary-source-rule', scope = SCOPE, guidance = 'Keep the checked source in the summary.') => {
    const saved = await ok('candidate', { lesson: { id, ...scope, guidance,
      ruleVersion: '1', evidenceRefs: ['fixture:synthetic-rule-source'] }, suite: SUITE });
    const result = await ok('check', { lesson: saved.lesson, suite: SUITE });
    assert.equal(result.lessonState, 'active');
    return result;
  };
  return { directory, file, ok, rejected, activate };
}
async function snapshot(file) {
  const [bytes, info] = await Promise.all([readFile(file, 'utf8'), stat(file, { bigint: true })]);
  return { bytes, inode: info.ino, modified: info.mtimeNs };
}
function usage(selection, overrides = {}) {
  return { useRef: 'source:synthetic-rule-application', selection,
    appliedAt: new Date().toISOString(), confirmation: 'applied_in_this_attempt',
    evidenceRefs: ['source:synthetic-rule-application', 'artifact:synthetic-summary-with-source'], ...overrides };
}
function observation(revision, ruleUses, { suffix = 'observed', outcome = 'observed' } = {}) {
  const observationRef = 'source:synthetic-result-' + suffix;
  return { taskId: 'synthetic-task', attemptId: 'synthetic-attempt', observationRef,
    expectedRevision: revision, scope: structuredClone(SCOPE), observation: {
      timestamp: new Date().toISOString(), outcome, source: 'host_verified',
      evidenceRefs: [...new Set([observationRef, 'artifact:synthetic-result-' + suffix,
        ...(ruleUses ?? []).flatMap(item => item.evidenceRefs)])],
      ...(ruleUses === undefined ? {} : { ruleUses }),
    } };
}

test('CLI usage preparation is owner-bound and read-only, including missing-store and malformed inputs', async t => {
  const { directory, file, ok, rejected, activate } = await setup(t);
  await rejected('usage-prepare', prepareInput());
  assert.deepEqual(await readdir(directory), []);
  await activate();
  const before = await snapshot(file);
  const start = Date.now();
  const prepared = await ok('usage-prepare', prepareInput());
  assert.equal(prepared.schema, 'jh.learning-rule-use-preparation.v1');
  assert.equal(prepared.readOnly, true); assert.equal(prepared.usageRecorded, false);
  assert.equal(prepared.externalEffects, false); assert.equal(prepared.sourceAuthentication, 'host_attestation');
  for (const flag of ['preActionTimingVerified', 'applicationVerified', 'liveImprovementVerified']) assert.equal(prepared[flag], false);
  assert.ok(Date.parse(prepared.selection.selectedAt) >= start);
  assert.ok(Date.parse(prepared.selection.selectedAt) <= Date.now());
  assert.equal(prepared.selection.taskId, 'synthetic-task');
  assert.equal(prepared.selection.attemptId, 'synthetic-attempt');
  assert.equal(prepared.selection.lessonId, 'summary-source-rule');
  for (const key of ['inputFingerprint', 'definitionFingerprint', 'evaluationFingerprint', 'recallFingerprint', 'fingerprint']) {
    assert.match(prepared.selection[key], /^[a-f0-9]{64}$/);
  }
  const context = await ok('context', { query: SCOPE, options: { now: prepared.selection.selectedAt } });
  assert.equal(prepared.selection.recallFingerprint, context.fingerprint);
  const malformed = [null, {}, [], { ...prepareInput(), options: { now: '2020-01-01T00:00:00Z' } },
    { ...prepareInput(), query: SCOPE }, { ...prepareInput(), queries: [SCOPE, COMMON] },
    { ...prepareInput(), expectedRevision: prepared.selection.revision },
    { ...prepareInput(), note: 'PRIVATE_SYNTHETIC_SOURCE' }];
  for (const input of malformed) await rejected('usage-prepare', input);
  await rejected('usage-prepare', prepareInput(), { revision: prepared.selection.revision });
  await rejected('usage-prepare', prepareInput(), { owner: 'different-owner' }, 'LEARNING_STORE_SCOPE_MISMATCH');
  assert.deepEqual(await snapshot(file), before);
  assert.deepEqual((await ok('status')).counts, { events: 0, attempts: 0, lessons: 1, proposals: 0 });
});

test('CLI attaches actual-use attestation to one observation and retains its link to a later verified outcome', async t => {
  const { file, ok, activate } = await setup(t);
  await activate();
  const prepared = await ok('usage-prepare', prepareInput());
  const used = usage(prepared.selection);
  const input = observation(prepared.selection.revision, [used]);
  const first = await ok('observe', input);
  assert.equal(first.recorded, true); assert.equal(first.duplicate, false);
  assert.deepEqual(first.event.ruleUses, [used]);
  assert.equal(Object.hasOwn(first.event, 'labels'), false);
  assert.deepEqual((await ok('status')).counts, { events: 1, attempts: 1, lessons: 1, proposals: 0 });
  const completed = await ok('observe', observation(first.revision, undefined, { suffix: 'verified', outcome: 'success_verified' }));
  assert.equal(completed.event.outcome, 'success_verified');
  assert.equal(Object.hasOwn(completed.event, 'ruleUses'), false);
  const beforeView = await snapshot(file);
  const view = await ok('task-view', { taskId: input.taskId, attemptId: input.attemptId });
  const history = view.attempts[0].ruleUses;
  assert.equal(history.total, 1); assert.equal(history.omitted, 0); assert.equal(history.items.length, 1);
  const item = history.items[0];
  assert.equal(item.useRef, used.useRef); assert.equal(item.recordedEventId, first.event.eventId);
  assert.equal(item.result.eventId, completed.event.eventId); assert.equal(item.result.outcome, 'success_verified');
  assert.equal(item.result.afterUse, true); assert.equal(item.result.verified, true);
  assert.equal(item.sourceAuthentication, 'host_attestation');
  assert.equal(item.applicationVerified, false); assert.equal(item.liveImprovementVerified, false);
  assert.equal(item.preActionTimingVerified, false);
  const duplicate = await ok('observe', input);
  assert.equal(duplicate.duplicate, true); assert.equal(duplicate.recorded, false);
  assert.equal(duplicate.current.ruleUses.total, 1);
  assert.equal(duplicate.current.projection.eventId, completed.event.eventId);
  assert.deepEqual(await snapshot(file), beforeView);
  assert.deepEqual((await ok('status')).counts, { events: 2, attempts: 1, lessons: 1, proposals: 0 });
});

test('CLI common rule selection stays within the actual operation and matching host binding', async t => {
  const { file, ok, rejected, activate } = await setup(t);
  await activate('common-source-rule', COMMON, 'Preserve the provenance of every result.');
  const before = await snapshot(file);
  await rejected('usage-prepare', prepareInput({ lessonId: 'common-source-rule' }));
  const prepared = await ok('usage-prepare', prepareInput({ lessonId: 'common-source-rule', globalRecall: COMMON }));
  const context = await ok('context', { queries: [COMMON, SCOPE], options: { now: prepared.selection.selectedAt } });
  assert.equal(prepared.selection.recallFingerprint, context.fingerprint);
  assert.deepEqual(prepared.selection.scope, SCOPE); assert.deepEqual(prepared.selection.globalRecall, COMMON);
  for (const globalRecall of [SCOPE, { ...COMMON, operation: 'other.common' }, { ...COMMON, engine: 'other-agent' },
    { ...COMMON, context: { ...COMMON.context, environment: 'other-environment' } }]) {
    await rejected('usage-prepare', prepareInput({ lessonId: 'common-source-rule', globalRecall }));
  }
  await rejected('usage-prepare', prepareInput({ lessonId: 'common-source-rule', globalRecall: COMMON, options: { maxChars: 1 } }));
  assert.deepEqual(await snapshot(file), before);
});

test('CLI rejects changed retries and reused application references without adding events', async t => {
  const { file, ok, rejected, activate } = await setup(t);
  await activate();
  const prepared = await ok('usage-prepare', prepareInput());
  const input = observation(prepared.selection.revision, [usage(prepared.selection)]);
  const recorded = await ok('observe', input);
  const before = await snapshot(file);
  const changed = structuredClone(input);
  changed.observation.ruleUses[0].evidenceRefs.push('artifact:synthetic-different-use');
  changed.observation.evidenceRefs.push('artifact:synthetic-different-use');
  await rejected('observe', changed, undefined, 'LEARNING_OBSERVATION_CONFLICT');
  const reused = observation(recorded.revision, input.observation.ruleUses, { suffix: 'another-result' });
  await rejected('observe', reused);
  assert.deepEqual(await snapshot(file), before);
  assert.deepEqual((await ok('status')).counts, { events: 1, attempts: 1, lessons: 1, proposals: 0 });
});

test('CLI rejects unconfirmed, stale, future and mismatched usage without losing an independently recorded result', async t => {
  const { file, ok, rejected, activate } = await setup(t);
  await activate();
  const prepared = await ok('usage-prepare', prepareInput());
  const used = usage(prepared.selection);
  const valid = observation(prepared.selection.revision, [used], { outcome: 'success_verified' });
  const before = await snapshot(file);
  const variants = [];
  const noConfirmation = structuredClone(valid); delete noConfirmation.observation.ruleUses[0].confirmation; variants.push(noConfirmation);
  const task = structuredClone(valid); task.taskId = 'different-task'; variants.push(task);
  const scope = structuredClone(valid); scope.scope.operation = 'other.operation'; variants.push(scope);
  const unboundEvidence = structuredClone(valid); unboundEvidence.observation.evidenceRefs = [valid.observationRef, 'artifact:synthetic-result']; variants.push(unboundEvidence);
  const identityOnly = structuredClone(valid);
  identityOnly.observation.ruleUses[0].evidenceRefs = [used.useRef];
  identityOnly.observation.evidenceRefs = [valid.observationRef, used.useRef];
  variants.push(identityOnly);
  const future = structuredClone(valid); future.observation.timestamp = new Date(Date.now() + 86400000).toISOString(); variants.push(future);
  const stale = structuredClone(valid); stale.expectedRevision = 0; variants.push(stale);
  for (const input of variants) await rejected('observe', input);
  assert.deepEqual(await snapshot(file), before);
  const resultOnly = structuredClone(valid); delete resultOnly.observation.ruleUses;
  resultOnly.observation.evidenceRefs = [valid.observationRef, 'artifact:synthetic-independent-verified-result'];
  const result = await ok('observe', resultOnly);
  assert.equal(result.event.outcome, 'success_verified'); assert.equal(Object.hasOwn(result.event, 'ruleUses'), false);
  assert.deepEqual((await ok('status')).counts, { events: 1, attempts: 1, lessons: 1, proposals: 0 });
});
