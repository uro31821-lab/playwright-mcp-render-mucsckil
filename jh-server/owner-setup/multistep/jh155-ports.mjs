/**
 * The existing JH155 instances and command-scope authority are injected here.
 * This module does not create a second browser, executor, approval service,
 * task ledger, or worker. Missing JH adapters are configuration failures.
 */
export function createJH155Ports({
  commandContext,                    // trusted JH current-command fence, not LLM input
  rightAppNavigation,                // existing JH Secure56 guarded right-pane navigation
  signedScreenRead,                  // existing JH Secure56 guarded readback
  inspectSplitEvidence,             // existing JH155 split-screen-evidence.mjs function
  chooseEngine,                      // existing search-decision.mjs {recommend, calculateTotal}
  choiceStore,                       // existing DecisionStore captured to JH command binding
  paymentService,                    // existing PaymentService with .final + lifecycle installed
  sendToGpt,                         // optional existing JH result integrator
  discardSplitContext               // optional existing split context cleanup
}={}){
  for(const [n,fn] of Object.entries({commandContext,rightAppNavigation,signedScreenRead,inspectSplitEvidence}))
    if(typeof fn!=='function')throw Error('JH155_ADAPTER_MISSING_'+n);
  if(!chooseEngine||typeof chooseEngine.recommend!=='function'||typeof chooseEngine.calculateTotal!=='function'||
     !choiceStore||typeof choiceStore.save!=='function'||typeof choiceStore.why!=='function')throw Error('JH155_CHOICE_ENGINE_NOT_CONNECTED');
  if(!paymentService||typeof paymentService.prepare!=='function'||typeof paymentService.open!=='function'||
     typeof paymentService.final?.capture!=='function'||typeof paymentService.final?.verify!=='function'||
     typeof paymentService.final?.report!=='function'||typeof paymentService.discardWork!=='function')
    throw Error('JH155_PAYMENT_LIFECYCLE_NOT_CONNECTED');
  return {
    currentCommand:()=>commandContext(),
    verifySplitPair:(receipt,app,now)=>inspectSplitEvidence(receipt,receipt.rows??null,app,now),
    navigateApp:(ctx,args)=>rightAppNavigation(ctx,args),
    readScreen:(ctx,args)=>signedScreenRead(ctx,args),
    recommend:(_ctx,input)=>{const r=chooseEngine.recommend(input);return r.ok===true?choiceStore.save(r):r;},
    explainDecision:(_ctx,id,options)=>choiceStore.why(id,options),
    calculateTotal:(_ctx,items)=>chooseEngine.calculateTotal(items),
    payment:{
      prepare:(_ctx,p)=>paymentService.prepare(p),
      open:(_ctx,id,target)=>paymentService.open(id,target),
      requestApproval:(_ctx,id)=>paymentService.final.capture(id),
      verify:(_ctx,id)=>paymentService.final.verify(id),
      report:(_ctx,id)=>paymentService.final.report(id),
      discard:(ctx,{paymentId,reason})=>paymentService.discardWork({device:ctx.deviceId,commandId:ctx.commandId,...(paymentId?{ticketId:paymentId}:{}),reason})
    },
    ...(typeof sendToGpt==='function'?{reportToGpt:(_ctx,r)=>sendToGpt(r)}:{}),
    ...(typeof discardSplitContext==='function'?{cancelSplitContext:(ctx,args)=>discardSplitContext(ctx,args)}:{})
  };
}
