import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectNativeReadback,runNativeReadback,expectedNativePackage} from '../owner-setup/deployment/native-readback.mjs';
const packageA='laftel.net.laftel',packageB='com.kakao.taxi';
const marker={package:'com.koreanlifehub.bridge.protocol',text:'A'.repeat(180),guidedForm:JSON.stringify({ok:false,code:'work_window_unavailable'})};
const good=p=>({ok:true,url:JSON.stringify([{package:p,className:'android.view.View',text:'홈'}])});
const empty={ok:true,url:JSON.stringify([marker])};
const job=result=>({status:'complete',result});
function fixture(results,{actionOverride={},binding=()=>true,pending=false}={}){
 let time=20000,reads=0;const completed=19000;
 const action={type:'open_url',target:'previous_work_app',status:'complete',result:{ok:true,packageName:packageA},completedAt:new Date(completed).toISOString(),targetDeviceId:'test-device',secureSessionId:'test-session',...actionOverride};
 return {action,get reads(){return reads},run:()=>runNativeReadback({action,bindingValid:binding,now:()=>time,sleep:async ms=>{time+=ms;},
  requestSnapshot:()=>({id:'snapshot-'+(++reads),status:'queued',targetDeviceId:action.targetDeviceId,secureSessionId:action.secureSessionId,createdAtMs:time}),
  waitSnapshot:async j=>pending?j:({...j,status:'complete',completedAt:new Date(time).toISOString(),result:results[Math.min(reads-1,results.length-1)]})})};
}
test('long protocol text alone is not a ready app',()=>assert.deepEqual(inspectNativeReadback(job(empty)),{ready:false,reason:'WORK_WINDOW_NOT_READY',retryable:true}));
test('actual work app can be observed',()=>assert.equal(inspectNativeReadback(job(good(packageA)),packageA).ready,true));
test('wrong app not accepted as desired target',()=>assert.equal(inspectNativeReadback(job(good(packageB)),packageA).reason,'EXPECTED_APP_NOT_READY'));
test('control app excluded',()=>assert.equal(inspectNativeReadback(job(good('com.openai.chatgpt'))).ready,false));
test('malformed result is terminal',()=>assert.equal(inspectNativeReadback(job({ok:true,url:'broken'})).retryable,false));
test('restricted tree does not trigger additional reads',()=>assert.equal(inspectNativeReadback(job({ok:true,url:JSON.stringify([{restricted:'true'}, {package:packageA,text:'home'}])})).retryable,false));
test('authentication denial is terminal',()=>assert.equal(inspectNativeReadback(job({ok:false,code:'Authentication required'})).retryable,false));
test('bounded partial native tree is usable but explicitly partial',()=>assert.equal(inspectNativeReadback(job({ok:true,url:JSON.stringify([{partial:'true'}, {package:packageA,text:'home'}])})).partial,true));
test('expected package from actual return result, not general target guess',()=>assert.equal(expectedNativePackage({result:{packageName:packageA},target:'previous_work_app'}),packageA));
test('observed supported Kakao alias identifies its expected native package',()=>assert.equal(expectedNativePackage({target:'카카오T'}),packageB));
test('unrecognized target does not invent package',()=>assert.equal(expectedNativePackage({target:'unknown'}),null));
test('temporary empty first read then fresh real screen is two reads',async()=>{const f=fixture([empty,good(packageA)]),r=await f.run();assert.equal(r.readback.ready,true);assert.equal(r.readback.attempts,2);assert.equal(f.reads,2);assert.equal(r.readback.actionReplayCount,0);assert.equal(r.readback.taskSuccessVerified,false)});
test('empty forever stops at three reads',async()=>{const f=fixture([empty]),r=await f.run();assert.equal(r.readback.ready,false);assert.equal(r.readback.limitReached,true);assert.equal(f.reads,3)});
test('wrong application may settle without repeating action',async()=>{const f=fixture([good(packageB),good(packageA)]),r=await f.run();assert.equal(r.readback.ready,true);assert.equal(f.reads,2)});
test('failed action dispatches zero reads',async()=>{const f=fixture([good(packageA)],{actionOverride:{result:{ok:false}}}),r=await f.run();assert.equal(f.reads,0);assert.equal(r.readback.ready,false)});
test('unconfirmed action dispatches zero reads',async()=>{const f=fixture([good(packageA)],{actionOverride:{status:'queued'}});await f.run();assert.equal(f.reads,0)});
test('binding change during observation stops before next read',async()=>{let checks=0;const f=fixture([empty],{binding:()=>++checks<3}),r=await f.run();assert.equal(r.readback.reason,'DEVICE_OR_SESSION_CHANGED');assert.equal(f.reads,1);assert.equal(r.snapshot,null)});
test('pending read does not queue an extra job',async()=>{const f=fixture([empty],{pending:true}),r=await f.run();assert.equal(r.readback.reason,'SNAPSHOT_NOT_COMPLETED');assert.equal(f.reads,1)});
test('malformed payload gets no retry',async()=>{const f=fixture([{ok:true,url:'bad'}]);await f.run();assert.equal(f.reads,1)});
test('failed snapshot gets no retry',async()=>{const f=fixture([{ok:false,code:'approval_required'}]);await f.run();assert.equal(f.reads,1)});
test('actual restricted work window gets no retry',async()=>{const f=fixture([{ok:true,restricted:true,url:'[]'}]);await f.run();assert.equal(f.reads,1)});
test('reused completed job id never becomes fresh read',async()=>{let reads=0;let time=20000;const a=fixture([empty]).action;const j={id:'same',status:'complete',targetDeviceId:a.targetDeviceId,secureSessionId:a.secureSessionId,createdAtMs:time,completedAt:new Date(time).toISOString(),result:empty};const r=await runNativeReadback({action:a,bindingValid:()=>true,now:()=>time,sleep:async ms=>{time+=ms},requestSnapshot:()=>{reads++;return j},waitSnapshot:async x=>x});assert.equal(r.readback.reason,'STALE_SNAPSHOT_REUSED');assert.equal(reads,2)});
test('stale pre-action evidence is rejected',async()=>{let time=20000;let reads=0;const a=fixture([empty]).action;const r=await runNativeReadback({action:a,bindingValid:()=>true,now:()=>time,sleep:async ms=>{time+=ms},requestSnapshot:()=>({id:'r'+(++reads)}),waitSnapshot:async j=>({...j,status:'complete',targetDeviceId:a.targetDeviceId,secureSessionId:a.secureSessionId,createdAtMs:18000,completedAt:new Date(18100).toISOString(),result:good(packageA)})});assert.equal(r.readback.ready,false);assert.equal(reads,3)});
test('total readback budget enforced',async()=>{let time=20000,reads=0;const a=fixture([empty]).action;const r=await runNativeReadback({action:a,bindingValid:()=>true,now:()=>time,sleep:async ms=>{time+=ms},requestSnapshot:()=>({id:'r'+(++reads)}),waitSnapshot:async j=>{time+=12500;return {...j,status:'complete',targetDeviceId:a.targetDeviceId,secureSessionId:a.secureSessionId,createdAtMs:20000,completedAt:new Date(time).toISOString(),result:good(packageA)}}});assert.equal(r.readback.reason,'READBACK_DEADLINE');assert.equal(reads,1)});
test('explicit unavailable window invalidates even old retained UI nodes',()=>assert.equal(inspectNativeReadback(job({ok:true,url:JSON.stringify([marker,{package:packageA,text:'old'}])}),packageA).ready,false));
