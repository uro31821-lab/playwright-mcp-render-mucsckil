/** Explicit owner-host observations, never a chat scraper or a Library importer.
 * Namespace/history ideas were reviewed from LangGraph and Mem0; no code copied.
 * The existing JH core supplies transactional CAS, immutable retries and proposals.
 */
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { recallContexts, validateEvent } from './engine.mjs';
import { observeTask, taskView } from './host-observations.mjs';
import { proposalContext } from './proposal-context.mjs';

export const HOST_MEMORY_ENGINE = 'jh-agent';
export const HOST_MEMORY_CONTEXT = Object.freeze({
  platform: 'chatgpt', version: 'operational-learning-v1', environment: 'personal',
});
const DOMAINS = new Set(['connection', 'device', 'web', 'output', 'research', 'calculation',
  'routine', 'development', 'orchestration']);
const OPAQUE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;
const HOST_TASK = /^host-task-[a-f0-9]{64}$/;
const HOST_ATTEMPT = /^host-attempt-[a-f0-9]{64}$/;
const HOST_EVENT = /^host-observation-[a-f0-9]{64}$/;
const own = (value, key) => Object.hasOwn(value, key);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = (code = 'LEARNING_HOST_REQUEST_INVALID') => { throw Object.assign(new TypeError(code), { code }); };
const BOUNDARIES = Object.freeze({
  advisoryOnly: true, externalEffects: false, replayAllowed: false,
  sourceAuthentication: 'authenticated_owner_attestation', sourceRetrievalVerified: false,
  liveExecutionVerified: false, librarySync: 'not_connected', ordinaryChatsObserved: false,
  episodesRequireReview: true, activatedByThisCall: false,
});

function object(value) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).some(key => typeof key !== 'string') ||
      Object.values(descriptors).some(item => !own(item, 'value') || !item.enumerable)) fail();
}
function fields(value, required, optional = []) {
  object(value);
  if (required.some(key => !own(value, key)) ||
      Object.keys(value).some(key => ![...required, ...optional].includes(key))) fail();
}
function credentials(value) {
  return /(?:^|\s)Bearer\s+[A-Za-z0-9._~+\/=-]{16,}/i.test(value) ||
    /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,})\b/.test(value) ||
    /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/.test(value) ||
    /(?:^|[^A-Za-z0-9_-])eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:$|[^A-Za-z0-9_-])/.test(value);
}
function dataOnly(value, depth = 0, budget = { remaining: 4096 }) {
  if (depth > 12 || --budget.remaining < 0) fail();
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'string') {
    if (!value.isWellFormed() || credentials(value) || /[a-z][a-z0-9+.-]*:\/\//i.test(value)) fail();
    return;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (types.isProxy(value)) fail();
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype || value.length > 64 ||
        Reflect.ownKeys(value).length !== value.length + 1) fail();
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (let index = 0; index < value.length; index++) {
      const item = descriptors[index];
      if (!item || !own(item, 'value') || !item.enumerable) fail();
      dataOnly(item.value, depth + 1, budget);
    }
    return;
  }
  object(value);
  if (Object.keys(value).length > 64) fail();
  for (const item of Object.values(value)) dataOnly(item, depth + 1, budget);
}
function request(value) {
  dataOnly(value);
  if (JSON.stringify(value).length > 65536) fail();
}
function opaque(value) { if (typeof value !== 'string' || !OPAQUE.test(value)) fail(); }
function integer(value, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail();
}
function nowValue(options) {
  fields(options, ['now']); request(options);
  const value = options.now;
  const match = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) fail('LEARNING_HOST_TIME_INVALID');
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || Number(match[4]) > 23 ||
      Number(match[5]) > 59 || Number(match[6]) > 59 || Number(match[9] ?? 0) > 23 || Number(match[10] ?? 0) > 59) {
    fail('LEARNING_HOST_TIME_INVALID');
  }
  return value;
}
function scope(domain, operation) {
  if (!DOMAINS.has(domain)) fail(); opaque(operation);
  return { domain, operation, engine: HOST_MEMORY_ENGINE, context: { ...HOST_MEMORY_CONTEXT } };
}
function identities(taskRef, attemptRef) {
  opaque(taskRef);
  if (attemptRef !== undefined) opaque(attemptRef);
  return { taskId: 'host-task-' + hash(['jh.host-memory.task.v1', taskRef]),
    ...(attemptRef === undefined ? {} : {
      attemptId: 'host-attempt-' + hash(['jh.host-memory.attempt.v1', taskRef, attemptRef]),
    }) };
}
function hostScope(value) {
  return value.engine === HOST_MEMORY_ENGINE && value.context &&
    Object.keys(value.context).length === 3 &&
    Object.entries(HOST_MEMORY_CONTEXT).every(([key, expected]) => value.context[key] === expected);
}
function exactScope(value, query) {
  return hostScope(value) && value.domain === query.domain && value.operation === query.operation;
}
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
}
const withoutMetrics = value => Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'metrics'));

