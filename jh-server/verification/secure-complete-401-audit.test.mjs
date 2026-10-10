import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyCompletionRejection,makeCompletionRejectionAudit} from '../owner-setup/deployment/secure-complete-401-audit.mjs';
test('all Secure56 completion gate labels are fixed and prioritized',()=>{
 const expected=[
 ['sessionAbsent','active_secure_session_absent'],
 ['jobSessionMismatch','job_secure_session_mismatch'],
 ['activeSessionMismatch','active_secure_session_mismatch'],
 ['deviceMismatch','secure_device_digest_mismatch'],
 ['bodyMismatch','result_body_digest_mismatch'],
 ['nonceInvalid','completion_nonce_format_invalid'],
 ['expired','completion_expired'],
 ['tooFar','completion_expiry_out_of_range'],
 ['signatureMismatch','completion_signature_mismatch'],
 ['nonceReplayed','completion_nonce_replayed']
 ];
 for(const [key,label] of expected)assert.equal(classifyCompletionRejection({[key]:true}),label);
 assert.equal(classifyCompletionRejection({signatureMismatch:true,nonceReplayed:true}), 'completion_signature_mismatch');
 assert.equal(classifyCompletionRejection({sessionAbsent:true,nonceReplayed:true}),'active_secure_session_absent');
 assert.equal(classifyCompletionRejection({untrustedText:'SECRET'}),'completion_reason_unclassified');
});
test('no device names, job IDs, MAC, nonce, request content or supplied metadata leaks',()=>{
 const sent=[];const observer=makeCompletionRejectionAudit({sink:x=>sent.push(x),now:()=>1791628000000});
 observer({signatureMismatch:true,deviceId:'PRIVATE_DEVICE',nonce:'SECRET_NONCE',jobId:'job_123',text:'SECRET_TEXT',mac:'MAC_PRIVATE'});
 assert.equal(sent.length,1);
 assert.deepEqual(Object.keys(sent[0]).sort(),['atUtc','event','reason','schema','suppressedSinceLastRecord']);
 assert.equal(sent[0].reason,'completion_signature_mismatch');
 for(const secret of ['PRIVATE_DEVICE','SECRET_NONCE','job_123','SECRET_TEXT','MAC_PRIVATE'])assert.ok(!JSON.stringify(sent).includes(secret));
});
test('bounded categorical diagnostic does not change rejection even if logger throws',()=>{
 const observer=makeCompletionRejectionAudit({sink:()=>{throw Error('logging down')}});
 assert.doesNotThrow(()=>observer({bodyMismatch:true}));
});
test('diagnostics cap emitted records to 24 per minute and count suppressed',()=>{
 let stamp=1791628000000;const sent=[];const observer=makeCompletionRejectionAudit({sink:x=>sent.push(x),now:()=>stamp});
 for(let i=0;i<500;i++)observer({nonceReplayed:true});
 assert.equal(sent.length,24);
 stamp+=60000;observer({signatureMismatch:true});
 assert.equal(sent.at(-1).reason,'completion_signature_mismatch');
 assert.equal(sent.at(-1).suppressedSinceLastRecord,476);
});
