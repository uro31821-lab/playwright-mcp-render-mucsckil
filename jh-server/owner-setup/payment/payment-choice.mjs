import {fail,safeHttps} from './payment-core.mjs';

// Data binding only: all calculations and execution remain in existing engines.
export function resolveChoiceContext(service,input,binding){
  if(!input.decision_id&&!input.choice_item_id&&!input.choice_payment_scope)return null;
  if(!input.decision_id||!input.choice_item_id||!service.choiceLookup||!binding)fail('PAYMENT_CHOICE_BINDING_REQUIRED');
  const decision=service.choiceLookup(input.decision_id);
  service.lifecycle.assertActive({command_binding:decision.command_binding});
  const item=decision.recommendation?.items?.find(x=>x.id===input.choice_item_id);
  if(!item)fail('PAYMENT_CHOICE_ITEM_NOT_SELECTED');
  const cost=item.cost,scope=input.choice_payment_scope||'FULL_ITEM';
  if(!['FULL_ITEM','DEPOSIT'].includes(scope))fail('PAYMENT_CHOICE_SCOPE_INVALID');
  if(!cost?.complete||!Number.isSafeInteger(cost.total)||item.available!==true||item.source?.stale)fail('PAYMENT_CHOICE_RECHECK_REQUIRED');
  const age=service.now()-Date.parse(item.source?.observedAt);
  if(!Number.isFinite(age)||age< -300000||age>30*60*1000)fail('PAYMENT_CHOICE_RECHECK_REQUIRED');
  if(safeHttps(input.source_url)!==safeHttps(item.source.url)||input.purpose!==item.title)fail('PAYMENT_CHOICE_SOURCE_OR_ITEM_CHANGED');
  if(decision.recommendation.totals.sharedDiscounts?.length)fail('PAYMENT_CHOICE_SHARED_DISCOUNT_ALLOCATION_REQUIRED');
  const expected=scope==='DEPOSIT'?cost.dueNow:cost.total;
  if(!Number.isSafeInteger(expected)||expected<=0||input.amount!==expected)fail('PAYMENT_CHOICE_AMOUNT_MISMATCH');
  return {decision_id:decision.decisionId,item_id:item.id,item_title:item.title,scope,item_total:cost.total,prepared_amount:expected,combination_total:decision.recommendation.totals.total,combination_kind:decision.recommendation.totals.kind,source_url:item.source.url,observed_at:item.source.observedAt};
}
export function choiceQuoteComparison(ticket,amount){
  const c=ticket.choice_context;if(!c)return null;
  // A deposit is part of the whole price. It must never be added a second time.
  if(c.scope==='DEPOSIT'&&amount!==c.prepared_amount)fail('PAYMENT_CHOICE_DEPOSIT_CHANGED_REVIEW_REQUIRED');
  const delta=amount-c.prepared_amount;
  const updated=c.combination_total===null?null:c.combination_total+delta;
  if(updated!==null&&(!Number.isSafeInteger(updated)||updated<0))fail('PAYMENT_CHOICE_TOTAL_INVALID');
  return {...c,current_payment_amount:amount,amount_difference:delta,combination_total_after_quote:updated,remaining_item_amount:c.scope==='DEPOSIT'?c.item_total-amount:0,combination_is_not_a_single_charge:true};
}
