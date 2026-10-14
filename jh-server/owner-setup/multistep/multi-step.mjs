/**
 * JH ⑤ Multi-step coordinator (add-on; not an executor).
 * 2026-10-13: Reuses the currently deployed JH command fence, split-screen
 * readback, choice engine, payment ledger and final-approval screen.
 * No background workers, automatic resume, auto-approval, or payment submit.
 */
import {randomUUID} from 'node:crypto';

const raise=(code)=>{throw Object.assign(new Error(code),{code});};
const valid=(x,max=2000)=>typeof x==='string'&&x.trim().length>0&&x.length<=max;
const safeId=x=>valid(x,160)&&/^[A-Za-z0-9_.:-]+$/.test(x);
const clone=x=>structuredClone(x);
const allowedModes=new Set(['COMPARE','PURCHASE']);
const stepsByMode={
  COMPARE:['COMPARE','TOTAL','EXPLAIN','GPT_REPORT'],
  PURCHASE:['COMPARE','TOTAL','EXPLAIN','CHECKOUT','APPROVAL','PAYMENT_VERIFY','GPT_REPORT']
};
const sideEffectSteps=new Set(['APP_SWITCH','CHECKOUT','APPROVAL']);
const nonRetryCodes=new Set(['PAYMENT_EXECUTION_ALREADY_CLAIMED_NO_REPLAY','PAYMENT_ACTION_ALREADY_CLAIMED_NO_REPLAY']);

function originOf(raw){
  if(typeof raw!=='string'||raw.length>4096)raise('URL_INVALID');
  let u;try{u=new URL(raw);}catch{raise('URL_INVALID');}
  if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||!u.hostname.includes('.'))raise('HTTPS_URL_REQUIRED');
  return u.origin;
}
function ensurePorts(ports){
  for(const n of ['currentCommand','verifySplitPair','navigateApp','readScreen','recommend','explainDecision','payment']){
    if(n==='payment'){
      for(const f of ['prepare','open','requestApproval','verify','report','discard'])if(typeof ports.payment?.[f]!=='function')raise('MISSING_JH_PAYMENT_PORT_'+f);
    }else if(typeof ports[n]!=='function')raise('MISSING_JH_PORT_'+n);
  }
}
function authorizeContext(ctx,mode){
  if(!ctx||ctx.userInitiated!==true||!safeId(ctx.commandId)||!safeId(ctx.deviceId))raise('JH_ACTIVE_USER_COMMAND_REQUIRED');
  const s=ctx.scope;
  if(!s||!Array.isArray(s.apps)||s.apps.length===0||s.apps.length>4||s.apps.some(x=>!valid(x,180)))raise('SCOPE_APPS_REQUIRED');
  if(!Array.isArray(s.origins)||s.origins.length===0||s.origins.some(x=>originOf(x)!==x))raise('SCOPE_HTTPS_ORIGINS_REQUIRED');
  if(!Number.isSafeInteger(s.maxPaymentKRW)||s.maxPaymentKRW<0)raise('SCOPE_MAX_PAYMENT_REQUIRED');
  if(mode==='PURCHASE'&&(s.mayCheckout!==true||s.mayRequestApproval!==true))raise('PAYMENT_OUTSIDE_USER_SCOPE');
  return {deviceId:ctx.deviceId,commandId:ctx.commandId,userInitiated:true,scope:clone(s)};
}
function planSteps(ctx,mode){
  return [
    ...ctx.scope.apps.flatMap((app,i)=>[
      {id:`${i*2+1}`,kind:'APP_SWITCH',app},
      {id:`${i*2+2}`,kind:'SCREEN_READ',app}
    ]),
    ...stepsByMode[mode].map((kind,i)=>({id:`core_${i}`,kind}))
  ].map((s,index)=>({...s,index,status:'PENDING'}));
}
function goalAnalysis(goal,mode,ctx){
  return {goal:goal.trim(),mode,requestedOutcome:mode==='PURCHASE'?'비교·선택 후 사용자 직접 결제 승인':'비교·선택·총액 보고',
    constraints:{apps:clone(ctx.scope.apps),origins:clone(ctx.scope.origins),maxPaymentKRW:ctx.scope.maxPaymentKRW},
    approval:'USER_ONLY',externalExecution:'CURRENT_COMMAND_ONLY',autonomousContinuation:false};
}
function stepView(s){return {id:s.id,kind:s.kind,app:s.app||null,status:s.status};}
function resultStatus(r,terms){
  const receipt=r?.receipt;
  if(r?.state==='SUCCESS_OBSERVED'&&r?.payment_success_observed===true&&r?.evidence_level==='MERCHANT_SCREEN'&&
      valid(receipt?.transaction_id,160)&&receipt.merchant===terms?.merchant&&receipt.order_id===terms?.orderId&&
      receipt.amount===terms?.amount&&receipt.currency===terms?.currency&&receipt.method===terms?.method)
    return 'MERCHANT_SUCCESS_OBSERVED';
  if(r?.state==='AUTHENTICATION_REQUIRED')return 'AUTHENTICATION_REQUIRED';
  if(['UNKNOWN','DISPATCHING','SUBMITTED'].includes(r?.state))return 'EXTERNAL_RESULT_UNCONFIRMED';
  return 'PAYMENT_NOT_CONFIRMED';
}

