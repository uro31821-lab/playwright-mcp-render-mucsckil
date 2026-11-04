/** JHAI source-protection lineage review.
 * Historical PR72 and host-memory commits remain immutable evidence. Current
 * production source is checked from the last reviewed live base, while the
 * separately reviewed Stage62 transition is admitted only through exact Git
 * objects in reviewed-source-audit.mjs. No deploy or phone authority here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {reverseJH168Mobile13ActionPolicyHost56}
 from './mobile13-action-policy-patch.mjs';
import {assertReviewedSource} from './reviewed-source-audit.mjs';

const PRE_MOBILE='2c310f8b4a76d40604416e7dd4cb4976fdd1fc85';
const REVIEWED_HOST_MEMORY='bd81675725609e67ca7bb2f8dc45f101f0820d8b';
const REVIEWED_DIAGNOSTIC='8596f5ef299d27fa7064ee40a64a99030196774a';
const REVIEWED_PR72='c6142bd21ea299a4464124356e9da34b58001900';
const CURRENT_LIVE_BASE='d4afec4a657d4ad928560624536c01e2df6df1c7';
const ROOT='jh-server/owner-setup/';
const git=args=>execFileSync('git',args,{encoding:'utf8',timeout:15000,maxBuffer:20*1024*1024}).trim();
const show=(sha,path)=>execFileSync('git',['show',sha+':'+path],{encoding:'utf8',timeout:15000,maxBuffer:20*1024*1024});
const current=path=>readFileSync(path,'utf8');
const exactCurrentBase=paths=>git(['diff','--no-renames','--name-only',CURRENT_LIVE_BASE,'HEAD','--',...paths])
 .split('\n').filter(Boolean);
const protectedRoots=[
 'jh-server/server.mjs',ROOT+'deployment',ROOT+'payment',ROOT+'server-integration',
 ROOT+'android-direct',ROOT+'trusted-server',ROOT+'owner-enrollment'
];
const transitionPaths=[
 'jh-server/server.mjs',ROOT+'deployment',ROOT+'payment',ROOT+'server-integration',
 ROOT+'android-direct',ROOT+'trusted-server',ROOT+'owner-enrollment',
 ROOT+'operational-learning',ROOT+'jh168-mobile-unification',
 'jh-dev-tools/windows-delivery/fixtures/fix16',
 'package.json','package-lock.json','jh-server/package.json',
 ROOT+'package.json',ROOT+'package-lock.json',ROOT+'published-baseline/package.json',
 ...['host-memory-federation.js','host-memory-federation.test.mjs',
  'host-memory-federation-sources.md','verify.mjs']
  .map(p=>':(exclude)'+ROOT+'operational-learning/'+p),
 ...['mobile-web-current-main-compat.test.mjs','reviewed-source-audit.mjs',
  'reviewed-source-audit.test.mjs','CURRENT-SOURCE-AUDIT.md']
  .map(p=>':(exclude)'+ROOT+'jh168-mobile-unification/'+p)
];

test('historical reviews remain available and current live base is the ancestor of this candidate',()=>{
 for(const sha of [PRE_MOBILE,REVIEWED_HOST_MEMORY,REVIEWED_DIAGNOSTIC,REVIEWED_PR72,CURRENT_LIVE_BASE])
  assert.equal(git(['cat-file','-t',sha]),'commit',sha);
 assert.equal(git(['merge-base',PRE_MOBILE,REVIEWED_HOST_MEMORY]),PRE_MOBILE);
 assert.equal(git(['merge-base',PRE_MOBILE,REVIEWED_PR72]),PRE_MOBILE);
 assert.equal(git(['merge-base',REVIEWED_DIAGNOSTIC,CURRENT_LIVE_BASE]),REVIEWED_DIAGNOSTIC);
 const base=git(['rev-parse','origin/jh-fix3-secure-server']);
 assert.equal(git(['merge-base',CURRENT_LIVE_BASE,base]),CURRENT_LIVE_BASE);
 assert.equal(git(['merge-base',base,'HEAD']),base);
});

test('current reviewed protected-source transition is exact and fail-closed',()=>{
 const result=assertReviewedSource({cwd:process.cwd(),baseline:REVIEWED_DIAGNOSTIC,
  paths:transitionPaths});
 assert.equal(result.baseline,REVIEWED_DIAGNOSTIC);
 assert.match(result.reviewedTransition||'',/^[a-f0-9]{40}$/);
});

test('Stage62 changes no original Secure56, device, owner, payment, approval or journal source',()=>{
 assert.deepEqual(exactCurrentBase(protectedRoots),[],'STAGE62_UNREVIEWED_SECURITY_SOURCE_CHANGE');
});

test('previous exact PR72 mobile host modifications remain byte-identical and reversible',()=>{
 const host=ROOT+'deployment/durable-native-host.mjs';
 assert.equal(current(host),show(CURRENT_LIVE_BASE,host));
 assert.equal(current(host),show(REVIEWED_PR72,host));
 assert.equal(reverseJH168Mobile13ActionPolicyHost56(current(host)),show(PRE_MOBILE,host));
 for(const other of [ROOT+'deployment/jh167-article-operational-review-composition.mjs',
  ROOT+'deployment/jh167-connection-v2-assembled-preflight.test.mjs',
  ROOT+'operational-learning/ANDROID-PRODUCER-COMPATIBILITY.md']){
  assert.equal(current(other),show(CURRENT_LIVE_BASE,other),other);
  assert.equal(current(other),show(REVIEWED_PR72,other),other);
 }
});

test('learning authority and unchanged phone-safety production sources match the current live base',()=>{
 for(const name of ['engine.mjs','store.mjs','host-observations.mjs','host-adapter.mjs',
  'instructions.mjs','curation.mjs','regression.mjs','decisions.mjs','progress.mjs','owner-patch.mjs']){
  const path=ROOT+'operational-learning/'+name;
  assert.equal(current(path),show(CURRENT_LIVE_BASE,path),name);
 }
 // Stage62-reviewed generated-runtime composition and tests are pinned by the
 // exact transition above. These underlying authority/patch producers remain
 // byte-identical to the live base and cannot be widened by the transition.
 for(const path of [
  'stage44-device-focus-patch.mjs','stage44-device-focus.mjs',
  'stage41-command-lifecycle-patch.mjs','stage40-owner-admission-diagnostics-patch.mjs',
  'mobile-web-tool-patch.mjs','mobile13-action-policy-patch.mjs'
 ])assert.equal(current(ROOT+'jh168-mobile-unification/'+path),
  show(CURRENT_LIVE_BASE,ROOT+'jh168-mobile-unification/'+path),path);
 const host=current(ROOT+'operational-learning/owner-host.mjs');
 assert.ok(host.includes("process.env.JH_HOST_MEMORY_BRIDGE === 'EXPLICIT_OWNER_HOST_MEMORY_V1'"));
 const runtime=current(ROOT+'operational-learning/server-runtime.mjs');
 assert.ok(runtime.includes('hostMemoryEnabled = false'));
 assert.ok(runtime.includes("librarySync: 'not_connected'"));
});

test('release remains opt-in, old actions never replay and phone E2E is not inferred from source',()=>{
 const source=current(ROOT+'jh168-mobile-unification/STAGE44-SINGLE-COMMAND-FOCUS.md');
 assert.ok(source.includes('120 seconds'));
 assert.ok(source.includes('29 historical'));
 const patched=current(ROOT+'jh168-mobile-unification/stage44-device-focus-patch.mjs');
 for(const marker of ['const IMP=','DEVICE_FOCUS_PROTECTED_OTHER_BEGIN',
  'function reverseStage44DeviceFocusPatch('])assert.ok(patched.includes(marker),marker);
});
