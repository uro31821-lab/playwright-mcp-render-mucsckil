import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TASKS_SCHEMA, createTaskStore, validateTaskStore, applyTaskEvent,
  listTasks, getTask, resolveMenuSelection,
} from '../scripts/tasks.mjs';

const AT = '2026-11-04T12:00:00.000Z';
const OWNER = 'test:private-owner';
const json = value => JSON.parse(JSON.stringify(value));
const initial = () => createTaskStore({ ownerScope: OWNER, at: AT });
function event(state, type, payload = {}, overrides = {}) {
  const eventId = `event-${state.revision + 1}`;
  return { eventId, expectedRevision: state.revision, ownerScope: OWNER, threadId: 'thread-a', taskId: 'task-a', at: new Date(Date.parse(AT) + (state.revision + 1) * 1000).toISOString(), sourceRef: `user:${eventId}`, type, payload, ...overrides };
}
function advance(state, type, payload, overrides) {
  return applyTaskEvent(state, event(state, type, payload, overrides)).state;
}
function start(state = initial(), payload = {}, overrides) {
  return advance(state, 'START', { goal: '예시 설정을 확인하고 필요한 변경을 이어간다', label: '예시 설정 작업', lead: 'guide', mode: 'assist', scope: { topic: 'example.settings' }, conditions: { guests: 4, region: '예시 지역', transport: 'car' }, ...payload }, overrides);
}
function menu(state, menuId = 'menu-a', overrides) {
  return advance(state, 'MENU', { menuId, choices: [{ id: '1', label: '현재 단계 계속', value: { intent: 'continue' } }, { id: '2', label: '설명 보기', value: { intent: 'explain' } }] }, overrides);
}
function error(code, fn) {
  assert.throws(fn, caught => caught.code === code, `Expected ${code}`);
}
function deepFreeze(obj) {
  Object.freeze(obj);
  for (const value of Object.values(obj)) if (value && typeof value === 'object' && !Object.isFrozen(value)) deepFreeze(value);
  return obj;
}

test('full guide → selection → execute → unknown → result inspection → complete workflow', () => {
  let state = start(initial(), { mode: 'explain' });
  state = advance(state, 'CHECKPOINT', { currentStep: '설정 메뉴 찾기', nextStep: '변경할 항목 선택', completedSteps: [{ id: 'target', evidenceRefs: ['tool:target-screen'] }] });
  state = menu(state);
  const selected = resolveMenuSelection(state, { threadId: 'thread-a', menuId: 'menu-a', choiceId: '1' });
  assert.deepEqual(selected.value, { intent: 'continue' });
  assert.equal(selected.authorizesExecution, false);
  assert.ok(state.tasks['task-a'].menu, 'read-only selection does not consume the menu');
  state = advance(state, 'SELECT', { menuId: 'menu-a', choiceId: '1' });
  assert.equal(state.tasks['task-a'].menu, null);
  state = advance(state, 'SET_MODE', { mode: 'execute', explicit: true });
  let changed = applyTaskEvent(state, event(state, 'EFFECT_PENDING', { effectId: 'effect-a', description: '현재 항목 변경 요청이 전송된 상태', evidenceRefs: ['tool:dispatch-receipt'] }));
  state = changed.state;
  assert.equal(changed.result.authorizesExecution, false);
  assert.equal(changed.result.nextAction, 'inspect_result');
  state = advance(state, 'EFFECT_RESULT', { effectId: 'effect-a', status: 'unknown' });
  state = advance(state, 'USER_REPORTED', { summary: '했어' });
  assert.equal(state.tasks['task-a'].effects['effect-a'].status, 'unknown');
  error('RESULT_INSPECTION_REQUIRED', () => advance(state, 'COMPLETE', { evidenceRefs: ['tool:unfinished-readback'] }));
  state = advance(state, 'EFFECT_RESULT', { effectId: 'effect-a', status: 'success', evidenceRefs: ['tool:confirmed-result'] });
  state = advance(state, 'CHECKPOINT', { currentStep: '결과 확인', completedSteps: [{ id: 'change', label: '변경 결과', evidenceRefs: ['tool:confirmed-result'] }] });
  changed = applyTaskEvent(state, event(state, 'COMPLETE', { evidenceRefs: ['tool:confirmed-result'] }));
  state = changed.state;
  assert.equal(state.tasks['task-a'].status, 'completed');
  assert.deepEqual(state.tasks['task-a'].completionEvidenceRefs, ['tool:confirmed-result']);
  assert.equal(state.tasks['task-a'].ownerScope, OWNER);
  assert.equal(state.tasks['task-a'].nextStep, null);
  assert.equal(state.activeByThread['thread-a'], undefined);
  assert.equal(changed.result.nextAction, 'none');
  assert.equal(changed.result.persistentStateChanged, false, 'filesystem/remote persistence is not claimed');
  assert.equal(listTasks(state).total, 0);
  assert.equal(listTasks(state, { includeClosed: true }).total, 1);
});

