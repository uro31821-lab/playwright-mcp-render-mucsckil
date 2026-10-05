import test from 'node:test';
import assert from 'node:assert/strict';
import {OAuth2Client} from 'google-auth-library';
import {createHash,generateKeyPairSync,randomBytes,sign} from 'node:crypto';
import {mkdtempSync,chmodSync,rmSync,readFileSync,writeFileSync,symlinkSync,existsSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {EnrollmentStore} from './enrollment-store.mjs';
import {GoogleOwnerVerifier,OwnerEnrollmentGate,enrollmentMessage,assessEnrollmentDeployment} from './owner-enrollment.mjs';

const clientId='fixture-client.apps.googleusercontent.com',subject='fixture-owner-001';
const origin='https://fixture.invalid',catalog='a'.repeat(64),device='b'.repeat(64);
const hash=x=>createHash('sha256').update(x).digest('hex');
const accountDigest=hash('JH_GOOGLE_OWNER_V1|https://accounts.google.com|'+subject+'|'+clientId);
const issuer=generateKeyPairSync('rsa',{modulusLength:2048});
const otherIssuer=generateKeyPairSync('rsa',{modulusLength:2048});
const cert=issuer.publicKey.export({format:'pem',type:'spki'});
function jwt(claims,key=issuer.privateKey,header={alg:'RS256',typ:'JWT',kid:'fixture'}) {
  const a=Buffer.from(JSON.stringify(header)).toString('base64url'),b=Buffer.from(JSON.stringify(claims)).toString('base64url'),m=a+'.'+b;
  return m+'.'+sign('RSA-SHA256',Buffer.from(m),key).toString('base64url');
}
function context(t) {
  const dir=mkdtempSync(path.join(os.tmpdir(),'jh-enroll-'));chmodSync(dir,0o700);
  const config={filename:path.join(dir,'owner-intents.sqlite'),key:randomBytes(32),epoch:'fixture-epoch-00000001'};
  let now=Date.now();const clock=()=>now;
  const store=new EnrollmentStore({...config,initialize:true});
  const client=new OAuth2Client();let certCalls=0;
  client.getFederatedSignonCertsAsync=async()=>{certCalls++;return {certs:{fixture:cert},format:'PEM'};};
  const verifier=new GoogleOwnerVerifier({clientId,allowedSubjects:[subject],clock,oauthClient:client});
  const gate=new OwnerEnrollmentGate({store,verifier,serverOrigin:origin,catalogDigest:catalog,clock});
  const key=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),publicKeySpki=key.publicKey.export({format:'der',type:'spki'}).toString('base64url');
  const begin=(extra={})=>gate.begin({publicKeySpki,deviceDigest:device,durationDays:7,...extra});
  const make=(intent,claims={},signingKey=key.privateKey)=>{
    const n=Math.floor(now/1000),body={iss:'https://accounts.google.com',aud:clientId,azp:clientId,sub:subject,iat:n,exp:n+3600,nonce:intent.googleNonce,...claims};
    return {requestId:intent.requestId,idToken:jwt(body),consentSignature:sign('sha256',enrollmentMessage(intent.manifestDigest,accountDigest),signingKey).toString('base64url')};
  };
  t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
  return {store,config,dir,client,verifier,gate,key,publicKeySpki,begin,make,clock,advance:ms=>now+=ms,certCalls:()=>certCalls};
}

