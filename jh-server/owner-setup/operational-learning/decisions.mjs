import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { setProposalStatus } from './engine.mjs';
import { prepareReview } from './curation.mjs';

const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/+-]{0,127}$/;
const REF = /^(?:sha256|event|fixture|user|artifact|library|regression|test|source|commit):[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$/;
const HEX = /^[a-f0-9]{64}$/;
const DOMAINS = new Set(['connection', 'device', 'web', 'output', 'research', 'calculation', 'routine', 'development', 'orchestration']);
const KINDS = new Set(['rule_fix', 'workflow_automation', 'verification_gap', 'learning_evaluation']);
const STATUSES = new Set(['open', 'accepted', 'implemented', 'verified', 'dismissed', 'resolved']);
const REQUIRED = ['proposalId', 'decisionId', 'decision', 'expectedRevision', 'packetFingerprint',
  'reviewer', 'sourceRef', 'reason', 'eventIds'];
const RECEIPT = ['schema', 'proposalId', 'decisionId', 'decision', 'fromStatus', 'toStatus', 'timestamp',
  'baseRevision', 'recordedRevision', 'packetFingerprint', 'requestFingerprint', 'maxAttempts',
  'reviewer', 'sourceRef', 'reason', 'eventIds', 'evidenceRefs', 'evidenceRefsTruncated'];
const own = (value, key) => Object.hasOwn(value, key);
const fail = (message, code) => { throw Object.assign(new TypeError(message), code ? { code } : {}); };
const conflict = () => fail('Proposal decision conflicts with the recorded decision', 'LEARNING_DECISION_CONFLICT');

function object(value, label) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(`Invalid ${label}`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).some(key => typeof key !== 'string') ||
      Object.values(descriptors).some(item => !own(item, 'value') || !item.enumerable)) fail(`Invalid ${label}`);
}
function fields(value, required, optional = [], label = 'decision') {
  object(value, label);
  if (required.some(key => !own(value, key)) || Object.keys(value).some(key => ![...required, ...optional].includes(key))) fail(`Invalid ${label} fields`);
}
function array(value, min, max, label) {
  if (types.isProxy(value) || !Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype ||
      value.length < min || value.length > max ||
      Reflect.ownKeys(value).length !== value.length + 1) fail(`Invalid ${label}`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (let index = 0; index < value.length; index++) {
    const item = descriptors[String(index)];
    if (!item || !own(item, 'value') || !item.enumerable) fail(`Invalid ${label}`);
  }
}
function token(value, label) { if (typeof value !== 'string' || !TOKEN.test(value)) fail(`Invalid ${label}`); }
function revision(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value >= Number.MAX_SAFE_INTEGER) fail('Invalid decision revision');
}
// This recognizes known credential forms, not every secret or personal detail.
// An authenticated caller must still redact all submitted text and references.
function looksCredential(value) {
  return /(?:^|\s)Bearer\s+[A-Za-z0-9._~+\/=-]{16,}/i.test(value) ||
    /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,})\b/.test(value) ||
    /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/.test(value) ||
    /(?:^|[^A-Za-z0-9_-])eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:$|[^A-Za-z0-9_-])/.test(value);
}
function canonical(value, depth = 0, credentials = false) {
  if (depth > 16) fail('Decision data is too deeply nested');
  if (typeof value === 'string') {
    if (!value.isWellFormed() || (credentials && looksCredential(value))) fail('Invalid decision text');
    return JSON.stringify(value);
  }
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (types.isProxy(value)) fail('Invalid decision JSON');
  if (Array.isArray(value)) {
    array(value, 0, 64, 'decision JSON array');
    return '[' + value.map(item => canonical(item, depth + 1, credentials)).join(',') + ']';
  }
  object(value, 'decision JSON');
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key], depth + 1, credentials)).join(',') + '}';
}
const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
function timestamp(value) {
  const match = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) fail('Invalid decision timestamp');
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || Number(match[4]) > 23 ||
      Number(match[5]) > 59 || Number(match[6]) > 59 || Number(match[9] ?? 0) > 23 || Number(match[10] ?? 0) > 59) fail('Invalid decision timestamp');
}
function normalized(input) {
  fields(input, REQUIRED, ['maxAttempts']);
  token(input.proposalId, 'proposal ID'); token(input.decisionId, 'decision ID');
  if (!['accept', 'dismiss'].includes(input.decision)) fail('Invalid proposal decision');
  revision(input.expectedRevision);
  if (typeof input.packetFingerprint !== 'string' || !HEX.test(input.packetFingerprint)) fail('Invalid decision packet fingerprint');
  if (!['user', 'agent'].includes(input.reviewer) || typeof input.sourceRef !== 'string' ||
      !(input.reviewer === 'user' ? /^user:/ : /^source:/).test(input.sourceRef) || !REF.test(input.sourceRef)) fail('Invalid decision source attestation');
  if (typeof input.reason !== 'string' || !input.reason.trim() || input.reason.length > 512 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(input.reason)) fail('Invalid decision reason');
  array(input.eventIds, 1, 16, 'decision event IDs');
  input.eventIds.forEach(id => token(id, 'decision event ID'));
  if (new Set(input.eventIds).size !== input.eventIds.length) fail('Duplicate decision event ID');
  const maxAttempts = own(input, 'maxAttempts') ? input.maxAttempts : 12;
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 32) fail('Invalid decision packet limit');
  if (canonical(input, 0, true).length > 16384) fail('Decision input exceeds its bounds');
  return { ...input, maxAttempts, reason: input.reason.trim(), eventIds: [...input.eventIds].sort() };
}
function stateCheck(state) {
  fields(state, ['schema', 'revision', 'events', 'attempts', 'lessons', 'proposals'], [], 'state');
  if (state.schema !== 'jh.operational-learning.v1') fail('Invalid learning state');
  revision(state.revision);
  for (const [key, limit] of Object.entries({ events: 10000, attempts: 3000, lessons: 1000, proposals: 1000 })) {
    object(state[key], key);
    if (Object.keys(state[key]).length > limit) fail('Learning state exceeds its bounds');
  }
}
function proposalFor(proposal, id) {
  object(proposal, 'proposal');
  if (id === undefined) id = proposal.id;
  token(id, 'proposal ID');
  if (proposal.id !== id || !KINDS.has(proposal.kind) || !STATUSES.has(proposal.status) ||
      proposal.advisoryOnly !== true || proposal.externalEffects !== false ||
      typeof proposal.patternKey !== 'string' || !HEX.test(proposal.patternKey)) fail('Invalid advisory proposal');
  const scope = proposal.scope;
  fields(scope, ['domain', 'operation', 'engine', 'context'], [], 'proposal scope');
  if (!DOMAINS.has(scope.domain)) fail('Invalid proposal domain');
  if (!(proposal.kind === 'learning_evaluation' && scope.operation === '*')) token(scope.operation, 'proposal operation');
  token(scope.engine, 'proposal engine');
  fields(scope.context, ['platform', 'version', 'environment'], [], 'proposal context');
  for (const value of Object.values(scope.context)) token(value, 'proposal context value');
  return proposal;
}
function allowed(status) { return status === 'open' ? ['accept', 'dismiss'] : status === 'accepted' ? ['dismiss'] : []; }
function history(proposal) {
  if (!own(proposal, 'decisionHistory')) return [];
  const result = proposal.decisionHistory;
  array(result, 0, 2, 'decision history');
  for (const item of result) {
    fields(item, RECEIPT, [], 'decision receipt');
    if (item.schema !== 'jh.learning-proposal-decision.v1' || item.proposalId !== proposal.id ||
        !allowed(item.fromStatus).includes(item.decision) || item.toStatus !== (item.decision === 'accept' ? 'accepted' : 'dismissed')) fail('Invalid decision receipt transition');
    const input = normalized({ ...Object.fromEntries(REQUIRED.filter(key => key !== 'expectedRevision').map(key => [key, item[key]])),
      expectedRevision: item.baseRevision, maxAttempts: item.maxAttempts });
    revision(item.recordedRevision); timestamp(item.timestamp);
    if (item.recordedRevision !== item.baseRevision + 1 || item.requestFingerprint !== digest(input)) fail('Invalid decision receipt binding');
    array(item.evidenceRefs, 1, 64, 'decision evidence');
    if (item.evidenceRefs.some(ref => typeof ref !== 'string' || !REF.test(ref)) ||
        new Set(item.evidenceRefs).size !== item.evidenceRefs.length || typeof item.evidenceRefsTruncated !== 'boolean') fail('Invalid decision evidence');
    canonical(item, 0, true);
  }
  if (result.length === 2 && (result[0].toStatus !== result[1].fromStatus ||
      result[0].recordedRevision >= result[1].recordedRevision || result[0].decisionId === result[1].decisionId)) fail('Invalid decision history order');
  return result;
}

