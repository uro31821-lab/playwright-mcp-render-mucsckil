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

// Real child processes and isolated synthetic owner stores only. No source here
// is operational memory, a real action, a user approval or a measured improvement.
const CLI = fileURLToPath(new URL('./cli.mjs', import.meta.url));
const OWNER = 'synthetic-candidate-evidence-cli-owner';
const EVALUATED = '2026-11-01T00:00:00.000Z';
const SCOPE = { domain: 'output', operation: 'summary.format', engine: 'jh-agent',
  context: { platform: 'node', version: 'candidate-evidence-v1', environment: 'synthetic-cli-test' } };
const COMMON = { ...SCOPE, domain: 'orchestration', operation: 'learning.scope' };
const RULE = 'synthetic-source-rule';
const CANDIDATE = 'synthetic-reviewed-followup';
const SUITE = { id: 'synthetic-source-check', version: '1', cases: [
  { id: 'present', input: { value: { source: 'fixture:checked-source' },
    constraints: [{ path: ['source'], op: 'exists' }] }, expected: { passed: true, failed: [] } },
  { id: 'missing', input: { value: {}, constraints: [{ path: ['source'], op: 'exists' }] },
    expected: { passed: false, failed: [0] } },
] };
const clone = value => structuredClone(value);
const at = minutes => new Date(Date.parse(EVALUATED) + minutes * 60000).toISOString();
const keyFor = (proposalId, link) => ({ proposalId, ...Object.fromEntries(
  ['lessonId', 'ruleVersion', 'inputFingerprint'].map(key => [key, link[key]])) });

async function fixture() {
  const lesson = bindRegression({ id: RULE, ...clone(COMMON), ruleVersion: '1',
    guidance: 'Preserve the checked source of the synthetic output.',
    evidenceRefs: ['fixture:synthetic-source-rule'], provenance: 'user_explicit' }, SUITE);
  const checked = await runRegression(lesson, SUITE, evaluateConstraints, { now: EVALUATED });
  let state = evaluateLesson(addLesson(createState(), lesson), RULE, checked.evaluation);
  const records = {};
  for (const [index, id] of ['a', 'b'].entries()) {
    const taskId = 'synthetic-task-' + id; const attemptId = 'synthetic-attempt-' + id;
    const uses = []; const minute = index * 10 + 1;
    for (let useIndex = 0; useIndex < 2; useIndex++) {
      const selectedAt = at(minute + useIndex * 2);
      const selection = prepareRuleUse(state, { taskId, attemptId, lessonId: RULE,
        scope: clone(SCOPE), globalRecall: clone(COMMON) }, { now: selectedAt }).selection;
      const useRef = `source:synthetic-use-${id}-${useIndex}`;
      const observationRef = `source:synthetic-observation-use-${id}-${useIndex}`;
      const timestamp = at(minute + useIndex * 2 + 1);
      const original = observeTask(state, { taskId, attemptId, observationRef, scope: clone(SCOPE),
        expectedRevision: state.revision, observation: { timestamp, outcome: 'observed', source: 'host_verified',
          evidenceRefs: [observationRef, useRef, `artifact:synthetic-applied-${id}-${useIndex}`],
          ruleUses: [{ useRef, selection, appliedAt: at(minute + useIndex * 2 + 0.5),
            evidenceRefs: [useRef, `artifact:synthetic-applied-${id}-${useIndex}`], confirmation: 'applied_in_this_attempt' }] } }, { now: timestamp });
      state = original.state; uses.push({ useRef, usageEventId: original.event.eventId, selection });
    }
    const observationRef = 'source:synthetic-result-' + id;
    const timestamp = at(minute + 4);
    const completed = observeTask(state, { taskId, attemptId, observationRef, scope: clone(SCOPE), expectedRevision: state.revision,
      observation: { timestamp, outcome: 'failure_verified', source: 'host_verified', errorCode: 'SYNTHETIC_SOURCE_MISSING',
        evidenceRefs: [observationRef, 'artifact:synthetic-result-' + id] } }, { now: timestamp });
    state = completed.state; records[id] = { taskId, attemptId, resultEventId: completed.event.eventId, uses };
  }
  const proposalId = Object.values(state.proposals).find(item => item.kind === 'rule_fix').id;
  return { state, proposalId, records };
}

