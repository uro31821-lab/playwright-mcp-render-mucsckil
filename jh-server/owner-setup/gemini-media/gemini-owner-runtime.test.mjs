import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {DatabaseSync} from 'node:sqlite';
import {GeminiLifeCheckpointStore as LifeCheckpointStore} from './gemini-storage.mjs';
import {installConfiguredLifeRuntimeWithGemini} from './gemini-owner-runtime.mjs';
import {createGeminiMediaService, readGeminiConfiguration} from './gemini-service.mjs';
import {MEDIA_MODELS} from './gemini-policy.mjs';
import {validateOwnerConfiguration, EXPECTED_ORIGIN, EXPECTED_CATALOG, sha} from '../deployment/owner-config.mjs';
import {canonical} from '../server-continuation/life-checkpoint-wire.mjs';

const NOW = Date.parse('2026-11-27T03:00:00Z');
const ON = {JH_GEMINI_ANALYSIS_ENABLED: '1'};
const coded = code => error => error?.code === code;
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {let resolve; const promise = new Promise(done => {resolve = done;}); return {promise, resolve};};

function fixture(t, {schemas = true} = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'jh-gemini-owner-runtime-'));
  const mount = join(directory, 'mount'); mkdirSync(mount, {mode: 0o700});
  const config = validateOwnerConfiguration({version: 1, serverOrigin: EXPECTED_ORIGIN,
    catalogDigest: EXPECTED_CATALOG, googleWebClientId: 'synthetic-web.apps.googleusercontent.com',
    allowedPresenterClientIds: ['synthetic-web.apps.googleusercontent.com'], ownerSubject: 'synthetic-owner',
    ownerLabel: 'Synthetic', storageMount: mount, storageEpoch: 'synthetic-owner-gemini-test'});
  mkdirSync(config.stateDir, {mode: 0o700});
  const dbOptions = {databasePath: join(config.stateDir, 'life.sqlite'), key: Buffer.alloc(32, 41), serverDigest: sha(config.serverOrigin)};
  const store = new LifeCheckpointStore({...dbOptions, initialize: true});
  if (schemas) {
    store.initializeContentStorage();
    store.initializeWorkerStorage({maxActiveWorkflows: 8, maxParallelTasks: 2, maxTaskStarts: 8,
      leaseMillis: 60_000, runtimeMillis: 600_000});
    store.initializeQueueStorage();
  }
  const events = [], actualClose = store.close.bind(store), actualReady = store.assertRuntimeReady.bind(store);
  store.close = () => {events.push('store.close'); actualClose();};
  store.assertRuntimeReady = () => {events.push('store.validate'); return actualReady();};
  let currentPrincipal = {ownerDigest: config.accountDigest, scopes: new Set(['jh.life.read']), expiresAt: NOW + 60_000};
  const resources = {store, ownerDigest: config.accountDigest, serverOrigin: config.serverOrigin, clock: () => NOW,
    authenticate: async () => {events.push('authenticate'); return currentPrincipal;},
    close() {events.push('authority.close');}};
  const slot = {
    quiesce() {assert.equal(this, slot); events.push('life.quiesce');},
    async drain() {assert.equal(this, slot); events.push('life.drain');}
  };
  let handler, mediaArguments;
  const runtime = {
    httpServer: {listening: false},
    installLifeContinuationHandler56(value) {
      assert.equal(this, runtime); events.push('life.install'); handler = value; return slot;
    },
    installGeminiMediaStore56(value) {
      assert.equal(this, runtime); events.push('gemini.install'); mediaArguments = value;
      value.store.initializeGeminiMediaStorage(); return true;
    },
    async closeGeminiMedia56() {assert.equal(this, runtime); events.push('gemini.close');}
  };
  const options = Object.freeze({enabled: true, remoteTasks: false,
    open(binding) {
      assert.equal(this, options); events.push('open');
      assert.deepEqual(binding, {ownerDigest: config.accountDigest, serverOrigin: config.serverOrigin, stateDirectory: config.stateDir});
      assert.equal(Object.isFrozen(binding), true); return resources;
    }});
  t.after(() => {actualClose(); rmSync(directory, {recursive: true, force: true});});
  return {config, store, dbOptions, resources, runtime, slot, options, events,
    get handler() {return handler;}, get mediaArguments() {return mediaArguments;},
    principal(value) {currentPrincipal = value;},
    install(env = ON, suppliedOptions = options) {
      return installConfiguredLifeRuntimeWithGemini(runtime, config, suppliedOptions, {env});
    },
    mediaTables() {
      const db = new DatabaseSync(dbOptions.databasePath, {readOnly: true});
      try {return db.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'life_gemini_media_%'").all().map(row => row.name);}
      finally {db.close();}
    }
  };
}

