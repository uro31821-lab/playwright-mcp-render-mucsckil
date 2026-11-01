import { types } from 'node:util';
import { addLesson, evaluateLesson, recallContexts } from './engine.mjs';

const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/+-]{0,127}$/;
const META = ['memoryKind', 'provenance', 'validFrom', 'validUntil', 'supersedes', 'conflictKey', 'reflection'];
const DEFINITION = ['id', 'domain', 'operation', 'engine', 'context', 'guidance', 'evidenceRefs', 'ruleVersion', 'inputFingerprint', ...META];
const own = (value, key) => Object.hasOwn(value, key);
const clone = value => structuredClone(value);
const fail = (message, code) => { throw Object.assign(new TypeError(message), code ? { code } : {}); };

function object(value, label) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(`Invalid ${label}`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).some(key => typeof key !== 'string') ||
      Object.values(descriptors).some(item => !own(item, 'value') || !item.enumerable)) fail(`Invalid ${label}`);
}
function fields(value, required, optional = [], label = 'lesson-view request') {
  object(value, label);
  if (required.some(key => !own(value, key)) || Object.keys(value).some(key => ![...required, ...optional].includes(key))) {
    fail(`Invalid ${label} fields`);
  }
}
function token(value, label) { if (typeof value !== 'string' || !TOKEN.test(value)) fail(`Invalid ${label}`); }
// Reject input-defined behavior before entering older core helpers. This is a
// bounded data-only view, not a deserializer for class instances or executable data.
function json(value, depth = 0, budget = { nodes: 2_000_000, chars: 25 * 1024 * 1024 }) {
  if (--budget.nodes < 0 || depth > 64) fail('Lesson-view JSON exceeds its bounds');
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'string') {
    budget.chars -= value.length;
    if (budget.chars < 0 || !value.isWellFormed()) fail('Invalid lesson-view text');
    return;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (types.isProxy(value)) fail('Invalid lesson-view JSON');
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype || value.length > 10000 ||
        Reflect.ownKeys(value).length !== value.length + 1) fail('Invalid lesson-view array');
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (let index = 0; index < value.length; index++) {
      const item = descriptors[String(index)];
      if (!item || !own(item, 'value') || !item.enumerable) fail('Invalid lesson-view array');
      json(item.value, depth + 1, budget);
    }
    return;
  }
  object(value, 'lesson-view JSON');
  for (const key of Object.keys(value)) {
    budget.chars -= key.length;
    if (budget.chars < 0 || !key.isWellFormed()) fail('Invalid lesson-view key');
    json(value[key], depth + 1, budget);
  }
}
function validateState(state) {
  json(state);
  fields(state, ['schema', 'revision', 'events', 'attempts', 'lessons', 'proposals'], [], 'learning state');
  if (state.schema !== 'jh.operational-learning.v1' || !Number.isSafeInteger(state.revision) ||
      state.revision < 0 || state.revision >= Number.MAX_SAFE_INTEGER) fail('Invalid learning state');
  for (const [key, limit] of Object.entries({ events: 10000, attempts: 3000, lessons: 1000, proposals: 1000 })) {
    object(state[key], 'learning state map');
    if (Object.keys(state[key]).length > limit) fail('Learning state capacity exceeded');
  }
}
function definitionFor(state, lesson, lessonId) {
  fields(lesson, ['id', 'domain', 'operation', 'engine', 'context', 'guidance', 'evidenceRefs', 'ruleVersion',
    'inputFingerprint', 'state', 'advisoryOnly'], [...META, 'evaluation', 'evaluationHistory', 'supersessionHistory'], 'stored lesson');
  if (lesson.id !== lessonId || !['candidate', 'active', 'quarantined'].includes(lesson.state) ||
      lesson.advisoryOnly !== true) fail('Invalid stored lesson state');
  const definition = Object.fromEntries(DEFINITION.filter(key => own(lesson, key)).map(key => [key, clone(lesson[key])]));
  try {
    if (addLesson(state, { ...definition, state: 'candidate' }) !== state) fail('Stored lesson does not match its definition');
  } catch { fail('Invalid stored lesson definition'); }
  return definition;
}
function emptyEvaluation(status = 'not_run') {
  return { status, timestamp: null, passed: null, failed: null, skipped: null,
    evidenceRefs: [], evidenceRefsTruncated: false };
}
function evaluationFor(state, lesson) {
  if (!own(lesson, 'evaluation')) return emptyEvaluation();
  const evaluation = lesson.evaluation;
  try {
    // An identical receipt must be a no-op after the engine validates its complete
    // definition/case binding. No state returned by a mutator is retained here.
    if (evaluateLesson(state, lesson.id, evaluation) !== state) return emptyEvaluation('invalid');
  } catch { return emptyEvaluation('invalid'); }
  return { status: evaluation.failed > 0 ? 'failed' : 'passed', timestamp: evaluation.timestamp ?? null,
    passed: evaluation.passed, failed: evaluation.failed, skipped: evaluation.skipped,
    evidenceRefs: evaluation.evidenceRefs.slice(0, 8), evidenceRefsTruncated: evaluation.evidenceRefs.length > 8,
    ...(own(evaluation, 'definitionFingerprint') ? { definitionFingerprint: evaluation.definitionFingerprint } : {}) };
}
const scopeOf = lesson => ({ domain: lesson.domain, operation: lesson.operation, engine: lesson.engine, context: clone(lesson.context) });
const sameScope = (a, b) => a.domain === b.domain && a.operation === b.operation && a.engine === b.engine &&
  ['platform', 'version', 'environment'].every(key => a.context[key] === b.context[key]);

