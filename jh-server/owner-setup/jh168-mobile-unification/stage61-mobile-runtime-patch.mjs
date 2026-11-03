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
const HELPER=String.raw`
  // Stage61: server-owned route state over ORIGINAL Secure56 phone results.
  const jhStage61OriginalResult56=new Map();
  const jhStage61ContextRoute56=new Map();
  const jhStage61Host56=createStage61HostAdapter({
    readOriginalSignedResult:async ref=>jhStage61OriginalResult56.get(ref)
  });
  function jhStage61SaveOriginal56(result){
    const ref="s61r_"+token56(24);jhStage61OriginalResult56.set(ref,result);
    while(jhStage61OriginalResult56.size>64)jhStage61OriginalResult56.delete(jhStage61OriginalResult56.keys().next().value);
    return ref;
  }
  function jhStage61WebAction56(action,command){
    if(action==="SET_TEXT")return "TYPE";if(action==="BACK")return "BACK";
    const s=String(command||"");
    if(/선택 메뉴 열기|select menu open/i.test(s))return "SELECT_OPEN";
    if(/옵션 선택|select option/i.test(s))return "SELECT_PICK";
    return "CLICK";
  }
  function jhStage61ComputerAction56(args,inspect=false){
    if(inspect)return "READ_ONLY_INSPECT";
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
    if(phone.ok!==true)return phone;Object.assign(payload,phone);
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
    const routeToken=String(args?.stage61_route_token||"");
    if(!routeToken)return {ok:true,args};
    const inspect=mcpToolName==="life_android_computer_inspect";
    const stageAction=jhStage61ComputerAction56(args,inspect);
    const plan=jhStage61Host56.plan({routeToken,action:stageAction});
    if(plan.ok!==true||plan.provider!=="ANDROID_COMPUTER_USE"||plan.allowed!==true)
      return {ok:false,result:{ok:false,code:plan.code||"STAGE61_COMPUTER_USE_NOT_AUTHORIZED",automaticReplay:false}};
    const phone=jhStage61Host56.phonePayload({routeToken,action:stageAction,provider:"ANDROID_COMPUTER_USE"});
    if(phone.ok!==true)return {ok:false,result:phone};
    return {ok:true,args:{...args,...phone},routeToken,stageAction,terminal:mcpToolName==="life_android_execute_computer_action"};
  }
  async function jhStage61FinishComputer56(job,prepared){
    if(!prepared?.routeToken)return secureResult56(job);
    const result=job?.result;
    if(!result||typeof result!=="object")return secureResult56(job);
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
 out=once(out,'  let jhMobileWebCapture56=null;','  let jhMobileWebCapture56=null;'+HELPER,'STAGE61_HELPER_ANCHOR');
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
 const oldCall='function secureCall56(mcpToolName,jobType,effect,args,extra={}){\n  const x=exactEnvelope56(mcpToolName,jobType,effect,args,extra);if(x.error)return Promise.resolve(textResult({ok:false,code:x.error,deviceDigest:x.deviceDigest||null}));\n  return waitJob(x.job,15000).then(secureResult56);\n}';
 const newCall='function secureCall56(mcpToolName,jobType,effect,args,extra={}){\n  const stage61=jhStage61PrepareComputer56(args,mcpToolName);\n  if(stage61.ok!==true)return Promise.resolve(textResult(stage61.result));\n  const x=exactEnvelope56(mcpToolName,jobType,effect,stage61.args,extra);if(x.error)return Promise.resolve(textResult({ok:false,code:x.error,deviceDigest:x.deviceDigest||null}));\n  return waitJob(x.job,15000).then(job=>jhStage61FinishComputer56(job,stage61));\n}';
 out=once(out,oldCall,newCall,'STAGE61_SECURE_CALL_ANCHOR');
 return out;
}

export function reverseStage61MobileRuntime56(source){
 let out=source;
 const newCall='function secureCall56(mcpToolName,jobType,effect,args,extra={}){\n  const stage61=jhStage61PrepareComputer56(args,mcpToolName);\n  if(stage61.ok!==true)return Promise.resolve(textResult(stage61.result));\n  const x=exactEnvelope56(mcpToolName,jobType,effect,stage61.args,extra);if(x.error)return Promise.resolve(textResult({ok:false,code:x.error,deviceDigest:x.deviceDigest||null}));\n  return waitJob(x.job,15000).then(job=>jhStage61FinishComputer56(job,stage61));\n}';
 const oldCall='function secureCall56(mcpToolName,jobType,effect,args,extra={}){\n  const x=exactEnvelope56(mcpToolName,jobType,effect,args,extra);if(x.error)return Promise.resolve(textResult({ok:false,code:x.error,deviceDigest:x.deviceDigest||null}));\n  return waitJob(x.job,15000).then(secureResult56);\n}';
 out=out.replace(newCall,oldCall)
  .replace('const cuSchema56={stage61_route_token:z.string().optional(),','const cuSchema56={')
  .replace('    return textResult({route:"android_right",automaticReplay:false,...await jhStage61BeginRead56(result)});','    return textResult({route:"android_right",automaticReplay:false,...result});')
  .replace('      return textResult({route:"android_right",automaticReplay:false,...await jhStage61ReadStatus56(result,args.context_id)});','      return textResult({route:"android_right",automaticReplay:false,...result});')
  .replace('    const routed=await jhStage61AfterAction56(result,stage61.routeToken,"ANDROID_WEB",stage61.stageAction,true);\n    return textResult({route:"android_right",automaticReplay:false,...routed,','    return textResult({route:"android_right",automaticReplay:false,...result,')
  .replace('    const payload={contextId:bound.contextId,requestId,command,targetItemRef:bound.itemRef,action};\n    const stage61=await jhStage61BeforeWeb56(args,payload,action,command);\n    if(stage61.ok!==true)return textResult({route:"android_right",...stage61});','    const payload={contextId:bound.contextId,requestId,command,targetItemRef:bound.itemRef,action};')
  .replace('  let jhMobileWebCapture56=null;'+HELPER,'  let jhMobileWebCapture56=null;');
 if(out.startsWith(IMPORT))out=out.slice(IMPORT.length);
 return out;
}
