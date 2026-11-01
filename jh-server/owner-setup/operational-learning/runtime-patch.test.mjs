import test from 'node:test';
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { applyOperationalLearningPatch, reverseOperationalLearningPatch } from './runtime-patch.mjs';
import { createServerLearning } from './server-runtime.mjs';
import { FileLearningStore } from './store.mjs';
import { describeOpenCompletion, awaitOpenCompletion, patchJH167OpenCompletion56,
  OPEN_COMPLETION_WAIT_MS, OPEN_STATUS_WAIT_MS } from '../deployment/jh167-open-completion.mjs';
import { applyJH168SplitReadReceiptPatch } from '../jh168-mobile-unification/split-read-receipt-patch.mjs';
import { createSplitReadReceiptRegistry56 } from '../jh168-mobile-unification/split-read-receipts.mjs';
import { inspectSplitEvidence } from '../deployment/split-screen-evidence.mjs';

const command = 'a'.repeat(32);
const copy = value => JSON.parse(JSON.stringify(value));
// Small executable host fixture: no HTTP server, sockets, or device tools.
// Production open/split receipt patches supply their real helpers/status paths.
// The split registry and screen validator are real; accepted jobs remain synthetic
// and do not claim an actual signed device verification.
const source = applyJH168SplitReadReceiptPatch(patchJH167OpenCompletion56(String.raw`
const jobs=new Map(),devices=new Map(),recentJobs=new Map();
const recentWeb=new Map();
const httpServer={listening:false};
const pendingApprovalReceipts56=createPendingApprovalReceiptRegistry56();
const computerInspectReceipt56=createComputerInspectReceiptRegistry56();
const jhInspectSplitEvidence155=fixtureInspectSplitEvidence;
const jhCommandContext56=new JhAsyncLocalStorage56();
const jhV2State56={activeMcpCalls:0,lastMcpAt:0};
const JOB_TTL_MS=90000,COMPLETED_JOB_RETENTION_MS=600000;
let sequence=0,durableAllowed=true,waits=0,activeSession='private-session';
let selectedDevice='fixture-device';
let waitImpl=async job=>job;
const durableNativeHooks56={beforeDispatch:()=>({allowed:durableAllowed}),acceptedCompletion:()=>({allowed:durableAllowed})};
function jhRequireCommand56(){return jhCommandContext56.getStore()?.commandId;}
function active56(){return activeSession?{sessionId:activeSession}:null;}
function chooseDevice(){return selectedDevice;}
function waitJob(job,budget){waits++;return waitImpl(job,budget);}
function textResult(value){return {content:[{type:'text',text:JSON.stringify(value)}]};}
function jobResult(job){return textResult(job?{id:job.id,status:job.status,result:job.result??null}:{notFound:true});}
function jhCommandTool56(name,config,handler){return {config,handler:async(args,extra)=>{
  const input={...args};delete input.command_id;
  return jhCommandContext56.run({commandId:args?.command_id},()=>handler(input,extra));
}};}
function cacheGet(map,key){return map.get(key);}
function cacheSet(map,key,value){map.set(key,value);return value;}
function cleanupJobs(){
  const now=Date.now();
  for(const [id,j] of jobs){
    const born=Number(j.createdAtMs||j.startedAtMs||now);
    if((j.status==="queued"||j.status==="in_progress") && now-born>JOB_TTL_MS){j.status="expired";j.error="job_timeout";j.completedAt=new Date().toISOString();}
    if((j.status==="complete"||j.status==="error"||j.status==="expired") && j.completedAt && now-Date.parse(j.completedAt)>COMPLETED_JOB_RETENTION_MS)jobs.delete(id);
  }
}
function mk(type,p={},deviceId='fixture-device'){
  const key=type+'|'+JSON.stringify(p),cached=cacheGet(recentJobs,key);if(cached)return cached;
  const id='job_'+(++sequence),j={id,type,status:'queued',targetDeviceId:deviceId,...p,commandId:jhRequireCommand56()};
  jobs.set(id,j);
  if(!deviceId){j.status='error';j.error='no active Android device';}
  return cacheSet(recentJobs,key,j);
}
function dispatch(job){return durableNativeHooks56?.beforeDispatch(job);}
function complete(j,body,authenticated=true){
  if(!authenticated)return 401;
  const durableReceipt=durableNativeHooks56?.acceptedCompletion(j,body.result);
  if(!durableReceipt.allowed)return 409;
    j.status="complete";j.result=body.result;j.completedAt=new Date().toISOString();
  return 200;
}
function register(name,handler,config={}){
  const server={registerTool:(name,config,handler)=>({name,config,handler})};
  const oauthSchemes56=[{type:'oauth2',scopes:['jh.secure']}];
  const registerOAuthTool=(name,config,handler)=>{const scoped=jhCommandTool56(name,config,handler);return server.registerTool(name,{...scoped.config,securitySchemes:oauthSchemes56,_meta:{...(config?._meta||{}),securitySchemes:oauthSchemes56}},async(...a)=>{jhV2State56.activeMcpCalls++;try{const result=await scoped.handler(...a);jhV2State56.lastMcpAt=Date.now();return result;}finally{jhV2State56.activeMcpCalls--;}});};
  return registerOAuthTool(name,config,handler);
}
function memoryCatalogFixture(){
  const registerOAuthTool=()=>{};
  registerOAuthTool("life_status",{});
}
  let jhRightWebOpen56=null;
async function fixtureDirectOpen(j,raw){
      const finished=await waitJob(j,22000);
      return textResult({route:"android_right",service:raw,url:raw,jobId:j.id,
        rightAddressConfirmed:finished?.status==="complete"&&finished?.result?.rightAddressConfirmed===true,
        job:jobResult(finished)});
}
async function fixtureAliasOpen(j,raw,url){
        const finished=await waitJob(j,22000);
        return textResult({route:"android_right",service:raw,url,jobId:j.id,
          rightAddressConfirmed:finished?.status==="complete"&&finished?.result?.rightAddressConfirmed===true,
          job:jobResult(finished)});
}
function receiptTool(){
  const registerOAuthTool=(name,config,handler)=>register(name,handler,config);
  return registerOAuthTool("life_job_status",{
    description:"Read a queued Android job result.",
    inputSchema:{}
  },async({job_id})=>{cleanupJobs();return jobResult(jobs.get(job_id));});
}
// Uncalled dispatch anchors let the production split patch assemble its actual
// read-only helper and receipt-mode branch without creating a device executor.
  async function jhSplitScreenJob56(type,payload,effect,secureToolName,waitMs=26000){
    const device=chooseDevice(),auth=active56(device),commandId=jhRequireCommand56(device);
    const taskDigest=sha56(JSON.stringify(payload)),j=mk(type,payload,device);
    const completed=await waitJob(j,Math.min(Number(waitMs)||26000,43000));
    if(!completed||completed.status!=='complete')
      return {ok:false,code:completed?.error||'split_screen_device_result_unconfirmed'};
    return completed.result;
  }
function jhSplitScreenContextId56(value){return typeof value==='string'&&/^ssc_[a-f0-9]{32}$/.test(value);}
function splitReceiptTool(){
  const z={enum:()=>({}),string:()=>({optional:()=>({})})};
  const registerOAuthTool=(name,config,handler)=>register(name,handler,config);
  return registerOAuthTool('life_android_split_screen_assistant',{
    inputSchema:{mode:z.enum(['START','SAVE_ANALYSIS','FOLLOW_UP','STATUS','FINISH','CANCEL']),
      context_id:z.string().optional(),request_id:z.string().optional(),goal:z.string().optional(),}
  },async(args)=>{
    const mode=args.mode;
    if(!jhSplitScreenContextId56(args.context_id))return textResult({ok:false,code:'split_screen_context_id_required'});
    return textResult({ok:false,code:'fixture_dispatch_not_available'});
  });
}
`));