/** A bounded status hint; this does not promote a proposal or prove execution. */
export function decisionSummary(proposal) {
  object(proposal, 'proposal');
  // Existing imported proposals can have incomplete scope. Without a decision
  // history there is nothing to summarize; preserve the old status read path.
  if (!own(proposal, 'decisionHistory')) return null;
  proposalFor(proposal);
  const item = history(proposal).at(-1);
  return item ? Object.fromEntries(['decisionId', 'decision', 'fromStatus', 'toStatus', 'timestamp', 'reviewer', 'sourceRef'].map(key => [key, item[key]])) : null;
}

/** Read any proposal status, including dismissed/resolved, without preparing a candidate. */
export function proposalDecisionView(state, input) {
  stateCheck(state); fields(input, ['proposalId'], [], 'decision view');
  token(input.proposalId, 'proposal ID');
  if (!own(state.proposals, input.proposalId)) fail('Unknown proposal');
  const proposal = proposalFor(state.proposals[input.proposalId], input.proposalId);
  return { schema: 'jh.learning-proposal-decision-view.v1', revision: state.revision,
    proposalId: proposal.id, kind: proposal.kind, scope: structuredClone(proposal.scope), currentStatus: proposal.status,
    allowedDecisions: allowed(proposal.status), decisionHistory: structuredClone(history(proposal)),
    latestDecision: decisionSummary(proposal), readOnly: true, advisoryOnly: true,
    externalEffects: false, liveExecutionVerified: false };
}

