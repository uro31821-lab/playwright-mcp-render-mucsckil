/**
 * Bounded inspection of ORIGINAL Android snapshot/discovery job schemas.
 * This pure module does not authenticate a job, call a tool or authorize an
 * effect. The original host must bind accepted completion, device, session,
 * command and invocation order before using any returned proof candidate.
 *
 * Guided f_ identifiers are canonical native targets. There is no item_ -> f_
 * conversion, label-based node-identity claim, or caller-selected field here.
 * Returned evidence/issued arguments are private host data, never public logs.
 */
import {inspectSplitEvidence} from '../deployment/split-screen-evidence.mjs';
import {resolveJebiseoGuidedArguments, prepareJebiseoGuidedCall} from './guided-form.mjs';

const CHROME = 'com.android.chrome', CHAT = 'com.openai.chatgpt';
const PROTOCOL = 'com.koreanlifehub.bridge.protocol', GEMINI = 'gemini.google.com';
const MAX_AGE_MS = 45000, PHONE_CLOCK_SKEW_MS = 5000, MAX_BYTES = 2 * 1024 * 1024, MAX_ROWS = 3000;
const FIELD = /^f_[0-9a-f]{24}$/, HEX64 = /^[0-9a-f]{64}$/;
const OPERATIONS = new Set(['DISCOVER_INPUT', 'TYPE', 'DISMISS_NOTICE']);
const LABEL_SOURCES = new Set(['hint', 'description', 'labeledBy', 'single_control_label']);
const FIELD_KINDS = new Set(['TEXT', 'CHOICE', 'CHECKBOX', 'RADIO', 'FILE', 'SENSITIVE']);
// Exact semantic candidates, not a claim about labels in the current live UI.
// Expand only after reviewing actual original metadata; never accept a caller
// label list or the first empty textbox as the Gemini prompt editor.
export const JEBISEO_GEMINI_PROMPT_LABELS = Object.freeze(['Gemini에게 물어보기', 'Ask Gemini']);
const PROMPT_LABELS = new Set(JEBISEO_GEMINI_PROMPT_LABELS);
const DISMISS_LABELS = new Set(['닫기', '주의사항 닫기', 'Close', 'Dismiss']);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const id = value => typeof value === 'string' && /^(?:0|[1-9][0-9]{0,9})$/.test(value) &&
  Number.isSafeInteger(Number(value));
const finiteTime = value => Number.isSafeInteger(value) && value > 0;
const fresh = (value, now) => finiteTime(value) && value <= now && now - value <= MAX_AGE_MS;
// Only phone observations receive the original split-proof clock tolerance.
// Server job completion timestamps remain strict server-time observations.
const phoneFresh = (value, now) => finiteTime(value) && value <= now + PHONE_CLOCK_SKEW_MS &&
  now - value <= MAX_AGE_MS;
const json = value => {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > MAX_BYTES) return null;
  try { return JSON.parse(value); } catch { return null; }
};
const timestamp = value => {
  if (typeof value !== 'string' || value.length > 40) return null;
  const parsed = Date.parse(value);
  return finiteTime(parsed) && new Date(parsed).toISOString() === value ? parsed : null;
};
const rect = (value, separator) => {
  if (typeof value !== 'string') return null;
  const pattern = separator === ',' ? /^[0-9]+,[0-9]+,[0-9]+,[0-9]+$/ : /^[0-9]+ [0-9]+ [0-9]+ [0-9]+$/;
  if (!pattern.test(value)) return null;
  const n = value.split(separator).map(Number);
  return n.every(v => Number.isSafeInteger(v) && v >= 0 && v <= 100000) &&
    n[2] > n[0] && n[3] > n[1] ? n : null;
};
const sameRect = (a, b) => a !== null && b !== null && a.every((v, i) => v === b[i]);
const sameFields = (a, b) => ['fieldId', 'label', 'kind', 'filled', 'enabled', 'ambiguous',
  'error', 'labelSource', 'controlRole'].every(key => a[key] === b[key]);

function readJob(job, type, now) {
  if (!plain(job) || job.type !== type || job.status !== 'complete' ||
      (job.error !== undefined && job.error !== null) || !plain(job.result) || job.result.ok !== true)
    return {ok: false, code: 'NATIVE_ORIGINAL_COMPLETION_REQUIRED'};
  const completedAtMs = timestamp(job.completedAt);
  if (!fresh(completedAtMs, now)) return {ok: false, code: 'NATIVE_COMPLETION_TIME_UNVERIFIED'};
  const payload = json(job.result.url);
  if (payload === null) return {ok: false, code: 'NATIVE_PAYLOAD_INVALID'};
  return {ok: true, payload, completedAtMs};
}

