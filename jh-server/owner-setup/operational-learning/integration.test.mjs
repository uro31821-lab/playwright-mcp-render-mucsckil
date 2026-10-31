import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FileLearningStore } from './store.mjs';
import { createLearningAdapter } from './host-adapter.mjs';
import { ingest, addLesson, evaluateLesson } from './engine.mjs';

const CONTEXT = { platform: 'android', version: '2', environment: 'synthetic-test' };
const SCOPE = { taskId: 'task-current', attemptId: 'attempt-current', sequence: 1,
  domain: 'output', operation: 'output.format', engine: 'jh-synthetic', context: CONTEXT };
const NOW = '2026-10-31T01:00:00.000Z';

function event(id, overrides = {}) {
  return { ...SCOPE, taskId: `task-${id}`, attemptId: `attempt-${id}`,
    eventId: id, timestamp: NOW, outcome: 'failure_verified', source: 'host_verified',
    errorCode: 'E_OUTPUT', evidenceRefs: [`fixture:${id}`], ...overrides };
}

async function temporaryStore(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'jh-learning-integration-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'learning.json');
  return { file, store: new FileLearningStore({ file, ownerScope: 'owner-synthetic' }) };
}

function addActiveLesson(state, id = 'output-lesson', context = CONTEXT) {
  const candidate = addLesson(state, { id, domain: 'output', operation: 'output.format',
    engine: 'jh-synthetic', context, guidance: 'Use the reviewed output fields.',
    evidenceRefs: ['fixture:output-fix'], ruleVersion: '1', inputFingerprint: 'a'.repeat(64) });
  return evaluateLesson(candidate, id, { ruleVersion: '1', inputFingerprint: 'a'.repeat(64),
    passed: 2, failed: 0, skipped: 0, evidenceRefs: ['fixture:output-regression'] });
}

function options(store, overrides = {}) {
  return { store, contextForCall: () => structuredClone(SCOPE),
    classifyResult: () => ({ outcome: 'failure_verified', source: 'host_verified',
      errorCode: 'E_OUTPUT', evidenceRefs: ['fixture:current-result'] }),
    clock: () => NOW, ...overrides };
}

test('owner-bound state survives a new store instance and rejects a different owner', async t => {
  const { file, store } = await temporaryStore(t);
  assert.equal((await store.read()).revision, 0);
  const saved = await store.transact(state => ingest(state, event('persisted')));
  const restarted = new FileLearningStore({ file, ownerScope: 'owner-synthetic' });
  assert.deepEqual(await restarted.read(), saved.state);
  const original = await readFile(file);
  const foreign = new FileLearningStore({ file, ownerScope: 'different-owner' });
  await assert.rejects(foreign.read(), { code: 'LEARNING_STORE_SCOPE_MISMATCH' });
  await assert.rejects(foreign.transact(state => ingest(state, event('foreign'))),
    { code: 'LEARNING_STORE_SCOPE_MISMATCH' });
  assert.deepEqual(await readFile(file), original);
});

test('stale revisions and conflicting event IDs preserve existing state bytes', async t => {
  const { file, store } = await temporaryStore(t);
  await store.transact(state => ingest(state, event('existing')));
  const original = await readFile(file);
  let staleCallbackCalls = 0;
  await assert.rejects(store.transact(state => {
    staleCallbackCalls++;
    return ingest(state, event('stale-writer'));
  }, { expectedRevision: 0 }), { code: 'LEARNING_REVISION_CONFLICT' });
  assert.equal(staleCallbackCalls, 0);
  await assert.rejects(store.transact(state => ingest(state,
    event('existing', { errorCode: 'DIFFERENT_ERROR' }))), /Conflicting event ID/);
  assert.deepEqual(await readFile(file), original);
  await assert.rejects(access(file + '.lock'), { code: 'ENOENT' });
});

