import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createServerLearning } from './server-runtime.mjs';
import { FileLearningStore } from './store.mjs';
import { addLesson, ingest, propose } from './engine.mjs';

// Synthetic local memories only: these tests neither dispatch device actions nor
// classify real user proposals. Registration and progress use the public controller.
const NOW = '2026-11-01T09:00:00.000Z';
const CONTEXT = { platform: 'jh-mcp', version: 'progress-fixture-v1', environment: 'synthetic-progress-runtime' };
const SCOPE = { domain: 'output', operation: 'life_output_format.table', engine: 'jh-server', context: CONTEXT };
const SUITE = { id: 'progress-source-field', version: '1', cases: [
  { id: 'present', input: { value: { source: 'fixture:source' }, constraints: [{ path: ['source'], op: 'exists' }] },
    expected: { passed: true, failed: [] } },
  { id: 'absent', input: { value: {}, constraints: [{ path: ['source'], op: 'exists' }] },
    expected: { passed: false, failed: [0] } },
] };

async function setup(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'jh-progress-runtime-'));
  const file = path.join(directory, 'memory.json'), ownerScope = 'synthetic-progress-owner';
  const controllers = [];
  const controller = async (overrides = {}) => {
    const runtime = await createServerLearning({ file, ownerScope, runtimeId: 'synthetic-progress-runtime',
      context: CONTEXT, clock: () => NOW, ...overrides });
    controllers.push(runtime);
    return runtime;
  };
  t.after(async () => {
    for (const runtime of controllers) await runtime.close();
    await rm(directory, { recursive: true, force: true });
  });
  return { file, ownerScope, controller, runtime: await controller(), store: new FileLearningStore({ file, ownerScope }) };
}

function event(id) {
  return { ...structuredClone(SCOPE), eventId: 'progress-event-' + id, taskId: 'progress-task-' + id,
    attemptId: 'progress-attempt-' + id, sequence: 1, timestamp: NOW,
    outcome: 'failure_verified', source: 'host_verified', errorCode: 'SYNTHETIC_SOURCE_MISSING',
    evidenceRefs: ['fixture:progress-' + id] };
}

async function seed(store) {
  const result = await store.transact(state => {
    for (const id of ['a', 'b']) state = ingest(state, event(id)).state;
    return propose(state, { now: NOW });
  });
  assert.equal(result.proposals.length, 1);
  return result.proposals[0].id;
}

async function candidateInput(runtime, proposalId, overrides = {}, suite = SUITE) {
  const { packet } = await runtime.review('PREPARE', { proposalId });
  return { review: { proposalId, baseRevision: packet.baseRevision, packetFingerprint: packet.packetFingerprint,
    maxAttempts: packet.maxAttempts, lessonId: 'progress-source-rule', ruleVersion: '1', scope: packet.proposal.scope,
    cause: 'The synthetic formatter omitted the required source field.',
    resolution: 'Validate the source field before returning the synthetic result.',
    expectedEffect: 'Prevent the recorded omission; live improvement is not measured.',
    guidance: 'Keep a verified source reference with each formatted result.',
    eventIds: packet.attempts.map(item => item.eventId), reviewer: 'agent', ...overrides },
  suite: structuredClone(suite) };
}

async function decide(runtime, proposalId, decisionId, decision) {
  const { packet } = await runtime.review('PREPARE', { proposalId });
  return runtime.review('DECIDE', { proposalId, decisionId, decision,
    expectedRevision: packet.baseRevision, packetFingerprint: packet.packetFingerprint,
    reviewer: 'agent', sourceRef: 'source:synthetic-progress-review', reason: 'Synthetic follow-up selection.',
    eventIds: packet.attempts.map(item => item.eventId) });
}

async function progress(runtime, proposalId) {
  const result = await runtime.review('PREPARE', { proposalId, view: 'progress' });
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'PREPARE');
  assert.equal(result.externalEffects, false);
  assert.equal(result.view.schema, 'jh.learning-proposal-progress.v1');
  assert.equal(result.view.proposalId, proposalId);
  assert.equal(result.view.checkedAt, NOW);
  assert.equal(result.view.readOnly, true);
  assert.equal(result.view.advisoryOnly, true);
  assert.equal(result.view.externalEffects, false);
  assert.equal(result.view.liveExecutionVerified, false);
  return result.view;
}

async function snapshot(file) {
  const [bytes, info] = await Promise.all([readFile(file, 'utf8'), stat(file, { bigint: true })]);
  return { bytes, inode: info.ino, modified: info.mtimeNs };
}

function experienceUnchanged(before, after) {
  assert.deepEqual(after.events, before.events);
  assert.deepEqual(after.attempts, before.attempts);
}

