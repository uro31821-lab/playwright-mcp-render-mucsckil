import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execute } from './cli.mjs';
import { FileLearningStore } from './store.mjs';
import { createState, ingest, propose, setProposalStatus } from './engine.mjs';

// Synthetic owner and temporary files only. These tests never access operational memory.
const CLI = fileURLToPath(new URL('./cli.mjs', import.meta.url));
const OWNER = 'synthetic-proposal-context-cli-owner';
const NOW = '2026-11-01T01:00:00.000Z';
const SCOPE = { domain: 'output', operation: 'summary.format', engine: 'jh-agent',
  context: { platform: 'node', version: 'proposal-context-v1', environment: 'synthetic' } };
const COMMON = { ...SCOPE, domain: 'orchestration', operation: 'learning.scope' };
const RESEARCH = { ...SCOPE, domain: 'research', operation: 'source.check' };

function observation(id, revision, overrides = {}) {
  const reference = 'source:synthetic-observation-' + id;
  return { taskId: 'task-' + id, attemptId: 'attempt-' + id, observationRef: reference,
    scope: structuredClone(SCOPE), expectedRevision: revision,
    observation: { timestamp: NOW, outcome: 'failure_verified', source: 'host_verified',
      evidenceRefs: [reference, 'fixture:result-' + id], errorCode: 'OUTPUT_SOURCE_MISSING' }, ...overrides };
}

function rawEvent(id, scope = SCOPE, overrides = {}) {
  return { eventId: 'event-' + id, taskId: 'task-' + id, attemptId: 'attempt-' + id,
    sequence: 1, timestamp: NOW, ...structuredClone(scope), outcome: 'failure_verified',
    source: 'host_verified', evidenceRefs: ['fixture:source-' + id], errorCode: 'OUTPUT_SOURCE_MISSING', ...overrides };
}

function addPair(state, id, scope = SCOPE, overrides = {}) {
  for (const suffix of ['a', 'b']) state = ingest(state,
    rawEvent(id + '-' + suffix, scope, { errorCode: 'ERROR_' + id, ...overrides })).state;
  return state;
}

async function setup(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'jh-proposal-context-cli-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'private', 'memory.json');
  const flags = ['--store', file, '--owner', OWNER];
  const store = new FileLearningStore({ file, ownerScope: OWNER });
  const run = (command, input) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, command, ...flags], { stdio: ['pipe', 'pipe', 'pipe'] });
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Synthetic CLI timed out')); }, 20000);
    timeout.unref();
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', value => { stdout += value; });
    child.stderr.on('data', value => { stderr += value; });
    child.on('error', error => { clearTimeout(timeout); reject(error); });
    child.on('close', (code, signal) => { clearTimeout(timeout); resolve({ code, signal, stdout, stderr }); });
    child.stdin.on('error', error => { clearTimeout(timeout); reject(error); });
    child.stdin.end(JSON.stringify(input));
  });
  const ok = async (command, input) => {
    const result = await run(command, input);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.signal, null); assert.equal(result.stderr, '');
    return JSON.parse(result.stdout);
  };
  const seed = state => store.transact(() => state);
  return { directory, file, flags, store, run, ok, seed };
}

async function snapshot(file) {
  const [bytes, info] = await Promise.all([readFile(file, 'utf8'), stat(file, { bigint: true })]);
  return { bytes, inode: info.ino, modified: info.mtimeNs };
}

test('CLI optional proposal context reads an absent store without creating files and preserves legacy output', async t => {
  const { directory, ok } = await setup(t);
  const legacy = await ok('context', { query: SCOPE });
  assert.equal(Object.hasOwn(legacy, 'proposalContext'), false);
  const combined = await ok('context', { query: SCOPE, proposals: {} });
  const { proposalContext, ...advice } = combined;
  assert.deepEqual(advice, legacy);
  assert.equal(proposalContext.schema, 'jh.learning-proposal-context.v1');
  assert.equal(proposalContext.revision, 0);
  assert.deepEqual(proposalContext.items, []);
  assert.equal(proposalContext.omitted, 0); assert.equal(proposalContext.suppressed, 0);
  assert.equal(proposalContext.readOnly, true); assert.equal(proposalContext.externalEffects, false);
  assert.match(proposalContext.fingerprint, /^[a-f0-9]{64}$/);
  assert.deepEqual(await readdir(directory), []);
});

