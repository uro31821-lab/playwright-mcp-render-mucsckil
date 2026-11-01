import test from 'node:test';
import assert from 'node:assert/strict';
import {applyComputerExecutionReceiptPatch,reverseComputerExecutionReceiptPatch} from './computer-execution-receipt-patch.mjs';
const baseline=()=>[
 'durableNativeHooks56?.acceptedCompletion(',
 'function pendingApprovalReceiptStatus56(args){',
 ' const commandId=jhRequireCommand56(deviceId);',
 'const computerInspectReceipt56=createComputerInspectReceiptRegistry56();',
 'function secureCall56(mcpToolName,jobType,effect,args,extra={}){',
 '    const inspectReceipt=computerInspectReceipt56.issue({});',
 '    return textResult({...safeJobView56(j),...(receipt||inspectReceipt||{})});',
 '  if(/^cir_[A-Za-z0-9_-]{43}$/.test(String(args.receipt_token||""))){',
 'description:"READ ONLY: use the returned receipt token to look up only the ORIGINAL queued approval or Computer Use inspect. Never request, execute, approve, or replay an Android action.",'
].join('\n');
test('patch is exact, reversible, read-only and retains native signature/durable hooks',()=>{
 const before=baseline(),after=applyComputerExecutionReceiptPatch(before);
 assert.equal(reverseComputerExecutionReceiptPatch(after),before);
 for(const s of ['computerExecutionReceipts56.issue(','computerExecutionReceipts56.read(','jhRequireCommand56(deviceId)','durableNativeHooks56?.acceptedCompletion(','mcpToolName==="life_android_execute_computer_action"'])
  assert.ok(after.includes(s),s);
 assert.equal(after.split('computerExecutionReceipts56.issue(').length,2);
 assert.equal(after.split('computerExecutionReceipts56.read(').length,2);
});
test('guard deletion and duplicate patch fail closed',()=>{
 assert.throws(()=>applyComputerExecutionReceiptPatch('unsafe'),/SECURE56_REQUIRED/);
 assert.throws(()=>applyComputerExecutionReceiptPatch(applyComputerExecutionReceiptPatch(baseline())));
 assert.throws(()=>applyComputerExecutionReceiptPatch(baseline().replace('jhRequireCommand56(deviceId)','noFence()')));
});