test('runtime candidate registration atomically persists one link and progress reads do not write', async t => {
  const { file, runtime, store } = await setup(t);
  const proposalId = await seed(store);
  const input = await candidateInput(runtime, proposalId);
  const originalInput = structuredClone(input), before = await store.read();
  const result = await runtime.review('CANDIDATE', input);
  assert.equal(result.ok, true);
  assert.equal(result.duplicate, false);
  assert.equal(result.activatedByThisCall, false);
  assert.equal(result.externalEffects, false);
  assert.equal(result.lesson.state, 'candidate');
  assert.equal(result.revision, before.revision + 1);
  assert.equal(result.link.lessonId, result.lesson.id);
  assert.equal(result.link.registeredAt, NOW);
  assert.equal(result.link.baseRevision, before.revision);
  assert.equal(result.link.recordedRevision, result.revision);
  assert.deepEqual(result.link.sourceEventIds, input.review.eventIds.toSorted());
  assert.deepEqual(input, originalInput);
  const saved = await store.read();
  experienceUnchanged(before, saved);
  assert.deepEqual(saved.proposals[proposalId].candidateLinks, [result.link]);
  assert.equal(saved.proposals[proposalId].status, 'open');
  assert.equal(saved.proposals[proposalId].verification, undefined);
  assert.equal(Object.keys(saved.lessons).length, 1);
  assert.equal(JSON.parse(await readFile(file, 'utf8')).ownerScope, 'synthetic-progress-owner');
  const baseline = await snapshot(file);
  const view = await progress(runtime, proposalId);
  assert.equal(view.revision, saved.revision);
  assert.equal(view.recallScope, 'candidate_and_common');
  assert.deepEqual(view.recallBudget, { limit: 20, maxChars: 16384 });
  assert.equal(view.candidates.length, 1);
  const candidate = view.candidates[0];
  assert.deepEqual(candidate.link, result.link);
  assert.equal(candidate.bindingStatus, 'matched');
  assert.equal(candidate.lessonState, 'candidate');
  assert.equal(candidate.evaluation.status, 'not_run');
  assert.equal(candidate.recallIncluded, false);
  assert.equal(candidate.pastApplicationVerified, false);
  assert.equal(candidate.liveImprovementVerified, false);
  assert.deepEqual(await snapshot(file), baseline);
  const status = await runtime.status();
  assert.equal(status.capabilities.proposalProgress, true);
  assert.equal(status.activity.calls, 0);
});

test('runtime progress reflects the persisted passing CHECK without declaring proposal or live success', async t => {
  const { file, runtime, store } = await setup(t);
  const proposalId = await seed(store);
  const candidate = await runtime.review('CANDIDATE', await candidateInput(runtime, proposalId));
  const before = await store.read();
  const checked = await runtime.review('CHECK', { lesson: candidate.lesson, suite: candidate.suite,
    expectedRevision: candidate.revision });
  assert.equal(checked.lessonState, 'active');
  assert.equal(checked.report.passed, 2);
  assert.equal(checked.liveExecutionVerified, false);
  const saved = await store.read();
  experienceUnchanged(before, saved);
  assert.deepEqual(saved.proposals, before.proposals);
  const baseline = await snapshot(file);
  const view = await progress(runtime, proposalId);
  const item = view.candidates[0];
  assert.equal(view.currentStatus, 'open');
  assert.equal(item.lessonState, 'active');
  assert.equal(item.bindingStatus, 'matched');
  assert.equal(item.evaluation.status, 'passed');
  assert.equal(item.evaluation.passed, checked.report.passed);
  assert.equal(item.evaluation.failed, 0);
  assert.equal(item.evaluation.skipped, 0);
  assert.equal(item.evaluation.timestamp, checked.report.timestamp);
  assert.equal(item.temporalStatus, 'in_window');
  assert.equal(item.recallIncluded, true);
  assert.equal(item.pastApplicationVerified, false);
  assert.equal(item.liveImprovementVerified, false);
  assert.deepEqual(await snapshot(file), baseline);
  const altered = structuredClone(candidate.suite);
  altered.cases[0].expected = { passed: false, failed: [0] };
  await assert.rejects(runtime.review('CHECK', { lesson: candidate.lesson, suite: altered,
    expectedRevision: saved.revision }));
  assert.deepEqual(await snapshot(file), baseline);
});

test('runtime progress shows a failed real regression as quarantined and unrecallable', async t => {
  const { runtime, store } = await setup(t);
  const proposalId = await seed(store);
  const failingSuite = structuredClone(SUITE);
  failingSuite.cases[0].expected = { passed: false, failed: [0] };
  const candidate = await runtime.review('CANDIDATE', await candidateInput(runtime, proposalId, {}, failingSuite));
  const checked = await runtime.review('CHECK', { lesson: candidate.lesson, suite: candidate.suite,
    expectedRevision: candidate.revision });
  assert.equal(checked.report.failed, 1);
  assert.equal(checked.lessonState, 'quarantined');
  const view = await progress(runtime, proposalId);
  assert.equal(view.currentStatus, 'open');
  assert.equal(view.candidates[0].lessonState, 'quarantined');
  assert.equal(view.candidates[0].evaluation.status, 'failed');
  assert.equal(view.candidates[0].evaluation.failed, 1);
  assert.equal(view.candidates[0].recallIncluded, false);
  assert.equal(view.candidates[0].liveImprovementVerified, false);
});

