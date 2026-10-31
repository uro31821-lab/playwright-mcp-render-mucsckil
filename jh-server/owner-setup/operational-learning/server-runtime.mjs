import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { FileLearningStore } from './store.mjs';
import { ingest, recall, propose } from './engine.mjs';

const RECEIPT_TOOLS = new Set([
  'life_job_status', 'job_status', 'life_android_pending_approval_receipt_status',
  'life_android_action_approval_status', 'life_android_screen_consent_status',
]);
const RECEIPT_MODES = new Set(['STATUS', 'RECEIPT_STATUS', 'READBACK_PENDING']);
const VERIFIED = new Set(['success_verified', 'failure_verified']);
const SAFE_CODES = new Set([
  'JOB_ERROR', 'JOB_EXPIRED', 'TIMEOUT', 'ACCESS_DENIED', 'APPROVAL_REQUIRED',
  'AUTH_REQUIRED', 'INVALID_REQUEST', 'CANCELLED', 'COMPLETION_UNKNOWN',
]);
// These workflow codes are emitted before dispatch in durable-mcp-workflow-patch.mjs.
// Unknown error text is not a rejection contract and must remain uncertain.
const REJECTION_CODES = new Set([
  'ACCESS_DENIED', 'APPROVAL_REQUIRED', 'AUTH_REQUIRED', 'INVALID_REQUEST',
  'begin_cannot_accept_external_workflow_id', 'active_trusted_secure56_device_required',
  'new_command_request_id_required', 'workflow_capacity_no_replay',
  'workflow_id_required', 'workflow_phase_mismatch', 'workflow_mode_invalid',
]);
const STORE_CODES = new Set([
  'LEARNING_ABSOLUTE_PATH_REQUIRED', 'LEARNING_OWNER_REQUIRED', 'LEARNING_STORE_SCOPE_MISMATCH',
  'LEARNING_STORE_INVALID', 'LEARNING_STATE_INVALID', 'LEARNING_STORE_CORRUPT',
  'LEARNING_STORE_BUSY', 'LEARNING_REVISION_CONFLICT', 'LEARNING_REVISION_INVALID',
  'LEARNING_STORE_CAPACITY', 'LEARNING_STORE_SYMLINK', 'LEARNING_SHUTDOWN_INCOMPLETE',
]);
const ENGINE = 'jh-server';
const ACTIVE_BINDINGS = new Map();
const MAX_OFFERED = 2048;
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clone = value => structuredClone(value);
const identity = value => typeof value === 'string' && value.length > 0 && value.length <= 2048 ? value : null;
const token = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:@/+-]{0,127}$/.test(value);
const name = value => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9._-]{0,95}$/.test(value) ? value : 'unknown';
const digest = value => typeof value === 'string' && /^[a-fA-F0-9]{64}$/.test(value) ? value.toLowerCase() : null;

function domainFor(operation) {
  if (operation === 'life_status' || /connection|diagnostic|authentication/.test(operation)) return 'connection';
  if (/android|device/.test(operation)) return 'device';
  if (/news|research|search/.test(operation)) return 'research';
  if (/web|browser|playwright/.test(operation)) return 'web';
  if (/calculation|calculate/.test(operation)) return 'calculation';
  if (/output|format/.test(operation)) return 'output';
  if (/development|build|release/.test(operation)) return 'development';
  return 'orchestration';
}

function safeContext(value) {
  if (!value || !['platform', 'version', 'environment'].every(key => token(value[key]))) {
    throw new TypeError('LEARNING_CONTEXT_INVALID');
  }
  return { platform: value.platform, version: value.version, environment: value.environment };
}

function shortText(value, max = 1024) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max) : '';
}

function resultEnvelope(value) {
  if (!value || typeof value !== 'object') return { body: null, evidenceRefs: [] };
  let body;
  let serialized;
  if (value.structuredContent && typeof value.structuredContent === 'object') {
    body = value.structuredContent;
    serialized = JSON.stringify(body);
  } else {
    const first = value.content?.[0];
    if (first?.type === 'text' && typeof first.text === 'string' && first.text.length <= 1024 * 1024) {
      serialized = first.text;
      try { body = JSON.parse(serialized); } catch {}
    }
  }
  const evidenceRefs = typeof serialized === 'string' && Buffer.byteLength(serialized) <= 1024 * 1024
    ? ['sha256:' + createHash('sha256').update(serialized).digest('hex')] : [];
  return { body: body && typeof body === 'object' && !Array.isArray(body) ? body : null, evidenceRefs };
}

