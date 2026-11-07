import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoutineStore, validateRoutineStore, applyRoutineEvent, getRoutine, listRoutines, instantiateRoutine } from '../scripts/routines.mjs';

const OWNER = 'owner:test';
const AT = '2026-11-04T12:00:00.000Z';
const CATALOG = ['general', 'development', 'guide', 'food', 'photo', 'book', 'travel', 'news', 'reflection', 'cleanup', 'personal', 'open_source', 'memory', 'evidence', 'camera', 'audio'];
const SCOPE = { topic: 'meal_planning', project: 'jh', aspect: 'group' };
const SOURCE = {
  id: 'task:completed-meal', ownerScope: OWNER, status: 'completed', effects: {},
  completionEvidenceRefs: ['evidence:result-1'],
  conditions: { targetDate: '2026-11-07', priorPrice: 35000, address: 'old-address-not-to-copy' }
};
function definition() {
  return {
    persistenceIntent: 'explicit_ongoing', scope: structuredClone(SCOPE), title: '모임 준비 방식', lead: 'food', helpers: ['general'],
    steps: [
      { id: 'find', capability: 'food', dependsOn: [], requiredInputs: ['guestCount', 'targetDate'], produces: ['candidates'], instruction: '현재 조건에 맞는 식당 후보를 확인한다.' },
      { id: 'summarize', capability: 'general', dependsOn: ['find'], requiredInputs: ['candidates', 'displayStyle'], produces: ['summary'], instruction: '확인된 후보를 요청한 형식으로 정리한다.' }
    ],
    parameters: [
      { name: 'guestCount', required: true, dynamic: false },
      { name: 'targetDate', required: true, dynamic: true },
      { name: 'displayStyle', required: true, dynamic: false }
    ],
    defaults: { guestCount: 4, displayStyle: '짧은 표' }, outputFormat: '후보 표와 추천 이유 한 문장',
    sourceTaskId: SOURCE.id, sourceEvidenceRefs: ['evidence:result-1']
  };
}
function initial() { return createRoutineStore({ ownerScope: OWNER, at: AT }); }
function event(state, type, payload, extra = {}) {
  return { eventId: `event:${state.revision + 1}`, expectedRevision: state.revision, ownerScope: OWNER, at: AT, sourceRef: 'user:actual-request', type, routineId: 'routine:meal', payload, ...extra };
}
function saved() {
  const state = initial(); const e = event(state, 'SAVE', definition());
  return { ...applyRoutineEvent(state, e, { catalogIds: CATALOG, sourceTask: SOURCE }), event: e, before: state };
}
function plan(state, values = { targetDate: '2026-11-14' }, extra = {}) {
  return instantiateRoutine(state, { routineId: 'routine:meal', ownerScope: OWNER, scope: SCOPE, values, availableCapabilities: ['food', 'general'], catalogIds: CATALOG, ...extra });
}
function code(expected) { return error => error?.code === expected; }
function defaultsEvent(state, changes, extra = {}) {
  return event(state, 'UPDATE_DEFAULTS', { persistenceIntent: 'explicit_ongoing', expectedRoutineVersion: getRoutine(state, 'routine:meal').version, scope: SCOPE, changes, ...extra });
}
function formatEvent(state, outputFormat, extra = {}) {
  return event(state, 'UPDATE_FORMAT', { persistenceIntent: 'explicit_ongoing', expectedRoutineVersion: getRoutine(state, 'routine:meal').version, scope: SCOPE, outputFormat, ...extra });
}

