// Adapters for the existing JH MCP status tools. No implicit calls, credentials, or side effects.
// Each probe must be connected by the actual server owner to a read-only authenticated operation.
const valid = (x) => x && typeof x === 'object' && !x.error;
const pass = code => ({state:'PASS', code});
const fail = code => ({state:'FAIL', code});
const unknown = code => ({state:'UNKNOWN', code});
export function createJHLiveAdapters({serverStatus, mcpProbe, browserStatus, androidDevices, secureStatus, signedDevicePoll}={}) {
  // Only a fresh device-bound Secure56 MAC+nonce verified poll can support
  // connection health; unsigned heartbeats and device lists cannot.
  const signedPollIsFresh = async () => {
    if (typeof signedDevicePoll !== 'function') return false;
    try {
      const x = await signedDevicePoll();
      return x?.source === 'SECURE56_MAC_VALIDATED_POLL' && x?.verified === true &&
        x?.sessionBound === true && x?.serverVerified === true &&
        Number.isSafeInteger(x?.ageMs) && x.ageMs >= 0 && x.ageMs <= 30000;
    } catch { return false; }
  };
  return {
    server: async () => {
      if (typeof serverStatus !== 'function') return unknown('SERVER_PROBE_NOT_CONFIGURED');
      const x = await serverStatus();
      if (!valid(x)) return fail('SERVER_UNREACHABLE');
      return typeof x.version === 'string' ? pass('SERVER_RESPONDED') : unknown('SERVER_RESPONSE_UNVERIFIED');
    },
    mcp: async () => {
      if (typeof mcpProbe !== 'function') return unknown('MCP_PROBE_NOT_CONFIGURED');
      const x = await mcpProbe();
      return x?.verified === true ? pass('MCP_CALL_VERIFIED') : x?.verified === false ? fail('MCP_CALL_FAILED') : unknown('MCP_CALL_UNVERIFIED');
    },
    browser: async () => {
      if (typeof browserStatus !== 'function') return unknown('BROWSER_PROBE_NOT_CONFIGURED');
      const x = await browserStatus();
      return x?.browser === 'ready' ? pass('BROWSER_READY') : x?.browser === 'unavailable' ? fail('BROWSER_UNAVAILABLE') : unknown('BROWSER_UNVERIFIED');
    },
    bridge: async () => {
      if (typeof androidDevices !== 'function') return unknown('BRIDGE_PROBE_NOT_CONFIGURED');
      const x = await androidDevices();
      if (!Array.isArray(x?.devices)) return unknown('DEVICE_LIST_UNVERIFIED');
      if (!x.devices.some(d => d.active === true)) return fail('NO_ACTIVE_DEVICE');
      // A listing or unsigned heartbeat is NEVER sufficient for PASS.
      return await signedPollIsFresh()
        ? pass('SIGNED_BRIDGE_POLL_VERIFIED') : unknown('SIGNED_DEVICE_READ_REQUIRED');
    },
    security: async () => {
      let x = null;
      if (typeof secureStatus === 'function') {
        try { x = await secureStatus(); } catch { /* A poll may still prove the session. */ }
      }
      const result = x?.status === 'complete' && !x?.error ? x.result : null;
      if (result?.secureActive === false) return fail('SECURE_SESSION_INACTIVE');
      if (result?.secureActive === true && result.deviceResponded === true &&
          result.code === 'secure_status_verified') return pass('SECURE_DEVICE_VERIFIED');
      // A MAC-validated nonce-protected poll from the CURRENT session proves
      // the connection only, never downstream UI action success.
      if (await signedPollIsFresh()) return pass('SECURE_SIGNED_POLL_VERIFIED');
      return unknown(typeof secureStatus === 'function' ? 'SECURE_READ_UNVERIFIED' : 'SECURE_PROBE_NOT_CONFIGURED');
    }
  };
}
