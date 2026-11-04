/**
 * JH task-state ledger. The host interprets language and supplies observed events.
 * This module performs no IO, dispatch, authentication, or approval. Evidence
 * references are recorded claims whose authenticity must be checked by the host.
 * Mutations return {state, result}; the input state is never modified.
 */
import { createHash } from 'node:crypto';

export const TASKS_SCHEMA = 'jh.assistant-tasks.v1';
const MODES = new Set(['explain', 'assist', 'execute']);
const STATUSES = new Set(['active', 'awaiting_user', 'verifying', 'paused', 'canceled', 'completed']);
const EFFECT_STATUSES = new Set(['pending', 'unknown', 'success', 'failed']);
const TYPES = new Set(['START', 'CHECKPOINT', 'MENU', 'SELECT', 'CHANGE_CONDITIONS', 'SET_MODE', 'EFFECT_PENDING', 'EFFECT_RESULT', 'USER_REPORTED', 'PAUSE', 'RESUME', 'CANCEL', 'COMPLETE', 'ACTIVATE']);
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);
const SENSITIVE_KEY = /^(?:password|passwd|secret|token|access[_-]?token|refresh[_-]?token|api[_-]?key|authorization|cookie|otp|pin|private[_-]?key|approval[_-]?grant|command[_-]?id|request[_-]?id)$/i;
const own = (obj, key) => Object.hasOwn(obj, key);
const clone = value => JSON.parse(JSON.stringify(value));

function fail(code, message, path) {
  const error = new Error(message);
  error.code = code;
  if (path) error.path = path;
  throw error;
}

function object(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    fail('INVALID_OBJECT', `${path} must be a plain object`, path);
  }
  return value;
}

function fields(value, allowed, required, path) {
  object(value, path);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail('UNKNOWN_FIELD', `${path}.${key} is not supported`, `${path}.${key}`);
  for (const key of required) if (!own(value, key)) fail('MISSING_FIELD', `${path}.${key} is required`, `${path}.${key}`);
}

function string(value, path, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) {
    fail('INVALID_STRING', `${path} must be nonempty text of at most ${max} characters`, path);
  }
  return value;
}

function identifier(value, path) {
  string(value, path);
  if (FORBIDDEN.has(value) || /[\r\n\t]/u.test(value)) fail('INVALID_IDENTIFIER', `${path} is not a valid identifier`, path);
  return value;
}

function time(value, path) {
  string(value, path, 48);
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?(?:Z|[+-]\d\d:\d\d)$/u.test(value) || !Number.isFinite(Date.parse(value))) {
    fail('INVALID_TIME', `${path} must be an ISO timestamp with a timezone`, path);
  }
  return value;
}

function integer(value, path, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail('INVALID_INTEGER', `${path} is outside its allowed integer range`, path);
}

function enumValue(value, options, path) {
  if (!options.has(value)) fail('INVALID_VALUE', `${path} has an unsupported value`, path);
}

function array(value, path, max) {
  if (!Array.isArray(value) || value.length > max) fail('INVALID_ARRAY', `${path} must be an array of at most ${max} items`, path);
  return value;
}

function strings(value, path, maxItems = 32, maxLength = 500, nonempty = false) {
  array(value, path, maxItems);
  if (nonempty && value.length === 0) fail('EVIDENCE_REQUIRED', `${path} must contain evidence`, path);
  value.forEach((item, i) => string(item, `${path}[${i}]`, maxLength));
  if (new Set(value).size !== value.length) fail('DUPLICATE_ITEM', `${path} must contain unique items`, path);
  return value;
}

function optionalText(value, path) {
  if (value !== null) string(value, path, 2000);
}

// Check before cloning/stringifying: reject non-JSON values, accessors, dangerous
// keys, and credentials fields instead of silently dropping or executing them.
function jsonData(value, maxBytes = 2 * 1024 * 1024) {
  let nodes = 0;
  const ancestors = new Set();
  function walk(item, path, depth) {
    if (++nodes > 80000 || depth > 20) fail('DATA_LIMIT', 'JSON data is too large or too deeply nested', path);
    if (item === null || typeof item === 'boolean') return;
    if (typeof item === 'string') {
      if (item.length > 65536) fail('DATA_LIMIT', 'JSON string is too large', path);
      return;
    }
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) fail('INVALID_JSON', 'JSON numbers must be finite', path);
      return;
    }
    if (typeof item !== 'object') fail('INVALID_JSON', 'Only plain JSON data is accepted', path);
    if (ancestors.has(item)) fail('INVALID_JSON', 'Cyclic data is not accepted', path);
    ancestors.add(item);
    if (Array.isArray(item)) {
      if (item.length > 5000 || Object.keys(item).length !== item.length || Reflect.ownKeys(item).length !== item.length + 1) fail('INVALID_JSON', 'Arrays must be bounded, dense JSON arrays', path);
      for (let i = 0; i < item.length; i++) {
        const descriptor = Object.getOwnPropertyDescriptor(item, String(i));
        if (!descriptor || !own(descriptor, 'value')) fail('INVALID_JSON', 'Accessors are not accepted', path);
        walk(descriptor.value, `${path}[${i}]`, depth + 1);
      }
    } else {
      object(item, path);
      if (Reflect.ownKeys(item).length !== Object.keys(item).length) fail('INVALID_JSON', 'Hidden or symbolic fields are not accepted', path);
      if (Object.keys(item).length > 5000) fail('DATA_LIMIT', 'Too many object fields', path);
      for (const key of Object.keys(item)) {
        if (FORBIDDEN.has(key)) fail('UNSAFE_KEY', 'Prototype-related keys are not accepted', `${path}.${key}`);
        if (SENSITIVE_KEY.test(key)) fail('SENSITIVE_FIELD', 'Credentials, grants, and execution identifiers belong to their original protected store', `${path}.${key}`);
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        if (!descriptor || !own(descriptor, 'value')) fail('INVALID_JSON', 'Accessors are not accepted', `${path}.${key}`);
        walk(descriptor.value, `${path}.${key}`, depth + 1);
      }
    }
    ancestors.delete(item);
  }
  walk(value, '$', 0);
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > maxBytes) fail('DATA_LIMIT', 'JSON byte limit exceeded');
}

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}

