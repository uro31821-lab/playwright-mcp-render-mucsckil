import test from 'node:test';
import assert from 'node:assert/strict';
import {diagnoseJH} from './jh-self-diagnostic.mjs';
const yes = async()=>({state:'PASS',code:'VERIFIED'});
test('all good',async()=>{const r=await diagnoseJH({server:yes,mcp:yes,browser:yes,bridge:yes,security:yes});assert.equal(r.overall,'PASS');assert.equal(r.checks.length,5);assert.deepEqual(r.actionsPerformed,[]);});
test('absent adapters are unknown, not false success',async()=>{const r=await diagnoseJH({server:yes});assert.equal(r.overall,'PARTIAL');assert.equal(r.checks.filter(x=>x.state==='UNKNOWN').length,4);});
test('a failed secure session is distinct from bridge',async()=>{const r=await diagnoseJH({server:yes,mcp:yes,browser:yes,bridge:yes,security:async()=>({state:'FAIL',code:'SECURE_SESSION_EXPIRED'})});assert.equal(r.overall,'FAIL');assert.equal(r.checks.find(x=>x.id==='bridge').state,'PASS');});
test('throwing adapter does not leak exception',async()=>{const r=await diagnoseJH({server:async()=>{throw new Error('secret token ABC');}});assert.equal(r.checks[0].code,'CHECK_ERROR');assert.equal(JSON.stringify(r).includes('secret'),false);});
import {createJHLiveAdapters} from './jh-live-adapters.mjs';
test('real status adapters cannot silently promote heartbeat to authenticated device verification', async()=>{
 const a=createJHLiveAdapters({serverStatus:async()=>({version:'1.5.0'}),mcpProbe:async()=>({verified:true}),browserStatus:async()=>({browser:'ready'}),androidDevices:async()=>({devices:[{active:true}]}),secureStatus:async()=>({status:'complete',result:{code:'secure_status_verified',secureActive:true,deviceResponded:true}})});
 const r=await diagnoseJH(a);assert.equal(r.overall,'PARTIAL');assert.equal(r.checks.find(x=>x.id==='bridge').code,'SIGNED_DEVICE_READ_REQUIRED');assert.equal(r.checks.find(x=>x.id==='security').state,'PASS');
});
test('absent evidence never becomes PASS',async()=>{const r=await diagnoseJH(createJHLiveAdapters());assert.equal(r.overall,'PARTIAL');assert.ok(r.checks.every(x=>x.state==='UNKNOWN'));});
