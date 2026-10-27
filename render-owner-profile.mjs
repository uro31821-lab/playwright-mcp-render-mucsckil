// Linux/Chromium singleton recovery. Never read cookies, remove a profile,
// follow a singleton symlink, or kill a process to acquire this profile.
import { constants } from 'node:fs';
import { open, lstat, readlink, readFile, readdir, mkdir, mkdtemp, rename, realpath } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const names = ['SingletonLock', 'SingletonSocket', 'SingletonCookie'];
const fail = code => { throw Error(code); };

// Keep the inode forever: deleting a flock file would allow two independent locks.
// An inherited descriptor prevents following a substituted path in flock.
export async function acquireProfileLease(profile) {
  const file = await open(path.join(profile, '.jh-owner-lease'),
    constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW, 0o600);
  const stat = await file.stat();
  if (!stat.isFile() || stat.nlink !== 1) { await file.close(); fail('OWNER_PROFILE_UNSAFE'); }
  const child = spawn('flock', ['--exclusive', '--nonblock', '--conflict-exit-code', '73',
    '/proc/self/fd/3', process.execPath, '-e',
    'process.stdout.write("LOCKED\\n");process.stdin.resume();'],
  { stdio: ['pipe', 'pipe', 'ignore', file.fd] });
  await file.close();
  child.stdin.on('error', () => {});
  const closed = new Promise(resolve => { child.once('exit', resolve); child.once('error', resolve); });
  let released = false;
  const release = async () => { released = true; child.stdin.end(); await closed; };
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.kill('SIGTERM'); reject(Error('OWNER_PROFILE_LEASE_UNAVAILABLE')); }, 5000);
      const done = error => { clearTimeout(timer); error ? reject(error) : resolve(); };
      child.once('error', () => done(Error('OWNER_PROFILE_LEASE_UNAVAILABLE')));
      child.once('exit', code => done(Error(code === 73 ? 'OWNER_PROFILE_ACTIVE' : 'OWNER_PROFILE_LEASE_UNAVAILABLE')));
      child.stdout.once('data', data => done(data.toString() === 'LOCKED\n' ? null : Error('OWNER_PROFILE_LEASE_UNAVAILABLE')));
    });
  } catch (error) { await release(); throw error; }
  return { release, assertHeld() { if (released || child.exitCode !== null || child.signalCode) fail('OWNER_PROFILE_LEASE_LOST'); },
    onLost(fn) { void closed.then(() => { if (!released) fn(); }); } };
}

async function singleton(profile, name) {
  try {
    const file = path.join(profile, name), s = await lstat(file);
    if (!s.isSymbolicLink()) fail('OWNER_PROFILE_UNSAFE');
    return { name, dev: s.dev, ino: s.ino, ctime: s.ctimeMs, target: await readlink(file) };
  } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}

async function assertNoProfileProcess(profile, procRoot) {
  // A host-mounted /proc from another PID namespace cannot prove local absence.
  const self = await readFile(path.join(procRoot, 'self', 'stat'), 'utf8');
  if (Number(self.split(' ')[0]) !== process.pid) fail('OWNER_PROFILE_INSPECTION_FAILED');
  for (const pid of await readdir(procRoot)) {
    if (!/^\d+$/.test(pid)) continue;
    let args;
    try { args = (await readFile(path.join(procRoot, pid, 'cmdline'), 'utf8')).split('\0'); }
    catch (e) { if (e.code === 'ENOENT' || e.code === 'ESRCH') continue; fail('OWNER_PROFILE_INSPECTION_FAILED'); }
    for (let i = 0; i < args.length; i++) {
      const value = args[i] === '--user-data-dir' ? args[i + 1] : args[i].startsWith('--user-data-dir=') ? args[i].slice(16) : null;
      if (value && (path.resolve(value) === profile || await realpath(value).catch(() => null) === profile)) fail('OWNER_PROFILE_ACTIVE');
    }
  }
}

async function assertDeadSocket(target) {
  if (!path.isAbsolute(target)) fail('OWNER_PROFILE_UNSAFE');
  try { await lstat(target); } catch (e) { if (e.code === 'ENOENT') return; throw e; }
  await new Promise((resolve, reject) => {
    const socket = net.createConnection(target);
    socket.once('connect', () => { socket.destroy(); reject(Error('OWNER_PROFILE_ACTIVE')); });
    socket.once('error', e => { socket.destroy(); ['ENOENT', 'ECONNREFUSED'].includes(e.code) ? resolve() : reject(Error('OWNER_PROFILE_INSPECTION_FAILED')); });
    socket.setTimeout(500, () => { socket.destroy(); reject(Error('OWNER_PROFILE_INSPECTION_FAILED')); });
  });
}

export async function recoverProfileSingletons(profile, lease, {
  // True ONLY after verifying the dedicated Render disk mount. Render mounts
  // it on one instance at a time and stops the old instance before replacement.
  exclusiveHostMount = false, hostname = os.hostname(), procRoot = '/proc',
} = {}) {
  lease.assertHeld();
  if (await realpath(profile) !== profile) fail('OWNER_PROFILE_UNSAFE');
  await assertNoProfileProcess(profile, procRoot);
  const entries = await Promise.all(names.map(name => singleton(profile, name)));
  const lock = entries[0];
  if (!lock) return { code: 'OWNER_SINGLETON_NO_LOCK', archived: false, count: 0 };
  const parsed = /^([A-Za-z0-9_.-]+)-(\d+)$/.exec(lock.target);
  if (!parsed || Number(parsed[2]) < 1 || !Number.isSafeInteger(Number(parsed[2]))) fail('OWNER_PROFILE_UNSAFE');
  const oldHost = parsed[1] !== hostname;
  if (oldHost && !exclusiveHostMount) fail('OWNER_PROFILE_REMOTE_LOCK');
  if (!oldHost) {
    try { await lstat(path.join(procRoot, parsed[2])); fail('OWNER_PROFILE_ACTIVE'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  if (entries[1]) await assertDeadSocket(entries[1].target);
  // Validate the entire set before any mutation, then recheck each inode/link.
  const unchanged = async entry => {
    const now = await singleton(profile, entry.name);
    if (!now || ['dev', 'ino', 'ctime', 'target'].some(k => now[k] !== entry[k])) fail('OWNER_PROFILE_CHANGED');
  };
  for (const entry of entries.filter(Boolean)) await unchanged(entry);
  await assertNoProfileProcess(profile, procRoot);
  lease.assertHeld();
  const archiveRoot = path.join(profile, '.jh-archived-singletons');
  await mkdir(archiveRoot, { recursive: true, mode: 0o700 });
  if (await realpath(archiveRoot) !== archiveRoot || !(await lstat(archiveRoot)).isDirectory()) fail('OWNER_PROFILE_UNSAFE');
  const archive = await mkdtemp(path.join(archiveRoot, 'recovery-'));
  // Keep SingletonLock until last, so a concurrent unmanaged Chromium cannot
  // start while stale auxiliary links are being removed. Targets are untouched.
  for (const entry of [entries[1], entries[2], lock].filter(Boolean)) {
    await unchanged(entry); lease.assertHeld();
    await rename(path.join(profile, entry.name), path.join(archive, entry.name));
  }
  return { code: 'OWNER_SINGLETON_ARCHIVED_FOR_RETRY', archived: true, count: entries.filter(Boolean).length };
}
