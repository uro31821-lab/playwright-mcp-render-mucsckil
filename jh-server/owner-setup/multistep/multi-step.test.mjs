import test from 'node:test';
import assert from 'node:assert/strict';
import {JHMultiStepCoordinator} from './multi-step.mjs';

const NOW=Date.parse('2026-10-13T06:00:00Z');
const APP='com.android.chrome',ORIGIN='https://hotel.example.kr';
const context=(commandId='command_A',mode='PURCHASE')=>({userInitiated:true,deviceId:'android1',commandId,
 scope:{apps:[APP],origins:[ORIGIN],maxPaymentKRW:600000,mayCheckout:mode==='PURCHASE',mayRequestApproval:mode==='PURCHASE'}});
const choice={ok:true,decisionId:'choice_test_abc',conditional:false,alternativesAvailable:true,
 recommendation:{items:[{id:'offerA',title:'검증된 호텔',source:{url:ORIGIN+'/hotel',stale:false},available:true,
  cost:{complete:true,total:270000,dueNow:50000}}],totals:{complete:true,kind:'QUOTED',currency:'KRW',confirmed:270000,estimated:0,
  knownSubtotal:270000,total:270000,unknown:[],sharedDiscounts:[]}},
 alternatives:[{items:[{id:'offerB',title:'대안 호텔'}]}],
 explanation:{summary:'가격·위치·평점·조건 비교 후 추천'}};
const request={query:'호텔 비교',groups:[{id:'hotels',candidates:[{id:'offerA',source:{url:ORIGIN+'/hotel'}}]}]};
const payment={request_key:'',merchant:'실제 호텔',purpose:'검증된 호텔',order_id:'order-1',amount:270000,currency:'KRW',method:'CARD',
 decision_id:'choice_test_abc',choice_item_id:'offerA',choice_payment_scope:'FULL_ITEM',source_url:ORIGIN+'/hotel',checkout_url:ORIGIN+'/checkout'};
const success={ok:true,state:'SUCCESS_OBSERVED',payment_success_observed:true,payment_verified:false,evidence_level:'MERCHANT_SCREEN',receipt:{transaction_id:'TX-10',merchant:'실제 호텔',order_id:'order-1',amount:270000,currency:'KRW',method:'CARD'}};
function setup(mode='PURCHASE'){
 let binding=context('command_A',mode),status={state:'AWAITING_APPROVAL'},calls={switch:0,read:0,prepare:0,open:0,approval:0,verify:0,discard:0,report:0};
 let holdNavigation=null;
 const proof={ok:true,chatWindowId:'12',chatPackage:'com.openai.chatgpt',workWindowId:'34',workPackage:APP,observedAtMs:NOW};
 const ports={
  currentCommand:async()=>binding,
  verifySplitPair:()=>proof,
  navigateApp:async()=>{calls.switch++;if(holdNavigation)return await holdNavigation;return {ok:true,resultVerified:true};},
  readScreen:async()=>{calls.read++;return {ok:true,resultVerified:true,summarySource:'source'};},
  recommend:async()=>structuredClone(choice),
  explainDecision:async()=>({mainConditions:{criteria:['price','distanceKm','rating']},explanation:{summary:'조건 검증'},alternatives:structuredClone(choice.alternatives)}),
  calculateTotal:async()=>({ok:true,...choice.recommendation.totals}),
  payment:{
    prepare:async()=>{calls.prepare++;return {ok:true,payment_id:'pay_test'};},
    open:async()=>{calls.open++;return {ok:true,open_status:'OPEN_REPORTED'};},
    requestApproval:async()=>{calls.approval++;return {ok:true,state:'AWAITING_APPROVAL',approval_url:ORIGIN+'/user-approve',expires_at:NOW+120000,quote:{merchant:'실제 호텔',order_id:'order-1',amount:270000,currency:'KRW',method:'CARD'}};},
    verify:async()=>{calls.verify++;return {...status};},
    report:async()=>({...status}),
    discard:async()=>{calls.discard++;return {removed:1,preserved:0};}
  },
  reportToGpt:async()=>{calls.report++;return {delivered:true}}
 };
 const engine=new JHMultiStepCoordinator(ports,{now:()=>NOW});
 return {engine,ports,calls,changeCommand:(c)=>binding=context(c,mode),setPaymentStatus:x=>status=x,
  holdNavigation:p=>holdNavigation=p,proof};
}
async function startTo(engine,mode,kind){
 const started=await engine.start({goal:'호텔 후보 비교 후 현재 명령에서 처리',mode});
 const id=started.workflowId;
 for(let i=0;i<12&&engine.status().currentStep!==kind;i++){
  const now=engine.status().currentStep;
  const input= now==='COMPARE'?{recommendRequest:request}:{};
  const r=await engine.advance({workflowId:id,input});
  assert.equal(r.ok,true,JSON.stringify(r));
 }
 assert.equal(engine.status().currentStep,kind);
 return id;
}

