import test from 'node:test';
import assert from 'node:assert/strict';
import {createSnapshotDigestReadbackRegistry56} from './snapshot-digest-readback.mjs';
const scope={deviceId:'phone-1',deviceDigest:'b'.repeat(64),sessionId:'session-1',commandId:'a'.repeat(32)};
let now=10000;
const job=()=>({id:'job_17',type:'agent_snapshot',status:'queued',targetDeviceId:scope.deviceId,
 secureSessionId:scope.sessionId,secureMac:'c'.repeat(64),securePayloadDigest:'d'.repeat(64),expiresAtMs:90000});
test('original snapshot payload needs no added protocol fields',()=>{
 const j=job();
 assert.equal(Object.hasOwn(j,'mcpToolName'),false);
 assert.equal(Object.hasOwn(j,'commandId'),false);
 assert.equal(Object.hasOwn(j,'targetDeviceDigest'),false);
 const r=createSnapshotDigestReadbackRegistry56({now:()=>now});
 const issued=r.issue({job:j,...scope});assert.ok(issued?.jobDigest);
 const read=r.read({jobDigest:issued.jobDigest,...scope},()=>j);
 assert.equal(read.ok,true);assert.equal(read.job,j);assert.equal(read.newJobCreated,false);assert.equal(read.automaticReplay,false);
});
test('wrong device/session/command is rejected before job reuse',()=>{
 const j=job(),r=createSnapshotDigestReadbackRegistry56({now:()=>now});
 const issued=r.issue({job:j,...scope});
 for(const change of [{deviceId:'other'},{sessionId:'other'},{commandId:'f'.repeat(32)},{deviceDigest:'e'.repeat(64)}])
  assert.equal(r.read({jobDigest:issued.jobDigest,...scope,...change},()=>j).code,'SNAPSHOT_READBACK_SCOPE_CHANGED');
});
test('mutated original signed job fails closed',()=>{
 const j=job(),r=createSnapshotDigestReadbackRegistry56({now:()=>now});
 const issued=r.issue({job:j,...scope});
 for(const change of [{type:'agent_step'},{secureMac:'e'.repeat(64)},{securePayloadDigest:'f'.repeat(64)}])
  assert.equal(r.read({jobDigest:issued.jobDigest,...scope},()=>({...j,...change})).ok,false);
});
test('receipt expires and cannot be rebound to another command',()=>{
 const j=job(),r=createSnapshotDigestReadbackRegistry56({now:()=>now});
 const issued=r.issue({job:j,...scope});assert.ok(issued);
 assert.equal(r.issue({job:j,...scope,commandId:'f'.repeat(32)}),null);
 now=issued.expiresAtMs;
 assert.equal(r.read({jobDigest:issued.jobDigest,...scope},()=>j).code,'SNAPSHOT_READBACK_UNAVAILABLE');
 now=10000;
});