test('all mutations and read views leave original objects unchanged', () => {
  const source = deepFreeze(start());
  const before = json(source);
  const input = deepFreeze(event(source, 'CHANGE_CONDITIONS', { changes: { guests: 3 }, affectedStepIds: [] }));
  const updated = applyTaskEvent(source, input);
  assert.deepEqual(source, before);
  assert.equal(source.tasks['task-a'].conditions.guests, 4);
  assert.equal(updated.state.tasks['task-a'].conditions.guests, 3);
  const read = getTask(source, 'task-a');
  read.task.conditions.guests = 99;
  const validated = validateTaskStore(source, { ownerScope: OWNER });
  validated.tasks['task-a'].conditions.guests = 100;
  const view = listTasks(source);
  view.items[0].helpers.push('unrelated');
  assert.deepEqual(source, before);
});

test('an exact retry returns current state and does not rewind to its old revision', () => {
  let state = initial();
  const original = event(state, 'START', { goal: '이전 작업 재개 확인', label: '예시', lead: 'general', mode: 'assist', scope: { topic: 'example' } });
  state = applyTaskEvent(state, original).state;
  state = advance(state, 'CHANGE_CONDITIONS', { changes: { guests: 3 }, affectedStepIds: [] });
  const replay = applyTaskEvent(state, { ...original, expectedRevision: 0 });
  assert.equal(replay.result.duplicate, true);
  assert.equal(replay.result.appliedRevision, 1);
  assert.equal(replay.result.revision, 2);
  assert.equal(replay.result.nextAction, 'no_replay');
  assert.deepEqual(replay.state, state);
  assert.equal(replay.state.tasks['task-a'].conditions.guests, 3);
});

test('same event ID with changed content is rejected; canonical object order is stable', () => {
  let state = start();
  const original = event(state, 'CHANGE_CONDITIONS', { changes: { guests: 3, transport: 'walk' }, affectedStepIds: [] });
  state = applyTaskEvent(state, original).state;
  const reordered = { ...original, payload: { affectedStepIds: [], changes: { transport: 'walk', guests: 3 } }, expectedRevision: state.revision };
  assert.equal(applyTaskEvent(state, reordered).result.duplicate, true);
  error('EVENT_CONFLICT', () => applyTaskEvent(state, { ...original, payload: { changes: { guests: 2 }, affectedStepIds: [] } }));
});

test('a new stale write or a foreign owner cannot mutate the store', () => {
  const state = start();
  const before = json(state);
  error('REVISION_CONFLICT', () => applyTaskEvent(state, event(state, 'PAUSE', {}, { expectedRevision: 0 })));
  error('OWNER_MISMATCH', () => applyTaskEvent(state, event(state, 'PAUSE', {}, { ownerScope: 'test:other-owner' })));
  error('OWNER_MISMATCH', () => validateTaskStore(state, { ownerScope: 'test:other-owner' }));
  error('OWNER_MISMATCH', () => listTasks(state, { ownerScope: 'test:other-owner' }));
  assert.deepEqual(state, before);
});

