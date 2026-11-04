/** Read-only Git source audit. A reviewed snapshot is fixed; branch names may move.
 * Compare origin, committed candidate and working files separately so a candidate
 * cannot hide an upstream change by reverting it. No deploy or device authority.
 *
 * A reviewed transition is accepted only when its pre-base commit, reviewed
 * commit, exact protected path set and exact Git blob objects all match. This
 * preserves fail-closed source review while allowing a separately reviewed
 * protected-source release to become the next fixed lineage.
 */
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';

const REVIEWED_TRANSITIONS=Object.freeze([
 Object.freeze({
  historicalBaseline:'8596f5ef299d27fa7064ee40a64a99030196774a',
  preBase:'bdd5feb862102857f70133e1da87679fcd393b8d',
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
   const preBase=resolve(transition.preBase),reviewedHead=resolve(transition.reviewedHead);
   assert.equal(preBase,transition.preBase,'REVIEWED_TRANSITION_PREBASE_MISSING');
   assert.equal(reviewedHead,transition.reviewedHead,'REVIEWED_TRANSITION_HEAD_MISSING');
   ancestor(baseline,preBase,'HISTORICAL_BASELINE_NOT_ANCESTOR_OF_TRANSITION');
   ancestor(preBase,reviewedHead,'TRANSITION_PREBASE_NOT_ANCESTOR_OF_REVIEWED_HEAD');
   const expectedPaths=Object.keys(transition.protectedObjects).sort();
   const actualPaths=lines(git(['diff','--name-only','--no-renames',preBase,reviewedHead,
    '--',...paths]));
   assert.deepEqual(actualPaths,expectedPaths,'REVIEWED_TRANSITION_PROTECTED_PATHS_CHANGED');
   for(const [path,blob] of Object.entries(transition.protectedObjects)){
    const entry=`100644 blob ${blob}\t${path}`;
    assert.equal(git(['ls-tree',reviewedHead,'--',path]),entry,
     'REVIEWED_TRANSITION_BLOB_CHANGED_'+path);
    assert.equal(git(['ls-tree',head,'--',path]),entry,
     'HEAD_REVIEWED_TRANSITION_BLOB_CHANGED_'+path);
   }
   if(base===preBase){
    ancestor(reviewedHead,head,'REVIEWED_TRANSITION_NOT_ANCESTOR_OF_HEAD');
    assert.equal(git(['diff','--no-ext-diff','--no-textconv','--raw','--no-abbrev',
     '--no-renames',reviewedHead,head,'--',...paths]),'',
    'HEAD_HAS_UNREVIEWED_PROTECTED_SOURCE_AFTER_TRANSITION');
   }else{
    ancestor(reviewedHead,base,'REVIEWED_TRANSITION_NOT_ANCESTOR_OF_BASE');
    assert.equal(git(['diff','--no-ext-diff','--no-textconv','--raw','--no-abbrev',
     '--no-renames',reviewedHead,base,'--',...paths]),'',
    'BASE_HAS_UNREVIEWED_PROTECTED_SOURCE_AFTER_TRANSITION');
    assert.equal(git(['diff','--no-ext-diff','--no-textconv','--raw','--no-abbrev',
     '--no-renames',base,head,'--',...paths]),'',
    'HEAD_HAS_UNREVIEWED_PROTECTED_SOURCE_AFTER_BASE');
   }
   reviewedTransition=reviewedHead;
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