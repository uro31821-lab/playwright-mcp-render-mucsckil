/** The only direct runner B9 provides: a guarded, single safe existing-tool invocation.
 * It contains no executor loop, payment executor, credentials, durable journal, retry,
 * nor an approval-granting operation. Workflow fencing MUST come from current JH.
 */
import {guardGeneralStep,requireCondition} from './policy.mjs';
import {createHash} from 'node:crypto';
const SAFE_TOOLS=new Set(['life_web_navigate','life_web_snapshot','life_choice_collect','life_choice_total','life_choice_explain','life_route','life_open_service','life_payment_options','life_payment_result','life_payment_verify_result','life_android_secure_status','life_android_split_screen_assistant']);
export function createGeneralWorkReadAdapter({invokeExistingTool,getCurrentContext,authorizeExistingPlan,getTrustedActionEvidence,clock=Date.now}){
 requireCondition(typeof invokeExistingTool==='function'&&typeof getCurrentContext==='function'&&
  typeof authorizeExistingPlan==='function'&&typeof getTrustedActionEvidence==='function','EXISTING_JH_PORTS_REQUIRED');
 return Object.freeze({
  async invoke({plan,stepId}){
   requireCondition(plan?.started===true,'EXPLICIT_USER_START_REQUIRED');
   const before=getCurrentContext();
   if(authorizeExistingPlan(plan,before)!==true)return {ok:false,code:'EXISTING_JH_PLAN_AUTHORITY_REQUIRED',dispatched:false};
   const evidence=getTrustedActionEvidence(plan,stepId,before);
   if(!evidence||evidence.trustedByExistingJH!==true)return {ok:false,code:'TRUSTED_SCREEN_OBSERVATION_REQUIRED',dispatched:false};
   const gate=guardGeneralStep({plan,stepId,context:before,observedAction:evidence,at:clock()});
   if(!gate.ok)return {...gate,dispatched:false};
   if(!SAFE_TOOLS.has(gate.tool))return {ok:false,code:'NOT_A_GUARDED_READ_PORT',dispatched:false};
   if(gate.tool==='life_android_split_screen_assistant'&&!['START','STATUS'].includes(gate.args?.mode))return {ok:false,code:'ANDROID_ACTION_NOT_READ_ONLY',dispatched:false};
   // JH secure grants and right-pane permissions are checked by the original port too.
   const afterPreflight=getCurrentContext();
   if(!sameEpoch(before,afterPreflight,{requireSamePane:true}))return {ok:false,code:'CANCELLED_BEFORE_DISPATCH',dispatched:false};
   let response;
   try{
    const operationKey=createHash('sha256').update([before.workflowId,before.generation,stepId].join('|')).digest('hex');
    response=await invokeExistingTool(gate.tool,gate.args,{workflowId:before.workflowId,generation:before.generation,operationKey,
       existingIdempotencyAuthority:'JH149_RESULT_VERIFICATION'});
   }
   catch(e){return {ok:false,code:'EXISTING_TOOL_FAILURE_UNKNOWN_EFFECT',dispatched:true,autoRetry:false};}
   const after=getCurrentContext();
   if(!sameEpoch(before,after))return {ok:false,code:'LATE_RESULT_AFTER_CANCELLATION',dispatched:true,externalResultPreserve:true,autoRetry:false};
   return {ok:true,dispatched:true,tool:gate.tool,response,invocationReturned:true,resultVerified:false,externalEffectConfirmed:false};
  }
 });
}
function sameEpoch(x,y,{requireSamePane=false}={}){return x&&y&&y.current===true&&y.cancelled!==true&&y.forcedRestart!==true&&x.workflowId===y.workflowId&&x.generation===y.generation&&x.cancelFenceConfirmed===true&&y.cancelFenceConfirmed===true&&x.externalEffectUnknown!==true&&y.externalEffectUnknown!==true&&
  ((!x.splitScreen&&!y.splitScreen)||(x.splitScreen?.rightTargetId===y.splitScreen?.rightTargetId&&(!requireSamePane||x.splitScreen?.pairDigest===y.splitScreen?.pairDigest)));}