test('menu resolution uses exact active task, thread, menu and choice identity', () => {
  const state = menu(start());
  error('NOT_ACTIVE_TASK', () => resolveMenuSelection(state, { threadId: 'thread-b', menuId: 'menu-a', choiceId: '1' }));
  error('NOT_ACTIVE_TASK', () => resolveMenuSelection(state, { threadId: 'thread-a', taskId: 'task-b', menuId: 'menu-a', choiceId: '1' }));
  error('STALE_MENU', () => resolveMenuSelection(state, { threadId: 'thread-a', menuId: 'old-menu', choiceId: '1' }));
  error('CHOICE_NOT_FOUND', () => resolveMenuSelection(state, { threadId: 'thread-a', menuId: 'menu-a', choiceId: '3명' }));
  error('INVALID_STRING', () => resolveMenuSelection(state, { threadId: 'thread-a', menuId: 'menu-a', choiceId: 1 }));
  assert.equal(state.tasks['task-a'].lastSelection, null);
});

test('historical menu IDs cannot be reused after conditions change or consumption', () => {
  let state = menu(start());
  state = advance(state, 'CHANGE_CONDITIONS', { changes: { guests: 3 }, affectedStepIds: [] });
  error('STALE_MENU', () => advance(state, 'SELECT', { menuId: 'menu-a', choiceId: '1' }));
  error('MENU_ID_REUSED', () => menu(state, 'menu-a'));
  state = menu(state, 'menu-b');
  state = advance(state, 'SELECT', { menuId: 'menu-b', choiceId: '2' });
  error('MENU_ID_REUSED', () => menu(state, 'menu-b'));
  error('STALE_MENU', () => advance(state, 'SELECT', { menuId: 'menu-b', choiceId: '2' }));
});

test('changing stated conditions preserves unrelated conditions, steps and task identity', () => {
  let state = start();
  state = advance(state, 'CHECKPOINT', { currentStep: '후보 비교', nextStep: '선택 안내', completedSteps: [{ id: 'region', evidenceRefs: ['source:confirmed-region'] }] });
  state = menu(state);
  const originalGoal = state.tasks['task-a'].goal;
  state = advance(state, 'CHANGE_CONDITIONS', { changes: { guests: 3, transport: 'walk' }, affectedStepIds: [] });
  assert.deepEqual(state.tasks['task-a'].conditions, { guests: 3, region: '예시 지역', transport: 'walk' });
  assert.equal(state.tasks['task-a'].completedSteps[0].valid, true);
  assert.equal(state.tasks['task-a'].goal, originalGoal);
  assert.equal(state.tasks['task-a'].currentStep, '후보 비교');
  assert.equal(state.tasks['task-a'].menu, null);
});

test('only affected completed steps are invalidated and require fresh evidence', () => {
  let state = start();
  state = advance(state, 'CHECKPOINT', { completedSteps: [{ id: 'region', evidenceRefs: ['source:region'] }, { id: 'candidates', evidenceRefs: ['tool:old-candidates'] }] });
  state = advance(state, 'CHANGE_CONDITIONS', { changes: { transport: 'walk' }, affectedStepIds: ['candidates'] });
  assert.equal(state.tasks['task-a'].completedSteps.find(step => step.id === 'region').valid, true);
  assert.equal(state.tasks['task-a'].completedSteps.find(step => step.id === 'candidates').valid, false);
  error('STEP_REVIEW_REQUIRED', () => advance(state, 'COMPLETE', { evidenceRefs: ['tool:old-candidates'] }));
  error('EVIDENCE_REQUIRED', () => advance(state, 'CHECKPOINT', { completedSteps: [{ id: 'candidates', evidenceRefs: [] }] }));
  state = advance(state, 'CHECKPOINT', { completedSteps: [{ id: 'candidates', evidenceRefs: ['tool:new-candidates'] }] });
  assert.deepEqual(state.tasks['task-a'].reviewStepIds, []);
  state = advance(state, 'COMPLETE', { evidenceRefs: ['tool:new-candidates'] });
  assert.equal(state.tasks['task-a'].status, 'completed');
});

