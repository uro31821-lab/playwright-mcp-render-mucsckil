/** Read-only Git source audit. A reviewed snapshot is fixed; branch names may move.
 * Compare origin, committed candidate and working files separately so a candidate
 * cannot hide an upstream change by reverting it. No deploy or device authority.
 */
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';

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
 // Raw diffs also reject additions, removals, renames, executable bits and symlinks.
 assert.equal(diff(base),'','BASE_PROTECTED_SOURCE_CHANGED');
 assert.equal(diff(head),'','HEAD_PROTECTED_SOURCE_CHANGED');
 assert.equal(diff(null),'','WORKTREE_PROTECTED_SOURCE_CHANGED');
 assert.equal(git(['ls-files','--others','--exclude-standard','--',...paths]),'',
  'UNTRACKED_PROTECTED_SOURCE');
 return {baseline,base,head,protectedPaths:[...paths]};
}
