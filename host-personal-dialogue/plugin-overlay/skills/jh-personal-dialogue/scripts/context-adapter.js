/* Original read-only JH bridge. Dialogue evidence and goal outcomes remain
 * separately labelled. This module never converts text into ranking weights,
 * writes a permanent preference, or creates execution authorization.
 */
(function installJHPersonalDialogueBridge(root) {
  'use strict';
  function fail(code) { const error = new Error(code); error.code = code; throw error; }
  function bounded(output) {
    let bytes = 0;
    for (const point of JSON.stringify(output)) {
      const code = point.codePointAt(0);
      bytes += code < 128 ? 1 : code < 2048 ? 2 : code < 65536 ? 3 : 4;
      if (bytes > 512 * 1024) fail('DIALOGUE_CONTEXT_OUTPUT_CAPACITY');
    }
    return output;
  }
  function context(dialogueValue, decisionValue, input) {
    const L = root.JHPersonalDialogue, D = root.JHDecisionLearning;
    if (!L || L.VERSION !== '1.0.0') fail('DIALOGUE_CONTEXT_RUNTIME_UNAVAILABLE');
    L.fingerprint(input); // Validate descriptors/budgets before reading caller values.
    const raw = JSON.parse(JSON.stringify(input));
    const required = ['scope', 'threadId', 'at', 'goalId'];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
        required.some(key => !Object.prototype.hasOwnProperty.call(raw, key)) ||
        Object.keys(raw).some(key => !required.includes(key) && key !== 'limit')) {
      fail('DIALOGUE_CONTEXT_INPUT_INVALID');
    }
    const state = L.validateState(dialogueValue);
    const dialogue = L.dialogueContext(state, { scope: raw.scope, threadId: raw.threadId, at: raw.at,
      ...(raw.limit === undefined ? {} : { limit: raw.limit }) });
    let decision = null;
    if (raw.goalId === null) {
      if (decisionValue !== null) fail('DIALOGUE_CONTEXT_INPUT_INVALID');
    } else {
      if (!D || D.VERSION !== '1.0.0') fail('DIALOGUE_CONTEXT_RUNTIME_UNAVAILABLE');
      const other = D.validateState(decisionValue);
      if (other.ownerScope !== state.ownerScope) fail('DIALOGUE_CONTEXT_OWNER_MISMATCH');
      decision = D.reviewContext(other, { goalId: raw.goalId, at: raw.at, limit: 3 });
      if (L.fingerprint(decision.scope) !== L.fingerprint(dialogue.scope)) fail('DIALOGUE_CONTEXT_SCOPE_MISMATCH');
    }
    return bounded({ dialogue, decision, updatesPreferences: false, infersPreferences: false,
      externalReferencesVerified: false, authorizesExecution: false });
  }
  root.JHPersonalDialogueBridge = Object.freeze({ VERSION: '1.0.0', context });
})(globalThis);
