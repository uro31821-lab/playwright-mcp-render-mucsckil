import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyCompletionRejection,makeCompletionRejectionAudit,getSecureCompletion401Summary} from '../owner-setup/deployment/secure-complete-401-audit.mjs';
const fixedLabels=['active_secure_session_absent','job_secure_session_mismatch','active_secure_session_mismatch','secure_device_digest_mismatch','result_body_digest_mismatch','completion_nonce_format_invalid','completion_expired','completion_expiry_out_of_range','completion_signature_mismatch','completion_nonce_replayed','completion_reason_unclassified'];
test('initial singleton starts at zero, without claiming historical knowledge',()=>{
 const a=getSecureCompletion401Summary();assert.equal(a.scope,'current_server_process_only');
 assert.equal(a.total,0);assert.equal(a.persisted,false);assert.equal(a.historicalCauseKnown,false);
 assert.deepEqual(Object.keys(a.byReason),fixedLabels);
});
test('count every invalid completion even when logger rate-limits',()=>{
 let t=1791620000000;const logs=[];const capture=makeCompletionRejectionAudit({sink:x=>logs.push(x),now:()=>t,limit:2});
 for(let i=0;i<7;i++)capture({nonceReplayed:true,deviceId:'SECRET_DEVICE',jobId:'jobSECRET',mac:'SECRET_MAC'});
 const summary=capture.summary();
 assert.equal(summary.total,7);assert.equal(summary.byReason.completion_nonce_replayed,7);
 assert.equal(summary.lastReason,'completion_nonce_replayed');assert.equal(logs.length,2);
 t+=60000;capture({signatureMismatch:true});
 assert.equal(capture.summary().total,8);assert.equal(capture.summary().byReason.completion_signature_mismatch,1);
 assert.equal(logs.at(-1).suppressedSinceLastRecord,5);
});
test('no job ID, phone ID, text or secret leaves summary even on malformed requests',()=>{
 const x=makeCompletionRejectionAudit({sink:()=>{}});
 x({bodyMismatch:true,deviceId:'privatePhone123',jobId:'job_secret',nonce:'SECRET_NONCE',mac:'SECRET_MAC',body:'SECRET_TEXT'});
 x({unknown:'SECRET_UNKNOWN'});
 const a=x.summary(),encoded=JSON.stringify(a);
 assert.equal(a.total,2);assert.equal(a.byReason.result_body_digest_mismatch,1);
 assert.equal(a.byReason.completion_reason_unclassified,1);
 assert.equal(Object.isFrozen(a),true);assert.equal(Object.isFrozen(a.byReason),true);
 for(const bad of ['privatePhone123','job_secret','SECRET_NONCE','SECRET_MAC','SECRET_TEXT','SECRET_UNKNOWN'])assert.equal(encoded.includes(bad),false);
});
test('broken log sink cannot authorize a rejected request or hide in-process count',()=>{
 const x=makeCompletionRejectionAudit({sink:()=>{throw Error('logger offline')}});
 assert.doesNotThrow(()=>x({sessionAbsent:true}));
 assert.equal(x.summary().total,1);assert.equal(x.summary().byReason.active_secure_session_absent,1);
 assert.equal(x.summary().automaticRetryEnabled,false);
 assert.equal(classifyCompletionRejection({nonceReplayed:true}),'completion_nonce_replayed');
});
