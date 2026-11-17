/**
 * STAB-01 candidate — pure request-local continuity guard.
 * NOT connected to production router. No Tasks write, command creation, device,
 * OAuth or external effect. The calling host must supply trusted current
 * conversation facts; this module does not interpret words or images.
 */
const CAPTURE = 'camera';
const CURRENT = 'capture';
const VALID_ROUTABLE = new Set(['task']);
const invalid = (reason, input) => Object.freeze({status:'UNCHANGED',reason,input,
  authorizesExecution:false,changesPersistentState:false,cameraCaptureVerified:false});
const isRecord = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const isId = x => typeof x === 'string' && x.length > 0 && x.length <= 256;

export function keepActiveCameraLead(input) {
  if (!isRecord(input) || !isRecord(input.intent)) {
    return invalid('INVALID_REQUEST', input);
  }
  const {intent, activeTask, conversationContext: ctx, threadId, sourceRef} = input;
  // All current secure/Tasks continuations are owned by existing router.
  if (!VALID_ROUTABLE.has(intent.kind)) return invalid('EXISTING_ROUTER_OWNS_KIND', input);
  if (activeTask !== null && activeTask !== undefined) return invalid('PERSISTENT_TASK_OWNS_CONTINUITY', input);
  if (!isId(threadId) || !isId(sourceRef)) return invalid('INVALID_CURRENT_BINDING', input);
  // The host must explicitly decide that the user is continuing, not changing
  // goal. Image presence/keywords alone NEVER authorize camera selection.
  if (intent.explicitNewGoal !== false || intent.explicitEdit !== false
      || intent.explicitSwitch === true || intent.explicitAssistant != null
      || intent.userChosenLead != null || intent.workflow != null)
    return invalid('EXPLICIT_GOAL_OR_WORKFLOW_PRESERVED', input);
  if (intent.continuationOfActiveGoal !== true) return invalid('CONTINUATION_NOT_CONFIRMED', input);
  if (Array.isArray(intent.topics) && intent.topics.some(id=>id !== 'camera' && id !== 'photo'))
    return invalid('DIFFERENT_TOPIC_PRESENT', input);
  if (ctx?.hasUnresolvedExternalEffect !== false) return invalid('ORIGINAL_EFFECT_INSPECTION_REQUIRED', input);
  if (!isRecord(ctx) || ctx.hostVerified !== true || ctx.threadId !== threadId || ctx.lead !== CAPTURE
      || ctx.phase !== CURRENT || ctx.status !== 'active' || ctx.startBasis !== 'user_explicit'
      || ctx.taskLookupStatus !== 'VERIFIED_NO_TASK'
      || !Number.isSafeInteger(ctx.revision) || ctx.revision < 0
      || intent.contextRevision !== ctx.revision)
    return invalid('CURRENT_CAMERA_CONTEXT_UNVERIFIED', input);
  if (Array.isArray(intent.excluded) && intent.excluded.includes(CAPTURE)) return invalid('USER_EXCLUDED_CAMERA', input);
  // Reconcile host *semantic classification* only. Never change explicit user
  // choices or invent Task ids, execution authority or a shutter command.
  if (Array.isArray(intent.assistantRequests) && intent.assistantRequests.some(x=>x?.id==='photo'))
    return invalid('EDIT_ASSISTANT_REQUEST_PRESERVED', input);
  if (intent.assistantRequests != null && !Array.isArray(intent.assistantRequests))
    return invalid('ASSISTANT_REQUESTS_UNVERIFIED', input);
  if (intent.helpers != null && (!Array.isArray(intent.helpers) || intent.helpers.includes('photo')))
    return invalid('COLLABORATOR_SELECTION_PRESERVED', input);
  if (intent.topics != null && (!Array.isArray(intent.topics)
      || intent.topics.some(x=>!['photo',CAPTURE].includes(x))))
    return invalid('DIFFERENT_TOPIC_PRESENT', input);
  if (intent.primary != null && !['photo',CAPTURE].includes(intent.primary))
    return invalid('EXPLICIT_GOAL_OR_WORKFLOW_PRESERVED', input);
  // The photo skill is the editor. Only a host-verified, NON-explicit image
  // inference may be corrected. Missing provenance is not authorization.
  if ((intent.primary==='photo' || intent.topics?.includes('photo'))
      && intent.primaryBasis!=='HOST_INFERRED_IMAGE_ONLY')
    return invalid('PHOTO_INTENT_PROVENANCE_UNVERIFIED', input);
  if (intent.primaryBasis==='USER_EXPLICIT')
    return invalid('USER_SELECTED_ASSISTANT_PRESERVED', input);
  // Keep all original topics/helpers/exclusions/selection metadata unchanged.
  const adjusted={...intent,primary:CAPTURE};
  return Object.freeze({status:'CONTINUED', reason:'HOST_VERIFIED_SAME_CAMERA_GOAL',
    input: {...input, intent:adjusted}, authorizesExecution:false,
    changesPersistentState:false, cameraSettingsVerified:false,
    cameraCaptureVerified:false});
}