function host({ learning = true } = {}) {
  const patched = learning ? applyOperationalLearningPatch(source) : source;
  const executable = patched.replace(/^(?:import[^\n]+\n)+/, '').replace('export function installOperationalLearning56', 'function installOperationalLearning56');
  let receiptNow = null, receiptNonce = 0;
  const sandbox = {
    JhAsyncLocalStorage56: AsyncLocalStorage,
    jhLearningDescribeOpen56: describeOpenCompletion,
    jhAwaitOpenCompletion56: awaitOpenCompletion,
    jhOpenWait56: OPEN_COMPLETION_WAIT_MS,
    jhOpenStatusWait56: OPEN_STATUS_WAIT_MS,
    sha56: value => createHash('sha256').update(value).digest('hex'),
    stable56: JSON.stringify,
    createPendingApprovalReceiptRegistry56: () => ({}),
    createSplitReadReceiptRegistry56: () => createSplitReadReceiptRegistry56({
      clock: () => receiptNow ?? Date.now(), token: () => String(++receiptNonce).padStart(32, '0'),
    }),
    fixtureInspectSplitEvidence: inspectSplitEvidence,
    fixtureSetReceiptNow: value => { receiptNow = value; },
    createComputerInspectReceiptRegistry56: () => ({}),
  };
  runInNewContext('"use strict";\n' + executable + `
globalThis.api={install:typeof installOperationalLearning56==='function'?installOperationalLearning56:null,
  register,mk,complete,cleanupJobs,jobs,devices,httpServer,receiptTool,splitReceiptTool,
  issueSplit:job=>jhSplitReadReceipts56.issue({job,deviceId:job.targetDeviceId,
    sessionId:job.secureSessionId,commandId:job.commandId,taskDigest:job.taskDigest}),
  splitRead:jhSplitReadStatus56,setReceiptNow:fixtureSetReceiptNow,setDevice:value=>{selectedDevice=value;},
  openDirect:fixtureDirectOpen,openAlias:fixtureAliasOpen,
  wrap:typeof jhLearningHandler56==='function'?jhLearningHandler56:null,
  current:()=>jhCommandContext56.getStore()?.commandId,
  active:()=>jhV2State56.activeMcpCalls,setDurable:value=>{durableAllowed=value;},
  waits:()=>waits,setWait:value=>{waitImpl=value;},setSession:value=>{activeSession=value;}};`, sandbox);
  return sandbox.api;
}
const controller = changes => ({
  invoke: (_call, run) => run(), jobCreated() {}, jobCompleted() {},
  status: async () => ({ installed: true, events: 1 }), close() {}, ...changes,
});

function openReceiptFixture(at = Date.now()) {
  const url = 'https://private.invalid/open-proof';
  return { id: 'job_1', type: 'open_url', status: 'complete', targetDeviceId: 'fixture-device',
    commandId: command, secureSessionId: 'private-session', url, startedAtMs: at - 1000,
    completedAt: new Date(at).toISOString(),
    result: { ok: true, url, rightAddressConfirmed: true, splitScreenRequired: true,
      code: 'RIGHT_ADDRESS_CONFIRMED', body: 'synthetic-private-body', grant: 'synthetic-private-grant',
      splitScreen: { kind: 'split_screen_evidence', version: '1', verified: 'true',
        layout: 'LEFT_RIGHT', chatPackage: 'com.openai.chatgpt', chatKind: 'NATIVE', chatWindowId: '1',
        chatBounds: '0,0,500,900', workPackage: 'com.android.chrome', workWindowId: '2',
        workBounds: '510,0,1000,900', observedAtMs: String(at) } } };
}

function splitReceiptFixture(type = 'split_screen_session_start', at = Date.now()) {
  const { result, completedAt: unused, ...job } = openReceiptFixture(at);
  return {
    job: { ...job, type, status: 'queued', createdAtMs: at - 2000, expiresAtMs: at + 60000,
      mcpToolName: 'life_android_capture_work_window', secureRequestedEffect: 'READ_ONLY', taskDigest: 'b'.repeat(64) },
    result: { ...result, code: 'SPLIT_READ_COMPLETE', contextId: 'ssc_' + 'c'.repeat(32),
      summarySource: 'synthetic-private-screen', resultVerified: true, verifiedOutcome: 'success_verified',
      splitScreen: { ...result.splitScreen, workPackage: 'com.example.work' } },
  };
}

