// Preserve PR #51's private singleton archive. Add a lifetime lease and
// conservative PID, socket, inode and exclusive-host checks before recovery.
import path from 'node:path';
import { acquireProfileLease, recoverProfileSingletons } from './render-owner-profile.mjs';

export async function archiveStaleChromiumSingletons(profile, options = {}) {
  if (!path.isAbsolute(profile) || profile === '/' || !path.isAbsolute(options.procRoot || '/proc'))
    return { code: 'OWNER_SINGLETON_PATH_INVALID', archived: false, count: 0 };
  let lease = options.lease;
  try {
    lease ||= await acquireProfileLease(profile);
    return await recoverProfileSingletons(profile, lease, options);
  } catch (error) {
    const aliases = { OWNER_PROFILE_ACTIVE: 'OWNER_SINGLETON_BROWSER_STILL_RUNNING',
      OWNER_PROFILE_UNSAFE: 'OWNER_SINGLETON_UNEXPECTED_FILE', OWNER_PROFILE_CHANGED: 'OWNER_SINGLETON_CHANGED_BEFORE_ARCHIVE' };
    const code = aliases[error.message] || (/^OWNER_PROFILE_[A-Z_]+$/.test(error.message) ? error.message : 'OWNER_SINGLETON_PROCESS_CHECK_UNAVAILABLE');
    return { code, archived: false, count: 0 };
  } finally { if (!options.lease) await lease?.release(); }
}
