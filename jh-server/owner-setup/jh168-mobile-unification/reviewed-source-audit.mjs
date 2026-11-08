/**
 * Narrow reviewed-source extension for Ebiseo 0.5.7.
 *
 * The historical source auditor remains byte-identical in
 * reviewed-source-audit-base.mjs. This layer permits only the exact reviewed
 * permanent-trust/revocation objects below. Every other protected path continues
 * through the original fail-closed audit. No branch name, working-tree change,
 * untracked file, alternate mode, rename, or later blob is accepted.
 */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {assertReviewedSource as assertHistoricalSource} from './reviewed-source-audit-base.mjs';

const ROOT='jh-server/owner-setup/';
const SELF=ROOT+'jh168-mobile-unification/reviewed-source-audit.mjs';
const HISTORICAL_AUDITOR=ROOT+'jh168-mobile-unification/reviewed-source-audit-base.mjs';
const EXACT=Object.freeze({
 [ROOT+'owner-enrollment/owner-enrollment-base.mjs']:'d4e7abe44109966994da3d0749b8b5dffc357fcd',
 [ROOT+'owner-enrollment/owner-enrollment.mjs']:'51beb4d40b2cd7542b50a47178b56541b762b12d',
 [ROOT+'owner-enrollment/owner-registry-service.mjs']:'83cb17d78ed9a668ce0b7f2df6c4a9a243d7153c',
 [ROOT+'owner-enrollment/permanent-trust-revocation.test.mjs']:'468320bc9a02b97da4169717249afcad257aa6cc',
 [ROOT+'trusted-server/trusted-device-registry-base.mjs']:'859baf0e806f7228ee4efe9b13913d0796fd77f9',
 [ROOT+'trusted-server/trusted-device-registry.mjs']:'82b8b1d1ed695394e729c0a98d806df457411d26',
 [ROOT+'trusted-server/trusted-settings-service.mjs']:'4838109a0fa085a326ed099dc7cf34e2ffe6007c',
 [HISTORICAL_AUDITOR]:'111591a4bae13c94bf1ffd36c9dd586853f36ce6'
});
const PRIOR=Object.freeze({
 [ROOT+'owner-enrollment/owner-enrollment-base.mjs']:null,
 [ROOT+'owner-enrollment/owner-enrollment.mjs']:'d4e7abe44109966994da3d0749b8b5dffc357fcd',
 [ROOT+'owner-enrollment/owner-registry-service.mjs']:'d72b53a957605a2f1cd1fa08e460dac16964d441',
 [ROOT+'owner-enrollment/permanent-trust-revocation.test.mjs']:null,
 [ROOT+'trusted-server/trusted-device-registry-base.mjs']:null,
 [ROOT+'trusted-server/trusted-device-registry.mjs']:'859baf0e806f7228ee4efe9b13913d0796fd77f9',
 [ROOT+'trusted-server/trusted-settings-service.mjs']:'d88cfc3775c5d0f600fcb250be55f966931e1d4d',
 [HISTORICAL_AUDITOR]:null
});
const exactEntry=(path,blob)=>`100644 blob ${blob}\t${path}`;

export function assertReviewedSource(options){
 const {cwd,baseRef='refs/remotes/origin/jh-fix3-secure-server',headRef='HEAD',paths}=options||{};
 assert.ok(typeof cwd==='string'&&cwd.length,'REVIEWED_CWD_REQUIRED');
 assert.ok(Array.isArray(paths)&&paths.length,'EXPLICIT_PROTECTED_PATHS_REQUIRED');
 const run=args=>execFileSync('git',['-c','core.fileMode=true',...args],{
  cwd,encoding:'utf8',timeout:15000,maxBuffer:20*1024*1024
 }).trim();
 const resolve=ref=>run(['rev-parse','--verify','--end-of-options',ref+'^{commit}']);
 const base=resolve(baseRef),head=resolve(headRef);
 for(const [path,blob] of Object.entries(EXACT)){
  assert.equal(run(['ls-tree',head,'--',path]),exactEntry(path,blob),
   'EBISEO057_HEAD_BLOB_CHANGED_'+path);
  const baseEntry=run(['ls-tree',base,'--',path]);
  const prior=PRIOR[path];
  assert.ok(baseEntry===(prior?exactEntry(path,prior):'')||baseEntry===exactEntry(path,blob),
   'EBISEO057_BASE_BLOB_UNREVIEWED_'+path);
 }
 const exceptionPaths=[SELF,...Object.keys(EXACT)];
 assert.equal(run(['diff','--no-ext-diff','--no-textconv','--raw','--no-abbrev',
  '--no-renames',head,'--',...exceptionPaths]),'','EBISEO057_WORKTREE_CHANGED');
 assert.equal(run(['ls-files','--others','--exclude-standard','--',...exceptionPaths]),'',
  'EBISEO057_UNTRACKED_SOURCE');
 const scoped=[...paths,...exceptionPaths.map(path=>':(exclude)'+path)];
 const result=assertHistoricalSource({...options,baseRef,headRef,paths:scoped});
 return Object.freeze({...result,ebiseo057ExactObjects:Object.freeze({...EXACT})});
}
