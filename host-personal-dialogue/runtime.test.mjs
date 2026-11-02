/** SYNTHETIC dialogue scenarios only; no actual owner feedback or private conversation history. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import './runtime.js';

const D = globalThis.JHPersonalDialogue;
const BASE = Date.parse('2026-11-02T00:00:00.000Z');
const at = (seconds = 0) => new Date(BASE + seconds * 1000).toISOString();
const SCOPE = { topic: 'synthetic-software', project: 'synthetic-project', aspect: 'setup' };
const THREAD = 'synthetic-thread';
const fresh = () => D.createState({ ownerScope: 'synthetic-dialogue-owner', now: at() });
const common = state => ({ expectedRevision: state.revision, sourceRef: `source:synthetic-${state.revision + 1}`, at: at(state.revision + 1) });
const subjectInput = (state, overrides = {}) => ({ ...common(state), subjectId: 'subject-1', scope: SCOPE,
  label: 'Synthetic setup option', reason: 'Reduce repeated steps in this synthetic project.',
  sourceKind: 'user_explicit', externalRef: null, ...overrides });
const addSubject = (state = fresh(), overrides = {}) => D.recordSubject(state, subjectInput(state, overrides)).state;
const questionInput = (state, overrides = {}) => ({ ...common(state), questionId: 'question-1', subjectId: 'subject-1', threadId: THREAD,
  kind: 'proposal', rationale: 'A simpler synthetic setup may reduce repeated work.', proposal: 'Try the synthetic local option.',
  questionText: 'Would you like to consider this synthetic option?', basedOnFeedbackId: null, ...overrides });
const addQuestion = (state = addSubject(), overrides = {}) => D.recordQuestion(state, questionInput(state, overrides)).state;
const askedInput = (state, overrides = {}) => ({ ...common(state), presentationId: `presentation-${state.revision + 1}`,
  questionId: 'question-1', threadId: THREAD, ...overrides });
const ask = (state = addQuestion(), overrides = {}) => D.markAsked(state, askedInput(state, overrides)).state;
const feedbackInput = (state, overrides = {}) => ({ ...common(state), feedbackId: `feedback-${state.revision + 1}`,
  subjectId: 'subject-1', threadId: THREAD, route: 'spontaneous', questionId: null,
  phase: 'considering', signal: 'interested', summary: 'Synthetic user expresses interest before trying the option.',
  reason: null, appliesTo: 'unspecified', preferenceKey: null, useEvidenceRef: null, ...overrides });
const addFeedback = (state = addSubject(), overrides = {}) => D.recordFeedback(state, feedbackInput(state, overrides)).state;
const preference = (state, overrides = {}) => addFeedback(state, { phase: 'preference', signal: 'confirmed',
  appliesTo: 'ongoing', preferenceKey: 'setup-ease', summary: 'Synthetic user explicitly values setup ease.',
  reason: 'Repeated setup work should stay small for this project.', ...overrides });
const context = (state, overrides = {}) => D.dialogueContext(state, { scope: SCOPE, threadId: THREAD, at: at(1000), ...overrides });
const plan = (state, overrides = {}) => D.planQuestion(state, { threadId: THREAD, scope: SCOPE, at: at(1000), ...overrides });
const rejects = (callback, code) => assert.throws(callback, error => typeof error?.code === 'string' &&
  (code ? error.code === code : error.code.startsWith('DIALOGUE_')));
const deepFreeze = value => {
  if (value && typeof value === 'object') { Object.freeze(value); for (const item of Object.values(value)) deepFreeze(item); }
  return value;
};

test('a portable VM can retain spontaneous feedback without filesystem, network, or question globals', () => {
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(new URL('./runtime.js', import.meta.url), 'utf8'), sandbox, { timeout: 2000 });
  const result = JSON.parse(vm.runInContext(`(() => {
    const api = JHPersonalDialogue;
    let state = api.createState({ownerScope:'synthetic-vm-owner',now:'${at()}'});
    state = api.recordSubject(state,{expectedRevision:0,subjectId:'vm-subject',scope:{topic:'synthetic-topic'},
      label:'Synthetic option',reason:'Evaluate a small synthetic option.',sourceKind:'user_explicit',externalRef:null,
      sourceRef:'source:synthetic-vm-subject',at:'${at(1)}'}).state;
    state = api.recordFeedback(state,{expectedRevision:1,feedbackId:'vm-feedback',subjectId:'vm-subject',threadId:'vm-thread',
      route:'spontaneous',questionId:null,phase:'experience',signal:'not_used',summary:'The synthetic option has not been tried.',
      reason:null,appliesTo:'unspecified',preferenceKey:null,useEvidenceRef:null,sourceRef:'source:synthetic-vm-feedback',at:'${at(2)}'}).state;
    api.validateState(JSON.parse(JSON.stringify(state)));
    const view = api.dialogueContext(state,{scope:{topic:'synthetic-topic'},threadId:'vm-thread',at:'${at(3)}'});
    return JSON.stringify({schema:state.schema,view,questions:Object.keys(state.questions).length,
      process:typeof process,fetch:typeof fetch,require:typeof require,fingerprint:api.fingerprint({b:2,a:1})});
  })()`, sandbox, { timeout: 2000 }));
  assert.equal(result.schema, 'jh.personal-dialogue.v1');
  assert.equal(result.questions, 0);
  assert.equal(result.view.items[0].signal, 'not_used');
  assert.equal(result.view.items[0].afterUseReported, false);
  assert.equal(result.view.knownPreferences.length, 0);
  assert.equal(result.process, 'undefined');
  assert.equal(result.fetch, 'undefined');
  assert.equal(result.require, 'undefined');
  assert.equal(result.fingerprint, D.fingerprint({ a: 1, b: 2 }));
});

test('spontaneous feedback needs no fabricated question and preserves its actual reason and route', () => {
  const state = addFeedback(addSubject(), { reason: 'Synthetic user wants fewer manual steps.' });
  const view = context(state);
  assert.equal(Object.keys(state.questions).length, 0);
  assert.equal(Object.keys(state.presentations).length, 0);
  assert.equal(view.items[0].route, 'spontaneous');
  assert.equal(view.items[0].sourceAuthority, 'user_explicit');
  assert.equal(view.items[0].reason, 'Synthetic user wants fewer manual steps.');
  assert.equal(view.items[0].afterUseReported, false);
  assert.equal(view.knownPreferences.length, 0);
  assert.equal(view.pendingQuestion, null);
  assert.equal(plan(state).shouldAsk, false);
  assert.equal(plan(state).reason, 'no_draft');
  rejects(() => D.recordFeedback(state, feedbackInput(state, { questionId: 'invented-question' })));
  rejects(() => D.recordFeedback(state, { ...feedbackInput(state), sourceAuthority: 'model_inferred' }));
});

test('a question is only a draft until an output handoff is recorded, and that handoff does not prove reading', () => {
  const draft = addQuestion();
  assert.equal(draft.questions['question-1'].status, 'draft');
  assert.equal(plan(draft).shouldAsk, true);
  assert.equal(Object.keys(draft.presentations).length, 0);
  rejects(() => D.recordFeedback(draft, feedbackInput(draft, { route: 'elicited', questionId: 'question-1' })), 'DIALOGUE_QUESTION_STATE');
  rejects(() => D.markAsked(draft, askedInput(draft, { threadId: 'different-thread' })), 'DIALOGUE_THREAD_MISMATCH');
  const input = askedInput(draft);
  const asked = D.markAsked(draft, input).state;
  assert.equal(asked.questions['question-1'].status, 'asked');
  assert.equal(asked.presentations[input.presentationId].userReadVerified, false);
  assert.equal(plan(asked).reason, 'awaiting_reply');
  assert.equal(plan(asked).shouldAsk, false);
  assert.equal(plan(asked).promptPreview, null);
  assert.equal(plan(asked).authorizesExecution, false);
  assert.equal(context(asked).userReadVerified, false);
});

test('elicited feedback binds the exact asked question, subject, thread, and question phase', () => {
  let state = ask();
  state = addSubject(state, { subjectId: 'subject-other' });
  rejects(() => D.recordFeedback(state, feedbackInput(state, { route: 'elicited', questionId: null })));
  rejects(() => D.recordFeedback(state, feedbackInput(state, { route: 'elicited', questionId: 'missing-question' })), 'DIALOGUE_QUESTION_NOT_FOUND');
  rejects(() => D.recordFeedback(state, feedbackInput(state, { route: 'elicited', questionId: 'question-1', subjectId: 'subject-other' })), 'DIALOGUE_SUBJECT_MISMATCH');
  rejects(() => D.recordFeedback(state, feedbackInput(state, { route: 'elicited', questionId: 'question-1', threadId: 'other-thread' })), 'DIALOGUE_THREAD_MISMATCH');
  rejects(() => D.recordFeedback(state, feedbackInput(state, { route: 'elicited', questionId: 'question-1', phase: 'experience',
    signal: 'positive', useEvidenceRef: 'source:synthetic-use' })), 'DIALOGUE_PHASE_MISMATCH');
  state = D.recordFeedback(state, feedbackInput(state, { route: 'elicited', questionId: 'question-1', signal: 'chosen' })).state;
  assert.equal(state.questions['question-1'].status, 'answered');
  assert.equal(context(state).items[0].phase, 'considering');
  assert.equal(context(state).items[0].signal, 'chosen');
  assert.equal(context(state).items[0].afterUseReported, false);
  rejects(() => D.recordFeedback(state, feedbackInput(state, { route: 'elicited', questionId: 'question-1' })), 'DIALOGUE_QUESTION_STATE');
});

test('one asked question blocks further questions in its thread even across scopes, but never leaks into another thread', () => {
  let state = ask();
  const otherScope = { ...SCOPE, aspect: 'answer' };
  state = addSubject(state, { subjectId: 'subject-other-scope', scope: otherScope });
  state = addQuestion(state, { questionId: 'question-other-scope', subjectId: 'subject-other-scope' });
  const blocked = plan(state, { scope: otherScope });
  assert.equal(blocked.shouldAsk, false);
  assert.equal(blocked.reason, 'awaiting_reply');
  assert.deepEqual(blocked.subject.scope, SCOPE);
  assert.equal(blocked.question.id, 'question-1');
  assert.deepEqual(context(state, { scope: otherScope }).pendingQuestion.subject.scope, SCOPE);
  rejects(() => D.markAsked(state, askedInput(state, { questionId: 'question-other-scope' })), 'DIALOGUE_PENDING_QUESTION');
  assert.equal(context(state, { threadId: 'other-thread' }).pendingQuestion, null);
  state = addQuestion(state, { questionId: 'question-other-thread', threadId: 'other-thread' });
  state = ask(state, { questionId: 'question-other-thread', threadId: 'other-thread' });
  assert.equal(context(state, { threadId: 'other-thread' }).pendingQuestion.question.id, 'question-other-thread');
  assert.equal(context(state).pendingQuestion.question.id, 'question-1');
});

test('question planning returns one oldest matching draft and retains the reason, proposal, question, and feedback sources', () => {
  let state = addFeedback();
  state = addQuestion(state, { basedOnFeedbackId: 'feedback-2' });
  state = addQuestion(state, { questionId: 'later-clarification', kind: 'clarification', proposal: null,
    questionText: 'Which synthetic setup step mattered most?' });
  const before = D.fingerprint(state);
  const result = plan(state);
  assert.equal(result.shouldAsk, true);
  assert.equal(result.question.id, 'question-1');
  assert.equal(result.promptPreview, 'A simpler synthetic setup may reduce repeated work. Try the synthetic local option. Would you like to consider this synthetic option?');
  for (const source of ['source:synthetic-1', 'source:synthetic-2', 'source:synthetic-3']) assert.ok(result.sourceRefs.includes(source));
  assert.equal(plan(state, { scope: { ...SCOPE, project: 'other-project' } }).reason, 'no_draft');
  assert.equal(plan(state, { threadId: 'other-thread' }).reason, 'no_draft');
  assert.equal(context(state).draftQuestions.length, 2);
  assert.equal(D.fingerprint(state), before);
});

test('draft, asked, answered, deferred, and dismissed questions cannot be cloned into repeated prompts', () => {
  const draft = addQuestion();
  const asked = ask(draft);
  const cases = [draft, asked];
  for (const signal of ['interested', 'paused', 'declined']) {
    cases.push(addFeedback(asked, { route: 'elicited', questionId: 'question-1', signal }));
  }
  assert.deepEqual(cases.map(state => state.questions['question-1'].status), ['draft', 'asked', 'answered', 'deferred', 'dismissed']);
  for (const state of cases) {
    rejects(() => D.recordQuestion(state, questionInput(state, { questionId: 'duplicate-new-id' })), 'DIALOGUE_QUESTION_DUPLICATE');
  }
  for (const state of cases.slice(2)) {
    assert.equal(plan(state).shouldAsk, false);
    assert.equal(plan(state).reason, 'no_draft');
    rejects(() => D.markAsked(state, askedInput(state)), 'DIALOGUE_QUESTION_STATE');
    rejects(() => D.recordFeedback(state, feedbackInput(state, { route: 'elicited', questionId: 'question-1' })), 'DIALOGUE_QUESTION_STATE');
  }
});

test('spontaneous feedback while a question is pending does not fabricate an answer or close that question', () => {
  let state = ask();
  state = addFeedback(state, { phase: 'experience', signal: 'negative', useEvidenceRef: 'source:synthetic-user-use-report',
    summary: 'Synthetic user volunteers that a trial required too many steps.', reason: 'Too many repeated setup steps.' });
  assert.equal(state.questions['question-1'].status, 'asked');
  assert.equal(plan(state).reason, 'awaiting_reply');
  assert.equal(context(state).items[0].route, 'spontaneous');
  assert.equal(context(state).items[0].afterUseReported, true);
  assert.equal(context(state).knownPreferences.length, 0);
  assert.equal(Object.keys(state.feedback).length, 1);
});

test('parking an obsolete question unblocks its thread without inventing an answer, and never causes automatic reasking', () => {
  let state = ask();
  state = addSubject(state, { subjectId: 'new-context-subject' });
  state = addQuestion(state, { questionId: 'new-context-question', subjectId: 'new-context-subject' });
  const parking = { ...common(state), parkingId: 'context-parking', questionId: 'question-1', threadId: THREAD,
    reason: 'The synthetic conversation moved to another subject.' };
  rejects(() => D.parkQuestion(state, { ...parking, threadId: 'wrong-thread' }), 'DIALOGUE_THREAD_MISMATCH');
  state = D.parkQuestion(state, parking).state;
  assert.equal(state.questions['question-1'].status, 'parked');
  assert.equal(Object.keys(state.feedback).length, 0);
  assert.equal(context(state).pendingQuestion, null);
  assert.equal(context(state).knownPreferences.length, 0);
  assert.equal(context(state).currentTaskPreferences.length, 0);
  assert.equal(plan(state).shouldAsk, true);
  assert.equal(plan(state).question.id, 'new-context-question');
  const recent = context(state).recentQuestions.find(item => item.question.id === 'question-1');
  assert.equal(recent.parking.basis, 'host_context_change');
  assert.equal(recent.parking.reason, parking.reason);
  rejects(() => D.recordQuestion(state, questionInput(state, { questionId: 'parked-clone' })), 'DIALOGUE_QUESTION_DUPLICATE');
  rejects(() => D.recordFeedback(state, feedbackInput(state, { route: 'elicited', questionId: 'question-1' })), 'DIALOGUE_QUESTION_STATE');
  state = ask(state, { questionId: 'new-context-question' });
  const retried = D.parkQuestion(state, parking);
  assert.equal(retried.result.duplicate, true);
  assert.deepEqual(retried.state, state);
  assert.equal(plan(retried.state).question.id, 'new-context-question');
  assert.equal(plan(retried.state).reason, 'awaiting_reply');
  rejects(() => D.parkQuestion(state, { ...common(state), parkingId: 'second-parking', questionId: 'question-1', threadId: THREAD,
    reason: 'Do not silently reopen the parked question.' }), 'DIALOGUE_QUESTION_STATE');
});

test('interest, choice, refusal, and uncertainty remain pre-use evidence rather than satisfaction or permanent taste', () => {
  let state = addSubject();
  for (const signal of ['interested', 'chosen', 'declined', 'paused', 'uncertain', 'change_requested']) {
    state = addFeedback(state, { signal, reason: signal === 'uncertain' ? null : 'Synthetic pre-use reason.' });
  }
  const view = context(state, { limit: 10 });
  assert.equal(view.items.length, 6);
  assert.ok(view.items.every(item => item.phase === 'considering' && item.afterUseReported === false));
  assert.equal(view.knownPreferences.length, 0);
  assert.equal(view.unresolvedPreferences.length, 0);
  assert.equal(view.currentTaskPreferences.length, 0);
  rejects(() => D.recordFeedback(state, feedbackInput(state, { useEvidenceRef: 'source:invented-use' })));
});

test('actual-use signals require a user-report reference, while not_used never means dissatisfaction', () => {
  const initial = addSubject();
  for (const signal of ['positive', 'mixed', 'negative']) {
    rejects(() => D.recordFeedback(initial, feedbackInput(initial, { phase: 'experience', signal })));
    const state = addFeedback(initial, { phase: 'experience', signal, useEvidenceRef: 'source:synthetic-use-report' });
    assert.equal(context(state).items[0].signal, signal);
    assert.equal(context(state).items[0].afterUseReported, true);
    assert.equal(context(state).knownPreferences.length, 0);
  }
  const unused = addFeedback(initial, { phase: 'experience', signal: 'not_used', summary: 'Synthetic user has not tried the option.' });
  assert.equal(context(unused).items[0].signal, 'not_used');
  assert.equal(context(unused).items[0].afterUseReported, false);
  assert.equal(context(unused).knownPreferences.length, 0);
  rejects(() => D.recordFeedback(initial, feedbackInput(initial, { phase: 'experience', signal: 'not_used', useEvidenceRef: 'source:synthetic-use' })));
  const uncertain = addFeedback(initial, { phase: 'experience', signal: 'uncertain' });
  assert.equal(context(uncertain).items[0].afterUseReported, false);
  const uncertainAfterUse = addFeedback(initial, { phase: 'experience', signal: 'uncertain', useEvidenceRef: 'source:synthetic-use' });
  assert.equal(context(uncertainAfterUse).items[0].afterUseReported, true);
});

test('experience questions accept experience reports, and clarification can record an explicit preference', () => {
  let state = addQuestion(addSubject(), { kind: 'experience', proposal: null, questionText: 'How was the synthetic trial?' });
  state = ask(state);
  rejects(() => D.recordFeedback(state, feedbackInput(state, { route: 'elicited', questionId: 'question-1', signal: 'chosen' })), 'DIALOGUE_PHASE_MISMATCH');
  state = addFeedback(state, { route: 'elicited', questionId: 'question-1', phase: 'experience', signal: 'not_used' });
  assert.equal(state.questions['question-1'].status, 'answered');
  assert.equal(context(state).items[0].afterUseReported, false);
  state = addQuestion(state, { questionId: 'clarify-preference', kind: 'clarification', proposal: null, questionText: 'Is ease an ongoing priority for this project?' });
  state = ask(state, { questionId: 'clarify-preference' });
  state = preference(state, { route: 'elicited', questionId: 'clarify-preference' });
  assert.equal(state.questions['clarify-preference'].status, 'answered');
  assert.equal(context(state).knownPreferences[0].preferenceKey, 'setup-ease');
});

test('spontaneous and elicited explicit preferences have equal authority and the same preference effect', () => {
  const spontaneous = preference(addSubject());
  let elicited = addQuestion(addSubject(), { kind: 'clarification', proposal: null });
  elicited = ask(elicited);
  elicited = preference(elicited, { route: 'elicited', questionId: 'question-1' });
  const spontaneousPreference = context(spontaneous).knownPreferences[0];
  const elicitedPreference = context(elicited).knownPreferences[0];
  for (const key of ['phase', 'signal', 'summary', 'reason', 'appliesTo', 'preferenceKey', 'sourceAuthority', 'afterUseReported']) {
    assert.deepEqual(spontaneousPreference[key], elicitedPreference[key]);
  }
  assert.equal(spontaneousPreference.route, 'spontaneous');
  assert.equal(elicitedPreference.route, 'elicited');
  assert.equal(context(spontaneous).infersPreferences, false);
  assert.equal(context(elicited).infersPreferences, false);
});

test('a later uncertain preference blocks old confirmation even outside the displayed history window', () => {
  let state = preference(addSubject());
  const original = structuredClone(state.feedback['feedback-2']);
  state = preference(state, { signal: 'corrected', summary: 'Synthetic user now values manual control more.', reason: 'The synthetic trial exposed a need for control.' });
  state = preference(state, { signal: 'uncertain', summary: 'Synthetic user is no longer sure which setup priority matters.', reason: null });
  state = addFeedback(state, { summary: 'Synthetic unrelated interest after the uncertainty.' });
  const view = context(state, { limit: 1 });
  assert.equal(view.items.length, 1);
  assert.equal(view.items[0].phase, 'considering');
  assert.equal(view.omitted, 3);
  assert.equal(view.knownPreferences.length, 0);
  assert.equal(view.unresolvedPreferences.length, 1);
  assert.equal(view.unresolvedPreferences[0].id, 'feedback-4');
  assert.equal(view.unresolvedPreferences[0].signal, 'uncertain');
  assert.deepEqual(state.feedback['feedback-2'], original);
  state = preference(state, { signal: 'confirmed', summary: 'Synthetic user explicitly reconfirms setup ease.' });
  assert.equal(context(state).knownPreferences[0].id, 'feedback-6');
  assert.equal(context(state).unresolvedPreferences.length, 0);
});

test('current-task preferences stay in their thread and remain separate from ongoing preferences', () => {
  let state = preference(addSubject());
  state = preference(state, { appliesTo: 'this_task', summary: 'For this synthetic task, favor control over ease.' });
  state = preference(state, { appliesTo: 'this_task', signal: 'uncertain', summary: 'This task-specific priority is uncertain.' });
  const current = context(state);
  assert.equal(current.knownPreferences[0].id, 'feedback-2');
  assert.equal(current.currentTaskPreferences.length, 1);
  assert.equal(current.currentTaskPreferences[0].signal, 'uncertain');
  assert.equal(current.currentTaskPreferences[0].appliesTo, 'this_task');
  const other = context(state, { threadId: 'another-thread' });
  assert.equal(other.currentTaskPreferences.length, 0);
  assert.equal(other.knownPreferences[0].id, 'feedback-2');
  for (const scope of [{ topic: SCOPE.topic }, { ...SCOPE, aspect: 'answer' }, { ...SCOPE, project: 'another-project' }]) {
    const unrelated = context(state, { scope });
    assert.equal(unrelated.knownPreferences.length, 0);
    assert.equal(unrelated.currentTaskPreferences.length, 0);
    assert.equal(unrelated.items.length, 0);
  }
});

test('unspecified duration and positive experience remain evidence without inventing a permanent preference', () => {
  let state = preference(addSubject(), { appliesTo: 'unspecified' });
  state = addFeedback(state, { phase: 'experience', signal: 'positive', useEvidenceRef: 'source:synthetic-positive-use',
    summary: 'Synthetic user says the option worked well.' });
  const view = context(state);
  assert.equal(view.items.length, 2);
  assert.equal(view.knownPreferences.length, 0);
  assert.equal(view.unresolvedPreferences.length, 0);
  assert.equal(view.currentTaskPreferences.length, 0);
  assert.equal(view.authorizesExecution, false);
  assert.equal(view.infersPreferences, false);
  rejects(() => D.recordFeedback(state, feedbackInput(state, { phase: 'preference', signal: 'confirmed', preferenceKey: null })));
  rejects(() => D.recordFeedback(state, feedbackInput(state, { preferenceKey: 'invented-preference' })));
});

test('a new question may cite real feedback only for its exact subject', () => {
  let state = addFeedback();
  state = addSubject(state, { subjectId: 'other-subject' });
  rejects(() => D.recordQuestion(state, questionInput(state, { subjectId: 'other-subject', basedOnFeedbackId: 'feedback-2' })), 'DIALOGUE_SUBJECT_MISMATCH');
  rejects(() => D.recordQuestion(state, questionInput(state, { basedOnFeedbackId: 'missing-feedback' })), 'DIALOGUE_FEEDBACK_NOT_FOUND');
  const valid = addQuestion(state, { basedOnFeedbackId: 'feedback-2', kind: 'experience', proposal: null,
    questionText: 'Did the synthetic trial reduce setup work?' });
  assert.ok(plan(valid).sourceRefs.includes('source:synthetic-2'));
  assert.equal(valid.questions['question-1'].basedOnFeedbackId, 'feedback-2');
});

test('exact retries survive later progress while content conflicts and stale new writes are rejected', () => {
  const empty = fresh();
  const subject = subjectInput(empty);
  let state = D.recordSubject(empty, subject).state;
  const question = questionInput(state);
  state = D.recordQuestion(state, question).state;
  const presentation = askedInput(state);
  state = D.markAsked(state, presentation).state;
  const feedback = feedbackInput(state, { route: 'elicited', questionId: 'question-1' });
  state = D.recordFeedback(state, feedback).state;
  for (const [method, input] of [['recordSubject', subject], ['recordQuestion', question], ['markAsked', presentation], ['recordFeedback', feedback]]) {
    const retry = D[method](state, input);
    assert.equal(retry.result.duplicate, true);
    assert.equal(retry.result.changed, false);
    assert.deepEqual(retry.state, state);
    assert.equal(retry.state.questions['question-1'].status, 'answered');
  }
  assert.equal(empty.revision, 0);
  rejects(() => D.recordFeedback(state, { ...feedback, summary: 'Different synthetic content under the same feedback ID.' }), 'DIALOGUE_ID_CONFLICT');
  rejects(() => D.recordFeedback(state, { ...feedback, feedbackId: 'stale-new-feedback' }), 'DIALOGUE_REVISION_CONFLICT');
  rejects(() => D.recordSubject(state, { ...subject, label: 'Different synthetic subject content.' }), 'DIALOGUE_ID_CONFLICT');
});

test('serialized event replay rejects rewritten question status, feedback phase, and missing history', () => {
  const state = addFeedback(ask(), { route: 'elicited', questionId: 'question-1' });
  assert.deepEqual(D.validateState(JSON.parse(JSON.stringify(state))), state);
  for (const change of [
    value => { value.questions['question-1'].status = 'asked'; },
    value => { value.feedback['feedback-4'].afterUseReported = true; },
    value => { value.feedback['feedback-4'].sourceAuthority = 'model_inferred'; },
    value => { value.subjects['subject-1'].scope.project = 'another-project'; },
    value => { delete value.events[Object.keys(value.events)[0]]; },
    value => { value.revision += 1; },
  ]) {
    const tampered = structuredClone(state);
    change(tampered);
    rejects(() => D.validateState(tampered), 'DIALOGUE_STATE_INVALID');
  }
  rejects(() => D.recordFeedback(state, feedbackInput(state, { at: at(1) })), 'DIALOGUE_TIME_ORDER');
  rejects(() => D.recordFeedback(state, feedbackInput(state, { at: '2026-02-30T00:00:00.000Z' })));
});

test('untrusted object shapes, undeclared fields, invalid phase combinations, and reader limits are rejected', () => {
  const state = addSubject();
  const getter = feedbackInput(state);
  Object.defineProperty(getter, 'summary', { enumerable: true, get() { throw new Error('Getter must not execute.'); } });
  rejects(() => D.recordFeedback(state, getter));
  const polluted = JSON.parse(JSON.stringify(feedbackInput(state)).replace(/\}$/, ',"__proto__":{"injected":true}}'));
  rejects(() => D.recordFeedback(state, polluted));
  rejects(() => D.recordFeedback(state, feedbackInput(state, { phase: 'considering', signal: 'positive' })));
  rejects(() => D.recordFeedback(state, feedbackInput(state, { phase: 'experience', signal: 'chosen' })));
  rejects(() => D.recordFeedback(state, feedbackInput(state, { phase: 'preference', signal: 'negative', preferenceKey: 'ease' })));
  rejects(() => D.recordQuestion(state, questionInput(state, { kind: 'experience' })));
  rejects(() => D.recordQuestion(state, questionInput(state, { proposal: null })));
  rejects(() => context(state, { limit: 0 }));
  rejects(() => context(state, { limit: 11 }));
  rejects(() => plan(state, { at: at(0) }), 'DIALOGUE_TIME_ORDER');
  assert.equal(Object.prototype.injected, undefined);
});

test('planning, context reads, validation, and mutations preserve frozen source state and payloads', () => {
  const state = deepFreeze(addQuestion(addFeedback(), { basedOnFeedbackId: 'feedback-2' }));
  const before = D.fingerprint(state);
  plan(state);
  context(state);
  D.validateState(state);
  const input = deepFreeze(askedInput(state));
  const next = D.markAsked(state, input);
  assert.equal(next.state.revision, state.revision + 1);
  assert.equal(next.state.questions['question-1'].status, 'asked');
  assert.equal(state.questions['question-1'].status, 'draft');
  assert.equal(D.fingerprint(state), before);
});

test('large valid preference evidence is rejected at the output budget rather than silently omitted or truncated', () => {
  const source = 'source:synthetic-'.padEnd(500, 'x');
  const summary = 'Synthetic explicit preference. '.padEnd(1200, 's');
  const reason = 'Synthetic reason. '.padEnd(800, 'r');
  let state = addSubject();
  for (let index = 0; index < 220; index++) {
    state = preference(state, { preferenceKey: `criterion-${index}`, summary, reason, sourceRef: source });
  }
  const before = D.fingerprint(state);
  assert.ok(Buffer.byteLength(JSON.stringify(state)) < 2 * 1024 * 1024);
  assert.equal(Object.keys(state.feedback).length, 220);
  assert.throws(() => context(state, { limit: 1 }), error => error?.code === 'DIALOGUE_OUTPUT_CAPACITY');
  assert.equal(D.fingerprint(state), before);
  assert.equal(state.feedback['feedback-2'].summary, summary);
  assert.equal(state.feedback['feedback-221'].sourceRef, source);
});