function inspectScope(snapshot, rows, now) {
  const pair = inspectSplitEvidence(snapshot.result, rows, CHROME, now);
  if (!pair.ok) return {ok: false, code: pair.reason};
  const p = snapshot.result.splitScreen;
  if (p.chatPackage !== CHAT || p.chatKind !== 'NATIVE')
    return {ok: false, code: 'NATIVE_LEFT_GPT_REQUIRED'};
  const scopes = rows.filter(row => row.kind === 'screen_scope');
  if (scopes.length !== 1) return {ok: false, code: 'NATIVE_SCREEN_SCOPE_AMBIGUOUS'};
  const s = scopes[0], row = rows.find(item => item.kind === 'split_screen_evidence');
  const workBounds = rect(p.workBounds, ','), chatBounds = rect(p.chatBounds, ',');
  if (s.package !== CHROME || s.windowId !== p.workWindowId || s.placement !== 'RIGHT' ||
      s.workPaneSide !== 'RIGHT' || s.verifiedRightPane !== 'true' || s.verifiedWorkPane !== 'true' ||
      !sameRect(rect(s.workBounds, ' '), workBounds) || !sameRect(rect(s.chatBounds, ' '), chatBounds))
    return {ok: false, code: 'NATIVE_RIGHT_SCOPE_MISMATCH'};
  const displayKeys = ['chatDisplayId', 'workDisplayId', 'displayId', 'displayVerified'];
  if (p.displayVerified !== 'true' || !id(p.chatDisplayId) || !id(p.workDisplayId) ||
      p.chatDisplayId !== p.workDisplayId || p.displayId !== p.workDisplayId ||
      displayKeys.some(key => row[key] !== p[key]))
    return {ok: false, code: 'NATIVE_DISPLAY_UNVERIFIED'};
  if (rows.some(item => item.package === CHROME && Object.hasOwn(item, 'displayId') && item.displayId !== p.displayId))
    return {ok: false, code: 'NATIVE_ROW_DISPLAY_MISMATCH'};
  const observedAtMs = Number(p.observedAtMs), rowAt = Number(row.observedAtMs);
  if (![p.observedAtMs, row.observedAtMs].every(value => typeof value === 'string' && /^[0-9]{10,16}$/.test(value)) ||
      !phoneFresh(observedAtMs, now) || !phoneFresh(rowAt, now))
    return {ok: false, code: 'NATIVE_OBSERVATION_TIME_UNVERIFIED'};
  return {ok: true, workPackage: CHROME, windowId: Number(p.workWindowId),
    displayId: Number(p.displayId), chatWindowId: Number(p.chatWindowId),
    observedAtMs, rowObservedAtMs: rowAt, workBounds: Object.freeze(workBounds), chatBounds: Object.freeze(chatBounds)};
}

function formPage(value, coverage) {
  if (!(plain(value) && value.ok === true && value.code === 'form_scanned' &&
    value.coverage === coverage && typeof value.origin === 'string' && value.origin.length <= 253 &&
    typeof value.revision === 'string' && HEX64.test(value.revision) &&
    typeof value.hasSensitiveFields === 'boolean' &&
    Array.isArray(value.siteErrors) && value.siteErrors.length <= 650 &&
    value.siteErrors.every(error => typeof error === 'string' && error.length <= 800) &&
    Array.isArray(value.fields) && value.fields.length <= 650 && value.fields.every(plain) &&
    Array.isArray(value.buttons) && value.buttons.length <= 650 && value.buttons.every(plain))) return false;
  const label = value => typeof value === 'string' && value.length > 0 && value.length <= 800 && !value.includes('\0');
  if (value.fields.some(field => !FIELD.test(field.fieldId || '') || !label(field.label) ||
      !FIELD_KINDS.has(field.kind) || typeof field.filled !== 'boolean' || typeof field.enabled !== 'boolean' ||
      typeof field.ambiguous !== 'boolean' || typeof field.error !== 'string' || field.error.length > 800 ||
      typeof field.labelSource !== 'string' || field.labelSource.length > 80 ||
      typeof field.controlRole !== 'string' || field.controlRole.length > 120) ||
      value.buttons.some(button => !FIELD.test(button.targetId || '') || !label(button.label) ||
        typeof button.approvalRequired !== 'boolean')) return false;
  const targets = [...value.fields.map(field => field.fieldId), ...value.buttons.map(button => button.targetId)];
  return new Set(targets).size === targets.length;
}

