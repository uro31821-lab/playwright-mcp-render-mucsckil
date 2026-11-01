import test from 'node:test';
import assert from 'node:assert/strict';
import {createSplitFollowupReceiptRegistry56} from './split-followup-receipts.mjs';

const H32='a'.repeat(32),H64='b'.repeat(64);
const base={deviceId:'phone',deviceDigest:'d'.repeat(64),sessionId:'session-1',commandId:H32,taskDigest:H64};
let now=10000,serial=0;
const registry=()=>createSplitFollowupReceiptRegistry56({clock:()=>now,token:()=>String(++serial).padStart(32,'0'),maxEntries:8});
const job=()=>({id:'job_42',type:'split_screen_session_followup',
 mcpToolName:'life_android_execute_computer_action',secureRequestedEffect:'REVERSIBLE_WRITE',
 status:'queued',targetDeviceId:base.deviceId,targetDeviceDigest:base.deviceDigest,
 secureSessionId:base.sessionId,commandId:base.commandId,taskDigest:base.taskDigest,
 requestId:'c'.repeat(32),contextId:'ssc_'+'d'.repeat(32),
 targetItemRef:'item_'+'e'.repeat(16),action:'CLICK',expiresAtMs:now+95000});
const issue=(reg,j)=>reg.issue({job:j,...base});
const read=(reg,receiptRef,j,verify=()=>true,scope=base)=>reg.read({receiptRef,...scope},()=>j,verify);

test('pending original CLICK later recovers verified result without redispatch',()=>{
 const reg=registry(),j=job(),receipt=issue(reg,j);assert.ok(receipt?.receiptRef.startsWith('sfr_'));
 assert.equal(receipt.newJobCreated,false);
 const pending=read(reg,receipt.receiptRef,j);
 assert.equal(pending.code,'SPLIT_FOLLOWUP_STILL_PENDING');
 j.status='complete';j.result={ok:true,action:'CLICK',code:'clicked',resultVerified:true};
 const done=read(reg,receipt.receiptRef,j);
 assert.equal(done.code,'SPLIT_FOLLOWUP_CLICK_VERIFIED');
 assert.equal(done.executionStatus,'CONFIRMED');
 assert.equal(done.automaticReplay,false);assert.equal(done.newJobCreated,false);
 assert.equal(done.receiptRecovered,true);
});

test('wrong device, digest, session or command cannot access original job',()=>{
 const reg=registry(),j=job(),receipt=issue(reg,j);
 for(const changed of [{deviceId:'other'},{deviceDigest:'f'.repeat(64)},
   {sessionId:'other'},{commandId:'f'.repeat(32)}]){
  const r=reg.read({receiptRef:receipt.receiptRef,...base,...changed},
   ()=>{throw Error('should not query job')},()=>true);
  assert.equal(r.code,'SPLIT_FOLLOWUP_RECEIPT_SCOPE_CHANGED');
 }
 assert.equal(read(reg,'sfr_'+'z'.repeat(32),j).code,'SPLIT_FOLLOWUP_RECEIPT_UNAVAILABLE');
});

test('job mutation, request ID, target, action, job type or HMAC binding changed denies',()=>{
 const reg=registry(),j=job(),receipt=issue(reg,j);
 for(const patch of [{requestId:'f'.repeat(32)},{targetItemRef:'item_'+'f'.repeat(16)},
   {contextId:'ssc_'+'f'.repeat(32)},{taskDigest:'f'.repeat(64)},
   {action:'BACK'},{mcpToolName:'life_web_click'},
   {secureRequestedEffect:'READ_ONLY'}, {id:'job_43'},
   {type:'split_screen_session_status'}]){
  const result=read(reg,receipt.receiptRef,{...j,...patch});
  assert.equal(result.code,'SPLIT_FOLLOWUP_ORIGINAL_JOB_CHANGED',JSON.stringify(patch));
 }
});

