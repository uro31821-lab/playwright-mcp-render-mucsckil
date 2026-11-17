import test from 'node:test';
import assert from 'node:assert/strict';
import {keepActiveCameraLead} from '../stab01-active-capture-guard.mjs';

const context={hostVerified:true,threadId:'thread',lead:'camera',phase:'capture',status:'active',
  startBasis:'user_explicit',taskLookupStatus:'VERIFIED_NO_TASK',hasUnresolvedExternalEffect:false,revision:7};
const intent={kind:'task',primary:'photo',primaryBasis:'HOST_INFERRED_IMAGE_ONLY',
  topics:['photo','camera'],helpers:['personal'],continuationOfActiveGoal:true,
  contextRevision:7,explicitNewGoal:false,explicitEdit:false};
const create=()=>({threadId:'thread',sourceRef:'turn-2',activeTask:null,
  conversationContext:{...context},intent:{...intent}});
const tests=[
 ['same_camera',x=>{},'CONTINUED'],
 ['ten_reference_images',x=>{x.intent.referenceImageCount=10},'CONTINUED'],
 ['new_explicit_goal',x=>{x.intent.explicitNewGoal=true},'UNCHANGED'],
 ['explicit_edit',x=>{x.intent.explicitEdit=true},'UNCHANGED'],
 ['direct_editor',x=>{x.intent.explicitAssistant='photo'},'UNCHANGED'],
 ['user_selected_editor',x=>{x.intent.primaryBasis='USER_EXPLICIT'},'UNCHANGED'],
 ['missing_edit_disposition',x=>{delete x.intent.explicitEdit},'UNCHANGED'],
 ['missing_goal_disposition',x=>{delete x.intent.explicitNewGoal},'UNCHANGED'],
 ['different_domain',x=>{x.intent.topics=['food']},'UNCHANGED'],
 ['unverified_host',x=>{x.conversationContext.hostVerified=false},'UNCHANGED'],
 ['stale_context_revision',x=>{x.intent.contextRevision=6},'UNCHANGED'],
 ['foreign_thread',x=>{x.threadId='other'},'UNCHANGED'],
 ['pending_effect',x=>{x.conversationContext.hasUnresolvedExternalEffect=true},'UNCHANGED'],
 ['effect_state_unknown',x=>{delete x.conversationContext.hasUnresolvedExternalEffect},'UNCHANGED'],
 ['task_lookup_unknown',x=>{delete x.conversationContext.taskLookupStatus},'UNCHANGED'],
 ['saved_task',x=>{x.activeTask={id:'persisted'}},'UNCHANGED'],
 ['stop',x=>{x.intent.kind='stop'},'UNCHANGED'],
 ['continue',x=>{x.intent.kind='continue'},'UNCHANGED'],
 ['direct_photo_request',x=>{x.intent.assistantRequests=[{id:'photo'}]},'UNCHANGED'],
 ['explicit_photo_collaborator',x=>{x.intent.helpers=['photo']},'UNCHANGED'],
 ['workflow_requested',x=>{x.intent.workflow={stageId:'example'}},'UNCHANGED'],
 ['chosen_photo_lead',x=>{x.intent.userChosenLead='photo'},'UNCHANGED'],
 ['camera_excluded',x=>{x.intent.excluded=['camera']},'UNCHANGED'],
 ['no_continuation',x=>{x.intent.continuationOfActiveGoal=false},'UNCHANGED'],
 ['no_provenance',x=>{delete x.intent.primaryBasis},'UNCHANGED'],
 ['wrong_current_lead',x=>{x.conversationContext.lead='photo'},'UNCHANGED'],
 ['missing_source_binding',x=>{delete x.sourceRef},'UNCHANGED'],
 ['mood_adjustment',x=>{x.intent.mood='warm'},'CONTINUED'],
 ['eight_reference_images',x=>{x.intent.referenceImageCount=8},'CONTINUED'],
 ['original_request_unchanged',x=>{},'CONTINUED'],
];
for (const [name,mutate,expected] of tests){
  test(name,()=>{
    const input=create();mutate(input);const before=structuredClone(input);
    const outcome=keepActiveCameraLead(input);
    assert.equal(outcome.status,expected,name);
    assert.deepEqual(input,before,'no original request mutation');
    assert.equal(outcome.authorizesExecution,false);
    assert.equal(outcome.changesPersistentState,false);
    assert.equal(outcome.cameraCaptureVerified,false);
    if(expected==='UNCHANGED')assert.equal(outcome.input,input,'preserve original reference');
    else {
      assert.equal(outcome.input.intent.primary,'camera');
      assert.deepEqual(outcome.input.intent.topics,input.intent.topics,'do not change original topics');
      assert.deepEqual(outcome.input.intent.helpers,input.intent.helpers,'do not change original helpers');
    }
  });
}
