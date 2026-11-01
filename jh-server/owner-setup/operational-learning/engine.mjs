import { createHash } from 'node:crypto';

const SCHEMA = 'jh.operational-learning.v1';
const DOMAINS = new Set([
  'connection', 'device', 'web', 'output', 'research', 'calculation',
  'routine', 'development', 'orchestration',
]);
const OUTCOMES = new Set([
  'success_verified', 'failure_verified', 'completion_unknown',
  'blocked', 'cancelled', 'correction', 'observed', 'pending',
]);
const SOURCES = new Set(['host_verified', 'user_explicit', 'user_reported']);
const VERIFIED = new Set(['success_verified', 'failure_verified']);
const STATUSES = new Set(['open', 'accepted', 'implemented', 'verified', 'dismissed', 'resolved']);
const LIMITS = { events: 10000, attempts: 3000, lessons: 1000, proposals: 1000 };
const MEMORY_KINDS = new Set(['fact', 'episode', 'procedure']);
const PROVENANCE = ['legacy', 'model_inferred', 'host_verified', 'user_explicit'];
const LESSON_METADATA = ['memoryKind', 'provenance', 'validFrom', 'validUntil', 'supersedes', 'conflictKey', 'reflection'];
const own = (o, k) => Object.hasOwn(o, k);
const clone = (o) => structuredClone(o);
const fail = (message) => { throw new TypeError(message); };

function object(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    fail(`${label} must be a plain object`);
  }
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    if (descriptor.get || descriptor.set) fail(`${label} cannot contain accessors`);
  }
  if (Object.getOwnPropertySymbols(value).length) fail(`${label} cannot contain symbols`);
}
function fields(value, required, optional = [], label = 'input') {
  object(value, label);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`Unknown ${label} field: ${key}`);
  }
  for (const key of required) {
    if (!own(value, key)) fail(`Missing ${label} field: ${key}`);
  }
}
function token(value, label) {
  if (typeof value !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9._:@/+-]{0,127}$/.test(value)) {
    fail(`Invalid ${label}`);
  }
}
function text(value, label, max = 2048) {
  if (typeof value !== 'string' || !value.trim() || value.length > max ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
    fail(`Invalid ${label}`);
  }
}
function integer(value, label, max = 1e9) {
  if (!Number.isSafeInteger(value) || value < 0 || value > max) fail(`Invalid ${label}`);
}
function iso(value, label = 'timestamp') {
  const match = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) fail(`Invalid ${label}`);
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText); const month = Number(monthText); const day = Number(dayText);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || Number(hourText) > 23 ||
      Number(minuteText) > 59 || Number(secondText) > 59 || Number(match[9] ?? 0) > 23 || Number(match[10] ?? 0) > 59) fail(`Invalid ${label}`);
}
function refs(value, required = false) {
  if (!Array.isArray(value) || value.length > 64 || (required && value.length === 0)) fail('Invalid evidenceRefs');
  for (const ref of value) {
    // References identify private evidence; raw URLs, messages, tokens, and log lines do not belong here.
    if (typeof ref !== 'string' ||
        !/^(?:sha256|event|fixture|user|artifact|library|regression|test|source|commit):[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$/.test(ref)) {
      fail('Evidence must be an opaque supported reference');
    }
  }
  if (new Set(value).size !== value.length) fail('Duplicate evidence reference');
}
function context(value) {
  fields(value, ['platform', 'version', 'environment'], [], 'context');
  for (const key of Object.keys(value)) token(value[key], `context.${key}`);
}
function scope(value) {
  if (!DOMAINS.has(value.domain)) fail('Invalid domain');
  token(value.operation, 'operation'); token(value.engine, 'engine'); context(value.context);
}
function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  object(value, 'JSON value');
  return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}
const hash = (value) => createHash('sha256').update(canonical(value)).digest('hex');
const same = (a, b) => canonical(a) === canonical(b);
const scopeOf = (value) => ({
  domain: value.domain, operation: value.operation, engine: value.engine, context: clone(value.context),
});

