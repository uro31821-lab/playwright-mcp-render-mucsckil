import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createStage44DeviceFocus} from './stage44-device-focus.mjs';
import {applyStage44DeviceFocusPatch,reverseStage44DeviceFocusPatch} from './stage44-device-focus-patch.mjs';
import {buildStage25PendingOperatorEntrypoint56,selectStage44Focus56,selectStage25PendingOperatorRuntime56}
 from './stage25-live-operator-followup-entry.mjs';
const idA='a'.repeat(32),idB='b'.repeat(32),idC='c'.repeat(32),dev='synthetic-owner-bound-device';
const root=path.resolve(import.meta.dirname,'..');
const base={CI:'true',NODE_ENV:'test',JH_OWNER_DEFER_LISTEN:'1',
  JH_MOBILE_WEB_13_MODE:'EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1',
  JH_STAGE26_SIGNED_COMPLETION_ACK:'EXPLICIT_IDENTICAL_SIGNED_RESULT_V1',
  JH_STAGE40_OWNER_ADMISSION_DIAGNOSTICS:'EXPLICIT_ORIGINAL_OWNER_REASON_V1',
  JH_STAGE41_COMMAND_LIFECYCLE_DIAGNOSTICS:'EXPLICIT_SIGNED_COMMAND_CAUSE_V1'};