test('corrupt persisted data is reported and preserved rather than reset', async t => {
  const { file, store } = await temporaryStore(t);
  const broken = '{"schema":"jh.operational-learning.store.v1","state":';
  await writeFile(file, broken, 'utf8');
  await assert.rejects(store.read(), { code: 'LEARNING_STORE_CORRUPT' });
  await assert.rejects(store.transact(state => ingest(state, event('after-corruption'))),
    { code: 'LEARNING_STORE_CORRUPT' });
  assert.equal(await readFile(file, 'utf8'), broken);
  await assert.rejects(access(file + '.lock'), { code: 'ENOENT' });
});

test('a busy writer lock is left intact and does not invoke a second transaction', async t => {
  const { file, store } = await temporaryStore(t);
  await store.transact(state => ingest(state, event('before-lock')));
  const original = await readFile(file);
  await writeFile(file + '.lock', 'another-writer', { flag: 'wx' });
  let callbacks = 0;
  await assert.rejects(store.transact(state => { callbacks++; return state; }),
    { code: 'LEARNING_STORE_BUSY' });
  assert.equal(callbacks, 0);
  assert.equal(await readFile(file + '.lock', 'utf8'), 'another-writer');
  assert.deepEqual(await readFile(file), original);
  await rm(file + '.lock');
  await store.transact(state => ingest(state, event('after-lock')));
  assert.equal(Object.keys((await store.read()).events).length, 2);
});

test('normal concurrent transactions preserve every independent observation', async t => {
  const { store } = await temporaryStore(t);
  const ids = Array.from({ length: 6 }, (_, index) => `concurrent-${index}`);
  await Promise.all(ids.map(id => store.transact(state => ingest(state, event(id)))));
  const restarted = new FileLearningStore({ file: store.file, ownerScope: 'owner-synthetic' });
  const state = await restarted.read();
  assert.deepEqual(Object.keys(state.events).sort(), ids.sort());
  assert.equal(state.revision, ids.length);
});

test('unknown raw fields and raw evidence URLs cannot enter the persisted learning record', async t => {
  const { file, store } = await temporaryStore(t);
  await store.transact(state => ingest(state, event('valid')));
  const original = await readFile(file);
  const diagnostics = [];
  const adapter = createLearningAdapter(options(store, { onDiagnostic: entry => diagnostics.push(entry) }));
  assert.equal(await adapter.observe(event('raw', { screenText: 'SYNTHETIC_PRIVATE_CONTENT' })), undefined);
  assert.equal(await adapter.observe(event('url', {
    evidenceRefs: ['https://example.invalid/private?token=SYNTHETIC_TOKEN'],
  })), undefined);
  assert.deepEqual(await readFile(file), original);
  assert.equal(diagnostics.length, 2);
  for (const diagnostic of diagnostics) assert.deepEqual(diagnostic,
    { code: 'LEARNING_UNAVAILABLE', phase: 'record', replay: false });
});

test('matching lessons are recalled before the handler and another environment is excluded', async t => {
  const { store } = await temporaryStore(t);
  await store.transact(state => addActiveLesson(addActiveLesson(state), 'production-lesson',
    { ...CONTEXT, environment: 'production' }));
  const order = [];
  const result = { result: 'same-object' };
  const adapter = createLearningAdapter(options(store, {
    onRecall: async lessons => {
      order.push('recall');
      assert.deepEqual(lessons.map(item => item.id), ['output-lesson']);
      assert.equal(lessons[0].advisoryOnly, true);
      lessons[0].guidance = 'callback-local mutation';
    },
    classifyResult: () => { order.push('classify'); return null; },
  }));
  const wrapped = adapter.wrap('output.format', () => { order.push('handler'); return result; });
  assert.strictEqual(await wrapped(), result);
  assert.deepEqual(order, ['recall', 'handler', 'classify']);
  assert.equal((await store.read()).lessons['output-lesson'].guidance, 'Use the reviewed output fields.');
  let recalls = 0;
  const other = createLearningAdapter(options(store, {
    contextForCall: () => ({ ...SCOPE, context: { ...CONTEXT, environment: 'different-environment' } }),
    onRecall: () => { recalls++; }, classifyResult: () => null,
  }));
  assert.strictEqual(await other.wrap('output.format', () => result)(), result);
  assert.equal(recalls, 0);
});

