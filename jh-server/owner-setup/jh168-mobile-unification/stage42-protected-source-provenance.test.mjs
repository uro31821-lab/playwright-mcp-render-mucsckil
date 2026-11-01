/** Stage42 protected release guard for the COMPOSITE. Strictly stronger than
 * a blanket no-diff on a receipt-only PR: it attests exact source identity of
 * every reviewed PR72 original host modification and all other protected files.
 * No Render, SQLite, Android or network is accessed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {reverseJH168Mobile13ActionPolicyHost56}
 from './mobile13-action-policy-patch.mjs';

const MAIN='2c310f8b4a76d40604416e7dd4cb4976fdd1fc85';
const LIVE='4c71890021fc299838e6a8ce45ccf5f64712f354';
const MOBILE='c6142bd21ea299a4464124356e9da34b58001900';
const pfx='jh-server/owner-setup/';
const reviewedHostPaths=[
 pfx+'deployment/durable-native-host.mjs',
 pfx+'deployment/jh167-article-operational-review-composition.mjs',
 pfx+'deployment/jh167-connection-v2-assembled-preflight.test.mjs',
 pfx+'operational-learning/ANDROID-PRODUCER-COMPATIBILITY.md'
];
const protectedRoots=[
 'jh-server/server.mjs',
 pfx+'deployment',
 pfx+'server-integration',
 pfx+'android-direct',
 pfx+'trusted-server',
 pfx+'owner-enrollment',
 pfx+'payment',
 pfx+'operational-learning',
];
const git=(args)=>execFileSync('git',args,{encoding:'utf8',timeout:15000,maxBuffer:20*1024*1024}).trimEnd();
const lines=(value)=>value?value.split('\n').filter(Boolean):[];
const diff=(head,scope)=>lines(git(['diff','--name-only',MAIN,head,'--',...scope]));
const show=(sha,file)=>execFileSync('git',['show',sha+':'+file],{encoding:'utf8',timeout:15000,maxBuffer:20*1024*1024});
const same=(sha,file)=>assert.equal(show('HEAD',file),show(sha,file),'EXACT_SOURCE_BLOB_DRIFT '+file);
const present=(sha)=>assert.equal(git(['cat-file','-t',sha]),'commit','MISSING_SOURCE_COMMIT '+sha);

test('original main, live and reviewed mobile SHA are pinned and present, no unreviewed base advancement',()=>{
 for(const sha of [MAIN,LIVE,MOBILE])present(sha);
 assert.equal(git(['rev-parse','origin/jh-fix3-secure-server']),MAIN);
 assert.equal(git(['merge-base',MAIN,LIVE]),MAIN);
 assert.equal(git(['merge-base',MAIN,'HEAD']),MAIN);
});
test('all protected server, owner, approval and operational source changes are EXACTLY reviewed PR72 paths',()=>{
 const actual=diff('HEAD',protectedRoots).sort();
 const expected=[...reviewedHostPaths].sort();
 assert.deepEqual(actual,expected,'ANY OTHER PROTECTED SOURCE CHANGE IS BLOCKED');
 for(const file of reviewedHostPaths)same(MOBILE,file);
 const host=readFileSync(reviewedHostPaths[0],'utf8');
 assert.equal(reverseJH168Mobile13ActionPolicyHost56(host),show(MAIN,reviewedHostPaths[0]));
 for(const file of [pfx+'deployment/durable-mcp-workflow-patch.mjs',
  pfx+'deployment/jh155-all-modules-patch.mjs',
  pfx+'deployment/jh155-split-integration-patch.mjs',
  pfx+'deployment/durable-native-job-policy.mjs',
  pfx+'deployment/durable-manual-circuit-fence.mjs',
  pfx+'payment/payment-runtime-patch.mjs',
  pfx+'server-integration/pending-approval-operator-entry.mjs',
  'jh-server/server.mjs'])
  same(MAIN,file);
});
test('LIVE source overlay collisions are ONLY exact PR72-reviewed updates, not hidden shadow overwrites',()=>{
 const overlap=diff(LIVE,['.github/workflows',pfx+'deployment',pfx+'operational-learning',pfx+'jh168-mobile-unification'])
  .filter(x=>diff('HEAD',['.github/workflows',pfx+'deployment',pfx+'operational-learning',pfx+'jh168-mobile-unification']).includes(x));
 assert.ok(overlap.length>=30,'LIVE_BRANCH_LINEAGE_CHANGED');
 const pr72=diff(MOBILE,['.github/workflows',pfx+'deployment',pfx+'operational-learning',pfx+'jh168-mobile-unification']);
 const set=new Set(pr72);
 for(const file of overlap){
  assert.ok(set.has(file),'LIVE_SOURCE_COLLISION_NOT_REVIEWED_BY_MOBILE72 '+file);
  same(MOBILE,file);
 }
});
test('reviewed Mobile 9+4 alias handler manifest is unchanged in integrated candidate',()=>{
 const paths=diff(MOBILE,[pfx+'jh168-mobile-unification',
  pfx+'deployment',pfx+'operational-learning','.github/workflows']);
 const mobilePaths=diff(MOBILE,[pfx+'jh168-mobile-unification']);
 assert.ok(mobilePaths.includes(pfx+'jh168-mobile-unification/mobile-web-tool-patch.mjs'));
 for(const file of mobilePaths){
  // Stage25 and future owner-receipt additions belong to distinct PRs, not
  // to the PR72 mobile route diff; all PR72 core paths must be exact.
  same(MOBILE,file);
 }
 assert.ok(paths.length>=40);
});
test('critical release safety constraints and no phone outcome forgery remain explicit',()=>{
 const source=readFileSync(pfx+'jh168-mobile-unification/STAGE41-COMMAND-DISCARD-FINDINGS.md','utf8');
 assert.ok(source.includes('No same-command lease renewal'));
 assert.ok(source.includes('29 historic SQLite'));
 assert.ok(readFileSync(pfx+'jh168-mobile-unification/stage41-command-lifecycle-patch.mjs','utf8')
   .includes("const PREFIX='// JH_STAGE41_SIGNED_COMMAND_CAUSE_ONLY_V1"));
});
