import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createInstructionCandidate } from './instructions.mjs';
import { createState, addLesson, evaluateLesson, recallContext } from './engine.mjs';
import { bindRegression, runRegression } from './regression.mjs';
import { evaluateConstraints } from './constraints.mjs';

const NOW = '2026-10-31T18:00:00.000Z';
const COMMON_SCOPE = { domain: 'orchestration', operation: 'jh.common.rules', engine: 'jh-server',
  context: { platform: 'android', version: '1', environment: 'synthetic-owner' } };
const TOOL_SCOPE = { ...COMMON_SCOPE, domain: 'device', operation: 'life_status.READ' };
const SHA = text => createHash('sha256').update(text, 'utf8').digest('hex');
const SUITE = { id: 'instruction-contract', version: '1', cases: [
  { id: 'same-device-update', input: { value: { installed: true, uninstall: false }, constraints: [
    { path: ['uninstall'], op: 'equals', expected: false },
  ] }, expected: { passed: true, failed: [] } },
  { id: 'uninstall-rejected', input: { value: { installed: true, uninstall: true }, constraints: [
    { path: ['uninstall'], op: 'equals', expected: false },
  ] }, expected: { passed: false, failed: [0] } },
] };
function instruction(overrides = {}) {
  const text = '기존 앱을 삭제하지 않고 업데이트를 한 번만 시도합니다.';
  return { lessonId: 'owner-install-policy', ruleVersion: '1', text, sourceRef: 'user:synthetic-owner-instruction',
    sourceSha256: SHA(text), appliesTo: { kind: 'all_jh_tasks' }, confirmation: 'explicit_user_instruction', ...overrides };
}
function create(state = createState(), input = instruction(), suite = SUITE, scope = COMMON_SCOPE) {
  return createInstructionCandidate(state, input, suite, { scope });
}

test('explicit common instruction preserves exact UTF-8 text and produces only a candidate', () => {
  const state = createState(); const before = structuredClone(state);
  const text = '  주인님 지시🙂\r\n기존 앱을 유지합니다.\n  ';
  const input = instruction({ text, sourceSha256: SHA(text), sourceRecordRef: 'library:synthetic-source-record' });
  const result = create(state, input);
  assert.deepEqual(state, before);
  assert.equal(result.lesson.guidance, text);
  assert.equal(result.lesson.provenance, 'user_explicit');
  assert.equal(result.lesson.memoryKind, 'procedure');
  assert.equal(result.lesson.state, 'candidate');
  assert.equal(result.lesson.operation, 'jh.common.rules');
  assert.deepEqual(result.lesson.evidenceRefs, [input.sourceRef, 'sha256:' + SHA(text), input.sourceRecordRef]);
  assert.equal(result.instructionSummary.sourceAuthentication, 'authenticated_owner_attestation');
  assert.equal(result.instructionSummary.automaticInference, false);
  assert.equal(result.instructionSummary.activationPerformed, false);
  assert.equal(result.instructionSummary.externalEffects, false);
  assert.deepEqual(Object.values(state).filter(value => value && typeof value === 'object').map(value => Object.keys(value).length), [0, 0, 0, 0]);
  const saved = addLesson(state, result.lesson);
  assert.deepEqual(saved.events, before.events); assert.deepEqual(saved.proposals, before.proposals); assert.deepEqual(saved.attempts, before.attempts);
  assert.equal(saved.revision, before.revision + 1);
  assert.deepEqual(recallContext(saved, COMMON_SCOPE, { now: NOW }).lessons, []);
});

test('tool and optional mode use the scope supplied only by the trusted host', () => {
  for (const appliesTo of [{ kind: 'tool', target_tool: 'life_status' },
    { kind: 'tool', target_tool: 'life_status', target_mode: 'READ' }]) {
    const result = create(createState(), instruction({ appliesTo }), SUITE, TOOL_SCOPE);
    assert.deepEqual(result.instructionSummary.appliesTo, appliesTo);
    assert.equal(result.lesson.domain, TOOL_SCOPE.domain);
    assert.equal(result.lesson.operation, TOOL_SCOPE.operation);
    assert.deepEqual(result.lesson.context, TOOL_SCOPE.context);
  }
});

