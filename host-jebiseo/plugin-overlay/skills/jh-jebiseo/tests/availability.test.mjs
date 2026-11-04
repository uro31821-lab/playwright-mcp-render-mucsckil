import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveGeminiAvailability} from '../scripts/availability.mjs';

const completeFixture=Object.freeze({
  schema:'jh.jebiseo-capabilities.v1', provider:'gemini',
  internalExecutionSupported:true, geminiAssistanceAvailable:true, liveExecutionVerified:true
});

test('missing or unrelated provider evidence cannot activate Gemini',()=>{
  for(const status of [undefined,null,[],{},'connected',
    {...completeFixture,schema:'unrelated.v1'}, {...completeFixture,provider:'other'}]){
    const result=resolveGeminiAvailability(status);
    assert.equal(result.available,false);
    assert.deepEqual(result.capabilities,[]);
    assert.equal(result.reason,'GEMINI_PROVIDER_STATUS_REQUIRED');
  }
});

test('current mobile candidate remains unavailable despite having a mobile route',()=>{
  const result=resolveGeminiAvailability({
    schema:'jh.jebiseo-capabilities.v1', provider:'gemini', mobileRoute:'android_right',
    internalExecutionSupported:false, geminiAssistanceAvailable:false, liveExecutionVerified:false
  });
  assert.equal(result.available,false);
  assert.deepEqual(result.capabilities,[]);
  assert.equal(result.reason,'HIDDEN_EXECUTION_UNAVAILABLE');
});

test('a visible live execution does not satisfy the hidden execution requirement',()=>{
  const result=resolveGeminiAvailability({...completeFixture,internalExecutionSupported:false});
  assert.equal(result.available,false);
  assert.deepEqual(result.capabilities,[]);
  assert.equal(result.reason,'HIDDEN_EXECUTION_UNAVAILABLE');
});

test('internal support without available Gemini remains unavailable',()=>{
  const result=resolveGeminiAvailability({...completeFixture,geminiAssistanceAvailable:false});
  assert.equal(result.reason,'GEMINI_ASSISTANCE_UNAVAILABLE');
  assert.deepEqual(result.capabilities,[]);
});

test('unverified live execution never becomes available through code validation',()=>{
  const result=resolveGeminiAvailability({...completeFixture,liveExecutionVerified:false,codeTestsPassed:398});
  assert.equal(result.reason,'GEMINI_LIVE_EXECUTION_UNVERIFIED');
  assert.deepEqual(result.capabilities,[]);
});

test('truthy non-booleans cannot activate any required gate',()=>{
  for(const field of ['internalExecutionSupported','geminiAssistanceAvailable','liveExecutionVerified']){
    for(const value of ['true',1,null,undefined]){
      const result=resolveGeminiAvailability({...completeFixture,[field]:value});
      assert.equal(result.available,false);
      assert.deepEqual(result.capabilities,[]);
    }
  }
});

test('complete synthetic status yields a planning capability without effects or authority',()=>{
  const before=JSON.stringify(completeFixture);
  const result=resolveGeminiAvailability(completeFixture);
  assert.equal(result.available,true);
  assert.deepEqual(result.capabilities,['gemini-assistance']);
  assert.equal(result.reason,null);
  assert.equal(result.authorizesExecution,false);
  assert.equal(result.dispatchesTools,false);
  assert.equal(result.changesPersistentState,false);
  assert.equal(JSON.stringify(completeFixture),before);
});
