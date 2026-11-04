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
const OWNER_PICK_BEFORE='      beforeDispatch:({record,firstAttempt})=>jhOwnerAdmission155(device,commandId,record,firstAttempt),';
const OWNER_PICK_AFTER='      beforeDispatch:({record,firstAttempt})=>jhStage61OwnerAdmission56(device,commandId,record,firstAttempt,payload),';
const HELPER=String.raw`
  // Stage61: server-owned route state over ORIGINAL Secure56 phone results.
  const jhStage61OriginalResult56=new Map();
  const jhStage61ContextRoute56=new Map();
  const jhStage61TaskRoute56=new Map();
  const jhStage61PreparedPick56=new Map();
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
  function jhStage61WebAction56(action,command){
    if(action==="SET_TEXT")return "TYPE";if(action==="BACK")return "BACK";
    const s=String(command||"");
    if(/선택 메뉴 열기|select menu open/i.test(s))return "SELECT_OPEN";
    if(/옵션 선택|select option/i.test(s))return "SELECT_PICK";
    return "CLICK";
  }
  function jhStage61OwnerNote56(record,code){
    if(typeof jhOwnerAdmissionNote40==="function")return jhOwnerAdmissionNote40(record,code);
    return false;
  }
  function jhStage61PreparedResult56(result){
    const candidate=result?.schema==="JH168_NATIVE_SELECT_OPTION_REFS_V1"?result:
      result?.nativeSelectOptions?.schema==="JH168_NATIVE_SELECT_OPTION_REFS_V1"?result.nativeSelectOptions:
      result?.nativeSelectOptionRefs?.schema==="JH168_NATIVE_SELECT_OPTION_REFS_V1"?result.nativeSelectOptionRefs:null;
    const items=candidate?.optionItems;
    const expiresAt=candidate?.expiresAt;
    if(!candidate||candidate.code!=="NATIVE_SELECT_OPTION_REFS_READY"||candidate.readOnly!==true||
      candidate.pickReady!==true||candidate.authorizedToPick!==false||
      candidate.phoneActionDispatched!==false||candidate.resultVerified!==false||
      candidate.automaticReplay!==false||!Number.isSafeInteger(candidate.popupWindowId)||candidate.popupWindowId<0||
      !Array.isArray(items)||items.length<1||items.length>32||candidate.optionCount!==items.length||
      !Number.isSafeInteger(expiresAt)||expiresAt<=Date.now()||expiresAt>Date.now()+60000)
      return {ok:false,code:"STAGE61_SELECT_PREPARED_RESULT_INVALID"};
    const refs=[];
    for(const item of items){
      if(!item||typeof item!=="object"||!/^item_[a-f0-9]{16}$/.test(item.itemRef)||
        typeof item.label!=="string"||!item.label.trim()||item.label.length>160||item.label.includes("\u0000")||
        item.role!=="nativeSelectOption"||item.clickable!==true)
        return {ok:false,code:"STAGE61_SELECT_PREPARED_RESULT_INVALID"};
      refs.push(item.itemRef);
    }
    if(new Set(refs).size!==refs.length)return {ok:false,code:"STAGE61_SELECT_PREPARED_RESULT_INVALID"};
    return {ok:true,refs:new Set(refs),expiresAt,optionCount:refs.length};
  }
  function jhStage61RememberPreparedPick56(result,routeToken){
    const prepared=jhStage61PreparedResult56(result);
    if(prepared.ok!==true){jhStage61PreparedPick56.delete(routeToken);return prepared;}
    jhStage61PreparedPick56.set(routeToken,prepared);
    while(jhStage61PreparedPick56.size>32)
      jhStage61PreparedPick56.delete(jhStage61PreparedPick56.keys().next().value);
    return {ok:true,code:"STAGE61_SELECT_PICK_PREPARED",expiresAt:prepared.expiresAt,
      optionCount:prepared.optionCount,replayAllowed:false,automaticReplay:false};
  }
  function jhStage61ExactSelectPick56(payload){
    const p=payload&&typeof payload==="object"?payload:null;
    const intended=p?.stage61Action==="SELECT_PICK"||
      p?.command==="오른쪽 화면에서 새로 확인한 옵션 선택";
    if(!intended)return {intended:false,ok:false,code:null};
    try{
      const keys=Reflect.ownKeys(p);
      const expected=["action","command","contextId","requestId","stage61Action",
        "stage61ComputerOutcome","stage61PlaywrightMobileAvailable","stage61RouteSchema",
        "stage61WebOutcome","targetItemRef"];
      const names=keys.every(value=>typeof value==="string")?keys.slice().sort():[];
      const plain=names.every(name=>{const d=Object.getOwnPropertyDescriptor(p,name);
        return !!d&&Object.hasOwn(d,"value")&&d.enumerable===true;});
      if(names.length!==expected.length||names.some((value,index)=>value!==expected[index])||!plain||
        !/^ssc_[a-f0-9]{32}$/.test(p.contextId)||!/^[a-f0-9]{32}$/.test(p.requestId)||
        !/^item_[a-f0-9]{16}$/.test(p.targetItemRef)||p.action!=="CLICK"||
        p.command!=="오른쪽 화면에서 새로 확인한 옵션 선택"||
        p.stage61RouteSchema!=="JH168_STAGE61_ROUTE_REQUEST_V1"||p.stage61Action!=="SELECT_PICK"||
        typeof p.stage61WebOutcome!=="string"||p.stage61ComputerOutcome!=="NOT_RUN"||
        p.stage61PlaywrightMobileAvailable!==false)
        return {intended:true,ok:false,code:"OWNER_SELECT_PICK_SCOPE_INVALID"};
      const routeToken=jhStage61ContextRoute56.get(p.contextId);
      if(typeof routeToken!=="string"||!routeToken)
        return {intended:true,ok:false,code:"OWNER_SELECT_PICK_ROUTE_NOT_READY"};
      const prepared=jhStage61PreparedPick56.get(routeToken);
      if(!prepared||prepared.ok!==true||Date.now()>=prepared.expiresAt||
        !prepared.refs.has(p.targetItemRef)){
        jhStage61PreparedPick56.delete(routeToken);
        return {intended:true,ok:false,code:"OWNER_SELECT_PICK_PREPARED_REF_REQUIRED",routeToken};
      }
      const plan=jhStage61Host56.plan({routeToken,action:"SELECT_PICK",playwrightMobileAvailable:false});
      if(plan.ok!==true||plan.provider!=="ANDROID_WEB"||plan.allowed!==true||
        plan.routeToken!==routeToken||plan.replayAllowed!==false||plan.automaticReplay!==false)
        return {intended:true,ok:false,code:"OWNER_SELECT_PICK_ROUTE_NOT_READY",routeToken};
      const phone=jhStage61Host56.phonePayload({routeToken,action:"SELECT_PICK",provider:"ANDROID_WEB"});
      if(phone.ok!==true||phone.routeToken!==routeToken||phone.replayAllowed!==false||
        phone.automaticReplay!==false||phone.stage61RouteSchema!==p.stage61RouteSchema||
        phone.stage61Action!==p.stage61Action||phone.stage61WebOutcome!==p.stage61WebOutcome||
        phone.stage61ComputerOutcome!==p.stage61ComputerOutcome||
        phone.stage61PlaywrightMobileAvailable!==p.stage61PlaywrightMobileAvailable)
        return {intended:true,ok:false,code:"OWNER_SELECT_PICK_ROUTE_NOT_READY",routeToken};
      return {intended:true,ok:true,code:"OWNER_SELECT_PICK_ROUTE_VERIFIED",routeToken};
    }catch{return {intended:true,ok:false,code:"OWNER_SELECT_PICK_ROUTE_NOT_READY"};}
  }
  async function jhStage61OwnerAdmission56(device,commandId,record,firstAttempt,payload){
    const exact=jhStage61ExactSelectPick56(payload);
    if(!exact.intended)return jhOwnerAdmission155(device,commandId,record,firstAttempt);
    const fail=code=>jhStage61OwnerNote56(record,code);
    try{if(jhRequireCommand56(device)!==commandId)return fail("COMMAND_BINDING_CHANGED");}
    catch{return fail("COMMAND_BINDING_UNVERIFIED");}
    let binding;
    try{binding=jhPaymentLifecycle.captureBinding({device_id:device});}
    catch(e){
      const code=e?.code==="PAYMENT_TRUSTED_PHONE_UNAVAILABLE"?"OWNER_TRUST_UNVERIFIED":
        e?.code==="PAYMENT_PROCESS_EPOCH_REQUIRED"?"OWNER_PROCESS_EPOCH_UNVERIFIED":
        e?.code==="PAYMENT_EXACT_DEVICE_REQUIRED"?"OWNER_EXACT_DEVICE_REQUIRED":
        "OWNER_BINDING_CAPTURE_REJECTED";
      return fail(code);
    }
    const auth=active56(device);
    try{jhPaymentLifecycle.assertBinding({command_binding:binding});}
    catch(e){return fail(e?.code==="PAYMENT_COMMAND_DISCARDED"?
      "OWNER_COMMAND_DISCARDED":e?.code==="PAYMENT_DEVICE_OR_PROCESS_CHANGED"?
      "OWNER_DEVICE_OR_PROCESS_CHANGED":"OWNER_BINDING_ASSERT_REJECTED");}
    try{if(jhRequireCommand56(device)!==commandId)return fail("COMMAND_CHANGED_DURING_READ");}
    catch{return fail("COMMAND_DISCARDED_DURING_READ");}
    if(exact.routeToken)jhStage61PreparedPick56.delete(exact.routeToken);
    if(exact.ok!==true)return fail(exact.code||"OWNER_SELECT_PICK_ROUTE_NOT_READY");
    // The server admits only its exact signed OPEN receipt and one-shot option ref. Android still
    // rechecks the current popup, option lease and exact node, then consumes the
    // lease before the only ACTION_CLICK. No raw popup snapshot or replay exists.
    const gate=jhGateRecoveredDispatch155({
      commandState:"ACTIVE",commandEpochCurrent:true,pendingDiscard:jhBlockedCommands56.has(device),
      bridgeAuthenticated:typeof auth?.sessionId==="string"&&auth.sessionId.length>0,trustedScopeValid:true,
      ledgerStatus:record?.state==="PREPARING"&&firstAttempt&&record.attemptCount===1?"RESERVED":"BLOCKED",
      effect:record?.dispatchStartedAt?"UNKNOWN":"NOT_DISPATCHED",actionKind:"UI_ACTION",
      explicitUserCommand:true,isFreshScreen:true,
      serverRequestIdValid:typeof record?.executionId==="string"&&typeof record?.dedupeKey==="string"&&
        /^[a-f0-9]{32}$/.test(payload.requestId),sourceIsAuthoritative:true
    });
    if(gate.allowDispatch===true)return true;
    if(typeof auth?.sessionId!=="string"||!auth.sessionId)return fail("OWNER_SECURE_SESSION_UNVERIFIED");
    const allowed=new Set(["authenticated_owner_and_id_required",
      "old_work_discarded_no_auto_resume","secure_bridge_not_ready",
      "idempotency_existing_operation_no_retry","uncertain_effect_read_only_reconcile",
      "command_not_active","bridge_reconnected_old_work_not_replayed",
      "user_command_required","fresh_target_screen_required",
      "durable_reservation_not_available_no_write_retry"]);
    return fail(allowed.has(gate.code)?"FENCE_"+gate.code:"OWNER_ADMISSION_POLICY_DENIED");
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
    if(/^ssc_[a-f0-9]{32}$/.test(contextId))jhStage61ContextRoute56.set(contextId,state.routeToken);
    const taskDigest=String(result?.taskDigest||result?.task_digest||"");
    if(/^[a-f0-9]{64}$/.test(taskDigest)){
      jhStage61TaskRoute56.set(taskDigest,state.routeToken);
      while(jhStage61TaskRoute56.size>64)jhStage61TaskRoute56.delete(jhStage61TaskRoute56.keys().next().value);
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
    // A second OPEN attempt invalidates every previously prepared ref before
    // its new receipt is inspected; a failed re-open can never leave stale refs.
    if(action==="SELECT_OPEN")jhStage61PreparedPick56.delete(routeToken);
    const record=await jhStage61Host56.record({routeToken,originalReceiptRef:jhStage61SaveOriginal56(result),
      expectedProvider:provider,expectedAction:action,terminal});
    let selectPrepared=null;
    if(action==="SELECT_OPEN"&&record.ok===true&&record.recordedOutcome==="PREPARED")
      selectPrepared=jhStage61RememberPreparedPick56(result,routeToken);
    if(action==="SELECT_PICK")jhStage61PreparedPick56.delete(routeToken);
    if(selectPrepared?.ok===false)jhStage61Host56.discard({routeToken});
    const nextAction=action==="SELECT_OPEN"&&record.recordedOutcome==="PREPARED"?"SELECT_PICK":action;
    const next=selectPrepared?.ok===false
      ?{provider:"STOP_NO_REPLAY",code:selectPrepared.code,allowed:false}
      :record.ok===true&&!record.stopped
      ?jhStage61Host56.plan({routeToken,action:nextAction,playwrightMobileAvailable:false})
      :{provider:"STOP_NO_REPLAY",code:record.code||"STAGE61_ROUTE_STATE_STOPPED",allowed:false};
    return {...result,stage61RouteToken:routeToken,stage61RouterHost:record,
      ...(selectPrepared?{stage61SelectPreparedHost:selectPrepared}:{}),
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
 const ownerPickCount=out.split(OWNER_PICK_BEFORE).length-1;
 if(ownerPickCount>1||out.includes(OWNER_PICK_AFTER))fail('STAGE61_OWNER_PICK_ADMISSION_ANCHOR');
 if(ownerPickCount===1)out=once(out,OWNER_PICK_BEFORE,OWNER_PICK_AFTER,'STAGE61_OWNER_PICK_ADMISSION_ANCHOR');
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
 if(out.includes(OWNER_PICK_AFTER))out=out.replace(OWNER_PICK_AFTER,OWNER_PICK_BEFORE);
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