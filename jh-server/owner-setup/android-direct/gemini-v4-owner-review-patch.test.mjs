import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,rmSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {buildCleanRestartRelease56} from '../deployment/durable-clean-restart-news-review-entry.mjs';
import {patchJH167AndroidDirectReview56} from './review-owner-patch.mjs';
import {patchJH167UnifiedOwnerReview56} from './unified-owner-patch.mjs';
import {patchJH167V4GeminiRightOwnerReview56} from './gemini-v4-owner-review-patch.mjs';

const root=path.resolve(import.meta.dirname,'..');

test('V4 right-Gemini owner patch inserts exactly one read-only factory without MCP registration',()=>{
 const src=[
  "import {a} from './a.mjs';",
  'function jhCreateAndroidDirectReviewCandidate56(){}',
  'function jhCreateUnifiedAndroidReviewCandidate56(){}',
  'function mk(type,p={},deviceId=null) {}',
  'function active56(deviceId){}',
  'function jhRequireCommand56(device,workflowId=null){}',
  'let durableNativeHooks56=null;',
  'const SECURE56_TOOL_CATALOG_DIGEST="x";',
  'function journal(){durableNativeHooks56?.beforeDispatch(x);durableNativeHooks56?.acceptedCompletion(x)}',
  'function createMcp(){',
  '  registerOAuthTool("life_status",{',
  '}'
 ].join('\n');
 const next=patchJH167V4GeminiRightOwnerReview56(src);
 assert.equal((next.match(/export function jhCreateV4GeminiRightOriginalReview56/g)||[]).length,1);
 assert.equal((next.match(/registerOAuthTool\(/g)||[]).length,
   (src.match(/registerOAuthTool\(/g)||[]).length);
 assert.ok(next.includes("layoutMode:'LEFT_GPT_RIGHT_NATIVE_GEMINI'"));
 assert.ok(!next.includes('LEFT_NATIVE_GEMINI_RIGHT_GPT'));
 assert.ok(next.includes('JH_ANDROID_V4_GEMINI_CI_ONLY'));
 assert.ok(next.includes('httpServer.listening'));
 assert.ok(next.includes('liveServerRegistered:false'));
 assert.ok(next.includes('geminiHostLifecycleAttached:false'));
 assert.throws(()=>patchJH167V4GeminiRightOwnerReview56(next),/ALREADY_PATCHED/);
 for(const anchor of [
  'function mk(type,p={},deviceId=null) {}',
  'let durableNativeHooks56=null;',
  'const SECURE56_TOOL_CATALOG_DIGEST="x";',
  'durableNativeHooks56?.acceptedCompletion(']){
  assert.throws(()=>patchJH167V4GeminiRightOwnerReview56(src.replace(anchor,'')),
   /V4_ORIGINAL_OWNER_SOURCE_SCOPE_CHANGED/);
 }
});
test('generated real Secure56 owner can import exact V4 right-Gemini original host but never publish a live tool',
 {timeout:120000}, async()=>{
 const release=buildCleanRestartRelease56();
 const mod=await import(pathToFileURL(release.file).href+'?v4-original-owner-review');
 const built=mod.buildDurableRoutedOperationalEntrypoint(root);
 const original=readFileSync(built.runtimeFile,'utf8');
 const stage2=patchJH167AndroidDirectReview56(original);
 const stage3=patchJH167UnifiedOwnerReview56(stage2);
 const stage4=patchJH167V4GeminiRightOwnerReview56(stage3);
 assert.equal((stage4.match(/registerOAuthTool\(/g)||[]).length,
   (stage3.match(/registerOAuthTool\(/g)||[]).length);
 for(const literal of [
  'life_android_computer_prepare','life_android_execute_computer_action',
  'durableNativeHooks56?.beforeDispatch(', 'durableNativeHooks56?.acceptedCompletion(',
  'const SECURE56_TOOL_CATALOG_DIGEST=',
  "layoutMode:'LEFT_GPT_RIGHT_NATIVE_GEMINI'",
  "makeSnapshotJob:d=>mk('agent_snapshot',{},d)",
  "activeSession:d=>active56(d)",
  "exactEnvelope:(tool,type,effect,args,extra)=>exactEnvelope56(tool,type,effect,args,extra)"
 ])assert.ok(stage4.includes(literal),literal);
 const candidate=path.join(path.dirname(built.runtimeFile),'server-jh-v4-gemini-original-ci-only.mjs');
 try{
  writeFileSync(candidate,stage4,{encoding:'utf8',mode:0o600});
  const syntax=spawnSync(process.execPath,['--check',candidate],{
   encoding:'utf8',timeout:18000});
  assert.equal(syntax.status,0,syntax.stderr.slice(0,1600));
  const script=[
    'const m=await import('+JSON.stringify(pathToFileURL(candidate).href)+');',
    "const port=m.jhCreateV4GeminiRightOriginalReview56();",
    "const c=port.capabilities();",
    "if(!c.ready||!c.originalOwnerFunctionBinding||!c.currentPhoneSignedReadbackRequired)process.exit(2);",
    "if(c.geminiSubmitPermitted||c.geminiHostLifecycleAttached||c.liveServerRegistered)process.exit(3);",
    "if(port.read()!==null)process.exit(4);",
    "if(typeof port.refresh!=='function'||typeof port.verify!=='function')process.exit(5);"
  ].join('\n');
  const env={...process.env,CI:'true',NODE_ENV:'test',
   JH_OWNER_DEFER_LISTEN:'1',JH_ANDROID_DIRECT_CANDIDATE:'CI_SYNTHETIC_ONLY',
   JH_ANDROID_V4_GEMINI_CI_ONLY:'1'};
  const ok=spawnSync(process.execPath,['--input-type=module','-e',script],{
   encoding:'utf8',cwd:root,timeout:22000,env});
  assert.equal(ok.status,0,'original generated Secure56 owner V4 composition failed: '+ok.stderr.slice(0,1500));
  for(const key of ['CI','JH_ANDROID_V4_GEMINI_CI_ONLY','JH_OWNER_DEFER_LISTEN']){
   const blocked={...env};delete blocked[key];
   const check=spawnSync(process.execPath,
     ['--input-type=module','-e',script],{encoding:'utf8',cwd:root,timeout:16000,env:blocked});
   assert.notEqual(check.status,0,'V4 original owner started without '+key);
   assert.match(check.stderr,/JH_V4_ORIGINAL_OWNER_CI_ONLY_REQUIRED/);
  }
  assert.equal(readFileSync(built.runtimeFile,'utf8'),original,
   'Production owner source was modified');
 }finally{rmSync(candidate,{force:true})}
});