test('save a completed procedure as a separate immutable definition, with evidence and no inherited task data', () => {
  const { state, result, before } = saved();
  assert.equal(before.revision, 0); assert.deepEqual(before.routines, {});
  assert.equal(state.revision, 1); assert.equal(result.storeWriteRequired, true); assert.equal(result.persistentStateChanged, false);
  assert.equal(result.authorizesExecution, false);
  const routine = getRoutine(state, 'routine:meal');
  assert.equal(routine.origin, 'observed_procedure'); assert.equal(routine.verification, 'source_task_completed');
  assert.equal(routine.source.taskId, SOURCE.id); assert.deepEqual(routine.source.evidenceRefs, SOURCE.completionEvidenceRefs);
  assert.equal(JSON.stringify(state).includes('old-address-not-to-copy'), false);
  assert.equal(JSON.stringify(state).includes('2026-11-07'), false);
  routine.defaults.guestCount = 99;
  assert.equal(state.routines['routine:meal'].defaults.guestCount, 4);
});

test('source task completion, ownership, identity and cited completion evidence are required', () => {
  const state = initial(); const e = event(state, 'SAVE', definition());
  assert.throws(() => applyRoutineEvent(state, e, { catalogIds: CATALOG }), code('SOURCE_TASK_REQUIRED'));
  for (const [change, expected] of [
    [{ status: 'awaiting_user' }, 'SOURCE_NOT_COMPLETED'],
    [{ ownerScope: 'owner:other' }, 'OWNER_MISMATCH'],
    [{ id: 'task:different' }, 'SOURCE_TASK_MISMATCH'],
    [{ completionEvidenceRefs: [] }, 'EVIDENCE_REQUIRED'],
    [{ completionEvidenceRefs: ['evidence:unrelated'] }, 'SOURCE_EVIDENCE_MISMATCH']
  ]) assert.throws(() => applyRoutineEvent(state, e, { catalogIds: CATALOG, sourceTask: { ...SOURCE, ...change } }), code(expected));
});

test('unknown or pending external effects cannot become an observed reusable procedure', () => {
  const state = initial(); const e = event(state, 'SAVE', definition());
  for (const status of ['pending', 'unknown']) {
    assert.throws(() => applyRoutineEvent(state, e, { catalogIds: CATALOG, sourceTask: { ...SOURCE, effects: { effect1: { status, evidenceRefs: [] } } } }), code('SOURCE_EFFECT_UNRESOLVED'));
  }
  assert.throws(() => applyRoutineEvent(state, e, { catalogIds: CATALOG, sourceTask: { ...SOURCE, effects: { effect1: { status: 'success', evidenceRefs: [] } } } }), code('EVIDENCE_REQUIRED'));
  assert.equal(applyRoutineEvent(state, e, { catalogIds: CATALOG, sourceTask: { ...SOURCE, effects: { effect1: { status: 'success', evidenceRefs: ['receipt:actual'] } } } }).state.revision, 1);
});

test('explicit design composition can plan without claiming a previous completed task', () => {
  const state = initial(); const d = definition(); delete d.sourceTaskId;
  d.definitionSource = 'user_requested_design'; d.sourceEvidenceRefs = ['user:actual-request'];
  const e = event(state, 'COMPOSE', d); const next = applyRoutineEvent(state, e, { catalogIds: CATALOG });
  assert.equal(next.state.routines['routine:meal'].origin, 'explicit_design');
  assert.equal(next.state.routines['routine:meal'].verification, 'not_run');
  assert.equal(next.state.routines['routine:meal'].source.taskId, null);
  const p = plan(next.state); assert.equal(p.ready, true); assert.equal(p.verification, 'not_run'); assert.equal(p.executionPerformed, false);
  assert.throws(() => applyRoutineEvent(state, event(state, 'COMPOSE', { ...d, sourceEvidenceRefs: ['evidence:other'] }), { catalogIds: CATALOG }), code('SOURCE_EVIDENCE_MISMATCH'));
  assert.throws(() => applyRoutineEvent(state, event(state, 'COMPOSE', { ...d, sourceTaskId: SOURCE.id }), { catalogIds: CATALOG }), code('INVALID_ORIGIN'));
});