function resultObservation(value, envelope) {
  if (value?.isError !== true && envelope.body?.ok !== false) return { outcome: 'observed', evidenceRefs: [] };
  if (REJECTION_CODES.has(envelope.body?.code)) return { outcome: 'blocked',
    errorCode: envelope.body.code, evidenceRefs: envelope.evidenceRefs };
  return { outcome: 'completion_unknown', errorCode: 'TOOL_ERROR', evidenceRefs: envelope.evidenceRefs };
}

function settleWithin(promise, milliseconds) {
  if (milliseconds <= 0) return Promise.resolve(false);
  return new Promise(resolve => {
    let finished = false;
    const done = value => { if (!finished) { finished = true; clearTimeout(timer); resolve(value); } };
    const timer = setTimeout(() => done(false), milliseconds);
    Promise.resolve(promise).then(() => done(true), () => done(false));
  });
}

/**
 * One configured personal-server owner, shared across that owner's connections.
 * This is not OAuth multi-user isolation or a Library synchronization adapter.
 * Only trusted host code supplies call identity and verifiedOutcome.
 */
export async function createServerLearning({ file, ownerScope, runtimeId, context,
  clock = () => new Date().toISOString() }) {
  const calls = new AsyncLocalStorage();
  let bindings = new Map();
  let bindingGroup;
  let bindingKey;
  const inFlight = new Set();
  const offered = new Set();
  const faults = new Set();
  let failures = 0;
  let store;
  let environment;
  let state = null;
  let queue = Promise.resolve();
  let queued = 0;
  let closed = false;
  let closing;
  const activity = { recorded: 0, duplicates: 0, calls: 0 };

  function failed(error) {
    failures++;
    faults.add(STORE_CODES.has(error?.code) ? error.code : 'LEARNING_UNAVAILABLE');
  }
  async function safely(callback) {
    try { return await callback(); } catch (error) { failed(error); return undefined; }
  }
  try {
    if (!identity(runtimeId) || typeof clock !== 'function') throw new TypeError('LEARNING_RUNTIME_INVALID');
    environment = safeContext(context);
    store = new FileLearningStore({ file, ownerScope });
    state = await store.read();
  } catch (error) { failed(error); }
  if (store && environment) {
    bindingKey = sha([store.file, ownerScope, runtimeId]);
    bindingGroup = ACTIVE_BINDINGS.get(bindingKey) ?? { references: 0, bindings: new Map() };
    bindingGroup.references++;
    ACTIVE_BINDINGS.set(bindingKey, bindingGroup);
    bindings = bindingGroup.bindings;
  }

  const taskId = commandId => 'task-' + sha([ownerScope, identity(commandId) ? ['command', commandId] : ['unscoped']]);
  const jobAttempt = id => 'job-' + sha([runtimeId, id]);

  function scopeFor(operation, commandId) {
    return { taskId: taskId(commandId), domain: domainFor(operation), operation,
      engine: ENGINE, context: clone(environment) };
  }
  function queueWork(callback) {
    if (!store || !environment || closed) return;
    queued++;
    queue = queue.then(() => safely(callback)).finally(() => { queued--; });
  }
  async function refresh() {
    if (!store || !environment) return null;
    const current = await safely(() => store.read());
    if (current) state = current;
    return current ?? null;
  }

  async function record(attemptId, fallbackScope, observation) {
    const result = await store.transact(current => {
      const previous = Object.values(current.attempts).find(item => item.attemptId === attemptId);
      const original = previous ? { taskId: previous.taskId, domain: previous.domain,
        operation: previous.operation, engine: previous.engine, context: clone(previous.context) } : fallbackScope;
      if (!original) throw new TypeError('LEARNING_CORRELATION_REQUIRED');
      const sameObservation = previous && previous.outcome === observation.outcome &&
        (previous.errorCode ?? null) === (observation.errorCode ?? null) &&
        JSON.stringify(previous.evidenceRefs) === JSON.stringify(observation.evidenceRefs);
      const wouldDowngrade = previous && VERIFIED.has(previous.outcome) && !VERIFIED.has(observation.outcome);
      const latePending = previous && previous.outcome !== 'pending' && observation.outcome === 'pending';
      if (sameObservation || wouldDowngrade || latePending) return { state: current, duplicate: true };
      const sequence = Object.values(current.events).reduce((last, item) => item.attemptId === attemptId
        ? Math.max(last, item.sequence) : last, previous?.sequence ?? 0) + 1;
      const event = { ...original, ...observation, attemptId, sequence,
        eventId: 'event-' + sha([attemptId, sequence, observation]), timestamp: clock(), source: 'host_verified' };
      const observed = ingest(current, event);
      return { ...propose(observed.state, { now: event.timestamp }), duplicate: observed.duplicate };
    });
    state = result.state;
    if (result.duplicate) activity.duplicates++; else activity.recorded++;
  }

  function snapshotJob(job) {
    if (!job || !identity(job.id)) throw new TypeError('LEARNING_JOB_ID_REQUIRED');
    return {
      attemptId: jobAttempt(job.id), operation: 'job.' + name(job.type),
      commandId: identity(job.commandId), status: typeof job.status === 'string' ? job.status : 'unknown',
      code: SAFE_CODES.has(job.code) ? job.code : (job.code === undefined ? null : 'HOST_CODE_REDACTED'),
      verifiedOutcome: VERIFIED.has(job.verifiedOutcome) ? job.verifiedOutcome : null,
      evidenceDigest: digest(job.evidenceDigest),
    };
  }
  function jobObservation(job, phase) {
    const evidenceRefs = job.evidenceDigest ? ['sha256:' + job.evidenceDigest] : [];
    if (phase === 'completed' && job.verifiedOutcome && evidenceRefs.length) {
      return { outcome: job.verifiedOutcome, evidenceRefs,
        ...(job.verifiedOutcome === 'failure_verified' ? { errorCode: job.code ?? 'JOB_ERROR' } : {}) };
    }
    if (['queued', 'in_progress'].includes(job.status)) return { outcome: 'pending', evidenceRefs: [] };
    if (['error', 'expired'].includes(job.status)) return { outcome: 'completion_unknown', evidenceRefs,
      errorCode: job.code ?? (job.status === 'expired' ? 'JOB_EXPIRED' : 'JOB_ERROR') };
    return { outcome: 'observed', evidenceRefs };
  }
  function jobCreated(job) {
    if (closed) return;
    try {
      const input = snapshotJob(job);
      const caller = calls.getStore();
      if (caller) { caller.hasJobs = true; caller.jobAttempts.add(input.attemptId); }
      const scope = bindings.get(input.attemptId) ?? caller?.scope ?? scopeFor(input.operation, input.commandId);
      bindings.set(input.attemptId, clone(scope));
      if (bindings.size > 3000) bindings.delete(bindings.keys().next().value);
      queueWork(() => record(input.attemptId, scope, jobObservation(input, 'created')));
    } catch (error) { failed(error); }
  }
  function jobCompleted(job) {
    if (closed) return;
    try {
      const input = snapshotJob(job);
      const scope = bindings.get(input.attemptId) ?? scopeFor(input.operation, input.commandId);
      queueWork(() => record(input.attemptId, scope, jobObservation(input, 'completed')));
    } catch (error) { failed(error); }
  }

  function suggestions(current, lessons = [], offerKey) {
    if (!current) return { lessons: [], proposals: [] };
    return {
      lessons: lessons.filter(item => !offered.has(offerKey + ':lesson:' + item.id + ':' + item.inputFingerprint)).slice(0, 3),
      proposals: Object.values(current.proposals).filter(item => item.status === 'open' &&
        !offered.has(offerKey + ':proposal:' + item.id)).sort((a, b) => a.id.localeCompare(b.id)).slice(0, 3),
    };
  }
  function appendAdvice(value, advice, offerKey) {
    if ((!advice.lessons.length && !advice.proposals.length) || !value || typeof value !== 'object' ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || !Array.isArray(value.content)) return value;
    const notice = {
      type: 'jh_operational_learning', delivery: 'offered', advisoryOnly: true, externalEffects: false,
      lessons: advice.lessons.map(item => ({ id: item.id, operation: item.operation, ruleVersion: item.ruleVersion,
        guidance: shortText(item.guidance), evidenceRefs: item.evidenceRefs.slice(0, 4) })),
      proposals: advice.proposals.map(item => ({ id: item.id, kind: item.kind, status: item.status,
        independentTaskCount: item.independentTaskCount, reason: shortText(item.reason),
        proposedChange: shortText(item.proposedChange), savings: null })),
      observationScope: 'JH tool events only; ordinary chat is not observed', librarySync: 'not_connected',
    };
    const result = { ...value, content: [...value.content, { type: 'text', text: JSON.stringify(notice) }] };
    for (const item of advice.lessons) offered.add(offerKey + ':lesson:' + item.id + ':' + item.inputFingerprint);
    for (const item of advice.proposals) offered.add(offerKey + ':proposal:' + item.id);
    while (offered.size > MAX_OFFERED) offered.delete(offered.values().next().value);
    return result;
  }

  async function invokeTracked(call, handler, flight) {
    activity.calls++;
    let invocation;
    let lessons = [];
    if (!closed && environment && store) await safely(async () => {
      const toolName = name(call?.name);
      // The host calls this after the registered tool schema has validated its mode.
      const mode = typeof call?.mode === 'string' && /^[A-Z][A-Z0-9_]{0,23}$/.test(call.mode.toUpperCase())
        ? call.mode.toUpperCase() : '';
      const operation = toolName + (mode ? '.' + mode.toLowerCase() : '');
      const scope = scopeFor(operation, call?.commandId);
      invocation = { scope, hasJobs: false, jobAttempts: new Set(),
        receipt: RECEIPT_TOOLS.has(toolName) || RECEIPT_MODES.has(mode),
        toolName, mode, requestId: identity(call?.requestId),
        offerKey: identity(call?.commandId) ? scope.taskId : 'request-' + sha([identity(call?.requestId) ?? activity.calls]),
        attemptId: 'call-' + sha([runtimeId, scope.taskId, operation, mode, identity(call?.requestId) ?? 'stable']) };
      flight.invocation = invocation;
      const current = await refresh();
      if (current && !invocation.receipt) {
        const { taskId: unused, ...query } = scope;
        lessons = recall(current, query);
      }
    });
    let value;
    let error;
    let threw = false;
    try { value = await calls.run(invocation, handler); }
    catch (caught) { threw = true; error = caught; }
    flight.handlerSettled = true;
    let observation = threw ? { outcome: 'completion_unknown', errorCode: 'HANDLER_EXCEPTION', evidenceRefs: [] }
      : { outcome: 'observed', evidenceRefs: [] };
    if (!threw && invocation) await safely(() => {
      const envelope = resultEnvelope(value);
      observation = resultObservation(value, envelope);
      const body = envelope.body;
      if (!invocation.hasJobs && invocation.toolName === 'life_android_workflow_link' &&
        ['BEGIN', 'BEGIN_COMMAND'].includes(invocation.mode) && body?.ok === true &&
        body.activeTasks === 1 && body.replayAllowed === false && typeof body.commandId === 'string' &&
        /^[a-f0-9]{32}$/.test(body.commandId)) {
        invocation.scope.taskId = taskId(body.commandId);
        invocation.offerKey = invocation.scope.taskId;
        invocation.attemptId = 'call-' + sha([runtimeId, invocation.scope.taskId, invocation.scope.operation,
          invocation.mode, invocation.requestId ?? 'stable']);
      }
    });
    if (invocation && !invocation.hasJobs && !invocation.receipt && !closed) {
      queueWork(() => record(invocation.attemptId, invocation.scope, observation));
    }
    if (invocation?.hasJobs && observation.outcome !== 'observed' && !closed) {
      for (const attempt of invocation.jobAttempts) queueWork(() => record(attempt, invocation.scope,
        { ...observation, outcome: 'completion_unknown' }));
    }
    await queue;
    if (threw) throw error;
    if (closed || !invocation || invocation.receipt) return value;
    const current = await refresh();
    const enriched = await safely(() => {
      // Another controller may quarantine or replace a lesson while this handler runs.
      const { taskId: unused, ...query } = invocation.scope;
      lessons = current ? recall(current, query) : [];
      return appendAdvice(value, suggestions(current, lessons, invocation.offerKey), invocation.offerKey);
    });
    return enriched === undefined ? value : enriched;
  }

  async function invoke(call, handler) {
    if (typeof handler !== 'function') throw new TypeError('handler must be a function');
    if (closing || closed) return handler();
    let finish;
    const flight = { invocation: null, handlerSettled: false,
      done: new Promise(resolve => { finish = resolve; }) };
    inFlight.add(flight);
    try { return await invokeTracked(call, handler, flight); }
    finally { inFlight.delete(flight); finish(); }
  }

  async function status() {
    await queue;
    const current = await refresh();
    const known = current ?? state;
    const attempts = Object.values(known?.attempts ?? {});
    const proposals = Object.values(known?.proposals ?? {});
    const proposalSummary = proposals.map(item => ({ id: item.id, kind: item.kind, status: item.status,
      independentTaskCount: item.independentTaskCount, advisoryOnly: true }));
    return {
      enabled: Boolean(store && environment && !closed), degraded: failures > 0,
      identityModel: 'configured-personal-server-owner', stateAvailable: Boolean(current),
      revision: known?.revision ?? null,
      counts: Object.fromEntries(['events', 'attempts', 'lessons', 'proposals'].map(key => [key,
        known ? Object.keys(known[key]).length : null])),
      pending: attempts.filter(item => item.outcome === 'pending').length, queuedWrites: queued,
      inFlight: inFlight.size,
      attemptOutcomes: Object.fromEntries([...new Set(attempts.map(item => item.outcome))].sort()
        .map(outcome => [outcome, attempts.filter(item => item.outcome === outcome).length])),
      proposals: proposalSummary,
      availableAdvice: { lessons: Object.values(known?.lessons ?? {}).filter(item => item.state === 'active').length,
        proposals: proposals.filter(item => item.status === 'open').length },
      activity: { ...activity }, diagnostics: { failures, codes: [...faults].sort() },
      observationScope: 'JH tool events only', librarySync: 'not_connected',
    };
  }
  async function close() {
    if (!closing) closing = (async () => {
      const deadline = Date.now() + 3000;
      const handlersDrained = await settleWithin(Promise.all([...inFlight].map(item => item.done)), 2700);
      if (!handlersDrained) {
        for (const flight of inFlight) {
          const pending = flight.invocation;
          if (!pending || pending.receipt || flight.handlerSettled) continue;
          const attempts = pending.hasJobs ? [...pending.jobAttempts] : [pending.attemptId];
          for (const attempt of attempts) queueWork(() => record(attempt, pending.scope,
            { outcome: 'completion_unknown', errorCode: 'SHUTDOWN_INCOMPLETE', evidenceRefs: [] }));
        }
      }
      let writesDrained = true;
      let lastQueue;
      do {
        lastQueue = queue;
        writesDrained = await settleWithin(lastQueue, deadline - Date.now());
      } while (writesDrained && (lastQueue !== queue || queued > 0));
      closed = true;
      if (!handlersDrained || !writesDrained) failed({ code: 'LEARNING_SHUTDOWN_INCOMPLETE' });
      if (bindingGroup && --bindingGroup.references === 0) {
        ACTIVE_BINDINGS.delete(bindingKey);
        bindings.clear();
      }
      return { drained: handlersDrained && writesDrained, remainingInvocations: inFlight.size, pendingWrites: queued };
    })();
    return closing;
  }
  return Object.freeze({ invoke, jobCreated, jobCompleted, status, close });
}
