/**
 * G Glass API budget candidate. Pure policy calculation only — never calls an
 * OpenAI API, balance API or payment API. Not wired into production.
 *
 * Latest user authorization: consume verified complimentary grants FIRST,
 * then already-purchased prepaid credits. NEVER auto-recharge, buy more
 * credits, or bill an overage. A prepaid balance is NOT an instantaneous
 * hard spend cutoff: provider billing can lag and produce negative balances.
 * Callers must independently establish an enforceable account-level payment
 * boundary before allowing ANY real request.
 */
const MAX_RECEIPT_AGE_MS = 60_000;
const deny = (code) => Object.freeze({ allowed: false, code });

const money = (n) => Number.isSafeInteger(n) && n >= 0;

export function decidePrepaidCreditOnly({
  nowMs,
  receipt,
  worstCaseRequestMicroUsd,
  reservedMicroUsd,
  safetyMarginMicroUsd,
} = {}) {
  if (!Number.isSafeInteger(nowMs) || nowMs < 1) return deny("CLOCK_INVALID");
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt))
    return deny("BILLING_RECEIPT_REQUIRED");

  // Source verification is a separate trusted billing integration, not a
  // boolean accepted from untrusted phone or user-submitted JSON.
  if (receipt.isTrustedBillingSource !== true ||
      receipt.organizationVerified !== true)
    return deny("VERIFIED_BILLING_SOURCE_REQUIRED");
  if (receipt.mode !== "prepaid") return deny("PREPAID_ACCOUNT_REQUIRED");
  if (receipt.autoRechargeDisabled !== true) return deny("AUTO_RECHARGE_MUST_BE_OFF");
  if (receipt.noChargedOverageVerified !== true)
    return deny("ACCOUNT_LEVEL_OVERAGE_BLOCK_REQUIRED");

  if (!Number.isSafeInteger(receipt.observedAtMs) ||
      receipt.observedAtMs > nowMs ||
      nowMs - receipt.observedAtMs > MAX_RECEIPT_AGE_MS)
    return deny("BILLING_RECEIPT_STALE");

  const free = receipt.grantedRemainingMicroUsd;
  const bought = receipt.purchasedRemainingMicroUsd;
  if (!money(free) || !money(bought) || !Number.isSafeInteger(free + bought))
    return deny("CREDIT_BUCKETS_UNVERIFIED");
  if ((free > 0 && (!Number.isSafeInteger(receipt.grantExpiresAtMs) ||
                    receipt.grantExpiresAtMs <= nowMs)) ||
      (bought > 0 && (!Number.isSafeInteger(receipt.purchasedExpiresAtMs) ||
                      receipt.purchasedExpiresAtMs <= nowMs)))
    return deny("CREDITS_EXPIRED_OR_EXPIRY_UNVERIFIED");

  if (!money(worstCaseRequestMicroUsd) || worstCaseRequestMicroUsd === 0 ||
      !money(reservedMicroUsd) ||
      !money(safetyMarginMicroUsd) || safetyMarginMicroUsd === 0)
    return deny("REQUEST_COST_LIMITS_REQUIRED");

  // Require a safety reserve against provider usage/billing reporting lag.
  const total = free + bought;
  const required = worstCaseRequestMicroUsd +
      reservedMicroUsd + safetyMarginMicroUsd;
  if (!Number.isSafeInteger(required)) return deny("BUDGET_OVERFLOW");
  if (total < required) return deny("PREPAID_BALANCE_BELOW_SAFE_MARGIN");

  // This is only a projection: OpenAI owns actual debit order and credits
  // may change between receipt and request. Do not claim exact deduction.
  const grantProjectedMicroUsd = Math.min(free, worstCaseRequestMicroUsd);
  const existingPurchasedProjectedMicroUsd =
      worstCaseRequestMicroUsd - grantProjectedMicroUsd;
  return Object.freeze({
    allowed: true,
    code: "ALLOW_EXISTING_CREDITS_ONLY",
    expectedOrder: Object.freeze(["complimentary", "already_purchased"]),
    grantProjectedMicroUsd,
    existingPurchasedProjectedMicroUsd,
    remainingSafetyBufferMicroUsd: total - required,
    requiresAuthoritativeBillingGuard: true,
  });
}
