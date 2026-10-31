/** Isolated HTTP fixture: real generated owner/runtime, synthetic private volume.
 * All non-loopback network requests are rejected; no real device is registered.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { validateOwnerConfiguration, loadOwnerKey } from '../deployment/owner-config.mjs';
import { takeStorageSecrets, materializeStorageKeys } from '../deployment/storage-secret-bridge.mjs';
import { prepareOperationalStorage } from '../deployment/operational-service-entry.mjs';
import { prepareOrVerifyDurableRelease, INITIAL_MODE, READY_MODE } from '../deployment/durable-live-release.mjs';
import { buildPendingApprovalOperatorEntrypoint56 } from '../server-integration/pending-approval-operator-entry.mjs';

const root = path.resolve(import.meta.dirname, '..');
const data = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const phase = process.argv[3];
const originalFetch = globalThis.fetch;
let externalRequests = 0;
globalThis.fetch = (url, options) => {
  if (new URL(url).hostname !== '127.0.0.1') {
    externalRequests++;
    throw Error('SYNTHETIC_EXTERNAL_REQUEST_FORBIDDEN');
  }
  return originalFetch(url, options);
};
const built = await buildPendingApprovalOperatorEntrypoint56(root, process.env);
const { startUnifiedOwnerServer } = await import(pathToFileURL(built.unifiedFile).href);
const config = validateOwnerConfiguration(data.input);
const secrets = takeStorageSecrets({
  JH_OWNER_STORAGE_SECRET: Buffer.alloc(32, 71).toString('base64'),
  JH_LIFE_STORAGE_SECRET: Buffer.alloc(32, 72).toString('base64'),
});
const files = materializeStorageKeys(config, secrets, data.keys);
secrets.owner.fill(0); secrets.life.fill(0);
const prepared = prepareOperationalStorage(config, files, {
  confirmation: 'EXPLICIT_ONE_TIME', storageObservations: data.observations,
});
const key = loadOwnerKey(files.ownerKeyFile, config);
let running;
try {
  prepareOrVerifyDurableRelease({ config, key, storageObservations: data.observations,
    mode: phase === 'first' ? INITIAL_MODE : READY_MODE });
  running = await startUnifiedOwnerServer({ config, key, lifeStorage: prepared.lifeStorage,
    storageObservations: data.observations, port: 0, bindAddress: '127.0.0.1' });
  assert.equal(running.operationalLearningInstalled, true);
  assert.equal(running.trustCreated, false);
  assert.equal(running.sessionCreated, false);
  const origin = 'http://127.0.0.1:' + running.port;
  const file = path.join(config.stateDir, 'operational-learning-v1.json');
  const call = async (id, name, args = {}, authorized = true) => {
    const response = await fetch(origin + '/mcp', { method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream',
        ...(authorized ? { authorization: 'Bearer ' + process.env.LIFE_HUB_TOKEN } : {}) },
      body: JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }),
      signal: AbortSignal.timeout(10000) });
    const envelope = await response.json();
    if (!authorized) return { status: response.status, envelope };
    assert.equal(response.status, 200);
    assert.ok(envelope.result?.content, JSON.stringify(envelope));
    return JSON.parse(envelope.result.content[0].text);
  };
  const first = await call(phase + '-room-a', 'life_status');
  assert.equal(first.version, '1.5.0-fix5-local-prompts');
  assert.equal(first.secureBridgeVersion, 56);
  assert.equal(first.registeredAndroidDevices, 0);
  assert.equal(first.operationalLearning.enabled, true);
  assert.equal(first.operationalLearning.degraded, false);
  assert.equal(first.operationalLearning.stateAvailable, true);
  assert.equal(first.operationalLearning.librarySync, 'not_connected');
  const beforeUnauthorized = readFileSync(file);
  const unauthorized = await call('unauthorized', 'life_status', {}, false);
  assert.equal(unauthorized.status, 200); // Existing MCP authentication challenge contract.
  assert.equal(unauthorized.envelope.result.isError, true);
  assert.ok(unauthorized.envelope.result._meta['mcp/www_authenticate'].length > 0);
  assert.deepEqual(readFileSync(file), beforeUnauthorized);
  for (let i = 0; i < 3; i++) await call('receipt-' + i, 'life_job_status', { job_id: 'job_99999' });
  assert.deepEqual(readFileSync(file), beforeUnauthorized);
  const second = await call(phase + '-room-b', 'life_status');
  assert.equal(second.operationalLearning.counts.attempts, first.operationalLearning.counts.attempts + 1);
  assert.equal(second.operationalLearning.counts.proposals, 0);
  assert.equal(second.operationalLearning.pending, 0);
  assert.equal(second.operationalLearning.attemptOutcomes.success_verified ?? 0, 0);
  const stored = readFileSync(file, 'utf8');
  assert.ok(!stored.includes(process.env.LIFE_HUB_TOKEN));
  assert.ok(!stored.includes(data.input.ownerSubject));
  assert.ok(!stored.includes('room-a'));
  assert.equal(externalRequests, 0);
  await running.close(); running = null;
  console.log('LEARNING_HTTP_RESULT ' + JSON.stringify({
    phase, firstAttempts: first.operationalLearning.counts.attempts,
    attempts: second.operationalLearning.counts.attempts,
    revision: second.operationalLearning.revision,
    authenticated: true, unauthorizedRejected: true, receiptDedupe: true,
    ownerBootstrapInstalled: true, externalRequests, realDevices: 0,
  }));
} finally { key.fill(0); await running?.close(); }
