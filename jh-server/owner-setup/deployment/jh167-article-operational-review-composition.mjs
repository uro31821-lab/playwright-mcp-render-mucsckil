/** JH167 NEWS offline/opt-in composition over the actual Secure56 patch order.
 * CleanRestartPayment applies JH155 split namespace and readback first.
 * Do not apply the legacy JH167 split fixes a second time.
 * No token/key/approval/host-catalog changes. New OAuth MCP tool is gated OFF.
 */
import {patchDurableMcpWorkflowCleanRestartPayment56} from './durable-payment-clean-restart-patch.mjs';
import {patchJH167GuideAndReservation} from './guide13-reservation-composition-patch.mjs';
import {makeJH167ArticleReadReviewCandidate} from './jh167-article-review-composition-patch.mjs';

const readbackAlreadyApplied = "const readOnlyComfort=['split_comfort_status','split_comfort_manual_handoff',\n        'split_comfort_keyboard_advice','split_comfort_restore_info',\n        'split_screen_session_start','split_screen_session_status'].includes(type);";
const readbackOld = "const readOnlyComfort=['split_comfort_status','split_comfort_manual_handoff',\n        'split_comfort_keyboard_advice','split_comfort_restore_info'].includes(type);";
const splitNonceAlreadyApplied='const startPayload={splitSessionNonce:workflowId,...(args.goal===undefined?{}:{goal:args.goal})};';
const splitNonceOld='const startPayload={workflowId,...(args.goal===undefined?{}:{goal:args.goal})};';
const secureCatalog='const SECURE56_TOOL_CATALOG_DIGEST="a777e1a88a0b7633ba983ca3054d2eb28f3b9c41596e0a46b93597d478a42ca1";';
const requireOnce=(s,needle,code)=>{if(s.split(needle).length!==2)throw Error(code);};
export function assertExistingSplitProtection56(s){
 if(typeof s!=='string')throw Error('JH167_RUNTIME_STRING_REQUIRED');
 requireOnce(s,readbackAlreadyApplied,'JH167_EXISTING_SPLIT_READBACK_NOT_VERIFIED');
 requireOnce(s,splitNonceAlreadyApplied,'JH167_EXISTING_SPLIT_NONCE_NOT_VERIFIED');
 if(s.includes(readbackOld)||s.includes(splitNonceOld))throw Error('JH167_LEGACY_SPLIT_PATCH_PRESENT');
 for(const needle of ['jhRequireCommand56(device)','jhInspectSplitEvidence155',
   'jhScreenUnderstanding56','jhSplitScreenJob56(',secureCatalog]){
   if(!s.includes(needle))throw Error('JH167_EXISTING_SECURITY_GUARD_MISSING');
 }
 return true;
}
export function patchJH167OperationalArticleReview56(runtimeSource){
 const existing=patchDurableMcpWorkflowCleanRestartPayment56(runtimeSource);
 assertExistingSplitProtection56(existing);
 const withGuides=patchJH167GuideAndReservation(existing);
 assertExistingSplitProtection56(withGuides);
 const candidate=makeJH167ArticleReadReviewCandidate(withGuides);
 assertExistingSplitProtection56(candidate);
 requireOnce(candidate, "if (process.env.JH_NEWS_FULLTEXT_REVIEW_ENABLED==='1') {",
   'JH167_NEWS_FEATURE_FLAG_MISSING');
 requireOnce(candidate,'jhRegisterArticleReadCandidate({enabled:true',
   'JH167_NEWS_TOOL_NOT_GATED');
 for(const needle of [secureCatalog, 'const registerOAuthTool=(name,config,handler)=>{',
     'function jhRequireCommand56(device,workflowId=null){',
     'readVerifiedRight:(question,commandId)=>jhReadRightEvidence56(question,commandId)',
     '  jhRegisterReservationLinkTools({registerOAuthTool,z,textResult,',
     '  jhRegisterGuide13Tools({registerOAuthTool,z,textResult,']) {
   if(!existing.includes(needle) && !candidate.includes(needle)){
     throw Error('JH167_EXISTING_HOST_BOUNDARY_MISSING');
   }
 }
 if(!candidate.includes(secureCatalog)||!candidate.includes('const registerOAuthTool=(name,config,handler)=>{'))
   throw Error('JH167_SECURE_CATALOG_FENCE_CHANGED');
 // Only add an import at the start and the gated OAuth registrar beside guide13.
 const importLine="import {registerJHArticleReadCandidate as jhRegisterArticleReadCandidate} from '../guide-13/article-host-readonly.mjs';\n";
 const withoutImport=candidate.slice(importLine.length);
 if(!candidate.startsWith(importLine)||
    withoutImport.replace(/\n  \/\/ NEWS ADDON REVIEW-ONLY\.[\s\S]*?\n  }(?=\n)/,'')!==withGuides)
   throw Error('JH167_NEWS_COMPOSITION_SCOPE_CHANGED');
 return candidate;
}