test('confirmation and exact instruction fields cannot smuggle scope, owner, provenance or execution', () => {
  for (const extra of [{ provenance: 'user_explicit' }, { owner: 'different-owner' }, { ownerScope: 'different-owner' },
    { scope: TOOL_SCOPE }, { state: 'active' }, { evaluation: {} }, { execute: 'anything' }, { metadata: {} }]) {
    assert.throws(() => create(createState(), instruction(extra)), /fields/);
  }
  for (const confirmation of ['inferred', 'user_reported', true, null]) assert.throws(() => create(createState(), instruction({ confirmation })), /confirmation/);
  const missing = instruction(); delete missing.confirmation;
  assert.throws(() => create(createState(), missing), /fields/);
  assert.throws(() => createInstructionCandidate(createState(), instruction(), SUITE), /trusted host options/);
  assert.throws(() => createInstructionCandidate(createState(), instruction(), SUITE, { scope: COMMON_SCOPE, owner: 'anyone' }), /fields/);
});

test('source hashes bind exact text bytes including whitespace, Unicode and line endings', () => {
  for (const text of ['추가 지시', '  추가 지시  ', '첫줄\r\n둘째줄', '가']) {
    const good = instruction({ text, sourceSha256: SHA(text) });
    assert.equal(create(createState(), good).lesson.guidance, text);
    assert.throws(() => create(createState(), { ...good, text: text + ' ' }), /source hash/);
  }
  const input = instruction();
  for (const sourceSha256 of ['0'.repeat(64), input.sourceSha256.toUpperCase(), 'sha256:' + input.sourceSha256, '', null, 123]) {
    assert.throws(() => create(createState(), { ...input, sourceSha256 }), /source hash/);
  }
});

test('only opaque user sources and optional library/source/artifact record references are accepted', () => {
  for (const sourceRef of ['source:claimed-user', 'event:guessed', 'user:', 'https://example.invalid/message', 'user:two words', null]) {
    assert.throws(() => create(createState(), instruction({ sourceRef })), /source reference/);
  }
  for (const sourceRecordRef of ['event:result', 'user:other', 'sha256:' + 'a'.repeat(64), 'library:', 'source:two words', 'https://example.invalid', null]) {
    assert.throws(() => create(createState(), instruction({ sourceRecordRef })), /record reference/);
  }
  for (const prefix of ['library', 'source', 'artifact']) {
    const sourceRecordRef = prefix + ':synthetic-record';
    assert.equal(create(createState(), instruction({ sourceRecordRef })).instructionSummary.sourceRecordRef, sourceRecordRef);
  }
});

test('appliesTo and trusted host scope reject malformed, unknown and extra fields', () => {
  for (const appliesTo of [{}, { kind: 'all' }, { kind: 'all_jh_tasks', target_tool: 'life_status' },
    { kind: 'tool' }, { kind: 'tool', target_tool: '' }, { kind: 'tool', target_tool: '*' },
    { kind: 'tool', target_tool: 'https://example.invalid' }, { kind: 'tool', target_tool: 'life_status', target_mode: null },
    { kind: 'tool', target_tool: 'life_status', target_mode: '*' }, { kind: 'tool', target_tool: 'life_status', owner: 'other' }]) {
    assert.throws(() => create(createState(), instruction({ appliesTo })));
  }
  for (const scope of [{ ...COMMON_SCOPE, operation: '*' }, { ...COMMON_SCOPE, domain: 'anywhere' },
    { ...COMMON_SCOPE, owner: 'other' }, { ...COMMON_SCOPE, context: { platform: 'android', version: '1' } }]) {
    assert.throws(() => create(createState(), instruction(), SUITE, scope));
  }
});

test('known credential forms are rejected without leaking values or mutating existing state', () => {
  const state = createState(); const before = structuredClone(state);
  const credentials = ['Bearer ' + 'A'.repeat(32), 'sk-' + 'A'.repeat(32), 'sk-proj-' + 'A'.repeat(32),
    'ghp_' + 'A'.repeat(32), 'github_pat_' + 'A'.repeat(32),
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzeW50aGV0aWMifQ.c3ludGhldGljc2lnbmF0dXJl',
    '-----BEGIN PRIVATE KEY-----\nSYNTHETIC-NOT-A-KEY\n-----END PRIVATE KEY-----',
    '-----BEGIN RSA PRIVATE KEY-----\nSYNTHETIC-NOT-A-KEY\n-----END RSA PRIVATE KEY-----'];
  for (const credential of credentials) {
    const text = `Synthetic instruction prefix: ${credential} suffix.`;
    const input = instruction({ text, sourceSha256: SHA(text) }); const original = structuredClone(input);
    assert.throws(() => create(state, input), error => {
      assert.equal(error.message, 'Invalid instruction text');
      assert.equal(error.message.includes(credential), false);
      return true;
    });
    assert.deepEqual(state, before); assert.deepEqual(input, original);
  }
});

