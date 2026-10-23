/**
 * JH167 adapter boundary for JH Self-Diagnostic + Auto-Recovery v2.
 * Source-only integration; never starts monitoring during module import.
 * No network access, authentication, new Android work or external notifications here.
 *
 * The running, authenticated JH host must provide actual read-only probes,
 * an atomic exclusive idle-maintenance lease, and an approved notification path.
 */
import { diagnoseJH } from './jh-self-diagnostic.mjs';
import { createJHLiveAdapters } from './jh-live-adapters.mjs';
import { createJHAutoRecovery } from './jh-auto-recovery.mjs';

const ENABLED_REQUIRED = Object.freeze([
  'verifiedWorkflowIdle',
  'acquireExclusiveIdleMaintenanceLease',
  'rehandshakeBrowserTransportOnly',
  'notifyOwnerThroughExistingApprovedChannel',
]);

/**
 * @param {{probes?:object, workflow?:object}} host
 * probes = {serverStatus, mcpProbe, browserStatus, androidDevices, secureStatus}
 * workflow = {verifiedWorkflowIdle, acquireExclusiveIdleMaintenanceLease,
 *             rehandshakeBrowserTransportOnly, notifyOwnerThroughExistingApprovedChannel}
 * @param {{enableRecovery?:boolean}} opts
 * enableRecovery defaults FALSE. Creating the bridge never starts any interval.
 */
export function createJH167DiagnosticIntegration(host={}, opts={}) {
  const probes = host?.probes ?? {};
  const workflow = host?.workflow ?? {};
  const diagnose = async () => diagnoseJH(createJHLiveAdapters(probes));
  const optedIn = opts?.enableRecovery === true;
  if (!optedIn) {
    return Object.freeze({
      version: 'JH167_SELF_DIAGNOSTIC_V2',
      enableRecovery: false,
      diagnose,
      tick: async () => Object.freeze({ status:'DISABLED', code:'EXPLICIT_OPT_IN_REQUIRED', recoveryActions:[] }),
      start: () => false,
      stop: () => {},
      get isRunning() { return false; },
    });
  }
  const missing = ENABLED_REQUIRED.filter(name => typeof workflow?.[name] !== 'function');
  if (missing.length) {
    // No fallback to BEGIN_COMMAND, app restart, guessed work-idleness, or fake notifications.
    const error = new Error('JH_RECOVERY_V2_TRUSTED_HOST_CALLBACKS_REQUIRED');
    error.code = 'JH_RECOVERY_V2_TRUSTED_HOST_CALLBACKS_REQUIRED';
    throw error;
  }
  const recovery = createJHAutoRecovery({
    diagnose,
    isIdle: workflow.verifiedWorkflowIdle,
    acquireMaintenanceLease: workflow.acquireExclusiveIdleMaintenanceLease,
    reconnectBrowserTransport: workflow.rehandshakeBrowserTransportOnly,
    notifyUser: workflow.notifyOwnerThroughExistingApprovedChannel,
  });
  return Object.freeze({
    version: 'JH167_SELF_DIAGNOSTIC_V2',
    enableRecovery: true,
    diagnose,
    tick: () => recovery.tick(),
    start: (options) => recovery.start(options),
    stop: () => recovery.stop(),
    get isRunning() { return recovery.isRunning; },
  });
}
