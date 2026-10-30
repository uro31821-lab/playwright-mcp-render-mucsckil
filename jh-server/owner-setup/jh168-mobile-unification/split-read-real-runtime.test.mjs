import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFileSync,writeFileSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {buildPendingApprovalOperatorEntrypoint56} from '../server-integration/pending-approval-operator-entry.mjs';
import {applyJH168SplitReadReceiptPatch,reverseJH168SplitReadReceiptPatch} from './split-read-receipt-patch.mjs';
const root=path.resolve(import.meta.dirname,'..');
const ci={...process.env,CI:'true',NODE_ENV:'test',JH_OWNER_DEFER_LISTEN:'1'};
delete ci.RENDER_SERVICE_ID;delete ci.JH_DURABLE_RELEASE;
test('actual pinned JH168 Secure56 runtime permits exact read-only pending receipt patch without changing original bytes', {timeout:120000},async()=>{
 const immutable=['server-integration/server.mjs','deployment/functional-release-runtime.mjs',
 'deployment/durable-native-runtime-candidate.mjs',
 'deployment/durable-clean-restart-news-review-entry.mjs'];
 const originalBytes=immutable.map(p=>readFileSync(path.join(root,p)));
 const built=await buildPendingApprovalOperatorEntrypoint56(root,ci);
 const temp=path.join(root,'server-integration/server-jh168-split-read-receipt-ci-only.mjs');
 try{
  const original=readFileSync(built.runtimeFile,'utf8');
  const patched=applyJH168SplitReadReceiptPatch(original);
  assert.equal(reverseJH168SplitReadReceiptPatch(patched),original);
  assert.equal(patched.split('registerOAuthTool("life_android_pending_approval_receipt_status"').length,2);
  assert.ok(patched.includes("READBACK_PENDING"));
  assert.ok(patched.includes("jhSplitReadReceipts56.issue("));
  assert.ok(patched.includes("jhRequireCommand56(device)"));
  assert.ok(patched.includes("jhInspectSplitEvidence155(screen).ok===true"));
  assert.ok(patched.includes("durableNativeHooks56?.beforeDispatch("));
  assert.ok(patched.includes("durableNativeHooks56?.acceptedCompletion("));
  assert.ok(patched.includes("job:j,deviceId:device,sessionId:auth.sessionId"));
  assert.ok(patched.includes("effect==='READ_ONLY'"));
  writeFileSync(temp,patched,{mode:0o600});
  const syntax=spawnSync(process.execPath,['--check',temp],{
    cwd:root,encoding:'utf8',timeout:25000,env:ci
  });
  assert.equal(syntax.status,0,syntax.stderr);
  assert.equal(readFileSync(built.runtimeFile,'utf8'),original);
  for(let i=0;i<immutable.length;i++)
    assert.deepEqual(readFileSync(path.join(root,immutable[i])),originalBytes[i]);
 }finally{
  rmSync(temp,{force:true});
  for(const p of [built.runtimeFile,built.ownerFile,built.unifiedFile,built.file,built.stampFile])
   rmSync(p,{force:true});
 }
});
