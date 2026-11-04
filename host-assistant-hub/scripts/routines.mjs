import { createHash } from 'node:crypto';

/** Pure routine definitions and plans. No network, filesystem, model or tool execution.
 * Host-provided source/capability references are checked for consistency, not authenticity.
 * The authenticated host must validate the source task store before passing sourceTask.
 */
const SCHEMA = 'jh.assistant-routines.v1';
const LIMIT = { routines: 256, receipts: 2048, steps: 32, parameters: 64, bytes: 2_097_152 };
const DANGEROUS = new Set(['__proto__', 'constructor', 'prototype']);
const PRIVATE_TOKENS = new Set(['password', 'passwd', 'secret', 'token', 'otp', 'pin', 'cvc', 'cvv', 'cookie', 'credential', 'credentials', 'authorization', 'approval', 'grant', 'keystore', 'privatekey', 'command', 'session', 'auth', 'bearer', 'signature']);
const VOLATILE_TOKENS = new Set(['date', 'day', 'today', 'tomorrow', 'time', 'timestamp', 'price', 'cost', 'amount', 'address', 'location', 'latitude', 'longitude', 'lat', 'lon', 'expiry', 'expiration']);
const DEFINITION_KEYS = ['persistenceIntent', 'scope', 'title', 'lead', 'helpers', 'steps', 'parameters', 'defaults', 'outputFormat', 'sourceTaskId', 'sourceEvidenceRefs', 'definitionSource'];

export class RoutineError extends Error {
  constructor(code, message) { super(message); this.name = 'RoutineError'; this.code = code; }
}
const fail = (code, message) => { throw new RoutineError(code, message); };
const has = (object, key) => Object.hasOwn(object, key);
const clone = value => structuredClone(value);

