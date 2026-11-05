/** Explicit candidate composition over the FINAL generated Secure56 source.
 * Nothing imports/applies this overlay from the production startup. It adds no
 * MCP tool, executor, grant, command or durable journal. The existing OAuth,
 * command wrapper, accounting handler and signed completion path stay intact.
 */
import {AsyncLocalStorage} from 'node:async_hooks';
import {isDeepStrictEqual} from 'node:util';
import {createHash} from 'node:crypto';
import {createJebiseoOriginalHostBinding} from './original-host-binding.mjs';
import {JEBISEO_ORIGINAL_MOBILE_TOOLS, unwrapJebiseoMobileReply} from './mobile-port.mjs';

export const JEBISEO_ORIGINAL_HOST_CANDIDATE_MODE = 'EXPLICIT_JEBISEO_HOST_CANDIDATE_V1';
const allowed = new Set(JEBISEO_ORIGINAL_MOBILE_TOOLS);
const effectTools = new Set(['life_web_navigate', 'life_android_open', 'life_android_step',
  'life_android_action_approval_request', 'life_android_execute_computer_action']);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = code => {throw new Error(code);};

/** Host-only boundary. The source overlay supplies the actual private readers;
 * callers cannot supply a registry, authenticated flag or job through its public
 * installer. Closures and raw jobs never cross the returned candidate facade.
 * Creating this object performs no I/O and invokes no original handler.
 */