function fingerprint(event) {
  const { expectedRevision, ...identity } = event;
  return createHash('sha256').update(canonical(identity)).digest('hex');
}

function scope(value, path) {
  fields(value, ['topic', 'project', 'aspect'], ['topic'], path);
  for (const key of Object.keys(value)) string(value[key], `${path}.${key}`, 200);
}

function routing(lead, helpers, path) {
  identifier(lead, `${path}.lead`);
  strings(helpers, `${path}.helpers`, 12, 200);
  helpers.forEach((v, i) => identifier(v, `${path}.helpers[${i}]`));
  if (helpers.includes(lead)) fail('DUPLICATE_ROLE', 'The lead must not also be a helper', path);
}

function choices(value, path) {
  array(value, path, 20);
  if (value.length === 0) fail('EMPTY_MENU', 'Menus must contain at least one choice', path);
  const ids = new Set();
  value.forEach((choice, i) => {
    const p = `${path}[${i}]`;
    fields(choice, ['id', 'label', 'value'], ['id', 'label', 'value'], p);
    identifier(choice.id, `${p}.id`);
    string(choice.label, `${p}.label`, 300);
    if (ids.has(choice.id)) fail('DUPLICATE_CHOICE', 'Menu choice IDs must be unique', p);
    ids.add(choice.id);
  });
}

function pendingIds(task) {
  return Object.values(task.effects).filter(effect => ['pending', 'unknown'].includes(effect.status)).map(effect => effect.id);
}

function isClosed(task) { return ['completed', 'canceled'].includes(task.status); }

function outcomeEvidence(refs, task) {
  const reported = new Set(task.userReports.map(report => report.sourceRef));
  if (!refs.some(ref => !/^(?:user|user_report|user-reported):/iu.test(ref) && !reported.has(ref))) {
    fail('EVIDENCE_NOT_VERIFIED', 'A user report alone cannot verify an external effect or task completion');
  }
}

// Partial condition edits preserve unstated nested properties. Arrays, null,
// and scalar values are explicit replacements; inputs were checked by jsonData.
function patchConditions(previous, changes) {
  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const merged = isObject(previous) ? clone(previous) : {};
  for (const [key, value] of Object.entries(changes)) {
    merged[key] = isObject(value) ? patchConditions(own(merged, key) ? merged[key] : null, value) : clone(value);
  }
  return merged;
}