test('screen proof and signed resultVerified are both necessary for success',()=>{
 const reg=registry(),j=job(),receipt=issue(reg,j);
 j.status='complete';j.result={ok:true,resultVerified:false};
 assert.equal(read(reg,receipt.receiptRef,j).code,'SPLIT_FOLLOWUP_CLICK_UNCONFIRMED');
 j.result.resultVerified=true;
 assert.equal(read(reg,receipt.receiptRef,j,()=>false).code,'SPLIT_FOLLOWUP_CLICK_UNCONFIRMED');
 assert.equal(read(reg,receipt.receiptRef,j,()=>{throw Error('bad window')}).ok,false);
 j.result.action='SCROLL';
 assert.equal(read(reg,receipt.receiptRef,j).code,'SPLIT_FOLLOWUP_ACTION_PROOF_MISMATCH');
});

test('authenticated target obscured before dispatch is reported without replay',()=>{
 const reg=registry(),j=job(),receipt=issue(reg,j);
 j.status='complete';j.result={ok:false,code:'execution_failed',reason:'target_obscured',
  clickOcclusionDiagnostic:{actionDispatched:false}};
 const a=read(reg,receipt.receiptRef,j);
 assert.equal(a.code,'SPLIT_FOLLOWUP_CLICK_BLOCKED');
 assert.equal(a.executionStatus,'NOT_DISPATCHED');
 assert.equal(a.actionDispatched,false);
 assert.equal(a.automaticReplay,false);
});

test('generic failure, expired, and missing signed job remain unknown',()=>{
 const reg=registry(),j=job(),receipt=issue(reg,j);
 j.status='complete';j.result={ok:false,code:'failure',reason:'timeout'};
 const v=read(reg,receipt.receiptRef,j);
 assert.equal(v.executionStatus,'UNKNOWN');
 j.status='expired';
 assert.equal(read(reg,receipt.receiptRef,j).code,'SPLIT_FOLLOWUP_TERMINAL_UNKNOWN');
 assert.equal(read(reg,receipt.receiptRef,undefined).code,'SPLIT_FOLLOWUP_ORIGINAL_JOB_CHANGED');
});

test('bad payload, non CLICK or read-only route never gets FOLLOWUP receipt',()=>{
 const reg=registry(),j=job();
 for(const patch of [{type:'split_screen_session_status'},
  {mcpToolName:'life_android_capture_work_window'},
  {secureRequestedEffect:'READ_ONLY'},{action:'BACK'},
  {targetItemRef:'bad'},{requestId:'bad'},
  {contextId:'bad'}, {commandId:'f'.repeat(32)},
  {status:'complete'}, {expiresAtMs:now+2000}]){
  assert.equal(issue(reg,{...j,...patch}),null,JSON.stringify(patch));
 }
});

test('receipt expiration and capacity limit fail closed',()=>{
 now=10000; serial=0;
 const reg=createSplitFollowupReceiptRegistry56({clock:()=>now,token:()=>String(++serial).padStart(32,'0'),maxEntries:1});
 const j=job(),receipt=issue(reg,j);
 assert.equal(issue(reg,{...j,id:'job_43'}),null);
 now=receipt.expiresAt;
 assert.equal(read(reg,receipt.receiptRef,j).code,'SPLIT_FOLLOWUP_RECEIPT_UNAVAILABLE');
});

test('stored proof is scoped to original job only; raw result not copied to receipt',()=>{
 const reg=registry(),j=job(),receipt=issue(reg,j);
 assert.equal(JSON.stringify(receipt).includes(j.contextId),false);
 j.status='complete';j.result={ok:true,action:'CLICK',resultVerified:true,rawScreen:'never export'};
 const returned=read(reg,receipt.receiptRef,j);
 assert.equal(JSON.stringify(returned).includes('never export'),false);
 assert.equal(JSON.stringify(returned).includes(j.contextId),false);
});

