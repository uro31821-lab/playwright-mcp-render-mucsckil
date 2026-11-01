import test from 'node:test';
import assert from 'node:assert/strict';
import {applyJH168SplitFollowupReceiptPatch,reverseJH168SplitFollowupReceiptPatch} from './split-followup-receipt-patch.mjs';
import {createSplitFollowupReceiptRegistry56} from './split-followup-receipts.mjs';

const baseline=()=>[
 'const recentWeb=new Map();',
 'const jhSplitReadReceipts56=createSplitReadReceiptRegistry56();',
 'function jhRequireCommand56(device){return device}',
 'const durableNativeHooks56={}; // durableNativeHooks56?.beforeDispatch(',
 'function jhInspectSplitEvidence155(screen){return {ok:!!screen}}',
 "registerOAuthTool('life_android_split_screen_assistant'",
 '  function jhSplitReadStatus56(receiptRef){',
 '    const device=chooseDevice(),auth=device&&active56(device);',
 '  }',
 '  async function jhSplitScreenJob56(type,payload,effect,secureToolName,waitMs=26000){',
 '    const completed=await waitJob(j,Math.min(Number(waitMs)||26000,43000));',
 "      return {ok:false,code:completed?.error||'split_screen_device_result_unconfirmed',",
 '        ...(receipt?{...receipt,jobStatus:completed.status}:{}),',
 '        automaticReplay:false};',
 "    if(mode==='READBACK_PENDING'||",
 "       (mode==='STATUS'&&typeof args.context_id==='string'&&",
 "        /^srr_[A-Za-z0-9_-]{32}$/.test(args.context_id))){"
].join('\n');

