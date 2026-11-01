import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { z } from 'zod';
import { createServerLearning } from './server-runtime.mjs';
import { FileLearningStore } from './store.mjs';
import { addLesson, ingest, propose } from './engine.mjs';
import { registerLearningTools } from './mcp-tools.mjs';

// Every event, owner, decision and result in this file is synthetic and local.
// These tests do not classify actual user proposals or dispatch device actions.
const NOW = '2026-11-01T02:00:00.000Z';
const CONTEXT = { platform: 'server', version: 'fixture-v1', environment: 'decision-runtime-test' };
const SCOPE = { domain: 'output', operation: 'life_output_format.table', engine: 'jh-server', context: CONTEXT };

async function setup(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'jh-decision-runtime-'));
  const file = path.join(directory, 'memory.json');
  const ownerScope = 'synthetic-decision-owner';
  const options = { file, ownerScope, runtimeId: 'synthetic-decision-runtime', context: CONTEXT, clock: () => NOW };
  const controllers = [];
  const controller = async (overrides = {}) => {
    const runtime = await createServerLearning({ ...options, ...overrides });
    controllers.push(runtime);
    return runtime;
  };
  t.after(async () => {
    for (const runtime of controllers) await runtime.close();
    await rm(directory, { recursive: true, force: true });
  });
  return { file, ownerScope, runtime: await controller(), controller,
    store: new FileLearningStore({ file, ownerScope }) };
}

function event(id, extra = {}) {
  return { ...structuredClone(SCOPE), eventId: 'decision-fixture-' + id, taskId: 'decision-task-' + id,
    attemptId: 'decision-attempt-' + id, sequence: 1, timestamp: NOW,
    outcome: 'failure_verified', source: 'host_verified', errorCode: 'SYNTHETIC_OUTPUT_FAILURE',
    evidenceRefs: ['fixture:decision-' + id], ...extra };
}

async function seed(store, prefix = 'initial') {
  const result = await store.transact(state => {
    for (let index = 0; index < 2; index++) state = ingest(state, event(prefix + '-' + index)).state;
    return propose(state, { now: NOW });
  });
  assert.equal(result.proposals.length, 1, 'fixture must use the real proposal generator');
  assert.equal(result.proposals[0].kind, 'rule_fix');
  return result.proposals[0].id;
}

async function inputFor(runtime, proposalId, decisionId, decision = 'accept') {
  const prepared = await runtime.review('PREPARE', { proposalId });
  assert.equal(prepared.ok, true);
  const packet = prepared.packet;
  return { proposalId, decisionId, decision, expectedRevision: packet.baseRevision,
    packetFingerprint: packet.packetFingerprint, maxAttempts: packet.maxAttempts,
    reviewer: 'user', sourceRef: 'user:synthetic-decision-' + decisionId,
    reason: 'Synthetic owner selected the next improvement priority.',
    eventIds: packet.attempts.map(item => item.eventId) };
}

function response(value = { ok: true, signed: 'ORIGINAL_RESULT' }) {
  return { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value };
}

function targetCall(id) {
  return { name: 'life_output_format', mode: 'TABLE', commandId: 'synthetic-command-' + id,
    requestId: 'synthetic-request-' + id };
}

function assertNoExperienceChange(before, after) {
  for (const field of ['events', 'attempts', 'lessons']) assert.deepEqual(after[field], before[field], field);
}

function assertDecisionFlags(result) {
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'DECIDE');
  assert.equal(result.externalEffects, false);
  assert.equal(result.activatedByThisCall, false);
  assert.equal(result.liveExecutionVerified, false);
}

