/**
 * Fold8 R1 OCR review-only registration on the REAL Durable Clean Restart runtime.
 * Compose AFTER the existing JH167 operational read-only payment/guide/workflow
 * patches. Never alter SHA-pinned owner-service-entry.mjs or base server.mjs.
 *
 * Flag JH_FOLD8_OCR_REVIEW_ENABLED=1 is explicit opt-in (defaults OFF).
 * This exposes a review prompt only: no consent, image capture, OCR start,
 * result extraction, payment, sending or automatic retries.
 */
import {patchJH167OperationalReadOnly56} from './jh167-operational-guide-reservation-patch.mjs';

const HEAD='import * as jhOcrReviewBridge from "./jh-visual-ocr-review-bridge.mjs";\n'+
 'import {inspectSplitEvidenceForOcr} from "./jh-visual-ocr-split-proof.mjs";\n';
const ANCHOR='  registerOAuthTool("life_android_step",{';
const REGISTRATION=[
 '  // Review ONLY: device-local consent/capture and OCR-start remain separate.',
 '  // The existing Secure56/JH command binding wraps this registration.',
 '  registerOAuthTool("life_android_visual_ocr_review",{',
 '    title:"Review photo OCR availability (no capture)",',
 '    description:"Review an image in the signed RIGHT Android pane; do not approve, capture, start OCR or disclose image/account data.",',
 '    inputSchema:{},',
 '    annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}',
 '  },async()=>{',
 '    const snapshot=await waitJob(mk("agent_snapshot"),9000);',
 '    if(typeof snapshot?.targetDeviceId!=="string"||!snapshot.targetDeviceId)',
 '      return textResult({ok:false,code:"OCR_DEVICE_PIN_REQUIRED",capturePerformed:false,automaticRetry:false});',
 '    const review=jhOcrReviewBridge.readReviewCommand(snapshot,inspectSplitEvidenceForOcr);',
 '    if(!review.ok)return textResult({ok:false,code:review.code,capturePerformed:false,automaticRetry:false});',
 '    const job=await waitJob(mk("agent_step",review.args,snapshot.targetDeviceId),9000);',
 '    return textResult(jhOcrReviewBridge.safeOcrReviewOutcome(job));',
 '  });',
 '',
 ''
].join('\n');
function fail(code){throw Object.assign(new Error(code),{code});}
function count(source,part){return source.split(part).length-1;}

export function patchJH167OperationalOcrReview56(runtimeSource,enabled=process.env.JH_FOLD8_OCR_REVIEW_ENABLED){
  if(![undefined,'0','1'].includes(enabled))fail('JH_OCR_EXPLICIT_FLAG_INVALID');
  const safe=patchJH167OperationalReadOnly56(runtimeSource);
  if(enabled!=='1')return safe; // Byte-for-byte identical to live default.
  if(typeof safe!=='string'||count(safe,ANCHOR)!==1||
     safe.includes('registerOAuthTool("life_android_visual_ocr_review"')||
     safe.includes('jhOcrReviewBridge'))fail('JH_OCR_DURABLE_ANCHOR_MISMATCH');
  const extended=HEAD+safe.replace(ANCHOR,REGISTRATION+ANCHOR);
  if(extended.slice(HEAD.length).replace(REGISTRATION+ANCHOR,ANCHOR)!==safe||
     count(extended,'registerOAuthTool("life_android_visual_ocr_review"')!==1||
     !extended.includes('jhRequireCommand56(')||
     !extended.includes('jhInspectSplitEvidence155'))
    fail('JH_OCR_DURABLE_SCOPE_OR_GUARDS_CHANGED');
  return extended;
}