test('FOLLOWUP readback patch applies/reverses on exact generated source',()=>{
 const base=baseline(),p=applyJH168SplitFollowupReceiptPatch(base);
 assert.equal(reverseJH168SplitFollowupReceiptPatch(p),base);
 assert.match(p,/split_followup_receipt_arguments_invalid/);
 assert.match(p,/READBACK_PENDING/);
 assert.match(p,/createSplitFollowupReceiptRegistry56/);
 assert.match(p,/type==='split_screen_session_followup'/);
 assert.match(p,/effect==='REVERSIBLE_WRITE'/);
 assert.match(p,/payload\?\.action==='CLICK'/);
 assert.match(p,/jhSplitFollowupReceipts56\.read\(/);
 assert.match(p,/id=>\{learningJob=jobs\.get\(id\);return learningJob;\}/);
 assert.match(p,/jhRequireCommand56\(device\)/);
 assert.match(p,/jhInspectSplitEvidence155\(screen\)\.ok===true/);
 assert.match(p,/automaticReplay:false/);
 assert.throws(()=>applyJH168SplitFollowupReceiptPatch(p),/GUARDS|ANCHOR/);
});

test('followup receipt-only lookup does not create a job or dispatch action',()=>{
 const p=applyJH168SplitFollowupReceiptPatch(baseline());
 const start=p.indexOf("if(mode==='READBACK_PENDING'&&typeof args.receipt_ref");
 const end=p.indexOf("    if(mode==='READBACK_PENDING'||",start);
 const route=p.slice(start,end);
 assert.ok(start>0&&end>start);
 assert.match(route,/jhSplitFollowupStatus56\(args\.receipt_ref\)/);
 assert.ok(!/\bmk\(|waitJob\(|execute_computer_action\(|beforeDispatch\(/.test(route));
 assert.match(route,/args\.context_id\|\|args\.request_id\|\|args\.command/);
 assert.match(route,/args\.target_item_ref/);
});

test('new code preserves existing read-only receipt and fails closed on missing anchors',()=>{
 const s=baseline(),p=applyJH168SplitFollowupReceiptPatch(s);
 assert.match(p,/jhSplitReadStatus56/);
 assert.match(p,/jhSplitReadReceipts56/);
 assert.match(p, /\.\.\.\(receipt\?\{\.\.\.receipt,jobStatus:completed\.status\}:\{\}\)/);
 for(const mutation of [
  s.replace('jhSplitReadReceipts56','other'),
  s.replace('durableNativeHooks56?.beforeDispatch(','somethingElse('),
  s.replace('const completed=await waitJob','const missing=await waitJob'),
  s.replace('jhInspectSplitEvidence155','noProof')
 ])assert.throws(()=>applyJH168SplitFollowupReceiptPatch(mutation));
});

function readbackFixture(observer){
 let now=10000,readCount=0,issueCount=0,lastReceipt;
 const binding={deviceId:'phone',deviceDigest:'d'.repeat(64),sessionId:'session-1',
  commandId:'a'.repeat(32),taskDigest:'b'.repeat(64),requestId:'c'.repeat(32),
  contextId:'ssc_'+'d'.repeat(32),targetItemRef:'item_'+'e'.repeat(16)};
 const job={id:'job_42',type:'split_screen_session_followup',
  mcpToolName:'life_android_execute_computer_action',secureRequestedEffect:'REVERSIBLE_WRITE',
  action:'CLICK',status:'queued',targetDeviceId:binding.deviceId,
  targetDeviceDigest:binding.deviceDigest,secureSessionId:binding.sessionId,
  commandId:binding.commandId,taskDigest:binding.taskDigest,requestId:binding.requestId,
  contextId:binding.contextId,targetItemRef:binding.targetItemRef,expiresAtMs:now+90000};
 const registry=createSplitFollowupReceiptRegistry56({clock:()=>now,token:()=>'0'.repeat(32)});
 const issued=registry.issue({job,...binding});
 assert.ok(issued);
 job.status='complete';job.result={ok:true,action:'CLICK',resultVerified:true};
 const lookups=[];
 const ports={chooseDevice:()=>binding.deviceId,
  active56:()=>({sessionId:binding.sessionId}),
  devices:new Map([[binding.deviceId,{secureBridgeVersion:56,deviceDigest:binding.deviceDigest}]]),
  jhRequireCommand56:()=>binding.commandId,
  jhSplitFollowupReceipts56:{
   read(...args){readCount++;lastReceipt=registry.read(...args);return lastReceipt;},
   issue(){issueCount++;throw Error('readback must not issue a new receipt');}
  },
  jobs:{get(id){lookups.push(id);return id===job.id?job:undefined;}},
  jhInspectSplitEvidence155:()=>({ok:true})};
 if(observer!==undefined)ports.jhLearningObserveFollowupReceipt56=observer;
 const patched=applyJH168SplitFollowupReceiptPatch(baseline());
 const helper=patched.slice(patched.indexOf('  function jhSplitFollowupStatus56('),
  patched.indexOf('  function jhSplitReadStatus56('));
 const read=new Function(...Object.keys(ports),helper+'\nreturn jhSplitFollowupStatus56;')
  (...Object.values(ports));
 return {job,binding,lookups,expire:()=>{now=issued.expiresAt;},
  read:()=>read(issued.receiptRef),
  counts:()=>({readCount,issueCount,lastReceipt})};
}

test('readback observes the exact original job and receipt with the validated scope',()=>{
 const observed=[],f=readbackFixture((...args)=>observed.push(args));
 const receipt=f.read();
 assert.equal(receipt.code,'SPLIT_FOLLOWUP_CLICK_VERIFIED');
 assert.equal(receipt.confirmationScope,'SIGNED_CLICK_AND_RIGHT_PANE_AT_RECEIPT');
 assert.equal(observed.length,1);
 assert.equal(observed[0][0],f.job);
 assert.equal(observed[0][1],receipt);
 assert.deepEqual(observed[0][2],f.binding);
 assert.ok(Object.isFrozen(observed[0][2]));
 assert.equal(receipt,f.counts().lastReceipt);
 assert.deepEqual(f.lookups,['job_42']);
 assert.equal(f.counts().readCount,1);assert.equal(f.counts().issueCount,0);
 assert.equal(receipt.newJobCreated,false);assert.equal(receipt.automaticReplay,false);
});

test('missing, throwing, and rejecting observers preserve the original readback once',async()=>{
 for(const observer of [undefined,()=>{throw Error('observer unavailable');},
  ()=>Promise.reject(Error('observer unavailable'))]){
  const f=readbackFixture(observer),receipt=f.read();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(receipt,f.counts().lastReceipt);
  assert.equal(receipt.code,'SPLIT_FOLLOWUP_CLICK_VERIFIED');
  assert.deepEqual(f.lookups,['job_42']);
  assert.equal(f.counts().readCount,1);assert.equal(f.counts().issueCount,0);
 }
});

test('observation preserves pending, rejected, and expired readbacks without another lookup',()=>{
 for(const [change,code,queried] of [
  [f=>{f.job.status='in_progress';},'SPLIT_FOLLOWUP_STILL_PENDING',true],
  [f=>{f.job.result.resultVerified=false;},'SPLIT_FOLLOWUP_CLICK_UNCONFIRMED',true],
  [f=>{f.job.result={ok:false,actionDispatched:false};},'SPLIT_FOLLOWUP_CLICK_BLOCKED',true],
  [f=>{f.job.requestId='f'.repeat(32);},'SPLIT_FOLLOWUP_ORIGINAL_JOB_CHANGED',true],
  [f=>{f.binding.commandId='f'.repeat(32);},'SPLIT_FOLLOWUP_RECEIPT_SCOPE_CHANGED',false],
  [f=>f.expire(),'SPLIT_FOLLOWUP_RECEIPT_UNAVAILABLE',false]
 ]){
  const observed=[],f=readbackFixture((...args)=>observed.push(args));change(f);
  const receipt=f.read();
  assert.equal(receipt.code,code);
  assert.equal(receipt,f.counts().lastReceipt);
  assert.equal(receipt.ok,false);
  assert.equal(observed.length,1);assert.equal(observed[0][1],receipt);
  assert.equal(observed[0][0],queried?f.job:null);
  assert.deepEqual(f.lookups,queried?['job_42']:[]);
  assert.equal(f.counts().readCount,1);assert.equal(f.counts().issueCount,0);
  assert.equal(receipt.newJobCreated,false);assert.equal(receipt.automaticReplay,false);
 }
});

