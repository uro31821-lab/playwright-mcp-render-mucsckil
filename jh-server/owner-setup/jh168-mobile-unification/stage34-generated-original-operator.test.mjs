import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFileSync,writeFileSync,unlinkSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {buildStage25PendingOperatorEntrypoint56,
 selectStage26CompletionAck56} from './stage25-live-operator-followup-entry.mjs';
import {applyStage30ServerRuntimeCandidate}
 from './stage30-candidate-compose.mjs';
import {applyStage34RuntimePatch,reverseStage34RuntimePatch}
 from './stage34-owner-runtime-patch.mjs';

const root=path.resolve(import.meta.dirname,'..');
const env={CI:'true',NODE_ENV:'test',JH_OWNER_DEFER_LISTEN:'1',
 JH_STAGE26_SIGNED_COMPLETION_ACK:'EXPLICIT_IDENTICAL_SIGNED_RESULT_V1'};
test('actual generated Stage25/26 signed operator has ONE bounded original-result read tool',async()=>{
 assert.equal(selectStage26CompletionAck56(env),true);
 const built=await buildStage25PendingOperatorEntrypoint56(root,env);
 assert.equal(built.listenerStarted,false);
 assert.equal(built.originalOperatorPreserved,true);
 assert.equal(built.stamp.signedCompletionAckStage26,true);
 const original=readFileSync(built.runtimeFile,'utf8');
 const stage30=applyStage30ServerRuntimeCandidate(original);
 const stage34=applyStage34RuntimePatch(stage30);
 assert.equal(reverseStage34RuntimePatch(stage34),stage30);
 assert.equal(stage34.split('registerOAuthTool("life_android_original_completion_receipt_status"').length,2);
 assert.equal(stage34.split('stage34-durable-native-host-candidate.mjs').length,2);
 assert.equal(stage34.includes('stage30-durable-native-host-candidate.mjs'),false);
 const before=stage34.indexOf('registerOAuthTool("life_android_original_completion_receipt_status"');
 const next=stage34.indexOf('  registerOAuthTool("life_status",{',before);
 const route=stage34.slice(before,next);
 assert.ok(route.length>1500);
 assert.match(route,/original_reference:z\.object/);
 assert.match(route,/\.strict\(\)/);
 assert.match(route,/active56\(device\)/);
 assert.match(route,/devices\.get\(device\)/);
 assert.match(route,/secureBridgeVersion!==56/);
 assert.match(route,/durableNativeHooks56\.readOriginalReceipt/);
 for(const effect of ['mk(', 'waitJob(', 'beforeDispatch(', 'executeRightPane(',
  'life_android_execute_computer_action(', 'screenConsentGranted:true',
  'BEGIN_COMMAND', 'approvalRequest('])
  assert.equal(route.includes(effect),false,'forbidden read-side effect '+effect);
 const checked=path.join(root,'server-integration/stage34-only-syntax-check.mjs');
 try{
  writeFileSync(checked,stage34,{flag:'wx',encoding:'utf8',mode:0o600});
  const syntax=spawnSync(process.execPath,['--check',checked],{encoding:'utf8',timeout:30000});
  assert.equal(syntax.status,0,syntax.stderr);
 }finally{if(existsSync(checked))unlinkSync(checked)}
 assert.equal(readFileSync(built.runtimeFile,'utf8'),original);
});
test('same original OAuth wrapper, device and HMAC original guards cannot be removed',()=>{
 const src=readFileSync(new URL('./stage34-owner-runtime-patch.mjs',import.meta.url),'utf8');
 assert.ok(src.includes('registerOAuthTool("life_status"'));
 assert.ok(src.includes('registerOAuthTool("life_android_original_completion_receipt_status"'));
 assert.ok(src.includes('if(!a||sid!==j.secureSessionId'));
 assert.ok(src.includes('durableNativeHooks56?.acceptedCompletion('));
 assert.ok(!src.includes('registerHTTPRoute('));
 assert.ok(!src.includes('httpServer.listen('));
 assert.ok(!src.includes('approveAction('));
 assert.ok(!src.includes('replayAction('));
});
