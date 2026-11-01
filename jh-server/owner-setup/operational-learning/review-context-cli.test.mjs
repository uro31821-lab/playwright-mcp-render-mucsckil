import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createState, addLesson, evaluateLesson, ingest, propose } from './engine.mjs';
import { bindRegression, runRegression } from './regression.mjs';
import { evaluateConstraints } from './constraints.mjs';
import { prepareRuleUse } from './rule-usage.mjs';
import { observeTask } from './host-observations.mjs';
import { FileLearningStore } from './store.mjs';
import { execute } from './cli.mjs';

// Real CLI processes and isolated synthetic owner stores only. These records
// are fixtures, not operational learning, actual approvals or improvement proof.
const CLI = fileURLToPath(new URL('./cli.mjs', import.meta.url));
const OWNER = 'synthetic-review-context-cli-owner';
const EVALUATED = '2026-11-01T00:00:00.000Z';
const SCOPE = { domain: 'output', operation: 'summary.format', engine: 'jh-agent',
  context: { platform: 'node', version: 'review-context-v1', environment: 'synthetic-cli-test' } };
const COMMON = { ...SCOPE, domain: 'orchestration', operation: 'learning.scope' };
const RULE = 'synthetic-source-rule';
const SUITE = { id: 'synthetic-source-check', version: '1', cases: [
  { id: 'present', input: { value: { source: 'fixture:checked-source' },
    constraints: [{ path: ['source'], op: 'exists' }] }, expected: { passed: true, failed: [] } },
  { id: 'missing', input: { value: {}, constraints: [{ path: ['source'], op: 'exists' }] },
    expected: { passed: false, failed: [0] } },
] };
const clone = value => structuredClone(value);
const at = minutes => new Date(Date.parse(EVALUATED) + minutes * 60000).toISOString();

async function fixture() {
  const lesson = bindRegression({ id: RULE, ...clone(COMMON), ruleVersion: '1',
    guidance: 'Preserve the checked source of the synthetic output.',
    evidenceRefs: ['fixture:synthetic-source-rule'], provenance: 'user_explicit' }, SUITE);
  const checked = await runRegression(lesson, SUITE, evaluateConstraints, { now: EVALUATED });
  let state = evaluateLesson(addLesson(createState(), lesson), RULE, checked.evaluation);
  const records = {};
  for (const [index, id, taskId, attemptId] of [
    [0, 'old', 'task-a', 'attempt-old'],
    [1, 'selected', 'task-a', 'attempt-current'],
    [2, 'independent', 'task-b', 'attempt-current'],
  ]) {
    const minute = index * 10 + 1;
    const selection = prepareRuleUse(state, { taskId, attemptId, lessonId: RULE,
      scope: clone(SCOPE), globalRecall: clone(COMMON) }, { now: at(minute) }).selection;
    const useRef = 'source:synthetic-use-' + id;
    const observationRef = 'source:synthetic-observation-use-' + id;
    const original = observeTask(state, { taskId, attemptId, observationRef, scope: clone(SCOPE),
      expectedRevision: state.revision, observation: { timestamp: at(minute + 2), outcome: 'observed', source: 'host_verified',
        evidenceRefs: [observationRef, useRef, 'artifact:synthetic-applied-' + id],
        ruleUses: [{ useRef, selection, appliedAt: at(minute + 1),
          evidenceRefs: [useRef, 'artifact:synthetic-applied-' + id], confirmation: 'applied_in_this_attempt' }] } }, { now: at(minute + 2) });
    const resultRef = 'source:synthetic-observation-result-' + id;
    const result = observeTask(original.state, { taskId, attemptId, observationRef: resultRef, scope: clone(SCOPE),
      expectedRevision: original.state.revision, observation: { timestamp: at(minute + 3), outcome: 'failure_verified',
        source: 'host_verified', errorCode: 'SYNTHETIC_SOURCE_MISSING',
        evidenceRefs: [resultRef, 'artifact:synthetic-result-' + id] } }, { now: at(minute + 3) });
    state = result.state;
    records[id] = { taskId, attemptId, useRef, selection, usageEventId: original.event.eventId, resultEventId: result.event.eventId };
  }
  const proposalId = Object.values(state.proposals).find(item => item.kind === 'rule_fix').id;
  return { state, proposalId, records };
}

