/** JH168 Stage44 MAIN source protection. The earlier Stage42 test was
 * pinned to pre-PR111 MAIN 2c310f8, but actual deployed MAIN advanced to
 * reviewed e346a1c9. Preserve original PR72 history, require zero current
 * changes to global protected source and pin real LIVE to current MAIN.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {reverseJH168Mobile13ActionPolicyHost56}
 from './mobile13-action-policy-patch.mjs';

const PRE_MOBILE='2c310f8b4a76d40604416e7dd4cb4976fdd1fc85';
const REVIEWED_MAIN='e346a1c9d425428df5cba4069f26842450542b43';
const REVIEWED_PR72='c6142bd21ea299a4464124356e9da34b58001900';
const LIVE='e346a1c9d425428df5cba4069f26842450542b43';
const ROOT='jh-server/owner-setup/';
const git=(args)=>execFileSync('git',args,{encoding:'utf8',timeout:15000,maxBuffer:20*1024*1024}).trim();
const show=(sha,path)=>execFileSync('git',['show',sha+':'+path],{encoding:'utf8',timeout:15000,maxBuffer:20*1024*1024});
const files=(scope)=>git(['diff','--name-only',REVIEWED_MAIN,'HEAD','--',...scope]).split('\n').filter(Boolean);
const protectedRoots=[
 'jh-server/server.mjs',ROOT+'deployment',ROOT+'payment',ROOT+'server-integration',
 ROOT+'android-direct',ROOT+'trusted-server',ROOT+'owner-enrollment',ROOT+'operational-learning'
];
test('MAIN advanced to exact reviewed deployed PR111, original pre-mobile provenance still available',()=>{
 assert.equal(git(['rev-parse','origin/jh-fix3-secure-server']),REVIEWED_MAIN);
 for(const sha of [PRE_MOBILE,REVIEWED_MAIN,REVIEWED_PR72,LIVE])assert.equal(git(['cat-file','-t',sha]),'commit');
 assert.equal(git(['merge-base',PRE_MOBILE,REVIEWED_MAIN]),PRE_MOBILE);
 assert.equal(git(['merge-base',PRE_MOBILE,REVIEWED_PR72]),PRE_MOBILE);
 assert.equal(git(['merge-base',REVIEWED_MAIN,'HEAD']),REVIEWED_MAIN);
});
test('ALL original Secure56, device, owner, payment, approval and journal protected sources unchanged in Stage44',()=>{
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
test('current live source is EXACT approved MAIN, no hidden overlay collision or rollback',()=>{
 assert.equal(LIVE,REVIEWED_MAIN);
 const current=files(['.github/workflows',ROOT+'deployment',ROOT+'operational-learning',ROOT+'jh168-mobile-unification']);
 const allowed=[
  '.github/workflows/jh168-stage44-signed-task-focus-review.yml',
  ROOT+'jh168-mobile-unification/stage44-device-focus.mjs',
  ROOT+'jh168-mobile-unification/stage44-device-focus-patch.mjs',
  ROOT+'jh168-mobile-unification/stage44-device-focus.test.mjs',
  ROOT+'jh168-mobile-unification/STAGE44-SINGLE-COMMAND-FOCUS.md',
  ROOT+'jh168-mobile-unification/stage25-live-operator-followup-entry.mjs',
  ROOT+'jh168-mobile-unification/mobile-web-current-main-compat.test.mjs',
  ROOT+'jh168-mobile-unification/stage42-protected-source-provenance.test.mjs'
 ];
 for(const path of current)assert.ok(allowed.includes(path),'UNREVIEWED_CHANGED_FILE '+path);
 assert.equal(current.length,allowed.length,'STAGE44_EXPECTED_FILES_ONLY');
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
