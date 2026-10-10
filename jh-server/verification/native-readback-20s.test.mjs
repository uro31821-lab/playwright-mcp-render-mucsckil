import test from 'node:test';
import assert from 'node:assert/strict';
import {runNativeReadback} from '../owner-setup/deployment/native-readback.mjs';

const APP='com.kakao.taxi';
const READY={ok:true,url:JSON.stringify([{package:APP,text:'synthetic home',className:'android.view.View'}])};
const BLOCK={ok:false,code:'approval_required'};
function fixture({completedAfter=15000,status='complete',result=READY,sessionChanged=false,actionFailed=false}={}){
 let clock=100000,reads=0,actions=0;
 const budget=[],jobs=[];
 const action={status:'complete',result:{ok:!actionFailed,packageName:APP},
  target:'카카오T',targetDeviceId:'mock-android',secureSessionId:'mock-session',completedAt:new Date(clock-1000).toISOString()};
 return {action,get reads(){return reads},get actions(){return actions},budget,jobs,
 run:()=>runNativeReadback({action,now:()=>clock,sleep:async ms=>{clock+=ms;},bindingValid:()=>true,
 requestSnapshot:()=>{reads++;const j={id:'snapshot-'+reads,type:'agent_snapshot',status:'queued',
   targetDeviceId:action.targetDeviceId,secureSessionId:action.secureSessionId,createdAtMs:clock};
  jobs.push(j.id);return j},
 waitSnapshot:async(j,ms)=>{budget.push(ms);clock+=Math.min(ms,completedAfter);
  if(completedAfter>ms)return j;
  return {...j,status,secureSessionId:sessionChanged?'changed-session':action.secureSessionId,
    completedAt:new Date(clock).toISOString(),result};
 }})};
}
test('15-second slow first snapshot succeeds with a single read and zero action replays',async()=>{
 const f=fixture();const r=await f.run();
 assert.equal(r.readback.ready,true);assert.equal(r.readback.targetMatched,true);
 assert.equal(r.readback.version,'bounded-native-v3-20s-full-budget');
 assert.deepEqual(f.budget,[20000]);assert.deepEqual(f.jobs,['snapshot-1']);
 assert.equal(r.readback.actionReplayCount,0);assert.equal(r.readback.taskSuccessVerified,false);
});
test('19.5-second slow read succeeds before deadline',async()=>{
 const f=fixture({completedAfter:19500});const r=await f.run();
 assert.equal(r.readback.ready,true);assert.equal(f.reads,1);assert.deepEqual(f.budget,[20000]);
});
test('21-second read fails bounded without a second job',async()=>{
 const f=fixture({completedAfter:21000});const r=await f.run();
 assert.equal(r.readback.ready,false);assert.equal(f.reads,1);
 assert.equal(r.readback.reason,'SNAPSHOT_NOT_COMPLETED');assert.equal(r.readback.actionReplayCount,0);
});
test('forbidden accessibility response is terminal without retry',async()=>{
 const f=fixture({result:BLOCK});const r=await f.run();
 assert.equal(r.readback.reason,'SNAPSHOT_REPORTED_FAILURE');assert.equal(f.reads,1);
 assert.equal(r.readback.taskSuccessVerified,false);
});
test('replaced secure session never accepts delayed screenshot',async()=>{
 const f=fixture({sessionChanged:true});const r=await f.run();
 assert.equal(r.readback.reason,'DEVICE_OR_SESSION_CHANGED');assert.equal(r.snapshot,null);
 assert.equal(f.reads,1);
});
test('failed app launch never creates screenshot or reopens target',async()=>{
 const f=fixture({actionFailed:true});const r=await f.run();assert.equal(f.reads,0);
 assert.equal(r.readback.reason,'ACTION_NOT_CONFIRMED');
});
