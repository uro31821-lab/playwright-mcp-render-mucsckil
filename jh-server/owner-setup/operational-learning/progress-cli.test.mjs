import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execute } from './cli.mjs';

// CLI calls use temporary owner-bound files and synthetic source evidence only.
const NOW = '2026-11-01T09:00:00.000Z';
const SCOPE = { domain: 'output', operation: 'summary.sources', engine: 'synthetic-cli',
  context: { platform: 'node', version: 'progress-cli-v1', environment: 'synthetic' } };
const SUITE = { id: 'progress-cli-source', version: '1', cases: [
  { id: 'source-present', input: { value: { source: 'fixture:source' }, constraints: [{ path: ['source'], op: 'exists' }] },
    expected: { passed: true, failed: [] } },
  { id: 'source-missing', input: { value: {}, constraints: [{ path: ['source'], op: 'exists' }] },
    expected: { passed: false, failed: [0] } },
] };

async function setup(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'jh-progress-cli-'));
  const file = path.join(directory, 'memory.json');
  t.after(() => rm(directory, { recursive: true, force: true }));
  const flags = ['--store', file, '--owner', 'synthetic-progress-cli-owner'];
  const run = (command, input, extra = []) => execute([command, ...flags, ...extra], input);
  const events = ['a', 'b'].map(id => ({ ...structuredClone(SCOPE), eventId: 'progress-cli-event-' + id,
    taskId: 'progress-cli-task-' + id, attemptId: 'progress-cli-attempt-' + id, sequence: 1, timestamp: NOW,
    outcome: 'correction', source: 'user_explicit', errorCode: 'SYNTHETIC_SOURCE_OMISSION',
    evidenceRefs: ['fixture:progress-cli-' + id] }));
  const seeded = await run('ingest', events);
  assert.equal(seeded.newProposals.length, 1);
  return { file, flags, run, events, proposalId: seeded.newProposals[0].id };
}

async function inputFor(run, proposalId, overrides = {}, suite = SUITE) {
  const packet = await run('review', { proposalId });
  return { review: { proposalId, baseRevision: packet.baseRevision, packetFingerprint: packet.packetFingerprint,
    maxAttempts: packet.maxAttempts, lessonId: 'progress-cli-rule', ruleVersion: '1', scope: packet.proposal.scope,
    cause: 'The synthetic summary omitted the required source field.',
    resolution: 'Validate the summary source field before formatting.',
    expectedEffect: 'Prevent the fixture omission without claiming measured live savings.',
    guidance: 'Keep a source reference in the synthetic summary.',
    eventIds: packet.attempts.map(item => item.eventId), reviewer: 'agent', ...overrides },
  suite: structuredClone(suite) };
}

async function snapshot(file) {
  const [bytes, info] = await Promise.all([readFile(file, 'utf8'), stat(file, { bigint: true })]);
  return { bytes, inode: info.ino, modified: info.mtimeNs };
}

test('CLI curate-register, check and progress share persistent links across independent invocations', async t => {
  const { file, run, proposalId } = await setup(t);
  const input = await inputFor(run, proposalId), original = structuredClone(input);
  const before = await run('status');
  const registered = await run('curate-register', input);
  assert.equal(registered.revision, before.revision + 1);
  assert.equal(registered.duplicate, false);
  assert.equal(registered.lesson.state, 'candidate');
  assert.equal(registered.activatedByThisCall, false);
  assert.equal(registered.externalEffects, false);
  assert.equal(registered.link.lessonId, registered.lesson.id);
  assert.deepEqual(input, original);
  const pending = await run('progress', { proposalId });
  assert.equal(pending.schema, 'jh.learning-proposal-progress.v1');
  assert.equal(pending.recallScope, 'candidate_only');
  assert.equal(pending.candidates[0].evaluation.status, 'not_run');
  assert.equal(pending.candidates[0].recallIncluded, false);
  const checked = await run('check', { lesson: registered.lesson, suite: registered.suite });
  assert.equal(checked.report.passed, 2);
  assert.equal(checked.lessonState, 'active');
  const baseline = await snapshot(file);
  const active = await run('progress', { proposalId });
  assert.equal(active.currentStatus, 'open');
  assert.equal(active.revision, checked.revision);
  assert.equal(active.readOnly, true);
  assert.equal(active.advisoryOnly, true);
  assert.equal(active.externalEffects, false);
  assert.equal(active.liveExecutionVerified, false);
  assert.deepEqual(active.candidates[0].link, registered.link);
  assert.equal(active.candidates[0].lessonState, 'active');
  assert.equal(active.candidates[0].bindingStatus, 'matched');
  assert.equal(active.candidates[0].evaluation.status, 'passed');
  assert.equal(active.candidates[0].evaluation.passed, 2);
  assert.equal(active.candidates[0].evaluation.timestamp, checked.report.timestamp);
  assert.equal(active.candidates[0].recallIncluded, true);
  assert.equal(active.candidates[0].pastApplicationVerified, false);
  assert.equal(active.candidates[0].liveImprovementVerified, false);
  assert.deepEqual(await snapshot(file), baseline);
  const after = await run('status');
  assert.equal(after.counts.events, before.counts.events);
  assert.equal(after.counts.attempts, before.counts.attempts);
  assert.equal(after.counts.lessons, 1);
  assert.equal(after.proposals[0].status, 'open');
});

