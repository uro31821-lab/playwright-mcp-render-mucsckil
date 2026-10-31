import { randomUUID } from 'node:crypto';
import { ingest, recall, propose } from './engine.mjs';

function requireFunction(value, name) {
  if (typeof value !== 'function') throw new TypeError(name + ' must be a function');
}

/**
 * The host supplies typed identity and independently verified outcomes.
 * Never classify HTTP 200, queued jobs, or a generic {ok:true} as business success.
 * This adapter cannot retry, dispatch a second action, change arguments, or grant approval.
 */
export function createLearningAdapter({ store, contextForCall, classifyResult,
  onRecall = () => {}, onProposals = () => {}, onDiagnostic = () => {},
  clock = () => new Date().toISOString() }) {
  requireFunction(contextForCall, 'contextForCall');
  requireFunction(classifyResult, 'classifyResult');
  if (!store?.read || !store?.transact) throw new TypeError('store is required');
  function diagnostic(phase) {
    // Do not leak the exception, arguments, result, raw URL, or identity to a logger.
    try { Promise.resolve(onDiagnostic({ code: 'LEARNING_UNAVAILABLE', phase, replay: false })).catch(() => {}); } catch {}
  }
  async function quietly(phase, callback) {
    try { return await callback(); } catch { diagnostic(phase); return undefined; }
  }
  async function observe(event) {
    return quietly('record', async () => {
      const result = await store.transact(state => {
        const observed = ingest(state, event);
        const offered = propose(observed.state, { now: clock() });
        return { ...offered, duplicate: observed.duplicate };
      });
      if (result.proposals.length) await quietly('notify', () => onProposals(result.proposals));
      return result;
    });
  }
  function wrap(operation, handler) {
    requireFunction(handler, 'handler');
    return async function (...args) {
      const receiver = this;
      const scope = await quietly('context', () => contextForCall(operation, args));
      if (scope) await quietly('recall', async () => {
        const { domain, operation: action, engine, context } = scope;
        const lessons = recall(await store.read(), { domain, operation: action, engine, context });
        if (lessons.length) await onRecall(lessons, structuredClone(scope));
      });
      let value;
      let thrown;
      let failed = false;
      try { value = await handler.apply(receiver, args); }
      catch (error) { failed = true; thrown = error; }
      if (scope) await quietly('classify', async () => {
        // Result classification stays in trusted host code; input args are not forwarded here.
        const classification = await classifyResult({ operation, result: value, error: thrown, threw: failed, scope });
        if (!classification) return;
        const allowed = new Set(['outcome', 'source', 'evidenceRefs', 'errorCode', 'metrics', 'labels']);
        if (Object.keys(classification).some(key => !allowed.has(key))) throw new TypeError('Unexpected classification field');
        await observe({
          ...classification,
          eventId: randomUUID(), taskId: scope.taskId, attemptId: scope.attemptId,
          sequence: scope.sequence, timestamp: clock(), domain: scope.domain,
          operation: scope.operation, engine: scope.engine, context: scope.context,
        });
      });
      if (failed) throw thrown;
      return value;
    };
  }
  return Object.freeze({ wrap, observe });
}