function chooseTarget({snapshot, discovery, page, operation, now, completedAtMs, observedAtMs}) {
  if (operation === 'DISCOVER_INPUT') {
    const resolved = resolveJebiseoGuidedArguments({operation, snapshot});
    return resolved.ok ? {ok: true, resolved, nativeTarget: null} : resolved;
  }
  if (operation === 'DISMISS_NOTICE') {
    const selected = page.buttons.filter(button => DISMISS_LABELS.has(button.label));
    if (selected.length !== 1) return {ok: false, code: 'NATIVE_NOTICE_TARGET_AMBIGUOUS'};
    const button = selected[0];
    const resolved = resolveJebiseoGuidedArguments({operation, snapshot,
      fieldId: button.targetId, targetLabel: button.label});
    if (!resolved.ok) return resolved;
    // Original button metadata has no dialog/parent semantic link. A generic
    // Close/Dismiss label can parse as a carrier but cannot prove this purpose.
    if (button.label !== '주의사항 닫기') return {ok: false, code: 'NATIVE_NOTICE_PURPOSE_UNVERIFIED'};
    return {ok: true, resolved, nativeTarget: Object.freeze({
      fieldId: button.targetId, label: button.label, purpose: 'DISMISS_NOTICE', approvalRequired: false})};
  }
  const selected = page.fields.filter(field => PROMPT_LABELS.has(field.label));
  if (selected.length !== 1) return {ok: false, code: 'NATIVE_GEMINI_EDITOR_AMBIGUOUS'};
  const field = selected[0];
  if (!FIELD.test(field.fieldId || '') || page.fields.filter(other => other.fieldId === field.fieldId).length !== 1 ||
      field.kind !== 'TEXT' || field.enabled !== true || field.ambiguous !== false || field.error !== '' ||
      !LABEL_SOURCES.has(field.labelSource)) return {ok: false, code: 'NATIVE_GEMINI_EDITOR_UNVERIFIED'};
  if (field.filled !== false) return {ok: false, code: 'NATIVE_EMPTY_EDITOR_REQUIRED'};
  if (page.siteErrors.length) return {ok: false, code: 'NATIVE_FORM_ERRORS_UNRESOLVED'};
  const read = readJob(discovery, 'agent_step', now);
  if (!read.ok) return read;
  const d = read.payload;
  if (!formPage(d, 'VISIBLE_ONLY') || d.feature !== 'input_selection_15' ||
      d.hasSensitiveFields !== false || d.fields.some(field => field.kind === 'SENSITIVE') ||
      d.siteErrors.length || d.origin !== page.origin || d.revision !== page.revision)
    return {ok: false, code: 'NATIVE_DISCOVERY_SNAPSHOT_MISMATCH'};
  if (read.completedAtMs > completedAtMs || read.completedAtMs > observedAtMs + PHONE_CLOCK_SKEW_MS)
    return {ok: false, code: 'NATIVE_DISCOVERY_ORDER_UNVERIFIED'};
  const discovered = d.fields.filter(other => other.fieldId === field.fieldId);
  if (discovered.length !== 1 || !sameFields(field, discovered[0]))
    return {ok: false, code: 'NATIVE_DISCOVERY_FIELD_MISMATCH'};
  const resolved = resolveJebiseoGuidedArguments({operation, discovery,
    fieldId: field.fieldId, targetLabel: field.label});
  if (!resolved.ok) return resolved;
  // The fresh snapshot's discovery hint and this write must share the original
  // native issuer session. Request IDs are intentionally different issuances.
  const currentIssuer = resolveJebiseoGuidedArguments({operation: 'DISCOVER_INPUT', snapshot});
  if (!currentIssuer.ok || currentIssuer.identity.session !== resolved.identity.session)
    return {ok: false, code: 'NATIVE_ISSUER_SESSION_CHANGED'};
  return {ok: true, resolved, discoveryRevision: d.revision, discoveryCompletedAtMs: read.completedAtMs,
    nativeTarget: Object.freeze({fieldId: field.fieldId, label: field.label, purpose: 'GEMINI_PROMPT',
      kind: 'TEXT', filled: false, enabled: true, ambiguous: false, labelSource: field.labelSource,
      emptyMeaning: 'EMPTY_OR_HINT'})};
}

