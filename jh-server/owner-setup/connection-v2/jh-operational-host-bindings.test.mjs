import test from 'node:test';
import assert from 'node:assert/strict';
import {createJH167OperationalHostBindings} from './jh-operational-host-bindings.mjs';
const base={authenticatedOwner:true,sameProcess:true,pendingDiscard:false,serverRestarting:false,
 activeMcpCalls:0,activeWorkflows:0,queuedJobs:0,runningJobs:0,unresolvedEffects:0,activeBrowserCalls:0};
function make({state={},notifier,probe=async()=>{}}={}) {
 let hooks;
 let reads=0;
 const adapter=createJH167OperationalHostBindings({
  readOwnerSnapshot:()=>({...base,...state}),
  installOwnerAdmissionGate: gates=>{hooks=gates;return {ownerVerified:true,beginCommandHooked:true,jobDispatchHooked:true,sameProcess:true}},
  browserSession:{probe:async()=>{reads++;await probe();}},
  approvedOwnerNotifier:notifier,
 });
 return {adapter, hooks, reads:()=>reads};
}
const params={purpose:'BROWSER_TRANSPORT_SOFT_RECONNECT'};
const reconnect={action:'BROWSER_TRANSPORT_SOFT_RECONNECT',scope:'TRANSPORT_ONLY',noNewCommand:true,noNavigation:true};
test('host installation requires actual command and job-dispatch fences',()=>{
 assert.throws(()=>createJH167OperationalHostBindings({readOwnerSnapshot:()=>base,browserSession:{probe:()=>{}},
  installOwnerAdmissionGate:()=>({ownerVerified:true,beginCommandHooked:true})}),
 /JH_V2_OWNER_ADMISSION_GATE_UNVERIFIED/);
});
test('idle state grants single atomic lease and gates new commands/jobs',async()=>{
 const {adapter,hooks}=make();
 const lease=await adapter.acquireExclusiveIdleMaintenanceLease(params);
 assert.equal(lease.exclusive,true);
 assert.equal(hooks.allowBeginCommand(),false);
 assert.equal(hooks.allowJobDispatch(),false);
 assert.equal(await adapter.acquireExclusiveIdleMaintenanceLease(params),null);
 await lease.release();await lease.release();
 assert.equal(hooks.allowBeginCommand(),true);
 assert.equal(hooks.allowJobDispatch(),true);
});
test('active workflow, job, browser request or uncertain effect prevents lease',async()=>{
 for(const key of ['activeMcpCalls','activeWorkflows','queuedJobs','runningJobs','unresolvedEffects','activeBrowserCalls']){
  const {adapter}=make({state:{[key]:1}});
  assert.equal((await adapter.verifiedWorkflowIdle()).idle,false,key);
  assert.equal(await adapter.acquireExclusiveIdleMaintenanceLease(params),null,key);
 }
});
test('unverified owner status fails closed; never claims idle',async()=>{
 const {adapter}=make({state:{authenticatedOwner:false}});
 assert.deepEqual(await adapter.verifiedWorkflowIdle(),{verified:false,idle:false});
 assert.equal(await adapter.acquireExclusiveIdleMaintenanceLease(params),null);
});
test('transport-only probe cannot run outside lease or with altered action scope',async()=>{
 const {adapter,reads}=make();
 assert.equal((await adapter.rehandshakeBrowserTransportOnly(reconnect)).ok,false);
 const lease=await adapter.acquireExclusiveIdleMaintenanceLease(params);
 assert.equal((await adapter.rehandshakeBrowserTransportOnly({...reconnect,noNavigation:false})).ok,false);
 assert.equal(reads(),0);
 assert.deepEqual(await adapter.rehandshakeBrowserTransportOnly(reconnect),{ok:true,mode:'TRANSPORT_ONLY'});
 assert.equal(reads(),1);
 await lease.release();
});
test('probe failure cannot be reported as successful transport recovery',async()=>{
 const {adapter}=make({probe:async()=>{throw Error('synthetic network failure')}});
 const lease=await adapter.acquireExclusiveIdleMaintenanceLease(params);
 assert.deepEqual(await adapter.rehandshakeBrowserTransportOnly(reconnect),{ok:false,mode:'TRANSPORT_ONLY'});
 await lease.release();
});
test('unknown, unapproved or unacknowledged alerts never report delivered',async()=>{
 const event={cause:'OPEN_JH_SECURE',type:'MANUAL_REQUIRED',noTaskReplay:true,nextStep:'sensitive text'};
 const a=make().adapter;
 assert.deepEqual(await a.notifyOwnerThroughExistingApprovedChannel(event),{delivered:false,code:'NOT_CONFIGURED'});
 const b=make({notifier:{approved:false,send:async()=>({delivered:true,acknowledged:true})}}).adapter;
 assert.equal((await b.notifyOwnerThroughExistingApprovedChannel(event)).delivered,false);
 let seen;
 const c=make({notifier:{approved:true,send:async x=>{seen=x;return {delivered:true,acknowledged:false}}}}).adapter;
 assert.deepEqual(await c.notifyOwnerThroughExistingApprovedChannel(event),{delivered:false,code:'NOT_CONFIRMED'});
 assert.deepEqual(seen,{version:2,kind:'JH_CONNECTIVITY_ACTION_REQUIRED',cause:'OPEN_JH_SECURE',noTaskReplay:true});
});
test('only existing approved channel and real ACK count as delivery',async()=>{
 const e={cause:'CHECK_BROWSER_SESSION',type:'MANUAL_REQUIRED',noTaskReplay:true};
 const a=make({notifier:{approved:true,send:async()=>({delivered:true,acknowledged:true})}}).adapter;
 assert.deepEqual(await a.notifyOwnerThroughExistingApprovedChannel(e),{delivered:true,code:'CONFIRMED'});
});
