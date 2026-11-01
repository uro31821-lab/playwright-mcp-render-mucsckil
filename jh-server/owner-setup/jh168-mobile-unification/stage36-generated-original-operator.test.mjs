import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFileSync,writeFileSync,unlinkSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {buildStage25PendingOperatorEntrypoint56,selectStage26CompletionAck56}
 from './stage25-live-operator-followup-entry.mjs';
import {applyStage30ServerRuntimeCandidate} from './stage30-candidate-compose.mjs';
import {applyStage34RuntimePatch} from './stage34-owner-runtime-patch.mjs';
import {applyStage35RuntimePatch} from './stage35-sealed-handoff-patch.mjs';
import {applyStage36InlineHandoffPatch,reverseStage36InlineHandoffPatch}
 from './stage36-original-completion-patch.mjs';

const root=path.resolve(import.meta.dirname,'..');
const env={CI:'true',NODE_ENV:'test',JH_OWNER_DEFER_LISTEN:'1',
 JH_STAGE26_SIGNED_COMPLETION_ACK:'EXPLICIT_IDENTICAL_SIGNED_RESULT_V1'};
test('actual generated Secure56 original operator has exact reversible Stage36 handoff',async()=>{
 assert.equal(selectStage26CompletionAck56(env),true);
 const built=await buildStage25PendingOperatorEntrypoint56(root,env);
 assert.equal(built.originalOperatorPreserved,true);
 assert.equal(built.listenerStarted,false);
 assert.equal(built.productionEnabled,false);
 const original=readFileSync(built.runtimeFile,'utf8');
 const stage35=applyStage35RuntimePatch(
  applyStage34RuntimePatch(
   applyStage30ServerRuntimeCandidate(original)));
 const stage36=applyStage36InlineHandoffPatch(stage35);
 assert.equal(reverseStage36InlineHandoffPatch(stage36),stage35);
 assert.equal(stage36.startsWith('import {createStage36InlineOriginalHandoff}'),true);
 assert.equal(stage36.split('createStage36InlineOriginalHandoff();').length,2);
 assert.equal(stage36.split('stage36InlineOriginalHandoff56.stage({').length,2);
 assert.equal(stage36.split('stage36InlineOriginalHandoff56.finish({receipt,verified})').length,2);
 assert.equal(stage36.split('originalReceiptHandoff:stage36CompletionHandoff56').length,2);
 assert.equal(stage36.split('registerOAuthTool("life_android_original_completion_handle_issue"').length,2);
 assert.equal(stage36.split('registerOAuthTool("life_android_original_completion_handle_status"').length,2);
 assert.equal(stage36.split('durableNativeHooks56?.acceptedCompletion(').length,2);
 assert.equal(stage36.split('jhSplitFollowupReceipts56.read(').length,2);
 assert.equal(stage36.split('jhSplitScreenOnce155(device,commandId,type,payload,dispatch)').length,2);

 const signed=stage36.indexOf('if(!a||sid!==j.secureSessionId');
 const ack=stage36.indexOf('const stage26Ack56=');
 const durable=stage36.indexOf('durableNativeHooks56?.acceptedCompletion(');
 const protectedRunner=stage36.indexOf('const verified=await runProtectedJHAction(');
 const finish=stage36.indexOf('stage36InlineOriginalHandoff56.finish({receipt,verified})');
 const issuer=stage36.indexOf('stage36InlineOriginalHandoff56.stage({');
 assert.ok(signed>=0&&signed<ack&&ack<durable);
 assert.ok(protectedRunner>=0&&protectedRunner<finish);
 assert.ok(issuer>=0&&issuer<finish);

 const patchedDeltaStart=stage36.indexOf('    const stage36Response56=');
 const patchedDeltaEnd=stage36.indexOf("    return type==='split_screen_session_followup'",patchedDeltaStart);
 const snippet=stage36.slice(patchedDeltaStart,patchedDeltaEnd);
 assert.match(snippet,/result\.ok===true&&result\.resultVerified===true/);
 assert.match(snippet,/j\.status==='complete'/);
 assert.match(snippet,/active56\(device\)\?\.sessionId===auth\.sessionId/);
 assert.match(snippet,/jhRequireCommand56\(device\)===commandId/);
 assert.match(snippet,/durableNativeHooks56\.issueOriginalReceiptHandle/);
 assert.match(snippet,/stage36InlineOriginalHandoff56\.stage/);
 for(const effect of ["mk(","waitJob(","runProtectedJHAction(", "approvalRequest(", "BEGIN_COMMAND"])
  assert.equal(snippet.includes(effect),false,'new Android effect at handoff '+effect);

 const finishCode=stage36.slice(stage36.indexOf('const stage36CompletionHandoff56='),
  stage36.indexOf('resultVerification:jhResultVerificationSummary56(verified)',finish));
 assert.match(finishCode,/originalReceiptHandoff:stage36CompletionHandoff56/);
 assert.ok(!finishCode.includes('mk('));
 assert.ok(!finishCode.includes('waitJob('));
 const check=path.join(root,'server-integration/stage36-only-syntax-check.mjs');
 try {
  writeFileSync(check,stage36,{flag:'wx',encoding:'utf8',mode:0o600});
  const parsed=spawnSync(process.execPath,['--check',check],{encoding:'utf8',timeout:30000});
  assert.equal(parsed.status,0,parsed.stderr);
 }finally{if(existsSync(check))unlinkSync(check)}
 assert.equal(readFileSync(built.runtimeFile,'utf8'),original);
});
test('original signed server and Stage35 are unchanged if patch preconditions fail',()=>{
 const patch=readFileSync(new URL('./stage36-original-completion-patch.mjs',import.meta.url),'utf8');
 assert.ok(patch.includes("jhResultVerificationSummary56(verified)"));
 assert.ok(patch.includes("jhSplitFollowupReceipts56.read("));
 assert.ok(patch.includes("const stage26Ack56="));
 assert.ok(patch.includes('originalReceiptHandoff'));
 for(const forbidden of ['registerOAuthTool("life_android_original_completion_handle_issue",',
  'httpServer.listen(', 'life_android_workflow_link(',
  'registerOAuthTool("life_android_click_again"'])
  assert.equal(patch.includes(forbidden),false);
});
