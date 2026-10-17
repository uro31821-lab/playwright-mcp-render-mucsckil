/**
 * JH167 operational Durable read-only add-ons.
 * G3 candidate only: preserves the exact current host builder, Secure56 job signing,
 * OAuth, payment gates, result-guard, no-replay, screen evidence and command ownership.
 * Never execute browser/app actions, bookings, checkout, sending, or approval.
 */
import {patchDurableMcpWorkflowCleanRestartPayment56} from './durable-payment-clean-restart-patch.mjs';
import {patchJH167GuideAndReservation} from './guide13-reservation-composition-patch.mjs';

export const JH167_READONLY_NAMES=Object.freeze([
  'life_guide13_catalog','life_guide13_plan',
  'life_reservation_link_assistant','life_reservation_screen_guide',
  'life_reservation_regional_handoff','life_reservation_provider_status',
  'life_reservation_live_search'
]);

/** Preserve the JH155 signed pair verifier. Only START/STATUS may use its
 * existing fresh signed agent_snapshot fallback; no follow-up or UI mutation
 * is added to this read-only recovery path.
 */
export function patchJH167SplitSessionReadback56(source){
  const before="const readOnlyComfort=['split_comfort_status','split_comfort_manual_handoff',\n        'split_comfort_keyboard_advice','split_comfort_restore_info'].includes(type);";
  const after="const readOnlyComfort=['split_comfort_status','split_comfort_manual_handoff',\n        'split_comfort_keyboard_advice','split_comfort_restore_info',\n        'split_screen_session_start','split_screen_session_status'].includes(type);";
  if(typeof source!=='string'||source.split(before).length!==2||source.includes(after))
    throw Error('JH167_SPLIT_READBACK_SCOPE_CHANGED');
  const out=source.replace(before,after);
  if(out.replace(after,before)!==source||!out.includes('SPLIT_SCOPE_READBACK_UNCONFIRMED')||
     !out.includes('jhInspectSplitEvidence155(scopeRead.result,scopeRows)'))
    throw Error('JH167_SIGNED_READBACK_GUARD_CHANGED');
  return out;
}

export function applyJH167ReadOnlyRegistry56(previous){
  if(typeof previous!=='string'||
     !previous.includes('  jhRegisterGeneralWorkTools({registerOAuthTool,z,textResult});')||
     previous.includes('jhRegisterReservationLinkTools(')||
     previous.includes('jhRegisterGuide13Tools('))
    throw Error('JH167_ACTIVE_HOST_COMPATIBILITY_REVIEW_REQUIRED');
  const next=patchJH167GuideAndReservation(patchJH167SplitSessionReadback56(previous));
  const sentinel=[
    "import {registerGeneralWorkTools as jhRegisterGeneralWorkTools}",
    "import {registerReservationLinkTools as jhRegisterReservationLinkTools",
    "import {registerJHGuide13Tools as jhRegisterGuide13Tools}",
    "  jhRegisterGeneralWorkTools({registerOAuthTool,z,textResult});",
    "  jhRegisterReservationLinkTools({registerOAuthTool,z,textResult,",
    "  jhRegisterGuide13Tools({registerOAuthTool,z,textResult,"
  ];
  if(sentinel.some(s=>next.split(s).length!==2)||
     !next.includes('jhRequireCommand56(device)')||
     !next.includes('jhInspectSplitEvidence155')||
     !next.includes('jhScreenUnderstanding56'))
    throw Error('JH167_DURABLE_GUARD_MISSING');
  return next;
}

export function patchJH167OperationalReadOnly56(runtimeSource){
  const existing=patchDurableMcpWorkflowCleanRestartPayment56(runtimeSource);
  return applyJH167ReadOnlyRegistry56(existing);
}
