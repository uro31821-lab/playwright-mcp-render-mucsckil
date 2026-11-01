import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { addLesson, ingest } from './engine.mjs';
import { bindRegression } from './regression.mjs';

const DOMAINS = new Set(['connection', 'device', 'web', 'output', 'research', 'calculation', 'routine', 'development', 'orchestration']);
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/+-]{0,127}$/;
const REF = /^(?:sha256|event|fixture|user|artifact|library|regression|test|source|commit):[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$/;
const HEX = /^[a-f0-9]{64}$/;
const META = ['memoryKind', 'provenance', 'validFrom', 'validUntil', 'supersedes', 'conflictKey'];
const DEFINITION = ['id', 'domain', 'operation', 'engine', 'context', 'guidance', 'evidenceRefs', 'ruleVersion', ...META, 'reflection'];
const own = (value, key) => Object.hasOwn(value, key);
const fail = message => { throw new TypeError(message); };

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Object.getOwnPropertySymbols(value).length) fail(`Invalid ${label}`);
  if (Object.values(Object.getOwnPropertyDescriptors(value)).some(item => item.get || item.set)) fail(`Accessors are not allowed in ${label}`);
}
function fields(value, required, optional = [], label = 'input') {
  object(value, label);
  if (required.some(key => !own(value, key)) || Object.keys(value).some(key => ![...required, ...optional].includes(key))) fail(`Invalid ${label} fields`);
}
function token(value, label) { if (typeof value !== 'string' || !TOKEN.test(value)) fail(`Invalid ${label}`); }
// Known credential forms are a backstop, not a complete secret or personal-data
// detector. The trusted reviewer must redact every free-text field before submission.
function looksCredential(value) {
  return /(?:^|\s)Bearer\s+[A-Za-z0-9._~+\/=-]{16,}/i.test(value) ||
    /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,})\b/.test(value) ||
    /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/.test(value) ||
    /(?:^|[^A-Za-z0-9_-])eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:$|[^A-Za-z0-9_-])/.test(value);
}
function text(value, label, max = 1024) {
  if (typeof value !== 'string' || !value.trim() || value.length > max ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) || looksCredential(value)) fail(`Invalid ${label}`);
}
function canonical(value, depth = 0) {
  if (depth > 64) fail('Review data is too deeply nested');
  if (value === null || ['string', 'boolean'].includes(typeof value)) return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (Object.values(Object.getOwnPropertyDescriptors(value)).some(item => item.get || item.set)) fail('Array accessors are not allowed');
    return '[' + value.map(item => canonical(item, depth + 1)).join(',') + ']';
  }
  object(value, 'JSON data');
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key], depth + 1)).join(',') + '}';
}
const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
const scopeOf = value => ({ domain: value.domain, operation: value.operation, engine: value.engine, context: structuredClone(value.context) });
function validScope(value, wildcard = false) {
  fields(value, ['domain', 'operation', 'engine', 'context'], [], 'scope');
  if (!DOMAINS.has(value.domain)) fail('Invalid scope domain');
  if (!(wildcard && value.operation === '*')) token(value.operation, 'scope operation');
  token(value.engine, 'scope engine');
  fields(value.context, ['platform', 'version', 'environment'], [], 'scope context');
  for (const part of Object.values(value.context)) token(part, 'scope context value');
}
function within(value, scope) {
  return value.domain === scope.domain && value.engine === scope.engine &&
    (scope.operation === '*' || value.operation === scope.operation) && isDeepStrictEqual(value.context, scope.context);
}
function stateCheck(state) {
  fields(state, ['schema', 'revision', 'events', 'attempts', 'lessons', 'proposals'], [], 'state');
  if (state.schema !== 'jh.operational-learning.v1' || !Number.isSafeInteger(state.revision) || state.revision < 0) fail('Invalid learning state');
  for (const [key, limit] of Object.entries({ events: 10000, attempts: 3000, lessons: 1000, proposals: 1000 })) {
    object(state[key], key);
    if (Object.keys(state[key]).length > limit) fail('Learning state exceeds its bounds');
  }
}
function limits(maxAttempts = 12) {
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 32) fail('maxAttempts must be between 1 and 32');
  return maxAttempts;
}
function proposalFor(state, proposalId) {
  token(proposalId, 'proposal ID');
  if (!own(state.proposals, proposalId)) fail('Unknown proposal');
  const proposal = state.proposals[proposalId];
  object(proposal, 'proposal');
  if (proposal.id !== proposalId || !['open', 'accepted'].includes(proposal.status)) fail('Only open or accepted proposals can be reviewed');
  if (proposal.advisoryOnly !== true || proposal.externalEffects !== false || !HEX.test(proposal.patternKey)) fail('Invalid advisory proposal');
  validScope(proposal.scope, proposal.kind === 'learning_evaluation');
  return proposal;
}
function matchesProposal(event, proposal) {
  if (!within(event, proposal.scope)) return false;
  let pattern;
  if (proposal.kind === 'rule_fix' && ['failure_verified', 'correction', 'blocked'].includes(event.outcome)) pattern = [event.outcome, event.errorCode ?? 'unspecified'];
  else if (proposal.kind === 'workflow_automation' && event.outcome === 'success_verified') pattern = 'repeated-verified-success';
  else if (proposal.kind === 'verification_gap' && event.outcome === 'completion_unknown') pattern = 'completion-unknown';
  else if (proposal.kind === 'learning_evaluation' && event.outcome === 'failure_verified' && event.labels?.reviewed === true &&
      (event.labels?.holdout === true || event.labels?.ruleRemediationTried === true)) pattern = 'reviewed-cross-operation-failures';
  else return false;
  return digest({ scope: proposal.scope, pattern }) === proposal.patternKey;
}
function currentEvent(state, eventId) {
  token(eventId, 'event ID');
  if (!own(state.events, eventId)) fail('Unknown source event');
  const event = state.events[eventId];
  object(event, 'source event');
  // Reuse the engine's event validation. An existing identical event is a pure no-op.
  if (event.eventId !== eventId || !ingest(state, event).duplicate) fail('Invalid stored source event');
  const projection = state.attempts[digest([event.taskId, event.attemptId])];
  object(projection, 'current attempt');
  const { metrics: eventMetrics, ...eventBody } = event;
  const { metrics: projectedMetrics, ...projectedBody } = projection;
  if (!isDeepStrictEqual(eventBody, projectedBody)) fail('Source event is no longer the current attempt result');
  return event;
}
function eligible(event) {
  return event.evidenceRefs.length > 0 && (
    (['success_verified', 'failure_verified'].includes(event.outcome) && ['host_verified', 'user_explicit'].includes(event.source)) ||
    (event.outcome === 'correction' && event.source === 'user_explicit'));
}
function eventRef(event) {
  const reference = `event:${event.eventId}`;
  return REF.test(reference) ? reference : `sha256:${digest(event)}`;
}
function eventSummary(event) {
  return { eventId: event.eventId, taskId: event.taskId, attemptId: event.attemptId,
    sequence: event.sequence, timestamp: event.timestamp, ...scopeOf(event), outcome: event.outcome, source: event.source,
    ...(event.errorCode ? { errorCode: event.errorCode } : {}),
    evidenceRefs: event.evidenceRefs.slice(0, 16), evidenceRefsTruncated: event.evidenceRefs.length > 16,
    candidateEvidenceEligible: eligible(event) };
}
function lessonDefinition(lesson, { omitId = false } = {}) {
  return Object.fromEntries(DEFINITION.filter(key => own(lesson, key) && !(omitId && key === 'id')).map(key => [key, structuredClone(lesson[key])]));
}

