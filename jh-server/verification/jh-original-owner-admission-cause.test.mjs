/** Exact original owner pre-dispatch gate vs. diagnostic candidate.
 * All inputs and snapshots are synthetic; no phone/DB/Render/credentials.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import {gateRecoveredDispatch} from '../owner-setup/deployment/jh-recovery-write-fence.mjs';
import {
  ORIGINAL_OWNER_ADMISSION155,INSTRUMENTED_OWNER_ADMISSION155,
  patchOriginalOwnerAdmissionDiagnostic155,reverseOriginalOwnerAdmissionDiagnostic155
} from '../owner-setup/jh168-mobile-unification/owner-admission-diagnostic-candidate.mjs';

const SRC=path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '../owner-setup/deployment/jh155-all-modules-patch.mjs');
const text=readFileSync(SRC,'utf8');
const begin='const recoveryHelper=String.raw'+String.fromCharCode(96);
const end=String.fromCharCode(96)+';\n\n/** Compose reviewed additions';
assert.equal(text.split(begin).length,2,'one original helper registration');
const start=text.indexOf(begin)+begin.length,stop=text.indexOf(end,start);
assert.ok(stop>start,'complete source helper is available');
const actual=text.slice(start,stop);

test('exact live owner helper is unchanged, diagnostic transform byte-reversible',()=>{
  assert.equal(actual,ORIGINAL_OWNER_ADMISSION155);
  const source='// TEST_ONLY\n'+actual+'\n// END\n';
  const patched=patchOriginalOwnerAdmissionDiagnostic155(source);
  assert.notEqual(source,patched);
  assert.equal(reverseOriginalOwnerAdmissionDiagnostic155(patched),source);
  assert.equal(patched.split('async function jhOwnerAdmission155(').length,2);
  assert.equal(patched.split("mk('agent_snapshot'").length,2,'same one snapshot call');
  assert.ok(!patched.includes('life_android_execute_computer_action'));
  assert.ok(!patched.includes('BEGIN_COMMAND'));
  assert.throws(()=>patchOriginalOwnerAdmissionDiagnostic155(patched));
  assert.throws(()=>patchOriginalOwnerAdmissionDiagnostic155('// no original helper'));
});

function build(source,overrides={}){
  const state={
    command:'a'.repeat(32),commandCurrent:true,ownerBindingValid:true,ownerCaptureValid:true,
    signedValid:true,snapshotOk:true,proofValid:true,rowsValid:true,blocked:false,
    snapshotCalls:0,expectedDevice:'synthetic-device',...overrides
  };
  const logs=[];
  const deps={
    jhRequireCommand56:()=>state.commandCurrent?state.command:'0'.repeat(32),
    jhPaymentLifecycle:{
      captureBinding:()=>{
        if(!state.ownerCaptureValid)throw Error('SECRET_SENTINEL_CAPTURE');
        return {synthetic:true};
      },
      assertBinding:()=>{
        if(!state.ownerBindingValid)throw Error('SECRET_SENTINEL_BINDING');
        return true;
      }
    },
    active56:()=>({sessionId:'synthetic-session'}),
    mk:(kind)=>{
      assert.equal(kind,'agent_snapshot');
      state.snapshotCalls++;
      return {type:kind};
    },
    waitJob:async()=>{
      const r={
        status:state.snapshotOk?'complete':'error',
        result:{ok:state.snapshotOk,url:state.rowsValid?'[]':'not json'},
        secureSessionId:state.signedValid?'synthetic-session':'other-session',
        targetDeviceId:'synthetic-device'
      };
      return r;
    },
    jhInspectSplitEvidence155:()=>({ok:state.proofValid,reason:state.proofValid?null:'STALE_SPLIT'}),
    jhGateRecoveredDispatch155:gateRecoveredDispatch,
    jhBlockedCommands56:new Set(state.blocked?['synthetic-device']:[]),
    console:{info:(...args)=>logs.push(args)}
  };
  const args=Object.keys(deps);
  const get=vm.compileFunction(source+'\nreturn jhOwnerAdmission155;',args,
    {filename:'original-owner-admission-review-synthetic.mjs'});
  const fn=get(...Object.values(deps));
  const record={state:'PREPARING',attemptCount:1,executionId:'synthetic-exec',
    dedupeKey:'synthetic-dedupe',dispatchStartedAt:null};
  if(state.missingExecutionId)record.executionId=null;
  return {fn,state,record,logs};
}

for(const [name,options,expected,throwsOriginal] of [
  ['valid original owner admission',{},null,false],
  ['changed command epoch',{commandCurrent:false},'COMMAND_CHANGED',false],
  ['owner binding capture failed',{ownerCaptureValid:false},'OWNER_BINDING_CAPTURE_FAILED',true],
  ['owner binding changed',{ownerBindingValid:false},'OWNER_BINDING_CHANGED',true],
  ['original snapshot not complete',{snapshotOk:false},'SIGNED_SNAPSHOT_INVALID',false],
  ['signed device/session mismatch',{signedValid:false},'SIGNED_SNAPSHOT_INVALID',false],
  ['malformed original snapshot rows',{rowsValid:false},'SIGNED_SNAPSHOT_MISSING',false],
  ['stale/right-pane evidence invalid',{proofValid:false},'SPLIT_EVIDENCE_INVALID',false],
  ['old/cancelled command fence',{blocked:true},'old_work_discarded_no_auto_resume',false],
  ['owner execution id missing',{missingExecutionId:true},'authenticated_owner_and_id_required',false],
  ['nonfirst durable execution record',{firstAttempt:false},'LEDGER_NOT_FIRST_ATTEMPT',false]
]){
  test(name+' never grants a blocked original dispatch',async()=>{
    const original=build(actual,options);
    const instrumented=build(INSTRUMENTED_OWNER_ADMISSION155,options);
    const first=options.firstAttempt??true;
    if(throwsOriginal){
      await assert.rejects(original.fn(original.state.expectedDevice,original.state.command,original.record,first));
    }else{
      const before=await original.fn(original.state.expectedDevice,original.state.command,original.record,first);
      assert.equal(before,expected===null);
    }
    const after=await instrumented.fn(instrumented.state.expectedDevice,
      instrumented.state.command,instrumented.record,first);
    assert.equal(after,expected===null,'candidate must not grant a previously blocked dispatch');
    assert.equal(instrumented.state.snapshotCalls,original.state.snapshotCalls,'no additional phone reads');
    if(expected===null){
      assert.equal(instrumented.logs.length,0);
    }else{
      assert.equal(instrumented.logs.length,1);
      assert.equal(instrumented.logs[0][0],'JH_OWNER_ADMISSION_DIAG');
      const summary=JSON.parse(instrumented.logs[0][1]);
      assert.equal(summary.reason,expected);
      assert.equal(summary.automaticReplay,false);
      assert.equal(summary.dispatched,false);
      assert.deepEqual(Object.keys(summary).sort(),
        ['reason','source','automaticReplay','dispatched'].sort());
      assert.equal(JSON.stringify(instrumented.logs).includes('SECRET_SENTINEL'),false);
    }
  });
}
test('same rejection logging is bounded and never contains raw error or identity',async()=>{
  const f=build(INSTRUMENTED_OWNER_ADMISSION155,{ownerBindingValid:false});
  const r1=await f.fn(f.state.expectedDevice,f.state.command,f.record,true);
  const r2=await f.fn(f.state.expectedDevice,f.state.command,f.record,true);
  assert.equal(r1,false);assert.equal(r2,false);
  assert.equal(f.logs.length,1);
  assert.equal(f.state.snapshotCalls,2,'each independent original admission still performs only its own read');
});