export function createJebiseoOriginalHostBoundary({readCurrentState, readOriginalJobs,
  canInstall, now = Date.now} = {}) {
  if ([readCurrentState, readOriginalJobs, canInstall, now].some(fn => typeof fn !== 'function'))
    fail('JEBISEO_ORIGINAL_HOST_READERS_REQUIRED');
  const httpScope = new AsyncLocalStorage(), toolScope = new AsyncLocalStorage();
  const invocationScope = new AsyncLocalStorage();
  const registries = new WeakMap(), serverRegistries = new WeakMap();
  const returned = new WeakMap(), snapshotScopes = new WeakMap();
  let installed = false, closed = false, binding = null, registryCount = 0;

  function current() {
    const scope = toolScope.getStore();
    return installed && !closed && scope?.live === true && scope.http.live === true &&
      scope.capability.extra?.signal?.aborted !== true &&
      scope.http.authenticated === true && httpScope.getStore() === scope.http ? scope : null;
  }
  function requestScope() {return current()?.capability ?? null;}
  function ownerIdentity(state) {
    if (!plain(state) || typeof state.deviceId !== 'string' || !state.deviceId ||
        !/^[a-f0-9]{32}$/.test(state.commandId ?? '') ||
        typeof state.secureSessionId !== 'string' || !state.secureSessionId ||
        !/^[a-f0-9]{64}$/.test(state.runtimeId ?? '') ||
        !/^[a-f0-9]{64}$/.test(state.deviceDigest ?? '') ||
        state.sessionDeviceDigest !== state.deviceDigest || state.secureBridgeVersion !== 56)
      fail('JEBISEO_ORIGINAL_JOB_BINDING_CHANGED');
    return Object.freeze({deviceId: state.deviceId, commandId: state.commandId,
      secureSessionId: state.secureSessionId, runtimeId: state.runtimeId,
      deviceDigest: state.deviceDigest});
  }
  function remember(raw, name, args, scope, invocation) {
    if (!plain(raw)) return;
    try {returned.set(raw, {name, args: structuredClone(args),
      raw: structuredClone(raw), capability: scope.capability, invocation});} catch {}
    // Failure to retain evidence never changes/retries the original result.
  }
  function getOriginalTool(name) {
    const scope = current();
    const entry = scope && allowed.has(name) ? registries.get(scope.http.registry)?.get(name) : null;
    if (!entry) return null;
    const capability = scope.capability;
    return Object.freeze({schema: entry.schema, handler: async args => {
      if (requestScope() !== capability) fail('JEBISEO_AUTHENTICATED_REQUEST_REQUIRED');
      // Schema parsing belongs to the binding adapter. Preserve its parsed
      // arguments and the REAL SDK extras; no caller-supplied extras are used.
      const originalArgs = structuredClone(args);
      const state = readCurrentState();
      const invocation = Object.freeze({requestScope: capability, toolName: name,
        owner: ownerIdentity(state), durableHooks: state.durableHooks,
        arguments: Object.freeze(structuredClone(originalArgs))});
      const raw = await invocationScope.run(invocation, () => entry.handler(args, capability.extra));
      if (requestScope() === capability) remember(raw, name, originalArgs, scope, invocation);
      return raw;
    }});
  }
  function findOriginalReturnedJob({raw, toolName, args, requestScope: expected} = {}) {
    const scope = current(), record = plain(raw) ? returned.get(raw) : null;
    if (!scope || expected !== scope.capability || !record || record.capability !== expected ||
        record.name !== toolName || !isDeepStrictEqual(record.args, args) ||
        !isDeepStrictEqual(record.raw, raw)) return null;
    const payload = unwrapJebiseoMobileReply(raw);
    if (!plain(payload)) return null;
    // Only original envelope locations; never recurse into page/result text.
    const envelopes = [payload, ...(plain(payload.job) ? [payload.job] : [])];
    const digests = new Set(), ids = new Set();
    for (const envelope of envelopes) {
      for (const key of ['idDigest', 'jobDigest']) {
        if (!Object.hasOwn(envelope, key)) continue;
        if (!/^[a-f0-9]{64}$/.test(envelope[key] ?? '')) return null;
        digests.add(envelope[key]);
      }
      if (Object.hasOwn(envelope, 'jobId')) {
        if (!/^job_[0-9]+$/.test(envelope.jobId ?? '')) return null;
        ids.add(envelope.jobId);
      }
    }
    if (digests.size > 1 || ids.size > 1 || (!digests.size && !ids.size)) return null;
    const id = [...ids][0], digest = [...digests][0];
    if (id && digest && hash(id) !== digest) return null;
    const jobs = readOriginalJobs();
    if (!(jobs instanceof Map)) return null;
    let found = null;
    for (const job of jobs.values()) {
      if (!plain(job) || typeof job.id !== 'string' || jobs.get(job.id) !== job ||
          (id && job.id !== id) || (digest && hash(job.id) !== digest)) continue;
      if (found) return null;
      found = job;
    }
    // A cached old snapshot is not a new observation, even in the same HTTP
    // request or millisecond. Only this invocation's actual original mk counts.
    if (['life_android_snapshot', 'life_android_open', 'life_android_computer_inspect'].includes(toolName) &&
        snapshotScopes.get(found)?.invocation !== record.invocation) return null;
    return found;
  }
  function install({mode} = {}) {
    if (mode !== JEBISEO_ORIGINAL_HOST_CANDIDATE_MODE)
      fail('JEBISEO_EXPLICIT_HOST_CANDIDATE_REQUIRED');
    if (installed || closed || registryCount !== 0 || canInstall() !== true)
      fail('JEBISEO_HOST_INSTALL_BEFORE_LISTEN_ONLY');
    binding = createJebiseoOriginalHostBinding({getOriginalTool,
      readCurrentState: () => current() ? readCurrentState() : null,
      findOriginalReturnedJob,
      readAuthenticatedRequestScope: requestScope,
      readOriginalJob: id => current() ? readOriginalJobs().get(id) ?? null : null,
      readOriginalJobScope: job => current() ? snapshotScopes.get(job) ?? null : null,
      now});
    installed = true;
    return Object.freeze({installed: true, codeCandidate: true,
      productionRegistered: false, automaticReplay: false,
      createRuntime(task) {
        if (!current()) fail('JEBISEO_AUTHENTICATED_REQUEST_REQUIRED');
        return binding.createRuntime(task);
      },
      createHandoffRuntime(input) {
        if (!current()) fail('JEBISEO_AUTHENTICATED_REQUEST_REQUIRED');
        return binding.createHandoffRuntime(input);
      },
      close() {closed = true; binding = null;}
    });
  }
  function createRegistry() {
    registryCount++;
    const registry = Object.freeze({capture(name, schema, handler) {
      const entries = registries.get(registry);
      if (!entries || typeof name !== 'string' || typeof handler !== 'function' ||
          typeof schema?.parse !== 'function') fail('JEBISEO_ORIGINAL_REGISTRATION_INVALID');
      if (entries.has(name)) fail('JEBISEO_ORIGINAL_REGISTRATION_DUPLICATE');
      entries.set(name, Object.freeze({schema, handler}));
      // Before explicit installation, original callback identity is unchanged.
      if (!installed || closed) return handler;
      return async function(...args) {
        const http = httpScope.getStore();
        if (!http?.live || http.authenticated !== true || http.registry !== registry)
          return handler.apply(this, args);
        const capability = Object.freeze({authenticated: true,
          requestId: args[1]?.requestId ?? http.requestId ?? null, extra: args[1]});
        const scope = {http, capability, live: true};
        return toolScope.run(scope, async () => {
          try {return await handler.apply(this, args);} finally {scope.live = false;}
        });
      };
    }});
    registries.set(registry, new Map());
    return registry;
  }
  function bindServer(server, registry) {
    if (!plain(server) || !registries.has(registry) || serverRegistries.has(server))
      fail('JEBISEO_ORIGINAL_REGISTRY_REQUIRED');
    serverRegistries.set(server, registry);
  }
  async function withAuthenticatedRequest(server, authorized, parsedBody, request, response, callback) {
    if (typeof callback !== 'function') fail('JEBISEO_ORIGINAL_REQUEST_CALLBACK_REQUIRED');
    // Public unauthenticated catalog behavior remains the original SDK path.
    if (!installed || closed || authorized !== true) return callback();
    const registry = serverRegistries.get(server);
    if (!registry) fail('JEBISEO_ORIGINAL_REGISTRY_REQUIRED');
    if (![request, response].every(value => typeof value?.once === 'function' && typeof value?.off === 'function'))
      fail('JEBISEO_ORIGINAL_HTTP_REQUEST_REQUIRED');
    const scope = {registry, authenticated: true, live: true,
      requestId: plain(parsedBody) ? parsedBody.id ?? null : null};
    const detach = () => {
      request.off('aborted', ended);
      response.off('close', ended);
      response.off('finish', ended);
    };
    const ended = () => {scope.live = false; detach();};
    request.once('aborted', ended);
    response.once('close', ended);
    response.once('finish', ended);
    // IncomingMessage may normally close after its body was consumed. Do not
    // treat that as a disconnect; the response lifetime remains authoritative.
    if (request.aborted === true || (request.destroyed === true && request.complete !== true) ||
        response.destroyed === true || response.writableEnded === true || response.writableFinished === true)
      ended();
    return httpScope.run(scope, async () => {
      try {return await callback();} finally {ended();}
    });
  }
  function captureOriginalJobScope(job, commandContext) {
    const invocation = invocationScope.getStore();
    // Original public calls outside a candidate invocation keep their complete
    // original behavior. Never mistake a CLOSED candidate scope for no scope.
    if (!invocation) return;
    const scope = current();
    if (!scope || invocation.requestScope !== scope.capability)
      fail('JEBISEO_AUTHENTICATED_REQUEST_REQUIRED');
    const state = readCurrentState();
    if (!isDeepStrictEqual(ownerIdentity(state), invocation.owner) ||
        !commandContext || commandContext.used !== true ||
        commandContext.device !== state.deviceId ||
        commandContext.commandId !== state.commandId || commandContext.version !== state.commandId ||
        job?.targetDeviceId !== state.deviceId || job.secureSessionId !== state.secureSessionId ||
        (job.type === 'agent_snapshot' ? job.commandId !== undefined && job.commandId !== state.commandId
          : job.commandId !== state.commandId) ||
        (job.targetDeviceDigest !== undefined && job.targetDeviceDigest !== null &&
          job.targetDeviceDigest !== state.deviceDigest))
      fail('JEBISEO_ORIGINAL_JOB_BINDING_CHANGED');
    if (effectTools.has(invocation.toolName)) {
      const focus = state.focus;
      if (focus?.state !== 'observed' || focus.present !== true || focus.active !== true ||
          focus.currentCommandMatches !== true || !Number.isFinite(focus.remainingMs) || focus.remainingMs <= 0 ||
          state.durableHooks !== invocation.durableHooks ||
          typeof state.durableHooks?.uncertainEffectsForMaintenance !== 'function')
        fail('JEBISEO_ORIGINAL_JOB_PROTECTION_CHANGED');
      let live;
      try {live = state.durableHooks.uncertainEffectsForMaintenance();} catch {}
      if (!Number.isSafeInteger(live) || live < 0) fail('JEBISEO_ORIGINAL_JOB_PROTECTION_CHANGED');
    }
    if (invocation.toolName === 'life_android_open' &&
        (job.type !== 'open_url' || invocation.arguments.url !== '' || job.url !== '' ||
          job.target !== invocation.arguments.target))
      fail('JEBISEO_ORIGINAL_APP_JOB_CHANGED');
    if (invocation.toolName === 'life_android_computer_inspect' && invocation.arguments.action === 'WAIT') {
      const fixed = {action: 'WAIT', effect: 'READ_ONLY', dataClass: 'NONE',
        mcpToolName: 'life_android_computer_inspect', secureRequestedEffect: 'READ_ONLY',
        taskId: invocation.arguments.task_digest, taskDigest: invocation.arguments.task_digest,
        index: 0, viewportWidth: 0, viewportHeight: 0, scrollX: 0, scrollY: 0, waitMs: 0,
        maxActionsInCall: 1, containsCredential: false};
      if (job.type !== 'computer_use_inspect' ||
          Object.entries(fixed).some(([key, value]) => job[key] !== value) ||
          ['x', 'y', 'keys', 'dragPath', 'textDigest', 'textValue', 'basedOnScreenshotDigest',
            'currentScreenshotDigest', 'screenGrantToken', 'actionApprovalGrantToken',
            'requestToken', 'runDigest', 'leaseToken', 'screenConsentDigest', 'localActionApprovalDigest']
            .some(key => Object.hasOwn(job, key)))
        fail('JEBISEO_ORIGINAL_APP_OBSERVATION_CHANGED');
    }
    // This runs after original signing/capture but BEFORE jobs.set/queueing.
    // The observer never changes the signed job or reserves a journal row.
    const expected = {life_android_snapshot: 'agent_snapshot', life_android_open: 'open_url',
      life_android_computer_inspect: 'computer_use_inspect'}[invocation.toolName];
    if (job.type !== expected || snapshotScopes.has(job)) return;
    snapshotScopes.set(job, Object.freeze({commandId: state.commandId, deviceId: state.deviceId,
      secureSessionId: state.secureSessionId, runtimeId: state.runtimeId,
      requestScope: scope.capability, invocation}));
  }
  return Object.freeze({install, createRegistry, bindServer, withAuthenticatedRequest,
    captureOriginalJobScope});
}

