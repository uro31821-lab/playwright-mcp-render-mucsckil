import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {buildStage25PendingOperatorEntrypoint56} from './stage25-live-operator-followup-entry.mjs';
import {reverseComputerExecutionReceiptPatch} from './computer-execution-receipt-patch.mjs';
import {reverseSnapshotDigestReadbackPatch56} from './snapshot-digest-readback-patch.mjs';
import {reverseStage61MobileRuntime56} from './stage61-mobile-runtime-patch.mjs';
const root=path.resolve('jh-server/owner-setup');
const MOBILE_MODE='EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1';
const env={CI:'true',NODE_ENV:'test',JH_OWNER_DEFER_LISTEN:'1',
 JH_MOBILE_WEB_13_MODE:MOBILE_MODE,
 JH_STAGE26_SIGNED_COMPLETION_ACK:'EXPLICIT_IDENTICAL_SIGNED_RESULT_V1'};
test('actual generated Stage25/26 Secure56 operator contains exact read-only Computer Use execute receipt',async()=>{
 // The lower reviewed composition selects the mobile-web patch from process.env,
 // while the outer Stage25 builder receives the explicit immutable env object.
 // Bind both to the same synthetic CI-only mode, then restore the process value.
 const previous=process.env.JH_MOBILE_WEB_13_MODE;
 process.env.JH_MOBILE_WEB_13_MODE=MOBILE_MODE;
 let built;
 try{built=await buildStage25PendingOperatorEntrypoint56(root,env);}
 finally{
  if(previous===undefined)delete process.env.JH_MOBILE_WEB_13_MODE;
  else process.env.JH_MOBILE_WEB_13_MODE=previous;
 }
 assert.equal(built.productionEnabled,false);assert.equal(built.listenerStarted,false);
 assert.equal(built.stamp.computerExecutionReceiptStage38,true);
 const source=readFileSync(built.runtimeFile,'utf8');
 // This fixture enables mobile RIGHT plus Stage26. The exact generated outer
 // order is Computer receipt -> Snapshot readback -> Stage61. Reverse that
 // order before checking the original Stage38 receipt boundary.
 const beforeStage61=reverseStage61MobileRuntime56(source);
 const beforeSnapshot=reverseSnapshotDigestReadbackPatch56(beforeStage61);
 const parent=reverseComputerExecutionReceiptPatch(beforeSnapshot);
 assert.ok(parent.includes('durableNativeHooks56?.acceptedCompletion('));
 assert.ok(source.includes('jhRequireCommand56(deviceId)'));
 assert.ok(source.includes('computerExecutionReceipts56.issue('));
 assert.ok(source.includes('computerExecutionReceipts56.read('));
 assert.ok(source.includes('computerUse')||source.includes('computer_use_action_execute'));
 assert.ok(source.includes('READ ONLY: recover only the ORIGINAL'));
 assert.equal(source.split('computerExecutionReceipts56.issue(').length,2);
 assert.equal(source.split('computerExecutionReceipts56.read(').length,2);
 assert.equal(source.split('registerOAuthTool("life_android_pending_approval_receipt_status"').length,2);
 assert.ok(!source.includes('automaticActionRetryEnabled:true'));
});
