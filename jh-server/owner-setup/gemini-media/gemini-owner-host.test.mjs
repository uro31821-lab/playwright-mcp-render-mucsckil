/** Real generated owner host + authenticated MCP over loopback HTTP.
 * Isolated synthetic owner/volume/token only. Gemini has NO key, and the child
 * rejects any non-loopback fetch. No production boot, paid API or phone calls.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const LABEL = 'JH_GEMINI_OWNER_HTTP ';
const PROBE = String.raw`
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {CallToolResultSchema} from '@modelcontextprotocol/sdk/types.js';

const ROOT = process.argv[1], data = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const imp = file => import(pathToFileURL(file).href);
const originalFetch = globalThis.fetch;
let externalFetchAttempts = 0;
globalThis.fetch = async (input, options) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') {
    externalFetchAttempts++;
    throw new Error('SYNTHETIC_TEST_EXTERNAL_FETCH_FORBIDDEN');
  }
  return originalFetch(input, options);
};
assert.equal(process.env.GEMINI_API_KEY, undefined);
const {buildCleanRestartRelease56} = await imp(ROOT + '/deployment/durable-clean-restart-news-review-entry.mjs');
const releaseFile = buildCleanRestartRelease56().file;
const release = await imp(releaseFile);
const {buildGeminiMediaOwnerEntrypoint} = await imp(ROOT + '/gemini-media/gemini-owner-entry.mjs');
const useMedia = process.env.JH_GEMINI_ANALYSIS_ENABLED === '1' || process.env.JH_GEMINI_GENERATION_ENABLED === '1';
const built = useMedia ? await buildGeminiMediaOwnerEntrypoint(ROOT, process.env,
  {baseMode: process.env.JH_GEMINI_TEST_BASE_MODE || 'durable'}) : release.buildDurableRoutedOperationalEntrypoint(ROOT);
const {validateOwnerConfiguration, loadOwnerKey} = await imp(ROOT + '/deployment/owner-config.mjs');
const {takeStorageSecrets, materializeStorageKeys} = await imp(ROOT + '/deployment/storage-secret-bridge.mjs');
const {prepareOperationalStorage} = await imp(ROOT + '/deployment/operational-service-entry.mjs');
const {startUnifiedOwnerServer} = await imp(built.unifiedFile);
const config = validateOwnerConfiguration(data.input);
const secrets = takeStorageSecrets({
  JH_OWNER_STORAGE_SECRET: Buffer.alloc(32, 61).toString('base64'),
  JH_LIFE_STORAGE_SECRET: Buffer.alloc(32, 62).toString('base64')
});
const files = materializeStorageKeys(config, secrets, data.keys);
secrets.owner.fill(0); secrets.life.fill(0);
const prepared = prepareOperationalStorage(config, files, {confirmation: 'EXPLICIT_ONE_TIME',
  storageObservations: data.observations});
const key = loadOwnerKey(files.ownerKeyFile, config);
let running = null, client = null;
try {
  const cutover = release.prepareOrVerifyDurableRelease({config, key,
    storageObservations: data.observations, mode: release.INITIAL_MODE});
  running = await startUnifiedOwnerServer({config, key, lifeStorage: prepared.lifeStorage,
    storageObservations: data.observations, port: 0, bindAddress: '127.0.0.1'});
  const base = 'http://127.0.0.1:' + running.port;
  const health = await fetch(base + '/health');
  const unauth = await fetch(base + '/mcp');
  const wrongBearer = await fetch(base + '/mcp', {headers: {Authorization: 'Bearer WRONG_SYNTHETIC_TOKEN'}});
  assert.equal(health.status, 200);
  assert.equal(unauth.status, 401);
  assert.equal(wrongBearer.status, 401);
  client = new Client({name: 'jh-gemini-owner-loopback-test', version: '0.0.1'}, {capabilities: {}});
  await client.connect(new StreamableHTTPClientTransport(new URL(base + '/mcp'), {
    requestInit: {headers: {Authorization: 'Bearer ' + process.env.LIFE_HUB_TOKEN}}
  }));
  const list = await client.listTools();
  const names = list.tools.map(x => x.name);
  const mediaNames = names.filter(name => name.startsWith('jh_gemini_media_')).sort();
  const expectedNames = ['jh_gemini_media_cancel', 'jh_gemini_media_preview', 'jh_gemini_media_result',
    'jh_gemini_media_status', 'jh_gemini_media_submit'];
  const analysis = process.env.JH_GEMINI_ANALYSIS_ENABLED === '1';
  const generation = process.env.JH_GEMINI_GENERATION_ENABLED === '1';
  assert.deepEqual(mediaNames, analysis || generation ? expectedNames : []);
  assert(names.includes('life_status'), 'existing owner tool must remain registered');
  assert(names.includes('life_guide13_catalog'), 'existing guide catalog must remain registered');

  // Match the exact MCP URL bundled in the installed JH plugin: /mcp?catalog=103.
  // A passing plain /mcp test alone must not certify ChatGPT catalog discovery.
  const catalogClient = new Client({name: 'jh-gemini-catalog-103-probe', version: '0.0.1'}, {capabilities: {}});
  try {
    await catalogClient.connect(new StreamableHTTPClientTransport(new URL(base + '/mcp?catalog=103'), {
      requestInit: {headers: {Authorization: 'Bearer ' + process.env.LIFE_HUB_TOKEN}}
    }));
    const catalogList = await catalogClient.listTools();
    const catalogNames = catalogList.tools.map(x => x.name);
    const listedGemini = catalogNames.filter(x => x.startsWith('jh_gemini_media_')).sort();
    assert.deepEqual(listedGemini, mediaNames, 'catalog=103 must expose exactly the same Gemini tools as /mcp');
    assert(catalogNames.includes('life_status'), 'catalog=103 must preserve existing JH tools');
    assert(catalogNames.includes('life_guide13_catalog'), 'catalog=103 must preserve the guide catalog');
    if (analysis || generation) {
      const localStatus = await catalogClient.callTool({name: 'jh_gemini_media_status', arguments: {}});
      assert.equal(CallToolResultSchema.safeParse(localStatus).success, true);
      const payload = JSON.parse(localStatus.content.find(x => x.type === 'text')?.text || '{}');
      assert.equal(payload.ok, true, 'catalog=103 status must remain callable without a provider request');
      assert.equal(payload.hardBillingCapGuaranteed, false);
      assert.equal(payload.providerCreditBalanceUsd, null);
    }
  } finally {
    await catalogClient.close();
  }

  if (process.env.JH_EBISEO_AUDIO_ENABLE) {
    assert(names.includes('life_android_audio_status'), 'existing audio tool must remain registered');
  }
  const value = async (name, args = {}) => {
    const reply = await client.callTool({name, arguments: args});
    assert.equal(CallToolResultSchema.safeParse(reply).success, true);
    assert.notEqual(reply.isError, true, JSON.stringify(reply));
    const text = reply.content.find(x => x.type === 'text')?.text;
    assert.equal(typeof text, 'string');
    return JSON.parse(text);
  };
  const outcomes = {};
  if (analysis || generation) {
    const status = await value('jh_gemini_media_status');
    assert.equal(status.ok, true, 'generated registrar must reach pre-listen-installed service');
    assert.equal(status.features.analysis.enabled, analysis);
    assert.equal(status.features.generation.enabled, generation);
    assert.equal(status.features.analysis.blockedBy, analysis ? 'BLOCKED_AUTH' : 'GEMINI_FEATURE_DISABLED');
    assert.equal(status.features.generation.blockedBy, generation ? 'BLOCKED_AUTH' : 'GEMINI_FEATURE_DISABLED');
    assert.equal(status.accountedApiCostUsd, 0);
    assert.equal(status.heldApiCostUsd, 0);
    for (const kind of ['analysis', 'generation']) {
      const input = {kind, requestId: 'owner_http_' + kind, taskRef: 'owner_http_task_' + kind,
        userRequest: kind === 'analysis' ? '이 유튜브 영상 분석해줘' : '제주 바다 영상 만들어줘',
        prompt: kind === 'analysis' ? '요청한 구간의 내용을 설명해줘.' : '제주 바다를 보여 주는 짧은 영상.',
        ...(kind === 'analysis' ? {sourceUrl: 'https://www.youtube.com/watch?v=abcdefghijk', endSeconds: 60} : {})};
      const enabled = kind === 'analysis' ? analysis : generation;
      const expected = enabled ? 'BLOCKED_AUTH' : 'GEMINI_FEATURE_DISABLED';
      const preview = await value('jh_gemini_media_preview', {request: input});
      assert.equal(preview.ok, true);
      assert.equal(preview.blockedBy, expected);
      assert.equal(preview.readyToSubmit, false);
      assert.equal(preview.paidRequestSent, false);
      const submitted = await value('jh_gemini_media_submit', {request: input, quoteId: preview.quoteId});
      assert.equal(submitted.ok, false); assert.equal(submitted.code, expected);
      assert.equal(submitted.paidRequestSent, false);
      const stored = await value('jh_gemini_media_status', {requestId: input.requestId});
      assert.equal(stored.requestId, input.requestId);
      assert.equal(stored.state, 'PLANNED');
      assert.equal(stored.billingStatus, 'NOT_SUBMITTED');
      const cancelled = await value('jh_gemini_media_cancel', {requestId: input.requestId});
      assert.equal(cancelled.state, 'CANCELLED');
      outcomes[kind] = expected;
    }
    const after = await value('jh_gemini_media_status');
    assert.equal(after.accountedApiCostUsd, 0);
    assert.equal(after.heldApiCostUsd, 0);
    assert.equal(after.unresolvedRequests, 0);
  }
  const legacy = await value('life_guide13_catalog');
  assert.equal(legacy.external_effect_status, 'NOT_EXECUTED');
  assert.equal(cutover.initializedNow, true);
  assert.equal(running.durableCircuitInstalled, true);
  assert.equal(running.lifeRuntimeInstalled, true);
  assert.equal(running.trustCreated, false);
  assert.equal(running.sessionCreated, false);
  assert.equal(externalFetchAttempts, 0);
  console.log('JH_GEMINI_OWNER_HTTP ' + JSON.stringify({health: health.status, noAuth: unauth.status,
    wrongBearer: wrongBearer.status, mediaTools: mediaNames.length, analysis, generation, outcomes,
    externalFetchAttempts, legacyToolsPreserved: true, durable: running.durableCircuitInstalled,
    lifeRuntime: running.lifeRuntimeInstalled, synthetic: true, phone: false, render: false}));
} finally {
  try {await client?.close();} catch {}
  key.fill(0);
  try {await running?.close();} catch {}
}
`;

const cases = [
  {name: 'default OFF', env: {}, analysis: false, generation: false},
  {name: 'analysis ON, generation OFF', env: {JH_GEMINI_ANALYSIS_ENABLED: '1', JH_GEMINI_GENERATION_ENABLED: '0'}, analysis: true, generation: false},
  {name: 'generation ON, analysis OFF; pending approval parent', env: {JH_GEMINI_ANALYSIS_ENABLED: '0', JH_GEMINI_GENERATION_ENABLED: '1', JH_GEMINI_TEST_BASE_MODE: 'pending-approval'}, analysis: false, generation: true},
  {name: 'both ON; followup parent', env: {JH_GEMINI_ANALYSIS_ENABLED: '1', JH_GEMINI_GENERATION_ENABLED: '1', JH_GEMINI_TEST_BASE_MODE: 'followup'}, analysis: true, generation: true},
  {name: 'both ON; complete audio-camera-peer parent', env: {
    JH_GEMINI_ANALYSIS_ENABLED: '1', JH_GEMINI_GENERATION_ENABLED: '1', JH_GEMINI_TEST_BASE_MODE: 'audio',
    JH_EBISEO_AUDIO_ENABLE: 'EXPLICIT_EBISEO_AUDIO_V05',
    JH_MOBILE_WEB_13_MODE: 'EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1',
    JH_STAGE26_SIGNED_COMPLETION_ACK: 'EXPLICIT_IDENTICAL_SIGNED_RESULT_V1',
    JH_STAGE40_OWNER_ADMISSION_DIAGNOSTICS: 'EXPLICIT_ORIGINAL_OWNER_REASON_V1',
    JH_STAGE41_COMMAND_LIFECYCLE_DIAGNOSTICS: 'EXPLICIT_SIGNED_COMMAND_CAUSE_V1',
    JH_STAGE44_DEVICE_FOCUS: 'EXPLICIT_SIGNED_WORKFLOW_FOCUS_V1',
    JH_MOBILE13_COMMAND_DIAGNOSTICS: 'EXPLICIT_OWNER_DEVICE_READ_ONLY_V1',
    JH_KABISEO_CAMERA_ENABLE: 'EXPLICIT_KABISEO_CAMERA_V0256',
    JH_PEER_PREPARATION_NOTICE_JSON: '{"event":"Synthetic test event","pickup":"Synthetic test counter"}'
  }, analysis: true, generation: true}
];

for (const c of cases) test('real generated owner HTTP: ' + c.name, {timeout: 60000}, () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'jh-gemini-owner-http-'));
  const mount = path.join(directory, 'mount');
  mkdirSync(mount, {mode: 0o700});
  mkdirSync(path.join(mount, 'jh-pc-bootstrap'), {mode: 0o700});
  const fixture = path.join(directory, 'fixture.json');
  const input = {version: 1, serverOrigin: 'https://jh-secure-bridge-fix4.onrender.com',
    catalogDigest: 'a777e1a88a0b7633ba983ca3054d2eb28f3b9c41596e0a46b93597d478a42ca1',
    googleWebClientId: 'jh-gemini-offline.apps.googleusercontent.com',
    allowedPresenterClientIds: ['jh-gemini-offline.apps.googleusercontent.com'],
    ownerSubject: 'jh-gemini-synthetic-owner', ownerLabel: 'Synthetic Gemini Owner',
    storageMount: mount, storageEpoch: 'gemini_synthetic_20261127'};
  const observations = {mountInfo: '1 0 8:1 / ' + mount + ' rw - ext4 /dev/synthetic rw', filesystemType: 0xef53};
  writeFileSync(fixture, JSON.stringify({input, observations, keys: path.join(directory, 'keys')}), {mode: 0o600});
  try {
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', PROBE, ROOT, fixture], {
      cwd: path.resolve(ROOT, '..'), encoding: 'utf8', timeout: 45000, maxBuffer: 8 * 1024 * 1024,
      env: {PATH: process.env.PATH,
        CI: 'true', NODE_ENV: 'test',
        LIFE_HUB_TOKEN: 'GEMINI_SYNTHETIC_LOOPBACK_TOKEN_ONLY_20261127',
        JH_OWNER_DEFER_LISTEN: '1',
        JH_GEMINI_OPERATOR_ENABLE: 'EXPLICIT_GEMINI_MEDIA_OWNER_V1',
        JH_GEMINI_MEDIA_PROVISION: 'INITIALIZE_EXISTING_LIFE_DB_V1', ...c.env}
    });
    assert.equal(run.status, 0, c.name + '\n' + run.stderr + '\n' + run.stdout);
    const line = run.stdout.split('\n').find(x => x.startsWith(LABEL));
    assert(line, 'no real owner HTTP receipt');
    const receipt = JSON.parse(line.slice(LABEL.length));
    assert.equal(receipt.health, 200);
    assert.equal(receipt.noAuth, 401);
    assert.equal(receipt.wrongBearer, 401);
    assert.equal(receipt.mediaTools, c.analysis || c.generation ? 5 : 0);
    assert.equal(receipt.analysis, c.analysis); assert.equal(receipt.generation, c.generation);
    assert.equal(receipt.externalFetchAttempts, 0);
    assert.equal(receipt.legacyToolsPreserved, true);
    assert.equal(receipt.durable, true); assert.equal(receipt.lifeRuntime, true);
    assert.equal(receipt.synthetic, true); assert.equal(receipt.phone, false); assert.equal(receipt.render, false);
    if (c.analysis || c.generation) {
      assert.equal(receipt.outcomes.analysis, c.analysis ? 'BLOCKED_AUTH' : 'GEMINI_FEATURE_DISABLED');
      assert.equal(receipt.outcomes.generation, c.generation ? 'BLOCKED_AUTH' : 'GEMINI_FEATURE_DISABLED');
    }
  } finally {rmSync(directory, {recursive: true, force: true});}
});
