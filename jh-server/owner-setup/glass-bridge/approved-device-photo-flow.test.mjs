import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { GlassPhotoMailbox } from './photo-mailbox.mjs';
import { createGlassSession } from './photo-session.mjs';
import { createPhotoClaimGate } from './photo-claim-gate.mjs';
import { createApprovedGlassDeviceRegistry, glassEnrollmentMessage, glassPhotoIntentMessage } from './approved-device-session.mjs';
import { verifiedGlassOwner } from './verified-owner.mjs';

const serverDigest='a'.repeat(64),deviceDigest='b'.repeat(64);
const accessRecord={scope:'jh.secure',subject:'jhsub_AAAAAAAAAAAAAAAAAAAAAA',expiresAt:1_000_000,glassOwnerVerified:true};
const otherRecord={...accessRecord,subject:'jhsub_BBBBBBBBBBBBBBBBBBBBBB'};
const jpeg=Buffer.concat([Buffer.from([255,216,255,224]),Buffer.alloc(64,18),Buffer.from([255,217])]);
const jpegOther=Buffer.concat([Buffer.from([255,216,255,224]),Buffer.alloc(64,99),Buffer.from([255,217])]);
const digest=x=>createHash('sha256').update(x).digest('hex');
const b64=x=>x.toString('base64url');
let clock=100000;

async function fixture() {
 let approvals=0;
 let now=100000;
 const keypair=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 const pub=b64(keypair.publicKey.export({format:'der',type:'spki'}));
 const ownerId=verifiedGlassOwner(accessRecord,now).ownerId;
 const registry=createApprovedGlassDeviceRegistry({serverDigest,now:()=>now,
   verifySecure56Enrollment:async r=>{
     approvals++;
     return {verdict:'VERIFIED',localUserApproved:true,secureCompletionVerified:true,
       ownerId:r.ownerId,deviceDigest:r.deviceDigest,publicKeyDigest:r.publicKeyDigest,
       challenge:r.challenge,serverDigest:r.serverDigest};
   }});
 const enroll=registry.startEnrollment({accessRecord,deviceDigest,publicKeyBase64:pub});
 const sig=b64(sign('sha256',Buffer.from(glassEnrollmentMessage({ownerId,serverDigest,deviceDigest,
   publicKeyDigest:enroll.publicKeyDigest,challenge:enroll.challenge})),keypair.privateKey));
 const activated=await registry.finishEnrollment({accessRecord,challenge:enroll.challenge,signature:sig,approvalProof:{}});
 assert.equal(activated.ok,true);
 const box=new GlassPhotoMailbox({now:()=>now,cleanupIntervalMs:0});
 const session=createGlassSession({mailbox:box,now:()=>now});
 const claim=createPhotoClaimGate({photoSession:session,verifyPhoneApproval:registry.verifyPhotoIntent,now:()=>now});
 const request=()=>claim.beginForChat(accessRecord);
 const signed=(requestId,bytes=jpeg,options={})=>{
   const owner=options.ownerId??ownerId;
   const rid=options.requestId??requestId;
   const nonce=b64(randomBytes(24)),issuedAt=now,photoSha256=digest(bytes);
   const msg=glassPhotoIntentMessage({ownerId:owner,serverDigest,deviceDigest,requestId:rid,
      photoSha256,issuedAt,nonce});
   return {requestId:rid,deviceDigest,photoSha256,nonce,issuedAt,
      signature:b64(sign('sha256',Buffer.from(msg),keypair.privateKey))};
 };
 return {box,session,claim,registry,request,signed,ownerId,
    get approvals(){return approvals},advance:n=>{now+=n}};
}