function stateCheck(state) {
  fields(state, ['schema', 'revision', 'events', 'attempts', 'lessons', 'proposals'], [], 'state');
  if (state.schema !== SCHEMA) fail('Unsupported learning state');
  integer(state.revision, 'revision', Number.MAX_SAFE_INTEGER - 1);
  for (const [key, limit] of Object.entries(LIMITS)) {
    object(state[key], key);
    if (Object.keys(state[key]).length > limit) fail(`${key} limit exceeded`);
  }
}
function capacity(state, key) {
  if (Object.keys(state[key]).length >= LIMITS[key]) fail(`${key} limit reached`);
}
function commit(state) { state.revision += 1; return state; }

export function createState() {
  return { schema: SCHEMA, revision: 0, events: {}, attempts: {}, lessons: {}, proposals: {} };
}

function validateEvent(event) {
  fields(event, [
    'eventId', 'taskId', 'attemptId', 'sequence', 'timestamp', 'domain',
    'operation', 'engine', 'context', 'outcome', 'source', 'evidenceRefs',
  ], ['errorCode', 'metrics', 'labels'], 'event');
  for (const key of ['eventId', 'taskId', 'attemptId']) token(event[key], key);
  integer(event.sequence, 'sequence'); iso(event.timestamp); scope(event);
  if (!OUTCOMES.has(event.outcome)) fail('Invalid outcome');
  if (!SOURCES.has(event.source)) fail('Invalid source');
  refs(event.evidenceRefs, VERIFIED.has(event.outcome));
  if (VERIFIED.has(event.outcome) && event.source === 'user_reported') fail('User-reported observations cannot claim a verified outcome');
  if (own(event, 'errorCode') && event.errorCode !== undefined) token(event.errorCode, 'errorCode');
  if (own(event, 'metrics') && event.metrics !== undefined) {
    fields(event.metrics, [], ['durationMs', 'userSteps', 'toolCalls'], 'metrics');
    for (const [key, value] of Object.entries(event.metrics)) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1e12) fail(`Invalid metrics.${key}`);
    }
  }
  if (own(event, 'labels') && event.labels !== undefined) {
    fields(event.labels, [], ['reviewed', 'ruleRemediationTried', 'holdout'], 'labels');
    for (const value of Object.values(event.labels)) if (typeof value !== 'boolean') fail('Labels must be booleans');
  }
}

export function ingest(state, event) {
  stateCheck(state); validateEvent(event);
  // Optional undefined fields from JavaScript callers have the same meaning as absent JSON fields.
  event = Object.fromEntries(Object.entries(event).filter(([, value]) => value !== undefined));
  if (own(state.events, event.eventId)) {
    if (!same(state.events[event.eventId], event)) fail('Conflicting event ID');
    return { state, duplicate: true, changed: false };
  }
  capacity(state, 'events');
  const attemptKey = hash([event.taskId, event.attemptId]);
  const previous = state.attempts[attemptKey];
  if (previous && !same(scopeOf(previous), scopeOf(event))) fail('An attempt cannot change operation, engine, or environment');
  if (previous && event.sequence === previous.sequence &&
      (event.outcome !== previous.outcome || (event.errorCode ?? null) !== (previous.errorCode ?? null))) fail('Conflicting outcome at the same attempt sequence');
  if (!previous) capacity(state, 'attempts');
  const next = clone(state);
  next.events[event.eventId] = clone(event);
  const inconclusive = ['completion_unknown', 'blocked', 'cancelled', 'observed', 'pending'].includes(event.outcome);
  const losesVerification = previous && VERIFIED.has(previous.outcome) && inconclusive;
  if (!previous || (event.sequence > previous.sequence && !losesVerification)) {
    const projected = clone(event);
    if (previous?.metrics) {
      projected.metrics = { ...previous.metrics, ...(event.metrics ?? {}) };
      for (const key of Object.keys(previous.metrics)) projected.metrics[key] = Math.max(previous.metrics[key], event.metrics?.[key] ?? 0);
    }
    next.attempts[attemptKey] = projected;
  }
  return { state: commit(next), duplicate: false, changed: true };
}

function lessonDefinition(lesson) {
  return { id: lesson.id, ...scopeOf(lesson), guidance: lesson.guidance,
    evidenceRefs: clone(lesson.evidenceRefs), ruleVersion: lesson.ruleVersion, inputFingerprint: lesson.inputFingerprint,
    ...lessonMetadata(lesson) };
}

/** Evaluation receipts are supplied by trusted hosts, not authentication tokens.
 * Bind new receipts to the full definition as well as its caller-supplied input hash.
 * Old unbound receipts remain readable only for definitions without new metadata.
 */
