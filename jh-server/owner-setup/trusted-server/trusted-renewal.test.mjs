import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {generateKeyPairSync,randomBytes,sign,createHmac} from 'node:crypto';
import {TrustedDeviceRegistry,PURPOSE,sha256,canonicalChallenge} from './trusted-device-registry.mjs';
import {TrustedBridgeSessionAuthority,activationMaterial,receiptMaterial} from './trusted-bridge-session-authority.mjs';
import {TrustedSettingsService} from './trusted-settings-service.mjs';
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'jh-session-')),ctx=Object.freeze({});let now=1_800_000_000_000;
 const d='synthetic-android',server=sha256('server'),catalog=sha256('catalog'),owner=sha256('owner');
 const registry=new TrustedDeviceRegistry({databasePath:join(dir,'trust.db'),serverDigest:server,catalogDigest:catalog,now:()=>now,
 authorizeEnrollment:(c,e)=>c===ctx?{ownerDigest:owner,enrollmentId:e.consentRequestId,expiresAt:now+30000,exactConsentDigest:sha256(JSON.stringify(e))}:null,authorizeRevocation:c=>c===ctx?{ownerDigest:owner}:null});
 const key=generateKeyPairSync('ec',{namedCurve:'prime256v1'});const receipt=registry.enroll({publicKeySpki:key.publicKey.export({format:'der',type:'spki'}).toString('base64url'),deviceDigest:sha256('jh56|'+d),requestedTrustMs:86400000,consentRequestId:randomBytes(24).toString('base64url')},ctx);
 const bridge={devices:new Map(),states:new Map(),queues:new Map(),jobs:new Map(),recentJobs:new Map(),frameWaiters:new Map(),serverDigest:server,catalogDigest:catalog,sessionDigest:p=>sha256(p.sessionId+'|'+p.expiresAt)};
 const authority=new TrustedBridgeSessionAuthority({registry,bridge,now:()=>now});
 const challenge=()=>authority.challenge({trustId:receipt.trustId,clientNonce:randomBytes(24).toString('base64url'),deviceId:d});
 const proof=c=>({challenge:c,signature:sign('sha256',canonicalChallenge(c),key.privateKey).toString('base64url')});
 const begin=()=>authority.begin({deviceId:d,proof:proof(challenge())});
 const activation=o=>{const a={deviceId:d,trustId:o.trustId,challengeId:o.challengeId,redemptionId:o.redemptionId,sessionId:o.secureSessionId,deviceDigest:o.deviceDigest,sessionDigest:o.sessionDigest,nonce:randomBytes(24).toString('base64url'),expiresAt:Math.min(now+30000,o.activationExpiresAt)};a.mac=createHmac('sha256',Buffer.from(o.secureSessionSecret,'base64url')).update(activationMaterial(a)).digest('hex');return a;};
 return {registry,bridge,authority,receipt,d,ctx,dir,challenge,proof,begin,activation,get now(){return now},advance:n=>now+=n,close(){registry.close();rmSync(dir,{recursive:true,force:true})}};
}
async function check(fn){const f=fixture();try{await fn(f)}finally{f.close()}}
function renewal(f,o){
 const c=f.authority.recoveryChallenge({deviceId:f.d,trustId:o.trustId,clientNonce:randomBytes(24).toString('base64url')});
 const binding=['JH_TRUST_RENEW_V1',PURPOSE,o.trustId,c.challengeId,c.clientNonce,o.secureSessionId,o.deviceDigest].join('\n');
 return {deviceId:f.d,sessionId:o.secureSessionId,proof:f.proof(c),mac:createHmac('sha256',Buffer.from(o.secureSessionSecret,'base64url')).update(binding).digest('hex')};
}
test('in-use renewal retains session and nonce history with real device proof',()=>check(f=>{
 const o=f.begin();f.authority.activate(f.activation(o));const a=f.bridge.states.get(f.d).active;
 a.seenPoll.add('already-used');f.advance(28*60000);const q=renewal(f,o),r=f.authority.renew(q);
 assert.equal(a.sessionId,o.secureSessionId);assert.equal(r.secureExpiresAt,f.now+1800000);
 assert.ok(a.seenPoll.has('already-used'));assert.equal(r.actionApprovalGranted,false);assert.equal(r.screenConsentGranted,false);
 assert.equal(f.authority.sessionAllowed(a),true);assert.throws(()=>f.authority.renew(q),/PROOF_REPLAY/);
}));
test('stolen session MAC without device key cannot renew',()=>check(f=>{
 const o=f.begin();f.authority.activate(f.activation(o));f.advance(10000);const q=renewal(f,o);q.proof.signature=Buffer.alloc(70).toString('base64url');
 assert.throws(()=>f.authority.renew(q),/INVALID_SIGNATURE/);assert.equal(f.bridge.states.get(f.d).active.expiresAt,o.secureExpiresAt);
}));
test('wrong renewal MAC is rejected before consuming fresh proof',()=>check(f=>{
 const o=f.begin();f.authority.activate(f.activation(o));f.advance(10000);const q=renewal(f,o);
 assert.throws(()=>f.authority.renew({...q,mac:'0'.repeat(64)}),/RENEW_MAC_INVALID/);
 assert.equal(f.authority.renew(q).code,'TRUSTED_SESSION_RENEWED');
}));
test('renewal does not touch dispatched jobs or their deadlines',()=>check(f=>{
 const o=f.begin();f.authority.activate(f.activation(o));const j={id:'not-replayed',status:'in_progress',secureSessionId:o.secureSessionId,secureExpiresAt:f.now+45000};
 f.bridge.jobs.set(j.id,j);const original=JSON.stringify(j);f.advance(10000);f.authority.renew(renewal(f,o));assert.equal(JSON.stringify(j),original);
}));
test('lost renewal response can be followed by fresh proof without redoing actions',()=>check(f=>{
 const o=f.begin();f.authority.activate(f.activation(o));f.advance(28*60000);f.authority.renew(renewal(f,o));f.advance(2000);
 const r=f.authority.renew(renewal(f,o));assert.equal(r.secureExpiresAt,f.now+1800000);assert.equal(f.bridge.jobs.size,0);
}));
test('renewal cannot cross original enrolled trust deadline',()=>check(f=>{
 f.advance(86000000);const o=f.begin();f.authority.activate(f.activation(o));f.advance(10000);
 const r=f.authority.renew(renewal(f,o));assert.equal(r.secureExpiresAt,f.receipt.expiresAt);
}));
test('revoked trust cannot use previously issued renewal challenge',()=>check(f=>{
 const o=f.begin();f.authority.activate(f.activation(o));const q=renewal(f,o);f.registry.revoke(o.trustId,f.ctx);
 assert.throws(()=>f.authority.renew(q),/TRUST_REVOKED/);
}));
test('expired or another session never renewed by a stale request',()=>check(f=>{
 const o=f.begin();f.authority.activate(f.activation(o));const q=renewal(f,o);
 assert.throws(()=>f.authority.renew({...q,sessionId:'x'.repeat(32)}),/RENEW_ACTIVE_TRUST_REQUIRED/);
 f.advance(1800001);assert.throws(()=>f.authority.renew(q),/RENEW_ACTIVE_TRUST_REQUIRED/);
}));
test('manual session cannot be silently turned into trusted renewable connection',()=>check(f=>{
 const o=f.begin();f.authority.activate(f.activation(o));const q=renewal(f,o);delete f.bridge.states.get(f.d).active.trustId;
 assert.throws(()=>f.authority.renew(q),/RENEW_ACTIVE_TRUST_REQUIRED/);
}));
test('renewal refuses extra approval or lifetime fields',()=>check(f=>{
 const o=f.begin();f.authority.activate(f.activation(o));const q=renewal(f,o);
 assert.throws(()=>f.authority.renew({...q,actionApprovalGranted:true}),/INVALID_FIELDS/);
 assert.throws(()=>f.authority.renew({...q,expiresAt:f.now+86400000}),/INVALID_FIELDS/);
}));

