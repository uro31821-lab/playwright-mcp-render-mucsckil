import { createHash } from 'node:crypto';
import { readRuleUseHistory } from './rule-use-review.mjs';
import { readProposalCandidateLinks } from './progress.mjs';
import { ruleDefinition, ruleUseHash } from './rule-use-contract.mjs';

const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/+-]{0,127}$/;
const HEX = /^[a-f0-9]{64}$/;
const MAX_EVIDENCE = 8;
const own = (value, key) => Object.hasOwn(value, key);
const clone = value => structuredClone(value);
const byId = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const fail = (message, code) => { throw Object.assign(new TypeError(message), code ? { code } : {}); };

function fields(value, required, optional = []) {
  // ruleUseHash checks bounded data-only input before any property is inspected.
  if (!value || typeof value !== 'object' || Array.isArray(value) || required.some(key => !own(value, key)) ||
      Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) fail('Invalid candidate evidence fields');
}
function integer(value, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail('Invalid candidate evidence budget');
}
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
}
// Full historical state is validated before use; do not apply the input helper's
// 1 MiB limit to a larger valid source history when calculating its digest.
const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
const attemptKey = event => digest([event.taskId, event.attemptId]);
const scopeOf = value => ({ domain: value.domain, operation: value.operation, engine: value.engine, context: clone(value.context) });
function evidence(refs) {
  return { evidenceRefs: refs.slice(0, MAX_EVIDENCE), evidenceRefsOmitted: Math.max(0, refs.length - MAX_EVIDENCE),
    evidenceRefsTruncated: refs.length > MAX_EVIDENCE };
}
function request(input) {
  ruleUseHash(input);
  fields(input, ['proposalId', 'lessonId', 'ruleVersion', 'inputFingerprint'], ['options']);
  for (const key of ['proposalId', 'lessonId', 'ruleVersion']) if (typeof input[key] !== 'string' || !TOKEN.test(input[key])) fail('Invalid candidate evidence identity');
  if (typeof input.inputFingerprint !== 'string' || !HEX.test(input.inputFingerprint)) fail('Invalid candidate input fingerprint');
  const options = own(input, 'options') ? input.options : {};
  fields(options, [], ['maxUsesPerSource', 'maxChars']);
  const maxUsesPerSource = own(options, 'maxUsesPerSource') ? options.maxUsesPerSource : 1;
  const maxChars = own(options, 'maxChars') ? options.maxChars : 12000;
  integer(maxUsesPerSource, 1, 4); integer(maxChars, 1, 32768);
  return { proposalId: input.proposalId, lessonId: input.lessonId, ruleVersion: input.ruleVersion,
    inputFingerprint: input.inputFingerprint, maxUsesPerSource, maxChars };
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
    return { status: 'invalid', binding: { lessonId, status: 'invalid', storedValue: value } };
  }
}
function definitionMatch(stored, selected) {
  if (stored.status !== 'available') return { status: stored.status };
  const definition = stored.definition;
  if (definition.id !== selected.lessonId || definition.ruleVersion !== selected.ruleVersion ||
      definition.inputFingerprint !== selected.inputFingerprint || stored.fingerprint !== selected.definitionFingerprint) {
    return { status: 'changed', observedDefinitionFingerprint: stored.fingerprint };
  }
  return { status: 'matched', observedDefinitionFingerprint: stored.fingerprint, source: 'matching_stored_definition',
    guidance: definition.guidance, scope: scopeOf(definition), ...evidence(definition.evidenceRefs) };
}
function candidateBinding(stored, link) {
  if (stored.status !== 'available') return stored.status;
  const definition = stored.definition;
  // A link stores these identities, not a separate full definition hash or suite.
  // Matching is therefore deliberately limited to the registered identity fields.
  return definition.id === link.lessonId && definition.ruleVersion === link.ruleVersion &&
    definition.inputFingerprint === link.inputFingerprint && canonical(scopeOf(definition)) === canonical(link.scope)
    ? 'matched' : 'changed';
}
function resultSummary(result) {
  return { eventId: result.eventId, sequence: result.sequence, timestamp: result.timestamp, outcome: result.outcome,
    source: result.source, ...(own(result, 'errorCode') ? { errorCode: result.errorCode } : {}), ...evidence(result.evidenceRefs) };
}
function useSummary(item) {
  const { event, usage, definition } = item; const selected = usage.selection;
  return { useRef: usage.useRef, lessonId: selected.lessonId, ruleVersion: selected.ruleVersion,
    inputFingerprint: selected.inputFingerprint, definitionFingerprint: selected.definitionFingerprint,
    evaluationFingerprint: selected.evaluationFingerprint, selectionFingerprint: selected.fingerprint,
    selectedAt: selected.selectedAt, appliedAt: usage.appliedAt,
    recordedEventId: event.eventId, recordedAt: event.timestamp, recordedSequence: event.sequence,
    ...evidence(usage.evidenceRefs), definition: clone(definition) };
}
const latestUseFirst = (left, right) => Date.parse(right.usage.appliedAt) - Date.parse(left.usage.appliedAt) ||
  right.event.sequence - left.event.sequence || byId(left.usage.useRef, right.usage.useRef);
function eligibleSource(event) {
  return event.evidenceRefs.length > 0 && (
    (['success_verified', 'failure_verified'].includes(event.outcome) && ['host_verified', 'user_explicit'].includes(event.source)) ||
    (event.outcome === 'correction' && event.source === 'user_explicit'));
}

/** Trace currently retained records from one existing candidate registration.
 * The registered event IDs are anchors, not hashes of their original contents or
 * a list of use receipts acknowledged by a reviewer. No current result replaces
 * a registered source, and no newly discovered use proves registration-time access.
 */
