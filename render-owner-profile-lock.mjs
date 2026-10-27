// Recover Chromium's *singleton symlinks only* after a disk-backed Render
// restart. Never touch cookies, localStorage, profiles, or arbitrary files.
// Render documents that a persistent disk is attached to one instance at a
// time and stops the old instance before the new one is started.
import { randomBytes } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, rename } from 'node:fs/promises';
import path from 'node:path';

const singletonNames = Object.freeze(['SingletonLock', 'SingletonSocket', 'SingletonCookie']);

function result(code, archived = false, count = 0) {
  return { code, archived, count };
}

export async function archiveStaleChromiumSingletons(profile, { procRoot = '/proc' } = {}) {
  // Caller must have verified the disk mount BEFORE this helper is invoked.
  if (!path.isAbsolute(profile) || profile === '/' || !path.isAbsolute(procRoot))
    return result('OWNER_SINGLETON_PATH_INVALID');
  let entries;
  try {
    entries = await readdir(procRoot, { withFileTypes: true });
  } catch {
    // Fail closed when we cannot inspect running processes.
    return result('OWNER_SINGLETON_PROCESS_CHECK_UNAVAILABLE');
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^[0-9]+$/.test(entry.name)) continue;
    let args;
    try {
      args = await readFile(path.join(procRoot, entry.name, 'cmdline'));
    } catch (error) {
      // A process can exit between readdir and readFile.
      if (['ENOENT', 'ESRCH'].includes(error?.code)) continue;
      return result('OWNER_SINGLETON_PROCESS_CHECK_UNAVAILABLE');
    }
    const argv = args.toString('utf8').split('\0').filter(Boolean);
    if (argv.some(arg => arg === '--user-data-dir=' + profile) &&
        argv.some(arg => /(?:^|\/)(?:chrome|chromium)(?:-[a-z0-9-]+)?$/.test(arg.split(' ')[0])))
      return result('OWNER_SINGLETON_BROWSER_STILL_RUNNING');
  }

  // On Linux, these are Chromium-created symbolic links. Do not modify a
  // regular file or follow an attacker-supplied symlink. We only rename them
  // into a private archive after the process check proves no live owner.
  const found = [];
  for (const name of singletonNames) {
    const source = path.join(profile, name);
    let stats;
    try { stats = await lstat(source); }
    catch (error) {
      if (error?.code === 'ENOENT') continue;
      return result('OWNER_SINGLETON_INSPECTION_FAILED');
    }
    if (!stats.isSymbolicLink()) return result('OWNER_SINGLETON_UNEXPECTED_FILE');
    found.push({ name, source, inode: stats.ino, dev: stats.dev });
  }
  if (!found.some(v => v.name === 'SingletonLock'))
    return result('OWNER_SINGLETON_NO_LOCK');

  const archive = path.join(profile, '.jh-archived-singletons',
    String(Date.now()) + '-' + randomBytes(5).toString('hex'));
  try {
    await mkdir(archive, { recursive: true, mode: 0o700 });
    for (const lock of found) {
      const current = await lstat(lock.source);
      if (!current.isSymbolicLink() || current.ino !== lock.inode || current.dev !== lock.dev)
        return result('OWNER_SINGLETON_CHANGED_BEFORE_ARCHIVE');
      await rename(lock.source, path.join(archive, lock.name));
    }
    return result('OWNER_SINGLETON_ARCHIVED_FOR_RETRY', true, found.length);
  } catch {
    return result('OWNER_SINGLETON_ARCHIVE_FAILED');
  }
}