function validateTask(task, key, ownerScope) {
  const path = `tasks.${key}`;
  const keys = ['id', 'ownerScope', 'originThreadId', 'threadId', 'goal', 'label', 'lead', 'helpers', 'mode', 'scope', 'status', 'conditions', 'conditionRevision', 'currentStep', 'nextStep', 'completedSteps', 'reviewStepIds', 'menu', 'usedMenuIds', 'lastSelection', 'effects', 'userReports', 'completionEvidenceRefs', 'createdAt', 'updatedAt', 'lastSourceRef', 'pauseReason', 'cancelReason'];
  fields(task, keys, keys, path);
  identifier(task.id, `${path}.id`);
  if (task.id !== key || task.ownerScope !== ownerScope) fail('OWNER_MISMATCH', 'Task identity or owner does not match its store', path);
  identifier(task.originThreadId, `${path}.originThreadId`);
  identifier(task.threadId, `${path}.threadId`);
  string(task.goal, `${path}.goal`, 2000);
  string(task.label, `${path}.label`, 200);
  routing(task.lead, task.helpers, path);
  enumValue(task.mode, MODES, `${path}.mode`);
  scope(task.scope, `${path}.scope`);
  enumValue(task.status, STATUSES, `${path}.status`);
  object(task.conditions, `${path}.conditions`);
  if (Object.keys(task.conditions).length > 100) fail('DATA_LIMIT', 'Too many conditions', path);
  integer(task.conditionRevision, `${path}.conditionRevision`);
  optionalText(task.currentStep, `${path}.currentStep`);
  optionalText(task.nextStep, `${path}.nextStep`);
  strings(task.reviewStepIds, `${path}.reviewStepIds`, 256, 200);
  strings(task.usedMenuIds, `${path}.usedMenuIds`, 512, 200);
  array(task.completedSteps, `${path}.completedSteps`, 256);
  const stepIds = new Set();
  task.completedSteps.forEach((step, i) => {
    const p = `${path}.completedSteps[${i}]`;
    fields(step, ['id', 'label', 'evidenceRefs', 'completedAt', 'valid', 'invalidatedAt'], ['id', 'label', 'evidenceRefs', 'completedAt', 'valid', 'invalidatedAt'], p);
    identifier(step.id, `${p}.id`);
    if (stepIds.has(step.id)) fail('DUPLICATE_STEP', 'Step IDs must be unique', p);
    stepIds.add(step.id);
    string(step.label, `${p}.label`, 500);
    strings(step.evidenceRefs, `${p}.evidenceRefs`, 32, 500, true);
    time(step.completedAt, `${p}.completedAt`);
    if (typeof step.valid !== 'boolean') fail('INVALID_VALUE', 'Step validity must be boolean', p);
    if (step.invalidatedAt !== null) time(step.invalidatedAt, `${p}.invalidatedAt`);
    if (step.valid === (step.invalidatedAt !== null)) fail('INVALID_STEP', 'Step invalidation state is inconsistent', p);
    if (!step.valid && !task.reviewStepIds.includes(step.id)) fail('INVALID_STEP', 'Invalidated steps must remain queued for review', p);
  });
  if (task.menu !== null) {
    const p = `${path}.menu`;
    fields(task.menu, ['id', 'threadId', 'createdAt', 'sourceRef', 'choices'], ['id', 'threadId', 'createdAt', 'sourceRef', 'choices'], p);
    identifier(task.menu.id, `${p}.id`);
    identifier(task.menu.threadId, `${p}.threadId`);
    time(task.menu.createdAt, `${p}.createdAt`);
    string(task.menu.sourceRef, `${p}.sourceRef`, 500);
    choices(task.menu.choices, `${p}.choices`);
    if (task.menu.threadId !== task.threadId || !task.usedMenuIds.includes(task.menu.id) || isClosed(task) || task.status === 'paused') fail('STALE_MENU', 'Menu is outside the active task context', p);
  }
  if (task.lastSelection !== null) {
    fields(task.lastSelection, ['menuId', 'choiceId', 'label', 'value', 'at', 'sourceRef'], ['menuId', 'choiceId', 'label', 'value', 'at', 'sourceRef'], `${path}.lastSelection`);
    identifier(task.lastSelection.menuId, `${path}.lastSelection.menuId`);
    identifier(task.lastSelection.choiceId, `${path}.lastSelection.choiceId`);
    string(task.lastSelection.label, `${path}.lastSelection.label`, 300);
    time(task.lastSelection.at, `${path}.lastSelection.at`);
    string(task.lastSelection.sourceRef, `${path}.lastSelection.sourceRef`, 500);
  }
  object(task.effects, `${path}.effects`);
  if (Object.keys(task.effects).length > 256) fail('DATA_LIMIT', 'Too many task effects', path);
  for (const [effectId, effect] of Object.entries(task.effects)) {
    const p = `${path}.effects.${effectId}`;
    fields(effect, ['id', 'description', 'status', 'threadId', 'mode', 'conditionRevision', 'createdAt', 'updatedAt', 'sourceRef', 'evidenceRefs'], ['id', 'description', 'status', 'threadId', 'mode', 'conditionRevision', 'createdAt', 'updatedAt', 'sourceRef', 'evidenceRefs'], p);
    identifier(effect.id, `${p}.id`);
    if (effect.id !== effectId) fail('INVALID_EFFECT', 'Effect identity mismatch', p);
    string(effect.description, `${p}.description`, 1000);
    identifier(effect.threadId, `${p}.threadId`);
    enumValue(effect.mode, MODES, `${p}.mode`);
    enumValue(effect.status, EFFECT_STATUSES, `${p}.status`);
    integer(effect.conditionRevision, `${p}.conditionRevision`);
    if (effect.conditionRevision > task.conditionRevision) fail('INVALID_EFFECT', 'Effect references a future condition revision', p);
    time(effect.createdAt, `${p}.createdAt`);
    time(effect.updatedAt, `${p}.updatedAt`);
    if (Date.parse(effect.updatedAt) < Date.parse(effect.createdAt)) fail('INVALID_TIME', 'Effect time moved backwards', p);
    string(effect.sourceRef, `${p}.sourceRef`, 500);
    strings(effect.evidenceRefs, `${p}.evidenceRefs`, 32, 500, ['success', 'failed'].includes(effect.status));
  }
  array(task.userReports, `${path}.userReports`, 256);
  for (const report of task.userReports) {
    fields(report, ['summary', 'at', 'sourceRef'], ['summary', 'at', 'sourceRef'], `${path}.userReports[]`);
    string(report.summary, `${path}.userReports[].summary`, 1000);
    time(report.at, `${path}.userReports[].at`);
    string(report.sourceRef, `${path}.userReports[].sourceRef`, 500);
  }
  strings(task.completionEvidenceRefs, `${path}.completionEvidenceRefs`, 32, 500, task.status === 'completed');
  if (task.status !== 'completed' && task.completionEvidenceRefs.length) fail('INVALID_COMPLETION', 'Unfinished tasks cannot carry completion evidence', path);
  if (task.status === 'completed' && (pendingIds(task).length || task.reviewStepIds.length)) fail('UNVERIFIED_COMPLETION', 'Completed task still needs result inspection or review', path);
  time(task.createdAt, `${path}.createdAt`);
  time(task.updatedAt, `${path}.updatedAt`);
  if (Date.parse(task.updatedAt) < Date.parse(task.createdAt)) fail('INVALID_TIME', 'Task time moved backwards', path);
  string(task.lastSourceRef, `${path}.lastSourceRef`, 500);
  optionalText(task.pauseReason, `${path}.pauseReason`);
  optionalText(task.cancelReason, `${path}.cancelReason`);
}

