/** JH168 Stage39: continue independent mobile development without clearing
 * historical OUTCOME_UNKNOWN evidence. Synthetic SQLite ONLY. No phone/device
 * effects, no owner migration, no startup listener, no production access.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,chmodSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DurableManualCircuitFence} from '../deployment/durable-manual-circuit-fence.mjs';
import {buildStage25PendingOperatorEntrypoint56}
 from './stage25-live-operator-followup-entry.mjs';

const repoRoot=path.resolve(import.meta.dirname,'..');
const testEnv=Object.freeze({
 CI:'true',NODE_ENV:'test',JH_OWNER_DEFER_LISTEN:'1',
 JH_STAGE26_SIGNED_COMPLETION_ACK:'EXPLICIT_IDENTICAL_SIGNED_RESULT_V1',
 JH_MOBILE_WEB_13_MODE:'EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1'
});

test('29 legacy unresolved journal records stay intact; unrelated new synthetic action is possible WITHOUT old replay',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'jh-stage39-noreplay-'));
 chmodSync(dir,0o700);
 const opts={file:path.join(dir,'manual-circuit.sqlite'),
   key:Buffer.alloc(32,42),namespace:'1'.repeat(64),
   verifyAuthenticatedCompletion:()=>false};
 const cmd=i=>({deviceId:'synthetic-android',type:'computer_use_action_execute',
   payload:{action:'SCROLL',x:100+i,y:600,viewportWidth:1200,viewportHeight:1800,scrollY:200}});
 let journal=null;
 try{
  journal=new DurableManualCircuitFence({...opts,mode:'EXPLICIT_ONE_TIME'});
  for(let i=0;i<29;i++){
   const admit=journal.reserveDispatch(cmd(i));
   assert.equal(admit.allowed,true,'initial synthetic fixture '+i);
  }
  assert.equal(journal.counts().uncertain,29);
  assert.equal(journal.counts().received,0);
  journal.close();journal=null;
  journal=new DurableManualCircuitFence({...opts,mode:'read'});
  assert.equal(journal.counts().uncertain,29,'old 29 must survive journal reopen');
  assert.equal(journal.inspect(cmd(0)).blocked,true);
  const repeat=journal.reserveDispatch(cmd(0));
  assert.equal(repeat.allowed,false);
  assert.equal(repeat.code,'PREVIOUS_OUTCOME_UNKNOWN_RECONCILE_REQUIRED');
  assert.equal(repeat.automaticRetryAllowed,false);
  // Different operation only: does NOT waive any of the old fences or simulate
  // prior execution success. It creates one new SYNTHETIC fence in temp SQLite.
  const distinct=journal.reserveDispatch(cmd(200));
  assert.equal(distinct.allowed,true);
  assert.equal(journal.counts().uncertain,30);
  for(let i=0;i<29;i++)assert.equal(journal.inspect(cmd(i)).blocked,true);
  assert.equal(journal.counts().received,0);
 }finally{try{journal?.close()}finally{opts.key.fill(0);rmSync(dir,{recursive:true,force:true});}}
});
test('combined source-only Stage25/26 PHONE_RIGHT creates SAME Secure56 native & 9+4 routing plus original result receipts',async()=>{
 const generated=await buildStage25PendingOperatorEntrypoint56(repoRoot,testEnv);
 assert.equal(generated.listenerStarted,false);
 assert.equal(generated.productionEnabled,false);
 assert.equal(generated.stamp.computerExecutionReceiptStage38,true);
 const src=readFileSync(generated.runtimeFile,'utf8');
 assert.ok(src.includes('computerExecutionReceipts56.issue('));
 assert.ok(src.includes('computerExecutionReceipts56.read('));
 assert.ok(src.includes('mobile13ActionMode'));
 assert.ok(src.includes('durableNativeHooks56?.beforeDispatch('));
 assert.ok(src.includes('durableNativeHooks56?.acceptedCompletion('));
 assert.ok(src.includes('jhRequireCommand56('));
 assert.ok(src.includes('jhSplitScreenJob56('));
 assert.ok(src.includes('registerOAuthTool("life_android_computer_prepare"'));
 assert.ok(src.includes('registerOAuthTool("life_android_execute_computer_action"'));
 const start=src.indexOf('  registerOAuthTool("life_web_navigate",{');
 const end=src.indexOf('  registerOAuthTool("life_android_devices",{',start);
 assert.ok(start>=0&&end>start,'actual secure generated web alias block');
 const handlers=src.slice(start,end);
 for(const name of ['navigate','snapshot','click','type','select','press_key','wait','back','screenshot'])
  assert.ok(handlers.includes('registerOAuthTool("life_web_'+name+'",'),'missing '+name);
 assert.equal((handlers.match(/registerOAuthTool\("life_web_/g)||[]).length,9);
 assert.equal(handlers.includes('browserTool('),false,'no old cloud Playwright fallback in migrated aliases');
 for(const entry of ['life_route','life_open_service','life_naver_mail','life_android_open'])
  assert.ok(src.includes('registerOAuthTool("'+entry+'",{'),'missing '+entry);
 assert.ok(src.includes('JH_MOBILE_WEB_13_MODE')||src.includes('jhMobileWebFollow56'));
 // This is SOURCE+SYNTHETIC evidence, NOT phone migrated E2E.
 console.log('JH_STAGE39_SOURCE_ONLY_29_UNKNOWN_PRESERVED_NO_MIGRATION');
 console.log('JH_STAGE39_GENERATED_ANDROID_WEB_SOURCE_CORRELATION=PASS');
 console.log('JH_STAGE39_REAL_DEVICE_MIGRATED_E2E=NOT_RUN');
});