test('praise and one-off changes are not ongoing persistence requests', () => {
  const state = initial();
  for (const persistenceIntent of ['praise', 'this_task', false, null]) assert.throws(() => applyRoutineEvent(state, event(state, 'SAVE', { ...definition(), persistenceIntent }), { catalogIds: CATALOG, sourceTask: SOURCE }), code('PERSISTENCE_INTENT_REQUIRED'));
  const existing = saved().state;
  assert.throws(() => applyRoutineEvent(existing, defaultsEvent(existing, { guestCount: 3 }, { persistenceIntent: 'this_task' })), code('PERSISTENCE_INTENT_REQUIRED'));
});

test('only actual registered capability IDs are accepted', () => {
  const state = initial(); const d = definition();
  assert.throws(() => applyRoutineEvent(state, event(state, 'SAVE', d), { sourceTask: SOURCE }), code('CATALOG_REQUIRED'));
  d.steps[0].capability = 'imagined';
  assert.throws(() => applyRoutineEvent(state, event(state, 'SAVE', d), { catalogIds: CATALOG, sourceTask: SOURCE }), code('UNKNOWN_CAPABILITY'));
  const p = plan(saved().state, { targetDate: '2026-11-14' }, { availableCapabilities: ['general'] });
  assert.equal(p.ready, false); assert.deepEqual(p.unavailableCapabilities, ['food']);
  assert.equal(p.authorizesExecution, false);
});

test('past dynamic values cannot be stored as defaults or mislabeled as stable', () => {
  const state = initial(); const d = definition(); d.defaults.targetDate = '2026-11-07';
  assert.throws(() => applyRoutineEvent(state, event(state, 'SAVE', d), { catalogIds: CATALOG, sourceTask: SOURCE }), code('DYNAMIC_DEFAULT'));
  const mislabelled = definition(); mislabelled.parameters[1].dynamic = false;
  assert.throws(() => applyRoutineEvent(state, event(state, 'SAVE', mislabelled), { catalogIds: CATALOG, sourceTask: SOURCE }), code('DYNAMIC_PARAMETER_REQUIRED'));
  const unknown = definition(); unknown.defaults.previousPrice = 35000;
  assert.throws(() => applyRoutineEvent(state, event(state, 'SAVE', unknown), { catalogIds: CATALOG, sourceTask: SOURCE }), code('UNKNOWN_PARAMETER'));
});

test('fresh values are required; null and empty dynamic input do not count as confirmation', () => {
  const state = saved().state;
  for (const values of [{}, { targetDate: null }, { targetDate: '' }, { targetDate: [] }]) {
    const p = plan(state, values); assert.equal(p.ready, false); assert.deepEqual(p.missingInputs, ['targetDate']); assert.equal(p.parameterProvenance.targetDate, 'dynamic_missing');
  }
});

test('one-off values override defaults only in the returned plan', () => {
  const state = saved().state; const before = structuredClone(state);
  const p = plan(state, { targetDate: '2026-11-14', guestCount: 3 });
  assert.equal(p.ready, true); assert.equal(p.parameters.guestCount, 3); assert.equal(p.parameterProvenance.guestCount, 'current');
  assert.equal(p.parameterProvenance.displayStyle, 'default'); assert.equal(p.persistentStateChanged, false);
  assert.deepEqual(state, before); assert.equal(plan(state).parameters.guestCount, 4);
  p.parameters.guestCount = 8; assert.equal(getRoutine(state, 'routine:meal').defaults.guestCount, 4);
});

test('zero and false are real current values; explicit missing values suppress defaults', () => {
  const state = saved().state;
  const p = plan(state, { targetDate: '2026-11-14', guestCount: 0, displayStyle: false });
  assert.equal(p.ready, true); assert.equal(p.parameters.guestCount, 0); assert.equal(p.parameters.displayStyle, false);
  const missing = plan(state, { targetDate: '2026-11-14', guestCount: null });
  assert.equal(missing.ready, false); assert.ok(missing.missingInputs.includes('guestCount')); assert.equal(Object.hasOwn(missing.parameters, 'guestCount'), false);
});

