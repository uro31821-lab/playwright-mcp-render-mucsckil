import test from 'node:test';
import assert from 'node:assert/strict';
import {planRoute} from '../scripts/router.mjs';

const available={
  skills:['jh-dev-toolkit','jh-open-source-scout','jh-ebiseo-assist','jh-jebiseo'],
  capabilities:[]
};
const base={threadId:'test:jebiseo-thread',sourceRef:'test:user-request',available};
const intent={kind:'task',primary:'gemini'};

test('a packaged Jebiseo skill alone is unavailable and supplies no Gemini badge',()=>{
  const result=planRoute({...base,intent});
  assert.equal(result.lead,'gemini');
  assert.equal(result.ready,false);
  assert.deepEqual(result.unavailableCapabilities,['gemini']);
  assert.deepEqual(result.requiredSkills,['jh-jebiseo']);
  assert.equal(result.badge,null);
  assert.deepEqual(result.participantBadges,[]);
  assert.equal(result.dispatchesTools,false);
  assert.equal(result.authorizesExecution,false);
});

test('Samsung, YouTube and video prepare all three automatic actions without claiming phone readiness',()=>{
  for (const geminiFeature of ['ANDROID','YOUTUBE','VIDEO']) {
    const result=planRoute({...base,intent:{...intent,geminiFlow:'HANDOFF',geminiFeature}});
    assert.equal(result.ready,true);
    assert.equal(result.routeScope,'HANDOFF_PREPARATION');
    assert.equal(result.executionReady,false);
    assert.equal(result.deliveryMode,'AUTO_TEXT_SELECTION');
    assert.deepEqual(result.automationStages,['SELECT_REQUEST_TEXT','CLICK_GEMINI_MENU','SUBMIT_GEMINI']);
    assert.equal(result.automaticHandoffRequested,true);
    assert.equal(result.requiresNativeHandoffBinding,true);
    assert.equal(result.manualAllowed,false);
    assert.equal(result.returnToGpt,geminiFeature==='YOUTUBE');
    assert.equal(result.resultDestination,geminiFeature==='YOUTUBE'?'GPT_AFTER_MANUAL_SHARE':'GEMINI');
    assert.equal(result.automaticReturnToGpt,false);
    assert.equal(result.badge,null);
    assert.deepEqual(result.participantBadges,[]);
    assert.deepEqual(result.unavailableCapabilities,[]);
    assert.equal(result.dispatchesTools,false);
    assert.equal(result.authorizesExecution,false);
    assert.deepEqual(base.available.capabilities,[]);
    const absent=planRoute({...base,intent:{...intent,geminiFlow:'HANDOFF',geminiFeature},
      available:{skills:[],capabilities:[]}});
    assert.equal(absent.ready,false);
  }
});

test('manual delivery is explicit and its existing task choice survives continuation',()=>{
  for (const deliveryMode of ['TEXT_SELECTION','OPEN_MANUAL']) {
    const result=planRoute({...base,intent:{...intent,geminiFlow:'HANDOFF',geminiFeature:'YOUTUBE',deliveryMode}});
    assert.equal(result.deliveryMode,deliveryMode);
    assert.equal(result.manualAllowed,true);
    assert.equal(result.automaticHandoffRequested,false);
    assert.deepEqual(result.automationStages,[]);
    const activeTask={id:'test:manual-task',threadId:base.threadId,lead:'gemini',helpers:[],mode:'assist',
      status:'active',conditions:{geminiFlow:'HANDOFF',geminiFeature:'YOUTUBE',deliveryMode},effects:{}};
    assert.equal(planRoute({...base,activeTask,intent:{kind:'continue'}}).deliveryMode,deliveryMode);
  }
  assert.throws(()=>planRoute({...base,intent:{...intent,geminiFlow:'HANDOFF',geminiFeature:'YOUTUBE',
    deliveryMode:'AUTO_ANY_CLICK'}}),/GEMINI_HANDOFF_DELIVERY_MODE_INVALID/);
});

test('YouTube continuation preserves uncertainty and the manual return plan without automatic collection',()=>{
  const activeTask={id:'test:handoff-task',threadId:base.threadId,lead:'gemini',helpers:[],
    mode:'assist',status:'awaiting_user',conditions:{geminiFlow:'HANDOFF',geminiFeature:'YOUTUBE'},
    effects:{originalOpen:{status:'unknown'}}};
  const result=planRoute({...base,activeTask,intent:{kind:'continue'}});
  assert.equal(result.taskId,activeTask.id);
  assert.equal(result.ready,true);
  assert.equal(result.requiresResultInspection,true);
  assert.equal(result.returnToGpt,true);
  assert.equal(result.automaticReturnToGpt,false);
  assert.equal(result.resultDestination,'GPT_AFTER_MANUAL_SHARE');
  assert.equal(result.authorizesExecution,false);
  assert.equal(planRoute({...base,activeTask:{...activeTask,threadId:'test:other-room'},
    intent:{kind:'continue'}}).reason,'CURRENT_TASK_REQUIRED');
});

