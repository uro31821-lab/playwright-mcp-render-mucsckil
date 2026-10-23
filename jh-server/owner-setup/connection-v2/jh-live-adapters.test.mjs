import test from 'node:test';
import assert from 'node:assert/strict';
import {createJHLiveAdapters} from './jh-live-adapters.mjs';
import {diagnoseJH} from './jh-self-diagnostic.mjs';
const base={
  serverStatus:async()=>({version:'JH_SECURE56'}),
  mcpProbe:async()=>({verified:true}),
  browserStatus:async()=>({browser:'ready'}),
  androidDevices:async()=>({devices:[{active:true}]})
};
const signed=()=>({source:'SECURE56_MAC_VALIDATED_POLL',verified:true,sessionBound:true,serverVerified:true,ageMs:1500});
test('an active device list without signed poll is insufficient',async()=>{
  const o=await diagnoseJH(createJHLiveAdapters(base));
  assert.equal(o.overall,'PARTIAL');
  assert.equal(o.checks.find(x=>x.id==='bridge').code,'SIGNED_DEVICE_READ_REQUIRED');
  assert.equal(o.checks.find(x=>x.id==='security').state,'UNKNOWN');
});
test('fresh server-verified signed poll proves connection without inventing UI success',async()=>{
  const o=await diagnoseJH(createJHLiveAdapters({...base,signedDevicePoll:async()=>signed()}));
  assert.equal(o.overall,'PASS');
  assert.equal(o.checks.find(x=>x.id==='bridge').code,'SIGNED_BRIDGE_POLL_VERIFIED');
  assert.equal(o.checks.find(x=>x.id==='security').code,'SECURE_SIGNED_POLL_VERIFIED');
});
test('stale, session-unbound, unsigned and future evidence remains unknown',async()=>{
  for(const proof of [
    {...signed(),ageMs:30001}, {...signed(),ageMs:-1},
    {...signed(),sessionBound:false}, {...signed(),serverVerified:false},
    {...signed(),source:'DEVICE_LIST'}, {...signed(),ageMs:'100'}, null
  ]){
    const o=await diagnoseJH(createJHLiveAdapters({...base,signedDevicePoll:async()=>proof}));
    assert.equal(o.overall,'PARTIAL',JSON.stringify(proof));
    assert.equal(o.checks.find(x=>x.id==='bridge').state,'UNKNOWN');
    assert.equal(o.checks.find(x=>x.id==='security').state,'UNKNOWN');
  }
});
test('verified session failure outranks recent poll proof',async()=>{
  const o=await diagnoseJH(createJHLiveAdapters({...base,signedDevicePoll:async()=>signed(),
    secureStatus:async()=>({status:'complete',result:{secureActive:false}})}));
  assert.equal(o.overall,'FAIL');
  assert.equal(o.checks.find(x=>x.id==='security').code,'SECURE_SESSION_INACTIVE');
});
test('direct device status without signed poll does not promote bridge',async()=>{
  const o=await diagnoseJH(createJHLiveAdapters({...base,
    secureStatus:async()=>({status:'complete',result:{
      secureActive:true,deviceResponded:true,code:'secure_status_verified'
    }})}));
  assert.equal(o.overall,'PARTIAL');
  assert.equal(o.checks.find(x=>x.id==='security').code,'SECURE_DEVICE_VERIFIED');
  assert.equal(o.checks.find(x=>x.id==='bridge').state,'UNKNOWN');
});
