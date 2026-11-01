import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {buildStage25PendingOperatorEntrypoint56,selectStage41CommandLifecycle56}
 from './stage25-live-operator-followup-entry.mjs';
import {applyStage41CommandLifecyclePatch,reverseStage41CommandLifecyclePatch}
 from './stage41-command-lifecycle-patch.mjs';

const root=path.resolve(import.meta.dirname,'..');
const base={CI:'true',NODE_ENV:'test',JH_OWNER_DEFER_LISTEN:'1',
 JH_STAGE26_SIGNED_COMPLETION_ACK:'EXPLICIT_IDENTICAL_SIGNED_RESULT_V1',
 JH_MOBILE_WEB_13_MODE:'EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1',
 JH_STAGE40_OWNER_ADMISSION_DIAGNOSTICS:'EXPLICIT_ORIGINAL_OWNER_REASON_V1'};
const enabled={...base,JH_STAGE41_COMMAND_LIFECYCLE_DIAGNOSTICS:'EXPLICIT_SIGNED_COMMAND_CAUSE_V1'};
test('explicit feature only; invalid production identity and absent Stage40 are rejected',()=>{
 assert.equal(selectStage41CommandLifecycle56(base),false);
 assert.equal(selectStage41CommandLifecycle56(enabled),true);
 assert.throws(()=>selectStage41CommandLifecycle56({...enabled,JH_MOBILE_WEB_13_MODE:undefined}));
 assert.throws(()=>selectStage41CommandLifecycle56({...enabled,JH_STAGE40_OWNER_ADMISSION_DIAGNOSTICS:undefined}));
 assert.throws(()=>selectStage41CommandLifecycle56({...enabled,RENDER_SERVICE_ID:'srv-db0fjl2d0e5s73be114g'}));
 assert.throws(()=>selectStage41CommandLifecycle56({...enabled,JH_STAGE41_COMMAND_LIFECYCLE_DIAGNOSTICS:'ALLOW_ALL'}));
});
test('real Stage25+26 signed generated server has exact reversible read-only command provenance; default preserved',async()=>{
 const original=await buildStage25PendingOperatorEntrypoint56(root,base);
 assert.equal(original.stamp.stage41CommandLifecycleDiagnostics,false);
 const before=readFileSync(original.runtimeFile,'utf8');
 assert.equal(before.includes('jhCommandCauses41'),false);
 const candidate=await buildStage25PendingOperatorEntrypoint56(root,enabled);
 const after=readFileSync(candidate.runtimeFile,'utf8');
 assert.equal(candidate.stamp.stage41CommandLifecycleDiagnostics,true);
 assert.equal(reverseStage41CommandLifecyclePatch(after),before);
 assert.equal(applyStage41CommandLifecyclePatch(before),after);
 for(const originalGuard of ['jhRequireCommand56(device)','jhDiscardDeviceWork56(device,eventId)',
  'jhDiscardDeviceWork56(body.deviceId,body.eventId,body.previousCommandId)',
  "!eqHex56(mac,hmac56(a.secret,'discard|'",
  'durableNativeHooks56?.beforeDispatch(','durableNativeHooks56?.acceptedCompletion(',
  'computerExecutionReceipts56.issue(','jhOwnerAdmissionNote40(','secureSessionId'])
  assert.ok(after.includes(originalGuard),originalGuard);
 for(const diag of ['NEW_BEGIN_COMMAND','PHONE_SCOPED_SITE_DISCARD','PHONE_UNSCOPED_SITE_DISCARD',
  'commandLifecycleCause','automaticReplay:false','verifiedPhoneEffect:false'])
  assert.ok(after.includes(diag),diag);
 assert.equal(candidate.listenerStarted,false);
 assert.equal(candidate.productionEnabled,false);
 await buildStage25PendingOperatorEntrypoint56(root,base);
});
test('exact original command version remains the ONLY authority; same command bridges, new begin invalidates old',async()=>{
 const v=await buildStage25PendingOperatorEntrypoint56(root,enabled);
 const s=readFileSync(v.runtimeFile,'utf8');
 const start=s.indexOf('const jhBlockedCommands56=new Set();');
 const end=s.indexOf('function jhCommandTool56(',start);
 assert.ok(start>=0&&end>start);
 const snippet=s.slice(start,end);
 const versions=new Map(),commandState={current:null};
 const chosen='device-check';
 const ctxObj={device:chosen,commandId:null,version:null,used:false};
 const sandbox={
  Map,Set,Error,Reflect,deviceState:versions,
  jhCommandContext56:{getStore:()=>ctxObj},
  jhMcpWorkflows56:new Map(),
  jhCommandVersion56:device=>versions.get(device)||null,
  jhDiscardDeviceWork56:(device,event,previous)=>{
    if(previous!==undefined&&versions.get(device)!==previous)return;
    versions.set(device,event);
  }
 };
 vm.createContext(sandbox);
 const driver=vm.runInContext('(()=>{'+snippet+
   'return {start:jhStartCommand56,require:jhRequireCommand56,why:jhCommandCause41,events:jhCommandCauses41};})()',sandbox);
 const command1='a'.repeat(32),command2='b'.repeat(32);
 assert.equal(driver.start(chosen,command1),command1);
 assert.equal(driver.require(chosen),command1);
 assert.equal(driver.why(ctxObj),'COMMAND_OTHER_BINDING_FAILURE');
 const oldBinding={commandId:ctxObj.commandId,version:ctxObj.version};
 assert.equal(driver.start(chosen,command2),command2);
 ctxObj.commandId=oldBinding.commandId;ctxObj.version=oldBinding.version;
 assert.throws(()=>driver.require(chosen),/new_command_binding_required_or_discarded/);
 assert.equal(driver.why(ctxObj),'NEW_BEGIN_COMMAND');
 assert.equal(driver.events.get(chosen),'NEW_BEGIN_COMMAND');
 assert.equal(driver.events.size,1);
});
test('original signed phone site discard is scoped; no unverified action replay',async()=>{
 const v=await buildStage25PendingOperatorEntrypoint56(root,enabled);
 const s=readFileSync(v.runtimeFile,'utf8');
 const a=s.indexOf('const jhBlockedCommands56=new Set();');
 const b=s.indexOf('function jhStartCommand56(',a);
 const declarations=s.slice(a,b);
 const start=s.indexOf('const jhPreviousSite41=jhCommandVersion56(body.deviceId);');
 const end=s.indexOf('res.writeHead(200',start);
 assert.ok(start>=0&&end>start);
 const fragment=s.slice(start,end);
 const versions=new Map();
 const old='c'.repeat(32),e='d'.repeat(32),dev='test-device';
 versions.set(dev,old);
 const sandbox={
  Map,Set,
  jhCommandVersion56:id=>versions.get(id)||null,
  jhDiscardDeviceWork56:(device,event,previous)=>{
   if(previous!==undefined&&versions.get(device)!==previous)return;
   versions.set(device,event);
  },
  jhCommandContext56:{getStore:()=>null},
  body:{deviceId:dev,eventId:e,previousCommandId:old}
 };
 vm.createContext(sandbox);
 vm.runInContext(declarations,sandbox);
 const why=()=>vm.runInContext('jhCommandCauses41.get(body.deviceId)',sandbox);
 vm.runInContext(fragment,sandbox);
 assert.equal(versions.get(dev),e);
 assert.equal(why(),'PHONE_SCOPED_SITE_DISCARD');
 versions.set(dev,old);
 sandbox.body={deviceId:dev,eventId:'f'.repeat(32)};
 vm.runInContext(fragment,sandbox);
 assert.equal(why(),'PHONE_UNSCOPED_SITE_DISCARD');
 // An old stale signed event must NOT replace the current active command.
 sandbox.body={deviceId:dev,eventId:'1'.repeat(32),previousCommandId:old};
 vm.runInContext(fragment,sandbox);
 assert.equal(versions.get(dev),'f'.repeat(32));
 assert.equal(why(),'PHONE_UNSCOPED_SITE_DISCARD');
 assert.equal(sandbox.jhCommandContext56.getStore(),null);
});
test('untrusted source mutations and repeat injection fail closed',async()=>{
 const original=await buildStage25PendingOperatorEntrypoint56(root,base);
 const src=readFileSync(original.runtimeFile,'utf8');
 const patched=applyStage41CommandLifecyclePatch(src);
 assert.throws(()=>applyStage41CommandLifecyclePatch(patched));
 assert.throws(()=>applyStage41CommandLifecyclePatch(src.replace(
  'jhDiscardDeviceWork56(body.deviceId,body.eventId,body.previousCommandId);','jhDiscardDeviceWork56(body.deviceId,body.eventId);')));
 assert.throws(()=>applyStage41CommandLifecyclePatch(src.replace(
  'const jhBlockedCommands56=new Set();','const jhBlockedCommands56=null;')));
 assert.equal(reverseStage41CommandLifecyclePatch(patched),src);
});
