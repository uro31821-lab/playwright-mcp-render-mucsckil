/** SYNTHETIC personalization scenarios only; no actual owner preferences or private history. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import './runtime.js';

const P = globalThis.JHPersonalization;
const BASE = Date.parse('2026-11-02T00:00:00.000Z');
const at = (seconds = 0) => new Date(BASE + seconds * 1000).toISOString();
const SCOPE = { topic: 'software.selection', project: 'synthetic-project', aspect: 'setup' };
const fresh = (ownerScope = 'synthetic-owner') => P.createState({ ownerScope, now: at() });
const common = state => ({ expectedRevision: state.revision, sourceRef: `source:synthetic-event-${state.revision + 1}`, at: at(state.revision + 1) });
const preferenceInput = (state, overrides = {}) => ({ ...common(state), preferenceId: `pref-${state.revision + 1}`,
  scope: SCOPE, key: 'setup_ease', direction: 'higher', weight: 3, status: 'confirmed',
  reason: 'Synthetic explicit preference for an easier setup.', ...overrides });
const add = (state, overrides = {}) => P.recordPreference(state, preferenceInput(state, overrides)).state;
const candidate = (id, features, sourceRefs = [`source:synthetic-candidate-${id}`]) => ({ id, label: `Synthetic ${id}`, features, sourceRefs });
const rankInput = (candidates, overrides = {}) => ({ at: at(100), scope: SCOPE, candidates, ...overrides });
const rank = (state, candidates, overrides = {}) => P.rank(state, rankInput(candidates, overrides));
const choiceInput = (state, overrides = {}) => ({ ...common(state), choiceId: `choice-${state.revision + 1}`,
  scope: SCOPE, candidateId: 'automatic', reason: 'Synthetic stated choice reason.', criteria: [], ...overrides });
const throwsCode = (callback, ...codes) => assert.throws(callback, error => codes.includes(error?.code));

test('a full synthetic lifecycle runs in a minimal VM without imports, network, or credential globals', () => {
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(new URL('./runtime.js', import.meta.url), 'utf8'), sandbox, { timeout: 2000 });
  const result = JSON.parse(vm.runInContext(`(() => {
    const api = JHPersonalization;
    let state = api.createState({ownerScope:'synthetic-vm-owner',now:'${at()}'});
    const scope = {topic:'synthetic-topic',project:'synthetic-project',aspect:'setup'};
    state = api.recordPreference(state,{expectedRevision:0,preferenceId:'vm-pref',scope,key:'ease',direction:'higher',weight:3,
      status:'confirmed',reason:'Synthetic explicit setup choice.',sourceRef:'source:synthetic-vm',at:'${at(1)}'}).state;
    state = api.recordChoice(state,{expectedRevision:state.revision,choiceId:'vm-choice',scope,candidateId:'simple',
      reason:'Synthetic setup was selected.',criteria:[{preferenceId:'vm-pref',reason:'Setup ease mattered.'}],
      sourceRef:'source:synthetic-vm-choice',at:'${at(2)}'}).state;
    state = api.recordFeedback(state,{expectedRevision:state.revision,feedbackId:'vm-feedback',choiceId:'vm-choice',
      basis:'after_use',outcome:'positive',summary:'Synthetic after-use feedback.',updates:[],
      sourceRef:'source:synthetic-vm-feedback',at:'${at(3)}'}).state;
    const ranked = api.rank(state,{at:'${at(4)}',scope,candidates:[
      {id:'simple',label:'Synthetic simple',features:{ease:1},sourceRefs:['source:synthetic-simple']},
      {id:'complex',label:'Synthetic complex',features:{ease:0},sourceRefs:['source:synthetic-complex']}
    ]});
    api.validateState(JSON.parse(JSON.stringify(state)));
    return JSON.stringify({schema:state.schema,owner:state.ownerScope,winner:ranked.ranks[0].candidateId,
      verified:ranked.featureTruthVerified,node:typeof process,network:typeof fetch,require:typeof require,
      fingerprint:api.fingerprint({b:2,a:1})});
  })()`, sandbox));
  assert.equal(result.schema, 'jh.personalization.v1');
  assert.equal(result.owner, 'synthetic-vm-owner');
  assert.equal(result.winner, 'simple');
  assert.equal(result.verified, false);
  assert.equal(result.node, 'undefined');
  assert.equal(result.network, 'undefined');
  assert.equal(result.require, 'undefined');
  assert.equal(result.fingerprint, P.fingerprint({ a: 1, b: 2 }));
});

test('wanting an easy setup does not assert a preference for brief answers or another project', () => {
  const state = add(fresh());
  const setup = rank(state, [candidate('manual', { setup_ease: 0 }), candidate('simple', { setup_ease: 1 })]);
  assert.equal(setup.ranks[0].candidateId, 'simple');
  for (const scope of [{ ...SCOPE, aspect: 'answer' }, { ...SCOPE, project: 'different-synthetic-project' }]) {
    const result = rank(state, [candidate('brief', { answer_brevity: 1 }), candidate('detailed', { answer_brevity: 0 })], { scope });
    assert.equal(result.effectiveCriteria.length, 0);
    assert.ok(result.ranks.every(item => item.score === null));
  }
});

test('an uncertain soft-or-crispy statement stays unresolved rather than becoming a confident taste rule', () => {
  const scope = { topic: 'synthetic.food', aspect: 'texture' };
  const state = add(fresh(), { scope, key: 'crispness', status: 'uncertain', reason: 'Synthetic speaker is unsure whether softer or crispier is preferable.' });
  const result = rank(state, [candidate('soft', { crispness: 0 }), candidate('crispy', { crispness: 1 })], { scope });
  assert.equal(result.effectiveCriteria.length, 0);
  assert.equal(result.unresolved.length, 1);
  assert.equal(result.unresolved[0].status, 'uncertain');
  assert.equal(result.unresolved[0].criterionId, 'pref-1');
  assert.ok(result.ranks.every(item => item.score === null));
  assert.deepEqual(result.unresolved[0].sourceRefs, ['source:synthetic-event-1']);
  const chosen = P.recordChoice(state, choiceInput(state, { scope, candidateId: 'crispy',
    reason: 'Synthetic trial of the crispier option while still uncertain.',
    criteria: [{ preferenceId: 'pref-1', reason: 'Synthetic uncertainty motivates a trial, not a confirmed preference.' }] })).state;
  const afterChoice = rank(chosen, [candidate('soft', { crispness: 0 }), candidate('crispy', { crispness: 1 })], { scope });
  assert.equal(afterChoice.unresolved[0].status, 'uncertain');
  assert.equal(afterChoice.effectiveCriteria.length, 0);
});

test('an initial choice and positive use report do not invent preferences without explicit feedback updates', () => {
  let state = fresh();
  state = P.recordChoice(state, choiceInput(state, { choiceId: 'initial-interest', reason: 'Synthetic interest; this option has not been tried.' })).state;
  const candidates = [candidate('automatic', { automation: 1 }), candidate('manual', { automation: 0 })];
  assert.ok(rank(state, candidates).ranks.every(item => item.score === null));
  const originalChoice = structuredClone(state.choices['initial-interest']);
  state = P.recordFeedback(state, { ...common(state), feedbackId: 'first-use', choiceId: 'initial-interest', basis: 'after_use',
    outcome: 'positive', summary: 'Synthetic user reports the first use worked.', updates: [] }).state;
  assert.ok(rank(state, candidates).ranks.every(item => item.score === null));
  assert.equal(Object.keys(state.preferences).length, 0);
  assert.deepEqual(state.choices['initial-interest'], originalChoice);
  assert.equal(state.feedback['first-use'].basis, 'after_use');
});

test('explicit after-use feedback changes only the exact choice scope and preserves its history', () => {
  let state = add(fresh(), { scope: { topic: SCOPE.topic }, key: 'automation', reason: 'Synthetic initial preference for automation.' });
  const candidates = [candidate('automatic', { automation: 1 }), candidate('manual', { automation: 0 })];
  const before = rank(state, candidates);
  assert.equal(before.ranks[0].candidateId, 'automatic');
  state = P.recordChoice(state, choiceInput(state, { choiceId: 'chosen-automatic', criteria: [{ preferenceId: 'pref-1', reason: 'Synthetic initial automation preference.' }] })).state;
  const oldPreference = structuredClone(state.preferences['pref-1']);
  state = P.recordFeedback(state, { ...common(state), feedbackId: 'used-automatic', choiceId: 'chosen-automatic', basis: 'after_use',
    outcome: 'negative', summary: 'Synthetic actual use showed manual control is preferable in this setup.',
    updates: [{ preferenceId: 'after-use-manual', key: 'automation', direction: 'lower', weight: 4, status: 'confirmed',
      reason: 'Synthetic explicit after-use correction for this setup.', explicit: true }] }).state;
  const changed = rank(state, candidates);
  assert.equal(changed.ranks[0].candidateId, 'manual');
  assert.equal(changed.effectiveCriteria[0].basis, 'after_use');
  assert.equal(changed.effectiveCriteria[0].criterionId, 'after-use-manual');
  assert.ok(changed.effectiveCriteria[0].sourceRefs.includes('source:synthetic-event-3'));
  assert.deepEqual(state.preferences['pref-1'], oldPreference);
  assert.equal(rank(state, candidates, { scope: { ...SCOPE, project: 'another-synthetic-project' } }).ranks[0].candidateId, 'automatic');
  assert.equal(rank(state, candidates, { scope: { ...SCOPE, aspect: 'answer' } }).ranks[0].candidateId, 'automatic');
});

test('explicit correction wins, keeps the original record, and prevents a stale rationale from being reused', () => {
  let state = add(fresh());
  const original = structuredClone(state.preferences['pref-1']);
  const correction = { ...common(state), revisionId: 'corrected-ease', preferenceId: 'pref-1', direction: 'lower',
    weight: 5, status: 'confirmed', reason: 'Synthetic explicit correction: more manual control is now wanted.' };
  state = P.revisePreference(state, correction).state;
  const replay = P.revisePreference(state, correction);
  assert.equal(replay.result.duplicate, true);
  assert.equal(replay.state.revision, state.revision);
  throwsCode(() => P.revisePreference(state, { ...correction, direction: 'higher' }), 'PERSONALIZATION_ID_CONFLICT');
  const candidates = [candidate('simple', { setup_ease: 1 }), candidate('manual', { setup_ease: 0 })];
  const result = rank(state, candidates);
  assert.equal(result.ranks[0].candidateId, 'manual');
  assert.equal(result.effectiveCriteria[0].criterionId, 'corrected-ease');
  assert.equal(result.effectiveCriteria[0].basis, 'explicit_correction');
  assert.deepEqual(state.preferences['pref-1'], original);
  assert.equal(Object.keys(state.preferences).length, 2);
  throwsCode(() => P.recordChoice(state, choiceInput(state, { criteria: [{ preferenceId: 'pref-1', reason: 'Synthetic obsolete rationale.' }] })), 'PERSONALIZATION_EVIDENCE_INVALID');
  const accepted = P.recordChoice(state, choiceInput(state, { criteria: [{ preferenceId: 'corrected-ease', reason: 'Synthetic corrected rationale.' }] }));
  assert.equal(Object.keys(accepted.state.choices).length, 1);
});

test('a newer uncertain correction blocks the prior confirmed value rather than falling back to it', () => {
  let state = add(fresh());
  state = P.revisePreference(state, { ...common(state), revisionId: 'uncertain-now', preferenceId: 'pref-1', direction: 'higher', weight: 3,
    status: 'uncertain', reason: 'Synthetic user withdraws certainty about setup preference.' }).state;
  const result = rank(state, [candidate('simple', { setup_ease: 1 }), candidate('manual', { setup_ease: 0 })]);
  assert.equal(result.effectiveCriteria.length, 0);
  assert.equal(result.unresolved[0].criterionId, 'uncertain-now');
  assert.ok(result.ranks.every(item => item.score === null));
});

test('newer explicit after-use learning can replace an older correction, and a later correction can replace it again', () => {
  let state = add(fresh(), { key: 'automation' });
  const candidates = [candidate('automatic', { automation: 1 }), candidate('manual', { automation: 0 })];
  state = P.revisePreference(state, { ...common(state), revisionId: 'older-manual-correction', preferenceId: 'pref-1',
    direction: 'lower', weight: 3, status: 'confirmed', reason: 'Synthetic initial correction toward manual control.' }).state;
  assert.equal(rank(state, candidates).ranks[0].candidateId, 'manual');
  state = P.recordChoice(state, choiceInput(state, { choiceId: 'manual-trial', candidateId: 'manual',
    criteria: [{ preferenceId: 'older-manual-correction', reason: 'Synthetic rationale for trying manual control.' }] })).state;
  state = P.recordFeedback(state, { ...common(state), feedbackId: 'newer-use', choiceId: 'manual-trial', basis: 'after_use',
    outcome: 'mixed', summary: 'Synthetic actual use changes the explicit automation preference.',
    updates: [{ preferenceId: 'newer-automation-learning', key: 'automation', direction: 'higher', weight: 3,
      status: 'confirmed', reason: 'Synthetic explicit preference after using manual control.', explicit: true }] }).state;
  const afterUse = rank(state, candidates);
  assert.equal(afterUse.ranks[0].candidateId, 'automatic');
  assert.equal(afterUse.effectiveCriteria[0].criterionId, 'newer-automation-learning');
  state = P.revisePreference(state, { ...common(state), revisionId: 'latest-manual-correction', preferenceId: 'newer-automation-learning',
    direction: 'lower', weight: 3, status: 'confirmed', reason: 'Synthetic latest explicit correction for manual control.' }).state;
  assert.equal(rank(state, candidates).ranks[0].candidateId, 'manual');
  state = add(state, { preferenceId: 'later-general-statement', key: 'automation', direction: 'higher' });
  assert.equal(rank(state, candidates).effectiveCriteria[0].criterionId, 'latest-manual-correction');
  assert.ok(state.preferences['older-manual-correction']);
  assert.ok(state.preferences['newer-automation-learning']);
});

test('current busy and detailed priorities are explicit, temporary overrides; mode alone does not infer a preference', () => {
  const scope = { ...SCOPE, aspect: 'answer' };
  const state = add(fresh(), { scope, key: 'detail', direction: 'higher', reason: 'Synthetic persistent preference for explanations with detail.' });
  const before = structuredClone(state);
  const candidates = [candidate('brief', { detail: 0 }), candidate('detailed', { detail: 1 })];
  assert.equal(rank(state, candidates, { scope, context: { mode: 'busy' } }).ranks[0].candidateId, 'detailed');
  const busy = rank(state, candidates, { scope, context: { mode: 'busy', priorities: [{ key: 'detail', direction: 'lower', weight: 5,
    reason: 'Synthetic explicit request for brevity right now.', sourceRef: 'source:synthetic-current-busy' }] } });
  assert.equal(busy.ranks[0].candidateId, 'brief');
  assert.equal(busy.effectiveCriteria[0].basis, 'current');
  assert.equal(busy.effectiveCriteria[0].criterionId, null);
  const detailed = rank(state, candidates, { scope, context: { mode: 'detailed', priorities: [{ key: 'detail', direction: 'higher', weight: 5,
    reason: 'Synthetic explicit request for detail right now.', sourceRef: 'source:synthetic-current-detailed' }] } });
  assert.equal(detailed.ranks[0].candidateId, 'detailed');
  assert.equal(rank(state, candidates, { scope }).ranks[0].candidateId, 'detailed');
  assert.deepEqual(state, before);
});

test('time of day and short or emotional wording in reasons do not create unspoken mood or answer-length criteria', () => {
  const candidates = [candidate('brief', { answer_brevity: 1 }), candidate('detailed', { answer_brevity: 0 })];
  let state = fresh();
  state = P.recordChoice(state, choiceInput(state, { reason: 'Tired. Yes.' })).state;
  const night = rank(state, candidates, { at: at(100) });
  const day = rank(state, candidates, { at: at(12 * 3600) });
  assert.deepEqual(night.ranks, day.ranks);
  assert.equal(night.effectiveCriteria.length, 0);
  assert.equal(night.unresolved.length, 0);
  assert.ok(night.ranks.every(item => item.score === null));
  assert.equal(Object.keys(state.preferences).length, 0);
});

test('unknown candidate features remain unknown and unverified while source-backed explanations distinguish known fit', () => {
  const state = add(fresh());
  const result = rank(state, [candidate('unknown', {}), candidate('known', { setup_ease: 0.75 })]);
  const unknown = result.ranks.find(item => item.candidateId === 'unknown');
  const known = result.ranks.find(item => item.candidateId === 'known');
  assert.equal(result.featureTruthVerified, false);
  assert.equal(result.scoreKind, 'caller_supplied_feature_fit');
  assert.equal(unknown.coverage, 0);
  assert.equal(unknown.score, 0);
  assert.ok(unknown.scoreUpper > unknown.score);
  assert.equal(unknown.reasons[0].status, 'unknown');
  assert.equal(unknown.reasons[0].value, null);
  assert.equal(unknown.reasons[0].fit, null);
  assert.equal(known.coverage, 1);
  assert.equal(known.reasons[0].status, 'known');
  assert.equal(known.reasons[0].criterionId, 'pref-1');
  assert.ok(known.reasons[0].sourceRefs.includes('source:synthetic-event-1'));
  assert.ok(known.sourceRefs.includes('source:synthetic-candidate-known'));
});

test('explicit hard constraints exclude missing or failing features without fabricating their values', () => {
  const state = add(fresh());
  const result = rank(state, [candidate('unknown', { setup_ease: 1 }), candidate('fails', { setup_ease: 1, offline: 0 }),
    candidate('qualifies', { setup_ease: 0, offline: 1 })], { context: { constraints: [{ key: 'offline', operator: 'gte', value: 1,
      reason: 'Synthetic explicit offline requirement.', sourceRef: 'source:synthetic-offline-constraint' }] } });
  assert.deepEqual(result.ranks.map(item => item.candidateId), ['qualifies']);
  assert.equal(result.excluded.length, 2);
  assert.ok(JSON.stringify(result.excluded.find(item => item.candidateId === 'unknown')).includes('constraint_unknown'));
  assert.ok(JSON.stringify(result.excluded.find(item => item.candidateId === 'fails')).includes('constraint_mismatch'));
});

test('scope specificity is literal and corrections never acquire an unrelated scope or key', () => {
  let state = add(fresh(), { scope: { topic: SCOPE.topic }, direction: 'lower' });
  state = add(state, { preferenceId: 'project-rule', scope: { topic: SCOPE.topic, project: SCOPE.project }, direction: 'higher' });
  state = add(state, { preferenceId: 'setup-rule', scope: SCOPE, direction: 'lower' });
  const candidates = [candidate('simple', { setup_ease: 1 }), candidate('manual', { setup_ease: 0 })];
  assert.equal(rank(state, candidates).effectiveCriteria[0].criterionId, 'setup-rule');
  assert.equal(rank(state, candidates, { scope: { ...SCOPE, aspect: 'answer' } }).effectiveCriteria[0].criterionId, 'project-rule');
  assert.equal(rank(state, candidates, { scope: { topic: SCOPE.topic, project: 'unrelated-project' } }).effectiveCriteria[0].criterionId, 'pref-1');
  assert.equal(rank(state, candidates, { scope: { topic: 'software.selection.similar' } }).effectiveCriteria.length, 0);
  throwsCode(() => P.revisePreference(state, { ...common(state), revisionId: 'cross-scope', preferenceId: 'setup-rule', direction: 'higher',
    weight: 3, status: 'confirmed', reason: 'Synthetic cross-scope mutation.', scope: { topic: 'unrelated' } }), 'PERSONALIZATION_INPUT_INVALID');
  throwsCode(() => P.recordChoice(state, choiceInput(state, { scope: { topic: 'unrelated' }, criteria: [{ preferenceId: 'setup-rule', reason: 'Synthetic mismatched evidence.' }] })),
    'PERSONALIZATION_SCOPE_MISMATCH', 'PERSONALIZATION_EVIDENCE_INVALID');
});

test('stable ranking ties are deterministic and do not mutate candidate features or persistent state', () => {
  const state = add(fresh());
  const before = structuredClone(state);
  const candidates = [candidate('zeta', { setup_ease: 0.5 }), candidate('alpha', { setup_ease: 0.5 }), candidate('unknown', { setup_ease: null })];
  const original = structuredClone(candidates);
  const first = rank(state, candidates);
  const second = rank(state, candidates);
  const reordered = rank(state, candidates.toReversed());
  assert.deepEqual(first, second);
  assert.deepEqual(first.ranks.map(item => item.candidateId), ['alpha', 'zeta', 'unknown']);
  assert.deepEqual(first.ranks, reordered.ranks);
  assert.equal(first.rankingFingerprint, second.rankingFingerprint);
  assert.deepEqual(state, before);
  assert.deepEqual(candidates, original);
  let sameTime = add(fresh(), { preferenceId: 'z-first', at: at(1), direction: 'higher' });
  sameTime = add(sameTime, { preferenceId: 'a-later', at: at(1), direction: 'lower' });
  const latest = rank(sameTime, [candidate('simple', { setup_ease: 1 }), candidate('manual', { setup_ease: 0 })]);
  assert.equal(latest.effectiveCriteria[0].criterionId, 'a-later');
  assert.equal(latest.ranks[0].candidateId, 'manual');
});

test('owner metadata, immutable state transitions, CAS and exact replay identities stay intact', () => {
  const initial = fresh('synthetic-owner-one');
  const input = preferenceInput(initial);
  const recorded = P.recordPreference(initial, input);
  assert.equal(initial.revision, 0);
  assert.equal(Object.keys(initial.preferences).length, 0);
  assert.equal(recorded.state.ownerScope, 'synthetic-owner-one');
  assert.equal(fresh('synthetic-owner-two').ownerScope, 'synthetic-owner-two');
  const replay = P.recordPreference(recorded.state, input);
  assert.equal(replay.result.duplicate, true);
  assert.equal(replay.state.revision, recorded.state.revision);
  assert.deepEqual(replay.state.events, recorded.state.events);
  throwsCode(() => P.recordPreference(recorded.state, { ...input, reason: 'Changed content under the same identity.' }), 'PERSONALIZATION_ID_CONFLICT');
  throwsCode(() => P.recordPreference(recorded.state, { ...input, preferenceId: 'another-preference' }), 'PERSONALIZATION_REVISION_CONFLICT');
  throwsCode(() => P.recordPreference(initial, { ...input, ownerScope: 'different-owner' }), 'PERSONALIZATION_INPUT_INVALID');
});

test('feedback is linked to an existing choice, needs explicit updates, and safely replays once', () => {
  let state = P.recordChoice(fresh(), choiceInput(fresh(), { choiceId: 'chosen' })).state;
  const input = { ...common(state), feedbackId: 'feedback-once', choiceId: 'chosen', basis: 'after_use', outcome: 'mixed',
    summary: 'Synthetic actual-use experience was mixed.', updates: [{ preferenceId: 'learned-ease', key: 'setup_ease',
      direction: 'higher', weight: 2, status: 'confirmed', reason: 'Synthetic explicit feedback preference.', explicit: true }] };
  throwsCode(() => P.recordFeedback(state, { ...input, choiceId: 'missing-choice' }), 'PERSONALIZATION_CHOICE_NOT_FOUND');
  throwsCode(() => P.recordFeedback(state, { ...input, updates: [{ ...input.updates[0], explicit: false }] }), 'PERSONALIZATION_INPUT_INVALID', 'PERSONALIZATION_EVIDENCE_INVALID');
  throwsCode(() => P.recordFeedback(state, { ...input, updates: [{ ...input.updates[0], scope: { topic: 'unrelated' } }] }), 'PERSONALIZATION_INPUT_INVALID');
  const recorded = P.recordFeedback(state, input);
  const replay = P.recordFeedback(recorded.state, input);
  assert.equal(replay.result.duplicate, true);
  assert.equal(Object.keys(replay.state.feedback).length, 1);
  assert.equal(Object.keys(replay.state.preferences).length, 1);
  assert.equal(replay.state.revision, recorded.state.revision);
  throwsCode(() => P.recordFeedback(recorded.state, { ...input, outcome: 'positive' }), 'PERSONALIZATION_ID_CONFLICT');
});

test('late mutations cannot rewrite chronology and corrupt state is rejected without a reset', () => {
  const state = add(fresh(), { at: at(10) });
  throwsCode(() => add(state, { preferenceId: 'late-preference', at: at(5) }), 'PERSONALIZATION_TIME_ORDER');
  const invalid = { ...state, schema: 'unrelated-schema' };
  throwsCode(() => P.validateState(invalid), 'PERSONALIZATION_STATE_INVALID', 'PERSONALIZATION_INPUT_INVALID');
  assert.equal(state.schema, 'jh.personalization.v1');
  assert.equal(Object.keys(state.preferences).length, 1);
});

test('unknown, oversized, non-finite and prototype-bearing inputs are rejected within bounded JSON', () => {
  const state = fresh();
  const input = preferenceInput(state);
  throwsCode(() => P.recordPreference(state, { ...input, rawChat: 'Synthetic unrequested raw chat.' }), 'PERSONALIZATION_INPUT_INVALID');
  throwsCode(() => P.recordPreference(state, { ...input, reason: 'X'.repeat(801) }), 'PERSONALIZATION_INPUT_INVALID');
  throwsCode(() => P.recordPreference(state, { ...input, key: '__proto__' }), 'PERSONALIZATION_INPUT_INVALID');
  const polluted = { ...input };
  Object.defineProperty(polluted, '__proto__', { value: { syntheticPollution: true }, enumerable: true });
  throwsCode(() => P.recordPreference(state, polluted), 'PERSONALIZATION_INPUT_INVALID');
  assert.equal({}.syntheticPollution, undefined);
  let getterCalls = 0;
  const accessor = { ...input };
  Object.defineProperty(accessor, 'reason', { enumerable: true, get() { getterCalls++; return 'Synthetic accessor'; } });
  throwsCode(() => P.recordPreference(state, accessor), 'PERSONALIZATION_INPUT_INVALID');
  assert.equal(getterCalls, 0);
  const candidates = [candidate('invalid', { setup_ease: NaN })];
  throwsCode(() => rank(state, candidates), 'PERSONALIZATION_INPUT_INVALID');
  throwsCode(() => rank(state, Array.from({ length: 21 }, (_, index) => candidate(`candidate-${index}`, {}))), 'PERSONALIZATION_INPUT_INVALID');
  throwsCode(() => rank(state, [candidate('too-many-features', Object.fromEntries(Array.from({ length: 33 }, (_, index) => [`feature-${index}`, 0])))]), 'PERSONALIZATION_INPUT_INVALID');
});

test('individually valid provenance cannot amplify a ranking response beyond the output cap or be silently dropped', () => {
  const state = fresh();
  const before = structuredClone(state);
  const priorities = Array.from({ length: 20 }, (_, index) => ({ key: `criterion-${index}`, direction: 'higher', weight: 1,
    reason: 'Synthetic explicit comparison criterion.', sourceRef: `source:synthetic-priority-${index}` }));
  const features = Object.fromEntries(priorities.map(item => [item.key, 0.5]));
  const candidates = Array.from({ length: 20 }, (_, index) => candidate(`synthetic-option-${index}`, { ...features },
    Array.from({ length: 6 }, (_, reference) => `source:synthetic-option-${index}-reference-${reference}:` + 'r'.repeat(400))));
  const smaller = rank(state, candidates.slice(0, 1), { context: { priorities } });
  assert.equal(smaller.ranks[0].reasons.length, 20);
  assert.ok(candidates[0].sourceRefs.every(ref => smaller.ranks[0].reasons[0].sourceRefs.includes(ref)));
  throwsCode(() => rank(state, candidates, { context: { priorities } }), 'PERSONALIZATION_OUTPUT_CAPACITY');
  assert.deepEqual(state, before);
});
