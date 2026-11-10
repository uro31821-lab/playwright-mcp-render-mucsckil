import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { verifiedGlassOwner } from './verified-owner.mjs';
import { createApprovedGlassDeviceRegistry, glassEnrollmentMessage, glassPhotoIntentMessage,
  ENROLLMENT_MAX_MS, DEVICE_TRUST_MAX_MS, PHOTO_INTENT_MAX_AGE_MS } from './approved-device-session.mjs';

const serverDigest = 'a'.repeat(64);
const deviceDigest = 'b'.repeat(64);
const photoSha256 = 'c'.repeat(64);
const record = {scope:'jh.secure',expiresAt:400_000,subject:'jhsub_AAAAAAAAAAAAAAAAAAAAAA',glassOwnerVerified:true};
const otherRecord = {...record,subject:'jhsub_BBBBBBBBBBBBBBBBBBBBBB'};
const ownerId = verifiedGlassOwner(record,100_000).ownerId;
const rid = () => randomBytes(24).toString('base64url');
const nonce = () => randomBytes(24).toString('base64url');
function pair(){
  const kp=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  return {...kp,publicKeyBase64:kp.publicKey.export({type:'spki',format:'der'}).toString('base64url')};
}
function fixture({approval=true,throwApproval=false,replacementApproved=false}={}) {
  let t=100_000, approvals=0;
  const reg=createApprovedGlassDeviceRegistry({
    now:()=>t,
    serverDigest,
    verifySecure56Enrollment:async a=>{
      approvals++;
      if(throwApproval)throw Error('device disconnected');
      if(!approval)return {verdict:'REJECTED'};
      return {verdict:'VERIFIED',localUserApproved:true,secureCompletionVerified:true,
        ownerId:a.ownerId,deviceDigest:a.deviceDigest,publicKeyDigest:a.publicKeyDigest,
        challenge:a.challenge,serverDigest:a.serverDigest,deviceReplacementApproved:replacementApproved};
    },
  });
  const enroll=async({accessRecord=record,dev=deviceDigest,kp=pair(),enrollSig=true,receipt=true}={})=>{
    const start=reg.startEnrollment({accessRecord,deviceDigest:dev,publicKeyBase64:kp.publicKeyBase64});
    if(!start.ok)return {start};
    const msg=glassEnrollmentMessage({ownerId:verifiedGlassOwner(accessRecord,t).ownerId,serverDigest,
      deviceDigest:dev,publicKeyDigest:start.publicKeyDigest,challenge:start.challenge});
    const signature=sign('sha256',Buffer.from(msg),enrollSig?kp.privateKey:pair().privateKey).toString('base64url');
    const end=await reg.finishEnrollment({accessRecord,challenge:start.challenge,
      signature,approvalProof:receipt?{testLocalApproved:true}:undefined});
    return {start,end,kp};
  };
  const command=(kp,{requestId=rid(),time=t,photoHash=photoSha256,nonceValue=nonce(),dev=deviceDigest,owner=ownerId}={})=>{
    const msg=glassPhotoIntentMessage({ownerId:owner,serverDigest,deviceDigest:dev,
      requestId,photoSha256:photoHash,issuedAt:time,nonce:nonceValue});
    const signature=sign('sha256',Buffer.from(msg),kp.privateKey).toString('base64url');
    return {requestId,expectedOwnerId:owner,approvalProof:{requestId,deviceDigest:dev,
      photoSha256:photoHash,issuedAt:time,nonce:nonceValue,signature}};
  };
  return {reg,enroll,command,advance:ms=>t+=ms,get now(){return t},get approvals(){return approvals}};
}

