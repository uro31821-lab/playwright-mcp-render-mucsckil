import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { validateOwnerConfiguration, EXPECTED_ORIGIN, EXPECTED_CATALOG } from '../deployment/owner-config.mjs';
import { installOwnerLearning } from './owner-host.mjs';

function fixture(t, subject = 'synthetic-learning-owner') {
  const dir = mkdtempSync(path.join(tmpdir(), 'jh-learning-owner-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const input = { version: 1, serverOrigin: EXPECTED_ORIGIN, catalogDigest: EXPECTED_CATALOG,
    googleWebClientId: 'synthetic.apps.googleusercontent.com',
    allowedPresenterClientIds: ['synthetic.apps.googleusercontent.com'],
    ownerSubject: subject, ownerLabel: 'Synthetic test owner', storageMount: dir,
    storageEpoch: 'synthetic-learning-epoch-1' };
  const config = validateOwnerConfiguration(input);
  mkdirSync(config.stateDir, { mode: 0o700 });
  let controller, detached = 0;
  const runtime = { httpServer: { listening: false }, installOperationalLearning56(value) {
    controller = value;
    return { installed: true, close() { detached++; } };
  } };
  return { dir, input, config, runtime, get controller() { return controller; },
    get detached() { return detached; }, file: path.join(config.stateDir, 'operational-learning-v1.json') };
}

test('owner learning requires validated config and installation before listening', async t => {
  const f = fixture(t);
  await assert.rejects(installOwnerLearning(f.runtime, { config: { ...f.config } }), /VALIDATED_CONFIGURATION_REQUIRED/);
  f.runtime.httpServer.listening = true;
  await assert.rejects(installOwnerLearning(f.runtime, { config: f.config }), /LEARNING_OWNER_PRELISTEN_REQUIRED/);
  assert.equal(f.controller, undefined);
});

test('owner memory survives host restart and close is idempotent', async t => {
  const f = fixture(t);
  const first = await installOwnerLearning(f.runtime, { config: f.config, runtimeId: 'boot-one' });
  let handled = 0;
  const response = { content: [{ type: 'text', text: '{"ok":true}' }] };
  assert.equal(await f.controller.invoke({ name: 'life_status', requestId: 'a' }, () => { handled++; return response; }), response);
  assert.equal(handled, 1);
  const saved = JSON.parse(readFileSync(f.file, 'utf8'));
  assert.equal(saved.ownerScope, 'jh-owner:' + f.config.accountDigest);
  assert.equal((await first.status()).counts.attempts, 1);
  await Promise.all([first.close(), first.close()]);
  assert.equal(f.detached, 1);
  const next = await installOwnerLearning(f.runtime, { config: f.config, runtimeId: 'boot-two' });
  assert.equal((await next.status()).counts.attempts, 1);
  await next.close();
});

test('another owner cannot read or reset memory in the same directory', async t => {
  const f = fixture(t);
  const first = await installOwnerLearning(f.runtime, { config: f.config, runtimeId: 'boot-a' });
  await f.controller.invoke({ name: 'life_status' }, () => ({ content: [] }));
  await first.close();
  const original = readFileSync(f.file);
  const other = validateOwnerConfiguration({ ...f.input, ownerSubject: 'another-synthetic-owner' });
  const second = await installOwnerLearning(f.runtime, { config: other, runtimeId: 'boot-b' });
  const status = await second.status();
  assert.equal(status.stateAvailable, false);
  assert.equal(status.degraded, true);
  let handled = 0;
  await f.controller.invoke({ name: 'life_status' }, () => { handled++; return { content: [] }; });
  assert.equal(handled, 1);
  assert.deepEqual(readFileSync(f.file), original);
  await second.close();
});

test('corrupt memory is visible as degraded and preserved while work executes once', async t => {
  const f = fixture(t);
  writeFileSync(f.file, '{invalid-synthetic-json', { mode: 0o600 });
  const original = readFileSync(f.file);
  const host = await installOwnerLearning(f.runtime, { config: f.config });
  assert.equal((await host.status()).degraded, true);
  const expected = Error('original handler exception');
  let handled = 0;
  await assert.rejects(f.controller.invoke({ name: 'life_status' }, () => { handled++; throw expected; }), error => error === expected);
  assert.equal(handled, 1);
  assert.deepEqual(readFileSync(f.file), original);
  await host.close();
});

test('unsafe or missing parent never creates a replacement owner store', async t => {
  const f = fixture(t);
  chmodSync(f.config.stateDir, 0o755);
  const host = await installOwnerLearning(f.runtime, { config: f.config });
  const status = await host.status();
  assert.equal(status.enabled, false);
  assert.equal(status.degraded, true);
  assert.deepEqual(status.diagnostics.codes, ['LEARNING_STORAGE_UNAVAILABLE']);
  let handled = 0;
  await f.controller.invoke({}, () => { handled++; });
  assert.equal(handled, 1);
  assert.throws(() => readFileSync(f.file), { code: 'ENOENT' });
  await host.close();
});
