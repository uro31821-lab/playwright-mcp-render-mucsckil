import test from 'node:test';
import assert from 'node:assert/strict';
import {createSameCommandApprovalCheckpoint56} from './original-approval-checkpoint.mjs';
const scope=Object.freeze({
 deviceId:'phone-1',sessionId:'signed-secure56-session',
 commandId:'a'.repeat(32),workWindowId:1559,
 workPackage:'com.android.chrome',
 taskDigest:'b'.repeat(64),actionDigest:'c'.repeat(64),
 targetDigest:'d'.repeat(64),screenDigest:'e'.repeat(64),
 action:'CLICK',expiresAt:150000
});
const operationId='f'.repeat(32),receiptToken='g'.repeat(43);
const original=()=>({
 id:'job_17',type:'computer_use_action_approval_request',
 targetDeviceId:scope.deviceId,secureSessionId:scope.sessionId,
 commandId:scope.commandId,taskDigest:scope.taskDigest,
 status:'queued',expiresAtMs:140000
});
let now=100000;
function machine(options={}){
 let reads=0,owners=0,queued=0,proof=0;
 const state={status:'queued',lookupOnly:true,result:null};
 const port=createSameCommandApprovalCheckpoint56({
  clock:()=>now,
  verifyOriginalOwner:async()=>{owners++;return options.ownerOk!==false},
  verifyOriginalQueuedApproval:async()=>{queued++;return options.requestOk!==false},
  readOriginalApprovalReceipt:async()=>{reads++;return options.resp??{...state}},
  verifyOriginalApprovalReadback:async()=>{proof++;return options.proofOk!==false}
 });
 return {port,get metrics(){return {reads,owners,queued,proof}}};
}
test('bind authentic existing phone approval once, do not issue another prompt',async()=>{
 const m=machine(),params={operationId,scope,originalApprovalJob:original(),receiptToken};
 const a=await m.port.bind(params),b=await m.port.bind(params);
 assert.equal(a.code,'ORIGINAL_PHONE_APPROVAL_PENDING');
 assert.equal(b.code,'EXISTING_APPROVAL_RECEIPT_REUSED');
 assert.equal(b.newApprovalRequested,false);
 assert.equal(m.metrics.reads,0);
 assert.equal(b.approvalGranted,false);
});
test('queued original receipt only returns same token, with no new action or prompt',async()=>{
 const m=machine();
 await m.port.bind({operationId,scope,originalApprovalJob:original(),receiptToken});
 const q=await m.port.status({operationId,currentScope:scope});
 assert.equal(q.code,'PHONE_LOCAL_APPROVAL_STILL_PENDING');
 assert.equal(q.receiptToken,receiptToken);
 assert.equal(q.newApprovalRequested,false);assert.equal(q.actionDispatched,false);
 assert.equal(m.metrics.reads,1);
});
test('original signed phone approval status requires FRESH original prepare, never grants',async()=>{
 const m=machine({resp:{status:'complete',lookupOnly:true,
  result:{ok:true,approved:true,phoneLocalApproved:true}}});
 await m.port.bind({operationId,scope,originalApprovalJob:original(),receiptToken});
 const q=await m.port.status({operationId,currentScope:scope});
 assert.equal(q.ok,true);
 assert.equal(q.code,'ORIGINAL_PHONE_APPROVAL_VERIFIED_REPREPARE_REQUIRED');
 assert.equal(q.next,'ORIGINAL_PHONE_PREPARE_WITH_FRESH_SCREEN');
 assert.equal(q.approvalGranted,false);assert.equal(q.actionDispatched,false);
 assert.equal((await m.port.status({operationId,currentScope:scope})).code,'ORIGINAL_APPROVAL_TERMINAL');
 assert.equal(m.metrics.reads,1);
});
test('different window, command, target, action or screen cannot read same approval',async()=>{
 for(const changed of [
  {workWindowId:2000},{sessionId:'other'}, {commandId:'9'.repeat(32)},
  {targetDigest:'9'.repeat(64)},{screenDigest:'9'.repeat(64)},
  {action:'SCROLL'}, {deviceId:'other'}
 ]){
  const m=machine();
  await m.port.bind({operationId,scope,originalApprovalJob:original(),receiptToken});
  const r=await m.port.status({operationId,currentScope:{...scope,...changed}});
  assert.equal(r.code,'ORIGINAL_APPROVAL_SCOPE_CHANGED',JSON.stringify(changed));
  assert.equal(m.metrics.reads,0);
 }
});
test('approval job validation, invalid owner, wrong authority and bad token deny before bind',async()=>{
 const cases=[
  {originalApprovalJob:{...original(),type:'computer_use_action_execute'}},
  {originalApprovalJob:{...original(),targetDeviceId:'other'}},
  {originalApprovalJob:{...original(),status:'complete'}},
  {originalApprovalJob:{...original(),commandId:'9'.repeat(32)}},
  {originalApprovalJob:{...original(),expiresAtMs:now-1}},
  {receiptToken:'invalid'},
  {scope:{...scope,action:'PAYMENT'}}
 ];
 for(const changed of cases){
  const m=machine(),r=await m.port.bind({
   operationId,scope,originalApprovalJob:original(),receiptToken,...changed});
  assert.equal(r.ok,false);assert.equal(m.metrics.reads,0);
 }
 const m=machine({ownerOk:false});
 assert.equal((await m.port.bind({operationId,scope,originalApprovalJob:original(),receiptToken})).ok,false);
});
test('reusing operationId with different approval token or target fails closed',async()=>{
 const m=machine();
 const params={operationId,scope,originalApprovalJob:original(),receiptToken};
 assert.equal((await m.port.bind(params)).ok,true);
 assert.equal((await m.port.bind({...params,receiptToken:'h'.repeat(43)})).code,
 'ORIGINAL_APPROVAL_DIFFERENT_SCOPE_REJECTED');
 assert.equal((await m.port.bind({...params,scope:{...scope,actionDigest:'8'.repeat(64)}})).code,
 'ORIGINAL_APPROVAL_DIFFERENT_SCOPE_REJECTED');
});
test('unsigned status cannot be upgraded to a reusable approval',async()=>{
 const cases=[
  {resp:{status:'complete',lookupOnly:true,result:{ok:true,approved:true,phoneLocalApproved:true}},proofOk:false},
  {resp:{status:'complete',lookupOnly:true,result:{ok:true,approved:true}}},
  {resp:{status:'complete',lookupOnly:false,result:{ok:true,approved:true,phoneLocalApproved:true}}},
  {resp:{status:'complete',lookupOnly:true,result:{ok:false,approved:true,phoneLocalApproved:true}}},
  {resp:{status:'error',lookupOnly:true,result:{ok:false}}},
  {resp:{status:'expired',lookupOnly:true,result:{ok:false}}}
 ];
 for(const options of cases){
  const m=machine(options);
  await m.port.bind({operationId,scope,originalApprovalJob:original(),receiptToken});
  const r=await m.port.status({operationId,currentScope:scope});
  assert.equal(r.ok,false);assert.equal(r.approvalGranted,false);
  assert.equal(r.actionDispatched,false);
 }
});
test('old or expired approval cannot be read under new generation',async()=>{
 const m=machine();
 await m.port.bind({operationId,scope,originalApprovalJob:original(),receiptToken});
 now=140001;
 const r=await m.port.status({operationId,currentScope:scope});
 assert.equal(r.code,'ORIGINAL_APPROVAL_RECEIPT_UNKNOWN');
 assert.equal(m.metrics.reads,0);
 now=100000;
});
test('nonexistent or incomplete approval callbacks are rejected upfront',()=>{
 assert.throws(()=>createSameCommandApprovalCheckpoint56(),/ORIGINAL_SECURE56_APPROVAL_PORTS_REQUIRED/);
});
