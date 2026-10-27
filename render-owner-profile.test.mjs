import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink, writeFile, readFile, readlink, rm, lstat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { acquireProfileLease, recoverProfileSingletons } from './render-owner-profile.mjs';

async function fixture(t) {
  const profile = await mkdtemp(path.join(os.tmpdir(), 'jh-recovery-'));
  t.after(() => rm(profile, { recursive: true, force: true }));
  const lease = await acquireProfileLease(profile);
  t.after(() => lease.release());
  return { profile, lease };
}
async function stale(profile, host = 'old-render-instance') {
  await symlink(`${host}-2147483647`, path.join(profile, 'SingletonLock'));
  await symlink(path.join(profile, 'absent-socket'), path.join(profile, 'SingletonSocket'));
  await symlink('synthetic-cookie-marker', path.join(profile, 'SingletonCookie'));
}

test('exclusive lease rejects concurrent launchers and can be reacquired after release', async t => {
  const { profile, lease } = await fixture(t);
  await assert.rejects(acquireProfileLease(profile), /OWNER_PROFILE_ACTIVE/);
  const inode = (await lstat(path.join(profile, '.jh-owner-lease'))).ino;
  await lease.release();
  const next = await acquireProfileLease(profile); await next.release();
  assert.equal((await lstat(path.join(profile, '.jh-owner-lease'))).ino, inode);
});

test('stale cross-host links recover only on an exclusive host mount and preserve all login files', async t => {
  const { profile, lease } = await fixture(t);
  await mkdir(path.join(profile, 'Default'));
  await writeFile(path.join(profile, 'Default', 'Cookies'), 'synthetic-cookie-database');
  await writeFile(path.join(profile, 'Local State'), 'synthetic-local-state');
  await stale(profile);
  await assert.rejects(recoverProfileSingletons(profile, lease), /OWNER_PROFILE_REMOTE_LOCK/);
  assert.equal(await readlink(path.join(profile, 'SingletonCookie')), 'synthetic-cookie-marker');
  assert.equal((await recoverProfileSingletons(profile, lease, { exclusiveHostMount: true })).archived, true);
  assert.equal(await readFile(path.join(profile, 'Default', 'Cookies'), 'utf8'), 'synthetic-cookie-database');
  assert.equal(await readFile(path.join(profile, 'Local State'), 'utf8'), 'synthetic-local-state');
  assert.equal((await recoverProfileSingletons(profile, lease)).archived, false);
});

test('same-host live PID is never removed, even when it is not Chromium', async t => {
  const { profile, lease } = await fixture(t);
  const target = `${os.hostname()}-${process.pid}`;
  await symlink(target, path.join(profile, 'SingletonLock'));
  await assert.rejects(recoverProfileSingletons(profile, lease), /OWNER_PROFILE_ACTIVE/);
  assert.equal(await readlink(path.join(profile, 'SingletonLock')), target);
});

test('same-host dead PID permits stale recovery', async t => {
  const { profile, lease } = await fixture(t); await stale(profile, os.hostname());
  assert.equal((await recoverProfileSingletons(profile, lease)).archived, true);
});

test('a live same-profile process blocks recovery even with a different recorded hostname', async t => {
  const { profile, lease } = await fixture(t); await stale(profile);
  const child = spawn(process.execPath, ['-e', 'process.stdout.write("ready");setInterval(()=>{},1000)', '--', `--user-data-dir=${profile}`], { stdio: ['ignore', 'pipe', 'ignore'] });
  t.after(async () => { const done = once(child, 'exit'); child.kill(); await done; });
  await once(child.stdout, 'data');
  await assert.rejects(recoverProfileSingletons(profile, lease, { exclusiveHostMount: true }), /OWNER_PROFILE_ACTIVE/);
  assert.equal(await readlink(path.join(profile, 'SingletonLock')), 'old-render-instance-2147483647');
});

test('a live singleton socket blocks recovery without sending browser commands', async t => {
  const { profile, lease } = await fixture(t); await stale(profile);
  const server = net.createServer(s => s.end());
  await new Promise(r => server.listen(path.join(profile, 'absent-socket'), r));
  t.after(() => new Promise(r => server.close(r)));
  await assert.rejects(recoverProfileSingletons(profile, lease, { exclusiveHostMount: true }), /OWNER_PROFILE_ACTIVE/);
});

test('regular files and malformed links fail closed before unlinking anything', async t => {
  const { profile, lease } = await fixture(t); await stale(profile);
  await rm(path.join(profile, 'SingletonCookie'));
  await writeFile(path.join(profile, 'SingletonCookie'), 'do-not-delete');
  await assert.rejects(recoverProfileSingletons(profile, lease, { exclusiveHostMount: true }), /OWNER_PROFILE_UNSAFE/);
  assert.equal(await readFile(path.join(profile, 'SingletonCookie'), 'utf8'), 'do-not-delete');
  assert.equal(await readlink(path.join(profile, 'SingletonSocket')), path.join(profile, 'absent-socket'));
});

test('lease loss and unavailable process inspection cannot authorize recovery', async t => {
  const { profile, lease } = await fixture(t); await stale(profile);
  await assert.rejects(recoverProfileSingletons(profile, lease, { exclusiveHostMount: true, procRoot: path.join(profile, 'missing-proc') }));
  await lease.release();
  await assert.rejects(recoverProfileSingletons(profile, lease, { exclusiveHostMount: true }), /OWNER_PROFILE_LEASE_LOST/);
  assert.equal(await readlink(path.join(profile, 'SingletonLock')), 'old-render-instance-2147483647');
});

test('lease symlink cannot redirect the advisory lock', async t => {
  const profile = await mkdtemp(path.join(os.tmpdir(), 'jh-lease-unsafe-'));
  t.after(() => rm(profile, { recursive: true, force: true }));
  await writeFile(path.join(profile, 'untouched'), 'preserve');
  await symlink(path.join(profile, 'untouched'), path.join(profile, '.jh-owner-lease'));
  await assert.rejects(acquireProfileLease(profile));
  assert.equal(await readFile(path.join(profile, 'untouched'), 'utf8'), 'preserve');
});