function evaluationBindsDefinition(lesson, evaluation) {
  const hasId = own(evaluation, 'lessonId');
  const hasDefinition = own(evaluation, 'definitionFingerprint');
  if (!hasId && !hasDefinition) return !LESSON_METADATA.some(key => own(lesson, key));
  return hasId && hasDefinition && evaluation.lessonId === lesson.id &&
    typeof evaluation.definitionFingerprint === 'string' && /^[a-f0-9]{64}$/.test(evaluation.definitionFingerprint) &&
    evaluation.definitionFingerprint === hash(lessonDefinition(lesson));
}

/** Optional metadata is never defaulted into legacy definitions or fingerprints. */
function lessonMetadata(lesson) {
  const metadata = {};
  for (const key of LESSON_METADATA) if (own(lesson, key)) metadata[key] = clone(lesson[key]);
  if (own(metadata, 'memoryKind') && !MEMORY_KINDS.has(metadata.memoryKind)) fail('Invalid memoryKind');
  if (own(metadata, 'provenance') && !PROVENANCE.includes(metadata.provenance)) fail('Invalid provenance');
  for (const key of ['validFrom', 'validUntil']) if (own(metadata, key)) iso(metadata[key], key);
  if (metadata.validFrom && metadata.validUntil && Date.parse(metadata.validFrom) >= Date.parse(metadata.validUntil)) fail('Invalid lesson validity interval');
  if (own(metadata, 'conflictKey')) token(metadata.conflictKey, 'conflictKey');
  if (own(metadata, 'supersedes')) {
    if (!Array.isArray(metadata.supersedes) || metadata.supersedes.length > 16 ||
        new Set(metadata.supersedes).size !== metadata.supersedes.length) fail('Invalid supersedes');
    for (const id of metadata.supersedes) {
      token(id, 'superseded lesson ID');
      if (id === lesson.id) fail('A lesson cannot supersede itself');
    }
  }
  if (own(metadata, 'reflection')) {
    const reflection = metadata.reflection;
    fields(reflection, ['assessment', 'cause', 'resolution', 'expectedEffect', 'eventIds'], [], 'reflection');
    if (reflection.assessment !== 'reviewed_inference') fail('Reflection is a reviewed inference, not a verified outcome');
    for (const key of ['cause', 'resolution', 'expectedEffect']) text(reflection[key], 'reflection.' + key, 1024);
    if (!Array.isArray(reflection.eventIds) || !reflection.eventIds.length || reflection.eventIds.length > 16 ||
        new Set(reflection.eventIds).size !== reflection.eventIds.length) fail('Invalid reflection eventIds');
    for (const id of reflection.eventIds) token(id, 'reflection event ID');
  }
  return metadata;
}
const authority = lesson => PROVENANCE.indexOf(lesson.provenance ?? 'legacy');
function validateSupersedes(state, lesson) {
  for (const id of lesson.supersedes ?? []) {
    const previous = state.lessons[id];
    if (!previous) fail('Superseded lesson must already exist');
    lessonMetadata(previous);
    if (!same(scopeOf(previous), scopeOf(lesson))) fail('Supersession cannot cross lesson scope');
    if (authority(lesson) < authority(previous)) fail('A lower-authority lesson cannot supersede a higher-authority rule');
  }
}
function validatedLesson(lesson) {
  fields(lesson, ['id', 'domain', 'operation', 'engine', 'context', 'guidance', 'evidenceRefs', 'ruleVersion'], ['state', 'inputFingerprint', ...LESSON_METADATA], 'lesson');
  token(lesson.id, 'lesson ID'); token(lesson.ruleVersion, 'ruleVersion'); scope(lesson);
  text(lesson.guidance, 'guidance'); refs(lesson.evidenceRefs, true);
  if (own(lesson, 'state') && lesson.state !== 'candidate') fail('New lessons must begin as candidates');
  const metadata = lessonMetadata(lesson);
  const fingerprint = lesson.inputFingerprint ?? hash({ ...scopeOf(lesson), guidance: lesson.guidance, ruleVersion: lesson.ruleVersion, ...metadata });
  if (typeof fingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(fingerprint)) fail('Invalid inputFingerprint');
  return { ...clone(lesson), inputFingerprint: fingerprint, state: 'candidate', advisoryOnly: true };
}