function noUsageFixture() {
  let state = createState();
  for (const id of ['a', 'b']) state = ingest(state, { eventId: 'synthetic-legacy-' + id,
    taskId: 'synthetic-task-' + id, attemptId: 'synthetic-attempt', sequence: 1,
    timestamp: at(1), ...clone(SCOPE), outcome: 'failure_verified', source: 'host_verified',
    evidenceRefs: ['fixture:synthetic-result-' + id], errorCode: 'SYNTHETIC_SOURCE_MISSING' }).state;
  state = propose(state, { now: at(1) }).state;
  return { state, proposalId: Object.keys(state.proposals)[0] };
}

async function setup(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'jh-review-context-cli-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'private', 'memory.json');
  const flags = ['--store', file, '--owner', OWNER];
  const store = new FileLearningStore({ file, ownerScope: OWNER });
  const run = (command, input, { revision, owner = OWNER } = {}) => new Promise((resolve, reject) => {
    const args = [CLI, command, '--store', file, '--owner', owner];
    if (revision !== undefined) args.push('--revision', String(revision));
    const child = spawn(process.execPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Synthetic review-context CLI timed out')); }, 20000);
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
  return { directory, file, flags, ok, rejected, seed: state => store.transact(() => state) };
}

async function snapshot(file) {
  const [bytes, info] = await Promise.all([readFile(file, 'utf8'), stat(file, { bigint: true })]);
  return { bytes, inode: info.ino, modified: info.mtimeNs };
}

function candidateReview(packet) {
  return { proposalId: packet.proposal.id, baseRevision: packet.baseRevision,
    packetFingerprint: packet.packetFingerprint, maxAttempts: packet.maxAttempts,
    lessonId: 'synthetic-reviewed-followup', ruleVersion: '1', scope: clone(SCOPE), reviewer: 'agent',
    cause: 'The synthetic current failures require another source-handling review.',
    resolution: 'Inspect the current result before considering a changed rule.',
    expectedEffect: 'This is an unverified intended improvement.',
    guidance: 'Inspect the existing checked source and current result before changing the output.',
    eventIds: packet.attempts.map(item => item.eventId) };
}

test('CLI review-context rejects missing proposals and malformed requests without creating a store', async t => {
  const { directory, rejected } = await setup(t);
  for (const input of [undefined, {}, null, [], { proposalId: 'missing-proposal' },
    { proposalId: 'missing-proposal', packet: {} }, { proposalId: 'missing-proposal', query: SCOPE }]) {
    await rejected('review-context', input);
  }
  await rejected('review-context', { proposalId: 'missing-proposal' }, { revision: 0 });
  assert.deepEqual(await readdir(directory), []);
});

test('CLI review-context preserves the exact old review packet and binds archived uses only to selected current attempts', async t => {
  const { file, ok, seed } = await setup(t); const { state, proposalId, records } = await fixture(); await seed(state);
  const before = await snapshot(file);
  const packet = await ok('review', { proposalId, maxAttempts: 2 });
  const combined = await ok('review-context', { proposalId, maxAttempts: 2 });
  assert.equal(combined.schema, 'jh.learning-review-context.v1');
  assert.deepEqual(combined.packet, packet);
  assert.equal(combined.readOnly, true); assert.equal(combined.advisoryOnly, true);
  assert.equal(combined.externalEffects, false); assert.equal(combined.replayAllowed, false);
  assert.deepEqual(new Set(packet.attempts.map(item => item.eventId)), new Set([records.selected.resultEventId, records.independent.resultEventId]));
  assert.equal(packet.attempts.some(item => Object.hasOwn(item, 'ruleUses')), false);
  const sidecar = combined.ruleUseEvidence;
  assert.equal(sidecar.schema, 'jh.learning-review-rule-use-evidence.v1');
  assert.equal(sidecar.coverage, 'visible_packet_attempts');
  assert.equal(sidecar.baseRevision, state.revision); assert.equal(sidecar.reviewPacketFingerprint, packet.packetFingerprint);
  assert.equal(sidecar.selectedResultCount, 2);
  assert.deepEqual(sidecar.totals, { recordedUses: 2, precedingUses: 2, nonPrecedingUses: 0,
    resultsWithUses: 2, resultsWithPrecedingUses: 2 });
  assert.equal(sidecar.sourceAuthentication, 'host_attestation'); assert.equal(sidecar.historicalOnly, true);
  for (const key of ['independentApplicationVerified', 'preActionTimingVerified', 'causalEffectVerified',
    'liveImprovementVerified', 'currentSelectionVerified']) assert.equal(sidecar[key], false);
  const evidenceText = JSON.stringify(sidecar);
  for (const id of ['selected', 'independent']) {
    const row = sidecar.items.find(item => item.resultEventId === records[id].resultEventId);
    assert.equal(row.taskId, records[id].taskId); assert.equal(row.attemptId, records[id].attemptId);
    assert.deepEqual(row.scope, SCOPE);
    assert.equal(row.precedingUses.total, 1); assert.equal(row.precedingUses.omitted, 0);
    const usage = row.precedingUses.items[0];
    assert.equal(usage.recordedEventId, records[id].usageEventId);
    assert.equal(usage.lessonId, RULE); assert.equal(usage.definitionFingerprint, records[id].selection.definitionFingerprint);
    assert.equal(usage.definition.status, 'matched');
    assert.equal(usage.definition.source, 'matching_stored_definition');
    assert.equal(usage.definition.guidance, state.lessons[RULE].guidance);
    assert.deepEqual(usage.definition.scope, COMMON);
  }
  assert.equal(evidenceText.includes(records.old.usageEventId), false);
  const one = await ok('review-context', { proposalId, maxAttempts: 1 });
  assert.deepEqual(one.packet.attempts.map(item => item.eventId), [records.independent.resultEventId]);
  assert.deepEqual(one.ruleUseEvidence.items.map(item => item.resultEventId), [records.independent.resultEventId]);
  assert.equal(one.ruleUseEvidence.totals.recordedUses, 1);
  const tiny = await ok('review-context', { proposalId, maxAttempts: 2, usageOptions: { maxChars: 1 } });
  assert.deepEqual(tiny.packet, packet); assert.deepEqual(tiny.ruleUseEvidence.items, []);
  assert.equal(tiny.ruleUseEvidence.omittedResults, 2); assert.deepEqual(tiny.ruleUseEvidence.totals, sidecar.totals);
  assert.deepEqual(await ok('review', { proposalId, maxAttempts: 2 }), packet);
  assert.deepEqual(await snapshot(file), before);
});

test('CLI review-context remains compatible when no rule usage was recorded and budget changes cannot alter the packet', async t => {
  const { file, ok, seed } = await setup(t); const { state, proposalId } = noUsageFixture(); await seed(state);
  const before = await snapshot(file);
  const packet = await ok('review', { proposalId });
  const normal = await ok('review-context', { proposalId });
  const bounded = await ok('review-context', { proposalId, usageOptions: { maxUsesPerResult: 4, maxChars: 1 } });
  assert.deepEqual(normal.packet, packet); assert.deepEqual(bounded.packet, packet);
  assert.equal(normal.packet.packetFingerprint, bounded.packet.packetFingerprint);
  assert.deepEqual(normal.ruleUseEvidence.totals, { recordedUses: 0, precedingUses: 0, nonPrecedingUses: 0,
    resultsWithUses: 0, resultsWithPrecedingUses: 0 });
  assert.deepEqual(await snapshot(file), before);
});

test('CLI historical use survives a changed or missing current definition without substituting its text', async t => {
  const { file, ok, seed } = await setup(t); const { state, proposalId } = await fixture();
  for (const [index, expected] of ['changed', 'missing'].entries()) {
    const history = clone(state); history.revision += index + 1;
    if (expected === 'changed') history.lessons[RULE].guidance = 'Different current text must not describe the historical use.';
    else delete history.lessons[RULE];
    await seed(history); const before = await snapshot(file);
    const wrapped = await ok('review-context', { proposalId, maxAttempts: 2 });
    assert.equal(wrapped.ruleUseEvidence.totals.precedingUses, 2);
    for (const row of wrapped.ruleUseEvidence.items) for (const usage of row.precedingUses.items) {
      assert.equal(usage.definition.status, expected);
      assert.equal(Object.hasOwn(usage.definition, 'guidance'), false);
    }
    assert.deepEqual(await snapshot(file), before);
  }
});

test('CLI review-context rejects clocks, external packets, unsupported budgets and wrong owners without changing files', async t => {
  const { file, ok, rejected, seed } = await setup(t); const { state, proposalId } = await fixture(); await seed(state);
  const before = await snapshot(file);
  for (const extra of [
    { now: at(1) }, { packet: {} }, { query: SCOPE }, { queries: [SCOPE] }, { thresholds: {} },
    { expectedRevision: state.revision }, { note: 'PRIVATE_SYNTHETIC_SOURCE' },
    { maxAttempts: 0 }, { maxAttempts: 33 }, { usageOptions: null }, { usageOptions: [] },
    { usageOptions: { now: at(1) } }, { usageOptions: { maxUsesPerResult: 0 } },
    { usageOptions: { maxUsesPerResult: 5 } }, { usageOptions: { maxChars: 0 } },
    { usageOptions: { maxChars: 32769 } }, { usageOptions: { seenNoticeFingerprints: [] } },
  ]) await rejected('review-context', { proposalId, ...extra });
  await rejected('review-context', { proposalId }, { revision: state.revision });
  await rejected('review-context', { proposalId }, { owner: 'another-owner' }, 'LEARNING_STORE_SCOPE_MISMATCH');
  await rejected('review', { proposalId, usageOptions: {} });
  assert.deepEqual((await ok('status')).counts,
    Object.fromEntries(['events', 'attempts', 'lessons', 'proposals'].map(key => [key, Object.keys(state[key]).length])));
  assert.deepEqual(await snapshot(file), before);
  assert.deepEqual(await readdir(path.dirname(file)), ['memory.json']);
});

test('CLI candidate and decision handoff use only original packet fingerprints and current result identities', async t => {
  const { file, ok, rejected, seed } = await setup(t); const { state, proposalId, records } = await fixture(); await seed(state);
  const wrapped = await ok('review-context', { proposalId, maxAttempts: 2 });
  const before = await snapshot(file); const review = candidateReview(wrapped.packet);
  const prepared = await ok('curate', { review, suite: SUITE });
  assert.equal(prepared.lesson.state, 'candidate');
  assert.deepEqual(prepared.reviewSummary.sourceEventIds, [...review.eventIds].sort());
  await rejected('curate', { review: { ...review, packetFingerprint: wrapped.ruleUseEvidence.fingerprint }, suite: SUITE });
  await rejected('curate', { review: { ...review, eventIds: [records.selected.usageEventId] }, suite: SUITE });
  const decision = { proposalId, decisionId: 'synthetic-review-context-decision', decision: 'accept',
    expectedRevision: state.revision, packetFingerprint: wrapped.packet.packetFingerprint,
    maxAttempts: wrapped.packet.maxAttempts, reviewer: 'agent', sourceRef: 'source:synthetic-review-context-decision',
    reason: 'Review the current synthetic results with their separate usage history.', eventIds: review.eventIds };
  await rejected('decide', { ...decision, packetFingerprint: wrapped.ruleUseEvidence.fingerprint });
  await rejected('decide', { ...decision, eventIds: [records.selected.usageEventId] });
  assert.deepEqual(await snapshot(file), before);
  const accepted = await ok('decide', decision);
  assert.equal(accepted.proposal.status, 'accepted');
  assert.deepEqual(new Set(accepted.receipt.eventIds), new Set(review.eventIds));
  assert.equal(accepted.activatedByThisCall, false); assert.equal(accepted.liveExecutionVerified, false);
});

test('execute review-context reads one snapshot and rejects executable input without running it', async t => {
  const { file, flags, seed } = await setup(t); const { state, proposalId } = await fixture(); await seed(state);
  const before = await snapshot(file); const originalRead = FileLearningStore.prototype.read;
  let reads = 0, executions = 0;
  FileLearningStore.prototype.read = async function () { reads++; return reads === 1 ? clone(state) : createState(); };
  try {
    const combined = await execute(['review-context', ...flags], { proposalId });
    assert.equal(reads, 1); assert.equal(combined.packet.baseRevision, state.revision);
    assert.equal(combined.ruleUseEvidence.baseRevision, state.revision);
    assert.equal(combined.ruleUseEvidence.reviewPacketFingerprint, combined.packet.packetFingerprint);
    reads = 0;
    await assert.rejects(execute(['review-context', ...flags, '--revision', String(state.revision)], { proposalId }), TypeError);
    assert.equal(reads, 0);
    const getter = { get maxChars() { executions++; return 12000; } };
    const proxy = new Proxy({}, { ownKeys() { executions++; return []; } });
    for (const usageOptions of [undefined, getter, proxy, { maxChars: () => { executions++; } }]) {
      reads = 0;
      await assert.rejects(execute(['review-context', ...flags], { proposalId, usageOptions }), TypeError);
    }
    const inputGetter = { get proposalId() { executions++; return proposalId; } };
    reads = 0;
    await assert.rejects(execute(['review-context', ...flags], inputGetter), TypeError);
    assert.equal(executions, 0);
  } finally { FileLearningStore.prototype.read = originalRead; }
  assert.deepEqual(await snapshot(file), before);
});
