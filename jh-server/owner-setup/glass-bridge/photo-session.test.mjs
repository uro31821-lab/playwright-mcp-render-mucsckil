import test from 'node:test';
import assert from 'node:assert/strict';
import { GlassPhotoMailbox } from './photo-mailbox.mjs';
import { createGlassSession } from './photo-session.mjs';
const now=100000;
const alice={scope:'jh.secure',expiresAt:200000,subject:'jhsub_AAAAAAAAAAAAAAAAAAAAAA'};
const bob={...alice,subject:'jhsub_BBBBBBBBBBBBBBBBBBBBBB'};
const jpeg=Buffer.concat([Buffer.from([0xff,0xd8,0xff,0xe0]),Buffer.alloc(36),Buffer.from([0xff,0xd9])]);
function fixture(){const mailbox=new GlassPhotoMailbox({now:()=>now});return {mailbox,session:createGlassSession({mailbox,now:()=>now})}}
test('scope-only OAuth token cannot begin a photo session',()=>{
 const {session}=fixture();assert.equal(session.beginPairing({scope:'jh.secure',expiresAt:200000}).code,'OAUTH_STABLE_SUBJECT_MISSING');
});
test('token from another owner cannot consume the image',()=>{
 const {mailbox,session}=fixture();const pair=session.beginPairing(alice);
 assert.equal(mailbox.receivePhoto({pairingToken:pair.pairingToken,contentType:'image/jpeg',imageBytes:jpeg}).ok,true);
 assert.equal(session.consume(bob).code,'NO_PENDING_PHOTO');assert.equal(session.consume(alice).ok,true);
});
test('same authenticated subject can read after access-token refresh',()=>{
 const {mailbox,session}=fixture();const pair=session.beginPairing(alice);
 mailbox.receivePhoto({pairingToken:pair.pairingToken,contentType:'image/jpeg',imageBytes:jpeg});
 const rotated={...alice,expiresAt:300000};assert.equal(session.consume(rotated).ok,true);
});
test('expired OAuth access cannot read pairing or image',()=>{
 const {mailbox,session}=fixture();const pair=session.beginPairing(alice);
 mailbox.receivePhoto({pairingToken:pair.pairingToken,contentType:'image/jpeg',imageBytes:jpeg});
 assert.equal(session.consume({...alice,expiresAt:now}).code,'OAUTH_ACCESS_EXPIRED');
 assert.equal(session.consume(alice).ok,true);
});
test('caller-provided subject/owner without trusted auth record is rejected',()=>{
 const {session}=fixture();assert.equal(session.consume('owner:jhprimary').code,'OAUTH_PRINCIPAL_REQUIRED');
});
