import test from 'node:test';
import assert from 'node:assert/strict';
import {patchStage61MobileRuntime56,reverseStage61MobileRuntime56} from './stage61-mobile-runtime-patch.mjs';

const fixture=`import x from "x";
function token56(){}
function secureResult56(){}
function textResult(){}
function mk(){}
function waitJob(){}
function exactEnvelope56(){}
const z={string(){return {optional(){}}}};
const cuSchema56={action:z.string()};
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

test('patch connects mobile web and computer use to Stage61',()=>{
 const out=patchStage61MobileRuntime56(fixture);
 assert.match(out,/createStage61HostAdapter/);
 assert.match(out,/jhStage61BeforeWeb56/);
 assert.match(out,/stage61_route_token/);
 assert.match(out,/jhStage61TaskRoute56/);
 assert.match(out,/STAGE61_ROUTE_TASK_BINDING_MISMATCH/);
 assert.match(out,/jhStage61FinishComputer56/);
 assert.match(out,/ACTION_APPROVAL_REQUEST/);
 assert.match(out,/recordControl/);
 assert.match(out,/approvalUsePlan/);
 assert.match(out,/SCREEN_CONSENT_STATUS/);
 assert.match(out,/stage61RouteSchema:phone\.stage61RouteSchema/);
 assert.match(out,/stage61Action:phone\.stage61Action/);
 assert.match(out,/stage61WebOutcome:phone\.stage61WebOutcome/);
 assert.match(out,/stage61ComputerOutcome:phone\.stage61ComputerOutcome/);
 assert.match(out,/stage61PlaywrightMobileAvailable:phone\.stage61PlaywrightMobileAvailable/);
 assert.doesNotMatch(out,/if\(phone\.ok!==true\)return phone;Object\.assign\(payload,phone\)/);
 assert.equal(reverseStage61MobileRuntime56(out),fixture);
});
test('second patch is rejected',()=>assert.throws(()=>patchStage61MobileRuntime56(patchStage61MobileRuntime56(fixture))));
test('missing real mobile anchors is rejected',()=>assert.throws(()=>patchStage61MobileRuntime56('function secureCall56(){}')));

const pendingFixture=fixture
  .replace('function secureCall56(device,mcpToolName,args={}){\n    if(device?.error)return Promise.resolve(textResult(device));\n    const x=exactEnvelope56(device,mcpToolName,args);\n    if(x.error)return Promise.resolve(textResult(x));\n    const j=mk(x.type,x.payload,device.deviceId);\n    return waitJob(j,x.waitMs).then(secureResult56);\n  }',
`function active56(){}
const devices=new Map();
const pendingApprovalReceipts56={issue(){return {receiptToken:"r"}}};
function safeJobView56(){return {}}
function secureCall56(mcpToolName,jobType,effect,args,extra={}){
  const x=exactEnvelope56(mcpToolName,jobType,effect,args,extra);if(x.error)return Promise.resolve(textResult({ok:false,code:x.error,deviceDigest:x.deviceDigest||null}));
  return waitJob(x.job,15000).then(j=>{
    if(!j||!["queued","in_progress"].includes(j.status))return secureResult56(j);
    const active=active56(x.deviceId),meta=devices.get(x.deviceId);
    const receipt=pendingApprovalReceipts56.issue({job:j,deviceId:x.deviceId,deviceDigest:meta?.deviceDigest,
      sessionId:active?.sessionId,taskDigest:String(args.task_digest||""),runDigest:String(args.run_digest||""),
      commandId:j.commandId});
    return textResult({...safeJobView56(j),...(receipt||{})});
  });
}`);

test('patch preserves pending approval queued receipt secureCall and reverses exactly',()=>{
 const out=patchStage61MobileRuntime56(pendingFixture);
 assert.match(out,/pendingApprovalReceipts56\.issue/);
 assert.match(out,/jhStage61FinishComputer56\(j,stage61\)/);
 assert.match(out,/stage61RouteToken/);
 assert.equal(reverseStage61MobileRuntime56(out),pendingFixture);
});


const pendingInspectFixture=pendingFixture
  .replace('const pendingApprovalReceipts56={issue(){return {receiptToken:"r"}}};',
    'const pendingApprovalReceipts56={issue(){return {receiptToken:"r"}}};\nconst computerInspectReceipt56={issue(){return {receiptToken:"i"}}};')
  .replace('    return textResult({...safeJobView56(j),...(receipt||{})});',
`    const inspectReceipt=jobType==="computer_use_inspect"&&
      mcpToolName==="life_android_computer_inspect"&&
      effect==="READ_ONLY"?computerInspectReceipt56.issue({
        job:j,deviceId:x.deviceId,deviceDigest:meta?.deviceDigest,
        sessionId:active?.sessionId,commandId:j.commandId,
        taskDigest:String(args.task_digest||""),
        runDigest:String(args.run_digest||"")
      }):null;
    return textResult({...safeJobView56(j),...(receipt||inspectReceipt||{})});`);

test('patch preserves final pending plus computer inspect queued receipt secureCall and reverses exactly',()=>{
 const out=patchStage61MobileRuntime56(pendingInspectFixture);
 assert.match(out,/computerInspectReceipt56\.issue/);
 assert.match(out,/jhStage61FinishComputer56\(j,stage61\)/);
 assert.match(out,/stage61RouteToken/);
 assert.equal(reverseStage61MobileRuntime56(out),pendingInspectFixture);
});
