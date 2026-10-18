import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {buildCleanRestartRelease56} from './durable-clean-restart-release.mjs';
import {patchJH167OperationalOcrReview56} from './jh167-durable-ocr-review-patch.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ownerPath=path.join(root,'deployment/owner-service-entry.mjs');
const ownerBlob=buf=>createHash('sha1').update('blob '+buf.length+'\0').update(buf).digest('hex');
const sha=buf=>createHash('sha256').update(buf).digest('hex');
const OWNER_PIN='de6022b1a9b984cfa46e3be5f96093966d5a1ff2';
const COMPOSED_TOOL='registerOAuthTool("life_android_visual_ocr_review"';
const GENERATED='server-durable-native-return-route56.mjs';

test('REAL Durable Clean Restart generation: Owner unchanged, OCR default off, same baseline bytes',async()=>{
 const original=readFileSync(ownerPath);
 assert.equal(ownerBlob(original),OWNER_PIN,'exact protected owner source required');
 delete process.env.JH_FOLD8_OCR_REVIEW_ENABLED;
 const gen=buildCleanRestartRelease56();
 assert.ok(gen.selfReferencesRewritten>=3);
 const live=await import(pathToFileURL(gen.file).href+'?test=draft18');
 assert.equal(typeof live.buildDurableRoutedOperationalEntrypoint,'function');
 const routed=live.buildDurableRoutedOperationalEntrypoint(root);
 assert.ok(routed.file.endsWith('operational-service-durable-return-route56.mjs'));
 assert.ok(routed.runtimeFile.endsWith(GENERATED));
 const originalRuntime=readFileSync(routed.runtimeFile,'utf8');
 assert.equal(originalRuntime.includes(COMPOSED_TOOL),false);
 assert.ok(originalRuntime.includes('jhRequireCommand56('));
 assert.ok(originalRuntime.includes('jhInspectSplitEvidence155'));
 assert.equal(ownerBlob(readFileSync(ownerPath)),OWNER_PIN);
 const baselineDigest=sha(originalRuntime);
 process.env.JH_FOLD8_OCR_REVIEW_ENABLED='1';
 try {
  const opted=live.buildDurableRoutedOperationalEntrypoint(root);
  assert.equal(opted.runtimeFile,routed.runtimeFile);
  const output=readFileSync(opted.runtimeFile,'utf8');
  assert.equal(output.split(COMPOSED_TOOL).length-1,1,'one and only one OCR review registration');
  assert.ok(output.includes('jhRequireCommand56('));
  assert.ok(output.includes('jhInspectSplitEvidence155'));
  assert.equal(ownerBlob(readFileSync(ownerPath)),OWNER_PIN,'Owner file must remain unchanged even after opt-in');
  assert.notEqual(sha(output),baselineDigest);
  const cmd=spawnSync(process.execPath,['--check',opted.runtimeFile],{encoding:'utf8'});
  assert.equal(cmd.status,0,'actual generated Durable runtime syntax: '+cmd.stderr);
  const begin=output.indexOf(COMPOSED_TOOL),end=output.indexOf('registerOAuthTool("life_android_step"',begin);
  assert.ok(begin>0&&end>begin,'right-hand native step tool preserved');
  const only=output.slice(begin,end);
  assert.ok(only.includes('jhOcrReviewBridge.readReviewCommand'));
  assert.ok(!only.includes('life_android_screen_consent_request'));
  assert.ok(!only.includes('visual_ocr_start'));
  assert.ok(!only.includes('capture_work_window'));
 }finally{delete process.env.JH_FOLD8_OCR_REVIEW_ENABLED;}
 const reverted=live.buildDurableRoutedOperationalEntrypoint(root);
 assert.equal(sha(readFileSync(reverted.runtimeFile)),baselineDigest,'flag-off rollback restores exactly the same runtime bytes');
});
test('explicit flag values fail closed before rewriting source',()=>{
 assert.throws(()=>patchJH167OperationalOcrReview56('', 'enabled'),/JH_OCR_EXPLICIT_FLAG_INVALID/);
 assert.throws(()=>patchJH167OperationalOcrReview56('', 'true'),/JH_OCR_EXPLICIT_FLAG_INVALID/);
});