export function addLesson(state, lesson) {
  stateCheck(state);
  const candidate = validatedLesson(lesson);
  validateSupersedes(state, candidate);
  if (own(state.lessons, candidate.id)) {
    if (!same(lessonDefinition(state.lessons[candidate.id]), lessonDefinition(candidate))) fail('Existing lesson differs; preserve it and use a new lesson ID/version');
    return state;
  }
  capacity(state, 'lessons');
  const next = clone(state); next.lessons[candidate.id] = candidate; return commit(next);
}

export function evaluateLesson(state, lessonId, evaluation) {
  stateCheck(state); token(lessonId, 'lesson ID');
  if (!own(state.lessons, lessonId)) fail('Unknown lesson');
  fields(evaluation, ['ruleVersion', 'inputFingerprint', 'passed', 'failed', 'skipped', 'evidenceRefs'],
    ['timestamp', 'caseResults', 'lessonId', 'definitionFingerprint'], 'evaluation');
  const lesson = state.lessons[lessonId];
  lessonMetadata(lesson);
  validateSupersedes(state, lesson);
  if (evaluation.ruleVersion !== lesson.ruleVersion || evaluation.inputFingerprint !== lesson.inputFingerprint) fail('Evaluation does not match the lesson version and inputs');
  if (!evaluationBindsDefinition(lesson, evaluation)) fail('Evaluation does not match the complete lesson definition binding');
  for (const key of ['passed', 'failed', 'skipped']) integer(evaluation[key], key, 1e6);
  refs(evaluation.evidenceRefs, true);
  if (own(evaluation, 'timestamp')) iso(evaluation.timestamp);
  if (lesson.supersedes?.length && !evaluation.timestamp) fail('Supersession evaluation requires a timestamp');
  if (evaluation.passed + evaluation.failed === 0) fail('No executed evaluation cases');
  if (evaluation.failed === 0 && evaluation.skipped > 0) fail('Incomplete evaluation cannot activate a lesson');
  if (own(evaluation, 'caseResults')) {
    if (!Array.isArray(evaluation.caseResults) || evaluation.caseResults.length !== evaluation.passed + evaluation.failed || evaluation.caseResults.length > 1000) fail('Case receipts do not match the executed count');
    const caseIds = new Set();
    for (const item of evaluation.caseResults) {
      fields(item, ['id', 'passed', 'expectedHash'], ['actualHash', 'errorCode'], 'case receipt');
      token(item.id, 'case ID');
      if (caseIds.has(item.id) || typeof item.passed !== 'boolean') fail('Invalid case receipt');
      caseIds.add(item.id);
      for (const key of ['expectedHash', 'actualHash']) if ((key === 'expectedHash' || own(item, key)) && !/^[a-f0-9]{64}$/.test(item[key])) fail('Invalid case evidence hash');
      if (item.passed && !item.actualHash) fail('Passing case needs observed output hash');
      if (own(item, 'errorCode')) token(item.errorCode, 'case error code');
    }
    if (evaluation.caseResults.filter(item => item.passed).length !== evaluation.passed) fail('Case receipts do not match the pass count');
  }
  const receiptHash = hash(evaluation);
  const history = lesson.evaluationHistory ?? [];
  const previous = lesson.evaluation;
  if (previous && same(previous, evaluation)) return state;
  if (history.includes(receiptHash)) fail('A superseded evaluation cannot be replayed');
  if (previous?.timestamp && (!evaluation.timestamp || Date.parse(evaluation.timestamp) <= Date.parse(previous.timestamp))) {
    fail('Evaluation is older than or conflicts with the latest receipt');
  }
  if (history.length >= 1000) fail('Evaluation history limit reached');
  const next = clone(state);
  next.lessons[lessonId] = { ...clone(lesson), state: evaluation.failed > 0 ? 'quarantined' : 'active',
    advisoryOnly: true, evaluation: clone(evaluation), evaluationHistory: [...history, receiptHash] };
  if (lesson.supersedes?.length) {
    // Keep effective replacement history after expiry/quarantine. A later failed check
    // cancels a future interval but cannot revive a rule already superseded by it.
    const intervals = clone(lesson.supersessionHistory ?? []);
    for (const interval of intervals) if (!interval.endedAt) interval.endedAt = evaluation.timestamp;
    const effectiveAt = new Date(Math.max(Date.parse(evaluation.timestamp), Date.parse(lesson.validFrom ?? evaluation.timestamp))).toISOString();
    if (evaluation.failed === 0 && (!lesson.validUntil || Date.parse(effectiveAt) < Date.parse(lesson.validUntil))) {
      intervals.push({ receiptHash, activatedAt: evaluation.timestamp, effectiveAt });
    }
    next.lessons[lessonId].supersessionHistory = intervals;
  }
  return commit(next);
}

