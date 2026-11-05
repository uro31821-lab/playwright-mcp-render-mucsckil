import test from 'node:test';
import assert from 'node:assert/strict';
import {nextStage64FeatureProvider,compactVerifiedFeatureProfileStage64,
 stage64FeatureDefinition,STAGE64_FEATURE_VERSION} from './stage64-feature-fallback.mjs';

test('CLICK tries Android Web then Android Computer Use then manual',()=>{
 assert.equal(nextStage64FeatureProvider({action:'CLICK'}).provider,'ANDROID_WEB');
 assert.equal(nextStage64FeatureProvider({action:'CLICK',
  webOutcome:'VERIFIED_UNSUPPORTED_NO_EFFECT'}).provider,'ANDROID_COMPUTER_USE');
 const r=nextStage64FeatureProvider({action:'CLICK',
  webOutcome:'VERIFIED_UNSUPPORTED_NO_EFFECT',computerOutcome:'FAILED_NO_EFFECT'});
 assert.equal(r.provider,'MANUAL');assert.equal(r.manualRequired,true);
});
test('verified no-effect Android failures may fall through but uncertain/effectful states may not',()=>{
 assert.equal(nextStage64FeatureProvider({action:'CLICK',webOutcome:'FAILED_NO_EFFECT'}).provider,'ANDROID_COMPUTER_USE');
 assert.equal(nextStage64FeatureProvider({action:'CLICK',webOutcome:'UNKNOWN'}).provider,'STOP_NO_REPLAY');
});
test('exhausted SELECT routes become explicit manual action',()=>{
 const r=nextStage64FeatureProvider({action:'SELECT_PICK',
  webOutcome:'VERIFIED_UNSUPPORTED_NO_EFFECT',computerOutcome:'VERIFIED_UNSUPPORTED_NO_EFFECT'});
 assert.equal(r.provider,'MANUAL');assert.equal(r.manualRequired,true);
 assert.equal(r.allowed,false);assert.equal(r.replayAllowed,false);
});
test('native app action uses Android only then manual',()=>{
 const d=stage64FeatureDefinition('NATIVE_APP_ACTION');
 assert.deepEqual([...d.android],['ANDROID_COMPUTER_USE']);
 const r=nextStage64FeatureProvider({action:'NATIVE_APP_ACTION',
  computerOutcome:'VERIFIED_UNSUPPORTED_NO_EFFECT'});
 assert.equal(r.provider,'MANUAL');
});
test('post-verification profile keeps only verified Android routes',()=>{
 const p=compactVerifiedFeatureProfileStage64([
  {action:'SNAPSHOT',provider:'ANDROID_WEB',outcome:'VERIFIED_PASS'},
  {action:'TYPE',provider:'ANDROID_WEB',outcome:'FAILED_NO_EFFECT'},
  {action:'CLICK',provider:'ANDROID_WEB',outcome:'VERIFIED_UNSUPPORTED_NO_EFFECT'}
 ]);
 assert.equal(p.version,STAGE64_FEATURE_VERSION);
 assert.deepEqual(p.features.SNAPSHOT,{provider:'ANDROID_WEB',verified:true,manualRequired:false});
 assert.deepEqual(p.features.TYPE,{provider:'MANUAL',verified:false,manualRequired:true});
 assert.deepEqual(p.features.CLICK,{provider:'MANUAL',verified:false,manualRequired:true});
});
test('KEYPRESS_ENTER_TAB uses Android Computer Use first',()=>{
 const r=nextStage64FeatureProvider({action:'KEYPRESS_ENTER_TAB'});
 assert.equal(r.provider,'ANDROID_COMPUTER_USE');
 assert.equal(r.code,'TRY_EXISTING_ANDROID_COMPUTER_USE');
});
