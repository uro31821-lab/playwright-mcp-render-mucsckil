import test from 'node:test';
import assert from 'node:assert/strict';
import {createComputerExecutionReceiptRegistry56} from './computer-execution-receipts.mjs';
const H32='a'.repeat(32),H64='b'.repeat(64);let now=20000,k=0;
const binding={deviceId:'device',deviceDigest:'c'.repeat(64),sessionId:'session',commandId:H32,taskDigest:H64,runDigest:'d'.repeat(64)};
const base=()=>({id:'job_42',action:'SCROLL',status:'in_progress',targetDeviceId:binding.deviceId,
 targetDeviceDigest:binding.deviceDigest,secureSessionId:binding.sessionId,commandId:binding.commandId,
 taskDigest:binding.taskDigest,runDigest:binding.runDigest,secureMac:'e'.repeat(64),securePayloadDigest:'f'.repeat(64),
 expiresAtMs:now+90000,secureExpiresAt:now+45000,secureInvocationExpiresAt:now+45000});
const executeJob=()=>({...base(),type:'computer_use_action_execute',mcpToolName:'life_android_execute_computer_action',
 secureRequestedEffect:'MUTATION',leaseToken:'lease-execute-1234567890'});
const prepareJob=()=>({...base(),type:'computer_use_action_prepare',mcpToolName:'life_android_computer_prepare',
 secureRequestedEffect:'READ_ONLY'});
const create=()=>createComputerExecutionReceiptRegistry56({now:()=>now,newToken:()=>String(++k).padStart(43,'a')});
const read=(r,ref,j,b=binding)=>r.read({receiptToken:ref,...b},()=>j);

test('exact pending PREPARE and EXECUTE each create one scoped read-only receipt',()=>{
 now=20000;const r=create(),p=prepareJob(),e=executeJob();
 const pr=r.issue({job:p,...binding}),er=r.issue({job:e,...binding});
 assert.equal(pr.receiptKind,'PREPARE');assert.equal(er.receiptKind,'EXECUTE');
 assert.ok(pr.receiptToken.startsWith('cer_'));assert.ok(er.receiptToken.startsWith('cer_'));
 for(const x of [pr,er]){assert.equal(x.newJobCreated,false);assert.equal(x.automaticReplay,false);assert.equal(x.actionReplayed,false);}
 assert.doesNotMatch(JSON.stringify(pr),/lease-execute/);
 for(const change of [{type:'computer_use_inspect'},{mcpToolName:'life_web_click'},{status:'complete'},{secureMac:null},{commandId:'0'.repeat(32)}])
  assert.equal(r.issue({job:{...p,...change},...binding}),null,JSON.stringify(change));
});
test('PREPARE pending read later returns only the ORIGINAL prepared lease/result in exact scope',()=>{
 now=20000;const r=create(),j=prepareJob(),token=r.issue({job:j,...binding});
 assert.equal(read(r,token.receiptToken,j).code,'COMPUTER_PREPARE_STILL_PENDING');
 j.status='complete';j.result={ok:true,code:'READY',reason:'android_action_ready',actionDigest:'1'.repeat(64),screenDigest:'2'.repeat(64),
   executorOp:'ACCESSIBILITY_SCROLL',requiresFreshApproval:false,requiresScreenshotConsent:false,stopAfterAction:true,
   leaseToken:'original-lease-1234567890',leaseExpiresAt:now+60000,secret:'DO_NOT_LEAK'};
 const x=read(r,token.receiptToken,j);
 assert.equal(x.code,'COMPUTER_PREPARE_RESULT_RECEIVED');assert.equal(x.receiptKind,'PREPARE');
 assert.equal(x.originalResult.leaseToken,'original-lease-1234567890');
 assert.equal(x.originalResult.leaseExpiresAt,now+60000);
 assert.doesNotMatch(JSON.stringify(x),/DO_NOT_LEAK/);
 assert.equal(x.newJobCreated,false);assert.equal(x.actionReplayed,false);
});
test('EXECUTE read reports device result without raw payload and never claims task verification',()=>{
 now=20000;const r=create(),j=executeJob(),token=r.issue({job:j,...binding});
 assert.equal(read(r,token.receiptToken,j).executionStatus,'PENDING');
 j.status='complete';j.result={ok:true,code:'scroll_viewport_movement_verified',resultVerified:true,dispatched:true,secret:'DO_NOT_LEAK'};
 const x=read(r,token.receiptToken,j);
 assert.equal(x.code,'COMPUTER_EXECUTION_RESULT_RECEIVED');assert.equal(x.deviceReportedVerified,true);
 assert.equal(x.userTaskVerified,false);assert.equal(x.actionReplayed,false);assert.doesNotMatch(JSON.stringify(x),/DO_NOT_LEAK/);
});
test('readback receipt survives original 45s invocation window but still expires and never extends action lease',()=>{
 now=20000;const r=create(),j=prepareJob(),token=r.issue({job:j,...binding});
 assert.equal(token.receiptExpiresAtMs,320000);
 now=70000; // beyond original secure invocation deadline
 j.status='complete';j.result={ok:true,code:'READY',leaseToken:'expired-or-live-original-lease',leaseExpiresAt:65000};
 const x=read(r,token.receiptToken,j);assert.equal(x.code,'COMPUTER_PREPARE_RESULT_RECEIVED');
 assert.equal(x.originalResult.leaseExpiresAt,65000); // readback does not extend it
 now=320000;assert.equal(read(r,token.receiptToken,j).code,'COMPUTER_EXECUTION_RECEIPT_UNAVAILABLE');
});
test('device/session/command/task/run/HMAC/payload and execute lease mutation fail closed',()=>{
 now=20000;const r=create(),j=executeJob(),token=r.issue({job:j,...binding});
 for(const change of [{deviceId:'other'},{deviceDigest:'1'.repeat(64)},{sessionId:'other'},{commandId:'f'.repeat(32)},{taskDigest:'f'.repeat(64)},{runDigest:'f'.repeat(64)}])
  assert.equal(read(r,token.receiptToken,j,{...binding,...change}).code,'COMPUTER_EXECUTION_RECEIPT_SCOPE_CHANGED');
 for(const change of [{id:'job_2'},{secureMac:'f'.repeat(64)},{securePayloadDigest:'e'.repeat(64)},{leaseToken:'changed-1234567890'},{action:'CLICK'}])
  assert.equal(read(r,token.receiptToken,{...j,...change}).code,'COMPUTER_EXECUTION_ORIGINAL_JOB_CHANGED');
});
test('missing, crashed, expired and unclassified originals remain UNKNOWN with no replay',()=>{
 now=20000;const r=create(),j=executeJob(),token=r.issue({job:j,...binding});
 assert.equal(read(create(),token.receiptToken,j).code,'COMPUTER_EXECUTION_RECEIPT_UNAVAILABLE');
 j.status='expired';assert.equal(read(r,token.receiptToken,j).executionStatus,'UNKNOWN');
 j.status='complete';j.result={ok:'string'};assert.equal(read(r,token.receiptToken,j).code,'COMPUTER_EXECUTION_RESULT_UNCLASSIFIED');
});