test('step outputs remain unresolved future bindings and are ordered by dependencies', () => {
  const state = initial(); const d = definition(); d.steps.reverse();
  const next = applyRoutineEvent(state, event(state, 'SAVE', d), { catalogIds: CATALOG, sourceTask: SOURCE }).state;
  const p = plan(next);
  assert.deepEqual(p.steps.map(s => s.id), ['find', 'summarize']);
  const binding = p.steps[1].inputs.find(i => i.name === 'candidates');
  assert.deepEqual(binding, { name: 'candidates', source: 'step_output', stepId: 'find', available: false, status: 'awaiting_result' });
  assert.equal(Object.hasOwn(binding, 'value'), false); assert.equal(Object.hasOwn(p.parameters, 'candidates'), false);
});

test('unknown steps, cycles, missing producer dependencies and ambiguous outputs fail', () => {
  const attempts = [
    [d => { d.steps[1].dependsOn = ['missing']; }, 'UNKNOWN_STEP'],
    [d => { d.steps[0].dependsOn = ['summarize']; }, 'CYCLIC_STEPS'],
    [d => { d.steps[1].dependsOn = []; }, 'DEPENDENCY_REQUIRED'],
    [d => { d.steps[0].requiredInputs.push('invented'); }, 'UNKNOWN_INPUT'],
    [d => { d.steps[1].produces = ['candidates']; }, 'AMBIGUOUS_BINDING'],
    [d => { d.steps[0].produces.push('guestCount'); }, 'AMBIGUOUS_BINDING']
  ];
  for (const [change, expected] of attempts) {
    const state = initial(); const d = definition(); change(d);
    assert.throws(() => applyRoutineEvent(state, event(state, 'SAVE', d), { catalogIds: CATALOG, sourceTask: SOURCE }), code(expected));
  }
});

test('permanent changes require both store revision and routine version and preserve evidence', () => {
  const state = saved().state; const e = defaultsEvent(state, { guestCount: 3 });
  const next = applyRoutineEvent(state, e).state;
  assert.equal(next.revision, 2); assert.equal(getRoutine(next, 'routine:meal').version, 2);
  assert.equal(getRoutine(next, 'routine:meal').defaults.guestCount, 3);
  assert.equal(getRoutine(next, 'routine:meal').verification, 'not_run');
  assert.deepEqual(getRoutine(next, 'routine:meal').source, getRoutine(state, 'routine:meal').source);
  assert.throws(() => applyRoutineEvent(next, { ...e, eventId: 'event:stale' }), code('REVISION_CONFLICT'));
  assert.throws(() => applyRoutineEvent(next, { ...defaultsEvent(next, { guestCount: 2 }), payload: { ...defaultsEvent(next, { guestCount: 2 }).payload, expectedRoutineVersion: 1 } }), code('ROUTINE_VERSION_CONFLICT'));
});

test('an ongoing format edit needs no format parameter and preserves the procedure and original evidence', () => {
  const base = initial(); const d = definition();
  d.parameters = d.parameters.filter(p => p.name !== 'displayStyle'); delete d.defaults.displayStyle;
  d.steps[1].requiredInputs = ['candidates'];
  const state = applyRoutineEvent(base, event(base, 'SAVE', d), { catalogIds: CATALOG, sourceTask: SOURCE }).state;
  const before = structuredClone(state); const outputFormat = '추천 하나와 이유 세 문장';
  const { state: next, result } = applyRoutineEvent(state, formatEvent(state, outputFormat));
  const original = getRoutine(state, 'routine:meal'); const updated = getRoutine(next, 'routine:meal');
  assert.deepEqual(state, before); assert.equal(next.revision, 2); assert.equal(updated.version, 2);
  assert.equal(updated.outputFormat, outputFormat); assert.equal(updated.verification, 'not_run');
  for (const key of ['source', 'steps', 'defaults', 'parameters', 'scope', 'origin', 'lead', 'helpers']) assert.deepEqual(updated[key], original[key]);
  assert.equal(plan(next).outputFormat, outputFormat); assert.equal(plan(next).ready, true);
  assert.equal(result.storeWriteRequired, true); assert.equal(result.authorizesExecution, false);
  assert.equal(validateRoutineStore(next).receipts['event:2'].type, 'UPDATE_FORMAT');
});