const enabled={...base,JH_STAGE44_DEVICE_FOCUS:'EXPLICIT_SIGNED_WORKFLOW_FOCUS_V1'};
test('focus explicitly opt in; original normal BEGIN_COMMAND and original APK unchanged',()=>{
 assert.equal(selectStage44Focus56(base),false);
 assert.equal(selectStage44Focus56(enabled),true);
 for(const env of [
  {...enabled,JH_STAGE44_DEVICE_FOCUS:'ALLOW_ALL'},
  {...enabled,JH_STAGE41_COMMAND_LIFECYCLE_DIAGNOSTICS:undefined},
  {...enabled,JH_STAGE40_OWNER_ADMISSION_DIAGNOSTICS:undefined},
  {...enabled,JH_MOBILE_WEB_13_MODE:undefined},
  {...enabled,RENDER_SERVICE_ID:'srv-db0fjl2d0e5s73be114g'}
 ])assert.throws(()=>selectStage44Focus56(env));
});
test('opt-in focus prevents other BEGIN preemption; original same command and other device are not obstructed',()=>{
 let t=100000;const h=createStage44DeviceFocus({now:()=>t,maxMs:120000});
 assert.deepEqual(h.mayBegin({device:dev,eventId:idA,currentCommand:null}).allowed,true);
 assert.equal(h.start({device:dev,commandId:idA,currentCommand:idB}).ok,false);
 assert.equal(h.start({device:dev,commandId:idA,currentCommand:idA}).ok,true);
 assert.equal(h.mayBegin({device:dev,eventId:idB,currentCommand:idA}).allowed,false);
 assert.equal(h.mayBegin({device:dev,eventId:idA,currentCommand:idA}).allowed,true);
 assert.equal(h.mayBegin({device:'another-device',eventId:idB,currentCommand:idB}).allowed,true);
 assert.equal(h.release({device:dev,commandId:idB}),false);
 assert.equal(h.mayBegin({device:dev,eventId:idB,currentCommand:idA}).allowed,false);
 assert.equal(h.release({device:dev,commandId:idA}),true);
 assert.equal(h.mayBegin({device:dev,eventId:idB,currentCommand:idA}).allowed,true);
});
test('signed phone discard invalidates the original command independently; no hidden command resurrection',()=>{
 let t=90000;const h=createStage44DeviceFocus({now:()=>t});
 assert.equal(h.start({device:dev,commandId:idA,currentCommand:idA}).ok,true);
 assert.equal(h.mayBegin({device:dev,eventId:idB,currentCommand:idA}).allowed,false);
 // Original signed /device/discard-work changed command version. Focus can
 // never override the original device authorization/cancel decision.
 assert.equal(h.mayBegin({device:dev,eventId:idB,currentCommand:idC}).allowed,true);
 assert.equal(h.release({device:dev,commandId:idA}),false);
 assert.equal(h.start({device:dev,commandId:idB,currentCommand:idB}).ok,true);
 t+=120001;
 assert.equal(h.mayBegin({device:dev,eventId:idC,currentCommand:idB}).allowed,true);
 assert.equal(h.release({device:dev,commandId:idB}),false);
});
test('limits and malicious/invalid inputs fail closed, capacity bounded, never read journal',()=>{
 let t=0;const h=createStage44DeviceFocus({now:()=>t,maxEntries:1});
 assert.equal(h.mayBegin({device:'',eventId:idA,currentCommand:null}).allowed,false);
 assert.equal(h.mayBegin({device:dev,eventId:'secret',currentCommand:null}).allowed,false);
 assert.equal(h.start({device:dev,commandId:idA,currentCommand:idA}).ok,true);
 assert.equal(h.start({device:'second',commandId:idB,currentCommand:idB}).code,'FOCUS_CAPACITY');
 assert.equal(h.release({device:'second',commandId:idA}),false);
 t+=120000;
 assert.equal(h.mayBegin({device:dev,eventId:idB,currentCommand:idA}).allowed,true);
 assert.equal(h.start({device:'second',commandId:idB,currentCommand:idB}).ok,true);
 assert.throws(()=>createStage44DeviceFocus({maxMs:99999999}));
});
test('real generated Secure56 Stage25+26+40+41 operator is unchanged with flag off, exact reversible with focus on',async()=>{
 const original=await buildStage25PendingOperatorEntrypoint56(root,base);
 const pristine=readFileSync(original.runtimeFile,'utf8');
 assert.equal(original.stamp.stage44DeviceFocus,false);
 assert.equal(pristine.includes('createStage44DeviceFocus'),false);
 const focused=await buildStage25PendingOperatorEntrypoint56(root,enabled);
 const runtime=readFileSync(focused.runtimeFile,'utf8');
 assert.equal(focused.stamp.stage44DeviceFocus,true);
 assert.equal(reverseStage44DeviceFocusPatch(runtime),pristine);
 assert.equal(applyStage44DeviceFocusPatch(pristine),runtime);
 const guards=['jhRequireCommand56(device)','jhDiscardDeviceWork56(device,eventId)',
 'jhDiscardDeviceWork56(body.deviceId,body.eventId,body.previousCommandId)',
 'durableNativeHooks56?.acceptedCompletion(','jhPaymentLifecycle.captureBinding',
 'jhOwnerAdmission155','jhCommandCause41','computerExecutionReceipts56.issue(',
 'JH_MOBILE_WEB_13_MODE','DEVICE_FOCUS_PROTECTED_OTHER_BEGIN'];
 for(const guard of guards)assert.ok(runtime.includes(guard),guard);
 assert.ok(runtime.includes("if(mode==='BEGIN'&&request_id){"));
 assert.ok(!runtime.includes('automaticReplayAllowed:true'));
 assert.equal(focused.listenerStarted,false);
 assert.equal(focused.productionEnabled,false);
 const check=await buildStage25PendingOperatorEntrypoint56(root,base);
 const expected=readFileSync(check.runtimeFile,'utf8');
 assert.equal(expected,pristine);
});
test('original production owner selector can choose identical attested file, no listen or deploy',async()=>{
 const candidate=await buildStage25PendingOperatorEntrypoint56(root,enabled);
 const prod={...enabled,CI:undefined,NODE_ENV:'production',JH_OWNER_DEFER_LISTEN:undefined,
 JH_PENDING_APPROVAL_OPERATOR_ENABLE:'EXPLICIT_OPERATOR_APPROVAL_RECEIPT_V1',
 JH_SPLIT_FOLLOWUP_OPERATOR_ENABLE:'EXPLICIT_FOLLOWUP_CLICK_RECEIPT_V1',
 JH_DURABLE_RELEASE:'SERVE_READY_V1',RENDER_SERVICE_ID:'srv-db0fjl2d0e5s73be114g'};
 assert.equal(selectStage44Focus56(prod),true);
 const actual=selectStage25PendingOperatorRuntime56(root,prod);
 assert.equal(actual.sha256,candidate.stamp.runtimeSha256);
 assert.equal(actual.originalOperatorVerified,true);
 assert.equal(actual.automaticReplayAllowed,false);
 await buildStage25PendingOperatorEntrypoint56(root,base);
});
