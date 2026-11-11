import test from "node:test";
import assert from "node:assert/strict";
import {decidePrepaidCreditOnly} from "./prepaid-credit-gate.mjs";

const NOW = 1_000_000;
const baseReceipt = Object.freeze({
  isTrustedBillingSource: true,
  organizationVerified: true,
  mode: "prepaid",
  autoRechargeDisabled: true,
  noChargedOverageVerified: true,
  observedAtMs: NOW,
  grantedRemainingMicroUsd: 2_000_000,
  purchasedRemainingMicroUsd: 5_000_000,
  grantExpiresAtMs: NOW + 86_400_000,
  purchasedExpiresAtMs: NOW + 86_400_000,
});
const call = (receipt={}, args={}) => decidePrepaidCreditOnly({
  nowMs: NOW,
  receipt: {...baseReceipt, ...receipt},
  worstCaseRequestMicroUsd: 1_000_000,
  reservedMicroUsd: 0,
  safetyMarginMicroUsd: 100_000,
  ...args,
});
const blocked = (expected, receipt={}, args={}) =>
  assert.deepEqual(call(receipt,args),{allowed:false,code:expected});

test("free promotional credits used first while they remain", () => {
  const result=call();
  assert.equal(result.allowed,true);
  assert.equal(result.grantProjectedMicroUsd,1_000_000);
  assert.equal(result.existingPurchasedProjectedMicroUsd,0);
  assert.deepEqual(result.expectedOrder,["complimentary","already_purchased"]);
});
test("after grant depletion already purchased prepaid credits are allowed", () => {
  const result=call({grantedRemainingMicroUsd:0});
  assert.equal(result.allowed,true);
  assert.equal(result.grantProjectedMicroUsd,0);
  assert.equal(result.existingPurchasedProjectedMicroUsd,1_000_000);
});
test("request may cross from grant to existing purchased credit", () => {
  const result=call({grantedRemainingMicroUsd:400_000});
  assert.equal(result.allowed,true);
  assert.equal(result.grantProjectedMicroUsd,400_000);
  assert.equal(result.existingPurchasedProjectedMicroUsd,600_000);
});
test("free only is permitted if enough for request plus margin", () => {
  const result=call({purchasedRemainingMicroUsd:0});
  assert.equal(result.allowed,true);
  assert.equal(result.existingPurchasedProjectedMicroUsd,0);
});
test("empty free and purchased balances block", () =>
  blocked("PREPAID_BALANCE_BELOW_SAFE_MARGIN",{grantedRemainingMicroUsd:0,purchasedRemainingMicroUsd:0}));
test("positive but insufficient purchased balance blocks before request", () =>
  blocked("PREPAID_BALANCE_BELOW_SAFE_MARGIN",{grantedRemainingMicroUsd:0,purchasedRemainingMicroUsd:1_050_000}));
test("existing outstanding in-flight requests reduce available budget", () =>
  blocked("PREPAID_BALANCE_BELOW_SAFE_MARGIN",{grantedRemainingMicroUsd:0,purchasedRemainingMicroUsd:1_900_000},{reservedMicroUsd:900_001}));
test("any enabled automatic recharge blocks", () =>
  blocked("AUTO_RECHARGE_MUST_BE_OFF",{autoRechargeDisabled:false}));
test("missing account-level charged overage protection blocks", () =>
  blocked("ACCOUNT_LEVEL_OVERAGE_BLOCK_REQUIRED",{noChargedOverageVerified:false}));
test("postpaid billing blocked even when a positive amount is shown", () =>
  blocked("PREPAID_ACCOUNT_REQUIRED",{mode:"postpaid"}));
test("untrusted source or organization cannot authorize a charge", () => {
  blocked("VERIFIED_BILLING_SOURCE_REQUIRED",{isTrustedBillingSource:false});
  blocked("VERIFIED_BILLING_SOURCE_REQUIRED",{organizationVerified:false});
});
test("missing or future or stale billing receipt blocks", () => {
  blocked("BILLING_RECEIPT_STALE",{observedAtMs:NOW-60_001});
  blocked("BILLING_RECEIPT_STALE",{observedAtMs:NOW+1});
  blocked("BILLING_RECEIPT_STALE",{observedAtMs:null});
});
test("credit grant expiry blocks if it still reports a nonzero amount", () =>
  blocked("CREDITS_EXPIRED_OR_EXPIRY_UNVERIFIED",{grantExpiresAtMs:NOW}));
test("purchased credit expiry blocks if it still reports a nonzero amount", () =>
  blocked("CREDITS_EXPIRED_OR_EXPIRY_UNVERIFIED",{purchasedExpiresAtMs:NOW}));
test("missing or invalid known bucket amounts block", () => {
  blocked("CREDIT_BUCKETS_UNVERIFIED",{purchasedRemainingMicroUsd:undefined});
  blocked("CREDIT_BUCKETS_UNVERIFIED",{grantedRemainingMicroUsd:-1});
  blocked("CREDIT_BUCKETS_UNVERIFIED",{grantedRemainingMicroUsd:"1000000"});
});
test("missing worst-case max cost and positive safety buffer blocks", () => {
  blocked("REQUEST_COST_LIMITS_REQUIRED",{}, {worstCaseRequestMicroUsd:0});
  blocked("REQUEST_COST_LIMITS_REQUIRED",{}, {safetyMarginMicroUsd:0});
  blocked("REQUEST_COST_LIMITS_REQUIRED",{}, {reservedMicroUsd:undefined});
});
test("overflow cannot silently approve a request", () =>
  blocked("BUDGET_OVERFLOW",{}, {worstCaseRequestMicroUsd:Number.MAX_SAFE_INTEGER, reservedMicroUsd:1}));
test("credit sum overflow also fails closed", () =>
  blocked("CREDIT_BUCKETS_UNVERIFIED",{grantedRemainingMicroUsd:Number.MAX_SAFE_INTEGER,purchasedRemainingMicroUsd:1}));
test("empty receipt and invalid clock are rejected", () => {
  assert.deepEqual(decidePrepaidCreditOnly({
    nowMs:NOW,receipt:null,worstCaseRequestMicroUsd:1,
    reservedMicroUsd:0,safetyMarginMicroUsd:1,
  }),{allowed:false,code:"BILLING_RECEIPT_REQUIRED"});
  assert.deepEqual(decidePrepaidCreditOnly({nowMs:0,receipt:baseReceipt}),
    {allowed:false,code:"CLOCK_INVALID"});
});
test("allowed receipt has no secrets and never actually calls any API", () => {
  const result=call();
  assert.equal(result.allowed,true);
  assert.equal(result.requiresAuthoritativeBillingGuard,true);
  assert.ok(!("apiKey" in result));
  assert.ok(!("paymentMethod" in result));
  assert.equal(Object.isFrozen(result),true);
});