test('format edits require ongoing intent, exact scope, current version and a changed bounded format', () => {
  const state = saved().state; const before = structuredClone(state);
  const attempts = [
    [{ persistenceIntent: 'this_task' }, 'PERSISTENCE_INTENT_REQUIRED'],
    [{ scope: { ...SCOPE, aspect: 'other' } }, 'SCOPE_MISMATCH'],
    [{ expectedRoutineVersion: 2 }, 'ROUTINE_VERSION_CONFLICT'],
    [{ outputFormat: '' }, 'INVALID_TEXT'],
    [{ outputFormat: '   ' }, 'INVALID_TEXT'],
    [{ outputFormat: 'x'.repeat(2_049) }, 'INVALID_TEXT'],
    [{ outputFormat: getRoutine(state, 'routine:meal').outputFormat }, 'EMPTY_CHANGE']
  ];
  for (const [change, expected] of attempts) assert.throws(() => applyRoutineEvent(state, formatEvent(state, '세 문장', change)), code(expected));
  assert.deepEqual(state, before);
  const archived = applyRoutineEvent(state, event(state, 'ARCHIVE', { persistenceIntent: 'explicit_archive', expectedRoutineVersion: 1, scope: SCOPE })).state;
  assert.throws(() => applyRoutineEvent(archived, formatEvent(archived, '세 문장')), code('ROUTINE_ARCHIVED'));
});

test('format retry is idempotent after a later edit, while stale or conflicting format changes fail', () => {
  const state = saved().state; const first = formatEvent(state, '추천 하나와 이유 세 문장');
  const changed = applyRoutineEvent(state, first).state;
  const latest = applyRoutineEvent(changed, formatEvent(changed, '후보 세 개와 각 장단점')).state;
  const replay = applyRoutineEvent(latest, { ...first, expectedRevision: 999 });
  assert.equal(replay.result.duplicate, true); assert.equal(replay.result.storeWriteRequired, false);
  assert.equal(replay.result.appliedRevision, 2); assert.equal(replay.result.routineVersion, 3);
  assert.deepEqual(replay.state, latest); assert.equal(plan(replay.state).outputFormat, '후보 세 개와 각 장단점');
  assert.throws(() => applyRoutineEvent(latest, { ...first, eventId: 'event:stale-format' }), code('REVISION_CONFLICT'));
  assert.throws(() => applyRoutineEvent(latest, { ...first, payload: { ...first.payload, outputFormat: '서로 다른 요청' } }), code('EVENT_CONFLICT'));
});

test('exact idempotent retry ignores expectedRevision without rewinding later changes', () => {
  const original = saved(); const next = applyRoutineEvent(original.state, defaultsEvent(original.state, { guestCount: 3 })).state;
  const replay = applyRoutineEvent(next, original.event);
  assert.equal(replay.result.duplicate, true); assert.equal(replay.result.storeWriteRequired, false);
  assert.equal(replay.result.revision, 2); assert.equal(replay.result.appliedRevision, 1);
  assert.equal(replay.result.recordedRoutineVersion, 1); assert.equal(replay.result.routineVersion, 2);
  assert.deepEqual(replay.state, next); assert.equal(plan(replay.state).parameters.guestCount, 3);
  assert.throws(() => applyRoutineEvent(next, { ...original.event, payload: { ...original.event.payload, title: 'different' } }), code('EVENT_CONFLICT'));
});

test('event digest is canonical across object-key order', () => {
  const original = saved(); const reordered = { ...original.event, expectedRevision: 999, payload: { ...original.event.payload, scope: { aspect: 'group', topic: 'meal_planning', project: 'jh' }, defaults: { displayStyle: '짧은 표', guestCount: 4 } } };
  assert.equal(applyRoutineEvent(original.state, reordered).result.duplicate, true);
});

