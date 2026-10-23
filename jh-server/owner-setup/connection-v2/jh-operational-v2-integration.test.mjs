import test from 'node:test';
import assert from 'node:assert/strict';
import {createJH167DiagnosticIntegration} from './jh167-v2-bridge.mjs';
import {createJH167OperationalHostBindings} from './jh-operational-host-bindings.mjs';
const ready = {authenticatedOwner:true,sameProcess:true,pendingDiscard:false,serverRestarting:false,
 activeMcpCalls:0,activeWorkflows:0,queuedJobs:0,runningJobs:0,unresolvedEffects:0,activeBrowserCalls:0};
const secure={status:'complete',result:{code:'secure_status_verified',secureActive:true,deviceResponded:true}};
function setup({busy=false,channel=false}={}) {
 let browserReady=false;let probes=0;let gate;let notified=[];
 const bindings=createJH167OperationalHostBindings({
  readOwnerSnapshot:()=>({...ready,activeWorkflows:busy?1:0}),
  installOwnerAdmissionGate:x=>{gate=x;return {ownerVerified:true,beginCommandHooked:true,jobDispatchHooked:true,sameProcess:true}},
  browserSession:{probe:async()=>{browserReady=true}},
  approvedOwnerNotifier:channel?{approved:true,send:async n=>{notified.push(n);return {delivered:true,acknowledged:true}}}:null,
 });
 const probesApi={
  serverStatus:async()=>({version:'JH167'}),mcpProbe:async()=>({verified:true}),
  browserStatus:async()=>{probes++;return {browser:browserReady?'ready':'unavailable'}},
  androidDevices:async()=>({devices:[{active:true}]}),secureStatus:async()=>secure,
 };
 const integration=createJH167DiagnosticIntegration({probes:probesApi,workflow:bindings},{enableRecovery:true});
 return {integration,gate,bindings,probeCount:()=>probes,notifications:()=>notified};
}
test('real V2 logic + host lease recovers metadata without dispatch or notification',async()=>{
 const {integration,gate,bindings,probeCount,notifications}=setup();
 assert.equal((await integration.tick()).status,'OBSERVING');
 const fixed=await integration.tick();
 assert.equal(fixed.status,'RECOVERED');
 assert.equal(fixed.recoveryActions[0].outcome,'VERIFIED');
 assert.equal(gate.allowBeginCommand(),true);
 assert.equal(gate.allowJobDispatch(),true);
 assert.equal(bindings.maintenanceActive,false);
 assert.equal(notifications().length,0);
 assert.ok(probeCount()>=3);
});
test('real V2 logic waits when workflow not idle; no transport probe',async()=>{
 const {integration,gate}=setup({busy:true});
 await integration.tick();
 const r=await integration.tick();
 assert.equal(r.status,'WAITING_FOR_IDLE');
 assert.equal(gate.allowBeginCommand(),true);
});