function addressEvidence(rows, scope, now) {
  const candidates = rows.filter(row => row.kind === 'browser_address_readback');
  if (!candidates.length) return {ok: false, code: 'PROVIDER_ADDRESS_UNVERIFIED'};
  if (candidates.length !== 1) return {ok: false, code: 'PROVIDER_ADDRESS_AMBIGUOUS'};
  const row = candidates[0];
  if (row.package !== PROTOCOL || row.source !== 'ANDROID_ACCESSIBILITY_TOOLBAR' ||
      row.workPackage !== CHROME || row.windowId !== String(scope.windowId) ||
      row.displayId !== String(scope.displayId) || row.pageContentVerified !== 'false')
    return {ok: false, code: 'PROVIDER_ADDRESS_SCOPE_UNVERIFIED'};
  const at = Number(row.observedAtMs);
  if (typeof row.observedAtMs !== 'string' || !/^[0-9]{10,16}$/.test(row.observedAtMs) ||
      !phoneFresh(at, now) || at > scope.rowObservedAtMs || scope.rowObservedAtMs - at > PHONE_CLOCK_SKEW_MS)
    return {ok: false, code: 'PROVIDER_ADDRESS_TIME_UNVERIFIED'};
  if (typeof row.observedUrl !== 'string' || !row.observedUrl.startsWith('https://') ||
      row.observedUrl.length > 2048 || /[\\\u0000-\u0020\u007f]/.test(row.observedUrl))
    return {ok: false, code: 'PROVIDER_ADDRESS_INVALID'};
  let url; try { url = new URL(row.observedUrl); } catch { return {ok: false, code: 'PROVIDER_ADDRESS_INVALID'}; }
  if (url.protocol !== 'https:' || url.hostname !== GEMINI || url.username || url.password || url.port ||
      !(url.pathname === '/app' || url.pathname.startsWith('/app/')))
    return {ok: false, code: 'PROVIDER_ADDRESS_NOT_GEMINI_APP'};
  return {ok: true, observedUrl: row.observedUrl, observedAtMs: at};
}

/**
 * Public inspection API. No caller target/label/carrier or OPEN receipt is
 * accepted. An absent RIGHT toolbar row remains a real capability gap even
 * when origin, empty-field metadata and issued arguments are otherwise sound.
 * Source facts in diagnostics are structural observations, not authentication.
 */
