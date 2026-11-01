import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { ingest, propose, validateEvent } from './engine.mjs';
import { proposalContext } from './proposal-context.mjs';

const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/+-]{0,127}$/;
const REF = /^(?:sha256|event|fixture|user|artifact|library|regression|test|source|commit):[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$/;
const HOST_EVENT = /^host-observation-[a-f0-9]{64}$/;
const MAX_SEQUENCE = 1e9;
const MAX_EVIDENCE = 8;
const own = (value, key) => Object.hasOwn(value, key);
const fail = (message, code) => { throw Object.assign(new TypeError(message), code ? { code } : {}); };
const conflict = () => fail('Observation reference conflicts with its recorded content', 'LEARNING_OBSERVATION_CONFLICT');
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const eventIdFor = (taskId, attemptId, reference) => 'host-observation-' + digest([taskId, attemptId, reference]);
const attemptKey = (taskId, attemptId) => digest([taskId, attemptId]);

function object(value, label) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(`Invalid ${label}`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).some(key => typeof key !== 'string') ||
      Object.values(descriptors).some(item => !own(item, 'value') || !item.enumerable)) fail(`Invalid ${label}`);
}
function fields(value, required, optional = [], label = 'host observation') {
  object(value, label);
  if (required.some(key => !own(value, key)) || Object.keys(value).some(key => ![...required, ...optional].includes(key))) fail(`Invalid ${label} fields`);
}
function array(value, max) {
  if (types.isProxy(value) || !Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype ||
      value.length > max || Reflect.ownKeys(value).length !== value.length + 1) fail('Invalid JSON array');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (let index = 0; index < value.length; index++) {
    const item = descriptors[String(index)];
    if (!item || !own(item, 'value') || !item.enumerable) fail('Invalid JSON array');
  }
}
// A backstop for recognizable credentials, not proof that caller data is redacted.
function looksCredential(value) {
  return /(?:^|\s)Bearer\s+[A-Za-z0-9._~+\/=-]{16,}/i.test(value) ||
    /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,})\b/.test(value) ||
    /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/.test(value) ||
    /(?:^|[^A-Za-z0-9_-])eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:$|[^A-Za-z0-9_-])/.test(value);
}
function dataOnly(value, { credentials = false, maxItems = 10000 } = {}, depth = 0, budget = { remaining: 1000000 }) {
  if (depth > 32 || --budget.remaining < 0) fail('Learning data exceeds its bounds');
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'string') {
    if (!value.isWellFormed() || (credentials && looksCredential(value))) fail('Invalid learning text');
    return;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (types.isProxy(value)) fail('Invalid learning data');
  const options = { credentials, maxItems };
  if (Array.isArray(value)) {
    array(value, maxItems);
    for (const item of value) dataOnly(item, options, depth + 1, budget);
    return;
  }
  object(value, 'learning data');
  if (Object.keys(value).length > maxItems) fail('Learning data exceeds its bounds');
  for (const item of Object.values(value)) dataOnly(item, options, depth + 1, budget);
}
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
}
function token(value, label) { if (typeof value !== 'string' || !TOKEN.test(value)) fail(`Invalid ${label}`); }
function revision(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value >= Number.MAX_SAFE_INTEGER) fail('Invalid learning revision');
}
function stateCheck(state) {
  fields(state, ['schema', 'revision', 'events', 'attempts', 'lessons', 'proposals'], [], 'state');
  if (state.schema !== 'jh.operational-learning.v1') fail('Invalid learning state');
  revision(state.revision);
  for (const [key, limit] of Object.entries({ events: 10000, attempts: 3000, lessons: 1000, proposals: 1000 })) {
    object(state[key], key);
    if (Object.keys(state[key]).length > limit) fail('Learning state exceeds its bounds');
  }
  // Reject accessors, proxies and executable values before any clone or engine call.
  dataOnly(state);
}
function validEvent(event) {
  // Historical shape validation must not bind a receipt to today's rule state.
  // New uses are state-checked only by ingest inside the real store transaction.
  validateEvent(event);
}
const scopeOf = event => ({ domain: event.domain, operation: event.operation, engine: event.engine,
  context: structuredClone(event.context) });
