import test from 'node:test';
import assert from 'node:assert/strict';
import { createGlassOwnerOAuthGate } from './owner-oauth-gate.mjs';

const PURPOSE = 'JH_GLASS_OAUTH_OWNER_BIND_V1';
const SERVER = 'd'.repeat(64);
const RESOURCE = 'https://jh-secure-bridge-fix4.onrender.com/mcp';
const CODE = {clientId: 'https://chatgpt.com/oauth/client.json',redirectUri:'https://chatgpt.com/connector_platform_oauth_redirect',challenge:'A'.repeat(43),resource:RESOURCE,expiresAt:130000};
const REQUEST = Object.freeze({
  response_type:'code', client_id:'https://chatgpt.com/oauth/client.json',
  redirect_uri:'https://chatgpt.com/connector_platform_oauth_redirect',
  code_challenge_method:'S256',code_challenge:'A'.repeat(43),
  resource:RESOURCE,state:'nonced-state',
});
const ID = 'A'.repeat(36);
let clock = 100_000;
let approvalCounter = 0;
function harness(override={}) {
  clock=100_000;
  const verified = async ({purpose, requestDigest,serverDigest})=>({
    verdict:'VERIFIED', purpose, requestDigest, serverDigest,
    signatureValid:true,localUserApproved:true,
    approvalId:(++approvalCounter).toString().padStart(36,'A'),
    ownerRef:'owner-binding:'+'k'.repeat(32),approvedAt:clock-1000,expiresAt:clock+30_000,
    ...override,
  });
  return { gate:createGlassOwnerOAuthGate({verifySecure56Approval:verified, serverDigest:SERVER,allowedResources:[RESOURCE],hmacKey:Buffer.alloc(32,0x55),now:()=>clock}), advance:(ms)=>{clock+=ms;} };
}
async function approved(gate, req=REQUEST) {
  const a=await gate.approve({oauthRequest:req,approvalReceipt:'opaque-phone-proof'});
  assert.equal(a.ok,true, JSON.stringify(a));return a.approval;
}
async function issued(gate, req=REQUEST) {
  const approval=await approved(gate,req);
  const bound=gate.bindCode({oauthRequest:req,approval,codeRecord:{...CODE,clientId:req.client_id,challenge:req.code_challenge}});
  assert.equal(bound.ok,true);
  const tokens=gate.issueFromCode({codeRecord:bound.record});assert.equal(tokens.ok,true);return tokens;
}
test('never authorizes without server verifier / 32-byte dedicated key',()=>{
  assert.throws(()=>createGlassOwnerOAuthGate({serverDigest:SERVER,allowedResources:[RESOURCE],hmacKey:Buffer.alloc(32)}));
  assert.throws(()=>createGlassOwnerOAuthGate({verifySecure56Approval:()=>true,serverDigest:SERVER,allowedResources:[RESOURCE],hmacKey:Buffer.alloc(2)}));
});
test('valid local signed approval binds a code and issues an owner subject',async()=>{
  const {gate}=harness();const t=await issued(gate);
  assert.match(t.accessRecord.subject,/^jhsub_[A-Za-z0-9_-]{43}$/);
  assert.equal(t.accessRecord.subject,t.refreshRecord.subject);
});
test('OAuth grant cannot be created from anonymous browser button alone',async()=>{
  const {gate}=harness({localUserApproved:false});
  assert.equal((await gate.approve({oauthRequest:REQUEST,approvalReceipt:null})).code,'OWNER_APPROVAL_UNVERIFIED');
});
test('false signature never yields subject',async()=>{
  const {gate}=harness({signatureValid:false});assert.equal((await gate.approve({oauthRequest:REQUEST,approvalReceipt:'x'})).ok,false);
});
test('expired phone grant denied',async()=>{
  const {gate}=harness({expiresAt:clock-1});assert.equal((await gate.approve({oauthRequest:REQUEST,approvalReceipt:'x'})).ok,false);
});
test('wrong server digest cannot be used',async()=>{
  const {gate}=harness({serverDigest:'e'.repeat(64)});assert.equal((await gate.approve({oauthRequest:REQUEST,approvalReceipt:'x'})).ok,false);
});
test('wrong OAuth request digest denied',async()=>{
  const {gate}=harness({requestDigest:'e'.repeat(64)});assert.equal((await gate.approve({oauthRequest:REQUEST,approvalReceipt:'x'})).ok,false);
});
test('code binding rejects changed redirect after approval',async()=>{
  const {gate}=harness();const approval=await approved(gate);
  const q={...REQUEST,redirect_uri:'https://chatgpt.com/connector/oauth/else'};
  assert.equal(gate.bindCode({oauthRequest:q,approval,codeRecord:CODE}).ok,false);
});
test('approval cannot be reused to bind two codes',async()=>{
  const {gate}=harness();const approval=await approved(gate);
  assert.equal(gate.bindCode({oauthRequest:REQUEST,approval,codeRecord:CODE}).ok,true);
  assert.equal(gate.bindCode({oauthRequest:REQUEST,approval,codeRecord:CODE}).ok,false);
});
test('fake approval object denied despite matching fields',()=>{
  const {gate}=harness();const a={requestDigest:'a',subject:'jhsub_fake',expiresAt:999999};
  assert.equal(gate.bindCode({oauthRequest:REQUEST,approval:a,codeRecord:CODE}).ok,false);
});
test('token cannot be minted by caller writing fake record',()=>{
  const {gate}=harness();
  assert.equal(gate.issueFromCode({codeRecord:{subject:'jhsub_fake',glassOwnerVerified:true}}).ok,false);
});
test('refresh rotates with same subject; previously used refresh rejected',async()=>{
  const {gate}=harness();const one=await issued(gate);const two=gate.rotateRefresh({refreshRecord:one.refreshRecord});
  assert.equal(two.ok,true);assert.equal(two.accessRecord.subject,one.accessRecord.subject);
  assert.equal(gate.rotateRefresh({refreshRecord:one.refreshRecord}).ok,false);
});
test('expired refresh record cannot be used',async()=>{
  const {gate,advance}=harness();const t=await issued(gate);
  advance(2_592_000_000);assert.equal(gate.rotateRefresh({refreshRecord:t.refreshRecord}).ok,false);
});
test('weak OAuth PKCE or wrong client rejected',async()=>{
  const {gate}=harness();const a=await gate.approve({oauthRequest:{...REQUEST,code_challenge:'bad'},approvalReceipt:'x'});
  const b=await gate.approve({oauthRequest:{...REQUEST,client_id:'https://attacker.example'},approvalReceipt:'x'});
  assert.equal(a.code,'OAUTH_REQUEST_INVALID');assert.equal(b.code,'OAUTH_REQUEST_INVALID');
});
test('replayed secure owner approval ID rejected',async()=>{
  const duplicateId='Z'.repeat(36);const {gate}=harness({approvalId:duplicateId});
  assert.equal((await gate.approve({oauthRequest:REQUEST,approvalReceipt:'x'})).ok,true);
  assert.equal((await gate.approve({oauthRequest:REQUEST,approvalReceipt:'x'})).code,'OWNER_APPROVAL_REPLAY');
});
test('different owner refs derive different subjects',async()=>{
  const {gate:a}=harness({ownerRef:'owner-binding:'+'x'.repeat(32)});
  const first=await issued(a);
  const {gate:b}=harness({ownerRef:'owner-binding:'+'y'.repeat(32)});
  const second=await issued(b);
  assert.notEqual(first.accessRecord.subject,second.accessRecord.subject);
});
test('verification exception fails closed without leaking proof',async()=>{
  const gate=createGlassOwnerOAuthGate({verifySecure56Approval:()=>{throw Error('private secret')},serverDigest:SERVER,allowedResources:[RESOURCE],hmacKey:Buffer.alloc(32,4)});
  const r=await gate.approve({oauthRequest:REQUEST,approvalReceipt:'sensitive-proof'});
  assert.deepEqual(r,{ok:false,code:'OWNER_APPROVAL_UNVERIFIED'});
});

test('different OAuth resource fails closed before requesting owner approval',async()=>{
 const {gate}=harness();
 const r=await gate.approve({oauthRequest:{...REQUEST,resource:'https://attacker.example/mcp'},approvalReceipt:'x'});
 assert.equal(r.code,'OAUTH_REQUEST_INVALID');
});
test('validated grant cannot be attached to a mismatched OAuth code record',async()=>{
 const {gate}=harness();const approval=await approved(gate);
 assert.equal(gate.bindCode({oauthRequest:REQUEST,approval,codeRecord:{...CODE,challenge:'B'.repeat(43)}}).code,'UNVERIFIED_CODE_BINDING');
});