function plain(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('INVALID_OBJECT', `${label} must be a plain object`);
  return value;
}
function safeJson(value) {
  const stack = new WeakSet(); let nodes = 0;
  function walk(v, depth) {
    if (++nodes > 100_000 || depth > 20) fail('INPUT_LIMIT', 'JSON structure is too large');
    if (v === null || typeof v === 'boolean') return;
    if (typeof v === 'string') { if (v.length > 16_384) fail('INPUT_LIMIT', 'Text field exceeds its limit'); return; }
    if (typeof v === 'number' && Number.isFinite(v)) return;
    if (typeof v !== 'object') fail('INVALID_JSON', 'Only finite JSON values are supported');
    if (stack.has(v)) fail('INVALID_JSON', 'Cyclic data is not supported');
    stack.add(v);
    if (Array.isArray(v)) for (const entry of v) walk(entry, depth + 1);
    else {
      plain(v, 'JSON value');
      for (const [key, entry] of Object.entries(v)) {
        if (DANGEROUS.has(key)) fail('UNSAFE_KEY', 'Unsafe object key');
        walk(entry, depth + 1);
      }
    }
    stack.delete(v);
  }
  walk(value, 0);
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > LIMIT.bytes) fail('INPUT_LIMIT', 'JSON payload exceeds its byte budget');
}
function text(value, label, max = 512) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) fail('INVALID_TEXT', `${label} must be nonempty bounded text`);
  return value;
}
function identifier(value, label) {
  text(value, label, 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value) || DANGEROUS.has(value)) fail('INVALID_ID', `${label} is not a valid identifier`);
  return value;
}
function integer(value, label, min = 0) {
  if (!Number.isSafeInteger(value) || value < min) fail('INVALID_REVISION', `${label} must be a safe nonnegative integer`);
}
function timestamp(value, label) {
  text(value, label, 48);
  if (!/^\d{4}-\d{2}-\d{2}T\d\d:\d\d:\d\d(?:\.\d{1,9})?(?:Z|[+-]\d\d:\d\d)$/u.test(value) || !Number.isFinite(Date.parse(value))) fail('INVALID_TIME', `${label} must be an ISO timestamp with a timezone`);
}
function keys(object, allowed, label) {
  plain(object, label);
  if (Object.keys(object).some(key => !allowed.includes(key))) fail('UNKNOWN_FIELD', `${label} contains an unsupported field`);
}
function strings(value, label, max = 64, validator = identifier) {
  if (!Array.isArray(value) || value.length > max) fail('INVALID_LIST', `${label} must be a bounded array`);
  value.forEach(item => validator(item, label));
  if (new Set(value).size !== value.length) fail('DUPLICATE_VALUE', `${label} must not contain duplicates`);
  return value;
}
function refs(value, label) { strings(value, label, 64, text); if (!value.length) fail('EVIDENCE_REQUIRED', `${label} must include actual source references`); }
function scope(value) {
  keys(value, ['topic', 'project', 'aspect'], 'scope'); text(value.topic, 'scope.topic', 128);
  for (const name of ['project', 'aspect']) if (has(value, name)) text(value[name], `scope.${name}`, 128);
  return value;
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
const same = (left, right) => canonical(left) === canonical(right);
const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
function tokens(name) { return name.replace(/([a-z0-9])([A-Z])/gu, '$1_$2').toLowerCase().split(/[^a-z0-9]+/u); }
function privateName(name) {
  const parts = tokens(name);
  return parts.some(token => PRIVATE_TOKENS.has(token)) || ['apikey', 'accesskey', 'privatekey', 'authorizeexecution', 'authorizesexecution'].includes(parts.join(''));
}
function meaningful(value) {
  return value !== null && (typeof value !== 'string' || value.trim().length > 0) && (!Array.isArray(value) || value.length > 0) && (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 0);
}
function parameterName(value) {
  text(value, 'parameter name', 64);
  if (!/^[A-Za-z][A-Za-z0-9_]*$/u.test(value) || DANGEROUS.has(value)) fail('INVALID_PARAMETER', 'Parameter names must be simple identifiers');
  if (privateName(value)) fail('PRIVATE_PARAMETER', 'Credentials and execution authority must not be routine parameters');
}
function checkValues(object, parameters, { defaults = false } = {}) {
  plain(object, defaults ? 'defaults' : 'values');
  const parameterMap = new Map(parameters.map(p => [p.name, p]));
  for (const [name, value] of Object.entries(object)) {
    parameterName(name);
    const parameter = parameterMap.get(name);
    if (!parameter) fail('UNKNOWN_PARAMETER', 'Value does not have a declared parameter');
    if (defaults && parameter.dynamic) fail('DYNAMIC_DEFAULT', 'Fresh task data cannot be saved as a routine default');
    if (defaults && !meaningful(value)) fail('EMPTY_VALUE', 'Remove a missing default instead of saving an empty value');
    // Nested input references may be useful, but never retain credentials/grants inside them.
    const inspect = v => {
      if (!v || typeof v !== 'object') return;
      if (Array.isArray(v)) return v.forEach(inspect);
      for (const [key, entry] of Object.entries(v)) {
        if (privateName(key)) fail('PRIVATE_PARAMETER', 'Credentials and execution authority must not be routine values');
        inspect(entry);
      }
    };
    inspect(value);
    if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 32_768) fail('INPUT_LIMIT', 'Routine parameter value is too large');
  }
}
function catalog(value, label) {
  if (!Array.isArray(value) || !value.length) fail('CATALOG_REQUIRED', `${label} must contain actual capability IDs`);
  strings(value, label, 256); return new Set(value);
}
function capabilityIds(definition) { return [...new Set([definition.lead, ...definition.helpers, ...definition.steps.map(step => step.capability)])]; }
function orderSteps(steps) {
  const byId = new Map(steps.map(step => [step.id, step]));
  const visited = new Set(); const visiting = new Set(); const result = [];
  const visit = step => {
    if (visited.has(step.id)) return;
    if (visiting.has(step.id)) fail('CYCLIC_STEPS', 'Routine step dependencies contain a cycle');
    visiting.add(step.id);
    for (const dep of step.dependsOn) {
      if (!byId.has(dep)) fail('UNKNOWN_STEP', 'Step dependency does not exist');
      visit(byId.get(dep));
    }
    visiting.delete(step.id); visited.add(step.id); result.push(step);
  };
  steps.forEach(visit);
  return result;
}
function validateDefinition(definition, knownCapabilities) {
  scope(definition.scope); text(definition.title, 'title', 200); identifier(definition.lead, 'lead');
  strings(definition.helpers, 'helpers', 16);
  if (definition.helpers.includes(definition.lead)) fail('DUPLICATE_ROLE', 'Lead must not also appear in helpers');
  text(definition.outputFormat, 'outputFormat', 2_048);
  if (!Array.isArray(definition.parameters) || definition.parameters.length > LIMIT.parameters) fail('INVALID_PARAMETERS', 'Parameters must be a bounded array');
  const parameterNames = new Set();
  for (const p of definition.parameters) {
    keys(p, ['name', 'required', 'dynamic', 'description'], 'parameter'); parameterName(p.name);
    if (parameterNames.has(p.name)) fail('DUPLICATE_PARAMETER', 'Parameter names must be unique');
    parameterNames.add(p.name);
    if (typeof p.required !== 'boolean' || typeof p.dynamic !== 'boolean') fail('INVALID_PARAMETER', 'required and dynamic must be booleans');
    if (has(p, 'description')) text(p.description, 'parameter description', 512);
    if (tokens(p.name).some(token => VOLATILE_TOKENS.has(token)) && !p.dynamic) fail('DYNAMIC_PARAMETER_REQUIRED', 'Time, price and address fields require current task input');
  }
  checkValues(definition.defaults, definition.parameters, { defaults: true });
  if (!Array.isArray(definition.steps) || !definition.steps.length || definition.steps.length > LIMIT.steps) fail('INVALID_STEPS', 'A routine needs a bounded nonempty step list');
  const stepIds = new Set(); const producer = new Map();
  for (const step of definition.steps) {
    keys(step, ['id', 'capability', 'dependsOn', 'requiredInputs', 'produces', 'instruction'], 'step');
    identifier(step.id, 'step.id'); identifier(step.capability, 'step.capability');
    if (stepIds.has(step.id)) fail('DUPLICATE_STEP', 'Step IDs must be unique');
    stepIds.add(step.id);
    strings(step.dependsOn, 'dependsOn', LIMIT.steps);
    strings(step.requiredInputs, 'requiredInputs', LIMIT.parameters, parameterName);
    strings(step.produces, 'produces', LIMIT.parameters, parameterName);
    text(step.instruction, 'step instruction', 4_096);
    for (const output of step.produces) {
      if (producer.has(output) || parameterNames.has(output)) fail('AMBIGUOUS_BINDING', 'Each output needs one producer and cannot shadow a parameter');
      producer.set(output, step.id);
    }
  }
  const ordered = orderSteps(definition.steps); const ancestors = new Map();
  for (const step of ordered) {
    const prior = new Set();
    for (const dep of step.dependsOn) { prior.add(dep); for (const ancestor of ancestors.get(dep)) prior.add(ancestor); }
    ancestors.set(step.id, prior);
    for (const input of step.requiredInputs) {
      if (parameterNames.has(input)) continue;
      if (!producer.has(input)) fail('UNKNOWN_INPUT', 'Every step input must be a parameter or an earlier output');
      if (!prior.has(producer.get(input))) fail('DEPENDENCY_REQUIRED', 'A step must depend on the step producing its input');
    }
  }
  if (knownCapabilities) for (const id of capabilityIds(definition)) if (!knownCapabilities.has(id)) fail('UNKNOWN_CAPABILITY', 'Routine references an unregistered capability');
  return { ordered, producer };
}
function validateRoutine(routine, id) {
  keys(routine, ['id', 'version', 'status', 'origin', 'verification', 'scope', 'title', 'lead', 'helpers', 'steps', 'parameters', 'defaults', 'outputFormat', 'source', 'createdAt', 'updatedAt', 'archivedAt'], 'routine');
  identifier(routine.id, 'routine.id'); if (routine.id !== id) fail('IDENTITY_MISMATCH', 'Routine key does not match its ID');
  integer(routine.version, 'routine version', 1);
  if (!['active', 'archived'].includes(routine.status)) fail('INVALID_STATUS', 'Unknown routine status');
  if (!['observed_procedure', 'explicit_design'].includes(routine.origin)) fail('INVALID_ORIGIN', 'Unknown routine origin');
  if (!['source_task_completed', 'not_run'].includes(routine.verification)) fail('INVALID_VERIFICATION', 'Unknown routine verification');
  if (routine.origin === 'explicit_design' && routine.verification !== 'not_run') fail('INVALID_VERIFICATION', 'An explicit design cannot claim observed success');
  timestamp(routine.createdAt, 'createdAt'); timestamp(routine.updatedAt, 'updatedAt');
  if (Date.parse(routine.updatedAt) < Date.parse(routine.createdAt)) fail('INVALID_TIME_ORDER', 'Routine timestamps are inconsistent');
  if (routine.status === 'archived') timestamp(routine.archivedAt, 'archivedAt');
  else if (has(routine, 'archivedAt')) fail('INVALID_STATUS', 'Active routine must not have archivedAt');
  keys(routine.source, ['taskId', 'evidenceRefs', 'requestRef', 'eventId', 'definitionSource'], 'source');
  refs(routine.source.evidenceRefs, 'source evidence'); text(routine.source.requestRef, 'requestRef'); identifier(routine.source.eventId, 'source eventId');
  if (routine.origin === 'observed_procedure') {
    identifier(routine.source.taskId, 'source taskId');
    if (routine.source.definitionSource !== 'completed_task') fail('INVALID_ORIGIN', 'Observed procedures need a completed task source');
  } else {
    if (routine.source.taskId !== null || routine.source.definitionSource !== 'user_requested_design' || !routine.source.evidenceRefs.includes(routine.source.requestRef)) fail('INVALID_ORIGIN', 'Design sources must cite the explicit request');
  }
  validateDefinition(routine);
}
function validateStore(state, expectedOwner) {
  safeJson(state);
  keys(state, ['schema', 'ownerScope', 'revision', 'createdAt', 'updatedAt', 'routines', 'receipts'], 'store');
  if (state.schema !== SCHEMA) fail('INVALID_SCHEMA', 'Unsupported routine store schema');
  text(state.ownerScope, 'ownerScope', 128);
  if (expectedOwner !== undefined && expectedOwner !== state.ownerScope) fail('OWNER_MISMATCH', 'Routine store belongs to another owner scope');
  integer(state.revision, 'revision'); timestamp(state.createdAt, 'createdAt'); timestamp(state.updatedAt, 'updatedAt');
  if (Date.parse(state.updatedAt) < Date.parse(state.createdAt)) fail('INVALID_TIME_ORDER', 'Store timestamps are inconsistent');
  plain(state.routines, 'routines'); plain(state.receipts, 'receipts');
  if (Object.keys(state.routines).length > LIMIT.routines || Object.keys(state.receipts).length > LIMIT.receipts) fail('STORE_LIMIT', 'Routine store reached its supported size');
  for (const [id, routine] of Object.entries(state.routines)) validateRoutine(routine, id);
  if (Object.keys(state.receipts).length !== state.revision) fail('INVALID_RECEIPT', 'Receipt history does not match the store revision');
  const revisions = new Set();
  for (const [eventId, receipt] of Object.entries(state.receipts)) {
    identifier(eventId, 'receipt eventId');
    keys(receipt, ['digest', 'revision', 'routineId', 'routineVersion', 'type', 'at', 'sourceRef'], 'receipt');
    if (!/^[0-9a-f]{64}$/u.test(receipt.digest)) fail('INVALID_RECEIPT', 'Invalid receipt digest');
    integer(receipt.revision, 'receipt revision', 1); integer(receipt.routineVersion, 'receipt routineVersion', 1);
    if (receipt.revision > state.revision || revisions.has(receipt.revision) || !has(state.routines, receipt.routineId) || receipt.routineVersion > state.routines[receipt.routineId].version) fail('INVALID_RECEIPT', 'Receipt references inconsistent state');
    revisions.add(receipt.revision);
    if (!['SAVE', 'COMPOSE', 'UPDATE_DEFAULTS', 'REMOVE_DEFAULT', 'ARCHIVE'].includes(receipt.type)) fail('INVALID_RECEIPT', 'Unsupported receipt type');
    timestamp(receipt.at, 'receipt at'); text(receipt.sourceRef, 'receipt sourceRef');
  }
  return state;
}

