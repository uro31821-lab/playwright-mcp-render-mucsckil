import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, readFile, readlink, writeFile, lstat, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { archiveStaleChromiumSingletons } from './render-owner-profile-lock.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jh-lock-test-'));
  const profile = path.join(root, 'jh-browser-profile');
  const procRoot = path.join(root, 'proc');
  await mkdir(profile); await mkdir(procRoot);
  await mkdir(path.join(procRoot, 'self'));
  await writeFile(path.join(procRoot, 'self', 'stat'), `${process.pid} (node) R`);
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  return { root, profile, procRoot };
}
async function makeLocks(profile) {
  await symlink('synthetic-hostname-999999', path.join(profile, 'SingletonLock'));
  await symlink('/tmp/synthetic-chromium-socket', path.join(profile, 'SingletonSocket'));
  await symlink('synthetic-cookie', path.join(profile, 'SingletonCookie'));
}

test('archives ONLY three stale symlinks and preserves browser profile, cookies and localStorage', async t => {
  const f = await fixture(t);
  await makeLocks(f.profile);
  await mkdir(path.join(f.profile, 'Default'));
  await mkdir(path.join(f.profile, 'Local Storage'));
  await writeFile(path.join(f.profile, 'Default', 'Cookies'), 'synthetic-auth-cookie-data');
  await writeFile(path.join(f.profile, 'Local Storage', 'leveldb'), 'synthetic-local-storage');
  await writeFile(path.join(f.profile, 'Preferences'), 'synthetic-preferences');

  const result = await archiveStaleChromiumSingletons(f.profile, { exclusiveHostMount: true, procRoot: f.procRoot });
  assert.deepEqual(result, { code: 'OWNER_SINGLETON_ARCHIVED_FOR_RETRY', archived: true, count: 3 });
  assert.equal(await readFile(path.join(f.profile, 'Default', 'Cookies'), 'utf8'), 'synthetic-auth-cookie-data');
  assert.equal(await readFile(path.join(f.profile, 'Local Storage', 'leveldb'), 'utf8'), 'synthetic-local-storage');
  assert.equal(await readFile(path.join(f.profile, 'Preferences'), 'utf8'), 'synthetic-preferences');
  await assert.rejects(lstat(path.join(f.profile, 'SingletonLock')), { code: 'ENOENT' });
  const root = path.join(f.profile, '.jh-archived-singletons');
  const archived = await readdir(root); assert.equal(archived.length, 1);
  const saved = path.join(root, archived[0]);
  for (const name of ['SingletonLock','SingletonSocket','SingletonCookie'])
    assert.equal((await lstat(path.join(saved, name))).isSymbolicLink(), true);
  assert.equal(await readlink(path.join(saved, 'SingletonLock')), 'synthetic-hostname-999999');
  assert.equal((await archiveStaleChromiumSingletons(f.profile, { exclusiveHostMount: true, procRoot:f.procRoot })).archived, false);
});

test('never touches locks when a live Chromium process is using the exact profile', async t => {
  const f = await fixture(t);
  await makeLocks(f.profile);
  const pid = path.join(f.procRoot, '1729');
  await mkdir(pid);
  await writeFile(path.join(pid, 'cmdline'), Buffer.from(
    '/ms-playwright/chromium-123/chrome\0--headless\0--user-data-dir=' + f.profile + '\0'));
  const result = await archiveStaleChromiumSingletons(f.profile, { exclusiveHostMount: true, procRoot:f.procRoot });
  assert.equal(result.code, 'OWNER_SINGLETON_BROWSER_STILL_RUNNING');
  assert.equal((await lstat(path.join(f.profile, 'SingletonLock'))).isSymbolicLink(), true);
  assert.equal((await lstat(path.join(f.profile, 'SingletonCookie'))).isSymbolicLink(), true);
});

test('never touches a non-symlink SingletonLock or unknown browser file', async t => {
  const f = await fixture(t);
  await writeFile(path.join(f.profile, 'SingletonLock'), 'MUST_REMAIN');
  const r = await archiveStaleChromiumSingletons(f.profile, { exclusiveHostMount: true, procRoot:f.procRoot });
  assert.equal(r.code, 'OWNER_SINGLETON_UNEXPECTED_FILE');
  assert.equal(await readFile(path.join(f.profile, 'SingletonLock'), 'utf8'), 'MUST_REMAIN');
});

test('fails closed when the running process list cannot be inspected', async t => {
  const f = await fixture(t);
  await makeLocks(f.profile);
  const r = await archiveStaleChromiumSingletons(f.profile,
    { exclusiveHostMount: true, procRoot:path.join(f.root, 'missing-proc') });
  assert.equal(r.code, 'OWNER_SINGLETON_PROCESS_CHECK_UNAVAILABLE');
  assert.equal((await lstat(path.join(f.profile, 'SingletonLock'))).isSymbolicLink(), true);
});

test('requires an actual lock and refuses invalid paths', async t => {
  const f = await fixture(t);
  assert.equal((await archiveStaleChromiumSingletons(f.profile,
    { exclusiveHostMount: true, procRoot:f.procRoot })).code, 'OWNER_SINGLETON_NO_LOCK');
  assert.equal((await archiveStaleChromiumSingletons('relative-profile',
    { exclusiveHostMount: true, procRoot:f.procRoot })).code, 'OWNER_SINGLETON_PATH_INVALID');
});