test('nested condition patches preserve unstated fields and replace only explicit arrays or scalars', () => {
  const state = start(undefined, {
    conditions: {
      appearance: { skin: 'smooth', background: 'warm', lighting: { direction: 'side', intensity: 'soft' } },
      size: 'large', subjects: ['one', 'two'], optional: { caption: 'old' }, custom: 'old',
    },
  });
  const original = json(state);
  const changed = advance(state, 'CHANGE_CONDITIONS', {
    changes: {
      appearance: { skin: 'natural', lighting: { intensity: 'bright' } },
      subjects: ['three'], optional: null, custom: { caption: 'new' },
    },
    affectedStepIds: [],
  });
  assert.deepEqual(changed.tasks['task-a'].conditions, {
    appearance: { skin: 'natural', background: 'warm', lighting: { direction: 'side', intensity: 'bright' } },
    size: 'large', subjects: ['three'], optional: null, custom: { caption: 'new' },
  });
  assert.deepEqual(state, original, 'recursive patch must not change the previous store');
  const replaced = advance(changed, 'CHANGE_CONDITIONS', { changes: { appearance: 'default' }, affectedStepIds: [] });
  assert.equal(replaced.tasks['task-a'].conditions.appearance, 'default');
  assert.equal(replaced.tasks['task-a'].conditions.size, 'large');
});

test('new work in the same thread pauses prior work without deleting its checkpoint', () => {
  let state = start();
  state = advance(state, 'CHECKPOINT', { currentStep: '앞 작업 단계', nextStep: '앞 작업 다음 행동' });
  state = menu(state);
  state = start(state, { goal: '새 사진 작업', label: '사진', lead: 'photo' }, { taskId: 'task-b' });
  assert.equal(state.activeByThread['thread-a'], 'task-b');
  assert.equal(state.tasks['task-a'].status, 'paused');
  assert.equal(state.tasks['task-a'].menu, null);
  assert.equal(state.tasks['task-a'].nextStep, '앞 작업 다음 행동');
  error('NOT_ACTIVE_TASK', () => advance(state, 'CHANGE_CONDITIONS', { changes: { guests: 2 }, affectedStepIds: [] }));
  state = advance(state, 'RESUME', { explicit: true });
  assert.equal(state.activeByThread['thread-a'], 'task-a');
  assert.equal(state.tasks['task-b'].status, 'paused');
  assert.equal(state.tasks['task-a'].nextStep, '앞 작업 다음 행동');
});

test('cross-thread resume requires explicit exact-task activation and expires old menus', () => {
  let state = menu(start());
  state = advance(state, 'PAUSE', { reason: '나중에 이어가기' });
  state = start(state, { lead: 'photo' }, { taskId: 'task-b', threadId: 'thread-b' });
  const before = json(state);
  const read = getTask(state, 'task-a');
  listTasks(state, { threadId: 'thread-a' });
  assert.equal(read.task.threadId, 'thread-a');
  assert.deepEqual(state, before, 'reading never selects a task');
  error('WRONG_THREAD', () => advance(state, 'RESUME', { explicit: true }, { threadId: 'thread-b' }));
  error('EXPLICIT_INTENT_REQUIRED', () => advance(state, 'ACTIVATE', { explicit: false }, { threadId: 'thread-b' }));
  state = advance(state, 'ACTIVATE', { explicit: true }, { threadId: 'thread-b' });
  assert.equal(state.tasks['task-a'].threadId, 'thread-b');
  assert.equal(state.tasks['task-a'].originThreadId, 'thread-a');
  assert.equal(state.tasks['task-b'].status, 'paused');
  assert.equal(state.activeByThread['thread-a'], undefined);
  assert.equal(state.tasks['task-a'].status, 'paused');
  state = advance(state, 'RESUME', { explicit: true }, { threadId: 'thread-b' });
  assert.equal(state.tasks['task-a'].status, 'active');
  assert.equal(state.tasks['task-a'].menu, null);
  assert.equal(state.activeByThread['thread-b'], 'task-a');
});