test('classification cannot replace the host-bound task, attempt, sequence, or work scope', async t => {
  const { store } = await temporaryStore(t);
  const diagnostics = [];
  const adapter = createLearningAdapter(options(store, {
    onDiagnostic: entry => diagnostics.push(entry),
    classifyResult: () => ({ outcome: 'success_verified', source: 'host_verified',
      evidenceRefs: ['fixture:verified-result'], eventId: 'forged-id', taskId: 'forged-task',
      attemptId: 'forged-attempt', sequence: 99, domain: 'web', operation: 'forged.operation',
      engine: 'forged-engine', context: { ...CONTEXT, environment: 'production' },
      screenText: 'SYNTHETIC_PRIVATE_CONTENT' }),
  }));
  const returned = {};
  assert.strictEqual(await adapter.wrap('output.format', () => returned)(), returned);
  assert.deepEqual((await store.read()).events, {});
  assert.deepEqual(diagnostics, [{ code: 'LEARNING_UNAVAILABLE', phase: 'classify', replay: false }]);
  const valid = createLearningAdapter(options(store));
  assert.strictEqual(await valid.wrap('output.format', () => returned)(), returned);
  const events = Object.values((await store.read()).events);
  assert.equal(events.length, 1);
  for (const key of ['taskId', 'attemptId', 'sequence', 'domain', 'operation', 'engine', 'context']) {
    assert.deepEqual(events[0][key], SCOPE[key], key);
  }
  assert.notEqual(events[0].eventId, 'forged-id');
  assert.equal(Object.hasOwn(events[0], 'screenText'), false);
});

test('an unclassified generic success result is not recorded as verified business success', async t => {
  const { store } = await temporaryStore(t);
  const adapter = createLearningAdapter(options(store, { classifyResult: () => null }));
  const generic = { ok: true, httpStatus: 200, queued: true };
  assert.strictEqual(await adapter.wrap('output.format', () => generic)(), generic);
  assert.deepEqual((await store.read()).events, {});
});

test('learning failures never repeat the handler or replace its return value or error', async t => {
  const phases = ['context', 'read', 'write', 'classify', 'recall-callback', 'proposal-callback', 'diagnostic-callback'];
  for (const phase of phases) {
    for (const outcome of ['return', 'throw']) {
      await t.test(`${phase}: ${outcome}`, async child => {
        const { store } = await temporaryStore(child);
        await store.transact(state => addActiveLesson(ingest(state, event('earlier-task')).state));
        const failure = new Error('SYNTHETIC_LEARNING_FAILURE');
        const port = { read: () => store.read(), transact: (...args) => store.transact(...args) };
        const config = options(port);
        if (phase === 'context') config.contextForCall = async () => { throw failure; };
        if (phase === 'read') port.read = async () => { throw failure; };
        if (phase === 'write') port.transact = async () => { throw failure; };
        if (phase === 'classify') config.classifyResult = async () => { throw failure; };
        if (phase === 'recall-callback') config.onRecall = async () => { throw failure; };
        if (phase === 'proposal-callback') config.onProposals = async () => { throw failure; };
        if (phase === 'diagnostic-callback') {
          port.read = async () => { throw failure; };
          config.onDiagnostic = async () => { throw failure; };
        }
        const receiver = { label: 'original receiver' };
        const argument = { label: 'original argument' };
        const returned = { label: 'original return object' };
        const thrown = new Error('ORIGINAL_HANDLER_ERROR');
        let calls = 0;
        const wrapped = createLearningAdapter(config).wrap('output.format', function (value) {
          calls++;
          assert.strictEqual(this, receiver);
          assert.strictEqual(value, argument);
          if (outcome === 'throw') throw thrown;
          return returned;
        });
        if (outcome === 'throw') await assert.rejects(wrapped.call(receiver, argument), error => error === thrown);
        else assert.strictEqual(await wrapped.call(receiver, argument), returned);
        assert.equal(calls, 1);
        await new Promise(resolve => setImmediate(resolve));
      });
    }
  }
});
