import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveJebiseoGuidedArguments as resolve, prepareJebiseoGuidedCall as prepare} from './guided-form.mjs';

// Synthetic protocol fixtures only; never copied from a live phone/session.
const session = '11111111-2222-4333-8444-555555555555';
const request = '66666666-7777-4888-9999-aaaaaaaaaaaa';
const fieldId = `f_${'b'.repeat(24)}`;
const otherId = `f_${'c'.repeat(24)}`;
const itemRef = `item_${'d'.repeat(16)}`;
const issued = (op, id = '', option = '', value = '') => ({action: 'set_text',
  text: `__JH_FORM_V1__|${session}|${request}|${op}|${id}|${option}`, value});
const discoverArgs = () => issued('form15_discover');
const typeArgs = () => issued('form15_type', fieldId, '', '<값>');
const dismissArgs = () => issued('form_activate', fieldId, 'visible-only');
const job = (type, value) => ({type, status: 'complete', error: null,
  result: {ok: true, url: JSON.stringify(value)}});
const page = () => ({ok: true, code: 'form_scanned', coverage: 'VISIBLE_ACCESSIBILITY_ONLY',
  fields: [{fieldId, label: 'Gemini 입력', kind: 'TEXT', enabled: true, ambiguous: false, filled: false}],
  buttons: [{targetId: fieldId, label: '주의사항 닫기', approvalRequired: false,
    activateToolArguments: dismissArgs()}]});
const snapshot = (guide = page(), extraRows = []) => job('agent_snapshot', [
  {package: 'com.koreanlifehub.bridge.protocol', guidedForm: JSON.stringify(guide),
    inputSelection15ToolArguments: JSON.stringify(discoverArgs())}, ...extraRows]);
const discovery = (changes = {}) => job('agent_step', {...page(), feature: 'input_selection_15',
  coverage: 'VISIBLE_ONLY', form15ToolArguments: {fields: [{fieldId, kind: 'TEXT', write: typeArgs()}]}, ...changes});

test('original snapshot issues discovery unchanged without asserting authentication or creating identifiers', () => {
  const original = snapshot(), before = structuredClone(original);
  const result = resolve({operation: 'DISCOVER_INPUT', snapshot: original});
  assert.equal(result.ok, true);
  assert.deepEqual(result.issuedArguments, discoverArgs());
  assert.deepEqual(result.identity, {session, requestId: request, operation: 'form15_discover', fieldId: '', option: ''});
  assert.equal(result.authorityVerified, false);
  const call = prepare({operation: 'DISCOVER_INPUT', issuedArguments: result.issuedArguments});
  assert.deepEqual(call.arguments, discoverArgs());
  assert.equal(call.authorityVerified, false);
  assert.equal(Object.hasOwn(call.arguments, 'command_id'), false);
  assert.deepEqual(original, before);
});

test('TYPE cross-checks original field metadata and changes only the issued value', () => {
  const original = discovery(), before = structuredClone(original);
  const result = resolve({operation: 'TYPE', discovery: original, fieldId, targetLabel: 'Gemini 입력'});
  assert.equal(result.ok, true);
  const prompt = '사용자가 요청한 공개 문장\n두 번째 줄';
  const call = prepare({operation: 'TYPE', issuedArguments: result.issuedArguments, text: prompt});
  assert.equal(call.ok, true);
  assert.deepEqual(call.arguments, {...typeArgs(), value: prompt});
  assert.deepEqual(call.identity, result.identity);
  assert.deepEqual(result.issuedArguments, typeArgs());
  assert.deepEqual(original, before);
  assert.equal(resolve({operation: 'TYPE', discovery: original, targetItemRef: itemRef}).code,
    'JEBISEO_GUIDED_WEB_ITEM_MAPPING_UNAVAILABLE');
  assert.equal(resolve({operation: 'TYPE', discovery: original, fieldId, targetLabel: '다른 입력'}).ok, false);
  assert.equal(resolve({operation: 'TYPE', discovery: discovery({fields: [...page().fields, ...page().fields]}), fieldId}).ok, false);
  assert.equal(resolve({operation: 'TYPE', discovery: discovery({fields: [{...page().fields[0], ambiguous: true}]}), fieldId}).ok, false);
  const wrongWrite = {fields: [{fieldId, kind: 'TEXT', write: issued('form15_type', otherId, '', '<값>')}]};
  assert.equal(resolve({operation: 'TYPE', discovery: discovery({form15ToolArguments: wrongWrite}), fieldId}).code,
    'JEBISEO_GUIDED_TARGET_MISMATCH');
});