test('unknown outcomes survive stop, condition changes and resume; no second dispatch is recorded', () => {
  let state = start();
  state = advance(state, 'EFFECT_PENDING', { effectId: 'effect-a', description: '예시 동작 전송' });
  state = advance(state, 'EFFECT_RESULT', { effectId: 'effect-a', status: 'unknown', evidenceRefs: ['tool:timeout-observation'] });
  state = advance(state, 'PAUSE', {});
  state = advance(state, 'CHANGE_CONDITIONS', { changes: { guests: 3 }, affectedStepIds: [] });
  assert.equal(state.tasks['task-a'].status, 'paused');
  const resumed = applyTaskEvent(state, event(state, 'RESUME', { explicit: true }));
  state = resumed.state;
  assert.equal(resumed.result.nextAction, 'inspect_result');
  assert.equal(resumed.result.authorizesExecution, false);
  assert.equal(state.tasks['task-a'].status, 'verifying');
  assert.equal(state.tasks['task-a'].effects['effect-a'].conditionRevision, 0);
  assert.equal(state.tasks['task-a'].conditionRevision, 1);
  error('RESULT_INSPECTION_REQUIRED', () => advance(state, 'EFFECT_PENDING', { effectId: 'effect-b', description: '재전송 시도' }));
  error('EFFECT_EXISTS', () => advance(state, 'EFFECT_PENDING', { effectId: 'effect-a', description: '동일 ID 재전송' }));
});

test('cancellation never reopens work, but original effect result can still be recovered', () => {
  let state = start();
  state = advance(state, 'EFFECT_PENDING', { effectId: 'effect-a', description: '전송된 동작' });
  state = advance(state, 'CANCEL', { reason: '사용자가 이 작업을 종료함' });
  assert.equal(listTasks(state).items[0].status, 'canceled', 'unresolved canceled work remains visible for result inspection');
  assert.equal(listTasks(state).items[0].requiresResultInspection, true);
  error('TASK_CLOSED', () => advance(state, 'RESUME', { explicit: true }));
  error('TASK_CLOSED', () => advance(state, 'ACTIVATE', { explicit: true }));
  state = advance(state, 'EFFECT_RESULT', { effectId: 'effect-a', status: 'success', evidenceRefs: ['tool:original-effect-result'] });
  assert.equal(state.tasks['task-a'].status, 'canceled');
  assert.equal(state.activeByThread['thread-a'], undefined);
  assert.equal(listTasks(state).total, 0);
  assert.equal(listTasks(state, { statuses: ['canceled'] }).total, 1);
});

test('user reported completion cannot settle an effect or complete the task', () => {
  let state = start();
  state = advance(state, 'EFFECT_PENDING', { effectId: 'effect-a', description: '결과 대기' });
  const report = event(state, 'USER_REPORTED', { summary: '완료했어' }, { sourceRef: 'user:did-it' });
  state = applyTaskEvent(state, report).state;
  assert.equal(state.tasks['task-a'].effects['effect-a'].status, 'pending');
  assert.equal(state.tasks['task-a'].userReports[0].sourceRef, 'user:did-it');
  error('EVIDENCE_REQUIRED', () => advance(state, 'EFFECT_RESULT', { effectId: 'effect-a', status: 'success', evidenceRefs: [] }));
  error('EVIDENCE_NOT_VERIFIED', () => advance(state, 'EFFECT_RESULT', { effectId: 'effect-a', status: 'success', evidenceRefs: ['user:did-it'] }));
  error('EVIDENCE_NOT_VERIFIED', () => advance(state, 'COMPLETE', { evidenceRefs: ['user:did-it'] }));
  error('EVIDENCE_REQUIRED', () => advance(state, 'COMPLETE', { evidenceRefs: [] }));
});

test('settled effects retain outcome and cannot be overwritten by a delayed unknown response', () => {
  let state = start();
  state = advance(state, 'EFFECT_PENDING', { effectId: 'effect-a', description: '전송' });
  state = advance(state, 'EFFECT_RESULT', { effectId: 'effect-a', status: 'failed', evidenceRefs: ['tool:confirmed-failure'] });
  error('EFFECT_FINALIZED', () => advance(state, 'EFFECT_RESULT', { effectId: 'effect-a', status: 'unknown' }));
  error('EFFECT_FINALIZED', () => advance(state, 'EFFECT_RESULT', { effectId: 'effect-a', status: 'success', evidenceRefs: ['tool:unrelated-result'] }));
  state = advance(state, 'EFFECT_RESULT', { effectId: 'effect-a', status: 'failed', evidenceRefs: ['tool:second-readback'] });
  assert.deepEqual(state.tasks['task-a'].effects['effect-a'].evidenceRefs, ['tool:confirmed-failure', 'tool:second-readback']);
  error('EFFECT_NOT_FOUND', () => advance(state, 'EFFECT_RESULT', { effectId: 'missing-effect', status: 'unknown' }));
});

