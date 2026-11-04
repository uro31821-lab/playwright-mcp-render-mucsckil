/**
 * Stage61 source patch for the already-generated JH mobile runtime.
 * It does not install another browser/phone engine. It binds the existing
 * Android Web and Computer Use handlers to one server-owned Stage61 route
 * token and original Secure56 phone receipts. Playwright Mobile remains only
 * a reported targeted gap; this patch never silently invokes it.
 */
const fail=code=>{throw Object.assign(Error(code),{code});};
const once=(source,before,after,code)=>{
 if(typeof source!=='string'||source.split(before).length!==2||source.includes(after))fail(code);
 const out=source.replace(before,after);
 if(out.replace(after,before)!==source)fail(code+'_REVERSAL');
 return out;
};

const IMPORT='import {createStage61HostAdapter} from "../jh168-mobile-unification/stage61-right-pane-host-adapter.mjs";\n';

const PRESS_KEY_OLD=String.raw`  registerOAuthTool("life_web_press_key",{
    title:"Supported RIGHT-pane navigation key",
    description:"Only explicit Android BACK is currently bridged. Enter, Tab, Escape, Arrow keys require verified native action contracts and never silently use server Playwright.",
    inputSchema:{key:z.string(),context_id:z.string().optional(),request_id:z.string().optional()}
  },async(args)=>{
    if(!["BACK","AndroidBack"].includes(args.key))
      return jhMobileWebReject56("MOBILE_KEY_NOT_VERIFIED",{requestedKey:args.key});
    return jhMobileWebFollow56(args,"BACK","오른쪽 화면에서 Android 뒤로 가기 1회");
  });`;
const PRESS_KEY_NEW=String.raw`  registerOAuthTool("life_web_press_key",{
    title:"Supported RIGHT-pane navigation key",
    description:"Android BACK stays on the existing signed mobile path. Enter and Tab use the existing Stage61 Android Computer Use KEYPRESS path. Escape and Arrow keys remain unsupported; server Playwright is never used as a fallback.",
    inputSchema:{key:z.string(),context_id:z.string().optional(),request_id:z.string().optional()}
  },async(args)=>{
    if(["BACK","AndroidBack"].includes(args.key))
      return jhMobileWebFollow56(args,"BACK","오른쪽 화면에서 Android 뒤로 가기 1회");
    const key=String(args.key||"").toUpperCase();
    if(!["ENTER","TAB"].includes(key))
      return jhMobileWebReject56("MOBILE_KEY_NOT_VERIFIED",{requestedKey:args.key});
    return jhStage61Keypress56(args,key);
  });`;

