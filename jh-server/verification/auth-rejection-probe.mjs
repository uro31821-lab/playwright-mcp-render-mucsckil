/** Candidate diagnostic only. Never authorizes, retries, consumes nonces, or changes responses. */
const REASONS = new Set([
  'device_record_missing', 'secure_metadata_mismatch', 'session_not_active',
  'session_missing', 'session_id_mismatch', 'device_digest_mismatch',
  'nonce_format_invalid', 'request_expired', 'request_expiry_too_far',
  'mac_mismatch', 'nonce_replayed'
]);
export function makeEmitter({sink = x => console.log('JH_AUTH_REJECTION', JSON.stringify(x)),
  now = Date.now, limit = 30, windowMs = 60000} = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 120 || !Number.isFinite(windowMs) || windowMs < 1000)
    throw new RangeError('Invalid diagnostic rate limit');
  let since = now(), emitted = 0, suppressed = 0;
  return reason => {
    try {
      if (!REASONS.has(reason)) return;
      const at = now();
      if (!Number.isFinite(at)) return;
      if (at - since >= windowMs || at < since) { since = at; emitted = 0; }
      if (emitted >= limit) { suppressed = Math.min(1000000, suppressed + 1); return; }
      emitted++;
      const record = {schema: 1, event: 'auth_rejected', route: 'poll', reason,
        atUtc: new Date(at).toISOString(), suppressedSinceLastRecord: suppressed};
      suppressed = 0;
      sink(record);
    } catch { /* Logging errors must not enter authentication control flow. */ }
  };
}
const emit = makeEmitter();
export function makeRejectionProbe(emitRecord = emit) {
  let first = null, recorded = false;
  return {
    reject(reason, rejected) {
      // Preserve original operand truthiness and short-circuit evaluation.
      if (rejected && first === null && REASONS.has(reason)) first = reason;
      return rejected;
    },
    record() {
      if (recorded || first === null) return;
      recorded = true;
      try { emitRecord(first); } catch { /* Diagnostics cannot authorize or reject. */ }
    }
  };
}
