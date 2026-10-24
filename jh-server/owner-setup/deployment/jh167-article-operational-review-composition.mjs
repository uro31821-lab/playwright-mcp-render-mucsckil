import {patchJH167ConnectionV2Runtime} from './jh167-connection-v2-runtime.mjs';
import {patchJH167RightPaneOrchestrator56} from './jh167-right-pane-orchestrator-repair.mjs';
/** JH167 NEWS offline/opt-in composition over the actual Secure56 patch order.
 * On pinned 2026-10-22 source, the existing JH167 official registrar applies the split namespace/readback patches exactly once.
 * Do not apply the legacy JH167 split fixes a second time.
 * No token/key/approval/host-catalog changes. New OAuth MCP tool is gated OFF.
 */
import {patchDurableMcpWorkflowCleanRestartPayment56} from './durable-payment-clean-restart-patch.mjs';
import {applyJH167ReadOnlyRegistry56} from './jh167-operational-guide-reservation-patch.mjs';
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
/** Minimal server-only route repair; reuse the verified FIX4 right URL handler.
 * A target of "chrome" in FIX4 activates the app/pane-only shortcut, skipping
 * URL entry. A neutral target with an explicit HTTPS URL reaches openDirectWeb.
 * Restrict to the existing life_open_service tool; no other execution path changes.
 */
export function patchJH167RightWebUrl56(source){
 if(typeof source!=='string')throw Error('JH_RIGHT_URL_RUNTIME_REQUIRED');
 const start='  registerOAuthTool("life_open_service",{';
 const end='  registerOAuthTool("life_naver_mail",{';
 if(source.split(start).length!==2||source.split(end).length!==2)
   throw Error('JH_RIGHT_URL_SERVICE_SCOPE_CHANGED');
 const begin=source.indexOf(start),finish=source.indexOf(end,begin);
 if(begin<0||finish<=begin)throw Error('JH_RIGHT_URL_SERVICE_ORDER_CHANGED');
 const original=source.slice(begin,finish);
 let patched=original;
 const swaps=[
   ['const j=mk("open_url",{target:"chrome",url});',
    'const j=mk("open_url",{target:"right_web_link",url});'],
   ['const j=mk("open_url",{target:"chrome",url:raw});',
    'const j=mk("open_url",{target:"right_web_link",url:raw});'],
 ];
 for(const [oldValue,newValue] of swaps){
   if(patched.split(oldValue).length!==2||patched.includes(newValue))
     throw Error('JH_RIGHT_URL_EXACT_ROUTE_MISMATCH');
   patched=patched.replace(oldValue,newValue);
 }
 let reversed=patched;
 for(const [oldValue,newValue] of swaps.slice().reverse()){
   if(reversed.split(newValue).length!==2)throw Error('JH_RIGHT_URL_REVERSE_ANCHOR');
   reversed=reversed.replace(newValue,oldValue);
 }
 if(reversed!==original)throw Error('JH_RIGHT_URL_OUT_OF_SCOPE');
 return source.slice(0,begin)+patched+source.slice(finish);
}


/** Web-name restoration using the existing JH167 signed RIGHT Chrome route.
 * Official KakaoTalk and KakaoT pages are information pages, not chat/booking.
 * Explicit KakaoT APP launch still uses the original native route.
 */
export function patchJH167OfficialWebServiceNames56(source){
 if(typeof source!=='string')throw Error('JH_WEB_NAMES_STRING_REQUIRED');
 const start='  registerOAuthTool("life_open_service",{';
 const end='  registerOAuthTool("life_naver_mail",{';
 if(source.split(start).length!==2||source.split(end).length!==2)
   throw Error('JH_WEB_NAMES_SCOPE_CHANGED');
 const begin=source.indexOf(start),finish=source.indexOf(end,begin);
 if(begin<0||finish<=begin)throw Error('JH_WEB_NAMES_ORDER_CHANGED');
 const original=source.slice(begin,finish);
 const oldMap='      [["라프텔","laftel"],"https://laftel.net"],';
 const newMap=[
  '      [["카카오톡","카톡","kakaotalk"],"https://www.kakaocorp.com/page/service/service/KakaoTalk"],',
  '      [["카카오t","카카오티","카카오 티","kakao t"],"https://www.kakaocorp.com/page/service/service/KakaoT"],',
  '      [["유튜브 뮤직","유튜브뮤직","youtube music","yt music","ytmusic"],"https://music.youtube.com/"],',
  oldMap
 ].join('\n');
 const nativeOld='if(["카카오t","카카오티","kakao t","카카오 택시"].some(k=>s.includes(k))){';
 const nativeNew='if(["카카오t","카카오티","kakao t","카카오 택시"].some(k=>s.includes(k)) && /(?:앱|native app)/.test(s)){';
 if(original.split(oldMap).length!==2||original.includes('page/service/service/KakaoTalk')||
    original.split(nativeOld).length!==2||original.includes(nativeNew))
   throw Error('JH_WEB_NAMES_EXACT_SCOPE_CHANGED');
 const patched=original.replace(oldMap,newMap).replace(nativeOld,nativeNew);
 if(patched.replace(nativeNew,nativeOld).replace(newMap,oldMap)!==original)
   throw Error('JH_WEB_NAMES_REVERSE_CHANGED');
 return source.slice(0,begin)+patched+source.slice(finish);
}

export function patchJH167OperationalArticleReview56(runtimeSource){
 const existing=patchDurableMcpWorkflowCleanRestartPayment56(runtimeSource);
 // Reuse the deployed, reviewed JH167 split readback / nonce patch once.
 // It fails closed if old anchors drift or patches were applied unexpectedly.
 const withGuides=applyJH167ReadOnlyRegistry56(existing);
 assertExistingSplitProtection56(withGuides);
 const candidate=makeJH167ArticleReadReviewCandidate(withGuides);
 assertExistingSplitProtection56(candidate);
 requireOnce(candidate, "if ((jhNewsReviewRequested && jhNewsReviewCatalogAuthorized) || jhNewsProductionAuthorized) {",
   'JH167_NEWS_CATALOG_GATE_MISSING');
 for(const guard of [
   "process.env.JH_NEWS_FULLTEXT_CATALOG_SCOPE==='CI_SYNTHETIC_LOCAL_ONLY'",
   "process.env.RENDER_SERVICE_ID===undefined",
   "if (jhNewsReviewRequested && !jhNewsReviewCatalogAuthorized)",
   "process.env.JH_DURABLE_RELEASE==='SERVE_READY_V1'",
   "process.env.RENDER_SERVICE_ID==='srv-db0fjl2d0e5s73be114g'"
 ]) requireOnce(candidate,guard,'JH167_NEWS_RELEASE_SCOPE_GUARD_MISSING');
 if(candidate.split("process.env.JH_OWNER_DEFER_LISTEN==='1'").length!==3)
   throw Error('JH167_NEWS_EXISTING_AND_RELEASE_OWNER_FENCE_MISSING');
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
 return patchJH167RightPaneOrchestrator56(patchJH167OfficialWebServiceNames56(patchJH167RightWebUrl56(patchJH167ConnectionV2Runtime(candidate))));
}
