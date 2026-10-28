/**
 * JH167 Playwright cutover inventory — READ ONLY.
 * A passing Android route test is NOT permission to shut down an unrelated
 * Playwright-backed feature (payment, choices or independent media tools).
 */
import {readFileSync} from 'node:fs';
import path from 'node:path';

const REQUIRED=Object.freeze([
  {
    file:'jh-server/owner-setup/server-integration/server.mjs',
    id:'WEB_NAVIGATION',
    markers:['registerOAuthTool("life_web_navigate"','browserTool("browser_navigate"']
  },
  {
    file:'jh-server/owner-setup/server-integration/server.mjs',
    id:'WEB_INTERACTION',
    markers:['registerOAuthTool("life_web_click"','registerOAuthTool("life_web_type"']
  },
  {
    file:'jh-server/owner-setup/server-integration/server.mjs',
    id:'WEB_READBACK',
    markers:['registerOAuthTool("life_web_snapshot"','registerOAuthTool("life_web_screenshot"']
  },
  {
    file:'jh-server/owner-setup/payment/payment-runtime-patch.mjs',
    id:'PAYMENT_BROWSER',
    markers:["browserTool('browser_navigate'","browserTool('browser_snapshot'"]
  },
  {
    file:'jh-server/owner-setup/payment/payment-browser.mjs',
    id:'PAYMENT_EVALUATION',
    markers:["browserTool('browser_evaluate'"]
  },
  {
    file:'jh-server/owner-setup/general-work/bridge.mjs',
    id:'GENERAL_WORK_WEB_PORT',
    markers:["'life_web_navigate'","'life_web_snapshot'"]
  },
  {
    file:'jh-server/owner-setup/deployment/jh167-right-pane-orchestrator-repair.mjs',
    id:'LEGACY_RIGHT_PANE_ROUTING',
    markers:['target:"right_web_link"','registerOAuthTool("life_web_navigate"']
  }
]);
export const CUTOVER_REQUIREMENTS=Object.freeze([
  'CURRENT_ORIGINAL_APK_SOURCE_CONFIRMED',
  'ORIGINAL_SIGNATURE_BUILD_VERIFIED',
  'SIGNED_LEFT_WEB_CAPABILITY_VERIFIED_ON_PHONE',
  'UNFOLDED_LEFT_WEB_RIGHT_GPT_E2E',
  'WEB_OPEN_URL_READBACK_E2E',
  'CLICK_TYPE_SCROLL_AND_RESULT_E2E',
  'PAYMENT_BROWSER_REPLACEMENT_VERIFIED',
  'PAYMENT_LOCAL_APPROVAL_PRESERVED',
  'CHOICE_AND_GENERAL_WORK_REPLACEMENT_VERIFIED',
  'MEDIA_AND_VIDEO_WORKFLOWS_UNAFFECTED',
  'NO_LEGACY_PLAYWRIGHT_DISPATCH_LEFT',
  'ROLLBACK_TESTED'
]);
export function inspectLegacyJHFiles(root) {
  if(typeof root!=='string'||!root)throw Error('SOURCE_ROOT_REQUIRED');
  const dependencies=REQUIRED.map(entry=>{
    const full=path.resolve(root,entry.file);
    // The inventory is anchored to the inspected checkout, not network
    // resources, arbitrary user paths, or live credentials.
    let text;
    try{text=readFileSync(full,'utf8')}catch{
      return {id:entry.id,path:entry.file,present:false,missingSource:true};
    }
    return {id:entry.id,path:entry.file,present:entry.markers.every(m=>text.includes(m)),
      missingSource:false};
  });
  return Object.freeze({
    inspectedModules:dependencies.length,
    dependencies,
    canRemovePlaywrightNow:false,
    rationale:'ANDROID_APK_DEVICE_PARITY_NOT_VERIFIED'
  });
}
/** Documentation-only gate, NEVER a deployment authorization endpoint. */
export function describeCutoverEvidence(evidence={}){
  const present=Array.isArray(evidence?.verifiedRequirements)?
    evidence.verifiedRequirements.filter(x=>CUTOVER_REQUIREMENTS.includes(x)):[];
  const missing=CUTOVER_REQUIREMENTS.filter(x=>!present.includes(x));
  return Object.freeze({
    verifiedRequirements:present.length,
    required:CUTOVER_REQUIREMENTS.length,missing,
    // This module cannot authenticate source proofs and thus must NEVER
    // return a deployment approval, even if caller supplies all strings.
    deployAuthorized:false,
    automaticServiceShutdown:false
  });
}
