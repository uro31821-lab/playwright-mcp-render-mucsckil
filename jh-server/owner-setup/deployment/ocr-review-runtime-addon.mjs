/** Optional Fold8 OCR review-only MCP extension AFTER pinned Functional runtime verification.
 * Does not approve, capture, start OCR, replay, pay or deploy.
 * The existing pinned Owner/Unified/Functional runtime files remain unchanged.
 */
import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
const sha=b=>createHash('sha256').update(b).digest('hex');
const EXPECTED_FUNCTIONAL='d899c0b2ead9c5c9c8e4a2ae1857b15239960e0ec3933b34ff63b9dfe84625c5';
const PREFIX='import * as jhOcrReviewBridge from "./jh-visual-ocr-review-bridge.mjs";\n'+
 'import {inspectSplitEvidenceForOcr} from "./jh-visual-ocr-split-proof.mjs";\n';
const ANCHOR='  registerOAuthTool("life_android_step",{';
const ADDON=[
'  // Optional review-only command. No OS consent, capture, OCR-start or replay.',
'  registerOAuthTool("life_android_visual_ocr_review",{',
'    title:"Review photo OCR availability (no capture)",',
'    description:"Review photo in freshly verified split work pane. Does not consent, capture or start OCR.",',
'    inputSchema:{},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}',
'  },async()=>{',
'    const snapshot=await waitJob(mk("agent_snapshot"),9000);',
'    const review=jhOcrReviewBridge.readReviewCommand(snapshot,inspectSplitEvidenceForOcr);',
'    if(!review.ok)return textResult({ok:false,code:review.code,capturePerformed:false,automaticRetry:false});',
'    const job=await waitJob(mk("agent_step",review.args,snapshot.targetDeviceId),9000);',
'    return textResult(jhOcrReviewBridge.safeOcrReviewOutcome(job));',
'  });',
'',
''
].join('\n');
function fail(code){throw Object.assign(Error(code),{code});}
export function applyOcrAddonToFunctional(source){
  if(typeof source!=='string'||sha(source)!==EXPECTED_FUNCTIONAL)fail('OCR_FUNCTIONAL_BASE_SHA_MISMATCH');
  if(source.split(ANCHOR).length!==2||source.includes('registerOAuthTool("life_android_visual_ocr_review"'))
    fail('OCR_RUNTIME_ANCHOR_INVALID');
  const extended=PREFIX+source.replace(ANCHOR,ADDON+ANCHOR);
  if(extended.slice(PREFIX.length).replace(ADDON,'')!==source)
    fail('OCR_RUNTIME_NONREVERSIBLE');
  return extended;
}
export function buildOcrReviewRuntime(root,functionalPath){
  if(typeof root!=='string'||typeof functionalPath!=='string')fail('OCR_RUNTIME_PATH_INVALID');
  const expectedPath=path.join(root,'server-integration','server-functional.mjs');
  if(path.resolve(functionalPath)!==path.resolve(expectedPath))fail('OCR_FUNCTIONAL_PATH_MISMATCH');
  // Caller MUST first verify the pinned Owner, Unified and Functional builds.
  const source=readFileSync(expectedPath,'utf8');
  const extended=applyOcrAddonToFunctional(source);
  const output=path.join(root,'server-integration','server-functional-ocr.mjs');
  const tmp=output+'.tmp';
  writeFileSync(tmp,extended,{mode:0o600});renameSync(tmp,output);
  if(sha(readFileSync(output))!==sha(extended))fail('OCR_RUNTIME_WRITE_VERIFY_FAILED');
  const evidence={schema:1,baseFunctionalSha256:EXPECTED_FUNCTIONAL,candidateSha256:sha(extended),
    baseUnchanged:sha(readFileSync(expectedPath))===EXPECTED_FUNCTIONAL,
    rollback:'omit explicit OCR opt-in',defaultEnabled:false,productionDeployment:false,
    consentBypass:false,operation:'visual_ocr_review only'};
  writeFileSync(path.join(root,'evidence','ocr-review-runtime-identity.json'),
    JSON.stringify(evidence,null,2)+'\n',{mode:0o600});
  return output;
}
