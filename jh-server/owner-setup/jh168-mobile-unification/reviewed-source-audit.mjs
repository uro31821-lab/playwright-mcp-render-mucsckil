/** Read-only Git source audit. A reviewed snapshot is fixed; branch names may move.
 * Compare origin, committed candidate and working files separately so a candidate
 * cannot hide an upstream change by reverting it. No deploy or device authority.
 *
 * A reviewed transition is accepted only when every fixed step has its exact
 * predecessor, reviewed commit, protected path set and Git blob objects. This
 * preserves fail-closed source review while allowing a separately reviewed
 * follow-up test contract to extend, but never silently replace, the lineage.
 */
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';

const REVIEWED_TRANSITIONS=Object.freeze([
 Object.freeze({
  historicalBaseline:'8596f5ef299d27fa7064ee40a64a99030196774a',
  preBase:'bdd5feb862102857f70133e1da87679fcd393b8d',
  steps:Object.freeze([
   Object.freeze({
    reviewedHead:'96c307c2057d5cee1560684b3f52ce41d3a76378',
    protectedObjects:Object.freeze({
     'jh-server/owner-setup/jh168-mobile-unification/stage25-live-operator-followup-entry.mjs':
      'b381e0325c1ec300f80828b798ad8310d0bf69de',
     'jh-server/owner-setup/jh168-mobile-unification/stage61-current-source-compat.test.mjs':
      '10618a7d0167523bfe6834ea56383c525213d7df',
     'jh-server/owner-setup/jh168-mobile-unification/stage61-mobile-runtime-patch.mjs':
      '6c3fc142e60624c5af6f7b46aef32a4dbbd17fe1',
     'jh-server/owner-setup/jh168-mobile-unification/stage63-native-select-owner-admission.test.mjs':
      '473c07d027e45ae1e9f5b472e4cd4040488b1d9e'
    })
   }),
   Object.freeze({
    reviewedHead:'51dc81b23cd9712de0f057c6009342cad5d5f916',
    protectedObjects:Object.freeze({
     'jh-server/owner-setup/jh168-mobile-unification/mobile13-integrated-contract.test.mjs':
      '1049d0f86cf6cc4dd2eb3009eecc4dc29a845583'
    })
   }),
   Object.freeze({
    reviewedHead:'51c46c374d70701bd93e564038fb15f4d1d46466',
    protectedObjects:Object.freeze({
     'jh-server/owner-setup/jh168-mobile-unification/stage61-right-pane-host-adapter.test.mjs':
      '3044caf07865601c1d5362a382e9de57b080b464',
     'jh-server/owner-setup/jh168-mobile-unification/stage61-right-pane-router.mjs':
      'c5e5d46def55f1dee705527010e2eb27b1cece52',
     'jh-server/owner-setup/jh168-mobile-unification/stage61-right-pane-router.test.mjs':
      'b9c8925f9769ef1b3c0a411f2926e3db187a9084',
     'jh-server/owner-setup/jh168-mobile-unification/stage64-feature-fallback.mjs':
      'caf47a2fe47083382008991e4a8673501298bf64',
     'jh-server/owner-setup/jh168-mobile-unification/stage64-feature-fallback.test.mjs':
      '44ac584dce2ae6615c6578d32761e9acce66c768'
    })
   }),
   Object.freeze({
    reviewedHead:'76e39c0680ff6bfdc552e75db62b061311c934c0',
    protectedObjects:Object.freeze({
     'jh-server/owner-setup/jh168-mobile-unification/stage61-right-pane-host-adapter.mjs':
      '7db04089817875ac9a185fe4e38f1439761be975',
     'jh-server/owner-setup/jh168-mobile-unification/stage61-right-pane-host-adapter.test.mjs':
      'fa34893f08b41cb6c958fbc734b58d9f111dd24e',
     'jh-server/owner-setup/jh168-mobile-unification/stage61-mobile-runtime-patch.mjs':
      'd4e73efc16e2e2805513b0669e62d97c8a3619c5',
     'jh-server/owner-setup/jh168-mobile-unification/stage61-mobile-runtime-patch.test.mjs':
      'bd4617a33c5c8918d112531172c4083e9d386a04'
    })
   }),
   Object.freeze({
    reviewedHead:'94ee7aa9875eb61dacf5d975b2784e279643bcfa',
    protectedObjects:Object.freeze({
     'jh-server/owner-setup/jh168-mobile-unification/stage66-verified-mobile-feature-profile.mjs':
      '051d779a1f971cc4cc967474767046e28e2238ab',
     'jh-server/owner-setup/jh168-mobile-unification/stage66-verified-mobile-feature-profile.test.mjs':
      'e674d7b1404da52b022af59010f9b4b4dda8ebd6'
    })
   }),
   Object.freeze({
    reviewedHead:'67d994c74386be18adaabeebbff5328d0bea02f5',
    protectedObjects:Object.freeze({
     'jh-server/owner-setup/jh168-mobile-unification/stage61-mobile-runtime-patch.mjs':
      '8eeadec54be3eedcf7bd67cd47a604236988c31a',
     'jh-server/owner-setup/jh168-mobile-unification/stage61-mobile-runtime-patch.test.mjs':
      'ba10efcffac3fa26039217132a4039e6dba58177',
     'jh-server/owner-setup/jh168-mobile-unification/stage61-right-pane-router.mjs':
      '215b696dad69ef244dff022dc6a642031ab2a2bf',
     'jh-server/owner-setup/jh168-mobile-unification/stage61-right-pane-router.test.mjs':
      'fa99a70e6bd96d915fae141634542eda7f79a2ef',
     'jh-server/owner-setup/jh168-mobile-unification/stage64-feature-fallback.mjs':
      'ae83f3a682fedcb020a3a8162adb68d949454d41',
     'jh-server/owner-setup/jh168-mobile-unification/stage64-feature-fallback.test.mjs':
      'b68cd7b51e02f38fb553e00e46ec8de191caa634'
    })
   }),
   Object.freeze({
    reviewedHead:'f9e8e6e7564624f7fbe56e45d1bc9deaa4a245b6',
    protectedObjects:Object.freeze({
     'jh-server/owner-setup/jh168-mobile-unification/stage61-mobile-runtime-patch.mjs':
      '3245ea53bdd2980ed558a4ff89416824bebf8ac3'
    })
   }),
   Object.freeze({
    reviewedHead:'2bd7bf5d4382f49d19a8922c44021ecd0d0f8e96',
    protectedObjects:Object.freeze({
     'jh-server/owner-setup/jh168-mobile-unification/stage61-right-pane-host-adapter.mjs':
      'ccddcd6c82e7f868ece98970992f6b23ae5274f6',
     'jh-server/owner-setup/jh168-mobile-unification/stage61-right-pane-host-adapter.test.mjs':
      'aa2ae85cdb053eca975595c129ba9103452893a0',
     'jh-server/owner-setup/jh168-mobile-unification/stage61-right-pane-router.mjs':
      'f17937485cfdd7dc80223f8dedb3f2d2d5195c2b',
     'jh-server/owner-setup/jh168-mobile-unification/stage61-right-pane-router.test.mjs':
      '15af9ffbb49904aa13edcfe52ebc1a1076dfa033',
     'jh-server/owner-setup/jh168-mobile-unification/stage64-feature-fallback.mjs':
      '1d38e06ba3b3e02817c680ab51d2786ba27b2139',
     'jh-server/owner-setup/jh168-mobile-unification/stage64-feature-fallback.test.mjs':
      'c9b41b41b13cc7d4cfe9981fad8c6b6889c7d6d5',
     'jh-server/owner-setup/jh168-mobile-unification/stage66-verified-mobile-feature-profile.mjs':
      '046fc7c0a9f7aba9a552d2ff03b45163d3bc05a3',
     'jh-server/owner-setup/jh168-mobile-unification/stage66-verified-mobile-feature-profile.test.mjs':
      '011bcab2de268e4e1e21c3391f25fadcb3cc0936'
    })
   }),
   Object.freeze({
    reviewedHead:'aca4eae97d61edb6797d4b6c65efba5900926524',
    protectedObjects:Object.freeze({
     'jh-server/owner-setup/jh168-mobile-unification/stage61-mobile-runtime-patch.mjs':
      '24d691884da7d9a431cb04020dc1f256889187ce',
     'jh-server/owner-setup/jh168-mobile-unification/stage61-mobile-runtime-patch.test.mjs':
      '0fb8c418a175a3d00237317943b6b2b944f150ed'
    })
   }),
   Object.freeze({
    reviewedHead:'45894388bbd176503fe2af488a73be6e191af05d',
    protectedObjects:Object.freeze({
     'jh-server/owner-setup/deployment/jh167-article-operational-review-composition.mjs':
      'b2e8c9ecc0673565744487fe0f6d4444bcb2a4b0',
     'jh-server/owner-setup/jh168-mobile-unification/stage25-live-operator-followup-entry.mjs':
      '621f403c4ada10fb959f62e847d61a2ddc23d492',
     'jh-server/owner-setup/jh168-mobile-unification/stage42-protected-source-provenance.test.mjs':
      '0515e3a57c09c0fb750acbc2416dd8a150ebbfb9'
    })
   })
  ])
 })
]);

