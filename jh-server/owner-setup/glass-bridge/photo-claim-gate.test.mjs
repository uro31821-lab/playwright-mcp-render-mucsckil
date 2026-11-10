import test from 'node:test';
import assert from 'node:assert/strict';
import {createPhotoClaimGate} from './photo-claim-gate.mjs';
const alice={scope:'jh.secure',subject:'jhsub_AAAAAAAAAAAAAAAAAAAAAA',expiresAt:200000,glassOwnerVerified:true};
const bob={...alice,subject:'jhsub_BBBBBBBBBBBBBBBBBBBBBB'};
let serial=0;
function tok32(){return Buffer.alloc(32,++serial).toString('base64url')}
function tok24(){return Buffer.alloc(24,++serial).toString('base64url')}
function fixture(approver=({requestId,expectedOwnerId})=>({verdict:'VERIFIED',requestId,ownerId:expectedOwnerId})){
  let time=100000, calls=0;
  const state=new Map(),owner=rec=>rec.subject;
  const photoSession={
    beginPairing(record){if(state.get(owner(record))?.photo)return {ok:false,code:'PHOTO_PENDING'};const pairingToken=tok32();state.set(owner(record),{pairingToken,photo:false});return {ok:true,pairingToken,expiresAt:time+90000};},
    consume(record){const item=state.get(owner(record));if(!item?.photo)return {ok:false,code:'NO_PENDING_PHOTO'};state.delete(owner(record));return {ok:true,contentType:'image/jpeg',imageBytes:Buffer.from('photo')};},
    status(record){return {ok:true,photoPending:state.get(owner(record))?.photo===true}}
  };
  const gate=createPhotoClaimGate({photoSession,now:()=>time,makeClaimToken:tok32,makeRequestId:tok24,verifyPhoneApproval:async args=>{calls++;return approver(args)}});
  return {gate,advance:n=>time+=n,upload:r=>{if(state.get(owner(r)))state.get(owner(r)).photo=true;},state,getCallCount:()=>calls};
}

