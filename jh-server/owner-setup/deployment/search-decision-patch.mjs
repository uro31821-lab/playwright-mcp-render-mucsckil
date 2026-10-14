/** Append feature tools after sealed runtime generators without altering auth. */
const prefix="import {DecisionStore} from '../deployment/search-decision.mjs';\nimport {registerChoiceTools} from '../deployment/search-decision-tools.mjs';\nconst jhDecisionStoreV2=new DecisionStore({directory:process.env.JH_CHOICE_STATE_DIR||null,captureBinding:()=>jhPaymentLifecycle.captureBinding({})});\n";
const call="  registerChoiceTools({registerOAuthTool,z,textResult,browserTool,store:jhDecisionStoreV2});\n";
export function patchSearchDecision(source){
 const anchor='  registerOAuthTool("life_status",{';
 if(typeof source!=='string'||source.split(anchor).length!==2||source.includes('const jhDecisionStoreV2='))throw Error('CHOICE_RUNTIME_ANCHOR_CHANGED');
 const output=prefix+source.replace(anchor,call+anchor);
 if(output.slice(prefix.length).replace(call+anchor,anchor)!==source)throw Error('CHOICE_PATCH_SCOPE_CHANGED');
 return output;
}
