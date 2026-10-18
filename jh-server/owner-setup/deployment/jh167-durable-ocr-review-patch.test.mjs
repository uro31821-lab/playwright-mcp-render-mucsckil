import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {buildCleanRestartRelease56} from './durable-clean-restart-release.mjs';
import {buildOcrCleanRestartRelease56,assertOcrPublishedMode} from './jh167-ocr-reviewed-published-entry.mjs';
import {patchJH167OperationalOcrReview56} from './jh167-durable-ocr-review-patch.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ownerPath=path.join(root,'deployment/owner-service-entry.mjs');
const ownerBlob=buf=>createHash('sha1').update('blob '+buf.length+'\0').update(buf).digest('hex');
const sha=buf=>createHash('sha256').update(buf).digest('hex');
const OWNER_PIN='de6022b1a9b984cfa46e3be5f96093966d5a1ff2';
const COMPOSED_TOOL='registerOAuthTool("life_android_visual_ocr_review"';
const GENERATED='server-durable-native-return-route56.mjs';

test('REAL Durable Clean Restart: exact legacy startup unchanged; optional sibling OCR; byte-for-byte rollback',async()=>{
 assert.equal(ownerBlob(readFileSync(ownerPath)),OWNER_PIN);
 const gen=buildCleanRestartRelease56();
 assert.equal(gen.selfReferencesRewritten,3);
 const baselineGeneratedSource=readFileSync(gen.file,'utf8');
 assert.ok(baselineGeneratedSource.includes(
  "import {patchJH167OperationalReadOnly56} from './jh167-operational-guide-reservation-patch.mjs';"));
 assert.ok(baselineGeneratedSource.includes(
  'const output=patchJH167OperationalReadOnly56(patchExistingDurableReturnRoute56(input));'));
 const live=await import(pathToFileURL(gen.file).href+'?test=ocr-base');
 const routed=live.buildDurableRoutedOperationalEntrypoint(root);
 assert.ok(routed.file.endsWith('operational-service-durable-return-route56.mjs'));
 assert.ok(routed.runtimeFile.endsWith(GENERATED));
 const originalRuntime=readFileSync(routed.runtimeFile,'utf8');
 assert.equal(originalRuntime.includes(COMPOSED_TOOL),false);
 assert.ok(originalRuntime.includes('jhRequireCommand56('));
 assert.ok(originalRuntime.includes('jhInspectSplitEvidence155'));
 const baselineDigest=sha(originalRuntime);
 assert.equal(ownerBlob(readFileSync(ownerPath)),OWNER_PIN);
 const optional=buildOcrCleanRestartRelease56();
 assert.notEqual(optional.file,gen.file);
 assert.equal(optional.selfReferencesRewritten,3);
 assert.equal(readFileSync(gen.file,'utf8'),baselineGeneratedSource,'legacy generated file must stay unchanged');
 const optMod=await import(pathToFileURL(optional.file).href+'?test=ocr-sibling');
 const opted=optMod.buildDurableRoutedOperationalEntrypoint(root);
 assert.equal(opted.runtimeFile,routed.runtimeFile);
 const output=readFileSync(opted.runtimeFile,'utf8');
 assert.equal(output.split(COMPOSED_TOOL).length-1,1,'exactly one review-only registration');
 assert.ok(output.includes('jhRequireCommand56('));
 assert.ok(output.includes('jhInspectSplitEvidence155'));
 assert.equal(ownerBlob(readFileSync(ownerPath)),OWNER_PIN,'pinned Owner file never modified');
 assert.notEqual(sha(output),baselineDigest);
 const cmd=spawnSync(process.execPath,['--check',opted.runtimeFile],{encoding:'utf8'});
 assert.equal(cmd.status,0,'generated Durable OCR runtime syntax: '+cmd.stderr);
 const begin=output.indexOf(COMPOSED_TOOL),end=output.indexOf('registerOAuthTool("life_android_step"',begin);
 assert.ok(begin>0&&end>begin,'native step registration preserved');
 const only=output.slice(begin,end);
 assert.ok(only.includes('jhOcrReviewBridge.readReviewCommand'));
 assert.ok(!only.includes('life_android_screen_consent_request'));
 assert.ok(!only.includes('visual_ocr_start'));
 assert.ok(!only.includes('capture_work_window'));
 const reverted=live.buildDurableRoutedOperationalEntrypoint(root);
 assert.equal(sha(readFileSync(reverted.runtimeFile)),baselineDigest,'legacy generation restores exact bytes');
 assert.equal(readFileSync(gen.file,'utf8'),baselineGeneratedSource);
});
test('OCR review flag values fail closed before any runtime changes',()=>{
 assert.throws(()=>patchJH167OperationalOcrReview56('', 'enabled'),/JH_OCR_EXPLICIT_FLAG_INVALID/);
 assert.throws(()=>patchJH167OperationalOcrReview56('', 'true'),/JH_OCR_EXPLICIT_FLAG_INVALID/);
});

test('Explicit reviewed entry refuses missing opt-in and wrong Durable mode before service start',()=>{
 assert.throws(()=>assertOcrPublishedMode({}),/OCR_REVIEW_EXPLICIT_OPT_IN_REQUIRED/);
 assert.throws(()=>assertOcrPublishedMode({JH_FOLD8_OCR_REVIEW_ENABLED:'1'}),/OCR_DURABLE_READY_MODE_REQUIRED/);
 const ok=assertOcrPublishedMode({JH_FOLD8_OCR_REVIEW_ENABLED:'1',JH_DURABLE_RELEASE:'SERVE_READY_V1'});
 assert.equal(ok.ok,true);assert.equal(ok.existingPublishedHostValidated,true);
 assert.equal(ok.productionDeployed,false);
});
