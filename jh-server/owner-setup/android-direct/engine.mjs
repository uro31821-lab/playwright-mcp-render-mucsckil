/**
 * JH167 Android-direct candidate, phase 1. No runtime imports this module.
 *
 * This is an orchestrator around EXISTING JH Secure56 tools, not a new
 * authentication, accessibility, approval or device transport implementation.
 * No Playwright, WebView, ADB, shell or new network port is used.
 *
 * Trusted host adapters must normalize ALREADY authenticated Secure56 job
 * receipts before returning them. This module never verifies a MAC itself.
 */
import { createHash } from 'node:crypto';

const hex32 = x => typeof x === 'string' && /^[a-f0-9]{32}$/.test(x);
const hex64 = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const plain = x => x !== null && typeof x === 'object' && !Array.isArray(x) &&
  (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);
const digest = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const ACTIONS = new Set(['CLICK', 'SCROLL', 'TYPE', 'KEYPRESS']);
const READ_TOOLS = Object.freeze({
  INSPECT: 'life_android_computer_inspect',
  SNAPSHOT: 'life_android_snapshot'
});
const ACTION_FIELDS = new Set([
  'device_id','task_digest','action','viewport_width','viewport_height',
  'x','y','scroll_x','scroll_y','keys','text_digest','text_value','lease_token',
  'action_approval_grant_token','effect','data_class'
]);

function validatedBinding(b) {
  if (!plain(b) || b.current !== true || b.secure56 !== true ||
      (b.rightPaneVerified !== true && b.workPaneVerified !== true) ||
      (b.workPaneVerified === true && !['LEFT','RIGHT'].includes(b.workPaneSide)) ||
      typeof b.deviceId !== 'string' ||
      !b.deviceId || b.deviceId.length > 256 ||
      typeof b.sessionId !== 'string' || !b.sessionId || b.sessionId.length > 256 ||
      !hex32(b.commandId) || !hex64(b.rightPaneDigest)) return null;
  return Object.freeze({
    deviceId: b.deviceId, sessionId: b.sessionId, commandId: b.commandId,
    rightPaneDigest: b.rightPaneDigest,
    workPaneSide: b.workPaneVerified === true ? b.workPaneSide : 'RIGHT'
  });
}
const sameBinding = (a,b) => !!a && !!b &&
  ['deviceId','sessionId','commandId','rightPaneDigest','workPaneSide'].every(k=>a[k]===b[k]);
const deny = (code, extra={}) => Object.freeze({
  ok:false, code, dispatched:false, effectVerified:false, autoRetry:false, ...extra
});
const result = (code,extra={}) => Object.freeze({
  ok:false,code,dispatched:true,effectVerified:false,autoRetry:false,...extra
});

function validEvidence(e,b,now) {
  return plain(e) && e.verifiedByExistingJH === true && e.readOnlySnapshot === true &&
    sameBinding(e.binding,b) && Number.isSafeInteger(e.observedAtMs) &&
    e.observedAtMs <= now && e.observedAtMs >= now - 20_000;
}
function validArgs(args, b) {
  if (!plain(args) || Object.keys(args).some(k => !ACTION_FIELDS.has(k))) return false;
  if (!ACTIONS.has(args.action) || args.device_id !== b.deviceId ||
      !hex64(args.task_digest) || args.effect !== 'REVERSIBLE_WRITE' ||
      args.data_class !== 'NON_SENSITIVE' ||
      typeof args.lease_token !== 'string' || !args.lease_token ||
      args.lease_token.length > 512 ||
      typeof args.action_approval_grant_token !== 'string' ||
      !args.action_approval_grant_token ||
      args.action_approval_grant_token.length > 512) return false;
  if (args.action === 'CLICK') {
    return Number.isSafeInteger(args.x) && Number.isSafeInteger(args.y) &&
      Number.isSafeInteger(args.viewport_width) &&
      Number.isSafeInteger(args.viewport_height) &&
      args.viewport_width > 0 && args.viewport_height > 0 &&
      args.x >= 0 && args.y >= 0 &&
      args.x < args.viewport_width && args.y < args.viewport_height;
  }
  if (args.action === 'TYPE') {
    return typeof args.text_value === 'string' && args.text_value.length > 0 &&
      Buffer.byteLength(args.text_value,'utf8') <= 2048 &&
      hex64(args.text_digest) &&
      createHash('sha256').update(args.text_value,'utf8').digest('hex') === args.text_digest;
  }
  if (args.action === 'SCROLL') {
    return Number.isSafeInteger(args.scroll_y) && args.scroll_y !== 0 &&
      Math.abs(args.scroll_y) <= 3000 &&
      Number.isSafeInteger(args.viewport_height) && args.viewport_height > 0;
  }
  return args.action === 'KEYPRESS' && Array.isArray(args.keys) &&
    args.keys.length > 0 && args.keys.length <= 5 &&
    args.keys.every(k=>typeof k==='string' && /^[A-Z0-9_]{1,24}$/.test(k));
}
function normalizedReceipt(reply) {
  // The host port MUST return the normalized, signature-checked JH job, not
  // an arbitrary MCP text blob. Never infer job success from HTTP 200.
  return plain(reply?.job) ? reply.job : reply;
}
function receiptScope(job,b) {
  return plain(job) && typeof job.id === 'string' && job.id.length>0 &&
    job.targetDeviceId===b.deviceId && job.secureSessionId===b.sessionId &&
    job.commandId===b.commandId;
}
function summarizedJob(job) {
  if (job.status === 'queued' || job.status === 'in_progress') {
    return {code:'PENDING_EXISTING_JOB',status:'PENDING',jobId:job.id,deviceReportedOk:null};
  }
  if (job.status === 'complete' && job.result?.ok === true) {
    return {code:'DEVICE_REPORTED_OK_EFFECT_UNVERIFIED',
      status:'DEVICE_REPORTED_OK',jobId:job.id,deviceReportedOk:true};
  }
  if (job.status === 'complete' && job.result?.ok === false) {
    return {code:'DEVICE_REPORTED_FAILURE',status:'DEVICE_REPORTED_FAILURE',
      jobId:job.id,deviceReportedOk:false};
  }
  return {code:'DEVICE_OUTCOME_UNKNOWN_NO_REPLAY',status:'UNKNOWN',
    jobId:job.id,deviceReportedOk:null};
}
function safeFingerprint(args,b) {
  // Never put input text, approval grants, or lease tokens into the ledger.
  const semantic={deviceId:b.deviceId,sessionId:b.sessionId,
    commandId:b.commandId,pane:b.rightPaneDigest,workSide:b.workPaneSide,action:args.action,
    target:args.task_digest,x:args.x,y:args.y,
    width:args.viewport_width,height:args.viewport_height,
    scroll:args.scroll_y,keys:args.keys,textDigest:args.text_digest};
  return digest(semantic);
}

