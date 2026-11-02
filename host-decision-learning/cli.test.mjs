/** SYNTHETIC file round-trip; no actual owner or user outcomes. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeCommand } from './cli.mjs';
const D = globalThis.JHDecisionLearning;
const at = second => new Date(Date.parse('2026-11-02T00:00:00Z') + second * 1000).toISOString();
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'jh-decision-cli-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const options = { store: join(dir, 'JH_Decision_Learning_v1.json'), owner: 'synthetic-owner' };
  await executeCommand('init', { ...options, input: { now: at(0) } });
  return { ...options, dir };
}
const goal = { expectedRevision: 0, goalId: 'synthetic-goal', scope: { topic: 'synthetic-task' },
  goal: 'Finish the synthetic setup quickly.', reason: 'Synthetic limited time.', basis: 'user_explicit',
  priorities: [], constraints: [], validUntil: null, supersedes: null,
  sourceRef: 'source:synthetic-goal', at: at(1) };
test('persisted prediction and later observation survive reload; exact outcome retry cannot duplicate or alter them', async t => {
  const f = await fixture(t);
  await executeCommand('goal', { ...f, input: goal });
  await executeCommand('predict', { ...f, input: { expectedRevision: 1, predictionId: 'synthetic-prediction',
    goalId: 'synthetic-goal', optionId: 'synthetic-option', expected: [{ key: 'setup', unit: 'minutes', min: null, max: 5 }],
    expectedBenefit: 'Synthetic short setup.', expectedBurden: 'Synthetic few steps.', uncertainties: [],
    sourceRef: 'source:synthetic-prediction', at: at(2) } });
  const outcome = { expectedRevision: 2, outcomeId: 'synthetic-outcome', predictionId: 'synthetic-prediction',
    observed: [{ key: 'setup', unit: 'minutes', value: 12 }], summary: 'Synthetic setup took longer.',
    basis: 'user_report', sourceRef: 'source:synthetic-outcome', at: at(3) };
  await executeCommand('outcome', { ...f, input: outcome });
  const bytes = await readFile(f.store, 'utf8');
  const state = D.validateState(JSON.parse(bytes));
  assert.equal(state.revision, 3);
  assert.equal(Object.keys(state.predictions).length, 1);
  assert.equal(Object.keys(state.outcomes).length, 1);
  const retry = await executeCommand('outcome', { ...f, input: outcome });
  assert.equal(retry.result.duplicate, true);
  assert.equal(retry.result.changed, false);
  assert.equal(await readFile(f.store, 'utf8'), bytes);
  await assert.rejects(executeCommand('outcome', { ...f, input: { ...outcome, summary: 'Synthetic changed content.' } }),
    { code: 'DECISION_ID_CONFLICT' });
  const comparison = await executeCommand('compare', { ...f, input: { predictionId: 'synthetic-prediction', outcomeId: 'synthetic-outcome' } });
  assert.equal(comparison.revision, 3);
  assert.match(JSON.stringify(comparison.result), /missed/);
  assert.equal(await readFile(f.store, 'utf8'), bytes);
  assert.deepEqual(await readdir(f.dir), ['JH_Decision_Learning_v1.json']);
});
test('short-turn and review-context CLI reads preserve the store and retain the owner boundary', async t => {
  const f = await fixture(t);
  await executeCommand('goal', { ...f, input: goal });
  const bytes = await readFile(f.store, 'utf8');
  const turn = await executeCommand('turn', { ...f, input: { text: '했어', taskId: 'synthetic-task', pendingQuestion: null } });
  assert.equal(turn.result.authorizesExecution, false);
  assert.equal(turn.result.persistPreference, false);
  assert.match(JSON.stringify(turn.result), /reported_step_done/);
  await executeCommand('review-context', { ...f, input: { goalId: 'synthetic-goal', at: at(2) } });
  await assert.rejects(executeCommand('review-context', { ...f, owner: 'synthetic-stranger', input: { goalId: 'synthetic-goal', at: at(2) } }),
    { code: 'DECISION_OWNER_MISMATCH' });
  assert.equal(await readFile(f.store, 'utf8'), bytes);
});