test('credential-shaped strings are rejected in every stored instruction field, including nested values', () => {
  const secret = 'ghp_' + 'A'.repeat(32);
  const state = addLesson(createState(), create().lesson); const before = structuredClone(state);
  const cases = [
    { sourceRef: 'user:' + secret },
    { sourceRecordRef: 'artifact:' + secret },
    { sourceRecordRef: 'library:' + secret },
    { sourceRecordRef: 'source:' + secret },
    { lessonId: secret },
    { ruleVersion: secret },
    { conflictKey: secret },
    { validFrom: secret },
    { validUntil: secret },
    { supersedes: [secret] },
    { appliesTo: { kind: 'tool', target_tool: secret } },
    { appliesTo: { kind: 'tool', target_tool: 'life_status', target_mode: secret } },
  ];
  for (const overrides of cases) {
    const input = instruction(overrides); const original = structuredClone(input);
    assert.throws(() => create(state, input), error => {
      assert.equal(error.message, 'Invalid instruction data');
      assert.equal(error.message.includes(secret), false);
      return true;
    });
    assert.deepEqual(state, before); assert.deepEqual(input, original);
  }
  for (const overrides of [{ text: secret, sourceSha256: SHA(secret) }, { sourceSha256: secret }]) {
    assert.throws(() => create(state, instruction(overrides)), error => {
      assert.equal(error.message.includes(secret), false);
      return true;
    });
    assert.deepEqual(state, before);
  }
});

test('empty, overlong, control-character and malformed Unicode instructions are rejected', () => {
  for (const text of ['', ' \n\t ', 'x'.repeat(2049), 'before\u0000after', 'before\u001bafter', 'before\u007fafter', '\ud800']) {
    assert.throws(() => create(createState(), instruction({ text, sourceSha256: SHA(text) })), /instruction text/);
  }
  const text = 'Keep credentials out of logs and check the Bearer header.';
  assert.equal(create(createState(), instruction({ text, sourceSha256: SHA(text) })).lesson.guidance, text);
});

test('same definition and suite are idempotent even when a different lesson ID is requested', () => {
  const first = create();
  const state = addLesson(createState(), first.lesson); const before = structuredClone(state);
  for (const lessonId of [first.lesson.id, 'owner-install-policy-duplicate']) {
    const again = create(state, instruction({ lessonId }));
    assert.equal(again.lesson.id, first.lesson.id);
    assert.equal(again.instructionSummary.duplicateLessonId, first.lesson.id);
    assert.equal(again.instructionSummary.existingLessonState, 'candidate');
    assert.equal(again.instructionSummary.definitionFingerprint, first.instructionSummary.definitionFingerprint);
    assert.deepEqual(addLesson(state, again.lesson), state);
  }
  assert.deepEqual(state, before);
});

test('a conflicting existing lesson ID is not silently redirected to another definition', () => {
  const original = create(); let state = addLesson(createState(), original.lesson);
  const text = 'Preserve the selected device.';
  const different = create(state, instruction({ lessonId: 'different-definition', text, sourceSha256: SHA(text) }));
  state = addLesson(state, different.lesson);
  assert.throws(() => create(state, instruction({ lessonId: 'different-definition' })), /Existing lesson differs/);
});

test('an existing instruction still deduplicates when lesson capacity has been reached', () => {
  const first = create(); const state = addLesson(createState(), first.lesson);
  for (let index = 1; index < 1000; index++) {
    const definition = { ...first.lesson, id: 'other-candidate-' + index, guidance: 'Different synthetic instruction ' + index };
    state.lessons[definition.id] = { ...bindRegression(definition, SUITE), state: 'candidate', advisoryOnly: true };
  }
  const again = create(state, instruction({ lessonId: 'duplicate-at-capacity' }));
  assert.equal(again.lesson.id, first.lesson.id);
  assert.equal(again.instructionSummary.duplicateLessonId, first.lesson.id);
  assert.equal(Object.keys(state.lessons).length, 1000);
});

