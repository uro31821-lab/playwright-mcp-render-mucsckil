import { installDiagnostics } from './connection-diagnostics.mjs';
// No approval, authorization, session, response, or job payload logic is replaced.
installDiagnostics();
console.log('JH_CONNECTION_DIAG', JSON.stringify({schema:1,event:'observer_start',
  atUtc:new Date().toISOString(),revision:'connection-observer-v1',authenticationChanged:false}));
await import('./server.mjs');
