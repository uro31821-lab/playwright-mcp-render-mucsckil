/**
 * JH Secure56 new-command + clean-restart integrated policy.
 *
 * This is a narrow policy layer over the existing durable workflow patch. It does
 * not replace Secure Bridge, authentication, approval, Computer Use, or the job
 * executor. It changes only the fate of unfinished workflows after an unclean
 * process restart or a confirmed Android process-epoch change. It expects the
 * new-command priority base (commit a734c95d176ef7892f4af1431bbb5be18170a642)
 * and preserves commandId fences while adding termination fences.
 */
import {patchDurableMcpWorkflow56} from './durable-mcp-workflow-patch.mjs';

export const CLEAN_RESTART_PHASE56='ABORTED_BY_TERMINATION';
export const CLEAN_RESTART_DISPOSITION56='DISCARD_PREVIOUS';

function occurrences(source,needle){return source.split(needle).length-1;}
function exact(source,before,after,code){
  if(typeof source!=='string'||occurrences(source,before)!==1)throw Error(code);
  return source.replace(before,after);
}

/** Pure policy helper used by verification and migration tooling. */
export function normalizeWorkflowForCleanRestart56(workflow,{now=Date.now(),reason='PROCESS_RESTARTED'}={}){
  if(!workflow||typeof workflow!=='object')throw Error('clean_restart_workflow_required');
  const copy={...workflow,jobs:Array.isArray(workflow.jobs)?workflow.jobs.map(x=>({...x})):[]};
  if(copy.phase!=='VERIFIED'&&copy.phase!==CLEAN_RESTART_PHASE56){
    copy.phase=CLEAN_RESTART_PHASE56;
    copy.abortedAt=now;
    copy.abortReason=reason;
  }
  copy.autoResumeAllowed=false;
  copy.replayAllowed=false;
  return copy;
}

export function replayDecisionAfterRestart56(workflow){
  const phase=workflow?.phase;
  if(phase===CLEAN_RESTART_PHASE56)return Object.freeze({allow:false,code:'workflow_aborted_by_termination_no_replay'});
  if(phase==='VERIFIED')return Object.freeze({allow:false,code:'workflow_already_verified_no_replay'});
  return Object.freeze({allow:true,code:'active_runtime_only'});
}

/**
 * Applies exact, reversible string edits to the already-generated Secure56
 * runtime. Every anchor is single-occurrence checked so an upstream change
 * fails closed instead of silently weakening the policy.
 */
