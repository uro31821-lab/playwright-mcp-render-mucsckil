/** JH167 Durable split read gate: source policy, no bypasses of native HMAC or approval. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {durableNativeJobPolicy as policy} from '../owner-setup/deployment/durable-native-job-policy.mjs';
import {patchJH167SplitSessionReadback56,patchJH167SplitWorkflowNamespace56} from '../owner-setup/deployment/jh167-operational-guide-reservation-patch.mjs';
import {buildCleanRestartRelease56} from '../owner-setup/deployment/durable-clean-restart-release.mjs';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const mk=(type,effect='READ_ONLY',tool='life_android_capture_work_window')=>
 ({type,mcpToolName:tool,secureRequestedEffect:effect,status:'queued',
 secureSessionId:'synthetic-active-session',targetDeviceId:'synthetic-device'});
const start={splitSessionNonce:'jh_split_'+'a'.repeat(32),goal:'설명만'};
const status={contextId:'ssc_'+'b'.repeat(32)};

test('split START and STATUS accept exact signed read route',()=>{
 for(const [type,payload] of [['split_screen_session_start',start],['split_screen_session_status',status]]){
  const a=policy(mk(type),payload);
  assert.equal(a.kind,'READ',type);
  for(const [effect,tool] of [['REVERSIBLE_WRITE','life_android_capture_work_window'],
      ['READ_ONLY','life_android_execute_computer_action'],
      ['MUTATION','life_android_execute_computer_action']]){
    assert.equal(policy(mk(type,effect,tool),payload).kind,'DENY');
  }
  assert.equal(policy(mk(type),{...payload,command:'눌러줘'}).kind,'DENY');
  assert.equal(policy(mk(type),{...payload,action:'CLICK'}).kind,'DENY');
  assert.equal(policy(mk(type),{...payload,summaryText:'fake'}).kind,'DENY');
  assert.equal(policy(mk(type),{...payload,containsCredential:true}).kind,'DENY');
  assert.equal(policy(mk(type),{...payload,dataClass:'SECRET'}).kind,'DENY');
 }
});
test('scoped split session IDs and goal bounds are mandatory',()=>{
 for(const v of ['','jh_split_abc','jh_split_'+'F'.repeat(32),null]){
  assert.equal(policy(mk('split_screen_session_start'),{splitSessionNonce:v}).kind,'DENY');
 }
 for(const v of ['','ssc_abc','ssc_'+'F'.repeat(32),null]){
  assert.equal(policy(mk('split_screen_session_status'),{contextId:v}).kind,'DENY');
 }
 assert.equal(policy(mk('split_screen_session_start'),{...start,goal:'a'.repeat(2001)}).kind,'DENY');
 // Android JH167 requires all four jh_mcp receipt tags or NONE: a bare
 // jh_split workflowId is not a valid partial MCP workflow binding.
 for(const extra of [{workflowId:'jh_split_'+'a'.repeat(32)},
   {workflowId:'jh_mcp_'+'b'.repeat(32),workflowStepId:'step_0'},
   {workflowPlanDigest:'c'.repeat(64)},{workflowActionDigest:'d'.repeat(64)}])
  assert.equal(policy(mk('split_screen_session_start'),{...start,...extra}).kind,'DENY');
});
test('all action-bearing split session job types stay DURABLE denied',()=>{
 const types=['split_screen_session_save_analysis','split_screen_session_input_preflight',
   'split_screen_session_followup','split_screen_session_finish','split_screen_session_cancel'];
 for(const type of types){
  for(const effect of ['READ_ONLY','REVERSIBLE_WRITE','MUTATION']){
   const p=policy(mk(type,effect,'life_android_execute_computer_action'),
      {contextId:status.contextId,action:'CLICK',command:'눌러줘'});
   assert.equal(p.kind,'DENY',type+' '+effect);
   assert.equal(p.code,'DURABLE_OPERATION_NOT_SUPPORTED');
  }
 }
});
test('unknown jobs cannot use session start as a generic bypass',()=>{
 assert.equal(policy(mk('unrecognized_split_session_start'),start).kind,'DENY');
 assert.equal(policy(mk('computer_use_action_execute'),{action:'CLICK'}).kind,'DENY');
});
test('readback fallback only extends two modes and preserves signed evidence',async()=>{
 const generated=buildCleanRestartRelease56();
 const mod=await import(pathToFileURL(generated.file).href+'?split-start-verify');
 const base=path.resolve(import.meta.dirname,'../owner-setup');
 const built=mod.buildDurableRoutedOperationalEntrypoint(base);
 const output=readFileSync(built.runtimeFile,'utf8');
 const string1="const readOnlyComfort=['split_comfort_status','split_comfort_manual_handoff',\n        'split_comfort_keyboard_advice','split_comfort_restore_info',\n        'split_screen_session_start','split_screen_session_status'].includes(type);";
 assert(output.includes(string1),'START/STATUS absent from signed proof fallback');
 assert(output.includes('const startPayload={splitSessionNonce:workflowId,'));
 assert(!output.includes('const startPayload={workflowId,'));
 assert(output.includes("const workflowId='jh_split_'+randomBytes(16).toString('hex');"));
 assert(output.includes('jhInspectSplitEvidence155(scopeRead.result,scopeRows)'));
 assert(output.includes("scopeRead?.secureSessionId!==auth.sessionId"));
 assert(output.includes("scopeRead?.targetDeviceId!==device"));
 assert(output.includes('SPLIT_SCOPE_READBACK_UNCONFIRMED'));
 assert(!output.includes("'split_screen_session_followup'].includes(type)"));
});
test('patch rejects drifted, duplicated or misleading readback sources',()=>{
 assert.throws(()=>patchJH167SplitSessionReadback56('unreviewed'),/SCOPE_CHANGED/);
 assert.throws(()=>patchJH167SplitWorkflowNamespace56('unreviewed'),/REVIEW_REQUIRED/);
});
