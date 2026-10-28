import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,rmSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {patchJH167AndroidDirectReview56} from './review-owner-patch.mjs';
import {buildCleanRestartRelease56} from '../deployment/durable-clean-restart-news-review-entry.mjs';

const root=path.resolve(import.meta.dirname,'..');
const fragment=String.raw
import {x} from './x.mjs';
function mk(type,p={},deviceId=null) {}
function exactEnvelope56() {}
function active56(deviceId) {}
function jhRequireCommand56(device,workflowId=null){}
const jhInspectSplitEvidence155=()=>{};
const SECURE56_TOOL_CATALOG_DIGEST='x';
let durableNativeHooks56=null;
function fake(){jhV2JobAdmission56();durableNativeHooks56?.beforeDispatch(x);durableNativeHooks56?.acceptedCompletion(x);}
function createMcp(){}
;
test('review code refuses drift, duplicate imports, removed durable hooks',()=>{
 const ok=patchJH167AndroidDirectReview56(fragment);
 assert.ok(ok.includes('jhCreateAndroidDirectReviewCandidate56'));
 assert.equal((ok.match(/function createMcp\(\)/g)||[]).length,1);
 assert.throws(()=>patchJH167AndroidDirectReview56(ok),/ALREADY_PRESENT/);
 for(const phrase of ['function mk(type,p={},deviceId=null) {',
  'function exactEnvelope56(','function jhRequireCommand56(device,workflowId=null){',
  'durableNativeHooks56?.beforeDispatch(',
  'durableNativeHooks56?.acceptedCompletion(']){
   assert.throws(()=>patchJH167AndroidDirectReview56(fragment.replace(phrase,'')),
    /ANDROID_HOST_EXACT_SOURCE_ANCHOR|ANDROID_DIRECT_DURABLE_SECURE56_GUARDS_NOT_FOUND/);
 }
});
test('actual JH167 operational owner builds and accepts only isolated guarded patch',
  {timeout:120000},async()=>{
 const release=buildCleanRestartRelease56();
 const mod=await import(pathToFileURL(release.file).href+'?android-review-source');
 const output=mod.buildDurableRoutedOperationalEntrypoint(root);
 const source=readFileSync(output.runtimeFile,'utf8');
 assert.ok(source.includes('registerOAuthTool("life_android_computer_prepare"'));
 assert.ok(source.includes('registerOAuthTool("life_android_execute_computer_action"'));
 const patched=patchJH167AndroidDirectReview56(source);
 const originalTools=(source.match(/registerOAuthTool\(/g)||[]).length;
 assert.equal((patched.match(/registerOAuthTool\(/g)||[]).length,originalTools);
 for(const guard of [
  'jhV2BeginAdmission56();','jhV2JobAdmission56();',
  'durableNativeHooks56?.beforeDispatch(','durableNativeHooks56?.acceptedCompletion(',
  'jhRequireCommand56(device,workflowId=null)', 'jhInspectSplitEvidence155'
 ])assert.ok(patched.includes(guard),guard);
 // On-disk candidate is temporary and remains beside the actual generated
 // owner runtime so relative import resolution is unchanged.
 const candidate=path.join(path.dirname(output.runtimeFile),'server-jh-android-direct-CI-only.mjs');
 try{
  writeFileSync(candidate,patched,{encoding:'utf8',mode:0o600});
  const parse=spawnSync(process.execPath,['--check',candidate],{
    encoding:'utf8',timeout:20000});
  assert.equal(parse.status,0,'Candidate parse rejected: '+parse.stderr);
  assert.equal(readFileSync(output.runtimeFile,'utf8'),source,'original changed');
  // Import only in deferred-listener/test mode. No jobs are created.
  const script="const m=await import("+JSON.stringify(pathToFileURL(candidate).href)+");"
   +"if(typeof m.jhCreateAndroidDirectReviewCandidate56!=='function')process.exit(3);"
   +"try{m.jhCreateAndroidDirectReviewCandidate56();process.exit(2)}catch(e){"
   +"if(e.message!=='JH_ANDROID_DIRECT_CANDIDATE_NOT_AUTHORIZED')process.exit(4)}";
  const child=spawnSync(process.execPath,['--input-type=module','-e',script],{
    cwd:root,encoding:'utf8',timeout:25000,
    env:{...process.env,JH_OWNER_DEFER_LISTEN:'1',
      JH_ANDROID_DIRECT_CANDIDATE:'DISABLED',NODE_ENV:'test',RENDER_SERVICE_ID:''}});
  assert.equal(child.status,0,'Review-only import/guard failed: '+child.stderr.slice(0,1400));
 }finally{rmSync(candidate,{force:true});}
});
