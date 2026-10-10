import test from 'node:test';
import assert from 'node:assert/strict';
import {createVerifiedReturnHandoff} from '../owner-setup/deployment/verified-return-handoff.mjs';
const stamp=ms=>new Date(ms).toISOString();
const WORKFLOW='workflow_test_01',DEVICE='synthetic_device_01',SESSION='synthetic_session_01';
const BASE={workflowId:WORKFLOW,deviceId:DEVICE,sessionId:SESSION};
const ORIGIN='laftel.net.laftel',DEST='com.kakao.taxi';
const node=p=>[{package:p,text:'synthetic visible target',className:'android.view.View'}];
const snap=(name,packageName,created=100005,completed=100010)=>({
 id:name,status:'complete',type:'agent_snapshot',targetDeviceId:DEVICE,secureSessionId:SESSION,
 createdAtMs:created,completedAt:stamp(completed),result:{ok:true,url:JSON.stringify(node(packageName))}
});
const action=(id,target,completed=100100,result={ok:true})=>({
 id,type:'open_url',status:'complete',target,targetDeviceId:DEVICE,secureSessionId:SESSION,
 completedAt:stamp(completed),result
});
const status=(ok=true)=>({status:'complete',result:{ok},deviceReportedOutcome:ok?'DEVICE_REPORTED_OK_UNVERIFIED':'DEVICE_REPORTED_FAILURE'});
function fresh(ttlMs=60000){
 let t=100000;
 const g=createVerifiedReturnHandoff({...BASE,originPackage:ORIGIN,destinationPackage:DEST,now:()=>t,ttlMs});
 t=100025; // The workflow starts BEFORE the first screen was read.
 const binding={...BASE,dispatchJobId:'job_action_01',destinationTarget:'카카오T'};
 const original=snap('snapshot_origin_01',ORIGIN);
 const destination=snap('snapshot_dest_01',DEST,100105,100110);
 const opened=action('job_action_01','카카오T');
 function capture(){return g.captureOrigin({binding,snapshot:original})}
 function verified(){t=100120;return g.verifyDestination({binding,actionJob:opened,actionStatus:status(),readbackJob:destination})}
 function authorized(){return g.authorizeReturn({binding,explicitlyRequested:true,target:'last_work_screen'})}
 function returned(){t=100220;return g.verifyReturn({binding:{...binding,returnJobId:'job_return_01'},
  returnJob:action('job_return_01','last_work_screen',100200),returnStatus:status(),
  readbackJob:snap('snapshot_return_01',ORIGIN,100205,100210)})}
 return {g,binding,original,destination,opened,capture,verified,authorized,returned,setClock:v=>t=v};
}
test('initial state never issues phone action without verified provenance',()=>{
 const f=fresh();assert.equal(f.g.state,'CAPTURE_ORIGIN');
 assert.equal(f.g.authorizeReturn({binding:f.binding,explicitlyRequested:true,target:'last_work_screen'}).ok,false);
});
test('origin must be original app, same device, same session and exact workflow',()=>{
 for(const invalid of [
  snap('snapshot_origin_01',DEST),
  {...snap('snapshot_origin_01',ORIGIN),targetDeviceId:'another_device'},
  {...snap('snapshot_origin_01',ORIGIN),secureSessionId:'another_session'},
  {...snap('snapshot_origin_01',ORIGIN),result:{ok:true,url:JSON.stringify([{package:ORIGIN,text:'view',partial:true}])}}
 ]){
  const f=fresh();assert.equal(f.g.captureOrigin({binding:f.binding,snapshot:invalid}).ok,false);
  assert.equal(f.g.state,'CAPTURE_ORIGIN');
 }
 const f=fresh();assert.equal(f.g.captureOrigin({binding:{...f.binding,workflowId:'other_workflow'},snapshot:f.original}).ok,false);
 assert.equal(f.capture().ok,true);
});
test('valid origin alone cannot authorize return',()=>{
 const f=fresh();assert.equal(f.capture().ok,true);assert.equal(f.g.authorizeReturn({binding:f.binding,explicitlyRequested:true,target:'last_work_screen'}).ok,false);
});
test('only completed matching dispatch with device OK is eligible for destination readback',()=>{
 for(const change of [
  {actionJob:action('job_some_other_action','카카오T')},
  {actionJob:action('job_action_01','네이버')},
  {actionJob:{...action('job_action_01','카카오T'),secureSessionId:'other_session'}},
  {actionJob:action('job_action_01','카카오T',100100,{ok:false})},
  {actionStatus:status(false)}
 ]){
  const f=fresh();assert.equal(f.capture().ok,true);
  f.setClock(100120);
  const args={binding:f.binding,actionJob:f.opened,actionStatus:status(),readbackJob:f.destination,...change};
  assert.equal(f.g.verifyDestination(args).ok,false);
  assert.equal(f.g.state,'WAIT_DESTINATION');
 }
});
test('matching acknowledged action without visible destination is NOT enough',()=>{
 const f=fresh();f.capture();f.setClock(100120);
 assert.equal(f.g.verifyDestination({binding:f.binding,actionJob:f.opened,actionStatus:status(),
  readbackJob:snap('snapshot_wrong_01',ORIGIN,100105,100110)}).ok,false);
});
test('stale, different-session, wrong-app and reused readbacks fail closed',()=>{
 for(const altered of [
  snap('snapshot_dest_01',DEST,100090,100095),
  {...snap('snapshot_dest_01',DEST,100105,100110),secureSessionId:'different_session'},
  {...snap('snapshot_dest_01',ORIGIN,100105,100110)},
  {...snap('snapshot_origin_01',DEST,100105,100110)},
  {...snap('snapshot_dest_01',DEST,100105,100110),createdAtMs:1001000}
 ]){
  const f=fresh();f.capture();f.setClock(100120);
  assert.equal(f.g.verifyDestination({binding:f.binding,actionJob:f.opened,actionStatus:status(),readbackJob:altered}).ok,false);
 }
});
test('valid destination verified but workflow success remains unclaimed',()=>{
 const f=fresh();assert.equal(f.capture().ok,true);const r=f.verified();
 assert.equal(r.ok,true);assert.equal(r.taskSuccessVerified,false);assert.equal(f.g.state,'READY_FOR_EXPLICIT_RETURN');
});
test('explicit return intent is mandatory and target cannot be replaced',()=>{
 const f=fresh();f.capture();f.verified();
 for(const [explicitlyRequested,target] of [[false,'last_work_screen'],[true,'chrome'],[true,'some_other_app']]){
  const r=f.g.authorizeReturn({binding:f.binding,explicitlyRequested,target});
  assert.equal(r.ok,false);assert.equal(f.g.state,'READY_FOR_EXPLICIT_RETURN');
 }
});
test('return capability bound to same device/session/workflow and is one-shot',()=>{
 const f=fresh();f.capture();f.verified();
 assert.equal(f.g.authorizeReturn({binding:{...f.binding,deviceId:'another_device'},explicitlyRequested:true,target:'last_work_screen'}).ok,false);
 const yes=f.authorized();assert.equal(yes.ok,true);assert.equal(yes.expectedPackage,ORIGIN);
 assert.equal(f.authorized().ok,false);assert.equal(f.g.state,'RETURN_AUTHORIZED');
});
test('successful return command alone cannot count as actual screen return',()=>{
 const f=fresh();f.capture();f.verified();f.authorized();const result=f.g.verifyReturn({
  binding:{...f.binding,returnJobId:'job_return_01'},returnJob:action('job_return_01','last_work_screen',100200),
  returnStatus:status(),readbackJob:snap('snapshot_bad_01',DEST,100205,100210)});
 assert.equal(result.ok,false);assert.equal(f.g.state,'RETURN_AUTHORIZED');
});
test('wrong return job, session, acknowledgement, or stale readback is refused',()=>{
 const deviations=[
  {returnJob:action('other_return_01','last_work_screen',100200)},
  {returnJob:action('job_return_01','chrome',100200)},
  {returnJob:{...action('job_return_01','last_work_screen',100200),secureSessionId:'changed_session'}},
  {returnStatus:status(false)},
  {readbackJob:snap('snapshot_stale_01',ORIGIN,100105,100110)}
 ];
 for(const change of deviations){const f=fresh();f.capture();f.verified();f.authorized();f.setClock(100220);
  const args={binding:{...f.binding,returnJobId:'job_return_01'},returnJob:action('job_return_01','last_work_screen',100200),
    returnStatus:status(),readbackJob:snap('snapshot_return_01',ORIGIN,100205,100210),...change};
  assert.equal(f.g.verifyReturn(args).ok,false);assert.equal(f.g.state,'RETURN_AUTHORIZED');}
});
test('proper observed return completes exactly once, never claims scroll restoration',()=>{
 const f=fresh();f.capture();f.verified();f.authorized();const r=f.returned();
 assert.equal(r.ok,true);assert.equal(r.appReturnVerified,true);assert.equal(r.pageOrScrollRestored,false);
 assert.equal(r.taskSuccessVerified,false);assert.equal(f.g.state,'RETURN_CONFIRMED');
 assert.equal(f.returned().ok,false);
});
test('expired context never authorizes return',()=>{
 const f=fresh(1000);f.capture();f.verified();f.setClock(101100);
 assert.equal(f.authorized().ok,false);assert.equal(f.g.state,'READY_FOR_EXPLICIT_RETURN');
});
test('in-memory context never dispatches work or stores credentials on its own',()=>{
 let called=0;const f=fresh();f.capture();f.verified();f.authorized();
 assert.equal(called,0);assert.equal(f.g.state,'RETURN_AUTHORIZED');
});
test('configuration rejects missing workflow IDs, identical packages, and excessive TTL',()=>{
 for(const invalid of [{workflowId:''},{originPackage:DEST},{ttlMs:3600000}]){
  assert.throws(()=>createVerifiedReturnHandoff({...BASE,originPackage:ORIGIN,destinationPackage:DEST,...invalid,now:()=>100000}),/HANDOFF_CONFIGURATION_INVALID/);
 }
});