const PREFIX = 'import {createJebiseoOriginalHostBoundary as jhCreateJebiseoOriginalHost56} from "../jebiseo/original-host-composition.mjs";\n';
const SHARED = String.raw`
// Explicit internal candidate only; no production startup calls this installer.
const jhJebiseoOriginalHost56=jhCreateJebiseoOriginalHost56({
  readCurrentState:()=>{
    const deviceId=chooseDevice();
    const session=deviceId?active56(deviceId):null;
    const metadata=deviceId?devices.get(deviceId):null;
    const commandId=deviceId?jhCommandVersion56(deviceId):null;
    return {deviceId,commandId,secureSessionId:session?.sessionId??null,
      deviceDigest:metadata?.deviceDigest??null,sessionDeviceDigest:session?.deviceDigest??null,
      secureBridgeVersion:metadata?.secureBridgeVersion??null,runtimeId:jhWorkflowRuntimeDigest56,
      focus:jhFocus44.peek({device:deviceId,currentCommand:commandId,at:Date.now()}),
      durableHooks:durableNativeHooks56};
  },
  readOriginalJobs:()=>jobs,
  canInstall:()=>!httpServer.listening&&jobs.size===0&&devices.size===0&&
    !!durableNativeHooks56&&typeof durableNativeHooks56.beforeDispatch==='function'&&
    typeof durableNativeHooks56.acceptedCompletion==='function'
});
export function installJebiseoOriginalHost56(options){
  return jhJebiseoOriginalHost56.install(options);
}
`;
const MONITORED = 'async(...a)=>{jhV2State56.activeMcpCalls++;try{const result=await scoped.handler(...a);jhV2State56.lastMcpAt=Date.now();return result;}finally{jhV2State56.activeMcpCalls--;}}';
const REGISTRATION = 'return server.registerTool(name,{...scoped.config,securitySchemes:oauthSchemes56,_meta:{...(config?._meta||{}),securitySchemes:oauthSchemes56}},' + MONITORED + ');';
const PAIRS = [
  ['function createMcp(){', 'function createMcp(){\n  const jhJebiseoRegistry56=jhJebiseoOriginalHost56.createRegistry();'],
  [REGISTRATION, REGISTRATION.replace(MONITORED,
    'jhJebiseoRegistry56.capture(name,z.object(scoped.config.inputSchema),' + MONITORED + ')')],
  ['  return server;\n}', '  jhJebiseoOriginalHost56.bindServer(server,jhJebiseoRegistry56);\n  return server;\n}'],
  ['      await transport.handleRequest(req,res,parsedBody);',
    '      await jhJebiseoOriginalHost56.withAuthenticatedRequest(server,authorized,parsedBody,req,res,()=>transport.handleRequest(req,res,parsedBody));'],
  ['  jobs.set(id,j);\n  if(targetDeviceId){',
    '  jhJebiseoOriginalHost56.captureOriginalJobScope(j,jhCommandContext56.getStore());\n  jobs.set(id,j);\n  if(targetDeviceId){']
];
const count = (source, anchor) => source.split(anchor).length - 1;
const REQUIRED = [
  'const authorized=mcpCallerAuthorized56(req);',
  'const scoped=jhCommandTool56(name,config,jhLearningHandler56(name,handler));',
  'const jhFocus44=createStage44DeviceFocus({maxMs:120000});',
  'const jhWorkflowRuntimeDigest56=',
  'if(durableNativeHooks56)durableNativeHooks56.capture(j,p);',
  'durableNativeHooks56?.beforeDispatch(',
  'durableNativeHooks56?.acceptedCompletion(j,body.result)',
  'const stage26Ack56=decideExactSignedCompletionAck56(j,stage26RawDigest56);',
  'j.stage26CompletionDigest56=stage26RawDigest56;',
  'j.status="complete";j.result=body.result;j.completedAt=new Date().toISOString();',
  'const jhStage61Host56=createStage61HostAdapter(',
  'const SECURE56_TOOL_CATALOG_DIGEST',
  'function jhRequireCommand56(device,workflowId=null){',
  'const server=createMcp();'
];