function activeProof(lesson) {
  return lesson.state === 'active' && lesson.advisoryOnly === true &&
    lesson.evaluation?.passed > 0 && lesson.evaluation?.failed === 0 && lesson.evaluation?.skipped === 0 &&
    lesson.evaluation?.ruleVersion === lesson.ruleVersion && lesson.evaluation?.inputFingerprint === lesson.inputFingerprint &&
    evaluationBindsDefinition(lesson, lesson.evaluation);
}

/** Historical effective replacements remain retired even when the replacing rule expires. */
function retiredLessons(state, scoped, at) {
  const depthCache = new Map(); const visiting = new Set();
  function depth(lesson) {
    if (depthCache.has(lesson.id)) return depthCache.get(lesson.id);
    if (visiting.has(lesson.id)) fail('Cyclic lesson supersession');
    visiting.add(lesson.id);
    const value = 1 + Math.max(0, ...(lesson.supersedes ?? []).map(id => depth(state.lessons[id])));
    visiting.delete(lesson.id); depthCache.set(lesson.id, value); return value;
  }
  const intervals = [];
  for (const lesson of scoped) {
    validateSupersedes(state, lesson);
    depth(lesson);
    if (!own(lesson, 'supersessionHistory')) continue;
    if (!Array.isArray(lesson.supersessionHistory) || lesson.supersessionHistory.length > 1000 || !lesson.supersedes?.length) fail('Invalid supersession history');
    for (const interval of lesson.supersessionHistory) {
      fields(interval, ['receiptHash', 'activatedAt', 'effectiveAt'], ['endedAt'], 'supersession interval');
      if (typeof interval.receiptHash !== 'string' || !/^[a-f0-9]{64}$/.test(interval.receiptHash) ||
          !lesson.evaluationHistory?.includes(interval.receiptHash)) fail('Supersession needs a recorded evaluation');
      for (const key of ['activatedAt', 'effectiveAt', 'endedAt']) if (own(interval, key)) iso(interval[key], key);
      const activated = Date.parse(interval.activatedAt); const effective = Date.parse(interval.effectiveAt);
      const ended = interval.endedAt ? Date.parse(interval.endedAt) : Infinity;
      if (effective !== Math.max(activated, Date.parse(lesson.validFrom ?? interval.activatedAt)) || ended < activated ||
          (lesson.validUntil && effective >= Date.parse(lesson.validUntil))) fail('Invalid supersession interval');
      if (effective <= at && effective < ended) intervals.push({ lesson, effective });
    }
  }
  // If a future replacement is itself retired before its start, it never retires
  // its predecessor. Descendants win simultaneous starts; registration forbids cycles.
  intervals.sort((a, b) => a.effective - b.effective || depth(b.lesson) - depth(a.lesson) || a.lesson.id.localeCompare(b.lesson.id));
  const retired = new Set();
  for (const { lesson } of intervals) {
    if (retired.has(lesson.id)) continue;
    for (const id of lesson.supersedes) retired.add(id);
  }
  return retired;
}

function eligibleForContext(state, currentContext, at) {
  const scoped = Object.values(state.lessons).filter(lesson => same(scopeOf(lesson), currentContext));
  for (const lesson of scoped) lessonMetadata(lesson);
  const retired = retiredLessons(state, scoped, at);
  return scoped.filter(lesson => activeProof(lesson) && !retired.has(lesson.id) &&
    (!lesson.validFrom || Date.parse(lesson.validFrom) <= at) && (!lesson.validUntil || at < Date.parse(lesson.validUntil)));
}

