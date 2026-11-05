import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {patchStage61MobileRuntime56} from '../../jh-server/owner-setup/jh168-mobile-unification/stage61-mobile-runtime-patch.mjs';
import {gateRecoveredDispatch} from '../../jh-server/owner-setup/deployment/jh-recovery-write-fence.mjs';

const fixture=`import x from "x";
function token56(){}
function secureResult56(){}
function textResult(x){return x}
function mk(){}
function waitJob(){}
function exactEnvelope56(){}
const z={string(){return {optional(){}}}};
const cuSchema56={action:z.string()};
async function jhOwnerAdmission155(){return true;}
async function wrapped(device,commandId,payload){
 const x={beforeDispatch:({record,firstAttempt})=>jhOwnerAdmission155(device,commandId,record,firstAttempt),dispatchAction:async()=>{}};
 return x;
}
function secureCall56(device,mcpToolName,args={}){
 if(device?.error)return Promise.resolve(textResult(device));
 const x=exactEnvelope56(device,mcpToolName,args);if(x.error)return Promise.resolve(textResult(x));
 const j=mk(x.type,x.payload,device.deviceId);return waitJob(j,x.waitMs).then(secureResult56);
}
let jhMobileWebCapture56=null;
async function jhMobileWebFollow56(args,action,command){
 const bound={contextId:args.context_id,itemRef:args.target_item_ref};const requestId=args?.request_id;
 const payload={contextId:bound.contextId,requestId,command,targetItemRef:bound.itemRef,action};
 const result=await jhSplitScreenJob56("split_screen_session_followup",payload,"REVERSIBLE_WRITE","life_android_execute_computer_action",43000);
 return textResult({route:"android_right",automaticReplay:false,...result,...(action==="BACK"?{browserHistoryNavigationVerified:false}:{})});
}
async function jhMobileWebRead56(args={}){
 if(args.context_id!==undefined){const result=await jhSplitScreenJob56("split_screen_session_status",{contextId:args.context_id},"READ_ONLY","life_android_capture_work_window");return textResult({route:"android_right",automaticReplay:false,...result});}
 const payload={};const result=await jhSplitScreenJob56("split_screen_session_start",payload,"READ_ONLY","life_android_capture_work_window");
 return textResult({route:"android_right",automaticReplay:false,...result});
}
registerOAuthTool("life_web_navigate",{});
registerOAuthTool("life_web_press_key",{
 title:"Supported RIGHT-pane navigation key",
 description:"Only explicit Android BACK is currently bridged. Enter, Tab, Escape, Arrow keys require verified native action contracts and never silently use server Playwright.",
 inputSchema:{key:z.string(),context_id:z.string().optional(),request_id:z.string().optional()}
},async(args)=>{
 if(!["BACK","AndroidBack"].includes(args.key))return jhMobileWebReject56("MOBILE_KEY_NOT_VERIFIED",{requestedKey:args.key});
 return jhMobileWebFollow56(args,"BACK","오른쪽 화면에서 Android 뒤로 가기 1회");
});
`;

function helper(source){
 const a=source.indexOf('  // Stage61: server-owned route state');
 const b=source.indexOf('\nfunction secureCall56(',a);
 assert.ok(a>=0&&b>a);return source.slice(a,b);
}
function payload(contextId,ref,extra={}){
 return {action:'CLICK',command:'오른쪽 화면에서 지정 선택 메뉴 열기',contextId,
  requestId:'3'.repeat(32),stage61Action:'SELECT_OPEN',stage61ComputerOutcome:'NOT_RUN',
  stage61PlaywrightMobileAvailable:false,stage61RouteSchema:'JH168_STAGE61_ROUTE_REQUEST_V1',
  stage61WebOutcome:'NOT_RUN',targetItemRef:ref,...extra};
}
function harness(){
 const h=helper(patchStage61MobileRuntime56(fixture));
 let generic=0;const notes=[];
 const host={
  plan:({routeToken,action})=>({ok:true,provider:'ANDROID_WEB',allowed:true,routeToken,action,replayAllowed:false,automaticReplay:false}),
  phonePayload:({routeToken,action})=>({ok:true,routeToken,replayAllowed:false,automaticReplay:false,
   stage61RouteSchema:'JH168_STAGE61_ROUTE_REQUEST_V1',stage61Action:action,
   stage61WebOutcome:'NOT_RUN',stage61ComputerOutcome:'NOT_RUN',stage61PlaywrightMobileAvailable:false}),
  discard:()=>({ok:true})
 };
 const env={createStage61HostAdapter:()=>host,token56:()=>'',secureResult56:()=>{},textResult:x=>x,
  jhOwnerAdmission155:async()=>{generic++;return true;},
  jhOwnerAdmissionNote40:(record,code)=>{notes.push(code);return false;},
  jhRequireCommand56:()=> 'a'.repeat(32),
  jhPaymentLifecycle:{captureBinding:()=>({ok:true}),assertBinding:()=>{}},
  active56:()=>({sessionId:'secure'}),jhGateRecoveredDispatch155:gateRecoveredDispatch,
  jhBlockedCommands56:new Set(),Map,Set,Date,Object,Array,Promise,Number,String,RegExp};
 const api=vm.runInContext(`(()=>{${h}\nreturn {admit:jhStage61OwnerAdmission56,routes:jhStage61ContextRoute56,items:jhStage61ContextItems56};})()`,vm.createContext(env));
 return {api,notes,get generic(){return generic;}};
}

test('exact fresh SELECT_OPEN is admitted once and consumes the fresh ref',async()=>{
 const h=harness(),context='ssc_'+'1'.repeat(32),route='s61_route',ref='item_'+'2'.repeat(16);
 h.api.routes.set(context,route);h.api.items.set(context,{refs:new Set([ref]),expiresAt:Date.now()+30000});
 const record={state:'PREPARING',attemptCount:1,executionId:'exec',dedupeKey:'d'.repeat(64),dispatchStartedAt:null};
 assert.equal(await h.api.admit('phone','a'.repeat(32),record,true,payload(context,ref)),true);
 assert.equal(h.generic,0);assert.equal(h.api.items.has(context),false);
 assert.equal(await h.api.admit('phone','a'.repeat(32),record,true,payload(context,ref)),false);
 assert.equal(h.notes.at(-1),'OWNER_SELECT_OPEN_FRESH_REF_REQUIRED');assert.equal(h.generic,0);
});

test('malformed SELECT_OPEN fails closed without generic owner fallback',async()=>{
 const h=harness(),context='ssc_'+'4'.repeat(32),route='s61_route_2',ref='item_'+'5'.repeat(16);
 h.api.routes.set(context,route);h.api.items.set(context,{refs:new Set([ref]),expiresAt:Date.now()+30000});
 const record={state:'PREPARING',attemptCount:1,executionId:'exec2',dedupeKey:'e'.repeat(64),dispatchStartedAt:null};
 assert.equal(await h.api.admit('phone','a'.repeat(32),record,true,payload(context,ref,{unexpected:true})),false);
 assert.equal(h.notes.at(-1),'OWNER_SELECT_OPEN_SCOPE_INVALID');assert.equal(h.generic,0);
});
