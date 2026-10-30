import test from 'node:test';
import assert from 'node:assert/strict';
import {createComputerInspectReceiptRegistry56} from './computer-inspect-receipts.mjs';
import {applyComputerInspectReceiptPatch,reverseComputerInspectReceiptPatch} from './computer-inspect-receipt-patch.mjs';

const commandId='a'.repeat(32),taskDigest='b'.repeat(64);
const deviceDigest='c'.repeat(64),runDigest='d'.repeat(64);
const scope={deviceId:'phone-one',deviceDigest,sessionId:'signed-session-one',
 commandId,taskDigest,runDigest};
let time=10000,nonce=0;
const make=()=>createComputerInspectReceiptRegistry56({now:()=>time,
 newToken:()=>String(++nonce).padStart(43,'0'),maxEntries:3});
const job=()=>({
 id:'job_12',type:'computer_use_inspect',mcpToolName:'life_android_computer_inspect',
 secureRequestedEffect:'READ_ONLY',status:'queued',
 targetDeviceId:scope.deviceId,targetDeviceDigest:scope.deviceDigest,
 secureSessionId:scope.sessionId,commandId,taskDigest,runDigest,
 expiresAtMs:70000
});
const issue=(store,j)=>store.issue({...scope,job:j});

test('one queued original INSPECT gives an opaque read-only receipt and later recovers identical job',()=>{
 const store=make(),j=job(),token=issue(store,j);
 assert.ok(/^cir_[A-Za-z0-9_-]{43}$/.test(token.receiptToken));
 assert.equal(token.automaticReplay,false);
 let gets=0;
 const find=id=>{gets++;assert.equal(id,'job_12');return j;};
 const pending=store.read({...scope,receiptToken:token.receiptToken},find);
 assert.equal(pending.ok,true);assert.equal(pending.job.status,'queued');
 j.status='complete';j.result={ok:true,code:'inspect_complete',action:'SCROLL'};
 const done=store.read({...scope,receiptToken:token.receiptToken},find);
 assert.equal(done.ok,true);assert.equal(done.job,j);
 assert.equal(done.job.result.ok,true);assert.equal(done.newJobCreated,false);
 assert.equal(done.automaticReplay,false);assert.equal(gets,2);
});

test('read-only current command/device/session/digests and correct token are mandatory',()=>{
 const store=make(),j=job(),v=issue(store,j).receiptToken;
 const q={...scope,receiptToken:v};
 for(const [k,value]of [['deviceId','other'],['deviceDigest','e'.repeat(64)],
 ['sessionId','other'],['commandId','f'.repeat(32)],
 ['taskDigest','f'.repeat(64)],['runDigest','f'.repeat(64)]]){
  const r=store.read({...q,[k]:value},()=>{throw Error('must never disclose')});
  assert.equal(r.ok,false,k);assert.equal(r.newJobCreated,false);
 }
 assert.equal(store.read({...q,receiptToken:'cir_'+'x'.repeat(43)},()=>j).ok,false);
});

test('revoked original job and replaced or expired signed job cannot be recovered',()=>{
 const store=make(),j=job(),ref=issue(store,j).receiptToken,q={...scope,receiptToken:ref};
 assert.equal(store.read(q,()=>undefined).ok,false);
 assert.equal(store.read(q,()=>({...j,commandId:'e'.repeat(32)})).ok,false);
 assert.equal(store.read(q,()=>({...j,type:'computer_use_action_execute'})).ok,false);
 time=70000;
 assert.equal(store.read(q,()=>j).ok,false);
 time=10000;
});

test('Computer Use PREPARE/TYPE/SCROLL/approval and mutation jobs never get read receipts',()=>{
 const store=make(),j=job();
 for(const changed of [
 {type:'computer_use_action_prepare'},{type:'computer_use_action_execute'},
 {type:'computer_use_action_approval_request'},
 {type:'split_screen_session_start'},{secureRequestedEffect:'REVERSIBLE_WRITE'},
 {mcpToolName:'life_android_execute_computer_action'}, {targetDeviceId:'other'},
 {taskDigest:'f'.repeat(64)},{expiresAtMs:time}
 ])assert.equal(issue(store,{...j,...changed}),null,JSON.stringify(changed));
});

test('no job is dispatched from readback; capacity is bounded',()=>{
 const store=make(),j=job();const refs=[];
 for(let i=0;i<3;i++){const x=issue(store,{...j,id:'job_'+(i+1)});assert.ok(x);refs.push(x.receiptToken)}
 assert.equal(issue(store,{...j,id:'job_4'}),null);
 let count=0;
 const v=store.read({...scope,receiptToken:refs[0]},()=>{count++;return {...j,id:'job_1'};});
 assert.equal(v.ok,true);assert.equal(count,1);
 assert.equal(v.newJobCreated,false);
});

test('exact patch is reversible and rejects drift/no original signed operator',()=>{
 const source=[
  'const pendingApprovalReceipts56=createPendingApprovalReceiptRegistry56();',
  'function pendingApprovalReceiptStatus56(args){}',
  'function secureCall56(){}',
  'function jhRequireCommand56(deviceId){}',
  'durableNativeHooks56?.beforeDispatch(',
  'const jhSplitReadReceipts56=1;',
  '    return textResult({...safeJobView56(j),...(receipt||{})});',
  '  const result=pendingApprovalReceipts56.read({receiptToken:args.receipt_token,deviceId,',
  'description:"READ ONLY: for a queued approval REQUEST with receiptToken. Never request, resend or grant approval; never execute Android actions.",'
 ].join('\n');
 const patched=applyComputerInspectReceiptPatch(source);
 assert.equal(reverseComputerInspectReceiptPatch(patched),source);
 assert.match(patched,/computerInspectReceipt56\.issue/);
 assert.match(patched,/computerInspectReceipt56\.read/);
 assert.match(patched,/jhRequireCommand56\(deviceId\)/);
 assert.match(patched,/life_android_computer_inspect/);
 assert.throws(()=>applyComputerInspectReceiptPatch(patched));
 assert.throws(()=>applyComputerInspectReceiptPatch('wrong source'));
});