test('a lost successful observe response is recoverable through scoped context after an exact stale retry', async t => {
  const { file, ok } = await setup(t);
  const first = await ok('observe', observation('first', 0));
  const original = observation('second', first.revision);
  // The caller may lose this successful response. Only persisted memory is used below.
  await ok('observe', original);
  const before = await snapshot(file);
  const repeated = await ok('observe', original);
  assert.equal(repeated.duplicate, true); assert.equal(repeated.recorded, false);
  assert.deepEqual(repeated.newProposals, []); assert.equal(repeated.newProposalsOmitted, 0);
  const legacy = await ok('context', { queries: [COMMON, SCOPE] });
  const recovered = await ok('context', { queries: [COMMON, SCOPE], proposals: {} });
  const { proposalContext, ...advice } = recovered;
  assert.deepEqual(advice, legacy);
  assert.equal(proposalContext.revision, repeated.revision);
  assert.equal(proposalContext.items.length, 1);
  const item = proposalContext.items[0];
  assert.equal(item.kind, 'rule_fix'); assert.equal(item.independentTaskCount, 2);
  assert.deepEqual(item.scope, SCOPE); assert.equal(item.status, 'open');
  assert.equal(item.advisoryOnly, true); assert.equal(item.externalEffects, false);
  assert.match(item.noticeFingerprint, /^[a-f0-9]{64}$/);
  assert.deepEqual(await snapshot(file), before);
});

test('new host observation delivers only its scoped proposal while unrelated proposals remain stored and recoverable', async t => {
  const { file, ok, seed, store } = await setup(t);
  let state = addPair(createState(), 'research', RESEARCH);
  state = addPair(state, 'output');
  await seed(state); // Import actual-shaped synthetic history without computing its proposals yet.
  const recorded = await ok('observe', observation('trigger', state.revision, {
    observation: { timestamp: NOW, outcome: 'observed', source: 'host_verified',
      evidenceRefs: ['source:synthetic-observation-trigger'] },
  }));
  assert.equal(recorded.newProposals.length, 1);
  assert.deepEqual(recorded.newProposals[0].scope, SCOPE);
  assert.equal(recorded.newProposalsOmitted, 0);
  assert.equal(Object.keys((await store.read()).proposals).length, 2);
  const before = await snapshot(file);
  const output = await ok('context', { query: SCOPE, proposals: { limit: 1 } });
  assert.equal(output.proposalContext.items.length, 1);
  assert.equal(output.proposalContext.omitted, 0);
  assert.equal(output.proposalContext.items[0].id, recorded.newProposals[0].id);
  const research = await ok('context', { query: RESEARCH, proposals: { limit: 1 } });
  assert.equal(research.proposalContext.items.length, 1);
  assert.deepEqual(research.proposalContext.items[0].scope, RESEARCH);
  assert.deepEqual(await snapshot(file), before);
});

