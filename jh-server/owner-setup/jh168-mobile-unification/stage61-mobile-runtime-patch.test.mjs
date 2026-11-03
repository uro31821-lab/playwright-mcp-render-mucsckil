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
 assert.match(out,/jhStage61FinishComputer56/);
 assert.match(out,/ACTION_APPROVAL_REQUEST/);
 assert.match(out,/recordControl/);
 assert.match(out,/approvalUsePlan/);
 assert.match(out,/SCREEN_CONSENT_STATUS/);
 assert.equal(reverseStage61MobileRuntime56(out),fixture);
});
test('second patch is rejected',()=>assert.throws(()=>patchStage61MobileRuntime56(patchStage61MobileRuntime56(fixture))));
test('missing real mobile anchors is rejected',()=>assert.throws(()=>patchStage61MobileRuntime56('function secureCall56(){}')));