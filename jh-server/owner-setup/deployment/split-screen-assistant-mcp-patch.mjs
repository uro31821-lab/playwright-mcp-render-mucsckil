/**
 * Server-side correlation facade for JH_SPLIT_SCREEN_ASSISTANT_V2.
 *
 * The facade reuses the existing Secure56 read/action authorities and the phone's existing
 * accessibility executor. It does not extend the Android secure catalog, grant approval remotely,
 * persist raw screen content, or infer completion from invocation.
 */
export const splitScreenAssistantInsertion56 = String.raw`
  async function jhSplitScreenJob56(type,payload,effect,secureToolName,waitMs=26000){
    const device=chooseDevice();const auth=device&&active56(device);
    if(!device||!auth||devices.get(device)?.secureBridgeVersion!==56)
      return {ok:false,code:'active_secure56_device_required'};
    const taskDigest=sha56('jh-split-screen-assistant-v2|'+type+'|'+JSON.stringify(payload));
    const targetDeviceDigest=devices.get(device)?.deviceDigest;
    if(!validHex56(targetDeviceDigest))return {ok:false,code:'split_screen_device_digest_unavailable'};
    const allowedAuthority=secureToolName==='life_android_capture_work_window'||
      secureToolName==='life_android_execute_computer_action';
    if(!allowedAuthority)return {ok:false,code:'split_screen_secure_authority_invalid'};
    const textPresent=['goal','summaryText','comparisonText','command','value','reason']
      .some(k=>typeof payload?.[k]==='string'&&payload[k].length>0);
    const signedPayload={...payload,mcpToolName:secureToolName,taskDigest,targetDeviceDigest,
      secureRequestedEffect:effect,secureInvocationExpiresAt:Date.now()+SECURE56_JOB_MS,
      containsCredential:false,dataClass:textPresent?'NON_SENSITIVE':'NONE'};
    const j=mk(type,signedPayload,device);
    if(j.targetDeviceId!==device||!j.secureSessionId||j.secureSessionId!==auth.sessionId||j.status!=='queued')
      return {ok:false,code:'split_screen_signed_dispatch_unavailable'};
    const completed=await waitJob(j,Math.min(Number(waitMs)||26000,43000));
    if(!completed||completed.status!=='complete')
      return {ok:false,code:completed?.error||'split_screen_device_result_unconfirmed'};
    const result=completed.result&&typeof completed.result==='object'?completed.result:
      {ok:false,code:'split_screen_device_result_invalid'};
    return {...result,jobDigest:sha56(j.id),taskDigest};
  }
  function jhSplitScreenLocalOnlyValue56(value){
    if(typeof value!=='string'||!value)return false;
    return /bearer\s+[a-z0-9._~+/=-]{8,}/i.test(value)||/\b(?:sk|rk|pk)-[a-z0-9_-]{8,}\b/i.test(value)||
      /(?<!\d)\d{6}-?\d{7}(?!\d)/.test(value)||/(?<!\d)(?:\d[ -]?){13,19}(?!\d)/.test(value)||
      /(?:otp|인증번호|보안코드|cvc|cvv|pin)\s*[:：]?\s*\d{3,8}/i.test(value);
  }
  function jhSplitScreenPayloadHasLocalOnly56(payload){
    return ['goal','summaryText','comparisonText','command','value','reason']
      .some(k=>jhSplitScreenLocalOnlyValue56(payload?.[k]));
  }
  function jhSplitScreenContextId56(value){return typeof value==='string'&&/^ssc_[a-f0-9]{32}$/.test(value);}
  function jhSplitScreenItemRef56(value){return value===undefined||value===null||value===''||
    (typeof value==='string'&&/^item_[a-f0-9]{16}$/.test(value));}
  function jhSplitScreenRefs56(value){return value===undefined||
    (Array.isArray(value)&&value.length<=20&&value.every(v=>jhSplitScreenItemRef56(v)&&v!==''));}

  registerOAuthTool('life_android_split_screen_assistant',{
    title:'JH 분할 화면 요약·연속 실행',
    description:'왼쪽 ChatGPT/JH와 오른쪽 외부 앱이 함께 보이는 분할 화면 전용 도구다. START는 오른쪽 화면을 자동으로 읽는다. 반환된 summarySource/items만 근거로 요약·정리하고 여러 선택지를 비교한 뒤 SAVE_ANALYSIS로 summary_text, comparison_text, recommended_item_ref를 같은 context_id에 묶는다. FOLLOW_UP은 “그것·2번·추천한 것·다음”을 같은 작업으로 이해한다. 일반 탐색·선택·비민감 입력은 별도 승인 없이 정확히 한 단계 실행한다. 실행 후 추가 화면을 자동으로 다시 읽어 resultVerified=true인 경우에만 이어서 판단한다. 결제·예약 확정·전송·삭제 등 정확한 현재 버튼에서만 휴대폰 로컬 1회 승인을 띄우며, 비밀번호·OTP·카드번호는 자동 입력하지 않는다. 목표가 끝나면 FINISH로 완료하고 결과를 왼쪽 GPT에 돌려준다. 자동 재생이나 원시 화면 저장은 없다.',
    inputSchema:{
      mode:z.enum(['START','SAVE_ANALYSIS','FOLLOW_UP','STATUS','FINISH','CANCEL']),
      context_id:z.string().optional(),goal:z.string().optional(),
      summary_text:z.string().optional(),comparison_text:z.string().optional(),
      compared_item_refs:z.array(z.string()).max(20).optional(),recommended_item_ref:z.string().optional(),
      command:z.string().optional(),target_item_ref:z.string().optional(),
      action:z.enum(['AUTO','ANSWER_ONLY','CLICK','SET_TEXT','BACK']).optional(),
      value:z.string().optional(),reason:z.string().optional()
    },
    annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false}
  },async(args)=>{
    const mode=args.mode;
    if(mode==='START'){
      if(args.context_id||args.summary_text||args.command||args.value)
        return textResult({ok:false,code:'start_accepts_no_previous_context'});
      if(args.goal!==undefined&&(typeof args.goal!=='string'||args.goal.length>2000))
        return textResult({ok:false,code:'split_screen_goal_invalid'});
      const workflowId='jh_split_'+randomBytes(16).toString('hex');
      const startPayload={workflowId,...(args.goal===undefined?{}:{goal:args.goal})};
      if(jhSplitScreenPayloadHasLocalOnly56(startPayload))
        return textResult({ok:false,code:'split_screen_local_input_required',localInputRequired:true,automaticReplay:false});
      return textResult(await jhSplitScreenJob56('split_screen_session_start',
        startPayload,'READ_ONLY','life_android_capture_work_window'));
    }
    if(!jhSplitScreenContextId56(args.context_id))return textResult({ok:false,code:'split_screen_context_id_required'});
    if(!jhSplitScreenItemRef56(args.recommended_item_ref)||!jhSplitScreenItemRef56(args.target_item_ref)||
       !jhSplitScreenRefs56(args.compared_item_refs))
      return textResult({ok:false,code:'split_screen_item_ref_invalid'});
    if(mode==='SAVE_ANALYSIS'){
      if(typeof args.summary_text!=='string'||args.summary_text.trim().length<1||args.summary_text.length>4000)
        return textResult({ok:false,code:'split_screen_summary_required'});
      if(args.comparison_text!==undefined&&(typeof args.comparison_text!=='string'||args.comparison_text.trim().length<1||args.comparison_text.length>4000))
        return textResult({ok:false,code:'split_screen_comparison_invalid'});
      if(args.goal!==undefined&&(typeof args.goal!=='string'||args.goal.length>2000))
        return textResult({ok:false,code:'split_screen_goal_invalid'});
      const analysisPayload={
        contextId:args.context_id,summaryText:args.summary_text,
        ...(args.comparison_text===undefined?{}:{comparisonText:args.comparison_text}),
        comparedItemRefs:args.compared_item_refs||[],recommendedItemRef:args.recommended_item_ref||'',
        ...(args.goal===undefined?{}:{goal:args.goal})
      };
      if(jhSplitScreenPayloadHasLocalOnly56(analysisPayload))
        return textResult({ok:false,code:'split_screen_local_input_required',localInputRequired:true,automaticReplay:false});
      return textResult(await jhSplitScreenJob56('split_screen_session_save_analysis',analysisPayload,
        'REVERSIBLE_WRITE','life_android_execute_computer_action'));
    }
    if(mode==='STATUS')return textResult(await jhSplitScreenJob56('split_screen_session_status',
      {contextId:args.context_id},'READ_ONLY','life_android_capture_work_window'));
    if(mode==='FINISH'){
      const finishPayload={contextId:args.context_id,reason:typeof args.reason==='string'?args.reason.slice(0,80):'goal_completed'};
      if(jhSplitScreenPayloadHasLocalOnly56(finishPayload))
        return textResult({ok:false,code:'split_screen_local_input_required',localInputRequired:true,automaticReplay:false});
      return textResult(await jhSplitScreenJob56('split_screen_session_finish',finishPayload,
        'REVERSIBLE_WRITE','life_android_execute_computer_action'));
    }
    if(mode==='CANCEL'){
      const cancelPayload={contextId:args.context_id,reason:typeof args.reason==='string'?args.reason.slice(0,80):'explicit_cancel'};
      if(jhSplitScreenPayloadHasLocalOnly56(cancelPayload))
        return textResult({ok:false,code:'split_screen_local_input_required',localInputRequired:true,automaticReplay:false});
      return textResult(await jhSplitScreenJob56('split_screen_session_cancel',cancelPayload,
        'REVERSIBLE_WRITE','life_android_execute_computer_action'));
    }
    if(mode!=='FOLLOW_UP')return textResult({ok:false,code:'split_screen_mode_invalid'});
    if(typeof args.command!=='string'||args.command.trim().length<1||args.command.length>2000)
      return textResult({ok:false,code:'split_screen_command_required'});
    if(args.value!==undefined&&(typeof args.value!=='string'||args.value.length>2000))
      return textResult({ok:false,code:'split_screen_value_invalid'});
    const effectiveAction=args.value===undefined?(args.action||'AUTO'):'SET_TEXT';
    const followPayload={
      contextId:args.context_id,command:args.command,targetItemRef:args.target_item_ref||'',
      action:effectiveAction,...(args.value===undefined?{}:{value:args.value})
    };
    if(jhSplitScreenPayloadHasLocalOnly56(followPayload))
      return textResult({ok:false,code:'split_screen_local_input_required',localInputRequired:true,automaticReplay:false});
    if(args.value!==undefined){
      const preflight=await jhSplitScreenJob56('split_screen_session_input_preflight',{
        contextId:args.context_id,command:args.command,targetItemRef:args.target_item_ref||'',action:'SET_TEXT'
      },'READ_ONLY','life_android_capture_work_window',26000);
      if(preflight?.inputAllowed!==true||typeof preflight?.inputGrantToken!=='string')return textResult(preflight);
      followPayload.inputGrantToken=preflight.inputGrantToken;
    }
    return textResult(await jhSplitScreenJob56('split_screen_session_followup',followPayload,
      'REVERSIBLE_WRITE','life_android_execute_computer_action',43000));
  });

`;

export function patchSplitScreenAssistant56(source) {
  if(typeof source!=='string')throw Error('split_screen_source_required');
  const anchor='  registerOAuthTool("life_status",{';
  if(source.split(anchor).length!==2||source.includes("registerOAuthTool('life_android_split_screen_assistant'")||
      source.includes('jhSplitScreenJob56'))throw Error('split_screen_runtime_anchor_changed');
  const next=source.replace(anchor,splitScreenAssistantInsertion56+anchor);
  if(next.replace(splitScreenAssistantInsertion56+anchor,anchor)!==source)throw Error('split_screen_patch_scope_mismatch');
  return next;
}
