import {verifyEvidenceBundle,createEvidence,EffectKind,EvidenceSource} from '../deployment/jh-result-verification/index.mjs';
import {digest} from './payment-core.mjs';

// Reuse JH149's financial evidence policy. Browser DOM receipt evidence is kept
// separate from authenticated provider proof and cannot become EFFECT_CONFIRMED.
export function paymentResultPolicy(ticket){
  const f=ticket.final_flow,receipt=f?.receipt;
  if(!Number.isSafeInteger(ticket.amount))return {verified:false,effectConfirmed:false,status:'NO_ACTIVE_PAYMENT',provider_readback_required:true};
  const record={commandDigest:digest('payment|'+ticket.id),executionId:f?.dispatch_id||ticket.id,scope:ticket.id,intentId:ticket.order_id,createdAt:new Date(ticket.created_at).toISOString(),dispatchStartedAt:f?.approved_at?new Date(f.approved_at).toISOString():null};
  const evidence=receipt?[createEvidence({record,source:EvidenceSource.SCREEN_READBACK,capturedAt:new Date(receipt.observed_at).toISOString(),signatureVerified:false,facts:{merchantScreen:receipt}})]:[];
  const result=verifyEvidenceBundle({record,evidence,effectKind:EffectKind.PAYMENT,effectPolicy:{merchant:ticket.merchant,amount:ticket.amount,currency:ticket.currency,orderId:ticket.order_id}});
  return {verified:result.verified,effectConfirmed:result.effectConfirmed,status:result.reasonCode,merchant_screen_observed:!!receipt,provider_readback_required:true};
}
