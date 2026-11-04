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
  preBase:'d4afec4a657d4ad928560624536c01e2df6df1c7',
  reviewedHead:'eab1c89cbe45ac97e04f4196778270e546bf7023',
  protectedObjects:Object.freeze({
   'jh-server/owner-setup/jh168-mobile-unification/mobile13-action-policy.mjs':
    '0bf1ac0e09380aabf3fb2fefeabc15d905d34417',
   'jh-server/owner-setup/jh168-mobile-unification/mobile13-action-policy.test.mjs':
    '69325dca75c15ebf99fba7d3494bc8467e7508c6',
   'jh-server/owner-setup/jh168-mobile-unification/mobile13-command-diagnostics.mjs':
    '91b1926a4e1f173d22ac8e3f233245849a12061a',
   'jh-server/owner-setup/jh168-mobile-unification/mobile13-integrated-contract.test.mjs':
    '22db043c104333e588aaae3d5f7a68cd10431d80',
   'jh-server/owner-setup/jh168-mobile-unification/stage25-live-operator-followup-entry.mjs':
    'b12e000a1ace7e9c2745a2ad7ce17d1b61e4a161',
   'jh-server/owner-setup/jh168-mobile-unification/stage38-generated-operator.test.mjs':
    '711bcd6b92bb3d04cd41b93bb5b7bac94b40bd2c',
   'jh-server/owner-setup/jh168-mobile-unification/stage40-owner-admission-diagnostics.test.mjs':
    'e862388a9f78b1ac16a1d2d1c5856b65b64b184c',
   'jh-server/owner-setup/jh168-mobile-unification/stage41-command-lifecycle.test.mjs':
    '1575f588e7976e60558ef290c85d91f238d5c5e9',
   'jh-server/owner-setup/jh168-mobile-unification/stage42-protected-source-provenance.test.mjs':
    'b16c5013454ae40a3a7ca00036507ecedfe6388c',
   'jh-server/owner-setup/jh168-mobile-unification/stage44-device-focus.test.mjs':
    '039ff80238de62a5e9592509e35d182d630180c9',
   'jh-server/owner-setup/jh168-mobile-unification/stage61-mobile-runtime-patch.mjs':
    '501bf71e67d5ea77e696559118f06f7c7150205f',
   'jh-server/owner-setup/jh168-mobile-unification/stage61-mobile-runtime-patch.test.mjs':
    'dea8274e84bed5828da798f85e22e0c01af0ddc2',
   'jh-server/owner-setup/jh168-mobile-unification/stage61-right-pane-host-adapter.test.mjs':
    'c026d1aa0351516b48464411083ff4fb4c09fad2'
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