function evidenceReadiness(proposal, matches, selected) {
  // Counts describe current matching attempts, not additional independent tasks.
  // A digest identifies evidence; it cannot establish the outcome it describes.
  const currentEligible = matches.filter(eligible);
  const currentVerifiedOutcomeCount = currentEligible.filter(event =>
    ['success_verified', 'failure_verified'].includes(event.outcome)).length;
  const visibleEligibleCount = selected.filter(eligible).length;
  let status = 'more_evidence_required';
  let reasonCode;
  let nextEvidence;
  if (visibleEligibleCount > 0) {
    status = 'ready_for_review';
    reasonCode = 'ELIGIBLE_CURRENT_EVIDENCE_VISIBLE';
    nextEvidence = ['REVIEW_SCOPED_RULE_CANDIDATE', 'RUN_BOUND_EFFECT_FREE_REGRESSION'];
  } else if (currentEligible.length > 0) {
    status = 'evidence_not_visible';
    reasonCode = 'ELIGIBLE_EVIDENCE_OUTSIDE_VISIBLE_PACKET';
    nextEvidence = ['READ_CURRENT_ELIGIBLE_EVIDENCE', 'PREPARE_PACKET_WITH_ELIGIBLE_EVIDENCE'];
  } else if (proposal.kind === 'verification_gap') {
    reasonCode = 'VERIFIED_OUTCOME_REQUIRED';
    nextEvidence = ['READ_ORIGINAL_BOUND_RECEIPT', 'CORRECT_ORIGINAL_ATTEMPT_FROM_VERIFIED_RECEIPT',
      'REVIEW_SEPARATE_VERIFIED_IMPROVEMENT_EVIDENCE'];
  } else if (matches.every(event => event.outcome === 'blocked')) {
    reasonCode = 'BLOCKED_ATTEMPT_NEEDS_ELIGIBLE_EVIDENCE';
    nextEvidence = ['READ_EXISTING_BLOCK_REASON_WITHOUT_BYPASS',
      'REVIEW_SEPARATE_VERIFIED_OR_EXPLICIT_CORRECTION_EVIDENCE'];
  } else {
    reasonCode = 'VERIFIED_OR_EXPLICIT_CORRECTION_REQUIRED';
    nextEvidence = ['OBTAIN_VERIFIED_OR_EXPLICIT_CORRECTION_EVIDENCE', 'PREPARE_REVIEW_AGAIN'];
  }
  return { schema: 'jh.learning-evidence-readiness.v1', status, reasonCode,
    currentVerifiedOutcomeCount, currentEligibleCount: currentEligible.length, visibleEligibleCount,
    nextEvidence, automaticReplayAllowed: false, outcomeInferenceAllowed: false, activationPerformed: false };
}