test('DISMISS_NOTICE accepts only the exact original non-approval dismissal, never a send or approval button', () => {
  const result = resolve({operation: 'DISMISS_NOTICE', snapshot: snapshot(), fieldId, targetLabel: '주의사항 닫기'});
  assert.equal(result.ok, true);
  assert.deepEqual(prepare({operation: 'DISMISS_NOTICE', issuedArguments: result.issuedArguments}).arguments, dismissArgs());
  assert.equal(result.authorityVerified, false);
  for (const change of [
    {label: '보내기'}, {label: '닫기 및 전송'}, {approvalRequired: true}, {targetId: undefined},
    {prepareToolArguments: issued('form_prepare', fieldId, 'visible-only', '승인 요청')},
    {activateToolArguments: issued('form_approve', fieldId, '', 'grant')},
    {activateToolArguments: issued('form_activate', otherId, 'visible-only')}
  ]) {
    const guide = page(); guide.buttons[0] = {...guide.buttons[0], ...change};
    assert.equal(resolve({operation: 'DISMISS_NOTICE', snapshot: snapshot(guide), fieldId}).ok, false);
  }
  const duplicate = page(); duplicate.buttons.push({...duplicate.buttons[0], targetId: otherId});
  assert.equal(resolve({operation: 'DISMISS_NOTICE', snapshot: snapshot(duplicate), targetLabel: '주의사항 닫기'}).ok, false);
  assert.equal(resolve({operation: 'DISMISS_NOTICE', snapshot: snapshot()}).ok, false);
});

test('unknown or existing draft and native validation errors cannot produce TYPE arguments', () => {
  for (const change of [{filled: true}, {filled: undefined}, {enabled: false}, {error: 'validation error'}]) {
    const original = discovery({fields: [{...page().fields[0], ...change}]});
    assert.equal(resolve({operation: 'TYPE', discovery: original, fieldId}).code,
      'JEBISEO_GUIDED_FIELD_NOT_WRITABLE');
  }
});

test('incomplete, failed, partial, malformed and ambiguous original observations cannot issue action arguments', () => {
  const bad = [
    {...snapshot(), status: 'queued'}, {...snapshot(), type: 'agent_step'},
    {...snapshot(), result: {...snapshot().result, ok: false}},
    {...snapshot(), result: {ok: true, url: '{broken'}},
    {ok: true, guidedForm: page()},
    snapshot({...page(), ok: false, code: 'guided_form_budget_partial'}),
    snapshot(page(), [{package: 'com.koreanlifehub.bridge.protocol', guidedForm: JSON.stringify(page())}])
  ];
  for (const value of bad) assert.equal(resolve({operation: 'DISCOVER_INPUT', snapshot: value}).ok, false);
  const notProtocol = job('agent_snapshot', [{package: 'com.android.chrome', text: JSON.stringify(page())}]);
  assert.equal(resolve({operation: 'DISCOVER_INPUT', snapshot: notProtocol}).ok, false);
  assert.equal(resolve({operation: 'TYPE', discovery: {...discovery(), status: 'in_progress'}, fieldId}).ok, false);
  assert.equal(resolve(null).ok, false);
  assert.equal(prepare(null).ok, false);
});

test('carrier preparation rejects changed scope, unsupported operations and injected native arguments', () => {
  for (const args of [
    {...typeArgs(), action: 'click'}, {...typeArgs(), command_id: 'a'.repeat(32)},
    {...typeArgs(), text: typeArgs().text + '|extra'},
    {...typeArgs(), text: typeArgs().text.replace(session, 'invented-session')},
    {...typeArgs(), text: typeArgs().text.replace(request, 'short')},
    issued('form15_type', itemRef, '', '<값>'),
    issued('form15_type', fieldId, 'visible-only', '<값>'),
    {...typeArgs(), value: 'already replaced'},
    issued('form_approve', fieldId, '', 'approval')
  ]) assert.equal(prepare({operation: 'TYPE', issuedArguments: args, text: '문장'}).ok, false);
  assert.equal(prepare({operation: 'EXECUTE_SUBMIT', issuedArguments: dismissArgs()}).ok, false);
  assert.equal(prepare({operation: 'DISMISS_NOTICE', issuedArguments: issued('form_activate', fieldId)}).ok, false);
  assert.equal(prepare({operation: 'DISCOVER_INPUT', issuedArguments: issued('form15_discover', fieldId)}).ok, false);
});

test('text limits and non-input value exclusion preserve separate submission and fixed original selector', () => {
  for (const text of ['', 'a\0b', 'a'.repeat(1201), '가'.repeat(683)])
    assert.equal(prepare({operation: 'TYPE', issuedArguments: typeArgs(), text}).code, 'JEBISEO_SHARED_PHONE_TEXT_LIMIT');
  assert.equal(prepare({operation: 'TYPE', issuedArguments: typeArgs(), text: '가'.repeat(682)}).ok, true);
  for (const operation of ['DISCOVER_INPUT', 'DISMISS_NOTICE']) {
    const args = operation === 'DISCOVER_INPUT' ? discoverArgs() : dismissArgs();
    assert.equal(prepare({operation, issuedArguments: args, text: '입력하면 안 되는 문장'}).code,
      'JEBISEO_GUIDED_NON_INPUT_VALUE_FORBIDDEN');
  }
});
