import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {runAndroidBack} from './android/back.mjs';
import {runAndroidWaitCondition} from './android/wait-condition.mjs';
import {runAndroidScreenshot} from './android/screenshot.mjs';

const matrix=JSON.parse(fs.readFileSync(new URL('./matrix.json',import.meta.url),'utf8'));

test('final matrix keeps only three real-phone Android routes active',()=>{
  const active=matrix.features.filter(x=>x.android);
  assert.deepEqual(active.map(x=>x.feature).sort(),['BACK','SCREENSHOT','WAIT_CONDITION'].sort());
  assert.ok(active.every(x=>x.winner==='ANDROID'));
});

test('five three-round unresolved features are manual only',()=>{
  const manual=matrix.features.filter(x=>x.status==='MANUAL_AFTER_ROUND_3');
  assert.deepEqual(manual.map(x=>x.feature).sort(),[
    'NATIVE_SELECT','NESTED_VERTICAL_SCROLL','HORIZONTAL_SCROLL','PRESS_KEY','RETURN_TO_CHROME_FROM_OTHER_APP'
  ].sort());
  assert.ok(manual.every(x=>x.android===null));
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
