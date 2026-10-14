import { join, resolve } from 'node:path';
import { FileDurableExecutionStore } from './file-durable-execution-store.mjs';
import { ResultVerificationDuplicateGuard } from './result-verification-duplicate-guard.mjs';
import { EffectKind } from './evidence-verifier.mjs';

function resolveStateDirectory(explicitDirectory) {
  const configured = explicitDirectory ?? process.env.JH_WORKFLOW_STATE_DIR;
  if (configured) return resolve(configured);
  return resolve(process.cwd(), '.jh-state');
}

function normalizeEffect(effect = {}) {
  const kind = effect.kind ?? EffectKind.NONE;
  if (!Object.values(EffectKind).includes(kind)) {
    throw new TypeError(`unsupported JH effect kind: ${kind}`);
  }
  return {
    kind,
    policy: effect.policy ?? {},
    requireScreenReadback:
      effect.requireScreenReadback ?? (kind === EffectKind.UI_STATE)
  };
}

export async function createJHResultVerificationGuard({
  stateDirectory,
  filename = 'jh-result-execution-guard-v1.json',
  maxEvidenceAgeMs = 10 * 60 * 1000,
  forceRecovery = true,
  requireSignature = true,
  clock
} = {}) {
  const directory = resolveStateDirectory(stateDirectory);
  const store = new FileDurableExecutionStore({
    directory,
    filename,
    clock
  });
  const guard = new ResultVerificationDuplicateGuard({
    store,
    clock,
    maxEvidenceAgeMs,
    requireSignature
  });
  const initialization = await guard.init({
    recoverInterrupted: true,
    forceRecovery
  });

  return {
    directory,
    storePath: join(directory, filename),
    guard,
    initialization
  };
}

/**
 * Wrap one existing JH workflow step.
 *
 * Important contract:
 * - dispatchAction only sends/executes the command.
 * - readbackAction independently reads the post-action screen/provider state.
 * - a successful dispatch receipt never completes the workflow by itself.
 */
export async function runProtectedJHAction({
  guard,
  workflowId,
  stepId,
  action,
  payload = {},
  expectedFacts = [],
  effect = { kind: EffectKind.NONE },
  dispatchAction,
  beforeDispatch,
  readbackAction,
  reconcileAction,
  resultProjector,
  metadata = {}
}) {
  if (!guard) throw new TypeError('guard is required');
  if (!workflowId) throw new TypeError('workflowId is required');
  if (!stepId) throw new TypeError('stepId is required');
  if (!action) throw new TypeError('action is required');
  if (typeof dispatchAction !== 'function') throw new TypeError('dispatchAction is required');
  if (typeof readbackAction !== 'function') throw new TypeError('readbackAction is required');

  const normalizedEffect = normalizeEffect(effect);
  const command = {
    type: action,
    payload
  };

  return guard.execute({
    scope: workflowId,
    intentId: stepId,
    command,
    effectKind: normalizedEffect.kind,
    effectPolicy: normalizedEffect.policy,
    requireScreenReadback: normalizedEffect.requireScreenReadback,
    expectedFacts,
    metadata: {
      workflowId,
      stepId,
      action,
      ...metadata
    },
    beforeDispatch,
    executor: async (context) => {
      const receipt = await dispatchAction(context);
      return {
        invocationReceipt: receipt,
        rawDispatchResult: receipt
      };
    },
    verifier: async ({ record, invocationResult }) => {
      const evidence = await readbackAction({
        workflowId,
        stepId,
        action,
        payload,
        record,
        invocationResult
      });
      return { evidence };
    },
    reconciler: typeof reconcileAction === 'function'
      ? async ({ record }) => {
          const evidence = await reconcileAction({
            workflowId,
            stepId,
            action,
            payload,
            record
          });
          return { evidence };
        }
      : undefined,
    finalResult: typeof resultProjector === 'function'
      ? ({ record, verification, invocationResult }) =>
          resultProjector({ record, verification, invocationResult })
      : null
  });
}

/**
 * Re-check an uncertain previous effect without dispatching the command again.
 */
export async function reconcileProtectedJHAction({
  guard,
  workflowId,
  stepId,
  action,
  payload = {},
  expectedFacts = [],
  effect = { kind: EffectKind.NONE },
  reconcileAction,
  resultProjector
}) {
  if (typeof reconcileAction !== 'function') {
    throw new TypeError('reconcileAction is required');
  }
  const normalizedEffect = normalizeEffect(effect);
  return guard.reconcile({
    scope: workflowId,
    intentId: stepId,
    command: { type: action, payload },
    effectKind: normalizedEffect.kind,
    effectPolicy: normalizedEffect.policy,
    requireScreenReadback: normalizedEffect.requireScreenReadback,
    expectedFacts,
    reconciler: async ({ record }) => ({
      evidence: await reconcileAction({
        workflowId,
        stepId,
        action,
        payload,
        record
      })
    }),
    finalResult: resultProjector
  });
}

export { EffectKind };
