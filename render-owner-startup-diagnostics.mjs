// Emit only allowlisted categories: Playwright errors can contain credentials,
// command arguments, filesystem paths, and browser state. Never log raw errors.
export function startupFailureCode(error) {
  const message = typeof error?.message === 'string' ? error.message : '';
  if (/^OWNER_SINGLETON_(PATH_INVALID|BROWSER_STILL_RUNNING|UNEXPECTED_FILE|CHANGED_BEFORE_ARCHIVE|PROCESS_CHECK_UNAVAILABLE)$/.test(message)) return message;
  if (/^OWNER_PROFILE_(ACTIVE|UNSAFE|REMOTE_LOCK|INSPECTION_FAILED|CHANGED|LEASE_UNAVAILABLE|LEASE_LOST)$/.test(message)) return message;
  if (/profile appears to be in use|ProcessSingleton|SingletonLock/i.test(message)) return 'OWNER_PROFILE_LOCKED';
  if (message === 'OWNER_PERSISTENT_DISK_REQUIRED') return message;
  if (/^OWNER_(PROFILE_PATH|BROWSER_CONFIG)_INVALID$/.test(message)) return message;
  if (/Executable doesn't exist|executable.*not found/i.test(message)) return 'OWNER_BROWSER_EXECUTABLE_MISSING';
  if (/ENOSPC|No space left on device/i.test(message)) return 'OWNER_DISK_FULL';
  if (/EACCES|Permission denied/i.test(message)) return 'OWNER_PERMISSION_DENIED';
  if (/Timeout|timed out/i.test(message)) return 'OWNER_STARTUP_TIMEOUT';
  return 'OWNER_STARTUP_UNKNOWN';
}
