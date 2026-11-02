/** SYNTHETIC decision scenarios only. These are not actual owner goals or satisfaction reports. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import './runtime.js';

const D = globalThis.JHDecisionLearning;
const BASE = Date.parse('2026-11-02T00:00:00.000Z');
const at = (seconds = 0) => new Date(BASE + seconds * 1000).toISOString();
const SCOPE = { topic: 'synthetic-software', project: 'synthetic-project', aspect: 'setup' };
const fresh = () => D.createState({ ownerScope: 'synthetic-decision-owner', now: at() });
const common = state => ({ expectedRevision: state.revision, sourceRef: `source:synthetic-${state.revision + 1}`, at: at(state.revision + 1) });
const goalInput = (state, overrides = {}) => ({
  ...common(state), goalId: `goal-${state.revision + 1}`, scope: SCOPE,
  goal: 'Finish a synthetic setup with few manual steps.',
  reason: 'The synthetic user needs a repeatable setup for this project.',
  basis: 'user_explicit', priorities: [{ key: 'setup_ease', direction: 'higher', weight: 3,
    reason: 'Fewer manual steps matter for this synthetic task.', sourceRef: 'source:synthetic-priority' }],
  constraints: [{ key: 'local_operation', operator: 'gte', value: 1,
    reason: 'This synthetic task requires local operation.', sourceRef: 'source:synthetic-constraint' }],
  validUntil: null, supersedes: null, ...overrides,
});
const addGoal = (state = fresh(), overrides = {}) => D.recordGoal(state, goalInput(state, overrides)).state;
const predictionInput = (state, overrides = {}) => ({
  ...common(state), predictionId: `prediction-${state.revision + 1}`, goalId: 'goal-1', optionId: 'synthetic-simple-option',
  expected: [{ key: 'manual_steps', unit: 'count', min: 0, max: 3 }, { key: 'setup_duration', unit: 'minutes', min: null, max: 10 }],
  expectedBenefit: 'Reduce repeated setup work in this synthetic project.',
  expectedBurden: 'One short local setup is expected.',
  uncertainties: ['The actual machine has not yet been tested.'], ...overrides,
});
const addPrediction = (state = addGoal(), overrides = {}) => D.recordPrediction(state, predictionInput(state, overrides)).state;
const outcomeInput = (state, overrides = {}) => ({
  ...common(state), outcomeId: `outcome-${state.revision + 1}`, predictionId: 'prediction-2',
  observed: [{ key: 'manual_steps', unit: 'count', value: 2 }, { key: 'setup_duration', unit: 'minutes', value: 8 }],
  summary: 'Synthetic observation of the completed setup.', basis: 'host_verified', ...overrides,
});
const addOutcome = (state = addPrediction(), overrides = {}) => D.recordOutcome(state, outcomeInput(state, overrides)).state;
const reviewInput = (state, overrides = {}) => ({
  ...common(state), reviewId: `review-${state.revision + 1}`, outcomeId: 'outcome-3',
  cause: 'execution_issue', explanation: 'A synthetic environment issue may explain the extra steps.',
  proposedAdjustment: 'Check the environment before recommending this option again.', basis: 'reviewed_inference',
  evidenceRefs: ['source:synthetic-observation'], ...overrides,
});
const statusInput = (state, status, overrides = {}) => ({
  ...common(state), decisionId: `decision-${state.revision + 1}`, goalId: 'goal-1', status,
  basis: 'user_explicit', reason: `Synthetic user requests ${status}.`, ...overrides,
});
const candidate = (id, overrides = {}) => ({
  id, goalId: 'goal-1', label: `Synthetic proposal ${id}`, sourceRefs: [`source:synthetic-proposal-${id}`],
  stage: 'ready', eligible: true, benefit: 0.8, confidence: 1,
  setupBurden: 0.1, ongoingBurden: 0.1, interruptionCost: 0.1, ...overrides,
});
const proposals = (state, candidates, overrides = {}) => D.selectProposals(state, { goalId: 'goal-1', at: at(100), mode: 'normal', candidates, ...overrides });
const context = (state, overrides = {}) => D.goalContext(state, { goalId: 'goal-1', at: at(100), ...overrides });
const compare = (state, overrides = {}) => D.compare(state, { predictionId: 'prediction-2', outcomeId: 'outcome-3', ...overrides });
const reject = callback => assert.throws(callback, error => typeof error?.code === 'string' && /DECISION/.test(error.code));
const deepFreeze = value => {
  if (value && typeof value === 'object') { Object.freeze(value); for (const item of Object.values(value)) deepFreeze(item); }
  return value;
};

test('portable decision recording and comparison run without Node, network, or credential globals', () => {
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(new URL('./runtime.js', import.meta.url), 'utf8'), sandbox, { timeout: 2000 });
  const result = JSON.parse(vm.runInContext(`(() => {
    const api = JHDecisionLearning;
    let state = api.createState({ownerScope:'synthetic-vm',now:'${at()}'});
    state = api.recordGoal(state,{expectedRevision:0,goalId:'vm-goal',scope:{topic:'synthetic-test'},
      goal:'Test a synthetic option.',reason:'Verify a small decision lifecycle.',basis:'user_explicit',
      priorities:[],constraints:[],validUntil:null,supersedes:null,sourceRef:'source:synthetic-vm-goal',at:'${at(1)}'}).state;
    state = api.recordPrediction(state,{expectedRevision:1,predictionId:'vm-prediction',goalId:'vm-goal',optionId:'vm-option',
      expected:[{key:'steps',unit:'count',min:null,max:3}],expectedBenefit:'Fewer synthetic steps.',expectedBurden:'Small synthetic setup.',
      uncertainties:[],sourceRef:'source:synthetic-vm-prediction',at:'${at(2)}'}).state;
    state = api.recordOutcome(state,{expectedRevision:2,outcomeId:'vm-outcome',predictionId:'vm-prediction',observed:[],
      summary:'No synthetic measurement is available.',basis:'host_verified',sourceRef:'source:synthetic-vm-outcome',at:'${at(3)}'}).state;
    api.validateState(JSON.parse(JSON.stringify(state)));
    return JSON.stringify({schema:state.schema,comparison:api.compare(state,{predictionId:'vm-prediction',outcomeId:'vm-outcome'}),
      node:typeof process,network:typeof fetch,require:typeof require,fingerprint:api.fingerprint({b:2,a:1})});
  })()`, sandbox, { timeout: 2000 }));
  assert.equal(result.schema, 'jh.decision-learning.v1');
  assert.equal(result.comparison.overall, 'unknown');
  assert.equal(result.node, 'undefined');
  assert.equal(result.network, 'undefined');
  assert.equal(result.require, 'undefined');
  assert.equal(result.fingerprint, D.fingerprint({ a: 1, b: 2 }));
});

test('goal context preserves the explicit reason, exact scope, priorities, constraints, and expiry', () => {
  const state = addGoal(fresh(), { validUntil: at(100) });
  const before = structuredClone(state);
  const active = context(state, { at: at(99) });
  assert.equal(active.eligible, true);
  assert.equal(active.status, 'active');
  assert.deepEqual(active.scope, SCOPE);
  assert.match(active.reason, /repeatable setup/);
  assert.equal(active.priorities[0].key, 'setup_ease');
  assert.equal(active.constraints[0].key, 'local_operation');
  assert.equal(active.sourceRef, 'source:synthetic-1');
  assert.equal(context(state).eligible, false);
  assert.equal(proposals(state, [candidate('after-expiry')]).selected.length, 0);
  reject(() => D.recordPrediction(state, predictionInput(state, { at: at(100) })));
  assert.deepEqual(state, before);
});

test('a proposed goal inferred by the host stays unconfirmed until an explicit user activation', () => {
  let state = addGoal(fresh(), { basis: 'host_inferred' });
  assert.equal(context(state).eligible, false);
  assert.equal(context(state).status, 'proposed');
  assert.equal(proposals(state, [candidate('unconfirmed')]).selected.length, 0);
  reject(() => D.recordPrediction(state, predictionInput(state)));
  reject(() => D.setGoalStatus(state, statusInput(state, 'active', { basis: 'host_verified' })));
  state = D.setGoalStatus(state, statusInput(state, 'active')).state;
  assert.equal(context(state).eligible, true);
  const prediction = D.recordPrediction(state, predictionInput(state));
  assert.equal(prediction.state.revision, state.revision + 1);
});

test('pause prevents new recommendations and predictions, resume is explicit, and completed goals remain terminal', () => {
  let state = addGoal();
  state = D.setGoalStatus(state, statusInput(state, 'paused')).state;
  assert.equal(context(state).status, 'paused');
  assert.equal(proposals(state, [candidate('paused')]).selected.length, 0);
  reject(() => D.recordPrediction(state, predictionInput(state)));
  reject(() => D.setGoalStatus(state, statusInput(state, 'active', { basis: 'host_verified' })));
  state = D.setGoalStatus(state, statusInput(state, 'active')).state;
  assert.equal(context(state).eligible, true);
  state = D.setGoalStatus(state, statusInput(state, 'completed', { basis: 'host_verified' })).state;
  assert.equal(context(state).status, 'completed');
  reject(() => D.setGoalStatus(state, statusInput(state, 'active')));
  reject(() => D.recordPrediction(state, predictionInput(state)));
});

test('an explicit same-scope goal replacement preserves prior decisions and never revives the superseded goal', () => {
  let state = addPrediction();
  const predictionBefore = structuredClone(state.predictions['prediction-2']);
  reject(() => D.recordGoal(state, goalInput(state, { supersedes: 'goal-1', scope: { ...SCOPE, project: 'another-synthetic-project' } })));
  reject(() => D.recordGoal(state, goalInput(state, { supersedes: 'goal-1', basis: 'host_inferred' })));
  state = D.recordGoal(state, goalInput(state, { goalId: 'goal-replacement', supersedes: 'goal-1',
    goal: 'Prioritize synthetic control over setup speed.', priorities: [{ key: 'manual_control', direction: 'higher', weight: 4,
      reason: 'The synthetic user explicitly changes this project goal.', sourceRef: 'source:synthetic-goal-correction' }] })).state;
  assert.equal(context(state).status, 'superseded');
  assert.equal(context(state).eligible, false);
  assert.deepEqual(state.predictions['prediction-2'], predictionBefore);
  assert.equal(context(state, { goalId: 'goal-replacement' }).priorities[0].key, 'manual_control');
  state = D.setGoalStatus(state, statusInput(state, 'dismissed', { goalId: 'goal-replacement' })).state;
  assert.equal(context(state).eligible, false);
  reject(() => D.setGoalStatus(state, statusInput(state, 'active')));
  reject(() => D.setGoalStatus(state, statusInput(state, 'active', { goalId: 'goal-replacement' })));
  assert.deepEqual(state.predictions['prediction-2'], predictionBefore);
});

test('measurement comparisons distinguish matched, missed, partial, and wholly unknown results', () => {
  const predicted = addPrediction();
  const cases = [
    ['matched', [{ key: 'manual_steps', unit: 'count', value: 3 }, { key: 'setup_duration', unit: 'minutes', value: 10 }]],
    ['missed', [{ key: 'manual_steps', unit: 'count', value: 4 }, { key: 'setup_duration', unit: 'minutes', value: 8 }]],
    ['partial', [{ key: 'manual_steps', unit: 'count', value: 2 }]],
    ['unknown', []],
    ['unknown', [{ key: 'manual_steps', unit: 'count', value: null }, { key: 'setup_duration', unit: 'minutes', value: null }]],
  ];
  for (const [expectedStatus, observed] of cases) {
    const state = addOutcome(predicted, { observed });
    const result = compare(state);
    assert.equal(result.overall, expectedStatus);
    assert.equal(result.metrics.length, 2);
    assert.equal(result.predictionId, 'prediction-2');
    assert.equal(result.outcomeId, 'outcome-3');
    if (expectedStatus === 'unknown') assert.ok(result.metrics.every(metric => metric.status === 'unknown'));
    if (expectedStatus === 'partial') assert.equal(result.metrics.find(metric => metric.key === 'setup_duration').status, 'unknown');
  }
  assert.deepEqual(predicted.predictions['prediction-2'].expected,
    [{ key: 'manual_steps', unit: 'count', min: 0, max: 3 }, { key: 'setup_duration', unit: 'minutes', min: null, max: 10 }]);
});

test('a measured miss remains a miss when another metric is unobserved, without inventing a cause', () => {
  const state = addOutcome(addPrediction(), { observed: [{ key: 'manual_steps', unit: 'count', value: 7 }] });
  const result = compare(state);
  assert.equal(result.overall, 'missed');
  assert.equal(result.metrics.find(metric => metric.key === 'manual_steps').status, 'missed');
  assert.equal(result.metrics.find(metric => metric.key === 'setup_duration').status, 'unknown');
  assert.equal(Object.keys(state.reviews).length, 0);
  assert.equal(Object.hasOwn(result, 'cause'), false);
});

test('outcomes cannot precede predictions, mix measurement units, or compare unrelated predictions', () => {
  const goalState = addGoal();
  reject(() => D.recordOutcome(goalState, outcomeInput(goalState)));
  const predicted = addPrediction(goalState);
  reject(() => D.recordOutcome(predicted, outcomeInput(predicted, { at: at(1) })));
  reject(() => D.recordOutcome(predicted, outcomeInput(predicted, { observed: [{ key: 'setup_duration', unit: 'seconds', value: 8 }] })));
  reject(() => D.recordOutcome(predicted, outcomeInput(predicted, { observed: [{ key: 'undeclared_metric', unit: 'count', value: 1 }] })));
  let state = addOutcome(predicted);
  state = D.recordPrediction(state, predictionInput(state, { predictionId: 'another-prediction' })).state;
  reject(() => compare(state, { predictionId: 'another-prediction' }));
  reject(() => D.recordPrediction(predicted, predictionInput(predicted, { expected: [{ key: 'steps', unit: 'count', min: null, max: null }] })));
  reject(() => D.recordPrediction(predicted, predictionInput(predicted, { expected: [{ key: 'steps', unit: 'count', min: 5, max: 3 }] })));
});

test('later user reports preserve the original forecast and independently identify their observations', () => {
  let state = addOutcome();
  const prediction = structuredClone(state.predictions['prediction-2']);
  const originalOutcome = structuredClone(state.outcomes['outcome-3']);
  state = D.recordOutcome(state, outcomeInput(state, { outcomeId: 'later-user-report', basis: 'user_report',
    observed: [{ key: 'manual_steps', unit: 'count', value: 6 }], summary: 'Synthetic user reports more work on a second use.' })).state;
  assert.equal(compare(state).overall, 'matched');
  assert.equal(compare(state, { outcomeId: 'later-user-report' }).overall, 'missed');
  assert.equal(state.outcomes['later-user-report'].basis, 'user_report');
  assert.deepEqual(state.predictions['prediction-2'], prediction);
  assert.deepEqual(state.outcomes['outcome-3'], originalOutcome);
});

test('a reflection records a proposed explanation without silently changing goals or persistent preferences', () => {
  let state = addOutcome(addPrediction(), { observed: [{ key: 'manual_steps', unit: 'count', value: 8 }] });
  const goalBefore = structuredClone(state.goals['goal-1']);
  const predictionBefore = structuredClone(state.predictions['prediction-2']);
  const result = D.recordReview(state, reviewInput(state));
  state = result.state;
  assert.equal(state.reviews['review-4'].basis, 'reviewed_inference');
  assert.equal(state.reviews['review-4'].cause, 'execution_issue');
  assert.deepEqual(state.goals['goal-1'], goalBefore);
  assert.deepEqual(state.predictions['prediction-2'], predictionBefore);
  assert.equal(Object.hasOwn(state, 'preferences'), false);
  state = D.recordReview(state, reviewInput(state, { cause: 'unknown', basis: 'user_explicit',
    explanation: 'Synthetic user says it was unsatisfactory but does not know why.', proposedAdjustment: 'Ask only if the reason becomes useful.' })).state;
  assert.equal(state.reviews['review-5'].cause, 'unknown');
  assert.deepEqual(state.goals['goal-1'], goalBefore);
});

test('review context links same-scope past outcomes to their original forecasts without applying inferred adjustments', () => {
  let state = addOutcome();
  state = D.recordReview(state, reviewInput(state)).state;
  state = D.recordGoal(state, goalInput(state, { goalId: 'current-goal', supersedes: 'goal-1',
    goal: 'Prefer more synthetic control in the same project.', priorities: [{ key: 'control', direction: 'higher', weight: 4,
      reason: 'Synthetic explicit current goal.', sourceRef: 'source:synthetic-current-control' }] })).state;
  state = D.recordPrediction(state, predictionInput(state, { predictionId: 'current-prediction', goalId: 'current-goal' })).state;
  state = D.recordOutcome(state, outcomeInput(state, { outcomeId: 'current-outcome', predictionId: 'current-prediction' })).state;
  state = D.recordReview(state, reviewInput(state, { reviewId: 'current-review', outcomeId: 'current-outcome',
    cause: 'priority_interpretation', proposedAdjustment: 'Ask whether control mattered more than speed in this case.' })).state;
  for (const [suffix, scope] of [['other-project', { ...SCOPE, project: 'another-synthetic-project' }], ['general', { topic: SCOPE.topic }]]) {
    state = D.recordGoal(state, goalInput(state, { goalId: `goal-${suffix}`, scope })).state;
    state = D.recordPrediction(state, predictionInput(state, { predictionId: `prediction-${suffix}`, goalId: `goal-${suffix}` })).state;
    state = D.recordOutcome(state, outcomeInput(state, { outcomeId: `outcome-${suffix}`, predictionId: `prediction-${suffix}` })).state;
  }
  state = D.setGoalStatus(state, statusInput(state, 'paused', { goalId: 'current-goal' })).state;
  const before = D.fingerprint(state);
  const result = D.reviewContext(state, { goalId: 'current-goal', at: at(100) });
  assert.equal(result.goalContext.status, 'paused');
  assert.equal(result.goalContext.eligible, false);
  assert.equal(result.goalContext.priorities[0].key, 'control');
  assert.deepEqual(result.items.map(item => item.outcome.id), ['current-outcome', 'outcome-3']);
  assert.equal(result.totalAvailable, 2);
  assert.equal(result.omitted, 0);
  assert.equal(result.items[1].prediction.goalSnapshot.priorities[0].key, 'setup_ease');
  assert.equal(result.items[1].reviews[0].basis, 'reviewed_inference');
  assert.match(result.items[1].reviews[0].proposedAdjustment, /Check the environment/);
  assert.equal(result.causalityVerified, false);
  assert.equal(result.updatesGoalCriteria, false);
  assert.equal(result.updatesPreferences, false);
  assert.equal(result.authorizesExecution, false);
  const limited = D.reviewContext(state, { goalId: 'current-goal', at: at(100), limit: 1 });
  assert.equal(limited.items.length, 1);
  assert.equal(limited.omitted, 1);
  assert.equal(limited.totalAvailable, 2);
  assert.equal(D.fingerprint(state), before);
  reject(() => D.reviewContext(state, { goalId: 'current-goal', at: at(1) }));
  const noOutcome = D.reviewContext(addGoal(), { goalId: 'goal-1', at: at(100) });
  assert.equal(noOutcome.items.length, 0);
  assert.equal(noOutcome.totalAvailable, 0);
});

test('busy mode actually changes the selected proposal by weighing interruption cost', () => {
  const state = addGoal();
  const candidates = [
    candidate('intrusive', { benefit: 0.9, interruptionCost: 1 }),
    candidate('quiet', { benefit: 0.6, interruptionCost: 0 }),
  ];
  const normal = proposals(state, candidates);
  const busy = proposals(state, candidates, { mode: 'busy' });
  assert.equal(normal.selected[0].id, 'intrusive');
  assert.equal(busy.selected[0].id, 'quiet');
  assert.equal(normal.selected.length, 1);
  assert.equal(busy.selected.length, 1);
  assert.equal(busy.scoreKind, 'caller_supplied_expected_utility');
  assert.equal(busy.effectivenessVerified, false);
  assert.equal(busy.authorizesExecution, false);
  assert.equal(busy.hypothesesRemainUnconfirmed, true);
});

test('hard conditions and unknown evidence cannot be overcome by a high benefit score', () => {
  const state = addGoal();
  const candidates = [
    candidate('valid', { benefit: 0.6 }),
    candidate('wrong-goal', { benefit: 1, goalId: 'unrelated-synthetic-goal' }),
    candidate('blocked', { benefit: 1, stage: 'blocked' }),
    candidate('later', { benefit: 1, stage: 'later' }),
    candidate('ineligible', { benefit: 1, eligible: false }),
    candidate('unknown-eligibility', { benefit: 1, eligible: null }),
    candidate('no-sources', { benefit: 1, sourceRefs: [] }),
    candidate('unknown-confidence', { benefit: 1, confidence: null }),
    candidate('unknown-burden', { benefit: 1, setupBurden: null }),
  ];
  const result = proposals(state, candidates, { mode: 'explore', limit: 3 });
  assert.deepEqual(result.selected.map(item => item.id), ['valid']);
  assert.equal(result.deferred.length, candidates.length - 1);
  for (const item of result.deferred) assert.equal(typeof item.reason, 'string');
});

test('no useful proposal is a valid result, ordinary mode stays at one, and exploration keeps stable ties', () => {
  const state = addGoal();
  const none = proposals(state, [candidate('negative-value', { benefit: 0, setupBurden: 1, ongoingBurden: 1, interruptionCost: 1 })]);
  assert.equal(none.selected.length, 0);
  const ties = [candidate('zeta'), candidate('alpha'), candidate('middle')];
  assert.equal(proposals(state, ties, { limit: 3 }).selected.length, 1);
  assert.equal(proposals(state, ties, { mode: 'busy', limit: 3 }).selected.length, 1);
  const explored = proposals(state, ties, { mode: 'explore', limit: 3 });
  assert.deepEqual(explored.selected.map(item => item.id), ['alpha', 'middle', 'zeta']);
  assert.deepEqual(proposals(state, ties.toReversed(), { mode: 'explore', limit: 3 }).selected, explored.selected);
  assert.equal(proposals(state, ties, { mode: 'explore' }).selected.length, 1);
});

test('continue, reported completion, dislike, pause, and stop keep task context without fabricating satisfaction or dates', () => {
  const cases = [
    ['계속', 'continue_task'], ['계속진행', 'continue_task'], ['계속 진행!', 'continue_task'], ['다음 작업 진행', 'continue_task'],
    ['했어', 'reported_step_done'], ['별로야', 'negative_feedback_cause_unknown'], ['나중에', 'pause_task'], ['중지', 'stop_task'],
  ];
  for (const [text, intent] of cases) {
    const result = D.interpretTurn({ text, taskId: 'synthetic-task', pendingQuestion: null });
    assert.equal(result.intent, intent);
    assert.equal(result.persistPreference, false);
    assert.equal(result.authorizesExecution, false);
    assert.equal(result.externallyVerified, false);
    assert.ok(!result.scheduledAt && !result.satisfaction && !result.preference);
    const missing = D.interpretTurn({ text, taskId: null, pendingQuestion: null });
    assert.equal(missing.intent, 'context_required');
  }
});

test('yes only acknowledges a concrete pending question and never becomes a blanket action or preference approval', () => {
  for (const text of ['그래', '응', '네.']) {
    assert.equal(D.interpretTurn({ text, taskId: 'synthetic-task', pendingQuestion: null }).intent, 'context_required');
    for (const kind of ['action', 'choice', 'preference']) {
      const result = D.interpretTurn({ text, taskId: 'synthetic-task', pendingQuestion: { id: 'synthetic-question', kind, optionId: 'synthetic-option' } });
      assert.equal(result.intent, 'acknowledge_pending');
      assert.equal(result.authorizesExecution, false);
      assert.equal(result.persistPreference, false);
      assert.equal(result.externallyVerified, false);
    }
  }
  for (const text of ['좀 복잡하네', '오늘 피곤해 보이나?', '계속 말고 다른 것을 해줘', '했어?']) {
    const result = D.interpretTurn({ text, taskId: 'synthetic-task', pendingQuestion: null });
    assert.equal(result.intent, 'host_interpretation_required');
    assert.equal(result.persistPreference, false);
  }
});

test('lost-response retries are idempotent while changed content and stale new writes are rejected', () => {
  const original = fresh();
  const input = goalInput(original);
  const first = D.recordGoal(original, input);
  const retry = D.recordGoal(first.state, input);
  assert.equal(retry.result.duplicate, true);
  assert.equal(retry.result.changed, false);
  assert.deepEqual(retry.state, first.state);
  assert.equal(original.revision, 0);
  reject(() => D.recordGoal(first.state, { ...input, reason: 'Different synthetic content under the same event identity.' }));
  reject(() => D.recordGoal(first.state, { ...input, goalId: 'new-stale-goal' }));
  const prediction = predictionInput(first.state);
  const predicted = D.recordPrediction(first.state, prediction);
  assert.deepEqual(D.recordPrediction(predicted.state, prediction).state, predicted.state);
  const outcome = outcomeInput(predicted.state);
  const observed = D.recordOutcome(predicted.state, outcome);
  assert.deepEqual(D.recordOutcome(observed.state, outcome).state, observed.state);
  const review = reviewInput(observed.state);
  const reviewed = D.recordReview(observed.state, review);
  assert.deepEqual(D.recordReview(reviewed.state, review).state, reviewed.state);
});

test('retrying an old pause receipt after an explicit resume does not roll back the current goal', () => {
  let state = addGoal();
  const pause = statusInput(state, 'paused');
  state = D.setGoalStatus(state, pause).state;
  state = D.setGoalStatus(state, statusInput(state, 'active')).state;
  const resumed = structuredClone(state);
  const retry = D.setGoalStatus(state, pause);
  assert.equal(retry.result.duplicate, true);
  assert.equal(retry.result.changed, false);
  assert.deepEqual(retry.state, resumed);
  assert.equal(context(retry.state).status, 'active');
  const oldGoal = goalInput(fresh());
  assert.deepEqual(D.recordGoal(retry.state, oldGoal).state, resumed);
});

test('replaying serialized state preserves valid history and rejects tampered projections, events, and chronology', () => {
  const state = D.recordReview(addOutcome(), reviewInput(addOutcome())).state;
  assert.deepEqual(D.validateState(JSON.parse(JSON.stringify(state))), state);
  const tamperers = [
    value => { value.goals['goal-1'].reason = 'Unsupported synthetic rewritten reason.'; },
    value => { value.predictions['prediction-2'].expected[0].max = 100; },
    value => { value.outcomes['outcome-3'].observed[0].value = 1; },
    value => { value.revision += 1; },
    value => { delete value.events[Object.keys(value.events)[0]]; },
  ];
  for (const tamper of tamperers) {
    const copy = structuredClone(state);
    tamper(copy);
    reject(() => D.validateState(copy));
  }
  reject(() => D.recordGoal(state, goalInput(state, { at: at(1) })));
  reject(() => D.recordGoal(state, goalInput(state, { at: '2026-02-30T00:00:00.000Z' })));
});

test('untrusted JSON shapes, nonfinite numbers, duplicate evidence, and oversized candidate input are rejected', () => {
  const state = addGoal();
  const getter = goalInput(state);
  Object.defineProperty(getter, 'reason', { enumerable: true, get() { throw new Error('Getter must not run.'); } });
  reject(() => D.recordGoal(state, getter));
  const polluted = JSON.parse(JSON.stringify(goalInput(state)).replace(/\}$/, ',"__proto__":{"injected":true}}'));
  reject(() => D.recordGoal(state, polluted));
  reject(() => proposals(state, [candidate('nan', { benefit: NaN })]));
  reject(() => proposals(state, [candidate('outside-range', { confidence: 1.1 })]));
  reject(() => proposals(state, [candidate('duplicate-sources', { sourceRefs: ['source:synthetic', 'source:synthetic'] })]));
  reject(() => proposals(state, Array.from({ length: 21 }, (_, index) => candidate(`many-${index}`))));
  reject(() => D.recordPrediction(state, predictionInput(state, { expected: [{ key: 'steps', unit: 'count', min: 0, max: Infinity }] })));
  reject(() => D.recordGoal(state, goalInput(state, { reason: 'Bearer synthetic-secret-should-not-be-recorded' })));
  assert.equal(Object.prototype.injected, undefined);
});

test('read-only decisions do not modify frozen state, candidate evidence, or forecast inputs', () => {
  const state = deepFreeze(addOutcome());
  const candidates = deepFreeze([candidate('one'), candidate('two', { benefit: 0.5 })]);
  const before = D.fingerprint(state);
  const candidateBefore = JSON.stringify(candidates);
  context(state);
  compare(state);
  proposals(state, candidates);
  D.validateState(state);
  const input = deepFreeze(reviewInput(state));
  const written = D.recordReview(state, input);
  assert.equal(written.state.revision, state.revision + 1);
  assert.equal(D.fingerprint(state), before);
  assert.equal(JSON.stringify(candidates), candidateBefore);
  assert.ok(Buffer.byteLength(JSON.stringify(proposals(state, candidates))) < 512 * 1024);
});

test('large valid historical forecasts cannot amplify a review response beyond its complete-output budget', () => {
  const source = 'source:synthetic-'.padEnd(500, 'x');
  const reason = 'Synthetic reason '.padEnd(800, 'r');
  const priorities = Array.from({ length: 20 }, (_, index) => ({ key: `criterion-${index}`, direction: 'higher', weight: 3, reason, sourceRef: source }));
  const constraints = Array.from({ length: 20 }, (_, index) => ({ key: `condition-${index}`, operator: 'gte', value: 0, reason, sourceRef: source }));
  let state = addGoal(fresh(), { priorities, constraints });
  for (let index = 0; index < 10; index++) {
    state = D.recordPrediction(state, predictionInput(state, { predictionId: `large-prediction-${index}` })).state;
    state = D.recordOutcome(state, outcomeInput(state, { outcomeId: `large-outcome-${index}`, predictionId: `large-prediction-${index}` })).state;
  }
  const smaller = D.reviewContext(state, { goalId: 'goal-1', at: at(100), limit: 1 });
  assert.equal(smaller.items.length, 1);
  assert.equal(smaller.omitted, 9);
  assert.equal(smaller.items[0].prediction.goalSnapshot.priorities[0].sourceRef, source);
  assert.ok(Buffer.byteLength(JSON.stringify(smaller)) < 512 * 1024);
  assert.throws(() => D.reviewContext(state, { goalId: 'goal-1', at: at(100), limit: 10 }), error => error?.code === 'DECISION_OUTPUT_CAPACITY');
});
