import test from 'node:test';
import assert from 'node:assert/strict';
import {stage66FeaturePlan,stage66AutomaticFeatures,stage66ManualFeatures,
 STAGE66_PLAYWRIGHT_MOBILE,STAGE66_PROFILE_VERSION} from './stage66-verified-mobile-feature-profile.mjs';

test('profile exposes only real-device verified Android automatic routes',()=>{
 assert.equal(STAGE66_PROFILE_VERSION,'JH168_STAGE66_VERIFIED_MOBILE_FEATURE_PROFILE_V1');
 assert.deepEqual(stage66AutomaticFeatures(),[
  'OPEN_RIGHT_URL','READ_RIGHT_SCREEN','VISIBLE_SAFE_BUTTON_CLICK',
  'DIALOG_OPEN','DIALOG_CLOSE_BUTTON','VISIBLE_TEXT_TYPE','PAGE_VERTICAL_SCROLL'
 ]);
 for(const name of stage66AutomaticFeatures()){
  const p=stage66FeaturePlan(name);
  assert.equal(p.provider,'ANDROID');assert.equal(p.manualRequired,false);
  assert.equal(p.replayAllowed,false);
 }
});
test('failed or unverified features are manual while phone Playwright Mobile is unconnected',()=>{
 assert.equal(STAGE66_PLAYWRIGHT_MOBILE.connected,false);
 assert.deepEqual(STAGE66_PLAYWRIGHT_MOBILE.verifiedFeatures,[]);
 for(const name of ['NATIVE_SELECT','NESTED_VERTICAL_SCROLL','HORIZONTAL_SCROLL',
  'BACK','PRESS_KEY','WAIT_CONDITION','SCREENSHOT','RETURN_TO_CHROME_FROM_OTHER_APP']){
  const p=stage66FeaturePlan(name);
  assert.equal(p.provider,'MANUAL');assert.equal(p.manualRequired,true);
  assert.equal(p.playwrightMobileTried,false);assert.equal(p.replayAllowed,false);
 }
});
test('unknown feature fails closed to manual',()=>{
 const p=stage66FeaturePlan('future-feature');
 assert.equal(p.provider,'MANUAL');assert.equal(p.reason,'FEATURE_NOT_VERIFIED');
});
