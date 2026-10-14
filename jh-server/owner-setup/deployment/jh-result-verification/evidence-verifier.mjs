import { randomUUID } from 'node:crypto';
import { digestObject, getPath, secureDigestEquals } from './canonical-command.mjs';

export const EffectKind = Object.freeze({
  NONE: 'NONE',
  UI_STATE: 'UI_STATE',
  PAYMENT: 'PAYMENT',
  MESSAGE: 'MESSAGE',
  RESERVATION: 'RESERVATION',
  FILE_WRITE: 'FILE_WRITE',
  GENERIC_SIDE_EFFECT: 'GENERIC_SIDE_EFFECT'
});

export const EvidenceSource = Object.freeze({
  SCREEN_READBACK: 'SCREEN_READBACK',
  PROVIDER_READBACK: 'PROVIDER_READBACK',
  SYSTEM_STATE: 'SYSTEM_STATE',
  FILE_SYSTEM_READBACK: 'FILE_SYSTEM_READBACK'
});

const TRUSTED_SOURCES = new Set(Object.values(EvidenceSource));
const PAYMENT_SUCCESS = new Set(['CAPTURED', 'SETTLED', 'SUCCEEDED', 'PAID']);
const MESSAGE_SUCCESS = new Set(['SENT', 'DELIVERED', 'READ']);
const RESERVATION_SUCCESS = new Set(['CONFIRMED', 'BOOKED', 'RESERVED']);