test('enrollment is denied without owner-verified OAuth access record',()=>{
 const f=fixture(),k=pair();
 assert.equal(f.reg.startEnrollment({accessRecord:{...record,glassOwnerVerified:false},deviceDigest,publicKeyBase64:k.publicKeyBase64}).code,'GLASS_OWNER_APPROVAL_REQUIRED');
});
test('legacy OAuth scope-only token denied',()=>{
 const f=fixture(),k=pair();
 assert.equal(f.reg.startEnrollment({accessRecord:{scope:'jh.secure',expiresAt:300_000},deviceDigest,publicKeyBase64:k.publicKeyBase64}).ok,false);
});
test('invalid device digest rejected',()=>{
 const f=fixture(),k=pair();
 assert.equal(f.reg.startEnrollment({accessRecord:record,deviceDigest:'fake',publicKeyBase64:k.publicKeyBase64}).code,'DEVICE_DIGEST_INVALID');
});
test('RSA public key rejected, require P-256',()=>{
 const f=fixture(),kp=generateKeyPairSync('rsa',{modulusLength:2048});
 const key=kp.publicKey.export({type:'spki',format:'der'}).toString('base64url');
 assert.equal(f.reg.startEnrollment({accessRecord:record,deviceDigest,publicKeyBase64:key}).code,'P256_PUBLIC_KEY_INVALID');
});
test('bad enrollment possession signature rejected and challenge consumed',async()=>{
 const f=fixture();const p=await f.enroll({enrollSig:false});
 assert.equal(p.end.code,'ENROLLMENT_KEY_PROOF_INVALID');
 assert.equal((await f.reg.finishEnrollment({accessRecord:record,challenge:p.start.challenge,signature:'x'.repeat(90)})).code,'ENROLLMENT_NOT_AVAILABLE');
});
test('Secure56 phone-local approval refusal denies enrollment',async()=>{
 const f=fixture({approval:false});const e=await f.enroll();
 assert.equal(e.end.code,'PHONE_INITIAL_APPROVAL_REQUIRED');
 assert.equal(f.reg.status(record).enrolled,false);
});
test('Secure56 approval readback unavailable fails closed',async()=>{
 const f=fixture({throwApproval:true});const e=await f.enroll();
 assert.equal(e.end.code,'PHONE_APPROVAL_READBACK_FAILED');
});
test('valid initial phone approval + key possession registers device',async()=>{
 const f=fixture();const e=await f.enroll();
 assert.equal(e.end.code,'DEVICE_TRUST_ACTIVE');
 assert.equal(e.end.deviceDigest,deviceDigest);
 assert.equal(f.reg.status(record).enrolled,true);
 assert.equal(e.end.expiresAt,f.now+DEVICE_TRUST_MAX_MS);
});
test('one enrollment approves two separate explicit signed photo commands, no more UI approvals',async()=>{
 const f=fixture();const e=await f.enroll();
 const a=f.reg.verifyPhotoIntent(f.command(e.kp));
 const b=f.reg.verifyPhotoIntent(f.command(e.kp));
 assert.equal(a.verdict,'VERIFIED');assert.equal(b.verdict,'VERIFIED');
 assert.equal(f.approvals,1);
});
test('exact photo intent cannot be replayed',async()=>{
 const f=fixture();const e=await f.enroll();const p=f.command(e.kp);
 assert.equal(f.reg.verifyPhotoIntent(p).verdict,'VERIFIED');
 assert.equal(f.reg.verifyPhotoIntent(p).code,'PHOTO_INTENT_REPLAY');
});
test('nonce reuse across different photo requests is refused even with new valid signature',async()=>{
 const f=fixture();const e=await f.enroll();const used=nonce();
 assert.equal(f.reg.verifyPhotoIntent(f.command(e.kp,{nonceValue:used})).verdict,'VERIFIED');
 assert.equal(f.reg.verifyPhotoIntent(f.command(e.kp,{nonceValue:used})).code,'PHOTO_INTENT_REPLAY');
});
test('signature cannot be reused for another request id',async()=>{
 const f=fixture();const e=await f.enroll();const p=f.command(e.kp);
 p.requestId=rid();p.approvalProof.requestId=p.requestId;
 assert.equal(f.reg.verifyPhotoIntent(p).code,'PHOTO_INTENT_SIGNATURE_INVALID');
});
test('signature cannot be reused for different JPEG digest',async()=>{
 const f=fixture();const e=await f.enroll();const p=f.command(e.kp);
 p.approvalProof.photoSha256='f'.repeat(64);
 assert.equal(f.reg.verifyPhotoIntent(p).code,'PHOTO_INTENT_SIGNATURE_INVALID');
});
test('wrong device claim fails',async()=>{
 const f=fixture();const e=await f.enroll();const p=f.command(e.kp);
 p.approvalProof.deviceDigest='e'.repeat(64);
 assert.equal(f.reg.verifyPhotoIntent(p).code,'PHOTO_INTENT_INVALID_OR_EXPIRED');
});
test('intent signed with a different private key fails',async()=>{
 const f=fixture();await f.enroll();const p=f.command(pair());
 assert.equal(f.reg.verifyPhotoIntent(p).code,'PHOTO_INTENT_SIGNATURE_INVALID');
});
test('different owner cannot use enrolled device',async()=>{
 const f=fixture();const e=await f.enroll();const wrong=verifiedGlassOwner(otherRecord,f.now).ownerId;
 assert.equal(f.reg.verifyPhotoIntent(f.command(e.kp,{owner:wrong})).code,'DEVICE_TRUST_REQUIRED');
});
test('too-old command denied',async()=>{
 const f=fixture();const e=await f.enroll();const p=f.command(e.kp,{time:f.now-PHOTO_INTENT_MAX_AGE_MS-1});
 assert.equal(f.reg.verifyPhotoIntent(p).code,'PHOTO_INTENT_INVALID_OR_EXPIRED');
});
test('future timestamp command denied',async()=>{
 const f=fixture();const e=await f.enroll();const p=f.command(e.kp,{time:f.now+10000});
 assert.equal(f.reg.verifyPhotoIntent(p).code,'PHOTO_INTENT_INVALID_OR_EXPIRED');
});
test('revoked device cannot issue more photo commands',async()=>{
 const f=fixture();const e=await f.enroll();
 assert.equal(f.reg.revoke(record).code,'DEVICE_TRUST_REVOKED');
 assert.equal(f.reg.verifyPhotoIntent(f.command(e.kp)).code,'DEVICE_TRUST_REQUIRED');
});
test('enrollment challenge has hard expiry and cannot be reused',async()=>{
 const f=fixture();const kp=pair(),a=f.reg.startEnrollment({accessRecord:record,deviceDigest,publicKeyBase64:kp.publicKeyBase64});
 f.advance(ENROLLMENT_MAX_MS);
 assert.equal((await f.reg.finishEnrollment({accessRecord:record,challenge:a.challenge,signature:'x'.repeat(100)})).code,'ENROLLMENT_NOT_AVAILABLE');
});
test('active device trust expires and requires new enrollment authorization',async()=>{
 const f=fixture();const e=await f.enroll();f.advance(DEVICE_TRUST_MAX_MS);
 assert.equal(f.reg.verifyPhotoIntent(f.command(e.kp)).code,'DEVICE_TRUST_REQUIRED');
});
test('another pending enrollment for same verified owner is refused',()=>{
 const f=fixture(),a=pair(),b=pair();
 assert.equal(f.reg.startEnrollment({accessRecord:record,deviceDigest,publicKeyBase64:a.publicKeyBase64}).ok,true);
 assert.equal(f.reg.startEnrollment({accessRecord:record,deviceDigest,publicKeyBase64:b.publicKeyBase64}).code,'ENROLLMENT_ALREADY_PENDING');
});
test('changing an enrolled key requires explicit device replacement approval',async()=>{
 const f=fixture();await f.enroll();const replacement=await f.enroll({kp:pair()});
 assert.equal(replacement.end.code,'DEVICE_REPLACEMENT_REAPPROVAL_REQUIRED');
});
test('explicitly approved device/key replacement succeeds',async()=>{
 const f=fixture({replacementApproved:true});const e=await f.enroll();
 const another=await f.enroll({kp:pair()});
 assert.equal(another.end.code,'DEVICE_TRUST_ACTIVE');
 assert.equal(f.reg.verifyPhotoIntent(f.command(e.kp)).code,'PHOTO_INTENT_SIGNATURE_INVALID');
 assert.equal(f.reg.verifyPhotoIntent(f.command(another.kp)).verdict,'VERIFIED');
});
test('a concurrent finish cannot consume one enrollment proof twice',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve);
 const f=fixture();const kp=pair(),a=f.reg.startEnrollment({accessRecord:record,deviceDigest,publicKeyBase64:kp.publicKeyBase64});
 const message=glassEnrollmentMessage({ownerId,serverDigest,deviceDigest,publicKeyDigest:a.publicKeyDigest,challenge:a.challenge});
 const signature=sign('sha256',Buffer.from(message),kp.privateKey).toString('base64url');
 // Real verifier status remains reserved once the first request starts; with a
 // slow verification callback two concurrent requests cannot both win.
 const p1=f.reg.finishEnrollment({accessRecord:record,challenge:a.challenge,signature});
 const p2=f.reg.finishEnrollment({accessRecord:record,challenge:a.challenge,signature});
 assert.equal((await p2).code,'ENROLLMENT_NOT_AVAILABLE');
 assert.equal((await p1).ok,true);
});