async function setup(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'jh-candidate-evidence-cli-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'private', 'memory.json');
  const flags = ['--store', file, '--owner', OWNER];
  const store = new FileLearningStore({ file, ownerScope: OWNER });
  const run = (command, input, { revision, owner = OWNER } = {}) => new Promise((resolve, reject) => {
    const args = [CLI, command, '--store', file, '--owner', owner];
    if (revision !== undefined) args.push('--revision', String(revision));
    const child = spawn(process.execPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Synthetic candidate-evidence CLI timed out')); }, 20000);
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

function reviewFrom(packet) {
  return { proposalId: packet.proposal.id, baseRevision: packet.baseRevision,
    packetFingerprint: packet.packetFingerprint, maxAttempts: packet.maxAttempts,
    lessonId: CANDIDATE, ruleVersion: '1', scope: clone(SCOPE), reviewer: 'agent',
    cause: 'The current synthetic failures justify reviewing source handling.',
    resolution: 'Validate the synthetic source before producing a result.',
    expectedEffect: 'This is an intended effect, not a measured operating improvement.',
    guidance: 'Validate the checked source before formatting the synthetic result.',
    eventIds: packet.attempts.map(item => item.eventId) };
}

async function registered(t) {
  const tools = await setup(t); const source = await fixture(); await tools.seed(source.state);
  const packet = await tools.ok('review', { proposalId: source.proposalId });
  const input = { review: reviewFrom(packet), suite: clone(SUITE) };
  const saved = await tools.ok('curate-register', input);
  const progress = await tools.ok('progress', { proposalId: source.proposalId });
  const link = progress.candidates.find(item => item.link.lessonId === saved.lesson.id).link;
  assert.deepEqual(link, saved.link);
  return { ...tools, ...source, input, saved, link, request: keyFor(source.proposalId, link) };
}

test('CLI candidate-evidence rejects an absent registered link without creating a store', async t => {
  const { directory, rejected } = await setup(t);
  const request = { proposalId: 'missing-proposal', lessonId: 'missing-candidate', ruleVersion: '1', inputFingerprint: 'a'.repeat(64) };
  for (const input of [undefined, null, {}, [], request, { ...request, eventIds: ['arbitrary-event'] }]) {
    await rejected('candidate-evidence', input);
  }
  await rejected('candidate-evidence', request, { revision: 0 });
  assert.deepEqual(await readdir(directory), []);
});

test('CLI candidate-evidence accepts only the actual registered tuple and remains a read-only view', async t => {
  const { file, ok, rejected, request, link, saved, proposalId, records } = await registered(t);
  const before = await snapshot(file);
  const packetBefore = await ok('review', { proposalId });
  const evidence = await ok('candidate-evidence', request);
  assert.equal(evidence.schema, 'jh.learning-candidate-evidence.v1');
  assert.equal(evidence.readOnly, true); assert.equal(evidence.advisoryOnly, true);
  assert.equal(evidence.externalEffects, false); assert.equal(evidence.replayAllowed, false);
  assert.equal(evidence.coverage, 'registered_source_events');
  assert.equal(evidence.derivation, 'derived_from_registered_sources');
  assert.equal(evidence.sourceAuthentication, 'host_attestation'); assert.equal(evidence.historicalOnly, true);
  for (const flag of ['availableAtRegistrationVerified', 'sourceContentAtRegistrationVerified', 'reviewerAcknowledgementVerified',
    'independentApplicationVerified', 'preActionTimingVerified', 'causalEffectVerified', 'liveExecutionVerified',
    'liveImprovementVerified', 'modelTrainingPerformed', 'currentSelectionVerified']) assert.equal(evidence[flag], false);
  assert.equal(evidence.candidate.lessonId, request.lessonId); assert.equal(evidence.candidate.bindingStatus, 'matched');
  assert.equal(evidence.candidate.bindingBasis, 'registered_identity_fields');
  assert.equal(evidence.registration.reviewPacketFingerprint, link.packetFingerprint);
  assert.deepEqual(evidence.registration.sourceEventIds, link.sourceEventIds);
  assert.deepEqual(evidence.registration.regression, link.regression);
  assert.deepEqual(evidence.totals, { registeredSources: 2, availableSources: 2, missingSources: 0,
    recordedUses: 4, precedingUses: 4, nonPrecedingUses: 0, sourcesWithUses: 2, sourcesWithPrecedingUses: 2 });
  for (const record of Object.values(records)) {
    const row = evidence.items.find(item => item.sourceEventId === record.resultEventId);
    assert.equal(row.sourceStatus, 'available'); assert.equal(row.taskId, record.taskId); assert.equal(row.attemptId, record.attemptId);
    assert.deepEqual(row.scope, SCOPE); assert.equal(row.sourceRecord.outcome, 'failure_verified');
    assert.equal(row.currentProjection.eventId, record.resultEventId); assert.equal(row.currentProjection.isRegisteredSource, true);
    assert.equal(row.precedingUses.total, 2); assert.equal(row.precedingUses.items.length, 1); assert.equal(row.precedingUses.omitted, 1);
    const use = row.precedingUses.items[0];
    assert.equal(use.recordedEventId, record.uses[1].usageEventId);
    assert.equal(use.definition.status, 'matched'); assert.deepEqual(use.definition.scope, COMMON);
    assert.equal(use.definitionFingerprint, record.uses[1].selection.definitionFingerprint);
  }
  assert.match(evidence.fingerprint, /^[a-f0-9]{64}$/);
  for (const change of [{ lessonId: RULE }, { ruleVersion: 'different-version' }, { inputFingerprint: 'f'.repeat(64) }]) {
    await rejected('candidate-evidence', { ...request, ...change });
  }
  assert.deepEqual(await ok('review', { proposalId }), packetBefore);
  const after = await ok('progress', { proposalId });
  assert.deepEqual(after.candidates[0].link, link);
  assert.equal(after.candidates[0].lessonState, 'candidate');
  assert.equal(after.candidates[0].evaluation.status, 'not_run');
  assert.equal(after.revision, saved.revision);
  assert.deepEqual(await snapshot(file), before);
});

test('CLI candidate-evidence survives proposal closure and separates the original source from a later current result', async t => {
  const { file, ok, rejected, request, records, proposalId, saved, link } = await registered(t);
  const changed = await ok('observe', { taskId: records.a.taskId, attemptId: records.a.attemptId,
    observationRef: 'source:synthetic-later-success', expectedRevision: saved.revision, scope: clone(SCOPE),
    observation: { timestamp: at(100), outcome: 'success_verified', source: 'host_verified',
      evidenceRefs: ['source:synthetic-later-success', 'artifact:synthetic-later-success'] } });
  const closed = await ok('proposal-status', { id: proposalId, status: 'dismissed' });
  assert.equal(closed.proposal.status, 'dismissed');
  const before = await snapshot(file);
  await rejected('review', { proposalId });
  const evidence = await ok('candidate-evidence', { ...request, options: { maxUsesPerSource: 4 } });
  assert.equal(evidence.currentStatus, 'dismissed');
  assert.deepEqual(evidence.registration.sourceEventIds, link.sourceEventIds);
  const row = evidence.items.find(item => item.sourceEventId === records.a.resultEventId);
  assert.equal(row.sourceRecord.eventId, records.a.resultEventId); assert.equal(row.sourceRecord.outcome, 'failure_verified');
  assert.equal(row.currentProjection.eventId, changed.event.eventId); assert.equal(row.currentProjection.outcome, 'success_verified');
  assert.equal(row.currentProjection.isRegisteredSource, false);
  assert.equal(row.precedingUses.total, 2); assert.equal(row.precedingUses.omitted, 0);
  assert.deepEqual(new Set(row.precedingUses.items.map(item => item.recordedEventId)), new Set(records.a.uses.map(item => item.usageEventId)));
  assert.equal(evidence.availableAtRegistrationVerified, false); assert.equal(evidence.reviewerAcknowledgementVerified, false);
  const progress = await ok('progress', { proposalId });
  assert.equal(progress.currentStatus, 'dismissed'); assert.deepEqual(progress.candidates[0].link, link);
  assert.deepEqual(await snapshot(file), before);
});

test('CLI evidence budgets affect only presentation and retain all source and use counts', async t => {
  const { file, ok, request, link } = await registered(t); const before = await snapshot(file);
  const normal = await ok('candidate-evidence', request);
  const full = await ok('candidate-evidence', { ...request, options: { maxUsesPerSource: 4, maxChars: 32768 } });
  assert.deepEqual(full.registration.sourceEventIds, link.sourceEventIds);
  assert.deepEqual(full.totals, normal.totals);
  for (const row of full.items) {
    assert.equal(row.precedingUses.items.length, 2); assert.equal(row.precedingUses.total, 2); assert.equal(row.precedingUses.omitted, 0);
  }
  const tiny = await ok('candidate-evidence', { ...request, options: { maxChars: 1 } });
  assert.deepEqual(tiny.items, []); assert.equal(tiny.omittedSources, 2);
  assert.deepEqual(tiny.totals, full.totals); assert.deepEqual(tiny.registration, full.registration);
  assert.deepEqual(await snapshot(file), before);
});

test('CLI candidate-evidence rejects arbitrary source selection, clocks, unsupported budgets and wrong owners', async t => {
  const { file, ok, rejected, request, saved, proposalId } = await registered(t);
  const before = await snapshot(file);
  for (const extra of [{ eventIds: ['arbitrary-event'] }, { sourceEventIds: ['arbitrary-event'] }, { packet: {} },
    { query: SCOPE }, { now: at(1) }, { revision: saved.revision }, { expectedRevision: saved.revision },
    { note: 'PRIVATE_SYNTHETIC_SOURCE' }, { options: null }, { options: [] }, { options: { now: at(1) } },
    { options: { maxUsesPerSource: 0 } }, { options: { maxUsesPerSource: 5 } }, { options: { maxChars: 0 } },
    { options: { maxChars: 32769 } }, { options: { seenNoticeFingerprints: [] } }]) {
    await rejected('candidate-evidence', { ...request, ...extra });
  }
  for (const key of ['proposalId', 'lessonId', 'ruleVersion', 'inputFingerprint']) {
    const incomplete = clone(request); delete incomplete[key]; await rejected('candidate-evidence', incomplete);
  }
  await rejected('candidate-evidence', request, { revision: saved.revision });
  await rejected('candidate-evidence', request, { owner: 'another-owner' }, 'LEARNING_STORE_SCOPE_MISMATCH');
  assert.equal((await ok('progress', { proposalId })).candidates.length, 1);
  assert.deepEqual(await snapshot(file), before);
  assert.deepEqual(await readdir(path.dirname(file)), ['memory.json']);
});

test('CLI candidate-evidence cannot replace the original registration, decision or regression gates', async t => {
  const { file, ok, rejected, request, saved, proposalId } = await registered(t);
  const evidence = await ok('candidate-evidence', request);
  const packet = await ok('review', { proposalId });
  const review = reviewFrom(packet); const before = await snapshot(file);
  await rejected('curate-register', { review: { ...review, packetFingerprint: evidence.fingerprint }, suite: SUITE });
  await rejected('decide', { proposalId, decisionId: 'synthetic-invalid-evidence-decision', decision: 'accept',
    expectedRevision: packet.baseRevision, packetFingerprint: evidence.fingerprint, maxAttempts: packet.maxAttempts,
    reviewer: 'agent', sourceRef: 'source:synthetic-candidate-evidence', reason: 'This diagnostic hash is not a review packet.',
    eventIds: packet.attempts.map(item => item.eventId) });
  await rejected('check', { lesson: saved.lesson, suite: { ...clone(SUITE), version: '2' } });
  assert.deepEqual(await snapshot(file), before);
  const checked = await ok('check', { lesson: saved.lesson, suite: saved.suite });
  assert.equal(checked.lessonState, 'active'); assert.equal(checked.report.passed, 2);
  const checkedBytes = await snapshot(file);
  const afterCheck = await ok('candidate-evidence', request);
  assert.equal(afterCheck.availableAtRegistrationVerified, false);
  assert.equal(afterCheck.reviewerAcknowledgementVerified, false);
  assert.deepEqual(await snapshot(file), checkedBytes);
});

test('execute candidate-evidence reads one snapshot, never transacts, and rejects executable inputs', async t => {
  const { file, flags, store, request } = await registered(t); const state = await store.read();
  const before = await snapshot(file);
  const originalRead = FileLearningStore.prototype.read; const originalTransact = FileLearningStore.prototype.transact;
  let reads = 0, executions = 0;
  FileLearningStore.prototype.read = async function () { reads++; return reads === 1 ? clone(state) : createState(); };
  FileLearningStore.prototype.transact = () => { throw new Error('Read-only candidate evidence must not transact'); };
  try {
    const evidence = await execute(['candidate-evidence', ...flags], request);
    assert.equal(reads, 1); assert.equal(evidence.revision, state.revision);
    reads = 0;
    await assert.rejects(execute(['candidate-evidence', ...flags, '--revision', String(state.revision)], request), TypeError);
    assert.equal(reads, 0);
    const getter = { get maxChars() { executions++; return 12000; } };
    const proxy = new Proxy({}, { ownKeys() { executions++; return []; } });
    for (const options of [undefined, getter, proxy, { maxChars: () => { executions++; } }]) {
      reads = 0;
      await assert.rejects(execute(['candidate-evidence', ...flags], { ...request, options }), TypeError);
    }
    reads = 0;
    const input = { ...request, get inputFingerprint() { executions++; return request.inputFingerprint; } };
    await assert.rejects(execute(['candidate-evidence', ...flags], input), TypeError);
    assert.equal(executions, 0);
  } finally { FileLearningStore.prototype.read = originalRead; FileLearningStore.prototype.transact = originalTransact; }
  assert.deepEqual(await snapshot(file), before);
});
