/**
 * Parse the EXISTING Android FormTransport / GuidedForms / Form15Addon contract.
 * Inputs are decoded original job views, not page text or arbitrary MCP replies.
 * The caller must obtain them from fresh signed results on the same Gemini
 * device/command/window. Parsing does not verify that authority or freshness.
 *
 * These pure helpers neither call a tool nor create an issuer session, request,
 * target ID, command, approval or journal. Returned arguments and identities are
 * private host data; do not put their live values in public reports or fixtures.
 */
const MARKER = '__JH_FORM_V1__';
// FormTransport.session and its reset() use UUID.randomUUID().toString().
const SESSION = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
// These two expressions are the original FormTransport.route() grammar.
const REQUEST = /^[A-Za-z0-9_-]{8,80}$/;
const FIELD = /^f_[0-9a-f]{24}$/;
const PROTOCOL_PACKAGE = 'com.koreanlifehub.bridge.protocol';
const OPERATIONS = Object.freeze({
  DISCOVER_INPUT: 'form15_discover',
  TYPE: 'form15_type',
  DISMISS_NOTICE: 'form_activate'
});
// A deliberately bounded dismissal vocabulary, not a general safe-button rule.
// Even a matching label still requires original metadata and host target proof.
const DISMISS_ONLY_LABELS = new Set(['닫기', '주의사항 닫기', 'Close', 'Dismiss']);
const plain = value => value !== null && typeof value === 'object' &&
  !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const matches = (pattern, value) => typeof value === 'string' && pattern.test(value);
const supported = operation => Object.hasOwn(OPERATIONS, operation);
const reject = code => Object.freeze({ok: false, code, authorityVerified: false});
const exactArguments = value => plain(value) && Object.keys(value).length === 3 &&
  ['action', 'text', 'value'].every(key => Object.hasOwn(value, key));
const copyArguments = value => Object.freeze({action: value.action, text: value.text, value: value.value});

function json(value) {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > 2 * 1024 * 1024) return null;
  try { return JSON.parse(value); } catch { return null; }
}

function completedPayload(job, type) {
  if (!plain(job) || job.type !== type || job.status !== 'complete' ||
      (job.error !== undefined && job.error !== null) ||
      !plain(job.result) || job.result.ok !== true) return null;
  // BridgeService.complete() places the one original JSON result in result.url.
  return json(job.result.url);
}

function issuedCarrier(operation, args) {
  if (!supported(operation)) return reject('JEBISEO_GUIDED_OPERATION_UNSUPPORTED');
  if (!exactArguments(args) || args.action !== 'set_text' ||
      typeof args.text !== 'string' || args.text.length > 512 ||
      typeof args.value !== 'string' || args.value.length > 16000)
    return reject('JEBISEO_GUIDED_CARRIER_INVALID');
  const parts = args.text.split('|');
  if (parts.length !== 6 || parts[0] !== MARKER ||
      !matches(SESSION, parts[1]) || !matches(REQUEST, parts[2]))
    return reject('JEBISEO_GUIDED_CARRIER_INVALID');
  const [, session, requestId, formOperation, fieldId, option] = parts;
  if (formOperation !== OPERATIONS[operation]) return reject('JEBISEO_GUIDED_OPERATION_MISMATCH');
  if (operation === 'DISCOVER_INPUT') {
    if (fieldId !== '' || option !== '' || args.value !== '')
      return reject('JEBISEO_GUIDED_DISCOVERY_SCOPE_INVALID');
  } else {
    if (!matches(FIELD, fieldId)) return reject('JEBISEO_GUIDED_FIELD_ID_INVALID');
    if (operation === 'TYPE' && (option !== '' || args.value !== '<값>'))
      return reject('JEBISEO_GUIDED_TYPE_ISSUER_ARGUMENTS_REQUIRED');
    if (operation === 'DISMISS_NOTICE' && (option !== 'visible-only' || args.value !== ''))
      return reject('JEBISEO_GUIDED_DISMISS_SCOPE_INVALID');
  }
  return {ok: true, identity: Object.freeze({session, requestId,
    operation: formOperation, fieldId, option})};
}

function snapshotProtocol(snapshot) {
  const rows = completedPayload(snapshot, 'agent_snapshot');
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 3000 || rows.some(row => !plain(row)))
    return reject('JEBISEO_GUIDED_SNAPSHOT_INVALID');
  const hints = rows.filter(row => row.package === PROTOCOL_PACKAGE && Object.hasOwn(row, 'guidedForm'));
  if (hints.length !== 1) return reject('JEBISEO_GUIDED_PROTOCOL_AMBIGUOUS');
  const page = json(hints[0].guidedForm);
  if (!plain(page) || page.ok !== true || page.code !== 'form_scanned' ||
      page.coverage !== 'VISIBLE_ACCESSIBILITY_ONLY')
    return reject('JEBISEO_GUIDED_SNAPSHOT_UNAVAILABLE');
  return {ok: true, row: hints[0], page};
}

function resolved(operation, args, expectedFieldId) {
  const checked = issuedCarrier(operation, args);
  if (!checked.ok) return checked;
  if (expectedFieldId !== undefined && checked.identity.fieldId !== expectedFieldId)
    return reject('JEBISEO_GUIDED_TARGET_MISMATCH');
  return Object.freeze({ok: true, code: 'JEBISEO_GUIDED_ARGUMENTS_RESOLVED',
    issuedArguments: copyArguments(args), identity: checked.identity, authorityVerified: false});
}

