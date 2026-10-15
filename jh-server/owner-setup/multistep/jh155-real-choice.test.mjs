/** Exercise the deployed JH choice APIs with simulated phone evidence; no external actions. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {JHMultiStepCoordinator} from './multi-step.mjs';
import {createJH155Ports} from './jh155-ports.mjs';

const ORIGIN='https://hotel.example.kr',APP='com.android.chrome';
const stamp=new Date().toISOString();
function candidate(id,title,base,tax,distance,rating){return {id,title,source:{url:ORIGIN+'/'+id,observedAt:stamp},available:true,
  price:{currency:'KRW',base:{label:'1박',value:{amount:base,status:'confirmed'},basis:'total'},
     charges:[{id:'tax_'+id,label:'세금',value:{amount:tax,status:'confirmed'},basis:'total'}],additionalCostsChecked:true},
  distanceKm:distance,durationMin:distance*3,rating:{value:rating,scale:5},conditions:{breakfast:true},tradeoffs:[]};}

test('real JH155 recommend + DecisionStore + calculateTotal injected, no duplicate engine', async()=>{
 const real=await import('../deployment/search-decision.mjs');
 const {inspectSplitEvidence}=await import('../deployment/split-screen-evidence.mjs');
 const context={deviceId:'device1',commandId:'command123',userInitiated:true,
   scope:{apps:[APP],origins:[ORIGIN],maxPaymentKRW:400000,mayCheckout:false,mayRequestApproval:false}};
 const now=Date.now();
 const choiceStore=new real.DecisionStore({captureBinding:()=>({device:'device1',command_id:'command123'})});
 const paymentService={
    prepare:()=>{throw Error('COMPARE_MUST_NOT_PREPARE_PAYMENT');},
    open:()=>{throw Error('COMPARE_MUST_NOT_OPEN_PAYMENT');},
    final:{capture:()=>{throw Error('COMPARE_MUST_NOT_APPROVE');},verify:()=>({}),report:()=>({})},
    discardWork:()=>({removed:0,preserved:0})
 };
 const signed={ok:true,resultVerified:true,splitScreenRequired:true,splitScreen:{kind:'split_screen_evidence',version:'1',verified:'true',layout:'LEFT_RIGHT',
   chatPackage:'com.openai.chatgpt',chatKind:'NATIVE',chatWindowId:'123',workWindowId:'456',workPackage:APP,
   chatBounds:'0,0,500,900',workBounds:'500,0,1000,900',observedAtMs:String(now)}};
 const ports=createJH155Ports({commandContext:()=>context,rightAppNavigation:()=>structuredClone(signed),
   signedScreenRead:()=>({...structuredClone(signed),summarySource:'호텔 조건을 읽음'}),
   inspectSplitEvidence,
   chooseEngine:real,choiceStore,paymentService,
   sendToGpt:()=>({delivered:true})});
 const coordinator=new JHMultiStepCoordinator(ports,{now:()=>now});
 const start=await coordinator.start({goal:'호텔 1박 두 후보 비교',mode:'COMPARE'});
 const id=start.workflowId;
 const input={query:'검증된 호텔 비교',weights:{price:55,distanceKm:15,durationMin:5,rating:15,conditions:10},includeAlternatives:true,
    groups:[{id:'hotels',title:'숙소',candidates:[candidate('A','호텔 A',250000,20000,1,4.8),candidate('B','호텔 B',230000,15000,3,4.2)],
       requiredConditions:['breakfast'],preferredConditions:['breakfast']}],compatibilityChecked:true};
 const events=[];
 while(coordinator.status().currentStep!=='GPT_REPORT'){
   const kind=coordinator.status().currentStep;
   const r=await coordinator.advance({workflowId:id,input:kind==='COMPARE'?{recommendRequest:input}:{}});
   assert.equal(r.ok,true,JSON.stringify(r));events.push(kind);
 }
 const total=coordinator.status().totals;
 assert.equal(total.complete,true);assert.equal(total.total>0,true);assert.equal(total.confirmed,total.total);
 assert.equal(coordinator.status().alternativeAvailable,true);
 assert.equal(coordinator.status().latestExplanation.alternatives.length,1);
 assert.equal(coordinator.previewReport(id).report.completion,'CHOICE_AND_TOTAL_READY');
 const report=await coordinator.advance({workflowId:id});
 assert.equal(report.ok,true);assert.equal(report.phase,'COMPLETED');
 assert.equal(report.outcome.prices.total,total.total);
 assert.equal(report.outcome.completion,'CHOICE_AND_TOTAL_REPORTED');
 assert.equal(coordinator.previewReport(id).provisional,false);
 assert.deepEqual(events,['APP_SWITCH','SCREEN_READ','COMPARE','TOTAL','EXPLAIN']);
});
