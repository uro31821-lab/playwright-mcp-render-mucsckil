import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {gateRecoveredDispatch} from '../deployment/jh-recovery-write-fence.mjs';
import {buildStage25PendingOperatorEntrypoint56} from './stage25-live-operator-followup-entry.mjs';
import {patchStage61MobileRuntime56,reverseStage61MobileRuntime56}
 from './stage61-mobile-runtime-patch.mjs';

const ROOT=path.resolve(import.meta.dirname,'..');
const OWNER_OLD='beforeDispatch:({record,firstAttempt})=>jhOwnerAdmission155(device,commandId,record,firstAttempt),';
const OWNER_NEW='beforeDispatch:({record,firstAttempt})=>jhStage61OwnerAdmission56(device,commandId,record,firstAttempt,payload),';
const fixture=`import x from "x";
function token56(){}
function secureResult56(){}
function textResult(){}
function mk(){}
function waitJob(){}
function exactEnvelope56(){}
const z={string(){return {optional(){}}}};
const cuSchema56={action:z.string()};
async function jhOwnerAdmission155(){return true;}
async function wrapped(device,commandId,payload){
      const x={
      beforeDispatch:({record,firstAttempt})=>jhOwnerAdmission155(device,commandId,record,firstAttempt),
      dispatchAction:async()=>{}
      };return x;
}
function secureCall56(device,mcpToolName,args={}){
    if(device?.error)return Promise.resolve(textResult(device));
    const x=exactEnvelope56(device,mcpToolName,args);
    if(x.error)return Promise.resolve(textResult(x));
    const j=mk(x.type,x.payload,device.deviceId);
    return waitJob(j,x.waitMs).then(secureResult56);
  }
  let jhMobileWebCapture56=null;
  async function jhMobileWebFollow56(args,action,command){
    const bound={contextId:args.context_id,itemRef:args.target_item_ref};
    const requestId=args?.request_id;
    const payload={contextId:bound.contextId,requestId,command,targetItemRef:bound.itemRef,action};
    const result=await jhSplitScreenJob56("split_screen_session_followup",payload,
      "REVERSIBLE_WRITE","life_android_execute_computer_action",43000);
    return textResult({route:"android_right",automaticReplay:false,...result,
      ...(action==="BACK"?{browserHistoryNavigationVerified:false}:{} )});
  }
  async function jhMobileWebRead56(args={}){
    if(args.context_id!==undefined){
      const result=await jhSplitScreenJob56("split_screen_session_status",
        {contextId:args.context_id},"READ_ONLY","life_android_capture_work_window");
      return textResult({route:"android_right",automaticReplay:false,...result});
    }
    if(args.goal!==undefined&&(typeof args.goal!=="string"||args.goal.length>2000))return null;
    const payload={};
    const result=await jhSplitScreenJob56("split_screen_session_start",payload,
      "READ_ONLY","life_android_capture_work_window");
    return textResult({route:"android_right",automaticReplay:false,...result});
  }

  registerOAuthTool("life_web_navigate",{});
`;