const HELPER=String.raw`
  // Stage61: server-owned route state over ORIGINAL Secure56 phone results.
  const jhStage61OriginalResult56=new Map();
  const jhStage61ContextRoute56=new Map();
  const jhStage61ContextTask56=new Map();
  const jhStage61TaskRoute56=new Map();
  const jhStage61Host56=createStage61HostAdapter({
    readOriginalSignedResult:async ref=>jhStage61OriginalResult56.get(ref)
  });
  function jhStage61SaveOriginal56(result){
    const ref="s61r_"+token56(24);jhStage61OriginalResult56.set(ref,result);
    while(jhStage61OriginalResult56.size>64)jhStage61OriginalResult56.delete(jhStage61OriginalResult56.keys().next().value);
    return ref;
  }
  function jhStage61Arg56(args,...names){
    for(const name of names){const value=args?.[name];if(value!==undefined&&value!==null&&String(value)!=="")return value;}
    return null;
  }
  function jhStage61Reply56(reply){
    const raw=reply?.content?.find(v=>v?.type==="text"&&typeof v.text==="string")?.text;
    if(typeof raw!=="string")return null;
    try{return JSON.parse(raw);}catch{return null;}
  }
  async function jhStage61Keypress56(args,key){
    const contextId=String(args?.context_id||"");
    const routeToken=String(jhStage61ContextRoute56.get(contextId)||"");
    const taskDigest=String(jhStage61ContextTask56.get(contextId)||"");
    if(!routeToken||!/^[a-f0-9]{64}$/.test(taskDigest))
      return textResult({ok:false,route:"android_right",code:"STAGE61_KEYPRESS_CONTEXT_TASK_REQUIRED",automaticReplay:false});
    const common={task_digest:taskDigest,stage61_route_token:routeToken,effect:"REVERSIBLE_WRITE",
      action:"KEYPRESS",keys:[key],data_class:"NONE",max_actions_in_call:1};
    const inspectReply=await secureCall56("life_android_computer_inspect","computer_use_inspect","READ_ONLY",common);
    const inspected=jhStage61Reply56(inspectReply);
    if(!inspected||inspected.ok!==true||inspected.code!=="keypress_target_ready")return inspectReply;
    const prepareReply=await secureCall56("life_android_computer_prepare","computer_use_action_prepare","READ_ONLY",common,
      {screenConsentDigest:"",localActionApprovalDigest:""});
    const prepared=jhStage61Reply56(prepareReply);
    if(!prepared||prepared.ok!==true)return prepareReply;
    const lease=String(prepared.leaseToken||prepared.lease_token||"");
    if(prepared.requiresFreshApproval!==false||lease.length<12)
      return textResult({...prepared,ok:false,route:"android_right",
        code:"MOBILE_KEYPRESS_APPROVAL_REQUIRED_OR_UNCONFIRMED",requestedKey:key,taskDigest,automaticReplay:false});
    return secureCall56("life_android_execute_computer_action","computer_use_action_execute","MUTATION",
      {...common,lease_token:lease},{leaseToken:lease,localActionApprovalDigest:""});
  }
  function jhStage61WebAction56(action,command){
    if(action==="SET_TEXT")return "TYPE";if(action==="BACK")return "BACK";
    const s=String(command||"");
    if(/선택 메뉴 열기|select menu open/i.test(s))return "SELECT_OPEN";
    if(/옵션 선택|select option/i.test(s))return "SELECT_PICK";
    return "CLICK";
  }
  function jhStage61Control56(mcpToolName){
    return ({
      life_android_action_approval_request:"ACTION_APPROVAL_REQUEST",
      life_android_action_approval_status:"ACTION_APPROVAL_STATUS",
      life_android_screen_consent_request:"SCREEN_CONSENT_REQUEST",
      life_android_screen_consent_status:"SCREEN_CONSENT_STATUS",
      life_android_capture_work_window:"CAPTURE_FRAME"
    })[mcpToolName]||null;
  }
  function jhStage61ComputerAction56(args,inspect=false,control=null){
    if(inspect||["SCREEN_CONSENT_REQUEST","SCREEN_CONSENT_STATUS","CAPTURE_FRAME"].includes(control))return "READ_ONLY_INSPECT";
    const a=String(args?.action||"").toUpperCase();
    if(["SCROLL","DRAG"].includes(a))return "SCROLL";
    if(a==="TYPE")return "TYPE";if(a==="KEYPRESS")return "KEYPRESS_ENTER_TAB";
    if(["WAIT","MOVE","SCREENSHOT"].includes(a))return "READ_ONLY_INSPECT";
    return "NATIVE_APP_ACTION";
  }
  async function jhStage61BeginRead56(result){
    const state=await jhStage61Host56.begin({originalReceiptRef:jhStage61SaveOriginal56(result)});
    if(state.ok!==true)return {...result,stage61RouterHost:state};
    const contextId=String(result?.contextId||result?.context_id||"");
    const validContext=/^ssc_[a-f0-9]{32}$/.test(contextId);
    if(validContext)jhStage61ContextRoute56.set(contextId,state.routeToken);
    const taskDigest=String(result?.taskDigest||result?.task_digest||"");
    if(/^[a-f0-9]{64}$/.test(taskDigest)){
      jhStage61TaskRoute56.set(taskDigest,state.routeToken);
      if(validContext)jhStage61ContextTask56.set(contextId,taskDigest);
      while(jhStage61TaskRoute56.size>64)jhStage61TaskRoute56.delete(jhStage61TaskRoute56.keys().next().value);
      while(jhStage61ContextTask56.size>64)jhStage61ContextTask56.delete(jhStage61ContextTask56.keys().next().value);
    }
    return {...result,stage61RouteToken:state.routeToken,stage61RouterHost:state,
      stage61NextProvider:"ANDROID_WEB",automaticReplay:false};
  }
  async function jhStage61ReadStatus56(result,contextId){
    const routeToken=jhStage61ContextRoute56.get(contextId);
    if(!routeToken)return {...result,stage61RouterHost:{ok:false,code:"STAGE61_ROUTE_STATE_NOT_FOUND",automaticReplay:false}};
    const record=await jhStage61Host56.record({routeToken,originalReceiptRef:jhStage61SaveOriginal56(result),
      expectedProvider:"ANDROID_WEB",expectedAction:"SNAPSHOT",terminal:false});
    return {...result,stage61RouteToken:routeToken,stage61RouterHost:record,automaticReplay:false};
  }
  async function jhStage61BeforeWeb56(args,payload,action,command){
    const routeToken=jhStage61ContextRoute56.get(String(args?.context_id||""));
    if(!routeToken)return {ok:false,code:"STAGE61_ROUTE_STATE_NOT_FOUND",automaticReplay:false};
    const stageAction=jhStage61WebAction56(action,command);
    const plan=jhStage61Host56.plan({routeToken,action:stageAction});
    if(plan.ok!==true||plan.provider!=="ANDROID_WEB"||plan.allowed!==true)
      return {ok:false,code:plan.code||"STAGE61_ANDROID_WEB_NOT_AUTHORIZED",provider:plan.provider,automaticReplay:false};
    const phone=jhStage61Host56.phonePayload({routeToken,action:stageAction,provider:"ANDROID_WEB"});
    if(phone.ok!==true)return phone;
    Object.assign(payload,{
      stage61RouteSchema:phone.stage61RouteSchema,
      stage61Action:phone.stage61Action,
      stage61WebOutcome:phone.stage61WebOutcome,
      stage61ComputerOutcome:phone.stage61ComputerOutcome,
      stage61PlaywrightMobileAvailable:phone.stage61PlaywrightMobileAvailable
    });
    return {ok:true,routeToken,stageAction};
  }
  async function jhStage61AfterAction56(result,routeToken,provider,action,terminal=true){
    const record=await jhStage61Host56.record({routeToken,originalReceiptRef:jhStage61SaveOriginal56(result),
      expectedProvider:provider,expectedAction:action,terminal});
    const next=record.ok===true&&!record.stopped
      ?jhStage61Host56.plan({routeToken,action,playwrightMobileAvailable:false})
      :{provider:"STOP_NO_REPLAY",code:record.code||"STAGE61_ROUTE_STATE_STOPPED",allowed:false};
    return {...result,stage61RouteToken:routeToken,stage61RouterHost:record,
      stage61NextProvider:next.provider,stage61NextCode:next.code,automaticReplay:false};
  }
  function jhStage61PrepareComputer56(args,mcpToolName){
    const explicitRouteToken=String(args?.stage61_route_token||"");
    const taskId=String(jhStage61Arg56(args,"task_id","task_digest","taskId")||"");
    const taskRouteToken=/^[a-f0-9]{64}$/.test(taskId)?String(jhStage61TaskRoute56.get(taskId)||""):"";
    if(explicitRouteToken&&taskRouteToken&&explicitRouteToken!==taskRouteToken)
      return {ok:false,result:{ok:false,code:"STAGE61_ROUTE_TASK_BINDING_MISMATCH",automaticReplay:false}};
    const routeToken=explicitRouteToken||taskRouteToken;
    if(!routeToken)return {ok:true,args};
    const control=jhStage61Control56(mcpToolName);
    const inspect=mcpToolName==="life_android_computer_inspect";
    const stageAction=jhStage61ComputerAction56(args,inspect,control);
    const plan=jhStage61Host56.plan({routeToken,action:stageAction});
    if(plan.ok!==true||plan.provider!=="ANDROID_COMPUTER_USE"||plan.allowed!==true)
      return {ok:false,result:{ok:false,code:plan.code||"STAGE61_COMPUTER_USE_NOT_AUTHORIZED",automaticReplay:false}};
    const requestToken=String(jhStage61Arg56(args,"request_token","requestToken")||"");
    const actionGrantToken=String(jhStage61Arg56(args,"action_approval_grant_token","actionApprovalGrantToken")||"");
    const screenGrantToken=String(jhStage61Arg56(args,"screen_grant_token","screenGrantToken")||"");
    if(control){
      const gate=jhStage61Host56.controlPlan({routeToken,control,action:stageAction,taskId,
        requestToken,grantToken:control==="CAPTURE_FRAME"?screenGrantToken:actionGrantToken});
      if(gate.ok!==true)return {ok:false,result:gate};
    }else if(mcpToolName==="life_android_computer_prepare"||mcpToolName==="life_android_execute_computer_action"){
      const grantGate=jhStage61Host56.approvalUsePlan({routeToken,action:stageAction,taskId,grantToken:actionGrantToken});
      if(grantGate.ok!==true)return {ok:false,result:grantGate};
    }
    const phone=jhStage61Host56.phonePayload({routeToken,action:stageAction,provider:"ANDROID_COMPUTER_USE"});
    if(phone.ok!==true)return {ok:false,result:phone};
    return {ok:true,args:{...args,...phone},routeToken,stageAction,control,taskId,requestToken,
      grantToken:control==="CAPTURE_FRAME"?screenGrantToken:actionGrantToken,
      terminal:mcpToolName==="life_android_execute_computer_action"};
  }
  async function jhStage61FinishComputer56(job,prepared){
    if(!prepared?.routeToken)return secureResult56(job);
    const result=job?.result;
    if(!result||typeof result!=="object")return secureResult56(job);
    if(prepared.control){
      const controlRecord=await jhStage61Host56.recordControl({routeToken:prepared.routeToken,
        control:prepared.control,originalReceiptRef:jhStage61SaveOriginal56(result),action:prepared.stageAction,
        taskId:prepared.taskId,requestToken:prepared.requestToken,grantToken:prepared.grantToken});
      return textResult({...result,stage61RouteToken:prepared.routeToken,
        stage61ApprovalHost:controlRecord,automaticReplay:false});
    }
    const routed=await jhStage61AfterAction56(result,prepared.routeToken,
      "ANDROID_COMPUTER_USE",prepared.stageAction,prepared.terminal);
    return textResult(routed);
  }
`;

