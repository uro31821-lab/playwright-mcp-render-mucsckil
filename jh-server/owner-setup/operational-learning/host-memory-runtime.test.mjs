import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, readFile, rm, writeFile, unlink } from 'node:fs/promises';
import { z } from 'zod';
import { FileLearningStore } from './store.mjs';
import { createServerLearning } from './server-runtime.mjs';
import { registerLearningTools } from './mcp-tools.mjs';

const NOW = '2026-11-01T13:30:00.000Z';
const context = { platform: 'jh-mcp', version: 'server-learning-v1', environment: 'owner-service' };
const query = { domain: 'development', operation: 'memory.host_bridge' };
function observation(expectedRevision = 0) {
  return { taskRef: 'synthetic-host-task', attemptRef: 'synthetic-host-attempt',
    observationRef: 'source:synthetic-host-observation', ...query, expectedRevision,
    observation: { timestamp: NOW, outcome: 'success_verified', source: 'host_verified',
      errorCode: 'SYNTHETIC_HOST_CHECK_PASSED',
      evidenceRefs: ['source:synthetic-host-observation', 'test:synthetic-host-evidence'] } };
}
async function fixture(t, hostMemoryEnabled = true) {
  const dir = await mkdtemp(path.join(tmpdir(), 'jh-host-memory-runtime-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'memory.json'), ownerScope = 'synthetic-host-owner';
  const options = { file, ownerScope, context, runtimeId: 'synthetic-runtime-one',
    hostMemoryEnabled, clock: () => NOW };
  const runtime = await createServerLearning(options);
  t.after(() => runtime.close());
  const store = new FileLearningStore({ file, ownerScope });
  const tools = new Map();
  registerLearningTools({ z, textResult: value => value, getController: () => runtime,
    registerOAuthTool: (name, config, handler) => tools.set(name, { config, handler }) });
  return { file, options, runtime, store, tools };
}

test('host memory defaults OFF and disabled operations never create a memory event', async t => {
  const { runtime, store, options } = await fixture(t, false);
  const before = await store.read();
  for (const [method, input] of [
    ['hostContext', query], ['hostTask', { taskRef: 'synthetic-host-task' }],
    ['hostObserve', observation()],
  ]) {
    const result = await runtime[method](input);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'LEARNING_HOST_MEMORY_DISABLED');
    assert.equal(result.authorizesExecution, false);
  }
  assert.deepEqual(await store.read(), before);
  const status = await runtime.status();
  assert.equal(status.capabilities.hostObservationTransport, false);
  assert.equal(status.hostMemory.enabled, false);
  assert.equal(status.librarySync, 'not_connected');
  await assert.rejects(createServerLearning({ ...options, hostMemoryEnabled: 'true' }), /ENABLE_INVALID/);
});

test('wrapped host MCP writes once, exposes a separate episode, and recovers exact retries without tool-event inflation', async t => {
  const { runtime, tools, store, file } = await fixture(t);
  const input = observation();
  const call = (name, args, requestId) => runtime.invoke({ name, requestId }, () => tools.get(name).handler(args));
  const first = await call('life_learning_host_observe', { payload: JSON.stringify(input) }, 'room-a');
  assert.equal(first.ok, true);
  assert.equal(first.recorded, true);
  assert.equal(first.duplicate, false);
  assert.match(first.current.taskId, /^host-task-[a-f0-9]{64}$/);
  assert.match(first.current.attemptId, /^host-attempt-[a-f0-9]{64}$/);
  assert.equal(first.current.scope.engine, 'jh-agent');
  assert.equal(first.independentOutcomeVerification, false);
  assert.equal(first.sourceAuthentication, 'authenticated_owner_attestation');
  const stored = await store.read();
  assert.equal(Object.keys(stored.events).length, 1);
  assert.equal(Object.keys(stored.attempts).length, 1);
  const bytes = await readFile(file, 'utf8');
  const duplicate = await call('life_learning_host_observe', { payload: JSON.stringify(input) }, 'room-b');
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.readOnly, true);
  assert.equal(duplicate.revision, first.revision);
  const recalled = await call('life_learning_host_context', query, 'room-b-read');
  assert.equal(recalled.episodes.length, 1);
  assert.deepEqual(recalled.lessons, []);
  assert.equal(recalled.episodes[0].projection.eventId, first.event.eventId);
  assert.equal(recalled.ordinaryChatsObserved, false);
  const view = await call('life_learning_host_task', { task_ref: input.taskRef, attempt_ref: input.attemptRef }, 'room-b-task');
  assert.equal(view.found, true);
  assert.equal(view.attempts[0].projection.eventId, first.event.eventId);
  assert.equal(await readFile(file, 'utf8'), bytes);
  assert.equal((await runtime.context({ target_tool: 'life_status' })).lessons.length, 0);
});

