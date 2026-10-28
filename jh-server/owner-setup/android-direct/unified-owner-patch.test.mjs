import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,rmSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {buildCleanRestartRelease56} from '../deployment/durable-clean-restart-news-review-entry.mjs';
import {patchJH167AndroidDirectReview56} from './review-owner-patch.mjs';
import {patchJH167UnifiedOwnerReview56} from './unified-owner-patch.mjs';
const root=path.resolve(import.meta.dirname,'..');

test('unified CI patch refuses missing Secure56 journal and changed registration',()=>{
 const src=[
 "import {a} from './a.mjs';",
 'function jhCreateAndroidDirectReviewCandidate56(){}',
 'function jhRequireCommand56(device,workflowId=null){}',
 'const SECURE56_TOOL_CATALOG_DIGEST="x";',
 'function fake(){durableNativeHooks56?.beforeDispatch(a);durableNativeHooks56?.acceptedCompletion(a);}',
 'function createMcp(){',
 '  registerOAuthTool("life_status",{',
 '}'
 ].join('\n');
 const one=patchJH167UnifiedOwnerReview56(src);
 assert.equal((one.match(/registerOAuthTool\('life_android_unified_ci_only'/g)||[]).length,1);
 assert.ok(one.includes('JH_ANDROID_UNIFIED_CI_ONLY'));
 assert.ok(one.includes('readSignedCapability:async()=>null'));
 assert.throws(()=>patchJH167UnifiedOwnerReview56(one),/ALREADY_PATCHED/);
 for(const needle of ['function createMcp(){',
  'durableNativeHooks56?.acceptedCompletion(',
  'function jhRequireCommand56(device,workflowId=null){}',
  'const SECURE56_TOOL_CATALOG_DIGEST=']){
  assert.throws(()=>patchJH167UnifiedOwnerReview56(src.replace(needle,'')),
    /JH_UNIFIED_SOURCE_GUARD_CHANGED/);
 }
});
test('actual JH167 owner composes one CI-only unified tool, old production remains unmodified',
{timeout:120000},async()=>{
 const release=buildCleanRestartRelease56();
 const mod=await import(pathToFileURL(release.file).href+'?unified-review-ci');
 const built=mod.buildDurableRoutedOperationalEntrypoint(root);
 const original=readFileSync(built.runtimeFile,'utf8');
 const stage2=patchJH167AndroidDirectReview56(original);
 const stage3=patchJH167UnifiedOwnerReview56(stage2);
 const oldCount=(original.match(/registerOAuthTool\(/g)||[]).length;
 const newCount=(stage3.match(/registerOAuthTool\(/g)||[]).length;
 assert.equal(newCount,oldCount+1);
 for(const tag of ['jhV2BeginAdmission56','jhV2JobAdmission56',
  'durableNativeHooks56?.beforeDispatch(',
  'durableNativeHooks56?.acceptedCompletion(',
  'life_android_computer_prepare','life_android_execute_computer_action',
  "const SECURE56_TOOL_CATALOG_DIGEST="])assert.ok(stage3.includes(tag),tag);
 assert.equal(stage3.includes('browserTool("browser_navigate",{url:a.target})'),false);
 const candidate=path.join(path.dirname(built.runtimeFile),'server-jh-android-unified-ci-only.mjs');
 try{
  writeFileSync(candidate,stage3,{encoding:'utf8',mode:0o600});
  const parse=spawnSync(process.execPath,['--check',candidate],{encoding:'utf8',timeout:15000});
  assert.equal(parse.status,0,parse.stderr);
  assert.equal(readFileSync(built.runtimeFile,'utf8'),original,'Original JH runtime was mutated');
  const script=[
    "const m=await import("+JSON.stringify(pathToFileURL(candidate).href)+");",
    "if(typeof m.jhCreateUnifiedAndroidReviewCandidate56!=='function')process.exit(1);",
    "const c=m.jhCreateUnifiedAndroidReviewCandidate56();",
    "if(c.capabilities().playwrightFallback!==false)process.exit(2);",
    "const x=await c.run({mode:'OPEN_WEB',commandId:'a'.repeat(32),operationId:'b'.repeat(32),target:'네이버 메일'});",
    "if(x.ok||x.code!=='CURRENT_SIGNED_OWNER_COMMAND_REQUIRED')process.exit(3);"
  ].join('\n');
  const run=spawnSync(process.execPath,['--input-type=module','-e',script],{
    encoding:'utf8',cwd:root,timeout:20000,
    env:{...process.env,CI:'true',NODE_ENV:'test',
      JH_OWNER_DEFER_LISTEN:'1',
      JH_ANDROID_DIRECT_CANDIDATE:'CI_SYNTHETIC_ONLY',
      JH_ANDROID_UNIFIED_CI_ONLY:'1'}
  });
  assert.equal(run.status,0,'CI generated owner boot failed: '+run.stderr.slice(0,2000));
 }finally{rmSync(candidate,{force:true});}
});