export function patchStage61MobileRuntime56(source){
 if(typeof source!=='string'||!source.includes('async function jhMobileWebFollow56(')||
    !source.includes('async function jhMobileWebRead56(')||!source.includes('function secureCall56(')||
    !source.includes('const cuSchema56={'))fail('STAGE61_MOBILE_RUNTIME_PREREQUISITES_MISSING');
 let out=source;
 if(!out.startsWith(IMPORT))out=IMPORT+out;
 out=once(out,'function secureCall56(',HELPER+'\nfunction secureCall56(','STAGE61_HELPER_ANCHOR');
 out=once(out,
  '    const payload={contextId:bound.contextId,requestId,command,targetItemRef:bound.itemRef,action};',
  '    const payload={contextId:bound.contextId,requestId,command,targetItemRef:bound.itemRef,action};\n    const stage61=await jhStage61BeforeWeb56(args,payload,action,command);\n    if(stage61.ok!==true)return textResult({route:"android_right",...stage61});',
  'STAGE61_WEB_PREFLIGHT_ANCHOR');
 out=once(out,
  '    return textResult({route:"android_right",automaticReplay:false,...result,\n      ...(action==="BACK"?{browserHistoryNavigationVerified:false}:{} )});',
  '    const routed=await jhStage61AfterAction56(result,stage61.routeToken,"ANDROID_WEB",stage61.stageAction,true);\n    return textResult({route:"android_right",automaticReplay:false,...routed,\n      ...(action==="BACK"?{browserHistoryNavigationVerified:false}:{} )});',
  'STAGE61_WEB_RESULT_ANCHOR');
 out=once(out,
  '      return textResult({route:"android_right",automaticReplay:false,...result});\n    }\n    if(args.goal!==undefined',
  '      return textResult({route:"android_right",automaticReplay:false,...await jhStage61ReadStatus56(result,args.context_id)});\n    }\n    if(args.goal!==undefined',
  'STAGE61_STATUS_RESULT_ANCHOR');
 out=once(out,
  '    return textResult({route:"android_right",automaticReplay:false,...result});\n  }\n\n  registerOAuthTool("life_web_navigate",{',
  '    return textResult({route:"android_right",automaticReplay:false,...await jhStage61BeginRead56(result)});\n  }\n\n  registerOAuthTool("life_web_navigate",{',
  'STAGE61_START_RESULT_ANCHOR');
 out=once(out,PRESS_KEY_OLD,PRESS_KEY_NEW,'STAGE61_KEYPRESS_HANDLER_ANCHOR');
 out=once(out,'const cuSchema56={','const cuSchema56={stage61_route_token:z.string().optional(),','STAGE61_CU_SCHEMA_ANCHOR');
 const currentHeadOld='function secureCall56(mcpToolName,jobType,effect,args,extra={}){\n  const x=exactEnvelope56(mcpToolName,jobType,effect,args,extra);';
 const currentHeadNew='function secureCall56(mcpToolName,jobType,effect,args,extra={}){\n  const stage61=jhStage61PrepareComputer56(args,mcpToolName);\n  if(stage61.ok!==true)return Promise.resolve(textResult(stage61.result));\n  const x=exactEnvelope56(mcpToolName,jobType,effect,stage61.args,extra);';
 const deviceHeadOld='function secureCall56(device,mcpToolName,args={}){\n    if(device?.error)return Promise.resolve(textResult(device));\n    const x=exactEnvelope56(device,mcpToolName,args);';
 const deviceHeadNew='function secureCall56(device,mcpToolName,args={}){\n    if(device?.error)return Promise.resolve(textResult(device));\n    const stage61=jhStage61PrepareComputer56(args,mcpToolName);\n    if(stage61.ok!==true)return Promise.resolve(textResult(stage61.result));\n    const x=exactEnvelope56(device,mcpToolName,stage61.args);';
 const heads=[[currentHeadOld,currentHeadNew],[deviceHeadOld,deviceHeadNew]];
 const headMatch=heads.filter(([before,after])=>out.split(before).length===2&&!out.includes(after));
 if(headMatch.length!==1)fail('STAGE61_SECURE_CALL_HEAD_ANCHOR');
 out=once(out,headMatch[0][0],headMatch[0][1],'STAGE61_SECURE_CALL_HEAD_ANCHOR');

 const currentDirectOld='  return waitJob(x.job,15000).then(secureResult56);';
 const currentDirectNew='  return waitJob(x.job,15000).then(job=>jhStage61FinishComputer56(job,stage61));';
 const currentPendingOld='    if(!j||!["queued","in_progress"].includes(j.status))return secureResult56(j);';
 const currentPendingNew='    if(!j||!["queued","in_progress"].includes(j.status))return jhStage61FinishComputer56(j,stage61);';
 const deviceDirectOld='    return waitJob(j,x.waitMs).then(secureResult56);';
 const deviceDirectNew='    return waitJob(j,x.waitMs).then(job=>jhStage61FinishComputer56(job,stage61));';
 const completions=[
  [currentDirectOld,currentDirectNew],
  [currentPendingOld,currentPendingNew],
  [deviceDirectOld,deviceDirectNew]
 ];
 const completionMatch=completions.filter(([before,after])=>out.split(before).length===2&&!out.includes(after));
 if(completionMatch.length!==1)fail('STAGE61_SECURE_CALL_COMPLETION_ANCHOR');
 out=once(out,completionMatch[0][0],completionMatch[0][1],'STAGE61_SECURE_CALL_COMPLETION_ANCHOR');
 return out;
}

