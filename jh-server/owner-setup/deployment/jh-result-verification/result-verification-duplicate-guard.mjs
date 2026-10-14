import { randomUUID } from 'node:crypto';
import {
  buildCommandIdentity,
  digestObject,
  redactForPersistence
} from './canonical-command.mjs';
import {
  EffectKind,
  validateVerificationPolicy,
  verifyEvidenceBundle
} from './evidence-verifier.mjs';

const FINAL_STATES = new Set(['VERIFIED', 'EFFECT_CONFIRMED']);
const ACTIVE_STATES = new Set([
  'RECEIVED',
  'PREPARING',
  'DISPATCHING',
  'INVOCATION_ACCEPTED',
  'VERIFYING'
]);
const REVIEW_STATES = new Set(['NEEDS_REVIEW', 'EFFECT_UNKNOWN']);
const RETRYABLE_PRE_DISPATCH_STATES = new Set(['RETRYABLE_PRE_DISPATCH', 'FAILED_PRE_DISPATCH']);
const safeRecoveryKind = kind => kind === EffectKind.NONE || kind === EffectKind.UI_STATE;

function nowIso(clock) {
  return new Date(clock()).toISOString();
}

function errorSummary(error) {
  return {
    name: /^[A-Za-z]{1,64}$/.test(error?.name ?? '') ? error.name : 'Error',
    code: /^[A-Z0-9_:-]{1,96}$/.test(error?.code ?? '') ? error.code : null,
    message: 'execution_failed_details_not_persisted',
    definitelyNotDispatched: error?.definitelyNotDispatched === true
  };
}

function publicRecord(record) {
  if (!record) return null;
  return {
    executionId: record.executionId ?? null,
    dedupeKey: record.dedupeKey,
    scope: record.scope,
    intentId: record.intentId,
    commandDigest: record.commandDigest,
    state: record.state,
    replayAllowed: record.replayAllowed === true,
    attemptCount: record.attemptCount,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    dispatchStartedAt: record.dispatchStartedAt,
    verifiedAt: record.verifiedAt,
    effectConfirmedAt: record.effectConfirmedAt,
    effectReference: record.effectReference ?? null,
    verification: record.verification ?? null,
    finalResult: record.finalResult ?? null,
    error: record.error ?? null,
    recoveryReason: record.recoveryReason ?? null,
    revision: record.revision
  };
}

function resultEnvelope({ status, record, duplicate = false, executed = false, reason = null }) {
  return {
    ok: FINAL_STATES.has(record?.state),
    completed: FINAL_STATES.has(record?.state),
    verified: record?.state === 'VERIFIED' || record?.state === 'EFFECT_CONFIRMED',
    effectConfirmed: record?.state === 'EFFECT_CONFIRMED',
    duplicate,
    executed,
    status,
    reason,
    record: publicRecord(record)
  };
}

function normalizeVerificationOutput(output, {
  record,
  expectedFacts,
  effectKind,
  effectPolicy,
  maxEvidenceAgeMs,
  clock,
  requireScreenReadback,
  requireSignature
}) {
  const evidence = output?.evidence ?? output ?? [];
  return verifyEvidenceBundle({
    record,
    evidence,
    expectedFacts,
    effectKind,
    effectPolicy,
    nowMs: clock(),
    maxEvidenceAgeMs,
    requireScreenReadback,
    requireSignature
  });
}

export class ResultVerificationDuplicateGuard {
  constructor({
    store,
    clock = () => Date.now(),
    maxEvidenceAgeMs = 10 * 60 * 1000,
    persistCommandSummary = true,
    requireSignature = true
  } = {}) {
    if (!store) throw new TypeError('store is required');
    this.store = store;
    this.clock = clock;
    this.maxEvidenceAgeMs = maxEvidenceAgeMs;
    this.persistCommandSummary = persistCommandSummary;
    this.requireSignature = requireSignature;
    this.initialized = false;
  }

  async init({ recoverInterrupted = true, forceRecovery = false } = {}) {
    await this.store.init();
    const recovered = recoverInterrupted
      ? await this.store.recoverInterrupted({ force: forceRecovery })
      : [];
    this.initialized = true;
    return { recovered };
  }

