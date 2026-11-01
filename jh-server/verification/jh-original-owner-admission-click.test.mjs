/** Original Secure56 owner-admission regression on isolated scratch SQLite.
 * No production DB, real device, live job, signature, approval or token is used.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createDurableNativeHooks} from '../owner-setup/deployment/durable-native-host.mjs';
import {inspectOriginalJournalReadOnly} from './jh-original-sqlite-readonly-status.mjs';

const d32=v=>v.repeat(32);
const d64=v=>v.repeat(64);
function clickPayload(overrides={}){
  return {
    contextId:'ssc_'+d32('a'),requestId:d32('b'),
    action:'CLICK',command:'synthetic neutral fixture link',
    targetItemRef:'item_'+'c'.repeat(16),
    mcpToolName:'life_android_execute_computer_action',
    secureRequestedEffect:'REVERSIBLE_WRITE',
    taskDigest:d64('d'),targetDeviceDigest:d64('e'),
    secureInvocationExpiresAt:Date.now()+30000,
    containsCredential:false,dataClass:'NON_SENSITIVE',
    commandId:d32('f'),...overrides
  };
}
function job(overrides={}){
  return {
    type:'split_screen_session_followup',status:'queued',
    mcpToolName:'life_android_execute_computer_action',
    secureRequestedEffect:'REVERSIBLE_WRITE',
    secureSessionId:'synthetic-session',targetDeviceId:'synthetic-device',
    ...overrides
  };
}
function scratch(fn){
  const dir=mkdtempSync(join(tmpdir(),'jh-owner-click-test-'));
  const file=join(dir,'manual-circuit.sqlite');
  const hooks=createDurableNativeHooks({
    file,namespace:d64('7'),key:Buffer.alloc(32,0x55),mode:'EXPLICIT_ONE_TIME'
  });
  try{fn(hooks,file)}finally{hooks.close();rmSync(dir,{recursive:true,force:true})}
}
test('original exact signed-scope CLICK is journal admitted once (not a UI success)',()=>{
  scratch((hooks,file)=>{
    const j=job(),p=clickPayload();
    hooks.capture(j,p);
    assert.deepEqual(hooks.beforeDispatch(j),{allowed:true});
    const state=inspectOriginalJournalReadOnly(file);
    assert.equal(state.uncertain,1);
    assert.equal(state.received,0);
    assert.equal(state.modifiedOriginalJournal,false);
    assert.equal(state.historicalUnknownMayReplay,false);
  });
});
test('same original operation is denied before phone dispatch; independent request admitted',()=>{
  scratch((hooks,file)=>{
    const p=clickPayload();
    const one=job();
    hooks.capture(one,p);
    assert.deepEqual(hooks.beforeDispatch(one),{allowed:true});
    const replay=job();
    hooks.capture(replay,p);
    const refused=hooks.beforeDispatch(replay);
    assert.equal(refused.allowed,false);
    assert.equal(refused.code,'DURABLE_PREVIOUS_OUTCOME_UNKNOWN');
    assert.equal(inspectOriginalJournalReadOnly(file).uncertain,1);
    const independent=job();
    hooks.capture(independent,clickPayload({requestId:d32('9')}));
    assert.equal(hooks.beforeDispatch(independent).allowed,true);
    assert.equal(inspectOriginalJournalReadOnly(file).uncertain,2);
  });
});
test('malformed original CLICK and unrelated BACK policy remain fail-closed',()=>{
  scratch((hooks,file)=>{
    for(const payload of [
      clickPayload({requestId:'not-valid'}),
      clickPayload({contextId:'stale'}),
      clickPayload({targetItemRef:'not-item'}),
      clickPayload({action:'BACK',targetItemRef:''})
    ]){
      const j=job();
      hooks.capture(j,payload);
      const refused=hooks.beforeDispatch(j);
      assert.equal(refused.allowed,false);
      assert.equal(refused.code,'DURABLE_OPERATION_NOT_SUPPORTED');
    }
    assert.equal(inspectOriginalJournalReadOnly(file).total,0);
  });
});
