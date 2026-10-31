import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createState, ingest, propose, addLesson, evaluateLesson, recall, setProposalStatus } from './engine.mjs';
import { FileLearningStore } from './store.mjs';

const context = { platform: 'android', version: '2', environment: 'synthetic-review' };
const scope = { domain: 'connection', operation: 'connection.check', engine: 'jh-synthetic', context };
const at = '2026-10-31T01:00:00Z';
const fingerprint = 'c'.repeat(64);
const event = (id, overrides = {}) => ({
  ...scope, eventId: id, taskId: 'task-' + id, attemptId: 'attempt-' + id,
  sequence: 1, timestamp: at, outcome: 'completion_unknown', source: 'host_verified',
  evidenceRefs: ['fixture:' + id], ...overrides,
});
const observe = (state, value) => propose(ingest(state, value).state, { now: value.timestamp });

test('a gap already offered by the live observation path resolves after late verified completion', () => {
  const unknown = event('unknown');
  const first = observe(createState(), unknown);
  const id = first.proposals[0].id;
  assert.equal(first.state.proposals[id].status, 'open');
  const completed = observe(first.state, event('late-completion', {
    taskId: unknown.taskId, attemptId: unknown.attemptId, sequence: 2,
    timestamp: '2026-10-31T01:01:00Z', outcome: 'success_verified',
  }));
  assert.equal(completed.state.proposals[id].status, 'resolved');
  assert.equal(completed.proposals.length, 0);
  const unchanged = propose(completed.state, { now: '2026-10-31T01:02:00Z' });
  assert.equal(unchanged.state.proposals[id].status, 'resolved');
  assert.equal(unchanged.proposals.length, 0);
  const recurrence = observe(unchanged.state, event('new-independent-unknown', {
    timestamp: '2026-10-31T01:03:00Z',
  }));
  assert.equal(recurrence.state.proposals[id].status, 'open');
  assert.equal(recurrence.proposals.length, 1);
});

test('a newer failed evaluation cannot be undone by old or undated passing evidence', () => {
  const definition = { ...scope, id: 'review-lesson', guidance: 'Inspect the existing receipt.',
    evidenceRefs: ['fixture:reviewed-fix'], ruleVersion: '1', inputFingerprint: fingerprint };
  const pass = { ruleVersion: '1', inputFingerprint: fingerprint, passed: 1, failed: 0, skipped: 0,
    evidenceRefs: ['fixture:old-pass'], timestamp: at };
  let state = evaluateLesson(addLesson(createState(), definition), definition.id, pass);
  state = evaluateLesson(state, definition.id, { ...pass, passed: 0, failed: 1,
    evidenceRefs: ['fixture:new-failure'], timestamp: '2026-10-31T02:00:00Z' });
  assert.throws(() => evaluateLesson(state, definition.id, pass));
  assert.throws(() => evaluateLesson(state, definition.id, { ...pass, evidenceRefs: ['fixture:renamed-old-pass'] }));
  const { timestamp, ...undated } = pass;
  assert.throws(() => evaluateLesson(state, definition.id, undated));
  assert.equal(state.lessons[definition.id].state, 'quarantined');
  assert.deepEqual(recall(state, scope), []);
});

test('a proposal cannot be marked verified without a nonzero executed passing receipt', () => {
  const offered = observe(createState(), event('unverified-proposal'));
  const id = offered.proposals[0].id;
  let state = setProposalStatus(offered.state, id, 'accepted');
  state = setProposalStatus(state, id, 'implemented');
  assert.throws(() => setProposalStatus(state, id, 'verified'));
  const receipt = { passed: 1, failed: 0, skipped: 0, evidenceRefs: ['fixture:executed-check'], timestamp: at };
  for (const invalid of [{ passed: 0 }, { failed: 1 }, { skipped: 1 }, { evidenceRefs: [] }]) {
    assert.throws(() => setProposalStatus(state, id, 'verified', { ...receipt, ...invalid }));
  }
  const verified = setProposalStatus(state, id, 'verified', receipt);
  assert.equal(verified.proposals[id].status, 'verified');
  assert.deepEqual(verified.proposals[id].verification, receipt);
});

test('normal simultaneous completions on one store do not silently discard observations', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'jh-learning-review-'));
  try {
    const store = new FileLearningStore({ file: path.join(directory, 'state.json'), ownerScope: 'synthetic-review' });
    await Promise.all(Array.from({ length: 8 }, (_, index) =>
      store.transact(state => ingest(state, event('concurrent-' + index)))));
    const state = await store.read();
    assert.equal(Object.keys(state.events).length, 8);
    assert.equal(Object.keys(state.attempts).length, 8);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('two store instances preserve both observations during brief contention', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'jh-learning-review-'));
  try {
    const options = { file: path.join(directory, 'state.json'), ownerScope: 'synthetic-review' };
    const first = new FileLearningStore(options);
    const second = new FileLearningStore(options);
    let entered;
    const locked = new Promise(resolve => { entered = resolve; });
    const a = first.transact(async state => {
      entered();
      await new Promise(resolve => setTimeout(resolve, 30));
      return ingest(state, event('first-writer'));
    });
    await locked;
    const b = second.transact(state => ingest(state, event('second-writer')));
    await Promise.all([a, b]);
    assert.deepEqual(Object.keys((await second.read()).events).sort(), ['first-writer', 'second-writer']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