function checkedStore(store, expectedOwner) {
  jsonData(store);
  fields(store, ['schema', 'revision', 'ownerScope', 'createdAt', 'updatedAt', 'tasks', 'activeByThread', 'receipts'], ['schema', 'revision', 'ownerScope', 'createdAt', 'updatedAt', 'tasks', 'activeByThread', 'receipts'], 'store');
  if (store.schema !== TASKS_SCHEMA) fail('INVALID_SCHEMA', 'Unsupported task store schema');
  identifier(store.ownerScope, 'store.ownerScope');
  if (expectedOwner !== undefined && store.ownerScope !== expectedOwner) fail('OWNER_MISMATCH', 'Task store owner does not match the caller');
  integer(store.revision, 'store.revision');
  time(store.createdAt, 'store.createdAt');
  time(store.updatedAt, 'store.updatedAt');
  if (Date.parse(store.updatedAt) < Date.parse(store.createdAt)) fail('INVALID_TIME', 'Store time moved backwards');
  object(store.tasks, 'store.tasks');
  if (Object.keys(store.tasks).length > 500) fail('DATA_LIMIT', 'Task store capacity exceeded');
  for (const [id, task] of Object.entries(store.tasks)) validateTask(task, id, store.ownerScope);
  object(store.activeByThread, 'store.activeByThread');
  if (Object.keys(store.activeByThread).length > 500) fail('DATA_LIMIT', 'Thread capacity exceeded');
  for (const [threadId, taskId] of Object.entries(store.activeByThread)) {
    identifier(threadId, 'store.activeByThread thread');
    identifier(taskId, 'store.activeByThread task');
    if (!own(store.tasks, taskId) || store.tasks[taskId].threadId !== threadId || isClosed(store.tasks[taskId])) fail('INVALID_ACTIVE_TASK', 'Active thread binding is invalid');
  }
  for (const task of Object.values(store.tasks)) {
    if (task.menu && store.activeByThread[task.threadId] !== task.id) fail('STALE_MENU', 'Inactive tasks must not expose a live menu');
  }
  object(store.receipts, 'store.receipts');
  const receiptEntries = Object.entries(store.receipts);
  if (receiptEntries.length > 5000 || receiptEntries.length !== store.revision) fail('INVALID_REVISION', 'Receipt history and revision are inconsistent');
  const revisions = new Set();
  for (const [eventId, receipt] of receiptEntries) {
    identifier(eventId, 'receipt eventId');
    fields(receipt, ['fingerprint', 'revision', 'at', 'type', 'taskId', 'threadId', 'sourceRef'], ['fingerprint', 'revision', 'at', 'type', 'taskId', 'threadId', 'sourceRef'], `receipts.${eventId}`);
    if (typeof receipt.fingerprint !== 'string' || !/^[a-f0-9]{64}$/u.test(receipt.fingerprint)) fail('INVALID_RECEIPT', 'Receipt fingerprint is invalid');
    integer(receipt.revision, 'receipt.revision', 1, store.revision);
    if (revisions.has(receipt.revision)) fail('INVALID_REVISION', 'Receipt revision is duplicated');
    revisions.add(receipt.revision);
    time(receipt.at, 'receipt.at');
    enumValue(receipt.type, TYPES, 'receipt.type');
    identifier(receipt.taskId, 'receipt.taskId');
    identifier(receipt.threadId, 'receipt.threadId');
    string(receipt.sourceRef, 'receipt.sourceRef', 500);
    if (!own(store.tasks, receipt.taskId)) fail('INVALID_RECEIPT', 'Receipt references a missing task');
  }
  return store;
}

export function createTaskStore({ ownerScope, at }) {
  identifier(ownerScope, 'ownerScope');
  time(at, 'at');
  return { schema: TASKS_SCHEMA, revision: 0, ownerScope, createdAt: at, updatedAt: at, tasks: {}, activeByThread: {}, receipts: {} };
}

/** Validate identity and schema; ownerScope is a mixing guard, not authentication. */
export function validateTaskStore(store, { ownerScope } = {}) {
  if (ownerScope !== undefined) identifier(ownerScope, 'ownerScope');
  return clone(checkedStore(store, ownerScope));
}

