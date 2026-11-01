/**
 * The exact production SELECTOR is not the older JH167 reviewer.
 * Check that the actual Stage25/Secure56 pending-approval operator composer
 * built from the latest original main now inherits PR72's 9 RIGHT aliases.
 *
 * No actual owner service is started: synthetic CI flags prohibit listen.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {buildStage25PendingOperatorEntrypoint56}
 from './stage25-live-operator-followup-entry.mjs';
import {selectPendingApprovalStartup56,selectJH168FollowupOperator56}
 from '../deployment/published-host-router.mjs';

const root=path.resolve('jh-server/owner-setup');
const flags={
 JH_PENDING_APPROVAL_OPERATOR_ENABLE:'EXPLICIT_OPERATOR_APPROVAL_RECEIPT_V1',
 JH_SPLIT_FOLLOWUP_OPERATOR_ENABLE:'EXPLICIT_FOLLOWUP_CLICK_RECEIPT_V1',
 JH_DURABLE_RELEASE:'SERVE_READY_V1',
 RENDER_SERVICE_ID:'srv-db0fjl2d0e5s73be114g'
};
const env={CI:'true',NODE_ENV:'test',JH_OWNER_DEFER_LISTEN:'1',
 JH_MOBILE_WEB_13_MODE:'EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1',
 JH_STAGE26_SIGNED_COMPLETION_ACK:'EXPLICIT_IDENTICAL_SIGNED_RESULT_V1'};
let stage25Runtime;
test('published npm start selector in original Secure56 chooses explicit FOLLOWUP operator',()=>{
 assert.equal(selectPendingApprovalStartup56(flags),'pending-approval');
 assert.equal(selectJH168FollowupOperator56(flags),'followup');
 const pkg=JSON.parse(readFileSync('jh-server/package.json','utf8'));
 assert.equal(pkg.scripts.start,
  'node owner-setup/deployment/published-host-router.mjs');
});
test('generated exact Stage25 operator contains 9 phone RIGHT aliases, not cloud Playwright',async()=>{
 const o=await buildStage25PendingOperatorEntrypoint56(root,env);
 assert.equal(o.listenerStarted,false);
 assert.equal(o.productionEnabled,false);
 assert.equal(o.originalOperatorPreserved,true);
 stage25Runtime=readFileSync(o.runtimeFile,'utf8');
 const names=['navigate','snapshot','click','type','select','press_key','wait','back','screenshot'];
 const begin=stage25Runtime.indexOf('  registerOAuthTool("life_web_navigate",{');
 const end=stage25Runtime.indexOf('  registerOAuthTool("life_android_devices",{',begin);
 assert.ok(begin>=0&&end>begin);
 const aliases=stage25Runtime.slice(begin,end);
 const rows=names.map(n=>{
  const a=aliases.indexOf('  registerOAuthTool("life_web_'+n+'",{');
  const b=a>=0?aliases.indexOf('  registerOAuthTool(',a+24):-1;
  const block=a>=0?aliases.slice(a,b>=0?b:undefined):'';
  // WAIT deliberately uses one signed Android status-read, not a browser
  // condition waiter. It must be on the phone path, but is NOT functionally
  // complete until true condition verification is implemented and tested.
  const right=n==='wait'?
    block.includes('jhSplitScreenJob56("split_screen_session_status"')&&
    block.includes('MOBILE_WAIT_CONDITION_UNVERIFIED'):
    /jhMobileWebFollow56|jhMobileWebRead56|jhRightWebOpen56|jhMobileWebCapture56/.test(block);
  return {name:'life_web_'+n,registered:a>=0,
    signedRight:!!right,conditionWaitSupported:n==='wait'?false:null,
    cloudBrowserFallback:block.includes('browserTool(')};
 });
 for(const row of rows)console.log('JH_MOBILE_STAGE25_OPERATOR_ALIAS '+JSON.stringify(row));
 assert.equal(rows.length,9);
 assert.equal(rows.filter(r=>r.registered&&r.signedRight&&!r.cloudBrowserFallback).length,9,
  'STAGE25_OLD_PLAYWRIGHT_ALIAS_PATH_BLOCKS_DEPLOY');
 // Input-preflight helper sits BEFORE the first OAuth alias registrar.
 // The route invokes jhMobileWebFollow56, so check the entire generated
 // secure operator, not only the sliced registration block.
 assert.ok(stage25Runtime.includes('split_screen_session_input_preflight'));
 assert.ok(stage25Runtime.includes('MOBILE_INPUT_PREFLIGHT_NOT_GRANTED'));
 assert.ok(stage25Runtime.includes('MOBILE_REQUEST_ID_REQUIRED'));
 assert.ok(stage25Runtime.includes('requestId,command,targetItemRef:bound.itemRef,action'));
 assert.ok(aliases.includes('MOBILE_WAIT_CONDITION_UNVERIFIED'));
 assert.ok(aliases.includes('MOBILE_KEY_NOT_VERIFIED'));
});
test('same original Stage25 generated server preserves 4 native/RIGHT entrypoints',()=>{
 assert.ok(stage25Runtime&&stage25Runtime.length>10000);
 for(const n of ['life_route','life_open_service','life_naver_mail','life_android_open']){
  const marker='  registerOAuthTool("'+n+'",{';
  assert.equal(stage25Runtime.split(marker).length,2,'missing '+n);
  const a=stage25Runtime.indexOf(marker),b=stage25Runtime.indexOf('  registerOAuthTool(',a+marker.length);
  const block=stage25Runtime.slice(a,b>a?b:undefined);
  assert.ok(!block.includes('browserTool('),'cloud Playwright fallback for '+n);
  console.log('JH_MOBILE_STAGE25_ENTRYPOINT '+JSON.stringify({name:n,registered:true}));
 }
});
test('source-only operator does not disable original HMAC, nonce, approval or job recovery',()=>{
 assert.ok(stage25Runtime);
 const guards=[
  'jhRequireCommand56(device)',
  'jhInspectSplitEvidence155',
  'jhSplitFollowupReceipts56.read(',
  'durableNativeHooks56?.acceptedCompletion(',
  'if(!a||sid!==j.secureSessionId',
  'const stage26Ack56='
 ];
 for(const guard of guards)
  assert.ok(stage25Runtime.includes(guard),'SIGNED SECURE56 SOURCE GUARD DRIFT: '+guard);
 assert.ok(stage25Runtime.includes('registerOAuthTool("life_android_pending_approval_receipt_status"'));
});