async function loadCheckpoint(handler) {
  const body = Buffer.from(canonical({version: 1, requestId: 'read_1', workflowId: 'workflow_1', operation: 'load'}));
  const req = Readable.from([body]);
  Object.assign(req, {url: '/jh/life/checkpoint/v1', method: 'POST', headers: {'content-type': 'application/json'}});
  const response = {status: null, body: null, destroyed: false,
    writeHead(status) {this.status = status;}, end(bytes) {this.body = JSON.parse(bytes.toString());}};
  assert.equal(await handler(req, response), true); return response;
}

test('disabled media uses the original installer without touching either media capability or schema', async t => {
  const f = fixture(t);
  for (const name of ['installGeminiMediaStore56', 'closeGeminiMedia56']) {
    Object.defineProperty(f.runtime, name, {get() {throw Error('Disabled media was touched');}});
  }
  const installed = await f.install({});
  assert.deepEqual(f.mediaTables(), []);
  installed.quiesce(); await installed.close();
  assert.deepEqual(f.events, ['open', 'store.validate', 'life.install', 'life.quiesce', 'life.drain', 'store.close', 'authority.close']);
});

test('frozen options and runtime preserve identity, receiver, clock and original slot ordering', async t => {
  const f = fixture(t); Object.freeze(f.runtime);
  const installed = await f.install();
  assert.deepEqual(f.events, ['open', 'store.validate', 'life.install', 'gemini.install']);
  assert.equal(f.mediaArguments.store, f.store);
  assert.equal(f.mediaArguments.ownerDigest, f.config.accountDigest);
  assert.equal(f.mediaArguments.clock, f.resources.clock);
  assert.deepEqual({installed: installed.installed, remoteTasks: installed.remoteTasks,
    workersStarted: installed.workersStarted, credentialsCreated: installed.credentialsCreated},
  {installed: true, remoteTasks: false, workersStarted: 0, credentialsCreated: false});
  installed.quiesce();
  const closing = installed.close(); assert.equal(installed.close(), closing); await closing;
  assert.deepEqual(f.events.slice(4), ['life.quiesce', 'life.drain', 'gemini.close', 'store.close', 'authority.close']);
});

test('generation-only flag installs the addon and an absent clock retains Date.now fallback', async t => {
  const f = fixture(t); delete f.resources.clock;
  const installed = await f.install({JH_GEMINI_GENERATION_ENABLED: '1'});
  assert.equal(f.mediaArguments.clock, Date.now); await installed.close();
});

test('original validated configuration and explicit three-key options still reject before opening or media install', async t => {
  const f = fixture(t);
  await assert.rejects(installConfiguredLifeRuntimeWithGemini(f.runtime, {...f.config}, f.options, {env: ON}), coded('VALIDATED_CONFIGURATION_REQUIRED'));
  for (const invalid of [null, {enabled: false, open() {}, remoteTasks: false},
    {enabled: true, open: null, remoteTasks: false}, {enabled: true, open() {}, remoteTasks: 'true'},
    {enabled: true, open() {}, remoteTasks: false, extra: true}]) {
    await assert.rejects(f.install(ON, Object.freeze(invalid)), coded('LIFE_EXPLICIT_CONFIGURATION_REQUIRED'));
  }
  assert.deepEqual(f.events, []); assert.deepEqual(f.mediaTables(), []);
});

test('original runtime cannot be installed after listening and missing life slot cannot activate media', async t => {
  const f = fixture(t); f.runtime.httpServer.listening = true;
  await assert.rejects(f.install(), coded('LIFE_RUNTIME_SLOT_REQUIRED'));
  f.runtime.httpServer.listening = false; f.runtime.installLifeContinuationHandler56 = null;
  await assert.rejects(f.install(), coded('LIFE_RUNTIME_SLOT_REQUIRED'));
  assert.deepEqual(f.events, []); assert.deepEqual(f.mediaTables(), []);
});