test('a delayed result is bound to its real task and originating thread after handoff', () => {
  let state = start();
  state = advance(state, 'EFFECT_PENDING', { effectId: 'effect-a', description: '기존 방에서 전송' });
  state = advance(state, 'ACTIVATE', { explicit: true }, { threadId: 'thread-b' });
  error('WRONG_THREAD', () => advance(state, 'EFFECT_RESULT', { effectId: 'effect-a', status: 'success', evidenceRefs: ['tool:readback'] }, { threadId: 'unrelated-thread' }));
  state = advance(state, 'EFFECT_RESULT', { effectId: 'effect-a', status: 'success', evidenceRefs: ['tool:original-result'] }, { threadId: 'thread-a' });
  assert.equal(state.tasks['task-a'].threadId, 'thread-b');
  assert.equal(state.tasks['task-a'].effects['effect-a'].threadId, 'thread-a');
  assert.equal(state.activeByThread['thread-b'], 'task-a');
});

test('explain/assist/execute switching preserves the task but never supplies execution authority', () => {
  let state = start(initial(), { mode: 'explain' });
  const goal = state.tasks['task-a'].goal;
  error('MODE_DISALLOWS_EFFECT', () => advance(state, 'EFFECT_PENDING', { effectId: 'effect-a', description: '아직 설명 단계' }));
  error('EXPLICIT_INTENT_REQUIRED', () => advance(state, 'SET_MODE', { mode: 'execute' }));
  for (const mode of ['assist', 'execute', 'explain']) {
    const changed = applyTaskEvent(state, event(state, 'SET_MODE', { mode, explicit: true }));
    state = changed.state;
    assert.equal(state.tasks['task-a'].goal, goal);
    assert.equal(changed.result.authorizesExecution, false);
    assert.equal(changed.result.externalExecutionAllowed, false);
    assert.equal(state.tasks['task-a'].mode, mode);
  }
});

test('paused work needs an explicit resume; completed work never reopens', () => {
  let state = start();
  state = advance(state, 'PAUSE', {});
  error('TASK_PAUSED', () => menu(state));
  error('TASK_PAUSED', () => advance(state, 'CHECKPOINT', { status: 'active' }));
  error('EXPLICIT_INTENT_REQUIRED', () => advance(state, 'RESUME', { explicit: false }));
  state = advance(state, 'RESUME', { explicit: true });
  state = advance(state, 'COMPLETE', { evidenceRefs: ['source:verified-answer-delivered'] });
  error('TASK_CLOSED', () => advance(state, 'RESUME', { explicit: true }));
  error('TASK_CLOSED', () => advance(state, 'CHECKPOINT', { status: 'active' }));
});

test('lists are bounded, scoped summaries with no raw receipts, effects, or user reports', () => {
  let state = start();
  state = advance(state, 'USER_REPORTED', { summary: '예시 사용자 보고' });
  state = start(state, { label: '두 번째 작업', lead: 'photo' }, { taskId: 'task-b', threadId: 'thread-b' });
  state = start(state, { label: '세 번째 작업', lead: 'book' }, { taskId: 'task-c', threadId: 'thread-c' });
  const snapshot = json(state);
  const view = listTasks(state, { limit: 2 });
  assert.equal(view.total, 3);
  assert.equal(view.omitted, 1);
  assert.equal(view.items.length, 2);
  assert.equal(view.items[0].id, 'task-c');
  for (const item of view.items) for (const field of ['receipts', 'effects', 'userReports', 'conditions', 'lastSelection']) assert.equal(own(item, field), false);
  const thread = listTasks(state, { threadId: 'thread-a' });
  assert.equal(thread.activeTaskId, 'task-a');
  assert.equal(thread.total, 1);
  assert.deepEqual(state, snapshot);
  error('INVALID_INTEGER', () => listTasks(state, { limit: 0 }));
  error('INVALID_VALUE', () => listTasks(state, { statuses: ['unknown'] }));
  assert.equal(getTask(state, 'missing').task, null);
});

const own = (object, key) => Object.hasOwn(object, key);

