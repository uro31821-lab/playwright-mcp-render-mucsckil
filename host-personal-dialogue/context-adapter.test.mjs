/** SYNTHETIC bridge scenarios. No private profiles, actual user reports or network. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import '../host-decision-learning/runtime.js';
import './runtime.js';
import './context-adapter.js';

const L = globalThis.JHPersonalDialogue;
const D = globalThis.JHDecisionLearning;
const B = globalThis.JHPersonalDialogueBridge;
const OWNER = 'synthetic-dialogue-bridge-owner';
const SCOPE = { topic: 'synthetic-setup', project: 'synthetic-project', aspect: 'installation' };
const BASE = Date.parse('2026-11-02T00:00:00.000Z');
const at = seconds => new Date(BASE + seconds * 1000).toISOString();
const input = overrides => ({ scope: SCOPE, threadId: 'synthetic-thread', at: at(100), goalId: 'synthetic-goal', ...overrides });
const common = (state, name) => ({ expectedRevision: state.revision, at: at(state.revision + 1),
  sourceRef: 'source:synthetic-' + name });
const deepFreeze = value => {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
};
const rejectsCode = (callback, ...codes) => assert.throws(callback, error => codes.includes(error?.code));

function dialogueState() {
  let state = L.createState({ ownerScope: OWNER, now: at(0) });
  state = L.recordSubject(state, { ...common(state, 'subject'), subjectId: 'synthetic-subject', scope: SCOPE,
    label: 'Synthetic setup choice', reason: 'Connect a synthetic report to its setup decision.',
    sourceKind: 'host_reviewed', externalRef: { system: 'decision_learning', id: 'synthetic-goal' } }).state;
  state = L.recordFeedback(state, { ...common(state, 'user-use-report'), feedbackId: 'synthetic-feedback',
    subjectId: 'synthetic-subject', threadId: 'synthetic-thread', route: 'spontaneous', questionId: null,
    phase: 'experience', signal: 'mixed', summary: 'Synthetic report: the setup worked but required more steps.',
    reason: 'The synthetic user reports additional manual work.', appliesTo: 'this_task', preferenceKey: null,
    useEvidenceRef: 'source:synthetic-user-use-report' }).state;
  return state;
}

function decisionState({ ownerScope = OWNER, scope = SCOPE } = {}) {
  let state = D.createState({ ownerScope, now: at(0) });
  state = D.recordGoal(state, { ...common(state, 'goal'), goalId: 'synthetic-goal', scope,
    goal: 'Finish synthetic setup in at most three manual steps.', reason: 'Reduce synthetic setup work.',
    basis: 'user_explicit', priorities: [], constraints: [], validUntil: null, supersedes: null }).state;
  state = D.recordPrediction(state, { ...common(state, 'prediction'), predictionId: 'synthetic-prediction',
    goalId: 'synthetic-goal', optionId: 'synthetic-option',
    expected: [{ key: 'manual_steps', unit: 'count', min: 0, max: 3 }],
    expectedBenefit: 'Fewer synthetic manual steps.', expectedBurden: 'A short synthetic setup.',
    uncertainties: ['The synthetic option has not been measured yet.'] }).state;
  state = D.recordOutcome(state, { ...common(state, 'outcome'), outcomeId: 'synthetic-outcome',
    predictionId: 'synthetic-prediction', observed: [{ key: 'manual_steps', unit: 'count', value: 7 }],
    summary: 'Synthetic user report of seven manual steps.', basis: 'user_report' }).state;
  state = D.recordReview(state, { ...common(state, 'review'), reviewId: 'synthetic-review',
    outcomeId: 'synthetic-outcome', cause: 'execution_issue',
    explanation: 'A synthetic environment difference may have added steps.',
    proposedAdjustment: 'Check the synthetic environment before another recommendation.',
    basis: 'reviewed_inference', evidenceRefs: ['source:synthetic-outcome'] }).state;
  return state;
}

function assertNoAuthority(result) {
  assert.equal(result.updatesPreferences, false);
  assert.equal(result.infersPreferences, false);
  assert.equal(result.externalReferencesVerified, false);
  assert.equal(result.authorizesExecution, false);
  assert.equal(result.dialogue.authorizesExecution, false);
  if (result.decision !== null) {
    assert.equal(result.decision.authorizesExecution, false);
    assert.equal(result.decision.updatesPreferences, false);
    assert.equal(result.decision.updatesGoalCriteria, false);
    assert.equal(result.decision.causalityVerified, false);
  }
}

test('dialogue-only context works in a minimal realm with no decision runtime and preserves explicit evidence', () => {
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(new URL('./runtime.js', import.meta.url), 'utf8'), sandbox, { timeout: 2000 });
  vm.runInContext(readFileSync(new URL('./context-adapter.js', import.meta.url), 'utf8'), sandbox, { timeout: 2000 });
  function isolatedScenario() {
    const L = JHPersonalDialogue;
    const at = seconds => new Date(Date.parse('2026-11-02T00:00:00.000Z') + seconds * 1000).toISOString();
    const scope = { topic: 'synthetic-software', aspect: 'answers' };
    let state = L.createState({ ownerScope: 'synthetic-isolated-owner', now: at(0) });
    state = L.recordSubject(state, { expectedRevision: 0, subjectId: 'synthetic-subject', scope,
      label: 'Synthetic answer preference', reason: 'Retain an explicit synthetic statement.',
      sourceKind: 'user_explicit', externalRef: null, sourceRef: 'source:synthetic-subject', at: at(1) }).state;
    state = L.recordFeedback(state, { expectedRevision: 1, feedbackId: 'synthetic-preference', subjectId: 'synthetic-subject',
      threadId: 'synthetic-thread', route: 'spontaneous', questionId: null, phase: 'preference', signal: 'confirmed',
      summary: 'Synthetic user asks for detailed explanations in this scope.', reason: null, appliesTo: 'ongoing',
      preferenceKey: 'answer_detail', useEvidenceRef: null, sourceRef: 'source:synthetic-explicit-preference', at: at(2) }).state;
    const before = JSON.stringify(state);
    const context = JHPersonalDialogueBridge.context(state, null, { scope, threadId: 'synthetic-thread', at: at(3), goalId: null });
    return JSON.stringify({ context, unchanged: before === JSON.stringify(state), decisionRuntime: typeof JHDecisionLearning,
      network: typeof fetch, node: typeof process });
  }
  const result = JSON.parse(vm.runInContext('(' + isolatedScenario.toString() + ')()', sandbox, { timeout: 2000 }));
  assert.equal(result.decisionRuntime, 'undefined');
  assert.equal(result.network, 'undefined');
  assert.equal(result.node, 'undefined');
  assert.equal(result.unchanged, true);
  assert.equal(result.context.decision, null);
  assert.equal(result.context.dialogue.knownPreferences.length, 1);
  assert.equal(result.context.dialogue.knownPreferences[0].id, 'synthetic-preference');
  assert.equal(result.context.dialogue.knownPreferences[0].sourceRef, 'source:synthetic-explicit-preference');
  assert.equal(result.context.dialogue.knownPreferences[0].route, 'spontaneous');
  assertNoAuthority(result.context);
});

test('optional decision context carries real snapshots and comparisons only for the same owner and exact scope', () => {
  const dialogue = deepFreeze(dialogueState()), decision = deepFreeze(decisionState()), request = deepFreeze(input());
  const before = JSON.stringify({ dialogue, decision, request });
  const result = B.context(dialogue, decision, request);
  assert.equal(result.dialogue.items[0].id, 'synthetic-feedback');
  assert.equal(result.dialogue.items[0].afterUseReported, true);
  assert.equal(result.dialogue.knownPreferences.length, 0);
  assert.equal(result.decision.goalContext.goalId, 'synthetic-goal');
  assert.deepEqual(result.decision.scope, SCOPE);
  assert.equal(result.decision.items.length, 1);
  const evidence = result.decision.items[0];
  assert.equal(evidence.prediction.id, 'synthetic-prediction');
  assert.equal(evidence.prediction.goalSnapshot.goal, 'Finish synthetic setup in at most three manual steps.');
  assert.deepEqual(evidence.prediction.expected, [{ key: 'manual_steps', unit: 'count', min: 0, max: 3 }]);
  assert.equal(evidence.outcome.id, 'synthetic-outcome');
  assert.equal(evidence.outcome.basis, 'user_report');
  assert.equal(evidence.comparison.overall, 'missed');
  assert.equal(evidence.comparison.metrics[0].value, 7);
  assert.equal(evidence.reviews[0].basis, 'reviewed_inference');
  assert.equal(evidence.reviews[0].proposedAdjustment, 'Check the synthetic environment before another recommendation.');
  assertNoAuthority(result);
  assert.equal(JSON.stringify({ dialogue, decision, request }), before);

  // Editing the consumer's returned copy must not rewrite either input history.
  evidence.prediction.goalSnapshot.goal = 'Changed only in the consumer copy.';
  result.dialogue.items[0].summary = 'Changed only in the consumer copy.';
  assert.equal(JSON.stringify({ dialogue, decision, request }), before);

  const otherOwner = deepFreeze(decisionState({ ownerScope: 'synthetic-other-owner' }));
  const otherBefore = JSON.stringify(otherOwner);
  rejectsCode(() => B.context(dialogue, otherOwner, input()), 'DIALOGUE_CONTEXT_OWNER_MISMATCH');
  assert.equal(JSON.stringify(otherOwner), otherBefore);
  for (const scope of [
    { ...SCOPE, project: 'synthetic-other-project' },
    { ...SCOPE, aspect: 'synthetic-other-aspect' },
    { topic: SCOPE.topic },
  ]) {
    const mismatched = deepFreeze(decisionState({ scope })), snapshot = JSON.stringify(mismatched);
    rejectsCode(() => B.context(dialogue, mismatched, input()), 'DIALOGUE_CONTEXT_SCOPE_MISMATCH');
    assert.equal(JSON.stringify(mismatched), snapshot);
  }
  assert.equal(JSON.stringify({ dialogue, decision, request }), before);
});

test('malformed requests and missing runtimes fail before mutation or any authorization is created', () => {
  const dialogue = deepFreeze(dialogueState()), decision = deepFreeze(decisionState());
  const before = JSON.stringify({ dialogue, decision });
  rejectsCode(() => B.context(dialogue, null, { ...input({ goalId: null }), writePreference: true }),
    'DIALOGUE_CONTEXT_INPUT_INVALID');
  const missingGoal = input();
  delete missingGoal.goalId;
  rejectsCode(() => B.context(dialogue, null, missingGoal), 'DIALOGUE_CONTEXT_INPUT_INVALID');
  rejectsCode(() => B.context(dialogue, decision, input({ goalId: null })), 'DIALOGUE_CONTEXT_INPUT_INVALID');
  rejectsCode(() => B.context(dialogue, null, input()), 'DECISION_STATE_INVALID');
  rejectsCode(() => B.context(dialogue, null, input({ goalId: null, limit: 0 })), 'DIALOGUE_INPUT_INVALID');
  rejectsCode(() => B.context({ ...dialogue, schema: 'synthetic-corrupt' }, null, input({ goalId: null })),
    'DIALOGUE_STATE_INVALID');

  let getterCalls = 0;
  const accessor = input({ goalId: null });
  Object.defineProperty(accessor, 'scope', { enumerable: true, get() { getterCalls++; return SCOPE; } });
  rejectsCode(() => B.context(dialogue, null, accessor), 'DIALOGUE_INPUT_INVALID');
  assert.equal(getterCalls, 0);
  const poisoned = JSON.parse(JSON.stringify(input({ goalId: null })));
  Object.defineProperty(poisoned, '__proto__', { value: { syntheticPolluted: true }, enumerable: true });
  rejectsCode(() => B.context(dialogue, null, poisoned), 'DIALOGUE_INPUT_INVALID');
  assert.equal({}.syntheticPolluted, undefined);

  const previousDialogue = globalThis.JHPersonalDialogue;
  const previousDecision = globalThis.JHDecisionLearning;
  try {
    delete globalThis.JHPersonalDialogue;
    rejectsCode(() => B.context(dialogue, null, input({ goalId: null })), 'DIALOGUE_CONTEXT_RUNTIME_UNAVAILABLE');
    globalThis.JHPersonalDialogue = previousDialogue;
    delete globalThis.JHDecisionLearning;
    rejectsCode(() => B.context(dialogue, decision, input()), 'DIALOGUE_CONTEXT_RUNTIME_UNAVAILABLE');
    globalThis.JHDecisionLearning = { VERSION: 'synthetic-incompatible-version' };
    rejectsCode(() => B.context(dialogue, decision, input()), 'DIALOGUE_CONTEXT_RUNTIME_UNAVAILABLE');
  } finally {
    globalThis.JHPersonalDialogue = previousDialogue;
    globalThis.JHDecisionLearning = previousDecision;
  }
  assert.equal(JSON.stringify({ dialogue, decision }), before);
  assertNoAuthority(B.context(dialogue, decision, input()));
});
