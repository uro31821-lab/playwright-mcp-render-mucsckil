import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFileSync,writeFileSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {buildPendingApprovalOperatorEntrypoint56} from '../server-integration/pending-approval-operator-entry.mjs';
import {applyJH168OpenReadPatch,reverseJH168OpenReadPatch} from './open-and-observe-patch.mjs';
const root=path.resolve(import.meta.dirname,'..');
const ci={...process.env,CI:'true',NODE_ENV:'test',JH_OWNER_DEFER_LISTEN:'1'};
delete ci.RENDER_SERVICE_ID;delete ci.JH_DURABLE_RELEASE;
test('actual pinned JH168 generated runtime accepts the right Chrome open+observe candidate without baseline drift', {timeout:120000},async()=>{
 const immutable=['server-integration/server.mjs','deployment/functional-release-runtime.mjs',
 'deployment/durable-native-runtime-candidate.mjs',
 'deployment/durable-clean-restart-news-review-entry.mjs'];
 const prior=immutable.map(p=>readFileSync(path.join(root,p)));
 const built=await buildPendingApprovalOperatorEntrypoint56(root,ci);
 const temp=path.join(root,'server-integration/server-jh168-open-read-ci-only.mjs');
 try{
  const original=readFileSync(built.runtimeFile,'utf8');
  const patched=applyJH168OpenReadPatch(original);
  assert.equal(reverseJH168OpenReadPatch(patched),original);
  assert.equal(patched.split('jh168OpenRead').length,1); // no unrelated host route changed
  assert.ok(patched.includes('jh168ReadAfterOpen56'));
  assert.ok(patched.includes('life_android_pending_approval_receipt_status'));
  assert.ok(patched.includes('jhRequireCommand56('));
  assert.ok(patched.includes('durableNativeHooks56?.beforeDispatch('));
  assert.ok(patched.includes('durableNativeHooks56?.acceptedCompletion('));
  writeFileSync(temp,patched,{mode:0o600});
  const syntax=spawnSync(process.execPath,['--check',temp],{cwd:root,encoding:'utf8',timeout:25000,env:ci});
  assert.equal(syntax.status,0,syntax.stderr);
  assert.equal(readFileSync(built.runtimeFile,'utf8'),original);
  for(let i=0;i<immutable.length;i++)assert.deepEqual(readFileSync(path.join(root,immutable[i])),prior[i]);
 }finally{
  rmSync(temp,{force:true});
  for(const p of [built.runtimeFile,built.ownerFile,built.unifiedFile,built.file,built.stampFile])
   rmSync(p,{force:true});
 }
});
