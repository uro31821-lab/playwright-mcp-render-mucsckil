/** Read-only, task-scoped composition of the existing JH APIs.
 * The host interprets the current user's natural language. This module does
 * not classify phrases, discover conversations, persist state, or run actions.
 */
export const VERSION = '1.0.0';
export const SCHEMA = 'jh.ebiseo-context.v1';
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const RESERVED = new Set(['__proto__', 'prototype', 'constructor']);
function fail(code) { const error = new Error(code); error.code = code; throw error; }
function check(condition, code = 'EBISEO_INPUT_INVALID') { if (!condition) fail(code); }
function fields(value, required, optional = []) {
  check(value && typeof value === 'object' && !Array.isArray(value));
  check(required.every(key => own(value, key)) &&
    Object.keys(value).every(key => required.includes(key) || optional.includes(key)));
}
function clean(value, depth = 0, budget = {nodes: 0, chars: 0}) {
  check(depth <= 24 && ++budget.nodes <= 100000);
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') { check(Number.isFinite(value)); return value; }
  if (typeof value === 'string') {
    budget.chars += value.length;
    check(budget.chars <= 2 * 1024 * 1024 && value.isWellFormed());
    return value;
  }
  check(value && typeof value === 'object');
  const array = Array.isArray(value);
  check(array ? Object.getPrototypeOf(value) === Array.prototype :
    [Object.prototype, null].includes(Object.getPrototypeOf(value)));
  const descriptors = Object.getOwnPropertyDescriptors(value);
  check(Reflect.ownKeys(descriptors).every(key => typeof key === 'string'));
  if (array) {
    check(value.length <= 100000 && Object.keys(descriptors).length === value.length + 1);
    const result = [];
    for (let i = 0; i < value.length; i++) {
      const descriptor = descriptors[String(i)];
      check(descriptor && own(descriptor, 'value') && descriptor.enumerable);
      result.push(clean(descriptor.value, depth + 1, budget));
    }
    return result;
  }
  const result = {};
  for (const [key, descriptor] of Object.entries(descriptors)) {
    check(!RESERVED.has(key) && own(descriptor, 'value') && descriptor.enumerable);
    result[key] = clean(descriptor.value, depth + 1, budget);
  }
  return result;
}
function token(value, lower = false) {
  check(typeof value === 'string');
  const normalized = value.normalize('NFKC').trim();
  const result = lower ? normalized.toLowerCase() : normalized;
  check(result.length <= 160 && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(result) && !RESERVED.has(result));
  return result;
}
function scope(value) {
  fields(value, ['topic'], ['project', 'aspect']);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, token(item, true)]));
}
function sameScope(first, second) {
  return Object.keys(first).length === Object.keys(second).length &&
    Object.keys(first).every(key => own(second, key) && first[key] === second[key]);
}
function iso(value) {
  check(typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value));
  check(Number.isFinite(Date.parse(value)));
  const result = new Date(value).toISOString();
  check(result === value || result.replace('.000Z', 'Z') === value);
  return result;
}
function reference(value) {
  check(typeof value === 'string' && value.length <= 240 &&
    /^(?:conversation|user|source|artifact|test|commit|file|library):[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value));
  return value;
}

/** Envelope validation only. No language matching, state reads, or API calls. */
export function parseRequest(input) {
  const raw = clean(input);
  fields(raw, ['ownerScope', 'scope', 'threadId', 'taskId', 'at', 'invocation'], ['goalId', 'ranking']);
  fields(raw.invocation, ['intent', 'basis', 'sourceRef']);
  check(['consult', 'reference', 'assist', 'none'].includes(raw.invocation.intent));
  check(['direct', 'contextual_user_request', 'quoted', 'negated', 'hypothetical', 'about_assistant'].includes(raw.invocation.basis));
  const invocation = {...raw.invocation, sourceRef: reference(raw.invocation.sourceRef)};
  const goalId = raw.goalId === undefined || raw.goalId === null ? null : token(raw.goalId);
  const ranking = raw.ranking === undefined ? null : raw.ranking;
  if (ranking !== null) {
    fields(ranking, ['candidates'], ['context']);
    check(Array.isArray(ranking.candidates) && ranking.candidates.length >= 1 && ranking.candidates.length <= 20);
  }
  return {
    ownerScope: token(raw.ownerScope), scope: scope(raw.scope), threadId: token(raw.threadId),
    taskId: token(raw.taskId), at: iso(raw.at), invocation, goalId, ranking,
    active: invocation.intent !== 'none' && ['direct', 'contextual_user_request'].includes(invocation.basis),
  };
}
function api(runtimes, name, methods) {
  const value = runtimes?.[name];
  check(value?.VERSION === '1.0.0' && methods.every(key => typeof value[key] === 'function'), 'EBISEO_RUNTIME_UNAVAILABLE');
  return value;
}
function bounded(value) {
  check(Buffer.byteLength(JSON.stringify(value), 'utf8') <= 512 * 1024, 'EBISEO_OUTPUT_CAPACITY');
  return value;
}
function base(request) {
  return {
    schema: SCHEMA, apiVersion: VERSION, active: request.active,
    reason: request.active ? 'current_user_invocation' : request.invocation.intent === 'none' ? 'no_invocation' : 'non_invoking_basis',
    invocation: request.invocation,
    current: {ownerScope: request.ownerScope, scope: request.scope, threadId: request.threadId,
      taskId: request.taskId, at: request.at},
    dialogue: null, historicalEvidence: [], decision: null, ranking: null,
    stateRevisions: {dialogue: null, personal: null, decision: null}, unavailable: [], skipped: [],
    referencesOnly: true, persistentStateChanged: false, authorizesExecution: false,
    hostInterpretationVerified: false, naturalLanguageClassified: false,
  };
}

