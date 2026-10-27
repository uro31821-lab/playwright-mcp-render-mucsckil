import test from 'node:test';
import assert from 'node:assert/strict';
import { startupFailureCode } from './render-owner-startup-diagnostics.mjs';

test('startup failure logs contain only fixed categories, never raw browser error details', () => {
  const cases = [
    ['The profile appears to be in use by another Chromium process on another computer', 'OWNER_PROFILE_LOCKED'],
    ['Failed to create ProcessSingleton', 'OWNER_PROFILE_LOCKED'],
    ["Executable doesn't exist at /private/location", 'OWNER_BROWSER_EXECUTABLE_MISSING'],
    ['ENOSPC: No space left on device', 'OWNER_DISK_FULL'],
    ['EACCES: Permission denied', 'OWNER_PERMISSION_DENIED'],
    ['Timeout 30000ms exceeded', 'OWNER_STARTUP_TIMEOUT'],
    ['unexpected detail', 'OWNER_STARTUP_UNKNOWN'],
  ];
  for (const [message, code] of cases) {
    const sensitive = message + '\nAuthorization: Bearer synthetic-secret\nprofile=/private/account';
    assert.equal(startupFailureCode(Error(sensitive)), code);
  }
  for (const code of ['OWNER_PERSISTENT_DISK_REQUIRED', 'OWNER_PROFILE_PATH_INVALID', 'OWNER_BROWSER_CONFIG_INVALID'])
    assert.equal(startupFailureCode(Error(code)), code);
  assert.equal(startupFailureCode(null), 'OWNER_STARTUP_UNKNOWN');
});
