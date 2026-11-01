import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { validateEvent } from './engine.mjs';
import { matchesProposal } from './curation.mjs';

const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/+-]{0,127}$/;
const HEX = /^[a-f0-9]{64}$/;
const REF = /^(?:sha256|event|fixture|user|artifact|library|regression|test|source|commit):[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$/;
const DOMAINS = new Set(['connection', 'device', 'web', 'output', 'research', 'calculation', 'routine', 'development', 'orchestration']);
const KINDS = new Set(['rule_fix', 'workflow_automation', 'verification_gap', 'learning_evaluation']);
const STATUSES = new Set(['open', 'accepted', 'implemented', 'verified', 'dismissed', 'resolved']);
const MAX_SAMPLES = 4; const MAX_USES = 1; const MAX_EVIDENCE = 8; const MAX_PROPOSALS = 4;
const own = (value, key) => Object.hasOwn(value, key);
const clone = value => structuredClone(value);
const fail = message => { throw new TypeError(message); };
const byId = (left, right) => left < right ? -1 : left > right ? 1 : 0;

function object(value, label) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(`Invalid ${label}`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).some(key => typeof key !== 'string') ||
      Object.values(descriptors).some(item => !own(item, 'value') || !item.enumerable)) fail(`Invalid ${label}`);
}
function fields(value, required, optional = [], label = 'usage review') {
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
// Recognizable credentials are a backstop, not a complete privacy detector or
// source authenticator. Review returns opaque references, never source contents.
function credential(value) {
  return /(?:^|\s)Bearer\s+[A-Za-z0-9._~+\/=-]{16,}/i.test(value) ||
    /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,})\b/.test(value) ||
    /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/.test(value) ||
    /(?:^|[^A-Za-z0-9_-])eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:$|[^A-Za-z0-9_-])/.test(value);
}
function dataOnly(value, depth = 0, budget = { nodes: 2000000, chars: 25 * 1024 * 1024 }, ancestors = new Set()) {
  if (--budget.nodes < 0 || depth > 64) fail('Usage review data exceeds its bounds');
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'string') {
    budget.chars -= value.length;
    if (budget.chars < 0 || !value.isWellFormed() || credential(value)) fail('Invalid usage review text');
    return;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (types.isProxy(value)) fail('Invalid usage review data');
  if (ancestors.has(value)) fail('Cyclic usage review data');
  ancestors.add(value);
  if (Array.isArray(value)) {
    array(value, 0, 10000, 'usage review data array');
    for (let index = 0; index < value.length; index++) dataOnly(value[index], depth + 1, budget, ancestors);
  } else {
    object(value, 'usage review data');
    if (Object.keys(value).length > 10000) fail('Usage review data exceeds its bounds');
    for (const key of Object.keys(value)) {
      budget.chars -= key.length;
      if (budget.chars < 0 || !key.isWellFormed() || credential(key)) fail('Invalid usage review key');
      dataOnly(value[key], depth + 1, budget, ancestors);
    }
  }
  ancestors.delete(value);
}
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
}
const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
const attemptKey = value => digest([value.taskId, value.attemptId]);
const scopeOf = value => ({ domain: value.domain, operation: value.operation, engine: value.engine, context: value.context });
function token(value) { if (typeof value !== 'string' || !TOKEN.test(value)) fail('Invalid usage review identity'); }
function integer(value, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail('Invalid usage review count');
}
function scope(value, wildcard = false) {
  fields(value, ['domain', 'operation', 'engine', 'context'], [], 'usage review scope');
  if (!DOMAINS.has(value.domain)) fail('Invalid usage review domain');
  if (!(wildcard && value.operation === '*')) token(value.operation);
  token(value.engine);
  fields(value.context, ['platform', 'version', 'environment'], [], 'usage review context');
  Object.values(value.context).forEach(token);
}
function timestamp(value) {
  const match = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) fail('Invalid usage review timestamp');
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || Number(match[4]) > 23 ||
      Number(match[5]) > 59 || Number(match[6]) > 59 || Number(match[9] ?? 0) > 23 || Number(match[10] ?? 0) > 59) fail('Invalid usage review timestamp');
}
function refs(value) {
  array(value, 1, 64, 'proposal evidence');
  if (value.some(ref => typeof ref !== 'string' || !REF.test(ref)) || new Set(value).size !== value.length) fail('Invalid proposal references');
}
function text(value, max) {
  if (typeof value !== 'string' || !value.trim() || [...value].length > max ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) fail('Invalid proposal text');
}
function proposal(value, id) {
  fields(value, ['id', 'kind', 'scope', 'patternKey', 'status', 'createdAt', 'independentTaskCount',
    'evidenceRefs', 'expectedBenefit', 'reason', 'advisoryOnly', 'externalEffects', 'proposedChange', 'requiredValidation'],
  ['verification', 'decisionHistory', 'candidateLinks', 'learningReadiness', 'resolvedAt', 'resolution'], 'stored proposal');
  token(id);
  if (value.id !== id || !KINDS.has(value.kind) || !STATUSES.has(value.status) || value.advisoryOnly !== true ||
      value.externalEffects !== false || typeof value.patternKey !== 'string' || !HEX.test(value.patternKey)) fail('Invalid stored proposal');
  scope(value.scope, value.kind === 'learning_evaluation'); timestamp(value.createdAt);
  integer(value.independentTaskCount, 1, 10000); refs(value.evidenceRefs);
  text(value.reason, 2048); text(value.proposedChange, 2048);
  array(value.requiredValidation, 1, 8, 'proposal validation'); value.requiredValidation.forEach(item => text(item, 512));
  fields(value.expectedBenefit, ['basis', 'baseline', 'baselineUnit', 'savings'], [], 'proposal benefit');
  const benefit = value.expectedBenefit;
  if (!['measured', 'unmeasured'].includes(benefit.basis) || benefit.baselineUnit !== 'per_independent_task' || benefit.savings !== null) fail('Invalid proposal benefit');
  if (benefit.basis === 'unmeasured') {
    if (benefit.baseline !== null) fail('Unmeasured proposal cannot claim a baseline');
  } else {
    fields(benefit.baseline, [], ['durationMs', 'userSteps', 'toolCalls'], 'proposal baseline');
    if (!Object.keys(benefit.baseline).length || Object.values(benefit.baseline).some(item =>
      typeof item !== 'number' || !Number.isFinite(item) || item < 0 || item > Number.MAX_SAFE_INTEGER)) fail('Invalid proposal baseline');
  }
  if (own(value, 'resolvedAt')) timestamp(value.resolvedAt);
  if (own(value, 'resolution')) text(value.resolution, 2048);
}
function stateCheck(state) {
  dataOnly(state);
  fields(state, ['schema', 'revision', 'events', 'attempts', 'lessons', 'proposals'], [], 'learning state');
  if (state.schema !== 'jh.operational-learning.v1') fail('Invalid learning state');
  integer(state.revision, 0, Number.MAX_SAFE_INTEGER - 1);
  for (const [key, max] of Object.entries({ events: 10000, attempts: 3000, lessons: 1000, proposals: 1000 })) {
    object(state[key], key);
    if (Object.keys(state[key]).length > max) fail('Learning state exceeds its bounds');
  }
}
function requests(queries, options) {
  dataOnly(queries); dataOnly(options);
  array(queries, 1, 3, 'usage review scopes'); queries.forEach(query => scope(query));
  const keys = queries.map(canonical);
  if (new Set(keys).size !== keys.length) fail('Duplicate usage review scope');
  if (queries.some(query => query.engine !== queries[0].engine || canonical(query.context) !== canonical(queries[0].context))) fail('Usage review scopes must share engine and context');
  fields(options, [], ['limit', 'maxChars', 'seenNoticeFingerprints'], 'usage review options');
  const limit = own(options, 'limit') ? options.limit : 3;
  const maxChars = own(options, 'maxChars') ? options.maxChars : 12000;
  integer(limit, 1, 10); integer(maxChars, 1, 32768);
  const seen = own(options, 'seenNoticeFingerprints') ? options.seenNoticeFingerprints : [];
  array(seen, 0, 64, 'seen usage notices');
  if (seen.some(item => typeof item !== 'string' || !HEX.test(item)) || new Set(seen).size !== seen.length) fail('Invalid seen usage notices');
  return { queries: clone(queries).sort((left, right) => byId(canonical(left), canonical(right))),
    keys: new Set(keys), limit, maxChars, seen: new Set(seen) };
}
function withoutMetrics(event) { return Object.fromEntries(Object.entries(event).filter(([key]) => key !== 'metrics')); }

