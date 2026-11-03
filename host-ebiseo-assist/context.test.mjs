/** Synthetic host envelopes and records only; no private owner information. */
import test from 'node:test';
import assert from 'node:assert/strict';
import '../host-personal-dialogue/runtime.js';
import '../host-personal-dialogue/context-adapter.js';
import '../host-personalization/runtime.js';
import '../host-decision-learning/runtime.js';
import '../host-decision-learning/personalization-adapter.js';
import {contextWithJH, parseRequest} from './context.mjs';

const L = globalThis.JHPersonalDialogue, P = globalThis.JHPersonalization, D = globalThis.JHDecisionLearning;
const APIS = {dialogue: L, personal: P, decision: D, dialogueBridge: globalThis.JHPersonalDialogueBridge,
  decisionContext: globalThis.JHDecisionContext};
const OWNER = 'synthetic-ebiseo-owner';
const SCOPE = {topic: 'synthetic-development', project: 'synthetic-project', aspect: 'setup'};
const at = (seconds = 0) => new Date(Date.parse('2026-11-03T00:00:00.000Z') + seconds * 1000).toISOString();
const common = state => ({expectedRevision: state.revision, at: at(state.revision + 1),
  sourceRef: `source:synthetic-event-${state.revision + 1}`});
const empty = () => ({dialogue: null, personal: null, decision: null});
const request = overrides => ({ownerScope: OWNER, scope: SCOPE, threadId: 'synthetic-current-thread',
  taskId: 'synthetic-current-task', at: at(1000), invocation: {intent: 'consult', basis: 'direct',
    sourceRef: 'user:synthetic-current-invocation'}, ...overrides});
const invoke = (states, overrides, apis = APIS) => contextWithJH(states, request(overrides), apis);
const freshDialogue = () => L.recordSubject(L.createState({ownerScope: OWNER, now: at()}), {
  expectedRevision: 0, at: at(1), sourceRef: 'source:synthetic-subject', subjectId: 'synthetic-subject',
  scope: SCOPE, label: 'Synthetic setup review', reason: 'Review the current synthetic task.',
  sourceKind: 'user_explicit', externalRef: null}).state;
const feedback = (state, overrides = {}) => L.recordFeedback(state, {...common(state),
  feedbackId: `synthetic-feedback-${state.revision + 1}`, subjectId: 'synthetic-subject',
  threadId: 'synthetic-prior-thread', route: 'spontaneous', questionId: null,
  phase: 'preference', signal: 'confirmed', summary: 'Synthetic explicit preference for fewer setup steps.',
  reason: 'Synthetic user values less repeated setup.', appliesTo: 'ongoing', preferenceKey: 'setup_ease',
  useEvidenceRef: null, ...overrides}).state;
const personal = () => P.recordPreference(P.createState({ownerScope: OWNER, now: at()}), {
  expectedRevision: 0, sourceRef: 'source:synthetic-preference', at: at(1), preferenceId: 'synthetic-preference',
  scope: SCOPE, key: 'setup_ease', direction: 'higher', weight: 3, status: 'confirmed',
  reason: 'Synthetic explicit setup preference.'}).state;
const decision = (scope = SCOPE) => D.recordGoal(D.createState({ownerScope: OWNER, now: at()}), {
  expectedRevision: 0, sourceRef: 'source:synthetic-goal', at: at(1), goalId: 'synthetic-goal', scope,
  goal: 'Complete the synthetic setup.', reason: 'Finish the current synthetic work.', basis: 'user_explicit',
  priorities: [], constraints: [], validUntil: null, supersedes: null}).state;
const candidates = () => [{id: 'simple', label: 'Synthetic simple option', features: {setup_ease: 1},
  sourceRefs: ['source:synthetic-simple']}, {id: 'manual', label: 'Synthetic manual option',
  features: {setup_ease: 0}, sourceRefs: ['source:synthetic-manual']}];
const forbidden = new Proxy({}, {get() { throw new Error('Unexpected state or API access'); },
  ownKeys() { throw new Error('Unexpected state enumeration'); }});
const code = expected => error => error?.code === expected;

