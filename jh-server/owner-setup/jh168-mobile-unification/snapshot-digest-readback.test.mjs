import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {resolveSnapshotDigestReadback56} from './snapshot-digest-readback.mjs';
const sha=x=>createHash('sha256').update(String(x)).digest('hex');
const scope={deviceId:'phone-1',deviceDigest:'b'.repeat(64),sessionId:'session-1',commandId:'a'.repeat(32)};
const job=()=>({id:'job_17',type:'agent_snapshot',status:'queued',
 mcpToolName:'life_android_snapshot',secureRequestedEffect:'READ_ONLY',
 targetDeviceId:scope.deviceId,targetDeviceDigest:scope.deviceDigest,
 secureSessionId:scope.sessionId,commandId:scope.commandId,
 secureMac:'c'.repeat(64),securePayloadDigest:'d'.repeat(64)});
test('same signed snapshot digest is read only',()=>{
 const j=job(),x=resolveSnapshotDigestReadback56({jobDigest:sha(j.id),...scope},[j]);
 assert.equal(x.ok,true);assert.equal(x.job,j);assert.equal(x.newJobCreated,false);assert.equal(x.automaticReplay,false);
});
test('scope changes fail closed',()=>{
 const j=job(),q={jobDigest:sha(j.id),...scope};
 for(const change of [{deviceId:'other'},{sessionId:'other'},{commandId:'f'.repeat(32)},{jobDigest:'f'.repeat(64)}])
  assert.equal(resolveSnapshotDigestReadback56({...q,...change},[j]).ok,false);
});
test('wrong job authority fails closed',()=>{
 const j=job(),q={jobDigest:sha(j.id),...scope};
 for(const change of [{type:'agent_step'},{mcpToolName:'life_android_step'},{secureRequestedEffect:'MUTATION'},{secureMac:null}])
  assert.equal(resolveSnapshotDigestReadback56(q,[{...j,...change}]).ok,false);
});