// Validate the complete stored event/attempt graph before filtering scope. Only
// historical structure is checked: a rule's current state cannot invalidate an
// earlier observation. Projection metrics may retain prior maxima, as in engine.
function history(state) {
  const attempts = new Map(); const references = new Set();
  for (const [id, event] of Object.entries(state.events)) {
    validateEvent(event);
    if (event.eventId !== id) fail('Invalid stored usage event binding');
    const key = attemptKey(event);
    if (!attempts.has(key)) attempts.set(key, { events: [], projection: null });
    attempts.get(key).events.push(event);
    for (const usage of event.ruleUses ?? []) {
      if (references.has(usage.useRef)) fail('Duplicate stored rule-use reference');
      references.add(usage.useRef);
    }
  }
  for (const [key, projected] of Object.entries(state.attempts)) {
    validateEvent(projected);
    const group = attempts.get(key);
    if (key !== attemptKey(projected) || !group || !own(state.events, projected.eventId) ||
        canonical(withoutMetrics(projected)) !== canonical(withoutMetrics(state.events[projected.eventId]))) fail('Invalid stored usage projection');
    const boundScope = canonical(scopeOf(projected));
    if (group.events.some(event => canonical(scopeOf(event)) !== boundScope)) fail('Conflicting stored attempt scope');
    group.projection = projected;
  }
  if ([...attempts.values()].some(group => !group.projection)) fail('Missing stored usage projection');
  return attempts;
}
function linkableProposals(state) {
  const result = [];
  for (const [id, value] of Object.entries(state.proposals)) {
    try { proposal(value, id); result.push(value); }
    catch (error) {
      if (!(error instanceof TypeError)) throw error;
      // Incomplete legacy proposals are not widened into links. Executable or
      // non-data state was already rejected before history validation or lookup.
    }
  }
  return result;
}
function evidence(value) {
  return { evidenceRefs: value.slice(0, MAX_EVIDENCE), evidenceRefsOmitted: Math.max(0, value.length - MAX_EVIDENCE),
    evidenceRefsTruncated: value.length > MAX_EVIDENCE };
}
function outcomeClass(item) {
  if (!item.afterUse) return 'unconfirmed';
  if (item.result.outcome === 'success_verified') return 'success';
  if (item.result.outcome === 'failure_verified') return 'failure';
  return 'unconfirmed';
}
function useSummary(item) {
  const { event, usage, result, afterUse } = item;
  return { useRef: usage.useRef, attemptId: event.attemptId,
    selectionFingerprint: usage.selection.fingerprint, evaluationFingerprint: usage.selection.evaluationFingerprint,
    selectedAt: usage.selection.selectedAt, appliedAt: usage.appliedAt,
    recordedEventId: event.eventId, recordedAt: event.timestamp, ...evidence(usage.evidenceRefs),
    result: { eventId: result.eventId, sequence: result.sequence, timestamp: result.timestamp,
      outcome: result.outcome, source: result.source, ...(own(result, 'errorCode') ? { errorCode: result.errorCode } : {}),
      ...evidence(result.evidenceRefs), afterUse, verified: outcomeClass(item) !== 'unconfirmed' } };
}
function taskBucket(items) {
  const values = new Set(items.map(outcomeClass));
  return values.size === 1 ? `${[...values][0]}_only` : 'mixed';
}
const orderedUses = items => [...items].sort((left, right) => byId(left.usage.useRef, right.usage.useRef));
function summarize(group, proposals) {
  const tasks = new Map();
  for (const item of group.uses) {
    if (!tasks.has(item.event.taskId)) tasks.set(item.event.taskId, []);
    tasks.get(item.event.taskId).push(item);
  }
  const counts = { recordedUses: group.uses.length, distinctAttempts: new Set(group.uses.map(item => attemptKey(item.event))).size,
    independentTasks: tasks.size, successOnlyTasks: 0, failureOnlyTasks: 0, unconfirmedOnlyTasks: 0, mixedTasks: 0 };
  const bucketCount = { success_only: 'successOnlyTasks', failure_only: 'failureOnlyTasks', unconfirmed_only: 'unconfirmedOnlyTasks', mixed: 'mixedTasks' };
  for (const items of tasks.values()) counts[bucketCount[taskBucket(items)]]++;
  const samples = [...tasks].sort(([left], [right]) => byId(left, right)).slice(0, MAX_SAMPLES).map(([taskId, items]) => ({
    taskId, bucket: taskBucket(items), recordedUses: items.length, distinctAttempts: new Set(items.map(item => attemptKey(item.event))).size,
    uses: { items: orderedUses(items).slice(0, MAX_USES).map(useSummary), total: items.length, omitted: Math.max(0, items.length - MAX_USES) },
  }));
  // Exact actual scope is checked before the shared curation matcher; its
  // learning-evaluation wildcard is never widened into this usage review.
  const related = proposals.filter(value => ['open', 'accepted'].includes(value.status) &&
    canonical(value.scope) === canonical(group.identity.actualScope) &&
    group.uses.some(item => item.afterUse && matchesProposal(item.result, value)))
    .sort((left, right) => byId(left.id, right.id));
  const links = related.slice(0, MAX_PROPOSALS).map(value => ({ proposalId: value.id, kind: value.kind, status: value.status,
    relationship: 'current_result_pattern', causalEffectVerified: false }));
  const reasonCodes = []; const nextSteps = links.map(value => ({ code: 'PREPARE_EXISTING_REVIEW', proposalId: value.proposalId }));
  if (counts.failureOnlyTasks >= 2) { reasonCodes.push('REPEATED_FAILURE_AFTER_ATTESTED_USE'); nextSteps.push({ code: 'REVIEW_RECORDED_FAILURES' }); }
  if (counts.unconfirmedOnlyTasks >= 1) { reasonCodes.push('POST_USE_RESULT_UNCONFIRMED'); nextSteps.push({ code: 'READ_EXISTING_RESULT_EVIDENCE' }); }
  if (counts.mixedTasks > 0) { reasonCodes.push('MIXED_TASK_OUTCOMES'); nextSteps.push({ code: 'REVIEW_MIXED_CURRENT_RESULTS' }); }
  if (counts.independentTasks === 1 && counts.successOnlyTasks === 1) reasonCodes.push('INSUFFICIENT_REPEATED_EVIDENCE');
  if (!reasonCodes.length) reasonCodes.push('RECORDED_OUTCOMES_ONLY');
  if (!nextSteps.length) nextSteps.push({ code: 'WAIT_FOR_INDEPENDENT_OBSERVATIONS' });
  // Bind untruncated source uses, original observation envelopes, current results
  // and complete matching proposal metadata. These digests are not review packet
  // approvals, execution proofs, or evidence that a notice was delivered.
  const originalEvents = [...new Map(group.uses.map(item => [item.event.eventId, item.event])).values()].sort((left, right) => byId(left.eventId, right.eventId));
  const currentResults = [...new Map(group.uses.map(item => [attemptKey(item.result), item.result])).values()].sort((left, right) => byId(attemptKey(left), attemptKey(right)));
  const noticeFingerprint = digest({ identity: group.identity,
    uses: orderedUses(group.uses).map(item => ({ eventId: item.event.eventId, usage: item.usage })), originalEvents, currentResults, proposals: related });
  return { identity: clone(group.identity), counts,
    samples: { items: samples, total: tasks.size, omitted: Math.max(0, tasks.size - MAX_SAMPLES) },
    relatedProposals: { items: links, total: related.length, omitted: Math.max(0, related.length - MAX_PROPOSALS) },
    reasonCodes, nextSteps, noticeFingerprint };
}

