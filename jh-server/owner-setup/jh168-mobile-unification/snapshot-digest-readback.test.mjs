import test from 'node:test';
import assert from 'node:assert/strict';
import {createSnapshotDigestReadbackRegistry56} from './snapshot-digest-readback.mjs';
const scope={deviceId:'phone-1',deviceDigest:'b'.repeat(64),sessionId:'session-1',commandId:'a'.repeat(32)};
let now=10000;
const job=()=>({id:'job_17',type:'agent_snapshot',status:'queued',targetDeviceId:scope.deviceId,
 secureSessionId:scope.sessionId,secureMac:'c'.repeat(64),securePayloadDigest:'d'.repeat(64),
 createdAtMs:10000,expiresAtMs:90000,secureExpiresAt:55000});
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
test('completed snapshot remains readable after server intentionally redacts secure completion fields',()=>{
 const j=job(),r=createSnapshotDigestReadbackRegistry56({now:()=>now});
 const issued=r.issue({job:j,...scope});assert.ok(issued);
 j.status='complete';j.result={ok:true,code:'snapshot_done'};j.completedAt=new Date(now+1000).toISOString();
 delete j.secureMac;delete j.securePayloadDigest;
 const read=r.read({jobDigest:issued.jobDigest,...scope},()=>j);
 assert.equal(read.ok,true);assert.equal(read.job,j);assert.equal(read.newJobCreated,false);
});
test('completion redaction cannot hide a changed original job',()=>{
 const j=job(),r=createSnapshotDigestReadbackRegistry56({now:()=>now});
 const issued=r.issue({job:j,...scope});assert.ok(issued);
 j.status='complete';j.completedAt=new Date(now+1000).toISOString();
 delete j.secureMac;delete j.securePayloadDigest;
 for(const change of [{createdAtMs:j.createdAtMs+1},{expiresAtMs:j.expiresAtMs+1},
   {secureExpiresAt:j.secureExpiresAt+1},{type:'agent_step'},{secureSessionId:'other'}])
  assert.equal(r.read({jobDigest:issued.jobDigest,...scope},()=>({...j,...change})).ok,false);
});
test('missing signature is accepted only for a valid completed redaction',()=>{
 const j=job(),r=createSnapshotDigestReadbackRegistry56({now:()=>now});
 const issued=r.issue({job:j,...scope});assert.ok(issued);
 delete j.secureMac;delete j.securePayloadDigest;
 assert.equal(r.read({jobDigest:issued.jobDigest,...scope},()=>j).ok,false);
 j.status='complete';
 assert.equal(r.read({jobDigest:issued.jobDigest,...scope},()=>j).ok,false);
 j.completedAt=new Date(now+1000).toISOString();
 assert.equal(r.read({jobDigest:issued.jobDigest,...scope},()=>j).ok,true);
});
test('receipt expires and cannot be rebound to another command',()=>{
 const j=job(),r=createSnapshotDigestReadbackRegistry56({now:()=>now});
 const issued=r.issue({job:j,...scope});assert.ok(issued);
 assert.equal(r.issue({job:j,...scope,commandId:'f'.repeat(32)}),null);
 now=issued.expiresAtMs;
 assert.equal(r.read({jobDigest:issued.jobDigest,...scope},()=>j).code,'SNAPSHOT_READBACK_UNAVAILABLE');
 now=10000;
});
