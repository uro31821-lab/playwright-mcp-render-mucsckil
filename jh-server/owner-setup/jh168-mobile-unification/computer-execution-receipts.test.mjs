import test from 'node:test';
import assert from 'node:assert/strict';
import {createComputerExecutionReceiptRegistry56} from './computer-execution-receipts.mjs';
const H32='a'.repeat(32),H64='b'.repeat(64);let now=20000,k=0;
const binding={deviceId:'device',deviceDigest:'c'.repeat(64),sessionId:'session',commandId:H32,taskDigest:H64,runDigest:'d'.repeat(64)};
const job=()=>({id:'job_42',type:'computer_use_action_execute',mcpToolName:'life_android_execute_computer_action',
 secureRequestedEffect:'MUTATION',action:'SCROLL',status:'in_progress',targetDeviceId:binding.deviceId,
 targetDeviceDigest:binding.deviceDigest,secureSessionId:binding.sessionId,commandId:binding.commandId,
 taskDigest:binding.taskDigest,runDigest:binding.runDigest,leaseToken:'lease-1234567890-secret',
 secureMac:'e'.repeat(64),securePayloadDigest:'f'.repeat(64),expiresAtMs:now+90000,secureExpiresAt:now+90000,secureInvocationExpiresAt:now+90000});
const create=()=>createComputerExecutionReceiptRegistry56({now:()=>now,newToken:()=>String(++k).padStart(43,'a')});
const read=(r,ref,j,b=binding)=>r.read({receiptToken:ref,...b},()=>j);
test('only original signed queued EXECUTE creates a scoped non-authorizing receipt',()=>{
 now=20000;const r=create(),j=job(),token=r.issue({job:j,...binding});
 assert.ok(token?.receiptToken.startsWith('cer_'));
 assert.equal(token.newJobCreated,false);assert.equal(token.automaticReplay,false);
 assert.doesNotMatch(JSON.stringify(token),/lease-1234/);
 for(const change of [{type:'computer_use_inspect'},{mcpToolName:'life_web_click'},{secureRequestedEffect:'READ_ONLY'},
  {status:'complete'},{leaseToken:null},{secureMac:null},{commandId:'0'.repeat(32)}])
   assert.equal(r.issue({job:{...j,...change},...binding}),null,JSON.stringify(change));
});
test('read pending then verified original result without replay, never copy raw payload',()=>{
 now=20000;const r=create(),j=job(),token=r.issue({job:j,...binding});
 assert.equal(read(r,token.receiptToken,j).executionStatus,'PENDING');
 j.status='complete';j.result={ok:true,code:'scroll_viewport_movement_verified',resultVerified:true,dispatched:true,secret:'DO_NOT_LEAK'};
 const result=read(r,token.receiptToken,j);
 assert.equal(result.code,'COMPUTER_EXECUTION_RESULT_RECEIVED');
 assert.equal(result.deviceReportedVerified,true);assert.equal(result.userTaskVerified,false);
 assert.equal(result.actionReplayed,false);assert.doesNotMatch(JSON.stringify(result),/DO_NOT_LEAK/);
});
test('original negative result is received but NOT reported as task success',()=>{
 now=20000;const r=create(),j=job(),token=r.issue({job:j,...binding});
 j.status='complete';j.result={ok:false,code:'blocked',resultVerified:false};
 const result=read(r,token.receiptToken,j);
 assert.equal(result.deviceReportedOk,false);assert.equal(result.userTaskVerified,false);
});
test('device, HMAC/session/command/task/run/lease and job mutation fail closed',()=>{
 now=20000;const r=create(),j=job(),token=r.issue({job:j,...binding});
 for(const change of [{deviceId:'other'},{deviceDigest:'1'.repeat(64)},{sessionId:'other'},{commandId:'f'.repeat(32)},{taskDigest:'f'.repeat(64)},{runDigest:'f'.repeat(64)}])
  assert.equal(read(r,token.receiptToken,j,{...binding,...change}).code,'COMPUTER_EXECUTION_RECEIPT_SCOPE_CHANGED');
 for(const change of [{id:'job_2'},{secureMac:'f'.repeat(64)},{securePayloadDigest:'e'.repeat(64)},{leaseToken:'changed-1234567890'},{action:'CLICK'},{type:'computer_use_inspect'}])
  assert.equal(read(r,token.receiptToken,{...j,...change}).code,'COMPUTER_EXECUTION_ORIGINAL_JOB_CHANGED');
});
test('missing, crashed process, expired and unclassified original remain UNKNOWN',()=>{
 now=20000;const r=create(),j=job(),token=r.issue({job:j,...binding});
 assert.equal(read(create(),token.receiptToken,j).code,'COMPUTER_EXECUTION_RECEIPT_UNAVAILABLE');
 j.status='expired';assert.equal(read(r,token.receiptToken,j).executionStatus,'UNKNOWN');
 j.status='complete';j.result={ok:'string'};assert.equal(read(r,token.receiptToken,j).code,'COMPUTER_EXECUTION_RESULT_UNCLASSIFIED');
 now=token.receiptExpiresAtMs;assert.equal(read(r,token.receiptToken,j).code,'COMPUTER_EXECUTION_RECEIPT_UNAVAILABLE');
});