test('비교 흐름: 화면 전환 -> 화면 읽기 -> 비교 -> 총액 -> 이유/차선 -> GPT 보고',async()=>{
 const {engine,calls}=setup('COMPARE');
 const id=await startTo(engine,'COMPARE','GPT_REPORT');
 const r=await engine.advance({workflowId:id});
 assert.equal(r.phase,'COMPLETED');assert.equal(calls.switch,1);assert.equal(calls.read,1);assert.equal(calls.report,1);
 assert.equal(r.outcome.prices.total,270000);assert.equal(r.outcome.completion,'CHOICE_AND_TOTAL_REPORTED');
 assert.equal(r.outcome.alternative[0].items[0].id,'offerB');
 const final=await engine.checkedPreviewReport(id);
 assert.equal(final.provisional,false);assert.equal(final.report.completion,'CHOICE_AND_TOTAL_REPORTED');
});

test('실제 시작 직후 빈 선택·총액 보고는 미완료이며 조회만으로 단계 실행 금지',async()=>{
 const {engine,calls}=setup('COMPARE');
 const id=(await engine.start({goal:'설치 후 읽기 전용 보고 검증',mode:'COMPARE'})).workflowId;
 const before=structuredClone(calls),status=engine.status();
 const r=await engine.checkedPreviewReport(id);
 assert.equal(r.provisional,true);assert.equal(r.report.completion,'INCOMPLETE');
 assert.deepEqual(r.report.selected,[]);assert.equal(r.report.prices,null);
 assert.equal(r.report.caveat,'총액 계산이 아직 완료되지 않았습니다.');
 assert.deepEqual(calls,before);assert.deepEqual(engine.status(),status);
});

test('선택·총액 일부 진행 상태는 완료가 아니며 설명까지 확인하면 보고 준비 상태',async()=>{
 const {engine,calls}=setup('COMPARE');
 const id=await startTo(engine,'COMPARE','TOTAL');
 let r=engine.previewReport(id);
 assert.equal(r.report.selected.length,1);assert.equal(r.report.prices,null);
 assert.equal(r.report.completion,'INCOMPLETE');
 assert.equal((await engine.advance({workflowId:id})).ok,true);
 r=engine.previewReport(id);assert.equal(r.report.prices.total,270000);
 assert.equal(r.report.completion,'INCOMPLETE');
 assert.equal((await engine.advance({workflowId:id})).ok,true);
 r=engine.previewReport(id);assert.equal(r.provisional,true);
 assert.equal(r.report.completion,'CHOICE_AND_TOTAL_READY');assert.equal(calls.report,0);
});

test('보고 전송 확인 실패는 완료를 주장하지 않으며 성공 확인 후에만 완료',async()=>{
 const {engine,ports}=setup('COMPARE');
 const id=await startTo(engine,'COMPARE','GPT_REPORT');
 let delivered=false;const sent=[];
 ports.reportToGpt=async(_ctx,r)=>{sent.push(r);return {delivered};};
 const failed=await engine.advance({workflowId:id});
 assert.equal(failed.ok,false);assert.equal(failed.code,'GPT_REPORT_DELIVERY_UNCONFIRMED');
 assert.equal(sent[0].completion,'CHOICE_AND_TOTAL_READY');
 const preview=engine.previewReport(id);
 assert.equal(preview.provisional,true);assert.equal(preview.report.completion,'CHOICE_AND_TOTAL_READY');
 assert.equal(engine.status().report,null);
 delivered=true;
 const completed=await engine.advance({workflowId:id});
 assert.equal(completed.phase,'COMPLETED');assert.equal(completed.outcome.completion,'CHOICE_AND_TOTAL_REPORTED');
});

