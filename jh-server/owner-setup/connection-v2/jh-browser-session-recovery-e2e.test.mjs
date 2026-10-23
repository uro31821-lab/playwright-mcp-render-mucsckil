import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserSession } from '../../browser-session.mjs';
import { createJHAutoRecovery } from './jh-auto-recovery.mjs';
import { createJH167OperationalHostBindings } from './jh-operational-host-bindings.mjs';

const IDS=['server','mcp','browser','bridge','security'];
const ownerIdle={authenticatedOwner:true,sameProcess:true,pendingDiscard:false,serverRestarting:false,
  activeMcpCalls:0,activeWorkflows:0,queuedJobs:0,runningJobs:0,unresolvedEffects:0,activeBrowserCalls:0};
const report=up=>({checks:IDS.map(id=>id==='browser'&&!up
  ? {id,state:'FAIL',code:'BROWSER_UNAVAILABLE'}:{id,state:'PASS',code:'VERIFIED'})});
function sandbox({idle=ownerIdle}={}){
  let online=false, ready=false, gate, ops=[];
  const transport={async request(req){
    const payload=JSON.parse(req.body);
    ops.push(payload.method);
    if(!online)return new Response('isolated transport unavailable',{status:503});
    if(payload.method==='initialize')return new Response(JSON.stringify({
      jsonrpc:'2.0',id:payload.id,result:{protocolVersion:'2025-03-26',capabilities:{}}
    }),{status:200,headers:{'content-type':'application/json','mcp-session-id':'isolated-s1'}});
    if(payload.method==='notifications/initialized')return new Response(null,{status:204});
    if(payload.method==='tools/list')return new Response(JSON.stringify({
      jsonrpc:'2.0',id:payload.id,result:{tools:[]}
    }),{status:200,headers:{'content-type':'application/json'}});
    throw new Error('BROWSER_ACTION_MUST_NOT_RUN_DURING_RECOVERY');
  }};
  const browser=createBrowserSession({transport});
  const hooks=createJH167OperationalHostBindings({
    readOwnerSnapshot:()=>({...idle}),
    installOwnerAdmissionGate:g=>{
      gate=g;return {ownerVerified:true,beginCommandHooked:true,jobDispatchHooked:true,sameProcess:true};
    },
    browserSession:{probe:async()=>{await browser.probe();ready=true}},
    approvedOwnerNotifier:null,
  });
  const monitor=createJHAutoRecovery({
    diagnose:async()=>report(ready),
    isIdle:hooks.verifiedWorkflowIdle,
    acquireMaintenanceLease:hooks.acquireExclusiveIdleMaintenanceLease,
    reconnectBrowserTransport:hooks.rehandshakeBrowserTransportOnly,
    notifyUser:hooks.notifyOwnerThroughExistingApprovedChannel,
  });
  return {monitor,hooks,gate,ops:()=>ops,restore:()=>{online=true},ready:()=>ready};
}
test('genuine BrowserSession tools/list recovery after isolated transport outage',async()=>{
  const s=sandbox();
  assert.equal((await s.monitor.tick()).status,'OBSERVING');
  assert.equal(s.ops().length,0);
  s.restore();
  const result=await s.monitor.tick();
  assert.equal(result.status,'RECOVERED');
  assert.equal(result.recoveryActions[0].outcome,'VERIFIED');
  assert.deepEqual(s.ops(),['initialize','notifications/initialized','tools/list']);
  assert.ok(!s.ops().includes('tools/call'));
  assert.equal(s.ready(),true);
  assert.equal(s.hooks.maintenanceActive,false);
  assert.equal(s.gate.allowBeginCommand(),true);
  assert.equal(s.gate.allowJobDispatch(),true);
  assert.equal(result.noTaskReplay,true);
});
test('unavailable transport cannot be labeled recovered even after an attempt',async()=>{
  const s=sandbox();
  assert.equal((await s.monitor.tick()).status,'OBSERVING');
  const result=await s.monitor.tick();
  assert.equal(result.status,'RETRY_SCHEDULED');
  assert.equal(result.recoveryActions[0].outcome,'NOT_CONFIRMED');
  assert.deepEqual(s.ops(),['initialize']);
  assert.equal(s.hooks.maintenanceActive,false);
  assert.equal(s.gate.allowBeginCommand(),true);
});
test('work in progress prevents browser transport recovery or metadata request',async()=>{
  const s=sandbox({idle:{...ownerIdle,activeWorkflows:1}});
  assert.equal((await s.monitor.tick()).status,'OBSERVING');
  s.restore();
  const result=await s.monitor.tick();
  assert.equal(result.status,'WAITING_FOR_IDLE');
  assert.equal(s.ops().length,0);
  assert.equal(s.hooks.maintenanceActive,false);
});
