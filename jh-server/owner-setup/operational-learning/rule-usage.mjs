import { lessonView } from './lesson-view.mjs';
import { ruleDefinition, ruleUseHash, ruleUseScopes, validateRuleUseSelection } from './rule-use-contract.mjs';

const own = (value, key) => Object.hasOwn(value, key);
const fail = (message, code) => { throw Object.assign(new TypeError(message), code ? { code } : {}); };
function fields(value, required, optional, label) {
  // ruleUseHash validates data-only objects before this helper is reached.
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      required.some(key => !own(value, key)) ||
      Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) fail(`Invalid ${label} fields`);
}

/** Prepare one currently selectable rule for a host's actual task/attempt.
 * The supplied options.now belongs to trusted host/test code. Public input cannot
 * set it. A read-only selection snapshot never proves actual use or pre-action
 * timing; those remain explicit host attestations attached to a real observation.
 */
export function prepareRuleUse(state, input, options = {}) {
  ruleUseHash(input); ruleUseHash(options);
  fields(input, ['taskId', 'attemptId', 'lessonId', 'scope'], ['globalRecall', 'options'], 'rule-use preparation');
  fields(options, [], ['now'], 'trusted preparation options');
  const recallOptions = own(input, 'options') ? input.options : {};
  fields(recallOptions, [], ['limit', 'maxChars'], 'rule-use recall options');
  const now = own(options, 'now') ? options.now : new Date().toISOString();
  const queries = ruleUseScopes(input);
  const view = lessonView(state, { lessonId: input.lessonId, queries, options: { ...recallOptions, now } });
  if (view.evaluation.status !== 'passed' || !view.recallIncluded) {
    fail('Only a currently checked and selected rule can be prepared', 'LEARNING_RULE_NOT_SELECTABLE');
  }
  if (!view.evaluation.timestamp || Date.parse(view.evaluation.timestamp) > Date.parse(now)) {
    fail('Rule evaluation must precede its selection', 'LEARNING_RULE_EVALUATION_TIME_INVALID');
  }
  const lesson = state.lessons[input.lessonId];
  const selection = {
    schema: 'jh.learning-rule-selection.v1', taskId: input.taskId, attemptId: input.attemptId,
    scope: structuredClone(input.scope),
    ...(own(input, 'globalRecall') ? { globalRecall: structuredClone(input.globalRecall) } : {}),
    lessonId: lesson.id, ruleVersion: lesson.ruleVersion, inputFingerprint: lesson.inputFingerprint,
    definitionFingerprint: ruleUseHash(ruleDefinition(lesson)), evaluationFingerprint: ruleUseHash(lesson.evaluation),
    selectedAt: now, revision: state.revision, recallFingerprint: view.recallFingerprint,
    limit: view.recallBudget.limit, maxChars: view.recallBudget.maxChars,
  };
  selection.fingerprint = ruleUseHash(selection);
  validateRuleUseSelection(selection);
  return { schema: 'jh.learning-rule-use-preparation.v1', selection,
    readOnly: true, usageRecorded: false, externalEffects: false,
    sourceAuthentication: 'host_attestation', preActionTimingVerified: false,
    applicationVerified: false, liveImprovementVerified: false };
}