/**
 * Extract only native-issued arguments from the exact original payload shape.
 * `fieldId` is the FormTransport f_ ID. A Mobile13 item_ reference is NOT that
 * ID and is never converted or used to guess a field. The trusted host producer
 * selects the native field from original current screen evidence, then binds
 * that exact ID and issued carrier to the Gemini target and current draft.
 */
export function resolveJebiseoGuidedArguments(input = {}) {
  if (!plain(input)) return reject('JEBISEO_GUIDED_ARGUMENTS_REQUIRED');
  const {operation, snapshot, discovery, fieldId, targetLabel} = input;
  if (!supported(operation)) return reject('JEBISEO_GUIDED_OPERATION_UNSUPPORTED');
  if (Object.hasOwn(input, 'targetItemRef'))
    return reject('JEBISEO_GUIDED_WEB_ITEM_MAPPING_UNAVAILABLE');
  if (fieldId !== undefined && !matches(FIELD, fieldId))
    return reject('JEBISEO_GUIDED_FIELD_ID_INVALID');
  if (targetLabel !== undefined && (typeof targetLabel !== 'string' || !targetLabel || targetLabel.includes('\0')))
    return reject('JEBISEO_GUIDED_TARGET_LABEL_INVALID');

  if (operation === 'TYPE') {
    if (!matches(FIELD, fieldId)) return reject('JEBISEO_GUIDED_FIELD_ID_REQUIRED');
    const page = completedPayload(discovery, 'agent_step');
    if (!plain(page) || page.ok !== true || page.code !== 'form_scanned' ||
        page.feature !== 'input_selection_15' || page.coverage !== 'VISIBLE_ONLY' ||
        !Array.isArray(page.fields) || page.fields.some(field => !plain(field)) ||
        !plain(page.form15ToolArguments) || !Array.isArray(page.form15ToolArguments.fields) ||
        page.form15ToolArguments.fields.some(field => !plain(field)))
      return reject('JEBISEO_GUIDED_DISCOVERY_INVALID');
    const fields = page.fields.filter(field => field.fieldId === fieldId);
    const writes = page.form15ToolArguments.fields.filter(field => field.fieldId === fieldId);
    if (fields.length !== 1 || writes.length !== 1)
      return reject('JEBISEO_GUIDED_FIELD_AMBIGUOUS');
    const field = fields[0], write = writes[0];
    if (field.kind !== 'TEXT' || field.enabled !== true || field.ambiguous !== false ||
        field.filled !== false || (field.error !== undefined && field.error !== null && field.error !== '') ||
        write.kind !== 'TEXT' ||
        typeof field.label !== 'string' || !field.label)
      return reject('JEBISEO_GUIDED_FIELD_NOT_WRITABLE');
    if (targetLabel !== undefined && field.label !== targetLabel)
      return reject('JEBISEO_GUIDED_TARGET_MISMATCH');
    return resolved(operation, write.write, fieldId);
  }

  const protocol = snapshotProtocol(snapshot);
  if (!protocol.ok) return protocol;
  if (operation === 'DISCOVER_INPUT') {
    if (fieldId !== undefined || targetLabel !== undefined)
      return reject('JEBISEO_GUIDED_DISCOVERY_SCOPE_INVALID');
    return resolved(operation, json(protocol.row.inputSelection15ToolArguments));
  }

  if (fieldId === undefined && targetLabel === undefined)
    return reject('JEBISEO_GUIDED_DISMISS_TARGET_REQUIRED');
  const buttons = protocol.page.buttons;
  if (!Array.isArray(buttons) || buttons.some(button => !plain(button)))
    return reject('JEBISEO_GUIDED_BUTTONS_INVALID');
  const selected = buttons.filter(button =>
    (fieldId === undefined || button.targetId === fieldId) &&
    (targetLabel === undefined || button.label === targetLabel));
  if (selected.length !== 1) return reject('JEBISEO_GUIDED_DISMISS_TARGET_AMBIGUOUS');
  const button = selected[0];
  if (!matches(FIELD, button.targetId) || !DISMISS_ONLY_LABELS.has(button.label) || button.approvalRequired !== false ||
      Object.hasOwn(button, 'prepareToolArguments'))
    return reject('JEBISEO_GUIDED_DISMISS_ONLY_REQUIRED');
  return resolved(operation, button.activateToolArguments, button.targetId);
}

/**
 * Validate a native carrier again immediately before the host calls its fixed
 * original life_android_step route. TYPE replaces ONLY the issued placeholder
 * value; the selector is preserved byte for byte. No command_id is added here.
 * For DISMISS_NOTICE, structural preparation is NOT proof of a safe dismissal:
 * the host must attest the exact original button selected by resolve above.
 */
export function prepareJebiseoGuidedCall(input = {}) {
  if (!plain(input)) return reject('JEBISEO_GUIDED_ARGUMENTS_REQUIRED');
  const {operation, issuedArguments, text} = input;
  const checked = issuedCarrier(operation, issuedArguments);
  if (!checked.ok) return checked;
  if (operation === 'TYPE') {
    if (typeof text !== 'string' || !text || text.includes('\0') ||
        [...text].length > 1200 || Buffer.byteLength(text, 'utf8') > 2048)
      return reject('JEBISEO_SHARED_PHONE_TEXT_LIMIT');
  } else if (text !== undefined) {
    return reject('JEBISEO_GUIDED_NON_INPUT_VALUE_FORBIDDEN');
  }
  const args = copyArguments({...issuedArguments, value: operation === 'TYPE' ? text : issuedArguments.value});
  return Object.freeze({ok: true, code: 'JEBISEO_GUIDED_CALL_PREPARED',
    arguments: args, identity: checked.identity, authorityVerified: false});
}
