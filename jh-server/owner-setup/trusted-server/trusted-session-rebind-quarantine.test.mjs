import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {TrustedBridgeSessionAuthority,activationMaterial} from './trusted-bridge-session-authority.mjs';

const h=x=>createHash('sha256').update(x).digest('hex');
const mac=(s,x)=>createHmac('sha256',s).update(x).digest('hex');
const token=c=>c.repeat(24);

function fixture(){
  const now=1_700_000_000_000;
  const deviceId='device_A';
  const trustId=token('t');
  const ownerDigest='1'.repeat(64);
  const serverDigest='2'.repeat(64);
  const catalogDigest='3'.repeat(64);
  const deviceDigest=h('jh56|'+deviceId);
  const trust={trustId,ownerDigest,deviceDigest,serverDigest,catalogDigest,keyDigest:'4'.repeat(64),expiresAt:now+600_000};
  const issuerContext=Object.freeze({});
  const registry={
    issuerContext,
    trustForSessionIssuer(id,ctx){assert.equal(ctx,issuerContext);assert.equal(id,trustId);return trust;},
    claimForSessionIssuer(){throw new Error('not used');},
    challenge(){throw new Error('not used');},
    inspectRecovery(){return {trustId,ownerDigest,deviceDigest,serverDigest,catalogDigest,unusedChallenges:0,redeemableProofs:0,dispatchedJobsUncertain:0};},
    uncertainDispatchCount(){return 0;}
  };
  const bridge={
    devices:new Map([[deviceId,{secureBridgeVersion:56,deviceDigest,secureActive:false,lastSeen:now-20_000}]]),
    states:new Map(),queues:new Map(),jobs:new Map(),recentJobs:new Map(),frameWaiters:new Map(),
    serverDigest,catalogDigest,sessionDigest:x=>h(x.sessionId+'|'+x.deviceDigest)
  };
  return {now,deviceId,trustId,ownerDigest,serverDigest,catalogDigest,deviceDigest,trust,registry,bridge};
}

test('trusted activation quarantines jobs from prior secure sessions without replay',()=>{
  const f=fixture();
  const currentSession=token('s');
  const secret=Buffer.alloc(32,7);
  const challengeId=token('c'),redemptionId=token('r');
  const p={sessionId:currentSession,secret,expiresAt:f.now+120_000,deviceDigest:f.deviceDigest,
    trustId:f.trustId,ownerDigest:f.ownerDigest,redemptionId,challengeId,
    activationDeadline:f.now+60_000,seenActivate:new Set(),sessionDigest:'5'.repeat(64)};
  f.bridge.states.set(f.deviceId,{active:null,pending:new Map([[currentSession,p]])});
  const oldQueued={id:'job_1',targetDeviceId:f.deviceId,secureSessionId:token('o'),trustBindingId:f.trustId,status:'queued',textValue:'discard'};
  const oldInProgress={id:'job_2',targetDeviceId:f.deviceId,secureSessionId:token('p'),trustBindingId:f.trustId,status:'in_progress',screenGrantToken:'discard'};
  const current={id:'job_3',targetDeviceId:f.deviceId,secureSessionId:currentSession,trustBindingId:f.trustId,status:'queued'};
  const other={id:'job_4',targetDeviceId:'other',secureSessionId:token('x'),status:'queued'};
  for(const j of [oldQueued,oldInProgress,current,other])f.bridge.jobs.set(j.id,j);
  f.bridge.queues.set(f.deviceId,['job_1','job_2','job_3']);
  f.bridge.recentJobs.set('old',{t:f.now,v:oldQueued});
  f.bridge.recentJobs.set('current',{t:f.now,v:current});
  let waiterResolved=false;
  f.bridge.frameWaiters.set('lease',{deviceId:f.deviceId,resolve(){waiterResolved=true;}});
  f.bridge.frameWaiters.set('other',{deviceId:'other',resolve(){}});
  const authority=new TrustedBridgeSessionAuthority({registry:f.registry,bridge:f.bridge,now:()=>f.now});
  const input={deviceId:f.deviceId,trustId:f.trustId,challengeId,redemptionId,sessionId:currentSession,
    deviceDigest:f.deviceDigest,sessionDigest:p.sessionDigest,nonce:token('n'),expiresAt:f.now+30_000,mac:''};
  input.mac=mac(secret,activationMaterial(input));
  const out=authority.activate(input);
  assert.equal(out.code,'TRUSTED_SESSION_ACTIVE');
  assert.equal(f.bridge.states.get(f.deviceId).active.sessionId,currentSession);
  assert.equal(oldQueued.status,'expired');
  assert.equal(oldQueued.error,'STALE_SECURE_SESSION_BEFORE_DISPATCH');
  assert.equal(oldQueued.textValue,undefined);
  assert.equal(oldInProgress.status,'expired');
  assert.equal(oldInProgress.error,'DISPATCH_OUTCOME_UNKNOWN_NO_AUTO_REPLAY');
  assert.equal(oldInProgress.trustDispatchedOutcomeUncertain,true);
  assert.equal(oldInProgress.screenGrantToken,undefined);
  assert.equal(current.status,'queued');
  assert.deepEqual(f.bridge.queues.get(f.deviceId),['job_3']);
  assert.equal(f.bridge.recentJobs.has('old'),false);
  assert.equal(f.bridge.recentJobs.has('current'),true);
  assert.equal(waiterResolved,true);
  assert.equal(f.bridge.frameWaiters.has('lease'),false);
  assert.equal(f.bridge.frameWaiters.has('other'),true);
  assert.equal(f.bridge.devices.get(f.deviceId).secureActive,true);
});

test('trusted recovery expires stale queued work and permits a clean new session',()=>{
  const f=fixture();
  const oldSession=token('z');
  f.bridge.states.set(f.deviceId,{active:{sessionId:oldSession,secret:Buffer.alloc(32,9),expiresAt:f.now+120_000,
    deviceDigest:f.deviceDigest,trustId:f.trustId,ownerDigest:f.ownerDigest},pending:new Map()});
  const oldQueued={id:'job_9',targetDeviceId:f.deviceId,secureSessionId:oldSession,trustBindingId:f.trustId,status:'queued'};
  f.bridge.jobs.set(oldQueued.id,oldQueued);
  f.bridge.queues.set(f.deviceId,[oldQueued.id]);
  f.bridge.recentJobs.set('old',{t:f.now,v:oldQueued});
  const authority=new TrustedBridgeSessionAuthority({registry:f.registry,bridge:f.bridge,now:()=>f.now});
  const out=authority.recover({deviceId:f.deviceId,proof:{challenge:{trustId:f.trustId}}});
  assert.equal(out.code,'RECOVERY_CLEAR');
  assert.equal(out.safeToStartNewAttempt,true);
  assert.equal(out.activeSessions,0);
  assert.equal(out.pendingJobs,0);
  assert.equal(f.bridge.states.get(f.deviceId).active,null);
  assert.equal(oldQueued.status,'expired');
  assert.equal(oldQueued.error,'STALE_SECURE_SESSION_BEFORE_DISPATCH');
  assert.deepEqual(f.bridge.queues.get(f.deviceId),[]);
  assert.equal(f.bridge.recentJobs.size,0);
});