const lines=value=>value?value.split('\n').filter(Boolean).sort():[];

export function assertReviewedSource({cwd, baseline,
 baseRef='refs/remotes/origin/jh-fix3-secure-server', headRef='HEAD', paths}) {
 assert.match(baseline, /^[a-f0-9]{40}$/, 'EXACT_REVIEWED_COMMIT_REQUIRED');
 assert.ok(Array.isArray(paths) && paths.length && paths.every(p=>typeof p==='string' && p.length),
  'EXPLICIT_PROTECTED_PATHS_REQUIRED');
 const options={cwd, encoding:'utf8', timeout:15000, maxBuffer:20*1024*1024};
 const git=args=>execFileSync('git',['-c','core.fileMode=true',...args],options).trim();
 const resolve=ref=>git(['rev-parse','--verify','--end-of-options',ref+'^{commit}']);
 assert.equal(resolve(baseline),baseline);
 // Resolve each movable ref once; every later comparison uses these exact SHAs.
 const base=resolve(baseRef), head=resolve(headRef);
 const ancestor=(from,to,label)=>{
  const result=spawnSync('git',['merge-base','--is-ancestor',from,to],options);
  if(result.error)throw result.error;
  assert.equal(result.status,0,label);
 };
 ancestor(baseline,base,'BASELINE_NOT_ANCESTOR_OF_BASE');
 ancestor(baseline,head,'BASELINE_NOT_ANCESTOR_OF_HEAD');
 ancestor(base,head,'BASE_NOT_ANCESTOR_OF_HEAD');
 const diff=ref=>git(['diff','--no-ext-diff','--no-textconv','--raw','--no-abbrev',
  '--no-renames',baseline,...(ref?[ref]:[]),'--',...paths]);
 const baseDiff=diff(base),headDiff=diff(head);
 let reviewedTransition=null;
 if(baseDiff||headDiff){
  const transition=REVIEWED_TRANSITIONS.find(v=>v.historicalBaseline===baseline);
  if(transition){
   const preBase=resolve(transition.preBase);
   assert.equal(preBase,transition.preBase,'REVIEWED_TRANSITION_PREBASE_MISSING');
   ancestor(baseline,preBase,'HISTORICAL_BASELINE_NOT_ANCESTOR_OF_TRANSITION');
   assert.ok(Array.isArray(transition.steps)&&transition.steps.length>0,
    'REVIEWED_TRANSITION_STEPS_REQUIRED');
   let previous=preBase;
   const finalObjects=new Map();
   for(const step of transition.steps){
    assert.match(step?.reviewedHead||'',/^[a-f0-9]{40}$/,
     'REVIEWED_TRANSITION_STEP_HEAD_REQUIRED');
    const reviewedHead=resolve(step.reviewedHead);
    assert.equal(reviewedHead,step.reviewedHead,'REVIEWED_TRANSITION_HEAD_MISSING');
    ancestor(previous,reviewedHead,'REVIEWED_TRANSITION_STEP_NOT_DESCENDANT');
    const expectedPaths=Object.keys(step.protectedObjects||{}).sort();
    assert.ok(expectedPaths.length>0,'REVIEWED_TRANSITION_STEP_PATHS_REQUIRED');
    const actualPaths=lines(git(['diff','--name-only','--no-renames',previous,reviewedHead,
     '--',...paths]));
    assert.deepEqual(actualPaths,expectedPaths,'REVIEWED_TRANSITION_PROTECTED_PATHS_CHANGED');
    for(const [path,blob] of Object.entries(step.protectedObjects)){
     assert.match(blob,/^[a-f0-9]{40}$/,'REVIEWED_TRANSITION_BLOB_REQUIRED_'+path);
     const entry=`100644 blob ${blob}\t${path}`;
     assert.equal(git(['ls-tree',reviewedHead,'--',path]),entry,
      'REVIEWED_TRANSITION_BLOB_CHANGED_'+path);
     finalObjects.set(path,blob);
    }
    previous=reviewedHead;
   }
   const finalReviewedHead=previous;
   for(const [path,blob] of finalObjects){
    assert.equal(git(['ls-tree',head,'--',path]),`100644 blob ${blob}\t${path}`,
     'HEAD_REVIEWED_TRANSITION_BLOB_CHANGED_'+path);
   }
   if(base===preBase){
    ancestor(finalReviewedHead,head,'REVIEWED_TRANSITION_NOT_ANCESTOR_OF_HEAD');
    assert.equal(git(['diff','--no-ext-diff','--no-textconv','--raw','--no-abbrev',
     '--no-renames',finalReviewedHead,head,'--',...paths]),'',
    'HEAD_HAS_UNREVIEWED_PROTECTED_SOURCE_AFTER_TRANSITION');
   }else{
    const isAncestor=(from,to)=>spawnSync('git',['merge-base','--is-ancestor',from,to],options).status===0;
    const reviewedInBase=isAncestor(finalReviewedHead,base);
    const baseInReviewed=isAncestor(base,finalReviewedHead);
    assert.ok(reviewedInBase||baseInReviewed,'REVIEWED_TRANSITION_BRANCH_RELATION_INVALID');
    if(reviewedInBase){
     assert.equal(git(['diff','--no-ext-diff','--no-textconv','--raw','--no-abbrev',
      '--no-renames',finalReviewedHead,base,'--',...paths]),'',
     'BASE_HAS_UNREVIEWED_PROTECTED_SOURCE_AFTER_TRANSITION');
     assert.equal(git(['diff','--no-ext-diff','--no-textconv','--raw','--no-abbrev',
      '--no-renames',base,head,'--',...paths]),'',
     'HEAD_HAS_UNREVIEWED_PROTECTED_SOURCE_AFTER_BASE');
    }else{
     ancestor(finalReviewedHead,head,'REVIEWED_CANDIDATE_NOT_ANCESTOR_OF_HEAD');
     assert.equal(git(['diff','--no-ext-diff','--no-textconv','--raw','--no-abbrev',
      '--no-renames',finalReviewedHead,head,'--',...paths]),'',
     'HEAD_HAS_UNREVIEWED_PROTECTED_SOURCE_AFTER_CANDIDATE');
    }
   }
   reviewedTransition=finalReviewedHead;
  }else{
   assert.equal(baseDiff,'','BASE_PROTECTED_SOURCE_CHANGED');
   assert.equal(headDiff,'','HEAD_PROTECTED_SOURCE_CHANGED');
  }
 }
 // Raw diffs also reject additions, removals, renames, executable bits and symlinks.
 if(reviewedTransition){
  assert.equal(git(['diff','--no-ext-diff','--no-textconv','--raw','--no-abbrev',
   '--no-renames','HEAD','--',...paths]),'','WORKTREE_PROTECTED_SOURCE_CHANGED');
 }else{
  assert.equal(diff(null),'','WORKTREE_PROTECTED_SOURCE_CHANGED');
 }
 assert.equal(git(['ls-files','--others','--exclude-standard','--',...paths]),'',
  'UNTRACKED_PROTECTED_SOURCE');
 return {baseline,base,head,protectedPaths:[...paths],reviewedTransition};
}
