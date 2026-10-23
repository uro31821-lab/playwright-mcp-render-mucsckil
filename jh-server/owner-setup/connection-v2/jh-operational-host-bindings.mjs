/**
 * JH167 V2 production host seam: bind only the existing JH command admission
 * authority and existing browser-session metadata RPC. No Android work, startup
 * monitoring, login, navigation, payment, app restart or notification fallback.
 *
 * Deployment safety contract:
 *  - ONE Node owner process; both BEGIN_COMMAND and job-dispatch paths MUST use
 *    the registered synchronous gate, or installation rejects the host.
 *  - hostSnapshot is a synchronous authoritative state read of the SAME owner.
 *  - once a lease is taken, no awaits occur until the block is set.
 *  - BrowserSession.probe() uses MCP tools/list only (existing session module).
 *  - An alert can succeed only via a separately approved real channel ACK.
 * No code here starts automatically or intercepts a phone screen.
 */
const zeroFields = Object.freeze([
  'activeMcpCalls','activeWorkflows','queuedJobs','runningJobs',
  'unresolvedEffects','activeBrowserCalls',
]);
const alertReasons = new Set([
  'CHECK_JH_SERVER','CHECK_CHATGPT_PLUGIN','CHECK_BROWSER_SESSION',
  'OPEN_JH_SECURE','REAUTHORIZE_ON_DEVICE',
]);
const fail = code => { const e = new Error(code); e.code = code; throw e; };

export function createJH167OperationalHostBindings({
  readOwnerSnapshot, installOwnerAdmissionGate, browserSession,
  approvedOwnerNotifier = null,
} = {}) {
  if (typeof readOwnerSnapshot !== 'function' ||
      typeof installOwnerAdmissionGate !== 'function' ||
      !browserSession || typeof browserSession.probe !== 'function') {
    fail('JH_V2_HOST_BINDINGS_NOT_READY');
  }
  let active = false;
  let closed = false;
  function allowed() { return !active && !closed; }
  const proof = installOwnerAdmissionGate(Object.freeze({
    allowBeginCommand: allowed,
    allowJobDispatch: allowed,
  }));
  // The existing owner must acknowledge BOTH authoritative hooks. Merely
  // registering a callback on a diagnostic tool is not an exclusive lease.
  if (!proof || proof.ownerVerified !== true ||
      proof.beginCommandHooked !== true || proof.jobDispatchHooked !== true ||
      proof.sameProcess !== true) fail('JH_V2_OWNER_ADMISSION_GATE_UNVERIFIED');

  function snapshot() {
    if (closed) return null;
    let s;
    try { s = readOwnerSnapshot(); } catch { return null; }
    if (!s || s.authenticatedOwner !== true || s.sameProcess !== true ||
        s.pendingDiscard !== false || s.serverRestarting !== false ||
        !zeroFields.every(k=>Number.isSafeInteger(s[k]) && s[k] >= 0)) return null;
    return s;
  }
  function isIdleSnapshot(s) { return !!s && zeroFields.every(k=>s[k]===0); }
  async function verifiedWorkflowIdle() {
    const s = snapshot();
    return Object.freeze({verified:!!s, idle:!active&&isIdleSnapshot(s)});
  }
  async function acquireExclusiveIdleMaintenanceLease({purpose}={}) {
    if (purpose !== 'BROWSER_TRANSPORT_SOFT_RECONNECT' || !allowed()) return null;
    // Synchronous authoritative test and lease acquisition share a JS turn;
    // registered owner gate prevents a subsequent BEGIN_COMMAND or dispatch.
    const s = snapshot();
    if (!isIdleSnapshot(s)) return null;
    active = true;
    let released = false;
    return Object.freeze({verified:true,idle:true,exclusive:true,
      async release() { if (!released) { released=true; active=false; } }
    });
  }
  async function rehandshakeBrowserTransportOnly(req={}) {
    if (!active || req.scope !== 'TRANSPORT_ONLY' || req.noNewCommand !== true ||
        req.noNavigation !== true || req.action !== 'BROWSER_TRANSPORT_SOFT_RECONNECT')
      return Object.freeze({ok:false,mode:'DENIED'});
    // BrowserSession.probe() issues MCP tools/list. Existing BrowserSession
    // may renew an expired metadata session; never performs a tools/call.
    try {
      await browserSession.probe();
      return Object.freeze({ok:true,mode:'TRANSPORT_ONLY'});
    } catch {
      return Object.freeze({ok:false,mode:'TRANSPORT_ONLY'});
    }
  }
  async function notifyOwnerThroughExistingApprovedChannel(event={}) {
    if (!alertReasons.has(event?.cause) || event?.type !== 'MANUAL_REQUIRED' ||
        event?.noTaskReplay !== true) return Object.freeze({delivered:false,code:'INVALID_ALERT'});
    if (approvedOwnerNotifier?.approved !== true ||
        typeof approvedOwnerNotifier.send !== 'function')
      return Object.freeze({delivered:false,code:'NOT_CONFIGURED'});
    // Redact freeform nextStep, exception text, device IDs, URLs and secrets.
    const notice = Object.freeze({version:2,kind:'JH_CONNECTIVITY_ACTION_REQUIRED',
      cause:event.cause,noTaskReplay:true});
    try {
      const ack = await approvedOwnerNotifier.send(notice);
      return Object.freeze({delivered:ack?.delivered===true && ack?.acknowledged===true,
        code:ack?.delivered===true && ack?.acknowledged===true?'CONFIRMED':'NOT_CONFIRMED'});
    } catch { return Object.freeze({delivered:false,code:'DELIVERY_FAILED'}); }
  }
  return Object.freeze({
    verifiedWorkflowIdle,acquireExclusiveIdleMaintenanceLease,
    rehandshakeBrowserTransportOnly,notifyOwnerThroughExistingApprovedChannel,
    admissionGateInstalled:true,
    get maintenanceActive(){return active;},
    close(){closed=true;},
  });
}