function withoutMetrics(event) {
  return Object.fromEntries(Object.entries(event).filter(([key]) => key !== 'metrics'));
}
function storedProjection(state, key, projection) {
  object(projection, 'stored attempt');
  validEvent(projection);
  if (key !== attemptKey(projection.taskId, projection.attemptId) || !own(state.events, projection.eventId)) fail('Invalid stored attempt binding');
  const original = state.events[projection.eventId];
  validEvent(original);
  // The engine may retain larger observed metrics in its projection; all other
  // fields must still identify the original stored event exactly.
  if (canonical(withoutMetrics(original)) !== canonical(withoutMetrics(projection))) fail('Invalid stored attempt projection');
  return projection;
}
function normalized(input) {
  fields(input, ['taskId', 'attemptId', 'observationRef', 'scope', 'observation', 'expectedRevision']);
  dataOnly(input, { credentials: true, maxItems: 64 });
  token(input.taskId, 'task ID'); token(input.attemptId, 'attempt ID'); revision(input.expectedRevision);
  if (typeof input.observationRef !== 'string' || !REF.test(input.observationRef)) fail('Invalid observation reference');
  fields(input.scope, ['domain', 'operation', 'engine', 'context'], [], 'observation scope');
  fields(input.observation, ['timestamp', 'outcome', 'source', 'evidenceRefs'], ['errorCode', 'metrics', 'labels', 'ruleUses'], 'observation');
  const event = { eventId: eventIdFor(input.taskId, input.attemptId, input.observationRef),
    taskId: input.taskId, attemptId: input.attemptId, sequence: 0,
    ...structuredClone(input.scope), ...structuredClone(input.observation) };
  validEvent(event);
  if (!event.evidenceRefs.includes(input.observationRef)) fail('Observation reference must be supplied in evidenceRefs');
  if (event.ruleUses?.some(usage => usage.useRef === input.observationRef)) fail('Rule use and result observation require distinct references');
  const identityReferences = new Set([input.observationRef, ...(event.ruleUses ?? []).map(usage => usage.useRef)]);
  if (['success_verified', 'failure_verified'].includes(event.outcome) &&
      !event.evidenceRefs.some(reference => !identityReferences.has(reference))) fail('Verified outcomes need separate result evidence');
  return { event, expectedRevision: input.expectedRevision };
}
function observationRef(event) {
  if (!HOST_EVENT.test(event.eventId)) return null;
  const matches = event.evidenceRefs.filter(reference => eventIdFor(event.taskId, event.attemptId, reference) === event.eventId);
  return matches.length === 1 ? matches[0] : null;
}
function eventSummary(event) {
  return { eventId: event.eventId, observationRef: observationRef(event), sequence: event.sequence,
    timestamp: event.timestamp, outcome: event.outcome, source: event.source,
    evidenceRefs: event.evidenceRefs.slice(0, MAX_EVIDENCE),
    evidenceRefsOmitted: Math.max(0, event.evidenceRefs.length - MAX_EVIDENCE),
    evidenceRefsTruncated: event.evidenceRefs.length > MAX_EVIDENCE,
    ...Object.fromEntries(['errorCode', 'metrics', 'labels'].filter(key => own(event, key)).map(key => [key, structuredClone(event[key])])),
    ...(event.ruleUses ? { ruleUses: event.ruleUses.map(usage => ruleUseSummary(event, usage)) } : {}) };
}
function ruleUseSummary(event, usage) {
  const selected = usage.selection;
  return { useRef: usage.useRef, lessonId: selected.lessonId, ruleVersion: selected.ruleVersion,
    inputFingerprint: selected.inputFingerprint, definitionFingerprint: selected.definitionFingerprint,
    selectionFingerprint: selected.fingerprint, selectedAt: selected.selectedAt, appliedAt: usage.appliedAt,
    recordedEventId: event.eventId, recordedAt: event.timestamp, evidenceRefs: [...usage.evidenceRefs],
    sourceAuthentication: 'host_attestation', applicationVerified: false,
    preActionTimingVerified: false, liveImprovementVerified: false };
}
function attemptRuleUses(group) {
  const references = new Set(); const items = [];
  const projection = group.projection;
  for (const event of group.events) for (const usage of event.ruleUses ?? []) {
    if (references.has(usage.useRef)) fail('Stored attempt contains a duplicate rule-use reference');
    references.add(usage.useRef);
    if (items.length >= MAX_EVIDENCE) continue;
    const afterUse = projection.sequence >= event.sequence && Date.parse(projection.timestamp) >= Date.parse(usage.appliedAt);
    items.push({ ...ruleUseSummary(event, usage), result: {
      eventId: projection.eventId, outcome: projection.outcome, timestamp: projection.timestamp, source: projection.source,
      evidenceRefs: projection.evidenceRefs.slice(0, MAX_EVIDENCE),
      evidenceRefsTruncated: projection.evidenceRefs.length > MAX_EVIDENCE,
      evidenceRefsOmitted: Math.max(0, projection.evidenceRefs.length - MAX_EVIDENCE),
      afterUse, verified: afterUse && ['success_verified', 'failure_verified'].includes(projection.outcome) } });
  }
  return items.length ? { items, total: references.size, omitted: references.size - items.length } : null;
}
const byId = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const bySequence = (left, right) => right.sequence - left.sequence ||
  Date.parse(right.timestamp) - Date.parse(left.timestamp) || byId(left.eventId, right.eventId);