export class JHMultiStepCoordinator {
  constructor(ports,{now=()=>Date.now()}={}){ensurePorts(ports);this.ports=ports;this.now=now;this.active=null;this.generation=0;this.lastCancellation=null;}
  async start({goal,mode='COMPARE'}={}){
    if(!valid(goal)||!allowedModes.has(mode))raise('GOAL_OR_MODE_INVALID');
    const incoming=authorizeContext(await this.ports.currentCommand(),mode);
    if(this.active){
      if(this.active.ctx.commandId===incoming.commandId)raise('ONE_ACTIVE_PLAN_PER_COMMAND');
      await this.cancel('NEW_COMMAND');
    }
    // Fail closed if JH command changed during asynchronous old-work cleanup.
    const latest=await this.ports.currentCommand();
    if(!latest||latest.commandId!==incoming.commandId||latest.deviceId!==incoming.deviceId||latest.userInitiated!==true)raise('JH_COMMAND_CHANGED');
    this.generation++;
    const plan=planSteps(incoming,mode);
    this.active={id:'jh5_'+randomUUID(),generation:this.generation,ctx:incoming,goal:goal.trim(),mode,
      analysis:goalAnalysis(goal,mode,incoming),steps:plan,index:0,phase:'RUNNING',busy:false,
      createdAt:new Date(this.now()).toISOString(),events:[],proof:null,decision:null,totals:null,why:null,
      terms:null,paymentId:null,paymentStatus:null,paymentApproval:null,report:null,conditions:{},
      controller:new AbortController()};
    return {ok:true,...this.status()};
  }
  async assertCurrent(job){
    if(this.active!==job||this.generation!==job.generation||job.controller.signal.aborted)raise('WORK_CANCELLED_OR_SUPERSEDED');
    const c=await this.ports.currentCommand();
    if(!c||c.deviceId!==job.ctx.deviceId||c.commandId!==job.ctx.commandId||c.userInitiated!==true){
      await this.cancel('COMMAND_NOT_CURRENT');raise('JH_COMMAND_CHANGED');
    }
  }
  invalidate(reason='USER_CANCELLED'){
    const job=this.active;if(!job)return null;
    this.generation++;this.active=null;job.controller.abort();job.busy=false;
    this.lastCancellation={reason,automaticResume:false,oldWorkDeleted:true,
      externalEffectLedger:'EXISTING_JH_LEDGER_RETAINED',needsReadOnlyReconciliation:!!job.paymentId};
    return job;
  }
  async cancel(reason='USER_CANCELLED'){
    const old=this.invalidate(reason);
    if(!old)return {ok:true,cancelled:false,automaticResume:false};
    let cleanup='DONE';
    try{await this.ports.payment.discard(old.ctx,{paymentId:old.paymentId,reason});}
    catch{cleanup='JH_PAYMENT_CLEANUP_REQUIRES_RECONCILIATION';}
    if(typeof this.ports.cancelSplitContext==='function'){
      try{await this.ports.cancelSplitContext(old.ctx,{reason});}catch{cleanup='JH_SPLIT_CLEANUP_REQUIRES_RECONCILIATION';}
    }
    return {ok:cleanup==='DONE',cancelled:true,cleanup,oldWorkDeleted:true,automaticResume:false,
      externalEffectLedger:'EXISTING_JH_LEDGER_RETAINED'};
  }
  /** Call immediately from existing JH "user selected another site" and force-stop hooks. */
  onDirectSiteSwitch(){return this.cancel('DIRECT_SITE_SWITCH');}
  async cancelWorkflow(workflowId,reason='USER_CANCELLED'){
    const j=this.requireJob(workflowId);await this.assertCurrent(j);return this.cancel(reason);
  }
  onForceStop(){return this.cancel('APP_FORCE_STOP');}
  status(){
    const j=this.active;
    if(!j)return {active:false,phase:'IDLE',automaticResume:false,lastCancellation:this.lastCancellation};
    return {active:true,workflowId:j.id,goal:j.goal,mode:j.mode,goalAnalysis:clone(j.analysis),phase:j.phase,
      currentStep:j.steps[j.index]?.kind||null,completed:j.index,total:j.steps.length,
      steps:j.steps.map(stepView),conditions:clone(j.conditions),
      decisionId:j.decision?.decisionId||null,selection:j.decision?.recommendation?.items?.map(x=>({id:x.id,title:x.title}))||null,
      alternativeAvailable:!!j.decision?.alternativesAvailable,
      totals:j.totals?clone(j.totals):null,paymentId:j.paymentId,
      paymentResult:j.paymentStatus?clone(j.paymentStatus):null,
      approval:j.paymentApproval?clone(j.paymentApproval):null,
      latestExplanation:j.why?clone(j.why):null,
      lastScreenEvidence:j.proof?{chatWindowId:j.proof.chatWindowId,workWindowId:j.proof.workWindowId,workPackage:j.proof.workPackage,observedAtMs:j.proof.observedAtMs}:null,
      report:j.report?clone(j.report):null,automaticResume:false};
  }
  async checkedStatus(){if(this.active)await this.assertCurrent(this.active);return this.status();}
  async checkedPreviewReport(workflowId){const j=this.requireJob(workflowId);await this.assertCurrent(j);return this.previewReport(workflowId);}
  async revise({workflowId,conditions}={}){
    const j=this.requireJob(workflowId);
    await this.assertCurrent(j);
    if(j.busy)raise('WORK_IN_PROGRESS');
    if(j.paymentId||['CHECKOUT','APPROVAL','PAYMENT_VERIFY'].includes(j.steps[j.index]?.kind))raise('PAYMENT_PREPARATION_CANCEL_FIRST');
    if(!j.decision||j.phase==='NEEDS_REVIEW_NO_REPLAY'||j.steps.some(s=>s.kind==='SCREEN_READ'&&s.status!=='VERIFIED'))raise('REPLAN_REQUIRES_PREVIOUSLY_VERIFIED_SELECTION');
    if(!conditions||typeof conditions!=='object'||Array.isArray(conditions))raise('INVALID_CHANGED_CONDITIONS');
    const allowed=new Set(['budget','weights','requiredConditions','preferredConditions','query']);
    if(Object.keys(conditions).some(k=>!allowed.has(k)))raise('CHANGE_EXCEEDS_USER_SCOPE');
    if(conditions.budget!==undefined&&(!Number.isSafeInteger(conditions.budget)||conditions.budget<0||conditions.budget>j.ctx.scope.maxPaymentKRW))raise('BUDGET_OUTSIDE_USER_SCOPE');
    if(conditions.query!==undefined&&!valid(conditions.query,500))raise('INVALID_QUERY');
    j.conditions=clone(conditions);
    j.decision=null;j.totals=null;j.why=null;j.report=null;
    const index=j.steps.findIndex(s=>s.kind==='COMPARE');
    j.steps.forEach((s,i)=>{if(i>=index)s.status='PENDING';});j.index=index;j.phase='RUNNING';
    return {ok:true,reason:'REPLAN_WITHIN_CURRENT_USER_COMMAND',...this.status()};
  }
  requireJob(id){const j=this.active;if(!j||j.id!==id)raise('ACTIVE_WORKFLOW_NOT_FOUND');return j;}
  verifySourceOrigins(request,scope){
    if(!request||!Array.isArray(request.groups)||request.groups.length<1)raise('VERIFIABLE_CANDIDATES_REQUIRED');
    for(const group of request.groups){
      for(const c of group.candidates||[]){
        if(!scope.origins.includes(originOf(c.source?.url)))raise('CANDIDATE_SOURCE_OUTSIDE_SCOPE');
      }
    }
  }
  verifyReceipt(raw,app,job){
    if(raw?.ok!==true||raw?.resultVerified!==true)raise('SCREEN_ACTION_NOT_VERIFIED');
    const p=this.ports.verifySplitPair(raw,app,this.now());
    if(p?.ok!==true||!valid(p.chatWindowId,40)||!valid(p.workWindowId,40)||p.chatWindowId===p.workWindowId||p.workPackage!==app||
       !Number.isSafeInteger(p.observedAtMs)||this.now()-p.observedAtMs>45000||p.observedAtMs>this.now()+5000)raise('SPLIT_SCREEN_PROOF_INVALID');
    if(job.proof&&(job.proof.chatWindowId!==p.chatWindowId||job.proof.chatPackage!==p.chatPackage))raise('ORIGINAL_CHAT_PANE_CHANGED');
    return clone(p);
  }
  finishStep(job,step,output){
    step.status=step.kind==='CHECKOUT'?'HANDOFF_REPORTED':step.kind==='APPROVAL'?'USER_APPROVAL_REQUIRED':'VERIFIED';
    job.events.push({kind:step.kind,at:this.now(),status:step.status});
    if(job.events.length>30)job.events.shift();job.index++;job.phase=job.index===job.steps.length?'COMPLETED':'RUNNING';
    return {ok:true,completedStep:step.kind,outcome:output,...this.status()};
  }
  async advance({workflowId,input={}}={}){
    const job=this.requireJob(workflowId);
    if(job.busy)raise('WORK_IN_PROGRESS');
    if(job.phase==='COMPLETED')return {ok:true,alreadyCompleted:true,...this.status()};
    if(job.phase==='NEEDS_REVIEW_NO_REPLAY')raise('RETRY_FORBIDDEN_AFTER_UNCONFIRMED_SIDE_EFFECT');
    const step=job.steps[job.index];if(!step)raise('NO_MORE_STEPS');
    job.busy=true; // Claim synchronously before ANY await (concurrent MCP requests).
    const ctx=clone(job.ctx),key=`${job.id}:${step.id}`;
    let sideEffectClaimed=false;
    try{
      await this.assertCurrent(job);
      let output;
      switch(step.kind){
        case 'APP_SWITCH': {
          sideEffectClaimed=true;
          const r=await this.ports.navigateApp(ctx,{app:step.app,requestId:key,signal:job.controller.signal});
          await this.assertCurrent(job);
          job.proof=this.verifyReceipt(r,step.app,job);
          output={rightApp:step.app,splitPairVerified:true};break;
        }
        case 'SCREEN_READ': {
          const r=await this.ports.readScreen(ctx,{app:step.app,signal:job.controller.signal});
          await this.assertCurrent(job);
          job.proof=this.verifyReceipt(r,step.app,job);
          // Never persist raw OCR/screenshots, credentials or page text.
          output={rightApp:step.app,observedAtMs:job.proof.observedAtMs,summarySourceAvailable:!!r.summarySource,
            ...(typeof r.summarySource==='string'?{screenExcerpt:r.summarySource.slice(0,4000),contentTrust:'UNTRUSTED_SCREEN_TEXT'}:{})};break;
        }
        case 'COMPARE': {
          const request=clone(input.recommendRequest);
          if(!request)raise('RECOMMEND_REQUEST_REQUIRED');
          this.verifySourceOrigins(request,ctx.scope);
          const adjusted={...request,query:job.conditions.query||request.query,
            ...(job.conditions.budget!==undefined?{budget:job.conditions.budget}:{}),
            ...(job.conditions.weights?{weights:job.conditions.weights}:{})};
          if(job.conditions.requiredConditions||job.conditions.preferredConditions){
            adjusted.groups=adjusted.groups.map(g=>({...g,
              ...(job.conditions.requiredConditions?{requiredConditions:job.conditions.requiredConditions}:{}),
              ...(job.conditions.preferredConditions?{preferredConditions:job.conditions.preferredConditions}:{})}));
          }
          const r=await this.ports.recommend(ctx,adjusted);
          await this.assertCurrent(job);
          if(r?.ok!==true||!r?.recommendation?.items?.length||!valid(r.decisionId,90))raise('NO_VERIFIED_SELECTION');
          if(r.recommendation.items.some(c=>!ctx.scope.origins.includes(originOf(c.source?.url))))raise('RECOMMENDATION_SOURCE_CHANGED');
          job.decision=clone(r);
          output={decisionId:r.decisionId,best:r.recommendation.items.map(c=>({id:c.id,title:c.title})),
            runnerUp:r.alternativesAvailable===true,selectionReason:r.explanation?.summary||null};break;
        }
        case 'TOTAL': {
          const original=job.decision?.recommendation?.totals;
          if(!original)raise('CHOICE_TOTAL_MISSING');
          let result=clone(original);
          if(input.totalItems){
            if(typeof this.ports.calculateTotal!=='function')raise('JH_TOTAL_PORT_REQUIRED');
            const fresh=await this.ports.calculateTotal(ctx,input.totalItems);
            await this.assertCurrent(job);
            if(fresh?.ok===false||fresh?.currency!=='KRW')raise('TOTAL_CALCULATION_NOT_VERIFIED');
            if(fresh.total!==original.total||fresh.complete!==original.complete)raise('TOTAL_QUOTE_MISMATCH');
            result=clone(fresh);
          }
          job.totals=result;
          output={knownSubtotal:result.knownSubtotal,total:result.total,confirmed:result.confirmed,
            estimated:result.estimated,unknown:result.unknown||[],kind:result.kind,
            completeness:result.complete===true?'COMPLETE':'UNCONFIRMED_COSTS'};break;
        }
        case 'EXPLAIN': {
          const r=await this.ports.explainDecision(ctx,job.decision.decisionId,{alternatives:true});
          await this.assertCurrent(job);
          if(!r||!r.mainConditions)raise('CHOICE_REASON_UNVERIFIED');
          job.why=clone(r);
          output={reason:r.explanation?.summary||null,mainConditions:r.mainConditions,
            alternatives:r.alternatives||job.decision.alternatives||[]};break;
        }
        case 'CHECKOUT': {
          if(job.mode!=='PURCHASE'||ctx.scope.mayCheckout!==true)raise('CHECKOUT_OUTSIDE_SCOPE');
          if(job.totals?.complete!==true||job.decision?.conditional===true)raise('QUOTE_OR_CONDITIONS_REQUIRE_RECHECK');
          const p=input.payment;
          if(!p||typeof p!=='object')raise('EXPLICIT_PAYMENT_DETAILS_REQUIRED');
          const selection=job.decision.recommendation.items.find(x=>x.id===p.choice_item_id);
          if(!selection||p.decision_id!==job.decision.decisionId||p.purpose!==selection.title)raise('PAYMENT_CHOICE_BINDING_MISMATCH');
          if(p.source_url!==selection.source?.url||!ctx.scope.origins.includes(originOf(p.source_url))||!ctx.scope.origins.includes(originOf(p.checkout_url)))raise('PAYMENT_URL_OUTSIDE_CURRENT_SCOPE');
          if(selection.cost?.complete!==true||selection.source?.stale===true||selection.available!==true)raise('SELECTED_OFFER_RECHECK_REQUIRED');
          if(p.choice_payment_scope!=='FULL_ITEM'&&p.choice_payment_scope!=='DEPOSIT')raise('PAYMENT_SCOPE_REQUIRED');
          const amount=p.choice_payment_scope==='DEPOSIT'?selection.cost.dueNow:selection.cost.total;
          if(!Number.isSafeInteger(amount)||amount<=0||amount!==p.amount||amount>ctx.scope.maxPaymentKRW)raise('PAYMENT_AMOUNT_OUTSIDE_SELECTED_OFFER');
          if(p.request_key!==key)raise('PAYMENT_IDEMPOTENCY_KEY_MUST_MATCH_STEP');
          sideEffectClaimed=true; // Existing durable JH payment ledger claims OPEN before dispatch.
          const prep=await this.ports.payment.prepare(ctx,p);
          await this.assertCurrent(job);
          if(prep?.ok!==true||!valid(prep.payment_id,90))raise('PAYMENT_PREPARATION_UNCONFIRMED');
          job.paymentId=prep.payment_id;
          job.terms={merchant:p.merchant,orderId:p.order_id,amount:p.amount,currency:p.currency,method:p.method};
          const opened=await this.ports.payment.open(ctx,job.paymentId,input.target||'PHONE');
          await this.assertCurrent(job);
          if(opened?.ok!==true){job.phase='NEEDS_REVIEW_NO_REPLAY';return {ok:false,code:'CHECKOUT_OPEN_UNCONFIRMED_NO_REPLAY',paymentId:job.paymentId,automaticReplay:false};}
          output={paymentId:job.paymentId,checkoutHandoffReported:true,checkoutPageVerified:false,charged:false,
            detail:'전달/앱 열림 보고만 확인됨. 다음 승인 단계에서 실제 판매처 결제조건을 다시 읽어야 함'};break;
        }
        case 'APPROVAL': {
          if(!job.paymentId)raise('PREPARED_PAYMENT_REQUIRED');
          sideEffectClaimed=true;
          const res=await this.ports.payment.requestApproval(ctx,job.paymentId);
          await this.assertCurrent(job);
          if(res?.ok!==true||res.state!=='AWAITING_APPROVAL'||!valid(res.approval_url,4096))raise('USER_APPROVAL_NOT_AVAILABLE');
          const quote=res.quote;
          if(!quote||quote.merchant!==job.terms?.merchant||quote.order_id!==job.terms?.orderId||
             quote.amount!==job.terms?.amount||quote.currency!==job.terms?.currency||quote.method!==job.terms?.method)
             raise('CHECKOUT_QUOTE_CHANGED_REVIEW_REQUIRED');
          job.paymentApproval={state:'AWAITING_USER_APPROVAL',approvalUrl:res.approval_url,
            expiresAt:res.expires_at??null,quote:res.quote??null,
            instruction:'실제 결제 버튼의 사용자 직접 승인이 필요합니다. GPT/JH는 승인 링크를 열거나 승인하지 않습니다.'};
          output={...job.paymentApproval};break;
        }
        case 'PAYMENT_VERIFY': {
          if(!job.paymentId)raise('PAYMENT_ID_REQUIRED');
          // This is readback only. It NEVER calls submit or reopens checkout.
          let r;
          try{r=await this.ports.payment.verify(ctx,job.paymentId);}catch(e){
            if(e?.code!=='PAYMENT_HAS_NOT_BEEN_SUBMITTED')throw e;
            r=await this.ports.payment.report(ctx,job.paymentId);
          }
          await this.assertCurrent(job);
          const outcome=resultStatus(r,job.terms);job.paymentStatus={state:r?.state||'UNKNOWN',
            outcome,receipt:r?.receipt||null,evidenceLevel:r?.evidence_level||'UNCONFIRMED',
            paymentVerified:r?.payment_verified===true,paymentSuccessObserved:r?.payment_success_observed===true};
          if(outcome!=='MERCHANT_SUCCESS_OBSERVED'){
            job.phase=['EXTERNAL_RESULT_UNCONFIRMED'].includes(outcome)?'UNKNOWN_NO_RETRY':'WAITING_USER_OR_RESULT';
            return {ok:true,completedStep:null,paymentPending:true,paymentResult:clone(job.paymentStatus),
              automaticPaymentRetry:false,...this.status()};
          }
          output={...job.paymentStatus,bankApiVerified:job.paymentStatus.paymentVerified===true};break;
        }
        case 'GPT_REPORT': {
          const result=this.makeReport(job);
          // JH tool response is itself a GPT-visible report. An optional host callback
          // can also deliver it through JH's existing result router.
          if(typeof this.ports.reportToGpt==='function'){
            const sent=await this.ports.reportToGpt(ctx,result);
            await this.assertCurrent(job);
            if(sent?.delivered!==true)raise('GPT_REPORT_DELIVERY_UNCONFIRMED');
          }
          job.report=clone(result);output=result;break;
        }
        default:raise('UNSUPPORTED_STEP');
      }
      await this.assertCurrent(job);
      const done=this.finishStep(job,step,output);
      if(step.kind==='APPROVAL'){job.phase='WAITING_USER_APPROVAL';}
      return {...done,phase:job.phase};
    }catch(e){
      if(this.active!==job||this.generation!==job.generation)return {ok:false,code:'WORK_CANCELLED_OR_SUPERSEDED',automaticReplay:false};
      const code=e?.code||e?.message||'STEP_FAILED';
      if(sideEffectClaimed||nonRetryCodes.has(code))job.phase='NEEDS_REVIEW_NO_REPLAY';
      else job.phase='NEEDS_INPUT';
      return {ok:false,code,step:step.kind,phase:job.phase,automaticReplay:false,paymentId:job.paymentId};
    }finally{job.busy=false;}
  }
  makeReport(j){
    return {workflowId:j.id,goal:j.goal,mode:j.mode,commandId:j.ctx.commandId,
      selected:j.decision?.recommendation?.items?.map(x=>({title:x.title,id:x.id}))||[],
      alternative:j.why?.alternatives||[],
      selectionReason:j.why?.explanation?.summary||j.decision?.explanation?.summary||null,
      conditions:j.why?.mainConditions||null,
      prices:j.totals?{currency:'KRW',confirmed:j.totals.confirmed,estimated:j.totals.estimated,
        knownSubtotal:j.totals.knownSubtotal,total:j.totals.total,unknown:j.totals.unknown||[],kind:j.totals.kind}:null,
      checkoutHandoffReported:!!j.paymentId,checkoutQuoteVerified:!!j.paymentApproval,
      payment:j.mode==='PURCHASE'?(j.paymentStatus||{outcome:'PAYMENT_NOT_CONFIRMED'}):null,
      completion:j.mode==='PURCHASE'?(j.paymentStatus?.outcome==='MERCHANT_SUCCESS_OBSERVED'?'MERCHANT_SUCCESS_OBSERVED':'UNCONFIRMED'):'CHOICE_AND_TOTAL_REPORTED',
      bankApiVerified:j.paymentStatus?.paymentVerified===true,
      caveat:j.mode==='PURCHASE'?'판매처 완료 화면 관찰과 금융기관 API 검증은 다릅니다.':'총액은 조회 당시 확인된 항목 기준이며 미확인 항목은 제외됩니다.',
      automaticReplay:false};
  }
  /** Read-only status/report; useful if the user cancels before final reporting. */
  previewReport(workflowId){const j=this.requireJob(workflowId);return {ok:true,provisional:j.phase!=='COMPLETED',report:this.makeReport(j)};}
}