export function createRoutineStore({ ownerScope, at }) {
  text(ownerScope, 'ownerScope', 128); timestamp(at, 'at');
  return { schema: SCHEMA, ownerScope, revision: 0, createdAt: at, updatedAt: at, routines: {}, receipts: {} };
}
export function validateRoutineStore(state, { ownerScope } = {}) { return clone(validateStore(state, ownerScope)); }

function validateCompletedSource(sourceTask, payload, ownerScope) {
  if (!sourceTask) fail('SOURCE_TASK_REQUIRED', 'Saving an observed procedure requires the actual source task');
  safeJson(sourceTask); plain(sourceTask, 'sourceTask');
  if (sourceTask.ownerScope !== ownerScope) fail('OWNER_MISMATCH', 'Source task belongs to another owner scope');
  if (sourceTask.id !== payload.sourceTaskId) fail('SOURCE_TASK_MISMATCH', 'Source task ID does not match');
  if (sourceTask.status !== 'completed') fail('SOURCE_NOT_COMPLETED', 'Only completed tasks can supply observed procedures');
  plain(sourceTask.effects, 'sourceTask.effects');
  for (const effect of Object.values(sourceTask.effects)) {
    if (!effect || !['success', 'failed'].includes(effect.status)) fail('SOURCE_EFFECT_UNRESOLVED', 'Source task has unresolved external effects');
    refs(effect.evidenceRefs, 'source effect evidence');
  }
  refs(sourceTask.completionEvidenceRefs, 'source completion evidence');
  if (!payload.sourceEvidenceRefs.every(ref => sourceTask.completionEvidenceRefs.includes(ref))) fail('SOURCE_EVIDENCE_MISMATCH', 'Procedure evidence is not present in source completion evidence');
}
function requireEdit(routine, payload) {
  if (routine.status !== 'active') fail('ROUTINE_ARCHIVED', 'Archived routines cannot be changed or executed');
  integer(payload.expectedRoutineVersion, 'expectedRoutineVersion', 1);
  if (payload.expectedRoutineVersion !== routine.version) fail('ROUTINE_VERSION_CONFLICT', 'Routine version has changed');
  scope(payload.scope); if (!same(payload.scope, routine.scope)) fail('SCOPE_MISMATCH', 'Routine scope does not match');
}
function resultFor(state, event, receipt, applied) {
  return { eventId: event.eventId, routineId: event.routineId, applied, duplicate: !applied, revision: state.revision, appliedRevision: receipt.revision, routineVersion: state.routines[event.routineId].version, recordedRoutineVersion: receipt.routineVersion, stateChanged: applied, storeWriteRequired: applied, persistentStateChanged: false, authorizesExecution: false };
}