/** Return structured, bounded evidence for an agent/host to review. This performs no model call. */
export function prepareReview(state, options) {
  stateCheck(state);
  fields(options, ['proposalId'], ['maxAttempts'], 'review preparation');
  const maxAttempts = limits(options.maxAttempts);
  const proposal = proposalFor(state, options.proposalId);
  const matches = [];
  for (const projected of Object.values(state.attempts)) {
    object(projected, 'attempt');
    if (matchesProposal(projected, proposal)) matches.push(currentEvent(state, projected.eventId));
  }
  if (!matches.length) fail('Proposal has no current supporting attempts');
  matches.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp) || a.eventId.localeCompare(b.eventId));
  // One representative per independent task prevents polling/retries dominating the packet.
  const byTask = new Map();
  for (const event of matches) if (!byTask.has(event.taskId)) byTask.set(event.taskId, event);
  const selected = [...byTask.values()].slice(0, maxAttempts);
  const scopedLessons = Object.values(state.lessons).filter(lesson => within(lesson, proposal.scope)).sort((a, b) => a.id.localeCompare(b.id));
  const packet = {
    schema: 'jh.learning-review-packet.v1', baseRevision: state.revision, maxAttempts,
    proposal: { id: proposal.id, kind: proposal.kind, status: proposal.status, scope: structuredClone(proposal.scope), patternKey: proposal.patternKey },
    attempts: selected.map(eventSummary), independentTaskCount: byTask.size,
    totalMatchingAttempts: matches.length, truncated: selected.length < byTask.size,
    currentLessons: scopedLessons.slice(0, 20).map(lesson => ({ ...lessonDefinition(lesson), state: lesson.state })),
    currentLessonsTruncated: scopedLessons.length > 20,
    candidateEligible: matches.some(eligible), automaticInference: false,
    evidenceReadiness: evidenceReadiness(proposal, matches, selected),
    requirements: {
      cause: 'Write a redacted reviewed inference, not an unobserved verified cause.',
      resolution: 'Describe the concrete proposed fix or workflow change.',
      expectedEffect: 'State the intended measurable effect without inventing observed savings.',
      applicability: 'Use the concrete domain, operation, engine and environment of the evidence.',
      evidence: 'Select current verified events or explicit user corrections; retain opaque references only.',
      regression: 'Supply versioned effect-free cases with expected results; live outcomes remain separate.',
      authority: 'A reviewed candidate remains model_inferred and cannot change approvals or activate itself.',
    },
  };
  return { ...packet, packetFingerprint: digest({ packet, sourceSet: matches.map(eventSummary), lessonSet: scopedLessons.map(lessonDefinition) }) };
}