/**
 * The host must authenticate the owner and run this inside the store transaction.
 * reviewer/sourceRef are the caller's attestation, not server-retrieved chat proof.
 * Accept/dismiss only prioritizes a proposal; it never activates a lesson or executes work.
 */
export function decideProposal(state, input, options = {}) {
  stateCheck(state); fields(options, [], ['now'], 'decision options');
  const request = normalized(input);
  const requestFingerprint = digest(request);
  // Retry identity precedes revision checks: a lost response must not create a
  // second decision, and the returned proposal reflects its CURRENT status.
  let previous;
  for (const [id, stored] of Object.entries(state.proposals)) {
    object(stored, 'proposal');
    if (!own(stored, 'decisionHistory')) continue;
    const proposal = proposalFor(stored, id);
    for (const receipt of history(proposal)) {
      if (receipt.recordedRevision > state.revision) fail('Invalid future decision receipt');
      if (receipt.decisionId !== request.decisionId) continue;
      if (previous || id !== request.proposalId || receipt.requestFingerprint !== requestFingerprint) conflict();
      previous = { proposal, receipt };
    }
  }
  if (previous) return { state, proposal: structuredClone(previous.proposal), receipt: structuredClone(previous.receipt), duplicate: true };
  if (request.expectedRevision !== state.revision) fail('Proposal decision revision is stale', 'LEARNING_REVISION_CONFLICT');
  if (!own(state.proposals, request.proposalId)) fail('Unknown proposal');
  const proposal = proposalFor(state.proposals[request.proposalId], request.proposalId);
  // A new ID cannot disguise a repeated acceptance as a new review decision.
  if (!allowed(proposal.status).includes(request.decision)) conflict();
  const packet = prepareReview(state, { proposalId: request.proposalId, maxAttempts: request.maxAttempts });
  if (packet.packetFingerprint !== request.packetFingerprint) conflict();
  const visible = new Set(packet.attempts.map(item => item.eventId));
  if (request.eventIds.some(id => !visible.has(id))) fail('Decision evidence is outside the prepared packet');
  const events = request.eventIds.map(id => state.events[id]);
  const eventRefs = events.map(event => REF.test('event:' + event.eventId) ? 'event:' + event.eventId : 'sha256:' + digest(event));
  const refs = [...new Set([request.sourceRef, ...eventRefs, ...events.flatMap(event => event.evidenceRefs)])];
  const now = options.now ?? new Date().toISOString(); timestamp(now);
  const receipt = { schema: 'jh.learning-proposal-decision.v1', proposalId: proposal.id,
    decisionId: request.decisionId, decision: request.decision, fromStatus: proposal.status,
    toStatus: request.decision === 'accept' ? 'accepted' : 'dismissed', timestamp: now,
    baseRevision: state.revision, recordedRevision: state.revision + 1,
    packetFingerprint: request.packetFingerprint, requestFingerprint, maxAttempts: request.maxAttempts,
    reviewer: request.reviewer, sourceRef: request.sourceRef, reason: request.reason,
    eventIds: request.eventIds, evidenceRefs: refs.slice(0, 64), evidenceRefsTruncated: refs.length > 64 };
  canonical(receipt, 0, true);
  const next = setProposalStatus(state, proposal.id, receipt.toStatus);
  next.proposals[proposal.id].decisionHistory = [...structuredClone(history(proposal)), receipt];
  history(next.proposals[proposal.id]);
  return { state: next, proposal: structuredClone(next.proposals[proposal.id]), receipt: structuredClone(receipt), duplicate: false };
}
