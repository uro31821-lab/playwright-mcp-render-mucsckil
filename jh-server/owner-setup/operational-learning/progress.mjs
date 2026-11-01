import { types, isDeepStrictEqual } from 'node:util';
import { addLesson, evaluateLesson, recallContexts } from './engine.mjs';
import { createReviewedCandidate } from './curation.mjs';
import { proposalDecisionView } from './decisions.mjs';

const LINK_SCHEMA = 'jh.learning-proposal-candidate-link.v1';
const MAX_LINKS = 32;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/+-]{0,127}$/;
const SUITE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const HEX = /^[a-f0-9]{64}$/;
const DOMAINS = new Set(['connection', 'device', 'web', 'output', 'research', 'calculation', 'routine', 'development', 'orchestration']);
const METADATA = ['memoryKind', 'provenance', 'validFrom', 'validUntil', 'supersedes', 'conflictKey', 'reflection'];
const DEFINITION = ['id', 'domain', 'operation', 'engine', 'context', 'guidance', 'evidenceRefs', 'ruleVersion', 'inputFingerprint', ...METADATA];
const LINK_FIELDS = ['schema', 'lessonId', 'ruleVersion', 'inputFingerprint', 'scope', 'registeredAt',
  'baseRevision', 'recordedRevision', 'reviewer', 'provenance', 'packetFingerprint', 'sourceEventIds', 'regression'];
const BUDGET = Object.freeze({ limit: 20, maxChars: 16384 });
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
function fields(value, required, optional = [], label = 'progress input') {
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
// Validate before calling older core helpers so accessors, proxies, custom
// iterators and toJSON hooks cannot execute through this public pure API.
function json(value, depth = 0, budget = { remaining: 2_000_000 }) {
  if (--budget.remaining < 0 || depth > 64) fail('Progress JSON exceeds its bounds');
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'string') {
    if (!value.isWellFormed()) fail('Invalid progress text');
    return;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (types.isProxy(value)) fail('Invalid progress JSON');
  if (Array.isArray(value)) {
    array(value, 0, 10000, 'progress JSON array');
    for (let index = 0; index < value.length; index++) json(value[index], depth + 1, budget);
    return;
  }
  object(value, 'progress JSON');
  for (const key of Object.keys(value)) json(value[key], depth + 1, budget);
}
function token(value, label) { if (typeof value !== 'string' || !TOKEN.test(value)) fail(`Invalid ${label}`); }
function revision(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value >= Number.MAX_SAFE_INTEGER) fail('Invalid progress revision');
}
function timestamp(value) {
  const match = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) fail('Invalid progress timestamp');
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || Number(match[4]) > 23 ||
      Number(match[5]) > 59 || Number(match[6]) > 59 || Number(match[9] ?? 0) > 23 || Number(match[10] ?? 0) > 59) fail('Invalid progress timestamp');
}
function scope(value) {
  fields(value, ['domain', 'operation', 'engine', 'context'], [], 'candidate scope');
  if (!DOMAINS.has(value.domain)) fail('Invalid candidate domain');
  token(value.operation, 'candidate operation'); token(value.engine, 'candidate engine');
  fields(value.context, ['platform', 'version', 'environment'], [], 'candidate context');
  for (const part of Object.values(value.context)) token(part, 'candidate context value');
}
const scopeOf = value => ({ domain: value.domain, operation: value.operation, engine: value.engine, context: clone(value.context) });
const within = (value, parent) => value.domain === parent.domain && value.engine === parent.engine &&
  (parent.operation === '*' || value.operation === parent.operation) && isDeepStrictEqual(value.context, parent.context);
