import {choiceQuoteComparison} from './payment-choice.mjs';
import {randomBytes} from 'node:crypto';
import {requirePaymentActive,discardPaymentWork} from './payment-lifecycle.mjs';
import {fail,digest,text,safeHttps,codeOf} from './payment-core.mjs';

const STATES_AFTER_DISPATCH=new Set(['DISPATCHING','SUBMITTED','AUTHENTICATION_REQUIRED','UNKNOWN','SUCCESS_OBSERVED']);
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function normalizeQuote(raw,t){
  if(!raw||typeof raw!=='object')fail('PAYMENT_CHECKOUT_NOT_READABLE');
  const q={adapter_id:text(raw.adapter_id,80),checkout_url:safeHttps(raw.checkout_url),merchant:text(raw.merchant,80),purpose:text(raw.purpose,120),order_id:text(raw.order_id,120),amount:raw.amount,currency:raw.currency,
    method:raw.method,option_id:text(raw.option_id,80),method_label:text(raw.method_label,80),instrument_label:text(raw.instrument_label,100),terms:text(raw.terms,1500),final_label:text(raw.final_label,120),authentication:raw.authentication,payment_type:raw.payment_type};
  if(!Number.isSafeInteger(q.amount)||q.amount<=0||q.amount>Number.MAX_SAFE_INTEGER/100||q.currency!=='KRW'||q.payment_type!=='ONE_TIME')fail('PAYMENT_FINAL_AMOUNT_OR_TYPE_INVALID');
  if(q.merchant!==t.merchant||q.purpose!==t.purpose||q.order_id!==t.order_id||q.amount!==t.amount||q.currency!==t.currency||q.method!==t.method||q.checkout_url!==t.checkout_url)fail('PAYMENT_FINAL_DETAILS_DIFFER_FROM_ORDER');
  if(!['NONE','USER_REQUIRED'].includes(q.authentication))fail('PAYMENT_AUTHENTICATION_MODE_INVALID');
  if(/(?:\d[ -]?){12,19}/.test(q.instrument_label))fail('PAYMENT_UNMASKED_INSTRUMENT_NOT_ALLOWED');
  if(q.method==='BANK_TRANSFER'){
    q.bank=text(raw.bank,30);q.account=text(raw.account,40).replace(/[ -]/g,'');q.holder=text(raw.holder,60);
    if(q.bank!==t.bank||q.account!==t.account||q.holder!==t.holder)fail('PAYMENT_FINAL_RECIPIENT_CHANGED');
  }
  return q;
}
export const quoteDigest=q=>digest(JSON.stringify(q));