function selectLessons(eligible, { limit, maxChars }, deduplicateGuidance = false) {
  const chosen = eligible.filter(lesson => !lesson.conflictKey);
  const conflicts = [];
  for (const group of groupBy(eligible.filter(lesson => lesson.conflictKey), lesson => lesson.conflictKey)) {
    const highest = Math.max(...group.map(authority));
    const preferred = group.filter(lesson => authority(lesson) === highest).sort((a, b) => a.id.localeCompare(b.id));
    if (new Set(preferred.map(lesson => lesson.guidance)).size > 1) {
      conflicts.push({ conflictKey: group[0].conflictKey, lessonIds: group.map(lesson => lesson.id).sort(), reason: 'equal_authority_conflict' });
    } else chosen.push(preferred[0]);
  }
  chosen.sort((a, b) => authority(b) - authority(a) || a.id.localeCompare(b.id));
  conflicts.sort((a, b) => a.conflictKey.localeCompare(b.conflictKey));
  const lessons = []; const includedGuidance = new Set(); let chars = 0;
  for (const lesson of chosen) {
    const length = [...lesson.guidance].length;
    if (lessons.length >= limit || chars + length > maxChars ||
        (deduplicateGuidance && includedGuidance.has(lesson.guidance))) continue;
    lessons.push(clone(lesson)); chars += length; includedGuidance.add(lesson.guidance);
  }
  const omitted = eligible.length - lessons.length;
  return { lessons, conflicts, omitted };
}

function selectContext(state, currentContext, { now, limit, maxChars }) {
  stateCheck(state);
  fields(currentContext, ['domain', 'operation', 'engine', 'context'], [], 'recall context'); scope(currentContext);
  iso(now, 'now'); const at = Date.parse(now);
  const { lessons, conflicts, omitted } = selectLessons(eligibleForContext(state, currentContext, at), { limit, maxChars });
  return { lessons, conflicts, omitted, fingerprint: hash({ scope: currentContext,
    lessons: lessons.map(lessonDefinition), conflicts, omitted, limit, maxChars }), revision: state.revision };
}

function recallOptions(options) {
  fields(options, [], ['now', 'limit', 'maxChars'], 'recall options');
  const now = own(options, 'now') ? options.now : new Date().toISOString();
  const limit = own(options, 'limit') ? options.limit : 5;
  const maxChars = own(options, 'maxChars') ? options.maxChars : 4000;
  integer(limit, 'limit', 20); integer(maxChars, 'maxChars', 16384);
  if (limit < 1 || maxChars < 1) fail('Recall limits must be positive');
  return { now, limit, maxChars };
}

/** Bounded advisory context; complete guidance is omitted rather than truncated. */
export function recallContext(state, currentContext, options = {}) {
  return selectContext(state, currentContext, recallOptions(options));
}

/** Combine up to three exact scopes within one owner-bound state and engine context.
 * Conflicts, identical guidance and budgets are resolved across the complete set.
 * A one-scope call retains the existing single-context contract and fingerprint.
 */
export function recallContexts(state, contexts, options = {}) {
  const settings = recallOptions(options);
  stateCheck(state);
  if (!Array.isArray(contexts) || contexts.length < 1 || contexts.length > 3 ||
      Object.getOwnPropertySymbols(contexts).length ||
      Object.getOwnPropertyNames(contexts).some(key => key !== 'length' && !/^[0-2]$/.test(key))) {
    fail('Recall contexts must contain one to three exact scopes');
  }
  const scopes = []; const seen = new Set();
  for (let index = 0; index < contexts.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(contexts, String(index));
    if (!descriptor || !own(descriptor, 'value')) fail('Recall contexts cannot contain holes or accessors');
    const currentContext = descriptor.value;
    fields(currentContext, ['domain', 'operation', 'engine', 'context'], [], 'recall context'); scope(currentContext);
    const key = canonical(currentContext);
    if (seen.has(key)) fail('Duplicate recall context');
    seen.add(key);
    if (scopes.length && (scopes[0].engine !== currentContext.engine || !same(scopes[0].context, currentContext.context))) {
      fail('Recall contexts must share the same engine and context');
    }
    scopes.push(scopeOf(currentContext));
  }
  if (scopes.length === 1) return selectContext(state, scopes[0], settings);
  iso(settings.now, 'now'); const at = Date.parse(settings.now);
  scopes.sort((a, b) => canonical(a).localeCompare(canonical(b)));
  const eligible = scopes.flatMap(currentContext => eligibleForContext(state, currentContext, at));
  const { lessons, conflicts, omitted } = selectLessons(eligible, settings, true);
  return { lessons, conflicts, omitted, fingerprint: hash({ scopes,
    lessons: lessons.map(lessonDefinition), conflicts, omitted,
    limit: settings.limit, maxChars: settings.maxChars }), revision: state.revision };
}

