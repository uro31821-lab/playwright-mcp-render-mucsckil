#!/usr/bin/env node
/** Exact fail-closed source audit for Ebiseo 0.5.7 permanent device trust. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const ROOT='jh-server/owner-setup/';
export const EBISEO057_EXACT=Object.freeze({
 [ROOT+'owner-enrollment/owner-enrollment-base.mjs']:'d4e7abe44109966994da3d0749b8b5dffc357fcd',
 [ROOT+'owner-enrollment/owner-enrollment.mjs']:'51beb4d40b2cd7542b50a47178b56541b762b12d',
 [ROOT+'owner-enrollment/owner-registry-service.mjs']:'83cb17d78ed9a668ce0b7f2df6c4a9a243d7153c',
 [ROOT+'owner-enrollment/permanent-trust-revocation.test.mjs']:'468320bc9a02b97da4169717249afcad257aa6cc',
 [ROOT+'trusted-server/trusted-device-registry-base.mjs']:'859baf0e806f7228ee4efe9b13913d0796fd77f9',
 [ROOT+'trusted-server/trusted-device-registry.mjs']:'82b8b1d1ed695394e729c0a98d806df457411d26',
 [ROOT+'trusted-server/trusted-settings-service.mjs']:'4838109a0fa085a326ed099dc7cf34e2ffe6007c'
});
export const EBISEO057_PRIOR=Object.freeze({
 [ROOT+'owner-enrollment/owner-enrollment-base.mjs']:null,
 [ROOT+'owner-enrollment/owner-enrollment.mjs']:'d4e7abe44109966994da3d0749b8b5dffc357fcd',
 [ROOT+'owner-enrollment/owner-registry-service.mjs']:'d72b53a957605a2f1cd1fa08e460dac16964d441',
 [ROOT+'owner-enrollment/permanent-trust-revocation.test.mjs']:null,
 [ROOT+'trusted-server/trusted-device-registry-base.mjs']:null,
 [ROOT+'trusted-server/trusted-device-registry.mjs']:'859baf0e806f7228ee4efe9b13913d0796fd77f9',
 [ROOT+'trusted-server/trusted-settings-service.mjs']:'d88cfc3775c5d0f600fcb250be55f966931e1d4d'
});
const entry=(path,sha)=>`100644 blob ${sha}\t${path}`;
const run=(cwd,args,options={})=>execFileSync('git',['-c','core.fileMode=true',...args],{
 cwd,encoding:'utf8',timeout:15000,maxBuffer:20*1024*1024,...options
}).trim();

export function assertEbiseo057Source({cwd=process.cwd(),baseRef='origin/jh-fix3-secure-server',headRef='HEAD'}={}){
 const base=run(cwd,['rev-parse','--verify','--end-of-options',baseRef+'^{commit}']);
 const head=run(cwd,['rev-parse','--verify','--end-of-options',headRef+'^{commit}']);
 run(cwd,['merge-base','--is-ancestor',base,head]);
 const paths=Object.keys(EBISEO057_EXACT);
 for(const path of paths){
  const expected=EBISEO057_EXACT[path];
  assert.equal(run(cwd,['ls-tree',head,'--',path]),entry(path,expected),'EBISEO057_HEAD_BLOB_CHANGED_'+path);
  const prior=EBISEO057_PRIOR[path],actualBase=run(cwd,['ls-tree',base,'--',path]);
  assert.ok(actualBase===(prior?entry(path,prior):'')||actualBase===entry(path,expected),
    'EBISEO057_BASE_BLOB_UNREVIEWED_'+path);
 }
 assert.equal(run(cwd,['diff','--no-ext-diff','--no-textconv','--raw','--no-abbrev','--no-renames',head,'--',...paths]),'',
  'EBISEO057_WORKTREE_CHANGED');
 assert.equal(run(cwd,['ls-files','--others','--exclude-standard','--',...paths]),'','EBISEO057_UNTRACKED_SOURCE');
 return Object.freeze({base,head,files:paths.length,automaticReplayAllowed:false});
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=assertEbiseo057Source();
 process.stdout.write('JH_EBISEO057_SOURCE_AUDIT_PASS '+JSON.stringify(result)+'\n');
}
