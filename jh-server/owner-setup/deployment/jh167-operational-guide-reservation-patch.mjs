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

export function applyJH167ReadOnlyRegistry56(previous){
  if(typeof previous!=='string'||
     !previous.includes('  jhRegisterGeneralWorkTools({registerOAuthTool,z,textResult});')||
     previous.includes('jhRegisterReservationLinkTools(')||
     previous.includes('jhRegisterGuide13Tools('))
    throw Error('JH167_ACTIVE_HOST_COMPATIBILITY_REVIEW_REQUIRED');
  const next=patchJH167GuideAndReservation(previous);
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
