/**
 * STAB-01 candidate — pure request-local continuity guard.
 * NOT connected to production router. No Tasks write, command creation, device,
 * OAuth or external effect. The calling host must supply trusted current
 * conversation facts; this module does not interpret words or images.
 */
const CAPTURE = 'camera';
const CURRENT = 'capture';
const VALID_ROUTABLE = new Set(['task']);
const invalid = (reason, input) => Object.freeze({status: 'UNCHANGED', reason, input});

export function keepActiveCameraLead(input) {
  if (!input || typeof input !== 'object' || !input.intent || typeof input.intent !== 'object') {
    return invalid('INVALID_REQUEST', input);
  }
  const {intent, activeTask, conversationContext: ctx, threadId} = input;
  // All current secure/Tasks continuations are owned by existing router.
  if (!VALID_ROUTABLE.has(intent.kind)) return invalid('EXISTING_ROUTER_OWNS_KIND', input);
  if (activeTask) return invalid('PERSISTENT_TASK_OWNS_CONTINUITY', input);
  // The host must explicitly decide that the user is continuing, not changing
  // goal. Image presence/keywords alone NEVER authorize camera selection.
  if (intent.explicitNewGoal === true || intent.explicitAssistant || intent.explicitEdit === true || (intent.primary && intent.primary !== 'photo' && intent.primary !== CAPTURE))
    return invalid('EXPLICIT_GOAL_OVERRIDES', input);
  if (intent.continuationOfActiveGoal !== true) return invalid('CONTINUATION_NOT_CONFIRMED', input);
  if (Array.isArray(intent.topics) && intent.topics.some(id=>id !== 'camera' && id !== 'photo'))
    return invalid('DIFFERENT_TOPIC_PRESENT', input);
  if (ctx?.hasUnresolvedExternalEffect === true) return invalid('ORIGINAL_EFFECT_INSPECTION_REQUIRED', input);
  if (!ctx || ctx.hostVerified !== true || ctx.threadId !== threadId || ctx.lead !== CAPTURE
      || ctx.phase !== CURRENT || ctx.status !== 'active' || ctx.startBasis !== 'user_explicit'
      || !Number.isSafeInteger(ctx.revision) || ctx.revision < 0
      || intent.contextRevision !== ctx.revision)
    return invalid('CURRENT_CAMERA_CONTEXT_UNVERIFIED', input);
  if (Array.isArray(intent.excluded) && intent.excluded.includes(CAPTURE)) return invalid('USER_EXCLUDED_CAMERA', input);
  // Reconcile host *semantic classification* only. Never change explicit user
  // choices or invent Task ids, execution authority or a shutter command.
  const helpers = (Array.isArray(intent.helpers) ? intent.helpers : []).filter(x => x !== 'photo');
  const adjusted = {...intent, primary:CAPTURE, topics:[CAPTURE], helpers};
  delete adjusted.continuationOfActiveGoal;
  delete adjusted.contextRevision;
  delete adjusted.explicitNewGoal;
  delete adjusted.explicitEdit;
  return Object.freeze({status:'CONTINUED', reason:'HOST_VERIFIED_SAME_CAMERA_GOAL',
    input: {...input, intent:adjusted}, authorizesExecution:false,
    changesPersistentState:false, cameraSettingsVerified:false,
    cameraCaptureVerified:false});
}