function installSplitFixture(api, fixture) {
  api.devices.set('fixture-device', { secureBridgeVersion: 56 });
  const job = copy(fixture.job); api.jobs.set(job.id, job);
  const receipt = api.issueSplit(job);
  assert.ok(receipt?.receiptRef);
  return { job, receipt };
}

test('outer patch reverses exactly and rejects incomplete, duplicate, or drifted sources', () => {
  const output = applyOperationalLearningPatch(source);
  assert.equal(reverseOperationalLearningPatch(output), source);
  assert.equal(output.split('server.registerTool(').length, source.split('server.registerTool(').length);
  assert.ok(output.includes('finally{jhV2State56.activeMcpCalls--;}'));
  assert.throws(() => applyOperationalLearningPatch(output), /COMPLETE_OPERATOR/);
  assert.throws(() => applyOperationalLearningPatch(source.replace('const computerInspectReceipt56=', 'const other=')), /COMPLETE_OPERATOR/);
  assert.throws(() => applyOperationalLearningPatch(source.replace('  return cacheSet(recentJobs,key,j);', '  return j;')), /ANCHOR_DRIFT/);
  assert.throws(() => applyOperationalLearningPatch(source.replace('    const legacy=jobResult(observed.job);', '    const legacy=jobResult(null);')), /ANCHOR_DRIFT/);
  assert.throws(() => applyOperationalLearningPatch(source + '\n    const legacy=jobResult(observed.job);'), /ANCHOR_DRIFT/);
  assert.throws(() => applyOperationalLearningPatch(source.replace('    return jhSplitReadReceipts56.read({', '    return otherRegistry.read({')), /ANCHOR_DRIFT/);
  assert.throws(() => reverseOperationalLearningPatch(output.replace('let learningJob=null;', 'let learningJob=undefined;')), /REVERSE_ANCHOR/);
  assert.throws(() => applyOperationalLearningPatch(source + '\nconst scoped=jhCommandTool56(name,config,handler);'), /ANCHOR_DRIFT/);
  assert.throws(() => reverseOperationalLearningPatch(output.replace('jhLearningHandler56(name,handler)', 'handler')), /REVERSE_ANCHOR/);
});

test('installation is pre-listen, single use, and detach leaves controller flush to owner', () => {
  const api = host(); let closes = 0;
  assert.throws(() => api.install({}), /CONTROLLER_REQUIRED/);
  api.httpServer.listening = true;
  assert.throws(() => api.install(controller()), /BEFORE_LISTEN/);
  api.httpServer.listening = false;
  api.jobs.set('existing', {});
  assert.throws(() => api.install(controller()), /BEFORE_LISTEN/);
  api.jobs.clear();
  const installed = api.install(controller({ close: () => closes++ }));
  assert.equal(installed.installed, true);
  assert.throws(() => api.install(controller()), /BEFORE_LISTEN/);
  installed.close(); installed.close();
  assert.equal(closes, 0);
  assert.throws(() => api.install(controller()), /BEFORE_LISTEN/);
});

test('without an installed controller handler receiver, arguments and return value are unchanged', async () => {
  const api = host(), receiver = {}, args = [{ private: 'input' }, {}], value = {};
  const wrapped = api.wrap('life_custom', function (...received) {
    assert.equal(this, receiver); assert.deepEqual(received, args); return value;
  });
  assert.equal(await wrapped.apply(receiver, args), value);
});

test('recall invocation is inside command ALS and forwards only four safe call metadata fields', async () => {
  const api = host(), calls = []; let actualArgs, actualExtra;
  api.install(controller({ invoke: (call, run) => { calls.push(copy(call)); return run(); } }));
  const tool = api.register('life_android_workflow_link', (args, extra) => {
    actualArgs = args; actualExtra = extra; return { command: api.current() };
  }, { title: 'preserved', _meta: { custom: 'preserved' } });
  const extra = { requestId: 'request:1', secret: 'extra-secret' };
  const response = await tool.handler({ command_id: command, mode: 'STATUS', text: 'private-text', token: 'private-token' }, extra);
  assert.deepEqual(calls[0], { name: 'life_android_workflow_link', commandId: command, mode: 'STATUS', requestId: 'request:1' });
  assert.equal(response.command, command); assert.equal(actualArgs.text, 'private-text'); assert.equal(actualExtra, extra);
  assert.equal(tool.config.title, 'preserved'); assert.equal(tool.config._meta.custom, 'preserved');
  assert.deepEqual(copy(tool.config.securitySchemes), [{ type: 'oauth2', scopes: ['jh.secure'] }]);
  await tool.handler({ command_id: 'raw-owner-text', mode: 'https://private.invalid/' }, { requestId: 'x'.repeat(129) });
  assert.equal(calls[1].commandId, null); assert.equal(calls[1].mode, null); assert.equal(calls[1].requestId, null);
  await tool.handler({}, { requestId: 42 }); assert.equal(calls[2].requestId, 42);
});

test('controller receives one reusable thunk and can append advice without rerunning the action', async () => {
  const api = host(); let executions = 0;
  const original = { content: [{ type: 'text', text: 'signed result' }] };
  api.install(controller({ invoke: async (_call, run) => {
    const first = run(), second = run(); assert.equal(first, second);
    const value = await first; return { ...value, content: [...value.content, { type: 'text', text: 'advice' }] };
  } }));
  const result = await api.register('life_action', () => { executions++; return original; }).handler({ command_id: command });
  assert.equal(executions, 1); assert.equal(result.content[0], original.content[0]); assert.equal(result.content[1].text, 'advice');
  assert.equal(original.content.length, 1); assert.equal(api.active(), 0);
});

test('controller failure before or after execution preserves exactly one original result', async () => {
  for (const after of [false, true]) {
    const api = host(), original = {}; let executions = 0;
    api.install(controller({ invoke: async (_call, run) => { if (after) await run(); throw Error('store failed'); } }));
    const result = await api.register('life_action', () => { executions++; return original; }).handler({ command_id: command });
    assert.equal(executions, 1); assert.equal(result, original); assert.equal(api.active(), 0);
  }
});

