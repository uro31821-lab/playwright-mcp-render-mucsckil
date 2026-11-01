import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {gateRecoveredDispatch} from '../deployment/jh-recovery-write-fence.mjs';
import {buildStage25PendingOperatorEntrypoint56,
  selectStage40OwnerAdmissionDiagnostics56}
 from './stage25-live-operator-followup-entry.mjs';
import {applyStage40OwnerAdmissionDiagnostics,reverseStage40OwnerAdmissionDiagnostics}
 from './stage40-owner-admission-diagnostics-patch.mjs';

const root=path.resolve(import.meta.dirname,'..');
const base={CI:'true',NODE_ENV:'test',JH_OWNER_DEFER_LISTEN:'1',
 JH_STAGE26_SIGNED_COMPLETION_ACK:'EXPLICIT_IDENTICAL_SIGNED_RESULT_V1',
 JH_MOBILE_WEB_13_MODE:'EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1'};
const enabled={...base,JH_STAGE40_OWNER_ADMISSION_DIAGNOSTICS:'EXPLICIT_ORIGINAL_OWNER_REASON_V1'};
const waitBefore=(s,what)=>s.split(what).length-1;
test('diagnostic mode is EXPLICIT and never weakens an invalid original operator or client mode',()=>{
 assert.equal(selectStage40OwnerAdmissionDiagnostics56(base),false);
 assert.equal(selectStage40OwnerAdmissionDiagnostics56(enabled),true);
 assert.throws(()=>selectStage40OwnerAdmissionDiagnostics56(
   {...base,JH_STAGE40_OWNER_ADMISSION_DIAGNOSTICS:'ALWAYS_ALLOW'}),
   /STAGE40_DIAGNOSTICS_FLAG_INVALID/);
 assert.throws(()=>selectStage40OwnerAdmissionDiagnostics56(
   {...enabled,JH_MOBILE_WEB_13_MODE:undefined}),/STAGE40_MOBILE_RIGHT_SCOPE_REQUIRED/);
 assert.throws(()=>selectStage40OwnerAdmissionDiagnostics56(
   {...enabled,RENDER_SERVICE_ID:'srv-db0fjl2d0e5s73be114g'}),
   /STAGE40_ORIGINAL_OPERATOR_REQUIRED/);
});
test('real generated signed Stage25+26 original operator is reversible with diagnostic enabled',async()=>{
 const stable=await buildStage25PendingOperatorEntrypoint56(root,base);
 const original=readFileSync(stable.runtimeFile,'utf8');
 assert.equal(stable.stamp.stage40OwnerAdmissionDiagnostics,false);
 assert.equal(original.includes('jhOwnerAdmissionCodes40'),false);
 const candidate=await buildStage25PendingOperatorEntrypoint56(root,enabled);
 const source=readFileSync(candidate.runtimeFile,'utf8');
 assert.equal(candidate.stamp.stage40OwnerAdmissionDiagnostics,true);
 assert.equal(reverseStage40OwnerAdmissionDiagnostics(source),original);
 assert.equal(applyStage40OwnerAdmissionDiagnostics(original),source);
 for(const token of ['jhOwnerAdmissionNote40(','jhOwnerAdmissionTake40(',
   'OWNER_BINDING_CAPTURE_REJECTED','OWNER_SIGNED_SNAPSHOT_UNVERIFIED',
   'durableNativeHooks56?.acceptedCompletion(','jhRequireCommand56(device)',
   'jhSplitFollowupReceipts56.read(','computerExecutionReceipts56.issue('])
   assert.ok(source.includes(token),token);
 assert.equal(waitBefore(source,'jhOwnerAdmissionTake40('),2);
 assert.equal(source.includes('automaticActionRetryEnabled:true'),false);
 // Runtime generated with the flag remains a source-only review. Never start
 // a live owner listener or create a phone job here.
 assert.equal(candidate.listenerStarted,false);
 assert.equal(candidate.productionEnabled,false);
 await buildStage25PendingOperatorEntrypoint56(root,base);
});
test('original owner gate remains fail-closed, diagnosis is only low-cardinality classification',async()=>{
 const stable=await buildStage25PendingOperatorEntrypoint56(root,base);
 const original=readFileSync(stable.runtimeFile,'utf8');
 const patched=applyStage40OwnerAdmissionDiagnostics(original);
 const begin=patched.indexOf('  // Exact original job evidence only.');
 const fn=patched.indexOf('  async function jhOwnerAdmission155(',begin);
 const end=patched.indexOf('\n  }\n',fn);
 assert.ok(begin>=0&&fn>begin&&end>fn);
 const block=patched.slice(begin,end+5);
 let mode='ok',jobs=0,tries=0;
 const command='a'.repeat(32),device='test-phone';
 const proofObj={ok:true,reason:'SPLIT_PAIR_VERIFIED'};
 const signed={status:'complete',secureSessionId:'secure-test-session',targetDeviceId:device,
  result:{ok:true,url:'[]'}};
 const env={
  jhRequireCommand56:()=>mode==='bad_command'?'0'.repeat(32):command,
  jhPaymentLifecycle:{
   captureBinding:()=>{
    if(mode==='bad_owner')throw Object.assign(Error('private'),{code:'PAYMENT_TRUSTED_PHONE_UNAVAILABLE'});
    return {device,command_id:command};
   },
   assertBinding:()=>{
    if(mode==='bad_process')throw Object.assign(Error('private'),{code:'PAYMENT_DEVICE_OR_PROCESS_CHANGED'});
   }
  },
  active56:()=>({sessionId:'secure-test-session'}),
  mk:(type)=>{assert.equal(type,'agent_snapshot');jobs++;return {type};},
  waitJob:async()=>signed,
  jhInspectSplitEvidence155:()=>mode==='stale_proof'?{ok:false,reason:'SPLIT_PROOF_STALE'}:proofObj,
  jhBlockedCommands56:new Set(),
  jhGateRecoveredDispatch155:gateRecoveredDispatch,
  Map,Set
 };
 const ctx=vm.createContext(env);
 const f=vm.runInContext('(()=>{'+block+'\n return {admit:jhOwnerAdmission155,take:jhOwnerAdmissionTake40};})()',ctx);
 const result=async(code,first=true)=>{
  const record={state:'PREPARING',attemptCount:1,
   executionId:'exec_aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
   dedupeKey:'b'.repeat(64),dispatchStartedAt:null};
  let before=jobs;let allow=await f.admit(device,command,record,first);
  assert.equal(jobs,before+1,'exactly one original read-only signed snapshot');
  if(code===null){assert.equal(allow,true);assert.equal(f.take(record.executionId),'OWNER_ADMISSION_CAUSE_UNAVAILABLE');}
  else{assert.equal(allow,false);assert.equal(f.take(record.executionId),code);}
 };
 await result(null);
 mode='bad_owner';jobs=0;tries=0;const noJob={state:'PREPARING',attemptCount:1,
  executionId:'exec_bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',dedupeKey:'f'.repeat(64)};
 assert.equal(await f.admit(device,command,noJob,true),false);
 assert.equal(jobs,0,'no Android job on owner mismatch');
 assert.equal(f.take(noJob.executionId),'OWNER_TRUST_UNVERIFIED');
 mode='bad_process';await result('OWNER_DEVICE_OR_PROCESS_CHANGED');
 mode='stale_proof';await result('SPLIT_PROOF_STALE');
 mode='bad_command';
 const before=jobs;
 const c={state:'PREPARING',attemptCount:1,executionId:'exec_cccccccc-cccc-4ccc-cccc-cccccccccccc',dedupeKey:'0'.repeat(64)};
 assert.equal(await f.admit(device,command,c,true),false);
 assert.equal(jobs,before);
 assert.equal(f.take(c.executionId),'COMMAND_BINDING_CHANGED');
 mode='ok';await result('FENCE_idempotency_existing_operation_no_retry',false);
 assert.equal(tries,0,'never dispatch a click from admission');
 assert.ok(!block.includes('console.log('));
 assert.ok(!block.includes('JSON.stringify(read.result.url)'));
});