function checkedEvent(event) {
  jsonData(event, 64 * 1024);
  const keys = ['eventId', 'expectedRevision', 'ownerScope', 'threadId', 'taskId', 'at', 'sourceRef', 'type', 'payload'];
  fields(event, keys, keys, 'event');
  ['eventId', 'ownerScope', 'threadId', 'taskId'].forEach(key => identifier(event[key], `event.${key}`));
  integer(event.expectedRevision, 'event.expectedRevision');
  time(event.at, 'event.at');
  string(event.sourceRef, 'event.sourceRef', 500);
  enumValue(event.type, TYPES, 'event.type');
  object(event.payload, 'event.payload');
}

function current(store, task, event) {
  if (task.threadId !== event.threadId || !own(store.activeByThread, event.threadId) || store.activeByThread[event.threadId] !== task.id) {
    fail('NOT_ACTIVE_TASK', 'Select the intended task explicitly before changing it');
  }
}

function makeActive(store, task, threadId, at) {
  const oldId = own(store.activeByThread, threadId) ? store.activeByThread[threadId] : null;
  if (oldId && oldId !== task.id) {
    const oldTask = store.tasks[oldId];
    oldTask.menu = null;
    if (!isClosed(oldTask)) {
      oldTask.status = 'paused';
      oldTask.pauseReason = 'Another task was explicitly selected in this thread.';
      oldTask.updatedAt = new Date(Math.max(Date.parse(oldTask.updatedAt), Date.parse(at))).toISOString();
    }
  }
  for (const [otherThread, id] of Object.entries(store.activeByThread)) if (id === task.id) delete store.activeByThread[otherThread];
  task.threadId = threadId;
  store.activeByThread[threadId] = task.id;
}

function clearActive(store, task) {
  for (const [thread, id] of Object.entries(store.activeByThread)) if (id === task.id) delete store.activeByThread[thread];
}

function summary(task) {
  const pendingEffectIds = pendingIds(task);
  return { id: task.id, label: task.label, goal: task.goal, lead: task.lead, helpers: clone(task.helpers), mode: task.mode, scope: clone(task.scope), status: task.status, threadId: task.threadId, currentStep: task.currentStep, nextStep: task.nextStep, updatedAt: task.updatedAt, requiresResultInspection: pendingEffectIds.length > 0, pendingEffectCount: pendingEffectIds.length, requiresReview: task.reviewStepIds.length > 0 };
}

function outcome(state, event, duplicate = false, appliedRevision = state.revision) {
  const task = state.tasks[event.taskId];
  const pendingEffectIds = pendingIds(task);
  return { taskId: task.id, eventType: event.type, revision: state.revision, appliedRevision, duplicate, status: task.status, mode: task.mode, requiresResultInspection: pendingEffectIds.length > 0, pendingEffectIds, requiresReview: task.reviewStepIds.length > 0, nextAction: isClosed(task) || task.status === 'paused' ? 'none' : pendingEffectIds.length ? 'inspect_result' : duplicate ? 'no_replay' : 'host_review', authorizesExecution: false, externalExecutionAllowed: false, persistentStateChanged: false };
}

/**
 * RESUME/ACTIVATE require payload.explicit=true. Entering execute mode via
 * SET_MODE also requires explicit=true; this records intent, never permission.
 * EFFECT_PENDING records an observed dispatched/in-flight effect, not a dispatch.
 * SELECT consumes the exact live menu. Conditions/mode/step changes expire it.
 */