// One feature state machine on the existing encrypted ledger. No timer, worker,
// retry queue, provider credentials or tool accepting a caller's approval boolean.
export class FinalPaymentFlow{
  constructor(service,driver){this.s=service;this.store=service.store;this.driver=driver;this.boot=randomBytes(16).toString('hex');}
  requireDriver(){if(!this.driver)fail('PAYMENT_SITE_ADAPTER_REQUIRED');return this.driver;}
  editable(t){this.store.ensureActionable(t);requirePaymentActive(this.s,t);if(STATES_AFTER_DISPATCH.has(t.final_flow?.state))fail('PAYMENT_EXECUTION_ALREADY_CLAIMED_NO_REPLAY');if(t.final_flow?.state==='CANCELLED')fail('PAYMENT_PREPARATION_CANCELLED');}
  reserveBrowser(id){this.store.transaction(()=>{const old=this.store.getRecord('final','browser');if(old?.ticket&&old.ticket!==id)fail('PAYMENT_OTHER_CHECKOUT_ACTIVE');this.store.setRecord('final','browser',{ticket:id});});}
  releaseBrowser(id){const old=this.store.getRecord('final','browser');if(old?.ticket===id)this.store.setRecord('final','browser',{ticket:null});}
  guardBrowser(name,args={}){
    const passive=['browser_snapshot','browser_take_screenshot','browser_console_messages','browser_network_requests'].includes(name)||(name==='browser_tabs'&&args.action==='list');
    if(!passive&&this.store.getRecord('final','browser')?.ticket)fail('PAYMENT_USE_APPROVED_FLOW_OR_CANCEL');
  }
  async options(id){const t=this.store.get(id);this.editable(t);this.reserveBrowser(id);return {ok:true,payment_id:id,...await this.requireDriver().options(t),payment_verified:false};}
  async select(id,optionId){
    const t=this.store.get(id);this.editable(t);this.reserveBrowser(id);
    const driver=this.requireDriver(),options=await driver.options(t),option=options.options?.find(x=>x.id===optionId);
    if(!option)fail('PAYMENT_OPTION_UNAVAILABLE');
    if(option.method==='BANK_TRANSFER'&&(!t.bank||!t.account||!t.holder))fail('PAYMENT_BANK_RECIPIENT_PREPARATION_REQUIRED');
    const preparing_id=randomBytes(16).toString('hex');
    // The configured control must select a method only; never a Pay control.
    this.store.change(id,x=>{this.editable(x);x.final_flow={state:'PREPARING',boot:this.boot,preparing_id};});
    const r=await driver.select(t,text(optionId,80));
    this.store.change(id,x=>{this.editable(x);if(x.final_flow.preparing_id!==preparing_id)fail('PAYMENT_PREPARATION_SUPERSEDED');if(r.selection_requested!==true||r.method!==option.method)fail('PAYMENT_METHOD_SELECTION_UNCONFIRMED');x.method=option.method;});
    return {ok:true,payment_id:id,...r,payment_verified:false};
  }
  async capture(id){
    const t=this.store.get(id);this.editable(t);this.reserveBrowser(id);
    const preparing_id=randomBytes(16).toString('hex');
    this.store.change(id,x=>{this.editable(x);x.final_flow={state:'PREPARING',boot:this.boot,preparing_id};});
    const raw=await this.requireDriver().observe(t),q=normalizeQuote(raw,{...t,amount:raw.amount}),fingerprint=quoteDigest(q),now=this.s.now();
    const comparison=choiceQuoteComparison(t,q.amount);
    const approval_id=randomBytes(16).toString('hex');
    this.store.change(id,x=>{this.editable(x);if(x.final_flow.preparing_id!==preparing_id)fail('PAYMENT_PREPARATION_SUPERSEDED');x.prepared_amount??=x.amount;x.amount=q.amount;x.final_flow={state:'AWAITING_APPROVAL',quote:q,choice_comparison:comparison,fingerprint,approval_id,boot:this.boot,captured_at:now,expires_at:Math.min(x.expires_at,now+120000)};this.store.event(x,'FINAL_APPROVAL_REQUESTED');});
    const token=this.store.link('FINAL_APPROVAL',id,120000);
    this.store.setRecord('final-link',digest(token),{fingerprint,approval_id,boot:this.boot});
    return {ok:true,payment_id:id,state:'AWAITING_APPROVAL',quote:q,choice_comparison:comparison,approval_url:this.s.config.base+'/jh-payments/approve/'+token,expires_at:Math.min(t.expires_at,now+120000),payment_verified:false,instruction:'이 링크는 사용자 본인에게만 보여 주세요. GPT/JH 도구로 열거나 승인 버튼을 누르지 마세요. 사용자가 승인하면 같은 금액·주문·결제수단으로 한 번 실행합니다.'};
  }
  approvalView(token){
    const link=this.store.resolve(token,'FINAL_APPROVAL'),t=this.store.get(link.ticket),binding=this.store.getRecord('final-link',digest(token)),f=t.final_flow;
    this.store.ensureActionable(t);this.s.lifecycle?.assertBinding(t);
    if(!binding||!f||f.state!=='AWAITING_APPROVAL'||f.boot!==this.boot||binding.boot!==this.boot||binding.fingerprint!==f.fingerprint||binding.approval_id!==f.approval_id||f.expires_at<=this.s.now())fail('PAYMENT_APPROVAL_EXPIRED_OR_REPLACED');
    return {t,f,link};
  }
  async approveAndExecute(token,fingerprint){
    if(this.s.lifecycle){const link=this.store.resolve(token,'FINAL_APPROVAL'),t=this.store.get(link.ticket);return this.s.lifecycle.run(t,()=>this.approveBound(token,fingerprint));}
    return this.approveBound(token,fingerprint);
  }
  async approveBound(token,fingerprint){
    const {t,f}=this.approvalView(token);
    if(f.fingerprint!==fingerprint)fail('PAYMENT_APPROVAL_DETAILS_CHANGED');
    const driver=this.requireDriver();
    // Read-only preflight. Approval is consumed only after a fresh exact match.
    const live=normalizeQuote(await driver.observe(t),t);
    if(!equal(live,f.quote))fail('PAYMENT_CHECKOUT_CHANGED_REAPPROVE');
    this.store.change(t.id,x=>{
      this.editable(x);const current=x.final_flow;
      if(current.state!=='AWAITING_APPROVAL'||current.fingerprint!==fingerprint||current.approval_id!==f.approval_id||current.boot!==this.boot||current.expires_at<=this.s.now())fail('PAYMENT_APPROVAL_EXPIRED_OR_REPLACED');
      current.state='DISPATCHING';current.approved_at=this.s.now();current.dispatch_id=randomBytes(16).toString('hex');this.store.event(x,'FINAL_APPROVED_AND_CLAIMED');
    });
    // All approval links for this order are now unusable, even if the process dies.
    try{
      // Driver must compare the full quote and click synchronously in one page
      // evaluation, with no await between the final comparison and click.
      const r=await driver.submit(t,f.quote);
      this.store.change(t.id,x=>{if(x.final_flow.state==='SUCCESS_OBSERVED')return;x.final_flow.state=r?.submitted===true?(f.quote.authentication==='USER_REQUIRED'?'AUTHENTICATION_REQUIRED':'SUBMITTED'):'UNKNOWN';this.store.event(x,'FINAL_'+x.final_flow.state);});
    }catch(e){this.store.change(t.id,x=>{if(x.final_flow.state==='SUCCESS_OBSERVED')return;x.final_flow.state='UNKNOWN';x.final_flow.error=codeOf(e);this.store.event(x,'FINAL_UNKNOWN');});}
    // Result checking is read-only; its failure must never replay the charge.
    await this.verify(t.id);
    return this.report(t.id);
  }
  async verify(id){
    const t=this.store.get(id),f=t.final_flow;
    if(!f||!STATES_AFTER_DISPATCH.has(f.state))fail('PAYMENT_HAS_NOT_BEEN_SUBMITTED');
    if(f.state==='SUCCESS_OBSERVED')return this.report(id);
    let receipt;
    try{receipt=await this.requireDriver().receipt(t,f.quote);}catch{return this.report(id);}
    if(!receipt||receipt.status!=='SUCCESS')return this.report(id);
    try{
      if(receipt.merchant!==f.quote.merchant||receipt.order_id!==f.quote.order_id||receipt.amount!==f.quote.amount||receipt.currency!==f.quote.currency||receipt.method!==f.quote.method)fail('PAYMENT_RECEIPT_MISMATCH');
      const normalized={merchant:receipt.merchant,order_id:receipt.order_id,amount:receipt.amount,currency:receipt.currency,method:receipt.method,transaction_id:text(receipt.transaction_id,160),receipt_url:safeHttps(receipt.receipt_url),paid_at:text(receipt.paid_at,80),observed_at:this.s.now(),evidence_level:'MERCHANT_SCREEN'};
      this.store.change(id,x=>{x.final_flow.state='SUCCESS_OBSERVED';x.final_flow.receipt=normalized;x.status='PAYMENT_SUCCESS_OBSERVED';x.payment_verified=false;this.store.event(x,'PAYMENT_RECEIPT_OBSERVED');});
      this.releaseBrowser(id);
    }catch{this.store.change(id,x=>{x.final_flow.receipt_error='PAYMENT_RECEIPT_MISMATCH_OR_INCOMPLETE';});}
    return this.report(id);
  }
  cancel(id){
    if(this.s.lifecycle){const t=this.store.get(id);if(t.lifecycle_cancelled)return this.report(id);this.s.lifecycle.assertReadOwner(t);discardPaymentWork(this.store,{ticketId:id,device:t.command_binding?.device,commandId:t.command_binding?.command_id,reason:'USER_CANCELLED'});return this.report(id);}
    this.store.change(id,t=>{if(STATES_AFTER_DISPATCH.has(t.final_flow?.state))fail('PAYMENT_MAY_HAVE_BEEN_SUBMITTED_CHECK_RESULT');t.final_flow={state:'CANCELLED'};this.store.event(t,'FINAL_CANCELLED');});
    this.releaseBrowser(id);
    return this.report(id);
  }
  report(id){
    const t=this.store.get(id),f=t.final_flow||{state:'PREPARING'},success=f.state==='SUCCESS_OBSERVED';
    return {ok:true,payment_id:id,state:f.state,choice_comparison:f.choice_comparison||null,result_verification:this.s.resultVerifier?.(t)||null,discarded:t.lifecycle_cancelled===true,external_effect_preserved:t.lifecycle_cancelled===true&&!!t.merchant,merchant:t.merchant,order_id:t.order_id,amount:t.amount,currency:t.currency,method:t.method,receipt:f.receipt||null,payment_verified:false,payment_success_observed:success,evidence_level:success?'MERCHANT_SCREEN':'UNCONFIRMED',automatic_retry_allowed:false,
      message:success?`판매처 완료 화면 확인: ${t.merchant}, ${t.amount.toLocaleString('ko-KR')}원. 주문 ${t.order_id}. 영수증 ${f.receipt.transaction_id}.`:f.state==='AUTHENTICATION_REQUIRED'?'결제 요청을 전달했습니다. 결제 앱에서 지문·PIN 등 본인 인증을 완료해 주세요. 아직 결제 성공은 확인되지 않았습니다.':f.state==='UNKNOWN'||f.state==='DISPATCHING'?'결제 결과를 확인할 수 없습니다. 다시 결제하지 말고 주문내역을 확인합니다.':f.state==='CANCELLED'?'결제 준비를 취소했습니다.':'아직 결제 성공은 확인되지 않았습니다.'};
  }
}