test('runtime acceptance persists only the selected proposal and does not activate a registered candidate', async t => {
  const { file, runtime, store } = await setup(t);
  const proposalId = await seed(store);
  const candidate = { id: 'synthetic-unchecked-candidate', ...structuredClone(SCOPE),
    ruleVersion: '1', inputFingerprint: 'd'.repeat(64), guidance: 'Synthetic candidate still requires its own regression.',
    evidenceRefs: ['fixture:unchecked-candidate'] };
  await store.transact(state => addLesson(state, candidate));
  const input = await inputFor(runtime, proposalId, 'accept-priority');
  const before = await store.read();
  const result = await runtime.review('DECIDE', input);
  assertDecisionFlags(result);
  assert.equal(result.duplicate, false);
  assert.equal(result.proposal.id, proposalId);
  assert.equal(result.proposal.status, 'accepted');
  assert.equal(result.receipt.fromStatus, 'open');
  assert.equal(result.receipt.toStatus, 'accepted');
  assert.equal(result.receipt.timestamp, NOW);
  assert.equal(result.receipt.reviewer, 'user');
  const after = await store.read();
  assert.equal(after.revision, before.revision + 1);
  assert.equal(result.revision, after.revision);
  assertNoExperienceChange(before, after);
  assert.equal(after.lessons[candidate.id].state, 'candidate');
  assert.equal(after.proposals[proposalId].verification, undefined);
  assert.deepEqual(after.proposals[proposalId].decisionHistory, [result.receipt]);
  assert.equal(JSON.parse(await readFile(file, 'utf8')).ownerScope, 'synthetic-decision-owner');
  assert.deepEqual((await runtime.context({ target_tool: 'life_output_format', target_mode: 'TABLE' })).lessons, []);
  const status = await runtime.status();
  assert.equal(status.apiVersion, 3);
  assert.equal(status.capabilities.proposalDecisions, true);
  const summary = status.proposals.find(item => item.id === proposalId).latestDecision;
  assert.equal(summary.decisionId, input.decisionId);
  assert.equal(summary.toStatus, 'accepted');
  assert.equal(Object.hasOwn(summary, 'reason'), false);
  assert.equal(Object.hasOwn(summary, 'eventIds'), false);
});

test('read-only decision view retrieves a dismissed proposal and both receipts without changing memory', async t => {
  const { file, runtime, store, controller } = await setup(t);
  const proposalId = await seed(store);
  const accepted = await runtime.review('DECIDE', await inputFor(runtime, proposalId, 'view-accept'));
  const dismissed = await runtime.review('DECIDE', await inputFor(runtime, proposalId, 'view-dismiss', 'dismiss'));
  const baseline = await readFile(file, 'utf8');
  const other = await controller();
  const result = await other.review('PREPARE', { view: 'decision', proposalId });
  assert.equal(result.ok, true);
  assert.equal(result.externalEffects, false);
  assert.equal(result.view.schema, 'jh.learning-proposal-decision-view.v1');
  assert.equal(result.view.proposalId, proposalId);
  assert.equal(result.view.currentStatus, 'dismissed');
  assert.deepEqual(result.view.allowedDecisions, []);
  assert.deepEqual(result.view.decisionHistory, [accepted.receipt, dismissed.receipt]);
  assert.equal(result.view.latestDecision.decisionId, 'view-dismiss');
  assert.equal(result.view.readOnly, true);
  assert.equal(result.view.externalEffects, false);
  assert.equal(result.view.liveExecutionVerified, false);
  assert.equal(await readFile(file, 'utf8'), baseline);
  assert.equal((await other.status()).activity.calls, 0);
});

test('an exact old decision retry returns its receipt without undoing a later dismissal', async t => {
  const { file, runtime, store, controller } = await setup(t);
  const proposalId = await seed(store);
  const originalInput = await inputFor(runtime, proposalId, 'original-accept');
  const accepted = await runtime.review('DECIDE', originalInput);
  await runtime.review('DECIDE', await inputFor(runtime, proposalId, 'later-dismiss', 'dismiss'));
  await runtime.close();
  const restarted = await controller();
  const baseline = await readFile(file, 'utf8');
  const result = await restarted.review('DECIDE', originalInput);
  assertDecisionFlags(result);
  assert.equal(result.duplicate, true);
  assert.deepEqual(result.receipt, accepted.receipt);
  assert.equal(result.proposal.status, 'dismissed');
  assert.equal(result.revision, (await store.read()).revision);
  assert.equal(await readFile(file, 'utf8'), baseline);
  assert.equal((await store.read()).proposals[proposalId].decisionHistory.length, 2);
});

