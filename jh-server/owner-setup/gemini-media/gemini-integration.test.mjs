/** Offline integration only: real MCP transport, synthetic owner/store/provider.
 * No listener, account, paid API, production bootstrap or Android command runs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {CallToolResultSchema} from '@modelcontextprotocol/sdk/types.js';
import {z} from 'zod';
import {LifeCheckpointStore} from '../server-continuation/life-checkpoint-store.mjs';
import {buildCleanRestartRelease56} from '../deployment/durable-clean-restart-news-review-entry.mjs';
import {installConfiguredLifeRuntime} from '../deployment/life-runtime-install.mjs';
import {validateOwnerConfiguration, EXPECTED_CATALOG, EXPECTED_ORIGIN} from '../deployment/owner-config.mjs';
import {geminiMediaRequested, installGeminiMediaService, registerGeminiMediaTools} from './gemini-tools.mjs';
import {patchGeminiMediaRuntime56} from './gemini-composition.mjs';
import {createGeminiClient} from './gemini-provider.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const NOW = Date.parse('2026-11-27T03:00:00Z');
const OWNER = 'a'.repeat(64), SERVER = 'b'.repeat(64);
const MOCK_KEY = 'synthetic-gemini-offline-test-only-key';
const TOOL_NAMES = ['jh_gemini_media_preview', 'jh_gemini_media_submit', 'jh_gemini_media_status',
  'jh_gemini_media_cancel', 'jh_gemini_media_result'];
const textResult = value => ({content: [{type: 'text', text: JSON.stringify(value)}]});
const sha = value => createHash('sha256').update(value).digest('hex');
const request = (kind, suffix = kind) => ({kind, requestId: 'request_' + suffix, taskRef: 'task_' + suffix,
  userRequest: kind === 'analysis' ? '이 유튜브 영상 분석해줘' : '제주 바다 영상 만들어줘',
  prompt: kind === 'analysis' ? '요청 구간의 장소와 사실을 근거와 함께 설명해줘.' : '맑은 제주 바다의 파도를 담은 영상.',
  ...(kind === 'analysis' ? {sourceUrl: 'https://www.youtube.com/watch?v=abcdefghijk', endSeconds: 60} : {})});
const configured = (flags = {}) => ({
  GEMINI_API_KEY: MOCK_KEY,
  JH_GEMINI_CREDIT_VERIFIED: 'CLOUD_CREDIT_ONLY_V1',
  JH_GEMINI_CREDIT_APPROVAL_REF: 'synthetic_credit_fixture',
  JH_GEMINI_CREDIT_VALID_UNTIL: '2026-11-30T14:59:59Z',
  JH_GEMINI_VERIFIED_CREDIT_USD: '10', ...flags
});

function fixture(t, {migrate = true} = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'jh-gemini-mcp-'));
  const store = new LifeCheckpointStore({databasePath: path.join(directory, 'life.sqlite'),
    key: Buffer.alloc(32, 53), serverDigest: SERVER, initialize: true});
  if (migrate) store.initializeGeminiMediaStorage();
  t.after(() => {store.close(); rmSync(directory, {recursive: true, force: true});});
  return {store, directory};
}

async function connectMcp(t, {env, service = null, onGetService = () => {}}) {
  const server = new McpServer({name: 'jh-gemini-offline-integration', version: '0.0.1'}, {capabilities: {tools: {}}});
  server.registerTool('existing_owner_status', {inputSchema: {}, annotations: {readOnlyHint: true}},
    () => textResult({ok: true, originalTool: true}));
  const registered = registerGeminiMediaTools({env, z, textResult,
    registerOAuthTool: (name, config, handler) => server.registerTool(name, config, handler),
    getService: () => {onGetService(); return service;}});
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({name: 'jh-gemini-offline-client', version: '0.0.1'}, {capabilities: {}});
  t.after(async () => {await client.close().catch(() => {}); await server.close().catch(() => {});});
  await server.connect(a); await client.connect(b);
  const call = async (name, args = {}) => {
    const result = await client.callTool({name, arguments: args});
    assert.equal(CallToolResultSchema.safeParse(result).success, true, 'MCP result schema must remain valid');
    return result;
  };
  const value = async (name, args = {}) => {
    const result = await call(name, args);
    assert.notEqual(result.isError, true, JSON.stringify(result));
    assert.equal(result.content[0].type, 'text');
    return JSON.parse(result.content[0].text);
  };
  return {client, registered, call, value};
}

test('default OFF and key alone do not touch storage, construct service or add MCP tools', async t => {
  let serviceReads = 0, externalCalls = 0;
  const untouchedStore = new Proxy({}, {get() {throw new Error('OFF must not inspect storage');}});
  const provider = {async createInteraction() {externalCalls++; throw new Error('must not dispatch');}};
  for (const env of [{}, {GEMINI_API_KEY: MOCK_KEY}, {JH_GEMINI_ANALYSIS_ENABLED: '0', JH_GEMINI_GENERATION_ENABLED: '0'}]) {
    assert.equal(geminiMediaRequested(env), false);
    assert.equal(installGeminiMediaService({store: untouchedStore, ownerDigest: OWNER, env, client: provider}), null);
    const mcp = await connectMcp(t, {env, onGetService: () => serviceReads++});
    assert.equal(mcp.registered, false);
    assert.deepEqual((await mcp.client.listTools()).tools.map(x => x.name), ['existing_owner_status']);
    assert.deepEqual(await mcp.value('existing_owner_status'), {ok: true, originalTool: true});
  }
  assert.equal(serviceReads, 0); assert.equal(externalCalls, 0);
});

test('analysis and generation flags independently gate real MCP previews and disabled submissions', async t => {
  for (const [analysis, generation] of [[true, false], [false, true], [true, true]]) {
    await t.test(`analysis=${analysis} generation=${generation}`, async sub => {
      const {store} = fixture(sub);
      let externalCalls = 0;
      const provider = {async createInteraction() {externalCalls++; throw new Error('preview must not dispatch');}};
      const env = configured({JH_GEMINI_ANALYSIS_ENABLED: analysis ? '1' : '0', JH_GEMINI_GENERATION_ENABLED: generation ? '1' : '0'});
      const service = installGeminiMediaService({store, ownerDigest: OWNER, env, clock: () => NOW, client: provider});
      sub.after(() => service.close());
      const mcp = await connectMcp(sub, {env, service});
      const listed = await mcp.client.listTools();
      assert.deepEqual(listed.tools.map(x => x.name), ['existing_owner_status', ...TOOL_NAMES]);
      const status = await mcp.value('jh_gemini_media_status');
      assert.equal(status.features.analysis.enabled, analysis);
      assert.equal(status.features.generation.enabled, generation);
      assert.equal(status.hardBillingCapGuaranteed, false);
      for (const kind of ['analysis', 'generation']) {
        const input = request(kind), enabled = kind === 'analysis' ? analysis : generation;
        const quote = await mcp.value('jh_gemini_media_preview', {request: input});
        assert.equal(quote.paidRequestSent, false);
        assert.equal(quote.blockedBy, enabled ? null : 'GEMINI_FEATURE_DISABLED');
        assert.equal(quote.readyToSubmit, enabled);
        if (!enabled) {
          const blocked = await mcp.value('jh_gemini_media_submit', {request: input, quoteId: quote.quoteId});
          assert.equal(blocked.ok, false); assert.equal(blocked.code, 'GEMINI_FEATURE_DISABLED');
          assert.equal(blocked.paidRequestSent, false);
        }
      }
      const invalid = await mcp.call('jh_gemini_media_preview', {request: {...request('analysis'), apiKey: MOCK_KEY}});
      assert.equal(invalid.isError, true, 'MCP request must not accept operator credential fields');
      assert.equal(externalCalls, 0);
      assert.equal(JSON.stringify(status).includes(MOCK_KEY), false);
      assert.equal(listed.tools.find(x => x.name === 'jh_gemini_media_submit').annotations.openWorldHint, true);
    });
  }
});

test('enabled but unconnected account stays blocked through MCP; no provider request', async t => {
  const {store} = fixture(t);
  let calls = 0;
  const env = {JH_GEMINI_ANALYSIS_ENABLED: '1', JH_GEMINI_GENERATION_ENABLED: '1'};
  const service = installGeminiMediaService({store, ownerDigest: OWNER, env, clock: () => NOW,
    client: {async createInteraction() {calls++; throw new Error('no account');}}});
  t.after(() => service.close());
  const mcp = await connectMcp(t, {env, service});
  for (const kind of ['analysis', 'generation']) {
    const input = request(kind), quote = await mcp.value('jh_gemini_media_preview', {request: input});
    assert.equal(quote.blockedBy, 'BLOCKED_AUTH');
    const result = await mcp.value('jh_gemini_media_submit', {request: input, quoteId: quote.quoteId});
    assert.equal(result.code, 'BLOCKED_AUTH'); assert.equal(result.paidRequestSent, false);
  }
  assert.equal(calls, 0);
});

test('mock REST response crosses real provider, encrypted store and MCP as a valid MP4 resource once', async t => {
  const {store} = fixture(t);
  const bytes = Buffer.concat([Buffer.from([0, 0, 0, 20]), Buffer.from('ftypmp42'), Buffer.from('offline synthetic video')]);
  let calls = 0;
  const provider = createGeminiClient({apiKey: MOCK_KEY, fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/interactions');
    assert.equal(options.method, 'POST');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'gemini-omni-1.2-flash');
    assert.equal(body.store, false); assert.equal(body.background, false);
    return new Response(JSON.stringify({id: 'offline_interaction_1', model: body.model, status: 'completed',
      steps: [{type: 'model_output', content: [{type: 'video', mime_type: 'video/mp4', data: bytes.toString('base64')}]}],
      usage: {total_input_tokens: 10, total_output_tokens: 46336, total_thought_tokens: 0,
        total_cached_tokens: 0, total_tool_use_tokens: 0, total_tokens: 46346,
        input_tokens_by_modality: [{modality: 'text', tokens: 10}],
        output_tokens_by_modality: [{modality: 'video', tokens: 46336}]}
    }), {status: 200, headers: {'content-type': 'application/json'}});
  }});
  const env = configured({JH_GEMINI_GENERATION_ENABLED: '1'});
  const service = installGeminiMediaService({store, ownerDigest: OWNER, env, client: provider, clock: () => NOW});
  t.after(() => service.close());
  const mcp = await connectMcp(t, {env, service});
  const input = request('generation');
  const preview = await mcp.value('jh_gemini_media_preview', {request: input});
  assert.equal(preview.readyToSubmit, true); assert.equal(calls, 0);
  const queued = await mcp.value('jh_gemini_media_submit', {request: input, quoteId: preview.quoteId});
  assert.equal(queued.state, 'QUEUED');
  await service.drain();
  const output = await mcp.call('jh_gemini_media_result', {requestId: input.requestId});
  assert.notEqual(output.isError, true);
  const job = JSON.parse(output.content[0].text);
  assert.equal(job.state, 'RESULT_AVAILABLE');
  assert.equal(job.billingStatus, 'USAGE_REPORTED_NOT_INVOICE');
  assert.equal(job.appliedGoogleCreditUsd, null);
  assert.equal(job.output.sha256, sha(bytes));
  assert.equal(job.output.byteLength, bytes.length);
  assert.equal(job.verification, 'DOWNLOADED_CONTAINER_CHECKED_PLAYBACK_NOT_CHECKED');
  const embedded = output.content[1];
  assert.equal(embedded.type, 'resource');
  assert.equal(embedded.resource.uri, 'jh-gemini-media://output/' + input.requestId);
  assert.equal(embedded.resource.mimeType, 'video/mp4');
  assert.deepEqual(Buffer.from(embedded.resource.blob, 'base64'), bytes);
  const repeated = await mcp.value('jh_gemini_media_submit', {request: input, quoteId: preview.quoteId});
  assert.equal(repeated.duplicate, true);
  await mcp.value('jh_gemini_media_status', {requestId: input.requestId, refresh: true});
  await mcp.call('jh_gemini_media_result', {requestId: input.requestId});
  assert.equal(calls, 1, 'reading or repeating an existing request must not generate again');
  assert.equal(JSON.stringify(output).includes(MOCK_KEY), false);
});

test('owner bootstrap binds media to validated existing store and drains media before closing it', async t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'jh-gemini-bootstrap-'));
  t.after(() => rmSync(directory, {recursive: true, force: true}));
  const config = validateOwnerConfiguration({version: 1, serverOrigin: EXPECTED_ORIGIN, catalogDigest: EXPECTED_CATALOG,
    googleWebClientId: 'offline-client.apps.googleusercontent.com', allowedPresenterClientIds: ['offline-client.apps.googleusercontent.com'],
    ownerSubject: 'offline-owner-only', ownerLabel: 'Synthetic owner', storageMount: directory, storageEpoch: 'synthetic_epoch_000001'});
  mkdirSync(config.stateDir, {mode: 0o700});
  const store = new LifeCheckpointStore({databasePath: path.join(config.stateDir, 'life.sqlite'),
    key: Buffer.alloc(32, 54), serverDigest: sha(config.serverOrigin), initialize: true});
  t.after(() => store.close());
  store.initializeContentStorage();
  store.initializeWorkerStorage({maxActiveWorkflows: 1, maxParallelTasks: 1, maxTaskStarts: 1, leaseMillis: 1000, runtimeMillis: 1000});
  store.initializeQueueStorage();
  const events = [];
  let service, calls = 0;
  const env = configured({JH_GEMINI_ANALYSIS_ENABLED: '1', JH_GEMINI_MEDIA_PROVISION: 'INITIALIZE_EXISTING_LIFE_DB_V1'});
  const runtime = {
    httpServer: {listening: false},
    installGeminiMediaStore56(resources) {
      events.push('media-install');
      assert.equal(resources.store, store); assert.equal(resources.ownerDigest, config.accountDigest);
      assert.equal(resources.clock(), NOW);
      service = installGeminiMediaService({...resources, env, client: {async createInteraction() {calls++; throw new Error('never paid');}}});
      return true;
    },
    installLifeContinuationHandler56(handler) {
      assert.equal(typeof handler, 'function'); events.push('life-install');
      return {quiesce() {events.push('quiesce');}, async drain() {events.push('life-drain');}};
    },
    async closeGeminiMedia56() {
      events.push('media-close');
      assert.equal(store.assertGeminiMediaReady().initialized, false);
      await service.close();
    }
  };
  const installed = await installConfiguredLifeRuntime(runtime, config, {enabled: true, remoteTasks: false,
    async open(binding) {
      assert.equal(binding.ownerDigest, config.accountDigest);
      return {store, ownerDigest: config.accountDigest, serverOrigin: config.serverOrigin, clock: () => NOW,
        authenticate: async () => null,
        async close() {events.push('resources-close'); assert.throws(() => store.readGeminiMediaBudget(config.accountDigest), /checkpoint_store_closed/);}};
    }});
  assert.equal(installed.workersStarted, 0); assert.equal(calls, 0);
  const preview = service.preview(request('analysis', 'bootstrap'));
  assert.equal(preview.readyToSubmit, true);
  assert.equal(store.readGeminiMedia(config.accountDigest, preview.requestId).job.requestId, preview.requestId);
  assert.equal(store.readGeminiMedia(OWNER, preview.requestId).job, null);
  installed.quiesce(); await installed.close(); await installed.close();
  assert.deepEqual(events, ['media-install', 'life-install', 'quiesce', 'life-drain', 'media-close', 'resources-close']);
  assert.equal(calls, 0);
});

test('current generated runtime passes syntax with additive OAuth media registration and original catalog', {timeout: 30000}, async () => {
  const sourceFile = path.join(ROOT, 'deployment/durable-live-release.mjs');
  const originalRelease = readFileSync(sourceFile, 'utf8');
  const pin = buildCleanRestartRelease56();
  const release = await import(pathToFileURL(pin.file).href + '?gemini-offline-integration=1');
  const built = release.buildDurableRoutedOperationalEntrypoint(ROOT);
  const source = readFileSync(built.runtimeFile, 'utf8');
  const occurrences = text => source.split(text).length - 1;
  assert.equal(readFileSync(sourceFile, 'utf8'), originalRelease, 'reviewed live release must remain unchanged');
  assert.equal(occurrences("import {installGeminiMediaService,registerGeminiMediaTools,geminiMediaRequested} from '../gemini-media/gemini-tools.mjs';"), 1);
  assert.equal(occurrences('registerGeminiMediaTools({'), 1);
  assert.equal(occurrences('export function installGeminiMediaStore56('), 1);
  assert.equal(occurrences('export async function closeGeminiMedia56('), 1);
  assert.equal(occurrences('const SECURE56_TOOL_CATALOG_DIGEST='), 1);
  assert(source.includes('const SECURE56_TOOL_CATALOG_DIGEST="' + EXPECTED_CATALOG + '";'));
  assert(source.includes('jhRequireCommand56'), 'existing signed phone guard missing');
  assert(source.includes('jhRegisterArticleReadCandidate'), 'existing news guard missing');
  const registrar = source.indexOf('const registerOAuthTool=(name,config,handler)=>{');
  const media = source.indexOf('  // Gemini media: existing owner OAuth only; both features default OFF.');
  const evidence = source.indexOf('  // Evidence search: server-side OAuth tool only.');
  const oldTool = source.indexOf('  registerOAuthTool("life_status",{', evidence);
  assert(registrar >= 0 && registrar < media && media < evidence && evidence < oldTool, 'media must use existing reviewed registrar location');
  assert(source.indexOf('let jhGeminiMediaService56=null;') < source.indexOf('function createMcp(){'));
  const syntax = spawnSync(process.execPath, ['--check', '--input-type=module'], {input: source, encoding: 'utf8', timeout: 10000});
  assert.equal(syntax.status, 0, syntax.stderr);
  assert.throws(() => patchGeminiMediaRuntime56(source), /GEMINI_COMPOSITION_ANCHOR_CHANGED/);
  const snippet = source.slice(media, evidence);
  const register = new Function('process', 'geminiMediaRequested', 'registerGeminiMediaTools', 'registerOAuthTool', 'z', 'textResult', 'jhGeminiMediaService56', snippet);
  for (const env of [{}, {JH_GEMINI_ANALYSIS_ENABLED: '1'}, {JH_GEMINI_GENERATION_ENABLED: '1'}, {JH_GEMINI_ANALYSIS_ENABLED: '1', JH_GEMINI_GENERATION_ENABLED: '1'}]) {
    const calls = [];
    register({env}, geminiMediaRequested, args => registerGeminiMediaTools({...args, env}), name => calls.push(name), z, textResult, null);
    assert.deepEqual(calls, geminiMediaRequested(env) ? TOOL_NAMES : []);
  }
  assert.equal(readFileSync(built.runtimeFile, 'utf8'), source, 'test must not edit generated runtime');
});