export function contextWithJH(states, input, runtimes) {
  const request = parseRequest(input), output = base(request);
  // Inactive invocations must not even inspect states or the runtime registry.
  if (!request.active) return bounded(output);
  const supplied = clean(states);
  fields(supplied, ['dialogue', 'personal', 'decision']);
  const validated = {};
  for (const name of ['dialogue', 'personal', 'decision']) {
    if (supplied[name] === null) {
      validated[name] = null;
      output.unavailable.push({component: name, reason: 'state_not_supplied'});
      continue;
    }
    const runtime = api(runtimes, name, ['validateState']);
    const state = runtime.validateState(supplied[name]);
    check(state.ownerScope === request.ownerScope, 'EBISEO_OWNER_MISMATCH');
    validated[name] = state;
    output.stateRevisions[name] = state.revision;
  }
  const hasGoal = request.goalId !== null && validated.decision !== null;
  if (validated.dialogue !== null) {
    const bridge = api(runtimes, 'dialogueBridge', ['context']);
    const combined = bridge.context(validated.dialogue, hasGoal ? validated.decision : null, {
      scope: request.scope, threadId: request.threadId, at: request.at,
      goalId: hasGoal ? request.goalId : null, limit: 5,
    });
    const view = combined.dialogue;
    output.historicalEvidence = view.items.filter(item => item.appliesTo === 'this_task' && item.threadId !== request.threadId);
    const items = view.items.filter(item => item.appliesTo !== 'this_task' || item.threadId === request.threadId);
    const {totalAvailable, omitted, ...visible} = view;
    output.dialogue = {...visible, items, evidenceCounts: {available: totalAvailable, omitted,
      currentOrShared: items.length, historical: output.historicalEvidence.length}};
    output.decision = combined.decision;
  }
  if (hasGoal && output.decision === null) {
    output.decision = api(runtimes, 'decision', ['reviewContext']).reviewContext(validated.decision,
      {goalId: request.goalId, at: request.at, limit: 3});
  }
  if (output.decision !== null) {
    check(sameScope(output.decision.scope, request.scope), 'EBISEO_SCOPE_MISMATCH');
  } else {
    output.skipped.push({component: 'decision', reason: request.goalId === null ? 'no_goal_selected' : 'state_not_supplied'});
  }
  if (request.ranking === null) {
    output.skipped.push({component: 'ranking', reason: 'no_candidates_supplied'});
  } else if (validated.personal === null || request.goalId !== null && validated.decision === null) {
    output.skipped.push({component: 'ranking', reason: validated.personal === null ? 'personal_state_not_supplied' : 'decision_state_not_supplied'});
  } else {
    const rankingInput = {at: request.at, scope: request.scope, ...request.ranking};
    if (hasGoal) {
      const ranked = api(runtimes, 'decisionContext', ['rankWithGoal']).rankWithGoal(validated.personal,
        validated.decision, {...rankingInput, goalId: request.goalId});
      output.ranking = ranked.ranking;
      if (!ranked.eligible) output.skipped.push({component: 'ranking', reason: 'goal_ineligible'});
    } else {
      output.ranking = api(runtimes, 'personal', ['rank']).rank(validated.personal, rankingInput);
    }
  }
  return bounded(output);
}
