import { createHash } from 'node:crypto';
import { types } from 'node:util';

const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/+-]{0,127}$/;
const HEX = /^[a-f0-9]{64}$/;
const REF = /^(?:sha256|event|fixture|user|artifact|library|regression|test|source|commit):[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$/;
const DOMAINS = new Set(['connection', 'device', 'web', 'output', 'research', 'calculation', 'routine', 'development', 'orchestration']);
const META = ['memoryKind', 'provenance', 'validFrom', 'validUntil', 'supersedes', 'conflictKey', 'reflection'];
const DEFINITION = ['id', 'domain', 'operation', 'engine', 'context', 'guidance', 'evidenceRefs', 'ruleVersion', 'inputFingerprint', ...META];
const SELECTION = ['schema', 'taskId', 'attemptId', 'scope', 'lessonId', 'ruleVersion', 'inputFingerprint',
  'definitionFingerprint', 'evaluationFingerprint', 'selectedAt', 'revision', 'recallFingerprint', 'limit', 'maxChars', 'fingerprint'];
const own = (value, key) => Object.hasOwn(value, key);
const fail = message => { throw new TypeError(message); };

function object(value, label) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(`Invalid ${label}`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).some(key => typeof key !== 'string') ||
      Object.values(descriptors).some(item => !own(item, 'value') || !item.enumerable)) fail(`Invalid ${label}`);
}
function fields(value, required, optional = [], label = 'rule-use input') {
  object(value, label);
  if (required.some(key => !own(value, key)) ||
      Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) fail(`Invalid ${label} fields`);
}
function array(value, min, max, label) {
  if (types.isProxy(value) || !Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype ||
      value.length < min || value.length > max || Reflect.ownKeys(value).length !== value.length + 1) fail(`Invalid ${label}`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (let index = 0; index < value.length; index++) {
    const item = descriptors[String(index)];
    if (!item || !own(item, 'value') || !item.enumerable) fail(`Invalid ${label}`);
  }
}
// Known credential backstop only. This is not a complete secret detector or a
// source authenticator; callers must still provide appropriate private references.
function credential(value) {
  return /(?:^|\s)Bearer\s+[A-Za-z0-9._~+\/=-]{16,}/i.test(value) ||
    /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,})\b/.test(value) ||
    /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/.test(value) ||
    /(?:^|[^A-Za-z0-9_-])eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:$|[^A-Za-z0-9_-])/.test(value);
}
function data(value, depth = 0, budget = { nodes: 100000, chars: 1024 * 1024 }, ancestors = new Set()) {
  if (--budget.nodes < 0 || depth > 64) fail('Rule-use data exceeds its bounds');
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'string') {
    budget.chars -= value.length;
    if (budget.chars < 0 || !value.isWellFormed() || credential(value)) fail('Invalid rule-use text');
    return;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (types.isProxy(value)) fail('Invalid rule-use data');
  if (ancestors.has(value)) fail('Cyclic rule-use data');
  ancestors.add(value);
  if (Array.isArray(value)) {
    array(value, 0, 10000, 'rule-use JSON array');
    for (let index = 0; index < value.length; index++) data(value[index], depth + 1, budget, ancestors);
  } else {
    object(value, 'rule-use JSON object');
    for (const key of Object.keys(value)) {
      budget.chars -= key.length;
      if (budget.chars < 0 || !key.isWellFormed() || credential(key)) fail('Invalid rule-use key');
      data(value[key], depth + 1, budget, ancestors);
    }
  }
  ancestors.delete(value);
}
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
}
/** Canonical SHA-256 compatible with the engine's full-definition/evaluation hash.
 * A digest binds supplied data; it is not a signature or independent execution proof.
 */
export function ruleUseHash(value) {
  data(value);
  return createHash('sha256').update(canonical(value)).digest('hex');
}
function token(value, label) { if (typeof value !== 'string' || !TOKEN.test(value)) fail(`Invalid ${label}`); }
function integer(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(`Invalid ${label}`);
}
function timestamp(value) {
  const match = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) fail('Invalid rule-use timestamp');
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || Number(match[4]) > 23 ||
      Number(match[5]) > 59 || Number(match[6]) > 59 || Number(match[9] ?? 0) > 23 || Number(match[10] ?? 0) > 59) fail('Invalid rule-use timestamp');
}
function scope(value) {
  fields(value, ['domain', 'operation', 'engine', 'context'], [], 'rule-use scope');
  if (!DOMAINS.has(value.domain)) fail('Invalid rule-use domain');
  token(value.operation, 'rule-use operation'); token(value.engine, 'rule-use engine');
  fields(value.context, ['platform', 'version', 'environment'], [], 'rule-use context');
  for (const part of Object.values(value.context)) token(part, 'rule-use context value');
}
function refs(value, min, max) {
  array(value, min, max, 'rule-use evidence');
  if (value.some(ref => typeof ref !== 'string' || !REF.test(ref)) || new Set(value).size !== value.length) fail('Invalid rule-use references');
}

/** Return only actual task scope plus its optional validated common binding.
 * Accepts a selection or a preparation request; validation of other fields is
 * performed by the respective public entry point, never by implicit inference.
 */
