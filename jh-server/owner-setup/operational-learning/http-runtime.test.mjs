import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, mkdirSync, cpSync, symlinkSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { EXPECTED_ORIGIN, EXPECTED_CATALOG } from '../deployment/owner-config.mjs';

test('real owner bootstrap records authenticated MCP calls across clients and process restart', { timeout: 90000 }, t => {
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
  const results = [];
  for (const phase of ['first', 'restart']) {
    const child = spawnSync(process.execPath, [path.join(root, 'operational-learning/http-runtime.fixture.mjs'), data, phase], {
      cwd: root, encoding: 'utf8', timeout: 35000,
      env: { PATH: process.env.PATH, CI: 'true', NODE_ENV: 'test', JH_OWNER_DEFER_LISTEN: '1',
        LIFE_HUB_TOKEN: 'SYNTHETIC_LEARNING_HTTP_TOKEN_20261031',
        JH_OAUTH_STATE_FILE: path.join(dir, 'oauth.json') },
    });
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
    assert.equal(result.proposalDecisionCatalog, true);
    assert.equal(result.proposalDecisions, 2);
    assert.equal(result.decisionRetryNoop, true);
  }
  assert.equal(results[1].proposalDecisionPersisted, true);
  assert.equal(results[1].proposalDecisionHistoryHash, results[0].proposalDecisionHistoryHash);
  assert.ok(results[1].revision > results[0].revision);
});
