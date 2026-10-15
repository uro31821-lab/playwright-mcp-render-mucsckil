import {patchSplitScreenAssistant56} from './split-screen-assistant-mcp-patch.mjs';
import {inspectSplitEvidence} from './split-screen-evidence.mjs';

// This is composition of existing JH routes/guards, not an alternative executor.
const helper=String.raw`
  function jhCheckWorkflowSplit56(w,result,rows,expected){
    const proof=jhInspectSplitEvidence155(result,rows,expected);
    if(!proof.ok)throw Error(proof.reason);
    if(w.splitChatWindowId && (w.splitChatWindowId!==proof.chatWindowId || w.splitChatPackage!==proof.chatPackage))throw Error('ORIGINAL_CHAT_PANE_CHANGED');
    w.splitChatWindowId=proof.chatWindowId;w.splitChatPackage=proof.chatPackage;
    return proof;
  }
  async function jhSplitScreenOnce155(device,commandId,type,payload,dispatch){
    if(!/^[a-f0-9]{32}$/.test(payload.requestId||''))return {ok:false,code:'split_request_id_required',automaticReplay:false};
    const holder=await jhResultVerificationGuard56();
    if(jhRequireCommand56(device)!==commandId)throw Error('split_command_changed');
    let receipt=null;
    const payloadDigest=sha56(JSON.stringify(payload));
    const verified=await runProtectedJHAction({guard:holder.guard,workflowId:'split_'+sha56(device+'|'+commandId),
      stepId:payload.requestId,action:'SPLIT_FOLLOW_UP',payload:{payloadDigest},
      expectedFacts:[{source:EvidenceSource.SCREEN_READBACK,path:'screen.uiTransitionVerified',op:'eq',value:true}],
      effect:{kind:EffectKind.UI_STATE,requireScreenReadback:true},
      dispatchAction:async()=>{
        if(jhRequireCommand56(device)!==commandId)throw Error('split_command_changed');
        receipt=await dispatch();
        return {accepted:receipt?.ok===true,jobDigest:receipt?.jobDigest||null,invocationOnly:true};
      },
      readbackAction:async({record})=>{
        if(jhRequireCommand56(device)!==commandId)throw Error('split_command_changed');
        const proof=jhInspectSplitEvidence155(receipt);
        return receipt?.resultVerified===true && proof.ok ? [createEvidence({record,source:EvidenceSource.SCREEN_READBACK,
          capturedAt:new Date(proof.observedAtMs).toISOString(),signatureVerified:true,
          facts:{screen:{uiTransitionVerified:true,chatWindowId:proof.chatWindowId,workWindowId:proof.workWindowId}}})] : [];
      },
      resultProjector:()=>({uiTransitionVerified:true,externalEffectVerified:false})});
    return {...(receipt||{}),ok:receipt?receipt.ok===true:verified.verified===true,
      resultVerified:verified.verified===true,verificationScope:'UI_TRANSITION_ONLY',externalEffectVerified:false,
      duplicate:verified.duplicate===true,executed:verified.executed===true,
      code:receipt?.code||verified.status,automaticReplay:false,
      resultVerification:jhResultVerificationSummary56(verified)};
  }
  registerOAuthTool('life_android_finish_to_chatgpt',{
    title:'Verify right pane and return to original ChatGPT',
    description:'Read the current right result screen, then select the captured original ChatGPT pane. This verifies the pane pair and focus only; conversation, scroll, payment and external effects require separate evidence. Requires current command_id; no task replay.',
    inputSchema:{},annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false}
  },async()=>{
    const device=chooseDevice();const auth=device&&active56(device);
    if(!device||!auth)return textResult({ok:false,code:'active_secure56_device_required'});
    const command=jhRequireCommand56(device);
    const snap=mk('agent_snapshot',{},device),read=await waitJob(snap,25000);
    if(jhRequireCommand56(device)!==command)throw Error('split_command_changed');
    let rows;try{rows=JSON.parse(read?.result?.url);}catch{return textResult({ok:false,code:'result_screen_missing'});}
    const before=jhInspectSplitEvidence155(read?.result,rows);
    if(read?.status!=='complete'||read.result?.ok!==true||!before.ok)return textResult({ok:false,code:before.reason});
    const job=mk('open_url',{target:'original_chatgpt',url:''},device),reply=await waitJob(job,12000);
    if(jhRequireCommand56(device)!==command)throw Error('split_command_changed');
    // open_url is an action receipt, not a split-screen snapshot. Never demand
    // splitScreenRequired from reply.result (it cannot carry that proof).
    // Obtain a NEW signed agent_snapshot on the same device/session instead.
    const postJob=mk('agent_snapshot',{},device),post=await waitJob(postJob,25000);
    if(jhRequireCommand56(device)!==command)throw Error('split_command_changed');
    let postRows=null;try{postRows=JSON.parse(post?.result?.url);}catch{}
    const sameSession=read?.secureSessionId===auth.sessionId &&
      reply?.secureSessionId===auth.sessionId && post?.secureSessionId===auth.sessionId &&
      read?.targetDeviceId===device && reply?.targetDeviceId===device && post?.targetDeviceId===device;
    const after=post?.status==='complete'&&post?.result?.ok===true &&
      Array.isArray(postRows) ? jhInspectSplitEvidence155(post.result,postRows,before.workPackage) :
      {ok:false,reason:'RETURN_POST_SNAPSHOT_UNCONFIRMED'};
    const nativeVerified=reply?.status==='complete'&&reply.result?.ok===true&&
      reply.result?.originWindowVerified===true;
    const samePane=after.ok && before.chatWindowId===after.chatWindowId &&
      before.chatPackage===after.chatPackage && before.workWindowId===after.workWindowId &&
      before.workPackage===after.workPackage;
    const ok=!!(sameSession&&nativeVerified&&samePane);
    return textResult({ok,code:ok?'ORIGINAL_SPLIT_CHAT_WINDOW_VERIFIED':'ORIGINAL_CHAT_RETURN_UNVERIFIED',
      originWindowVerified:ok,conversationVerified:false,pageOrScrollRestored:false,taskResultVerified:false,
      nativeReturnCode:reply?.result?.code||null,
      postSplitProofCode:after.reason||null,sessionMatched:sameSession,automaticReplay:false,
      resultScreen:rows});
  });
`;
export function patchJH155SplitIntegration(source){
  let out=patchSplitScreenAssistant56(source);
  const once=(a,b)=>{if(out.split(a).length!==2)throw Error('JH155_SPLIT_ANCHOR_CHANGED: '+a.slice(0,70));out=out.replace(a,b);};
  once('  async function jhSplitScreenJob56(type,payload,effect,secureToolName,waitMs=26000){',
    '  async function jhSplitScreenJob56(type,payload,effect,secureToolName,waitMs=26000){');
  once('    const taskDigest=sha56(\'jh-split-screen-assistant-v2|\'+type+\'|\'+JSON.stringify(payload));',
    "    const commandId=jhRequireCommand56(device);\n    const dispatch=async()=>{\n    const taskDigest=sha56('jh-split-screen-assistant-v2|'+type+'|'+JSON.stringify(payload));");
  once('    return {...result,jobDigest:sha56(j.id),taskDigest};',
    "    if(jhRequireCommand56(device)!==commandId)throw Error('split_command_changed');\n    if(type!=='split_screen_session_cancel' && result.ok===true){\n      let proof=jhInspectSplitEvidence155(result);\n      const readOnlyComfort=['split_comfort_status','split_comfort_manual_handoff',\n        'split_comfort_keyboard_advice','split_comfort_restore_info'].includes(type);\n      if(!proof.ok && proof.reason==='SPLIT_PROOF_REQUIRED' && readOnlyComfort){\n        const scopeJob=mk('agent_snapshot',{},device),scopeRead=await waitJob(scopeJob,25000);\n        if(jhRequireCommand56(device)!==commandId)throw Error('split_command_changed');\n        let scopeRows=null;try{scopeRows=JSON.parse(scopeRead?.result?.url);}catch{}\n        if(scopeRead?.status!=='complete'||scopeRead?.result?.ok!==true ||\n          scopeRead?.secureSessionId!==auth.sessionId || scopeRead?.targetDeviceId!==device ||\n          !Array.isArray(scopeRows))return {ok:false,code:'SPLIT_SCOPE_READBACK_UNCONFIRMED',resultVerified:false};\n        proof=jhInspectSplitEvidence155(scopeRead.result,scopeRows);\n        if(proof.ok)return {...result,scopeVerified:true,resultVerified:false,\n          jobDigest:sha56(j.id),taskDigest};\n      }\n      if(!proof.ok)return {ok:false,code:proof.reason,resultVerified:false};\n    }\n    return {...result,jobDigest:sha56(j.id),taskDigest};\n    };\n    return type==='split_screen_session_followup' ? jhSplitScreenOnce155(device,commandId,type,payload,dispatch) : dispatch();");
  once("      context_id:z.string().optional(),goal:z.string().optional(),", "      context_id:z.string().optional(),request_id:z.string().optional(),goal:z.string().optional(),");
  once("      contextId:args.context_id,command:args.command,targetItemRef:args.target_item_ref||'',\n      action:effectiveAction", "      contextId:args.context_id,requestId:args.request_id,command:args.command,targetItemRef:args.target_item_ref||'',\n      action:effectiveAction");
  once("    if(mode!=='FOLLOW_UP')return textResult({ok:false,code:'split_screen_mode_invalid'});", "    if(mode!=='FOLLOW_UP')return textResult({ok:false,code:'split_screen_mode_invalid'});\n    if(!/^[a-f0-9]{32}$/.test(args.request_id||''))return textResult({ok:false,code:'split_request_id_required'});");
  // Verify the same original ChatGPT pane in every signed workflow snapshot.
  once("      const packages=[...new Set(rows.map(x=>x?.package).filter(jhAndroidPackageName56))];", "      jhCheckWorkflowSplit56(w,result.result,rows,expectedPackage);\n      const packages=[...new Set(rows.map(x=>x?.package).filter(jhAndroidPackageName56))];");
  const late="    const packages=[...new Set(rows.map(x=>x?.package).filter(jhAndroidPackageName56))];";
  if(out.split(late).length!==4)throw Error('JH155_SPLIT_READBACK_COUNT');
  // The step has already been guarded. The other two paths reconcile existing receipts only.
  out=out.replaceAll(late,"    try{jhCheckWorkflowSplit56(w,j.result,rows,expectedPackage);}catch{return null;}\n"+late);
  // Replace the accidental step-level j variable receipt guard with its bound result.
  out=out.replace("      try{jhCheckWorkflowSplit56(w,j.result,rows,expectedPackage);}catch{return null;}\n",'');
  once('commandId:w.commandId??null,sessionId:w.sessionId,','commandId:w.commandId??null,splitChatWindowId:w.splitChatWindowId??null,splitChatPackage:w.splitChatPackage??null,sessionId:w.sessionId,');
  const anchor='  registerOAuthTool("life_status",{';
  once(anchor,helper+anchor);
  return 'const jhInspectSplitEvidence155='+inspectSplitEvidence.toString()+';\n'+out;
}
