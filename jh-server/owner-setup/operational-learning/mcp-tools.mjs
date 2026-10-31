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
      const code = error?.code === 'LEARNING_REVISION_CONFLICT' ? error.code : 'LEARNING_REQUEST_INVALID';
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
    title: 'Review JH experience and validate a rule candidate',
    description: 'Owner memory only; never executes phone actions or model training. PREPARE reads an existing proposal. CANDIDATE accepts either {review,suite} for a reviewed inference, or {instruction,suite,expectedRevision} for an actual explicit user instruction; preserve its exact text, user source reference and SHA-256, and specify all_jh_tasks or one tool/mode. It stores only a candidate, never fabricated events or proposals. CHECK runs the registered candidate\'s bounded regression and records active/quarantined status. payload is a JSON object. The authenticated caller attests the instruction source; the server does not read chats or Library. Never send secrets or raw screen content.',
    inputSchema: { mode: z.enum(['PREPARE', 'CANDIDATE', 'CHECK']), payload: z.string().min(2).max(65536) },
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