export function applyTaskEvent(store, event) {
  checkedEvent(event);
  checkedStore(store, event.ownerScope);
  const hash = fingerprint(event);
  if (own(store.receipts, event.eventId)) {
    const receipt = store.receipts[event.eventId];
    if (receipt.fingerprint !== hash) fail('EVENT_CONFLICT', 'The event ID was already used for different content');
    return { state: clone(store), result: outcome(store, event, true, receipt.revision) };
  }
  if (event.expectedRevision !== store.revision) fail('REVISION_CONFLICT', 'Read the current store before applying a new event');
  if (Object.keys(store.receipts).length >= 5000) fail('DATA_LIMIT', 'Receipt capacity reached; preserve history before extending storage');
  if (Date.parse(event.at) < Date.parse(store.createdAt)) fail('STALE_TIME', 'Event predates the store');
  const state = clone(store);
  const p = event.payload;
  let task = own(state.tasks, event.taskId) ? state.tasks[event.taskId] : null;
  if (event.type !== 'START' && !task) fail('TASK_NOT_FOUND', 'The referenced task is unavailable');
  if (task && Date.parse(event.at) < Date.parse(task.updatedAt)) fail('STALE_TIME', 'Event predates the current task state');
  if (task && isClosed(task) && event.type !== 'EFFECT_RESULT') fail('TASK_CLOSED', 'Completed or canceled tasks cannot be reopened');
  if (task && !['ACTIVATE', 'RESUME', 'EFFECT_RESULT', 'START'].includes(event.type)) current(state, task, event);
  if (task?.status === 'paused' && ['CHECKPOINT', 'MENU', 'SELECT', 'EFFECT_PENDING', 'COMPLETE'].includes(event.type)) fail('TASK_PAUSED', 'Resume the task explicitly before continuing');

  switch (event.type) {
    case 'START': {
      fields(p, ['goal', 'label', 'lead', 'helpers', 'mode', 'scope', 'conditions'], ['goal', 'label', 'lead', 'mode', 'scope'], 'payload');
      if (task) fail('TASK_EXISTS', 'Task IDs cannot be reused');
      string(p.goal, 'payload.goal', 2000);
      string(p.label, 'payload.label', 200);
      routing(p.lead, p.helpers ?? [], 'payload');
      enumValue(p.mode, MODES, 'payload.mode');
      scope(p.scope, 'payload.scope');
      object(p.conditions ?? {}, 'payload.conditions');
      task = { id: event.taskId, ownerScope: state.ownerScope, originThreadId: event.threadId, threadId: event.threadId, goal: p.goal, label: p.label, lead: p.lead, helpers: clone(p.helpers ?? []), mode: p.mode, scope: clone(p.scope), status: 'active', conditions: clone(p.conditions ?? {}), conditionRevision: 0, currentStep: null, nextStep: null, completedSteps: [], reviewStepIds: [], menu: null, usedMenuIds: [], lastSelection: null, effects: {}, userReports: [], completionEvidenceRefs: [], createdAt: event.at, updatedAt: event.at, lastSourceRef: event.sourceRef, pauseReason: null, cancelReason: null };
      state.tasks[task.id] = task;
      makeActive(state, task, event.threadId, event.at);
      break;
    }
    case 'CHECKPOINT': {
      fields(p, ['currentStep', 'nextStep', 'completedSteps', 'status', 'lead', 'helpers'], [], 'payload');
      if (!Object.keys(p).length) fail('EMPTY_UPDATE', 'Checkpoint has no changes');
      for (const key of ['currentStep', 'nextStep']) if (own(p, key)) { optionalText(p[key], `payload.${key}`); task[key] = p[key]; }
      if (own(p, 'lead') || own(p, 'helpers')) {
        routing(p.lead ?? task.lead, p.helpers ?? task.helpers, 'payload');
        task.lead = p.lead ?? task.lead;
        task.helpers = clone(p.helpers ?? task.helpers);
      }
      if (own(p, 'completedSteps')) {
        array(p.completedSteps, 'payload.completedSteps', 64);
        const suppliedIds = new Set();
        for (const step of p.completedSteps) {
          fields(step, ['id', 'label', 'evidenceRefs'], ['id', 'evidenceRefs'], 'payload.completedSteps[]');
          identifier(step.id, 'step.id');
          if (suppliedIds.has(step.id)) fail('DUPLICATE_STEP', 'A checkpoint cannot provide the same step twice');
          suppliedIds.add(step.id);
          string(step.label ?? step.id, 'step.label', 500);
          strings(step.evidenceRefs, 'step.evidenceRefs', 32, 500, true);
          const value = { id: step.id, label: step.label ?? step.id, evidenceRefs: clone(step.evidenceRefs), completedAt: event.at, valid: true, invalidatedAt: null };
          const index = task.completedSteps.findIndex(item => item.id === step.id);
          if (index === -1) task.completedSteps.push(value); else task.completedSteps[index] = value;
          task.reviewStepIds = task.reviewStepIds.filter(id => id !== step.id);
        }
      }
      if (own(p, 'status')) { enumValue(p.status, new Set(['active', 'awaiting_user', 'verifying']), 'payload.status'); task.status = p.status; }
      task.menu = null;
      break;
    }
    case 'MENU': {
      fields(p, ['menuId', 'choices'], ['menuId', 'choices'], 'payload');
      identifier(p.menuId, 'payload.menuId');
      choices(p.choices, 'payload.choices');
      if (task.usedMenuIds.includes(p.menuId)) fail('MENU_ID_REUSED', 'Create a fresh ID for a new menu');
      task.usedMenuIds.push(p.menuId);
      task.menu = { id: p.menuId, threadId: event.threadId, createdAt: event.at, sourceRef: event.sourceRef, choices: clone(p.choices) };
      task.status = 'awaiting_user';
      break;
    }
    case 'SELECT': {
      fields(p, ['menuId', 'choiceId'], ['menuId', 'choiceId'], 'payload');
      const selection = resolveMenuSelection(state, { threadId: event.threadId, taskId: event.taskId, menuId: p.menuId, choiceId: p.choiceId });
      task.lastSelection = { menuId: selection.menuId, choiceId: selection.choiceId, label: selection.label, value: clone(selection.value), at: event.at, sourceRef: event.sourceRef };
      task.menu = null;
      task.status = 'active';
      break;
    }
    case 'CHANGE_CONDITIONS': {
      fields(p, ['changes', 'affectedStepIds'], ['changes', 'affectedStepIds'], 'payload');
      object(p.changes, 'payload.changes');
      if (!Object.keys(p.changes).length) fail('EMPTY_UPDATE', 'Conditions update is empty');
      strings(p.affectedStepIds, 'payload.affectedStepIds', 256, 200);
      task.conditions = patchConditions(task.conditions, p.changes);
      task.conditionRevision += 1;
      task.reviewStepIds = [...new Set([...task.reviewStepIds, ...p.affectedStepIds])];
      for (const step of task.completedSteps) if (p.affectedStepIds.includes(step.id)) { step.valid = false; step.invalidatedAt = event.at; }
      task.menu = null;
      break;
    }
    case 'SET_MODE': {
      fields(p, ['mode', 'explicit'], ['mode'], 'payload');
      enumValue(p.mode, MODES, 'payload.mode');
      if (own(p, 'explicit') && typeof p.explicit !== 'boolean') fail('INVALID_VALUE', 'explicit must be boolean');
      if (p.mode === 'execute' && p.explicit !== true) fail('EXPLICIT_INTENT_REQUIRED', 'Execute mode requires an explicit current request');
      task.mode = p.mode;
      task.menu = null;
      break;
    }
    case 'EFFECT_PENDING': {
      fields(p, ['effectId', 'description', 'evidenceRefs'], ['effectId', 'description'], 'payload');
      identifier(p.effectId, 'payload.effectId');
      string(p.description, 'payload.description', 1000);
      strings(p.evidenceRefs ?? [], 'payload.evidenceRefs', 32, 500);
      if (task.mode === 'explain') fail('MODE_DISALLOWS_EFFECT', 'Explanation mode cannot register a new external action');
      if (own(task.effects, p.effectId)) fail('EFFECT_EXISTS', 'Existing effects must be inspected, never overwritten or replayed');
      if (pendingIds(task).length) fail('RESULT_INSPECTION_REQUIRED', 'Resolve the existing in-flight or unknown effect first');
      task.effects[p.effectId] = { id: p.effectId, description: p.description, status: 'pending', threadId: event.threadId, mode: task.mode, conditionRevision: task.conditionRevision, createdAt: event.at, updatedAt: event.at, sourceRef: event.sourceRef, evidenceRefs: clone(p.evidenceRefs ?? []) };
      task.menu = null;
      break;
    }
    case 'EFFECT_RESULT': {
      fields(p, ['effectId', 'status', 'evidenceRefs'], ['effectId', 'status'], 'payload');
      identifier(p.effectId, 'payload.effectId');
      if (!own(task.effects, p.effectId)) fail('EFFECT_NOT_FOUND', 'No such dispatched effect is recorded');
      const effect = task.effects[p.effectId];
      if (![task.threadId, effect.threadId].includes(event.threadId)) fail('WRONG_THREAD', 'Effect result is unrelated to the current or originating thread');
      enumValue(p.status, new Set(['unknown', 'success', 'failed']), 'payload.status');
      strings(p.evidenceRefs ?? [], 'payload.evidenceRefs', 32, 500, p.status !== 'unknown');
      if (p.status !== 'unknown') outcomeEvidence(p.evidenceRefs, task);
      if (['success', 'failed'].includes(effect.status) && p.status !== effect.status) fail('EFFECT_FINALIZED', 'A settled result cannot be replaced by a conflicting result');
      effect.status = p.status;
      effect.evidenceRefs = [...new Set([...effect.evidenceRefs, ...(p.evidenceRefs ?? [])])];
      effect.updatedAt = event.at;
      effect.sourceRef = event.sourceRef;
      task.menu = null;
      if (!isClosed(task) && task.status !== 'paused') task.status = p.status === 'unknown' ? 'verifying' : 'active';
      break;
    }
    case 'USER_REPORTED': {
      fields(p, ['summary'], ['summary'], 'payload');
      string(p.summary, 'payload.summary', 1000);
      task.userReports.push({ summary: p.summary, at: event.at, sourceRef: event.sourceRef });
      task.menu = null;
      break;
    }
    case 'PAUSE': {
      fields(p, ['reason'], [], 'payload');
      if (own(p, 'reason')) string(p.reason, 'payload.reason', 2000);
      task.status = 'paused'; task.pauseReason = p.reason ?? 'Paused by the current user request.'; task.menu = null;
      break;
    }
    case 'RESUME': {
      fields(p, ['explicit'], ['explicit'], 'payload');
      if (p.explicit !== true) fail('EXPLICIT_INTENT_REQUIRED', 'Resume requires an explicit current request');
      if (task.threadId !== event.threadId) fail('WRONG_THREAD', 'Activate the exact saved task before resuming in another thread');
      makeActive(state, task, event.threadId, event.at);
      task.status = 'active'; task.pauseReason = null; task.menu = null;
      break;
    }
    case 'CANCEL': {
      fields(p, ['reason'], [], 'payload');
      if (own(p, 'reason')) string(p.reason, 'payload.reason', 2000);
      task.status = 'canceled'; task.cancelReason = p.reason ?? 'Canceled by the current user request.'; task.menu = null;
      clearActive(state, task);
      break;
    }
    case 'COMPLETE': {
      fields(p, ['evidenceRefs'], ['evidenceRefs'], 'payload');
      strings(p.evidenceRefs, 'payload.evidenceRefs', 32, 500, true);
      outcomeEvidence(p.evidenceRefs, task);
      if (pendingIds(task).length) fail('RESULT_INSPECTION_REQUIRED', 'Pending or unknown effects cannot be reported complete');
      if (task.reviewStepIds.length) fail('STEP_REVIEW_REQUIRED', 'Changed conditions still require step review');
      task.status = 'completed'; task.completionEvidenceRefs = clone(p.evidenceRefs); task.menu = null; task.nextStep = null;
      clearActive(state, task);
      break;
    }
    case 'ACTIVATE': {
      fields(p, ['explicit'], ['explicit'], 'payload');
      if (p.explicit !== true) fail('EXPLICIT_INTENT_REQUIRED', 'Task activation requires an explicit current selection');
      makeActive(state, task, event.threadId, event.at);
      task.menu = null;
      break;
    }
    default: fail('INVALID_EVENT', 'Unsupported event');
  }

  if (!isClosed(task) && task.status !== 'paused' && pendingIds(task).length) task.status = 'verifying';
  task.updatedAt = event.at;
  task.lastSourceRef = event.sourceRef;
  state.revision += 1;
  state.updatedAt = new Date(Math.max(Date.parse(state.updatedAt), Date.parse(event.at))).toISOString();
  state.receipts[event.eventId] = { fingerprint: hash, revision: state.revision, at: event.at, type: event.type, taskId: event.taskId, threadId: event.threadId, sourceRef: event.sourceRef };
  checkedStore(state, event.ownerScope);
  return { state, result: outcome(state, event) };
}