test('concurrent distinct decisions share the store revision guard and cannot overwrite one another', async t => {
  const { runtime, store, controller } = await setup(t);
  const proposalId = await seed(store);
  const other = await controller();
  const accept = await inputFor(runtime, proposalId, 'race-accept');
  const dismiss = { ...accept, decisionId: 'race-dismiss', decision: 'dismiss', sourceRef: 'user:synthetic-race-dismiss' };
  const before = await store.read();
  const results = await Promise.allSettled([runtime.review('DECIDE', accept), other.review('DECIDE', dismiss)]);
  const successes = results.filter(item => item.status === 'fulfilled' && item.value.ok === true);
  assert.equal(successes.length, 1);
  const failure = results.find(item => item.status === 'rejected' || item.value.ok !== true);
  assert.equal(failure.status === 'rejected' ? failure.reason.code : failure.value.code, 'LEARNING_REVISION_CONFLICT');
  const after = await store.read();
  assert.equal(after.revision, before.revision + 1);
  assertNoExperienceChange(before, after);
  assert.equal(after.proposals[proposalId].status, successes[0].value.proposal.status);
  assert.deepEqual(after.proposals[proposalId].decisionHistory, [successes[0].value.receipt]);
});

test('concurrent retries of the same decision commit once and return the same persisted receipt', async t => {
  const { runtime, store, controller } = await setup(t);
  const proposalId = await seed(store);
  const other = await controller();
  const input = await inputFor(runtime, proposalId, 'same-decision');
  const inputSnapshot = structuredClone(input);
  const before = await store.read();
  const results = await Promise.all([runtime.review('DECIDE', input), other.review('DECIDE', input)]);
  results.forEach(assertDecisionFlags);
  assert.deepEqual(results.map(item => item.duplicate).sort(), [false, true]);
  assert.deepEqual(results[0].receipt, results[1].receipt);
  assert.deepEqual(input, inputSnapshot);
  const after = await store.read();
  assert.equal(after.revision, before.revision + 1);
  assertNoExperienceChange(before, after);
  assert.deepEqual(after.proposals[proposalId].decisionHistory, [results[0].receipt]);
});

test('a decision committed by another controller during a target call suppresses stale advice and preserves its result', async t => {
  const { runtime, store, controller } = await setup(t);
  const proposalId = await seed(store);
  const other = await controller();
  let release, entered;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  const original = response();
  let executions = 0;
  const pending = runtime.invoke(targetCall('in-flight'), async () => {
    executions++;
    entered();
    await gate;
    return original;
  });
  await started;
  let decided;
  try {
    decided = await other.review('DECIDE', await inputFor(other, proposalId, 'while-running-dismiss', 'dismiss'));
  } finally { release(); }
  const result = await pending;
  assert.strictEqual(result, original);
  assert.equal(executions, 1);
  const after = await store.read();
  assert.equal(Object.keys(after.events).length, 3, 'only the one target observation is added to the two seed events');
  assert.equal(Object.values(after.attempts).filter(item => item.outcome === 'observed').length, 1);
  assert.equal(after.proposals[proposalId].status, 'dismissed');
  assert.deepEqual(after.proposals[proposalId].decisionHistory, [decided.receipt]);
  assert.equal((await runtime.status()).degraded, false);
});

test('new evidence and process restart preserve handled proposal history and suppress its later automatic advice', async t => {
  for (const decision of ['accept', 'dismiss']) {
    const { runtime, store, controller } = await setup(t);
    const proposalId = await seed(store, decision);
    const result = await runtime.review('DECIDE', await inputFor(runtime, proposalId, decision + '-restart', decision));
    await runtime.close();
    await store.transact(state => propose(ingest(state, event(decision + '-new-independent-task')).state, { now: NOW }));
    const restarted = await controller();
    const original = response();
    assert.strictEqual(await restarted.invoke(targetCall(decision + '-after-restart'), () => original), original);
    const after = await store.read();
    assert.equal(Object.keys(after.proposals).length, 1);
    assert.equal(after.proposals[proposalId].status, decision === 'accept' ? 'accepted' : 'dismissed');
    assert.equal(after.proposals[proposalId].independentTaskCount, 3);
    assert.deepEqual(after.proposals[proposalId].decisionHistory, [result.receipt]);
    assert.equal((await restarted.status()).availableAdvice.proposals, 0);
  }
});