test('candidate links and decision history survive restart and reproposal while closed progress stays readable', async t => {
  const { file, runtime, store, controller } = await setup(t);
  const proposalId = await seed(store);
  await decide(runtime, proposalId, 'progress-accept', 'accept');
  const input = await candidateInput(runtime, proposalId);
  const candidate = await runtime.review('CANDIDATE', input);
  await runtime.review('CHECK', { lesson: candidate.lesson, suite: candidate.suite, expectedRevision: candidate.revision });
  await decide(runtime, proposalId, 'progress-dismiss', 'dismiss');
  const closed = await store.read(), baseline = await snapshot(file);
  await assert.rejects(runtime.review('CANDIDATE', { ...input,
    review: { ...input.review, baseRevision: closed.revision } }));
  assert.deepEqual(await snapshot(file), baseline);
  await runtime.close();
  const restarted = await controller({ runtimeId: 'restarted-progress-runtime' });
  await store.transact(state => propose(ingest(state, event('after-restart')).state, { now: NOW }));
  const saved = await store.read();
  assert.deepEqual(saved.proposals[proposalId].candidateLinks, [candidate.link]);
  assert.deepEqual(saved.proposals[proposalId].decisionHistory, closed.proposals[proposalId].decisionHistory);
  assert.equal(saved.proposals[proposalId].decisionHistory.length, 2);
  const beforeRead = await snapshot(file);
  const view = await progress(restarted, proposalId);
  assert.equal(view.currentStatus, 'dismissed');
  assert.equal(view.candidates[0].lessonState, 'active');
  assert.equal(view.candidates[0].evaluation.status, 'passed');
  assert.deepEqual(await snapshot(file), beforeRead);
});

test('old candidate requests stay stale but a fresh duplicate preserves the active lesson without a write', async t => {
  const { file, runtime, store } = await setup(t);
  const proposalId = await seed(store);
  const input = await candidateInput(runtime, proposalId);
  const first = await runtime.review('CANDIDATE', input);
  await runtime.review('CHECK', { lesson: first.lesson, suite: first.suite, expectedRevision: first.revision });
  const baseline = await snapshot(file), before = await store.read();
  await assert.rejects(runtime.review('CANDIDATE', input), { code: 'LEARNING_REVISION_CONFLICT' });
  assert.deepEqual(await snapshot(file), baseline);
  const fresh = await candidateInput(runtime, proposalId, { lessonId: 'unused-duplicate-alias' });
  const duplicate = await runtime.review('CANDIDATE', fresh);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.revision, before.revision);
  assert.equal(duplicate.lesson.id, first.lesson.id);
  assert.equal(duplicate.lesson.state, 'active');
  assert.deepEqual(duplicate.link, first.link);
  assert.deepEqual(await snapshot(file), baseline);
  assert.equal((await progress(runtime, proposalId)).candidates.length, 1);
});

test('two controllers arbitrate candidate registration against the locked current revision', async t => {
  const { runtime, store, controller } = await setup(t);
  const proposalId = await seed(store), other = await controller();
  const left = await candidateInput(runtime, proposalId);
  const right = structuredClone(left);
  right.review.lessonId = 'second-progress-rule';
  right.review.guidance = 'Preserve the source field in the synthetic table result.';
  const before = await store.read();
  const results = await Promise.allSettled([runtime.review('CANDIDATE', left), other.review('CANDIDATE', right)]);
  const winners = results.filter(item => item.status === 'fulfilled');
  const losers = results.filter(item => item.status === 'rejected');
  assert.equal(winners.length, 1);
  assert.equal(losers.length, 1);
  assert.equal(losers[0].reason.code, 'LEARNING_REVISION_CONFLICT');
  const saved = await store.read();
  assert.equal(saved.revision, before.revision + 1);
  assert.equal(Object.keys(saved.lessons).length, 1);
  assert.deepEqual(saved.proposals[proposalId].candidateLinks, [winners[0].value.link]);
  experienceUnchanged(before, saved);
  assert.deepEqual((await progress(runtime, proposalId)).candidates[0].link, winners[0].value.link);
  assert.deepEqual((await progress(other, proposalId)).candidates[0].link, winners[0].value.link);
});