test('proposal delivery budgets and conversation checkpoints do not hide later relevant items or write delivery state', async t => {
  const { file, ok, seed, store } = await setup(t);
  let state = createState();
  for (let index = 0; index < 4; index++) state = addPair(state, 'output' + index);
  state = addPair(state, 'unrelated', RESEARCH);
  await seed(state);
  const recorded = await ok('observe', observation('bounded-trigger', state.revision, {
    observation: { timestamp: NOW, outcome: 'observed', source: 'host_verified',
      evidenceRefs: ['source:synthetic-observation-bounded-trigger'] },
  }));
  assert.equal(recorded.newProposals.length, 3);
  assert.equal(recorded.newProposalsOmitted, 1);
  assert.equal(Object.keys((await store.read()).proposals).length, 5);
  const before = await snapshot(file);
  const visible = await ok('context', { query: SCOPE, proposals: {} });
  assert.equal(visible.proposalContext.items.length, 3);
  assert.equal(visible.proposalContext.omitted, 1);
  const seen = visible.proposalContext.items.map(item => item.noticeFingerprint);
  const next = await ok('context', { query: SCOPE, proposals: { seenNoticeFingerprints: seen } });
  assert.equal(next.proposalContext.items.length, 1);
  assert.equal(next.proposalContext.suppressed, 3); assert.equal(next.proposalContext.omitted, 0);
  assert.ok(!visible.proposalContext.items.some(item => item.id === next.proposalContext.items[0].id));
  const all = await ok('context', { query: SCOPE, proposals: { limit: 10 } });
  assert.equal(all.proposalContext.items.length, 4);
  const tiny = await ok('context', { query: SCOPE, proposals: { maxChars: 1 } });
  assert.deepEqual(tiny.proposalContext.items, []); assert.equal(tiny.proposalContext.omitted, 4);
  assert.equal(tiny.proposalContext.suppressed, 0);
  assert.deepEqual((await ok('context', { query: SCOPE, proposals: {} })).proposalContext, visible.proposalContext);
  assert.deepEqual(await snapshot(file), before);
});

test('new evidence refreshes a proposal notice while an unrelated revision does not invalidate its checkpoint', async t => {
  const { file, ok } = await setup(t);
  const first = await ok('observe', observation('notice-a', 0));
  const second = await ok('observe', observation('notice-b', first.revision));
  const initial = (await ok('context', { query: SCOPE, proposals: {} })).proposalContext.items[0];
  const unrelated = await ok('observe', observation('notice-research', second.revision, { scope: RESEARCH }));
  const same = await ok('context', { query: SCOPE, proposals: { seenNoticeFingerprints: [initial.noticeFingerprint] } });
  assert.deepEqual(same.proposalContext.items, []); assert.equal(same.proposalContext.suppressed, 1);
  const changed = await ok('observe', observation('notice-c', unrelated.revision));
  assert.deepEqual(changed.newProposals, []);
  const before = await snapshot(file);
  const refreshed = await ok('context', { query: SCOPE, proposals: { seenNoticeFingerprints: [initial.noticeFingerprint] } });
  assert.equal(refreshed.proposalContext.items.length, 1);
  assert.equal(refreshed.proposalContext.items[0].id, initial.id);
  assert.notEqual(refreshed.proposalContext.items[0].noticeFingerprint, initial.noticeFingerprint);
  assert.equal(refreshed.proposalContext.items[0].independentTaskCount, 3);
  assert.equal(refreshed.proposalContext.suppressed, 0);
  assert.deepEqual(await snapshot(file), before);
});