export function prepareCandidateEvidence(state, input) {
  const requested = request(input);
  // Validate the complete raw event/projection graph before older progress code.
  const history = readRuleUseHistory(state);
  const registered = readProposalCandidateLinks(state, requested.proposalId);
  const matches = registered.links.filter(link => link.lessonId === requested.lessonId &&
    link.ruleVersion === requested.ruleVersion && link.inputFingerprint === requested.inputFingerprint);
  if (matches.length !== 1) fail('Unknown candidate registration link', 'LEARNING_CANDIDATE_LINK_NOT_FOUND');
  const link = matches[0];
  const definitions = new Map();
  const lookup = lessonId => {
    if (!definitions.has(lessonId)) definitions.set(lessonId, storedDefinition(state, lessonId));
    return definitions.get(lessonId);
  };
  const candidate = { lessonId: link.lessonId, ruleVersion: link.ruleVersion, inputFingerprint: link.inputFingerprint,
    scope: clone(link.scope), bindingStatus: candidateBinding(lookup(link.lessonId), link), bindingBasis: 'registered_identity_fields' };
  const registration = { registeredAt: link.registeredAt, baseRevision: link.baseRevision, recordedRevision: link.recordedRevision,
    reviewer: link.reviewer, provenance: link.provenance, reviewPacketFingerprint: link.packetFingerprint,
    sourceEventIds: [...link.sourceEventIds], regression: clone(link.regression) };
  const totals = { registeredSources: link.sourceEventIds.length, availableSources: 0, missingSources: 0,
    recordedUses: 0, precedingUses: 0, nonPrecedingUses: 0, sourcesWithUses: 0, sourcesWithPrecedingUses: 0 };
  const allRows = []; const sources = []; const sourceAttempts = new Set();
  for (const sourceEventId of link.sourceEventIds) {
    if (!own(state.events, sourceEventId)) {
      totals.missingSources++;
      allRows.push({ sourceEventId, sourceStatus: 'missing', taskId: null, attemptId: null, scope: null,
        sourceRecord: null, currentProjection: null, precedingUses: { items: [], total: 0, omitted: 0 }, nonPrecedingUseCount: 0 });
      sources.push({ sourceEventId, status: 'missing' });
      continue;
    }
    const source = state.events[sourceEventId];
    const group = history.get(attemptKey(source));
    if (!group || canonical(scopeOf(source)) !== canonical(link.scope) || !eligibleSource(source)) fail('Invalid registered source binding');
    const key = attemptKey(source);
    if (sourceAttempts.has(key)) fail('Registered sources cannot duplicate an attempt');
    sourceAttempts.add(key);
    const uses = [];
    const sourceEvents = group.events.filter(event => event.ruleUses).sort((left, right) => byId(left.eventId, right.eventId));
    for (const event of sourceEvents) for (const usage of event.ruleUses) {
      const definition = definitionMatch(lookup(usage.selection.lessonId), usage.selection);
      const preceding = source.sequence >= event.sequence && Date.parse(source.timestamp) >= Date.parse(usage.appliedAt);
      uses.push({ event, usage, definition, preceding });
    }
    const preceding = uses.filter(item => item.preceding).sort(latestUseFirst);
    totals.availableSources++; totals.recordedUses += uses.length; totals.precedingUses += preceding.length;
    totals.nonPrecedingUses += uses.length - preceding.length;
    if (uses.length) totals.sourcesWithUses++;
    if (preceding.length) totals.sourcesWithPrecedingUses++;
    allRows.push({ sourceEventId, sourceStatus: 'available', taskId: source.taskId, attemptId: source.attemptId, scope: scopeOf(source),
      sourceRecord: resultSummary(source),
      currentProjection: { ...resultSummary(group.projection), isRegisteredSource: group.projection.eventId === sourceEventId },
      precedingUses: { items: preceding.slice(0, requested.maxUsesPerSource).map(useSummary), total: preceding.length,
        omitted: Math.max(0, preceding.length - requested.maxUsesPerSource) }, nonPrecedingUseCount: uses.length - preceding.length });
    sources.push({ sourceEventId, source, currentProjection: group.projection,
      currentStoredEvent: state.events[group.projection.eventId], sourceEvents,
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
  const omittedSources = allRows.length - items.length;
  const fingerprint = digest({ proposalId: registered.proposalId, currentStatus: registered.currentStatus,
    link, candidate, sources, definitions: [...definitions].sort(([left], [right]) => byId(left, right)).map(([, value]) => value.binding),
    options: { maxUsesPerSource: requested.maxUsesPerSource, maxChars: requested.maxChars }, items, totals, omittedSources });
  return { schema: 'jh.learning-candidate-evidence.v1', proposalId: registered.proposalId, currentStatus: registered.currentStatus,
    revision: state.revision, candidate, registration, coverage: 'registered_source_events', derivation: 'derived_from_registered_sources',
    items, totals, omittedSources, maxUsesPerSource: requested.maxUsesPerSource, maxChars: requested.maxChars, fingerprint,
    readOnly: true, advisoryOnly: true, externalEffects: false, replayAllowed: false,
    sourceAuthentication: 'host_attestation', availableAtRegistrationVerified: false, sourceContentAtRegistrationVerified: false,
    reviewerAcknowledgementVerified: false, independentApplicationVerified: false, preActionTimingVerified: false,
    causalEffectVerified: false, liveExecutionVerified: false, liveImprovementVerified: false, modelTrainingPerformed: false,
    historicalOnly: true, currentSelectionVerified: false };
}