test('완료 뒤 조건 변경은 이전 보고를 폐기하고 다시 미완료로 표시',async()=>{
 const {engine}=setup('COMPARE');
 const id=await startTo(engine,'COMPARE','GPT_REPORT');
 assert.equal((await engine.advance({workflowId:id})).phase,'COMPLETED');
 await engine.revise({workflowId:id,conditions:{budget:300000}});
 const r=engine.previewReport(id);
 assert.equal(r.provisional,true);assert.equal(r.report.completion,'INCOMPLETE');
 assert.deepEqual(r.report.selected,[]);assert.equal(r.report.prices,null);assert.equal(engine.status().report,null);
});

test('호스트 콜백 없이 MCP 응답으로 보고할 때도 최종 단계에서만 완료',async()=>{
 const {engine,ports}=setup('COMPARE');delete ports.reportToGpt;
 const id=await startTo(engine,'COMPARE','GPT_REPORT');
 assert.equal(engine.previewReport(id).report.completion,'CHOICE_AND_TOTAL_READY');
 const done=await engine.advance({workflowId:id});
 assert.equal(done.phase,'COMPLETED');assert.equal(done.outcome.completion,'CHOICE_AND_TOTAL_REPORTED');
 assert.equal(engine.previewReport(id).provisional,false);
});

test('분할 화면 검증 실패 후 보고는 미완료이며 자동 재시도하지 않는다',async()=>{
 const {engine,proof,calls}=setup('COMPARE');proof.ok=false;
 const id=(await engine.start({goal:'분할 화면 오류 보고 검증',mode:'COMPARE'})).workflowId;
 const failed=await engine.advance({workflowId:id});
 assert.equal(failed.ok,false);assert.equal(failed.phase,'NEEDS_REVIEW_NO_REPLAY');
 const before=structuredClone(calls),r=await engine.checkedPreviewReport(id);
 assert.equal(r.report.completion,'INCOMPLETE');assert.equal(r.report.automaticReplay,false);
 assert.deepEqual(calls,before);
});

test('결제 승인 뒤에도 실제 결제 제출은 하지 않으며 read-only 검증만 수행',async()=>{
 const {engine,calls,setPaymentStatus}=setup();
 const id=await startTo(engine,'PURCHASE','CHECKOUT');
 const checkout=await engine.advance({workflowId:id,input:{payment:{...payment,request_key:id+':core_3'}}});
 assert.equal(checkout.ok,true,JSON.stringify(checkout));assert.equal(calls.prepare,1);assert.equal(calls.open,1);
 const approval=await engine.advance({workflowId:id});
 assert.equal(approval.phase,'WAITING_USER_APPROVAL');assert.equal(approval.outcome.state,'AWAITING_USER_APPROVAL');
 assert.equal(calls.approval,1);
 setPaymentStatus({ok:true,state:'AUTHENTICATION_REQUIRED',payment_success_observed:false});
 const pending=await engine.advance({workflowId:id});
 assert.equal(pending.phase,'WAITING_USER_OR_RESULT');assert.equal(pending.paymentResult.outcome,'AUTHENTICATION_REQUIRED');
 assert.equal(calls.open,1);assert.equal(calls.approval,1);
 setPaymentStatus(success);
 const confirmed=await engine.advance({workflowId:id});
 assert.equal(confirmed.ok,true);assert.equal(engine.status().currentStep,'GPT_REPORT');
 const finished=await engine.advance({workflowId:id});
 assert.equal(finished.phase,'COMPLETED');assert.equal(finished.outcome.completion,'MERCHANT_SUCCESS_OBSERVED');
 assert.equal(finished.outcome.bankApiVerified,false);
 assert.equal(calls.open,1);assert.equal(calls.approval,1);assert.equal(calls.verify,2);
});

