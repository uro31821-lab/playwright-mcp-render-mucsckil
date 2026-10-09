import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {generateKeyPairSync,randomBytes,sign,createHmac} from 'node:crypto';
import {TrustedDeviceRegistry,PURPOSE,sha256,canonicalChallenge} from './trusted-device-registry.mjs';
import {TrustedBridgeSessionAuthority,activationMaterial} from './trusted-bridge-session-authority.mjs';
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
