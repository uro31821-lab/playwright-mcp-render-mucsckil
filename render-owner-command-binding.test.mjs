// Read-only diagnosis of the deployed relay's exact source. This runs in a VM
// with synthetic devices/state; it never contacts JH or issues a real command.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const source = await readFile(process.env.JH_DIAGNOSTIC_SOURCE, 'utf8');
assert.equal(createHash('sha1').update(`blob ${Buffer.byteLength(source)}\0`).update(source).digest('hex'),
  '2d971c34d6d90d31831fb1adbad2cbd6aa081bf4', 'diagnosis must use the verified deployed source');
const shared = source.match(/const shared=String\.raw`([\s\S]*?)`;\n\n  const pollAnchor/)[1];
function fixture() {
  const clock = { now: 1000 };
  const sandbox = { JhAsyncLocalStorage56: AsyncLocalStorage, process: { env: {} }, randomBytes,
    sha56: value => createHash('sha256').update(value).digest('hex'), Date: { now: () => clock.now },
    jobs: new Map(), recentJobs: new Map(), recentWeb: new Map(), queues: new Map(), frameWaiters56: new Map(), durableNativeHooks56: null };
  vm.runInNewContext(shared + '\nthis.api={context:jhCommandContext56,start:jhStartCommand56,require:jhRequireCommand56,discard:jhDiscardDeviceWork56,current:jhCommandVersion56};', sandbox);
  const a = 'a'.repeat(32), b = 'b'.repeat(32), device = 'synthetic-device';
  const run = (id, fn) => sandbox.api.context.run({ device, commandId: id, version: sandbox.api.current(device) }, fn);
  return { ...sandbox.api, a, b, device, run, clock };
}
test('BEGIN_COMMAND has no short TTL: unchanged binding remains valid after an hour', () => {
  const f = fixture(); f.run(f.a, () => f.start(f.device, f.a));
  f.clock.now += 61 * 60 * 1000;
  assert.equal(f.run(f.a, () => f.require(f.device)), f.a);
});
test('another conversation beginning work on the same device invalidates the old binding before dispatch', () => {
  const f = fixture(); f.run(f.a, () => f.start(f.device, f.a));
  f.run(f.b, () => f.start(f.device, f.b));
  let dispatched = false;
  assert.throws(() => f.run(f.a, () => { f.require(f.device); dispatched = true; }), /new_command_binding_required_or_discarded/);
  assert.equal(dispatched, false);
  assert.throws(() => f.run(f.a, () => f.start(f.device, f.a)), /old_command_cannot_restart/);
});
test('phone discard advances the device fence; a delayed discard cannot cancel a newer command', () => {
  const f = fixture(); f.run(f.a, () => f.start(f.device, f.a));
  f.discard(f.device, 'c'.repeat(32), f.a);
  assert.throws(() => f.run(f.a, () => f.require(f.device)), /new_command_binding_required_or_discarded/);
  f.run(f.b, () => f.start(f.device, f.b));
  f.discard(f.device, 'd'.repeat(32), f.a);
  assert.equal(f.run(f.b, () => f.require(f.device)), f.b);
});