test('새 명령은 옛 미완성 작업을 취소한 다음 새 작업 시작',async()=>{
 const {engine,calls,changeCommand}=setup('COMPARE');
 const first=await engine.start({goal:'첫째 요청',mode:'COMPARE'});changeCommand('command_B');
 const second=await engine.start({goal:'둘째 요청',mode:'COMPARE'});
 assert.notEqual(first.workflowId,second.workflowId);assert.equal(second.goal,'둘째 요청');assert.equal(calls.discard,1);
 assert.equal(engine.status().steps.every(s=>s.status==='PENDING'),true);
 assert.equal(engine.status().automaticResume,false);
});

test('이전 비동기 화면 콜백은 새 명령 상태를 수정할 수 없다',async()=>{
 const {engine,changeCommand,holdNavigation}=setup('COMPARE');
 let complete;holdNavigation(new Promise(resolve=>{complete=resolve;}));
 const a=await engine.start({goal:'첫째 작업',mode:'COMPARE'});
 const pending=engine.advance({workflowId:a.workflowId});
 await Promise.resolve();changeCommand('command_B');
 const b=await engine.start({goal:'둘째 작업',mode:'COMPARE'});
 complete({ok:true,resultVerified:true});
 const late=await pending;assert.equal(late.ok,false);assert.equal(late.code,'WORK_CANCELLED_OR_SUPERSEDED');
 assert.equal(engine.status().workflowId,b.workflowId);assert.equal(engine.status().completed,0);
});

test('같은 명령으로 새 시작은 거절, 외부 앱 직접 선택시 자동 재개 불가',async()=>{
 const {engine}=setup('COMPARE');
 const a=await engine.start({goal:'현재 작업',mode:'COMPARE'});
 await assert.rejects(()=>engine.start({goal:'중복 시작',mode:'COMPARE'}),/ONE_ACTIVE_PLAN_PER_COMMAND/);
 const cancelled=await engine.onDirectSiteSwitch();assert.equal(cancelled.oldWorkDeleted,true);
 assert.equal(engine.status().active,false);assert.equal(engine.status().automaticResume,false);
 await assert.rejects(()=>engine.advance({workflowId:a.workflowId}),/ACTIVE_WORKFLOW_NOT_FOUND/);
});

test('기존 ChatGPT 화면이 달라지면 다음 읽기 차단',async()=>{
 const {engine,proof}=setup('COMPARE');
 const a=await engine.start({goal:'화면 검증',mode:'COMPARE'});
 assert.equal((await engine.advance({workflowId:a.workflowId})).ok,true);
 proof.chatWindowId='9876';const bad=await engine.advance({workflowId:a.workflowId});
 assert.equal(bad.ok,false);assert.equal(bad.code,'ORIGINAL_CHAT_PANE_CHANGED');
});

test('검증되지 않은 분할 화면은 이동 성공으로 판정 불가',async()=>{
 const {engine,proof}=setup('COMPARE');proof.workPackage='com.other.bad';
 const a=await engine.start({goal:'서명된 분할 화면 필요',mode:'COMPARE'});
 const r=await engine.advance({workflowId:a.workflowId});
 assert.equal(r.ok,false);assert.equal(r.code,'SPLIT_SCREEN_PROOF_INVALID');
 assert.equal(engine.status().phase,'NEEDS_REVIEW_NO_REPLAY');
});

test('가격 조건 변경은 같은 명령 내 재계획으로 비교부터 재시작',async()=>{
 const {engine}=setup('COMPARE');const id=await startTo(engine,'COMPARE','GPT_REPORT');
 await assert.rejects(()=>engine.revise({workflowId:id,conditions:{budget:9999999}}),/BUDGET_OUTSIDE_USER_SCOPE/);
 const r=await engine.revise({workflowId:id,conditions:{budget:400000,weights:{price:100}}});
 assert.equal(r.currentStep,'COMPARE');assert.equal(r.decisionId,null);assert.equal(r.completed,2);
 assert.equal(r.conditions.budget,400000);
});

test('앱이나 URL은 최초 사용자 작업 scope 밖으로 확장 불가',async()=>{
 const {engine}=setup('COMPARE');const a=await engine.start({goal:'특정 호텔 비교',mode:'COMPARE'});
 await engine.advance({workflowId:a.workflowId});await engine.advance({workflowId:a.workflowId});
 const malicious={...request,groups:[{id:'hotels',candidates:[{id:'offerA',source:{url:'https://out-of-scope.site/hotel'}}]}]};
 const r=await engine.advance({workflowId:a.workflowId,input:{recommendRequest:malicious}});
 assert.equal(r.ok,false);assert.equal(r.code,'CANDIDATE_SOURCE_OUTSIDE_SCOPE');
});