for (const mismatch of ['ownerDigest', 'serverOrigin', 'storeServer', 'storePath', 'clock']) {
  test(`original ${mismatch} resource validation fails before media initialization and closes resources`, async t => {
    const f = fixture(t);
    if (mismatch === 'ownerDigest') f.resources.ownerDigest = 'a'.repeat(64);
    if (mismatch === 'serverOrigin') f.resources.serverOrigin = 'https://other.invalid';
    if (mismatch === 'storeServer') Object.defineProperty(f.store, 'serverDigest', {value: 'a'.repeat(64)});
    if (mismatch === 'storePath') Object.defineProperty(f.store, 'databasePath', {value: join('/tmp', 'other-owner', 'life.sqlite')});
    if (mismatch === 'clock') f.resources.clock = NOW;
    await assert.rejects(f.install(), coded(mismatch === 'clock' ? 'LIFE_CLOCK_REQUIRED' : 'LIFE_BOOTSTRAP_IDENTITY_MISMATCH'));
    assert.equal(f.events.includes('life.install'), false); assert.equal(f.events.includes('gemini.install'), false);
    assert.deepEqual(f.events.slice(-2), ['store.close', 'authority.close']); assert.deepEqual(f.mediaTables(), []);
  });
}

test('unprovisioned original schemas are not implicitly repaired by enabling media', async t => {
  const f = fixture(t, {schemas: false});
  await assert.rejects(f.install());
  assert.deepEqual(f.events, ['open', 'store.validate', 'store.close', 'authority.close']);
  assert.deepEqual(f.mediaTables(), []);
});

test('invalid original slot blocks media while preserving original contract error', async t => {
  const f = fixture(t);
  f.runtime.installLifeContinuationHandler56 = () => {f.events.push('life.install'); return null;};
  await assert.rejects(f.install(), coded('LIFE_SLOT_CONTRACT_INVALID'));
  assert.equal(f.events.includes('gemini.install'), false); assert.deepEqual(f.mediaTables(), []);
  assert.deepEqual(f.events.slice(-2), ['store.close', 'authority.close']);
});

test('missing media close capability fails closed and cleans the already installed life slot', async t => {
  const f = fixture(t); delete f.runtime.closeGeminiMedia56;
  await assert.rejects(f.install(), coded('GEMINI_RUNTIME_SLOT_REQUIRED'));
  assert.deepEqual(f.events, ['open', 'store.validate', 'life.install', 'life.drain', 'store.close', 'authority.close']);
  assert.deepEqual(f.mediaTables(), []);
});

for (const asynchronous of [false, true]) {
  test(`${asynchronous ? 'asynchronous' : 'synchronous'} media installation failure drains both slots and closes resources once`, async t => {
    const f = fixture(t), failure = Error('synthetic-install-failure');
    f.runtime.installGeminiMediaStore56 = () => {
      f.events.push('gemini.install');
      if (asynchronous) return Promise.reject(failure);
      throw failure;
    };
    await assert.rejects(f.install(), error => error === failure);
    assert.deepEqual(f.events, ['open', 'store.validate', 'life.install', 'gemini.install',
      'life.drain', 'gemini.close', 'store.close', 'authority.close']);
  });
}

test('original drain rejection still closes media before store and preserves the first error on repeated close', async t => {
  const f = fixture(t), originalFailure = Error('synthetic-life-drain-failure'), mediaFailure = Error('synthetic-media-close-failure');
  f.slot.drain = async () => {f.events.push('life.drain'); throw originalFailure;};
  f.runtime.closeGeminiMedia56 = async () => {f.events.push('gemini.close'); throw mediaFailure;};
  const installed = await f.install(), closing = installed.close();
  assert.equal(installed.close(), closing); await assert.rejects(closing, error => error === originalFailure);
  assert.deepEqual(f.events.slice(-4), ['life.drain', 'gemini.close', 'store.close', 'authority.close']);
});

