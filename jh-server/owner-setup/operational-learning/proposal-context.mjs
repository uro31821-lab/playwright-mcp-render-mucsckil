import { createHash } from 'node:crypto';
import { types } from 'node:util';

const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/+-]{0,127}$/;
const REF = /^(?:sha256|event|fixture|user|artifact|library|regression|test|source|commit):[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$/;
const HEX = /^[a-f0-9]{64}$/;
const DOMAINS = new Set(['connection', 'device', 'web', 'output', 'research', 'calculation', 'routine', 'development', 'orchestration']);
const KINDS = new Set(['rule_fix', 'workflow_automation', 'verification_gap', 'learning_evaluation']);
const MAX_EVIDENCE = 8;
const own = (value, key) => Object.hasOwn(value, key);
const fail = message => { throw new TypeError(message); };
const clone = value => structuredClone(value);

function object(value, label) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(`Invalid ${label}`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).some(key => typeof key !== 'string') ||
      Object.values(descriptors).some(item => !own(item, 'value') || !item.enumerable)) fail(`Invalid ${label}`);
}
function fields(value, required, optional = [], label = 'proposal context') {
  object(value, label);
  if (required.some(key => !own(value, key)) || Object.keys(value).some(key => ![...required, ...optional].includes(key))) fail(`Invalid ${label} fields`);
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
function dataOnly(value, depth = 0, budget = { remaining: 2000000 }) {
  if (depth > 64 || --budget.remaining < 0) fail('Proposal context data exceeds its bounds');
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'string') {
    if (!value.isWellFormed()) fail('Invalid proposal context text');
    return;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (types.isProxy(value)) fail('Invalid proposal context data');
  if (Array.isArray(value)) {
    array(value, 0, 10000, 'proposal context data array');
    for (let index = 0; index < value.length; index++) dataOnly(value[index], depth + 1, budget);
    return;
  }
  object(value, 'proposal context data');
  if (Object.keys(value).length > 10000) fail('Proposal context data exceeds its bounds');
  for (const item of Object.values(value)) dataOnly(item, depth + 1, budget);
}
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
}
const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
function token(value, label) { if (typeof value !== 'string' || !TOKEN.test(value)) fail(`Invalid ${label}`); }
function integer(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(`Invalid ${label}`);
}
function timestamp(value) {
  const match = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) fail('Invalid proposal creation timestamp');
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || Number(match[4]) > 23 ||
      Number(match[5]) > 59 || Number(match[6]) > 59 || Number(match[9] ?? 0) > 23 || Number(match[10] ?? 0) > 59) fail('Invalid proposal creation timestamp');
}
function scope(value, kind) {
  fields(value, ['domain', 'operation', 'engine', 'context'], [], 'proposal scope');
  if (!DOMAINS.has(value.domain)) fail('Invalid proposal domain');
  if (!(kind === 'learning_evaluation' && value.operation === '*')) token(value.operation, 'proposal operation');
  token(value.engine, 'proposal engine');
  fields(value.context, ['platform', 'version', 'environment'], [], 'proposal environment');
  for (const part of Object.values(value.context)) token(part, 'proposal environment value');
}
function stateCheck(state) {
  dataOnly(state);
  fields(state, ['schema', 'revision', 'events', 'attempts', 'lessons', 'proposals'], [], 'learning state');
  if (state.schema !== 'jh.operational-learning.v1') fail('Invalid learning state schema');
  integer(state.revision, 0, Number.MAX_SAFE_INTEGER - 1, 'learning revision');
  for (const [key, max] of Object.entries({ events: 10000, attempts: 3000, lessons: 1000, proposals: 1000 })) {
    object(state[key], key);
    if (Object.keys(state[key]).length > max) fail('Learning state exceeds its bounds');
  }
}
function requests(queries, options) {
  dataOnly(queries); dataOnly(options);
  array(queries, 1, 3, 'proposal scopes');
  queries.forEach(query => scope(query));
  const keys = queries.map(canonical);
  if (new Set(keys).size !== keys.length) fail('Duplicate proposal scope');
  if (queries.some(query => query.engine !== queries[0].engine || canonical(query.context) !== canonical(queries[0].context))) fail('Proposal scopes must share engine and environment');
  fields(options, [], ['limit', 'maxChars', 'seenNoticeFingerprints'], 'proposal context options');
  const limit = own(options, 'limit') ? options.limit : 3;
  const maxChars = own(options, 'maxChars') ? options.maxChars : 3000;
  integer(limit, 1, 10, 'proposal limit'); integer(maxChars, 1, 16384, 'proposal text budget');
  const seen = own(options, 'seenNoticeFingerprints') ? options.seenNoticeFingerprints : [];
  array(seen, 0, 64, 'seen proposal notice fingerprints');
  if (seen.some(value => typeof value !== 'string' || !HEX.test(value)) || new Set(seen).size !== seen.length) fail('Invalid seen proposal notice fingerprints');
  return { queries: [...queries].sort((left, right) => canonical(left) < canonical(right) ? -1 : canonical(left) > canonical(right) ? 1 : 0),
    limit, maxChars, seen: new Set(seen) };
}
function text(value, max, label) {
  if (typeof value !== 'string' || !value.trim() || [...value].length > max ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) fail(`Invalid ${label}`);
}
function benefit(value) {
  fields(value, ['basis', 'baseline', 'baselineUnit', 'savings'], [], 'proposal benefit');
  if (!['measured', 'unmeasured'].includes(value.basis) || value.baselineUnit !== 'per_independent_task' || value.savings !== null) fail('Invalid proposal benefit');
  if (value.basis === 'unmeasured') {
    if (value.baseline !== null) fail('Unmeasured proposal must not claim a baseline');
  } else {
    fields(value.baseline, [], ['durationMs', 'userSteps', 'toolCalls'], 'measured proposal baseline');
    if (!Object.keys(value.baseline).length || Object.values(value.baseline).some(item =>
      typeof item !== 'number' || !Number.isFinite(item) || item < 0 || item > Number.MAX_SAFE_INTEGER)) fail('Invalid measured proposal baseline');
  }
}
function sourceSummary(value, key) {
  object(value, 'stored proposal');
  if (value.status !== 'open') return null;
  token(value.id, 'proposal ID');
  if (value.id !== key || !KINDS.has(value.kind) || value.advisoryOnly !== true || value.externalEffects !== false) fail('Invalid stored advisory proposal');
  scope(value.scope, value.kind); timestamp(value.createdAt);
  integer(value.independentTaskCount, 1, 10000, 'independent task count');
  text(value.reason, 2048, 'proposal reason'); text(value.proposedChange, 2048, 'proposed change');
  array(value.requiredValidation, 1, 8, 'required proposal validation');
  value.requiredValidation.forEach(item => text(item, 512, 'required validation item'));
  benefit(value.expectedBenefit);
  array(value.evidenceRefs, 1, 64, 'proposal evidence references');
  if (value.evidenceRefs.some(ref => typeof ref !== 'string' || !REF.test(ref)) ||
      new Set(value.evidenceRefs).size !== value.evidenceRefs.length) fail('Invalid proposal evidence references');
  return { id: value.id, kind: value.kind, scope: clone(value.scope), status: 'open', createdAt: value.createdAt,
    independentTaskCount: value.independentTaskCount, reason: value.reason, proposedChange: value.proposedChange,
    requiredValidation: clone(value.requiredValidation), expectedBenefit: clone(value.expectedBenefit),
    evidenceRefs: clone(value.evidenceRefs), advisoryOnly: true, externalEffects: false };
}
function matches(value, query) {
  return value.scope.domain === query.domain && value.scope.engine === query.engine &&
    canonical(value.scope.context) === canonical(query.context) &&
    (value.scope.operation === query.operation || (value.kind === 'learning_evaluation' && value.scope.operation === '*'));
}
function notice(value) {
  return { ...value, evidenceRefs: value.evidenceRefs.slice(0, MAX_EVIDENCE),
    evidenceRefsOmitted: Math.max(0, value.evidenceRefs.length - MAX_EVIDENCE),
    evidenceRefsTruncated: value.evidenceRefs.length > MAX_EVIDENCE,
    // Bind all source references, including those omitted from this bounded view.
    noticeFingerprint: digest(value) };
}