test('invalid review, suite and existing lesson collisions cannot leave a partial candidate link', async t => {
  const { file, runtime, store } = await setup(t);
  const proposalId = await seed(store);
  const input = await candidateInput(runtime, proposalId), baseline = await snapshot(file);
  const invalid = [
    { ...input, review: { ...input.review, scope: { ...SCOPE, engine: 'foreign-engine' } } },
    { ...input, review: { ...input.review, eventIds: ['missing-source-event'] } },
    { ...input, review: { ...input.review, outcome: 'success_verified' } },
    { ...input, suite: { ...input.suite, evaluator: 'untrusted-code' } },
    { ...input, suite: { ...input.suite, cases: [] } },
  ];
  for (const payload of invalid) {
    await assert.rejects(runtime.review('CANDIDATE', payload));
    assert.deepEqual(await snapshot(file), baseline);
  }
  await store.transact(state => addLesson(state, { id: input.review.lessonId, ...structuredClone(SCOPE),
    guidance: 'A different existing definition must be preserved.', ruleVersion: '1', evidenceRefs: ['fixture:existing-definition'] }));
  const collision = await candidateInput(runtime, proposalId), collisionBaseline = await snapshot(file);
  await assert.rejects(runtime.review('CANDIDATE', collision), /Existing lesson differs/);
  assert.deepEqual(await snapshot(file), collisionBaseline);
  const saved = await store.read();
  assert.equal(saved.proposals[proposalId].candidateLinks, undefined);
  assert.equal(Object.keys(saved.lessons).length, 1);
});

test('progress and registration preserve owner isolation and unavailable controller behavior', async t => {
  const { file, runtime, store, controller } = await setup(t);
  const proposalId = await seed(store), input = await candidateInput(runtime, proposalId);
  const foreign = await controller({ ownerScope: 'different-synthetic-owner' });
  const baseline = await snapshot(file);
  for (const [mode, payload] of [['PREPARE', { proposalId, view: 'progress' }], ['CANDIDATE', input]]) {
    const result = await foreign.review(mode, payload);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'LEARNING_UNAVAILABLE');
    assert.equal(Object.hasOwn(result, 'view'), false);
    assert.equal(Object.hasOwn(result, 'lesson'), false);
  }
  await assert.rejects(runtime.review('PREPARE', { proposalId, view: 'progress', ownerScope: 'different-owner' }));
  await assert.rejects(runtime.review('PREPARE', { proposalId: 'missing-proposal', view: 'progress' }));
  await runtime.close();
  assert.equal((await runtime.review('PREPARE', { proposalId, view: 'progress' })).code, 'LEARNING_UNAVAILABLE');
  assert.deepEqual(await snapshot(file), baseline);
});

test('explicit common instructions remain unlinked and participate in runtime progress recall selection', async t => {
  const { file, runtime, store } = await setup(t);
  const proposalId = await seed(store);
  const text = 'Use the owner-defined source reporting rule for JH work.';
  const instruction = { lessonId: 'explicit-common-source', ruleVersion: '1', text,
    sourceRef: 'user:synthetic-progress-instruction', sourceSha256: createHash('sha256').update(text).digest('hex'),
    confirmation: 'explicit_user_instruction', appliesTo: { kind: 'all_jh_tasks' }, conflictKey: 'source-reporting' };
  const explicit = await runtime.review('CANDIDATE', { instruction, suite: SUITE, expectedRevision: (await store.read()).revision });
  assert.equal(Object.hasOwn(explicit, 'link'), false);
  await runtime.review('CHECK', { lesson: explicit.lesson, suite: explicit.suite, expectedRevision: explicit.revision });
  const unlinkedBaseline = await snapshot(file);
  assert.deepEqual((await progress(runtime, proposalId)).candidates, []);
  assert.deepEqual(await snapshot(file), unlinkedBaseline);
  const candidate = await runtime.review('CANDIDATE', await candidateInput(runtime, proposalId, { conflictKey: 'source-reporting' }));
  await runtime.review('CHECK', { lesson: candidate.lesson, suite: candidate.suite, expectedRevision: candidate.revision });
  const view = await progress(runtime, proposalId);
  assert.equal(view.recallScope, 'candidate_and_common');
  assert.equal(view.candidates.length, 1);
  assert.equal(view.candidates[0].lessonState, 'active');
  assert.equal(view.candidates[0].evaluation.status, 'passed');
  assert.equal(view.candidates[0].recallIncluded, false);
  const recalled = await runtime.context({ target_tool: 'life_output_format', target_mode: 'TABLE' });
  assert.deepEqual(recalled.lessons.map(item => item.id), [instruction.lessonId]);
  const saved = await store.read();
  assert.deepEqual(saved.proposals[proposalId].candidateLinks, [candidate.link]);
  assert.equal(saved.proposals[proposalId].status, 'open');
});