export function applyCleanRestartPolicy56(source){
  let out=source;

  out=exact(out,
`const jhWorkflowStateFile56=jhWorkflowDurable56?jhPath56.join(jhWorkflowStateDir56,'jh-mcp-workflows-v1.json'):null;
function jhWorkflowSerializable56(w){return {id:w.id,plan:w.plan,device:w.device,commandId:w.commandId??null,sessionId:w.sessionId,trustId:w.trustId??null,ownerDigest:w.ownerDigest??null,secureDeviceDigest:w.secureDeviceDigest??null,sessionRebindCount:Number(w.sessionRebindCount||0),lastSessionReboundAt:w.lastSessionReboundAt??null,createdAt:w.createdAt,expiresAt:w.expiresAt,phase:w.phase,initialPackage:w.initialPackage,lastPackage:w.lastPackage,jobs:w.jobs};}`,
`const jhWorkflowStateFile56=jhWorkflowDurable56?jhPath56.join(jhWorkflowStateDir56,'jh-mcp-workflows-v1.json'):null;
function jhCancelWorkflowJobs56(w){
  if(!w||!Array.isArray(w.jobs))return;
  const cancelled=new Set();
  for(const log of w.jobs){
    const live=log&&jobs.get(log.jobId);
    if(live&&['queued','in_progress'].includes(live.status)){
      live.status='expired';live.error='workflow_aborted_by_termination';live.completedAt=new Date().toISOString();cancelled.add(live.id);
    }
  }
  if(w.device&&queues.has(w.device)&&cancelled.size){queues.set(w.device,(queues.get(w.device)||[]).filter(id=>!cancelled.has(id)));}
}
function jhAbortWorkflowAfterTermination56(w,reason){
  if(!w||w.phase==='VERIFIED'||w.phase==='ABORTED_BY_TERMINATION')return false;
  jhCancelWorkflowJobs56(w);w.phase='ABORTED_BY_TERMINATION';w.abortedAt=Date.now();w.abortReason=reason;w.autoResumeAllowed=false;return true;
}
function jhAbortDeviceWorkflows56(deviceId,reason){
  if(!deviceId)return 0;
  let count=0;for(const w of jhMcpWorkflows56.values())if(w.device===deviceId&&jhAbortWorkflowAfterTermination56(w,reason))count++;
  if(count)jhPersistWorkflows56();return count;
}
function jhAbortDeviceWorkflowsOnEpochChange56(deviceId,previousEpoch,nextEpoch){
  if(!deviceId||!previousEpoch||!nextEpoch||previousEpoch===nextEpoch)return 0;
  return jhAbortDeviceWorkflows56(deviceId,'ANDROID_PROCESS_EPOCH_CHANGED');
}
function jhWorkflowSerializable56(w){return {id:w.id,plan:w.plan,device:w.device,commandId:w.commandId??null,sessionId:w.sessionId,trustId:w.trustId??null,ownerDigest:w.ownerDigest??null,secureDeviceDigest:w.secureDeviceDigest??null,processEpochAtStart:w.processEpochAtStart??null,sessionRebindCount:Number(w.sessionRebindCount||0),lastSessionReboundAt:w.lastSessionReboundAt??null,createdAt:w.createdAt,expiresAt:w.expiresAt,phase:w.phase,initialPackage:w.initialPackage,lastPackage:w.lastPackage,abortedAt:w.abortedAt??null,abortReason:w.abortReason??null,autoResumeAllowed:false,jobs:w.jobs};}`,
  'clean_restart_shared_anchor_changed');

  out=exact(out,
"!['BEGIN','READY','RUNNING','OPENED','VERIFIED','NEEDS_REVIEW'].includes(w.phase)",
"!['BEGIN','READY','RUNNING','OPENED','VERIFIED','NEEDS_REVIEW','ABORTED_BY_TERMINATION'].includes(w.phase)",
  'clean_restart_phase_validation_anchor_changed');

  out=exact(out,
"if(bindingAbsent){w.trustId=null;w.ownerDigest=null;w.secureDeviceDigest=null;w.phase='NEEDS_REVIEW';}if(w.phase==='RUNNING'||w.phase==='BEGIN')w.phase='NEEDS_REVIEW';",
"if(w.processEpochAtStart!==undefined&&w.processEpochAtStart!==null&&!/^[A-Za-z0-9_-]{16,160}$/.test(w.processEpochAtStart))throw Error('workflow_state_invalid');if(w.abortedAt!==undefined&&w.abortedAt!==null&&!Number.isSafeInteger(w.abortedAt))throw Error('workflow_state_invalid');if(w.abortReason!==undefined&&w.abortReason!==null&&typeof w.abortReason!=='string')throw Error('workflow_state_invalid');if(bindingAbsent){w.trustId=null;w.ownerDigest=null;w.secureDeviceDigest=null;jhAbortWorkflowAfterTermination56(w,'MISSING_TRUST_BINDING_AFTER_RESTART');}if(!['VERIFIED','ABORTED_BY_TERMINATION'].includes(w.phase))jhAbortWorkflowAfterTermination56(w,'PROCESS_RESTARTED');",
  'clean_restart_load_normalization_anchor_changed');

  out=exact(out,
"function jhPersistWorkflows56(){if(!jhWorkflowDurable56)return;jhMkdir56(jhWorkflowStateDir56,{recursive:true});const rows=[...jhMcpWorkflows56.values()].filter(w=>Date.now()<w.expiresAt).map(jhWorkflowSerializable56);const tmp=jhWorkflowStateFile56+'.tmp';jhWriteFile56(tmp,JSON.stringify(rows),{encoding:'utf8',mode:0o600});jhRename56(tmp,jhWorkflowStateFile56);}",
"function jhPersistWorkflows56(){if(!jhWorkflowDurable56)return;jhMkdir56(jhWorkflowStateDir56,{recursive:true});const rows=[...jhMcpWorkflows56.values()].filter(w=>Date.now()<w.expiresAt).map(jhWorkflowSerializable56);const tmp=jhWorkflowStateFile56+'.tmp';jhWriteFile56(tmp,JSON.stringify(rows),{encoding:'utf8',mode:0o600});jhRename56(tmp,jhWorkflowStateFile56);}\njhPersistWorkflows56();",
  'clean_restart_startup_persist_anchor_changed');

  out=exact(out,
`  function jhWorkflowView56(w){
    if(jhMcpWorkflows56.get(w.id)!==w)return {phase:'DISCARDED',verified:false,jobs:[],replayAllowed:false};
    return {workflowId:w.id,commandId:w.commandId,planDigest:w.plan,phase:w.phase,initialPackage:w.initialPackage,
      deviceDigest:sha56(w.device),jobs:w.jobs.slice(),durableAcrossRestart:jhWorkflowDurable56,
      sessionRebindCount:Number(w.sessionRebindCount||0),
      verified:w.phase==='VERIFIED',replayAllowed:false};
  }`,
`  function jhWorkflowView56(w){
    if(jhMcpWorkflows56.get(w.id)!==w)return {phase:'DISCARDED',verified:false,jobs:[],replayAllowed:false};
    return {workflowId:w.id,commandId:w.commandId,planDigest:w.plan,phase:w.phase,initialPackage:w.initialPackage,
      deviceDigest:sha56(w.device),jobs:w.jobs.slice(),durableAcrossRestart:false,
      auditLedgerDurableAcrossRestart:jhWorkflowDurable56,
      processEpochDigest:w.processEpochAtStart?sha56(w.processEpochAtStart):null,
      sessionRebindCount:Number(w.sessionRebindCount||0),abortedAt:w.abortedAt??null,abortReason:w.abortReason??null,
      verified:w.phase==='VERIFIED',discarded:w.phase==='ABORTED_BY_TERMINATION',
      autoResumeAllowed:false,replayAllowed:false,restartDisposition:'DISCARD_PREVIOUS',
      duplicateExecutionBlocked:w.phase==='ABORTED_BY_TERMINATION'};
  }`,
  'clean_restart_view_anchor_changed');

  out=exact(out,
"    if(Date.now()>=w.expiresAt){jhMcpWorkflows56.delete(id);jhPersistWorkflows56();return {error:'workflow_expired_no_replay'};}\n    const a=active56(w.device);",
"    if(Date.now()>=w.expiresAt){jhMcpWorkflows56.delete(id);jhPersistWorkflows56();return {error:'workflow_expired_no_replay'};}\n    if(w.phase==='ABORTED_BY_TERMINATION')return {workflow:w};\n    const a=active56(w.device);",
  'clean_restart_find_terminal_anchor_changed');

  out=exact(out,
`    if(a.sessionId!==w.sessionId){
      if(!allowSessionRebind)return {error:'secure_session_rebind_status_required'};
      if(!jhSafeSessionCheckpoint56(w))return {error:'secure_session_changed_review_required'};
      w.sessionId=a.sessionId;
      w.sessionRebindCount=Number(w.sessionRebindCount||0)+1;
      w.lastSessionReboundAt=Date.now();
      jhPersistWorkflows56();
    }`,
`    if(a.sessionId!==w.sessionId){
      const currentEpoch=devices.get(w.device)?.processEpoch??null;
      if(w.phase!=='VERIFIED'&&(!w.processEpochAtStart||currentEpoch!==w.processEpochAtStart)){
        jhAbortWorkflowAfterTermination56(w,'BRIDGE_PROCESS_RESTARTED');jhPersistWorkflows56();
        return {error:'workflow_aborted_by_termination_no_replay',workflow:w};
      }
      if(!allowSessionRebind)return {error:'secure_session_rebind_status_required'};
      if(!jhSafeSessionCheckpoint56(w))return {error:'secure_session_changed_review_required'};
      w.sessionId=a.sessionId;
      w.sessionRebindCount=Number(w.sessionRebindCount||0)+1;
      w.lastSessionReboundAt=Date.now();
      jhPersistWorkflows56();
    }`,
  'clean_restart_session_anchor_changed');

  out=exact(out,
"  async function jhWorkflowStep56(w,stepId,type,payload,expectedPackage=null){\n    jhRequireWorkflow56(w);\n    if(w.jobs.some(x=>x.stepId===stepId))throw Error('workflow_step_already_issued_no_replay');",
"  async function jhWorkflowStep56(w,stepId,type,payload,expectedPackage=null){\n    jhRequireWorkflow56(w);\n    if(w.phase==='ABORTED_BY_TERMINATION')throw Error('workflow_aborted_by_termination_no_replay');\n    if(w.jobs.some(x=>x.stepId===stepId))throw Error('workflow_step_already_issued_no_replay');",
  'clean_restart_step_guard_anchor_changed');

  out=exact(out,
"      if(jhMcpWorkflows56.size>=8){for(const [k,v] of jhMcpWorkflows56)if(Date.now()>=v.expiresAt)jhMcpWorkflows56.delete(k);}",
"      if(jhMcpWorkflows56.size>=8){for(const [k,v] of jhMcpWorkflows56)if(Date.now()>=v.expiresAt)jhMcpWorkflows56.delete(k);if(jhMcpWorkflows56.size>=8){const terminal=[...jhMcpWorkflows56.entries()].filter(([,v])=>['ABORTED_BY_TERMINATION','VERIFIED'].includes(v.phase)).sort((a,b)=>Number(a[1].createdAt||0)-Number(b[1].createdAt||0));while(jhMcpWorkflows56.size>=8&&terminal.length)jhMcpWorkflows56.delete(terminal.shift()[0]);}jhPersistWorkflows56();}",
  'clean_restart_capacity_anchor_changed');

  out=exact(out,
"      const w={id,plan,device,commandId,sessionId:auth.sessionId,trustId:auth.trustId,\n        ownerDigest:auth.ownerDigest,secureDeviceDigest:auth.deviceDigest,sessionRebindCount:0,lastSessionReboundAt:null,\n        createdAt:Date.now(),expiresAt:Date.now()+jhWorkflowTtl56,phase:'BEGIN',initialPackage:null,lastPackage:null,jobs:[]};",
"      const w={id,plan,device,commandId,sessionId:auth.sessionId,trustId:auth.trustId,\n        ownerDigest:auth.ownerDigest,secureDeviceDigest:auth.deviceDigest,processEpochAtStart:meta?.processEpoch??null,sessionRebindCount:0,lastSessionReboundAt:null,\n        createdAt:Date.now(),expiresAt:Date.now()+jhWorkflowTtl56,phase:'BEGIN',initialPackage:null,lastPackage:null,abortedAt:null,abortReason:null,autoResumeAllowed:false,jobs:[]};",
  'clean_restart_begin_state_anchor_changed');

  out=exact(out,
"    if(read.error)return textResult({ok:false,code:read.error});",
"    if(read.error)return textResult({ok:false,code:read.error,...(read.workflow?jhWorkflowView56(read.workflow):{})});",
  'clean_restart_error_view_anchor_changed');

  out=exact(out,
"    if(mode==='STATUS'){\n      const reconciled=jhReconcileLateWorkflow56(w);\n      return textResult({ok:true,reconciled,...jhWorkflowView56(w)});\n    }",
"    if(mode==='STATUS'){\n      const reconciled=jhReconcileLateWorkflow56(w);\n      return textResult({ok:true,reconciled,...jhWorkflowView56(w)});\n    }\n    if(w.phase==='ABORTED_BY_TERMINATION')return textResult({ok:false,code:'workflow_aborted_by_termination_no_replay',...jhWorkflowView56(w)});",
  'clean_restart_mode_guard_anchor_changed');

  out=exact(out,
"    const deviceDigest=String(j.deviceDigest||\"\"),clientNonce=String(j.clientNonce||\"\"),clientTime=Number(j.clientTime||0);",
"    const deviceDigest=String(j.deviceDigest||\"\"),clientNonce=String(j.clientNonce||\"\"),clientTime=Number(j.clientTime||0);\n    const jhProcessEpoch56=String(j.processEpoch||\"\"),jhRestartDisposition56=String(j.restartDisposition||\"\");\n    if(jhProcessEpoch56&&(!/^[A-Za-z0-9_-]{16,160}$/.test(jhProcessEpoch56)||jhRestartDisposition56!==\"DISCARD_PREVIOUS\")){res.writeHead(400).end(\"clean restart registration invalid\");return;}\n    const jhPreviousProcessEpoch56=String(devices.get(j.deviceId)?.processEpoch||\"\");",
  'clean_restart_register_parse_anchor_changed');

  out=exact(out,
"    reg(j.deviceId,{bridgeVersion:j.bridgeVersion||null,deviceDigest,secureBridgeVersion:56,lastSeen:Date.now()});",
"    const jhEpochChanged56=!!(jhProcessEpoch56&&jhPreviousProcessEpoch56&&jhPreviousProcessEpoch56!==jhProcessEpoch56);\n    const jhSessionRotationWithoutStableEpoch56=!!(a&&(!jhProcessEpoch56||!jhPreviousProcessEpoch56||jhPreviousProcessEpoch56!==jhProcessEpoch56));\n    const jhAbortedWorkflowCount56=jhEpochChanged56?jhAbortDeviceWorkflowsOnEpochChange56(j.deviceId,jhPreviousProcessEpoch56,jhProcessEpoch56):(jhSessionRotationWithoutStableEpoch56?jhAbortDeviceWorkflows56(j.deviceId,'BRIDGE_SESSION_ROTATED_WITHOUT_STABLE_PROCESS_EPOCH'):0);\n    reg(j.deviceId,{bridgeVersion:j.bridgeVersion||null,deviceDigest,secureBridgeVersion:56,processEpoch:jhProcessEpoch56||jhPreviousProcessEpoch56||null,lastSeen:Date.now()});",
  'clean_restart_register_epoch_anchor_changed');

  out=exact(out,
"res.end(JSON.stringify({ok:true,deviceId:j.deviceId,secureBridgeVersion:56,transport:\"PUBLIC_HTTPS_PROXY\",serverIdentityDigest:SERVER_IDENTITY_DIGEST56,toolCatalogDigest:SECURE56_TOOL_CATALOG_DIGEST,secureSessionId:sessionId,secureSessionSecret:secret.toString(\"base64url\"),secureExpiresAt:expiresAt,sessionDigest:pending.sessionDigest}));",
"res.end(JSON.stringify({ok:true,deviceId:j.deviceId,secureBridgeVersion:56,transport:\"PUBLIC_HTTPS_PROXY\",serverIdentityDigest:SERVER_IDENTITY_DIGEST56,toolCatalogDigest:SECURE56_TOOL_CATALOG_DIGEST,secureSessionId:sessionId,secureSessionSecret:secret.toString(\"base64url\"),secureExpiresAt:expiresAt,sessionDigest:pending.sessionDigest,restartDisposition:\"DISCARD_PREVIOUS\",abortedWorkflowCount:jhAbortedWorkflowCount56,autoResumeAllowed:false}));",
  'clean_restart_register_response_anchor_changed');

  return out;
}

export function patchDurableMcpWorkflowCleanRestart56(source){
  return applyCleanRestartPolicy56(patchDurableMcpWorkflow56(source));
}