test('다른 선택, 계산액, 임의 결제 링크 또는 과다 결제는 준비 전 거절',async()=>{
 const {engine,calls}=setup();const id=await startTo(engine,'PURCHASE','CHECKOUT');
 const invalids=[
  {...payment,request_key:id+':core_3',amount:300000},
  {...payment,request_key:id+':core_3',checkout_url:'https://evil.site/pay'},
  {...payment,request_key:id+':core_3',choice_item_id:'other'},
  {...payment,request_key:'fakeId'}
 ];
 for(const p of invalids){const r=await engine.advance({workflowId:id,input:{payment:p}});assert.equal(r.ok,false);assert.equal(calls.prepare,0);}
});

test('미확인 결과는 자동 재결제/성공 표시하지 않음',async()=>{
 const {engine,calls,setPaymentStatus}=setup();const id=await startTo(engine,'PURCHASE','CHECKOUT');
 await engine.advance({workflowId:id,input:{payment:{...payment,request_key:id+':core_3'}}});
 await engine.advance({workflowId:id});
 setPaymentStatus({ok:true,state:'UNKNOWN',payment_success_observed:false,receipt:null});
 const r=await engine.advance({workflowId:id});
 assert.equal(r.phase,'UNKNOWN_NO_RETRY');assert.equal(r.paymentResult.outcome,'EXTERNAL_RESULT_UNCONFIRMED');
 assert.equal(engine.previewReport(id).report.completion,'UNCONFIRMED');assert.equal(calls.open,1);
});

test('결제 준비 후 재계획 거절; 작업 취소 시 기존 결제 장부 정리 어댑터 호출',async()=>{
 const {engine,calls}=setup();const id=await startTo(engine,'PURCHASE','CHECKOUT');
 await engine.advance({workflowId:id,input:{payment:{...payment,request_key:id+':core_3'}}});
 await assert.rejects(()=>engine.revise({workflowId:id,conditions:{budget:300000}}),/PAYMENT_PREPARATION_CANCEL_FIRST/);
 const cancelled=await engine.cancelWorkflow(id);assert.equal(cancelled.cancelled,true);assert.equal(calls.discard,1);
 assert.equal(cancelled.externalEffectLedger,'EXISTING_JH_LEDGER_RETAINED');
});

test('강제종료는 작업 버리고 실행 자동 복구 없이 새 인스턴스 IDLE',async()=>{
 const a=setup('COMPARE');await a.engine.start({goal:'기존 작업',mode:'COMPARE'});
 await a.engine.onForceStop();assert.equal(a.engine.status().active,false);
 const b=setup('COMPARE');assert.equal(b.engine.status().phase,'IDLE');
});

test('사용자 명령 시작 확인 없이 자율 시작 불가',async()=>{
 const {engine,ports}=setup('COMPARE');ports.currentCommand=async()=>({...context('command_A','COMPARE'),userInitiated:false});
 await assert.rejects(()=>engine.start({goal:'자동 재실행',mode:'COMPARE'}),/JH_ACTIVE_USER_COMMAND_REQUIRED/);
});

test('동시 2개 step 실행은 중복 진행 차단',async()=>{
 const {engine,holdNavigation}=setup('COMPARE');let go;holdNavigation(new Promise(resolve=>{go=resolve;}));
 const a=await engine.start({goal:'동시 중복 방지',mode:'COMPARE'});
 const first=engine.advance({workflowId:a.workflowId});await Promise.resolve();
 await assert.rejects(()=>engine.advance({workflowId:a.workflowId}),/WORK_IN_PROGRESS/);
 go({ok:true,resultVerified:true});await first;assert.equal(engine.status().completed,1);
});