test('CLI proposal context excludes every closed or accepted status and respects learning-evaluation wildcard scope', async t => {
  const { file, ok, seed } = await setup(t);
  let state = createState();
  for (const id of ['open', 'accepted', 'dismissed', 'implemented', 'verified']) state = addPair(state, id);
  const alternate = { ...SCOPE, operation: 'summary.spelling' };
  for (const [id, scope, holdout] of [['train-a', SCOPE, false], ['train-b', alternate, false],
    ['train-c', SCOPE, false], ['holdout', SCOPE, true]]) {
    state = ingest(state, rawEvent(id, scope, { errorCode: 'TRAINING_FAILURE',
      labels: { reviewed: true, ruleRemediationTried: !holdout, holdout } })).state;
  }
  state = ingest(state, rawEvent('unknown', SCOPE, { outcome: 'completion_unknown' })).state;
  state = propose(state, { now: NOW }).state;
  for (const status of ['accepted', 'dismissed', 'implemented', 'verified']) {
    const item = Object.values(state.proposals).find(proposal => proposal.evidenceRefs.includes('fixture:source-' + status + '-a'));
    assert.ok(item);
    state = setProposalStatus(state, item.id, status === 'dismissed' ? 'dismissed' : 'accepted');
    if (['implemented', 'verified'].includes(status)) state = setProposalStatus(state, item.id, 'implemented');
    if (status === 'verified') state = setProposalStatus(state, item.id, 'verified', {
      passed: 1, failed: 0, skipped: 0, evidenceRefs: ['fixture:synthetic-verification'], timestamp: NOW });
  }
  state = ingest(state, rawEvent('unknown-result', SCOPE, { taskId: 'task-unknown', attemptId: 'attempt-unknown',
    sequence: 2, outcome: 'success_verified' })).state;
  state = propose(state, { now: NOW }).state;
  assert.ok(Object.values(state.proposals).some(item => item.status === 'resolved'));
  await seed(state);
  const before = await snapshot(file);
  const result = await ok('context', { queries: [COMMON, SCOPE], proposals: { limit: 10 } });
  const expected = Object.values(state.proposals).filter(item => item.status === 'open').map(item => item.id).sort();
  assert.deepEqual(result.proposalContext.items.map(item => item.id).sort(), expected);
  const wildcard = result.proposalContext.items.find(item => item.kind === 'learning_evaluation');
  assert.ok(wildcard); assert.equal(wildcard.scope.operation, '*');
  const otherOperation = await ok('context', { query: alternate, proposals: {} });
  assert.deepEqual(otherOperation.proposalContext.items.map(item => item.id), [wildcard.id]);
  const otherEngine = await ok('context', { query: { ...SCOPE, engine: 'different-engine' }, proposals: {} });
  assert.deepEqual(otherEngine.proposalContext.items, []);
  const otherDomain = await ok('context', { query: RESEARCH, proposals: {} });
  assert.deepEqual(otherDomain.proposalContext.items, []);
  assert.deepEqual(await snapshot(file), before);
});

test('malformed proposal options and ambiguous context requests fail without changing memory or echoing input', async t => {
  const { file, run, seed } = await setup(t);
  await seed(propose(addPair(createState(), 'malformed'), { now: NOW }).state);
  const before = await snapshot(file);
  const invalidOptions = [null, true, [], { limit: 0 }, { limit: 11 }, { maxChars: 0 }, { maxChars: 16385 },
    { now: NOW }, { arbitrary: 'PRIVATE_INPUT_MUST_NOT_LEAK' }, { seenNoticeFingerprints: 'not-array' },
    { seenNoticeFingerprints: ['not-a-fingerprint'] }, { seenNoticeFingerprints: ['a'.repeat(64), 'a'.repeat(64)] }];
  const invalid = invalidOptions.map(proposals => ({ query: SCOPE, proposals }));
  invalid.push({ query: SCOPE, queries: [COMMON], proposals: {} }, { proposals: {} });
  for (const input of invalid) {
    const result = await run('context', input);
    assert.equal(result.code, 1); assert.equal(result.stdout, '');
    assert.deepEqual(JSON.parse(result.stderr), { ok: false, code: 'LEARNING_INPUT_OR_OPERATION_FAILED' });
  }
  assert.deepEqual(await snapshot(file), before);
});

test('opt-in context uses one snapshot and rejects executable proposal options without invoking them', async t => {
  const { file, flags, seed } = await setup(t);
  await seed(propose(addPair(createState(), 'single-snapshot'), { now: NOW }).state);
  const before = await snapshot(file);
  let reads = 0, executions = 0;
  const originalRead = FileLearningStore.prototype.read;
  FileLearningStore.prototype.read = async function (...args) { reads++; return originalRead.apply(this, args); };
  try {
    const result = await execute(['context', ...flags], { queries: [COMMON, SCOPE], proposals: {} });
    assert.equal(reads, 1);
    assert.equal(result.revision, result.proposalContext.revision);
    const accessor = { get limit() { executions++; return 1; } };
    const proxy = new Proxy({}, { ownKeys() { executions++; return []; } });
    const values = [undefined, accessor, proxy, { seenNoticeFingerprints: [() => { executions++; }] }];
    for (const proposals of values) {
      await assert.rejects(execute(['context', ...flags], { query: SCOPE, proposals }), TypeError);
    }
    assert.equal(executions, 0);
  } finally { FileLearningStore.prototype.read = originalRead; }
  assert.deepEqual(await snapshot(file), before);
});