export function reverseStage61MobileRuntime56(source){
 let out=source;
 out=once(out,PRESS_KEY_NEW,PRESS_KEY_OLD,'STAGE61_KEYPRESS_HANDLER_REVERSE_ANCHOR');
 const currentHeadOld='function secureCall56(mcpToolName,jobType,effect,args,extra={}){\n  const x=exactEnvelope56(mcpToolName,jobType,effect,args,extra);';
 const currentHeadNew='function secureCall56(mcpToolName,jobType,effect,args,extra={}){\n  const stage61=jhStage61PrepareComputer56(args,mcpToolName);\n  if(stage61.ok!==true)return Promise.resolve(textResult(stage61.result));\n  const x=exactEnvelope56(mcpToolName,jobType,effect,stage61.args,extra);';
 const deviceHeadOld='function secureCall56(device,mcpToolName,args={}){\n    if(device?.error)return Promise.resolve(textResult(device));\n    const x=exactEnvelope56(device,mcpToolName,args);';
 const deviceHeadNew='function secureCall56(device,mcpToolName,args={}){\n    if(device?.error)return Promise.resolve(textResult(device));\n    const stage61=jhStage61PrepareComputer56(args,mcpToolName);\n    if(stage61.ok!==true)return Promise.resolve(textResult(stage61.result));\n    const x=exactEnvelope56(device,mcpToolName,stage61.args);';
 const reverseHeads=[[currentHeadNew,currentHeadOld],[deviceHeadNew,deviceHeadOld]];
 const reverseHead=reverseHeads.filter(([before])=>out.split(before).length===2);
 if(reverseHead.length!==1)fail('STAGE61_SECURE_CALL_HEAD_REVERSE_ANCHOR');
 out=out.replace(reverseHead[0][0],reverseHead[0][1]);

 const currentDirectOld='  return waitJob(x.job,15000).then(secureResult56);';
 const currentDirectNew='  return waitJob(x.job,15000).then(job=>jhStage61FinishComputer56(job,stage61));';
 const currentPendingOld='    if(!j||!["queued","in_progress"].includes(j.status))return secureResult56(j);';
 const currentPendingNew='    if(!j||!["queued","in_progress"].includes(j.status))return jhStage61FinishComputer56(j,stage61);';
 const deviceDirectOld='    return waitJob(j,x.waitMs).then(secureResult56);';
 const deviceDirectNew='    return waitJob(j,x.waitMs).then(job=>jhStage61FinishComputer56(job,stage61));';
 const reverseCompletions=[
  [currentDirectNew,currentDirectOld],
  [currentPendingNew,currentPendingOld],
  [deviceDirectNew,deviceDirectOld]
 ];
 const reverseCompletion=reverseCompletions.filter(([before])=>out.split(before).length===2);
 if(reverseCompletion.length!==1)fail('STAGE61_SECURE_CALL_COMPLETION_REVERSE_ANCHOR');
 out=out.replace(reverseCompletion[0][0],reverseCompletion[0][1]);
 out=out.replace('const cuSchema56={stage61_route_token:z.string().optional(),','const cuSchema56={')
  .replace('    return textResult({route:"android_right",automaticReplay:false,...await jhStage61BeginRead56(result)});','    return textResult({route:"android_right",automaticReplay:false,...result});')
  .replace('      return textResult({route:"android_right",automaticReplay:false,...await jhStage61ReadStatus56(result,args.context_id)});','      return textResult({route:"android_right",automaticReplay:false,...result});')
  .replace('    const routed=await jhStage61AfterAction56(result,stage61.routeToken,"ANDROID_WEB",stage61.stageAction,true);\n    return textResult({route:"android_right",automaticReplay:false,...routed,','    return textResult({route:"android_right",automaticReplay:false,...result,')
  .replace('    const payload={contextId:bound.contextId,requestId,command,targetItemRef:bound.itemRef,action};\n    const stage61=await jhStage61BeforeWeb56(args,payload,action,command);\n    if(stage61.ok!==true)return textResult({route:"android_right",...stage61});','    const payload={contextId:bound.contextId,requestId,command,targetItemRef:bound.itemRef,action};')
  .replace(HELPER+'\nfunction secureCall56(','function secureCall56(');
 if(out.startsWith(IMPORT))out=out.slice(IMPORT.length);
 return out;
}