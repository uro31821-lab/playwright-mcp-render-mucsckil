import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,copyFileSync,mkdirSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {applyOcrAddonToFunctional,buildOcrReviewRuntime} from './ocr-review-runtime-addon.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const functional=path.join(root,'server-integration','server-functional.mjs');
const sha=x=>createHash('sha256').update(x).digest('hex');
const source=readFileSync(functional,'utf8');
test('exact pinned Functional runtime produces an additive OCR review tool',()=>{
 const out=applyOcrAddonToFunctional(source);
 assert.ok(out.includes('registerOAuthTool("life_android_visual_ocr_review"'));
 assert.ok(out.includes('registerOAuthTool("life_android_step"'));
 assert.equal(out.includes('registerOAuthTool("life_android_visual_ocr_start"'),false);
 assert.notEqual(sha(out),sha(source));
});
test('modified Functional baseline must fail closed',()=>{
 assert.throws(()=>applyOcrAddonToFunctional(source+'\n'),/OCR_FUNCTIONAL_BASE_SHA_MISMATCH/);
});
test('OCR addon cannot be applied twice',()=>{
 assert.throws(()=>applyOcrAddonToFunctional(applyOcrAddonToFunctional(source)),/OCR_FUNCTIONAL_BASE_SHA_MISMATCH/);
});
test('reject an unexpected Functional path',()=>{
 assert.throws(()=>buildOcrReviewRuntime('/tmp','/tmp/other.mjs'),/OCR_FUNCTIONAL_PATH_MISMATCH/);
});
test('isolate overlay without mutating the pinned Functional file',()=>{
 const tmp=mkdtempSync(path.join(tmpdir(),'jh-fold8-ocr-'));
 try{
   mkdirSync(path.join(tmp,'server-integration'),{recursive:true});
   mkdirSync(path.join(tmp,'evidence'),{recursive:true});
   const file=path.join(tmp,'server-integration','server-functional.mjs');
   copyFileSync(functional,file);
   const origSha=sha(readFileSync(file));
   const out=buildOcrReviewRuntime(tmp,file);
   assert.ok(existsSync(out));
   assert.equal(sha(readFileSync(file)),origSha);
   const evidence=JSON.parse(readFileSync(path.join(tmp,'evidence','ocr-review-runtime-identity.json'),'utf8'));
   assert.equal(evidence.baseUnchanged,true);
   assert.equal(evidence.defaultEnabled,false);
   assert.equal(evidence.productionDeployment,false);
   assert.equal(evidence.consentBypass,false);
 }finally{rmSync(tmp,{recursive:true,force:true});}
});
