import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const state=JSON.parse(fs.readFileSync(new URL('./state.json',import.meta.url),'utf8'));

test('Stage68 uses exactly three rounds',()=>{
  assert.equal(state.round,1);
  assert.equal(state.maxRounds,3);
});

test('every paired feature starts in round 1',()=>{
  assert.deepEqual(state.features,[
    'NATIVE_SELECT',
    'NESTED_VERTICAL_SCROLL',
    'HORIZONTAL_SCROLL',
    'BACK',
    'PRESS_KEY',
    'WAIT_CONDITION',
    'SCREENSHOT',
    'RETURN_TO_CHROME_FROM_OTHER_APP'
  ]);
});

test('single winner eliminates opposite implementation',()=>{
  assert.equal(state.roundRule.androidPassPlaywrightFail,'KEEP_ANDROID_DELETE_PLAYWRIGHT');
  assert.equal(state.roundRule.playwrightPassAndroidFail,'KEEP_PLAYWRIGHT_DELETE_ANDROID');
  assert.equal(state.roundRule.bothPass,'KEEP_ONE_DELETE_OTHER');
});

test('only dual failure advances and round 3 dual failure becomes manual',()=>{
  assert.equal(state.roundRule.bothFailBeforeRound3,'FIX_BOTH_AND_NEXT_ROUND');
  assert.equal(state.roundRule.bothFailAtRound3,'MANUAL_AFTER_ROUND_3');
});

test('phone execution plus readback is mandatory',()=>{
  assert.equal(state.verificationRequired,'REAL_PHONE_EXECUTION_PLUS_READBACK');
});

test('ambiguous or effectful failures never auto replay',()=>{
  assert.deepEqual(state.noAutomaticReplay,['UNKNOWN','PENDING','FAILED_AFTER_EFFECT']);
});