test('handoff cannot turn a development helper, explanation or unknown feature into available Gemini',()=>{
  const develop=planRoute({...base,intent:{kind:'develop',helpers:['gemini'],
    geminiFlow:'HANDOFF',geminiFeature:'ANDROID'}});
  assert.deepEqual(develop.unavailableCapabilities,['gemini']);
  assert.equal(develop.routeScope,undefined);
  assert.equal(planRoute({...base,intent:{kind:'explain_feature',topics:['gemini'],
    geminiFlow:'HANDOFF',geminiFeature:'YOUTUBE'}}).action,'explain');
  assert.throws(()=>planRoute({...base,intent:{...intent,geminiFlow:'HANDOFF',
    geminiFeature:'ARBITRARY'}}),/GEMINI_HANDOFF_FEATURE_REQUIRED/);
});

test('a provider capability without the current skill also remains unavailable',()=>{
  const result=planRoute({...base,intent,available:{skills:[],capabilities:['gemini-assistance']}});
  assert.equal(result.ready,false);
  assert.deepEqual(result.unavailableCapabilities,['gemini']);
  assert.equal(result.badge,null);
});

test('synthetic available skill and provider create only a route, never a Gemini answer',()=>{
  const result=planRoute({...base,intent,available:{...available,capabilities:['gemini-assistance']}});
  assert.equal(result.ready,true);
  assert.deepEqual(result.unavailableCapabilities,[]);
  assert.equal(result.badge,'🏴‍☠️ 제비서:');
  assert.equal(result.dispatchesTools,false);
  assert.equal(result.authorizesExecution,false);
  assert.equal(result.changesPersistentState,false);
  assert.equal(Object.hasOwn(result,'answer'),false);
});

test('Jebiseo development target does not become a Gemini invocation',()=>{
  const result=planRoute({...base,intent:{kind:'develop',topics:['gemini'],helpers:['personal','open_source']}});
  assert.equal(result.lead,'development');
  assert.deepEqual(result.helpers,['personal','open_source']);
  assert.equal(result.requiredSkills.includes('jh-jebiseo'),false);
  assert.deepEqual(result.unavailableCapabilities,[]);
  assert.equal(result.dispatchesTools,false);
});

test('quoted Jebiseo usage explanation creates no provider work',()=>{
  const result=planRoute({...base,intent:{kind:'explain_feature',topics:['gemini']}});
  assert.equal(result.action,'explain');
  assert.deepEqual(result.requiredSkills,[]);
  assert.deepEqual(result.participantBadges,[]);
  assert.equal(result.dispatchesTools,false);
});

test('explicit Gemini help during development stays unavailable without blocking the main developer',()=>{
  const result=planRoute({...base,intent:{kind:'develop',helpers:['personal','gemini']}});
  assert.equal(result.lead,'development');
  assert.equal(result.ready,true);
  assert.deepEqual(result.helpers,['personal','gemini']);
  assert.deepEqual(result.unavailableCapabilities,['gemini']);
  assert.equal(result.participantBadges.some(x=>x.id==='gemini'),false);
  assert.equal(result.authorizesExecution,false);
});

test('explicit exclusion still removes Gemini development help',()=>{
  const result=planRoute({...base,intent:{kind:'develop',helpers:['gemini','open_source'],excluded:['gemini']}});
  assert.deepEqual(result.helpers,['open_source']);
  assert.equal(result.requiredSkills.includes('jh-jebiseo'),false);
});

test('Jebiseo continuation keeps the original task and unresolved result without replay authority',()=>{
  const activeTask={
    id:'test:jebiseo-task',threadId:base.threadId,lead:'gemini',helpers:['personal'],
    mode:'assist',status:'active',effects:{originalRequest:{status:'unknown'}}
  };
  const result=planRoute({...base,activeTask,intent:{kind:'continue'}});
  assert.equal(result.taskId,activeTask.id);
  assert.equal(result.lead,'gemini');
  assert.equal(result.requiresResultInspection,true);
  assert.equal(result.ready,false);
  assert.equal(result.dispatchesTools,false);
  assert.equal(result.authorizesExecution,false);
  assert.equal(planRoute({...base,activeTask:{...activeTask,threadId:'test:other-room'},intent:{kind:'continue'}}).reason,'CURRENT_TASK_REQUIRED');
});
