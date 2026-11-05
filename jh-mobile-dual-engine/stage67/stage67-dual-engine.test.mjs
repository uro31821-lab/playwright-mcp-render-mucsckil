import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {runAndroidBack} from './android/back.mjs';
import {runAndroidWaitCondition} from './android/wait-condition.mjs';
import {runAndroidScreenshot} from './android/screenshot.mjs';
import {runDualEngine} from './router.mjs';

const matrix=JSON.parse(fs.readFileSync(new URL('./matrix.json',import.meta.url),'utf8'));

test('final matrix keeps only three real-phone Android winners active',()=>{
  const active=matrix.features.filter(x=>x.android||x.playwrightMobile);
  assert.deepEqual(active.map(x=>x.feature).sort(),['BACK','SCREENSHOT','WAIT_CONDITION'].sort());
  assert.ok(active.every(x=>x.winner==='ANDROID'&&x.playwrightMobile===null));
});

test('five three-round dual failures are manual only',()=>{
  const manual=matrix.features.filter(x=>x.status==='MANUAL_AFTER_ROUND_3');
  assert.deepEqual(manual.map(x=>x.feature).sort(),[
    'NATIVE_SELECT','NESTED_VERTICAL_SCROLL','HORIZONTAL_SCROLL','PRESS_KEY','RETURN_TO_CHROME_FROM_OTHER_APP'
  ].sort());
  assert.ok(manual.every(x=>x.android===null&&x.playwrightMobile===null));
});

test('three Android winners still have verified-pass contracts',async()=>{
  let n=0;
  const backBridge={
    currentState:async()=>n++?{url:'https://a.test/',packageName:'com.android.chrome',windowId:2}:{url:'https://b.test/',packageName:'com.android.chrome',windowId:2},
    backOnce:async()=>({ok:true,dispatched:true})
  };
  assert.equal((await runAndroidBack({expectedUrlBefore:'https://b.test/'},backBridge)).outcome,'VERIFIED_PASS');

  const waitBridge={waitExactText:async()=>({conditionVerified:true,observedAtMs:1})};
  assert.equal((await runAndroidWaitCondition({expectedText:'READY'},waitBridge)).outcome,'VERIFIED_PASS');

  const screenshotBridge={captureWorkWindow:async()=>({ok:true,pixelsCaptured:true,screenshotDigest:'d'.repeat(64)})};
  assert.equal((await runAndroidScreenshot({consent:{grantToken:'g',digest:'d',leaseToken:'l'}},screenshotBridge)).outcome,'VERIFIED_PASS');
});

test('effectful or uncertain Android result stops without Playwright fallback',async()=>{
  let playwrightCalls=0;
  const p=async()=>{playwrightCalls++;return {ok:true,outcome:'VERIFIED_PASS'}};
  const a1=async()=>({ok:false,outcome:'FAILED_AFTER_EFFECT',code:'READBACK_FAILED'});
  const r1=await runDualEngine({feature:'X',input:{},androidRun:a1,playwrightRun:p,androidPort:{},playwrightProvider:{}});
  assert.equal(r1.selected,'STOP_NO_REPLAY');
  assert.equal(playwrightCalls,0);

  const a2=async()=>({ok:false,outcome:'EFFECT_UNKNOWN',code:'UNKNOWN'});
  const r2=await runDualEngine({feature:'X',input:{},androidRun:a2,playwrightRun:p,androidPort:{},playwrightProvider:{}});
  assert.equal(r2.selected,'STOP_NO_REPLAY');
  assert.equal(playwrightCalls,0);
});

test('BACK readback failure after dispatch is never classified no-effect',async()=>{
  const bridge={currentState:async()=>({url:'https://same.test/'}),backOnce:async()=>({ok:true,dispatched:true})};
  const r=await runAndroidBack({expectedUrlBefore:'https://same.test/'},bridge);
  assert.equal(r.outcome,'FAILED_AFTER_EFFECT');
  assert.equal(r.replayAllowed,false);
});

test('screenshot uncertain result is never automatically replayable',async()=>{
  const bridge={captureWorkWindow:async()=>({ok:false,code:'CAPTURE_UNCONFIRMED'})};
  const r=await runAndroidScreenshot({consent:{grantToken:'g',digest:'d',leaseToken:'l'}},bridge);
  assert.equal(r.outcome,'EFFECT_UNKNOWN');
  assert.equal(r.replayAllowed,false);
});
