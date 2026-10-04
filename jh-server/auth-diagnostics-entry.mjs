import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { installDiagnostics } from './connection-diagnostics.mjs';

// Exact diagnostic edits plus a job-deadline cap. No test clock, approval bypass or session extension.
// The unmodified server.mjs remains the pinned baseline for reversible change verification.
await import('./verification/build-auth-candidate.mjs');
const runtimeUrl = new URL('./verification-output/candidate/server.mjs', import.meta.url);
const runtimeBytes = readFileSync(runtimeUrl);
const runtimeSha256 = createHash('sha256').update(runtimeBytes).digest('hex');
if (runtimeSha256 !== '952390b3d78547cc694566745f4aa4d5e4ad90d6c1fa35a156037cb50ce9f435') {
  throw new Error('Verified runtime identity mismatch');
}
installDiagnostics();
console.log('JH_CONNECTION_DIAG', JSON.stringify({
  schema: 2, event: 'observer_start', atUtc: new Date().toISOString(),
  revision: 'connection-observer-v3-session-deadline', authenticationChanged: false,
  jobSignedExpiryCapped: true, sessionLifetimeChanged: false, runtimeSha256
}));
await import(runtimeUrl.href);
