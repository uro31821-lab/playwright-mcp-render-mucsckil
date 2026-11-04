import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dispatch} from '../scripts/cli.mjs';

const ownerScope='integration:test';
const at='2026-11-04T12:00:00.000Z';
const threadId='integration:thread';
const taskId='integration:task';
const scope={topic:'photo_procedure'};
const cli=fileURLToPath(new URL('../scripts/cli.mjs',import.meta.url));
const roundtrip=value=>JSON.parse(JSON.stringify(value));
const init=()=>dispatch({op:'tasks.init',ownerScope,at});
const taskEvent=(state,type,payload,sourceRef='integration:user')=>({eventId:`evt:${state.revision+1}`,expectedRevision:state.revision,ownerScope,threadId,taskId,at,sourceRef,type,payload});
const update=(state,type,payload,sourceRef)=>dispatch({op:'tasks.apply',state:roundtrip(state),event:taskEvent(state,type,payload,sourceRef)}).state;
function active() {return update(init(),'START',{goal:'Inspect and edit an attached photo',label:'Photo workflow',lead:'photo',helpers:[],mode:'assist',scope,conditions:{appearance:{skin:'soft',background:'warm'},displayStyle:'concise'}});}

test('CLI runs real module dispatch with JSON output and reports invalid input without fabricating empty state',()=>{
  const result=spawnSync(process.execPath,[cli],{input:JSON.stringify({op:'tasks.init',ownerScope,at}),encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);const parsed=JSON.parse(result.stdout);assert.equal(parsed.ok,true);assert.equal(parsed.result.schema,'jh.assistant-tasks.v1');
  const invalid=spawnSync(process.execPath,[cli],{input:'{broken',encoding:'utf8'});
  assert.equal(invalid.status,1);assert.equal(invalid.stdout,'');assert.equal(JSON.parse(invalid.stderr).error.code,'INVALID_JSON');
  const corrupt=spawnSync(process.execPath,[cli],{input:JSON.stringify({op:'tasks.validate',state:{},ownerScope}),encoding:'utf8'});
  assert.equal(corrupt.status,1);assert.equal(corrupt.stdout,'');
});

test('serialized task route preserves current menu, partial conditions, and result inspection across mode changes',()=>{
  let state=active();
  state=update(state,'MENU',{menuId:'menu:1',choices:[{id:'1',label:'Change skin',value:{field:'skin'}}]});
  const selected=dispatch({op:'tasks.select',state:roundtrip(state),input:{threadId,taskId,menuId:'menu:1',choiceId:'1'}});
  assert.equal(selected.authorizesExecution,false);
  state=update(state,'CHANGE_CONDITIONS',{changes:{appearance:{skin:'natural'}},affectedStepIds:[]});
  assert.equal(state.tasks[taskId].conditions.appearance.background,'warm');
  assert.throws(()=>dispatch({op:'tasks.select',state,input:{threadId,taskId,menuId:'menu:1',choiceId:'1'}}));
  state=update(state,'EFFECT_PENDING',{effectId:'effect:photo',description:'A synthetic editor invocation for this contract test'});
  state=update(state,'EFFECT_RESULT',{effectId:'effect:photo',status:'unknown'});
  state=update(state,'SET_MODE',{mode:'execute',explicit:true});
  const read=dispatch({op:'tasks.get',state:roundtrip(state),taskId});
  const route=dispatch({op:'route',input:{intent:{kind:'continue'},threadId,sourceRef:'integration:continue',activeTask:read.task,available:{skills:['jh-pyeonbiseo'],capabilities:[]}}});
  assert.equal(route.requiresResultInspection,true);assert.equal(route.taskId,taskId);assert.equal(route.authorizesExecution,false);
  assert.throws(()=>update(state,'EFFECT_PENDING',{effectId:'effect:duplicate',description:'Must not replay'}),e=>e.code==='RESULT_INSPECTION_REQUIRED');
});

test('a completed task becomes a reusable routine whose one-off override never changes saved defaults',()=>{
  let tasks=active();
  tasks=update(tasks,'EFFECT_PENDING',{effectId:'effect:photo',description:'Synthetic completion fixture'});
  tasks=update(tasks,'EFFECT_RESULT',{effectId:'effect:photo',status:'success',evidenceRefs:['integration:evidence:editor-result']},'integration:tool-result');
  tasks=update(tasks,'COMPLETE',{evidenceRefs:['integration:evidence:editor-result']},'integration:tool-result');
  const sourceTask=dispatch({op:'tasks.get',state:roundtrip(tasks),taskId}).task;
  let routines=dispatch({op:'routines.init',ownerScope,at});
  const definition={persistenceIntent:'explicit_ongoing',scope,title:'Saved photo procedure',lead:'photo',helpers:[],steps:[{id:'edit',capability:'photo',dependsOn:[],requiredInputs:['imageRef','tone'],produces:['editedImage'],instruction:'Use the current attached image and requested tone.'}],parameters:[{name:'imageRef',required:true,dynamic:true},{name:'tone',required:true,dynamic:false}],defaults:{tone:'natural'},outputFormat:'Edited image with one short description',sourceTaskId:taskId,sourceEvidenceRefs:['integration:evidence:editor-result']};
  const event={eventId:'routine-event:1',expectedRevision:0,ownerScope,at,sourceRef:'integration:explicit-save',type:'SAVE',routineId:'routine:photo',payload:definition};
  routines=dispatch({op:'routines.apply',state:routines,event,sourceTask}).state;
  const makePlan=values=>dispatch({op:'routines.plan',state:roundtrip(routines),input:{routineId:'routine:photo',ownerScope,scope,values,availableCapabilities:['photo']}});
  const once=makePlan({imageRef:'integration:current-image',tone:'cinematic'});
  assert.equal(once.ready,true);assert.equal(once.parameters.tone,'cinematic');assert.equal(once.executionPerformed,false);
  assert.equal(makePlan({imageRef:'integration:another-current-image'}).parameters.tone,'natural');
  const missing=makePlan({});assert.equal(missing.ready,false);assert.deepEqual(missing.missingInputs,['imageRef']);
  const ongoing={...event,eventId:'routine-event:2',expectedRevision:1,type:'UPDATE_DEFAULTS',payload:{persistenceIntent:'explicit_ongoing',expectedRoutineVersion:1,scope,changes:{tone:'soft'}}};
  routines=dispatch({op:'routines.apply',state:roundtrip(routines),event:ongoing}).state;
  assert.equal(makePlan({imageRef:'integration:new-image'}).parameters.tone,'soft');
  assert.equal(makePlan({imageRef:'integration:new-image'}).verification,'not_run');
  assert.equal(dispatch({op:'routines.apply',state:routines,event,sourceTask}).result.duplicate,true);
});

test('user feedback cannot turn an unresolved operation into a verified reusable procedure',()=>{
  let state=active();
  state=update(state,'EFFECT_PENDING',{effectId:'effect:1',description:'Synthetic unverified effect'});
  state=update(state,'USER_REPORTED',{summary:'The user says it is done'},'integration:user-report');
  assert.throws(()=>update(state,'COMPLETE',{evidenceRefs:['integration:user-report']}));
  assert.equal(dispatch({op:'tasks.get',state,taskId}).requiresResultInspection,true);
});

test('stopping retains unresolved effects without immediately scheduling a result read',()=>{
  let state=active();state=update(state,'EFFECT_PENDING',{effectId:'effect:stop',description:'Synthetic pending effect'});
  for(const type of ['PAUSE','CANCEL']) {
    const changed=dispatch({op:'tasks.apply',state,event:taskEvent(state,type,{})});
    assert.equal(changed.result.nextAction,'none');assert.equal(changed.result.requiresResultInspection,true);
    assert.deepEqual(changed.result.pendingEffectIds,['effect:stop']);
  }
});