test('the installed original authenticator remains owner-bound and stops after close', async t => {
  const f = fixture(t), installed = await f.install();
  const accepted = await loadCheckpoint(f.handler);
  assert.equal(accepted.status, 200); assert.equal(accepted.body.ownerDigest, f.config.accountDigest);
  f.principal({ownerDigest: 'a'.repeat(64), scopes: new Set(['jh.life.read']), expiresAt: NOW + 60_000});
  assert.equal((await loadCheckpoint(f.handler)).status, 401);
  f.principal({ownerDigest: f.config.accountDigest, scopes: new Set(['jh.life.read']), expiresAt: NOW + 60_000});
  await installed.close();
  const before = f.events.filter(event => event === 'authenticate').length;
  assert.equal((await loadCheckpoint(f.handler)).status, 401);
  assert.equal(f.events.filter(event => event === 'authenticate').length, before);
});

test('owner shutdown waits for in-flight receipt reconciliation before closing encrypted storage', async t => {
  const f = fixture(t), pendingGet = deferred(), getStarted = deferred(), events = f.events;
  const env = {...ON, GEMINI_API_KEY: 'test-only-never-a-real-key', JH_GEMINI_CREDIT_VERIFIED: 'CLOUD_CREDIT_ONLY_V1',
    JH_GEMINI_CREDIT_APPROVAL_REF: 'verified_test_allowance', JH_GEMINI_CREDIT_VALID_UNTIL: '2026-12-20T00:00:00Z',
    JH_GEMINI_VERIFIED_CREDIT_USD: '10'};
  const receipt = {ok: true, code: 'COMPLETED', state: 'completed', model: MEDIA_MODELS.analysis,
    interactionId: 'interaction_test_1', dispatched: true, billingStatus: 'usage_reported',
    text: '모의 분석 결과.', videos: [], usage: {total_input_tokens: 1000, total_cached_tokens: 0,
      total_output_tokens: 100, total_thought_tokens: 50, total_tool_use_tokens: 0, total_tokens: 1150,
      output_tokens_by_modality: [{modality: 'text', tokens: 100}]}};
  let service, posts = 0, gets = 0;
  f.runtime.installGeminiMediaStore56 = ({store, ownerDigest, clock}) => {
    events.push('gemini.install'); store.initializeGeminiMediaStorage();
    service = createGeminiMediaService({store, ownerDigest, clock, config: readGeminiConfiguration(env), client: {
      async createInteraction() {posts++; return {...receipt, ok: false, code: 'UNKNOWN_SUBMISSION', state: 'unknown', usage: null, billingStatus: 'unknown'};},
      async getInteraction() {gets++; events.push('gemini.get'); getStarted.resolve(); return pendingGet.promise;}
    }}); return true;
  };
  f.runtime.closeGeminiMedia56 = async () => {events.push('gemini.close.start'); await service.close(); events.push('gemini.close.end');};
  const installed = await f.install(env);
  const input = {kind: 'analysis', requestId: 'request_1', taskRef: 'task_1', userRequest: '이 영상 분석해줘',
    prompt: '이 영상 내용을 요약해줘.', sourceUrl: 'https://youtu.be/abcdefghijk'};
  const quote = service.preview(input); service.submit(input, quote.quoteId); await service.drain();
  assert.equal(service.get(input.requestId).state, 'UNKNOWN');
  const refresh = service.refresh(input.requestId); await getStarted.promise;
  const closing = installed.close(); await tick();
  assert.equal(events.includes('store.close'), false); assert.equal(events.includes('authority.close'), false);
  pendingGet.resolve(receipt); const result = await refresh; await closing;
  assert.equal(result.state, 'RESULT_AVAILABLE'); assert.equal(result.actualApiCostUsd, 0.000675);
  assert.equal(posts, 1); assert.equal(gets, 1);
  assert.ok(events.indexOf('gemini.close.end') < events.indexOf('store.close'));
  const reopened = new LifeCheckpointStore(f.dbOptions);
  try {
    const persisted = reopened.readGeminiMedia(f.config.accountDigest, input.requestId);
    assert.equal(persisted.job.state, 'RESULT_AVAILABLE'); assert.equal(persisted.budget.heldMicros, 0);
  } finally {reopened.close();}
});
