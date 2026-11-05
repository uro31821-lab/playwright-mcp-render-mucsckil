import test from 'node:test';
import assert from 'node:assert/strict';
import {nextStage64FeatureProvider,compactVerifiedFeatureProfileStage64,
 stage64FeatureDefinition,STAGE64_FEATURE_VERSION} from './stage64-feature-fallback.mjs';

test('CLICK tries Android Web then Android Computer Use then Playwright Mobile',()=>{
 assert.equal(nextStage64FeatureProvider({action:'CLICK'}).provider,'ANDROID_WEB');
 assert.equal(nextStage64FeatureProvider({action:'CLICK',
  webOutcome:'VERIFIED_UNSUPPORTED_NO_EFFECT'}).provider,'ANDROID_COMPUTER_USE');
 assert.equal(nextStage64FeatureProvider({action:'CLICK',
  webOutcome:'VERIFIED_UNSUPPORTED_NO_EFFECT',
  computerOutcome:'FAILED_NO_EFFECT',playwrightMobileAvailable:true}).provider,'PLAYWRIGHT_MOBILE');
});
test('verified no-effect Android failures may fall through but uncertain/effectful states may not',()=>{
 assert.equal(nextStage64FeatureProvider({action:'CLICK',
  webOutcome:'FAILED_NO_EFFECT'}).provider,'ANDROID_COMPUTER_USE');
 assert.equal(nextStage64FeatureProvider({action:'CLICK',
  webOutcome:'UNKNOWN'}).provider,'STOP_NO_REPLAY');
});
test('unavailable Playwright Mobile becomes explicit manual action, not hidden retry',()=>{
 const r=nextStage64FeatureProvider({action:'SELECT_PICK',
  webOutcome:'VERIFIED_UNSUPPORTED_NO_EFFECT',
  computerOutcome:'VERIFIED_UNSUPPORTED_NO_EFFECT',
  playwrightMobileAvailable:false});
 assert.equal(r.provider,'MANUAL');assert.equal(r.manualRequired,true);
 assert.equal(r.allowed,false);assert.equal(r.replayAllowed,false);
});
test('native app action never pretends Playwright Mobile can replace Android',()=>{
 const d=stage64FeatureDefinition('NATIVE_APP_ACTION');assert.equal(d.playwrightMobile,false);
 const r=nextStage64FeatureProvider({action:'NATIVE_APP_ACTION',
  computerOutcome:'VERIFIED_UNSUPPORTED_NO_EFFECT',playwrightMobileAvailable:true});
 assert.equal(r.provider,'MANUAL');
});
test('post-verification profile keeps only verified working automatic routes',()=>{
 const p=compactVerifiedFeatureProfileStage64([
  {action:'SNAPSHOT',provider:'ANDROID_WEB',outcome:'VERIFIED_PASS'},
  {action:'TYPE',provider:'ANDROID_WEB',outcome:'FAILED_NO_EFFECT'},
  {action:'TYPE',provider:'PLAYWRIGHT_MOBILE',outcome:'VERIFIED_PASS'},
  {action:'CLICK',provider:'ANDROID_WEB',outcome:'VERIFIED_UNSUPPORTED_NO_EFFECT'}
 ]);
 assert.equal(p.version,STAGE64_FEATURE_VERSION);
 assert.deepEqual(p.features.SNAPSHOT,{provider:'ANDROID_WEB',verified:true,manualRequired:false});
 assert.deepEqual(p.features.TYPE,{provider:'PLAYWRIGHT_MOBILE',verified:true,manualRequired:false});
 assert.deepEqual(p.features.CLICK,{provider:'MANUAL',verified:false,manualRequired:true});
});