test('valid signed identity and exact local consent produces authorization only',async t=>{
  const c=context(t),i=c.begin(),r=await c.gate.authorize(c.make(i));
  assert.equal(r.code,'AUTHENTICATED_ENROLLMENT_NOT_APPLIED');assert.equal(r.trustCreated,false);assert.equal(r.sessionCreated,false);assert.equal(r.actionApproved,false);assert.equal(c.certCalls(),1);
});
test('public-key possession without a signed owner identity is rejected',async t=>{
  const c=context(t),i=c.begin(),x=c.make(i);x.idToken='not-a-token';await assert.rejects(c.gate.authorize(x),/identity_token_invalid/);assert.equal(c.store.read(i.requestId).state,'PENDING');
});
test('a cryptographically forged provider token is rejected by the Google library',async t=>{
  const c=context(t),i=c.begin(),x=c.make(i);const p=JSON.parse(Buffer.from(x.idToken.split('.')[1],'base64url'));x.idToken=jwt(p,otherIssuer.privateKey);await assert.rejects(c.gate.authorize(x),/identity_verification_failed/);
});
test('matching email never substitutes for allowlisted subject',async t=>{
  const c=context(t),i=c.begin();await assert.rejects(c.gate.authorize(c.make(i,{sub:'other-person',email:'same@example.invalid',email_verified:true})),/owner_not_authorized/);
});
test('wrong token audience is rejected',async t=>{
  const c=context(t),i=c.begin();await assert.rejects(c.gate.authorize(c.make(i,{aud:'another.apps.googleusercontent.com'})),/identity_verification_failed/);
});
test('wrong token issuer is rejected',async t=>{
  const c=context(t),i=c.begin();await assert.rejects(c.gate.authorize(c.make(i,{iss:'https://attacker.invalid'})),/identity_verification_failed/);
});
test('unapproved authorized presenter is rejected',async t=>{
  const c=context(t),i=c.begin();await assert.rejects(c.gate.authorize(c.make(i,{azp:'other.apps.googleusercontent.com'})),/owner_not_authorized/);
});
test('old but unexpired token is not a new enrollment login',async t=>{
  const c=context(t),i=c.begin(),n=Math.floor(c.clock()/1000);await assert.rejects(c.gate.authorize(c.make(i,{iat:n-301,exp:n+300})),/identity_time_invalid/);
});
test('expiry is strict even inside library clock-skew allowance',async t=>{
  const c=context(t),i=c.begin(),n=Math.floor(c.clock()/1000);await assert.rejects(c.gate.authorize(c.make(i,{iat:n-60,exp:n})),/identity_time_invalid/);
});
test('future issued-at is rejected',async t=>{
  const c=context(t),i=c.begin(),n=Math.floor(c.clock()/1000);await assert.rejects(c.gate.authorize(c.make(i,{iat:n+31,exp:n+3600})),/identity_time_invalid/);
});
test('Google nonce is bound to one exact enrollment manifest',async t=>{
  const c=context(t),i=c.begin(),j=c.begin();await assert.rejects(c.gate.authorize(c.make(i,{nonce:j.googleNonce})),/identity_nonce_mismatch/);
});
test('wrong device key cannot sign consent',async t=>{
  const c=context(t),i=c.begin(),other=generateKeyPairSync('ec',{namedCurve:'prime256v1'});await assert.rejects(c.gate.authorize(c.make(i,{},other.privateKey)),/consent_signature_invalid/);
});
test('consent from another requested trust period cannot be reused',async t=>{
  const c=context(t),i=c.begin({durationDays:1}),j=c.begin({durationDays:30}),x=c.make(j);x.consentSignature=c.make(i).consentSignature;await assert.rejects(c.gate.authorize(x),/consent_signature_invalid/);
});
test('caller cannot add confirmed flag, account ID or change scope',async t=>{
  const c=context(t),i=c.begin();for(const field of ['confirmed','accountId','purpose'])await assert.rejects(c.gate.authorize({...c.make(i),[field]:true}),/unexpected_fields/);
});
test('invalid trust period and non-P256 key are rejected before journaling',t=>{
  const c=context(t);assert.throws(()=>c.begin({durationDays:365}),/enrollment_scope_invalid/);assert.throws(()=>c.begin({publicKeySpki:issuer.publicKey.export({format:'der',type:'spki'}).toString('base64url')}),/public_key_invalid/);
});
test('missing server owner configuration never adopts first caller',t=>{
  assert.throws(()=>new GoogleOwnerVerifier({clientId,allowedSubjects:[]}),/owner_configuration_required/);
});
test('single intent cannot be authorized twice',async t=>{
  const c=context(t),i=c.begin(),x=c.make(i);await c.gate.authorize(x);await assert.rejects(c.gate.authorize(x),/intent_not_pending/);
});
test('32 competing requests yield exactly one authorized receipt',async t=>{
  const c=context(t),i=c.begin(),x=c.make(i);const all=await Promise.allSettled(Array.from({length:32},()=>c.gate.authorize(x)));assert.equal(all.filter(x=>x.status==='fulfilled').length,1);
});
test('cancel during provider verification prevents late success',async t=>{
  const c=context(t),i=c.begin();let release;const barrier=new Promise(r=>release=r);const orig=c.client.getFederatedSignonCertsAsync.bind(c.client);c.client.getFederatedSignonCertsAsync=async()=>{await barrier;return orig();};
  const p=c.gate.authorize(c.make(i));assert.equal(c.store.cancel(i.requestId),true);release();await assert.rejects(p,/intent_not_pending/);assert.equal(c.store.read(i.requestId).state,'CANCELED');
});
test('expiry during provider verification prevents late success',async t=>{
  const c=context(t),i=c.begin();let release;const barrier=new Promise(r=>release=r);const orig=c.client.getFederatedSignonCertsAsync.bind(c.client);c.client.getFederatedSignonCertsAsync=async()=>{await barrier;return orig();};
  const p=c.gate.authorize(c.make(i));c.advance(120001);release();await assert.rejects(p,/intent_expired/);
});
test('intent expiry and attempt limit are enforced',async t=>{
  const c=context(t),i=c.begin();for(let n=0;n<5;n++)await assert.rejects(c.gate.authorize({...c.make(i),idToken:'bad'}));await assert.rejects(c.gate.authorize(c.make(i)),/intent_attempt_limit/);
  const j=c.begin(),x=c.make(j);c.advance(120001);await assert.rejects(c.gate.authorize(x),/intent_expired/);
});
test('server or catalog policy change invalidates prepared intent',async t=>{
  const c=context(t),i=c.begin();const other=new OwnerEnrollmentGate({store:c.store,verifier:c.verifier,serverOrigin:origin,catalogDigest:'c'.repeat(64),clock:c.clock});await assert.rejects(other.authorize(c.make(i)),/enrollment_policy_changed/);
});
test('restart preserves used receipt and ciphertext does not contain JWT or manifest',async t=>{
  const c=context(t),i=c.begin(),x=c.make(i);await c.gate.authorize(x);c.store.close();
  const bytes=readFileSync(c.config.filename);assert.equal(bytes.includes(Buffer.from(x.idToken)),false);assert.equal(bytes.includes(Buffer.from(origin)),false);assert.equal(bytes.includes(Buffer.from(accountDigest)),false);
  const reopened=new EnrollmentStore(c.config);try{assert.equal(reopened.read(i.requestId).state,'AUTHORIZED_NOT_APPLIED');assert.throws(()=>reopened.authorize(i.requestId,i.manifestDigest,accountDigest,c.clock()),/intent_not_pending/);}finally{reopened.close();}
});
test('wrong encryption key or deployment epoch cannot restore trust silently',t=>{
  const c=context(t);c.store.close();assert.throws(()=>new EnrollmentStore({...c.config,key:randomBytes(32)}),/storage_key_or_epoch_mismatch/);assert.throws(()=>new EnrollmentStore({...c.config,epoch:'different-epoch-000001'}),/storage_key_or_epoch_mismatch/);
});
test('missing storage requires explicit initialization, never implicit reset',t=>{
  const c=context(t),filename=path.join(c.dir,'missing.sqlite');assert.throws(()=>new EnrollmentStore({...c.config,filename}),/storage_missing_recovery_required/);assert.equal(existsSync(filename),false);
});
test('symlink storage and non-private directory are refused',t=>{
  const c=context(t),link=path.join(c.dir,'link.sqlite');symlinkSync(c.config.filename,link);assert.throws(()=>new EnrollmentStore({...c.config,filename:link}),/storage_file_invalid/);chmodSync(c.dir,0o755);assert.throws(()=>new EnrollmentStore(c.config),/storage_directory_not_private/);chmodSync(c.dir,0o700);
});
test('tampered encrypted record fails instead of resetting it',t=>{
  const c=context(t),i=c.begin();const db=new DatabaseSync(c.config.filename);db.prepare('UPDATE intents SET body=? WHERE id=?').run(Buffer.alloc(80).toString('base64'),i.requestId);db.close();assert.throws(()=>c.store.read(i.requestId),/record_integrity_failed/);
});
test('anonymous pending intent allocation is bounded',t=>{
  const c=context(t);for(let n=0;n<128;n++)c.begin();assert.throws(()=>c.begin(),/pending_intent_limit/);
});
function childClaim(payload) {
  const code=`import {EnrollmentStore} from './enrollment-store.mjs'; let raw='';for await (const x of process.stdin)raw+=x;const p=JSON.parse(raw);const s=new EnrollmentStore({...p.config,key:Buffer.from(p.config.key,'base64')});try{s.authorize(p.id,p.digest,p.account,p.now);console.log('AUTHORIZED');}catch(e){console.log(e.code||'ERROR');}finally{s.close();}`;
  return new Promise((resolve,reject)=>{const p=spawn(process.execPath,['--input-type=module','-e',code],{cwd:process.cwd(),stdio:['pipe','pipe','pipe']});let out='',err='';const timer=setTimeout(()=>{p.kill();reject(Error('child timeout'));},10000);p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('error',reject);p.on('close',code=>{clearTimeout(timer);code===0?resolve(out.trim()):reject(Error('child failed '+code));});p.stdin.end(JSON.stringify(payload));});
}
test('four independent processes atomically consume one authorization record',async t=>{
  const c=context(t),i=c.begin(),payload={config:{...c.config,key:c.config.key.toString('base64')},id:i.requestId,digest:i.manifestDigest,account:accountDigest,now:c.clock()};const all=await Promise.all(Array.from({length:4},()=>childClaim(payload)));assert.equal(all.filter(x=>x==='AUTHORIZED').length,1);assert.equal(all.filter(x=>x==='intent_not_pending').length,3);
});
test('free Render filesystem cannot satisfy SQLite durable deployment readiness',()=>{
  const r=assessEnrollmentDeployment({googleClientConfigured:true,ownerSubjectConfigured:true,renderPlan:'free',storage:{kind:'sqlite-persistent-volume',verifiedMount:true}});assert.equal(r.readyForIntegration,false);assert.ok(r.blockers.includes('SQLITE_PERSISTENT_MOUNT_REQUIRED'));assert.equal(r.productionChanged,false);
});
test('no database, expiring database and missing identity are explicit blockers',()=>{
  assert.equal(assessEnrollmentDeployment({}).blockers.length,3);assert.ok(assessEnrollmentDeployment({googleClientConfigured:true,ownerSubjectConfigured:true,storage:{kind:'postgres',connectionVerified:true,expiresAt:'tomorrow'}}).blockers.includes('NONEXPIRING_DATABASE_REQUIRED'));
});