test('quarantined identical instructions cannot be recreated under another ID or a weaker suite', async () => {
  const first = create(); let state = addLesson(createState(), first.lesson);
  const failed = await runRegression(first.lesson, SUITE, () => ({ passed: true, failed: [] }), { now: NOW });
  assert.equal(failed.report.failed, 1);
  state = evaluateLesson(state, first.lesson.id, failed.evaluation); const before = structuredClone(state);
  const weaker = { ...SUITE, cases: [SUITE.cases[0]] };
  for (const suite of [SUITE, weaker]) assert.throws(() => create(state, instruction({ lessonId: 'revive-instruction' }), suite), /cannot be revived/);
  assert.deepEqual(state, before);
});

test('actual native regression receipts bind the complete explicit instruction and metadata', async () => {
  const first = create(createState(), instruction({ conflictKey: 'install-policy', validFrom: NOW,
    validUntil: '2026-11-30T18:00:00.000Z' }));
  assert.equal(bindRegression(first.lesson, SUITE).inputFingerprint, first.lesson.inputFingerprint);
  const result = await runRegression(first.lesson, first.suite, evaluateConstraints, { now: NOW });
  assert.equal(result.report.passed, 2);
  const active = evaluateLesson(addLesson(createState(), first.lesson), first.lesson.id, result.evaluation);
  assert.equal(active.lessons[first.lesson.id].state, 'active');
  assert.equal(recallContext(active, COMMON_SCOPE, { now: NOW }).lessons.length, 1);
  const changedText = instruction().text + ' 결과도 확인합니다.';
  const changed = create(createState(), instruction({ lessonId: 'changed-instruction', text: changedText, sourceSha256: SHA(changedText) }));
  assert.notEqual(changed.lesson.inputFingerprint, first.lesson.inputFingerprint);
  assert.throws(() => evaluateLesson(addLesson(createState(), changed.lesson), changed.lesson.id, result.evaluation), /does not match/);
  assert.deepEqual(active.events, {}); assert.deepEqual(active.proposals, {}); assert.deepEqual(active.attempts, {});
});

test('explicit replacement validates scope and targets but leaves old guidance unchanged until checked', async () => {
  const old = create(); const passed = await runRegression(old.lesson, SUITE, evaluateConstraints, { now: NOW });
  const state = evaluateLesson(addLesson(createState(), old.lesson), old.lesson.id, passed.evaluation); const before = structuredClone(state);
  const text = '기존 앱을 유지하고 설치 결과를 확인합니다.';
  const replacement = instruction({ lessonId: 'replacement-policy', ruleVersion: '2', text, sourceSha256: SHA(text),
    supersedes: [old.lesson.id], conflictKey: 'install-policy' });
  const candidate = create(state, replacement);
  assert.deepEqual(candidate.lesson.supersedes, [old.lesson.id]);
  assert.deepEqual(state, before);
  assert.deepEqual(recallContext(addLesson(state, candidate.lesson), COMMON_SCOPE, { now: NOW }).lessons.map(item => item.id), [old.lesson.id]);
  assert.throws(() => create(state, { ...replacement, supersedes: ['missing'] }), /already exist/);
  assert.throws(() => create(state, replacement, SUITE, TOOL_SCOPE), /scope/);
});

test('executable getters, proxies and malformed suites cannot be invoked as instruction data', () => {
  let invoked = false; const input = instruction();
  Object.defineProperty(input, 'text', { enumerable: true, get() { invoked = true; return 'unsafe'; } });
  assert.throws(() => create(createState(), input)); assert.equal(invoked, false);
  const proxy = new Proxy(instruction(), { getPrototypeOf() { invoked = true; return Object.prototype; } });
  assert.throws(() => create(createState(), proxy)); assert.equal(invoked, false);
  const suite = { ...SUITE }; Object.defineProperty(suite, 'cases', { enumerable: true, get() { invoked = true; return SUITE.cases; } });
  assert.throws(() => create(createState(), instruction(), suite)); assert.equal(invoked, false);
  assert.throws(() => create(createState(), instruction(), { ...SUITE, cases: [] }));
});