/** Pure exact overlay. Apply only after the original final runtime has been
 * built/attested. Source ambiguity, incomplete authority or reapplication fails.
 * It does not write generated files, import the runtime or start a listener.
 */
export function patchJebiseoOriginalHostComposition(source) {
  if (typeof source !== 'string') fail('JEBISEO_ORIGINAL_HOST_SOURCE_REQUIRED');
  if (source.includes('jhJebiseoOriginalHost56') || source.includes(PREFIX))
    fail('JEBISEO_ORIGINAL_HOST_ALREADY_PRESENT');
  for (const anchor of REQUIRED) {
    if (count(source, anchor) !== 1) fail('JEBISEO_ORIGINAL_HOST_AUTHORITY_CHANGED');
  }
  const auth = source.indexOf('if(!a||sid!==j.secureSessionId');
  const ack = source.indexOf('const stage26Ack56=');
  const durable = source.indexOf('durableNativeHooks56?.acceptedCompletion(j,body.result)');
  const marker = source.indexOf('j.stage26CompletionDigest56=stage26RawDigest56;');
  const complete = source.indexOf('j.status="complete";j.result=body.result;j.completedAt=new Date().toISOString();');
  if (!(auth >= 0 && auth < ack && ack < durable && durable < marker && marker < complete))
    fail('JEBISEO_ORIGINAL_COMPLETION_ORDER_CHANGED');
  let candidate = source;
  for (const [before, after] of PAIRS) {
    if (count(candidate, before) !== 1 || candidate.includes(after))
      fail('JEBISEO_ORIGINAL_HOST_ANCHOR_CHANGED');
    candidate = candidate.replace(before, after);
  }
  candidate = PREFIX + candidate + SHARED;
  if (reverseJebiseoOriginalHostComposition(candidate) !== source)
    fail('JEBISEO_ORIGINAL_HOST_SCOPE_CHANGED');
  return candidate;
}

export function reverseJebiseoOriginalHostComposition(source) {
  if (typeof source !== 'string' || !source.startsWith(PREFIX) || !source.endsWith(SHARED))
    fail('JEBISEO_ORIGINAL_HOST_OVERLAY_REQUIRED');
  let original = source.slice(PREFIX.length, -SHARED.length);
  for (const [before, after] of [...PAIRS].reverse()) {
    if (count(original, after) !== 1) fail('JEBISEO_ORIGINAL_HOST_REVERSE_CHANGED');
    original = original.replace(after, before);
  }
  return original;
}