/** Prepare a reviewable definition and regression binding, without changing any state or proposal. */
export function createReviewedCandidate(state, review, suite) {
  stateCheck(state);
  fields(review, ['proposalId', 'baseRevision', 'packetFingerprint', 'lessonId', 'ruleVersion', 'scope',
    'cause', 'resolution', 'expectedEffect', 'guidance', 'eventIds', 'reviewer'], ['maxAttempts', ...META], 'review');
  if (!Number.isSafeInteger(review.baseRevision) || review.baseRevision !== state.revision) fail('Review revision is stale');
  if (typeof review.packetFingerprint !== 'string' || !HEX.test(review.packetFingerprint)) fail('Invalid review packet fingerprint');
  const packet = prepareReview(state, { proposalId: review.proposalId, ...(own(review, 'maxAttempts') ? { maxAttempts: review.maxAttempts } : {}) });
  if (packet.packetFingerprint !== review.packetFingerprint) fail('Review packet changed; prepare a fresh review');
  if (!['host', 'agent'].includes(review.reviewer)) fail('Review requires an explicit host or agent reviewer');
  token(review.lessonId, 'lesson ID'); token(review.ruleVersion, 'rule version'); validScope(review.scope);
  if (!within(review.scope, packet.proposal.scope)) fail('Review scope differs from proposal');
  for (const key of ['cause', 'resolution', 'expectedEffect']) text(review[key], key);
  text(review.guidance, 'guidance', 2048);
  if (canonical(review).length > 65536 || canonical(suite).length > 1024 * 1024) fail('Review or suite exceeds its bounds');
  if (!Array.isArray(review.eventIds) || !review.eventIds.length || review.eventIds.length > 16 || new Set(review.eventIds).size !== review.eventIds.length) fail('Choose 1–16 unique source event IDs');
  const events = review.eventIds.map(id => currentEvent(state, id));
  if (events.some(event => !eligible(event) || !within(event, review.scope))) fail('Candidate evidence must be verified or an explicit correction in the current scope');
  if (!events.some(event => matchesProposal(event, state.proposals[review.proposalId]))) fail('Candidate needs evidence of this proposal pattern');
  const attempts = new Set(events.map(event => digest([event.taskId, event.attemptId])));
  if (attempts.size !== events.length) fail('Do not count multiple events from one attempt as independent evidence');
  if (own(review, 'provenance') && review.provenance !== 'model_inferred') fail('A reviewed inference cannot claim higher provenance');
  const sourceEventIds = [...review.eventIds].sort();
  const eventRefs = [...new Set(events.map(eventRef))].sort();
  const supportingRefs = [...new Set(events.flatMap(event => event.evidenceRefs))].filter(ref => !eventRefs.includes(ref)).sort();
  const evidenceRefs = [...eventRefs, ...supportingRefs].slice(0, 64).sort();
  const reflection = { assessment: 'reviewed_inference', cause: review.cause, resolution: review.resolution,
    expectedEffect: review.expectedEffect, eventIds: sourceEventIds };
  const metadata = Object.fromEntries(META.filter(key => own(review, key)).map(key => [key, structuredClone(review[key])]));
  const definition = { id: review.lessonId, ...structuredClone(review.scope), guidance: review.guidance,
    evidenceRefs, ruleVersion: review.ruleVersion, memoryKind: 'procedure', ...metadata, provenance: 'model_inferred', reflection };
  let lesson = { ...bindRegression(definition, suite), state: 'candidate' };
  const definitionFingerprint = digest({ definition: lessonDefinition(definition, { omitId: true }), suite });
  let duplicateLessonId;
  for (const existing of Object.values(state.lessons)) {
    if (!isDeepStrictEqual(lessonDefinition(existing, { omitId: true }), lessonDefinition(definition, { omitId: true }))) continue;
    // Same prose is insufficient: the persisted binding must match this exact suite too.
    if (bindRegression(lessonDefinition(existing), suite).inputFingerprint !== existing.inputFingerprint) continue;
    if (!['candidate', 'active'].includes(existing.state)) fail('An inactive definition cannot be revived by curation');
    duplicateLessonId = existing.id;
    lesson = { ...bindRegression(lessonDefinition(existing), suite), state: 'candidate' };
    break;
  }
  // Exercise the existing definition validator without retaining its new state.
  addLesson(state, lesson);
  return { lesson, suite: structuredClone(suite), reviewSummary: {
    schema: 'jh.learning-reviewed-candidate.v1', proposalId: review.proposalId, proposalStatus: packet.proposal.status,
    baseRevision: review.baseRevision, packetFingerprint: review.packetFingerprint, reviewer: review.reviewer,
    assessment: 'reviewed_inference', reflection, sourceEventIds,
    independentTaskCount: new Set(events.map(event => event.taskId)).size,
    evidenceRefsTruncated: eventRefs.length + supportingRefs.length > 64,
    definitionFingerprint, candidateOnly: true, activationPerformed: false, externalEffects: false,
    ...(duplicateLessonId ? { duplicateLessonId } : {}),
  } };
}