export function ruleUseScopes(selection) {
  data(selection); object(selection, 'rule-use scope container');
  if (!own(selection, 'scope')) fail('Actual rule-use scope is required');
  scope(selection.scope);
  const queries = [structuredClone(selection.scope)];
  if (own(selection, 'globalRecall')) {
    const common = selection.globalRecall;
    scope(common);
    if (common.domain !== 'orchestration' || common.operation !== 'learning.scope' ||
        common.engine !== selection.scope.engine || canonical(common.context) !== canonical(selection.scope.context)) {
      fail('Rule-use common scope must match the actual engine and context');
    }
    if (canonical(common) !== canonical(selection.scope)) queries.push(structuredClone(common));
  }
  return queries;
}

/** Return the complete stored definition, omitting mutable runtime receipts.
 * Keep the field set identical to engine.lessonDefinition; do not use the bounded
 * lesson-view evidence summary to calculate this hash.
 */
export function ruleDefinition(lesson) {
  data(lesson);
  fields(lesson, ['id', 'domain', 'operation', 'engine', 'context', 'guidance', 'evidenceRefs', 'ruleVersion', 'inputFingerprint'],
    [...META, 'state', 'advisoryOnly', 'evaluation', 'evaluationHistory', 'supersessionHistory'], 'rule definition');
  token(lesson.id, 'rule ID'); token(lesson.ruleVersion, 'rule version');
  scope({ domain: lesson.domain, operation: lesson.operation, engine: lesson.engine, context: lesson.context });
  if (typeof lesson.guidance !== 'string' || !lesson.guidance.trim() || lesson.guidance.length > 2048 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(lesson.guidance)) fail('Invalid rule guidance');
  refs(lesson.evidenceRefs, 1, 64);
  if (typeof lesson.inputFingerprint !== 'string' || !HEX.test(lesson.inputFingerprint)) fail('Invalid rule input fingerprint');
  return Object.fromEntries(DEFINITION.filter(key => own(lesson, key)).map(key => [key, structuredClone(lesson[key])]));
}

export function validateRuleUseSelection(selection) {
  data(selection); fields(selection, SELECTION, ['globalRecall'], 'rule-use selection');
  if (selection.schema !== 'jh.learning-rule-selection.v1') fail('Invalid rule-use selection schema');
  for (const key of ['taskId', 'attemptId', 'lessonId', 'ruleVersion']) token(selection[key], 'rule-use identity');
  for (const key of ['inputFingerprint', 'definitionFingerprint', 'evaluationFingerprint', 'recallFingerprint', 'fingerprint']) {
    if (typeof selection[key] !== 'string' || !HEX.test(selection[key])) fail('Invalid rule-use fingerprint');
  }
  ruleUseScopes(selection); timestamp(selection.selectedAt);
  integer(selection.revision, 0, Number.MAX_SAFE_INTEGER - 1, 'selection revision');
  integer(selection.limit, 1, 20, 'selection limit'); integer(selection.maxChars, 1, 16384, 'selection character budget');
  const { fingerprint, ...bound } = selection;
  if (ruleUseHash(bound) !== fingerprint) fail('Rule-use selection fingerprint differs');
}

/** Structural/historical binding only: no current lesson lookup or clock access.
 * Existing event retries remain readable after a rule changes or expires.
 */
export function validateRuleUses(event) {
  object(event, 'rule-use event');
  if (!own(event, 'ruleUses')) return;
  const bound = { taskId: event.taskId, attemptId: event.attemptId, domain: event.domain,
    operation: event.operation, engine: event.engine, context: event.context, timestamp: event.timestamp,
    source: event.source, evidenceRefs: event.evidenceRefs, ruleUses: event.ruleUses };
  data(bound);
  token(event.taskId, 'event task ID'); token(event.attemptId, 'event attempt ID'); timestamp(event.timestamp);
  if (event.source !== 'host_verified') fail('Rule-use attestations require a verified host observation');
  const actual = { domain: event.domain, operation: event.operation, engine: event.engine, context: event.context };
  scope(actual); refs(event.evidenceRefs, 1, 64);
  array(event.ruleUses, 1, 4, 'rule uses');
  const uses = new Set(); const lessons = new Set();
  for (const item of event.ruleUses) {
    fields(item, ['useRef', 'selection', 'appliedAt', 'evidenceRefs', 'confirmation'], [], 'rule-use attestation');
    if (item.confirmation !== 'applied_in_this_attempt') fail('Explicit rule-use confirmation required');
    if (typeof item.useRef !== 'string' || !REF.test(item.useRef)) fail('Invalid rule-use reference');
    refs(item.evidenceRefs, 1, 8);
    if (!item.evidenceRefs.includes(item.useRef) || item.evidenceRefs.some(ref => !event.evidenceRefs.includes(ref))) {
      fail('Rule-use references must be bound to the actual observation');
    }
    validateRuleUseSelection(item.selection); timestamp(item.appliedAt);
    if (item.selection.taskId !== event.taskId || item.selection.attemptId !== event.attemptId ||
        canonical(item.selection.scope) !== canonical(actual)) fail('Rule use belongs to a different task or scope');
    if (Date.parse(item.selection.selectedAt) > Date.parse(item.appliedAt) || Date.parse(item.appliedAt) > Date.parse(event.timestamp)) {
      fail('Rule-use chronology differs from the observation');
    }
    if (uses.has(item.useRef) || lessons.has(item.selection.lessonId)) fail('Duplicate rule-use attestation');
    uses.add(item.useRef); lessons.add(item.selection.lessonId);
  }
}