test('remove a default explicitly; required input becomes missing and no implicit overwrite occurs', () => {
  const state = saved().state;
  const e = event(state, 'REMOVE_DEFAULT', { persistenceIntent: 'explicit_ongoing', expectedRoutineVersion: 1, scope: SCOPE, keys: ['guestCount'] });
  const next = applyRoutineEvent(state, e).state;
  assert.equal(Object.hasOwn(getRoutine(next, 'routine:meal').defaults, 'guestCount'), false);
  assert.ok(plan(next).missingInputs.includes('guestCount'));
  assert.throws(() => applyRoutineEvent(state, defaultsEvent(state, { guestCount: 3 }, { removeKeys: ['guestCount'] })), code('CONFLICTING_CHANGE'));
  assert.throws(() => applyRoutineEvent(state, defaultsEvent(state, {}, { removeKeys: ['missing'] })), code('DEFAULT_NOT_FOUND'));
});

test('archive is explicit, stops planning, and duplicate SAVE never reactivates', () => {
  const original = saved(); const state = original.state;
  assert.throws(() => applyRoutineEvent(state, event(state, 'ARCHIVE', { persistenceIntent: 'explicit_ongoing', expectedRoutineVersion: 1, scope: SCOPE })), code('PERSISTENCE_INTENT_REQUIRED'));
  const next = applyRoutineEvent(state, event(state, 'ARCHIVE', { persistenceIntent: 'explicit_archive', expectedRoutineVersion: 1, scope: SCOPE })).state;
  assert.equal(listRoutines(next).total, 0); assert.equal(listRoutines(next, { includeArchived: true }).total, 1);
  assert.throws(() => plan(next), code('ROUTINE_ARCHIVED'));
  const replay = applyRoutineEvent(next, original.event);
  assert.equal(getRoutine(replay.state, 'routine:meal').status, 'archived');
  assert.throws(() => applyRoutineEvent(next, defaultsEvent(next, { guestCount: 2 })), code('ROUTINE_ARCHIVED'));
});

test('owner and exact topic/project/aspect scope are isolated', () => {
  const state = saved().state;
  assert.throws(() => validateRoutineStore(state, { ownerScope: 'owner:other' }), code('OWNER_MISMATCH'));
  assert.throws(() => plan(state, {}, { ownerScope: 'owner:other' }), code('OWNER_MISMATCH'));
  assert.throws(() => plan(state, {}, { scope: { topic: SCOPE.topic } }), code('SCOPE_MISMATCH'));
  assert.equal(listRoutines(state, { scope: { topic: SCOPE.topic } }).total, 0);
  const edit = defaultsEvent(state, { guestCount: 3 }); edit.payload.scope = { ...SCOPE, aspect: 'different' };
  assert.throws(() => applyRoutineEvent(state, edit), code('SCOPE_MISMATCH'));
});

test('prototype keys, non-JSON objects and credentials are rejected before any assignment', () => {
  const state = initial(); const malicious = definition(); malicious.defaults = JSON.parse('{"__proto__":{"polluted":true}}');
  assert.throws(() => applyRoutineEvent(state, event(state, 'SAVE', malicious), { catalogIds: CATALOG, sourceTask: SOURCE }), code('UNSAFE_KEY'));
  assert.equal({}.polluted, undefined);
  const existing = saved().state;
  for (const name of ['apiKey', 'privateKey', 'approvalGrant', 'sessionId', 'authorization', 'commandId']) {
    const d = definition(); d.parameters.push({ name, required: false, dynamic: true });
    assert.throws(() => applyRoutineEvent(state, event(state, 'SAVE', d), { catalogIds: CATALOG, sourceTask: SOURCE }), code('PRIVATE_PARAMETER'));
  }
  assert.throws(() => plan(existing, { targetDate: '2026-11-14', displayStyle: { apiKey: 'sensitive' } }), code('PRIVATE_PARAMETER'));
  assert.throws(() => plan(existing, { targetDate: new Date() }), code('INVALID_OBJECT'));
});

