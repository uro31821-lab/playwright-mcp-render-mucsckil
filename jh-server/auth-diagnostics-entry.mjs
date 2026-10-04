import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { installDiagnostics } from './connection-diagnostics.mjs';

// Generate only the exact diagnostic edits already verified by HTTP parity tests.
// The unmodified server.mjs remains the pinned baseline. No test clock is loaded.
await import('./verification/build-auth-candidate.mjs');
const runtimeUrl = new URL('./verification-output/candidate/server.mjs', import.meta.url);
const runtimeBytes = readFileSync(runtimeUrl);
const runtimeSha256 = createHash('sha256').update(runtimeBytes).digest('hex');
if (runtimeSha256 !== 'afd26e8b4d8ed62ee3487fdc0f0511ab269cb40147380840e5d5b6e4250f11c4') {
  throw new Error('Verified diagnostic runtime identity mismatch');
}
installDiagnostics();
console.log('JH_CONNECTION_DIAG', JSON.stringify({
  schema: 1, event: 'observer_start', atUtc: new Date().toISOString(),
  revision: 'connection-observer-v2-poll-reasons', authenticationChanged: false,
  runtimeSha256
}));
await import(runtimeUrl.href);