test('controller cannot hide or replace the original exception', async () => {
  const api = host(), failure = new Error('original failure'); let executions = 0;
  api.install(controller({ invoke: async (_call, run) => { try { await run(); } catch {} return { ok: true }; } }));
  await assert.rejects(api.register('life_action', () => { executions++; throw failure; }).handler({}), error => error === failure);
  assert.equal(executions, 1); assert.equal(api.active(), 0);
});

test('observer failure while the action is pending awaits the same execution promise', async () => {
  const api = host(), original = {}; let executions = 0, release;
  const wait = new Promise(resolve => { release = resolve; });
  api.install(controller({ invoke: (_call, run) => { run(); throw Error('observer failed during action'); } }));
  const pending = api.register('life_action', async () => { executions++; await wait; return original; }).handler({});
  await Promise.resolve(); await Promise.resolve();
  assert.equal(executions, 1); assert.equal(api.active(), 1); release();
  assert.equal(await pending, original); assert.equal(executions, 1); assert.equal(api.active(), 0);
});

test('a controller which omits execution cannot replace the original result with a fabricated one', async () => {
  const api = host(), original = {}; let executions = 0;
  api.install(controller({ invoke: async () => ({ ok: true }) }));
  const result = await api.register('life_action', () => { executions++; return original; }).handler({});
  assert.equal(executions, 1); assert.equal(result, original);
});

test('job observation follows real creation, respects deduplication, and never exposes payloads', async () => {
  const api = host(), created = [], completed = [];
  api.install(controller({ jobCreated: meta => created.push(meta), jobCompleted: meta => completed.push(meta) }));
  const tool = api.register('life_android_step', () => api.mk('agent_step', {
    secureSessionId: 'private-session', textValue: 'private-text', url: 'https://private.invalid/',
  }));
  const job = await tool.handler({ command_id: command });
  assert.equal(await tool.handler({ command_id: command }), job);
  assert.equal(created.length, 1);
  assert.deepEqual(copy(created[0]), { id: job.id, type: 'agent_step', commandId: command, status: 'queued' });
  assert.equal(api.complete(job, { result: { ok: true } }, false), 401);
  api.setDurable(false); assert.equal(api.complete(job, { result: { ok: true } }), 409);
  assert.equal(completed.length, 0); assert.equal(job.status, 'queued');
  api.setDurable(true);
  assert.equal(api.complete(job, { result: { ok: true, verifiedOutcome: 'success_verified', code: 'https://private.invalid/' } }), 200);
  assert.equal(completed.length, 1); assert.equal(completed[0].verifiedOutcome, undefined); assert.equal(completed[0].code, undefined);
  assert.match(completed[0].evidenceDigest, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(completed).includes('private'), false); assert.equal(created[0].status, 'queued');
});

test('only reviewed open completion proof can elevate a receipt to verified success', async () => {
  const api = host(), received = [];
  api.install(controller({ jobCompleted: meta => received.push(meta) }));
  const at = Date.now(), url = 'https://example.com/';
  const job = await api.register('life_open_service', () => api.mk('open_url', {
    secureSessionId: 'private-session', url, startedAtMs: at - 1000,
  })).handler({ command_id: command });
  const result = { ok: true, url, rightAddressConfirmed: true, splitScreenRequired: true,
    code: 'RIGHT_ADDRESS_CONFIRMED', splitScreen: { kind: 'split_screen_evidence', version: '1', verified: 'true',
      layout: 'LEFT_RIGHT', chatPackage: 'com.openai.chatgpt', chatKind: 'NATIVE', chatWindowId: '1',
      chatBounds: '0,0,500,900', workPackage: 'com.android.chrome', workWindowId: '2',
      workBounds: '510,0,1000,900', observedAtMs: String(at) } };
  api.complete(job, { result });
  assert.equal(received.at(-1).verifiedOutcome, 'success_verified');
  assert.equal(received.at(-1).code, 'RIGHT_ADDRESS_CONFIRMED');
  api.complete(job, { result: { ...result, url: 'https://other.invalid/' } });
  assert.equal(received.at(-1).verifiedOutcome, undefined);
  api.complete(job, { result: { ...result, splitScreen: { ...result.splitScreen, observedAtMs: String(at - 60000) } } });
  assert.equal(received.at(-1).verifiedOutcome, undefined);
  api.complete(job, { result: { ok: true, rightAddressConfirmed: true } });
  assert.equal(received.at(-1).verifiedOutcome, undefined);
});

test('real open helper and later status forward only the same bounded verified receipt metadata', async () => {
  const api = host(), baseline = host({ learning: false });
  const created = [], completed = [], receipts = [];
  api.install(controller({ jobCreated: meta => created.push(meta), jobCompleted: meta => completed.push(meta),
    receiptObserved: meta => receipts.push(meta) }));
  const fixture = openReceiptFixture(); let job;
  const opened = await api.register('life_open_service', () => {
    job = api.mk('open_url', { secureSessionId: fixture.secureSessionId, url: fixture.url,
      startedAtMs: fixture.startedAtMs });
    assert.equal(api.complete(job, { result: fixture.result }), 200);
    return api.openDirect(job, fixture.url);
  }).handler({ command_id: command });
  const original = await baseline.register('life_open_service', () =>
    baseline.openDirect(copy(job), fixture.url)).handler({ command_id: command });
  assert.deepEqual(copy(opened), copy(original));
  assert.equal(created.length, 1); assert.equal(completed.length, 1); assert.equal(receipts.length, 1);
  assert.equal(Object.isFrozen(receipts[0]), true);
  assert.deepEqual(copy(receipts[0]), copy(completed[0]));
  assert.deepEqual(Object.keys(receipts[0]).sort(),
    ['id', 'type', 'commandId', 'status', 'code', 'evidenceDigest', 'verifiedOutcome'].sort());
  assert.equal(receipts[0].commandId, command); assert.equal(receipts[0].status, 'complete');
  assert.equal(receipts[0].verifiedOutcome, 'success_verified');
  assert.match(receipts[0].evidenceDigest, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(receipts), /private|https:|splitScreen|secureSession|grant|body/);

  baseline.jobs.set(job.id, copy(job));
  const status = api.receiptTool(), originalStatus = baseline.receiptTool();
  const args = { command_id: command, job_id: job.id };
  const snapshot = copy(job);
  for (let i = 0; i < 2; i++) {
    assert.deepEqual(copy(await status.handler(args)), copy(await originalStatus.handler(args)));
  }
  assert.equal(receipts.length, 3);
  assert.deepEqual(copy(receipts[1]), copy(receipts[0]));
  assert.deepEqual(copy(receipts[2]), copy(receipts[0]));
  assert.equal(created.length, 1); assert.equal(completed.length, 1);
  assert.equal(api.jobs.size, 1); assert.equal(api.waits(), 0);
  assert.deepEqual(copy(job), snapshot);
});

