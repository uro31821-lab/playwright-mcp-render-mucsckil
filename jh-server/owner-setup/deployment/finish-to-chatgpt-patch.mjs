// JH153 finalizer composed after command, restart and result-verification guards.
const finalizer=String.raw`  // Finalizer for the common JH mobile flow: first obtain a signed, read-only
  // result-screen observation, then ask the phone to return to the ORIGINAL
  // ChatGPT window captured before departure, and independently verify ChatGPT
  // foreground with a second signed snapshot. The phone performs no replay and
  // the tool does not infer task completion on its own; callers use it only after
  // the task's result screen is ready for final verification.
  registerOAuthTool('life_android_finish_to_chatgpt',{
    title:'Verify result and return to original ChatGPT',
    description:'Final Android workflow step. Verifies the current external-app result screen, automatically returns to the original ChatGPT window captured before departure, then independently screen-verifies ChatGPT. No replay, payment approval bypass, or conversation-content claim.',
    inputSchema:{},
    annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false}
  },async()=>{
    const device=chooseDevice();const auth=device&&active56(device);
    if(!device||!auth||devices.get(device)?.secureBridgeVersion!==56)
      return textResult({ok:false,code:'active_secure56_device_required'});
    const commandId=jhRequireCommand56(device);
    const processEpochAtStart=devices.get(device)?.processEpoch;
    if(!processEpochAtStart)return textResult({ok:false,code:'workflow_process_epoch_required'});
    for(const [k,v] of jhMcpWorkflows56)if(Date.now()>=v.expiresAt)jhMcpWorkflows56.delete(k);
    if(jhMcpWorkflows56.size>=8)return textResult({ok:false,code:'workflow_capacity_no_replay'});
    if(process.env.JH_PAYMENT_ENABLED==='1')jhGetPaymentService().final.guardBrowser('finish_to_chatgpt');
    const id='jh_mcp_'+randomBytes(16).toString('hex');
    const plan=sha56('jh-finish-original-chatgpt-v1|'+id+'|'+sha56(device));
    const w={id,plan,device,commandId,processEpochAtStart,sessionId:auth.sessionId,trustId:auth.trustId,ownerDigest:auth.ownerDigest,secureDeviceDigest:auth.deviceDigest,createdAt:Date.now(),
      expiresAt:Date.now()+jhWorkflowTtl56,phase:'RUNNING',initialPackage:null,lastPackage:null,jobs:[]};
    jhMcpWorkflows56.set(id,w);jhPersistWorkflows56();
    try{
      jhRequireResultWorkflow56(w);
      const resultPackage=await jhWorkflowStep56(w,'result_screen','agent_snapshot',
        {autoReturnOriginalChatgpt:true},null,'RESULT_WITH_OPTIONAL_CHAT');
      if(resultPackage==='com.openai.chatgpt')
        return textResult({ok:false,code:'external_result_screen_required',resultPackage,...jhWorkflowView56(w)});
      jhRequireResultWorkflow56(w);
      const chatPackage=await jhWorkflowStep56(w,'chatgpt_screen','agent_snapshot',{},
        'com.openai.chatgpt','CHATGPT_FOCUSED_WITH_OPTIONAL_COMPANION');
      jhRequireResultWorkflow56(w);w.phase='VERIFIED';jhPersistWorkflows56();
      return textResult({ok:true,code:'RESULT_VERIFIED_AND_ORIGINAL_CHATGPT_RETURNED',
        payment_verified:false,provider_readback_required:true,resultScreenObserved:true,resultPackage,chatPackage,originWindowVerified:true,conversationVerified:false,
        pageOrScrollRestored:false,...jhWorkflowView56(w)});
    }catch(e){
      if(jhMcpWorkflows56.get(w.id)!==w)return textResult({ok:false,code:'site_switch_discarded'});
      if(w.phase==='ABORTED_BY_TERMINATION')return textResult({ok:false,code:'workflow_aborted_by_termination_no_replay'});
      w.phase='NEEDS_REVIEW';jhPersistWorkflows56();
      return textResult({ok:false,code:String(e?.message||'finish_to_chatgpt_unconfirmed'),
        originWindowVerified:false,conversationVerified:false,pageOrScrollRestored:false,...jhWorkflowView56(w)});
    }
  });
`;
const screenModes=String.raw`      if(screenMode==='RESULT_WITH_OPTIONAL_CHAT'){
        const external=packages.filter(x=>x!=='com.openai.chatgpt');
        if(external.length!==1||packages.length>2||(expectedPackage&&external[0]!==expectedPackage)){
          log.code='RESULT_SCREEN_NOT_UNAMBIGUOUS';jhPersistWorkflows56();throw Error('workflow_result_screen_readback_mismatch');
        }
        w.lastPackage=external[0];log.code='RESULT_SCREEN_READBACK_VERIFIED';jhPersistWorkflows56();return external[0];
      }
      if(screenMode==='CHATGPT_FOCUSED_WITH_OPTIONAL_COMPANION'){
        const chatFocused=rows.some(x=>x?.package==='com.openai.chatgpt'&&(x?.focused===true||x?.focused==='true'));
        if(!packages.includes('com.openai.chatgpt')||packages.length>2||!chatFocused){
          log.code='CHATGPT_FOREGROUND_NOT_VERIFIED';jhPersistWorkflows56();throw Error('workflow_chatgpt_foreground_mismatch');
        }
        w.lastPackage='com.openai.chatgpt';log.code='CHATGPT_FOREGROUND_VERIFIED';jhPersistWorkflows56();return 'com.openai.chatgpt';
      }
`;
export function patchFinishToChatgpt56(source){
 const oldSignature='async function jhWorkflowStep56(w,stepId,type,payload,expectedPackage=null){';
 const newSignature="async function jhWorkflowStep56(w,stepId,type,payload,expectedPackage=null,screenMode='SINGLE'){";
 const screenAnchor='      if(packages.length!==1||(expectedPackage&&packages[0]!==expectedPackage)){';
 const toolAnchor='  registerOAuthTool("life_status",{';
 if(source.includes("registerOAuthTool('life_android_finish_to_chatgpt'"))throw Error('finish_already_integrated');
 for(const a of [oldSignature,screenAnchor,toolAnchor])if(source.split(a).length!==2)throw Error('finish_anchor_changed');
 const output=source.replace(oldSignature,newSignature).replace(screenAnchor,screenModes+screenAnchor).replace(toolAnchor,finalizer+toolAnchor);
 if(output.replace(newSignature,oldSignature).replace(screenModes+screenAnchor,screenAnchor).replace(finalizer+toolAnchor,toolAnchor)!==source)throw Error('finish_patch_scope_changed');
 return output;
}