export function inspectJebiseoNativeScreen(input = {}) {
  const diagnostics = {snapshotDecoded: false, rightScopeMatched: false, displayMatched: false,
    timeWithinBounds: false, formObserved: false, formOriginMatchesGemini: false,
    discoveryMatchesSnapshot: false, nativeTargetCandidateSelected: false,
    issuedArgumentsParsed: false, providerAddressObserved: false, providerAddressMatched: false};
  const stop = code => Object.freeze({ok: false, code, authorityVerified: false,
    diagnostics: Object.freeze({...diagnostics})});
  if (!plain(input) || Object.keys(input).some(key => !['snapshot', 'discovery', 'operation', 'now'].includes(key)))
    return stop('NATIVE_INSPECTION_ARGUMENTS_INVALID');
  const {snapshot, discovery, operation, now = Date.now()} = input;
  if (!OPERATIONS.has(operation) || !finiteTime(now)) return stop('NATIVE_INSPECTION_ARGUMENTS_INVALID');
  const read = readJob(snapshot, 'agent_snapshot', now);
  if (!read.ok) return stop(read.code);
  const rows = read.payload;
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > MAX_ROWS || rows.some(row => !plain(row)))
    return stop('NATIVE_SNAPSHOT_ROWS_INVALID');
  diagnostics.snapshotDecoded = true;
  const scope = inspectScope(snapshot, rows, now);
  if (!scope.ok) return stop(scope.code);
  if (scope.observedAtMs > read.completedAtMs + PHONE_CLOCK_SKEW_MS ||
      scope.rowObservedAtMs > read.completedAtMs + PHONE_CLOCK_SKEW_MS)
    return stop('NATIVE_COMPLETION_ORDER_UNVERIFIED');
  Object.assign(diagnostics, {rightScopeMatched: true, displayMatched: true, timeWithinBounds: true});
  const hints = rows.filter(row => row.package === PROTOCOL && Object.hasOwn(row, 'guidedForm'));
  if (hints.length !== 1) return stop('NATIVE_FORM_PROTOCOL_AMBIGUOUS');
  const page = json(hints[0].guidedForm);
  if (!formPage(page, 'VISIBLE_ACCESSIBILITY_ONLY')) return stop('NATIVE_FORM_METADATA_UNVERIFIED');
  diagnostics.formObserved = true;
  diagnostics.formOriginMatchesGemini = page.origin === GEMINI;
  if (page.hasSensitiveFields !== false || page.fields.some(field => field.kind === 'SENSITIVE') ||
      snapshot.result.restricted === true ||
      snapshot.result.locked === true || snapshot.result.secureContext === true ||
      rows.some(row => [row.sensitive, row.restricted, row.locked, row.secureContext].some(value => value === true || value === 'true')))
    return stop('NATIVE_SENSITIVE_SCOPE');
  const selected = chooseTarget({snapshot, discovery, page, operation, now,
    completedAtMs: read.completedAtMs, observedAtMs: scope.rowObservedAtMs});
  diagnostics.selectionCode = selected.ok ? 'NATIVE_TARGET_ARGUMENTS_MATCHED' : selected.code;
  diagnostics.nativeTargetCandidateSelected = selected.ok && selected.nativeTarget !== null;
  diagnostics.issuedArgumentsParsed = selected.ok === true;
  diagnostics.discoveryMatchesSnapshot = operation === 'TYPE' && selected.ok === true;
  diagnostics.providerAddressObserved = rows.some(row => row.kind === 'browser_address_readback');
  const address = addressEvidence(rows, scope, now);
  if (!address.ok) return stop(address.code);
  diagnostics.providerAddressMatched = true;
  if (page.origin !== GEMINI) return stop('NATIVE_FORM_ORIGIN_MISMATCH');
  if (!selected.ok) return stop(selected.code);
  const evidence = Object.freeze({schema: 'jh.jebiseo-native-screen-candidate.v1', operation,
    provider: 'GEMINI', workPackage: scope.workPackage, windowId: scope.windowId,
    displayId: scope.displayId, chatWindowId: scope.chatWindowId,
    workBounds: scope.workBounds, chatBounds: scope.chatBounds,
    observedAtMs: scope.observedAtMs, snapshotCompletedAtMs: read.completedAtMs,
    addressObservedAtMs: address.observedAtMs, observedUrl: address.observedUrl,
    origin: page.origin, formRevision: page.revision, nativeTarget: selected.nativeTarget,
    issuedArguments: selected.resolved.issuedArguments, identity: selected.resolved.identity,
    ...(operation === 'TYPE' ? {discoveryRevision: selected.discoveryRevision,
      discoveryCompletedAtMs: selected.discoveryCompletedAtMs} : {})});
  return Object.freeze({ok: true, code: 'NATIVE_SCREEN_PROOF_CANDIDATE', authorityVerified: false,
    diagnostics: Object.freeze({...diagnostics}), evidence});
}

/**
 * Structural post-action observation only. The original host authenticates the
 * private before/after records and proves an independent job after the effect.
 * This parser does not prove that TYPE wrote the requested value or that a
 * notice was dismissed. Original filled metadata and a visible button list
 * cannot settle an effect; no raw values, identifiers or addresses are returned.
 */