function collectTask(state, taskId) {
  const groups = new Map();
  for (const [id, event] of Object.entries(state.events)) {
    object(event, 'stored event'); token(event.taskId, 'stored task ID');
    if (event.taskId !== taskId) continue;
    validEvent(event);
    if (event.eventId !== id) fail('Invalid stored event binding');
    if (!groups.has(event.attemptId)) groups.set(event.attemptId, { events: [], projection: null });
    groups.get(event.attemptId).events.push(event);
  }
  for (const [key, projection] of Object.entries(state.attempts)) {
    object(projection, 'stored attempt'); token(projection.taskId, 'stored task ID');
    if (projection.taskId !== taskId) continue;
    storedProjection(state, key, projection);
    const group = groups.get(projection.attemptId);
    if (!group || group.projection) fail('Invalid stored task binding');
    group.projection = projection;
  }
  for (const group of groups.values()) {
    if (!group.projection) fail('Missing stored attempt projection');
    const scope = canonical(scopeOf(group.projection));
    if (group.events.some(event => canonical(scopeOf(event)) !== scope)) fail('Conflicting stored attempt scope');
    group.events.sort(bySequence);
    group.maxSequence = group.events[0].sequence;
    const byTime = [...group.events].sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp) || bySequence(left, right));
    group.latestObservedAt = byTime[0].timestamp;
  }
  return groups;
}
function attemptSummary(group) {
  const projection = group.projection;
  const ruleUses = attemptRuleUses(group);
  return { taskId: projection.taskId, attemptId: projection.attemptId, scope: scopeOf(projection),
    eventCount: group.events.length, maxSequence: group.maxSequence,
    nextSequence: group.maxSequence === MAX_SEQUENCE ? null : group.maxSequence + 1,
    sequenceExhausted: group.maxSequence === MAX_SEQUENCE, latestObservedAt: group.latestObservedAt,
    projection: eventSummary(projection), latestObservation: eventSummary(group.events[0]),
    ...(ruleUses ? { ruleUses } : {}) };
}

