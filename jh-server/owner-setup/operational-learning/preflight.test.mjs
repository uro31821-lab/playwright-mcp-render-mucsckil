import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { z } from 'zod';
import { FileLearningStore } from './store.mjs';
import { ingest, propose } from './engine.mjs';
import { checkLesson } from './regression.mjs';
import { evaluateConstraints } from './constraints.mjs';
import { createServerLearning } from './server-runtime.mjs';
import { registerLearningTools } from './mcp-tools.mjs';
import { execute } from './cli.mjs';

const NOW = '2026-10-31T13:45:00.000Z';
const context = { platform: 'jh-mcp', version: 'server-learning-v1', environment: 'owner-service' };
const scope = { domain: 'output', operation: 'life_output_format', engine: 'jh-server', context };
const suite = { id: 'source-required', version: '1', cases: [
  { id: 'present', input: { value: { source: 'fixture:source' }, constraints: [{ path: ['source'], op: 'exists' }] }, expected: { passed: true, failed: [] } },
  { id: 'absent', input: { value: {}, constraints: [{ path: ['source'], op: 'exists' }] }, expected: { passed: false, failed: [0] } },
] };
// Synthetic owner attestation; no external record or ordinary chat is read by these tests.
function explicitInstruction(lessonId, appliesTo = { kind: 'all_jh_tasks' }, text = 'Keep verified evidence with every JH result before reporting success.') {
  return { lessonId, ruleVersion: '1', text, sourceRef: 'user:synthetic-explicit-instruction',
    sourceSha256: createHash('sha256').update(text, 'utf8').digest('hex'), appliesTo,
    confirmation: 'explicit_user_instruction', sourceRecordRef: 'artifact:synthetic-instruction-record' };
}
async function setup(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'jh-learning-preflight-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'memory.json'), ownerScope = 'synthetic-owner';
  const store = new FileLearningStore({ file, ownerScope });
  const runtime = await createServerLearning({ file, ownerScope, runtimeId: 'synthetic-preflight', context, clock: () => NOW });
  t.after(() => runtime.close());
  return { file, ownerScope, store, runtime };
}

test('preflight returns relevant verified advice before any target handler and does not record a new attempt', async t => {
  const { file, store, runtime } = await setup(t);
  const lesson = { id: 'output-source-v1', ...scope, guidance: 'Include a verified source reference.',
    ruleVersion: '1', evidenceRefs: ['fixture:review'], memoryKind: 'procedure', provenance: 'user_explicit' };
  await checkLesson(store, lesson, suite, evaluateConstraints, { now: NOW });
  const before = await readFile(file, 'utf8');
  const result = await runtime.context({ target_tool: 'life_output_format' });
  assert.equal(result.delivery, 'before_execution');
  assert.equal(result.targetExecuted, false);
  assert.equal(result.lessons[0].id, lesson.id);
  assert.equal(result.lessons[0].provenance, 'user_explicit');
  assert.deepEqual(result.scope, scope);
  assert.equal((await runtime.context({ target_tool: 'life_android_open' })).lessons.length, 0);
  assert.equal((await runtime.context({ target_tool: 'life_output_format', target_mode: 'TABLE' })).lessons.length, 0);
  assert.equal(await readFile(file, 'utf8'), before);
  assert.equal((await runtime.status()).activity.calls, 0);
  await assert.rejects(runtime.context({ target_tool: 'life_output_format', ownerScope: 'other-owner' }));
  await assert.rejects(runtime.context({ target_tool: 'https://private.invalid/' }));
});

