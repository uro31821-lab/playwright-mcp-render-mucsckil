import test from 'node:test';
import assert from 'node:assert/strict';
import {catalog,planRoute,checkRouteResponse} from '../scripts/router.mjs';
import {checkFeatureResults} from '../scripts/owned-features.mjs';
const available={skills:catalog.entries.map(e=>e.skill).filter(Boolean),capabilities:catalog.entries.map(e=>e.requiresCapability).filter(Boolean)};
const base={threadId:'test:np-thread',sourceRef:'test:np-request',available};
const newNeeds=['experience_reviews','place_context','reservation_prep','purchase_handoff','execution_path'];
const need=id=>({id,sourceRef:base.sourceRef,reason:'Current request needs this feature'});
const route=(intent,extra={})=>planRoute({...base,...extra,intent});

test('food reviews use one video appendix and preserve the food owner',()=>{
 const p=route({kind:'task',primary:'food',featureNeeds:[need('experience_reviews')]});
 assert.equal(p.lead,'food');assert.equal(p.featureAssignments[0].owner,'video');
 assert.equal(p.featureAssignments[0].role,'appendix');
 assert.equal(p.helpers.filter(id=>id==='video').length,1);
 assert.ok(!p.helpers.includes('reservation'));assert.ok(!p.helpers.includes('critique'));
});
test('each requested feature uses its existing specialist without a new capability',()=>{
 const owners=['video','travel','reservation','shopping','food'];
 for(let i=0;i<newNeeds.length;i++){
  const p=route({kind:'task',primary:'food',featureNeeds:[need(newNeeds[i])]});
  assert.equal(p.featureAssignments[0].owner,owners[i]);assert.equal(p.lead,'food');
  assert.equal(p.featureAssignments[0].authorizesExecution,false);
 }
});
test('reservation prep is a supplement, not a persisted lead change or booking',()=>{
 const task={id:'test:task',threadId:base.threadId,lead:'food',helpers:[],mode:'assist',status:'active',conditionRevision:2,effects:{},menu:{id:'test:menu',threadId:base.threadId,choices:[]}};
 const before=structuredClone(task);
 const p=route({kind:'continue',featureNeeds:[need('reservation_prep')]},{activeTask:task});
 assert.equal(p.lead,'food');assert.deepEqual(task,before);assert.equal(p.dispatchesTools,false);
 assert.equal(p.featureAssignments[0].binding.menuId,'test:menu');
});
test('unknown external result takes priority over every new feature',()=>{
 const p=route({kind:'continue',featureNeeds:newNeeds.map(need)},{activeTask:{id:'test:task',threadId:base.threadId,lead:'reservation',helpers:[],mode:'assist',status:'active',conditionRevision:1,effects:{booking:{status:'unknown'}}}});
 assert.equal(p.featureAssignments[0].id,'result_readback');
 assert.ok(p.featureAssignments.slice(1).every(a=>a.status==='deferred'));
 assert.equal(p.dispatchesTools,false);
});
test('development and quoted demonstrations do not start reviews or transactions',()=>{
 for(const kind of ['develop','explain_feature']){
  const p=route({kind,featureNeeds:newNeeds.map(need)});
  assert.ok(p.featureAssignments.every(a=>a.status==='suppressed'));
 }
});
test('excluded or missing specialist cannot be silently substituted',()=>{
 for(const [id,owner,skill] of [['place_context','travel','jh-yeobiseo'],['reservation_prep','reservation','jh-yeyakbiseo'],['purchase_handoff','shopping','jh-shoppingbiseo'],['experience_reviews','video','jh-yeongbiseo']]){
  const x=route({kind:'task',primary:'food',excluded:[owner],featureNeeds:[need(id)]});
  assert.equal(x.featureAssignments[0].status,'suppressed');
  const y=route({kind:'task',primary:'food',featureNeeds:[need(id)]},{available:{...available,skills:available.skills.filter(s=>s!==skill)}});
  assert.equal(y.featureAssignments[0].status,'unavailable');
 }
});
test('shopping handoff does not activate critique or evidence research without a request',()=>{
 const p=route({kind:'task',primary:'shopping',helpers:['critique','evidence'],featureNeeds:[need('experience_reviews'),need('purchase_handoff')]});
 assert.ok(!p.helpers.includes('critique'));assert.ok(!p.helpers.includes('evidence'));
 assert.ok(!p.helpers.includes('shopping'));assert.equal(p.featureAssignments[1].role,'primary');
});
test('optional new needs never leak into the next request and stop wins',()=>{
 route({kind:'task',primary:'food',featureNeeds:newNeeds.map(need)});
 assert.equal(route({kind:'task',primary:'food'}).featureAssignments,undefined);
 assert.deepEqual(route({kind:'stop',featureNeeds:newNeeds.map(need)}).featureAssignments,[]);
});
test('all eleven feature results are accepted by shape limit, not the old six cap',()=>{
 const ids=['result_readback','task_handoff','progress_check','preference_context','procedure_support','improvement',...newNeeds];
 const binding={sourceRef:base.sourceRef,threadId:base.threadId,taskId:null,conditionRevision:null,menuId:null};
 const plan={featureAssignments:ids.map(id=>({id,owner:'food',status:'planned',binding}))};
 const summary='현재 입력 자료를 확인했습니다.';
 const text='🏴‍☠️ 먹비서: '+summary;
 const response={text,sections:[{id:'food',state:'contributed',text}],featureResults:ids.map(id=>({id,owner:'food',binding,status:'completed',summary,evidenceRefs:['test:actual-source-in-fixture'],reason:null}))};
 assert.deepEqual(checkFeatureResults(plan,response,catalog),[]);
});
test('new features retain stale-result rejection and cannot declare transaction success',()=>{
 const p=route({kind:'task',primary:'shopping',featureNeeds:[need('purchase_handoff')]});
 const a=p.featureAssignments[0],summary='구매 링크와 옵션을 정리했습니다.',text='🏴‍☠️ 쇼핑비서: '+summary;
 const response={text,sections:[{id:'shopping',state:'contributed',text}],featureResults:[{id:a.id,owner:a.owner,binding:{...a.binding,sourceRef:'old:request'},status:'completed',summary,evidenceRefs:['test:link'],reason:null}]};
 assert.ok(checkFeatureResults(p,response,catalog).some(e=>e.code==='STALE_OR_FOREIGN_FEATURE_RESULT'));
 assert.equal(p.featureAssignments[0].completionProven,false);
});