test('chat begin never exposes phone pairing bearer',()=>{const f=fixture();const b=f.gate.beginForChat(alice);assert.equal(b.ok,true);assert.equal(b.chatClaimToken.length,43);assert.equal(b.requestId.length,32);assert.equal('pairingToken' in b,false);assert.equal(JSON.stringify(b).includes('PHONE_PAIRING_READY'),false);});
test('phone must have a verified local approval before seeing upload token',async()=>{const f=fixture(()=>({verdict:'DENIED'}));const b=f.gate.beginForChat(alice);const p=await f.gate.deliverToApprovedPhone({requestId:b.requestId,approvalProof:{}});assert.equal(p.code,'PHONE_APPROVAL_UNVERIFIED');assert.equal('pairingToken' in p,false);});
test('phone with owner-matched approval gets bearer exactly once',async()=>{const f=fixture();const b=f.gate.beginForChat(alice);const x=await f.gate.deliverToApprovedPhone({requestId:b.requestId});assert.equal(x.ok,true);assert.equal(x.pairingToken.length,43);assert.equal((await f.gate.deliverToApprovedPhone({requestId:b.requestId})).code,'PHONE_PAIRING_ALREADY_DELIVERED');});
test('phone with wrong owner rejected even when verifier says VERIFIED',async()=>{const f=fixture(({requestId})=>({verdict:'VERIFIED',requestId,ownerId:'owner:other'}));const b=f.gate.beginForChat(alice);assert.equal((await f.gate.deliverToApprovedPhone({requestId:b.requestId})).code,'PHONE_APPROVAL_UNVERIFIED');});
test('phone request with wrong requestId rejected',async()=>{const f=fixture();f.gate.beginForChat(alice);assert.equal((await f.gate.deliverToApprovedPhone({requestId:tok24()})).code,'PHONE_REQUEST_NOT_FOUND');});
test('phone verification errors fail closed without leaking bearer',async()=>{const f=fixture(()=>{throw Error('unavailable')});const b=f.gate.beginForChat(alice);const x=await f.gate.deliverToApprovedPhone({requestId:b.requestId});assert.equal(x.code,'PHONE_APPROVAL_UNAVAILABLE');assert.equal(x.pairingToken,undefined);});
test('expired phone pairing request blocked',async()=>{const f=fixture();const b=f.gate.beginForChat(alice);f.advance(90000);assert.equal((await f.gate.deliverToApprovedPhone({requestId:b.requestId})).code,'PHONE_PAIRING_EXPIRED');});
test('another chat for same owner without claim cannot see image or status',()=>{const f=fixture();const b=f.gate.beginForChat(alice);f.upload(alice);assert.equal(f.gate.consumeForChat(alice).code,'CHAT_CLAIM_INVALID');assert.equal(f.gate.statusForChat(alice).code,'CHAT_CLAIM_INVALID');assert.equal(f.gate.consumeForChat(alice,b.chatClaimToken).ok,true);});
test('different OAuth owner cannot consume claim for other owner',()=>{const f=fixture();const b=f.gate.beginForChat(alice);f.upload(alice);assert.equal(f.gate.consumeForChat(bob,b.chatClaimToken).ok,false);assert.equal(f.gate.consumeForChat(alice,b.chatClaimToken).ok,true);});
test('wrong chat claim is rejected and correct one still works',()=>{const f=fixture();const b=f.gate.beginForChat(alice);f.upload(alice);assert.equal(f.gate.consumeForChat(alice,tok32()).code,'CHAT_CLAIM_INVALID');assert.equal(f.gate.consumeForChat(alice,b.chatClaimToken).ok,true);});
test('chat claim is one-use after consuming photo',()=>{const f=fixture();const b=f.gate.beginForChat(alice);f.upload(alice);assert.equal(f.gate.consumeForChat(alice,b.chatClaimToken).ok,true);assert.equal(f.gate.consumeForChat(alice,b.chatClaimToken).code,'CHAT_CLAIM_REQUIRED');});
test('pending photo can be waited for while claim stays valid',()=>{const f=fixture();const b=f.gate.beginForChat(alice);assert.equal(f.gate.statusForChat(alice,b.chatClaimToken).photoPending,false);assert.equal(f.gate.consumeForChat(alice,b.chatClaimToken).code,'NO_PENDING_PHOTO');f.upload(alice);assert.equal(f.gate.statusForChat(alice,b.chatClaimToken).photoPending,true);assert.equal(f.gate.consumeForChat(alice,b.chatClaimToken).ok,true);});
test('expired chat claim blocks photo access',()=>{const f=fixture();const b=f.gate.beginForChat(alice);f.upload(alice);f.advance(90000);assert.equal(f.gate.consumeForChat(alice,b.chatClaimToken).code,'CHAT_CLAIM_EXPIRED');});
test('new pairing revokes older chat claim',()=>{const f=fixture();const a=f.gate.beginForChat(alice),b=f.gate.beginForChat(alice);f.upload(alice);assert.equal(f.gate.consumeForChat(alice,a.chatClaimToken).code,'CHAT_CLAIM_INVALID');assert.equal(f.gate.consumeForChat(alice,b.chatClaimToken).ok,true);});
test('scope-only and unapproved OAuth records cannot begin',()=>{const f=fixture();assert.equal(f.gate.beginForChat({scope:'jh.secure',expiresAt:200000}).code,'GLASS_OWNER_APPROVAL_REQUIRED');assert.equal(f.gate.beginForChat({...alice,glassOwnerVerified:false}).code,'GLASS_OWNER_APPROVAL_REQUIRED');});
test('expired OAuth record cannot consume',()=>{const f=fixture();const b=f.gate.beginForChat(alice);f.upload(alice);assert.equal(f.gate.consumeForChat({...alice,expiresAt:100000},b.chatClaimToken).code,'OAUTH_ACCESS_EXPIRED');assert.equal(f.gate.consumeForChat(alice,b.chatClaimToken).ok,true);});
test('refresh still works when verified subject is unchanged',()=>{const f=fixture();const b=f.gate.beginForChat(alice);f.upload(alice);assert.equal(f.gate.consumeForChat({...alice,expiresAt:300000},b.chatClaimToken).ok,true);});
test('invalid deps fail closed at construction',()=>{assert.throws(()=>createPhotoClaimGate({photoSession:{},verifyPhoneApproval:()=>true}),TypeError);assert.throws(()=>createPhotoClaimGate({photoSession:{beginPairing(){},consume(){},status(){}}}),TypeError);});
test('invalid token generators fail before opening photo session',()=>{const f=fixture();assert.equal(createPhotoClaimGate({photoSession:{beginPairing(){throw Error('should not run')},consume(){},status(){}},verifyPhoneApproval:()=>true,now:()=>100000,makeClaimToken:()=>"bad"}).beginForChat(alice).code,'RANDOM_TOKEN_GENERATION_FAILED');});
test('claim lifetime cannot exceed pairing 90sec bound',()=>{assert.throws(()=>createPhotoClaimGate({photoSession:{beginPairing(){},consume(){},status(){}},verifyPhoneApproval:()=>true,claimTtlMs:90001}),TypeError);});
test('gate close revokes outstanding chat claim',()=>{const f=fixture();const b=f.gate.beginForChat(alice);f.upload(alice);f.gate.close();assert.equal(f.gate.consumeForChat(alice,b.chatClaimToken).code,'CHAT_CLAIM_REQUIRED');});

test('phone approval result arriving after newer pairing cannot release old token',async()=>{
 let release,expectedOwnerId; const f=fixture((args)=>{expectedOwnerId=args.expectedOwnerId;return new Promise(r=>release=r)});
 const a=f.gate.beginForChat(alice);
 const pending=f.gate.deliverToApprovedPhone({requestId:a.requestId});
 const b=f.gate.beginForChat(alice);
 release({verdict:'VERIFIED',requestId:a.requestId,ownerId:expectedOwnerId});
 const v=await pending;assert.equal(v.ok,false);assert.equal(v.pairingToken,undefined);assert.equal(b.ok,true);
});
test('concurrent delivery cannot distribute same bearer twice',async()=>{
 let release,expectedOwnerId;const f=fixture((args)=>{expectedOwnerId=args.expectedOwnerId;return new Promise(r=>release=r)});
 const b=f.gate.beginForChat(alice);
 const a=f.gate.deliverToApprovedPhone({requestId:b.requestId});
 const second=await f.gate.deliverToApprovedPhone({requestId:b.requestId});
 assert.equal(second.code,'PHONE_PAIRING_ALREADY_DELIVERED');
 // Verify the approval still cannot deliver if gate was closed midflight.
 f.gate.close();release({verdict:'VERIFIED',requestId:b.requestId,ownerId:expectedOwnerId});
 const first=await a;assert.equal(first.ok,false);
});