test('definitions are not arbitrary executable files and do not silently absorb unknown fields', () => {
  const state = initial(); const d = definition(); d.script = 'run unknown code';
  assert.throws(() => applyRoutineEvent(state, event(state, 'SAVE', d), { catalogIds: CATALOG, sourceTask: SOURCE }), code('UNKNOWN_FIELD'));
  assert.throws(() => plan(saved().state, { targetDate: '2026-11-14', arbitraryInput: 1 }), code('UNKNOWN_PARAMETER'));
  assert.throws(() => createRoutineStore({ ownerScope: OWNER, at: 'tomorrow' }), code('INVALID_TIME'));
});

test('validation detects corrupted state and list/get return safe copies without modifying it', () => {
  const state = saved().state; const before = structuredClone(state);
  const result = listRoutines(state, { ownerScope: OWNER, scope: { project: 'jh', topic: 'meal_planning', aspect: 'group' } });
  assert.equal(result.total, 1); assert.equal(result.authorizesExecution, false);
  assert.equal(Object.hasOwn(result.items[0], 'source'), false); assert.equal(Object.hasOwn(result.items[0], 'receipts'), false);
  result.items[0].scope.topic = 'edited'; assert.deepEqual(state, before);
  const corrupted = structuredClone(state); corrupted.routines['routine:meal'].id = 'routine:wrong';
  assert.throws(() => validateRoutineStore(corrupted), code('IDENTITY_MISMATCH'));
  const invalidProof = structuredClone(state); invalidProof.receipts['event:1'].revision = 999;
  assert.throws(() => validateRoutineStore(invalidProof), code('INVALID_RECEIPT'));
});

test('listing compares instants across timezone offsets and respects limits', () => {
  const state = saved().state;
  const e = event(state, 'SAVE', { ...definition(), title: '두 번째 방식' }, { routineId: 'routine:later', at: '2026-11-04T08:30:00-04:00' });
  const next = applyRoutineEvent(state, e, { catalogIds: CATALOG, sourceTask: SOURCE }).state;
  const result = listRoutines(next, { limit: 1 });
  assert.equal(result.items[0].id, 'routine:later'); assert.equal(result.total, 2); assert.equal(result.omitted, 1);
});

test('unused optional dynamic inputs do not force an unnecessary follow-up question', () => {
  const state = initial(); const d = definition(); d.parameters.push({name:'optionalLocation',required:false,dynamic:true});
  const next = applyRoutineEvent(state, event(state,'SAVE',d), {catalogIds:CATALOG,sourceTask:SOURCE}).state;
  const p = plan(next); assert.equal(p.ready,true); assert.deepEqual(p.missingInputs,[]);
  assert.equal(p.parameterProvenance.optionalLocation,'dynamic_missing');
});

test('new events cannot rewind time, while an exact old retry remains harmless', () => {
  const original = saved();
  const later = {...defaultsEvent(original.state,{guestCount:3}),at:'2026-11-04T12:01:00.000Z'};
  const next = applyRoutineEvent(original.state,later).state;
  assert.throws(()=>applyRoutineEvent(next,{...defaultsEvent(next,{guestCount:2}),at:'2001-01-01T00:00:00.000Z'}),code('EVENT_TIME_REGRESSION'));
  assert.equal(applyRoutineEvent(next,original.event).result.duplicate,true);
  assert.throws(()=>createRoutineStore({ownerScope:OWNER,at:'2026-11-04T12:00:00'}),code('INVALID_TIME'));
});

test('missing or colliding event receipts invalidate the store instead of weakening retry protection', () => {
  const state = saved().state; const next=applyRoutineEvent(state,defaultsEvent(state,{guestCount:3})).state;
  const lost = structuredClone(next); lost.receipts={};
  assert.throws(()=>validateRoutineStore(lost),code('INVALID_RECEIPT'));
  const collision=structuredClone(next);collision.receipts['event:2'].revision=1;
  assert.throws(()=>validateRoutineStore(collision),code('INVALID_RECEIPT'));
});
