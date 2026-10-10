import test from 'node:test';
import assert from 'node:assert/strict';
import {runNativeReadback} from '../owner-setup/deployment/native-readback.mjs';
const APP='laftel.net.laftel';
const ready={ok:true,url:JSON.stringify([{package:APP,text:'Home',className:'android.view.View'}])};
const empty={ok:true,url:JSON.stringify([{package:'com.koreanlifehub.bridge.protocol',text:'Header only',guidedForm:JSON.stringify({ok:false,code:'work_window_unavailable'})}])};
function fixture(plan,{actionFailure=false,invalidBinding=false}={}){
 let time=20000,reads=0;const budgets=[],ids=[];
 const action={status:'complete',targetDeviceId:'synthetic',secureSessionId:'session-1',result:{ok:!actionFailure,packageName:APP},completedAt:new Date(19000).toISOString()};
 return {get reads(){return reads},budgets,ids,run:()=>runNativeReadback({action,now:()=>time,sleep:async ms=>{time+=ms},bindingValid:()=>true,
  requestSnapshot:()=>({id:'read-'+(++reads),status:'queued',targetDeviceId:action.targetDeviceId,secureSessionId:action.secureSessionId,createdAtMs:time}),
  waitSnapshot:async(j,budget)=>{budgets.push(budget);ids.push(j.id);const spec=plan[reads-1]||plan.at(-1);time+=Math.min(spec.after,budget);
   if(spec.after>budget)return j;
   if(spec.overshoot)time+=spec.overshoot;
   return {...j,status:'complete',secureSessionId:invalidBinding?'other-session':j.secureSessionId,completedAt:new Date(time).toISOString(),result:spec.result};
  }})};
}
test('nine-second response completes one existing snapshot within twelve-second total',async()=>{const f=fixture([{after:9000,result:ready}]);const r=await f.run();assert.equal(r.readback.ready,true);assert.deepEqual(f.budgets,[12000]);assert.equal(f.reads,1);assert.deepEqual(f.ids,['read-1']);assert.equal(r.readback.version,'bounded-native-v2-full-budget');assert.equal(r.readback.actionReplayCount,0)});
test('later observation receives only remaining budget, never a new twelve seconds',async()=>{const f=fixture([{after:500,result:empty},{after:9000,result:ready}]);const r=await f.run();assert.equal(r.readback.ready,true);assert.deepEqual(f.budgets,[12000,11250]);assert.equal(f.reads,2)});
test('unanswered snapshot receives full budget and does not queue another snapshot',async()=>{const f=fixture([{after:13000,result:ready}]);const r=await f.run();assert.equal(r.readback.ready,false);assert.equal(r.readback.reason,'SNAPSHOT_NOT_COMPLETED');assert.equal(f.reads,1);assert.deepEqual(f.budgets,[12000]);assert.equal(r.snapshot.status,'queued')});
test('late completion is not accepted beyond total deadline',async()=>{const f=fixture([{after:11900,overshoot:300,result:ready}]);const r=await f.run();assert.equal(r.readback.reason,'READBACK_DEADLINE');assert.equal(r.readback.ready,false);assert.equal(f.reads,1)});
test('delayed authentication denial is terminal, not retried',async()=>{const f=fixture([{after:9000,result:{ok:false,code:'approval_required'}}]);const r=await f.run();assert.equal(r.readback.ready,false);assert.equal(r.readback.retryable,false);assert.equal(f.reads,1)});
test('changed session still invalidates delayed response',async()=>{const f=fixture([{after:9000,result:ready}],{invalidBinding:true});const r=await f.run();assert.equal(r.readback.reason,'DEVICE_OR_SESSION_CHANGED');assert.equal(r.snapshot,null);assert.equal(f.reads,1)});
test('failed app action creates no snapshot or wait',async()=>{const f=fixture([{after:9000,result:ready}],{actionFailure:true});const r=await f.run();assert.equal(r.readback.ready,false);assert.equal(f.reads,0);assert.deepEqual(f.budgets,[])});
test('remaining-budget exhaustion cannot start a second observation',async()=>{const f=fixture([{after:11900,result:empty},{after:1,result:ready}]);const r=await f.run();assert.equal(r.readback.reason,'READBACK_DEADLINE');assert.equal(f.reads,1);assert.equal(r.readback.taskSuccessVerified,false);assert.equal(r.readback.pageOrScrollRestored,false)});
