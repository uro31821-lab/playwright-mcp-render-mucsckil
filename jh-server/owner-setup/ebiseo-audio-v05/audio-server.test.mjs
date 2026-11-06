/* Copyright 2026 JH Equalizer contributors. SPDX-License-Identifier: Apache-2.0 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,mkdtempSync,chmodSync,rmSync,cpSync,existsSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';
import {AUDIO_ROUTES,AUDIO_ROUTE_CONTRACT,AUDIO_CONTRACT_SHA256,LEGACY_CATALOG_PIN,
  normalizeAudioCommand,isReadCommand,makeAudioSchemas,makeReleaseGuard,PRESETS} from './audio-contract.mjs';
import {createPinnedAudioReleaseAuthority,audioExtensionEnvelope,exactAudioExtension} from './audio-release-authority.mjs';
import {AUDIO_EXTENSION_DIGEST,AUDIO_EXTENSION_VERSION,AUDIO_PROTOCOL} from './audio-extension-catalog.mjs';
import {createAudioCapabilityAuthority,AUDIO_CAPABILITY_TTL_MS} from './audio-capability-authority.mjs';
import {createAudioHostIntegration} from './audio-host-integration.mjs';
import {createAudioDurableClassifier} from './audio-durable-policy.mjs';
import {composePinnedAudioHost,buildAudioCandidateRuntime,buildAudioReleaseCandidate,SOURCE_PINS} from './audio-compose-host.mjs';

const require=createRequire(import.meta.url),{z}=require(process.env.EBISEO_TEST_ZOD||'zod');
const reference=process.env.EBISEO_TEST_SERVER_RUNTIME;
assert.ok(reference,'EBISEO_TEST_SERVER_RUNTIME must identify the actual pinned generated host; no skipped integration tests');
const ownerRoot=resolve(dirname(reference),'..');
const runtimeSource=readFileSync(reference,'utf8');
const durableHostSource=readFileSync(join(ownerRoot,'deployment/durable-native-host.mjs'),'utf8');
const composed=composePinnedAudioHost({runtimeSource,durableHostSource});
const sha=x=>createHash('sha256').update(x).digest('hex');
const hmac=(key,x)=>createHmac('sha256',key).update(x).digest('hex');
const task='2'.repeat(64),commandId='3'.repeat(32),deviceDigest='4'.repeat(64);
const ports=()=>({releaseAuthority:createPinnedAudioReleaseAuthority(),getCatalogDigest:()=>LEGACY_CATALOG_PIN});
const body=r=>JSON.parse(r.content[0].text);
const capability=()=>({...audioExtensionEnvelope(),protocol:AUDIO_PROTOCOL});
const statusResult=()=>({ok:true,secureActive:true,deviceResponded:true,phoneCapabilities:{EBISEO_AUDIO_EXTENSION:capability()}});
const piece=(source,start,end)=>{
  assert.equal(source.split(start).length,2,start);assert.equal(source.split(end).length,2,end);
  const i=source.indexOf(start),j=source.indexOf(end,i);assert.ok(j>i);return source.slice(i,j);
};
function payload(command={action:'enabled',enabled:true}) {
  const route=AUDIO_ROUTES[['query_track','query_status'].includes(command.action)?0:1];
  return {audio:{schemaVersion:1,command},audioExtension:audioExtensionEnvelope(),taskId:task,
    effect:'READ_ONLY',action:'',index:0,viewportWidth:0,viewportHeight:0,scrollX:0,scrollY:0,
    waitMs:0,dataClass:'NONE',maxActionsInCall:20,mcpToolName:route.tool,taskDigest:task,
    targetDeviceDigest:deviceDigest,secureRequestedEffect:route.effect,secureInvocationExpiresAt:Date.now()+45000,
    containsCredential:false,commandId};
}
const jobFor=p=>({...p,type:p.secureRequestedEffect==='READ_ONLY'?'ebiseo_audio_status':'ebiseo_audio_command'});
test('pinned authority requires unchanged base and a distinct verified extension',()=>{
  assert.throws(()=>makeReleaseGuard({getCatalogDigest:()=>LEGACY_CATALOG_PIN,releaseAuthority:{requireAudioRoutes:()=>({})}}),{code:'AUDIO_RELEASE_AUTHORITY_REQUIRED'});
  const good=ports();assert.equal(makeReleaseGuard(good)().extensionDigest,AUDIO_EXTENSION_DIGEST);
  assert.equal(AUDIO_EXTENSION_VERSION,2);assert.equal(AUDIO_ROUTE_CONTRACT.version,2);
  const contract=JSON.parse(readFileSync(join(import.meta.dirname,'../catalog/audio-command-contract.json'),'utf8'));
  assert.deepEqual(AUDIO_ROUTE_CONTRACT,contract);
  assert.equal(AUDIO_CONTRACT_SHA256,sha(JSON.stringify(contract)));
  assert.match(makeReleaseGuard(good)().releaseId,/^ebiseo-audio-extension-2-/);
  assert.throws(()=>makeReleaseGuard({...good,getCatalogDigest:()=>AUDIO_EXTENSION_DIGEST})(),{code:'AUDIO_BASE_CATALOG_MISMATCH'});
  assert.equal(exactAudioExtension({...audioExtensionEnvelope(),approved:true}),false);
  assert.equal(exactAudioExtension({...audioExtensionEnvelope(),version:1}),false);
});
test('start and stop accept only action and retain the existing audio mutation route',()=>{
  const schema=z.object(makeAudioSchemas(z).command).strict();
  for(const action of ['start','stop']){
    const normalized=normalizeAudioCommand({action});
    assert.deepEqual(normalized,{action});assert.equal(Object.isFrozen(normalized),true);
    assert.equal(isReadCommand(normalized),false);
    assert.equal(schema.safeParse({task_digest:task,command:{action}}).success,true);
    for(const field of ['target','enabled','preset','scope','environment','launch','audioSessionId']){
      const command={action,[field]:field==='enabled'?true:'forbidden'};
      assert.throws(()=>normalizeAudioCommand(command),{code:'AUDIO_UNEXPECTED_FIELD'});
      assert.equal(schema.safeParse({task_digest:task,command}).success,false);
    }
  }
  assert.deepEqual(AUDIO_ROUTES,[
    {tool:'life_android_audio_status',jobType:'ebiseo_audio_status',effect:'READ_ONLY'},
    {tool:'life_android_audio_command',jobType:'ebiseo_audio_command',effect:'WRITE_REVERSIBLE'}
  ]);
});
test('composition rejects source drift and preserves original HMAC and startup gates',()=>{
  assert.throws(()=>composePinnedAudioHost({runtimeSource:runtimeSource+'\n',durableHostSource}),{code:'AUDIO_BASELINE_SOURCE_CHANGED'});
  assert.equal(piece(composed.runtime,'function payloadDigest56(p){','function safeJobView56(j){'),piece(runtimeSource,'function payloadDigest56(p){','function safeJobView56(j){'));
  assert.ok(composed.runtime.indexOf('jhAudioHost56.beforeDispatch(next)')<composed.runtime.indexOf('trustedSessionAuthority56.beforeDispatch(next)'));
  assert.ok(composed.runtime.includes('DURABLE_HOST_BOOTSTRAP_REQUIRED'));
});
test('durable policy rejects missing extension, route confusion, UI fields and session injection',()=>{
  const classify=createAudioDurableClassifier(ports()),good=payload();assert.equal(classify(jobFor(good),good).kind,'JOURNAL');
  const query=payload({action:'query_status'});assert.equal(classify(jobFor(query),query).kind,'READ');
  for(const edit of [p=>delete p.audioExtension,p=>p.audioExtension={...p.audioExtension,digest:LEGACY_CATALOG_PIN},
    p=>p.mcpToolName='life_android_capture_work_window',p=>p.action='CLICK',p=>p.audio.command.sessionId=17,
    p=>p.dataClass='SECRET',p=>delete p.commandId,p=>p.audio.command={action:'query_status'}]){
    const p=payload();edit(p);assert.equal(classify(jobFor(p),p).kind,'DENY');
  }
  assert.equal(classify({...jobFor(good),type:'open_url'},good).kind,'DENY');assert.equal(classify({type:'open_url'},{}),null);
});
test('durable mutation identity excludes ephemeral capability and command freshness',()=>{
  const classify=createAudioDurableClassifier(ports()),a=payload({action:'automatic'}),b=payload({action:'automatic'});
  b.taskDigest=b.taskId='8'.repeat(64);b.commandId='9'.repeat(32);b.secureInvocationExpiresAt+=1000;
  assert.deepEqual(classify(jobFor(a),a).identityPayload,classify(jobFor(b),b).identityPayload);
});

// Exact functions and HTTP poll/completion branches from the actual composed host.
// Network I/O, identity/clock and availability are synthetic; no listener is opened.
const {DurableManualCircuitFence}=await import(pathToFileURL(join(ownerRoot,'deployment/durable-manual-circuit-fence.mjs')).href);
const {durableNativeJobPolicy}=await import(pathToFileURL(join(ownerRoot,'deployment/durable-native-job-policy.mjs')).href);
const {MOBILE13_ACTION_POLICY_MODE56,mobile13DurableJobPolicy}=await import(pathToFileURL(join(ownerRoot,'jh168-mobile-unification/mobile13-action-policy.mjs')).href);
assert.equal(sha(readFileSync(join(ownerRoot,'deployment/durable-manual-circuit-fence.mjs'))),SOURCE_PINS.journal);
const factorySource=composed.durableHost.replace(/^import .*;\n/gm,'').replace('export function createDurableNativeHooks','function createDurableNativeHooks');
const createDurableNativeHooks=new Function('createHash','DurableManualCircuitFence','durableNativeJobPolicy','MOBILE13_ACTION_POLICY_MODE56','mobile13DurableJobPolicy',factorySource+'\nreturn createDurableNativeHooks;')(createHash,DurableManualCircuitFence,durableNativeJobPolicy,MOBILE13_ACTION_POLICY_MODE56,mobile13DurableJobPolicy);
function hostFixture({journalPath,clockStart=1800000000000,autoProbe=true,probeResult=statusResult,completionEdit,audioWaitFailure=false}={}) {
  const folder=journalPath?null:mkdtempSync(join(tmpdir(),'ebiseo-v04-host-'));if(folder)chmodSync(folder,0o700);
  const dbFile=journalPath||join(folder,'manual.sqlite'),clock={now:clockStart},secret=Buffer.alloc(32,42),device='synthetic-audio-device';
  const devices=new Map(),queues=new Map(),jobs=new Map(),recentJobs=new Map(),secureStates56=new Map();
  const commands=new Map(),commandKey=sha('discard-device|'+device),counts={trustDispatches:0};
  const FakeDate=class extends Date {constructor(...a){super(...(a.length?a:[clock.now]));}static now(){return clock.now;}};
  let fixture;
  const deps={createHash,createHmac,randomBytes,timingSafeEqual,Buffer,Date:FakeDate,z,
    devices,queues,jobs,recentJobs,activeDeviceId:device,secureStates56,
    trustedSessionAuthority56:{sessionAllowed:()=>true,beforeDispatch(){counts.trustDispatches++;}},
    durableNativeHooks56:null,jhCommandContext56:new AsyncLocalStorage(),jhMcpWorkflows56:new Map(),
    jhBlockedCommands56:new Set(),jhCommandVersions56:commands,jhV2JobAdmission56:()=>{},jhV2Install56:()=>{},jhV2RememberSignedPoll56:()=>{},
    auditSecureCompletionRejection:()=>{},makeRejectionProbe:()=>({reject:(_reason,b)=>b,record(){}}),
    DEDUPE_MS:8000,JOB_TTL_MS:90000,COMPLETED_JOB_RETENTION_MS:600000,SECURE56_JOB_MS:45000,
    SECURE56_TOOL_CATALOG_DIGEST:LEGACY_CATALOG_PIN,
    createAudioHostIntegration:p=>createAudioHostIntegration({...p,now:()=>clock.now}),createDurableNativeHooks,httpServer:{listening:false},
    waitJob:async job=>{if(autoProbe&&job.type==='secure_device_status'){
      assert.equal((await fixture.poll()).status,200);await fixture.complete(job,probeResult(),completionEdit);
    }if(audioWaitFailure&&job.type==='ebiseo_audio_command')throw Error('SYNTHETIC_POST_QUEUE_RESPONSE_LOSS');
      return job;}};
  const actual=[
    piece(composed.runtime,'function sha56(v){','function mcpCallerAuthorized56(req){'),
    piece(composed.runtime,'function token56(n=18){','const PUBLIC_BASE_URL='),
    piece(composed.runtime,'function state56(deviceId){','function sessionDigest56(x){'),
    piece(composed.runtime,'function payloadDigest56(p){','function cleanFrameWaiters56(){'),
    piece(composed.runtime,'function cleanupJobs(){','async function waitJob(j,ms=30000){'),
    piece(composed.runtime,'function textResult(v){','function jobResult(j){'),
    piece(composed.runtime,'function jhRequireCommand56(device,workflowId=null){','const jhWorkflowTtl56='),
    piece(composed.runtime,'function jhCommandVersion56(device){','function jhDiscardDeviceWork56(device,eventId,previousCommandId=undefined){'),
    composed.runtime.slice(composed.runtime.indexOf('export function installDurableNativeCircuit56(options){')).replace('export function','function'),
    'async function actualPoll(req,res,url){'+piece(composed.runtime,'  if(req.method==="GET" && url.pathname==="/device/poll"){','  const jobMatch=')+'}',
    'async function actualComplete(req,res,url){'+piece(composed.runtime,'  const completeMatch=','  const frameMatch=')+'}'
  ].join('\n');
  const host=new Function(...Object.keys(deps),'let seq=0;\n'+actual+'\nreturn {secureCall56,jhCommandTool56,stable56,mk,jhAudioHost56,actualPoll,actualComplete,installDurableNativeCircuit56,getHooks:()=>durableNativeHooks56};')(...Object.values(deps));
  host.installDurableNativeCircuit56({file:dbFile,key:Buffer.alloc(32,47),namespace:'7'.repeat(64),mode:journalPath?'read':'EXPLICIT_ONE_TIME'});
  const active={sessionId:'synthetic-audio-session',deviceDigest,secret,expiresAt:clock.now+300000,processEpoch:'synthetic-process-epoch',trustId:'synthetic-trust',seenComplete:new Set(),seenPoll:new Set(),seenFrame:new Set()};
  devices.set(device,{secureBridgeVersion:56,deviceDigest,lastSeen:clock.now,processEpoch:active.processEpoch});
  secureStates56.set(device,{pending:new Map(),active});commands.set(commandKey,commandId);
  const registered=new Map();host.jhAudioHost56.register({z,registerOAuthTool:(name,config,handler)=>registered.set(name,host.jhCommandTool56(name,config,handler))});
  function response(){return {status:0,body:'',writeHead(code){this.status=code;return this;},end(value=''){this.body=value;return this;}};}
  async function request(method,url,headers={},raw=Buffer.alloc(0)){
    const res=response(),req={method,headers,async *[Symbol.asyncIterator](){yield raw;}};
    await (method==='GET'?host.actualPoll:host.actualComplete)(req,res,new URL(url,'https://synthetic.invalid'));return res;
  }
  fixture={host,clock,secret,device,jobs,queues,active,secureStates56,commands,commandKey,counts,registered,folder,dbFile,
    call:args=>registered.get('life_android_audio_command').handler({task_digest:task,command_id:commandId,command:{action:'enabled',enabled:true},...args}),
    status:args=>registered.get('life_android_audio_status').handler({task_digest:task,command_id:commandId,...args}),
    poll:async()=>{const a=secureStates56.get(device).active,nonce=randomBytes(18).toString('base64url'),exp=clock.now+30000;
      return request('GET','/device/poll?deviceId='+device,{'x-jh-session':a.sessionId,'x-jh-device':a.deviceDigest,'x-jh-nonce':nonce,'x-jh-expires':String(exp),
        'x-jh-mac':hmac(a.secret,`poll|${a.sessionId}|${a.deviceDigest}|${nonce}|${exp}`)});},
    complete:async(job,result,edit)=>{const a=secureStates56.get(device).active,nonce=randomBytes(18).toString('base64url'),exp=clock.now+30000;
      let raw=Buffer.from(JSON.stringify({result})),digest=sha(raw);
      const headers={'x-jh-session':a.sessionId,'x-jh-device':a.deviceDigest,'x-jh-nonce':nonce,'x-jh-expires':String(exp),'x-jh-result-digest':digest,
        'x-jh-mac':hmac(a.secret,`complete|${a.sessionId}|${job.id}|${a.deviceDigest}|${nonce}|${exp}|${digest}`)};
      if(edit){const e=edit({headers,raw});if(e?.raw)raw=e.raw;}return request('POST','/job/'+job.id+'/complete',headers,raw);},
    last:type=>[...jobs.values()].reverse().find(j=>j.type===type),
    close:()=>{host.getHooks().close();if(folder)rmSync(folder,{recursive:true,force:true});}};
  return fixture;
}
test('actual signed status completion admits exact signed audio job and real schemas',async()=>{
  const h=hostFixture();try{
    assert.equal(body(await h.call({command:{action:'preset',preset:'deepbass',scope:'locked'}})).status,'queued');
    const job=h.last('ebiseo_audio_command');assert.ok(job);assert.equal(job.commandId,commandId);assert.deepEqual(job.audioExtension,audioExtensionEnvelope());
    const p={...job};for(const k of ['id','type','status','targetDeviceId','createdAtMs','expiresAtMs','secureSessionId','secureNonce','secureExpiresAt','securePayloadDigest','secureMac'])delete p[k];
    const pd=sha(h.host.stable56(p));assert.equal(job.securePayloadDigest,pd);
    assert.equal(job.secureMac,hmac(h.secret,[job.secureSessionId,job.id,job.type,job.secureNonce,job.secureExpiresAt,pd].join('|')));
    const schema=z.object(h.registered.get('life_android_audio_command').config.inputSchema).strict();
    for(const preset of PRESETS)assert.equal(schema.safeParse({task_digest:task,command_id:commandId,command:{action:'preset',preset,scope:'locked'}}).success,true);
    assert.equal(schema.safeParse({task_digest:task,command:{action:'enabled',enabled:'false'}}).success,false);
  }finally{h.close();}
});
for(const action of ['start','stop'])test('signed '+action+' queues only the exact EQ mutation and no player launch',async()=>{
  const h=hostFixture();try{
    assert.equal(body(await h.call({command:{action}})).status,'queued');
    const job=h.last('ebiseo_audio_command');assert.ok(job);
    assert.equal(job.mcpToolName,'life_android_audio_command');
    assert.equal(job.secureRequestedEffect,'WRITE_REVERSIBLE');
    assert.deepEqual(job.audio,{schemaVersion:1,command:{action}});
    assert.equal(job.audioExtension.version,2);
    assert.deepEqual([...h.jobs.values()].map(x=>x.type),['secure_device_status','ebiseo_audio_command']);
    const polled=await h.poll();assert.equal(polled.status,200,polled.body);
    assert.equal(h.host.getHooks().uncertainEffectsForMaintenance(),1);
    assert.equal((await h.complete(job,{protocol:AUDIO_PROTOCOL,ok:true,accepted:true,
      preferencesSaved:true,stateChanged:true,engineConfirmed:false,automaticReplayAllowed:false})).status,200);
    assert.equal(h.host.getHooks().uncertainEffectsForMaintenance(),0);
  }finally{h.close();}
});
test('old phone and mismatched extension status cannot queue audio',async()=>{
  for(const result of [{ok:true,secureActive:true,deviceResponded:true,phoneCapabilities:{}},
    {...statusResult(),phoneCapabilities:{EBISEO_AUDIO_EXTENSION:{...capability(),digest:LEGACY_CATALOG_PIN}}},
    {...statusResult(),phoneCapabilities:{EBISEO_AUDIO_EXTENSION:{...capability(),version:1,
      digest:'f91a18bf5a5c2d6f5b7e079f3ab59cfb8420af6b35e340ee0a9c3b559cf4d89b'}}}]){
    const h=hostFixture({probeResult:()=>result});try{assert.equal(body(await h.call()).accepted,false);assert.equal(h.last('ebiseo_audio_command'),undefined);}finally{h.close();}}
});
test('actual completion rejects bad MAC, device, session and body before capability',async()=>{
  for(const completionEdit of [x=>x.headers['x-jh-mac']='0'.repeat(64),x=>x.headers['x-jh-device']='0'.repeat(64),x=>x.headers['x-jh-session']='different-session',x=>({raw:Buffer.from('{}')})]){
    const h=hostFixture({completionEdit});try{assert.equal(body(await h.call()).accepted,false);assert.equal(h.last('ebiseo_audio_command'),undefined);}finally{h.close();}}
});
test('invalid inputs and stale command fail before a read probe',async()=>{
  const h=hostFixture();try{
    for(const command of [{action:'enabled',enabled:1},{action:'automatic',target:null},{action:'enabled',enabled:true,audioSessionId:17},
      {action:'start',launch:true},{action:'start',target:'youtube_music'},{action:'stop',enabled:false},{action:'query_status'}])
      assert.equal(body(await h.call({command})).accepted,false);
    assert.equal(body(await h.call({command_id:'f'.repeat(32)})).accepted,false);
    assert.equal(body(await h.call({device_id:'absent-explicit-device'})).accepted,false);assert.equal(h.jobs.size,0);
    let reads=0;assert.throws(()=>normalizeAudioCommand({get action(){reads++;return 'automatic';}}));assert.equal(reads,0);
  }finally{h.close();}
});
test('command drift after mk blocks actual poll BEFORE trust and durable reservations',async()=>{
  const h=hostFixture();try{await h.call();const before=h.counts.trustDispatches;h.commands.set(h.commandKey,'a'.repeat(32));
    assert.equal((await h.poll()).status,409);assert.equal(h.counts.trustDispatches,before);assert.equal(h.host.getHooks().uncertainEffectsForMaintenance(),0);
  }finally{h.close();}
});
test('capability expiry after mk blocks actual poll before reservation',async()=>{
  const h=hostFixture();try{await h.call();const before=h.counts.trustDispatches;h.clock.now+=AUDIO_CAPABILITY_TTL_MS+1;
    assert.equal((await h.poll()).status,409);assert.equal(h.counts.trustDispatches,before);assert.equal(h.host.getHooks().uncertainEffectsForMaintenance(),0);
  }finally{h.close();}
});
test('session rotation after mk cannot dispatch old audio job',async()=>{
  const h=hostFixture();try{await h.call();h.active.sessionId='rotated-session';const before=h.counts.trustDispatches;
    assert.equal((await h.poll()).status,204);assert.equal(h.counts.trustDispatches,before);assert.equal(h.host.getHooks().uncertainEffectsForMaintenance(),0);
  }finally{h.close();}
});
test('repeated completed signed probe cannot refresh expired capability',async()=>{
  const h=hostFixture();try{await h.call();const probe=h.last('secure_device_status');h.clock.now+=AUDIO_CAPABILITY_TTL_MS+1;
    assert.equal((await h.complete(probe,statusResult())).status,200); // original READ behavior remains
    const before=h.counts.trustDispatches;assert.equal((await h.poll()).status,409);assert.equal(h.counts.trustDispatches,before);
  }finally{h.close();}
});
test('UNKNOWN audio outcome remains fenced after fresh capability and real SQLite reopen',async()=>{
  const folder=mkdtempSync(join(tmpdir(),'ebiseo-v04-restart-'));chmodSync(folder,0o700);const file=join(folder,'manual.sqlite');let first,second;
  try{
    const initial=new DurableManualCircuitFence({file,key:Buffer.alloc(32,47),namespace:'7'.repeat(64),mode:'EXPLICIT_ONE_TIME',verifyAuthenticatedCompletion:()=>false});initial.close();
    first=hostFixture({journalPath:file});await first.call();const dispatched=await first.poll();assert.equal(dispatched.status,200,dispatched.body);
    assert.equal((await first.complete(first.last('ebiseo_audio_command'),{protocol:AUDIO_PROTOCOL,ok:false,accepted:false,code:'AUDIO_RESULT_UNCONFIRMED',outcomeUnknown:true,automaticReplayAllowed:false})).status,200);
    assert.equal(first.host.getHooks().uncertainEffectsForMaintenance(),1);first.close();first=null;
    second=hostFixture({journalPath:file});await second.call();const blocked=await second.poll();assert.equal(blocked.status,409);
    assert.equal(JSON.parse(blocked.body).code,'DURABLE_PREVIOUS_OUTCOME_UNKNOWN');assert.equal(second.host.getHooks().uncertainEffectsForMaintenance(),1);
  }finally{first?.close();second?.close();rmSync(folder,{recursive:true,force:true});}
});
for(const action of ['start','stop'])test('UNKNOWN '+action+' remains blocked across fresh capability and SQLite restart',async()=>{
  const folder=mkdtempSync(join(tmpdir(),'ebiseo-v052-'+action+'-'));chmodSync(folder,0o700);
  const file=join(folder,'manual.sqlite');let first,second;
  try{
    const initial=new DurableManualCircuitFence({file,key:Buffer.alloc(32,47),namespace:'7'.repeat(64),
      mode:'EXPLICIT_ONE_TIME',verifyAuthenticatedCompletion:()=>false});initial.close();
    first=hostFixture({journalPath:file});await first.call({command:{action}});
    const dispatched=await first.poll();assert.equal(dispatched.status,200,dispatched.body);
    assert.equal((await first.complete(first.last('ebiseo_audio_command'),{protocol:AUDIO_PROTOCOL,ok:false,accepted:false,
      preferencesSaved:null,stateChanged:null,mutationOutcome:'UNKNOWN',automaticReplayAllowed:false})).status,200);
    assert.equal(first.host.getHooks().uncertainEffectsForMaintenance(),1);first.close();first=null;
    second=hostFixture({journalPath:file});await second.call({command:{action}});
    const blocked=await second.poll();assert.equal(blocked.status,409);
    assert.equal(JSON.parse(blocked.body).code,'DURABLE_PREVIOUS_OUTCOME_UNKNOWN');
    assert.equal(second.host.getHooks().uncertainEffectsForMaintenance(),1);
    assert.equal(second.last('open_url'),undefined);
  }finally{first?.close();second?.close();rmSync(folder,{recursive:true,force:true});}
});
test('post-queue start or stop response loss remains UNKNOWN without a launch or replay',async()=>{
  for(const action of ['start','stop']){
    const h=hostFixture({audioWaitFailure:true});try{
      const result=body(await h.call({command:{action}}));
      assert.equal(result.code,'AUDIO_HOST_RESULT_UNCONFIRMED');
      assert.equal(result.accepted,null);assert.equal(result.preferencesSaved,null);
      assert.equal(result.stateChanged,null);assert.equal(result.mutationOutcome,'UNKNOWN');
      assert.equal(result.engineConfirmed,false);assert.equal(result.automaticReplayAllowed,false);
      assert.equal(Object.hasOwn(result,'startFlow'),false);
      assert.deepEqual([...h.jobs.values()].map(x=>x.type),['secure_device_status','ebiseo_audio_command']);
    }finally{h.close();}
  }
});
function capabilityFixture(){
  const b={deviceId:'phone',deviceDigest,sessionId:'session',commandId,sessionExpiresAt:100000};
  const cap=createAudioCapabilityAuthority({...ports(),captureAdmission:()=>b,currentBinding:()=>b,now:()=>1000});
  function dispatch(p){const j={...p.extra,type:'secure_device_status',mcpToolName:'life_android_secure_status',secureRequestedEffect:'READ_ONLY',taskDigest:task,targetDeviceId:b.deviceId,targetDeviceDigest:deviceDigest,secureSessionId:b.sessionId,secureExpiresAt:45000,status:'queued'};
    cap.capture(j,j);assert.equal(cap.beforeDispatch(j).allowed,true);cap.didDispatch(j);j.status='in_progress';return j;}
  return {cap,dispatch};
}
test('new negative probe revokes queued authority and older result cannot resurrect it',()=>{
  const {cap,dispatch}=capabilityFixture();const a=cap.prepareProbe({task_digest:task}),ja=dispatch(a);
  assert.equal(cap.acceptedAuthenticatedCompletion(ja,statusResult()),true);cap.finishProbe(a);
  const older=cap.prepareProbe({task_digest:task}),jo=dispatch(older),newer=cap.prepareProbe({task_digest:task}),jn=dispatch(newer);
  assert.equal(cap.acceptedAuthenticatedCompletion(jn,{ok:false}),false);assert.equal(cap.acceptedAuthenticatedCompletion(jo,statusResult()),false);
  assert.throws(()=>cap.finishProbe(a),{code:'AUDIO_PHONE_CAPABILITY_REQUIRED'});cap.close();
});
test('abandoned read probe cannot mint capability from a late authenticated result',()=>{
  const {cap,dispatch}=capabilityFixture(),p=cap.prepareProbe({task_digest:task}),j=dispatch(p);cap.abandonProbe(p);
  assert.equal(cap.acceptedAuthenticatedCompletion(j,statusResult()),false);assert.throws(()=>cap.finishProbe(p));cap.close();
});
test('actual startup links operational, unified AND owner runtime selector without activation',async()=>{
  const folder=mkdtempSync(join(tmpdir(),'ebiseo-v04-startup-'));
  try{
    const root=join(folder,'jh-server','owner-setup');
    cpSync(ownerRoot,root,{recursive:true,filter:p=>!p.includes('/node_modules/')&&!p.endsWith('/node_modules')&&!p.includes('/ebiseo-audio-v04/')&&!p.endsWith('/ebiseo-audio-v04')});
    const dependencies=join(ownerRoot,'owner-enrollment/node_modules');if(existsSync(dependencies))cpSync(dependencies,join(root,'owner-enrollment/node_modules'),{recursive:true});
    const result=await buildAudioReleaseCandidate(root);assert.equal(result.activated,false);assert.equal(result.ownerSelectorChanged,true);
    assert.ok(readFileSync(result.ownerFile,'utf8').includes('serverPath=buildAudioCandidateRuntime(root).file'));
    assert.ok(readFileSync(result.unifiedFile,'utf8').includes("from './owner-service-ebiseo-audio-v04.mjs'"));
    assert.ok(readFileSync(result.entryFile,'utf8').includes("from './unified-service-ebiseo-audio-v04.mjs'"));
    assert.equal(sha(readFileSync(join(root,'deployment/owner-config.mjs'))),sha(readFileSync(join(ownerRoot,'deployment/owner-config.mjs'))));
    assert.equal(sha(readFileSync(join(root,'deployment/durable-manual-circuit-fence.mjs'))),SOURCE_PINS.journal);
    assert.equal(sha(readFileSync(join(root,'server-integration/server-durable-native-return-route56.mjs'))),SOURCE_PINS.runtime);
    const restarted=await buildAudioReleaseCandidate(root);assert.equal(restarted.candidateSha256,result.candidateSha256);
    // Execute the actual owner selector through its runtime import boundary with
    // synthetic config/storage gates. A sentinel stops before importing/starting
    // the server. This proves the selected path, not just a textual replacement.
    const events=[],sentinel=Error('STOP_BEFORE_RUNTIME_IMPORT');let selected;
    const ownerSource=readFileSync(result.ownerFile,'utf8');
    const ownerFunction=piece(ownerSource,'export async function startConfiguredOwnerServer(',
      'export async function main(').replace('export async function','async function');
    const ownerDeps={root,Buffer,path:(await import('node:path')).default,process:{env:{}},readFileSync,sha,
      assertConfig:()=>events.push('config'),fail:code=>{throw Object.assign(Error(code),{code});},
      checkOwnerStorage:()=>events.push('storage'),
      acquireOwnerRuntimeLock:()=>{events.push('lock');return {close(){events.push('close');}};},
      buildAudioCandidateRuntime,
      pathToFileURL:file=>{selected=file;events.push('import');throw sentinel;}};
    const startOwner=new Function(...Object.keys(ownerDeps),'let startAttempted=false;\n'+ownerFunction+
      '\nreturn startConfiguredOwnerServer;')(...Object.values(ownerDeps));
    await assert.rejects(startOwner({config:{serverOrigin:'https://synthetic.invalid'},
      key:Buffer.alloc(32,47),port:0,bindAddress:'127.0.0.1',runtimeMode:'unified'}),e=>e===sentinel);
    assert.equal(selected,result.file);assert.deepEqual(events,['config','storage','lock','import','close']);
  }finally{rmSync(folder,{recursive:true,force:true});}
});
