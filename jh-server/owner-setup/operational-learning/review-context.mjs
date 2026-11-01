import { createHash } from 'node:crypto';
import { prepareReview } from './curation.mjs';
import { readRuleUseHistory } from './rule-use-review.mjs';
import { ruleDefinition, ruleUseHash } from './rule-use-contract.mjs';

const MAX_EVIDENCE = 8;
const own = (value, key) => Object.hasOwn(value, key);
const clone = value => structuredClone(value);
const fail = message => { throw new TypeError(message); };
const byId = (left, right) => left < right ? -1 : left > right ? 1 : 0;

// Input is bounded, data-only and credential checked by ruleUseHash before these
// helpers read properties. Full state/history is validated separately, without
// applying the small input hash helper's 1 MiB limit to a valid larger store.
function fields(value, required, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      required.some(key => !own(value, key)) ||
      Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) fail('Invalid review context fields');
}
function integer(value, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail('Invalid review context budget');
}
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
}
const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
const attemptKey = value => digest([value.taskId, value.attemptId]);
const scopeOf = value => ({ domain: value.domain, operation: value.operation, engine: value.engine, context: clone(value.context) });
function evidence(refs) {
  return { evidenceRefs: refs.slice(0, MAX_EVIDENCE), evidenceRefsOmitted: Math.max(0, refs.length - MAX_EVIDENCE),
    evidenceRefsTruncated: refs.length > MAX_EVIDENCE };
}
function request(input) {
  ruleUseHash(input);
  fields(input, ['proposalId'], ['maxAttempts', 'usageOptions']);
  const options = own(input, 'usageOptions') ? input.usageOptions : {};
  fields(options, [], ['maxUsesPerResult', 'maxChars']);
  const maxUsesPerResult = own(options, 'maxUsesPerResult') ? options.maxUsesPerResult : 1;
  const maxChars = own(options, 'maxChars') ? options.maxChars : 12000;
  integer(maxUsesPerResult, 1, 4); integer(maxChars, 1, 32768);
  const base = { proposalId: input.proposalId, ...(own(input, 'maxAttempts') ? { maxAttempts: input.maxAttempts } : {}) };
  if (own(input, 'maxAttempts')) integer(input.maxAttempts, 1, 32);
  return { base, maxUsesPerResult, maxChars };
}

function storedDefinition(state, lessonId) {
  if (!own(state.lessons, lessonId)) return { status: 'missing', binding: { lessonId, status: 'missing' } };
  const value = state.lessons[lessonId];
  try {
    const definition = ruleDefinition(value);
    if (definition.id !== lessonId) fail('Invalid stored definition identity');
    const fingerprint = ruleUseHash(definition);
    return { status: 'available', definition, fingerprint,
      binding: { lessonId, status: 'available', definition, fingerprint } };
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    // Do not return malformed/current text as a reconstruction of historical
    // guidance. Bind the inspected data privately so omissions are not invisible.
    return { status: 'invalid', binding: { lessonId, status: 'invalid', storedValue: value } };
  }
}
function definitionMatch(stored, selected) {
  if (stored.status !== 'available') return { status: stored.status };
  const definition = stored.definition;
  const matched = definition.id === selected.lessonId && definition.ruleVersion === selected.ruleVersion &&
    definition.inputFingerprint === selected.inputFingerprint && stored.fingerprint === selected.definitionFingerprint;
  if (!matched) return { status: 'changed', observedDefinitionFingerprint: stored.fingerprint };
  return { status: 'matched', observedDefinitionFingerprint: stored.fingerprint,
    source: 'matching_stored_definition', guidance: definition.guidance,
    scope: scopeOf(definition), ...evidence(definition.evidenceRefs) };
}
function resultSummary(result) {
  return { sequence: result.sequence, timestamp: result.timestamp, outcome: result.outcome, source: result.source,
    ...(own(result, 'errorCode') ? { errorCode: result.errorCode } : {}), ...evidence(result.evidenceRefs) };
}
function useSummary(item) {
  const { event, usage, definition } = item;
  const selected = usage.selection;
  return { useRef: usage.useRef, lessonId: selected.lessonId, ruleVersion: selected.ruleVersion,
    inputFingerprint: selected.inputFingerprint, definitionFingerprint: selected.definitionFingerprint,
    evaluationFingerprint: selected.evaluationFingerprint, selectionFingerprint: selected.fingerprint,
    selectedAt: selected.selectedAt, appliedAt: usage.appliedAt,
    recordedEventId: event.eventId, recordedAt: event.timestamp, recordedSequence: event.sequence,
    ...evidence(usage.evidenceRefs), definition: clone(definition) };
}
const latestUseFirst = (left, right) => Date.parse(right.usage.appliedAt) - Date.parse(left.usage.appliedAt) ||
  right.event.sequence - left.event.sequence || byId(left.usage.useRef, right.usage.useRef);