function checkNamespaces(state, taskId) {
  // taskView validates the complete stored data before any local iteration.
  const view = taskView(state, { taskId, limit: 1 });
  for (const collection of [state.events, state.attempts]) for (const value of Object.values(collection)) {
    const reserved = String(value.taskId).startsWith('host-task-') || String(value.attemptId).startsWith('host-attempt-');
    if (!reserved) continue;
    if (!HOST_TASK.test(value.taskId) || !HOST_ATTEMPT.test(value.attemptId) || !HOST_EVENT.test(value.eventId) ||
        !hostScope(value) || own(value, 'ruleUses')) fail('LEARNING_HOST_SCOPE_CONFLICT');
    validateEvent(value);
  }
  return view;
}

/** The owner and persistence path are never accepted from the caller. */
export function normalizeHostObservation(input) {
  fields(input, ['taskRef', 'attemptRef', 'observationRef', 'domain', 'operation', 'observation', 'expectedRevision']);
  request(input);
  fields(input.observation, ['timestamp', 'outcome', 'source', 'evidenceRefs'], ['errorCode', 'metrics', 'labels']);
  integer(input.expectedRevision, 0, Number.MAX_SAFE_INTEGER - 1);
  const normalized = { ...identities(input.taskRef, input.attemptRef), observationRef: input.observationRef,
    scope: scope(input.domain, input.operation), observation: structuredClone(input.observation),
    expectedRevision: input.expectedRevision };
  // This preliminary core validation leaves reference equality and result-proof
  // checks to observeTask in the transaction. No synthetic event is persisted.
  validateEvent({ eventId: 'host-observation-' + hash([normalized.taskId, normalized.attemptId, normalized.observationRef]),
    taskId: normalized.taskId, attemptId: normalized.attemptId, sequence: 0,
    ...normalized.scope, ...normalized.observation });
  return normalized;
}

/** Call inside the owner transaction, with no outer revision check. */
export function observeHostMemory(state, input, options) {
  const now = nowValue(options);
  const normalized = normalizeHostObservation(input);
  checkNamespaces(state, normalized.taskId);
  const result = observeTask(state, normalized, { now });
  // Exact immutable retries are recoverable even after the observation time has
  // become old or the caller's original expected revision has advanced.
  if (!result.duplicate && Date.parse(result.event.timestamp) > Date.parse(now)) {
    fail('LEARNING_HOST_OBSERVATION_FUTURE');
  }
  return { ...result, ...BOUNDARIES, readOnly: result.duplicate };
}

/** Read one caller-known host task; raw server task/job IDs are never selectors. */
export function hostMemoryTaskView(state, input) {
  fields(input, ['taskRef'], ['attemptRef', 'limit']); request(input);
  const identity = identities(input.taskRef, input.attemptRef);
  const limit = input.limit ?? 5; integer(limit, 1, 10);
  checkNamespaces(state, identity.taskId);
  const view = taskView(state, { ...identity, limit });
  const attempts = [];
  for (const item of view.attempts) {
    if (!HOST_TASK.test(item.taskId) || !HOST_ATTEMPT.test(item.attemptId) || !hostScope(item.scope)) {
      fail('LEARNING_HOST_SCOPE_CONFLICT');
    }
    if (JSON.stringify([...attempts, item]).length <= 16000) attempts.push(item);
  }
  return { ...view, attempts, counts: { ...view.counts, returnedAttempts: attempts.length },
    omittedAttempts: view.counts.matchingAttempts - attempts.length,
    budget: { maxChars: 16000, selectedChars: JSON.stringify(attempts).length, scope: 'serialized_attempts_array' },
    ...BOUNDARIES, readOnly: true };
}