export function inspectJebiseoPostActionObservation(input = {}) {
  const stop = (code, observationValidated = false, facts = null) => Object.freeze({
    ok: false, code, authorityVerified: false, readbackRequired: true,
    currentValueVerified: false, noticeDismissedVerified: false, observationValidated,
    ...(facts === null ? {} : {facts: Object.freeze(facts)})
  });
  if (!plain(input) || Object.keys(input).some(key =>
    !['operation', 'beforeEvidence', 'afterSnapshot', 'now'].includes(key)))
    return stop('NATIVE_POST_ARGUMENTS_INVALID');
  const {operation, beforeEvidence: before, afterSnapshot, now = Date.now()} = input;
  if (!['TYPE', 'DISMISS_NOTICE'].includes(operation) || !finiteTime(now))
    return stop('NATIVE_POST_ARGUMENTS_INVALID');

  // Validate the existing candidate shape and its exact issued-carrier join.
  // This is structural consistency, never proof of who supplied the candidate.
  const numericId = value => Number.isSafeInteger(value) && value >= 0 && value <= 9999999999;
  const bounds = value => Array.isArray(value) && value.length === 4 && value.every(Number.isSafeInteger)
    ? rect(value.join(','), ',') : null;
  if (!plain(before) || before.schema !== 'jh.jebiseo-native-screen-candidate.v1' ||
      before.operation !== operation || before.provider !== 'GEMINI' || before.workPackage !== CHROME ||
      before.origin !== GEMINI || !numericId(before.windowId) || !numericId(before.displayId) ||
      !numericId(before.chatWindowId) || before.chatWindowId === before.windowId ||
      !bounds(before.workBounds) || !bounds(before.chatBounds) ||
      typeof before.formRevision !== 'string' || !HEX64.test(before.formRevision) ||
      typeof before.observedUrl !== 'string' || before.observedUrl.length > 2048 ||
      !finiteTime(before.snapshotCompletedAtMs) || before.snapshotCompletedAtMs > now ||
      !finiteTime(before.observedAtMs) || !finiteTime(before.addressObservedAtMs) ||
      before.observedAtMs > before.snapshotCompletedAtMs + PHONE_CLOCK_SKEW_MS ||
      before.addressObservedAtMs > before.observedAtMs ||
      !plain(before.nativeTarget) || !plain(before.identity) || !plain(before.issuedArguments))
    return stop('NATIVE_POST_BEFORE_EVIDENCE_INVALID');
  const target = before.nativeTarget;
  const prepared = prepareJebiseoGuidedCall({operation, issuedArguments: before.issuedArguments,
    // Validate TYPE's original placeholder without inventing/returning a prompt.
    ...(operation === 'TYPE' ? {text: before.issuedArguments.value} : {})});
  const identityKeys = ['session', 'requestId', 'operation', 'fieldId', 'option'];
  if (!prepared.ok || Object.keys(before.identity).length !== identityKeys.length ||
      identityKeys.some(key => before.identity[key] !== prepared.identity[key]) ||
      typeof target.fieldId !== 'string' || !FIELD.test(target.fieldId) ||
      target.fieldId !== prepared.identity.fieldId)
    return stop('NATIVE_POST_BEFORE_EVIDENCE_INVALID');
  if (operation === 'TYPE' ? target.purpose !== 'GEMINI_PROMPT' || target.kind !== 'TEXT' ||
      !PROMPT_LABELS.has(target.label) || target.enabled !== true || target.ambiguous !== false ||
      !LABEL_SOURCES.has(target.labelSource) :
      target.purpose !== 'DISMISS_NOTICE' || target.label !== '주의사항 닫기' || target.approvalRequired !== false)
    return stop('NATIVE_POST_BEFORE_EVIDENCE_INVALID');

  const read = readJob(afterSnapshot, 'agent_snapshot', now);
  if (!read.ok) return stop(read.code);
  const startedAtMs = afterSnapshot.startedAtMs;
  if (!finiteTime(startedAtMs) || startedAtMs > read.completedAtMs)
    return stop('NATIVE_POST_JOB_TIME_UNVERIFIED');
  const rows = read.payload;
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > MAX_ROWS || rows.some(row => !plain(row)))
    return stop('NATIVE_SNAPSHOT_ROWS_INVALID');
  const scope = inspectScope(afterSnapshot, rows, now);
  if (!scope.ok) return stop(scope.code);
  if (scope.observedAtMs > read.completedAtMs + PHONE_CLOCK_SKEW_MS ||
      scope.rowObservedAtMs > read.completedAtMs + PHONE_CLOCK_SKEW_MS)
    return stop('NATIVE_COMPLETION_ORDER_UNVERIFIED');
  if (scope.windowId !== before.windowId || scope.displayId !== before.displayId ||
      scope.chatWindowId !== before.chatWindowId ||
      !sameRect(scope.workBounds, bounds(before.workBounds)) ||
      !sameRect(scope.chatBounds, bounds(before.chatBounds)))
    return stop('NATIVE_POST_SCOPE_CHANGED');
  // A new server job cannot launder stale native rows. The existing five-
  // second phone/server tolerance is the only allowance; host invocation and
  // effect-completion ordering remain independently required by the binding.
  if (read.completedAtMs < before.snapshotCompletedAtMs ||
      scope.observedAtMs + PHONE_CLOCK_SKEW_MS < startedAtMs ||
      scope.rowObservedAtMs + PHONE_CLOCK_SKEW_MS < startedAtMs ||
      scope.observedAtMs + PHONE_CLOCK_SKEW_MS < before.observedAtMs ||
      scope.rowObservedAtMs + PHONE_CLOCK_SKEW_MS < before.observedAtMs)
    return stop('NATIVE_POST_OBSERVATION_ORDER_UNVERIFIED');
  const hints = rows.filter(row => row.package === PROTOCOL && Object.hasOwn(row, 'guidedForm'));
  if (hints.length !== 1) return stop('NATIVE_FORM_PROTOCOL_AMBIGUOUS');
  const page = json(hints[0].guidedForm);
  if (!formPage(page, 'VISIBLE_ACCESSIBILITY_ONLY')) return stop('NATIVE_FORM_METADATA_UNVERIFIED');
  if (page.hasSensitiveFields !== false || page.fields.some(field => field.kind === 'SENSITIVE') ||
      afterSnapshot.result.restricted === true || afterSnapshot.result.locked === true ||
      afterSnapshot.result.secureContext === true ||
      rows.some(row => [row.sensitive, row.restricted, row.locked, row.secureContext]
        .some(value => value === true || value === 'true')))
    return stop('NATIVE_SENSITIVE_SCOPE');
  if (page.siteErrors.length) return stop('NATIVE_FORM_ERRORS_UNRESOLVED');
  const address = addressEvidence(rows, scope, now);
  if (!address.ok) return stop(address.code);
  if (page.origin !== before.origin) return stop('NATIVE_FORM_ORIGIN_MISMATCH');
  if (address.observedUrl !== before.observedUrl) return stop('NATIVE_POST_DOCUMENT_CHANGED');
  if (address.observedAtMs + PHONE_CLOCK_SKEW_MS < startedAtMs ||
      address.observedAtMs + PHONE_CLOCK_SKEW_MS < before.addressObservedAtMs)
    return stop('NATIVE_POST_OBSERVATION_ORDER_UNVERIFIED');
  const issuer = resolveJebiseoGuidedArguments({operation: 'DISCOVER_INPUT', snapshot: afterSnapshot});
  if (!issuer.ok) return stop(issuer.code);
  if (issuer.identity.session !== before.identity.session) return stop('NATIVE_ISSUER_SESSION_CHANGED');
  const facts = {scopeMatched: true, providerAddressMatched: true, issuerSessionMatched: true,
    originMatched: true, visibleScopeOnly: true, formRevisionChanged: page.revision !== before.formRevision};

  if (operation === 'TYPE') {
    const fields = page.fields.filter(field => field.fieldId === target.fieldId);
    if (fields.length !== 1) return stop('NATIVE_GEMINI_EDITOR_UNVERIFIED');
    const field = fields[0];
    if (field.label !== target.label || field.kind !== target.kind || field.enabled !== true ||
        field.labelSource !== target.labelSource || field.ambiguous !== false ||
        field.error !== '' || !LABEL_SOURCES.has(field.labelSource))
      return stop('NATIVE_GEMINI_EDITOR_UNVERIFIED');
    // Do not call the pre-action TYPE selector: filled may now be true and the
    // page revision may change. Neither fact establishes the requested value.
    return stop('NATIVE_POST_TYPE_VALUE_UNVERIFIED', true,
      {...facts, targetFieldMatched: true, targetFieldFilled: field.filled});
  }
  const exact = page.buttons.find(button => button.targetId === target.fieldId);
  const labelled = page.buttons.filter(button => button.label === target.label);
  if (labelled.length > 1) return stop('NATIVE_NOTICE_TARGET_AMBIGUOUS');
  if (page.fields.some(field => field.fieldId === target.fieldId) ||
      (exact && (exact.label !== target.label || exact.approvalRequired !== false ||
        Object.hasOwn(exact, 'prepareToolArguments'))))
    return stop('NATIVE_NOTICE_PURPOSE_UNVERIFIED');
  // Absence is limited to this visible list. It is not a closed-dialog state.
  return stop('NATIVE_POST_NOTICE_STATE_UNVERIFIED', true,
    {...facts, noticeTargetVisible: exact !== undefined, noticeExplicitLabelVisible: labelled.length === 1});
}
