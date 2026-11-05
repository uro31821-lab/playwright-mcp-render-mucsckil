/** Pure source overlay and inert generated-module fixtures. The production
 * binding adapter, original command wrapper and real Zod schemas run here.
 * Synthetic completion rows are fixtures, never evidence from a real phone.
 * The full original builder is deliberately reserved for the sequential suite.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createJebiseoTask} from './host-runtime.mjs';
import {fixtureAndroidAppInspection} from './test-support.mjs';
import {patchJebiseoOriginalHostComposition, reverseJebiseoOriginalHostComposition,
  JEBISEO_ORIGINAL_HOST_CANDIDATE_MODE} from './original-host-composition.mjs';

const compositionUrl = new URL('./original-host-composition.mjs', import.meta.url).href;
const focusUrl = new URL('../jh168-mobile-unification/stage44-device-focus.mjs', import.meta.url).href;
const commandSource = readFileSync(new URL('../deployment/durable-mcp-workflow-patch.mjs', import.meta.url), 'utf8');
const commandStart = commandSource.indexOf('function jhRequireCommand56(device,workflowId=null){');
const commandEnd = commandSource.indexOf('const jhWorkflowTtl56=', commandStart);
assert.ok(commandStart >= 0 && commandEnd > commandStart);
const originalCommandWrappers = commandSource.slice(commandStart, commandEnd);

// toString supplies an executable module body without generating files or
// importing a listening server. Exact source anchors match the final runtime.
function fixtureKernel() {
  const fixture={currentDevice:'fixture-phone',currentCommand:'1'.repeat(32),
    sessionId:'fixture-secure-session',deviceDigest:'2'.repeat(64),counter:0,
    calls:[],events:[],requests:new Map(),requireExtra:false,onStatus:async()=>({ok:true}),
    onTransport:null,beforeHandler:null,beforeMk:null,appInspection:null,reuseInspection:null};
  const jobs=new Map(),devices=new Map(),jhMcpWorkflows56=new Map(),jhBlockedCommands56=new Set();
  const httpServer={listening:false};
  const jhCommandContext56=new JhAsyncLocalStorage56();
  const jhWorkflowRuntimeDigest56='3'.repeat(64);
  const SECURE56_TOOL_CATALOG_DIGEST='fixture-original-catalog';
  const jhFocus44=createStage44DeviceFocus({maxMs:120000});
  const jhStage61Host56=createStage61HostAdapter({});
  const jhV2State56={activeMcpCalls:0,lastMcpAt:0};
  const OAUTH_SCOPE56='fixture-original-scope';
  let seq=0;
  const sha56=value=>createHash('sha256').update(value).digest('hex');
  const chooseDevice=explicit=>explicit||fixture.currentDevice;
  const jhCommandVersion56=device=>device===fixture.currentDevice?fixture.currentCommand:null;
  const active56=device=>devices.has(device)?{sessionId:fixture.sessionId,deviceDigest:fixture.deviceDigest}:null;
  const textResult=value=>({content:[{type:'text',text:JSON.stringify(value)}]});
  const safeJobView56=job=>({idDigest:sha56(job.id),type:job.type,status:job.status,
    result:job.result??null,error:job.error??null,completedAt:job.completedAt??null,targetDeviceDigest:null});
  const jobResult=job=>textResult(safeJobView56(job));
  const jhLearningHandler56=(name,handler)=>async(...args)=>{
    if(fixture.beforeHandler)await fixture.beforeHandler(name);
    return handler(...args);
  };
  function createStage61HostAdapter(){return Object.freeze({fixture:true});}
  const durableNativeHooks56={
    capture(){fixture.events.push('capture');},
    beforeDispatch(){fixture.events.push('dispatch');return {allowed:true};},
    acceptedCompletion(){fixture.events.push('complete');return {allowed:true};},
    uncertainEffectsForMaintenance(){return 0;}
  };
  function mk(type,p={},deviceId=null) {
    const targetDeviceId=chooseDevice(deviceId);
    if(type!=="secure_device_status")p={...p,commandId:jhRequireCommand56(targetDeviceId,p.workflowId)};
    fixture.beforeMk?.(type,p);
    const id='job_'+(++seq),createdAtMs=Date.now();
    const j={id,type,status:'queued',targetDeviceId,secureSessionId:fixture.sessionId,
      createdAtMs,expiresAtMs:createdAtMs+60000,...p};
    if(durableNativeHooks56)durableNativeHooks56.capture(j,p);
    jobs.set(id,j);
    if(targetDeviceId){
      fixture.lastJob=j;
    }
    return j;
  }
  function decideExactSignedCompletionAck56(){return 'FIRST_COMPLETION';}
  function fixtureCompletion(j,body,stage26RawDigest56){
    const a=active56(j.targetDeviceId),sid=j.secureSessionId;
    if(!a||sid!==j.secureSessionId)throw Error('fixture_session_invalid');
    const stage26Ack56=decideExactSignedCompletionAck56(j,stage26RawDigest56);
    if(stage26Ack56!=='FIRST_COMPLETION')throw Error('fixture_completion_invalid');
    durableNativeHooks56?.acceptedCompletion(j,body.result);
    j.stage26CompletionDigest56=stage26RawDigest56;
    j.status="complete";j.result=body.result;j.completedAt=new Date().toISOString();
  }
  async function waitJob(job){
    if(!durableNativeHooks56?.beforeDispatch(job).allowed)throw Error('fixture_dispatch_invalid');
    job.status='in_progress';job.startedAtMs=Date.now();
    const body={result:job.type==='computer_use_inspect'?fixture.appInspection():
      job.type==='open_url'&&job.url===''?{ok:true,url:'opened:'+job.target,
        code:'RIGHT_PANE_VERIFIED',rightPaneVerified:true,launchAccepted:true,
        pageOrScrollRestored:false,resultVerified:false}:{ok:true,url:'[]'}};
    fixtureCompletion(job,body,sha56(JSON.stringify(body)));
    return job;
  }
  fixture.finishApp=()=>waitJob(fixture.appJob);
  class McpServer {
    constructor(){this.tools=new Map();}
    registerTool(name,config,handler){this.tools.set(name,{config,handler});return {name};}
    async call(name,args,extra){
      const entry=this.tools.get(name);
      return entry.handler(z.object(entry.config.inputSchema).parse(args),extra);
    }
  }
  function createMcp(){
    const instance=++fixture.counter;
    const server=new McpServer();
    const oauthSchemes56=[{type:'oauth2',scopes:[OAUTH_SCOPE56]}];
    const registerOAuthTool=(name,config,handler)=>{const scoped=jhCommandTool56(name,config,jhLearningHandler56(name,handler));return server.registerTool(name,{...scoped.config,securitySchemes:oauthSchemes56,_meta:{...(config?._meta||{}),securitySchemes:oauthSchemes56}},async(...a)=>{jhV2State56.activeMcpCalls++;try{const result=await scoped.handler(...a);jhV2State56.lastMcpAt=Date.now();return result;}finally{jhV2State56.activeMcpCalls--;}});};
    registerOAuthTool('life_status',{inputSchema:{}},async(args,extra)=>fixture.onStatus({instance,extra}));
    registerOAuthTool('life_android_snapshot',{inputSchema:fixture.requireExtra?{source_required:z.string()}:{}},async(args,extra)=>{
      fixture.calls.push({instance,extra,args});
      const j=mk('agent_snapshot');
      return jobResult(await waitJob(j));
    });
    registerOAuthTool('life_web_navigate',{inputSchema:{url:z.string()}},async({url},extra)=>{
      fixture.calls.push({instance,extra,url});
      const j=mk('open_url',{target:'right_web_link',url});
      return jobResult(await waitJob(j));
    });
    registerOAuthTool('life_android_open',{inputSchema:{target:z.string(),url:z.string().optional()}},async(args,extra)=>{
      fixture.calls.push({instance,extra,args});
      const j=mk('open_url',{target:args.target,url:''}); fixture.appJob=j;
      return textResult({route:'android_right',operation:'native_app_open',queued:j.status==='queued',
        jobId:j.id,requiresFreshWindowReadback:true,screenVerified:false,automaticReplay:false});
    });
    registerOAuthTool('life_android_computer_inspect',{inputSchema:{action:z.string(),effect:z.string(),
      data_class:z.string(),task_digest:z.string(),max_actions_in_call:z.number()}},async(args,extra)=>{
      fixture.calls.push({instance,extra,args});
      if(fixture.reuseInspection)return jobResult(fixture.reuseInspection);
      const j=mk('computer_use_inspect',{action:args.action,effect:args.effect,dataClass:args.data_class,
        taskId:args.task_digest,taskDigest:args.task_digest,mcpToolName:'life_android_computer_inspect',
        secureRequestedEffect:'READ_ONLY',containsCredential:false,index:0,viewportWidth:0,
        viewportHeight:0,scrollX:0,scrollY:0,waitMs:0,maxActionsInCall:args.max_actions_in_call});
      fixture.inspectJob=j;
      return jobResult(await waitJob(j));
    });
    return server;
  }
  function mcpCallerAuthorized56(req){return req.authorized===true;}
  async function issueRequest({authorized:authorization=true,id='fixture-request',signal,
    method='tools/call',commandId=fixture.currentCommand}={}){
    const req=Object.assign(new EventEmitter(),{authorized:authorization,complete:true});
    const res=Object.assign(new EventEmitter(),{writableEnded:false});
    fixture.requests.set(id,{req,res});
    const authorized=mcpCallerAuthorized56(req);
    const parsedBody={jsonrpc:'2.0',id,method,
      params:{name:'life_status',arguments:{command_id:commandId}}};
    if(!authorized&&method==='tools/call')return {authenticationRequired:true};
    const server=createMcp();
    const extra={requestId:id,signal,fixtureExtra:true};
    let output;
    const transport={handleRequest:async()=>{
      output=fixture.onTransport?await fixture.onTransport({server,extra}):
        await server.call(parsedBody.params.name,parsedBody.params.arguments,extra);
    }};
    try{
        await transport.handleRequest(req,res,parsedBody);
    }catch(error){throw error;}
    return output;
  }
  function activateFixture(){
    devices.set(fixture.currentDevice,{deviceDigest:fixture.deviceDigest,secureBridgeVersion:56});
    jhFocus44.start({device:fixture.currentDevice,commandId:fixture.currentCommand,
      currentCommand:fixture.currentCommand});
  }
}

const kernel = fixtureKernel.toString();
const body = kernel.slice(kernel.indexOf('{') + 1, kernel.lastIndexOf('}'))
  .split('\n').map(line => line.startsWith('  ') ? line.slice(2) : line).join('\n');
const source = [
  'import {AsyncLocalStorage as JhAsyncLocalStorage56} from "node:async_hooks";',
  'import {createHash} from "node:crypto";',
  'import {EventEmitter} from "node:events";',
  'import {z} from ' + JSON.stringify(import.meta.resolve('zod')) + ';',
  'import {createStage44DeviceFocus} from ' + JSON.stringify(focusUrl) + ';',
  originalCommandWrappers, body,
  'export {fixture,jobs,devices,issueRequest,activateFixture,jhV2State56,jhFocus44};'
].join('\n');
let fixtureNumber = 0;
async function setup({install = true} = {}) {
  const candidate = patchJebiseoOriginalHostComposition(source).replace(
    '"../jebiseo/original-host-composition.mjs"', JSON.stringify(compositionUrl));
  const url = 'data:text/javascript;base64,' + Buffer.from(candidate +
    '\n// isolated fixture ' + (++fixtureNumber)).toString('base64');
  const module = await import(url);
  const host = install ? module.installJebiseoOriginalHost56({mode:JEBISEO_ORIGINAL_HOST_CANDIDATE_MODE}) : null;
  module.activateFixture();
  return {...module, host};
}
const task = (ref = 'fixture-consultation') => createJebiseoTask({taskRef:ref,
  threadRef:'fixture-thread',intent:'consult',basis:'direct',visibility:'VISIBLE',
  deviceId:'fixture-phone',commandId:'1'.repeat(32),prompt:'fixture only'});
const appTask = () => createJebiseoTask({taskRef:'fixture-app-task',threadRef:'fixture-thread',
  intent:'open_app',feature:'ANDROID',action:'OPEN_APP',basis:'direct',visibility:'VISIBLE',
  deviceId:'fixture-phone',commandId:'1'.repeat(32),appPackage:'com.google.android.youtube',
  taskDigest:'8'.repeat(64)});

test('the installed candidate exposes manual handoff only in its authenticated request boundary',async()=>{
  const f=await setup();
  const input={request:{taskRef:'fixture-handoff-task',threadRef:'fixture-handoff-thread',
    sourceRef:'fixture-user-request',intent:'execute',basis:'direct',feature:'ANDROID',
    requestText:'삼성 계산기를 열어 줘'}};
  assert.throws(()=>f.host.createHandoffRuntime(input),/AUTHENTICATED_REQUEST_REQUIRED/);
  f.fixture.onStatus=async()=>f.host.createHandoffRuntime(input).start();
  const response=await f.issueRequest({});
  assert.equal(response.nextAction,'OPEN');
  assert.equal(response.surface,'GEMINI_NATIVE');
  assert.equal(response.requestSent,false);
  assert.equal(response.automatedOpenAttempted,false);
  assert.equal(f.jobs.size,0);
});

test('native app queue and later readonly inspection retain real command wrappers and private mk provenance', async () => {
  const f = await setup(); f.fixture.appInspection=fixtureAndroidAppInspection;
  let rt, step='OPEN_APP';
  f.fixture.onStatus=async()=>{
    rt??=f.host.createRuntime(appTask()); return rt.runStep({operation:step});
  };
  const open=await f.issueRequest({id:'native-open'});
  assert.equal(open.appWindowVerified,false); assert.equal(open.payload.jobId,'job_1');
  assert.deepEqual(f.fixture.events,['capture']);
  assert.equal(f.fixture.appJob.commandId,'1'.repeat(32));
  await f.fixture.finishApp();
  step='APP_OBSERVE';
  const observed=await f.issueRequest({id:'native-current-app'});
  assert.equal(observed.code,'JEBISEO_ANDROID_APP_OBSERVED');
  assert.equal(observed.appWindowVerified,true);
  assert.equal(observed.observationScope,'RIGHT_APP_WINDOW_ONLY');
  assert.deepEqual(f.fixture.events,['capture','dispatch','complete','capture','dispatch','complete']);
  assert.equal(f.fixture.inspectJob.commandId,f.fixture.appJob.commandId);
  assert.equal(f.fixture.inspectJob.taskId,'8'.repeat(64));
  assert.notEqual(f.fixture.inspectJob,f.fixture.appJob);
  // A cached job returned by another call is never a new observation.
  f.fixture.reuseInspection=f.fixture.inspectJob;
  const stale=await f.issueRequest({id:'cached-app-observation'});
  assert.equal(stale.appWindowVerified,false);
  assert.equal(stale.readbackRequired,true);
  assert.equal(f.jobs.size,2);
});

test('native app async guards and changed payload stop before the original queue', async () => {
  for (const change of ['target','focus','inspect-action','inspect-extra']) {
    const f=await setup(); f.fixture.appInspection=fixtureAndroidAppInspection;
    if(change==='target')f.fixture.beforeMk=(type,p)=>{if(type==='open_url')p.target='지메일 앱';};
    if(change==='focus')f.fixture.beforeHandler=async name=>{
      if(name==='life_android_open')f.jhFocus44.release({device:f.fixture.currentDevice,commandId:f.fixture.currentCommand});
    };
    f.fixture.onStatus=async()=>f.host.createRuntime(appTask()).start();
    const opened=await f.issueRequest({id:'open-'+change});
    if(change==='target'||change==='focus'){
      // The unchanged original command wrapper returns these guard failures
      // as explicit negative results; only a rejected call is UNKNOWN.
      assert.equal(opened.status,'BLOCKED');
      assert.equal(opened.code,change==='target'?'JEBISEO_ORIGINAL_APP_JOB_CHANGED':
        'JEBISEO_ORIGINAL_JOB_PROTECTION_CHANGED');
      assert.equal(opened.payload.replayAllowed,false);
      assert.equal(opened.appWindowVerified,false); assert.equal(f.jobs.size,0);
      assert.equal(f.fixture.appJob,undefined); assert.equal(f.fixture.lastJob,undefined);
      assert.deepEqual(f.fixture.events,['capture']); continue;
    }
    await f.fixture.finishApp();
    const originalAppJob=f.fixture.appJob;
    f.fixture.beforeMk=(type,p)=>{if(type==='computer_use_inspect'){
      if(change==='inspect-action')p.action='CLICK'; else p.x=12;
    }};
    f.fixture.onStatus=async()=>f.host.createRuntime(appTask()).runStep({operation:'APP_OBSERVE'});
    const observed=await f.issueRequest({id:change});
    assert.equal(observed.status,'BLOCKED');
    assert.equal(observed.code,'JEBISEO_ORIGINAL_APP_OBSERVATION_CHANGED');
    assert.equal(observed.payload.replayAllowed,false);
    assert.equal(observed.appWindowVerified,false);
    assert.equal(f.jobs.size,1);
    assert.equal(f.jobs.get(originalAppJob.id),originalAppJob);
    assert.equal(f.fixture.lastJob,originalAppJob); assert.equal(f.fixture.inspectJob,undefined);
    assert.deepEqual(f.fixture.events,['capture','dispatch','complete','capture']);
  }
});

test('pure overlay preserves original source/catalog and rejects ambiguous or missing authority', () => {
  const candidate = patchJebiseoOriginalHostComposition(source);
  assert.equal(reverseJebiseoOriginalHostComposition(candidate), source);
  assert.equal((candidate.match(/registerOAuthTool\(/g) ?? []).length,
    (source.match(/registerOAuthTool\(/g) ?? []).length);
  assert.ok(candidate.includes('jhV2State56.activeMcpCalls++;try{const result=await scoped.handler(...a);'));
  assert.throws(() => patchJebiseoOriginalHostComposition(candidate), /ALREADY_PRESENT/);
  assert.throws(() => patchJebiseoOriginalHostComposition(source.replace(
    'const jhFocus44=createStage44DeviceFocus({maxMs:120000});', 'const jhFocus44=null;')), /AUTHORITY_CHANGED/);
  assert.throws(() => patchJebiseoOriginalHostComposition(source + '\nfunction createMcp(){}'), /ANCHOR_CHANGED/);
  assert.throws(() => patchJebiseoOriginalHostComposition(source.replace(
    'j.stage26CompletionDigest56=stage26RawDigest56;', '')), /AUTHORITY_CHANGED/);
  assert.throws(() => reverseJebiseoOriginalHostComposition(candidate.replace(
    'withAuthenticatedRequest(server,authorized,parsedBody,', 'withAuthenticatedRequest(server,true,parsedBody,')), /REVERSE_CHANGED/);
});

test('explicit installation and authenticated original request are required; no public catalog authority', async () => {
  const f = await setup();
  assert.throws(() => f.host.createRuntime(task()), /AUTHENTICATED_REQUEST_REQUIRED/);
  assert.throws(() => f.installJebiseoOriginalHost56({mode:JEBISEO_ORIGINAL_HOST_CANDIDATE_MODE}), /INSTALL_BEFORE_LISTEN_ONLY/);
  let called = false;
  f.fixture.onStatus = async () => {called = true; return f.host.createRuntime(task()).runStep({operation:'FORM_SNAPSHOT'});};
  assert.deepEqual(await f.issueRequest({authorized:false}), {authenticationRequired:true});
  assert.equal(called, false); assert.equal(f.fixture.calls.length, 0);
  f.fixture.onTransport = () => {
    assert.throws(() => f.host.createRuntime(task()), /AUTHENTICATED_REQUEST_REQUIRED/);
    return {catalogUnchanged:true};
  };
  assert.deepEqual(await f.issueRequest({authorized:false,method:'tools/list'}), {catalogUnchanged:true});
});

test('actual binding adapter invokes one original registered/schema-scoped handler and original extras', async () => {
  const f = await setup();
  let extra;
  f.fixture.onStatus = async input => {
    extra = input.extra;
    return f.host.createRuntime(task()).runStep({operation:'FORM_SNAPSHOT',args:{}});
  };
  const result = await f.issueRequest({id:'exact-original-extras'});
  assert.equal(result.toolInvoked, true);
  assert.equal(f.fixture.calls.length, 1);
  assert.equal(f.fixture.calls[0].extra, extra);
  assert.equal(f.fixture.lastJob.commandId, '1'.repeat(32));
  assert.deepEqual(f.fixture.events, ['capture','dispatch','complete']);
  assert.equal(f.jhV2State56.activeMcpCalls, 0);
  assert.equal(result.geminiAcceptedVerified, false);
  assert.equal(result.phoneDispatchVerified, false);
});

test('original schema validation cannot be skipped by the host adapter', async () => {
  const f = await setup();
  f.fixture.requireExtra = true;
  f.fixture.onStatus = async () => f.host.createRuntime(task()).runStep({operation:'FORM_SNAPSHOT'});
  const result = await f.issueRequest();
  assert.equal(result.ok, false);
  assert.equal(f.fixture.calls.length, 0);
  assert.equal(f.jobs.size, 0);
});

test('concurrent createMcp instances keep their own final handlers and request extras', async () => {
  const f = await setup();
  let releaseFirst, firstEntered;
  const entered = new Promise(resolve => {firstEntered = resolve;});
  const held = new Promise(resolve => {releaseFirst = resolve;});
  f.fixture.onStatus = async ({instance,extra}) => {
    const runtime = f.host.createRuntime(task());
    if (extra.requestId === 'first') {firstEntered(); await held;}
    return runtime.runStep({operation:'FORM_SNAPSHOT'});
  };
  const first = f.issueRequest({id:'first'});
  await entered;
  const second = await f.issueRequest({id:'second'});
  releaseFirst();
  assert.equal((await first).toolInvoked, true);
  assert.equal(second.toolInvoked, true);
  assert.deepEqual(f.fixture.calls.map(call => [call.instance,call.extra.requestId]), [[2,'second'],[1,'first']]);
  assert.equal(f.jhV2State56.activeMcpCalls, 0);
});

test('retained runtime needs a new current authenticated request, and closed/aborted capabilities cannot invoke', async () => {
  const f = await setup();
  let runtime;
  f.fixture.onStatus = async () => {
    runtime ??= f.host.createRuntime(task());
    return runtime.runStep({operation:'FORM_SNAPSHOT'});
  };
  assert.equal((await f.issueRequest()).toolInvoked, true);
  const outside = await runtime.runStep({operation:'FORM_SNAPSHOT'});
  assert.equal(outside.ok, false); assert.equal(f.fixture.calls.length, 1);
  assert.equal((await f.issueRequest({id:'new-authenticated-request'})).toolInvoked, true);
  const controller = new AbortController(); controller.abort();
  const aborted = await f.issueRequest({id:'aborted',signal:controller.signal});
  assert.equal(aborted.ok, false); assert.equal(f.fixture.calls.length, 2);
  f.host.close();
  const closed = await runtime.runStep({operation:'FORM_SNAPSHOT'});
  assert.equal(closed.ok, false); assert.equal(f.fixture.calls.length, 2);
});

test('HTTP response close fences a pending handler even when the SDK signal remains un-aborted', async () => {
  const f = await setup();
  let entered, release;
  const ready = new Promise(resolve => {entered = resolve;});
  const held = new Promise(resolve => {release = resolve;});
  const controller = new AbortController();
  f.fixture.onStatus = async () => {
    const runtime = f.host.createRuntime(task());
    assert.equal((await runtime.runStep({operation:'FORM_SNAPSHOT'})).toolInvoked, true);
    entered(); await held;
    return runtime.runStep({operation:'FORM_SNAPSHOT'});
  };
  const pending = f.issueRequest({id:'disconnected',signal:controller.signal});
  await ready;
  const {req,res} = f.fixture.requests.get('disconnected');
  res.destroyed = true; res.emit('close');
  assert.equal(controller.signal.aborted, false);
  assert.equal(req.listenerCount('aborted'), 0);
  assert.equal(res.listenerCount('finish'), 0);
  release();
  assert.equal((await pending).ok, false);
  assert.equal(f.fixture.calls.length, 1);
});

test('normal request-body close does not revoke an open authenticated response', async () => {
  const f = await setup();
  f.fixture.onStatus = async () => {
    const {req} = f.fixture.requests.get('body-consumed');
    req.destroyed = true; req.complete = true; req.emit('close');
    return f.host.createRuntime(task()).runStep({operation:'FORM_SNAPSHOT'});
  };
  assert.equal((await f.issueRequest({id:'body-consumed'})).toolInvoked, true);
  assert.equal(f.fixture.calls.length, 1);
  const {req,res} = f.fixture.requests.get('body-consumed');
  assert.equal(req.listenerCount('aborted'), 0);
  assert.equal(res.listenerCount('close'), 0);
  assert.equal(res.listenerCount('finish'), 0);
});

test('learning-await races are fenced before original jobs enter the queue', async () => {
  for (const scenario of ['session-rotated','http-closed','focus-released']) {
    const f = await setup();
    const opening = scenario === 'focus-released';
    let entered, release;
    const ready = new Promise(resolve => {entered = resolve;});
    const held = new Promise(resolve => {release = resolve;});
    f.fixture.beforeHandler = async name => {
      if (name === (opening ? 'life_web_navigate' : 'life_android_snapshot')) {
        entered(); await held;
      }
    };
    f.fixture.onStatus = async () => {
      const runtime = f.host.createRuntime(task());
      return opening ? runtime.start() : runtime.runStep({operation:'FORM_SNAPSHOT'});
    };
    const pending = f.issueRequest({id:scenario});
    await ready;
    assert.equal(f.jobs.size, 0);
    if (scenario === 'session-rotated') f.fixture.sessionId = 'fixture-replacement-session';
    if (scenario === 'http-closed') {
      const {res} = f.fixture.requests.get(scenario);
      res.destroyed = true; res.emit('close');
    }
    if (scenario === 'focus-released') f.jhFocus44.release({
      device:f.fixture.currentDevice,commandId:f.fixture.currentCommand});
    release();
    const result = await pending;
    assert.equal(result.ok, false, scenario);
    assert.equal(f.jobs.size, 0, scenario + ': no original job queued');
    assert.deepEqual(f.fixture.events, ['capture'], scenario + ': original capture only, no dispatch/reservation');
    assert.equal(f.jhV2State56.activeMcpCalls, 0);
  }
});

test('without explicit installation original registered calls keep their existing behavior', async () => {
  const f = await setup({install:false});
  f.fixture.onStatus = async () => ({original:true});
  assert.deepEqual(await f.issueRequest(), {original:true});
  assert.equal(f.fixture.calls.length, 0);
  assert.equal(f.jhV2State56.activeMcpCalls, 0);
  assert.throws(() => f.installJebiseoOriginalHost56({mode:'ON'}), /EXPLICIT_HOST_CANDIDATE_REQUIRED/);
});