/** Read existing host/legacy task evidence only; never invent an identity or retry work. */
export function taskView(state, input) {
  stateCheck(state);
  fields(input, ['taskId'], ['attemptId', 'limit'], 'task view');
  dataOnly(input, { credentials: true, maxItems: 64 });
  token(input.taskId, 'task ID');
  if (own(input, 'attemptId')) token(input.attemptId, 'attempt ID');
  const limit = own(input, 'limit') ? input.limit : 8;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 32) fail('Task view limit must be between 1 and 32');
  const groups = collectTask(state, input.taskId);
  const all = [...groups.values()];
  const matching = own(input, 'attemptId') ? all.filter(group => group.projection.attemptId === input.attemptId) : all;
  matching.sort((left, right) => Date.parse(right.latestObservedAt) - Date.parse(left.latestObservedAt) ||
    byId(left.projection.attemptId, right.projection.attemptId));
  const selected = matching.slice(0, limit);
  return { schema: 'jh.learning-task-view.v1', revision: state.revision,
    taskId: input.taskId, attemptId: input.attemptId ?? null, taskFound: groups.size > 0, found: matching.length > 0,
    limit, counts: { taskAttempts: groups.size, taskEvents: all.reduce((sum, group) => sum + group.events.length, 0),
      matchingAttempts: matching.length, matchingEvents: matching.reduce((sum, group) => sum + group.events.length, 0),
      returnedAttempts: selected.length },
    attempts: selected.map(attemptSummary), omittedAttempts: matching.length - selected.length,
    readOnly: true, externalEffects: false, replayAllowed: false };
}

/**
 * Authenticated hosts call this INSIDE the owner store transaction, without an
 * outer expectedRevision guard. The observation reference identifies one real
 * observation and must survive retries together with its original timestamp.
 * Equal observation instants are allowed; transaction order assigns sequence.
 * Attestations and evidence references are caller data, not independent proof.
 */
export function observeTask(state, input, options = {}) {
  stateCheck(state);
  fields(options, [], ['now'], 'observation options'); dataOnly(options, { maxItems: 64 });
  const { event, expectedRevision } = normalized(input);
  if (own(state.events, event.eventId)) {
    const previous = state.events[event.eventId];
    validEvent(previous);
    event.sequence = previous.sequence;
    if (canonical(event) !== canonical(previous)) conflict();
    const group = collectTask(state, event.taskId).get(event.attemptId);
    return { state, event: structuredClone(previous), duplicate: true, recorded: false, projectionChanged: false,
      current: attemptSummary(group), newProposals: [], newProposalsOmitted: 0, externalEffects: false, replayAllowed: false };
  }
  if (expectedRevision !== state.revision) fail('Observation revision is stale', 'LEARNING_REVISION_CONFLICT');
  if (event.ruleUses && own(options, 'now') &&
      (!Number.isFinite(Date.parse(options.now)) || Date.parse(event.timestamp) > Date.parse(options.now))) {
    fail('New rule-use observation is later than the host clock', 'LEARNING_RULE_USE_FUTURE');
  }
  const group = collectTask(state, event.taskId).get(event.attemptId);
  if (group?.maxSequence === MAX_SEQUENCE) fail('Attempt sequence is exhausted', 'LEARNING_SEQUENCE_EXHAUSTED');
  if (group && Date.parse(event.timestamp) < Date.parse(group.latestObservedAt)) fail('Observation is older than existing attempt evidence', 'LEARNING_OBSERVATION_STALE');
  event.sequence = group ? group.maxSequence + 1 : 1;
  // Proposal calculation reads all current attempts. Validate their bindings
  // before using them, including attempts outside this task's view.
  for (const [key, projected] of Object.entries(state.attempts)) storedProjection(state, key, projected);
  const recorded = ingest(state, event);
  const offered = propose(recorded.state, options);
  const current = attemptSummary(collectTask(offered.state, event.taskId).get(event.attemptId));
  // Proposals may be recalculated for other stored scopes. Deliver only NEW,
  // relevant open summaries; all stored proposals remain recoverable via context.
  const newlyOffered = { ...offered.state,
    proposals: Object.fromEntries(offered.proposals.map(proposal => [proposal.id, proposal])) };
  const delivery = proposalContext(newlyOffered, [scopeOf(event)]);
  return { state: offered.state, event: structuredClone(offered.state.events[event.eventId]), duplicate: false,
    recorded: true, projectionChanged: group?.projection.eventId !== current.projection.eventId,
    current, newProposals: delivery.items, newProposalsOmitted: delivery.omitted,
    externalEffects: false, replayAllowed: false };
}