function lessonSummary(lesson) {
  return { id: lesson.id, ruleVersion: lesson.ruleVersion, state: lesson.state,
    scope: scope(lesson.domain, lesson.operation), guidance: lesson.guidance,
    memoryKind: lesson.memoryKind ?? 'procedure', provenance: lesson.provenance ?? 'legacy',
    evidenceRefs: lesson.evidenceRefs.slice(0, 8), evidenceRefsOmitted: Math.max(0, lesson.evidenceRefs.length - 8),
    validFrom: lesson.validFrom ?? null, validUntil: lesson.validUntil ?? null, advisoryOnly: true };
}
function projectedHostRows(state, query) {
  const rows = [];
  for (const [key, projected] of Object.entries(state.attempts)) {
    if (!HOST_TASK.test(projected.taskId) || !HOST_ATTEMPT.test(projected.attemptId) || !exactScope(projected, query)) continue;
    validateEvent(projected);
    const original = state.events[projected.eventId];
    if (!original || key !== hash([projected.taskId, projected.attemptId])) fail('LEARNING_HOST_SCOPE_CONFLICT');
    validateEvent(original);
    if (canonical(withoutMetrics(original)) !== canonical(withoutMetrics(projected))) fail('LEARNING_HOST_SCOPE_CONFLICT');
    rows.push(projected);
  }
  return rows.sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp) || left.eventId.localeCompare(right.eventId));
}

/** Active advice and recent attested episodes stay separate, even at zero lessons. */
export function hostMemoryContext(state, input, options) {
  fields(input, ['domain', 'operation'], ['limit', 'max_chars']); request(input);
  const now = nowValue(options);
  const query = scope(input.domain, input.operation);
  const commonScope = scope('orchestration', 'learning.scope');
  const limit = input.limit ?? 5, maxChars = input.max_chars ?? 6000;
  integer(limit, 1, 10); integer(maxChars, 256, 16000);
  checkNamespaces(state, 'host-task-' + '0'.repeat(64));
  const queries = canonical(query) === canonical(commonScope) ? [query] : [query, commonScope];
  const recalled = recallContexts(state, queries, { now, limit: 20, maxChars: 16384 });
  const offered = proposalContext(state, queries, { limit: 10, maxChars: 16384 });
  const allRows = projectedHostRows(state, query);
  const rows = allRows.filter(row => Date.parse(row.timestamp) <= Date.parse(now));
  const arrays = { lessons: [], conflicts: [], proposals: [], episodes: [] };
  const fit = (key, item) => {
    if (arrays[key].length >= limit) return;
    const next = { ...arrays, [key]: [...arrays[key], item] };
    if (JSON.stringify(next).length <= maxChars) arrays[key].push(item);
  };
  // Conflicting advice is withheld by the core even if its diagnostic item does
  // not fit. The output explicitly reports omitted conflict records.
  for (const item of recalled.conflicts) fit('conflicts', item);
  for (const item of recalled.lessons) fit('lessons', lessonSummary(item));
  for (const item of offered.items) fit('proposals', item);
  for (const row of rows.slice(0, limit)) {
    const item = taskView(state, { taskId: row.taskId, attemptId: row.attemptId, limit: 1 }).attempts[0];
    if (!item) fail('LEARNING_HOST_SCOPE_CONFLICT');
    fit('episodes', { taskId: item.taskId, attemptId: item.attemptId, scope: item.scope,
      eventCount: item.eventCount, projection: item.projection, latestObservation: item.latestObservation,
      sourceAuthentication: BOUNDARIES.sourceAuthentication, sourceRetrievalVerified: false,
      liveExecutionVerified: false, episodesRequireReview: true });
  }
  const omitted = {
    lessons: recalled.omitted + recalled.lessons.length - arrays.lessons.length,
    conflicts: recalled.conflicts.length - arrays.conflicts.length,
    proposals: offered.omitted + offered.items.length - arrays.proposals.length,
    episodes: allRows.length - arrays.episodes.length,
  };
  return { schema: 'jh.host-memory-context.v1', revision: state.revision,
    scope: query, commonScope, observedAt: now, ...arrays, omitted,
    counts: { scopedProjectedAttempts: allRows.length, futureEpisodesOmitted: allRows.length - rows.length,
      returnedEpisodes: arrays.episodes.length, returnedLessons: arrays.lessons.length,
      returnedProposals: arrays.proposals.length, returnedConflicts: arrays.conflicts.length },
    budget: { maxChars, selectedChars: JSON.stringify(arrays).length, limit, limitScope: 'per_array',
      scope: 'serialized_lessons_conflicts_proposals_episodes_arrays' },
    fingerprint: hash({ revision: state.revision, query, commonScope, observedAt: now, arrays, omitted, limit, maxChars }),
    ...BOUNDARIES, readOnly: true };
}
