/** Review-only additive Chrome address evidence in the existing MAC-accepted
 * native Android snapshot callback. No new Android job, credentials or approval.
 */
const EXTRA_IMPORT="import {extractVerifiedChromeAddressUrl as jhExtractChromeAddress56} from '../guide-13/chrome-address-evidence.mjs';\n";
const RETURN_ANCHOR="      return {verified:true,command_id:commandId,\n        source_ref:'JH_SIGNED_RIGHT:'";
const ADDED_CALL="      const chrome_address_evidence=jhExtractChromeAddress56(rows,{\n        workPackage:proof.workPackage,workWindowId:proof.workWindowId,observedAtMs:proof.observedAtMs});\n"+RETURN_ANCHOR;
const FIELD_ANCHOR="        selected_tab_titles,\n        observation:{app:proof.workPackage";
const ADDED_FIELD="        selected_tab_titles,browser_address_evidence:chrome_address_evidence,\n        observation:{app:proof.workPackage";
export function patchJH167ChromeAddressEvidence56(source){
 if(typeof source!=='string'||source.includes(EXTRA_IMPORT.trim())||
    source.includes('browser_address_evidence:chrome_address_evidence'))
   throw Error('JH167_BROWSER_URL_ALREADY_PATCHED');
 if(source.split(RETURN_ANCHOR).length!==2||source.split(FIELD_ANCHOR).length!==2||
    !source.includes("const proof=jhInspectSplitEvidence155(done.result,rows);")||
    !source.includes("done.secureSessionId!==auth.sessionId"))
   throw Error('JH167_BROWSER_URL_SIGNED_READBACK_ANCHOR_CHANGED');
 const next=EXTRA_IMPORT+source.replace(RETURN_ANCHOR,ADDED_CALL).replace(FIELD_ANCHOR,ADDED_FIELD);
 if(restoreBeforeJH167ChromeAddressEvidence56(next)!==source)
   throw Error('JH167_BROWSER_URL_PATCH_SCOPE_CHANGED');
 return next;
}
export function restoreBeforeJH167ChromeAddressEvidence56(patched){
 if(!patched.startsWith(EXTRA_IMPORT)||patched.split(ADDED_CALL).length!==2||
    patched.split(ADDED_FIELD).length!==2)
   throw Error('JH167_BROWSER_URL_REVERSE_UNAVAILABLE');
 return patched.slice(EXTRA_IMPORT.length).replace(ADDED_FIELD,FIELD_ANCHOR).replace(ADDED_CALL,RETURN_ANCHOR);
}
