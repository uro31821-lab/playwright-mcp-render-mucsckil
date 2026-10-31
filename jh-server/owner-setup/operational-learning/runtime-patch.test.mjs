import test from 'node:test';
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { applyOperationalLearningPatch, reverseOperationalLearningPatch } from './runtime-patch.mjs';
import { describeOpenCompletion } from '../deployment/jh167-open-completion.mjs';

const command = 'a'.repeat(32);
const copy = value => JSON.parse(JSON.stringify(value));
// Small executable host fixture: no HTTP server, sockets, files, or device tools.
// Exact production insertion anchors retain authentication/admission ordering.
const source = String.raw`
const jobs=new Map(),devices=new Map(),recentJobs=new Map();
const httpServer={listening:false};
const pendingApprovalReceipts56=createPendingApprovalReceiptRegistry56();
const jhSplitReadReceipts56=createSplitReadReceiptRegistry56();
const computerInspectReceipt56=createComputerInspectReceiptRegistry56();
const jhCommandContext56=new JhAsyncLocalStorage56();
const jhV2State56={activeMcpCalls:0,lastMcpAt:0};
const JOB_TTL_MS=90000,COMPLETED_JOB_RETENTION_MS=600000;
let sequence=0,durableAllowed=true;
const durableNativeHooks56={beforeDispatch:()=>({allowed:durableAllowed}),acceptedCompletion:()=>({allowed:durableAllowed})};
function jhRequireCommand56(){return jhCommandContext56.getStore()?.commandId;}
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
  const id='job_'+(++sequence),j={id,type,status:'queued',...p,commandId:jhRequireCommand56()};
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
`;

function host() {
  const patched = applyOperationalLearningPatch(source);
  const executable = patched.replace(/^(?:import[^\n]+\n)+/, '').replace('export function installOperationalLearning56', 'function installOperationalLearning56');
  const sandbox = {
    JhAsyncLocalStorage56: AsyncLocalStorage,
    jhLearningDescribeOpen56: describeOpenCompletion,
    sha56: value => createHash('sha256').update(value).digest('hex'),
    stable56: JSON.stringify,
    createPendingApprovalReceiptRegistry56: () => ({}),
    createSplitReadReceiptRegistry56: () => ({}),
    createComputerInspectReceiptRegistry56: () => ({}),
  };
  runInNewContext('"use strict";\n' + executable + `
globalThis.api={install:installOperationalLearning56,register,mk,complete,cleanupJobs,jobs,devices,httpServer,
  wrap:jhLearningHandler56,current:()=>jhCommandContext56.getStore()?.commandId,
  active:()=>jhV2State56.activeMcpCalls,setDurable:value=>{durableAllowed=value;}};`, sandbox);
  return sandbox.api;
}
const controller = changes => ({
  invoke: (_call, run) => run(), jobCreated() {}, jobCompleted() {},
  status: async () => ({ installed: true, events: 1 }), close() {}, ...changes,
});

test('outer patch reverses exactly and rejects incomplete, duplicate, or drifted sources', () => {
  const output = applyOperationalLearningPatch(source);
  assert.equal(reverseOperationalLearningPatch(output), source);
  assert.equal(output.split('server.registerTool(').length, source.split('server.registerTool(').length);
  assert.ok(output.includes('finally{jhV2State56.activeMcpCalls--;}'));
  assert.throws(() => applyOperationalLearningPatch(output), /COMPLETE_OPERATOR/);
  assert.throws(() => applyOperationalLearningPatch(source.replace('const computerInspectReceipt56=', 'const other=')), /COMPLETE_OPERATOR/);
  assert.throws(() => applyOperationalLearningPatch(source.replace('  return cacheSet(recentJobs,key,j);', '  return j;')), /ANCHOR_DRIFT/);
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