test('schema validation rejects corrupt identities, missing history and forged completion state', () => {
  const state = start();
  const badSchema = json(state); badSchema.schema = 'other';
  error('INVALID_SCHEMA', () => validateTaskStore(badSchema));
  const ownerMismatch = json(state); ownerMismatch.tasks['task-a'].ownerScope = 'test:other-owner';
  error('OWNER_MISMATCH', () => validateTaskStore(ownerMismatch));
  const missingReceipt = json(state); delete missingReceipt.receipts['event-1'];
  error('INVALID_REVISION', () => validateTaskStore(missingReceipt));
  const badThread = json(state); badThread.activeByThread['thread-b'] = 'task-a';
  error('INVALID_ACTIVE_TASK', () => validateTaskStore(badThread));
  const fakeComplete = json(state); fakeComplete.tasks['task-a'].status = 'completed';
  error('EVIDENCE_REQUIRED', () => validateTaskStore(fakeComplete));
  error('TASK_NOT_FOUND', () => advance(state, 'PAUSE', {}, { taskId: 'missing-task' }));
});

test('malformed, executable, sensitive or prototype-polluting payload data is rejected without evaluation', () => {
  const state = start();
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    const changes = JSON.parse(`{"${key}":{"polluted":true}}`);
    error('UNSAFE_KEY', () => advance(state, 'CHANGE_CONDITIONS', { changes, affectedStepIds: [] }));
  }
  assert.equal({}.polluted, undefined);
  for (const key of ['password', 'access_token', 'authorization', 'command_id', 'approvalGrant']) {
    error('SENSITIVE_FIELD', () => advance(state, 'CHANGE_CONDITIONS', { changes: { [key]: 'example-only' }, affectedStepIds: [] }));
  }
  let getterRan = false;
  const changes = Object.defineProperty({}, 'read', { enumerable: true, get() { getterRan = true; return 'value'; } });
  error('INVALID_JSON', () => advance(state, 'CHANGE_CONDITIONS', { changes, affectedStepIds: [] }));
  assert.equal(getterRan, false);
  for (const value of [NaN, Infinity, undefined, 1n, () => 1, new Date()]) {
    assert.throws(() => advance(state, 'CHANGE_CONDITIONS', { changes: { sample: value }, affectedStepIds: [] }));
  }
  const symbolic = []; symbolic[Symbol('extra')] = 'value';
  error('INVALID_JSON', () => advance(state, 'CHANGE_CONDITIONS', { changes: { sample: symbolic }, affectedStepIds: [] }));
  error('DATA_LIMIT', () => advance(state, 'CHANGE_CONDITIONS', { changes: { text: 'x'.repeat(65537) }, affectedStepIds: [] }));
});

test('invalid timestamps and stale observations cannot overwrite newer task decisions', () => {
  const state = start();
  error('INVALID_TIME', () => createTaskStore({ ownerScope: OWNER, at: 'yesterday' }));
  error('INVALID_TIME', () => advance(state, 'PAUSE', {}, { at: '2026-11-04T12:01:00' }));
  error('STALE_TIME', () => advance(state, 'PAUSE', {}, { at: AT }));
  assert.equal(state.schema, TASKS_SCHEMA);
  assert.equal(state.tasks['task-a'].status, 'active');
});

test('menu intent can be recorded during result inspection but cannot authorize another effect', () => {
  let state = start();
  state = advance(state, 'EFFECT_PENDING', { effectId: 'effect-a', description: '현재 요청 결과 대기' });
  state = menu(state);
  const selection = resolveMenuSelection(state, { threadId: 'thread-a', menuId: 'menu-a', choiceId: '1' });
  assert.equal(selection.requiresResultInspection, true);
  assert.equal(selection.nextAction, 'inspect_result');
  assert.equal(selection.authorizesExecution, false);
  const changed = applyTaskEvent(state, event(state, 'SELECT', { menuId: 'menu-a', choiceId: '1' }));
  state = changed.state;
  assert.equal(state.tasks['task-a'].status, 'verifying');
  assert.equal(changed.result.nextAction, 'inspect_result');
  assert.deepEqual(state.tasks['task-a'].lastSelection.value, { intent: 'continue' });
  error('RESULT_INSPECTION_REQUIRED', () => advance(state, 'EFFECT_PENDING', { effectId: 'effect-b', description: '추가 실행' }));
});