/** Preserve the legacy array/all-results contract while sharing lifecycle filters. */
export function recall(state, currentContext) {
  return selectContext(state, currentContext, { now: new Date().toISOString(),
    limit: LIMITS.lessons, maxChars: LIMITS.lessons * 2048 }).lessons;
}

function groupBy(items, keyOf) {
  const groups = new Map();
  for (const item of items) { const key = keyOf(item); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(item); }
  return [...groups.values()];
}
const taskCount = (items) => new Set(items.map(item => item.taskId)).size;
function evidenceOf(items) {
  return [...new Set(items.flatMap(item => [...item.evidenceRefs, `event:${item.eventId}`]))].sort().slice(0, 64);
}
function benefitOf(items) {
  const baseline = {};
  for (const key of ['durationMs', 'userSteps', 'toolCalls']) {
    if (items.length && items.every(item => typeof item.metrics?.[key] === 'number')) {
      baseline[key] = items.reduce((sum, item) => sum + item.metrics[key], 0) / taskCount(items);
    }
  }
  return { basis: Object.keys(baseline).length ? 'measured' : 'unmeasured',
    baseline: Object.keys(baseline).length ? baseline : null, baselineUnit: 'per_independent_task', savings: null };
}

export function propose(state, options = {}) {
  stateCheck(state); fields(options, [], ['now', 'thresholds'], 'proposal options');
  const now = options.now ?? new Date().toISOString(); iso(now, 'now');
  const defaults = { failures: 2, routines: 3, corrections: 2, verificationGaps: 1,
    learningFailures: 3, learningOperations: 2, holdoutCases: 1 };
  const overrides = options.thresholds ?? {}; fields(overrides, [], Object.keys(defaults), 'thresholds');
  const thresholds = { ...defaults, ...overrides };
  for (const [key, value] of Object.entries(thresholds)) { integer(value, key, 10000); if (value < 1) fail('Thresholds must be positive'); }
  if (thresholds.learningFailures < 3 || thresholds.learningOperations < 2) fail('Learning evaluation requires independent diverse examples');
  const attempts = Object.values(state.attempts);
  const next = clone(state); const created = []; let changed = false;
  const observedProposalIds = new Set();
  function offer(kind, items, pattern, reason, proposalScope = scopeOf(items[0]), extra = {}) {
    const patternKey = hash({ scope: proposalScope, pattern });
    const id = `proposal-${hash({ kind, patternKey })}`;
    observedProposalIds.add(id);
    const existing = next.proposals[id];
    const reopened = existing?.status === 'resolved';
    const proposal = { id, kind, scope: clone(proposalScope), patternKey,
      status: reopened ? 'open' : (existing?.status ?? 'open'), createdAt: existing?.createdAt ?? now,
      independentTaskCount: taskCount(items), evidenceRefs: evidenceOf(items),
      expectedBenefit: benefitOf(items), reason, advisoryOnly: true, externalEffects: false,
      proposedChange: { rule_fix: 'Add a scoped cause/fix rule and a replay test.',
        workflow_automation: 'Prepare a reusable workflow with explicit inputs and result checks.',
        verification_gap: 'Improve receipt/readback checks for the existing attempt.',
        learning_evaluation: 'Compare candidate approaches on separate held-out cases.' }[kind],
      requiredValidation: ['Evidence review', 'Matching environment and rule version', 'Effect-free regression', 'Outcome readback before live success claims'],
      ...(existing?.verification ? { verification: clone(existing.verification) } : {}),
      ...(existing?.decisionHistory ? { decisionHistory: clone(existing.decisionHistory) } : {}),
      ...(existing?.candidateLinks ? { candidateLinks: clone(existing.candidateLinks) } : {}), ...extra };
    if (existing && same(existing, proposal)) return;
    if (!existing) capacity(next, 'proposals');
    next.proposals[id] = proposal; changed = true;
    if (!existing || reopened) created.push(clone(proposal));
  }
  const groups = groupBy(attempts, item => hash(scopeOf(item)));
  for (const items of groups) {
    const successes = items.filter(item => item.outcome === 'success_verified');
    if (taskCount(successes) >= thresholds.routines) offer('workflow_automation', successes, 'repeated-verified-success',
      'The same workflow succeeded in independent tasks; propose a reusable workflow with outcome checks.');
    const uncertain = items.filter(item => item.outcome === 'completion_unknown');
    if (taskCount(uncertain) >= thresholds.verificationGaps) offer('verification_gap', uncertain, 'completion-unknown',
      'Inspect the existing attempt receipt and result; uncertainty does not authorize replay.');
    for (const outcome of ['failure_verified', 'correction', 'blocked']) {
      for (const patternItems of groupBy(items.filter(item => item.outcome === outcome), item => item.errorCode ?? 'unspecified')) {
        const limit = outcome === 'correction' ? thresholds.corrections : thresholds.failures;
        if (taskCount(patternItems) < limit) continue;
        offer('rule_fix', patternItems, [outcome, patternItems[0].errorCode ?? 'unspecified'], outcome === 'blocked'
          ? 'Review repeated blocked steps and their guidance; preserve the existing access and approval boundaries.'
          : 'Review the recurring failure or correction and add a scoped rule plus a regression check.');
      }
    }
  }
  const reviewed = attempts.filter(item => item.outcome === 'failure_verified' && item.labels?.reviewed === true);
  const trainingGroups = groupBy(reviewed, item => hash({ domain: item.domain, engine: item.engine, context: item.context }));
  for (const items of trainingGroups) {
    const training = items.filter(item => item.labels?.holdout !== true && item.labels?.ruleRemediationTried === true);
    const trainingTasks = new Set(training.map(item => item.taskId));
    const holdout = items.filter(item => item.labels?.holdout === true && !trainingTasks.has(item.taskId));
    const operations = new Set(training.map(item => item.operation));
    if (taskCount(training) < thresholds.learningFailures || operations.size < thresholds.learningOperations || taskCount(holdout) < thresholds.holdoutCases) continue;
    offer('learning_evaluation', [...training, ...holdout], 'reviewed-cross-operation-failures',
      'Reviewed failures remain after rule remediation; compare a candidate approach on separate held-out tasks before proposing additional model learning.',
      { ...scopeOf(items[0]), operation: '*' }, { learningReadiness: { trainingTasks: taskCount(training),
        holdoutTasks: taskCount(holdout), distinctOperations: operations.size, ruleRemediationTried: true, holdoutSeparated: true } });
  }
  for (const proposal of Object.values(next.proposals)) {
    if (proposal.kind === 'verification_gap' && proposal.status === 'open' && !observedProposalIds.has(proposal.id)) {
      // Resolution means the uncertain attempt no longer exists, not that a proposed fix was tested.
      proposal.status = 'resolved'; proposal.resolvedAt = now;
      proposal.resolution = 'No currently uncertain attempt in this scope'; changed = true;
    }
  }
  return { state: changed ? commit(next) : state, proposals: created };
}