/** Mutations return a new JSON state. The host saves it using a guarded Library write. */
export function applyRoutineEvent(state, event, { catalogIds, sourceTask } = {}) {
  validateStore(state); safeJson(event);
  keys(event, ['eventId', 'expectedRevision', 'ownerScope', 'at', 'sourceRef', 'type', 'routineId', 'payload'], 'event');
  identifier(event.eventId, 'eventId'); identifier(event.routineId, 'routineId');
  text(event.ownerScope, 'ownerScope', 128); integer(event.expectedRevision, 'expectedRevision');
  timestamp(event.at, 'at'); text(event.sourceRef, 'sourceRef'); plain(event.payload, 'payload');
  if (event.ownerScope !== state.ownerScope) fail('OWNER_MISMATCH', 'Event belongs to another owner scope');
  const { expectedRevision: _ignored, ...identity } = event; const digest = hash(identity);
  if (has(state.receipts, event.eventId)) {
    const receipt = state.receipts[event.eventId];
    if (receipt.digest !== digest) fail('EVENT_CONFLICT', 'Event ID was already used for different content');
    return { state: clone(state), result: resultFor(state, event, receipt, false) };
  }
  if (event.expectedRevision !== state.revision) fail('REVISION_CONFLICT', 'Routine store revision has changed');
  if (Date.parse(event.at) < Date.parse(state.updatedAt)) fail('EVENT_TIME_REGRESSION', 'A new mutation cannot move the store time backwards');
  if (Object.keys(state.receipts).length >= LIMIT.receipts) fail('STORE_LIMIT', 'Receipt limit reached; preserve history and resolve maintenance before writing');
  const next = clone(state); const p = event.payload;
  if (event.type === 'SAVE' || event.type === 'COMPOSE') {
    keys(p, DEFINITION_KEYS, 'definition');
    if (p.persistenceIntent !== 'explicit_ongoing') fail('PERSISTENCE_INTENT_REQUIRED', 'An explicit ongoing-use request is required');
    if (has(next.routines, event.routineId)) fail('ROUTINE_EXISTS', 'Routine ID already exists');
    if (Object.keys(next.routines).length >= LIMIT.routines) fail('STORE_LIMIT', 'Routine limit reached');
    const known = catalog(catalogIds, 'catalogIds'); validateDefinition(p, known); refs(p.sourceEvidenceRefs, 'sourceEvidenceRefs');
    const observed = event.type === 'SAVE';
    if (observed) {
      identifier(p.sourceTaskId, 'sourceTaskId');
      if (has(p, 'definitionSource') && p.definitionSource !== 'completed_task') fail('INVALID_ORIGIN', 'SAVE uses a completed task source');
      validateCompletedSource(sourceTask, p, state.ownerScope);
    } else {
      if (p.definitionSource !== 'user_requested_design' || (has(p, 'sourceTaskId') && p.sourceTaskId !== null)) fail('INVALID_ORIGIN', 'COMPOSE needs an explicit design source without a completed task claim');
      if (!p.sourceEvidenceRefs.includes(event.sourceRef)) fail('SOURCE_EVIDENCE_MISMATCH', 'The design must cite its actual request reference');
    }
    next.routines[event.routineId] = {
      id: event.routineId, version: 1, status: 'active', origin: observed ? 'observed_procedure' : 'explicit_design', verification: observed ? 'source_task_completed' : 'not_run',
      scope: clone(p.scope), title: p.title, lead: p.lead, helpers: clone(p.helpers), steps: clone(p.steps), parameters: clone(p.parameters), defaults: clone(p.defaults), outputFormat: p.outputFormat,
      source: { taskId: observed ? p.sourceTaskId : null, evidenceRefs: clone(p.sourceEvidenceRefs), requestRef: event.sourceRef, eventId: event.eventId, definitionSource: observed ? 'completed_task' : 'user_requested_design' }, createdAt: event.at, updatedAt: event.at
    };
  } else {
    if (!has(next.routines, event.routineId)) fail('ROUTINE_NOT_FOUND', 'Routine does not exist');
    const routine = next.routines[event.routineId];
    if (event.type === 'UPDATE_DEFAULTS' || event.type === 'REMOVE_DEFAULT') {
      keys(p, event.type === 'UPDATE_DEFAULTS' ? ['persistenceIntent', 'expectedRoutineVersion', 'scope', 'changes', 'removeKeys'] : ['persistenceIntent', 'expectedRoutineVersion', 'scope', 'keys'], 'default edit');
      if (p.persistenceIntent !== 'explicit_ongoing') fail('PERSISTENCE_INTENT_REQUIRED', 'A one-off change must not modify saved defaults');
      requireEdit(routine, p);
      const changes = event.type === 'UPDATE_DEFAULTS' ? p.changes : {};
      const removals = event.type === 'UPDATE_DEFAULTS' ? (p.removeKeys ?? []) : p.keys;
      checkValues(changes, routine.parameters, { defaults: true }); strings(removals, 'removed keys', LIMIT.parameters, parameterName);
      if (!Object.keys(changes).length && !removals.length) fail('EMPTY_CHANGE', 'No default changes were provided');
      for (const key of removals) {
        if (!has(routine.defaults, key)) fail('DEFAULT_NOT_FOUND', 'Removed default does not exist');
        if (has(changes, key)) fail('CONFLICTING_CHANGE', 'A default cannot be changed and removed together');
        delete routine.defaults[key];
      }
      Object.assign(routine.defaults, clone(changes)); routine.verification = 'not_run';
    } else if (event.type === 'ARCHIVE') {
      keys(p, ['persistenceIntent', 'expectedRoutineVersion', 'scope'], 'archive');
      if (p.persistenceIntent !== 'explicit_archive') fail('PERSISTENCE_INTENT_REQUIRED', 'Archiving requires an explicit archive request');
      requireEdit(routine, p); routine.status = 'archived'; routine.archivedAt = event.at;
    } else fail('UNKNOWN_EVENT', 'Unsupported routine event');
    routine.version += 1; routine.updatedAt = event.at;
  }
  next.revision += 1; next.updatedAt = event.at;
  const receipt = { digest, revision: next.revision, routineId: event.routineId, routineVersion: next.routines[event.routineId].version, type: event.type, at: event.at, sourceRef: event.sourceRef };
  next.receipts[event.eventId] = receipt; validateStore(next, state.ownerScope);
  return { state: next, result: resultFor(next, event, receipt, true) };
}