/** Inspect one owner-stored definition against explicitly supplied current scopes.
 * The host obtains state from one owner-bound snapshot. This view never prepares,
 * registers, checks, migrates or activates a rule, and cannot recover its original
 * suite or authenticate a user source from stored references alone.
 */
export function lessonView(state, input) {
  json(input, 0, { nodes: 10000, chars: 1024 * 1024 });
  fields(input, ['lessonId'], ['query', 'queries', 'options']);
  token(input.lessonId, 'lesson ID');
  if (own(input, 'query') === own(input, 'queries')) fail('Exactly one current query or queries is required');
  const options = own(input, 'options') ? input.options : {};
  fields(options, [], ['now', 'limit', 'maxChars'], 'lesson-view options');
  const settings = { now: own(options, 'now') ? options.now : new Date().toISOString(),
    limit: own(options, 'limit') ? options.limit : 5, maxChars: own(options, 'maxChars') ? options.maxChars : 4000 };
  const queries = own(input, 'queries') ? input.queries : [input.query];
  validateState(state);
  if (!own(state.lessons, input.lessonId)) fail('Stored lesson was not found', 'LEARNING_LESSON_NOT_FOUND');
  const lesson = state.lessons[input.lessonId];
  const definition = definitionFor(state, lesson, input.lessonId);
  const evaluation = evaluationFor(state, lesson);
  let recalled;
  try { recalled = recallContexts(state, queries, settings); }
  catch { fail('Invalid lesson-view context or learning selection state'); }
  const scope = scopeOf(lesson);
  const scopeMatches = queries.some(query => sameScope(query, scope));
  const at = Date.parse(settings.now);
  const temporalStatus = lesson.validFrom && at < Date.parse(lesson.validFrom) ? 'not_yet_valid'
    : lesson.validUntil && at >= Date.parse(lesson.validUntil) ? 'expired' : 'in_window';
  const engineRecallIncluded = recalled.lessons.some(item => item.id === lesson.id && item.inputFingerprint === lesson.inputFingerprint);
  // The engine's active-selection predicate is intentionally smaller than full
  // receipt validation. Expose its actual selection separately and suppress an
  // invalid receipt here without silently modifying the reported engine fingerprint.
  const recallIncluded = evaluation.status !== 'invalid' && engineRecallIncluded;
  const selectionStatus = evaluation.status === 'invalid' ? 'invalid_evaluation'
    : !scopeMatches ? 'not_in_scope'
    : lesson.state === 'candidate' ? 'candidate'
    : lesson.state === 'quarantined' ? 'quarantined'
    : temporalStatus !== 'in_window' ? temporalStatus
    : recallIncluded ? 'included' : 'not_selected';
  const conflicts = recalled.conflicts.filter(item => item.lessonIds.includes(lesson.id));
  for (const conflict of conflicts) {
    token(conflict.conflictKey, 'conflict key');
    if (conflict.reason !== 'equal_authority_conflict') fail('Invalid learning conflict reason');
    for (const id of conflict.lessonIds) token(id, 'conflicting lesson ID');
  }
  return { schema: 'jh.learning-lesson-view.v1', lessonId: lesson.id, revision: state.revision, checkedAt: settings.now,
    definition: { id: definition.id, ruleVersion: definition.ruleVersion, inputFingerprint: definition.inputFingerprint,
      scope, guidance: definition.guidance, evidenceRefs: definition.evidenceRefs.slice(0, 8),
      evidenceRefsTruncated: definition.evidenceRefs.length > 8,
      ...Object.fromEntries(META.filter(key => own(definition, key)).map(key => [key, clone(definition[key])])) },
    lessonState: lesson.state, evaluation, temporalStatus, scopeMatches, engineRecallIncluded, recallIncluded, selectionStatus,
    conflicts: conflicts.slice(0, 4).map(item => ({ conflictKey: item.conflictKey, reason: item.reason, lessonIds: item.lessonIds.slice(0, 16) })),
    conflictsTruncated: conflicts.length > 4 || conflicts.some(item => item.lessonIds.length > 16),
    recallBudget: { limit: settings.limit, maxChars: settings.maxChars }, recallFingerprint: recalled.fingerprint,
    recallOmitted: recalled.omitted, readOnly: true, advisoryOnly: true, externalEffects: false,
    pastApplicationVerified: false, liveImprovementVerified: false, liveExecutionVerified: false };
}
