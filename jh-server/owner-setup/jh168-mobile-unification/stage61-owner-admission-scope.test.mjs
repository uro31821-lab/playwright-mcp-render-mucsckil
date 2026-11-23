import {before, test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {gateRecoveredDispatch} from '../deployment/jh-recovery-write-fence.mjs';
import {buildStage25PendingOperatorEntrypoint56} from './stage25-live-operator-followup-entry.mjs';

const root=path.resolve(import.meta.dirname,'..');
const env={CI:'true',NODE_ENV:'test',JH_OWNER_DEFER_LISTEN:'1',
 JH_MOBILE_WEB_13_MODE:'EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1',
 JH_STAGE26_SIGNED_COMPLETION_ACK:'EXPLICIT_IDENTICAL_SIGNED_RESULT_V1',
 JH_STAGE40_OWNER_ADMISSION_DIAGNOSTICS:'EXPLICIT_ORIGINAL_OWNER_REASON_V1',
 JH_STAGE41_COMMAND_LIFECYCLE_DIAGNOSTICS:'EXPLICIT_SIGNED_COMMAND_CAUSE_V1',
 JH_STAGE44_DEVICE_FOCUS:'EXPLICIT_SIGNED_WORKFLOW_FOCUS_V1',
 JH_MOBILE13_COMMAND_DIAGNOSTICS:'EXPLICIT_OWNER_DEVICE_READ_ONLY_V1'};
const actions=['CLICK','SET_TEXT','BACK'];
const record=()=>({state:'PREPARING',attemptCount:1,
 executionId:'exec_aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
 dedupeKey:'d'.repeat(64),dispatchStartedAt:null});
const payload=action=>({action,command:'현재 오른쪽 화면의 일반 작업',
 contextId:'ssc_'+'1'.repeat(32),targetItemRef:'item_'+'2'.repeat(16),
 requestId:'3'.repeat(32)});
let slices;

before(async()=>{
 // Generate source only. Never import/start the generated server or its listener.
 const built=await buildStage25PendingOperatorEntrypoint56(root,env);
 assert.equal(built.listenerStarted,false);
 assert.equal(built.productionEnabled,false);
 assert.equal(built.stamp.stage61ApprovalRouting,true);
 assert.equal(built.stamp.stage40OwnerAdmissionDiagnostics,true);
 const source=readFileSync(built.runtimeFile,'utf8');
 const factory=source.indexOf('function createMcp(){');
 const helperStart=source.indexOf('  // Stage61: server-owned route state');
 const helperEnd=source.indexOf('\nfunction secureCall56(',helperStart);
 const ownerStart=source.indexOf('  // Exact original job evidence only.',factory);
 const ownerFn=source.indexOf('  async function jhOwnerAdmission155(',ownerStart);
 const ownerEnd=source.indexOf('\n  }\n',ownerFn)+5;
 const server=source.indexOf('  const server=new McpServer(',factory);
 assert.ok(helperStart>=0&&helperEnd>helperStart&&helperEnd<factory,
  'Stage61 helper must retain its real module scope');
 assert.ok(factory>=0&&ownerStart>factory&&ownerFn>ownerStart&&
  ownerEnd>ownerFn&&ownerEnd<server,'original admission must remain createMcp-local');
 const callbacks=[...source.matchAll(/^\s*beforeDispatch:[^\n]*jhStage61OwnerAdmission56[^\n]*$/gm)];
 assert.equal(callbacks.length,1,'one generated split admission binding is required');
 assert.ok(callbacks[0].index>factory,'the callback must be bound inside createMcp');
 slices={helper:source.slice(helperStart,helperEnd),
  owner:source.slice(ownerStart,ownerEnd),callback:callbacks[0][0].trim()};
});

function harness(){
 // Source slices keep the real lexical boundary. No jhOwnerAdmission155 or
 // jhOwnerAdmissionNote40 is installed on the VM global object. In particular,
 // do not repeat the global-owner stub that concealed the original regression.
 const context=vm.createContext({createStage61HostAdapter:()=>({})});
 const api=vm.runInContext(`${slices.helper}
 function createMcp(scope){
   const {jhRequireCommand56,jhPaymentLifecycle,active56,mk,waitJob,
     jhInspectSplitEvidence155,jhGateRecoveredDispatch155,jhBlockedCommands56}
     =scope.dependencies||{};
   ${slices.owner}
   const sourceOwner=jhOwnerAdmission155;
   jhOwnerAdmission155=async function(...args){
     return scope.invoke(args,{original:sourceOwner,note:jhOwnerAdmissionNote40});
   };
   const device=scope.device,commandId=scope.command;
   return {
     prepare:payload=>({${slices.callback}}).beforeDispatch,
     take:jhOwnerAdmissionTake40
   };
 }
 ({make:createMcp,unbound:jhStage61OwnerAdmission56,
   globalOwnerType:typeof jhOwnerAdmission155,
   globalNoteType:typeof jhOwnerAdmissionNote40});`,context);
 assert.equal(api.globalOwnerType,'undefined');
 assert.equal(api.globalNoteType,'undefined');
 return api;
}

for(const action of actions){
 for(const outcome of [true,false,'throw']){
  test(`generated ${action} preserves local owner ${String(outcome)} and exact arguments`,async()=>{
   const h=harness(),seen=[],entry=record(),failure=new Error('original owner rejection');
   const scope={device:'test-phone',command:'a'.repeat(32),invoke:args=>{
    seen.push(args);
    if(outcome==='throw')throw failure;
    return outcome;
   }};
   const callback=h.make(scope).prepare(payload(action));
   if(outcome==='throw')await assert.rejects(callback({record:entry,firstAttempt:true}),e=>e===failure);
   else assert.equal(await callback({record:entry,firstAttempt:true}),outcome);
   assert.equal(seen.length,1,'delegate exactly once; no fallback or retry');
   assert.equal(seen[0].length,4);
   assert.equal(seen[0][0],scope.device);
   assert.equal(seen[0][1],scope.command);
   assert.equal(seen[0][2],entry,'record identity is preserved');
   assert.equal(seen[0][3],true);
  });
 }
}

test('generated admission keeps each createMcp diagnostic map isolated',async()=>{
 const h=harness(),entry=record();
 const make=code=>h.make({device:'test-phone',command:'a'.repeat(32),
  invoke:(args,{note})=>note(args[2],code)});
 const first=make('OWNER_TRUST_UNVERIFIED'),second=make('COMMAND_BINDING_CHANGED');
 assert.equal(await first.prepare(payload('CLICK'))({record:entry,firstAttempt:true}),false);
 assert.equal(await second.prepare(payload('BACK'))({record:entry,firstAttempt:false}),false);
 assert.equal(first.take(entry.executionId),'OWNER_TRUST_UNVERIFIED');
 assert.equal(second.take(entry.executionId),'COMMAND_BINDING_CHANGED');
 assert.equal(first.take(entry.executionId),'OWNER_ADMISSION_CAUSE_UNAVAILABLE');
 assert.equal(second.take(entry.executionId),'OWNER_ADMISSION_CAUSE_UNAVAILABLE');
});

test('ordinary admission without a host callback fails closed',async()=>{
 const h=harness();
 for(const action of actions){
  assert.equal(await h.unbound('test-phone','a'.repeat(32),record(),true,payload(action)),false);
  assert.equal(await h.unbound('test-phone','a'.repeat(32),record(),true,payload(action),{}),false);
 }
});

test('same-scope callback reaches the actual owner checks and preserves rejection diagnosis',async()=>{
 const h=harness(),device='test-phone',command='a'.repeat(32);
 let snapshots=0,mode='ok',calls=0;
 const dependencies={
  jhRequireCommand56:()=>command,
  jhPaymentLifecycle:{captureBinding:()=>({device}),assertBinding:()=>{}},
  active56:()=>({sessionId:'test-signed-session'}),
  mk:type=>{assert.equal(type,'agent_snapshot');snapshots++;return {type};},
  waitJob:async()=>({status:'complete',secureSessionId:'test-signed-session',
   targetDeviceId:device,result:{ok:true,url:'[]'}}),
  jhInspectSplitEvidence155:()=>mode==='ok'?{ok:true}:{ok:false,reason:'SPLIT_PROOF_STALE'},
  jhGateRecoveredDispatch155:gateRecoveredDispatch,jhBlockedCommands56:new Set()
 };
 const instance=h.make({device,command,dependencies,
  invoke:(args,{original})=>{calls++;return original(...args);}});
 assert.equal(await instance.prepare(payload('CLICK'))({record:record(),firstAttempt:true}),true);
 mode='stale';const denied=record();
 assert.equal(await instance.prepare(payload('BACK'))({record:denied,firstAttempt:true}),false);
 assert.equal(instance.take(denied.executionId),'SPLIT_PROOF_STALE');
 mode='ok';const repeated=record();
 assert.equal(await instance.prepare(payload('SET_TEXT'))({record:repeated,firstAttempt:false}),false);
 assert.equal(instance.take(repeated.executionId),'FENCE_idempotency_existing_operation_no_retry');
 assert.equal(calls,3);
 assert.equal(snapshots,3,'one synthetic read per original admission, no action dispatch');
});
