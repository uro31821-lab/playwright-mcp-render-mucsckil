import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createHash, generateKeyPairSync, randomBytes, sign
} from 'node:crypto';
import { createEncryptedGlassDeviceStore } from './encrypted-device-store.mjs';
import { createApprovedGlassDeviceRegistry, glassEnrollmentMessage, glassPhotoIntentMessage } from './approved-device-session.mjs';
import { verifiedGlassOwner } from './verified-owner.mjs';

const serverDigest='a'.repeat(64),deviceDigest='b'.repeat(64);
const access={scope:'jh.secure',glassOwnerVerified:true,
  subject:'jhsub_AAAAAAAAAAAAAAAAAAAAAA',expiresAt:2_000_000};
const ownerId=verifiedGlassOwner(access,100_000).ownerId;
const digest=x=>createHash('sha256').update(x).digest('hex');
const key64=()=>randomBytes(32).toString('base64url');
function context() {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jh-glass-store-'));
  const filePath=path.join(dir,'device-trust.enc');
  const keyBase64url=key64();
  const store=createEncryptedGlassDeviceStore({filePath,keyBase64url,serverDigest});
  return {dir,filePath,keyBase64url,store,dispose:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
function pair(){
  const kp=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  return {...kp,base64:kp.publicKey.export({type:'spki',format:'der'}).toString('base64url')};
}
function makeRegistry(store,now=()=>100_000,approve=async p=>({
  verdict:'VERIFIED',localUserApproved:true,secureCompletionVerified:true,
  ownerId:p.ownerId,deviceDigest:p.deviceDigest,publicKeyDigest:p.publicKeyDigest,
  challenge:p.challenge,serverDigest:p.serverDigest
})) {
  return createApprovedGlassDeviceRegistry({
    verifySecure56Enrollment:approve,serverDigest,deviceTrustStore:store,now
  });
}
async function enroll(reg,kp=pair()) {
  const start=reg.startEnrollment({accessRecord:access,deviceDigest,publicKeyBase64:kp.base64});
  assert.equal(start.ok,true);
  const msg=glassEnrollmentMessage({ownerId,serverDigest,deviceDigest,publicKeyDigest:start.publicKeyDigest,challenge:start.challenge});
  const signature=sign('sha256',Buffer.from(msg),kp.privateKey).toString('base64url');
  const result=await reg.finishEnrollment({accessRecord:access,challenge:start.challenge,signature,approvalProof:{}});
  return {result,kp};
}
function intent(kp) {
  const requestId=randomBytes(24).toString('base64url'),nonce=randomBytes(24).toString('base64url');
  const photoSha256='c'.repeat(64),issuedAt=100_000;
  const message=glassPhotoIntentMessage({ownerId,serverDigest,deviceDigest,requestId,photoSha256,issuedAt,nonce});
  return {requestId,expectedOwnerId:ownerId,approvalProof:{requestId,deviceDigest,photoSha256,issuedAt,nonce,
    signature:sign('sha256',Buffer.from(message),kp.privateKey).toString('base64url')}};
}

test('no encryption key means no store, no unsecured fallback',()=>{
 const x=context();
 try{ assert.throws(()=>createEncryptedGlassDeviceStore({filePath:x.filePath,serverDigest}),/KEY_REQUIRED/);}
 finally{x.dispose();}
});
test('relative storage path rejected',()=>{
 assert.throws(()=>createEncryptedGlassDeviceStore({filePath:'trust.enc',serverDigest,keyBase64url:key64()}),/ABSOLUTE/);
});
test('encrypted store saves one public-key record and loads it with no private key',()=>{
 const x=context();
 try{
   const kp=pair();const bytes=Buffer.from(kp.base64,'base64url');
   const record={ownerId,deviceDigest,publicKeyBase64url:kp.base64,publicKeyDigest:digest(bytes),expiresAt:500_000};
   x.store.upsert(record);
   assert.deepEqual(x.store.loadAll(),[record]);
   const raw=fs.readFileSync(x.filePath,'utf8');
   assert.equal(raw.includes(ownerId),false);
   assert.equal(raw.includes(kp.base64),false);
   assert.equal(raw.includes('PRIVATE KEY'),false);
   if(process.platform!=='win32') assert.equal(fs.statSync(x.filePath).mode&0o077,0);
 }finally{x.dispose();}
});
test('restart restores actual enrolled P-256 key without new local approval',async()=>{
 const x=context();
 try{
   let approved=0;
   const callback=async p=>{approved++;return {
     verdict:'VERIFIED',localUserApproved:true,secureCompletionVerified:true,
     ownerId:p.ownerId,deviceDigest:p.deviceDigest,publicKeyDigest:p.publicKeyDigest,
     challenge:p.challenge,serverDigest:p.serverDigest}};
   const first=makeRegistry(x.store,()=>100_000,callback);
   const e=await enroll(first);assert.equal(e.result.ok,true);
   first.close();
   const second=makeRegistry(x.store,()=>100_000,callback);
   assert.equal(second.status(access).enrolled,true);
   assert.equal(second.verifyPhotoIntent(intent(e.kp)).verdict,'VERIFIED');
   assert.equal(approved,1);
   second.close();
 }finally{x.dispose();}
});
test('revocation is durable across server restart',async()=>{
 const x=context();
 try{
   const reg=makeRegistry(x.store),e=await enroll(reg);assert.equal(e.result.ok,true);
   assert.equal(reg.revoke(access).code,'DEVICE_TRUST_REVOKED');
   const fresh=makeRegistry(x.store);
   assert.equal(fresh.status(access).enrolled,false);
   assert.equal(fresh.verifyPhotoIntent(intent(e.kp)).code,'DEVICE_TRUST_REQUIRED');
 }finally{x.dispose();}
});
test('wrong store decryption key fails closed rather than re-enrolling silently',async()=>{
 const x=context();
 try{
   const reg=makeRegistry(x.store);assert.equal((await enroll(reg)).result.ok,true);
   const wrong=createEncryptedGlassDeviceStore({filePath:x.filePath,serverDigest,keyBase64url:key64()});
   assert.throws(()=>makeRegistry(wrong),/AUTHENTICATION_FAILED/);
 }finally{x.dispose();}
});
test('changed server identity digest rejected',async()=>{
 const x=context();
 try{
   assert.equal((await enroll(makeRegistry(x.store))).result.ok,true);
   const foreign=createEncryptedGlassDeviceStore({filePath:x.filePath,keyBase64url:x.keyBase64url,
      serverDigest:'f'.repeat(64)});
   assert.throws(()=>foreign.loadAll(),/IDENTITY_MISMATCH/);
 }finally{x.dispose();}
});
test('tampered ciphertext detected before restoring any owner',async()=>{
 const x=context();
 try{
   assert.equal((await enroll(makeRegistry(x.store))).result.ok,true);
   const doc=JSON.parse(fs.readFileSync(x.filePath,'utf8'));
   const b=Buffer.from(doc.ciphertext,'base64url');
   b[2]^=0x19;doc.ciphertext=b.toString('base64url');
   fs.writeFileSync(x.filePath,JSON.stringify(doc),{mode:0o600});
   assert.throws(()=>makeRegistry(x.store),/AUTHENTICATION_FAILED/);
 }finally{x.dispose();}
});
test('expired enrollment is not activated after restart',async()=>{
 const x=context();
 try{
   assert.equal((await enroll(makeRegistry(x.store))).result.ok,true);
   const expired=makeRegistry(x.store,()=>100_000+30*24*60*60*1000+1);
   assert.equal(expired.status({...access,expiresAt:4_000_000_000}).enrolled,false);
 }finally{x.dispose();}
});
test('persistence failure fails closed and never falsely says enrolled',async()=>{
 const store={loadAll:()=>[],upsert:()=>{throw new Error('disk full')},remove:()=>{}};
 const reg=makeRegistry(store),e=await enroll(reg);
 assert.equal(e.result.code,'DEVICE_TRUST_STORAGE_FAULT');
 assert.equal(reg.status(access).code,'DEVICE_TRUST_STORAGE_FAULT');
});
test('revoke disk failure blocks the current registry and never reports success',async()=>{
 const x=context();
 try{
   const reg=makeRegistry(x.store),e=await enroll(reg);
   assert.equal(e.result.ok,true);
   const faulty={loadAll:()=>x.store.loadAll(),upsert:r=>x.store.upsert(r),remove:()=>{throw new Error('read-only filesystem')}};
   const second=makeRegistry(faulty);
   assert.equal(second.revoke(access).code,'DEVICE_TRUST_REVOKE_UNPERSISTED');
   assert.equal(second.verifyPhotoIntent(intent(e.kp)).code,'DEVICE_TRUST_STORAGE_FAULT');
 }finally{x.dispose();}
});
test('unsafe public key record rejected before encrypted write',()=>{
 const x=context();
 try{
   assert.throws(()=>x.store.upsert({ownerId,deviceDigest,publicKeyBase64url:'invalid',publicKeyDigest:'c'.repeat(64),expiresAt:900_000}),/UNSAFE/);
   assert.equal(fs.existsSync(x.filePath),false);
 }finally{x.dispose();}
});
test('expired access scope cannot read persisted trust',async()=>{
 const x=context();
 try{
   assert.equal((await enroll(makeRegistry(x.store))).result.ok,true);
   const restored=makeRegistry(x.store);
   assert.equal(restored.status({...access,expiresAt:100_000}).ok,false);
 }finally{x.dispose();}
});