test('legacy CLI curate and candidate stay unlinked until explicit reviewed registration', async t => {
  const { file, run, proposalId } = await setup(t);
  const input = await inputFor(run, proposalId), initial = await snapshot(file);
  const curated = await run('curate', input);
  assert.deepEqual(await snapshot(file), initial);
  assert.deepEqual((await run('progress', { proposalId })).candidates, []);
  await run('candidate', { lesson: curated.lesson, suite: curated.suite });
  await run('check', { lesson: curated.lesson, suite: curated.suite });
  const before = await run('status'), unlinked = await snapshot(file);
  assert.equal(before.lessons[0].state, 'active');
  assert.deepEqual((await run('progress', { proposalId })).candidates, []);
  assert.deepEqual(await snapshot(file), unlinked);
  const linked = await run('curate-register', await inputFor(run, proposalId));
  assert.equal(linked.revision, before.revision + 1);
  assert.equal(linked.lesson.id, curated.lesson.id);
  assert.equal(linked.lesson.state, 'active');
  const view = await run('progress', { proposalId });
  assert.equal(view.candidates.length, 1);
  assert.deepEqual(view.candidates[0].link, linked.link);
  assert.equal(view.candidates[0].evaluation.status, 'passed');
});

test('CLI old packet retries reject while freshly reviewed duplicates perform no file write', async t => {
  const { file, run, proposalId } = await setup(t);
  const original = await inputFor(run, proposalId);
  const first = await run('curate-register', original);
  await run('check', { lesson: first.lesson, suite: first.suite });
  const baseline = await snapshot(file), before = await run('status');
  await assert.rejects(run('curate-register', original), { code: 'LEARNING_REVISION_CONFLICT' });
  assert.deepEqual(await snapshot(file), baseline);
  const duplicate = await run('curate-register', await inputFor(run, proposalId, { lessonId: 'unused-cli-alias' }));
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.revision, before.revision);
  assert.equal(duplicate.lesson.id, first.lesson.id);
  assert.equal(duplicate.lesson.state, 'active');
  assert.deepEqual(duplicate.link, first.link);
  assert.deepEqual(await snapshot(file), baseline);
  assert.equal((await run('progress', { proposalId })).candidates.length, 1);
});

