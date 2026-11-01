import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFileSync,writeFileSync,unlinkSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {buildStage25PendingOperatorEntrypoint56,selectStage26CompletionAck56}
 from './stage25-live-operator-followup-entry.mjs';
import {applyStage30ServerRuntimeCandidate}
 from './stage30-candidate-compose.mjs';
import {applyStage34RuntimePatch}
 from './stage34-owner-runtime-patch.mjs';
import {applyStage35RuntimePatch,reverseStage35RuntimePatch}
 from './stage35-sealed-handoff-patch.mjs';

const root=path.resolve(import.meta.dirname,'..');
const env={CI:'true',NODE_ENV:'test',JH_OWNER_DEFER_LISTEN:'1',
 JH_STAGE26_SIGNED_COMPLETION_ACK:'EXPLICIT_IDENTICAL_SIGNED_RESULT_V1'};
test('original generated Stage25/26/30/34 operator gains exactly two OAuth tools without new Android executor',async()=>{
 assert.equal(selectStage26CompletionAck56(env),true);
 const built=await buildStage25PendingOperatorEntrypoint56(root,env);
 assert.equal(built.originalOperatorPreserved,true);
 assert.equal(built.productionEnabled,false);
 assert.equal(built.listenerStarted,false);
 const base=readFileSync(built.runtimeFile,'utf8');
 assert.ok(base.includes('jhSplitFollowupReceipts56.read('));
 assert.ok(base.includes('durableNativeHooks56?.acceptedCompletion('));
 const stage34=applyStage34RuntimePatch(applyStage30ServerRuntimeCandidate(base));
 const stage35=applyStage35RuntimePatch(stage34);
 assert.equal(reverseStage35RuntimePatch(stage35),stage34);
 for(const name of ['life_android_original_completion_handle_issue',
                    'life_android_original_completion_handle_status']){
  assert.equal(stage35.split('registerOAuthTool("'+name+'"').length,2,name);
 }
 assert.equal(stage35.split('stage35-durable-native-host-candidate.mjs').length,2);
 assert.equal(stage35.includes('stage34-durable-native-host-candidate.mjs'),false);
 const issuerAt=stage35.indexOf('  registerOAuthTool("life_android_original_completion_handle_issue",');
 const statusAt=stage35.indexOf('  registerOAuthTool("life_android_original_completion_handle_status",');
 const legacyAt=stage35.indexOf('  registerOAuthTool("life_android_original_completion_receipt_status",');
 assert.ok(issuerAt>0&&statusAt>issuerAt&&legacyAt>statusAt);
 const issuer=stage35.slice(issuerAt,statusAt);
 const status=stage35.slice(statusAt,legacyAt);
 assert.match(issuer,/jhRequireCommand56\(device\)/);
 assert.match(issuer,/jobs\.get\(args\.original_job_id\)/);
 assert.match(issuer,/original\.commandId!==commandId/);
 assert.match(issuer,/original\.secureSessionId!==auth\.sessionId/);
 assert.match(issuer,/original\.status!=='complete'/);
 assert.match(issuer,/active56\(device\)/);
 assert.match(issuer,/durableNativeHooks56\.issueOriginalReceiptHandle/);
 assert.match(status,/sealed_handle:z\.string\(\)\.min\(40\)\.max\(1800\)/);
 assert.match(status,/active56\(device\)/);
 assert.match(status,/durableNativeHooks56\.readOriginalReceiptHandle/);
 for(const snippet of [issuer,status]){
  for(const excluded of ['mk(', 'waitJob(', 'beforeDispatch(', 'executeRightPane(',
   'life_android_execute_computer_action(', 'screenConsentGranted:true',
   'BEGIN_COMMAND', 'approvalRequest(', 'approveDevice(', 'reuseGrant('])
   assert.equal(snippet.includes(excluded),false,'unexpected effect: '+excluded);
 }
 const signed=stage35.indexOf('if(!a||sid!==j.secureSessionId');
 const ack=stage35.indexOf('const stage26Ack56=');
 const durable=stage35.indexOf('durableNativeHooks56?.acceptedCompletion(');
 assert.ok(signed>=0&&signed<ack&&ack<durable);
 const compiled=path.join(root,'server-integration/stage35-generated-operator-syntax-check.mjs');
 try{
  writeFileSync(compiled,stage35,{flag:'wx',mode:0o600});
  const r=spawnSync(process.execPath,['--check',compiled],{encoding:'utf8',timeout:30000});
  assert.equal(r.status,0,r.stderr);
 }finally{if(existsSync(compiled))unlinkSync(compiled)}
 assert.equal(readFileSync(built.runtimeFile,'utf8'),base,'live-selected operator source mutated');
});
test('wrong original signed operator, duplicate patch and missing OAuth guard fail closed',()=>{
 const source=readFileSync(new URL('./stage35-sealed-handoff-patch.mjs',import.meta.url),'utf8');
 assert.ok(source.includes("registerOAuthTool("));
 assert.ok(source.includes("jhRequireCommand56(device)"));
 assert.ok(source.includes("active56(device)"));
 assert.ok(source.includes("original.secureSessionId!==auth.sessionId"));
 assert.ok(!source.includes('httpServer.listen('));
 assert.ok(!source.includes('registerHTTPRoute('));
 assert.ok(!source.includes('automatedReplay:true'));
});