/** Read-only view: listing does not activate a task or expose event receipts. */
export function listTasks(store, query = {}) {
  jsonData(query, 4096);
  fields(query, ['ownerScope', 'threadId', 'statuses', 'includeClosed', 'limit'], [], 'query');
  checkedStore(store, query.ownerScope);
  if (own(query, 'threadId')) identifier(query.threadId, 'query.threadId');
  if (own(query, 'includeClosed') && typeof query.includeClosed !== 'boolean') fail('INVALID_VALUE', 'includeClosed must be boolean');
  if (own(query, 'statuses')) { strings(query.statuses, 'query.statuses', 6, 50); query.statuses.forEach(status => enumValue(status, STATUSES, 'query.statuses')); }
  const limit = query.limit ?? 20;
  integer(limit, 'query.limit', 1, 100);
  const matches = Object.values(store.tasks).filter(task => {
    if (query.threadId && task.threadId !== query.threadId) return false;
    if (query.statuses && !query.statuses.includes(task.status)) return false;
    if (!query.statuses && !query.includeClosed && isClosed(task) && pendingIds(task).length === 0) return false;
    return true;
  }).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.id.localeCompare(b.id));
  return { items: matches.slice(0, limit).map(summary), total: matches.length, omitted: Math.max(0, matches.length - limit), activeTaskId: query.threadId && own(store.activeByThread, query.threadId) ? store.activeByThread[query.threadId] : null, authorizesExecution: false };
}