test('review packet to stored inference to real regression is revision guarded and never claims live success', async t => {
  const { store, runtime } = await setup(t);
  let proposalId;
  await store.transact(state => {
    for (let n = 1; n <= 2; n++) state = ingest(state, { eventId: 'correction-' + n, taskId: 'task-' + n,
      attemptId: 'attempt-' + n, sequence: 1, timestamp: NOW, ...scope,
      outcome: 'correction', source: 'user_explicit', errorCode: 'SOURCE_MISSING', evidenceRefs: ['fixture:case-' + n] }).state;
    const result = propose(state, { now: NOW }); proposalId = result.proposals[0].id;
    return result;
  });
  const prepared = await runtime.review('PREPARE', { proposalId });
  const packet = prepared.packet;
  const review = { proposalId, baseRevision: packet.baseRevision, packetFingerprint: packet.packetFingerprint,
    maxAttempts: packet.maxAttempts, lessonId: 'source-rule-candidate', ruleVersion: '1',
    scope: packet.proposal.scope, cause: 'The result formatter omitted a source field.',
    resolution: 'Require the verified source field in the result contract.',
    expectedEffect: 'Prevent the recorded omission; savings are not measured.',
    guidance: 'Include a verified source reference.',
    eventIds: packet.attempts.filter(item => item.candidateEvidenceEligible).map(item => item.eventId), reviewer: 'agent' };
  const registered = new Map();
  registerLearningTools({ z, textResult: value => value, getController: () => runtime,
    registerOAuthTool: (name, config, handler) => registered.set(name, handler) });
  const beforeRejected = await store.read();
  const rejected = await registered.get('life_learning_review')({ mode: 'CANDIDATE',
    payload: JSON.stringify({ review: { ...review, cause: 'Bearer ' + 'X'.repeat(32) }, suite }) });
  assert.equal(rejected.code, 'LEARNING_REQUEST_INVALID');
  assert.deepEqual(await store.read(), beforeRejected);
  assert.equal(JSON.stringify(rejected).includes('X'.repeat(32)), false);
  const candidate = await runtime.review('CANDIDATE', { review, suite });
  assert.equal(candidate.lesson.state, 'candidate');
  assert.equal(candidate.lesson.provenance, 'model_inferred');
  assert.equal(candidate.lesson.reflection.assessment, 'reviewed_inference');
  assert.equal((await runtime.context({ target_tool: 'life_output_format' })).lessons.length, 0);
  await assert.rejects(runtime.review('CANDIDATE', { review, suite }));
  const stale = await runtime.review('CHECK', { lesson: candidate.lesson, suite, expectedRevision: review.baseRevision });
  assert.equal(stale.code, 'LEARNING_REVISION_CONFLICT');
  const checked = await runtime.review('CHECK', { lesson: candidate.lesson, suite, expectedRevision: candidate.revision });
  assert.equal(checked.report.passed, 2);
  assert.equal(checked.lessonState, 'active');
  assert.equal(checked.liveExecutionVerified, false);
  assert.equal(checked.validationScope, 'json_contract');
  assert.equal((await runtime.context({ target_tool: 'life_output_format' })).lessons[0].id, candidate.lesson.id);
  await assert.rejects(runtime.review('CHECK', { lesson: { ...candidate.lesson, guidance: 'Changed rule' }, suite,
    expectedRevision: checked.revision }));
  const stored = await store.read();
  assert.equal(Object.keys(stored.events).length, 2);
  assert.equal(stored.proposals[proposalId].status, 'open');
});

test('MCP memory tools retain schemas and expose no target-execution or owner selector', async () => {
  const registered = new Map(), calls = [];
  registerLearningTools({ z, textResult: value => value,
    getController: () => ({ context: input => { calls.push(input); return { ok: true }; }, review: (mode, input) => ({ mode, input }) }),
    registerOAuthTool: (name, config, handler) => registered.set(name, { config, handler }) });
  assert.deepEqual([...registered.keys()], ['life_learning_context', 'life_learning_review',
    'life_learning_host_context', 'life_learning_host_task', 'life_learning_host_observe']);
  const read = registered.get('life_learning_context');
  assert.equal(read.config.annotations.readOnlyHint, true);
  assert.equal(read.config.description.includes('begin a phone command'), true);
  assert.equal(read.config.inputSchema.ownerScope, undefined);
  assert.equal(await read.handler({ target_tool: 'life_output_format' }).then(x => x.ok), true);
  const edit = registered.get('life_learning_review');
  assert.equal(edit.config.annotations.readOnlyHint, false);
  assert.equal((await edit.handler({ mode: 'CHECK', payload: '{bad json' })).code, 'LEARNING_REQUEST_INVALID');
  assert.equal((await edit.handler({ mode: 'CHECK', payload: '[]' })).code, 'LEARNING_REQUEST_INVALID');
  assert.equal(edit.config.inputSchema.payload.safeParse('x'.repeat(65537)).success, false);
  const hostRead = registered.get('life_learning_host_context');
  const hostWrite = registered.get('life_learning_host_observe');
  assert.equal(hostRead.config.annotations.readOnlyHint, true);
  assert.equal(hostWrite.config.annotations.readOnlyHint, false);
  assert.equal(hostWrite.config.annotations.idempotentHint, true);
  assert.equal(hostWrite.config.inputSchema.payload.safeParse('x'.repeat(16385)).success, false);
  for (const name of ['life_learning_host_context', 'life_learning_host_task', 'life_learning_host_observe']) {
    for (const field of ['owner', 'ownerScope', 'file', 'engine', 'context'])
      assert.equal(registered.get(name).config.inputSchema[field], undefined);
  }
  assert.equal(calls.length, 1);
});