/** Prepare the original review packet plus a separately fingerprinted historical
 * use sidecar. The sidecar never supplies candidate event IDs, grants a decision,
 * evaluates a current rule, or replaces the packet's existing authorization gates.
 */
export function prepareReviewContext(state, input) {
  const requested = request(input);
  // Validate data and the complete event/projection graph before prepareReview's
  // older validators can inspect or clone any supplied state.
  const history = readRuleUseHistory(state);
  const packet = prepareReview(state, requested.base);
  const definitions = new Map(); const sourceResults = []; const allRows = [];
  const totals = { recordedUses: 0, precedingUses: 0, nonPrecedingUses: 0, resultsWithUses: 0, resultsWithPrecedingUses: 0 };
  for (const selectedResult of packet.attempts) {
    const group = history.get(attemptKey(selectedResult));
    if (!group || group.projection.eventId !== selectedResult.eventId ||
        group.projection.taskId !== selectedResult.taskId || group.projection.attemptId !== selectedResult.attemptId ||
        canonical(scopeOf(group.projection)) !== canonical(scopeOf(selectedResult))) fail('Review result differs from its historical binding');
    const result = group.projection;
    const uses = [];
    const sourceEvents = group.events.filter(event => event.ruleUses).sort((left, right) => byId(left.eventId, right.eventId));
    for (const event of sourceEvents) for (const usage of event.ruleUses) {
      if (!definitions.has(usage.selection.lessonId)) definitions.set(usage.selection.lessonId, storedDefinition(state, usage.selection.lessonId));
      const definition = definitionMatch(definitions.get(usage.selection.lessonId), usage.selection);
      const preceding = result.sequence >= event.sequence && Date.parse(result.timestamp) >= Date.parse(usage.appliedAt);
      uses.push({ event, usage, definition, preceding });
    }
    const preceding = uses.filter(item => item.preceding).sort(latestUseFirst);
    totals.recordedUses += uses.length; totals.precedingUses += preceding.length;
    totals.nonPrecedingUses += uses.length - preceding.length;
    if (uses.length) totals.resultsWithUses++;
    if (preceding.length) totals.resultsWithPrecedingUses++;
    allRows.push({ taskId: selectedResult.taskId, attemptId: selectedResult.attemptId, scope: scopeOf(selectedResult),
      resultEventId: selectedResult.eventId, result: resultSummary(result),
      precedingUses: { items: preceding.slice(0, requested.maxUsesPerResult).map(useSummary),
        total: preceding.length, omitted: Math.max(0, preceding.length - requested.maxUsesPerResult) },
      nonPrecedingUseCount: uses.length - preceding.length });
    sourceResults.push({ taskId: selectedResult.taskId, attemptId: selectedResult.attemptId, resultEventId: selectedResult.eventId,
      sourceEvents, currentProjection: result, selectedResult: state.events[selectedResult.eventId],
      definitionMatches: [...uses].sort((left, right) => byId(left.usage.useRef, right.usage.useRef)).map(item => ({
        useRef: item.usage.useRef, preceding: item.preceding, definition: item.definition,
      })) });
  }
  const items = []; let chars = 0;
  for (const row of allRows) {
    const length = [...JSON.stringify(row)].length;
    if (chars + length > requested.maxChars) continue;
    items.push(row); chars += length;
  }
  const omittedResults = allRows.length - items.length;
  const binding = { proposalId: packet.proposal.id, baseRevision: packet.baseRevision,
    reviewPacketFingerprint: packet.packetFingerprint, selectedResultSet: packet.attempts.map(item => ({
      taskId: item.taskId, attemptId: item.attemptId, eventId: item.eventId,
    })), sourceResults,
    definitions: [...definitions].sort(([left], [right]) => byId(left, right)).map(([, value]) => value.binding),
    options: { maxAttempts: packet.maxAttempts, maxUsesPerResult: requested.maxUsesPerResult, maxChars: requested.maxChars },
    items, totals, omittedResults };
  const ruleUseEvidence = { schema: 'jh.learning-review-rule-use-evidence.v1', coverage: 'visible_packet_attempts',
    proposalId: packet.proposal.id, baseRevision: packet.baseRevision, reviewPacketFingerprint: packet.packetFingerprint,
    selectedResultCount: packet.attempts.length, items, totals, omittedResults,
    maxUsesPerResult: requested.maxUsesPerResult, maxChars: requested.maxChars, fingerprint: digest(binding),
    sourceAuthentication: 'host_attestation', independentApplicationVerified: false, preActionTimingVerified: false,
    causalEffectVerified: false, liveImprovementVerified: false, historicalOnly: true, currentSelectionVerified: false };
  return { schema: 'jh.learning-review-context.v1', packet, ruleUseEvidence,
    readOnly: true, advisoryOnly: true, externalEffects: false, replayAllowed: false };
}
