/** SYNTHETIC integration. No real user state or candidate claims. */
import test from 'node:test';
import assert from 'node:assert/strict';
import '../host-personalization/runtime.js';
import './runtime.js';
import './personalization-adapter.js';
const P = globalThis.JHPersonalization, D = globalThis.JHDecisionLearning, A = globalThis.JHDecisionContext;
const scope = { topic: 'synthetic-software', project: 'synthetic-app', aspect: 'setup' };
const at = second => new Date(Date.parse('2026-11-02T00:00:00Z') + second * 1000).toISOString();
const candidates = [
  { id: 'fast', label: 'Synthetic fast candidate', features: { speed: 1, setup_ease: 0.2 }, sourceRefs: ['source:synthetic-fast'] },
  { id: 'simple', label: 'Synthetic simple candidate', features: { speed: 0.7, setup_ease: 1 }, sourceRefs: ['source:synthetic-simple'] },
];
function fixture() {
  let personal = P.createState({ ownerScope: 'synthetic-owner', now: at(0) });
  personal = P.recordPreference(personal, { expectedRevision: 0, preferenceId: 'speed-pref', scope,
    key: 'speed', direction: 'higher', weight: 5, status: 'confirmed', reason: 'Synthetic past speed preference.',
    sourceRef: 'source:synthetic-preference', at: at(1) }).state;
  let decision = D.createState({ ownerScope: 'synthetic-owner', now: at(0) });
  decision = D.recordGoal(decision, { expectedRevision: 0, goalId: 'easy-goal', scope,
    goal: 'Complete the synthetic setup with less effort.', reason: 'Synthetic current task has limited setup time.',
    basis: 'user_explicit', priorities: [
      { key: 'speed', direction: 'higher', weight: 1, reason: 'Synthetic current task tolerates slower operation.', sourceRef: 'source:synthetic-goal' },
      { key: 'setup_ease', direction: 'higher', weight: 5, reason: 'Synthetic current task values easy setup.', sourceRef: 'source:synthetic-goal' },
    ], constraints: [], validUntil: null, supersedes: null, sourceRef: 'source:synthetic-goal', at: at(2) }).state;
  return { personal, decision };
}
test('the current goal changes this ranking while immediate instructions override it without rewriting memory', () => {
  const { personal, decision } = fixture();
  const beforePersonal = P.fingerprint(personal), beforeDecision = D.fingerprint(decision);
  assert.equal(P.rank(personal, { at: at(3), scope, candidates }).ranks[0].candidateId, 'fast');
  const result = A.rankWithGoal(personal, decision, { goalId: 'easy-goal', at: at(3), scope, candidates });
  assert.equal(result.eligible, true);
  assert.equal(result.ranking.ranks[0].candidateId, 'simple');
  assert.equal(result.ranking.effectiveCriteria.find(x => x.key === 'setup_ease').basis, 'current');
  const immediate = A.rankWithGoal(personal, decision, { goalId: 'easy-goal', at: at(4), scope, candidates,
    context: { priorities: [
      { key: 'speed', direction: 'higher', weight: 5, reason: 'Synthetic immediate instruction now values speed.', sourceRef: 'source:synthetic-now' },
      { key: 'setup_ease', direction: 'higher', weight: 1, reason: 'Synthetic setup is now less important.', sourceRef: 'source:synthetic-now' },
    ] } });
  assert.equal(immediate.ranking.ranks[0].candidateId, 'fast');
  assert.equal(result.persistentPreferencesChanged, false);
  assert.equal(result.authorizesExecution, false);
  assert.equal(P.fingerprint(personal), beforePersonal);
  assert.equal(D.fingerprint(decision), beforeDecision);
  assert.equal(Object.keys(personal.preferences).length, 1);
});
test('wrong owner or project cannot inherit goal priorities, and a paused goal produces no recommendation', () => {
  const { personal, decision } = fixture();
  const input = { goalId: 'easy-goal', at: at(5), scope, candidates };
  const another = P.createState({ ownerScope: 'synthetic-other-owner', now: at(0) });
  assert.throws(() => A.rankWithGoal(another, decision, input), { code: 'DECISION_CONTEXT_OWNER_MISMATCH' });
  assert.throws(() => A.rankWithGoal(personal, decision, { ...input, scope: { ...scope, project: 'other-project' } }),
    { code: 'DECISION_CONTEXT_SCOPE_MISMATCH' });
  const paused = D.setGoalStatus(decision, { expectedRevision: decision.revision, decisionId: 'pause-goal',
    goalId: 'easy-goal', status: 'paused', basis: 'user_explicit', reason: 'Synthetic pause.',
    sourceRef: 'source:synthetic-pause', at: at(4) }).state;
  const result = A.rankWithGoal(personal, paused, input);
  assert.equal(result.eligible, false);
  assert.equal(result.ranking, null);
  assert.equal(result.persistentPreferencesChanged, false);
});
test('unknown required candidate features stay excluded when the goal is connected to existing ranking', () => {
  const { personal, decision } = fixture();
  const next = D.recordGoal(decision, { expectedRevision: decision.revision, goalId: 'offline-goal', scope,
    goal: 'Use the synthetic tool offline.', reason: 'Synthetic explicit offline requirement.', basis: 'user_explicit',
    priorities: [], constraints: [{ key: 'offline', operator: 'gte', value: 1,
      reason: 'Synthetic tool must work offline.', sourceRef: 'source:synthetic-offline' }],
    validUntil: null, supersedes: 'easy-goal', sourceRef: 'source:synthetic-offline', at: at(3) }).state;
  const result = A.rankWithGoal(personal, next, { goalId: 'offline-goal', at: at(4), scope, candidates });
  assert.equal(result.ranking.ranks.length, 0);
  assert.equal(result.ranking.excluded.length, 2);
  assert.ok(result.ranking.excluded.every(row => row.reasons[0].code === 'constraint_unknown'));
});
