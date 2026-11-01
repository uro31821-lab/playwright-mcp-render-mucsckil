/** Owner-authenticated memory tools. They never dispatch a device action. */
export function registerLearningTools({ registerOAuthTool, z, textResult, getController }) {
  if ([registerOAuthTool, textResult, getController].some(fn => typeof fn !== 'function') || !z) {
    throw new TypeError('LEARNING_REGISTRAR_REQUIRED');
  }
  const call = async (method, ...args) => {
    const controller = getController();
    if (typeof controller?.[method] !== 'function') {
      return textResult({ ok: false, code: 'LEARNING_UNAVAILABLE', replayAllowed: false });
    }
    try { return textResult(await controller[method](...args)); }
    catch (error) {
      const code = ['LEARNING_REVISION_CONFLICT', 'LEARNING_DECISION_CONFLICT'].includes(error?.code)
        ? error.code : 'LEARNING_REQUEST_INVALID';
      return textResult({ ok: false, code, replayAllowed: false });
    }
  };
  registerOAuthTool('life_learning_context', {
    title: 'Recall JH experience before a task',
    description: 'Read only. Before the first action for a new task or operation, retrieve verified, unexpired, nonconflicting owner advice for target_tool and target_mode, including explicitly registered common JH rules. Reuse its revision and validity within that task. This does not execute the target, begin a phone command, grant approval, or read ordinary chats. Apply only advice relevant to the current user request.',
    inputSchema: {
      target_tool: z.string().min(1).max(96), target_mode: z.string().max(24).optional(),
      limit: z.number().int().min(1).max(20).optional(),
      max_chars: z.number().int().min(1).max(16384).optional(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, args => call('context', args));
  registerOAuthTool('life_learning_review', {
    title: 'Review JH experience, decide on a proposal, and validate a rule',
    description: 'Owner memory only; never executes phone actions or model training. PREPARE reads an existing proposal; {proposalId,view:"decision"} reads its current status and decision history, including closed proposals. DECIDE records accept/dismiss only, using decisionId, expectedRevision, packetFingerprint, reviewer, sourceRef, reason and eventIds from the current PREPARE packet. Reuse the exact payload after an uncertain decision response; the same ID with changed content is rejected. Acceptance selects an improvement for follow-up; it does not implement it, activate a lesson or verify a live outcome. CANDIDATE accepts either {review,suite} for a reviewed inference, or {instruction,suite,expectedRevision} for an actual explicit user instruction; preserve exact text, user source reference and SHA-256, and specify all_jh_tasks or one tool/mode. It stores a candidate, never fabricated events or proposals. CHECK runs its bounded regression and records active/quarantined status. payload is a JSON object. The authenticated caller attests the decision/instruction source; the server does not read chats or Library. Never send secrets or raw screen content.',
    inputSchema: { mode: z.enum(['PREPARE', 'CANDIDATE', 'CHECK', 'DECIDE']), payload: z.string().min(2).max(65536) },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async ({ mode, payload }) => {
    let input;
    try { input = JSON.parse(payload); } catch {
      return textResult({ ok: false, code: 'LEARNING_REQUEST_INVALID', replayAllowed: false });
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return textResult({ ok: false, code: 'LEARNING_REQUEST_INVALID', replayAllowed: false });
    }
    return call('review', mode, input);
  });
}
