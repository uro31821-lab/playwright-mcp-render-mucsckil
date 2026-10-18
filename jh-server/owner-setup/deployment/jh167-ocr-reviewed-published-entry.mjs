/**
 * JH167 Fold8 OCR: separate explicitly approved boot path.
 *
 * The production published-host-router.mjs, pinned Owner/Unified/Functional
 * source, and G3 Durable Clean Restart wrapper remain byte-for-byte intact.
 * This module is NEVER selected by npm start. Operating deployment would
 * require an explicit, separate Render startup-command change and approval.
 *
 * No automatic task replay, screen consent, image capture or OCR-start.
 */
import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {assertPublishedHost,requirePcNodeVersion} from './published-host-router.mjs';
import {buildCleanRestartRelease56} from './durable-clean-restart-release.mjs';

const DIR=path.dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT=path.resolve(DIR,'..');
const HOST_ROOT=path.dirname(SOURCE_ROOT);
const OCR_NAME='durable-live-clean-restart-ocr-generated.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
function fail(code){throw Object.assign(new Error(code),{code});}
function replaceOnce(source,before,after,code){
  if(source.split(before).length!==2||source.includes(after))fail(code);
  return source.replace(before,after);
}
export function assertOcrPublishedMode(env,version=process.versions.node){
  if(env?.JH_FOLD8_OCR_REVIEW_ENABLED!=='1')fail('OCR_REVIEW_EXPLICIT_OPT_IN_REQUIRED');
  // This is a reviewed after-first-activation candidate, not an enrollment path.
  if(env?.JH_DURABLE_RELEASE!=='SERVE_READY_V1')fail('OCR_DURABLE_READY_MODE_REQUIRED');
  if(path.basename(SOURCE_ROOT)!=='owner-setup')fail('OCR_PUBLISHED_SOURCE_LAYOUT_REQUIRED');
  // Same two mandatory identity checks used by the real published-host-router
  // before it selects the existing Durable Clean Restart production release.
  assertPublishedHost(HOST_ROOT,SOURCE_ROOT);
  requirePcNodeVersion(version);
  return Object.freeze({ok:true,entry:'explicit_ocr_review',existingPublishedHostValidated:true,
    requiresSeparateRenderStartCommandApproval:true,productionDeployed:false});
}
export function buildOcrCleanRestartRelease56(){
  const legacy=buildCleanRestartRelease56();
  const original=readFileSync(legacy.file,'utf8');
  if(sha(original)!==legacy.sha256)fail('OCR_LEGACY_GENERATED_DIGEST_CHANGED');
  const impOld="import {patchJH167OperationalReadOnly56} from './jh167-operational-guide-reservation-patch.mjs';";
  const impNew="import {patchJH167OperationalOcrReview56} from './jh167-durable-ocr-review-patch.mjs';";
  const callOld='const output=patchJH167OperationalReadOnly56(patchExistingDurableReturnRoute56(input));';
  const callNew="const output=patchJH167OperationalOcrReview56(patchExistingDurableReturnRoute56(input),'1');";
  let next=replaceOnce(original,impOld,impNew,'OCR_GENERATED_IMPORT_ANCHOR');
  next=replaceOnce(next,callOld,callNew,'OCR_GENERATED_CALL_ANCHOR');
  const oldSelf='./durable-live-clean-restart-generated.mjs';
  const newSelf='./'+OCR_NAME;
  const occurrences=next.split(oldSelf).length-1;
  if(occurrences!==legacy.selfReferencesRewritten||occurrences<3||next.includes(newSelf))
    fail('OCR_GENERATED_SELF_REFERENCES_CHANGED');
  next=next.split(oldSelf).join(newSelf);
  // Prove complete reversibility of every generated-file edit.
  const restored=next.split(newSelf).join(oldSelf).replace(callNew,callOld).replace(impNew,impOld);
  if(restored!==original)fail('OCR_GENERATED_OUT_OF_SCOPE_MODIFICATION');
  const out=path.join(DIR,OCR_NAME),tmp=out+'.tmp';
  writeFileSync(tmp,next,{encoding:'utf8',mode:0o600});
  renameSync(tmp,out);
  if(sha(readFileSync(out))!==sha(next))fail('OCR_GENERATED_WRITE_READBACK_FAILED');
  if(sha(readFileSync(legacy.file))!==legacy.sha256)fail('OCR_LEGACY_FILE_CHANGED');
  return Object.freeze({file:out,sha256:sha(next),sourceSha256:legacy.sha256,
    protectedLegacyUnchanged:true,defaultStartUnchanged:true,requiresSeparateOperatorApproval:true});
}
export async function main(env=process.env){
  assertOcrPublishedMode(env);
  const built=buildOcrCleanRestartRelease56();
  const mod=await import(pathToFileURL(built.file).href+'?sha256='+built.sha256);
  const running=await mod.main(env);
  console.log('JH_OCR_REVIEW_EXPLICIT_ENTRY_ACTIVE '+JSON.stringify({
    schema:1,mode:'SERVE_READY_V1',reviewOnly:true,legacyPublishedRouterUnchanged:true,
    ownerIdentityPreserved:true,screenConsentBypass:false,automaticTaskReplay:false}));
  return running;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url))){
  main().catch(e=>{const code=typeof e?.code==='string'&&/^[A-Z_]{3,90}$/.test(e.code)?e.code:'OCR_REVIEW_START_FAILED';
    console.error(code);process.exitCode=1;});
}
