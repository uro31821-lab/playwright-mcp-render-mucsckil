import {patchJH155SplitIntegration} from './jh155-split-integration-patch.mjs';
import {patchJH155AllModules} from './jh155-all-modules-patch.mjs';
import {patchResultVerificationRuntime} from './result-verification-runtime-patch.mjs';
import {patchSearchDecision} from './search-decision-patch.mjs';
import {patchDurableMcpWorkflowCleanRestart56} from './durable-clean-restart-patch.mjs';
import {patchPaymentRuntime} from '../payment/payment-runtime-patch.mjs';

export function bindPaymentDiscard56(source){
  const changes=[
    ["  const scoped=previousCommandId!==undefined;", "  jhDiscardPayments56(device,previousCommandId,'NEW_COMMAND_OR_SITE_SWITCH');\n  const scoped=previousCommandId!==undefined;"],
    ["function jhAbortDeviceWorkflows56(deviceId,reason){\n  if(!deviceId)return 0;", "function jhAbortDeviceWorkflows56(deviceId,reason){\n  if(!deviceId)return 0;\n  jhDiscardPayments56(deviceId,undefined,reason);"]
  ];
  let next=source;
  for(const [a,b] of changes){if(next.split(a).length!==2||next.includes(b))throw Error('PAYMENT_DISCARD_ANCHOR_CHANGED');next=next.replace(a,b);}
  let restored=next;for(const [a,b] of [...changes].reverse())restored=restored.replace(b,a);
  if(restored!==source)throw Error('PAYMENT_DISCARD_SCOPE_CHANGED');
  return next;
}
export function patchDurableMcpWorkflowCleanRestartPayment56(source){
  return patchJH155AllModules(patchJH155SplitIntegration(preserveAbortFences56(patchSearchDecision(patchResultVerificationRuntime(bindPaymentDiscard56(patchPaymentRuntime(patchDurableMcpWorkflowCleanRestart56(source))))))));
}

function preserveAbortFences56(source){
  const changes=[
    ["function jhRequireWorkflow56(w){if(jhMcpWorkflows56.get(w.id)!==w)throw Error('site_switch_discarded');}","function jhRequireWorkflow56(w){if(jhMcpWorkflows56.get(w.id)!==w)throw Error('site_switch_discarded');if(w.phase==='ABORTED_BY_TERMINATION')throw Error('workflow_aborted_by_termination_no_replay');}"],
    ["}catch(e){if(jhMcpWorkflows56.get(w.id)!==w)return textResult({ok:false,code:'site_switch_discarded'});w.phase='NEEDS_REVIEW';", "}catch(e){if(jhMcpWorkflows56.get(w.id)!==w)return textResult({ok:false,code:'site_switch_discarded'});if(w.phase==='ABORTED_BY_TERMINATION')return textResult({ok:false,code:'workflow_aborted_by_termination_no_replay',...jhWorkflowView56(w)});w.phase='NEEDS_REVIEW';"]
  ];
  let out=source;for(const [before,after] of changes){if(out.split(before).length!==2)throw Error('JH_ABORT_FENCE_ANCHOR_CHANGED');out=out.replace(before,after);}return out;
}
