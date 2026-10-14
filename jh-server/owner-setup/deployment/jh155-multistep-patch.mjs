const imports="import {createBoundMultiStepRuntime as jhCreateBoundMultiStep155} from '../multistep/jh155-bound-runtime.mjs';\nimport {registerJHMultiStepTools as jhRegisterMultiStep155} from '../multistep/jh155-mcp-tools.mjs';\nimport * as jhExistingChoice155 from '../deployment/search-decision.mjs';\n";
const helpers=String.raw`
  async function jhMultiRead155(ctx,{app,signal}={}){
    if(signal?.aborted)throw Error('WORK_CANCELLED');
    if(jhRequireCommand56(ctx.deviceId)!==ctx.commandId)throw Error('MULTISTEP_COMMAND_CHANGED');
    const binding=jhPaymentLifecycle.captureBinding({device_id:ctx.deviceId}),auth=active56(ctx.deviceId);
    const read=await waitJob(mk('agent_snapshot',{},ctx.deviceId),15000);
    jhPaymentLifecycle.assertBinding({command_binding:binding});
    if(signal?.aborted||jhRequireCommand56(ctx.deviceId)!==ctx.commandId)throw Error('MULTISTEP_COMMAND_CHANGED');
    let rows;try{rows=JSON.parse(read?.result?.url);}catch{throw Error('SIGNED_SCREEN_UNAVAILABLE');}
    const proof=jhInspectSplitEvidence155(read?.result,rows,app);
    if(read?.status!=='complete'||read.result?.ok!==true||read.secureSessionId!==auth?.sessionId||
      read.targetDeviceId!==ctx.deviceId||!proof.ok)throw Error('SIGNED_SCREEN_UNVERIFIED');
    return {...read.result,rows,resultVerified:true,
      summarySource:rows.filter(x=>x?.package===proof.workPackage).map(x=>x.text||x.description||'').join('\n').slice(0,4000)};
  }
  async function jhMultiNavigate155(ctx,{app,requestId,signal}){
    // Already visible targets need no write. Other packages use the existing
    // native service resolver; no arbitrary Intent or coordinate injection.
    const before=await jhMultiRead155(ctx,{signal});
    const previous=jhInspectSplitEvidence155(before,before.rows);
    if(previous.workPackage===app)return before;
    const targets={'com.android.chrome':'chrome','com.kakao.taxi':'카카오T','com.kakao.talk':'카카오톡',
      'com.nhn.android.search':'네이버','com.nhn.android.nmap':'네이버지도','net.daum.android.map':'카카오맵',
      'kr.goodchoice.abouthere':'여기어때','com.coupang.mobile':'쿠팡','com.korail.talk':'코레일'};
    if(!Object.hasOwn(targets,app))throw Error('EXISTING_NATIVE_TARGET_UNAVAILABLE');
    const holder=await jhResultVerificationGuard56();let receipt=null;
    const protectedResult=await runProtectedJHAction({guard:holder.guard,
      workflowId:'multistep_'+sha56(ctx.deviceId+'|'+ctx.commandId),stepId:requestId,
      action:'MULTISTEP_NATIVE_OPEN',payload:{target:app},effect:{kind:EffectKind.UI_STATE,requireScreenReadback:true},
      expectedFacts:[{source:EvidenceSource.SCREEN_READBACK,path:'screen.foregroundPackage',op:'eq',value:app}],
      beforeDispatch:({record,firstAttempt})=>jhOwnerAdmission155(ctx.deviceId,ctx.commandId,record,firstAttempt),
      dispatchAction:async()=>{
        if(signal?.aborted||jhRequireCommand56(ctx.deviceId)!==ctx.commandId)throw Error('MULTISTEP_COMMAND_CHANGED');
        const opened=await waitJob(mk('open_url',{target:targets[app],url:''},ctx.deviceId),15000);
        return {accepted:opened?.status==='complete'&&opened.result?.ok===true,invocationOnly:true};
      },
      readbackAction:async({record})=>{
        receipt=await jhMultiRead155(ctx,{app,signal});
        const proof=jhInspectSplitEvidence155(receipt,receipt.rows,app);
        if(proof.chatWindowId!==previous.chatWindowId||proof.chatPackage!==previous.chatPackage)return [];
        return [createEvidence({record,source:EvidenceSource.SCREEN_READBACK,signatureVerified:true,
          capturedAt:new Date(proof.observedAtMs).toISOString(),facts:{screen:{foregroundPackage:app}}})];
      }});
    if(!protectedResult.verified||!receipt)throw Error('APP_SWITCH_RESULT_UNCONFIRMED_NO_REPLAY');
    return receipt;
  }
  if(!jhMultiStepRuntime155){
    const payment={prepare:p=>jhGetPaymentService().prepare(p),open:(id,target)=>jhGetPaymentService().open(id,target),
      final:{capture:id=>jhGetPaymentService().final.capture(id),verify:id=>jhGetPaymentService().final.verify(id),
        report:id=>jhGetPaymentService().final.report(id)},
      discardWork:args=>process.env.JH_PAYMENT_ENABLED==='1'?jhGetPaymentService().discardWork(args):({removed:0,preserved:0})};
    jhMultiStepRuntime155=jhCreateBoundMultiStep155({
      captureBinding:()=>jhPaymentLifecycle.captureBinding({}),
      assertBinding:binding=>jhPaymentLifecycle.assertBinding({command_binding:binding}),
      rightAppNavigation:jhMultiNavigate155,signedScreenRead:jhMultiRead155,
      inspectSplitEvidence:jhInspectSplitEvidence155,chooseEngine:jhExistingChoice155,
      choiceStore:jhDecisionStoreV2,paymentService:payment
    });
  }
  jhRegisterMultiStep155({registerOAuthTool,z,textResult,coordinator:jhMultiStepRuntime155});
`;

export function patchJH155MultiStep(source){
  let out=source;
  const once=(before,after)=>{if(out.split(before).length!==2)throw Error('MULTISTEP_HOST_ANCHOR_CHANGED');out=out.replace(before,after);};
  // Process-local view of the existing command. Never loaded from disk on boot.
  const marker='  jhRegisterGeneralWorkTools({registerOAuthTool,z,textResult});';
  once(marker,marker+helpers);
  once("  jhDiscardPayments56(device,previousCommandId,'NEW_COMMAND_OR_SITE_SWITCH');",
    "  jhMultiStepRuntime155?.invalidateFor(device,previousCommandId,'NEW_COMMAND_OR_SITE_SWITCH');\n  jhDiscardPayments56(device,previousCommandId,'NEW_COMMAND_OR_SITE_SWITCH');");
  once('  jhDiscardPayments56(deviceId,undefined,reason);',
    '  jhMultiStepRuntime155?.invalidateFor(deviceId,undefined,reason);\n  jhDiscardPayments56(deviceId,undefined,reason);');
  return imports+'let jhMultiStepRuntime155=null;\n'+out;
}