test('불완전 총액은 차액을 창작하지 않고 결제 준비를 차단',async()=>{
 const {engine,ports,calls}=setup();
 ports.recommend=async()=>({...structuredClone(choice),recommendation:{...structuredClone(choice.recommendation),totals:{
  complete:false,kind:'INCOMPLETE',currency:'KRW',confirmed:250000,estimated:0,
  knownSubtotal:250000,total:null,unknown:['수수료 확인 필요'],sharedDiscounts:[]}}});
 const id=await startTo(engine,'PURCHASE','CHECKOUT');
 assert.equal(engine.status().totals.total,null);assert.equal(engine.status().totals.unknown[0],'수수료 확인 필요');
 const r=await engine.advance({workflowId:id,input:{payment:{...payment,request_key:id+':core_3'}}});
 assert.equal(r.ok,false);assert.equal(r.code,'QUOTE_OR_CONDITIONS_REQUIRE_RECHECK');assert.equal(calls.prepare,0);
});

test('결제 화면 승인 전 판매처/금액 불일치 발견하면 승인 안내 중지',async()=>{
 const {engine,ports,calls}=setup();const id=await startTo(engine,'PURCHASE','CHECKOUT');
 await engine.advance({workflowId:id,input:{payment:{...payment,request_key:id+':core_3'}}});
 ports.payment.requestApproval=async()=>{calls.approval++;return {ok:true,state:'AWAITING_APPROVAL',approval_url:ORIGIN+'/approve',quote:{
  merchant:'다른 회사',order_id:'order-1',amount:270000,currency:'KRW',method:'CARD'}}};
 const r=await engine.advance({workflowId:id});
 assert.equal(r.ok,false);assert.equal(r.code,'CHECKOUT_QUOTE_CHANGED_REVIEW_REQUIRED');
 assert.equal(engine.status().approval,null);assert.equal(engine.status().phase,'NEEDS_REVIEW_NO_REPLAY');
 await assert.rejects(()=>engine.advance({workflowId:id}),/RETRY_FORBIDDEN_AFTER_UNCONFIRMED_SIDE_EFFECT/);
});

test('결제 완료 응답이더라도 영수증 가격·주문번호가 다르면 성공 처리 금지',async()=>{
 const {engine,setPaymentStatus}=setup();const id=await startTo(engine,'PURCHASE','CHECKOUT');
 await engine.advance({workflowId:id,input:{payment:{...payment,request_key:id+':core_3'}}});
 await engine.advance({workflowId:id});
 setPaymentStatus({...success,receipt:{...success.receipt,amount:200000}});
 const r=await engine.advance({workflowId:id});
 assert.equal(r.phase,'WAITING_USER_OR_RESULT');assert.equal(r.paymentResult.outcome,'PAYMENT_NOT_CONFIRMED');
 assert.equal(engine.previewReport(id).report.completion,'UNCONFIRMED');
});

test('취소 정리 중 문제는 해결한 척하지 않고 재조사 상태 반환',async()=>{
 const {engine,ports}=setup('COMPARE');ports.payment.discard=async()=>{throw Error('ledger unavailable');};
 const id=(await engine.start({goal:'시험 작업',mode:'COMPARE'})).workflowId;
 const r=await engine.cancelWorkflow(id);
 assert.equal(r.ok,false);assert.equal(r.cleanup,'JH_PAYMENT_CLEANUP_REQUIRES_RECONCILIATION');
 assert.equal(r.oldWorkDeleted,true);assert.equal(engine.status().active,false);
});

test('스크린 증거가 오래되면 화면 재확인이 필요',async()=>{
 const {engine,proof}=setup('COMPARE');proof.observedAtMs=NOW-120000;
 const id=(await engine.start({goal:'오래된 화면',mode:'COMPARE'})).workflowId;
 const r=await engine.advance({workflowId:id});
 assert.equal(r.ok,false);assert.equal(r.code,'SPLIT_SCREEN_PROOF_INVALID');
});

test('도중 다른 명령 감지시 즉시 취소하고 승인 준비 무효화 요청',async()=>{
 const {engine,changeCommand,calls}=setup('COMPARE');const id=(await engine.start({goal:'현재 작업',mode:'COMPARE'})).workflowId;
 changeCommand('command_B');
 const r=await engine.advance({workflowId:id});
 assert.equal(r.ok,false);assert.equal(r.code,'WORK_CANCELLED_OR_SUPERSEDED');
 assert.equal(engine.status().active,false);assert.equal(calls.discard,1);
});
