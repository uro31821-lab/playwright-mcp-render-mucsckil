import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {
 buildStage25PendingOperatorEntrypoint56,
 selectStage25PendingOperatorRuntime56
} from './stage25-live-operator-followup-entry.mjs';
import {reverseJH168SplitFollowupReceiptPatch} from './split-followup-receipt-patch.mjs';
import {selectPendingApprovalOperatorRuntime56} from '../server-integration/pending-approval-operator-entry.mjs';
const root=path.resolve(import.meta.dirname,'..');
const env={CI:'true',NODE_ENV:'test',JH_OWNER_DEFER_LISTEN:'1'};
const sha=s=>createHash('sha256').update(s).digest('hex');
const validate=file=>{
 const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8',timeout:30000});
 assert.equal(r.status,0,file+' '+r.stderr);
};

test('real current pending-approval operator remains intact after exact Stage25 composition',async()=>{
 const base=await buildStage25PendingOperatorEntrypoint56(root,env);
 assert.equal(base.listenerStarted,false);assert.equal(base.productionEnabled,false);
 assert.equal(base.originalOperatorPreserved,true);
 const parent=selectPendingApprovalOperatorRuntime56(root,env);
 const candidate=selectStage25PendingOperatorRuntime56(root,env);
 const original=readFileSync(parent.file,'utf8');
 const runtime=readFileSync(candidate.file,'utf8');
 assert.equal(reverseJH168SplitFollowupReceiptPatch(runtime),original);
 assert.equal(sha(original),base.stamp.parentSha256);
 assert.equal(sha(runtime),base.stamp.runtimeSha256);
 for(const x of ['pendingApprovalReceipts56','jhSplitReadReceipts56',
   'computerInspectReceipt56','durableNativeHooks56?.acceptedCompletion(',
   'jhRequireCommand56(','jhSplitFollowupReceipts56.read(',
   'jhSplitFollowupReceipts56.issue('])
   assert.ok(runtime.includes(x),'original or additional requirement '+x);
 assert.equal(runtime.split('jhSplitFollowupReceipts56.issue(').length-1,1);
 assert.equal(runtime.split('jhSplitFollowupReceipts56.read(').length-1,1);
 const owner=readFileSync(base.ownerFile,'utf8');
 const unified=readFileSync(base.unifiedFile,'utf8');
 const operational=readFileSync(base.file,'utf8');
 const originalOwner=readFileSync(path.join(root,'deployment/owner-service-pending-approval-operator.mjs'),'utf8');
 const restoredOwner=owner
  .replace('import {selectStage25PendingOperatorRuntime56} from "../jh168-mobile-unification/stage25-live-operator-followup-entry.mjs";',
           'import {selectPendingApprovalOperatorRuntime56} from "../server-integration/pending-approval-operator-entry.mjs";')
  .replace("if(runtimeMode==='unified')serverPath=selectStage25PendingOperatorRuntime56(root,process.env).file;",
           "if(runtimeMode==='unified')serverPath=selectPendingApprovalOperatorRuntime56(root,process.env).file;");
 assert.equal(restoredOwner,originalOwner,'existing pending approval and owner learning must be byte-identical');
 assert.ok(owner.includes("serverPath=selectStage25PendingOperatorRuntime56(root,process.env).file;"));
 assert.ok(unified.includes("from './owner-service-stage25-followup-operator.mjs';"));
 assert.ok(operational.includes("from './unified-service-stage25-followup-operator.mjs';"));
 assert.ok(operational.includes('const runtime=selectStage25PendingOperatorRuntime56(ROOT,process.env).file;'));
 assert.ok(operational.includes('prepareOrVerifyDurableRelease({config,key,mode:env.JH_DURABLE_RELEASE})'));
 assert.ok(base.stamp.originalPendingApprovalOperator&&base.stamp.originalSplitRead&&
   base.stamp.originalComputerInspect&&base.stamp.originalOperationalLearning);
 for(const f of [base.file,base.ownerFile,base.unifiedFile,base.runtimeFile])validate(f);
});
test('no startup without original operator and exact Stage25 explicit production flag',async()=>{
 const bad=[
  {},
  {JH_SPLIT_FOLLOWUP_OPERATOR_ENABLE:'EXPLICIT_FOLLOWUP_CLICK_RECEIPT_V1'},
  {RENDER_SERVICE_ID:'srv-db0fjl2d0e5s73be114g',
   JH_DURABLE_RELEASE:'SERVE_READY_V1',
   JH_SPLIT_FOLLOWUP_OPERATOR_ENABLE:'EXPLICIT_FOLLOWUP_CLICK_RECEIPT_V1'},
  {CI:'true',NODE_ENV:'test',JH_OWNER_DEFER_LISTEN:'1',
   JH_SPLIT_FOLLOWUP_OPERATOR_ENABLE:'EXPLICIT_FOLLOWUP_CLICK_RECEIPT_V1'}
 ];
 for(const e of bad)await assert.rejects(
  buildStage25PendingOperatorEntrypoint56(root,e),/NOT_AUTHORIZED/);
 const candidate=selectStage25PendingOperatorRuntime56(root,env);
 assert.equal(candidate.originalOperatorVerified,true);
 assert.equal(candidate.automaticReplayAllowed,false);
});
test('historical npm start and router do not auto-select Stage25',()=>{
 const pkg=JSON.parse(readFileSync(path.join(root,'../package.json'),'utf8'));
 assert.equal(pkg.scripts.start,'node owner-setup/deployment/published-host-router.mjs');
 const router=readFileSync(path.join(root,'deployment/published-host-router.mjs'),'utf8');
 assert.ok(router.includes("await import('../server-integration/pending-approval-operator-entry.mjs')"));
 assert.ok(router.includes("if(selectJH168FollowupOperator56(process.env)==='followup')"));
 assert.ok(router.includes("await import('../server-integration/pending-approval-operator-entry.mjs')"));
});