/**
 * Contract:
 * - readBinding: trusted JH active Secure56 binding (incl. verified right pane)
 * - authorizeExistingStep: existing JH approval/intent preflight, never a new grant
 * - invokeExistingTool: invokes registered JH tools and returns normalized
 *   authenticated job receipts; NEVER a raw, unverified phone response.
 *
 * Disabled by default. Not connected to the production startup path.
 * No persistent dedupe is claimed: the EXISTING JH durable dispatch journal
 * must remain in force across restarts before this runner is integrated.
 */
export function createAndroidDirectStage1({
  readBinding, authorizeExistingStep, invokeExistingTool,
  enabled=false, clock=Date.now, capacity=256
}={}) {
  if (typeof readBinding!=='function' ||
      typeof authorizeExistingStep!=='function' ||
      typeof invokeExistingTool!=='function' ||
      typeof clock!=='function' ||
      !Number.isSafeInteger(capacity) || capacity < 1 || capacity > 2048)
    throw Error('EXISTING_SECURE56_PORTS_REQUIRED');
  const ledger = new Map();
  const current = () => validatedBinding(readBinding());
  function capabilities() {
    return Object.freeze({androidDirectCandidate:true,enabled:enabled===true,
      existingSecure56Required:true,existingApprovalRequired:true,
      existingDurableJournalRequired:true,playwrightUsed:false,
      nativeAppLaunchSupported:false,liveDeviceVerified:false,
      allowedActions:[...ACTIONS]});
  }

  async function observe({kind='INSPECT',args={},expectedBinding}={}) {
    if (!enabled) return deny('ANDROID_DIRECT_DISABLED');
    const tool=READ_TOOLS[kind];
    if (!tool || !plain(args)) return deny('READ_OPERATION_UNSUPPORTED');
    const b=current();
    if (!b || !sameBinding(b,expectedBinding))
      return deny('CURRENT_SIGNED_RIGHT_PANE_REQUIRED');
    // Match the original JH MCP inspection schema before calling its port.
    if (kind==='INSPECT' &&
        (!hex64(args.task_digest) || !ACTIONS.has(args.action) ||
         (args.device_id!==undefined && args.device_id!==b.deviceId) ||
         args.data_class==='SECRET'))
      return deny('ANDROID_INSPECT_ARGUMENTS_INVALID');
    if (kind==='SNAPSHOT' && Object.keys(args).some(k=>k!=='command_id'))
      return deny('ANDROID_SNAPSHOT_ARGUMENTS_INVALID');
    try {
      const reply=await invokeExistingTool(tool,structuredClone(args),b);
      if (!sameBinding(current(),b)) return deny('READ_CONTEXT_CHANGED');
      return Object.freeze({ok:true,code:'READ_TOOL_RETURNED_NOT_EFFECT_PROOF',
        dispatched:false,tool,response:reply,effectVerified:false});
    } catch {
      return deny('READ_TOOL_UNAVAILABLE');
    }
  }

  async function execute({operationId,args,expectedBinding,screenEvidence}={}) {
    if (!enabled) return deny('ANDROID_DIRECT_DISABLED');
    const b=current();
    if (!b || !sameBinding(b,expectedBinding))
      return deny('CURRENT_SIGNED_RIGHT_PANE_REQUIRED');
    if (!hex32(operationId)) return deny('OPERATION_ID_INVALID');
    if (!validArgs(args,b)) return deny('ANDROID_ACTION_SCHEMA_OR_GRANT_INVALID');
    if (!validEvidence(screenEvidence,b,clock()))
      return deny('FRESH_SIGNED_ANDROID_SCREEN_REQUIRED');
    const fingerprint=safeFingerprint(args,b);
    const old=ledger.get(operationId);
    if (old) return old.fingerprint===fingerprint
      ? deny(old.dispatched
          ? 'OPERATION_ALREADY_DISPATCHED_NO_REPLAY'
          : 'OPERATION_PREFLIGHT_IN_PROGRESS', {
          previousStatus:old.status,existingJobId:old.jobId??null
        })
      : deny('OPERATION_ID_CONFLICT_NO_REPLAY');
    if (ledger.size>=capacity) return deny('LOCAL_FENCE_CAPACITY_REACHED');
    // Reserve BEFORE awaiting the existing approval. Concurrent requests for
    // the same ID cannot both pass an async approval check and dispatch twice.
    const record={fingerprint,binding:b,jobId:null,dispatched:false,
      status:'PREFLIGHT',code:'OPERATION_PREFLIGHT_IN_PROGRESS'};
    ledger.set(operationId,record);
    let approved=false;
    try {
      approved=await authorizeExistingStep({
        operationId,deviceId:b.deviceId,commandId:b.commandId,
        sessionId:b.sessionId,action:args.action,taskDigest:args.task_digest
      });
    } catch {
      ledger.delete(operationId);
      return deny('EXISTING_JH_APPROVAL_UNAVAILABLE');
    }
    if (approved!==true) {
      ledger.delete(operationId);
      return deny('EXISTING_JH_APPROVAL_REQUIRED');
    }
    if (!sameBinding(current(),b) ||
        !validEvidence(screenEvidence,b,clock())) {
      ledger.delete(operationId);
      return deny('ANDROID_CONTEXT_CHANGED_BEFORE_DISPATCH');
    }
    // Preserve the fence on every path after calling the irreversible port.
    record.dispatched=true;
    record.status='RESERVED';
    record.code='DISPATCH_OUTCOME_UNKNOWN_NO_REPLAY';
    let reply;
    try {
      reply=await invokeExistingTool(
        'life_android_execute_computer_action',structuredClone(args),b
      );
    } catch {
      record.status='UNKNOWN';
      return result('DISPATCH_OUTCOME_UNKNOWN_NO_REPLAY',{operationId,
        status:'UNKNOWN',jobId:null});
    }
    const job=normalizedReceipt(reply);
    if (!receiptScope(job,b)) {
      record.status='UNKNOWN';
      return result('UNVERIFIED_JOB_BINDING_NO_REPLAY',{operationId,status:'UNKNOWN'});
    }
    record.jobId=job.id;
    if (!sameBinding(current(),b)) {
      record.status='UNKNOWN';
      return result('ANDROID_CONTEXT_CHANGED_AFTER_DISPATCH',{operationId,
        jobId:job.id,status:'UNKNOWN'});
    }
    const summary=summarizedJob(job);
    Object.assign(record,summary);
    return result(summary.code,{operationId,status:summary.status,
      jobId:summary.jobId,deviceReportedOk:summary.deviceReportedOk});
  }

  async function status({operationId}={}) {
    if (!hex32(operationId) || !ledger.has(operationId))
      return deny('UNKNOWN_OPERATION_ID');
    const record=ledger.get(operationId);
    if (!record.jobId) return result('DISPATCH_OUTCOME_UNKNOWN_NO_REPLAY',
      {operationId,status:'UNKNOWN'});
    if (!sameBinding(current(),record.binding))
      return result('ANDROID_CONTEXT_CHANGED_STATUS_READ_BLOCKED',
        {operationId,jobId:record.jobId,status:'UNKNOWN'});
    try {
      // This is a status READ of the same original job. NEVER re-dispatch.
      const reply=await invokeExistingTool('life_job_status',{
        job_id:record.jobId,command_id:record.binding.commandId
      },record.binding);
      const job=normalizedReceipt(reply);
      if (!receiptScope(job,record.binding) || job.id!==record.jobId) {
        return result('UNVERIFIED_JOB_STATUS_NO_REPLAY',
          {operationId,jobId:record.jobId,status:'UNKNOWN'});
      }
      if (!sameBinding(current(),record.binding))
        return result('ANDROID_CONTEXT_CHANGED_DURING_STATUS',
          {operationId,jobId:record.jobId,status:'UNKNOWN'});
      const summary=summarizedJob(job);
      Object.assign(record,summary);
      return result(summary.code,{operationId,status:summary.status,
        jobId:summary.jobId,deviceReportedOk:summary.deviceReportedOk});
    } catch {
      return result('STATUS_READ_UNAVAILABLE_NO_REPLAY',
        {operationId,jobId:record.jobId,status:'UNKNOWN'});
    }
  }
  return Object.freeze({capabilities,observe,execute,status});
}