function helperFromPatched(source){
 const begin=source.indexOf('  // Stage61: server-owned route state');
 const end=source.indexOf('\nfunction secureCall56(',begin);
 assert.ok(begin>=0&&end>begin,'Stage61 helper must be present');
 return source.slice(begin,end);
}
function exactPayload({contextId,ref,requestId='3'.repeat(32)}={}){
 return {action:'CLICK',command:'오른쪽 화면에서 새로 확인한 옵션 선택',contextId,
  requestId,stage61Action:'SELECT_PICK',stage61ComputerOutcome:'NOT_RUN',
  stage61PlaywrightMobileAvailable:false,stage61RouteSchema:'JH168_STAGE61_ROUTE_REQUEST_V1',
  stage61WebOutcome:'NOT_RUN',targetItemRef:ref};
}
function openResult(ref,extra={}){
 return {schema:'JH168_NATIVE_SELECT_OPTION_REFS_V1',code:'NATIVE_SELECT_OPTION_REFS_READY',
  readOnly:true,pickReady:true,authorizedToPick:false,phoneActionDispatched:false,
  resultVerified:false,automaticReplay:false,popupWindowId:99,
  optionItems:[{itemRef:ref,label:'파랑 연습 옵션',role:'nativeSelectOption',clickable:true}],
  optionCount:1,expiresAt:Date.now()+30000,...extra};
}
function runtimeHarness(source){
 const helper=helperFromPatched(source);
 let generic=0,capture=0,asserted=0,auth={sessionId:'secure-session'},notes=[];
 const host={
  plan:({routeToken,action})=>({ok:true,provider:'ANDROID_WEB',allowed:true,routeToken,
    action,replayAllowed:false,automaticReplay:false}),
  phonePayload:({routeToken,action})=>({ok:true,routeToken,replayAllowed:false,
    automaticReplay:false,stage61RouteSchema:'JH168_STAGE61_ROUTE_REQUEST_V1',
    stage61Action:action,stage61WebOutcome:'NOT_RUN',stage61ComputerOutcome:'NOT_RUN',
    stage61PlaywrightMobileAvailable:false}),
  discard:()=>({ok:true})
 };
 const env={
  createStage61HostAdapter:()=>host,token56:()=>'',secureResult56:()=>{},textResult:x=>x,
  jhOwnerAdmission155:async()=>{generic++;return true;},
  jhOwnerAdmissionNote40:(record,code)=>{notes.push(code);return false;},
  jhRequireCommand56:()=> 'a'.repeat(32),
  jhPaymentLifecycle:{captureBinding:()=>{capture++;return {ok:true};},
    assertBinding:()=>{asserted++;}},
  active56:()=>auth,jhGateRecoveredDispatch155:gateRecoveredDispatch,
  jhBlockedCommands56:new Set(),Map,Set,Date,Object,Array,Promise,Number,String,RegExp
 };
 const ctx=vm.createContext(env);
 const api=vm.runInContext(`(()=>{${helper}\nreturn {
  admit:jhStage61OwnerAdmission56,remember:jhStage61RememberPreparedPick56,
  routes:jhStage61ContextRoute56,prepared:jhStage61PreparedPick56};})()`,ctx);
 return {api,host,notes,get generic(){return generic;},get capture(){return capture;},
  get asserted(){return asserted;},setAuth:value=>{auth=value;}};
}

test('Stage61 wraps only the exact split FOLLOWUP owner callback and reverses byte-for-byte',()=>{
 const patched=patchStage61MobileRuntime56(fixture);
 assert.equal(patched.split(OWNER_NEW).length-1,1);
 assert.equal(patched.split(OWNER_OLD).length-1,0);
 assert.equal(reverseStage61MobileRuntime56(patched),fixture);
 const helper=helperFromPatched(patched);
 const afterBegin=helper.indexOf('async function jhStage61AfterAction56');
 const afterEnd=helper.indexOf('function jhStage61PrepareComputer56',afterBegin);
 const afterAction=helper.slice(afterBegin,afterEnd);
 assert.ok(afterBegin>=0&&afterEnd>afterBegin,'after-action helper must be bounded');
 assert.ok(afterAction.indexOf('if(action==="SELECT_OPEN")jhStage61PreparedPick56.delete(routeToken);')<
   afterAction.indexOf('const record=await jhStage61Host56.record({routeToken'),
   'every re-open clears stale prepared refs before its receipt inspection');
 assert.throws(()=>patchStage61MobileRuntime56(patched));
});