test('one enrollment, two user-initiated photos, zero extra phone approval prompts',async()=>{
 const f=await fixture();
 for(let i=0;i<2;i++){
   const r=f.request();assert.equal(r.ok,true);
   assert.equal('pairingToken' in r,false);
   const proof=f.signed(r.requestId);
   const phone=await f.claim.deliverToApprovedPhone({requestId:r.requestId,approvalProof:proof});
   assert.equal(phone.code,'PHONE_PAIRING_READY');
   const recv=f.box.receivePhoto({pairingToken:phone.pairingToken,contentType:'image/jpeg',imageBytes:jpeg});
   assert.equal(recv.ok,true);
   const result=f.claim.consumeForChat(accessRecord,r.chatClaimToken);
   assert.equal(result.ok,true);assert.deepEqual(result.imageBytes,jpeg);
 }
 assert.equal(f.approvals,1);
});
test('another same-owner chat without the chat claim cannot consume photo',async()=>{
 const f=await fixture(),r=f.request(),p=f.signed(r.requestId);
 const phone=await f.claim.deliverToApprovedPhone({requestId:r.requestId,approvalProof:p});
 f.box.receivePhoto({pairingToken:phone.pairingToken,contentType:'image/jpeg',imageBytes:jpeg});
 assert.equal(f.claim.consumeForChat(accessRecord,'A'.repeat(43)).code,'CHAT_CLAIM_INVALID');
 assert.equal(f.claim.consumeForChat(accessRecord,r.chatClaimToken).ok,true);
});
test('photo digest signed for one JPEG cannot be swapped to a different JPEG before GPT consumption',async()=>{
 const f=await fixture(),r=f.request();
 const p=await f.claim.deliverToApprovedPhone({requestId:r.requestId,approvalProof:f.signed(r.requestId,jpeg)});
 assert.equal(p.ok,true);
 f.box.receivePhoto({pairingToken:p.pairingToken,contentType:'image/jpeg',imageBytes:jpegOther});
 const result=f.claim.consumeForChat(accessRecord,r.chatClaimToken);
 assert.equal(result.code,'SIGNED_PHOTO_DIGEST_MISMATCH');
 assert.equal(f.claim.consumeForChat(accessRecord,r.chatClaimToken).ok,false);
});
test('failed/forged photo signature cannot receive server upload bearer',async()=>{
 const f=await fixture(),r=f.request(),proof=f.signed(r.requestId);
 proof.photoSha256='f'.repeat(64);
 const p=await f.claim.deliverToApprovedPhone({requestId:r.requestId,approvalProof:proof});
 assert.equal(p.ok,false);
 assert.equal('pairingToken' in p,false);
});
test('device trust revoked blocks the next signed photo even if chat has a claim',async()=>{
 const f=await fixture(),r=f.request();
 assert.equal(f.registry.revoke(accessRecord).code,'DEVICE_TRUST_REVOKED');
 const p=await f.claim.deliverToApprovedPhone({requestId:r.requestId,approvalProof:f.signed(r.requestId)});
 assert.equal(p.ok,false);
 assert.equal('pairingToken' in p,false);
});
test('an unverified OAuth token cannot open a new photo claim',async()=>{
 const f=await fixture();
 assert.equal(f.claim.beginForChat({...accessRecord,glassOwnerVerified:false}).ok,false);
});
test('different OAuth subject cannot consume an existing photo claim',async()=>{
 const f=await fixture(),r=f.request(),p=f.signed(r.requestId);
 const phone=await f.claim.deliverToApprovedPhone({requestId:r.requestId,approvalProof:p});
 f.box.receivePhoto({pairingToken:phone.pairingToken,contentType:'image/jpeg',imageBytes:jpeg});
 assert.equal(f.claim.consumeForChat(otherRecord,r.chatClaimToken).ok,false);
 assert.equal(f.claim.consumeForChat(accessRecord,r.chatClaimToken).ok,true);
});
test('one signed photo intent cannot be reused to mint another upload token',async()=>{
 const f=await fixture(),r=f.request(),proof=f.signed(r.requestId);
 const ok=await f.claim.deliverToApprovedPhone({requestId:r.requestId,approvalProof:proof});
 assert.equal(ok.ok,true);
 assert.equal((await f.claim.deliverToApprovedPhone({requestId:r.requestId,approvalProof:proof})).ok,false);
});