test('pending, unverified and changed-binding receipts never reach the learning observer', async () => {
  const cases = [
    { name: 'pending', change: job => { job.status = 'in_progress'; }, code: 'OPEN_COMPLETION_PENDING' },
    { name: 'spoofed success without proof', change: job => {
      job.result = { ok: true, url: job.url, rightAddressConfirmed: true, verifiedOutcome: 'success_verified' };
    }, code: 'OPEN_RESULT_UNCONFIRMED' },
    { name: 'wrong URL', change: job => { job.result.url = 'https://other.invalid/'; }, code: 'OPEN_RESULT_UNCONFIRMED' },
    { name: 'stale proof', change: job => {
      job.result.splitScreen.observedAtMs = String(Number(job.result.splitScreen.observedAtMs) - 60000);
    }, code: 'OPEN_RESULT_UNCONFIRMED' },
    { name: 'wrong command', change: job => { job.commandId = 'b'.repeat(32); }, code: 'OPEN_COMPLETION_BINDING_CHANGED' },
    { name: 'changed session', session: 'different-session', code: 'OPEN_COMPLETION_BINDING_CHANGED' },
    ...['id', 'commandId', 'targetDeviceId', 'secureSessionId'].map(field => ({
      name: 'wait substituted ' + field, change: job => { job.status = 'in_progress'; },
      wait: job => ({ ...job, [field]: 'different-binding' }), code: 'OPEN_COMPLETION_CORRELATION_MISMATCH',
    })),
  ];
  for (const item of cases) {
    const api = host(), baseline = host({ learning: false }); let observations = 0;
    api.install(controller({ receiptObserved: () => observations++ }));
    const job = openReceiptFixture(); item.change?.(job);
    api.jobs.set(job.id, job); baseline.jobs.set(job.id, copy(job));
    for (const current of [api, baseline]) {
      if (item.session) current.setSession(item.session);
      if (item.wait) current.setWait(item.wait);
    }
    const snapshot = copy(job), args = { command_id: command, job_id: job.id };
    const result = await api.receiptTool().handler(args);
    assert.equal(JSON.parse(result.content[0].text).code, item.code, item.name);
    assert.deepEqual(copy(result), copy(await baseline.receiptTool().handler(args)), item.name);
    assert.equal(observations, 0, item.name);
    assert.deepEqual(copy(job), snapshot, item.name);
    assert.equal(api.jobs.size, 1, item.name); assert.equal(api.active(), 0, item.name);
  }
});

test('optional receipt observer absence and sync or async failure preserve the original status result', async () => {
  const modes = ['absent', 'sync', 'async'];
  for (const mode of modes) {
    const api = host(), baseline = host({ learning: false }); let observations = 0;
    const receiptObserved = mode === 'sync' ? () => { observations++; throw Error('private storage failure'); }
      : async () => { observations++; throw Error('private storage failure'); };
    api.install(controller(mode === 'absent' ? {} : { receiptObserved }));
    const job = openReceiptFixture(); api.jobs.set(job.id, job); baseline.jobs.set(job.id, copy(job));
    const snapshot = copy(job), args = { command_id: command, job_id: job.id };
    assert.deepEqual(copy(await api.receiptTool().handler(args)), copy(await baseline.receiptTool().handler(args)), mode);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(observations, mode === 'absent' ? 0 : 1, mode);
    assert.deepEqual(copy(job), snapshot, mode); assert.equal(api.active(), 0, mode);
  }
});

test('patched status helper reconciles one original attempt through the real controller and temporary store', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'jh-learning-open-receipt-'));
  const file = path.join(dir, 'learning.json'), ownerScope = 'fixture-owner-receipt';
  let runtime;
  t.after(async () => { try { await runtime?.close(); } finally { await rm(dir, { recursive: true, force: true }); } });
  runtime = await createServerLearning({ file, ownerScope, runtimeId: 'fixture-open-runtime',
    context: { platform: 'server', version: 'fixture-v1', environment: 'synthetic-test' } });
  const store = new FileLearningStore({ file, ownerScope });
  const api = host(), baseline = host({ learning: false });
  // Simulate a missed completion observation, while keeping the accepted host job.
  api.install({ ...runtime, jobCompleted() {} });
  const fixture = openReceiptFixture(), failure = new Error('synthetic initial wait failure'); let job;
  api.setWait(() => { throw failure; });
  await assert.rejects(api.register('life_open_service', () => {
    job = api.mk('open_url', { secureSessionId: fixture.secureSessionId, url: fixture.url,
      startedAtMs: fixture.startedAtMs });
    return api.openDirect(job, fixture.url);
  }).handler({ command_id: command }), error => error === failure);
  const before = await store.read(), originalAttempt = Object.values(before.attempts)[0];
  assert.equal(Object.keys(before.attempts).length, 1);
  assert.equal(originalAttempt.outcome, 'completion_unknown');
  assert.equal(originalAttempt.operation, 'life_open_service');
  assert.equal(api.complete(job, { result: fixture.result }), 200);
  assert.equal((await store.read()).revision, before.revision);
  api.setWait(async value => value);
  baseline.jobs.set(job.id, copy(job));
  const status = api.receiptTool(), args = { command_id: command, job_id: job.id };
  const result = await status.handler(args);
  assert.deepEqual(copy(result), copy(await baseline.receiptTool().handler(args)));
  const after = await store.read(), reconciled = Object.values(after.attempts)[0];
  assert.equal(Object.keys(after.attempts).length, 1);
  assert.equal(Object.keys(after.events).length, Object.keys(before.events).length + 1);
  assert.equal(reconciled.attemptId, originalAttempt.attemptId);
  for (const field of ['taskId', 'operation', 'domain', 'engine', 'context']) {
    assert.deepEqual(reconciled[field], originalAttempt[field], field);
  }
  assert.equal(reconciled.outcome, 'success_verified');
  assert.match(reconciled.evidenceRefs[0], /^sha256:[a-f0-9]{64}$/);
  const bytes = await readFile(file, 'utf8');
  await status.handler(args);
  assert.equal(await readFile(file, 'utf8'), bytes);
  assert.doesNotMatch(bytes, /private-session|private\.invalid|synthetic-private-body|synthetic-private-grant/);
  assert.equal(api.jobs.size, 1); assert.equal(api.waits(), 1);
  assert.equal((await runtime.status()).degraded, false);
});

