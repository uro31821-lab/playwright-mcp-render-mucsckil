import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createComputerInspectReceiptRegistry56} from './computer-inspect-receipts.mjs';
import {applyComputerInspectReceiptPatch,reverseComputerInspectReceiptPatch} from './computer-inspect-receipt-patch.mjs';

const baseline=()=>[
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

function readbackFixture(observer){
 let now=10000,readCount=0,issueCount=0,lastScoped;
 const binding={deviceId:'phone-one',deviceDigest:'c'.repeat(64),sessionId:'signed-session-one',
  commandId:'a'.repeat(32),taskDigest:'b'.repeat(64),runDigest:'d'.repeat(64)};
 const job={id:'job_12',type:'computer_use_inspect',mcpToolName:'life_android_computer_inspect',
  secureRequestedEffect:'READ_ONLY',status:'queued',targetDeviceId:binding.deviceId,
  targetDeviceDigest:binding.deviceDigest,secureSessionId:binding.sessionId,
  commandId:binding.commandId,taskDigest:binding.taskDigest,runDigest:binding.runDigest,
  expiresAtMs:70000};
 const registry=createComputerInspectReceiptRegistry56({now:()=>now,newToken:()=>'0'.repeat(43)});
 const issued=registry.issue({...binding,job});assert.ok(issued);
 job.status='complete';job.result={ok:true,code:'inspect_complete'};
 const args={receipt_token:issued.receiptToken,task_digest:binding.taskDigest,run_digest:binding.runDigest};
 const lookups=[],responses=[],viewed=[];
 const ports={deviceId:binding.deviceId,meta:{deviceDigest:binding.deviceDigest},
  active:{sessionId:binding.sessionId},commandId:binding.commandId,
  computerInspectReceipt56:{
   read(...values){readCount++;lastScoped=registry.read(...values);return lastScoped;},
   issue(){issueCount++;throw Error('readback must not issue a receipt');}
  },
  jobs:{get(id){lookups.push(id);return id===job.id?job:undefined;}},
  textResult(body){const result={content:[{type:'text',text:JSON.stringify(body)}]};responses.push(result);return result;},
  safeJobView56(value){viewed.push(value);return {
   idDigest:createHash('sha256').update(value.id).digest('hex'),
   type:value.type,status:value.status,result:value.result??null,
   error:value.error??null,completedAt:value.completedAt??null,
   targetDeviceDigest:value.targetDeviceDigest??null
  };}};
 if(observer!==undefined)ports.jhLearningObserveComputerInspectReceipt56=observer;
 const source=baseline(),patched=applyComputerInspectReceiptPatch(source);
 assert.equal(reverseComputerInspectReceiptPatch(patched),source);
 const branch=patched.slice(patched.indexOf('  if(/^cir_'),
  patched.indexOf('  const result=pendingApprovalReceipts56.read('));
 const read=new Function(...Object.keys(ports),'return function(args){\n'+branch+'\nthrow Error("unexpected fallback");};')
  (...Object.values(ports));
 return {job,args,binding,lookups,responses,viewed,branch,
  expire:()=>{now=issued.receiptExpiresAtMs;},read:()=>read(args),
  counts:()=>({readCount,issueCount,lastScoped})};
}

test('INSPECT readback observes the exact original job and scoped receipt without exposing extra state',()=>{
 const observed=[],f=readbackFixture((...args)=>{observed.push(args);return {replacement:'ignored'};});
 const response=f.read(),body=JSON.parse(response.content[0].text);
 assert.equal(observed.length,1);
 assert.equal(observed[0][0],f.job);assert.equal(observed[0][1],f.counts().lastScoped);
 assert.equal(observed[0][1].job,f.job);
 assert.deepEqual(observed[0][2],f.binding);assert.ok(Object.isFrozen(observed[0][2]));
 assert.equal(response,f.responses[0]);assert.equal(f.responses.length,1);
 assert.deepEqual(f.lookups,['job_12']);assert.deepEqual(f.viewed,[f.job]);
 assert.equal(f.counts().readCount,1);assert.equal(f.counts().issueCount,0);
 assert.equal(body.lookupOnly,true);assert.equal(body.readOnly,true);
 assert.equal(body.newJobCreated,false);assert.equal(body.automaticReplay,false);
 assert.equal(body.status,'complete');assert.deepEqual(body.result,{ok:true,code:'inspect_complete'});
 assert.equal('replacement' in body,false);assert.equal('verifiedOutcome' in body,false);
 assert.ok(!/\bmk\(|waitJob\(|\.issue\(|beforeDispatch\(/.test(f.branch));
});

test('missing, throwing, and rejecting INSPECT observers cannot change or replay the response',async()=>{
 for(const observer of [undefined,()=>{throw Error('observer unavailable');},
  ()=>Promise.reject(Error('observer unavailable')),
  job=>{job.status='error';throw Error('observer changed local input before failing');}]){
  const f=readbackFixture(observer),response=f.read();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(response,f.responses[0]);assert.equal(f.responses.length,1);
  assert.equal(JSON.parse(response.content[0].text).status,'complete');
  assert.deepEqual(f.lookups,['job_12']);
  assert.equal(f.counts().readCount,1);assert.equal(f.counts().issueCount,0);
 }
});

test('lookup-only pending or device-failure results are preserved for the observer to classify',()=>{
 for(const change of [job=>{job.status='in_progress';delete job.result;},
  job=>{job.result={ok:false,code:'inspect_failed'};}]){
  const observed=[],f=readbackFixture((...args)=>observed.push(args));change(f.job);
  const response=f.read(),body=JSON.parse(response.content[0].text);
  assert.equal(observed.length,1);assert.equal(observed[0][0],f.job);
  assert.equal(observed[0][1].lookupOnly,true);
  assert.equal(body.status,f.job.status);assert.deepEqual(body.result,f.job.result??null);
  assert.equal('verifiedOutcome' in body,false);
  assert.equal(f.counts().readCount,1);assert.equal(f.counts().issueCount,0);
 }
});

test('scope rejection and receipt expiration return the original denial without observation',()=>{
 for(const [change,code] of [
  [f=>{f.args.task_digest='e'.repeat(64);},'COMPUTER_INSPECT_RECEIPT_SCOPE_CHANGED'],
  [f=>{f.args.run_digest='f'.repeat(64);},'COMPUTER_INSPECT_RECEIPT_SCOPE_CHANGED'],
  [f=>f.expire(),'COMPUTER_INSPECT_RECEIPT_SCOPE_CHANGED']
 ]){
  const observed=[],f=readbackFixture((...args)=>observed.push(args));change(f);
  const response=f.read(),body=JSON.parse(response.content[0].text);
  assert.equal(body.code,code);assert.equal(body.ok,false);
  assert.deepEqual(body,f.counts().lastScoped);assert.equal(response,f.responses[0]);
  assert.equal(observed.length,0);assert.deepEqual(f.lookups,[]);assert.deepEqual(f.viewed,[]);
  assert.equal(f.counts().readCount,1);assert.equal(f.counts().issueCount,0);
 }
});