test('MCP decision failures redact invalid input and preserve memory, including revision and identifier conflicts', async t => {
  const { file, runtime, store } = await setup(t);
  const proposalId = await seed(store);
  const input = await inputFor(runtime, proposalId, 'validation');
  const registered = new Map();
  registerLearningTools({ z, textResult: value => value, getController: () => runtime,
    registerOAuthTool: (name, config, handler) => registered.set(name, handler) });
  const invoke = value => registered.get('life_learning_review')({ mode: 'DECIDE', payload: JSON.stringify(value) });
  const baseline = await readFile(file, 'utf8');
  const mutations = [
    value => { value.ownerScope = 'another-owner'; },
    value => { value.scope = { ...SCOPE, domain: 'device' }; },
    value => { value.status = 'verified'; },
    value => { value.decision = 'verified'; },
    value => { value.reason = 'Bearer ' + 'X'.repeat(32); },
  ];
  for (const mutate of mutations) {
    const invalid = structuredClone(input);
    mutate(invalid);
    const result = await invoke(invalid);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'LEARNING_REQUEST_INVALID');
    assert.equal(result.replayAllowed, false);
    assert.equal(JSON.stringify(result).includes('X'.repeat(32)), false);
    assert.equal(await readFile(file, 'utf8'), baseline);
  }
  const changedPacket = await invoke({ ...input, packetFingerprint: 'f'.repeat(64) });
  assert.equal(changedPacket.ok, false);
  assert.equal(changedPacket.code, 'LEARNING_DECISION_CONFLICT');
  assert.equal(changedPacket.replayAllowed, false);
  assert.equal(await readFile(file, 'utf8'), baseline);
  assert.equal((await invoke(input)).ok, true);
  const accepted = await readFile(file, 'utf8');
  assert.equal((await invoke({ ...input, reason: 'A conflicting meaning under the same identifier.' })).code, 'LEARNING_DECISION_CONFLICT');
  assert.equal((await invoke({ ...input, decisionId: 'new-stale-identifier' })).code, 'LEARNING_REVISION_CONFLICT');
  assert.equal(await readFile(file, 'utf8'), accepted);
});

test('a runtime bound to a different owner cannot decide or read the existing owner proposal', async t => {
  const { file, runtime, store, controller } = await setup(t);
  const proposalId = await seed(store);
  const input = await inputFor(runtime, proposalId, 'wrong-owner');
  const baseline = await readFile(file, 'utf8');
  const wrongOwner = await controller({ ownerScope: 'other-synthetic-owner' });
  for (const [mode, payload] of [['DECIDE', input], ['PREPARE', { view: 'decision', proposalId }]]) {
    const result = await wrongOwner.review(mode, payload);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'LEARNING_UNAVAILABLE');
    assert.equal(result.replayAllowed, false);
  }
  assert.equal(await readFile(file, 'utf8'), baseline);
  assert.equal((await wrongOwner.status()).degraded, true);
});

test('the observer excludes decision calls from experience counts and returns the original MCP envelope', async t => {
  const { runtime, store } = await setup(t);
  const proposalId = await seed(store);
  const input = await inputFor(runtime, proposalId, 'observer-exclusion');
  const before = await store.read();
  let executions = 0;
  for (let index = 0; index < 2; index++) {
    let original;
    const result = await runtime.invoke({ name: 'life_learning_review', mode: 'DECIDE',
      commandId: 'synthetic-decision-command', requestId: 'synthetic-decision-request-' + index }, async () => {
      executions++;
      original = response(await runtime.review('DECIDE', input));
      return original;
    });
    assert.strictEqual(result, original);
    assert.equal(result.content.length, 1);
    assert.equal(result.structuredContent.duplicate, index === 1);
  }
  assert.equal(executions, 2, 'each explicitly received metadata request runs its handler once');
  const after = await store.read();
  assert.equal(after.revision, before.revision + 1);
  assertNoExperienceChange(before, after);
  assert.equal(after.proposals[proposalId].decisionHistory.length, 1);
  const status = await runtime.status();
  assert.equal(status.activity.calls, 2);
  assert.equal(status.activity.recorded, 0);
  assert.equal(status.degraded, false);
});