export function getRoutine(state, id) {
  validateStore(state); identifier(id, 'routineId');
  if (!has(state.routines, id)) fail('ROUTINE_NOT_FOUND', 'Routine does not exist');
  return clone(state.routines[id]);
}
export function listRoutines(state, query = {}) {
  validateStore(state, query.ownerScope); safeJson(query);
  keys(query, ['ownerScope', 'scope', 'includeArchived', 'limit'], 'query');
  if (has(query, 'scope')) scope(query.scope);
  if (has(query, 'includeArchived') && typeof query.includeArchived !== 'boolean') fail('INVALID_QUERY', 'includeArchived must be boolean');
  const limit = query.limit ?? 20; integer(limit, 'limit', 1); if (limit > 100) fail('INPUT_LIMIT', 'List limit cannot exceed 100');
  const matches = Object.values(state.routines).filter(r => (query.includeArchived || r.status === 'active') && (!query.scope || same(query.scope, r.scope))).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.id.localeCompare(b.id));
  return { items: matches.slice(0, limit).map(r => ({ id: r.id, title: r.title, version: r.version, status: r.status, origin: r.origin, verification: r.verification, scope: clone(r.scope), lead: r.lead, helpers: clone(r.helpers), updatedAt: r.updatedAt })), total: matches.length, omitted: Math.max(0, matches.length - limit), authorizesExecution: false };
}