test('actual split START and STATUS receipt paths report bounded layout scope without task success', async () => {
  for (const type of ['split_screen_session_start', 'split_screen_session_status']) {
    const api = host(), baseline = host({ learning: false }), completed = [], observations = [];
    api.install(controller({ jobCompleted: meta => completed.push(meta), receiptObserved: meta => observations.push(meta) }));
    const fixture = splitReceiptFixture(type);
    const { job, receipt } = installSplitFixture(api, fixture);
    const original = installSplitFixture(baseline, fixture);
    assert.equal(api.complete(job, { result: fixture.result }, false), 401);
    assert.equal(completed.length, 0); assert.equal(observations.length, 0);
    assert.equal(api.complete(job, { result: fixture.result }), 200);
    Object.assign(original.job, copy(job));
    assert.equal(completed.length, 1);
    assert.equal(Object.hasOwn(completed[0], 'verifiedOutcome'), false);
    assert.equal(Object.hasOwn(completed[0], 'verifiedObservationScope'), false);
    const args = type === 'split_screen_session_start'
      ? { command_id: command, mode: 'READBACK_PENDING', receipt_ref: receipt.receiptRef }
      : { command_id: command, mode: 'STATUS', context_id: receipt.receiptRef };
    const before = copy(job), status = api.splitReceiptTool();
    const result = await status.handler(args);
    assert.deepEqual(copy(result), copy(await baseline.splitReceiptTool().handler(args)));
    assert.equal(JSON.parse(result.content[0].text).receiptRecovered, true);
    assert.equal(observations.length, 1);
    const meta = observations[0];
    assert.equal(Object.isFrozen(meta), true);
    assert.deepEqual(Object.keys(meta).sort(),
      ['id', 'type', 'commandId', 'status', 'evidenceDigest', 'verifiedObservationScope'].sort());
    assert.equal(meta.verifiedObservationScope, 'SPLIT_READ_LAYOUT_ONLY');
    assert.equal(meta.type, type); assert.equal(meta.commandId, command); assert.equal(meta.status, 'complete');
    assert.equal(meta.evidenceDigest, completed[0].evidenceDigest);
    assert.doesNotMatch(JSON.stringify(meta), /private|https:|"secureSessionId"|"sessionId"|receiptRef|taskDigest|summarySource|splitScreen|verifiedOutcome/);
    await status.handler(args);
    assert.deepEqual(copy(observations[1]), copy(meta));
    assert.deepEqual(copy(job), before); assert.equal(api.jobs.size, 1); assert.equal(api.waits(), 0);
  }
});