for (const basis of ['quoted', 'negated', 'hypothetical', 'about_assistant']) {
  test(`host-classified ${basis} input does not inspect state or APIs`, () => {
    const result = contextWithJH(forbidden, request({invocation: {intent: 'consult', basis,
      sourceRef: 'user:synthetic-non-invocation'}}), forbidden);
    assert.equal(result.active, false);
    assert.equal(result.reason, 'non_invoking_basis');
    assert.equal(result.dialogue, null);
    assert.equal(result.authorizesExecution, false);
  });
}
test('no invocation also performs no state or API access', () => {
  const result = contextWithJH(forbidden, request({invocation: {intent: 'none', basis: 'direct',
    sourceRef: 'user:synthetic-no-call'}}), forbidden);
  assert.equal(result.reason, 'no_invocation');
  assert.equal(result.active, false);
});
test('all supported invocation intents consume the same real scoped dialogue reader', () => {
  const states = {...empty(), dialogue: feedback(freshDialogue())};
  for (const intent of ['consult', 'reference', 'assist']) {
    const result = invoke(states, {invocation: {intent, basis: 'contextual_user_request',
      sourceRef: 'user:synthetic-contextual-call'}});
    assert.equal(result.active, true);
    assert.equal(result.dialogue.knownPreferences[0].preferenceKey, 'setup_ease');
    assert.equal(result.invocation.intent, intent);
    assert.equal(result.naturalLanguageClassified, false);
    assert.equal(result.hostInterpretationVerified, false);
    assert.equal(result.authorizesExecution, false);
  }
});
test('missing supplied states remain explicit unknowns and create no state or goal', () => {
  const result = invoke(empty(), undefined, forbidden);
  assert.deepEqual(result.unavailable, ['dialogue', 'personal', 'decision'].map(component =>
    ({component, reason: 'state_not_supplied'})));
  assert.equal(result.dialogue, null);
  assert.equal(result.decision, null);
  assert.equal(result.ranking, null);
  assert.deepEqual(result.stateRevisions, {dialogue: null, personal: null, decision: null});
});
test('another thread task-specific preference is historical, never current or ongoing', () => {
  let state = feedback(freshDialogue());
  state = feedback(state, {appliesTo: 'this_task', preferenceKey: 'synthetic_one_time_exception'});
  const result = invoke({...empty(), dialogue: state});
  assert.equal(result.historicalEvidence.length, 1);
  assert.equal(result.historicalEvidence[0].threadId, 'synthetic-prior-thread');
  assert.equal(result.dialogue.items.length, 1);
  assert.equal(result.dialogue.currentTaskPreferences.length, 0);
  assert.deepEqual(result.dialogue.knownPreferences.map(item => item.preferenceKey), ['setup_ease']);
  assert.deepEqual(result.dialogue.evidenceCounts, {available: 2, omitted: 0, currentOrShared: 1, historical: 1});
});
test('the current thread retains its one-time condition without making it ongoing', () => {
  const state = feedback(freshDialogue(), {threadId: 'synthetic-current-thread', appliesTo: 'this_task'});
  const result = invoke({...empty(), dialogue: state});
  assert.equal(result.historicalEvidence.length, 0);
  assert.equal(result.dialogue.currentTaskPreferences.length, 1);
  assert.equal(result.dialogue.knownPreferences.length, 0);
});
test('pending questions from other threads are not transferred', () => {
  let state = freshDialogue();
  state = L.recordQuestion(state, {...common(state), questionId: 'synthetic-question',
    subjectId: 'synthetic-subject', threadId: 'synthetic-prior-thread', kind: 'clarification',
    rationale: 'Resolve one synthetic detail.', proposal: null, questionText: 'Which synthetic option?',
    basedOnFeedbackId: null}).state;
  state = L.markAsked(state, {...common(state), presentationId: 'synthetic-presentation',
    questionId: 'synthetic-question', threadId: 'synthetic-prior-thread'}).state;
  const result = invoke({...empty(), dialogue: state});
  assert.equal(result.dialogue.pendingQuestion, null);
  assert.deepEqual(result.dialogue.recentQuestions, []);
});
test('a newer uncertain preference does not revive the earlier confirmed preference', () => {
  const state = feedback(feedback(freshDialogue()), {signal: 'uncertain', summary: 'Synthetic user is now unsure.'});
  const result = invoke({...empty(), dialogue: state});
  assert.equal(result.dialogue.knownPreferences.length, 0);
  assert.equal(result.dialogue.unresolvedPreferences.length, 1);
  assert.equal(result.dialogue.unresolvedPreferences[0].signal, 'uncertain');
});
test('owner mismatch rejects present state instead of silently substituting an empty state', () => {
  const state = L.createState({ownerScope: 'synthetic-other-owner', now: at()});
  assert.throws(() => invoke({...empty(), dialogue: state}), code('EBISEO_OWNER_MISMATCH'));
});
test('exact scope is required when attaching a stored goal', () => {
  const states = {...empty(), decision: decision({...SCOPE, aspect: 'unrelated'})};
  assert.throws(() => invoke(states, {goalId: 'synthetic-goal'}), code('EBISEO_SCOPE_MISMATCH'));
  states.dialogue = freshDialogue();
  assert.throws(() => invoke(states, {goalId: 'synthetic-goal'}), code('DIALOGUE_CONTEXT_SCOPE_MISMATCH'));
});
test('actual candidate ranking reuses current-turn priority overrides', () => {
  const result = invoke({...empty(), personal: personal()}, {ranking: {candidates: candidates(), context: {
    priorities: [{key: 'setup_ease', direction: 'lower', weight: 3,
      reason: 'Synthetic explicit exception for this comparison.', sourceRef: 'user:synthetic-current-exception'}]}}});
  assert.equal(result.ranking.ranks[0].candidateId, 'manual');
  assert.equal(result.ranking.effectiveCriteria[0].basis, 'current');
  assert.equal(result.persistentStateChanged, false);
});
test('no candidate list means no ranking call and no fabricated candidate', () => {
  const apis = {...APIS, personal: {...P, rank() { throw new Error('Ranking must not run'); }}};
  const result = invoke({...empty(), personal: personal()}, undefined, apis);
  assert.equal(result.ranking, null);
  assert.ok(result.skipped.some(item => item.reason === 'no_candidates_supplied'));
  assert.throws(() => invoke({...empty(), personal: personal()}, {ranking: {candidates: []}}), code('EBISEO_INPUT_INVALID'));
});
test('a requested but unavailable goal cannot be bypassed with personalization-only ranking', () => {
  const apis = {...APIS, personal: {...P, rank() { throw new Error('Goal must not be bypassed'); }}};
  const result = invoke({...empty(), personal: personal()}, {goalId: 'synthetic-goal',
    ranking: {candidates: candidates()}}, apis);
  assert.equal(result.ranking, null);
  assert.ok(result.skipped.some(item => item.reason === 'decision_state_not_supplied'));
});
for (const status of ['paused', 'completed']) {
  test(`${status} goals stay ineligible and do not revive during assistance`, () => {
    let state = decision();
    state = D.setGoalStatus(state, {...common(state), decisionId: 'synthetic-status',
      goalId: 'synthetic-goal', status, basis: 'user_explicit', reason: 'Synthetic owner status decision.'}).state;
    const result = invoke({dialogue: freshDialogue(), decision: state, personal: personal()}, {
      goalId: 'synthetic-goal', ranking: {candidates: candidates()}});
    assert.equal(result.decision.goalContext.status, status);
    assert.equal(result.decision.goalContext.eligible, false);
    assert.equal(result.ranking, null);
    assert.ok(result.skipped.some(item => item.reason === 'goal_ineligible'));
  });
}
test('real combined context and ranking preserve all source states and original evidence', () => {
  const states = {dialogue: feedback(freshDialogue()), personal: personal(), decision: decision()};
  const before = [L.fingerprint(states.dialogue), P.fingerprint(states.personal), D.fingerprint(states.decision)];
  const result = invoke(states, {goalId: 'synthetic-goal', ranking: {candidates: candidates()}});
  assert.equal(result.ranking.ranks[0].candidateId, 'simple');
  assert.equal(result.decision.goalContext.sourceRef, 'source:synthetic-goal');
  assert.equal(result.dialogue.knownPreferences[0].sourceRef, 'source:synthetic-event-2');
  assert.deepEqual([L.fingerprint(states.dialogue), P.fingerprint(states.personal), D.fingerprint(states.decision)], before);
  assert.equal(result.persistentStateChanged, false);
  assert.equal(result.authorizesExecution, false);
});
test('corrupt present records fail validation instead of claiming that memory is absent', () => {
  const state = personal(); state.revision += 1;
  assert.throws(() => invoke({...empty(), personal: state}), error => error?.code?.startsWith('PERSONALIZATION_'));
});
test('envelope validation rejects accessors, scope inflation, and claimed authority', () => {
  let accessed = false;
  const accessor = request();
  Object.defineProperty(accessor, 'scope', {enumerable: true, get() { accessed = true; return SCOPE; }});
  assert.throws(() => parseRequest(accessor), code('EBISEO_INPUT_INVALID'));
  assert.equal(accessed, false);
  assert.throws(() => parseRequest(request({scope: {...SCOPE, allThreads: true}})), code('EBISEO_INPUT_INVALID'));
  assert.throws(() => parseRequest({...request(), authorizesExecution: true}), code('EBISEO_INPUT_INVALID'));
  assert.throws(() => parseRequest(request({invocation: {intent: 'auto_execute', basis: 'direct',
    sourceRef: 'user:synthetic-invalid-intent'}})), code('EBISEO_INPUT_INVALID'));
});
