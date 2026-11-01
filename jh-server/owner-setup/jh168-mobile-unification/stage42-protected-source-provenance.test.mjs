/** JHAI explicit host-memory transport source protection.
 * The observed deployed MAIN is reviewed diagnostic bd816757.
 * Preserve PR72 provenance and every original execution/security source.
 * The exact reviewed learning delta is enumerated; later MAIN needs review.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {reverseJH168Mobile13ActionPolicyHost56}
 from './mobile13-action-policy-patch.mjs';

const PRE_MOBILE='2c310f8b4a76d40604416e7dd4cb4976fdd1fc85';
const REVIEWED_MAIN='bd81675725609e67ca7bb2f8dc45f101f0820d8b';
const REVIEWED_PR72='c6142bd21ea299a4464124356e9da34b58001900';
const LIVE='bd81675725609e67ca7bb2f8dc45f101f0820d8b';
const ROOT='jh-server/owner-setup/';
const git=(args)=>execFileSync('git',args,{encoding:'utf8',timeout:15000,maxBuffer:20*1024*1024}).trim();
const show=(sha,path)=>execFileSync('git',['show',sha+':'+path],{encoding:'utf8',timeout:15000,maxBuffer:20*1024*1024});
const files=(scope)=>git(['diff','--name-only',REVIEWED_MAIN,'HEAD','--',...scope]).split('\n').filter(Boolean);
const protectedRoots=[
 'jh-server/server.mjs',ROOT+'deployment',ROOT+'payment',ROOT+'server-integration',
 ROOT+'android-direct',ROOT+'trusted-server',ROOT+'owner-enrollment'
];
test('MAIN is exact reviewed deployed diagnostic baseline, original pre-mobile provenance still available',()=>{
 assert.equal(git(['rev-parse','origin/jh-fix3-secure-server']),REVIEWED_MAIN);
 for(const sha of [PRE_MOBILE,REVIEWED_MAIN,REVIEWED_PR72,LIVE])assert.equal(git(['cat-file','-t',sha]),'commit');
 assert.equal(git(['merge-base',PRE_MOBILE,REVIEWED_MAIN]),PRE_MOBILE);
 assert.equal(git(['merge-base',PRE_MOBILE,REVIEWED_PR72]),PRE_MOBILE);
 assert.equal(git(['merge-base',REVIEWED_MAIN,'HEAD']),REVIEWED_MAIN);
});
test('ALL original Secure56, device, owner, payment, approval and journal protected sources unchanged by host memory',()=>{
 assert.deepEqual(files(protectedRoots),[],'UNREVIEWED_PROTECTED_SOURCE_CHANGE');
});
test('previous exact PR72 mobile host modifications remain byte-identical and reversible to old original',()=>{
 const host=ROOT+'deployment/durable-native-host.mjs';
 const current=readFileSync(host,'utf8');
 assert.equal(current,show(REVIEWED_MAIN,host));
 assert.equal(current,show(REVIEWED_PR72,host));
 assert.equal(reverseJH168Mobile13ActionPolicyHost56(current),show(PRE_MOBILE,host));
 for(const other of [ROOT+'deployment/jh167-article-operational-review-composition.mjs',
  ROOT+'deployment/jh167-connection-v2-assembled-preflight.test.mjs',
  ROOT+'operational-learning/ANDROID-PRODUCER-COMPATIBILITY.md'])
  assert.equal(readFileSync(other,'utf8'),show(REVIEWED_PR72,other));
});
test('observed LIVE baseline is exact reviewed MAIN and candidate changes only the reviewed host-memory files',()=>{
 assert.equal(LIVE,REVIEWED_MAIN);
 const current=files([]);
 const allowed=[
  '.github/workflows/jh168-mobile13-command-diagnostics-review.yml',
  ROOT+'operational-learning/host-memory-bridge.mjs',
  ROOT+'operational-learning/host-memory-bridge.test.mjs',
  ROOT+'operational-learning/host-memory-runtime.test.mjs',
  ROOT+'operational-learning/mcp-tools.mjs',
  ROOT+'operational-learning/server-runtime.mjs',
  ROOT+'operational-learning/owner-host.mjs',
  ROOT+'operational-learning/runtime-patch.mjs',
  ROOT+'operational-learning/verify.mjs',
  ROOT+'operational-learning/preflight.test.mjs',
  ROOT+'operational-learning/http-runtime.fixture.mjs',
  ROOT+'operational-learning/http-runtime.test.mjs',
  ROOT+'operational-learning/README.ko.md',
  ROOT+'operational-learning/design-sources.md',
  ROOT+'jh168-mobile-unification/mobile-web-current-main-compat.test.mjs',
  ROOT+'jh168-mobile-unification/stage42-protected-source-provenance.test.mjs'
 ];
 assert.deepEqual(current.sort(),allowed.sort(),'JHAI_HOST_MEMORY_EXACT_FILES_ONLY');
 for(const path of [
  'stage44-device-focus-patch.mjs','stage44-device-focus.test.mjs','stage44-device-focus.mjs',
  'stage41-command-lifecycle-patch.mjs','stage40-owner-admission-diagnostics-patch.mjs',
  'mobile-web-tool-patch.mjs','mobile13-action-policy-patch.mjs',
  'stage25-live-operator-followup-entry.mjs','mobile13-command-diagnostics.mjs'
 ])assert.equal(readFileSync(ROOT+'jh168-mobile-unification/'+path,'utf8'),
  show(REVIEWED_MAIN,ROOT+'jh168-mobile-unification/'+path));
});
test('learning engine, existing observation identity, store locking and regression authority remain byte-identical',()=>{
 for(const name of ['engine.mjs','store.mjs','host-observations.mjs','host-adapter.mjs',
  'instructions.mjs','curation.mjs','regression.mjs','decisions.mjs','progress.mjs','owner-patch.mjs']) {
  const path=ROOT+'operational-learning/'+name;
  assert.equal(readFileSync(path,'utf8'),show(REVIEWED_MAIN,path),name);
 }
 const host=readFileSync(ROOT+'operational-learning/owner-host.mjs','utf8');
 assert.ok(host.includes("process.env.JH_HOST_MEMORY_BRIDGE === 'EXPLICIT_OWNER_HOST_MEMORY_V1'"));
 const runtime=readFileSync(ROOT+'operational-learning/server-runtime.mjs','utf8');
 assert.ok(runtime.includes('hostMemoryEnabled = false'));
 assert.ok(runtime.includes("librarySync: 'not_connected'"));
});
test('release remains opt-in, old actions never replay and phone E2E is not inferred from source',()=>{
 const source=readFileSync(ROOT+'jh168-mobile-unification/STAGE44-SINGLE-COMMAND-FOCUS.md','utf8');
 assert.ok(source.includes('120 seconds'));
 assert.ok(source.includes('29 historical'));
 const patched=readFileSync(ROOT+'jh168-mobile-unification/stage44-device-focus-patch.mjs','utf8');
 assert.ok(patched.includes("const IMP="));
 assert.ok(patched.includes("DEVICE_FOCUS_PROTECTED_OTHER_BEGIN"));
 assert.ok(patched.includes("function reverseStage44DeviceFocusPatch("));
});