test('exact signed OPEN option ref is admitted once without generic popup snapshot fallback',async()=>{
 const patched=patchStage61MobileRuntime56(fixture);
 const h=runtimeHarness(patched);
 const contextId='ssc_'+'1'.repeat(32),routeToken='s61_route_token',ref='item_'+'2'.repeat(16);
 h.api.routes.set(contextId,routeToken);
 assert.equal(h.api.remember({ok:false,code:'split_screen_changed_or_missing',
  nativeSelectOptions:openResult(ref)},routeToken).ok,true);
 const payload=exactPayload({contextId,ref});
 const record={state:'PREPARING',attemptCount:1,executionId:'exec',
  dedupeKey:'d'.repeat(64),dispatchStartedAt:null};
 assert.equal(await h.api.admit('phone','a'.repeat(32),record,true,payload),true);
 assert.equal(h.generic,0,'SELECT_PICK must not invoke the generic agent_snapshot admission');
 assert.equal(h.capture,1);assert.equal(h.asserted,1);
 assert.equal(h.api.prepared.has(routeToken),false,'prepared ref consumed before dispatch');
 assert.equal(await h.api.admit('phone','a'.repeat(32),record,true,payload),false);
 assert.equal(h.notes.at(-1),'OWNER_SELECT_PICK_PREPARED_REF_REQUIRED');
 assert.equal(h.generic,0);
 const ownerBlock=helperFromPatched(patched).slice(
  helperFromPatched(patched).indexOf('async function jhStage61OwnerAdmission56'));
 assert.doesNotMatch(ownerBlock,/agent_snapshot|waitJob\(/);
 assert.match(ownerBlock,/automaticReplay/);
});

test('malformed, stale, mismatched or repeated PICK fails closed and never falls back to generic',async()=>{
 const h=runtimeHarness(patchStage61MobileRuntime56(fixture));
 const contextId='ssc_'+'4'.repeat(32),routeToken='s61_route_token_2',ref='item_'+'5'.repeat(16);
 h.api.routes.set(contextId,routeToken);
 const record={state:'PREPARING',attemptCount:1,executionId:'exec2',
  dedupeKey:'e'.repeat(64),dispatchStartedAt:null};
 assert.equal(h.api.remember(openResult(ref,{expiresAt:Date.now()-1}),routeToken).ok,false);
 assert.equal(h.api.remember(openResult(ref,{optionItems:[{itemRef:ref,label:'',role:'nativeSelectOption',clickable:true}]}),routeToken).ok,false);
 assert.equal(await h.api.admit('phone','a'.repeat(32),record,true,exactPayload({contextId,ref})),false);
 assert.equal(h.notes.at(-1),'OWNER_SELECT_PICK_PREPARED_REF_REQUIRED');
 assert.equal(h.generic,0);
 h.api.remember(openResult(ref),routeToken);
 assert.equal(await h.api.admit('phone','a'.repeat(32),record,true,
  {...exactPayload({contextId,ref}),unexpected:true}),false);
 assert.equal(h.notes.at(-1),'OWNER_SELECT_PICK_SCOPE_INVALID');
 assert.equal(h.generic,0);
 h.api.remember(openResult(ref),routeToken);
 assert.equal(await h.api.admit('phone','a'.repeat(32),record,false,exactPayload({contextId,ref})),false);
 assert.equal(h.notes.at(-1),'FENCE_idempotency_existing_operation_no_retry');
 assert.equal(h.api.prepared.has(routeToken),false);
 h.api.remember(openResult(ref),routeToken);h.setAuth(null);
 assert.equal(await h.api.admit('phone','a'.repeat(32),record,true,exactPayload({contextId,ref})),false);
 assert.equal(h.notes.at(-1),'OWNER_SECURE_SESSION_UNVERIFIED');
});

test('ordinary CLICK/TYPE/BACK still delegate to the unchanged original owner admission',async()=>{
 const h=runtimeHarness(patchStage61MobileRuntime56(fixture));
 const record={state:'PREPARING',attemptCount:1,executionId:'exec3',dedupeKey:'f'.repeat(64)};
 for(const payload of [
  {action:'CLICK',command:'현재 오른쪽 화면의 지정 항목 클릭'},
  {action:'SET_TEXT',command:'현재 오른쪽 화면의 지정 입력칸에 문자 입력'},
  {action:'BACK',command:'오른쪽 Chrome 뒤로 가기 1회'}
 ])assert.equal(await h.api.admit('phone','a'.repeat(32),record,true,payload),true);
 assert.equal(h.generic,3);
 assert.equal(h.capture,0);assert.equal(h.asserted,0);
});

test('full Stage25 generated runtime contains exactly one bounded PICK admission seam',async()=>{
 const env={CI:'true',NODE_ENV:'test',JH_OWNER_DEFER_LISTEN:'1',
  JH_MOBILE_WEB_13_MODE:'EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1',
  JH_STAGE26_SIGNED_COMPLETION_ACK:'EXPLICIT_IDENTICAL_SIGNED_RESULT_V1',
  JH_STAGE40_OWNER_ADMISSION_DIAGNOSTICS:'EXPLICIT_ORIGINAL_OWNER_REASON_V1',
  JH_STAGE41_COMMAND_LIFECYCLE_DIAGNOSTICS:'EXPLICIT_SIGNED_COMMAND_CAUSE_V1',
  JH_STAGE44_DEVICE_FOCUS:'EXPLICIT_SIGNED_WORKFLOW_FOCUS_V1',
  JH_MOBILE13_COMMAND_DIAGNOSTICS:'EXPLICIT_OWNER_DEVICE_READ_ONLY_V1'};
 const built=await buildStage25PendingOperatorEntrypoint56(ROOT,env);
 const runtime=readFileSync(built.runtimeFile,'utf8');
 assert.equal(runtime.split(OWNER_NEW).length-1,1);
 assert.equal(runtime.split(OWNER_OLD).length-1,0);
 assert.equal(runtime.split('jhOwnerAdmission155(w.device,w.commandId,record,firstAttempt)').length-1,1,
  'unrelated workflow owner gate remains original');
 assert.equal(runtime.split('const jhStage61PreparedPick56=new Map();').length-1,1);
 const reversed=reverseStage61MobileRuntime56(runtime);
 assert.equal(reversed.split(OWNER_OLD).length-1,1);
 assert.equal(reversed.includes('jhStage61OwnerAdmission56('),false);
});