test('CLI registration rejects revision overrides, forged fields and foreign owners without partial writes', async t => {
  const { file, run, proposalId } = await setup(t);
  const input = await inputFor(run, proposalId), baseline = await snapshot(file);
  await assert.rejects(run('curate-register', input, ['--revision', String(input.review.baseRevision)]), /review.baseRevision/);
  for (const payload of [
    { ...input, review: { ...input.review, provenance: 'user_explicit' } },
    { ...input, review: { ...input.review, eventIds: ['unknown-event'] } },
    { ...input, review: { ...input.review, scope: { ...input.review.scope, operation: 'foreign.operation' } } },
    { ...input, suite: { ...input.suite, evaluator: 'untrusted-evaluator' } },
    { ...input, suite: { ...input.suite, cases: [] } },
    { ...input, link: { lessonId: 'unreviewed-link' } },
  ]) {
    await assert.rejects(run('curate-register', payload));
    assert.deepEqual(await snapshot(file), baseline);
  }
  const foreignFlags = ['--store', file, '--owner', 'other-synthetic-owner'];
  await assert.rejects(execute(['curate-register', ...foreignFlags], input), { code: 'LEARNING_STORE_SCOPE_MISMATCH' });
  await assert.rejects(execute(['progress', ...foreignFlags], { proposalId }), { code: 'LEARNING_STORE_SCOPE_MISMATCH' });
  await assert.rejects(run('progress', { proposalId, ownerScope: 'other-synthetic-owner' }));
  await assert.rejects(run('progress', { proposalId: 'missing-proposal' }));
  assert.deepEqual(await snapshot(file), baseline);
});

test('concurrent CLI registrations commit exactly one current review and no orphan lesson or link', async t => {
  const { run, proposalId } = await setup(t);
  const first = await inputFor(run, proposalId), second = structuredClone(first);
  second.review.lessonId = 'other-cli-rule';
  second.review.guidance = 'Preserve the source field in the summary contract.';
  const before = await run('status');
  const results = await Promise.allSettled([run('curate-register', first), run('curate-register', second)]);
  const winner = results.filter(item => item.status === 'fulfilled');
  const loser = results.filter(item => item.status === 'rejected');
  assert.equal(winner.length, 1);
  assert.equal(loser.length, 1);
  assert.equal(loser[0].reason.code, 'LEARNING_REVISION_CONFLICT');
  const after = await run('status');
  assert.equal(after.revision, before.revision + 1);
  assert.equal(after.counts.lessons, 1);
  assert.equal(after.counts.events, before.counts.events);
  assert.equal(after.counts.attempts, before.counts.attempts);
  assert.deepEqual(after.proposals[0].candidateLinks, [winner[0].value.link]);
  assert.deepEqual((await run('progress', { proposalId })).candidates[0].link, winner[0].value.link);
});

test('CLI progress retains failed check evidence and links after dismissal and later ingestion', async t => {
  const { file, run, proposalId, events } = await setup(t);
  const failing = structuredClone(SUITE);
  failing.cases[0].expected = { passed: false, failed: [0] };
  const input = await inputFor(run, proposalId, {}, failing);
  const candidate = await run('curate-register', input);
  const checked = await run('check', { lesson: candidate.lesson, suite: candidate.suite });
  assert.equal(checked.lessonState, 'quarantined');
  const packet = await run('review', { proposalId });
  const dismissed = await run('decide', { proposalId, decisionId: 'progress-cli-dismiss', decision: 'dismiss',
    expectedRevision: packet.baseRevision, packetFingerprint: packet.packetFingerprint, reviewer: 'agent',
    sourceRef: 'source:synthetic-progress-cli', reason: 'Retain the failed candidate for later review.',
    eventIds: packet.attempts.map(item => item.eventId) });
  const next = { ...events[0], eventId: 'progress-cli-event-later', taskId: 'progress-cli-task-later', attemptId: 'progress-cli-attempt-later' };
  await run('ingest', next);
  const before = await run('status'), baseline = await snapshot(file);
  await assert.rejects(run('curate-register', { ...input, review: { ...input.review, baseRevision: before.revision } }));
  const view = await run('progress', { proposalId });
  assert.equal(view.currentStatus, 'dismissed');
  assert.equal(view.candidates.length, 1);
  assert.deepEqual(view.candidates[0].link, candidate.link);
  assert.equal(view.candidates[0].lessonState, 'quarantined');
  assert.equal(view.candidates[0].evaluation.status, 'failed');
  assert.equal(view.candidates[0].evaluation.failed, 1);
  assert.equal(view.candidates[0].recallIncluded, false);
  assert.equal(view.candidates[0].liveImprovementVerified, false);
  assert.deepEqual(before.proposals[0].decisionHistory, [dismissed.receipt]);
  assert.deepEqual(await snapshot(file), baseline);
});