function processActivation(f,o,epoch='android-process-epoch-001'){
 const a={...f.activation(o),processEpoch:epoch,restartDisposition:'DISCARD_PREVIOUS'};
 a.mac=createHmac('sha256',Buffer.from(o.secureSessionSecret,'base64url')).update(activationMaterial(a)).digest('hex');return a;
}
test('real device proof plus V2 activation binds process and echoes authenticated receipt',()=>check(f=>{
 const o=f.begin(),a=processActivation(f,o),r=f.authority.activate(a);
 assert.equal(r.version,2);assert.equal(r.processEpoch,a.processEpoch);assert.equal(r.restartDisposition,'DISCARD_PREVIOUS');
 assert.equal(f.bridge.devices.get(f.d).processEpoch,a.processEpoch);
 assert.equal(f.bridge.states.get(f.d).active.processEpoch,a.processEpoch);
 assert.equal(r.mac,createHmac('sha256',Buffer.from(o.secureSessionSecret,'base64url')).update(receiptMaterial(r)).digest('hex'));
 assert.equal(r.actionApprovalGranted,false);assert.equal(r.screenConsentGranted,false);
 assert.throws(()=>f.authority.activate(a),/TRUSTED_PENDING_MISSING/);
 f.advance(1000);f.authority.renew(renewal(f,o));assert.equal(f.bridge.devices.get(f.d).processEpoch,a.processEpoch);
}));
test('process identity tampering and downgrade fail before activation',()=>check(f=>{
 const o=f.begin(),a=processActivation(f,o);
 assert.throws(()=>f.authority.activate({...a,processEpoch:'android-process-epoch-other'}),/ACTIVATION_MAC_INVALID/);
 const {processEpoch,restartDisposition,...stripped}=a;
 assert.throws(()=>f.authority.activate(stripped),/ACTIVATION_MAC_INVALID/);
 assert.equal(f.bridge.devices.get(f.d).processEpoch,null);assert.equal(f.bridge.states.get(f.d).active,null);
 assert.equal(f.authority.activate(a).version,2);
}));
test('process activation rejects partial, malformed and resume fields',()=>check(f=>{
 const o=f.begin(),a=processActivation(f,o),{restartDisposition,...partial}=a;
 assert.throws(()=>f.authority.activate(partial),/INVALID_FIELDS/);
 for(const p of [{processEpoch:''},{processEpoch:'x\ninject'},{processEpoch:null},{restartDisposition:'RESUME_PREVIOUS'},{processEpoch:'x'.repeat(161)}])
  assert.throws(()=>f.authority.activate({...a,...p}),/ACTIVATION_PROCESS_INVALID/);
 assert.throws(()=>f.authority.activate({...a,actionApprovalGranted:true}),/INVALID_FIELDS/);
 assert.equal(f.bridge.states.get(f.d).active,null);
}));
test('legacy reconnect clears old process identity without granting work identity',()=>check(f=>{
 f.bridge.devices.set(f.d,{processEpoch:'obsolete-process-epoch',secureActive:false});
 const o=f.begin();assert.equal(f.bridge.devices.get(f.d).processEpoch,null);
 // Even stale metadata introduced between the two phases must not be inherited.
 f.bridge.devices.get(f.d).processEpoch='obsolete-process-epoch';
 const r=f.authority.activate(f.activation(o));assert.equal(r.version,1);assert.equal(Object.hasOwn(r,'processEpoch'),false);
 assert.equal(f.bridge.devices.get(f.d).processEpoch,null);assert.equal(f.bridge.states.get(f.d).active.processEpoch,null);
}));
test('new process activation fences old dispatched work and retains uncertain evidence',()=>check(f=>{
 const first=f.begin();f.authority.activate(processActivation(f,first));
 const j={id:'job_1',targetDeviceId:f.d,status:'in_progress',secureSessionId:first.secureSessionId,trustBindingId:first.trustId,secureRequestedEffect:'MUTATION'};
 f.bridge.jobs.set(j.id,j);f.advance(1_800_001);
 const second=f.begin(),a=processActivation(f,second,'android-process-epoch-002');f.authority.activate(a);
 assert.equal(f.bridge.devices.get(f.d).processEpoch,a.processEpoch);
 assert.equal(j.status,'expired');assert.equal(j.error,'DISPATCH_OUTCOME_UNKNOWN_NO_AUTO_REPLAY');assert.equal(j.trustDispatchedOutcomeUncertain,true);
 assert.equal(f.bridge.queues.get(f.d).length,0);
}));
