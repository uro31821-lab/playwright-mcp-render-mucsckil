/* Original JH read-only bridge. Load both tested runtimes before calling.
 * Current goal criteria affect this comparison only. Reviews remain evidence
 * for the host to inspect, never executable instructions or persistent updates.
 */
(function installJHDecisionContext(root) {
  'use strict';
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const fail = code => { const error = new Error(code); error.code = code; throw error; };
  function runtimes() {
    const P = root.JHPersonalization, D = root.JHDecisionLearning;
    if (!P || !D || P.VERSION !== '1.0.0' || D.VERSION !== '1.0.0') {
      fail('DECISION_CONTEXT_RUNTIME_UNAVAILABLE');
    }
    return { P, D };
  }
  function scopeKey(value) { return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase(); }
  function mergeByKey(first, second, key) {
    const merged = new Map(first.map(item => [key(item), item]));
    for (const item of second) merged.set(key(item), item);
    return [...merged.values()];
  }
  function bounded(output) {
    let bytes = 0;
    for (const point of JSON.stringify(output)) {
      const code = point.codePointAt(0);
      bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
      if (bytes > 512 * 1024) fail('DECISION_CONTEXT_OUTPUT_CAPACITY');
    }
    return output;
  }
  function rankWithGoal(personalValue, decisionValue, input) {
    const { P, D } = runtimes();
    // Validate descriptors and budgets before cloning or reading caller input.
    P.fingerprint(input);
    const raw = JSON.parse(JSON.stringify(input));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
        !['goalId', 'at', 'scope', 'candidates'].every(key => own(raw, key)) ||
        Object.keys(raw).some(key => !['goalId', 'at', 'scope', 'candidates', 'context'].includes(key))) {
      fail('DECISION_CONTEXT_INPUT_INVALID');
    }
    const personal = P.validateState(personalValue), decision = D.validateState(decisionValue);
    if (personal.ownerScope !== decision.ownerScope) fail('DECISION_CONTEXT_OWNER_MISMATCH');
    const goal = D.goalContext(decision, { goalId: raw.goalId, at: raw.at });
    // This first read validates and normalizes current-turn input using the same
    // contract as the existing ranking engine. It does not persist anything.
    const current = P.rank(personal, { at: raw.at, scope: raw.scope, candidates: raw.candidates,
      ...(own(raw, 'context') ? { context: raw.context } : {}) });
    for (const [key, value] of Object.entries(goal.scope)) {
      if (!own(raw.scope, key) || scopeKey(raw.scope[key]) !== value) fail('DECISION_CONTEXT_SCOPE_MISMATCH');
    }
    const reviewContext = D.reviewContext(decision, { goalId: raw.goalId, at: raw.at, limit: 3 });
    if (!goal.eligible) return bounded({ eligible: false, goalContext: goal, reviewContext, ranking: null,
      persistentPreferencesChanged: false, effectivenessVerified: false, authorizesExecution: false });
    // Explicit instructions for this turn override the same goal criterion.
    // Other goal constraints remain in force. Conflicts yield exclusions in P.rank.
    const context = {
      priorities: mergeByKey(goal.priorities, current.context.priorities, item => item.key),
      constraints: mergeByKey(goal.constraints, current.context.constraints, item => item.key + ':' + item.operator),
    };
    if (current.context.mode !== null) context.mode = current.context.mode;
    const ranking = P.rank(personal, { at: raw.at, scope: raw.scope, candidates: raw.candidates, context });
    return bounded({ eligible: true, goalContext: goal, reviewContext, ranking,
      persistentPreferencesChanged: false, effectivenessVerified: false, authorizesExecution: false });
  }
  root.JHDecisionContext = Object.freeze({ VERSION: '1.0.0', rankWithGoal });
})(globalThis);
