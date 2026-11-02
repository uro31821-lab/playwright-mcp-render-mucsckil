/**
 * Read-only command diagnostics over the actual generated Stage25 status
 * callback. All state is synthetic and remains in memory: no listener,
 * owner journal, phone transport, BEGIN, action or recovered receipt.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {z} from 'zod';
import {createStage44DeviceFocus} from './stage44-device-focus.mjs';
import {
 readMobile13CommandDiagnostics56,
 applyMobile13CommandDiagnosticsPatch56,
 reverseMobile13CommandDiagnosticsPatch56
} from './mobile13-command-diagnostics.mjs';
import {
 buildStage25PendingOperatorEntrypoint56,
 selectMobile13CommandDiagnostics56,
 selectStage25PendingOperatorRuntime56
} from './stage25-live-operator-followup-entry.mjs';

const ROOT=path.resolve(import.meta.dirname,'..');
const FLAG='EXPLICIT_OWNER_DEVICE_READ_ONLY_V1';
const MODE='EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1';
const BASE={CI:'true',NODE_ENV:'test',JH_OWNER_DEFER_LISTEN:'1',
 JH_MOBILE_WEB_13_MODE:MODE,
 JH_STAGE26_SIGNED_COMPLETION_ACK:'EXPLICIT_IDENTICAL_SIGNED_RESULT_V1',
 JH_STAGE40_OWNER_ADMISSION_DIAGNOSTICS:'EXPLICIT_ORIGINAL_OWNER_REASON_V1',
 JH_STAGE41_COMMAND_LIFECYCLE_DIAGNOSTICS:'EXPLICIT_SIGNED_COMMAND_CAUSE_V1',
 JH_STAGE44_DEVICE_FOCUS:'EXPLICIT_SIGNED_WORKFLOW_FOCUS_V1'};
const ENABLED={...BASE,JH_MOBILE13_COMMAND_DIAGNOSTICS:FLAG};
const NOW=1_800_000_000_000;
const sha=value=>createHash('sha256').update(value).digest('hex');
const DEVICE='private-selected-device',OTHER_DEVICE='private-other-device';
const COMMAND=sha('selected original command').slice(0,32);
const OLD_COMMAND=sha('prior unknown command').slice(0,32);
const OTHER_COMMAND=sha('other device command').slice(0,32);
const DIGEST=sha('selected secure device'),OTHER_DIGEST=sha('other secure device');
const OWNER=sha('selected owner'),OTHER_OWNER=sha('other owner');
const RUNTIME=sha('current runtime generation'),OLD_RUNTIME=sha('old runtime generation');
const SESSION='private-selected-session',OTHER_SESSION='private-other-session';
const TRUST='private_selected_trust_identity_32';
const OTHER_TRUST='private_other_trust_identity_32';
const INPUT_GRANT='ipg_'+sha('private input grant').slice(0,32);
const NONCE='private-one-shot-nonce';

// Fail immediately on attempted collection mutation; snapshots also cover
// nested records, session-key bytes, counters, TTLs and grants.
class ObservedMap extends Map {
 constructor(entries=[]){super();for(const [key,value] of entries)Map.prototype.set.call(this,key,value);}
 set(){throw Error('DIAGNOSTIC_MAP_WRITE');}
 delete(){throw Error('DIAGNOSTIC_MAP_DELETE');}
 clear(){throw Error('DIAGNOSTIC_MAP_CLEAR');}
}
class ObservedSet extends Set {
 constructor(values=[]){super();for(const value of values)Set.prototype.add.call(this,value);}
 add(){throw Error('DIAGNOSTIC_SET_WRITE');}
 delete(){throw Error('DIAGNOSTIC_SET_DELETE');}
 clear(){throw Error('DIAGNOSTIC_SET_CLEAR');}
}
function freeze(value){
 if(!value||typeof value!=='object'||Buffer.isBuffer(value)||value instanceof Map||value instanceof Set)return value;
 for(const part of Object.values(value))freeze(part);
 return Object.freeze(value);
}
function snapshot(value){
 return JSON.stringify(value,(_key,part)=>part instanceof Map?{map:[...part]}:
  part instanceof Set?{set:[...part]}:part);
}
function job(id,status='queued',changes={}){
 return freeze({id,status,type:'open_url',targetDeviceId:DEVICE,
  secureSessionId:SESSION,commandId:COMMAND,targetDeviceDigest:DIGEST,
  createdAt:new Date(NOW-1000).toISOString(),expiresAt:NOW+60000,
  requestId:'private-request-'+id,nonce:NONCE,inputGrantToken:INPUT_GRANT,
  url:'https://private.example.invalid/'+id,
  result:{ok:false,code:'OPEN_COMPLETION_PENDING',privateText:'PRIVATE_JOB_BODY'},...changes});
}
function workflow(id,phase='RUNNING',changes={}){
 return freeze({id,phase,device:DEVICE,commandId:COMMAND,sessionId:SESSION,
  trustId:TRUST,ownerDigest:OWNER,secureDeviceDigest:DIGEST,
  createdAt:NOW-1000,expiresAt:NOW+60000,plan:'PRIVATE_WORKFLOW_PLAN',
  initialPackage:'private.initial.package',lastPackage:'private.current.package',
  sessionRebindCount:0,lastSessionReboundAt:null,
  jobs:[{jobId:'private-workflow-job',jobDigest:sha('private job'),
   runtimeDigest:RUNTIME,stepId:'private-step',type:'open_url',code:'ISSUED'}],...changes});
}
function fixture(changes={}){
 const activeSession=freeze({sessionId:SESSION,deviceDigest:DIGEST,trustId:TRUST,
  ownerDigest:OWNER,expiresAt:NOW+600000,secret:Buffer.alloc(32,91),
  nonces:new ObservedSet([NONCE])});
 return {nowMs:NOW,deviceId:DEVICE,
  deviceMeta:freeze({secureBridgeVersion:56,secureActive:true,deviceDigest:DIGEST,
   processEpoch:'PRIVATE_PROCESS_EPOCH',lastSeen:NOW}),
  activeSession,currentCommand:COMMAND,runtimeGeneration:RUNTIME,
  jobs:new ObservedMap(),workflows:new ObservedMap(),discardPending:false,
  lastVerifiedPoll:freeze({device:DEVICE,sessionId:SESSION,deviceDigest:DIGEST,atMs:NOW-25}),
  ...changes};
}
function assertAdvisory(result){
 assert.equal(result.schema,'JH168_MOBILE13_COMMAND_DIAGNOSTICS_V1');
 assert.equal(result.readOnly,true);
 assert.equal(result.advisoryOnly,true);
 assert.equal(result.authorizesBegin,false);
 assert.equal(result.automaticReplay,false);
 assert.deepEqual(result.unresolvedEffects,
  {state:'unknown',count:null,reason:'NOT_READ_BY_THIS_DIAGNOSTIC'});
 assert.equal(result.trustVerification,'NOT_REVALIDATED_READ_ONLY');
 assert.equal(result.scope,'SELECTED_DEVICE_LAST_BOUND_OWNER_MEMORY');
 assert.equal(Object.hasOwn(result,'selectedDeviceIdle'),false);
}
function assertRedacted(result){
 const text=JSON.stringify(result);
 for(const value of [DEVICE,OTHER_DEVICE,COMMAND,OLD_COMMAND,OTHER_COMMAND,
  SESSION,OTHER_SESSION,TRUST,OTHER_TRUST,OWNER,OTHER_OWNER,OTHER_DIGEST,
  INPUT_GRANT,NONCE,'PRIVATE_JOB_BODY','PRIVATE_WORKFLOW_PLAN','PRIVATE_PROCESS_EPOCH',
  'private-request-','private.initial.package','private.current.package',
  'https://private.example.invalid/','private-workflow-job','private-step',
  Buffer.alloc(32,91).toString('hex'),Buffer.alloc(32,91).toString('base64')])
  assert.equal(text.includes(value),false,'private value must not be emitted: '+value);
}
function declaration(source,name){
 const re=new RegExp('^([ \\t]*)(?:export )?(?:async )?function '+name+'\\(','gm');
 const matches=[...source.matchAll(re)];
 assert.equal(matches.length,1,'one actual generated function: '+name);
 const start=matches[0].index,indent=matches[0][1],lineEnd=source.indexOf('\n',start);
 const first=source.slice(start,lineEnd);
 if(first.trimEnd().endsWith('}'))return first.replace(/^export /,'');
 const tail=source.slice(lineEnd+1),end=new RegExp('^'+indent+'\\}\\r?$','m').exec(tail);
 assert.ok(end,'end of generated function: '+name);
 return source.slice(start,lineEnd+1+end.index+end[0].length).replace(/^export /,'');
}
function between(source,start,end){
 assert.equal(source.split(start).length,2,'unique actual source start: '+start);
 const at=source.indexOf(start),stop=source.indexOf(end,at+start.length);
 assert.ok(stop>at,'actual source end: '+end);
 return source.slice(at,stop);
}

test('command diagnosis is explicitly gated; neither default mode nor invalid owner scope enables it',()=>{
 assert.equal(selectMobile13CommandDiagnostics56(BASE),false);
 assert.equal(selectMobile13CommandDiagnostics56(ENABLED),true);
 assert.equal(selectMobile13CommandDiagnostics56({...ENABLED,JH_STAGE44_DEVICE_FOCUS:undefined}),true,
  'read-only diagnostics do not require a focus lease');
 for(const env of [
  {...ENABLED,JH_MOBILE13_COMMAND_DIAGNOSTICS:'true'},
  {...ENABLED,JH_MOBILE_WEB_13_MODE:undefined},
  {...ENABLED,RENDER_SERVICE_ID:'srv-db0fjl2d0e5s73be114g'},
  {...ENABLED,JH_OWNER_DEFER_LISTEN:undefined}
 ])assert.throws(()=>selectMobile13CommandDiagnostics56(env));
});

test('selected-device memory is projected without raw tokens, other-device fields or state writes',()=>{
 const state=fixture({
  jobs:new ObservedMap([
   ['selected-queued',job('private-queued')],
   ['selected-running',job('private-running','in_progress')],
   ['selected-complete',job('private-completed','complete')],
   ['other-running',job('private-other-job','in_progress',{targetDeviceId:OTHER_DEVICE,
    secureSessionId:OTHER_SESSION,commandId:OTHER_COMMAND,targetDeviceDigest:OTHER_DIGEST,
    trustBindingId:OTHER_TRUST,ownerDigest:OTHER_OWNER})]
  ]),
  workflows:new ObservedMap([
   ['selected-running',workflow('private-current-workflow')],
   ['selected-verified',workflow('private-completed-workflow','VERIFIED')],
   ['other-running',workflow('private-other-workflow','RUNNING',{device:OTHER_DEVICE,
    sessionId:OTHER_SESSION,commandId:OTHER_COMMAND,secureDeviceDigest:OTHER_DIGEST,
    trustId:OTHER_TRUST,ownerDigest:OTHER_OWNER})]
  ]),
  focus:{state:'observed',present:true,active:true,remainingMs:110000,
   currentCommandMatches:true,commandId:COMMAND,sessionId:SESSION,privateText:'PRIVATE_JOB_BODY'}
 });
 const before=snapshot(state),one=readMobile13CommandDiagnostics56(state);
 const two=readMobile13CommandDiagnostics56(state);
 assert.deepEqual(two,one);
 assert.equal(snapshot(state),before);
 assert.equal(one.state,'observed');
 assert.equal(one.reason,'MEMORY_SCOPE_OBSERVED');
 assert.equal(one.deviceDigest,DIGEST);
 assert.equal(one.runtimeGeneration,RUNTIME);
 assert.equal(one.command.state,'present');
 assert.match(one.command.digest,/^[a-f0-9]{64}$/);
 assert.deepEqual(one.transientJobs,{state:'observed',pending:1,inflight:1});
 assert.deepEqual(one.workflows,{state:'observed',unfinished:1});
 assert.deepEqual(one.discard,{state:'observed',pending:false});
 assert.deepEqual(one.focus,{state:'observed',present:true,active:true,remainingMs:110000,
  currentCommandMatches:true});
 assert.deepEqual(one.lastVerifiedPoll,{state:'observed',bound:true,fresh:true,ageMs:25});
 assertAdvisory(one);assertRedacted(one);
 assert.notEqual(readMobile13CommandDiagnostics56({...state,currentCommand:OLD_COMMAND}).command.digest,
  one.command.digest,'different commands cannot have the same observation identifier');
});

test('absent command is distinct from unknown binding; cached poll never substitutes for current trust',()=>{
 const base=fixture();
 const cases=[
  ['no selected device',{deviceId:null},'NO_SELECTED_DEVICE'],
  ['missing session',{activeSession:null},'OWNER_DEVICE_MEMORY_BINDING_UNAVAILABLE'],
  ['expired session',{activeSession:{...base.activeSession,expiresAt:NOW}},'OWNER_DEVICE_MEMORY_BINDING_UNAVAILABLE'],
  ['missing owner identity',{activeSession:{...base.activeSession,ownerDigest:undefined}},'OWNER_DEVICE_MEMORY_BINDING_UNAVAILABLE'],
  ['missing trust identity',{activeSession:{...base.activeSession,trustId:undefined}},'OWNER_DEVICE_MEMORY_BINDING_UNAVAILABLE'],
  ['mismatched secure device',{deviceMeta:{...base.deviceMeta,deviceDigest:OTHER_DIGEST}},'OWNER_DEVICE_MEMORY_BINDING_UNAVAILABLE'],
  ['inactive secure binding',{deviceMeta:{...base.deviceMeta,secureActive:false}},'OWNER_DEVICE_MEMORY_BINDING_UNAVAILABLE'],
  ['invalid observation time',{nowMs:-1},'INVALID_OBSERVATION_TIME']
 ];
 for(const [label,changes,reason] of cases){
  const input={...base,...changes},before=snapshot(input);
  const result=readMobile13CommandDiagnostics56(input);
  assert.equal(result.state,'unknown',label);assert.equal(result.reason,reason,label);
  assert.equal(result.deviceDigest,null,label);
  assert.deepEqual(result.command,{state:'unknown',digest:null},label);
  assert.deepEqual(result.transientJobs,{state:'unknown',pending:null,inflight:null},label);
  assert.deepEqual(result.workflows,{state:'unknown',unfinished:null},label);
  assert.deepEqual(result.discard,{state:'unknown',pending:null},label);
  assert.deepEqual(result.lastVerifiedPoll,{state:'unknown',bound:null,fresh:null,ageMs:null},label);
  assert.equal(snapshot(input),before,label);assertAdvisory(result);assertRedacted(result);
 }
 const absent=readMobile13CommandDiagnostics56({...base,currentCommand:null});
 const unknown=readMobile13CommandDiagnostics56({...base,currentCommand:undefined});
 assert.deepEqual(absent.command,{state:'absent',digest:null});
 assert.deepEqual(unknown.command,{state:'unknown',digest:null});
 assertAdvisory(absent);assertAdvisory(unknown);
 for(const lastVerifiedPoll of [
  {...base.lastVerifiedPoll,device:OTHER_DEVICE},
  {...base.lastVerifiedPoll,sessionId:OTHER_SESSION},
  {...base.lastVerifiedPoll,deviceDigest:OTHER_DIGEST},
  {...base.lastVerifiedPoll,atMs:NOW+1}
 ])assert.deepEqual(readMobile13CommandDiagnostics56({...base,lastVerifiedPoll}).lastVerifiedPoll,
  {state:'unknown',bound:null,fresh:null,ageMs:null});
 const stale=readMobile13CommandDiagnostics56({...base,
  lastVerifiedPoll:{...base.lastVerifiedPoll,atMs:NOW-30001}});
 assert.deepEqual(stale.lastVerifiedPoll,{state:'observed',bound:true,fresh:false,ageMs:30001});
 assertAdvisory(stale);
});

test('old, expired and ambiguous records remain unresolved; terminal counts never authorize replay',()=>{
 const staleWorkflow=workflow('private-original-unknown-workflow','NEEDS_REVIEW',{
  commandId:OLD_COMMAND,sessionId:OTHER_SESSION,expiresAt:NOW-600000,
  jobs:[{stepId:'private-original-step',jobId:'private-job14',jobDigest:sha('original job14'),
   runtimeDigest:OLD_RUNTIME,code:'OPEN_COMPLETION_PENDING'}]
 });
 const state=fixture({
  jobs:new ObservedMap([
   ['original-pending',job('private-original-pending','in_progress',{
    commandId:OLD_COMMAND,expiresAt:NOW-10000})],
   ...['complete','error','expired','discarded'].map(status=>[
    'terminal-'+status,job('private-terminal-'+status,status)])
  ]),
  workflows:new ObservedMap([
   ['retained-unknown',staleWorkflow],
   ...['VERIFIED','ABORTED_BY_TERMINATION','DISCARDED'].map(phase=>[
    'terminal-'+phase,workflow('private-terminal-'+phase,phase)])
  ]),discardPending:true
 });
 const before=snapshot(state),result=readMobile13CommandDiagnostics56(state);
 assert.deepEqual(result.transientJobs,{state:'observed',pending:0,inflight:1},
  'expired retained work must not silently disappear');
 assert.deepEqual(result.workflows,{state:'observed',unfinished:1},
  'old-generation retained owner work is unfinished, not a recovered current job');
 assert.equal(result.runtimeGeneration,RUNTIME);
 assert.deepEqual(result.discard,{state:'observed',pending:true});
 assert.equal(snapshot(state),before);
 assert.equal(staleWorkflow.phase,'NEEDS_REVIEW');
 assert.equal(staleWorkflow.jobs[0].runtimeDigest,OLD_RUNTIME);
 assertAdvisory(result);assertRedacted(result);

 for(const changes of [
  {secureSessionId:OTHER_SESSION},{secureSessionId:undefined},
  {targetDeviceDigest:OTHER_DIGEST},{trustBindingId:OTHER_TRUST},
  {ownerDigest:OTHER_OWNER},{status:'unclassified'}
 ]){
  const input=fixture({jobs:new ObservedMap([['unbound',job('private-unbound','queued',changes)]])});
  assert.deepEqual(readMobile13CommandDiagnostics56(input).transientJobs,
   {state:'unknown',pending:null,inflight:null},JSON.stringify(changes));
 }
 for(const changes of [
  {ownerDigest:OTHER_OWNER},{trustId:OTHER_TRUST},{secureDeviceDigest:OTHER_DIGEST},
  {phase:'unclassified'}
 ]){
  const input=fixture({workflows:new ObservedMap([['unbound',workflow('private-unbound','RUNNING',changes)]])});
  assert.deepEqual(readMobile13CommandDiagnostics56(input).workflows,
   {state:'unknown',unfinished:null},JSON.stringify(changes));
 }
 const empty=readMobile13CommandDiagnostics56(fixture());
 assert.deepEqual(empty.transientJobs,{state:'observed',pending:0,inflight:0});
 assert.deepEqual(empty.workflows,{state:'observed',unfinished:0});
 assertAdvisory(empty); // No durable effects were read, even when local counts are zero.
 for(const key of ['jobs','workflows']){
  const rows=new ObservedMap(Array.from({length:4097},(_,index)=>[index,{device:OTHER_DEVICE,targetDeviceId:OTHER_DEVICE}]));
  const bounded=readMobile13CommandDiagnostics56(fixture({[key]:rows}));
  assert.equal((key==='jobs'?bounded.transientJobs:bounded.workflows).state,'unknown');
  assertAdvisory(bounded);
 }
});

test('focus peek observes active, mismatched and expired leases without purge, renewal or capacity release',()=>{
 let at=NOW;
 const focus=createStage44DeviceFocus({now:()=>at,maxMs:120000,maxEntries:1});
 assert.deepEqual(focus.peek({device:DEVICE,currentCommand:null}),
  {state:'observed',present:false,active:false,remainingMs:0,currentCommandMatches:null});
 assert.equal(focus.start({device:DEVICE,commandId:COMMAND,currentCommand:COMMAND}).ok,true);
 at+=1000;
 assert.deepEqual(focus.peek({device:DEVICE,currentCommand:COMMAND}),
  {state:'observed',present:true,active:true,remainingMs:119000,currentCommandMatches:true});
 assert.deepEqual(focus.peek({device:DEVICE,currentCommand:OLD_COMMAND}),
  {state:'observed',present:true,active:false,remainingMs:119000,currentCommandMatches:false});
 assert.deepEqual(focus.peek({device:DEVICE,currentCommand:undefined}),
  {state:'observed',present:true,active:null,remainingMs:119000,currentCommandMatches:null});
 at+=1000;
 assert.equal(focus.peek({device:DEVICE,currentCommand:COMMAND}).remainingMs,118000,
  'neither unknown nor mismatched command observation purges or renews the original row');
 at=NOW+120001;
 for(let read=0;read<2;read++)assert.deepEqual(focus.peek({device:DEVICE,currentCommand:COMMAND}),
  {state:'observed',present:true,active:false,remainingMs:0,currentCommandMatches:true});
 assert.equal(focus.start({device:OTHER_DEVICE,commandId:OTHER_COMMAND,currentCommand:OTHER_COMMAND}).code,
  'FOCUS_CAPACITY','expired observation must not free retained capacity');
 assert.equal(focus.release({device:DEVICE,commandId:COMMAND}),true,
  'the unchanged original row is still present for the original release path');
 assert.equal(focus.peek({device:DEVICE,currentCommand:COMMAND}).present,false);
 assert.equal(focus.peek({device:DEVICE,currentCommand:COMMAND,at:-1}).state,'unknown');
});

let generatedSources;
function sources(){
 if(!generatedSources)generatedSources=(async()=>{
  // Existing builders share generated filenames. The selected test suite runs
  // with --test-concurrency=1; restore the original flag state after reading.
  const protectedPaths=[
   path.resolve(ROOT,'../server.mjs'),
   path.join(ROOT,'deployment/durable-native-job-policy.mjs'),
   path.join(ROOT,'deployment/durable-native-host.mjs'),
   path.join(ROOT,'deployment/durable-mcp-workflow-patch.mjs'),
   path.join(ROOT,'server-integration/pending-approval-operator-entry.mjs'),
   path.join(ROOT,'operational-learning/runtime-patch.mjs')
  ];
  const pins=protectedPaths.map(file=>[file,readFileSync(file)]);
  // A nested historical composer reads process.env rather than the explicit
  // builder argument. Use the same credential-free CI environment for both
  // paths, and restore the caller's exact environment even on a failed build.
  const callerEnv=process.env;
  const syntheticEnv=env=>({PATH:callerEnv.PATH||'',...env});
  process.env=syntheticEnv(BASE);
  try{
   const original=await buildStage25PendingOperatorEntrypoint56(ROOT,BASE);
   const before=readFileSync(original.runtimeFile,'utf8');
   let candidate,after,selected,production;
   try{
    process.env=syntheticEnv(ENABLED);
    candidate=await buildStage25PendingOperatorEntrypoint56(ROOT,ENABLED);
    after=readFileSync(candidate.runtimeFile,'utf8');
    selected=selectStage25PendingOperatorRuntime56(ROOT,ENABLED);
    const prod={...ENABLED,CI:undefined,NODE_ENV:'production',JH_OWNER_DEFER_LISTEN:undefined,
     JH_PENDING_APPROVAL_OPERATOR_ENABLE:'EXPLICIT_OPERATOR_APPROVAL_RECEIPT_V1',
     JH_SPLIT_FOLLOWUP_OPERATOR_ENABLE:'EXPLICIT_FOLLOWUP_CLICK_RECEIPT_V1',
     JH_DURABLE_RELEASE:'SERVE_READY_V1',RENDER_SERVICE_ID:'srv-db0fjl2d0e5s73be114g'};
    production=selectStage25PendingOperatorRuntime56(ROOT,prod);
   }finally{
    process.env=syntheticEnv(BASE);
    await buildStage25PendingOperatorEntrypoint56(ROOT,BASE);
    for(const [file,bytes] of pins)assert.deepEqual(readFileSync(file),bytes,
     'protected source changed while composing diagnostics: '+file);
   }
   return {before,after,original,candidate,selected,production};
  }finally{process.env=callerEnv;}
 })();
 return generatedSources;
}

test('actual Stage25 selection is default-off, exactly reversible and fail-closed on patch-anchor drift',async()=>{
 const {before,after,original,candidate,selected,production}=await sources();
 assert.equal(original.stamp.mobile13CommandDiagnostics,false);
 assert.equal(candidate.stamp.mobile13CommandDiagnostics,true);
 assert.equal(candidate.listenerStarted,false);
 assert.equal(candidate.productionEnabled,false);
 assert.equal(candidate.apkChanged,false);
 assert.equal(selected.sha256,candidate.stamp.runtimeSha256);
 assert.equal(production.sha256,selected.sha256);
 assert.equal(production.originalOperatorVerified,true);
 assert.equal(production.automaticReplayAllowed,false);
 assert.equal(before.includes('readMobile13CommandDiagnostics56'),false);
 assert.equal(reverseMobile13CommandDiagnosticsPatch56(after),before);
 assert.equal(applyMobile13CommandDiagnosticsPatch56(before),after);

 const registrar=source=>{
  const rows=source.split('\n').filter(line=>line.startsWith('  const registerOAuthTool='));
  assert.equal(rows.length,1);return rows[0];
 };
 assert.equal(registrar(after),registrar(before),
  'original OAuth, command, learning and MCP accounting wrappers are not bypassed');
 assert.ok(registrar(after).includes('jhCommandTool56(name,config,jhLearningHandler56(name,handler))'));
 assert.ok(registrar(after).includes('securitySchemes:oauthSchemes56'));
 assert.ok(registrar(after).includes('jhV2State56.activeMcpCalls++'));
 const status=between(after,'  registerOAuthTool("life_status",{','  registerOAuthTool("life_route",{');
 assert.ok(status.includes('    inputSchema:{}'));
 assert.ok(status.includes('readMobile13CommandDiagnostics56('));
 assert.equal(status.includes('jhV2SignedPollEvidence56('),false);
 assert.equal(status.includes('active56('),false);
 for(const guard of ['jhRequireCommand56(device)','const authorized=mcpCallerAuthorized56(req);',
  'durableNativeHooks56?.acceptedCompletion(',
  'jhDiscardDeviceWork56(body.deviceId,body.eventId,body.previousCommandId)',
  'DEVICE_FOCUS_PROTECTED_OTHER_BEGIN']){
  assert.ok(before.includes(guard),'protected source guard must exist: '+guard);
  assert.equal(after.split(guard).length,before.split(guard).length,guard);
 }

 assert.throws(()=>applyMobile13CommandDiagnosticsPatch56(after));
 assert.throws(()=>reverseMobile13CommandDiagnosticsPatch56(before));
 const anchors=[
  '  registerOAuthTool("life_status",{',
  '  registerOAuthTool("life_route",{',
  '    const signedPollVerified=typeof jhV2SignedPollEvidence56==="function"&&\n'+
   '      jhV2SignedPollEvidence56()?.verified===true;',
  'phoneActionVerified:false,automaticReplay:false,cloudBrowserProbed:false};',
  'secureBridgeVersion:56,mobileRightStatus56'
 ];
 for(const anchor of anchors){
  assert.throws(()=>applyMobile13CommandDiagnosticsPatch56(before.replace(anchor,'')),
   'missing patch anchor must not guess a new target');
  assert.throws(()=>applyMobile13CommandDiagnosticsPatch56(before.replace(anchor,anchor+'\n'+anchor)),
   'duplicate patch anchor must not select an arbitrary target');
 }
 for(const marker of ['const secureStates56=new Map();',
  'const scoped=jhCommandTool56(name,config,jhLearningHandler56(name,handler));',
  'const authorized=mcpCallerAuthorized56(req);']){
  assert.ok(before.includes(marker),'negative fixture must remove an actual source marker');
  assert.throws(()=>applyMobile13CommandDiagnosticsPatch56(before.replace(marker,'')));
 }
 for(const altered of [
  after.replace('secureBridgeVersion:56,mobileRightStatus56,commandDiagnostics','secureBridgeVersion:56,mobileRightStatus56'),
  after.replace('secureBridgeVersion:56,mobileRightStatus56,commandDiagnostics',
   'secureBridgeVersion:56,mobileRightStatus56,commandDiagnostics,secureBridgeVersion:56,mobileRightStatus56,commandDiagnostics')
 ])assert.throws(()=>reverseMobile13CommandDiagnosticsPatch56(altered));
});

function statusHarness(source,{expired=false,noDevice=false,untrusted=false,focusEnabled=true}={}){
 const calls=[],learningEvents=[],registrations=new Map();
 const poison=name=>(..._args)=>{calls.push(name);throw Error('DIAGNOSTIC_EFFECT_FORBIDDEN_'+name);};
 let nowMs=NOW;
 const base=fixture();
 const session=freeze({...base.activeSession,
  ...(expired?{expiresAt:NOW-1}:{}),...(untrusted?{trustId:undefined}:{})});
 const pending=freeze({sessionId:'private-pending-session',expiresAt:NOW-1,secret:Buffer.alloc(32,92)});
 const focus=createStage44DeviceFocus({now:()=>NOW-120001});
 assert.equal(focus.start({device:DEVICE,commandId:COMMAND,currentCommand:COMMAND}).ok,true);
 const preserved={
  devices:new ObservedMap(noDevice?[]:[
   [DEVICE,base.deviceMeta],
   [OTHER_DEVICE,freeze({...base.deviceMeta,deviceDigest:OTHER_DIGEST,lastSeen:NOW-1})]
  ]),
  secureStates56:new ObservedMap([
   [DEVICE,freeze({active:session,pending:new ObservedMap([['pending-token',pending]])})],
   [OTHER_DEVICE,freeze({active:freeze({...base.activeSession,sessionId:OTHER_SESSION,
    deviceDigest:OTHER_DIGEST,trustId:OTHER_TRUST,ownerDigest:OTHER_OWNER}),pending:new ObservedMap()})]
  ]),
  jobs:new ObservedMap([
   ['private-job14',job('private-job14','in_progress',{commandId:OLD_COMMAND,expiresAt:NOW-1})],
   ['private-other-job',job('private-other-job','queued',{targetDeviceId:OTHER_DEVICE,
    secureSessionId:OTHER_SESSION,commandId:OTHER_COMMAND})]
  ]),
  jhMcpWorkflows56:new ObservedMap([
   ['private-old-workflow',workflow('private-old-workflow','NEEDS_REVIEW',{
    sessionId:OTHER_SESSION,commandId:OLD_COMMAND,expiresAt:NOW-1,
    jobs:[{runtimeDigest:OLD_RUNTIME,jobId:'private-job14',code:'OPEN_COMPLETION_PENDING'}]})],
   ['private-other-workflow',workflow('private-other-workflow','RUNNING',{device:OTHER_DEVICE,
    ownerDigest:OTHER_OWNER,secureDeviceDigest:OTHER_DIGEST,trustId:OTHER_TRUST})]
  ]),
  jhCommandVersions56:new ObservedMap([[sha('discard-device|'+DEVICE),COMMAND],
   [sha('discard-device|'+OTHER_DEVICE),OTHER_COMMAND]]),
  jhBlockedCommands56:new ObservedSet([DEVICE]),
  queues:new ObservedMap([[DEVICE,Object.freeze(['private-job14'])]]),
  recentJobs:new ObservedMap([['private-dedupe',{t:NOW-999999,v:'private-job14'}]]),
  nonceMap:new ObservedMap([[NONCE,NOW-1]]),
  grants:new ObservedMap([[INPUT_GRANT,freeze({expiresAt:NOW-1,used:false})]]),
  seq:14,activeDeviceId:DEVICE,jhWorkflowTtl56:600000,
  jhWorkflowRuntimeDigest56:RUNTIME
 };
 const v2={installed:true,configured:true,stopping:false,
  activeMcpCalls:0,lastMcpAt:0,activeBrowserCalls:0,
  lastVerifiedPoll:base.lastVerifiedPoll,lastResult:null,
  lastRecoveryEvent:null,lastRecoveryEventKey:null};
 const learningController={
  async invoke(call,once){learningEvents.push(call);return once();},
  async status(){return {status:'synthetic-observer',events:learningEvents.length,replay:false};}
 };
 const forbidden=['active56','state56','purge56','wipeSession56','cleanupJobs',
  'jhFindWorkflow56','jhRequireWorkflow56','jhRequireCommand56','jhStartCommand56',
  'jhDiscardDeviceWork56','jhV2SignedPollEvidence56','jhV2OwnerSnapshot56',
  'jhV2BeginAdmission56','jhV2JobAdmission56','jhPersistWorkflows56','jhWriteDiscardFile56',
  'jhReadFile56','jhWriteFile56','jhOpen56','jhFsync56','mk','waitJob',
  'ensureBrowser','browserTool','secureCall56','fetch'];
 const globals={...preserved,z,Buffer,createHash,Map,Set,
  Date:class extends Date {static now(){return nowMs;}},
  jhCommandContext56:new AsyncLocalStorage(),
  jhLearningController56:learningController,jhV2State56:v2,
  readMobile13CommandDiagnostics56,
  jhFocus44:focusEnabled?Object.freeze({peek:focus.peek,
   mayBegin:poison('focus.mayBegin'),start:poison('focus.start'),release:poison('focus.release')}):undefined,
  durableNativeHooks56:new Proxy({}, {get:(_target,key)=>poison('ownerJournal.'+String(key))}),
  database:new Proxy({}, {get:(_target,key)=>poison('database.'+String(key))}),
  getSecureCompletion401Summary:()=>({total:0}),
  OAUTH_SCOPE56:'synthetic-oauth-scope',
  server:{registerTool(name,config,handler){registrations.set(name,{config,handler});}},
  ...Object.fromEntries(forbidden.map(name=>[name,poison(name)]))
 };
 const functions=['sha56','recentDevices','chooseDevice','textResult','jhCommandVersion56',
  'jhCommandTool56','jhLearningRequestId56','jhLearningCommandId56','jhLearningStatus56',
  'jhLearningHandler56','jhV2Status56'].map(name=>declaration(source,name)).join('\n');
 const modes=between(source,'const jhLearningModes56=new Set(', 'function jhLearningRequestId56(');
 const status=between(source,'  registerOAuthTool("life_status",{','  registerOAuthTool("life_route",{');
 const registrar=source.split('\n').find(line=>line.startsWith('  const registerOAuthTool='));
 const oauth=source.split('\n').find(line=>line.startsWith('  const oauthSchemes56='));
 assert.ok(registrar&&oauth);
 const capture=String.raw`
  let rawHandler;
  function captureStatus(registerOAuthTool){
 `+status+String.raw`
  }
  captureStatus((name,config,handler)=>{if(name==='life_status')rawHandler=handler;});
 `;
 const expose=String.raw`
  return {rawHandler,state:()=>({devices,secureStates56,jobs,jhMcpWorkflows56,
   jhCommandVersions56,jhBlockedCommands56,queues,recentJobs,nonceMap,grants,seq,
   activeDeviceId,jhWorkflowTtl56,jhWorkflowRuntimeDigest56})};
 `;
 const names=Object.keys(globals);
 const runtime=vm.compileFunction(functions+'\n'+modes+'\n'+capture+'\n'+oauth+'\n'+registrar+'\n'+status+expose,
  names,{filename:'actual-generated-mobile13-status-synthetic-state.mjs'})(...Object.values(globals));
 const registration=registrations.get('life_status');assert.ok(registration);
 assert.deepEqual(Object.keys(registration.config.inputSchema),['command_id'],
  'only the existing command wrapper schema; no new device/lookup/token inputs');
 assert.deepEqual(registration.config.securitySchemes,[{type:'oauth2',scopes:['synthetic-oauth-scope']}]);
 const parse=reply=>JSON.parse(reply.content[0].text);
 return {calls,learningEvents,v2,focus,session,pending,
  snapshot:()=>snapshot({runtime:runtime.state(),lastVerifiedPoll:v2.lastVerifiedPoll,
   lastResult:v2.lastResult,lastRecoveryEvent:v2.lastRecoveryEvent,
   lastRecoveryEventKey:v2.lastRecoveryEventKey}),
  raw:async()=>parse(await runtime.rawHandler()),
  wrapped:async(commandId=OLD_COMMAND)=>parse(await registration.handler(
   z.object(registration.config.inputSchema).parse({command_id:commandId}),{requestId:'synthetic-status-request'})),
  advance:milliseconds=>{nowMs+=milliseconds;}
 };
}

test('actual generated status reads do not invoke authority, jobs, cleanup or journal; original wrappers remain active',async()=>{
 const {after}=await sources();
 for(const options of [
  {},{expired:true},{untrusted:true},{noDevice:true},{focusEnabled:false}
 ]){
  const h=statusHarness(after,options),before=h.snapshot();
  const first=await h.raw();h.advance(1);const second=await h.raw();
  assert.equal(h.snapshot(),before,'raw callback preserves retained state: '+JSON.stringify(options));
  assert.equal(h.learningEvents.length,0,'direct callback does not run the external learning observer');
  assert.equal(h.v2.activeMcpCalls,0);assert.equal(h.v2.lastMcpAt,0);
  for(const result of [first,second]){
   assert.equal(result.browser,'not_applicable_mobile_right');
   assert.deepEqual(result.mobileRightStatus56,{signedPollVerified:false,uiVerified:false,
    phoneActionVerified:false,automaticReplay:false,cloudBrowserProbed:false,
    signedPollVerification:'NOT_REVALIDATED_READ_ONLY'});
   assertAdvisory(result.commandDiagnostics);assertRedacted(result.commandDiagnostics);
   if(options.expired||options.untrusted||options.noDevice){
    assert.equal(result.commandDiagnostics.state,'unknown');
    assert.equal(result.commandDiagnostics.transientJobs.pending,null);
    assert.equal(result.commandDiagnostics.workflows.unfinished,null);
   }else{
    assert.deepEqual(result.commandDiagnostics.transientJobs,{state:'observed',pending:0,inflight:1});
    assert.deepEqual(result.commandDiagnostics.workflows,{state:'observed',unfinished:1});
    assert.equal(result.commandDiagnostics.lastVerifiedPoll.bound,true);
    assert.equal(result.commandDiagnostics.lastVerifiedPoll.fresh,true);
    assert.equal(result.commandDiagnostics.focus.state,options.focusEnabled===false?'unknown':'observed');
   }
  }
  const wrapped=await h.wrapped();
  assert.equal(h.snapshot(),before,'existing wrappers do not mutate observed command/effect state');
  assert.equal(h.learningEvents.length,1,'original learning observation remains installed');
  assert.equal(h.learningEvents[0].name,'life_status');
  assert.equal(wrapped.operationalLearning.events,1);
  assert.equal(h.v2.activeMcpCalls,0,'existing MCP in-flight accounting balances');
  assert.equal(h.v2.lastMcpAt,NOW+1,'existing MCP observation timestamp remains enabled');
  assert.deepEqual(h.calls,[],
   'diagnostics never call mutating session, BEGIN, mk, cleanup, mayBegin or journal helpers');
  assert.equal(h.focus.release({device:DEVICE,commandId:COMMAND}),true,
   'expired focus read did not delete the retained original lease');
  assert.equal(h.session.secret.equals(Buffer.alloc(32,91)),true);
  assert.equal(h.pending.secret.equals(Buffer.alloc(32,92)),true);
  assertAdvisory(wrapped.commandDiagnostics);
 }
});