test('split observer preserves denials and cannot use changed bindings, stale proof, flags or another snapshot', async () => {
  const cases = [
    { name: 'pending', change: (_api, job) => { job.status = 'in_progress'; }, code: 'SPLIT_READ_STILL_PENDING' },
    { name: 'terminal unknown', change: (_api, job) => { job.status = 'expired'; }, code: 'SPLIT_READ_TERMINAL_UNCONFIRMED' },
    { name: 'device failure', change: (_api, job) => { job.result.ok = false; }, code: 'SPLIT_READ_DEVICE_REPORTED_FAILURE' },
    { name: 'stale at current time', change: (_api, job) => {
      job.result.splitScreen.observedAtMs = String(Date.now() - 60000);
      job.completedAt = new Date(Number(job.result.splitScreen.observedAtMs)).toISOString();
    }, code: 'SPLIT_READ_SCREEN_PROOF_INVALID' },
    { name: 'future proof', change: (_api, job) => {
      job.result.splitScreen.observedAtMs = String(Date.now() + 60000);
    }, code: 'SPLIT_READ_SCREEN_PROOF_INVALID' },
    { name: 'wrong layout', change: (_api, job) => { job.result.splitScreen.workBounds = '0,0,500,900'; }, code: 'SPLIT_READ_SCREEN_PROOF_INVALID' },
    { name: 'forged result flags', change: (_api, job) => {
      delete job.result.splitScreen;
      Object.assign(job.result, { resultVerified: true, verifiedOutcome: 'success_verified',
        verifiedObservationScope: 'SPLIT_READ_LAYOUT_ONLY', receiptRecovered: true, readOnly: true,
        automaticReplay: false, newJobCreated: false });
    }, code: 'SPLIT_READ_SCREEN_PROOF_INVALID' },
    { name: 'expired receipt', change: (api, _job, receipt) => api.setReceiptNow(receipt.expiresAt), code: 'SPLIT_READ_RECEIPT_UNAVAILABLE' },
    { name: 'current command changed', change: (_api, _job, _receipt, args) => { args.command_id = 'd'.repeat(32); }, code: 'SPLIT_READ_RECEIPT_SCOPE_CHANGED' },
    { name: 'current session changed', change: api => api.setSession('different-session'), code: 'SPLIT_READ_RECEIPT_SCOPE_CHANGED' },
    { name: 'current device changed', change: api => {
      api.devices.set('other-device', { secureBridgeVersion: 56 }); api.setDevice('other-device');
    }, code: 'SPLIT_READ_RECEIPT_SCOPE_CHANGED' },
    ...[['commandId', 'e'.repeat(32)], ['secureSessionId', 'other-session'], ['targetDeviceId', 'other-device'],
      ['taskDigest', 'e'.repeat(64)], ['type', 'agent_snapshot']].map(([key, value]) => ({
      name: 'original ' + key + ' changed', change: (_api, job) => { job[key] = value; }, code: 'SPLIT_READ_ORIGINAL_JOB_CHANGED',
    })),
    { name: 'original missing', change: (api, job) => api.jobs.delete(job.id), code: 'SPLIT_READ_ORIGINAL_JOB_CHANGED' },
    { name: 'wrong secure tool', change: (_api, job) => { job.mcpToolName = 'life_android_execute_computer_action'; }, layoutReturned: true },
    { name: 'wrong effect', change: (_api, job) => { job.secureRequestedEffect = 'REVERSIBLE_WRITE'; }, layoutReturned: true },
  ];
  for (const item of cases) {
    const api = host(), baseline = host({ learning: false }); let observations = 0;
    api.install(controller({ receiptObserved: () => observations++ }));
    const fixture = splitReceiptFixture(), setup = [];
    for (const current of [api, baseline]) {
      const { job, receipt } = installSplitFixture(current, fixture);
      assert.equal(current.complete(job, { result: copy(fixture.result) }), 200);
      // Another complete snapshot is deliberately available; it cannot replace
      // the original receipt's proof or its job/task binding.
      current.jobs.set('job_9', { ...copy(job), id: 'job_9', type: 'agent_snapshot' });
      const args = { command_id: command, mode: 'READBACK_PENDING', receipt_ref: receipt.receiptRef };
      item.change?.(current, job, receipt, args);
      setup.push({ job, args, size: current.jobs.size });
    }
    // Keep response byte comparisons deterministic for the time-changing cases.
    Object.assign(setup[1].job, copy(setup[0].job));
    const lookups = [], get = api.jobs.get.bind(api.jobs);
    api.jobs.get = id => { lookups.push(id); return get(id); };
    const before = copy(setup[0].job);
    const result = await api.splitReceiptTool().handler(setup[0].args);
    assert.deepEqual(copy(result), copy(await baseline.splitReceiptTool().handler(setup[1].args)), item.name);
    const body = JSON.parse(result.content[0].text);
    assert.equal(body.ok, item.layoutReturned === true, item.name);
    if (item.code) assert.equal(body.code, item.code, item.name);
    assert.equal(observations, 0, item.name);
    assert.equal(lookups.includes('job_9'), false, item.name);
    assert.equal(api.jobs.size, setup[0].size, item.name); assert.equal(api.waits(), 0, item.name);
    assert.deepEqual(copy(setup[0].job), before, item.name);
  }
});

test('optional split observer absence or failure leaves the original receipt and job unchanged', async () => {
  for (const mode of ['absent', 'sync', 'async']) {
    const api = host(), baseline = host({ learning: false }); let observations = 0;
    const receiptObserved = mode === 'sync' ? () => { observations++; throw Error('synthetic observer failure'); }
      : async () => { observations++; throw Error('synthetic observer failure'); };
    api.install(controller(mode === 'absent' ? {} : { receiptObserved }));
    const fixture = splitReceiptFixture(), { job, receipt } = installSplitFixture(api, fixture);
    const original = installSplitFixture(baseline, fixture);
    api.complete(job, { result: fixture.result }); Object.assign(original.job, copy(job));
    const before = copy(job), args = { command_id: command, mode: 'READBACK_PENDING', receipt_ref: receipt.receiptRef };
    assert.deepEqual(copy(await api.splitReceiptTool().handler(args)), copy(await baseline.splitReceiptTool().handler(args)), mode);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(observations, mode === 'absent' ? 0 : 1, mode);
    assert.deepEqual(copy(job), before, mode); assert.equal(api.waits(), 0, mode);
  }
});