test('CLI context and trajectory regression use the same persisted engine with a bound evaluator identity', async t => {
  const { file, ownerScope } = await setup(t);
  const flags = ['--store', file, '--owner', ownerScope];
  const trajectorySuite = JSON.parse(await readFile(new URL('./fixtures/learning-trajectories.json', import.meta.url), 'utf8'));
  const lesson = { id: 'trajectory-policy', ...scope, guidance: 'Verify actual trace order, count and evidence before reporting success.',
    ruleVersion: '1', evidenceRefs: ['fixture:synthetic-trajectories'], memoryKind: 'procedure', provenance: 'model_inferred' };
  const checked = await execute(['check', ...flags], { lesson, suite: trajectorySuite });
  assert.equal(checked.report.passed, trajectorySuite.cases.length);
  assert.equal(checked.report.failed, 0);
  const recalled = await execute(['context', ...flags], { query: scope, options: { now: NOW, limit: 2, maxChars: 1000 } });
  assert.equal(recalled.lessons[0].id, lesson.id);
  await assert.rejects(execute(['check', ...flags], { lesson, suite: { ...trajectorySuite, evaluator: 'run-shell' } }));
});

test('explicit owner instructions remain candidates until CHECK and then apply across JH target scopes', async t => {
  const { file, store, runtime } = await setup(t);
  const instruction = explicitInstruction('explicit-common-v1');
  const initial = await store.read();
  const status = await runtime.status();
  assert.equal(status.apiVersion, 3);
  assert.equal(status.capabilities.explicitInstructions, true);
  assert.equal(status.capabilities.commonRules, true);
  const candidate = await runtime.review('CANDIDATE', { instruction, suite, expectedRevision: initial.revision });
  assert.equal(candidate.ok, true);
  assert.equal(candidate.lesson.state, 'candidate');
  assert.equal(candidate.lesson.provenance, 'user_explicit');
  assert.equal(candidate.lesson.guidance, instruction.text);
  assert.equal(candidate.lesson.domain, 'orchestration');
  assert.equal(candidate.lesson.operation, 'jh.common.rules');
  assert.equal(candidate.lesson.engine, 'jh-server');
  assert.deepEqual(candidate.lesson.context, context);
  assert.equal(candidate.activatedByThisCall, false);
  assert.equal(candidate.externalEffects, false);
  assert.equal(candidate.instructionSummary.sourceAuthentication, 'authenticated_owner_attestation');
  for (const reference of [instruction.sourceRef, 'sha256:' + instruction.sourceSha256, instruction.sourceRecordRef]) {
    assert.ok(candidate.lesson.evidenceRefs.includes(reference));
  }
  for (const target_tool of ['life_status', 'life_android_open']) {
    const inactive = await runtime.context({ target_tool });
    assert.deepEqual(inactive.lessons, []);
    assert.equal(inactive.targetExecuted, false);
  }
  const checked = await runtime.review('CHECK', { lesson: candidate.lesson, suite,
    expectedRevision: candidate.revision });
  assert.equal(checked.ok, true);
  assert.equal(checked.lessonState, 'active');
  assert.equal(checked.report.passed, suite.cases.length);
  assert.equal(checked.liveExecutionVerified, false);
  assert.equal(checked.externalEffects, false);
  const afterCheck = await readFile(file, 'utf8');
  for (const query of [{ target_tool: 'life_status' },
    { target_tool: 'life_android_open', target_mode: 'SCROLL_ONCE' }]) {
    const recalled = await runtime.context(query);
    assert.equal(recalled.ok, true);
    assert.equal(recalled.delivery, 'before_execution');
    assert.equal(recalled.targetExecuted, false);
    assert.equal(recalled.externalEffects, false);
    assert.equal(recalled.librarySync, 'not_connected');
    assert.equal(recalled.lessons.length, 1);
    assert.equal(recalled.lessons[0].id, instruction.lessonId);
    assert.equal(recalled.lessons[0].guidance, instruction.text);
    assert.equal(recalled.lessons[0].provenance, 'user_explicit');
    assert.equal(recalled.lessons[0].appliesTo, 'all_jh_tasks');
    for (const reference of [instruction.sourceRef, 'sha256:' + instruction.sourceSha256, instruction.sourceRecordRef]) {
      assert.ok(recalled.lessons[0].evidenceRefs.includes(reference));
    }
  }
  assert.equal(await readFile(file, 'utf8'), afterCheck);
  const stored = await store.read();
  for (const key of ['events', 'attempts', 'proposals']) assert.deepEqual(stored[key], initial[key]);
  assert.equal((await runtime.status()).activity.calls, 0);
});