  async execute({
    scope = 'global',
    intentId = null,
    command,
    dedupePayload,
    ignoredDedupePaths = [],
    effectKind = EffectKind.NONE,
    expectedFacts = [],
    effectPolicy = {},
    requireScreenReadback = effectKind === EffectKind.UI_STATE,
    executor,
    beforeDispatch,
    verifier,
    reconciler,
    finalResult,
    metadata = {}
  }) {
    if (!this.initialized) await this.init();
    if (typeof executor !== 'function') throw new TypeError('executor must be a function');
    if (typeof verifier !== 'function') throw new TypeError('verifier must be a function');

    const policyValidation = validateVerificationPolicy({
      effectKind,
      expectedFacts,
      effectPolicy,
      requireScreenReadback
    });
    if (!policyValidation.valid) {
      return {
        ok: false,
        completed: false,
        verified: false,
        effectConfirmed: false,
        duplicate: false,
        executed: false,
        status: 'INVALID_VERIFICATION_POLICY',
        reason: `${policyValidation.reasonCode}: ${policyValidation.missing.join(', ')}`,
        record: null
      };
    }

    const identity = buildCommandIdentity({
      scope,
      intentId,
      command,
      dedupePayload,
      ignoredPaths: ignoredDedupePaths
    });

    const verificationPolicy = {
      effectKind,
      expectedFacts,
      effectPolicy,
      requireScreenReadback
    };
    const verificationPolicyDigest = digestObject(verificationPolicy, { ignoreVolatileKeys: false });
    const seedRecord = {
      effectKind,
      verificationPolicy: redactForPersistence(verificationPolicy),
      verificationPolicyDigest,
      replayAllowed: false,
      metadata: redactForPersistence(metadata),
      commandSummary: this.persistCommandSummary
        ? redactForPersistence({ type: command.type ?? command.action ?? null })
        : null
    };
    const claim = await this.store.claim(identity, seedRecord);

    if (!claim.created && claim.record.commandDigest !== identity.commandDigest) {
      return resultEnvelope({
        status: 'INTENT_COLLISION_BLOCKED',
        record: claim.record,
        duplicate: true,
        executed: false,
        reason: 'same intentId was already bound to a different command digest'
      });
    }

    if (!claim.created && claim.record.verificationPolicyDigest !== verificationPolicyDigest) {
      return resultEnvelope({
        status: 'VERIFICATION_POLICY_COLLISION_BLOCKED',
        record: claim.record,
        duplicate: true,
        executed: false,
        reason: 'same command/intent was requested with a different verification policy'
      });
    }

    const existingDecision = await this.#decideExisting({
      claim,
      identity,
      reconciler,
      expectedFacts,
      effectKind,
      effectPolicy,
      requireScreenReadback,
      finalResult
    });
    if (existingDecision) return existingDecision;

    let record = claim.record;
    const executionId = `exec_${randomUUID()}`;

    try {
      record = await this.store.transition(identity.dedupeKey, 'PREPARING', {
        reason: claim.created ? 'new_command_preparing' : 'safe_pre_dispatch_retry',
        expectedRevision: record.revision,
        patch: {
          executionId,
          replayAllowed: false,
          attemptCount: (record.attemptCount ?? 0) + 1,
          recoveryReason: null,
          error: null
        }
      });
    } catch (error) {
      if (error?.code === 'JH_EXECUTION_REVISION_CONFLICT') {
        const latest = await this.store.get(identity.dedupeKey);
        return resultEnvelope({
          status: 'ALREADY_IN_PROGRESS',
          record: latest,
          duplicate: true,
          executed: false,
          reason: 'another worker acquired the same command first'
        });
      }
      throw error;
    }

    // Admission runs after the durable CAS reservation, before any dispatch.
    // Only a host callback may supply it; command JSON never supplies authority.
    if (beforeDispatch !== undefined) {
      let allowed = false;
      try { allowed = typeof beforeDispatch === 'function' &&
        await beforeDispatch({record: structuredClone(record), firstAttempt: claim.created === true}) === true; }
      catch { /* A failed or stale preflight cannot grant execution. */ }
      if (!allowed) {
        record = await this.store.transition(identity.dedupeKey, 'FAILED_PRE_DISPATCH', {
          reason: 'owner_admission_rejected_no_dispatch', expectedRevision: record.revision,
          patch: {replayAllowed: false}
        });
        return resultEnvelope({status: 'OWNER_ADMISSION_BLOCKED', record, executed: false,
          reason: 'owner_admission_rejected_no_dispatch'});
      }
    }
    record = await this.store.transition(identity.dedupeKey, 'DISPATCHING', {
      reason: 'dispatch_started_invocation_is_not_completion',
      expectedRevision: record.revision,
      patch: {
        dispatchStartedAt: nowIso(this.clock),
        replayAllowed: false
      }
    });

    let invocationResult;
    try {
      invocationResult = await executor({
        executionId,
        dedupeKey: identity.dedupeKey,
        commandDigest: identity.commandDigest,
        scope: identity.scope,
        intentId: identity.intentId,
        command
      });
    } catch (error) {
      const summary = errorSummary(error);
      if (summary.definitelyNotDispatched) {
        record = await this.store.transition(identity.dedupeKey, 'FAILED_PRE_DISPATCH', {
          reason: 'executor_certified_no_external_dispatch',
          patch: {
            replayAllowed: safeRecoveryKind(effectKind),
            error: summary,
            leaseExpiresAt: null
          },
          lease: false
        });
        return resultEnvelope({
          status: 'FAILED_PRE_DISPATCH',
          record,
          executed: false,
          reason: summary.message
        });
      }

      record = await this.store.transition(identity.dedupeKey, 'NEEDS_REVIEW', {
        reason: 'executor_error_after_dispatch_outcome_unknown_no_replay',
        patch: {
          replayAllowed: false,
          error: summary,
          recoveryReason: 'dispatch_outcome_unknown'
        },
        lease: false
      });
      return resultEnvelope({
        status: 'NEEDS_REVIEW_NO_REPLAY',
        record,
        executed: true,
        reason: summary.message
      });
    }

    record = await this.store.transition(identity.dedupeKey, 'INVOCATION_ACCEPTED', {
      reason: 'executor_returned_but_completion_not_yet_verified',
      patch: {
        invocationAcceptedAt: nowIso(this.clock),
        invocationReceipt: redactForPersistence(
          invocationResult?.invocationReceipt ?? invocationResult?.receipt ?? null
        ),
        replayAllowed: false
      }
    });

    record = await this.store.transition(identity.dedupeKey, 'VERIFYING', {
      reason: 'post_action_readback_started',
      patch: { replayAllowed: false }
    });

    let verification;
    try {
      const verifierOutput = await verifier({
        mode: 'POST_EXECUTION',
        record,
        invocationResult,
        command
      });
      verification = normalizeVerificationOutput(verifierOutput, {
        record,
        expectedFacts,
        effectKind,
        effectPolicy,
        maxEvidenceAgeMs: this.maxEvidenceAgeMs,
        clock: this.clock,
        requireScreenReadback,
        requireSignature: this.requireSignature
      });
    } catch (error) {
      record = await this.store.transition(identity.dedupeKey, 'NEEDS_REVIEW', {
        reason: 'verification_error_no_automatic_replay',
        patch: {
          replayAllowed: false,
          error: errorSummary(error),
          recoveryReason: 'verification_failed_after_dispatch'
        },
        lease: false
      });
      return resultEnvelope({
        status: 'NEEDS_REVIEW_NO_REPLAY',
        record,
        executed: true,
        reason: String(error?.message ?? error)
      });
    }

    return this.#finalizeVerification({
      identity,
      record,
      verification,
      invocationResult,
      finalResult,
      executed: true,
      reasonPrefix: 'post_execution'
    });
  }

  async reconcile({
    scope = 'global',
    intentId = null,
    command,
    dedupePayload,
    ignoredDedupePaths = [],
    effectKind = EffectKind.NONE,
    expectedFacts = [],
    effectPolicy = {},
    requireScreenReadback = effectKind === EffectKind.UI_STATE,
    reconciler,
    finalResult
  }) {
    if (!this.initialized) await this.init();
    if (typeof reconciler !== 'function') throw new TypeError('reconciler must be a function');

    const policyValidation = validateVerificationPolicy({
      effectKind,
      expectedFacts,
      effectPolicy,
      requireScreenReadback
    });
    if (!policyValidation.valid) {
      return {
        ok: false,
        completed: false,
        verified: false,
        effectConfirmed: false,
        duplicate: false,
        executed: false,
        status: 'INVALID_VERIFICATION_POLICY',
        reason: `${policyValidation.reasonCode}: ${policyValidation.missing.join(', ')}`,
        record: null
      };
    }

    const identity = buildCommandIdentity({
      scope,
      intentId,
      command,
      dedupePayload,
      ignoredPaths: ignoredDedupePaths
    });
    const verificationPolicyDigest = digestObject({
      effectKind,
      expectedFacts,
      effectPolicy,
      requireScreenReadback
    }, { ignoreVolatileKeys: false });
    let record = await this.store.get(identity.dedupeKey);
    if (!record) {
      return {
        ok: false,
        completed: false,
        verified: false,
        effectConfirmed: false,
        duplicate: false,
        executed: false,
        status: 'NOT_FOUND',
        reason: 'no prior execution record exists',
        record: null
      };
    }
    if (record.commandDigest !== identity.commandDigest) {
      return resultEnvelope({
        status: 'INTENT_COLLISION_BLOCKED',
        record,
        duplicate: true,
        executed: false,
        reason: 'same intentId is bound to another command digest'
      });
    }
    if (record.verificationPolicyDigest !== verificationPolicyDigest) {
      return resultEnvelope({
        status: 'VERIFICATION_POLICY_COLLISION_BLOCKED',
        record,
        duplicate: true,
        executed: false,
        reason: 'reconciliation policy differs from the policy bound at dispatch time'
      });
    }
    record = await this.#recoverStaleRecord(record);
    if (FINAL_STATES.has(record.state)) {
      return resultEnvelope({
        status: 'DUPLICATE_ALREADY_CONFIRMED',
        record,
        duplicate: true,
        executed: false,
        reason: 'final verified result already exists'
      });
    }
    if (ACTIVE_STATES.has(record.state)) {
      return resultEnvelope({
        status: 'ALREADY_IN_PROGRESS',
        record,
        duplicate: true,
        executed: false,
        reason: 'execution is still active; no duplicate dispatch performed'
      });
    }

    try {
      record = await this.store.transition(identity.dedupeKey, 'VERIFYING', {
        reason: 'reconciliation_only_no_dispatch',
        expectedRevision: record.revision,
        patch: {
          replayAllowed: false,
          error: null
        }
      });
    } catch (error) {
      if (error?.code === 'JH_EXECUTION_REVISION_CONFLICT') {
        const latest = await this.store.get(identity.dedupeKey);
        return resultEnvelope({
          status: 'ALREADY_IN_PROGRESS',
          record: latest,
          duplicate: true,
          executed: false,
          reason: 'another worker started reconciliation first'
        });
      }
      throw error;
    }

    let verification;
    try {
      const output = await reconciler({
        mode: 'RECONCILIATION_ONLY',
        record,
        command
      });
      verification = normalizeVerificationOutput(output, {
        record,
        expectedFacts,
        effectKind,
        effectPolicy,
        maxEvidenceAgeMs: this.maxEvidenceAgeMs,
        clock: this.clock,
        requireScreenReadback,
        requireSignature: this.requireSignature
      });
    } catch (error) {
      record = await this.store.transition(identity.dedupeKey, 'NEEDS_REVIEW', {
        reason: 'reconciliation_error_no_dispatch',
        patch: {
          replayAllowed: false,
          error: errorSummary(error),
          recoveryReason: 'reconciliation_failed'
        },
        lease: false
      });
      return resultEnvelope({
        status: 'NEEDS_REVIEW_NO_REPLAY',
        record,
        duplicate: true,
        executed: false,
        reason: String(error?.message ?? error)
      });
    }

    return this.#finalizeVerification({
      identity,
      record,
      verification,
      invocationResult: null,
      finalResult,
      executed: false,
      reasonPrefix: 'reconciliation'
    });
  }

  async getStatus({ scope = 'global', intentId = null, command, dedupePayload, ignoredDedupePaths = [] }) {
    if (!this.initialized) await this.init();
    const identity = buildCommandIdentity({
      scope,
      intentId,
      command,
      dedupePayload,
      ignoredPaths: ignoredDedupePaths
    });
    const record = await this.store.get(identity.dedupeKey);
    return publicRecord(record);
  }

  async #decideExisting({
    claim,
    identity,
    reconciler,
    expectedFacts,
    effectKind,
    effectPolicy,
    requireScreenReadback,
    finalResult
  }) {
    if (claim.created) return null;
    let record = claim.record;
    record = await this.#recoverStaleRecord(record);

    if (FINAL_STATES.has(record.state)) {
      return resultEnvelope({
        status: 'DUPLICATE_ALREADY_CONFIRMED',
        record,
        duplicate: true,
        executed: false,
        reason: 'same command already has a verified final result'
      });
    }

    if (ACTIVE_STATES.has(record.state)) {
      return resultEnvelope({
        status: 'ALREADY_IN_PROGRESS',
        record,
        duplicate: true,
        executed: false,
        reason: 'same command is already running; second dispatch blocked'
      });
    }

    if (REVIEW_STATES.has(record.state)) {
      if (typeof reconciler !== 'function') {
        return resultEnvelope({
          status: 'NEEDS_REVIEW_NO_REPLAY',
          record,
          duplicate: true,
          executed: false,
          reason: 'prior dispatch outcome is uncertain; automatic replay is forbidden'
        });
      }

      return this.reconcile({
        scope: identity.scope,
        intentId: identity.intentId,
        command: { __digestBoundCommand: identity.commandDigest },
        dedupePayload: identity.normalizedCommand,
        effectKind,
        expectedFacts,
        effectPolicy,
        requireScreenReadback,
        reconciler,
        finalResult
      });
    }

    if (RETRYABLE_PRE_DISPATCH_STATES.has(record.state)) {
      if (safeRecoveryKind(effectKind) && record.replayAllowed === true) return null;
      return resultEnvelope({status:'EXTERNAL_EFFECT_REPLAY_FORBIDDEN',record,
        duplicate:true,executed:false,
        reason:'recovery cannot repeat an external action; inspect existing evidence'});
    }

    return resultEnvelope({
      status: 'BLOCKED_BY_EXISTING_STATE',
      record,
      duplicate: true,
      executed: false,
      reason: `existing state ${record.state} does not allow automatic replay`
    });
  }

  async #recoverStaleRecord(record) {
    if (!ACTIVE_STATES.has(record.state)) return record;
    if (record.ownerInstanceId === this.store.instanceId) return record;
    const leaseExpiresAtMs = record.leaseExpiresAt ? Date.parse(record.leaseExpiresAt) : 0;
    if (Number.isFinite(leaseExpiresAtMs) && leaseExpiresAtMs > this.clock()) return record;
    await this.store.recoverInterrupted({ force: false });
    return await this.store.get(record.dedupeKey) ?? record;
  }

  async #finalizeVerification({
    identity,
    record,
    verification,
    invocationResult,
    finalResult,
    executed,
    reasonPrefix
  }) {
    const safeVerification = redactForPersistence(verification);
    const effectRequired = [
      EffectKind.PAYMENT,
      EffectKind.MESSAGE,
      EffectKind.RESERVATION,
      EffectKind.FILE_WRITE,
      EffectKind.GENERIC_SIDE_EFFECT
    ].includes(record.effectKind);
    const verified = verification?.verified === true;
    const effectConfirmed = verification?.effectConfirmed === true;
    const complete = verified && (!effectRequired || effectConfirmed);

    if (!complete) {
      const next = await this.store.transition(identity.dedupeKey, 'NEEDS_REVIEW', {
        reason: `${reasonPrefix}_evidence_insufficient_no_replay`,
        patch: {
          replayAllowed: false,
          verification: safeVerification,
          effectReference: verification?.effectReference ?? null,
          recoveryReason: verification?.reasonCode ?? 'verification_not_confirmed'
        },
        lease: false
      });
      return resultEnvelope({
        status: 'NEEDS_REVIEW_NO_REPLAY',
        record: next,
        duplicate: !executed,
        executed,
        reason: verification?.reasonCode ?? 'verification did not confirm completion'
      });
    }

    const projectedResult = typeof finalResult === 'function'
      ? await finalResult({ record, verification, invocationResult })
      : (finalResult ?? invocationResult?.result ?? verification?.result ?? null);

    const finalState = effectRequired ? 'EFFECT_CONFIRMED' : 'VERIFIED';
    const timestamp = nowIso(this.clock);
    const next = await this.store.transition(identity.dedupeKey, finalState, {
      reason: effectRequired
        ? `${reasonPrefix}_actual_external_effect_confirmed`
        : `${reasonPrefix}_result_verified`,
      patch: {
        replayAllowed: false,
        verifiedAt: timestamp,
        effectConfirmedAt: effectRequired ? timestamp : null,
        verification: safeVerification,
        effectReference: verification?.effectReference ?? null,
        finalResult: redactForPersistence(projectedResult),
        error: null,
        recoveryReason: null
      },
      lease: false
    });

    return resultEnvelope({
      status: effectRequired ? 'EXECUTED_EFFECT_CONFIRMED' : 'EXECUTED_AND_VERIFIED',
      record: next,
      duplicate: !executed,
      executed,
      reason: verification?.reasonCode ?? 'VERIFIED'
    });
  }
}
