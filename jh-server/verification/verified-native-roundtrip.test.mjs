import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createVerifiedNativeRoundtrip} from '../owner-setup/deployment/verified-native-roundtrip.mjs';
import {createVerifiedReturnHandoff} from '../owner-setup/deployment/verified-return-handoff.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const iso=t=>new Date(t).toISOString();
const ORIGIN='laftel.net.laftel',DEST='com.kakao.taxi';
const params={workflowId:'workflow_roundtrip_01',target:'카카오T',explicitReturn:true};
function fixture(options={}){
 let t=100000,context={deviceId:'synthetic_device_01',sessionId:'synthetic_session_01'},release;
 const calls=[],cancelled=[];
 const pending=new Promise(r=>release=r);
 let executor;
 const view=j=>({idDigest:sha(j.id),type:j.type,status:j.status,completedAt:j.completedAt,result:structuredClone(j.result),
  deviceReportedOutcome:j.result.ok?'DEVICE_REPORTED_OK_UNVERIFIED':'DEVICE_REPORTED_FAILURE'});
 executor=createVerifiedNativeRoundtrip({clock:()=>t,maxRecords:options.maxRecords??64,selectContext:()=>context,
  requestJob(type,payload,deviceId){const j={id:'job_'+(calls.length+1),type,...payload,targetDeviceId:deviceId,
   secureSessionId:context.sessionId,status:'queued',createdAtMs:++t};calls.push(j);return{job:j,isNew:options.cachedAt!==calls.length-1};},
  async waitJob(j){const i=calls.indexOf(j);j.status='in_progress';
   if(options.pauseAt===i)await pending;
   t+=10;j.status='complete';j.completedAt=iso(t);
   const app=i===2?DEST:ORIGIN;
   j.result=j.type==='agent_snapshot'?{ok:true,url:JSON.stringify([{package:app,text:'synthetic',className:'android.view.View'}])}:{ok:true,code:'synthetic-opened'};
   if(options.failAt===i)j.result={ok:false,code:'synthetic-failure'};
   if(options.wrongAppAt===i)j.result={ok:true,url:JSON.stringify([{package:'com.unrelated.app',text:'not the expected app'}])};
   if(options.partialAt===i)j.result={ok:true,url:JSON.stringify([{package:app,text:'part',partial:true}])};
   if(options.staleAt===i)j.createdAtMs=100000;
   if(options.futureAt===i)j.completedAt=iso(t+1000);
   if(options.wrongDeviceAt===i)j.targetDeviceId='different_device';
   if(options.wrongSessionAt===i)j.secureSessionId='different_session';
   if(options.sessionChangeAt===i)context={...context,sessionId:'new_active_session'};
   if(options.clockRollbackAt===i)t=100001;
   if(options.expireAt===i)t+=120001;
   if(options.transportAt===i)throw Error('synthetic transport exception');
   return j;
  },
  jobView(j){const i=calls.indexOf(j),v=view(j);
   if(options.wrongReceiptAt===i)v.idDigest=sha('job_unrelated');
   if(options.changedReceiptAt===i)v.result={ok:true,code:'different-response'};
   if(options.stopAtView===i)executor.stop(params.workflowId);
   return v;},
  cancelQueued(j,c){if(j.status==='queued'&&j.targetDeviceId===c.deviceId&&j.secureSessionId===c.sessionId){
   j.status='error';cancelled.push(j.id);return true;}return false;}
 });
 return{executor,calls,cancelled,release,setContext:c=>context=c,run:p=>executor.run(p??params)};
}
async function waitFor(f,count){for(let i=0;i<100&&f.calls.length<count;i++)await Promise.resolve();assert.equal(f.calls.length,count);}
test('one explicit request runs five host jobs and verifies app return, not scroll or business success',async()=>{
 const f=fixture(),r=await f.run();assert.equal(r.ok,true,JSON.stringify(r));
 assert.deepEqual(f.calls.map(j=>j.type),['agent_snapshot','open_url','agent_snapshot','open_url','agent_snapshot']);
 assert.equal(r.appReturnVerified,true);assert.equal(r.pageOrScrollRestored,false);assert.equal(r.taskSuccessVerified,false);
 assert.equal(f.calls[3].target,'last_work_screen');
 assert.ok(!JSON.stringify(r).includes('synthetic_session'));assert.ok(!JSON.stringify(r).includes('job_'));
});
test('no explicit return instruction creates zero jobs',async()=>{const f=fixture();const r=await f.run({...params,explicitReturn:false});assert.equal(r.ok,false);assert.equal(f.calls.length,0);});
test('unscoped request without workflow identity creates zero jobs',async()=>{const f=fixture();assert.equal((await f.run({...params,workflowId:''})).ok,false);assert.equal(f.calls.length,0);});
test('web and unknown targets cannot enter native roundtrip',async()=>{for(const target of ['네이버 메일','라프텔','unknown']){const f=fixture();assert.equal((await f.run({...params,target})).ok,false);assert.equal(f.calls.length,0);}});
test('failed origin read prevents app execution',async()=>{const f=fixture({failAt:0});assert.equal((await f.run()).ok,false);assert.equal(f.calls.length,1);});
test('failed app execution prevents readback and return',async()=>{const f=fixture({failAt:1}),r=await f.run();assert.equal(r.code,'ROUNDTRIP_ACTION_NOT_CONFIRMED');assert.equal(f.calls.length,2);});
test('wrong destination app prevents return',async()=>{const f=fixture({wrongAppAt:2}),r=await f.run();assert.equal(r.code,'ROUNDTRIP_DESTINATION_NOT_VERIFIED');assert.equal(f.calls.length,3);});
test('wrong returned app is never successful',async()=>{const f=fixture({wrongAppAt:4}),r=await f.run();assert.equal(r.code,'ROUNDTRIP_RETURN_NOT_OBSERVED');assert.equal(r.appReturnVerified,false);assert.equal(f.calls.length,5);});
test('partial origin evidence does not authorize navigation',async()=>{const f=fixture({partialAt:0});assert.equal((await f.run()).ok,false);assert.equal(f.calls.length,1);});
test('stale destination evidence prevents return',async()=>{const f=fixture({staleAt:2});assert.equal((await f.run()).code,'ROUNDTRIP_EVIDENCE_TIME');assert.equal(f.calls.length,3);});
test('future completion timestamp is rejected',async()=>{const f=fixture({futureAt:0});assert.equal((await f.run()).code,'ROUNDTRIP_EVIDENCE_TIME');assert.equal(f.calls.length,1);});
test('receipt from another job is rejected despite OK outcome',async()=>{const f=fixture({wrongReceiptAt:1});assert.equal((await f.run()).code,'ROUNDTRIP_STATUS_BINDING');assert.equal(f.calls.length,2);});
test('receipt body mismatch is rejected despite same job ID',async()=>{const f=fixture({changedReceiptAt:1});assert.equal((await f.run()).code,'ROUNDTRIP_STATUS_BINDING');assert.equal(f.calls.length,2);});
test('wrong device or session cannot become same-workflow evidence',async()=>{for(const option of [{wrongDeviceAt:1},{wrongSessionAt:1}]){const f=fixture(option);assert.equal((await f.run()).code,'ROUNDTRIP_JOB_BINDING');assert.equal(f.calls.length,2);}});
test('active session change stops following action',async()=>{const f=fixture({sessionChangeAt:0});assert.equal((await f.run()).code,'ROUNDTRIP_DEVICE_OR_SESSION_CHANGED');assert.equal(f.calls.length,1);});
test('clock rollback within original TTL still stops workflow',async()=>{const f=fixture({clockRollbackAt:2});assert.equal((await f.run()).code,'ROUNDTRIP_CLOCK_ROLLBACK');assert.equal(f.calls.length,3);});
test('expired workflow does not dispatch return',async()=>{const f=fixture({expireAt:2});assert.equal((await f.run()).code,'ROUNDTRIP_EXPIRED');assert.equal(f.calls.length,3);});
test('stop before first job results in zero dispatched jobs',async()=>{const f=fixture(),p=f.run();assert.equal(f.executor.stop(params.workflowId).ok,true);assert.equal((await p).code,'ROUNDTRIP_STOPPED');assert.equal(f.calls.length,0);});
test('stop while origin read is in flight blocks delayed follow-up',async()=>{const f=fixture({pauseAt:0}),p=f.run();await waitFor(f,1);f.executor.stop(params.workflowId);f.release();assert.equal((await p).code,'ROUNDTRIP_STOPPED');assert.equal(f.calls.length,1);});
test('stop at final destination evidence boundary prevents return dispatch',async()=>{const f=fixture({stopAtView:2}),r=await f.run();assert.equal(r.code,'ROUNDTRIP_STOPPED');assert.equal(f.calls.length,3);});
test('duplicate concurrent and completed workflow requests reuse one execution',async()=>{const f=fixture({pauseAt:0}),a=f.run(),b=f.run();assert.equal(a,b);await waitFor(f,1);f.release();assert.equal((await a).ok,true);assert.equal((await b).ok,true);assert.equal((await f.run()).ok,true);assert.equal(f.calls.length,5);});
test('another workflow cannot seize same device during active work',async()=>{const f=fixture({pauseAt:0}),p=f.run();await waitFor(f,1);assert.equal((await f.run({...params,workflowId:'different_workflow'})).code,'ROUNDTRIP_DEVICE_BUSY');f.release();await p;assert.equal(f.calls.length,5);});
test('uncertain transport never triggers action replay',async()=>{const f=fixture({transportAt:1}),r=await f.run();assert.equal(r.code,'ROUNDTRIP_TRANSPORT_UNCERTAIN');assert.equal(f.calls.length,2);assert.equal((await f.run()).code,r.code);assert.equal(f.calls.length,2);});
test('cached legacy job cannot be adopted or cancelled as a new job',async()=>{const f=fixture({cachedAt:1}),r=await f.run();assert.equal(r.code,'ROUNDTRIP_EXISTING_JOB_REQUIRES_REVIEW');assert.equal(f.calls.length,2);assert.equal(f.cancelled.length,0);});
test('old workflow result cannot be replayed under different active session',async()=>{const f=fixture();await f.run();f.setContext({deviceId:'synthetic_device_01',sessionId:'changed_session_01'});assert.equal((await f.run()).code,'ROUNDTRIP_WORKFLOW_BINDING_CONFLICT');assert.equal(f.calls.length,5);});
test('bounded registry does not evict prior executions to replay them',async()=>{const f=fixture({maxRecords:1});await f.run();assert.equal((await f.run({...params,workflowId:'another_workflow_01'})).code,'ROUNDTRIP_REGISTRY_FULL');assert.equal(f.calls.length,5);});
test('baseline helper accepts unrelated OK receipt: regression is reproduced, not claimed as production incident',()=>{
 let t=100000;const c={workflowId:'workflow_baseline_01',deviceId:'device_baseline_01',sessionId:'session_baseline_01'};
 const g=createVerifiedReturnHandoff({...c,originPackage:ORIGIN,destinationPackage:DEST,now:()=>t});
 const snap=(id,p,at)=>({id,type:'agent_snapshot',targetDeviceId:c.deviceId,secureSessionId:c.sessionId,status:'complete',createdAtMs:at,completedAt:iso(at),result:{ok:true,url:JSON.stringify([{package:p,text:'synthetic'}])}});
 t=100010;assert.equal(g.captureOrigin({binding:c,snapshot:snap('job_origin_1',ORIGIN,100005)}).ok,true);
 const action={id:'job_action_1',type:'open_url',target:'카카오T',targetDeviceId:c.deviceId,secureSessionId:c.sessionId,status:'complete',completedAt:iso(100020),result:{ok:true}};
 t=100040;assert.equal(g.verifyDestination({binding:{...c,dispatchJobId:action.id,destinationTarget:'카카오T'},actionJob:action,
  actionStatus:{idDigest:sha('UNRELATED_JOB'),status:'complete',deviceReportedOutcome:'DEVICE_REPORTED_OK_UNVERIFIED',result:{ok:true}},readbackJob:snap('job_readback_1',DEST,100030)}).ok,true);
});
test('baseline future-dated origin is reproduced; integrated executor rejects equivalent evidence',()=>{
 const t=100000,c={workflowId:'workflow_future_01',deviceId:'device_future_01',sessionId:'session_future_01'};
 const g=createVerifiedReturnHandoff({...c,originPackage:ORIGIN,destinationPackage:DEST,now:()=>t});
 assert.equal(g.captureOrigin({binding:c,snapshot:{id:'job_future_1',type:'agent_snapshot',targetDeviceId:c.deviceId,secureSessionId:c.sessionId,status:'complete',createdAtMs:t,completedAt:iso(t+1000),result:{ok:true,url:JSON.stringify([{package:ORIGIN,text:'synthetic'}])}}}).ok,true);
});
