import test from 'node:test';
import assert from 'node:assert/strict';
import {selectEbiseoAudioV05} from '../jh168-mobile-unification/stage25-live-operator-followup-entry.mjs';
const prod={
  CI:'false',RENDER_SERVICE_ID:'srv-db0fjl2d0e5s73be114g',JH_DURABLE_RELEASE:'SERVE_READY_V1',
  JH_PENDING_APPROVAL_OPERATOR_ENABLE:'EXPLICIT_OPERATOR_APPROVAL_RECEIPT_V1',
  JH_SPLIT_FOLLOWUP_OPERATOR_ENABLE:'EXPLICIT_FOLLOWUP_CLICK_RECEIPT_V1'
};
test('audio flag absent preserves original Stage25 path',()=>{
  assert.equal(selectEbiseoAudioV05({...prod}),false);
  assert.equal(selectEbiseoAudioV05({...prod,JH_EBISEO_AUDIO_ENABLE:''}),false);
});
test('exact audio flag is explicit opt-in only',()=>{
  assert.equal(selectEbiseoAudioV05({...prod,JH_EBISEO_AUDIO_ENABLE:'EXPLICIT_EBISEO_AUDIO_V05'}),true);
});
test('invalid audio flag fails closed',()=>{
  assert.throws(()=>selectEbiseoAudioV05({...prod,JH_EBISEO_AUDIO_ENABLE:'1'}),{code:'JH_EBISEO_AUDIO_FLAG_INVALID'});
});
test('audio flag cannot bypass original Stage25 production authority',()=>{
  assert.throws(()=>selectEbiseoAudioV05({JH_EBISEO_AUDIO_ENABLE:'EXPLICIT_EBISEO_AUDIO_V05'}),{code:'JH_EBISEO_AUDIO_EXISTING_OPERATOR_REQUIRED'});
});