test('a concurrent server observation makes a new stale host write fail while the original receipt still recovers', async t => {
  const { runtime, store, tools } = await fixture(t);
  const input = observation();
  const first = await runtime.hostObserve(input);
  await runtime.invoke({ name: 'life_status', requestId: 'ordinary-server-observation' }, () => ({ content: [] }));
  const afterServer = await store.read();
  assert.equal(Object.keys(afterServer.events).length, 2);
  const next = { ...input, observationRef: 'source:synthetic-second-observation', expectedRevision: first.revision,
    observation: { ...input.observation, evidenceRefs: ['source:synthetic-second-observation', 'test:synthetic-other-evidence'] } };
  const rejected = await tools.get('life_learning_host_observe').handler({ payload: JSON.stringify(next) });
  assert.equal(rejected.code, 'LEARNING_REVISION_CONFLICT');
  const recovered = await runtime.hostObserve(input);
  assert.equal(recovered.duplicate, true);
  assert.equal(recovered.current.projection.eventId, first.event.eventId);
  assert.deepEqual(await store.read(), afterServer);
});

test('host memory owner isolation, shutdown, and invalid payload errors preserve original stored data', async t => {
  const { runtime, store, file, options, tools } = await fixture(t);
  const input = observation();
  await runtime.hostObserve(input);
  const bytes = await readFile(file, 'utf8');
  for (const payload of [
    '{invalid', '[]', JSON.stringify({ ...input, ownerScope: 'another-owner' }),
    JSON.stringify({ ...input, engine: 'jh-server' }),
    JSON.stringify({ ...input, observation: { ...input.observation, errorCode: 'Bearer ' + 'X'.repeat(40) } }),
  ]) {
    const result = await tools.get('life_learning_host_observe').handler({ payload });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'LEARNING_REQUEST_INVALID');
    assert.equal(JSON.stringify(result).includes('X'.repeat(40)), false);
  }
  const wrongOwner = await createServerLearning({ ...options, ownerScope: 'different-owner', runtimeId: 'wrong-owner' });
  assert.equal((await wrongOwner.hostTask({ taskRef: input.taskRef })).code, 'LEARNING_UNAVAILABLE');
  await wrongOwner.close();
  await runtime.close();
  assert.equal((await runtime.hostObserve(input)).code, 'LEARNING_UNAVAILABLE');
  assert.equal(await readFile(file, 'utf8'), bytes);
  assert.equal(Object.keys((await store.read()).events).length, 1);
});

test('a busy host-memory store reports unavailability and recovers the unchanged observation after readback', async t => {
  const { runtime, store, file, tools } = await fixture(t);
  const first = await runtime.hostObserve(observation());
  const input = { ...observation(first.revision), observationRef: 'source:synthetic-after-lock',
    observation: { ...observation().observation,
      evidenceRefs: ['source:synthetic-after-lock', 'test:synthetic-after-lock-evidence'] } };
  const bytes = await readFile(file, 'utf8');
  await writeFile(file + '.lock', 'synthetic competing writer\n', { flag: 'wx', mode: 0o600 });
  const unavailable = await tools.get('life_learning_host_observe').handler({ payload: JSON.stringify(input) });
  assert.equal(unavailable.ok, false);
  assert.equal(unavailable.code, 'LEARNING_UNAVAILABLE');
  assert.equal(unavailable.existingObservationReadbackRequired, true);
  assert.equal(unavailable.preserveOriginalObservationPayload, true);
  assert.equal(unavailable.replayAllowed, false);
  assert.equal(await readFile(file, 'utf8'), bytes);
  const status = await runtime.status();
  assert.equal(status.degraded, true);
  assert.ok(status.diagnostics.codes.includes('LEARNING_STORE_BUSY'));
  const readback = await runtime.hostTask({ taskRef: input.taskRef, attemptRef: input.attemptRef });
  assert.equal(readback.attempts[0].projection.eventId, first.event.eventId);
  await unlink(file + '.lock');
  const recovered = await runtime.hostObserve(input);
  assert.equal(recovered.ok, true);
  assert.equal(recovered.duplicate, false);
  assert.equal((await runtime.hostObserve(input)).duplicate, true);
  assert.equal(Object.keys((await store.read()).events).length, 2);
});