function nonBlank(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function validateVerificationPolicy({
  effectKind = EffectKind.NONE,
  expectedFacts = [],
  effectPolicy = {},
  requireScreenReadback = effectKind === EffectKind.UI_STATE
} = {}) {
  const missing = [];
  const hasExpectedFacts = Array.isArray(expectedFacts) && expectedFacts.some((item) =>
    item && typeof item === 'object' && item.required !== false && nonBlank(String(item.path ?? ''))
  );

  switch (effectKind) {
    case EffectKind.NONE:
      if (!hasExpectedFacts) missing.push('expectedFacts');
      break;
    case EffectKind.UI_STATE:
      if (!requireScreenReadback) missing.push('requireScreenReadback=true');
      if (!hasExpectedFacts) missing.push('expectedFacts');
      break;
    case EffectKind.PAYMENT:
      if (!Number.isFinite(Number(effectPolicy.amount)) || Number(effectPolicy.amount) <= 0) missing.push('effectPolicy.amount');
      if (!nonBlank(effectPolicy.currency)) missing.push('effectPolicy.currency');
      if (!nonBlank(effectPolicy.merchant)) missing.push('effectPolicy.merchant');
      break;
    case EffectKind.MESSAGE:
      if (!nonBlank(effectPolicy.recipient)) missing.push('effectPolicy.recipient');
      if (!nonBlank(effectPolicy.bodyDigest)) missing.push('effectPolicy.bodyDigest');
      break;
    case EffectKind.RESERVATION:
      if (!nonBlank(effectPolicy.venue)) missing.push('effectPolicy.venue');
      if (!nonBlank(effectPolicy.date)) missing.push('effectPolicy.date');
      if (!nonBlank(effectPolicy.time)) missing.push('effectPolicy.time');
      if (!Number.isInteger(Number(effectPolicy.partySize)) || Number(effectPolicy.partySize) <= 0) {
        missing.push('effectPolicy.partySize');
      }
      break;
    case EffectKind.FILE_WRITE:
      if (!nonBlank(effectPolicy.path)) missing.push('effectPolicy.path');
      if (!nonBlank(effectPolicy.sha256)) missing.push('effectPolicy.sha256');
      break;
    case EffectKind.GENERIC_SIDE_EFFECT:
      if (!nonBlank(effectPolicy.effectType)) missing.push('effectPolicy.effectType');
      break;
    default:
      missing.push(`known effectKind (${effectKind})`);
  }

  return {
    valid: missing.length === 0,
    missing,
    reasonCode: missing.length === 0 ? 'POLICY_VALID' : 'VERIFICATION_POLICY_INCOMPLETE'
  };
}

function compare(actual, operator, expected) {
  switch (operator) {
    case 'exists':
      return expected === false ? actual === undefined || actual === null : actual !== undefined && actual !== null;
    case 'eq':
      return Object.is(actual, expected) || JSON.stringify(actual) === JSON.stringify(expected);
    case 'neq':
      return !(Object.is(actual, expected) || JSON.stringify(actual) === JSON.stringify(expected));
    case 'oneOf':
      return Array.isArray(expected) && expected.some((item) => compare(actual, 'eq', item));
    case 'includes':
      if (typeof actual === 'string') return actual.includes(String(expected));
      if (Array.isArray(actual)) return actual.some((item) => compare(item, 'eq', expected));
      return false;
    case 'matches':
      return typeof actual === 'string' && new RegExp(String(expected)).test(actual);
    case 'gte':
      return typeof actual === 'number' && actual >= expected;
    case 'lte':
      return typeof actual === 'number' && actual <= expected;
    default:
      throw new Error(`unsupported expected-fact operator: ${operator}`);
  }
}

function normalizeStatus(value) {
  return String(value ?? '').trim().toUpperCase();
}

function evidenceFactRoot(evidence) {
  return evidence.facts ?? evidence.payload ?? {};
}

function validateEvidence(evidence, record, {
  nowMs,
  maxEvidenceAgeMs,
  clockSkewMs,
  requireSignature
}) {
  const checks = [];
  const fail = (code, detail) => ({ valid: false, code, detail, checks });

  if (!evidence || typeof evidence !== 'object') {
    return fail('EVIDENCE_NOT_OBJECT');
  }
  if (evidence.schemaVersion !== 1) {
    return fail('EVIDENCE_SCHEMA_VERSION_UNSUPPORTED', evidence.schemaVersion ?? null);
  }
  if (typeof evidence.evidenceId !== 'string' || evidence.evidenceId.trim().length === 0) {
    return fail('EVIDENCE_ID_REQUIRED');
  }

  if (!TRUSTED_SOURCES.has(evidence.source)) {
    return fail('EVIDENCE_SOURCE_NOT_TRUSTED', evidence.source ?? null);
  }
  checks.push('trusted_source');

  if (evidence.verified !== true) {
    return fail('EVIDENCE_NOT_VERIFIED');
  }
  checks.push('upstream_verified');

  if (requireSignature && evidence.signatureVerified !== true) {
    return fail('EVIDENCE_SIGNATURE_NOT_VERIFIED');
  }
  checks.push(requireSignature ? 'signature_verified' : 'signature_not_required');

  const binding = evidence.binding ?? {};
  if (binding.commandDigest !== record.commandDigest) {
    return fail('EVIDENCE_COMMAND_BINDING_MISMATCH');
  }
  if (!record.executionId || binding.executionId !== record.executionId) {
    return fail('EVIDENCE_EXECUTION_BINDING_MISMATCH');
  }
  if (binding.scope !== record.scope) {
    return fail('EVIDENCE_SCOPE_BINDING_MISMATCH');
  }
  if ((binding.intentId ?? null) !== (record.intentId ?? null)) {
    return fail('EVIDENCE_INTENT_BINDING_MISMATCH');
  }
  const expectedDeviceDigest = record.metadata?.deviceDigest ?? null;
  if (expectedDeviceDigest && binding.deviceDigest !== expectedDeviceDigest) {
    return fail('EVIDENCE_DEVICE_BINDING_MISMATCH');
  }
  checks.push('binding_matches');

  const capturedAtMs = Date.parse(evidence.capturedAt);
  if (!Number.isFinite(capturedAtMs)) {
    return fail('EVIDENCE_CAPTURE_TIME_INVALID');
  }

  const dispatchAtMs = record.dispatchStartedAt ? Date.parse(record.dispatchStartedAt) : NaN;
  if (Number.isFinite(dispatchAtMs) && capturedAtMs < dispatchAtMs - clockSkewMs) {
    return fail('EVIDENCE_PRE_DATES_DISPATCH');
  }
  if (capturedAtMs > nowMs + clockSkewMs) {
    return fail('EVIDENCE_FROM_FUTURE');
  }
  if (nowMs - capturedAtMs > maxEvidenceAgeMs) {
    return fail('EVIDENCE_STALE');
  }
  checks.push('evidence_fresh');

  const facts = evidenceFactRoot(evidence);
  const calculatedDigest = digestObject(facts, { ignoreVolatileKeys: false });
  if (!evidence.contentDigest || !secureDigestEquals(evidence.contentDigest, calculatedDigest)) {
    return fail('EVIDENCE_CONTENT_DIGEST_MISMATCH');
  }
  checks.push('content_digest_matches');

  return {
    valid: true,
    source: evidence.source,
    facts,
    capturedAt: evidence.capturedAt,
    evidenceId: evidence.evidenceId ?? null,
    contentDigest: evidence.contentDigest,
    checks
  };
}

function selectEvidence(validEvidence, source) {
  return validEvidence.filter((item) => item.source === source);
}

function evaluateExpectedFacts(expectedFacts, validEvidence) {
  const results = [];
  for (const expected of expectedFacts ?? []) {
    const candidates = expected.source
      ? validEvidence.filter((item) => item.source === expected.source)
      : validEvidence;
    const operator = expected.op ?? 'eq';
    let matched = false;
    const observations = [];

    for (const candidate of candidates) {
      const actual = getPath(candidate.facts, expected.path);
      observations.push({ source: candidate.source, actual });
      if (compare(actual, operator, expected.value)) {
        matched = true;
        break;
      }
    }

    results.push({
      path: expected.path,
      source: expected.source ?? null,
      operator,
      expected: expected.value,
      matched,
      required: expected.required !== false,
      observations
    });
  }

  return {
    passed: results.every((result) => !result.required || result.matched),
    results
  };
}

function paymentEffect(validEvidence, policy) {
  const candidates = selectEvidence(validEvidence, EvidenceSource.PROVIDER_READBACK);
  for (const candidate of candidates) {
    const payment = candidate.facts.payment ?? candidate.facts;
    const status = normalizeStatus(payment.status);
    const transactionId = payment.transactionId ?? payment.paymentId ?? payment.receiptId;
    if (!PAYMENT_SUCCESS.has(status) || !transactionId) continue;
    if (policy.amount != null && Number(payment.amount) !== Number(policy.amount)) continue;
    if (policy.currency && normalizeStatus(payment.currency) !== normalizeStatus(policy.currency)) continue;
    if (policy.merchant && String(payment.merchant ?? '') !== String(policy.merchant)) continue;
    return {
      confirmed: true,
      externalEffectId: String(transactionId),
      summary: {
        status,
        transactionId: String(transactionId),
        amount: payment.amount ?? null,
        currency: payment.currency ?? null,
        merchant: payment.merchant ?? null
      }
    };
  }
  return { confirmed: false, reason: 'PAYMENT_PROVIDER_READBACK_NOT_CONFIRMED' };
}

function messageEffect(validEvidence, policy) {
  const candidates = validEvidence.filter((candidate) =>
    [EvidenceSource.PROVIDER_READBACK, EvidenceSource.SYSTEM_STATE].includes(candidate.source)
  );
  for (const candidate of candidates) {
    const message = candidate.facts.message ?? candidate.facts;
    const status = normalizeStatus(message.status);
    const messageId = message.messageId ?? message.id;
    if (!MESSAGE_SUCCESS.has(status) || !messageId) continue;
    if (policy.recipient && String(message.recipient ?? '') !== String(policy.recipient)) continue;
    if (policy.bodyDigest && String(message.bodyDigest ?? '') !== String(policy.bodyDigest)) continue;
    return {
      confirmed: true,
      externalEffectId: String(messageId),
      summary: {
        status,
        messageId: String(messageId),
        recipient: message.recipient ?? null,
        bodyDigest: message.bodyDigest ?? null
      }
    };
  }
  return { confirmed: false, reason: 'MESSAGE_READBACK_NOT_CONFIRMED' };
}

function reservationEffect(validEvidence, policy) {
  const candidates = selectEvidence(validEvidence, EvidenceSource.PROVIDER_READBACK);
  for (const candidate of candidates) {
    const reservation = candidate.facts.reservation ?? candidate.facts;
    const status = normalizeStatus(reservation.status);
    const reservationId = reservation.reservationId ?? reservation.bookingId ?? reservation.confirmationNumber;
    if (!RESERVATION_SUCCESS.has(status) || !reservationId) continue;
    if (policy.venue && String(reservation.venue ?? '') !== String(policy.venue)) continue;
    if (policy.date && String(reservation.date ?? '') !== String(policy.date)) continue;
    if (policy.time && String(reservation.time ?? '') !== String(policy.time)) continue;
    if (policy.partySize != null && Number(reservation.partySize) !== Number(policy.partySize)) continue;
    return {
      confirmed: true,
      externalEffectId: String(reservationId),
      summary: {
        status,
        reservationId: String(reservationId),
        venue: reservation.venue ?? null,
        date: reservation.date ?? null,
        time: reservation.time ?? null,
        partySize: reservation.partySize ?? null
      }
    };
  }
  return { confirmed: false, reason: 'RESERVATION_PROVIDER_READBACK_NOT_CONFIRMED' };
}

function fileWriteEffect(validEvidence, policy) {
  const candidates = validEvidence.filter((candidate) =>
    [EvidenceSource.FILE_SYSTEM_READBACK, EvidenceSource.SYSTEM_STATE].includes(candidate.source)
  );
  for (const candidate of candidates) {
    const file = candidate.facts.file ?? candidate.facts;
    if (file.exists !== true) continue;
    if (policy.path && String(file.path ?? '') !== String(policy.path)) continue;
    if (policy.sha256 && String(file.sha256 ?? '') !== String(policy.sha256)) continue;
    const effectId = file.sha256 ?? file.path;
    if (!effectId) continue;
    return {
      confirmed: true,
      externalEffectId: String(effectId),
      summary: {
        path: file.path ?? null,
        sha256: file.sha256 ?? null,
        size: file.size ?? null
      }
    };
  }
  return { confirmed: false, reason: 'FILE_READBACK_NOT_CONFIRMED' };
}

function genericEffect(validEvidence, policy) {
  const candidates = validEvidence.filter((candidate) =>
    [EvidenceSource.PROVIDER_READBACK, EvidenceSource.SYSTEM_STATE].includes(candidate.source)
  );
  for (const candidate of candidates) {
    const effect = candidate.facts.effect ?? candidate.facts;
    const effectId = effect.externalEffectId ?? effect.effectId ?? effect.id;
    if (effect.effectConfirmed !== true || !effectId) continue;
    if (policy.effectType && String(effect.effectType ?? '') !== String(policy.effectType)) continue;
    return {
      confirmed: true,
      externalEffectId: String(effectId),
      summary: {
        effectType: effect.effectType ?? null,
        externalEffectId: String(effectId),
        status: effect.status ?? null
      }
    };
  }
  return { confirmed: false, reason: 'GENERIC_EFFECT_READBACK_NOT_CONFIRMED' };
}

function verifyEffect(effectKind, validEvidence, effectPolicy) {
  switch (effectKind) {
    case EffectKind.NONE:
      return { confirmed: false, notRequired: true };
    case EffectKind.UI_STATE: {
      const screens = selectEvidence(validEvidence, EvidenceSource.SCREEN_READBACK);
      return screens.length > 0
        ? { confirmed: true, externalEffectId: screens[0].contentDigest, summary: { screenVerified: true } }
        : { confirmed: false, reason: 'SCREEN_READBACK_REQUIRED' };
    }
    case EffectKind.PAYMENT:
      return paymentEffect(validEvidence, effectPolicy);
    case EffectKind.MESSAGE:
      return messageEffect(validEvidence, effectPolicy);
    case EffectKind.RESERVATION:
      return reservationEffect(validEvidence, effectPolicy);
    case EffectKind.FILE_WRITE:
      return fileWriteEffect(validEvidence, effectPolicy);
    case EffectKind.GENERIC_SIDE_EFFECT:
      return genericEffect(validEvidence, effectPolicy);
    default:
      return { confirmed: false, reason: `UNKNOWN_EFFECT_KIND:${effectKind}` };
  }
}

export function verifyEvidenceBundle({
  record,
  evidence = [],
  expectedFacts = [],
  effectKind = EffectKind.NONE,
  effectPolicy = {},
  nowMs = Date.now(),
  maxEvidenceAgeMs = 10 * 60 * 1000,
  clockSkewMs = 30_000,
  requireSignature = true,
  requireScreenReadback = effectKind === EffectKind.UI_STATE
}) {
  if (!record?.commandDigest) {
    throw new TypeError('record with commandDigest is required');
  }

  const policyValidation = validateVerificationPolicy({
    effectKind,
    expectedFacts,
    effectPolicy,
    requireScreenReadback
  });
  if (!policyValidation.valid) {
    return {
      verified: false,
      effectConfirmed: false,
      reasonCode: policyValidation.reasonCode,
      effectKind,
      effectReference: null,
      expectedFacts: { passed: false, results: [] },
      validEvidence: [],
      invalidEvidence: [],
      policyValidation
    };
  }

  const rawEvidence = Array.isArray(evidence) ? evidence : [evidence];
  const validations = rawEvidence.map((item) =>
    validateEvidence(item, record, {
      nowMs,
      maxEvidenceAgeMs,
      clockSkewMs,
      requireSignature
    })
  );
  const validEvidence = validations.filter((item) => item.valid);
  const invalidEvidence = validations.filter((item) => !item.valid);
  const expected = evaluateExpectedFacts(expectedFacts, validEvidence);
  const screenCount = selectEvidence(validEvidence, EvidenceSource.SCREEN_READBACK).length;
  const effect = verifyEffect(effectKind, validEvidence, effectPolicy);

  const hasEvidence = validEvidence.length > 0;
  const screenRequirementPassed = !requireScreenReadback || screenCount > 0;
  const effectRequirementPassed = effectKind === EffectKind.NONE || effect.confirmed;
  const verified = hasEvidence && expected.passed && screenRequirementPassed && effectRequirementPassed;

  let reasonCode = 'VERIFIED';
  if (!hasEvidence) reasonCode = 'NO_VALID_EVIDENCE';
  else if (!expected.passed) reasonCode = 'EXPECTED_FACT_MISMATCH';
  else if (!screenRequirementPassed) reasonCode = 'SCREEN_READBACK_REQUIRED';
  else if (!effectRequirementPassed) reasonCode = effect.reason ?? 'EFFECT_NOT_CONFIRMED';

  return {
    verified,
    effectConfirmed: effectKind !== EffectKind.NONE && effect.confirmed === true,
    reasonCode,
    effectKind,
    effectReference: effect.confirmed
      ? {
          externalEffectId: effect.externalEffectId,
          summary: effect.summary ?? null
        }
      : null,
    expectedFacts: expected,
    validEvidence: validEvidence.map((item) => ({
      source: item.source,
      evidenceId: item.evidenceId,
      capturedAt: item.capturedAt,
      contentDigest: item.contentDigest,
      checks: item.checks
    })),
    invalidEvidence: invalidEvidence.map((item) => ({
      code: item.code,
      detail: item.detail ?? null,
      checks: item.checks
    }))
  };
}

export function createEvidence({
  record,
  source,
  facts,
  capturedAt = new Date().toISOString(),
  evidenceId = `ev_${randomUUID()}`,
  signatureVerified = false,
  extraBinding = {}
}) {
  if (!record?.commandDigest) throw new TypeError('record with commandDigest is required');
  if (!TRUSTED_SOURCES.has(source)) throw new TypeError(`unsupported evidence source: ${source}`);
  const contentDigest = digestObject(facts, { ignoreVolatileKeys: false });
  return {
    schemaVersion: 1,
    evidenceId,
    source,
    capturedAt,
    verified: true,
    signatureVerified,
    binding: {
      executionId: record.executionId ?? null,
      scope: record.scope,
      intentId: record.intentId,
      commandDigest: record.commandDigest,
      ...extraBinding
    },
    facts,
    contentDigest
  };
}
