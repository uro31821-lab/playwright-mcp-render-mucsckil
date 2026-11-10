import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { GlassPhotoMailbox } from './photo-mailbox.mjs';
import { createPhotoIngress } from './photo-ingress.mjs';
import { createGlassSession } from './photo-session.mjs';
import { createGlassOwnerOAuthGate } from './owner-oauth-gate.mjs';

const SERVER='d'.repeat(64);
const RESOURCE='https://jh-secure-bridge-fix4.onrender.com/mcp';
const REQUEST={response_type:'code', client_id:'https://chatgpt.com/oauth/client.json', redirect_uri:'https://chatgpt.com/connector_platform_oauth_redirect', code_challenge_method:'S256',code_challenge:'A'.repeat(43),resource:RESOURCE,state:'nonce-local-test'};
const CODE={clientId:REQUEST.client_id,redirectUri:REQUEST.redirect_uri,challenge:REQUEST.code_challenge,resource:REQUEST.resource,expiresAt:Date.now()+300000};
const jpeg=Buffer.concat([Buffer.from([255,216,255,224]),Buffer.alloc(48,11),Buffer.from([255,217])]);
let uid=0;

async function rig({transport=true,approval=true,decoder=true}={}) {
  const mailbox=new GlassPhotoMailbox();
  const gate=createGlassOwnerOAuthGate({serverDigest:SERVER,allowedResources:[RESOURCE],hmacKey:Buffer.alloc(32,5),
    verifySecure56Approval:async ({purpose,requestDigest,serverDigest,approvalReceipt})=>({verdict:'VERIFIED',purpose,requestDigest,serverDigest,signatureValid:true,localUserApproved:true,
      approvalId:'r'.repeat(24)+String(++uid), ownerRef:'owner-binding:'+String(approvalReceipt).padEnd(20,'a').slice(0,20),approvedAt:Date.now()-500,expiresAt:Date.now()+30000})
  });
  const session=createGlassSession({mailbox});
  const ingress=createPhotoIngress({mailbox,trustedTransport:()=>transport,approveRequest:()=>approval,validateJpeg:()=>decoder});
  const server=createServer(async(req,res)=>{
    try{const handled=await ingress(req,res);if(!handled){res.writeHead(404).end('not found')}}
    catch{if(!res.headersSent)res.writeHead(500).end('internal')}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {mailbox,gate,session,server,url:`http://127.0.0.1:${server.address().port}/jh-glass/v1/photo`,close:()=>new Promise(resolve=>server.close(()=>{mailbox.close();resolve()}))};
}
async function tokenFor(rig, who='ownerone') {
  const {approval}=await rig.gate.approve({oauthRequest:REQUEST,approvalReceipt:who});
  assert.ok(approval,'local test verifier should issue approval');
  const bound=rig.gate.bindCode({oauthRequest:REQUEST,approval,codeRecord:{...CODE,expiresAt:Date.now()+200000}});
  assert.equal(bound.ok,true);
  const records=rig.gate.issueFromCode({codeRecord:bound.record});
  assert.equal(records.ok,true);
  return records;
}
async function post(rig,token,buffer=jpeg) {
  return fetch(rig.url,{method:'POST',headers:{'Content-Type':'image/jpeg','Authorization':'Bearer '+token},body:buffer});
}

test('real localhost HTTP: signed owner approval -> pairing -> one image -> same owner consumes', async t=>{
  const r=await rig();t.after(r.close);
  const records=await tokenFor(r,'ownerone');const {pairingToken}=r.session.beginPairing(records.accessRecord);
  assert.equal(typeof pairingToken,'string');
  const resp=await post(r,pairingToken);assert.equal(resp.status,202);
  const received=await resp.json();assert.equal(received.code,'PHOTO_RECEIVED');
  const consumed=r.session.consume(records.accessRecord);assert.equal(consumed.ok,true);assert.deepEqual(consumed.imageBytes,jpeg);
  assert.equal(r.session.consume(records.accessRecord).code,'NO_PENDING_PHOTO');
});
test('HTTP transfer replay rejected and other owner cannot steal image',async t=>{
  const r=await rig();t.after(r.close);
  const alice=await tokenFor(r,'ownerone');const bob=await tokenFor(r,'ownertwo');
  const {pairingToken}=r.session.beginPairing(alice.accessRecord);
  assert.equal((await post(r,pairingToken)).status,202);
  assert.equal(r.session.consume(bob.accessRecord).code,'NO_PENDING_PHOTO');
  assert.equal((await post(r,pairingToken)).status,409);
  assert.equal(r.session.consume(alice.accessRecord).ok,true);
});
test('HTTP denies over-limit image even with valid pairing',async t=>{
  const r=await rig();t.after(r.close);const alice=await tokenFor(r);
  const {pairingToken}=r.session.beginPairing(alice.accessRecord);
  const body=Buffer.alloc(2*1024*1024+1,5);const resp=await post(r,pairingToken,body);
  assert.equal(resp.status,413);assert.equal(r.session.consume(alice.accessRecord).ok,false);
});
test('HTTP fails closed when transport trust is absent',async t=>{
  const r=await rig({transport:false});t.after(r.close);const alice=await tokenFor(r);
  const {pairingToken}=r.session.beginPairing(alice.accessRecord);
  assert.equal((await post(r,pairingToken)).status,403);
});
test('HTTP fails closed when image decoder rejects bytes',async t=>{
  const r=await rig({decoder:false});t.after(r.close);const alice=await tokenFor(r);
  const {pairingToken}=r.session.beginPairing(alice.accessRecord);
  const resp=await post(r,pairingToken);assert.equal(resp.status,422);
  assert.equal(r.session.consume(alice.accessRecord).code,'NO_PENDING_PHOTO');
});
test('OAuth refresh preserves photo owner after owner approval',async t=>{
  const r=await rig();t.after(r.close);const alice=await tokenFor(r);
  const rotated=r.gate.rotateRefresh({refreshRecord:alice.refreshRecord});assert.equal(rotated.ok,true);
  const {pairingToken}=r.session.beginPairing(rotated.accessRecord);
  assert.equal((await post(r,pairingToken)).status,202);
  assert.equal(r.session.consume(alice.accessRecord).ok,true);
});