/** A temporary override only changes this returned plan, never the stored routine. */
export function instantiateRoutine(state, request) {
  safeJson(request);
  keys(request, ['routineId', 'ownerScope', 'scope', 'values', 'availableCapabilities', 'catalogIds'], 'request');
  text(request.ownerScope, 'ownerScope', 128); validateStore(state, request.ownerScope);
  scope(request.scope); identifier(request.routineId, 'routineId');
  const routine = getRoutine(state, request.routineId);
  if (routine.status !== 'active') fail('ROUTINE_ARCHIVED', 'Archived routines cannot be instantiated');
  if (!same(request.scope, routine.scope)) fail('SCOPE_MISMATCH', 'Routine scope does not match this task');
  const known = catalog(request.catalogIds, 'catalogIds');
  if (!Array.isArray(request.availableCapabilities)) fail('CAPABILITIES_REQUIRED', 'Current available capability IDs are required');
  strings(request.availableCapabilities, 'availableCapabilities', 256);
  const available = new Set(request.availableCapabilities);
  if ([...available].some(id => !known.has(id))) fail('UNKNOWN_CAPABILITY', 'Available capability is not in the current catalog');
  const { ordered, producer } = validateDefinition(routine, known); checkValues(request.values, routine.parameters);
  const parameters = {}; const parameterProvenance = {}; const missingInputs = [];
  const neededByStep = new Set(ordered.flatMap(step => step.requiredInputs));
  for (const p of routine.parameters) {
    if (has(request.values, p.name) && meaningful(request.values[p.name])) { parameters[p.name] = clone(request.values[p.name]); parameterProvenance[p.name] = 'current'; }
    else if (!has(request.values, p.name) && has(routine.defaults, p.name)) { parameters[p.name] = clone(routine.defaults[p.name]); parameterProvenance[p.name] = 'default'; }
    else {
      parameterProvenance[p.name] = p.dynamic ? 'dynamic_missing' : 'missing';
      if (p.required || neededByStep.has(p.name)) missingInputs.push(p.name);
    }
  }
  const unavailableCapabilities = capabilityIds(routine).filter(id => !available.has(id));
  const plan = ordered.map(step => ({
    id: step.id, capability: step.capability, instruction: step.instruction, dependsOn: clone(step.dependsOn), produces: clone(step.produces),
    inputs: step.requiredInputs.map(name => producer.has(name)
      ? { name, source: 'step_output', stepId: producer.get(name), available: false, status: 'awaiting_result' }
      : { name, source: has(parameters, name) ? 'parameter' : 'missing', available: has(parameters, name), provenance: parameterProvenance[name] })
  }));
  return { routineId: routine.id, routineVersion: routine.version, title: routine.title, origin: routine.origin, verification: routine.verification, scope: clone(routine.scope), lead: routine.lead, helpers: clone(routine.helpers), ready: missingInputs.length === 0 && unavailableCapabilities.length === 0, parameters, parameterProvenance, missingInputs, unavailableCapabilities, steps: plan, outputFormat: routine.outputFormat, authorizesExecution: false, executionPerformed: false, persistentStateChanged: false };
}