/** Read historical use attestations and same-attempt current results from one
 * snapshot. Counts never assert causation, authenticate source contents, label
 * training examples, modify proposals or authorize a replay of the actual work.
 */
export function usageReview(state, queries, options = {}) {
  stateCheck(state); const request = requests(queries, options); const attempts = history(state);
  const grouped = new Map(); const all = [];
  for (const group of attempts.values()) {
    for (const event of group.events) for (const usage of event.ruleUses ?? []) {
      if (!request.keys.has(canonical(usage.selection.scope))) continue;
      const selected = usage.selection;
      const identity = { lessonId: selected.lessonId, ruleVersion: selected.ruleVersion, inputFingerprint: selected.inputFingerprint,
        definitionFingerprint: selected.definitionFingerprint, actualScope: selected.scope };
      const key = canonical(identity);
      if (!grouped.has(key)) grouped.set(key, { identity, uses: [] });
      const item = { event, usage, result: group.projection,
        afterUse: group.projection.sequence >= event.sequence && Date.parse(group.projection.timestamp) >= Date.parse(usage.appliedAt) };
      grouped.get(key).uses.push(item); all.push(item);
    }
  }
  const totals = { matchingGroups: grouped.size, recordedUses: all.length,
    distinctAttempts: new Set(all.map(item => attemptKey(item.event))).size, independentTasks: new Set(all.map(item => item.event.taskId)).size };
  const groups = []; let omitted = 0; let suppressed = 0; let chars = 0;
  const proposals = linkableProposals(state);
  const allNotices = [];
  for (const [, value] of [...grouped].sort(([left], [right]) => byId(left, right))) {
    const item = summarize(value, proposals); allNotices.push(item.noticeFingerprint);
    if (request.seen.has(item.noticeFingerprint)) { suppressed++; continue; }
    // A whole bounded group, including complete displayed receipt summaries,
    // either fits or is omitted. Never truncate serialized JSON or a receipt.
    const length = [...JSON.stringify(item)].length;
    if (groups.length >= request.limit || chars + length > request.maxChars) { omitted++; continue; }
    groups.push(item); chars += length;
  }
  const fingerprint = digest({ queries: request.queries, groups, totals, omitted, suppressed, allNotices,
    limit: request.limit, maxChars: request.maxChars, seenNoticeFingerprints: [...request.seen].sort() });
  return { schema: 'jh.learning-rule-use-review.v1', revision: state.revision, queries: request.queries,
    groups, totals, omitted, suppressed, limit: request.limit, maxChars: request.maxChars, fingerprint,
    readOnly: true, advisoryOnly: true, externalEffects: false, replayAllowed: false,
    sourceAuthentication: 'host_attestation', applicationVerified: false, preActionTimingVerified: false,
    liveImprovementVerified: false, causalEffectVerified: false };
}
