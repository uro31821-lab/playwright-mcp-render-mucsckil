import test from 'node:test';
import assert from 'node:assert/strict';
import { planRoute, catalog } from '../scripts/router.mjs';
const available = {skills:catalog.entries.flatMap(x=>x.skill?[x.skill]:[]),capabilities:[]};
const base = {threadId:'test-thread',sourceRef:'test:user-message',available};
const task = {id:'test-task',threadId:'test-thread',lead:'guide',helpers:[],mode:'explain',status:'active',effects:{},menu:{id:'test-menu',threadId:'test-thread'}};
test('direct task uses one specialty and returns no execution authority',()=>{ const r=planRoute({...base,intent:{kind:'task',topics:['food']}});assert.equal(r.lead,'food');assert.equal(r.authorizesExecution,false);assert.equal(r.dispatchesTools,false);assert.deepEqual(r.requiredSkills,['jh-meokbiseo']);});
test('development target is not the assistant invocation',()=>{ const r=planRoute({...base,intent:{kind:'develop',topics:['food'],helpers:['open_source','personal']}});assert.equal(r.lead,'development');assert.deepEqual(r.helpers,['open_source','personal']);});
test('quoted usage explanation creates no specialty work',()=>{ const r=planRoute({...base,intent:{kind:'explain_feature',topics:['reflection']}});assert.equal(r.action,'explain');assert.deepEqual(r.requiredSkills,[]);});
test('mixed purpose preserves lead and bounded collaborators',()=>{ const r=planRoute({...base,intent:{kind:'task',primary:'travel',topics:['travel','food'],helpers:['food','food','personal'],excluded:['personal']}});assert.equal(r.lead,'travel');assert.deepEqual(r.helpers,['food']);assert.equal(r.badge,'🏴‍☠️ 여비서 · 먹비서');});
test('unresolved primary purpose asks only goal choice',()=>assert.equal(planRoute({...base,intent:{kind:'task',topics:['photo','food']}}).reason,'PRIMARY_GOAL_REQUIRED'));
test('explicit assistant and exclusion are respected',()=>{ assert.equal(planRoute({...base,intent:{kind:'task',explicitAssistant:'photo',topics:['food']}}).lead,'photo');assert.equal(planRoute({...base,intent:{kind:'task',explicitAssistant:'personal',excluded:['personal']}}).reason,'ASSISTANT_EXCLUDED');});
test('continuation carries mode and task without restart',()=>{ const r=planRoute({...base,activeTask:task,intent:{kind:'continue'}});assert.equal(r.taskId,task.id);assert.equal(r.mode,'explain');assert.equal(r.action,'continue');});
test('foreign task and obsolete menu cannot consume selection',()=>{ assert.equal(planRoute({...base,activeTask:{...task,threadId:'other'},intent:{kind:'select',menuId:'test-menu'}}).reason,'CURRENT_TASK_REQUIRED');assert.equal(planRoute({...base,activeTask:task,intent:{kind:'select',menuId:'old'}}).reason,'CURRENT_MENU_REQUIRED');});
test('current menu selection creates only a plan',()=>{const r=planRoute({...base,activeTask:task,intent:{kind:'select',menuId:'test-menu'}});assert.equal(r.action,'select');assert.equal(r.authorizesExecution,false);});
test('unknown effects survive mode switch and stop',()=>{ const t={...task,effects:{e:{status:'unknown'}}};for(const intent of [{kind:'mode',mode:'execute'},{kind:'stop'},{kind:'continue'}]){const r=planRoute({...base,activeTask:t,intent});assert.equal(r.requiresResultInspection,true);assert.equal(r.authorizesExecution,false);}});
test('completed or canceled tasks never reopen on continue',()=>{ for(const status of ['completed','canceled'])assert.equal(planRoute({...base,activeTask:{...task,status},intent:{kind:'continue'}}).reason,'TASK_CLOSED');});
test('missing specialty and external feature stay visibly unavailable',()=>{const missing=planRoute({...base,available:{skills:[],capabilities:[]},intent:{kind:'task',primary:'photo'}});assert.equal(missing.ready,false);assert.equal(missing.badge,null);assert.deepEqual(missing.unavailableCapabilities,['photo']);const camera=planRoute({...base,intent:{kind:'task',primary:'camera'}});assert.equal(camera.ready,false);});
test('task inbox and routine planning do not run specialties',()=>{for(const kind of ['inbox','save_routine','use_routine']){const r=planRoute({...base,intent:{kind}});assert.deepEqual(r.requiredSkills,[]);assert.equal(r.dispatchesTools,false);}});
test('host semantic interpretation is explicit and not regex guessed',()=>assert.throws(()=>planRoute({...base,intent:{text:'오늘 저녁 뭐 먹지'}}),/INVALID_INTENT/));
test('routine save never attaches an unselected foreign task',()=>{assert.equal(planRoute({...base,activeTask:{...task,threadId:'another-thread'},intent:{kind:'save_routine'}}).reason,'CURRENT_TASK_REQUIRED');assert.equal(planRoute({...base,activeTask:task,intent:{kind:'save_routine'}}).taskId,task.id);});
test('feedback needs its actual existing memory skill and stop outranks exclusions',()=>{assert.equal(planRoute({...base,intent:{kind:'feedback'}}).ready,false);assert.equal(planRoute({...base,available:{skills:['jh-personal-dialogue'],capabilities:[]},intent:{kind:'feedback'}}).ready,true);assert.equal(planRoute({...base,activeTask:task,intent:{kind:'stop',excluded:['guide']}}).action,'pause');});
test('a current task can add a requested collaborator without dropping its existing goal',()=>{const current={...task,lead:'travel',helpers:['personal']};const r=planRoute({...base,activeTask:current,intent:{kind:'change',helpers:['food'],excluded:['personal']}});assert.equal(r.lead,'travel');assert.equal(r.taskId,current.id);assert.deepEqual(r.helpers,['food']);assert.deepEqual(r.requiredSkills,['jh-yeobiseo','jh-meokbiseo']);});