test('real split helper/controller/store records layout observation once without success or phantom attempts', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'jh-learning-split-layout-'));
  const runtimes = [];
  t.after(async () => {
    try { for (const runtime of runtimes) await runtime.close(); }
    finally { await rm(dir, { recursive: true, force: true }); }
  });
  for (const missedCompletion of [false, true]) {
    const file = path.join(dir, missedCompletion ? 'missed.json' : 'completed.json');
    const ownerScope = 'fixture-owner-split-layout';
    const runtime = await createServerLearning({ file, ownerScope, runtimeId: 'fixture-split-runtime',
      context: { platform: 'server', version: 'fixture-v1', environment: 'synthetic-test' } });
    runtimes.push(runtime);
    const store = new FileLearningStore({ file, ownerScope }), api = host();
    api.install(missedCompletion ? { ...runtime, jobCompleted() {} } : runtime);
    api.devices.set('fixture-device', { secureBridgeVersion: 56 });
    const fixture = splitReceiptFixture(), failure = new Error('synthetic initial split wait failed'); let job;
    const { id: unusedId, type, status: unusedStatus, commandId: unusedCommand, ...payload } = fixture.job;
    const pending = api.register('life_android_split_screen_assistant', () => {
      job = api.mk(type, payload);
      if (missedCompletion) throw failure;
      return job;
    }).handler({ command_id: command, mode: 'START' });
    if (missedCompletion) await assert.rejects(pending, error => error === failure); else await pending;
    const receipt = api.issueSplit(job); assert.ok(receipt);
    assert.equal(api.complete(job, { result: fixture.result }), 200);
    await runtime.status();
    const before = await store.read(), prior = Object.values(before.attempts)[0];
    assert.equal(Object.keys(before.attempts).length, 1);
    assert.equal(prior.outcome, missedCompletion ? 'completion_unknown' : 'observed');
    assert.equal(prior.evidenceRefs.includes('source:jh-split-read-layout-only'), false);
    const status = api.splitReceiptTool(), args = { command_id: command, mode: 'READBACK_PENDING', receipt_ref: receipt.receiptRef };
    const returned = await status.handler(args);
    assert.equal(JSON.parse(returned.content[0].text).receiptRecovered, true);
    const after = await store.read(), observed = Object.values(after.attempts)[0];
    assert.equal(Object.keys(after.attempts).length, 1);
    assert.equal(Object.keys(after.events).length, Object.keys(before.events).length + 1);
    assert.equal(observed.attemptId, prior.attemptId);
    for (const field of ['taskId', 'operation', 'domain', 'engine', 'context']) assert.deepEqual(observed[field], prior[field], field);
    assert.equal(observed.outcome, 'observed');
    assert.equal(observed.evidenceRefs.includes('source:jh-split-read-layout-only'), true);
    assert.ok(observed.evidenceRefs.some(ref => /^sha256:[a-f0-9]{64}$/.test(ref)));
    const bytes = await readFile(file, 'utf8');
    await status.handler(args);
    assert.equal(await readFile(file, 'utf8'), bytes);
    assert.doesNotMatch(bytes, /success_verified|private-session|private\.invalid|synthetic-private|srr_/);

    // A valid host receipt with no original learning attempt must stay absent.
    const phantom = splitReceiptFixture('split_screen_session_status');
    phantom.job.id = 'job_2'; api.jobs.set(phantom.job.id, phantom.job);
    const phantomReceipt = api.issueSplit(phantom.job); assert.ok(phantomReceipt);
    Object.assign(phantom.job, { status: 'complete', result: phantom.result, completedAt: new Date().toISOString() });
    await status.handler({ ...args, receipt_ref: phantomReceipt.receiptRef });
    assert.equal(await readFile(file, 'utf8'), bytes);
    assert.equal((await runtime.status()).degraded, false);
    assert.equal(api.waits(), 0);
  }
});

test('existing cleanup observes expired/error outcomes before retention removal without creating jobs', async () => {
  const api = host(), received = []; let creations = 0;
  api.install(controller({ jobCreated: () => creations++, jobCompleted: meta => received.push(copy(meta)) }));
  const job = await api.register('life_action', () => api.mk('agent_step', { createdAtMs: Date.now() - 100000 })).handler({ command_id: command });
  api.cleanupJobs();
  assert.equal(job.status, 'expired'); assert.equal(creations, 1);
  assert.deepEqual(received[0], { id: job.id, type: 'agent_step', commandId: command, status: 'expired', code: 'job_timeout' });
  api.cleanupJobs(); // A later observation may recover a failed memory write; controller deduplicates it.
  assert.deepEqual(received[1], received[0]); assert.equal(creations, 1);
  job.status = 'error'; job.error = 'HOST_ERROR'; job.completedAt = new Date(Date.now() - 700000).toISOString();
  api.cleanupJobs();
  assert.equal(received.at(-1).status, 'error'); assert.equal(received.at(-1).code, 'HOST_ERROR');
  assert.equal(api.jobs.has(job.id), false); assert.equal(creations, 1);
});

test('sync and async observer failures leave created jobs and accepted responses intact', async () => {
  const api = host();
  api.install(controller({ jobCreated() { throw Error('storage'); }, jobCompleted: async () => { throw Error('storage'); } }));
  const job = await api.register('life_step', () => api.mk('agent_step', { secureSessionId: 'private' })).handler({ command_id: command });
  const result = { ok: true };
  assert.equal(api.complete(job, { result }), 200); assert.equal(job.result, result); assert.equal(api.jobs.size, 1);
  await new Promise(resolve => setImmediate(resolve));
});

test('life_status adds diagnostics while preserving existing payload, signed data and advice', async () => {
  const api = host(), structuredContent = { opaqueSigned: 'keep' };
  const original = { content: [{ type: 'text', text: JSON.stringify({ browser: 'ready', version: 'existing', nested: { keep: 1 } }) }], structuredContent, _meta: { keep: 1 } };
  api.install(controller({ invoke: async (_call, run) => {
    const result = await run(); return { ...result, content: [...result.content, { type: 'text', text: 'recall advice' }] };
  } }));
  const result = await api.register('life_status', () => original).handler({});
  assert.deepEqual(JSON.parse(result.content[0].text), { browser: 'ready', version: 'existing', nested: { keep: 1 }, operationalLearning: { installed: true, events: 1 } });
  assert.equal(result.structuredContent, structuredContent); assert.equal(result._meta, original._meta);
  assert.equal(result.content[1].text, 'recall advice'); assert.equal(original.content.length, 1);
  assert.equal(JSON.parse(original.content[0].text).operationalLearning, undefined);
});

test('unavailable status exposes only a degraded code and never fails the original status tool', async () => {
  const api = host();
  api.install(controller({ status: async () => { throw Error('private path and token'); } }));
  const result = await api.register('life_status', () => ({ content: [{ type: 'text', text: '{"browser":"ready"}' }] })).handler({});
  assert.deepEqual(JSON.parse(result.content[0].text), { browser: 'ready', operationalLearning: { status: 'degraded', code: 'LEARNING_UNAVAILABLE', replay: false } });
  assert.equal(JSON.stringify(result).includes('private'), false);
});

test('concurrent calls retain distinct command context and the original active-call accounting', async () => {
  const api = host(), seen = []; let release;
  const wait = new Promise(resolve => { release = resolve; });
  api.install(controller({ invoke: async (call, run) => { seen.push(call.commandId); await wait; return run(); } }));
  const tool = api.register('life_action', () => api.current());
  const first = tool.handler({ command_id: command });
  const secondCommand = 'b'.repeat(32), second = tool.handler({ command_id: secondCommand });
  assert.equal(api.active(), 2); release();
  assert.deepEqual(await Promise.all([first, second]), [command, secondCommand]);
  assert.deepEqual(seen, [command, secondCommand]); assert.equal(api.active(), 0);
});