test('explicit tool instructions preserve exact tool and mode isolation', async t => {
  const { store, runtime } = await setup(t);
  const instruction = explicitInstruction('explicit-table-v1',
    { kind: 'tool', target_tool: 'life_output_format', target_mode: 'TABLE' },
    'Keep the requested table fields in their given order.');
  const initial = await store.read();
  const candidate = await runtime.review('CANDIDATE', { instruction, suite, expectedRevision: initial.revision });
  assert.equal(candidate.lesson.domain, 'output');
  assert.equal(candidate.lesson.operation, 'life_output_format.table');
  assert.deepEqual((await runtime.context({ target_tool: 'life_output_format', target_mode: 'TABLE' })).lessons, []);
  const checked = await runtime.review('CHECK', { lesson: candidate.lesson, suite, expectedRevision: candidate.revision });
  assert.equal(checked.lessonState, 'active');
  const exact = await runtime.context({ target_tool: 'life_output_format', target_mode: 'TABLE' });
  assert.equal(exact.lessons.length, 1);
  assert.equal(exact.lessons[0].id, instruction.lessonId);
  assert.equal(exact.lessons[0].appliesTo, 'target_operation');
  for (const query of [{ target_tool: 'life_output_format' },
    { target_tool: 'life_output_format', target_mode: 'SUMMARY' },
    { target_tool: 'life_android_open', target_mode: 'TABLE' }, { target_tool: 'life_status' }]) {
    assert.deepEqual((await runtime.context(query)).lessons, []);
  }
  const stored = await store.read();
  for (const key of ['events', 'attempts', 'proposals']) assert.deepEqual(stored[key], initial[key]);
});

test('explicit instruction MCP rejects mismatched source, credentials, selectors, ambiguous branches and stale revisions without writes', async t => {
  const { file, store, runtime } = await setup(t);
  const registered = new Map();
  registerLearningTools({ z, textResult: value => value, getController: () => runtime,
    registerOAuthTool: (name, config, handler) => registered.set(name, handler) });
  const original = explicitInstruction('explicit-existing-v1');
  const first = await runtime.review('CANDIDATE', { instruction: original, suite,
    expectedRevision: (await store.read()).revision });
  const baseline = await readFile(file, 'utf8');
  const before = await store.read();
  const candidatePayload = () => ({ instruction: explicitInstruction('explicit-invalid-v1'), suite,
    expectedRevision: first.revision });
  const mutations = [
    value => { value.instruction.text += ' Altered after hashing.'; },
    value => { value.instruction.sourceSha256 = 'f'.repeat(64); },
    value => { value.instruction.sourceRef = 'event:cannot-attest-user-instruction'; },
    value => { value.instruction.sourceRef = 'user:ghp_' + 'X'.repeat(32); },
    value => { value.instruction.sourceRecordRef = 'artifact:ghp_' + 'X'.repeat(32); },
    value => { value.instruction.confirmation = 'inferred_user_instruction'; },
    value => {
      value.instruction.text = 'Bearer ' + 'X'.repeat(32);
      value.instruction.sourceSha256 = createHash('sha256').update(value.instruction.text, 'utf8').digest('hex');
    },
    value => { value.ownerScope = 'different-owner'; },
    value => { value.instruction.ownerScope = 'different-owner'; },
    value => { value.instruction.provenance = 'host_verified'; },
    value => { value.instruction.arbitrary = 'ignored-input'; },
    value => { value.instruction.appliesTo.target_tool = 'life_status'; },
    value => { value.instruction.appliesTo = { kind: 'exact_scope' }; },
    value => { value.instruction.sourceRecordRef = 'https://private.invalid/raw-record'; },
    value => { value.review = {}; },
  ];
  for (const mutate of mutations) {
    const payload = candidatePayload(); mutate(payload);
    const result = await registered.get('life_learning_review')({ mode: 'CANDIDATE', payload: JSON.stringify(payload) });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'LEARNING_REQUEST_INVALID');
    assert.equal(result.replayAllowed, false);
    assert.equal(JSON.stringify(result).includes('X'.repeat(32)), false);
    assert.equal(await readFile(file, 'utf8'), baseline);
  }
  const stale = candidatePayload(); stale.expectedRevision = first.revision - 1;
  const rejected = await registered.get('life_learning_review')({ mode: 'CANDIDATE', payload: JSON.stringify(stale) });
  assert.equal(rejected.code, 'LEARNING_REVISION_CONFLICT');
  assert.equal(rejected.replayAllowed, false);
  assert.equal(await readFile(file, 'utf8'), baseline);
  assert.deepEqual(await store.read(), before);
  assert.equal((await runtime.status()).activity.calls, 0);
});
