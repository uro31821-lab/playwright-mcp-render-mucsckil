/** SYNTHETIC CLI integration only. Never reads actual owner memory or feedback. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeCommand } from './cli.mjs';

const P = globalThis.JHPersonalization;
const SCOPE = { topic: 'synthetic-tool-selection', project: 'synthetic-project', aspect: 'setup' };
const at = seconds => new Date(Date.parse('2026-11-02T00:00:00.000Z') + seconds * 1000).toISOString();
const rejectsCode = expected => error => error?.code === expected;
const candidates = [
  { id: 'synthetic-a', label: 'Synthetic A', features: { speed: 1, setup_ease: 0.2 }, sourceRefs: ['source:synthetic-a-features'] },
  { id: 'synthetic-b', label: 'Synthetic B', features: { speed: 0.7, setup_ease: 1 }, sourceRefs: ['source:synthetic-b-features'] },
];

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'jh-personalization-cli-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const options = { store: join(directory, 'JH_Personal_Choices_v1.json'), owner: 'synthetic-cli-owner' };
  await executeCommand('init', { ...options, input: { now: at(0) } });
  return { ...options, directory };
}

function preferenceInput(overrides = {}) {
  return { expectedRevision: 0, preferenceId: 'synthetic-speed', scope: SCOPE, key: 'speed', direction: 'higher',
    weight: 5, status: 'confirmed', reason: 'Synthetic explicit priority for speed.',
    sourceRef: 'source:synthetic-speed-preference', at: at(1), ...overrides };
}

async function syntheticLifecycle(f) {
  let response = await executeCommand('prefer', { ...f, input: preferenceInput() });
  response = await executeCommand('prefer', { ...f, input: preferenceInput({
    expectedRevision: response.revision, preferenceId: 'synthetic-initial-setup', key: 'setup_ease', weight: 1,
    reason: 'Synthetic initial low setup priority.', sourceRef: 'source:synthetic-initial-setup', at: at(2),
  }) });
  const before = await executeCommand('rank', { ...f, input: { at: at(3), scope: SCOPE, candidates } });
  response = await executeCommand('choose', { ...f, input: {
    expectedRevision: response.revision, choiceId: 'synthetic-choice-a', scope: SCOPE, candidateId: 'synthetic-a',
    reason: 'Synthetic A was selected because speed initially mattered more.',
    criteria: [
      { preferenceId: 'synthetic-speed', reason: 'Synthetic speed was the main criterion.' },
      { preferenceId: 'synthetic-initial-setup', reason: 'Synthetic setup priority was lower at this time.' },
    ],
    sourceRef: 'source:synthetic-choice-a', at: at(4),
  } });
  const feedback = { expectedRevision: response.revision, feedbackId: 'synthetic-after-use', choiceId: 'synthetic-choice-a',
    basis: 'after_use', outcome: 'mixed', summary: 'Synthetic after-use report explicitly increases setup importance.',
    updates: [{ preferenceId: 'synthetic-reviewed-setup', key: 'setup_ease', direction: 'higher', weight: 5,
      status: 'confirmed', reason: 'Synthetic user explicitly asks to prioritize easier setup next time.', explicit: true }],
    sourceRef: 'source:synthetic-after-use', at: at(5) };
  response = await executeCommand('feedback', { ...f, input: feedback });
  return { before, response, feedback };
}

test('persisted init → preferences → choice → feedback changes the next ranking and retains original reasons', async t => {
  const f = await fixture(t);
  const { before, response } = await syntheticLifecycle(f);
  assert.equal(before.result.ranks[0].candidateId, 'synthetic-a');
  assert.ok(Math.abs(before.result.ranks[0].score - 5.2 / 6) < 1e-10);
  const bytes = await readFile(f.store, 'utf8');
  // executeCommand reloads the file for every invocation; no shared in-memory state is supplied.
  const after = await executeCommand('rank', { ...f, input: { at: at(6), scope: SCOPE, candidates } });
  assert.equal(after.result.ranks[0].candidateId, 'synthetic-b');
  assert.equal(after.result.ranks[0].score, 0.85);
  assert.equal(after.result.ranks[1].score, 0.6);
  assert.equal(after.result.featureTruthVerified, false);
  assert.equal(after.result.effectiveCriteria.find(item => item.key === 'setup_ease').criterionId, 'synthetic-reviewed-setup');
  assert.equal(after.revision, response.revision);
  assert.equal(await readFile(f.store, 'utf8'), bytes, 'ranking must not rewrite private preferences');
  const persisted = P.validateState(JSON.parse(bytes));
  assert.equal(persisted.preferences['synthetic-initial-setup'].weight, 1);
  assert.equal(persisted.preferences['synthetic-reviewed-setup'].weight, 5);
  assert.equal(persisted.feedback['synthetic-after-use'].choiceId, 'synthetic-choice-a');
  assert.equal(persisted.choices['synthetic-choice-a'].criteria[1].preferenceId, 'synthetic-initial-setup');
  assert.deepEqual(await readdir(f.directory), ['JH_Personal_Choices_v1.json']);
});

test('a persisted feedback retry with its old revision is idempotent and cannot duplicate the preference update', async t => {
  const f = await fixture(t);
  const { feedback, response } = await syntheticLifecycle(f);
  const bytes = await readFile(f.store, 'utf8');
  const replay = await executeCommand('feedback', { ...f, input: feedback });
  assert.equal(replay.result.duplicate, true);
  assert.equal(replay.result.changed, false);
  assert.equal(replay.revision, response.revision);
  assert.equal(await readFile(f.store, 'utf8'), bytes);
  const persisted = P.validateState(JSON.parse(bytes));
  assert.equal(Object.keys(persisted.feedback).length, 1);
  assert.equal(Object.keys(persisted.preferences).length, 3);
  await assert.rejects(executeCommand('feedback', { ...f, input: { ...feedback, summary: 'Changed content under the same synthetic ID.' } }), rejectsCode('PERSONALIZATION_ID_CONFLICT'));
  assert.equal(await readFile(f.store, 'utf8'), bytes);
});

test('wrong-owner writes and corrupt existing state fail without replacing the stored bytes', async t => {
  const f = await fixture(t);
  const original = await readFile(f.store, 'utf8');
  await assert.rejects(executeCommand('prefer', { ...f, owner: 'another-synthetic-owner', input: preferenceInput() }), rejectsCode('PERSONALIZATION_OWNER_MISMATCH'));
  assert.equal(await readFile(f.store, 'utf8'), original);

  const malformed = '{synthetic incomplete state';
  await writeFile(f.store, malformed, { mode: 0o600 });
  await assert.rejects(executeCommand('prefer', { ...f, input: preferenceInput() }), rejectsCode('PERSONALIZATION_STORE_INVALID_JSON'));
  await assert.rejects(executeCommand('init', { ...f, input: { now: at(10) } }), rejectsCode('PERSONALIZATION_STORE_EXISTS'));
  assert.equal(await readFile(f.store, 'utf8'), malformed);

  const inconsistent = JSON.parse(original);
  inconsistent.revision = 1; // No event exists for this fabricated revision.
  const inconsistentBytes = JSON.stringify(inconsistent);
  await writeFile(f.store, inconsistentBytes, { mode: 0o600 });
  await assert.rejects(executeCommand('prefer', { ...f, input: preferenceInput() }), rejectsCode('PERSONALIZATION_STATE_INVALID'));
  assert.equal(await readFile(f.store, 'utf8'), inconsistentBytes);
  assert.deepEqual(await readdir(f.directory), ['JH_Personal_Choices_v1.json']);
});
