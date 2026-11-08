import test from 'node:test';
import assert from 'node:assert/strict';
import {context,CANCEL_PURPOSE,STATUS_PURPOSE} from './integration-fixture.mjs';
import {PERMANENT_TRUST_EXPIRES_AT,MAX_SESSION_MS} from '../trusted-server/trusted-device-registry.mjs';

const days=n=>n*24*60*60*1000;

test('permanent trust survives time while reconnect sessions remain short',async t=>{
  const f=context(t);
  const begin=f.service.begin({publicKeySpki:f.spki,deviceDigest:f.deviceDigest,durationDays:0});
  const registered=await f.service.finish(f.make(begin));
  assert.equal(registered.code,'TRUST_REGISTERED');
  assert.equal(registered.receipt.expiresAt,PERMANENT_TRUST_EXPIRES_AT);
  assert.equal(MAX_SESSION_MS,30*60*1000);
  f.advance(days(400));
  const observed=await f.service.status(f.proof(begin,STATUS_PURPOSE));
  assert.equal(observed.code,'TRUST_REGISTERED');
  assert.equal(observed.receipt.expiresAt,PERMANENT_TRUST_EXPIRES_AT);
});

test('cancellation status resumes cleanup and quarantines historical uncertain outcomes',async t=>{
  const f=context(t);
  let cleanupCalls=0;
  const authority={
    async revokeForTrust(){cleanupCalls++;if(cleanupCalls===1)throw Error('SYNTHETIC_LOST_CLEANUP_REPLY');},
    async inspectTrust(trustId){return {trustId,newSessionsBlocked:true,activeSessions:0,pendingJobs:0,dispatchedJobsUncertain:75};}
  };
  f.service.installSessionAuthority(authority);
  const begin=f.service.begin({publicKeySpki:f.spki,deviceDigest:f.deviceDigest,durationDays:0});
  await f.service.finish(f.make(begin));
  f.advance(days(400));
  const first=await f.service.cancel(f.proof(begin,CANCEL_PURPOSE));
  assert.equal(first.code,'CANCELLATION_PENDING');
  assert.equal(first.complete,false);
  const resumed=await f.service.status(f.proof(begin,STATUS_PURPOSE));
  assert.equal(resumed.code,'ENROLLMENT_CANCELED');
  assert.equal(resumed.complete,true);
  assert.equal(resumed.serverRecordRevoked,true);
  assert.equal(resumed.activeSessionsRevoked,true);
  assert.equal(resumed.pendingJobsRevoked,true);
  assert.equal(resumed.dispatchedJobsUncertain,75);
  assert.equal(resumed.dispatchedJobsQuarantined,true);
  assert.equal(cleanupCalls,2);
});


test('expired finite trust remains signed-readable and explicitly revocable without renewal',async t=>{
  const f=context(t);
  const authority={
    async revokeForTrust(){},
    async inspectTrust(trustId){return {trustId,newSessionsBlocked:true,activeSessions:0,pendingJobs:0,dispatchedJobsUncertain:0};}
  };
  f.service.installSessionAuthority(authority);
  const begin=f.service.begin({publicKeySpki:f.spki,deviceDigest:f.deviceDigest,durationDays:30});
  await f.service.finish(f.make(begin));
  f.advance(days(400));
  const observed=await f.service.status(f.proof(begin,STATUS_PURPOSE));
  assert.equal(observed.code,'TRUST_EXPIRED');
  assert.equal(observed.trustRegistered,false);
  assert.equal(observed.sessionActive,false);
  const canceled=await f.service.cancel(f.proof(begin,CANCEL_PURPOSE));
  assert.equal(canceled.code,'ENROLLMENT_CANCELED');
  assert.equal(canceled.complete,true);
  assert.equal(canceled.serverRecordRevoked,true);
  assert.equal(canceled.activeSessionsRevoked,true);
  assert.equal(canceled.pendingJobsRevoked,true);
  assert.equal(canceled.dispatchedJobsUncertain,0);
});
