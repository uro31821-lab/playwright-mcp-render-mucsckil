import test from 'node:test';
import assert from 'node:assert/strict';
import {stage66FeaturePlan,stage66AutomaticFeatures,stage66ManualFeatures,
 STAGE66_PROFILE_VERSION} from './stage66-verified-mobile-feature-profile.mjs';

test('profile exposes current real-device verified Android automatic routes',()=>{
 assert.equal(STAGE66_PROFILE_VERSION,'JH168_STAGE66_VERIFIED_ANDROID_MANUAL_PROFILE_V2');
 assert.deepEqual(stage66AutomaticFeatures(),[
  'OPEN_RIGHT_URL','READ_RIGHT_SCREEN','VISIBLE_SAFE_BUTTON_CLICK',
  'DIALOG_OPEN','DIALOG_CLOSE_BUTTON','VISIBLE_TEXT_TYPE','PAGE_VERTICAL_SCROLL',
  'BACK','WAIT_CONDITION','SCREENSHOT'
 ]);
 for(const name of stage66AutomaticFeatures()){
  const p=stage66FeaturePlan(name);
  assert.equal(p.provider,'ANDROID');assert.equal(p.manualRequired,false);
  assert.equal(p.replayAllowed,false);
 }
});
test('three-round unresolved features are manual',()=>{
 assert.deepEqual(stage66ManualFeatures(),[
  'NATIVE_SELECT','NESTED_VERTICAL_SCROLL','HORIZONTAL_SCROLL',
  'PRESS_KEY','RETURN_TO_CHROME_FROM_OTHER_APP'
 ]);
 for(const name of stage66ManualFeatures()){
  const p=stage66FeaturePlan(name);
  assert.equal(p.provider,'MANUAL');assert.equal(p.manualRequired,true);
  assert.equal(p.replayAllowed,false);
 }
});
test('unknown feature fails closed to manual',()=>{
 const p=stage66FeaturePlan('future-feature');
 assert.equal(p.provider,'MANUAL');assert.equal(p.reason,'FEATURE_NOT_VERIFIED');
});