/**
 * Read scoped OPEN proposals from one snapshot, including previously created
 * notices lost with a response. Seen fingerprints are caller checkpoint hints,
 * never durable delivery receipts, decisions, or proof that a user read them.
 * Proposal prose remains advisory data and cannot execute a handler or code.
 */
export function proposalContext(state, queries, options = {}) {
  stateCheck(state);
  const request = requests(queries, options);
  const eligible = [];
  for (const [key, value] of Object.entries(state.proposals)) {
    let source;
    try { source = sourceSummary(value, key); }
    catch (error) {
      if (!(error instanceof TypeError)) throw error;
      // Ordinary incomplete legacy records are not widened into this context.
      continue;
    }
    if (source && request.queries.some(query => matches(source, query))) eligible.push(source);
  }
  eligible.sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  const items = []; let suppressed = 0; let omitted = 0; let chars = 0;
  for (const source of eligible) {
    const item = notice(source);
    if (request.seen.has(item.noticeFingerprint)) { suppressed++; continue; }
    const length = [source.reason, source.proposedChange, ...source.requiredValidation]
      .reduce((sum, value) => sum + [...value].length, 0);
    if (items.length >= request.limit || chars + length > request.maxChars) { omitted++; continue; }
    items.push(item); chars += length;
  }
  const fingerprint = digest({ queries: request.queries, items, omitted, suppressed,
    limit: request.limit, maxChars: request.maxChars, seenNoticeFingerprints: [...request.seen].sort() });
  return { schema: 'jh.learning-proposal-context.v1', revision: state.revision,
    items, omitted, suppressed, fingerprint, readOnly: true, advisoryOnly: true, externalEffects: false };
}
