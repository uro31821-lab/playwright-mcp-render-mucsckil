import test from 'node:test';
import assert from 'node:assert/strict';
import { createJHAutoRecovery } from './jh-auto-recovery.mjs';

const ids=['server','mcp','browser','bridge','security'];
function report(overrides={}){
 const checks=ids.map(id=>({id,state:overrides[id]?.state??'PASS',code:overrides[id]?.code??'VERIFIED'}));
 return {overall:checks.every(x=>x.state==='PASS')?'PASS':'FAIL',checks};
}
const browserFail=()=>report({browser:{state:'FAIL',code:'BROWSER_SESSION_EXPIRED'}});
const pass=()=>report();
const idle=async()=>({verified:true,idle:true});
const lease=async()=>({verified:true,idle:true,exclusive:true,release:async()=>{}});

test('healthy checks do not run actions or alerts',async()=>{
 let called=0;
 const monitor=createJHAutoRecovery({diagnose:async()=>pass(),isIdle:idle,acquireMaintenanceLease:lease,reconnectBrowserTransport:async()=>{called++;}});
 assert.equal((await monitor.tick()).status,'HEALTHY');assert.equal(called,0);
});
test('incomplete evidence is not treated as an incident',async()=>{
 let called=0;const monitor=createJHAutoRecovery({diagnose:async()=>report({bridge:{state:'UNKNOWN',code:'SIGNED_DEVICE_READ_REQUIRED'}}),isIdle:idle,acquireMaintenanceLease:lease,reconnectBrowserTransport:async()=>{called++;}});
 assert.equal((await monitor.tick()).status,'UNVERIFIED');assert.equal(called,0);
});
test('single transient failure does not attempt recovery',async()=>{
 let repairs=0;const monitor=createJHAutoRecovery({diagnose:async()=>browserFail(),isIdle:idle,acquireMaintenanceLease:lease,reconnectBrowserTransport:async()=>{repairs++;}});
 assert.equal((await monitor.tick()).status,'OBSERVING');assert.equal(repairs,0);
});
test('confirmed browser transport failure recovers with idle proof and readback',async()=>{
 let fixed=false,calls=0,alerts=0;
 const m=createJHAutoRecovery({diagnose:async()=>fixed?pass():browserFail(),isIdle:idle,acquireMaintenanceLease:lease,
  reconnectBrowserTransport:async x=>{assert.equal(x.scope,'TRANSPORT_ONLY');assert.equal(x.noNavigation,true);calls++;fixed=true;return {ok:true,mode:'TRANSPORT_ONLY'};},
  notifyUser:async()=>{alerts++;return {delivered:true};}});
 await m.tick();const r=await m.tick();
 assert.equal(r.status,'RECOVERED');assert.equal(r.recoveryActions[0].outcome,'VERIFIED');assert.equal(calls,1);assert.equal(alerts,0);
});
test('failed active/unknown idle gate blocks recovery',async()=>{
 for(const value of [undefined,{verified:false,idle:true},{verified:true,idle:false}]){
  let repairs=0;const m=createJHAutoRecovery({diagnose:async()=>browserFail(),isIdle:async()=>value,acquireMaintenanceLease:lease,
   reconnectBrowserTransport:async()=>{repairs++;}});
  await m.tick();assert.equal((await m.tick()).status,'WAITING_FOR_IDLE');assert.equal(repairs,0);
 }
});
test('no reconnect adapter leads to manual report but no outgoing alert without configured channel',async()=>{
 const m=createJHAutoRecovery({diagnose:async()=>browserFail(),isIdle:idle,acquireMaintenanceLease:lease});
 await m.tick();const r=await m.tick();assert.equal(r.status,'MANUAL_REQUIRED');assert.equal(r.notificationDelivery,'NOT_CONFIGURED');
});
test('persistent browser failure is retried only at cooldown; max attempts trigger one notification',async()=>{
 let now=1000,repair=0,alerts=0;
 const m=createJHAutoRecovery({diagnose:async()=>browserFail(),isIdle:idle,acquireMaintenanceLease:lease,
  reconnectBrowserTransport:async()=>{repair++;return {ok:true,mode:'TRANSPORT_ONLY'};},
  notifyUser:async()=>{alerts++;return {delivered:true};},now:()=>now,initialBackoffMs:1000,maxAttempts:2});
 assert.equal((await m.tick()).status,'OBSERVING');
 assert.equal((await m.tick()).status,'RETRY_SCHEDULED');assert.equal(repair,1);
 assert.equal((await m.tick()).status,'RETRY_SCHEDULED');assert.equal(repair,1);
 now+=2000;let r=await m.tick();assert.equal(r.status,'MANUAL_REQUIRED');assert.equal(repair,2);assert.equal(alerts,1);
 r=await m.tick();assert.equal(r.status,'MANUAL_REQUIRED');assert.equal(repair,2);assert.equal(alerts,1);
});
test('authorization/session failure always asks person, even if browser also fails',async()=>{
 let repair=0;let event;
 const m=createJHAutoRecovery({diagnose:async()=>report({security:{state:'FAIL',code:'SECURE_SESSION_INACTIVE'},browser:{state:'FAIL',code:'BROWSER_SESSION_EXPIRED'}}),
 isIdle:idle,acquireMaintenanceLease:lease,reconnectBrowserTransport:async()=>{repair++;},notifyUser:async e=>{event=e;return {delivered:true};}});
 await m.tick();const r=await m.tick();assert.equal(r.status,'MANUAL_REQUIRED');assert.equal(repair,0);
 assert.equal(event.cause,'REAUTHORIZE_ON_DEVICE');
});
test('ChatGPT MCP unavailable cannot be repaired by JH server',async()=>{
 let repaired=0;const m=createJHAutoRecovery({diagnose:async()=>report({mcp:{state:'FAIL',code:'MCP_CALL_FAILED'}}),
 isIdle:idle,acquireMaintenanceLease:lease,reconnectBrowserTransport:async()=>{repaired++;}});
 await m.tick();let r=await m.tick();assert.equal(r.status,'MANUAL_REQUIRED');assert.equal(r.manualAction.cause,'CHECK_CHATGPT_PLUGIN');assert.equal(repaired,0);
});
test('device offline requires phone intervention; no reauthorization attempted',async()=>{
 const m=createJHAutoRecovery({diagnose:async()=>report({bridge:{state:'FAIL',code:'NO_ACTIVE_DEVICE'}}),isIdle:idle,acquireMaintenanceLease:lease});
 await m.tick();const r=await m.tick();assert.equal(r.manualAction.cause,'OPEN_JH_SECURE');
});
test('unknown browser error not on safe allow-list cannot execute',async()=>{
 let repairs=0;const m=createJHAutoRecovery({diagnose:async()=>report({browser:{state:'FAIL',code:'MALICIOUS_TEXT'}}),
 isIdle:idle,acquireMaintenanceLease:lease,reconnectBrowserTransport:async()=>{repairs++;}});
 await m.tick();assert.equal((await m.tick()).status,'MANUAL_REQUIRED');assert.equal(repairs,0);
});
test('repair result alone cannot claim recovery without verified readback',async()=>{
 let alerts=0;const m=createJHAutoRecovery({diagnose:async()=>browserFail(),isIdle:idle,acquireMaintenanceLease:lease,
 reconnectBrowserTransport:async()=>({ok:true,mode:'TRANSPORT_ONLY'}),
 notifyUser:async()=>{alerts++;return {delivered:true};}, maxAttempts:1});
 await m.tick();let r=await m.tick();assert.equal(r.status,'MANUAL_REQUIRED');assert.equal(r.recoveryActions[0].outcome,'VERIFICATION_FAILED');assert.equal(alerts,1);
});
test('malformed reconnection output cannot be promoted to recovery',async()=>{
 const m=createJHAutoRecovery({diagnose:async()=>browserFail(),isIdle:idle,acquireMaintenanceLease:lease,
 reconnectBrowserTransport:async()=>({ok:true,mode:'REOPEN_BROWSER_AND_CLICK'}),maxAttempts:1});
 await m.tick();let r=await m.tick();assert.equal(r.recoveryActions[0].outcome,'NOT_CONFIRMED');
});
test('notification failures are not reported as delivered',async()=>{
 const m=createJHAutoRecovery({diagnose:async()=>report({security:{state:'FAIL',code:'EXPIRED'}}),
 notifyUser:async()=>{throw Error('SECRET_API_TOKEN');}});
 await m.tick();let r=await m.tick();assert.equal(r.notificationDelivery,'DELIVERY_FAILED');assert.ok(!JSON.stringify(r).includes('SECRET_API_TOKEN'));
});
test('duplicate manual incidents emit only one successful alert',async()=>{
 let alerts=0;const m=createJHAutoRecovery({diagnose:async()=>report({security:{state:'FAIL',code:'EXPIRED'}}),notifyUser:async()=>{alerts++;return {delivered:true};}});
 for(let i=0;i<10;i++)await m.tick();assert.equal(alerts,1);
});
test('new episode after healthy state allows later manual notification',async()=>{
 let fail=true,alerts=0;const m=createJHAutoRecovery({diagnose:async()=>fail?report({bridge:{state:'FAIL',code:'NO_ACTIVE_DEVICE'}}):pass(),notifyUser:async()=>{alerts++;return {delivered:true};}});
 await m.tick();await m.tick();fail=false;await m.tick();fail=true;await m.tick();await m.tick();assert.equal(alerts,2);
});
test('concurrent ticks do not start multiple recovery attempts',async()=>{
 let resolve,invocations=0;const pending=new Promise(r=>resolve=r);
 const m=createJHAutoRecovery({diagnose:async()=>{invocations++;return pending;},failureThreshold:1});
 const first=m.tick();const concurrent=await m.tick();assert.equal(concurrent.status,'SKIPPED_CONCURRENT');resolve(pass());
 assert.equal((await first).status,'HEALTHY');assert.equal(invocations,1);
});
test('start is opt-in and stop is idempotent',()=>{
 const m=createJHAutoRecovery();assert.equal(m.isRunning,false);assert.equal(m.start(),true);assert.equal(m.start(),false);m.stop();m.stop();assert.equal(m.isRunning,false);
});
test('global safety budget prevents infinite repeated recovery across flapping episodes',async()=>{
 let broken=true,repair=0,clock=1000;
 const m=createJHAutoRecovery({diagnose:async()=>broken?browserFail():pass(),isIdle:idle,acquireMaintenanceLease:lease,
 reconnectBrowserTransport:async()=>{repair++;broken=false;return {ok:true,mode:'TRANSPORT_ONLY'};},
 failureThreshold:1,maxAttempts:2,maxAttemptsPerWindow:2,attemptWindowMs:600000,now:()=>clock});
 for(let i=0;i<2;i++){
  broken=true;assert.equal((await m.tick()).status,'RECOVERED');assert.equal(repair,i+1);
  await m.tick(); clock+=60000;
 }
 broken=true;const r=await m.tick();
 assert.equal(r.status,'MANUAL_REQUIRED');assert.equal(r.manualAction.recoveryCode,'GLOBAL_RECOVERY_BUDGET_EXHAUSTED');assert.equal(repair,2);
});
test('failed notifications are retried only after cooldown, never falsely confirmed',async()=>{
 let clock=1000,alerts=0;const m=createJHAutoRecovery({diagnose:async()=>report({mcp:{state:'FAIL',code:'MCP_CALL_FAILED'}}),
 failureThreshold:1,notificationBackoffMs:60000, now:()=>clock,notifyUser:async()=>{alerts++;throw Error('private token');}});
 assert.equal((await m.tick()).notificationDelivery,'DELIVERY_FAILED');
 assert.equal((await m.tick()).notificationDelivery,'RETRY_DEFERRED');assert.equal(alerts,1);
 clock+=61000;assert.equal((await m.tick()).notificationDelivery,'DELIVERY_FAILED');assert.equal(alerts,2);
});
test('maintenance lease is mandatory even if passive idle says true',async()=>{
 let repair=0;const m=createJHAutoRecovery({diagnose:async()=>browserFail(),isIdle:idle,
  reconnectBrowserTransport:async()=>{repair++;}, failureThreshold:1});
 assert.equal((await m.tick()).status,'MANUAL_REQUIRED');assert.equal(repair,0);
});
test('atomic maintenance lease is released after verified recovery',async()=>{
 let released=0,fixed=false;const m=createJHAutoRecovery({diagnose:async()=>fixed?pass():browserFail(),isIdle:idle,
 acquireMaintenanceLease:async()=>({verified:true,idle:true,exclusive:true,release:async()=>{released++;}}),
 reconnectBrowserTransport:async()=>{fixed=true;return {ok:true,mode:'TRANSPORT_ONLY'};},failureThreshold:1});
 assert.equal((await m.tick()).status,'RECOVERED');assert.equal(released,1);
});
test('monitor failure reports manual after repeated faults without exposing stack or secrets',async()=>{
 let alerts=0;const m=createJHAutoRecovery({diagnose:async()=>{throw Error('private token abc');},
 notifyUser:async()=>{alerts++;return {delivered:true};}});
 assert.equal((await m.tick()).status,'OBSERVING');
 const r=await m.tick();assert.equal(r.status,'MANUAL_REQUIRED');
 assert.equal(r.manualAction.cause,'CHECK_JH_SERVER');assert.ok(!JSON.stringify(r).includes('private token'));assert.equal(alerts,1);
});