export function setProposalStatus(state, proposalId, status, verification) {
  stateCheck(state); token(proposalId, 'proposal ID');
  if (!own(state.proposals, proposalId)) fail('Unknown proposal');
  if (!STATUSES.has(status)) fail('Invalid proposal status');
  const previous = state.proposals[proposalId].status;
  if (previous === status) return state;
  const transitions = { open: new Set(['accepted', 'dismissed']), accepted: new Set(['implemented', 'dismissed']),
    implemented: new Set(['verified', 'dismissed']), verified: new Set(), dismissed: new Set(), resolved: new Set() };
  if (!transitions[previous]?.has(status)) fail('Invalid proposal status transition');
  if (status === 'verified') {
    fields(verification, ['passed', 'failed', 'skipped', 'evidenceRefs', 'timestamp'], [], 'proposal verification');
    for (const key of ['passed', 'failed', 'skipped']) integer(verification[key], key, 1e6);
    refs(verification.evidenceRefs, true); iso(verification.timestamp);
    if (verification.passed < 1 || verification.failed || verification.skipped) fail('Verified proposals require an executed passing check');
  }
  const next = clone(state); next.proposals[proposalId].status = status;
  if (status === 'verified') next.proposals[proposalId].verification = clone(verification);
  return commit(next);
}