test('interpreted art appreciation uses the current art skill without a camera capability or side effects',()=>{
  const r=planRoute({...base,intent:{kind:'task',topics:['art']}});
  assert.equal(r.ready,true);assert.equal(r.lead,'art');assert.equal(r.badge,'🏴‍☠️ 그비서');
  assert.deepEqual(r.requiredSkills,['jh-geubiseo']);assert.deepEqual(r.unavailableCapabilities,[]);
  assert.equal(r.authorizesExecution,false);assert.equal(r.dispatchesTools,false);assert.equal(r.changesPersistentState,false);
});

test('available photo editing never masks an unavailable art guide',()=>{
  const r=planRoute({...base,available:{skills:['jh-pyeonbiseo'],capabilities:[]},intent:{kind:'task',primary:'art'}});
  assert.equal(r.ready,false);assert.equal(r.lead,'art');assert.equal(r.badge,null);
  assert.deepEqual(r.requiredSkills,[]);assert.deepEqual(r.unavailableCapabilities,['art']);
});

test('art development and usage explanation do not invoke art appreciation or change the photo route',()=>{
  const development=planRoute({...base,intent:{kind:'develop',topics:['art'],helpers:['open_source','personal']}});
  assert.equal(development.lead,'development');assert.deepEqual(development.helpers,['open_source','personal']);
  assert.equal(development.requiredSkills.includes('jh-geubiseo'),false);
  const explanation=planRoute({...base,intent:{kind:'explain_feature',topics:['art']}});
  assert.equal(explanation.action,'explain');assert.deepEqual(explanation.requiredSkills,[]);
  const edit=planRoute({...base,intent:{kind:'task',primary:'photo',topics:['art','photo']}});
  assert.equal(edit.lead,'photo');assert.deepEqual(edit.requiredSkills,['jh-pyeonbiseo']);
});

test('art follow-up keeps the current menu and unresolved-result boundary',()=>{
  const current={...task,lead:'art',menu:{id:'art-menu',threadId:base.threadId},effects:{existing:{status:'unknown'}}};
  const r=planRoute({...base,activeTask:current,intent:{kind:'select',menuId:'art-menu'}});
  assert.equal(r.action,'select');assert.equal(r.taskId,current.id);assert.equal(r.lead,'art');
  assert.equal(r.requiresResultInspection,true);assert.equal(r.authorizesExecution,false);
  assert.equal(r.changesPersistentState,false);assert.deepEqual(r.requiredSkills,['jh-geubiseo']);
  assert.equal(planRoute({...base,activeTask:current,intent:{kind:'select',menuId:'old-art-menu'}}).reason,'CURRENT_MENU_REQUIRED');
});

test('a museum itinerary can add art while retaining its travel task and current mode',()=>{
  const current={...task,lead:'travel',helpers:[],mode:'assist'};
  const r=planRoute({...base,activeTask:current,intent:{kind:'change',helpers:['art']}});
  assert.equal(r.lead,'travel');assert.equal(r.taskId,current.id);assert.equal(r.mode,'assist');
  assert.deepEqual(r.helpers,['art']);assert.deepEqual(r.requiredSkills,['jh-yeobiseo','jh-geubiseo']);
  assert.equal(r.authorizesExecution,false);assert.equal(r.dispatchesTools,false);
});
