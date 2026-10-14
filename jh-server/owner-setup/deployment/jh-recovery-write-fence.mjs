/**
 * Additive server-side JH write-admission contract. Pure, no DB, retries or HTTP.
 * The existing JH durable workflow ledger, cancel owner, Secure Bridge and payment
 * result-verifier remain the ONLY authorities for executable state.
 * Caller MUST gather each field from verified SERVER state, not job/client JSON.
 */
export const JH_RECOVERY_FENCE_VERSION = 'jh-recovery-write-fence-v1';

const EFFECTS = new Set(['NOT_DISPATCHED', 'NO_EFFECT_CONFIRMED', 'CONFIRMED', 'UNKNOWN']);
const KINDS = new Set(['READ_ONLY', 'UI_ACTION', 'EXTERNAL_WRITE', 'SENSITIVE_WRITE']);
const LEDGER = new Set(['UNSEEN', 'RESERVED', 'DISPATCHED', 'SUCCEEDED', 'UNKNOWN', 'BLOCKED']);
const COMMANDS = new Set(['ACTIVE', 'CANCELLED', 'FINISHED', 'DISCARDED', 'UNKNOWN']);
function result(code, allowDispatch = false, readOnlyCheck = false, needsUser = false) {
  return Object.freeze({code, allowDispatch, readOnlyCheck, needsUser, replayPreviousCommand: false});
}

/**
 * Purpose: place directly before the EXISTING server dispatcher after durable
 * ledger and authenticated command ownership checks. Never supply a grant in
 * lieu of a JH149 idempotency reservation or separate payment approval.
 */
export function gateRecoveredDispatch({
  commandState = 'UNKNOWN', commandEpochCurrent = false, cancelled = false,
  pendingDiscard = false, restartedProcess = false, fromConnectionRecovery = false,
  lateCallback = false, bridgeAuthenticated = false, trustedScopeValid = false,
  ledgerStatus = 'UNKNOWN', actionKind = 'EXTERNAL_WRITE',
  effect = 'UNKNOWN', approvedForExactAction = false,
  explicitUserCommand = false, isFreshScreen = false, serverRequestIdValid = false,
  sourceIsAuthoritative = false
} = {}) {
  if (!COMMANDS.has(commandState) || !LEDGER.has(ledgerStatus) || !KINDS.has(actionKind) || !EFFECTS.has(effect)) {
    return result('invalid_server_state');
  }
  if (!sourceIsAuthoritative || !serverRequestIdValid) return result('authenticated_owner_and_id_required');
  if (cancelled || pendingDiscard || restartedProcess || !commandEpochCurrent ||
      commandState === 'CANCELLED' || commandState === 'DISCARDED' || lateCallback) {
    return result('old_work_discarded_no_auto_resume');
  }
  if (!bridgeAuthenticated || !trustedScopeValid) return result('secure_bridge_not_ready');
  if (ledgerStatus === 'DISPATCHED' || ledgerStatus === 'SUCCEEDED' || ledgerStatus === 'BLOCKED') {
    return result('idempotency_existing_operation_no_retry', false, true);
  }
  if (ledgerStatus === 'UNKNOWN' || effect === 'UNKNOWN') {
    return result('uncertain_effect_read_only_reconcile', false, true, actionKind === 'SENSITIVE_WRITE');
  }
  if (commandState !== 'ACTIVE') return result('command_not_active');
  if (fromConnectionRecovery) return result('bridge_reconnected_old_work_not_replayed', false, actionKind === 'READ_ONLY');
  if (actionKind !== 'READ_ONLY' && !explicitUserCommand) return result('user_command_required');
  if (actionKind === 'READ_ONLY') return result('read_only_permitted', true, true);
  if (!isFreshScreen) return result('fresh_target_screen_required');
  if (ledgerStatus !== 'RESERVED' || effect !== 'NOT_DISPATCHED') {
    return result('durable_reservation_not_available_no_write_retry');
  }
  if (actionKind === 'SENSITIVE_WRITE' && !approvedForExactAction) {
    return result('sensitive_action_requires_explicit_approval', false, false, true);
  }
  return result('first_dispatch_requires_existing_owner_cas', true);
}

/** Do not report sensitive form content, tokens, screenshots or raw errors. */
export function redactedRecoveryReport({code = 'unknown', signal = 'unknown',
  connection = 'unknown', work = 'unknown', ageMs = 0} = {}) {
  // Only known policy-enumeration labels, never arbitrary event/error strings.
  // Raw exception messages, tokens, URLs and form contents must not enter reports.
  const SIGNAL = new Set(['LOADING','UNRESPONSIVE','CONNECTION_CHECK','SECURE_BRIDGE_RECONNECT',
    'NETWORK_CHANGE','SERVER_RESTART','UPDATE_TRUST','HTTP_409','AUTH_REFRESH',
    'STALE_SCREEN','POPUP','CIRCUIT','COMMAND_CANCEL','FORCE_RESTART',
    'DUPLICATE','LATE_RESULT','EXTERNAL_UNCERTAIN','ERROR_REPORT','RESULT_CONFIRMATION']);
  const CODES = new Set(['bridge_or_network_unavailable_no_work_resume','old_work_discarded_no_auto_resume',
    'late_receipt_not_new_command','durable_ledger_dedup_required','uncertain_external_effect_never_replay',
    'unresolved_60_min_final','user_disconnected_no_auto_link','connection_restored_work_not_replayed',
    'stale_screen_target_recheck','popup_needs_user_not_bypassed','existing_circuit_owner_only',
    'result_effect_confirmed','result_not_yet_verified_no_execution','redacted_error_report_only',
    'connection_health_only','known_popup_reobserve_no_autoclick','loading_stalled_fresh_observation',
    'loading_within_grace','no_response_read_only_check','popup_not_present_reobserve',
    'response_within_grace']);
  const cleaned = (value, allowed) => allowed.has(value) ? value : 'redacted';
  const CONNECTION = new Set(['KEEP_CURRENT_SESSION','RECONNECT_EXISTING_TRUST','RECONCILE_SIGNED_STATE',
    'RENEW_EXISTING_SESSION','WAIT_NETWORK','USER_DISCONNECTED','REQUIRE_TRUST_REVIEW']);
  const WORK = new Set(['KEEP_BLOCKED','WAIT_AND_OBSERVE','REOBSERVE_RIGHT_SCREEN',
    'READ_ONLY_EXTERNAL_CHECK','CANCEL_AND_DISCARD','IGNORE_OLD_CALLBACK',
    'BLOCK_DUPLICATE','CIRCUIT_OWNER_REVIEW','USER_ACTION_REQUIRED',
    'CONFIRM_RESULT_ONLY','REPORT_UNRESOLVED']);
  return Object.freeze({version: JH_RECOVERY_FENCE_VERSION,
    code: cleaned(code, CODES), signal: cleaned(signal, SIGNAL),
    connection: cleaned(connection, CONNECTION), work: cleaned(work, WORK),
    ageMs: Number.isSafeInteger(ageMs) && ageMs >= 0
      ? Math.min(ageMs, 3_600_000) : 0,
    containsPersonalData: false,
    reportOnly: true,
    attemptedAutomaticReplay: false});
}
