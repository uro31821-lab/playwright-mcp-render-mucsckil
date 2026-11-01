import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {decideExactSignedCompletionAck56} from './stage26-completion-delivery-policy.mjs';
import {applyStage26CompletionAckPatch56,reverseStage26CompletionAckPatch56}
 from './stage26-completion-delivery-patch.mjs';
import {buildStage25PendingOperatorEntrypoint56,selectStage25PendingOperatorRuntime56,
 selectStage26CompletionAck56}
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
 const running={id:'job_1',type:'split_screen_session_followup',status:'in_progress',
  secureSessionId:'s56',stage26CompletionDigest56:null};
 assert.equal(decideExactSignedCompletionAck56(running,d),'FIRST_COMPLETION');
 for(const status of ['queued','expired','error']){
  assert.equal(decideExactSignedCompletionAck56({...running,status},d),'CONFLICT_OR_UNKNOWN');
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


test('exact original Stage25 operator remains untouched if Stage26 flag absent, new ACK must explicitly opt-in',async()=>{
 const stable=await buildStage25PendingOperatorEntrypoint56(root,env);
 assert.equal(stable.stamp.signedCompletionAckStage26,undefined);
 const pristine=readFileSync(stable.runtimeFile,'utf8');
 assert.ok(!pristine.includes('stage26RawDigest56'));
 assert.equal(selectStage25PendingOperatorRuntime56(root,env).sha256,stable.stamp.runtimeSha256);
 assert.equal(selectStage26CompletionAck56(env),false);
 const stage26Env={...env,JH_STAGE26_SIGNED_COMPLETION_ACK:'EXPLICIT_IDENTICAL_SIGNED_RESULT_V1'};
 assert.equal(selectStage26CompletionAck56(stage26Env),true);
 const added=await buildStage25PendingOperatorEntrypoint56(root,stage26Env);
 assert.equal(added.stamp.signedCompletionAckStage26,true);
 assert.equal(added.stamp.originalPendingApprovalOperator,true);
 assert.equal(added.stamp.originalSplitRead,true);
 assert.equal(added.stamp.originalComputerInspect,true);
 assert.equal(added.stamp.originalOperationalLearning,true);
 const signed=readFileSync(added.runtimeFile,'utf8');
 assert.equal(reverseStage26CompletionAckPatch56(signed),pristine);
 assert.equal(selectStage25PendingOperatorRuntime56(root,stage26Env).sha256,added.stamp.runtimeSha256);
 assert.ok(signed.includes('jhSplitFollowupReceipts56.issue('));
 assert.ok(signed.includes('pendingApprovalReceipts56'));
 assert.ok(signed.includes('computerInspectReceipt56'));
 assert.ok(signed.includes('durableNativeHooks56?.acceptedCompletion('));
 assert.ok(signed.includes('jhRequireCommand56('));
 assert.ok(signed.includes('stage26CompletionDigest56'));
 const malformed={...stage26Env,JH_STAGE26_SIGNED_COMPLETION_ACK:'ALLOW_REPLAY'};
 assert.throws(()=>selectStage26CompletionAck56(malformed),/FLAG_INVALID/);
 // Restore all default generated artifacts after review; production and device never started.
 const restored=await buildStage25PendingOperatorEntrypoint56(root,env);
 assert.equal(readFileSync(restored.runtimeFile,'utf8'),pristine);
});

test('post-listen activation log uses PRE-validated opt-in, not mutable process.env',()=>{
 const source=readFileSync(path.join(root,'jh168-mobile-unification/stage25-live-operator-followup-entry.mjs'),'utf8');
 const gateIndex=source.indexOf('const stage26EnabledAtBootstrap=selectStage26CompletionAck56(env);');
 const startIndex=source.indexOf('const running=await module.main(env);');
 const logIndex=source.indexOf("console.log('JH_STAGE26_SIGNED_COMPLETION_ACK_ACTIVE '");
 assert.ok(gateIndex>0 && startIndex>gateIndex && logIndex>startIndex);
 assert.ok(source.includes('if(stage26EnabledAtBootstrap){'));
 assert.ok(!source.includes('if(selectStage26CompletionAck56(env)){'));
 // The original owner process explicitly sets JH_OWNER_DEFER_LISTEN=1
 // during startConfiguredOwnerServer. Re-evaluating prod(env) later is wrong.
 const pre={CI:'true',NODE_ENV:'test',JH_OWNER_DEFER_LISTEN:'1',
  JH_STAGE26_SIGNED_COMPLETION_ACK:'EXPLICIT_IDENTICAL_SIGNED_RESULT_V1'};
 assert.equal(selectStage26CompletionAck56(pre),true);
});

