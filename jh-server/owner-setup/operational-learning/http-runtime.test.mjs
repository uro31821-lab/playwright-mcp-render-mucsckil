import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, mkdirSync, cpSync, symlinkSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { EXPECTED_ORIGIN, EXPECTED_CATALOG } from '../deployment/owner-config.mjs';

function fixture(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'jh-learning-http-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const originalRoot = path.resolve(import.meta.dirname, '..');
  const root = path.join(dir, 'owner-setup');
  cpSync(originalRoot, root, { recursive: true,
    filter: source => !source.split(path.sep).includes('node_modules') });
  symlinkSync(path.join(originalRoot, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  symlinkSync(path.join(originalRoot, 'owner-enrollment/node_modules'),
    path.join(root, 'owner-enrollment/node_modules'), 'dir');
  const mount = path.join(dir, 'mount');
  mkdirSync(mount, { mode: 0o700 });
  mkdirSync(path.join(mount, 'jh-pc-bootstrap'), { mode: 0o700 });
  const input = { version: 1, serverOrigin: EXPECTED_ORIGIN, catalogDigest: EXPECTED_CATALOG,
    googleWebClientId: 'synthetic-learning.apps.googleusercontent.com',
    allowedPresenterClientIds: ['synthetic-learning.apps.googleusercontent.com'],
    ownerSubject: 'synthetic-http-owner', ownerLabel: 'Synthetic', storageMount: mount,
    storageEpoch: 'synthetic_http_learning_20261031' };
  const data = path.join(dir, 'input.json');
  writeFileSync(data, JSON.stringify({ input, keys: path.join(dir, 'keys'), observations: {
    mountInfo: '1 0 8:1 / ' + mount + ' rw - ext4 /dev/synthetic rw', filesystemType: 0xef53,
  } }), { mode: 0o600 });
  return { dir, root, data };
}

function runPhase({ dir, root, data }, phase) {
  return spawnSync(process.execPath, [path.join(root, 'operational-learning/http-runtime.fixture.mjs'), data, phase], {
    cwd: root, encoding: 'utf8', timeout: phase === 'comfort' ? 45000 : 35000,
    env: { PATH: process.env.PATH, CI: 'true', NODE_ENV: 'test', JH_OWNER_DEFER_LISTEN: '1',
      LIFE_HUB_TOKEN: 'SYNTHETIC_LEARNING_HTTP_TOKEN_20261031',
      ...(phase.startsWith('host-memory-')
        ? { JH_HOST_MEMORY_BRIDGE: 'EXPLICIT_OWNER_HOST_MEMORY_V1' } : {}),
      JH_OAUTH_STATE_FILE: path.join(dir, 'oauth.json') },
  });
}

test('real owner bootstrap records authenticated MCP calls across clients and process restart', { timeout: 90000 }, t => {
  const setup = fixture(t);
  const results = [];
  for (const phase of ['first', 'restart']) {
    const child = runPhase(setup, phase);
    assert.equal(child.status, 0, (child.error?.message ?? '') + '\n' + child.stderr + '\n' + child.stdout);
    const line = child.stdout.split('\n').find(item => item.startsWith('LEARNING_HTTP_RESULT '));
    assert.ok(line, child.stdout);
    results.push(JSON.parse(line.slice('LEARNING_HTTP_RESULT '.length)));
  }
  assert.equal(results[0].firstAttempts, 1);
  assert.equal(results[0].attempts, 4); // Two actual status observations and two synthetic fixture failures.
  assert.equal(results[0].syntheticProposalAttempts, 2);
  assert.equal(results[1].firstAttempts, 5);
  assert.equal(results[1].attempts, 6);
  assert.equal(results[1].syntheticProposalAttempts, 0);
  assert.equal(results[0].proposalDecisionAuth, true);
  assert.equal(results[0].reviewReadiness, true);
  for (const result of results) {
    assert.equal(result.existingReceiptReconciliationCapability, true);
    assert.equal(result.splitReadObservationReconciliationCapability, true);
    assert.equal(result.splitFollowupClickReceiptReconciliationCapability, true);
    assert.equal(result.computerInspectReceiptReconciliationCapability, true);
    assert.equal(result.splitComfortStatusReceiptReconciliationCapability, true);
    assert.equal(result.proposalDecisionCatalog, true);
    assert.equal(result.proposalDecisions, 2);
    assert.equal(result.decisionRetryNoop, true);
    assert.equal(result.proposalProgress, true);
  }
  assert.equal(results[1].proposalDecisionPersisted, true);
  assert.equal(results[1].proposalDecisionHistoryHash, results[0].proposalDecisionHistoryHash);
  assert.equal(results[1].proposalProgressPersisted, true);
  assert.equal(results[1].proposalProgressLinkHash, results[0].proposalProgressLinkHash);
  assert.ok(results[1].revision > results[0].revision);
});

test('generated owner MCP shares explicit host observations across clients and restart without recursive events or device effects', { timeout: 90000 }, t => {
  const setup = fixture(t);
  const results = [];
  for (const phase of ['host-memory-first', 'host-memory-restart']) {
    const child = runPhase(setup, phase);
    assert.equal(child.status, 0, (child.error?.message ?? '') + '\n' + child.stderr + '\n' + child.stdout);
    const line = child.stdout.split('\n').find(item => item.startsWith('LEARNING_HOST_MEMORY_HTTP_RESULT '));
    assert.ok(line, child.stdout);
    results.push(JSON.parse(line.slice('LEARNING_HOST_MEMORY_HTTP_RESULT '.length)));
  }
  for (const result of results) {
    for (const key of ['generatedRuntime', 'ownerBootstrapInstalled', 'authenticated', 'explicitHostCapability',
      'unauthorizedRejected', 'invalidPayloadsRejected', 'twoClientReadback', 'exactRetryNoop', 'conflictRejected',
      'staleNewObservationRejected', 'noRecursiveEvents', 'scopeIsolated', 'journalUnchanged', 'noAutomaticRuleActivation'])
      assert.equal(result[key], true, key);
    assert.equal(result.hostEvents, 1);
    assert.equal(result.hostAttempts, 1);
    assert.equal(result.ordinaryChatsObserved, false);
    assert.equal(result.librarySync, 'not_connected');
    assert.equal(result.sourceAuthentication, 'authenticated_owner_attestation');
    assert.equal(result.realDevices, 0);
    assert.equal(result.phoneToolsCalled, 0);
    assert.equal(result.externalRequests, 0);
  }
  assert.equal(results[1].originalPayloadPersisted, true);
  assert.equal(results[1].restartBytesUnchangedBeforeStatus, true);
  assert.equal(results[1].eventId, results[0].eventId);
  assert.equal(results[1].eventSha256, results[0].eventSha256);
});

test('generated runtime reconciles a real cir_ HTTP readback from a synthetic signed INSPECT only', { timeout: 60000 }, t => {
  const child = runPhase(fixture(t), 'inspect');
  assert.equal(child.status, 0, (child.error?.message ?? '') + '\n' + child.stderr + '\n' + child.stdout);
  const line = child.stdout.split('\n').find(item => item.startsWith('LEARNING_INSPECT_HTTP_RESULT '));
  assert.ok(line, child.stdout);
  const result = JSON.parse(line.slice('LEARNING_INSPECT_HTTP_RESULT '.length));
  for (const field of ['generatedRuntime', 'syntheticEnrollmentPort', 'originalReceiptIssued',
    'originalReadbackReconciled', 'observedOnly', 'unauthorizedRejected', 'badCompletionMacRejected',
    'changedBindingRejected', 'pendingUnchanged', 'repeatNoop', 'originalResultPreserved', 'sensitiveEvidenceRedacted'])
    assert.equal(result[field], true, field);
  assert.equal(result.realDevices, 0);
  assert.equal(result.externalRequests, 0);
  assert.equal(result.additionalJobs, 0);
});

test('generated runtime reconciles a real srr_ HTTP readback from synthetic signed comfort STATUS only', { timeout: 60000 }, t => {
  const child = runPhase(fixture(t), 'comfort');
  assert.equal(child.status, 0, (child.error?.message ?? '') + '\n' + child.stderr + '\n' + child.stdout);
  const line = child.stdout.split('\n').find(item => item.startsWith('LEARNING_COMFORT_HTTP_RESULT '));
  assert.ok(line, child.stdout);
  const result = JSON.parse(line.slice('LEARNING_COMFORT_HTTP_RESULT '.length));
  for (const field of ['generatedRuntime', 'syntheticEnrollmentPort', 'originalReceiptIssued',
    'originalReadbackReconciled', 'observedOnly', 'unauthorizedRejected', 'badCompletionMacRejected',
    'changedBindingRejected', 'pendingUnchanged', 'repeatNoop', 'originalResultPreserved', 'sensitiveEvidenceRedacted',
    'splitComfortStatusReceiptReconciliationCapability'])
    assert.equal(result[field], true, field);
  assert.ok(result.originalWaitElapsedMs >= 28000);
  assert.equal(result.realDevices, 0);
  assert.equal(result.externalRequests, 0);
  assert.equal(result.additionalJobs, 0);
  assert.equal(result.fallbackSnapshotCreated, false);
});