function regressionInfo(suite) {
  const evaluator = suite.evaluator ?? 'jh.constraints.v1';
  if (!['jh.constraints.v1', 'jh.trajectory.v1'].includes(evaluator)) fail('Unsupported progress evaluator');
  return { evaluator, suiteId: suite.id, suiteVersion: suite.version,
    validationScope: evaluator === 'jh.trajectory.v1' ? 'recorded_trajectory_contract' : 'json_contract' };
}
function stateAndProposal(state, proposalId) {
  json(state);
  const view = proposalDecisionView(state, { proposalId });
  return state.proposals[view.proposalId];
}
function linksFor(state, proposal) {
  if (!own(proposal, 'candidateLinks')) return [];
  const links = proposal.candidateLinks;
  array(links, 0, MAX_LINKS, 'candidate links');
  const identities = new Set(); let priorRevision = -1;
  for (const link of links) {
    fields(link, LINK_FIELDS, [], 'candidate link');
    if (link.schema !== LINK_SCHEMA || link.provenance !== 'model_inferred' ||
        !['host', 'agent'].includes(link.reviewer)) fail('Invalid candidate link provenance');
    token(link.lessonId, 'linked lesson ID'); token(link.ruleVersion, 'linked rule version');
    if (typeof link.inputFingerprint !== 'string' || !HEX.test(link.inputFingerprint) ||
        typeof link.packetFingerprint !== 'string' || !HEX.test(link.packetFingerprint)) fail('Invalid candidate link fingerprint');
    scope(link.scope);
    if (!within(link.scope, proposal.scope)) fail('Candidate link crosses proposal scope');
    timestamp(link.registeredAt); revision(link.baseRevision); revision(link.recordedRevision);
    if (link.recordedRevision !== link.baseRevision + 1 || link.recordedRevision > state.revision ||
        link.recordedRevision <= priorRevision) fail('Invalid candidate link revision');
    priorRevision = link.recordedRevision;
    array(link.sourceEventIds, 1, 16, 'candidate source events');
    for (const id of link.sourceEventIds) token(id, 'candidate source event ID');
    if (new Set(link.sourceEventIds).size !== link.sourceEventIds.length ||
        !isDeepStrictEqual(link.sourceEventIds, [...link.sourceEventIds].sort())) fail('Invalid candidate source event order');
    fields(link.regression, ['evaluator', 'suiteId', 'suiteVersion', 'validationScope'], [], 'candidate regression scope');
    if (typeof link.regression.suiteId !== 'string' || !SUITE_TOKEN.test(link.regression.suiteId) ||
        typeof link.regression.suiteVersion !== 'string' || !SUITE_TOKEN.test(link.regression.suiteVersion) ||
        !isDeepStrictEqual(link.regression, regressionInfo({ id: link.regression.suiteId,
          version: link.regression.suiteVersion, evaluator: link.regression.evaluator }))) fail('Invalid candidate regression scope');
    const identity = JSON.stringify([link.lessonId, link.ruleVersion, link.inputFingerprint]);
    if (identities.has(identity)) fail('Duplicate candidate link');
    identities.add(identity);
  }
  return links;
}

/** Register a reviewed definition and its first proposal link in one revision.
 * The host must call this inside its owner-bound store transaction. Fresh review
 * packets remain mandatory, including retries of an already registered link.
 */
export function registerReviewedCandidate(state, review, suite, options = {}) {
  json(review); json(suite); json(options);
  fields(options, [], ['now'], 'candidate registration options');
  const now = options.now ?? new Date().toISOString(); timestamp(now);
  object(review, 'candidate review');
  const proposal = stateAndProposal(state, review.proposalId);
  if (!Number.isSafeInteger(review.baseRevision) || review.baseRevision !== state.revision) {
    fail('Candidate review revision is stale', 'LEARNING_REVISION_CONFLICT');
  }
  const links = linksFor(state, proposal);
  const candidate = createReviewedCandidate(state, review, suite);
  const regression = regressionInfo(candidate.suite);
  const linked = links.find(link => link.lessonId === candidate.lesson.id &&
    link.ruleVersion === candidate.lesson.ruleVersion && link.inputFingerprint === candidate.lesson.inputFingerprint);
  if (linked) {
    if (!own(state.lessons, candidate.lesson.id)) fail('Linked candidate definition is missing');
    validateLinkedLesson(state, state.lessons[candidate.lesson.id]);
    return { state, lesson: clone(state.lessons[candidate.lesson.id]), suite: candidate.suite,
      reviewSummary: candidate.reviewSummary, link: clone(linked), duplicate: true };
  }
  if (links.length >= MAX_LINKS) fail('Candidate link capacity reached', 'LEARNING_PROGRESS_CAPACITY');
  const saved = addLesson(state, candidate.lesson);
  const next = saved === state ? clone(state) : saved;
  if (saved === state) next.revision += 1;
  const link = { schema: LINK_SCHEMA, lessonId: candidate.lesson.id, ruleVersion: candidate.lesson.ruleVersion,
    inputFingerprint: candidate.lesson.inputFingerprint, scope: scopeOf(candidate.lesson), registeredAt: now,
    baseRevision: state.revision, recordedRevision: next.revision, reviewer: candidate.reviewSummary.reviewer,
    provenance: 'model_inferred', packetFingerprint: candidate.reviewSummary.packetFingerprint,
    sourceEventIds: clone(candidate.reviewSummary.sourceEventIds), regression };
  next.proposals[proposal.id].candidateLinks = [...clone(links), link];
  linksFor(next, next.proposals[proposal.id]);
  return { state: next, lesson: clone(next.lessons[candidate.lesson.id]), suite: candidate.suite,
    reviewSummary: candidate.reviewSummary, link: clone(link), duplicate: false };
}

