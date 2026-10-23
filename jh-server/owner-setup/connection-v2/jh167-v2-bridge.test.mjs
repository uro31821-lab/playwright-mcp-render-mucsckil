import test from 'node:test';
import assert from 'node:assert/strict';
import {createJH167DiagnosticIntegration} from './jh167-v2-bridge.mjs';

function healthyProbes(onProbe=()=>{}) {
  return {
    serverStatus: async()=>{onProbe();return {version:'jh167'};},
    mcpProbe: async()=>({verified:true}),
    browserStatus: async()=>({browser:'ready'}),
    androidDevices: async()=>({devices:[{active:true}]}),
    secureStatus: async()=>({status:'complete',result:{secureActive:true,deviceResponded:true,code:'secure_status_verified'}}),
  };
}

test('import and construction never start background timers or user actions', async()=>{
  let n=0;
  const bridge=createJH167DiagnosticIntegration({probes:healthyProbes(()=>n++)});
  assert.equal(n,0);
  assert.equal(bridge.enableRecovery,false);
  assert.equal(bridge.isRunning,false);
  assert.equal(bridge.start(),false);
  assert.equal((await bridge.tick()).status,'DISABLED');
  assert.equal(n,0);
});

test('explicit read-only diagnosis runs without launch or recovery',async()=>{
  const bridge=createJH167DiagnosticIntegration({probes:healthyProbes()});
  const result=await bridge.diagnose();
  assert.equal(result.overall,'PARTIAL'); // Android listing alone cannot verify signed UI response
  assert.equal(result.actionsPerformed.length,0);
  assert.equal(result.checks.find(x=>x.id==='security').state,'PASS');
  assert.equal(bridge.isRunning,false);
});

test('missing callbacks cannot enable browser recovery',()=>{
  assert.throws(()=>createJH167DiagnosticIntegration({probes:healthyProbes()}, {enableRecovery:true}),
    e=>e.code==='JH_RECOVERY_V2_TRUSTED_HOST_CALLBACKS_REQUIRED');
});

test('no probes returns unknown instead of fabricated healthy status',async()=>{
  const x=createJH167DiagnosticIntegration();
  const r=await x.diagnose();
  assert.equal(r.overall,'PARTIAL');
  assert.ok(r.checks.every(c=>c.state==='UNKNOWN'));
});

test('opted-in integration remains stopped until host starts and reads actual checks',async()=>{
  let changed=0;
  const bridge=createJH167DiagnosticIntegration({probes:healthyProbes(),workflow:{
    verifiedWorkflowIdle:async()=>({verified:true,idle:true}),
    acquireExclusiveIdleMaintenanceLease:async()=>{changed++;return null;},
    rehandshakeBrowserTransportOnly:async()=>{changed++;return {ok:false};},
    notifyOwnerThroughExistingApprovedChannel:async()=>{changed++;return {delivered:false};},
  }},{enableRecovery:true});
  assert.equal(bridge.isRunning,false);
  const x=await bridge.tick();
  assert.equal(x.status,'UNVERIFIED');
  assert.equal(changed,0);
  bridge.stop();
});