/** Read an exact task without changing the active task or its owner thread. */
export function getTask(store, id) {
  checkedStore(store);
  identifier(id, 'taskId');
  const task = own(store.tasks, id) ? store.tasks[id] : null;
  const pendingEffectIds = task ? pendingIds(task) : [];
  return { task: task ? clone(task) : null, pendingEffectIds, requiresResultInspection: pendingEffectIds.length > 0, authorizesExecution: false };
}

/** Validate a host-interpreted menu choice; this does not consume or execute it. */
export function resolveMenuSelection(store, input) {
  jsonData(input, 4096);
  fields(input, ['threadId', 'taskId', 'menuId', 'choiceId'], ['threadId', 'menuId', 'choiceId'], 'selection');
  checkedStore(store);
  ['threadId', 'menuId', 'choiceId'].forEach(key => identifier(input[key], `selection.${key}`));
  if (own(input, 'taskId')) identifier(input.taskId, 'selection.taskId');
  const active = own(store.activeByThread, input.threadId) ? store.activeByThread[input.threadId] : null;
  if (!active || (input.taskId && input.taskId !== active)) fail('NOT_ACTIVE_TASK', 'Selection has no matching active task');
  const task = store.tasks[active];
  if (task.threadId !== input.threadId || isClosed(task) || task.status === 'paused') fail('STALE_MENU', 'Task is not accepting this selection');
  if (!task.menu || task.menu.id !== input.menuId || task.menu.threadId !== input.threadId) fail('STALE_MENU', 'The displayed menu has changed or belongs to another task');
  const choice = task.menu.choices.find(item => item.id === input.choiceId);
  if (!choice) fail('CHOICE_NOT_FOUND', 'This choice does not belong to the live menu');
  const pendingEffectIds = pendingIds(task);
  return { taskId: task.id, menuId: task.menu.id, choiceId: choice.id, label: choice.label, value: clone(choice.value), mode: task.mode, requiresResultInspection: pendingEffectIds.length > 0, pendingEffectIds, nextAction: pendingEffectIds.length ? 'inspect_result' : 'host_review', authorizesExecution: false, externalExecutionAllowed: false };
}
