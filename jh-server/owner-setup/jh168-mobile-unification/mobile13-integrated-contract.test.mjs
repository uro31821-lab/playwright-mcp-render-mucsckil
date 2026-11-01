/**
 * Actual generated Stage25 aliases -> original command/mk/split/capture helpers
 * -> real durable host SQLite and original result-verification duplicate guard.
 *
 * Only the device transport and frame arrival are synthetic. No listener,
 * owner enrollment, phone grant, pixels, APK or network are involved. Accepted
 * completions below are fixture inputs; HTTP MAC acceptance/Android execution
 * are covered by their original suites and are NOT claimed by this test.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac,randomBytes} from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';
import {mkdtempSync,chmodSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';
import {z} from 'zod';
import {createDurableNativeHooks} from '../deployment/durable-native-host.mjs';
import {inspectSplitEvidence} from '../deployment/split-screen-evidence.mjs';
import {gateRecoveredDispatch} from '../deployment/jh-recovery-write-fence.mjs';
import {createJHResultVerificationGuard,runProtectedJHAction,EffectKind,EvidenceSource,createEvidence,stableStringify}
 from '../deployment/jh-result-verification/index.mjs';
import {createSplitReadReceiptRegistry56} from './split-read-receipts.mjs';
import {createSplitFollowupReceiptRegistry56} from './split-followup-receipts.mjs';
import {auditMobile13BrowserRetirement56} from './mobile13-browser-retirement.mjs';

const ROOT=path.resolve(import.meta.dirname,'..');
const MODE='EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1';
const ACK='EXPLICIT_IDENTICAL_SIGNED_RESULT_V1';
const REPORT='JH_MOBILE13_INTEGRATED_CONTRACT ';
const DEVICE='synthetic-mobile13-device';
const COMMAND='a'.repeat(32),CONTEXT='ssc_'+'b'.repeat(32);
const ITEM='item_'+'c'.repeat(16),REQUEST='d'.repeat(32),GRANT='ipg_'+'e'.repeat(32);
const sha=value=>createHash('sha256').update(value).digest('hex');
const clone=value=>JSON.parse(JSON.stringify(value));
const body=reply=>JSON.parse(reply.content[0].text);

function between(source,start,end){
 assert.equal(source.split(start).length,2,'unique generated start: '+start);
 const at=source.indexOf(start),stop=source.indexOf(end,at+start.length);
 assert.ok(stop>at,'generated end: '+end);
 return source.slice(at,stop);
}
function declaration(source,name){
 const re=new RegExp('^([ \\t]*)(?:export )?(?:async )?function '+name+'\\(','gm');
 const matches=[...source.matchAll(re)];
 assert.equal(matches.length,1,'original generated function '+name);
 const start=matches[0].index,indent=matches[0][1];
 const lineEnd=source.indexOf('\n',start),first=source.slice(start,lineEnd);
 if(first.trimEnd().endsWith('}'))return first.replace(/^export /,'');
 const tail=source.slice(lineEnd+1),end=new RegExp('^'+indent+'\\}\\r?$','m').exec(tail);
 assert.ok(end,'end of original generated function '+name);
 return source.slice(start,lineEnd+1+end.index+end[0].length).replace(/^export /,'');
}
function proof(at=Date.now()){
 return {kind:'split_screen_evidence',version:'1',verified:'true',layout:'LEFT_RIGHT',
  chatPackage:'com.openai.chatgpt',chatKind:'NATIVE',chatWindowId:'12',chatBounds:'0,0,500,1200',
  workPackage:'com.android.chrome',workWindowId:'23',workBounds:'500,0,1000,1200',
  chatDisplayId:'7',workDisplayId:'7',displayId:'7',displayVerified:'true',observedAtMs:String(at)};
}
function statusResult(label='READY'){
 const now=Date.now();
 return {ok:true,code:'ready',state:'ACTIVE',contextId:CONTEXT,statusReadbackVersion:1,
  automaticReplay:false,manualStepPending:false,resultVerified:false,externalEffectVerified:false,
  packageName:'com.android.chrome',windowId:23,displayId:7,capturedAt:now,
  layout:{arrangement:'LEFT_RIGHT',chatPackage:'com.openai.chatgpt',chatWindowId:12,chatDisplayId:7,
   workPackage:'com.android.chrome',workWindowId:23,workDisplayId:7},
  items:[{itemRef:ITEM,label}],splitScreenRequired:true,splitScreen:proof(now)};
}
function actionResult(job){
 return {ok:true,code:'action_verified',contextId:CONTEXT,action:job.action,
  resultVerified:true,externalEffectVerified:false,automaticReplay:false,
  splitScreenRequired:true,splitScreen:proof()};
}

function setup(source,options={}){
 const dir=mkdtempSync(path.join(tmpdir(),'jh-mobile13-contract-'));chmodSync(dir,0o700);
 const captures=[],admissions=[],completions=[],registrations=new Map();
 let host=null,installOptions=null;
 const factoryImports={
  z,URL,Buffer,createHash,createHmac,randomBytes,JhAsyncLocalStorage56:AsyncLocalStorage,
  createJHResultVerificationGuard,runProtectedJHAction,EffectKind,EvidenceSource,createEvidence,
  createSplitReadReceiptRegistry56,createSplitFollowupReceiptRegistry56,
  jhInspectSplitEvidence155:inspectSplitEvidence,jhGateRecoveredDispatch155:gateRecoveredDispatch,registrations,
  process:{env:{JH_WORKFLOW_STATE_DIR:path.join(dir,'verification'),JH_OPERATIONAL_ACCOUNT_DIGEST:'5'.repeat(64)}},
  createDurableNativeHooks:settings=>{
   installOptions={...settings};
   const original=createDurableNativeHooks(settings);
   host=Object.freeze({...original,capture(job,payload){
    captures.push({job,payload:clone(payload)});
    original.capture(job,payload);
   }});
   return host;
  },
  syntheticWait:async job=>{
   // This seam replaces only transport arrival, never policy or dispatch.
   if(job.status!=='queued')return job;
   const admission=host.beforeDispatch(job);
   admissions.push({jobId:job.id,type:job.type,action:job.action,...admission});
   if(!admission.allowed){
    job.status='error';job.error=admission.code;job.completedAt=new Date().toISOString();
    return job;
   }
   job.status='in_progress';
   if(options.pendingAction&&job.type==='split_screen_session_followup')return job;
   let result;
   if(options.result)result=await options.result(job,captures);
   if(result===undefined){
    if(job.type==='split_screen_session_input_preflight')result={
     ok:true,contextId:CONTEXT,inputAllowed:options.inputAllowed!==false,
     ...(options.inputAllowed===false?{}:{inputGrantToken:options.grant||GRANT}),
     code:options.inputAllowed===false?'input_not_allowed':'input_preflight_ready',
     splitScreenRequired:true,splitScreen:proof()};
    else if(job.type==='split_screen_session_followup')result=actionResult(job);
    else if(job.type==='computer_use_capture_frame')result={ok:false,code:'synthetic_no_pixels'};
    else if(job.type==='agent_snapshot'){
     const p=proof();result={ok:true,splitScreenRequired:true,splitScreen:p,
      url:JSON.stringify([p,{package:'com.android.chrome',windowId:'23',text:'READY'}])};
    }
    else result=statusResult();
   }
   // Caller premise: a fixture models a completion that already passed the
   // unchanged HTTP authentication gate. It cannot grant phone approval.
   const accepted=host.acceptedCompletion(job,result);
   completions.push({jobId:job.id,...accepted});
   assert.equal(accepted.allowed,true,'real durable completion receipt');
   job.result=result;job.status='complete';job.completedAt=new Date().toISOString();
   return job;
  }
 };
 const declarations=[
  'sha56','hmac56','token56','validHex56','stable56','payloadDigest56','signJob56','safeJobView56',
  'computerPayload56','exactEnvelope56','cleanupJobs','cacheGet','cacheSet','recentDevices',
  'chooseDevice','mk','textResult','jhRequireCommand56','jhCommandTool56',
  'jhPaymentError','jhPaymentAssertBinding','jhOwnerAdmission155',
  'jhCommandVersion56','jhResultVerificationGuard56','jhResultVerificationSummary56',
  'jhSplitScreenJob56','jhSplitScreenOnce155','jhSplitScreenLocalOnlyValue56',
  'jhSplitScreenPayloadHasLocalOnly56','jhSplitScreenContextId56',
  'cleanFrameWaiters56','createFrameWaiter56','installDurableNativeCircuit56'
 ].map(name=>declaration(source,name)).join('\n');
 const aliases=between(source,'  // JH168: all nine historical web commands',
  '  registerOAuthTool("life_android_devices",{');
 const capture=between(source,'  const cuSchema56={',
  '  registerOAuthTool("life_android_screen_understand",{');
 const paymentBinding=between(source,'const jhPaymentLifecycle={','const jhGetPaymentService=');
 const runtimeConstants=['JOB_TTL_MS','COMPLETED_JOB_RETENTION_MS','DEDUPE_MS',
  'SECURE56_JOB_MS','SECURE56_FRAME_MS'].map(name=>{
   const matches=[...source.matchAll(new RegExp('^const '+name+'=[^\\n]+;','gm'))];
   assert.equal(matches.length,1,'original time budget '+name);return matches[0][0];
  }).join('\n');
 const state=String.raw`
  const jobs=new Map(),devices=new Map(),queues=new Map(),recentJobs=new Map(),secureStates56=new Map();
  const frameWaiters56=new Map(),jhCommandVersions56=new Map(),jhBlockedCommands56=new Set(),jhMcpWorkflows56=new Map();
  const jhCommandContext56=new JhAsyncLocalStorage56(),httpServer={listening:false};
  const jhSplitReadReceipts56=createSplitReadReceiptRegistry56();
  const jhSplitFollowupReceipts56=createSplitFollowupReceiptRegistry56();
  const jhWorkflowRuntimeDigest56='synthetic-mobile13-runtime-binding';
  let activeDeviceId=null,seq=0,durableNativeHooks56=null,jhResultVerificationGuardV1Promise=null;
  const active56=id=>secureStates56.get(id)?.active||null;
  // Connection V2 boot/admission and signed completion transport are the
  // explicitly synthetic boundary; never start its background network probes.
  const jhV2Install56=()=>{};
  const jhV2JobAdmission56=()=>{};
  const jhLearningObserveJob56=()=>{};
  const waitJob=syntheticWait;
  const awaitFrame56=async waiter=>{frameWaiters56.delete(waiter.lease);return null;};
  const jhRightWebOpen56=()=>{throw Error("UNEXPECTED_URL_EFFECT_IN_CONTRACT_FIXTURE");};
  function registerOAuthTool(name,config,handler){
   const wrapped=jhCommandTool56(name,config,handler);
   registrations.set(name,wrapped);
  }
 `;
 const expose=String.raw`
  return {
   jobs,devices,queues,secureStates56,jhCommandVersions56,jhBlockedCommands56,
   install:installDurableNativeCircuit56,
   rawSplit:(type,payload,effect,tool)=>jhCommandContext56.run({
     device:chooseDevice(),commandId:jhCommandVersion56(chooseDevice()),
     version:jhCommandVersion56(chooseDevice()),used:false
    },()=>jhSplitScreenJob56(type,payload,effect,tool)),
   envelope:computerPayload56,
   selectDevice:id=>{activeDeviceId=id;}
  };
 `;
 // compileFunction without a foreign parsingContext keeps native objects in
 // the same JS realm as the original durable journal's canonical serializer.
 const names=Object.keys(factoryImports);
 let runtime;
 try{
  runtime=vm.compileFunction(state+runtimeConstants+'\n'+declarations+'\n'+paymentBinding+'\n'+aliases+'\n'+capture+'\n'+expose,names,
   {filename:'synthetic-original-stage25-mobile13-contract.mjs'})(...Object.values(factoryImports));
  runtime.install({file:path.join(dir,'circuit.sqlite'),key:Buffer.alloc(32,79),
   namespace:'8'.repeat(64),mode:'EXPLICIT_ONE_TIME'});
  assert.equal(installOptions.mobile13ActionMode,MODE,'actual generated install selects the exact policy');
  const session={sessionId:'synthetic-session-mobile13',secret:Buffer.alloc(32,83),
   deviceDigest:'1'.repeat(64),expiresAt:Date.now()+600000,
   trustId:'synthetic-mobile13-trust',ownerDigest:'5'.repeat(64)};
  runtime.devices.set(DEVICE,{secureBridgeVersion:56,deviceDigest:session.deviceDigest,lastSeen:Date.now(),
   processEpoch:'synthetic-mobile13-process'});
  runtime.secureStates56.set(DEVICE,{active:session});runtime.selectDevice(DEVICE);
  runtime.jhCommandVersions56.set(sha('discard-device|'+DEVICE),COMMAND);
  return {runtime,captures,admissions,completions,registrations,host,dir,
   call:async(name,args={},raw=false)=>{
    const registration=registrations.get('life_web_'+name);assert.ok(registration,name);
    const input={command_id:COMMAND,...args};
    const parsed=raw?input:z.object(registration.config.inputSchema).parse(input);
    return body(await registration.handler(parsed));
   },
   close(){host?.close();session.secret.fill(0);rmSync(dir,{recursive:true,force:true});}
  };
 }catch(error){host?.close();rmSync(dir,{recursive:true,force:true});throw error;}
}

async function runFixture(){
 assert.equal(process.env.CI,'true');assert.equal(process.env.NODE_ENV,'test');
 assert.equal(process.env.JH_OWNER_DEFER_LISTEN,'1');
 assert.equal(process.env.JH_MOBILE_WEB_13_MODE,MODE);
 assert.deepEqual(Object.keys(process.env).sort(),['PATH','CI','NODE_ENV','JH_OWNER_DEFER_LISTEN',
  'JH_MOBILE_WEB_13_MODE','JH_STAGE26_SIGNED_COMPLETION_ACK'].sort());
 let networkCalls=0;globalThis.fetch=async()=>{networkCalls++;throw Error('SYNTHETIC_NETWORK_FORBIDDEN');};
 const {buildStage25PendingOperatorEntrypoint56}=await import('./stage25-live-operator-followup-entry.mjs');
 const built=await buildStage25PendingOperatorEntrypoint56(ROOT,process.env);
 assert.equal(built.listenerStarted,false);assert.equal(built.productionEnabled,false);
 const source=readFileSync(built.runtimeFile,'utf8');
 assert.equal(sha(source),built.stamp.runtimeSha256);
 const cases=[];
 async function check(name,fn,options={}){
  const f=setup(source,options);
  try{await fn(f);cases.push(name);}finally{f.close();}
 }
 const typeArgs={context_id:CONTEXT,target_item_ref:ITEM,request_id:REQUEST,text:'NEUTRAL_INPUT_SENTINEL'};
 await check('actual mobile catalog retains required scope arguments',async f=>{
  for(const name of ['click','type','select','back']){
   const schema=z.object(f.registrations.get('life_web_'+name).config.inputSchema);
   assert.equal(schema.safeParse({command_id:COMMAND}).success,false,name);
  }
  await assert.rejects(f.call('select',{context_id:CONTEXT,target_item_ref:ITEM,request_id:REQUEST}));
  assert.equal(f.captures.length,0,'schema rejection precedes signed job creation');
 });
 await check('SET_TEXT uses original preflight, original signed mk and real journal',async f=>{
  const r=await f.call('type',typeArgs);
  assert.equal(r.action,'SET_TEXT',JSON.stringify({reply:r,admissions:f.admissions}));assert.equal(r.automaticReplay,false);
  assert.deepEqual(f.captures.map(v=>v.job.type),['split_screen_session_input_preflight','agent_snapshot','split_screen_session_followup']);
  assert.ok(f.admissions.every(v=>v.allowed));
  const preflight=f.captures[0],write=f.captures[2];
  assert.equal(preflight.payload.value,undefined);assert.equal(preflight.payload.requestId,undefined);
  assert.equal(write.payload.inputGrantToken,GRANT);assert.equal(write.payload.value,typeArgs.text);
  assert.equal(write.payload.commandId,COMMAND);assert.equal(write.payload.requestId,REQUEST);
  assert.equal(write.payload.mcpToolName,'life_android_execute_computer_action');
  assert.equal(write.payload.secureRequestedEffect,'REVERSIBLE_WRITE');
  for(const {job,payload} of f.captures){
   assert.equal(job.securePayloadDigest,sha(stableStringify(payload,{ignoreVolatileKeys:false})));
   const expected=createHmac('sha256',Buffer.alloc(32,83)).update(
    [job.secureSessionId,job.id,job.type,job.secureNonce,job.secureExpiresAt,job.securePayloadDigest].join('|')).digest('hex');
   assert.equal(job.secureMac,expected);
  }
  assert.equal(f.host.uncertainEffectsForMaintenance(),0);
  for(const file of readdirSync(f.dir).filter(v=>v.startsWith('circuit.sqlite'))){
   const bytes=readFileSync(path.join(f.dir,file));
   for(const privateValue of [typeArgs.text,GRANT,write.payload.command])
    assert.equal(bytes.includes(Buffer.from(privateValue)),false,'journal stores no raw value/grant/command');
  }
 });
 await check('denied original preflight creates no SET_TEXT or substitute route',async f=>{
  const r=await f.call('type',typeArgs);
  assert.equal(r.code,'input_not_allowed');
  assert.deepEqual(f.captures.map(v=>v.job.type),['split_screen_session_input_preflight']);
 },{inputAllowed:false});
 await check('unknown SET_TEXT cannot be bypassed with changed request, value or grant',async f=>{
  const first=await f.call('type',typeArgs);
  assert.equal(first.resultVerified,false);
  assert.equal(f.host.uncertainEffectsForMaintenance(),1);
  const second=await f.call('type',{...typeArgs,request_id:'f'.repeat(32),text:'DIFFERENT_NEUTRAL_INPUT'});
  assert.equal(second.code,'DURABLE_PREVIOUS_OUTCOME_UNKNOWN');
  const grants=f.captures.filter(v=>v.job.type==='split_screen_session_followup').map(v=>v.payload.inputGrantToken);
  assert.equal(new Set(grants).size,2,'a fresh original input token cannot bypass the unknown effect');
  assert.equal(f.admissions.filter(v=>v.type==='split_screen_session_followup'&&v.allowed).length,1);
  assert.equal(f.host.uncertainEffectsForMaintenance(),1);
 },{pendingAction:true,result:(job,captures)=>{
  if(job.type==='split_screen_session_input_preflight')return {
   ok:true,contextId:CONTEXT,inputAllowed:true,
   inputGrantToken:'ipg_'+captures.filter(v=>v.job.type===job.type).length.toString(16).padStart(32,'0'),
   code:'input_preflight_ready',splitScreenRequired:true,splitScreen:proof()};
 }});
 await check('malformed input grant is denied by actual host admission',async f=>{
  const r=await f.call('type',typeArgs);
  assert.equal(r.code,'DURABLE_EXACT_MOBILE13_ACTION_SCOPE_REQUIRED');
  assert.equal(f.admissions.filter(v=>v.type==='split_screen_session_followup'&&v.allowed).length,0);
 },{grant:'not-a-phone-input-grant'});
 await check('real owner binding rejects an unbound owner before effect dispatch',async f=>{
  f.runtime.secureStates56.get(DEVICE).active.ownerDigest='0'.repeat(64);
  const r=await f.call('type',typeArgs);
  assert.equal(r.code,'OWNER_ADMISSION_BLOCKED');
  assert.equal(f.captures.some(v=>v.job.type==='split_screen_session_followup'),false);
 });
 await check('real owner admission rejects stale pair evidence before effect dispatch',async f=>{
  const r=await f.call('type',typeArgs);
  assert.equal(r.code,'OWNER_ADMISSION_BLOCKED');
  assert.deepEqual(f.captures.map(v=>v.job.type),['split_screen_session_input_preflight','agent_snapshot']);
 },{result:job=>{
  if(job.type==='agent_snapshot'){
   const p=proof(Date.now()-45001);
   return {ok:true,splitScreenRequired:true,splitScreen:p,
    url:JSON.stringify([p,{package:'com.android.chrome',windowId:'23',text:'READY'}])};
  }
 }});
 for(const name of ['back','press_key']){
  await check(name+' uses one exact journaled BACK and keeps unknown result fenced',async f=>{
   const args={context_id:CONTEXT,request_id:REQUEST,...(name==='press_key'?{key:'BACK'}:{})};
   const r=await f.call(name,args);assert.equal(r.resultVerified,false);
   const again=await f.call(name,args);assert.equal(again.resultVerified,false);
   assert.equal(f.admissions.filter(v=>v.type==='split_screen_session_followup'&&v.allowed).length,1);
   const p=f.captures.find(v=>v.job.type==='split_screen_session_followup').payload;
   assert.equal(p.action,'BACK');assert.equal(p.targetItemRef,'');
   assert.equal('inputGrantToken' in p,false);assert.equal('value' in p,false);
   assert.equal(f.host.uncertainEffectsForMaintenance(),1);
  },{pendingAction:true});
 }
 await check('original command mismatch and local-only input stop before any job',async f=>{
  const r=await f.call('type',{...typeArgs,command_id:'0'.repeat(32)});
  assert.equal(r.code,'new_command_binding_required_or_discarded');
  const secret=await f.call('type',{...typeArgs,text:'OTP: 123456'});
  assert.equal(secret.code,'MOBILE_LOCAL_INPUT_REQUIRED');
  assert.equal(f.captures.length,0);
 });
 await check('screenshot reaches original capture envelope with immutable SCREENSHOT action and scopes',async f=>{
  const args={device_id:DEVICE,task_digest:'2'.repeat(64),run_digest:'3'.repeat(64),
   screen_grant_token:'synthetic-screen-grant',screen_consent_digest:'4'.repeat(64),
   lease_token:'synthetic-one-shot-lease',action:'CLICK'};
  const before=clone(args);
  const r=await f.call('screenshot',args,true);
  assert.equal(r.code,'secure_frame_missing','transport fixture never produces real pixels');
  assert.deepEqual(args,before);
  assert.equal(f.captures.length,1);assert.equal(f.admissions[0].allowed,true);
  const {job,payload}=f.captures[0];
  assert.equal(job.type,'computer_use_capture_frame');
  assert.equal(payload.action,'SCREENSHOT','original Android parseAction SCREENSHOT input contract');
  assert.equal(payload.taskDigest,args.task_digest);assert.equal(payload.runDigest,args.run_digest);
  assert.equal(payload.screenGrantToken,args.screen_grant_token);
  assert.equal(payload.screenConsentDigest,args.screen_consent_digest);
  assert.equal(payload.leaseToken,args.lease_token);
  assert.equal(payload.secureRequestedEffect,'READ_ONLY');
  assert.ok(payload.frameUploadLease);
  assert.equal(f.host.uncertainEffectsForMaintenance(),0);
 });
 await check('capture scope/consent rejection creates no capture job',async f=>{
  assert.equal((await f.call('screenshot',{},true)).code,'MOBILE_CAPTURE_REQUIRES_PHONE_CONSENT');
  assert.equal((await f.call('screenshot',{task_digest:'bad',run_digest:'3'.repeat(64),
   screen_grant_token:'synthetic',screen_consent_digest:'4'.repeat(64),lease_token:'synthetic'},true)).code,'capture_scope_invalid');
  assert.equal(f.captures.length,0);
 });
 await check('WAIT accepts only this STATUS fresh context readout without action success',async f=>{
  const r=await f.call('wait',{context_id:CONTEXT,expected_text:'READY',time:2});
  assert.equal(r.code,'MOBILE_WAIT_CONDITION_CONFIRMED');assert.equal(r.conditionVerified,true);
  assert.equal(r.automaticReplay,false);
  assert.deepEqual(f.captures.map(v=>v.job.type),['split_screen_session_status']);
  assert.equal(f.captures[0].job.result.resultVerified,false);
  assert.equal(f.captures[0].payload.contextId,CONTEXT);
  assert.equal(f.captures[0].payload.secureRequestedEffect,'READ_ONLY');
 });
 for(const [name,mutate] of [
  ['old installed producer',o=>{delete o.statusReadbackVersion;}],
  ['old cached items',o=>{o.capturedAt=Date.now()-10000;}],
  ['different context',o=>{o.contextId='ssc_'+'0'.repeat(32);}],
  ['unknown OS display',o=>{o.displayId=null;o.splitScreen.displayId='unknown';o.splitScreen.displayVerified='false';}],
  ['different right window',o=>{o.windowId=99;}],
  ['unmet text with forged success flags',o=>{o.items[0].label='NOT READY';o.resultVerified=true;o.scopeVerified=true;o.success_verified=true;}]
 ]){
  await check('WAIT rejects '+name+' through original helper',async f=>{
   const r=await f.call('wait',{context_id:CONTEXT,expected_text:'READY'});
   assert.equal(r.conditionVerified,false);assert.equal(r.automaticReplay,false);
   assert.deepEqual(f.captures.map(v=>v.job.type),['split_screen_session_status']);
  },{result:job=>{if(job.type==='split_screen_session_status'){const o=statusResult();mutate(o);return o;}}});
 }
 // The old split helper has a read-only scope fallback. It must never supply
 // missing original text provenance or turn an old STATUS into confirmed WAIT.
 await check('fallback pair proof cannot replace the original STATUS text readout',async f=>{
  const r=await f.call('wait',{context_id:CONTEXT,expected_text:'READY'});
  assert.equal(r.conditionVerified,false);assert.equal(r.automaticReplay,false);
  assert.deepEqual(f.captures.map(v=>v.job.type),['split_screen_session_status','agent_snapshot']);
 },{result:job=>{
  if(job.type==='split_screen_session_status'){const o=statusResult();delete o.splitScreen;delete o.splitScreenRequired;return o;}
 }});
 const browserFiles={};
 for(const name of ['browser-session.mjs','browser-session-runtime.mjs','browser-transport.mjs','browser-events.mjs'])
  browserFiles[name]=readFileSync(path.resolve(ROOT,'..',name),'utf8');
 const retirement=auditMobile13BrowserRetirement56({runtimeSource:source,browserFiles,
  connectionV2Source:readFileSync(path.join(ROOT,'deployment/jh167-connection-v2-runtime.mjs'),'utf8')});
 assert.equal(retirement.migratedToolCount,13);
 assert.equal(retirement.cloudTools.length,0);
 assert.equal(retirement.readyForRemoval,false);assert.equal(retirement.deletionAuthorized,false);
 assert.ok(retirement.blockers.some(x=>x.startsWith('LEGACY_GLOBAL:')));
 assert.ok(retirement.blockers.some(x=>x.startsWith('CONNECTION_V2:')));
 cases.push('actual generated runtime retains explicit G19 retirement blockers');
 assert.equal(networkCalls,0);
 console.log(REPORT+JSON.stringify({schema:'JH_MOBILE13_INTEGRATED_CONTRACT_V1',
  generatedRuntimeSha256:built.stamp.runtimeSha256,cases,casesPassed:cases.length,
  realGeneratedHelpers:true,realDurableHost:true,realDuplicateGuard:true,realOwnerAdmission:true,
  syntheticDeviceTransport:true,authenticatedHttpCompletionTested:false,
  networkCalls,phoneActions:0,pixelsCaptured:0,phoneE2E:'NOT_RUN',displayProofE2E:'NOT_RUN'}));
}

if(process.argv[2]==='--synthetic-child'){
 await runFixture();
}else{
 test('actual generated mobile aliases cross original helpers and real durable policy fences',{timeout:60000},()=>{
  const child=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'--synthetic-child'],{
   cwd:path.resolve(ROOT,'../..'),encoding:'utf8',timeout:45000,maxBuffer:4*1024*1024,
   env:{PATH:process.env.PATH||'',CI:'true',NODE_ENV:'test',JH_OWNER_DEFER_LISTEN:'1',
    JH_MOBILE_WEB_13_MODE:MODE,JH_STAGE26_SIGNED_COMPLETION_ACK:ACK}
  });
  assert.equal(child.error,undefined,child.error?.message);
  assert.equal(child.signal,null);
  assert.equal(child.status,0,child.stderr+'\n'+child.stdout);
  const lines=child.stdout.split('\n').filter(line=>line.startsWith(REPORT));
  assert.equal(lines.length,1,'one complete integration proof');
  const report=JSON.parse(lines[0].slice(REPORT.length));
  assert.equal(report.casesPassed,21);assert.equal(report.networkCalls,0);
  assert.equal(report.phoneActions,0);assert.equal(report.phoneE2E,'NOT_RUN');
  console.log(lines[0]);
 });
}
