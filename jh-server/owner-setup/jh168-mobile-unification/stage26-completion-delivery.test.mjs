import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {decideExactSignedCompletionAck56} from './stage26-completion-delivery-policy.mjs';
import {applyStage26CompletionAckPatch56,reverseStage26CompletionAckPatch56}
 from './stage26-completion-delivery-patch.mjs';
import {buildStage25PendingOperatorEntrypoint56}
 from './stage25-live-operator-followup-entry.mjs';
const digest=s=>createHash('sha256').update(s).digest('hex');
const root=path.resolve(import.meta.dirname,'..');
const env={CI:'true',NODE_ENV:'test',JH_OWNER_DEFER_LISTEN:'1'};

test('signed same-job same-body duplicate is an ACK only (no new job or durable hook)',()=>{
 const d=digest('{"result":{"ok":true,"action":"CLICK","resultVerified":true}}');
 const j={id:'job_14',type:'split_screen_session_followup',status:'complete',
   secureSessionId:'s56_current',stage26CompletionDigest56:d};
 assert.equal(decideExactSignedCompletionAck56(j,d),'ACK_IDENTICAL');
 assert.equal(decideExactSignedCompletionAck56(j,digest('different')),'CONFLICT_OR_UNKNOWN');
 assert.equal(decideExactSignedCompletionAck56({...j,stage26CompletionDigest56:null},d),'CONFLICT_OR_UNKNOWN');
 assert.equal(decideExactSignedCompletionAck56({...j,secureSessionId:null},d),'CONFLICT_OR_UNKNOWN');
});

test('only a FIRST completion continues to original durable acceptedCompletion',()=>{
 const d=digest('original');
 for(const status of ['queued','in_progress','expired','error']){
  const j={id:'job_1',type:'split_screen_session_followup',status,secureSessionId:'s56',stage26CompletionDigest56:null};
  assert.equal(decideExactSignedCompletionAck56(j,d),'FIRST_COMPLETION');
 }
 assert.equal(decideExactSignedCompletionAck56(null,d),'DENY');
 assert.equal(decideExactSignedCompletionAck56({},'oops'),'DENY');
});

test('post-auth source patch is exact reversible and only changes signed completion ACK',async()=>{
 const base=await buildStage25PendingOperatorEntrypoint56(root,env);
 const original=readFileSync(base.runtimeFile,'utf8');
 const candidate=applyStage26CompletionAckPatch56(original);
 assert.equal(reverseStage26CompletionAckPatch56(candidate),original);
 assert.ok(candidate.includes('jhSplitFollowupReceipts56.read('));
 assert.ok(candidate.includes('pendingApprovalReceipts56'));
 assert.ok(candidate.includes('computerInspectReceipt56'));
 assert.ok(candidate.includes('jhSplitReadReceipts56'));
 assert.ok(candidate.includes('durableNativeHooks56?.acceptedCompletion('));
 const auth=candidate.indexOf('if(!a||sid!==j.secureSessionId');
 const ack=candidate.indexOf('const stage26Ack56=');
 const durability=candidate.indexOf('durableNativeHooks56?.acceptedCompletion(');
 const stamp=candidate.indexOf('j.stage26CompletionDigest56=stage26RawDigest56;');
 assert.ok(0<auth&&auth<ack&&ack<durability&&durability<stamp);
 assert.equal(candidate.split('const stage26Ack56=').length-1,1);
 assert.equal(candidate.split('stage26CompletionDigest56=stage26RawDigest56').length-1,1);
 assert.ok(!candidate.includes('automaticActionRetryEnabled:true'));
 assert.throws(()=>applyStage26CompletionAckPatch56(candidate),/REQUIRED|ANCHOR/);
 const before=readFileSync(base.runtimeFile,'utf8');
 assert.equal(before,original,'review build must not overwrite original');
 const filename=path.join(root,'server-integration/stage26-syntax-review.mjs');
 const fs=await import('node:fs');
 fs.writeFileSync(filename,candidate,{mode:0o600});
 const result=spawnSync(process.execPath,['--check',filename],{encoding:'utf8',timeout:20000});
 assert.equal(result.status,0,result.stderr);
});

test('unknown, unsigned, expired old receipt is never fabricated into verified click',()=>{
 const d=digest('done');
 const old={status:'complete',secureSessionId:'s56',stage26CompletionDigest56:null};
 assert.notEqual(decideExactSignedCompletionAck56(old,d),'ACK_IDENTICAL');
 assert.notEqual(decideExactSignedCompletionAck56({status:'complete'},d),'ACK_IDENTICAL');
 assert.equal(decideExactSignedCompletionAck56({status:'in_progress',secureSessionId:'s56'},d),'FIRST_COMPLETION');
});