function emptyEvaluation(status = 'not_run') {
  return { status, timestamp: null, passed: null, failed: null, skipped: null,
    evidenceRefs: [], evidenceRefsTruncated: false };
}
function evaluationFor(state, lesson) {
  if (!own(lesson, 'evaluation')) return emptyEvaluation();
  const evaluation = lesson.evaluation;
  try {
    // An identical existing receipt is a pure no-op. Reuse the engine's complete
    // definition/case binding validation without retaining any returned state.
    if (evaluateLesson(state, lesson.id, evaluation) !== state) return emptyEvaluation('invalid');
  } catch { return emptyEvaluation('invalid'); }
  return { status: evaluation.failed > 0 ? 'failed' : 'passed', timestamp: evaluation.timestamp ?? null,
    passed: evaluation.passed, failed: evaluation.failed, skipped: evaluation.skipped,
    evidenceRefs: evaluation.evidenceRefs.slice(0, 8), evidenceRefsTruncated: evaluation.evidenceRefs.length > 8,
    ...(typeof evaluation.definitionFingerprint === 'string' && HEX.test(evaluation.definitionFingerprint)
      ? { definitionFingerprint: evaluation.definitionFingerprint } : {}) };
}
function validateLinkedLesson(state, lesson) {
  fields(lesson, ['id', 'domain', 'operation', 'engine', 'context', 'guidance', 'evidenceRefs', 'ruleVersion',
    'inputFingerprint', 'state', 'advisoryOnly'], [...METADATA, 'evaluation', 'evaluationHistory', 'supersessionHistory'], 'linked lesson');
  if (!['candidate', 'active', 'quarantined'].includes(lesson.state) || lesson.advisoryOnly !== true) fail('Invalid linked lesson state');
  const definition = Object.fromEntries(DEFINITION.filter(key => own(lesson, key)).map(key => [key, clone(lesson[key])]));
  addLesson(state, { ...definition, state: 'candidate' });
}

/** Read current progress only. Recall inclusion is evaluated at this time and
 * budget; it is neither an application receipt nor proof of live improvement.
 */
export function proposalProgressView(state, input, options = {}) {
  json(input); json(options);
  fields(input, ['proposalId'], [], 'proposal progress request');
  fields(options, [], ['now', 'commonScope'], 'proposal progress options');
  const now = options.now ?? new Date().toISOString(); timestamp(now);
  const proposal = stateAndProposal(state, input.proposalId);
  const links = linksFor(state, proposal);
  const commonScope = options.commonScope;
  if (own(options, 'commonScope')) {
    scope(commonScope);
    if (commonScope.engine !== proposal.scope.engine || !isDeepStrictEqual(commonScope.context, proposal.scope.context)) {
      fail('Common scope does not share the proposal engine and context');
    }
  }
  const recalls = new Map(); const at = Date.parse(now);
  const candidates = links.map(link => {
    const row = { link: clone(link), lessonState: null, bindingStatus: 'missing', evaluation: emptyEvaluation(),
      temporalStatus: 'unknown', recallIncluded: false, conflicts: [], conflictsTruncated: false,
      pastApplicationVerified: false, liveImprovementVerified: false };
    if (!own(state.lessons, link.lessonId)) return row;
    const lesson = state.lessons[link.lessonId]; object(lesson, 'linked lesson');
    if (['candidate', 'active', 'quarantined'].includes(lesson.state)) row.lessonState = lesson.state;
    if (lesson.id !== link.lessonId || lesson.ruleVersion !== link.ruleVersion || lesson.inputFingerprint !== link.inputFingerprint ||
        !isDeepStrictEqual(scopeOf(lesson), link.scope)) {
      row.bindingStatus = 'changed'; return row;
    }
    validateLinkedLesson(state, lesson);
    row.bindingStatus = 'matched';
    row.evaluation = evaluationFor(state, lesson);
    row.temporalStatus = lesson.validFrom && at < Date.parse(lesson.validFrom) ? 'not_yet_valid'
      : lesson.validUntil && at >= Date.parse(lesson.validUntil) ? 'expired' : 'in_window';
    // A corrupted receipt must not appear reusable through the engine's smaller
    // active-selection predicate. Keep the readable diagnostic, without proof.
    if (row.evaluation.status === 'invalid') return row;
    const scopes = [link.scope];
    if (commonScope && !isDeepStrictEqual(commonScope, link.scope)) scopes.push(commonScope);
    const key = JSON.stringify(scopes);
    if (!recalls.has(key)) recalls.set(key, recallContexts(state, scopes, { now, ...BUDGET }));
    const recalled = recalls.get(key);
    row.recallIncluded = recalled.lessons.some(item => item.id === link.lessonId && item.inputFingerprint === link.inputFingerprint);
    const conflicts = recalled.conflicts.filter(item => item.lessonIds.includes(link.lessonId));
    row.conflicts = conflicts.slice(0, 4).map(item => ({ conflictKey: item.conflictKey,
      reason: item.reason, lessonIds: item.lessonIds.slice(0, 16) }));
    row.conflictsTruncated = conflicts.length > 4 || conflicts.some(item => item.lessonIds.length > 16);
    return row;
  });
  return { schema: 'jh.learning-proposal-progress.v1', proposalId: proposal.id, currentStatus: proposal.status,
    revision: state.revision, checkedAt: now, recallScope: commonScope ? 'candidate_and_common' : 'candidate_only',
    recallBudget: { ...BUDGET }, candidates, readOnly: true, advisoryOnly: true, externalEffects: false,
    liveExecutionVerified: false };
}
