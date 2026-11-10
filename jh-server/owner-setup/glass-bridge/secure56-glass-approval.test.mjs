import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { glassApprovalMessage,createSecure56GlassApprovalVerifier } from './secure56-glass-approval.mjs';
import { createGlassOwnerOAuthGate, oauthRequestDigest } from './owner-oauth-gate.mjs';

const serverDigest='a'.repeat(64), requestDigest='b'.repeat(64), devDigest='c'.repeat(64);
const PURPOSE='JH_GLASS_OAUTH_OWNER_BIND_V1';
const now=100000;
const key=Buffer.alloc(32,0x3d);
let testSeq=1;
function scenario({sessionFields={},jobFields={},ownerFields={},receiptFields={},verifyOverrides={}}={}){
 const r={ purpose:PURPOSE,deviceId:'meta-phone-001',sessionId:'s'.repeat(32),deviceDigest:devDigest,
 jobId:'j'.repeat(32),approvalId:('a'.repeat(30)+String(testSeq++).padStart(4,'0')),
 requestDigest,serverDigest, approvedAt:now-1000,expiresAt:now+50000,localUserApproved:true,...receiptFields};
 r.mac=createHmac('sha256',key).update(glassApprovalMessage(r)).digest('hex');
 const session={sessionId:r.sessionId,deviceDigest:devDigest,secret:key,expiresAt:now+50000,...sessionFields};
 const job={jobId:r.jobId,approvalId:r.approvalId,type:'glass_owner_oauth_bind',status:'complete',secureCompletionVerified:true,localApprovalVerified:true,
 deviceDigest:devDigest,sessionId:r.sessionId,requestDigest,...jobFields};
 const owner={ownerRef:'owner-binding:'+'x'.repeat(28),accountLinked:true,verifiedFor:'owner_account',deviceDigest:devDigest,expiresAt:now+60000,...ownerFields};
 const verifier=createSecure56GlassApprovalVerifier({getActiveSession:async()=>session,getApprovedJob:async()=>job,getVerifiedOwnerBinding:async()=>owner,now:()=>now});
 return {verifier,r,context:{approvalReceipt:r,purpose:PURPOSE,requestDigest,serverDigest,...verifyOverrides}};
}
const verdict=async(s)=> (await s.verifier(s.context)).code || 'VERIFIED';

test('real signed active-session proof + verified phone job + account binding pass',async()=>{
 const s=scenario();const v=await s.verifier(s.context);assert.equal(v.verdict,'VERIFIED');assert.equal(v.signatureValid,true);
 assert.match(v.ownerRef,/^owner-binding:/);
});
test('replay fails, even if signature is valid',async()=>{
 const s=scenario();await s.verifier(s.context);assert.equal(await verdict(s),'APPROVAL_REPLAY');
});
test('fake MAC fails',async()=>{
 const s=scenario();s.r.mac='0'.repeat(64);assert.equal(await verdict(s),'SIGNATURE_INVALID');
});
test('wrong active secure session fails',async()=>{
 const s=scenario({sessionFields:{sessionId:'wrong-session'}});assert.equal(await verdict(s),'SECURE_SESSION_UNVERIFIED');
});
test('expired secure session fails',async()=>{
 const s=scenario({sessionFields:{expiresAt:now-1}});assert.equal(await verdict(s),'SECURE_SESSION_UNVERIFIED');
});
test('generic screen consent job cannot authorize photo',async()=>{
 const s=scenario({jobFields:{type:'screen_consent'}});assert.equal(await verdict(s),'PHONE_LOCAL_JOB_UNVERIFIED');
});
test('server job without verified on-phone local tap fails',async()=>{
 const s=scenario({jobFields:{localApprovalVerified:false}});assert.equal(await verdict(s),'PHONE_LOCAL_JOB_UNVERIFIED');
});
test('server job without signed completion fails',async()=>{
 const s=scenario({jobFields:{secureCompletionVerified:false}});assert.equal(await verdict(s),'PHONE_LOCAL_JOB_UNVERIFIED');
});
test('device-only binding is not an account binding',async()=>{
 const s=scenario({ownerFields:{verifiedFor:'device_only'}});assert.equal(await verdict(s),'ACCOUNT_OWNER_BINDING_MISSING');
});
test('unlinked device fails even if proof signature is valid',async()=>{
 const s=scenario({ownerFields:{accountLinked:false}});assert.equal(await verdict(s),'ACCOUNT_OWNER_BINDING_MISSING');
});
test('wrong user account device digest fails',async()=>{
 const s=scenario({ownerFields:{deviceDigest:'f'.repeat(64)}});assert.equal(await verdict(s),'ACCOUNT_OWNER_BINDING_MISSING');
});
test('expired owner linking fails',async()=>{
 const s=scenario({ownerFields:{expiresAt:now-1}});assert.equal(await verdict(s),'ACCOUNT_OWNER_BINDING_MISSING');
});
test('expired signed consent fails at parsing boundary',async()=>{
 const s=scenario({receiptFields:{expiresAt:now-1}});assert.equal(await verdict(s),'INVALID_OR_EXPIRED_APPROVAL');
});
test('different OAuth request cannot reuse signed consent',async()=>{
 const s=scenario({verifyOverrides:{requestDigest:'f'.repeat(64)}});assert.equal(await verdict(s),'INVALID_OR_EXPIRED_APPROVAL');
});
test('callback errors deny rather than bypass',async()=>{
 const s=createSecure56GlassApprovalVerifier({getActiveSession:()=>{throw Error('down')},getApprovedJob:()=>null,getVerifiedOwnerBinding:()=>null,now:()=>now});
 const x=scenario().context;assert.equal((await s(x)).code,'TRUSTED_READBACK_UNAVAILABLE');
});
test('invalid verifier dependencies cannot create a verifier',()=>{
 assert.throws(()=>createSecure56GlassApprovalVerifier({getActiveSession:null}));
});
test('direct integration: signed approval + verified account gives OAuth owner subject',async()=>{
 const oauth={response_type:'code',client_id:'https://chatgpt.com/oauth/client.json',redirect_uri:'https://chatgpt.com/connector_platform_oauth_redirect',
 code_challenge_method:'S256',code_challenge:'A'.repeat(43),resource:'https://jh-secure-bridge-fix4.onrender.com/mcp',state:'secure56'};
 const s=scenario({receiptFields:{requestDigest:oauthRequestDigest(oauth,[oauth.resource])}});
 const verifier=createSecure56GlassApprovalVerifier({getActiveSession:async()=>({sessionId:s.r.sessionId,deviceDigest:devDigest,secret:key,expiresAt:now+60000}),
 getApprovedJob:async()=>({jobId:s.r.jobId,approvalId:s.r.approvalId,type:'glass_owner_oauth_bind',status:'complete',secureCompletionVerified:true,localApprovalVerified:true,deviceDigest:devDigest,sessionId:s.r.sessionId,requestDigest:s.r.requestDigest}),
 getVerifiedOwnerBinding:async()=>({ownerRef:'owner-binding:'+'x'.repeat(28),accountLinked:true,verifiedFor:'owner_account',deviceDigest:devDigest,expiresAt:now+60000}),now:()=>now});
 const authority=createGlassOwnerOAuthGate({verifySecure56Approval:verifier,serverDigest,allowedResources:[oauth.resource],hmacKey:Buffer.alloc(32,5),now:()=>now});
 const x=await authority.approve({oauthRequest:oauth,approvalReceipt:s.r});assert.equal(x.ok,true);
 const bound=authority.bindCode({approval:x.approval,oauthRequest:oauth,codeRecord:{clientId:oauth.client_id,redirectUri:oauth.redirect_uri,challenge:oauth.code_challenge,resource:oauth.resource,expiresAt:now+60000}});
 assert.equal(bound.ok,true);const tokens=authority.issueFromCode({codeRecord:bound.record});assert.equal(tokens.ok,true);
 assert.match(tokens.accessRecord.subject,/^jhsub_[A-Za-z0-9_-]{43}$/);
});