/**
 * Only a binding layer for the EXISTING JH Secure56 mk/waitJob, device MAC,
 * Android accessibility readback and durable owner startup. NOT a new executor.
 * Patch after the preexisting fixed-identity Durable runtime generator succeeds.
 * Do not mix this into the unsigned published baseline or APK keys.
 */
export const sourceInsertion56 = String.raw`
  // This is an explicitly started, bounded workflow correlation layer around
  // the ORIGINAL Secure56 job queue. It does not grant Android permissions.
  function jhTrustedBindingMatches56(w,a){
    const meta=devices.get(w.device);
    return !!a&&typeof w.trustId==='string'&&/^[A-Za-z0-9_-]{24,128}$/.test(w.trustId)&&
      typeof w.ownerDigest==='string'&&/^[0-9a-f]{64}$/.test(w.ownerDigest)&&
      typeof w.secureDeviceDigest==='string'&&/^[0-9a-f]{64}$/.test(w.secureDeviceDigest)&&
      a.trustId===w.trustId&&a.ownerDigest===w.ownerDigest&&a.deviceDigest===w.secureDeviceDigest&&
      meta?.secureBridgeVersion===56&&meta?.deviceDigest===w.secureDeviceDigest;
  }
  function jhSafeSessionCheckpoint56(w){
    return ['READY','OPENED','VERIFIED'].includes(w.phase)&&
      !w.jobs.some(x=>!x||x.code==='ISSUED');
  }
  async function jhScreenSettle56(){
    // A signed open action can finish while Android accessibility still exposes
    // outgoing and incoming windows together. Wait once before the independent
    // read-only verification; the action itself is never replayed.
    await new Promise(r=>setTimeout(r,1500));
  }
  function jhWorkflowView56(w){
    if(jhMcpWorkflows56.get(w.id)!==w)return {phase:'DISCARDED',verified:false,jobs:[],replayAllowed:false};
    return {workflowId:w.id,planDigest:w.plan,phase:w.phase,initialPackage:w.initialPackage,
      deviceDigest:sha56(w.device),jobs:w.jobs.slice(),durableAcrossRestart:jhWorkflowDurable56,
      sessionRebindCount:Number(w.sessionRebindCount||0),
      verified:w.phase==='VERIFIED',replayAllowed:false};
  }
  function jhFindWorkflow56(id,allowSessionRebind=false){
    const w=jhMcpWorkflows56.get(id);
    if(!w)return {error:'workflow_not_found_no_automatic_recreation'};
    if(Date.now()>=w.expiresAt){jhMcpWorkflows56.delete(id);jhPersistWorkflows56();return {error:'workflow_expired_no_replay'};}
    const a=active56(w.device);
    if(!a)return {error:'secure_session_unavailable_no_replay'};
    if(!jhTrustedBindingMatches56(w,a))return {error:'secure_trust_changed_no_replay'};
    if(a.sessionId!==w.sessionId){
      if(!allowSessionRebind)return {error:'secure_session_rebind_status_required'};
      if(!jhSafeSessionCheckpoint56(w))return {error:'secure_session_changed_review_required'};
      w.sessionId=a.sessionId;
      w.sessionRebindCount=Number(w.sessionRebindCount||0)+1;
      w.lastSessionReboundAt=Date.now();
      jhPersistWorkflows56();
    }
    return {workflow:w};
  }
  function jhAndroidPackageName56(v){
    return typeof v==='string'&&/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/.test(v)&&
      !v.startsWith('com.koreanlifehub.bridge');
  }
  async function jhWorkflowStep56(w,stepId,type,payload,expectedPackage=null){
    jhRequireWorkflow56(w);
    if(w.jobs.some(x=>x.stepId===stepId))throw Error('workflow_step_already_issued_no_replay');
    const actionDigest=sha56('jh-mcp-workflow-step-v1|'+w.id+'|'+w.plan+'|'+stepId+'|'+type+'|'+JSON.stringify(payload));
    const j=mk(type,{...payload,workflowId:w.id,workflowStepId:stepId,
      workflowPlanDigest:w.plan,workflowActionDigest:actionDigest},w.device);
    const log={stepId,jobId:j.id,runtimeDigest:jhWorkflowRuntimeDigest56,jobDigest:sha56(jhWorkflowRuntimeDigest56+'|'+j.id),type,code:'ISSUED'};
    w.jobs.push(log);jhPersistWorkflows56();
    if(j.targetDeviceId!==w.device||!j.secureSessionId||j.secureSessionId!==w.sessionId||j.status!=='queued'){
      log.code='NOT_DISPATCHED';jhPersistWorkflows56();throw Error('workflow_signed_dispatch_unavailable');
    }
    const result=await waitJob(j,25000);
    jhRequireWorkflow56(w);
    if(!result||result.status!=='complete'||result.result?.ok!==true){
      log.code=result?.result?.code||result?.error||'device_result_unconfirmed';jhPersistWorkflows56();throw Error('workflow_device_result_unconfirmed');
    }
    // Phone echo must originate from the MAC-verified inbound job, and the
    // completion must be accepted by the EXISTING Secure56 signed HTTP path.
    const echoed=result.result?.jhMcpWorkflow;
    if(!echoed||echoed.workflowId!==w.id||echoed.workflowStepId!==stepId||
       echoed.workflowPlanDigest!==w.plan||echoed.workflowActionDigest!==actionDigest||echoed.jobId!==j.id){
      log.code='SIGNED_PHONE_WORKFLOW_ECHO_MISSING';jhPersistWorkflows56();throw Error('workflow_phone_binding_not_proven');
    }
    if(type==='agent_snapshot'){
      let rows;
      try{rows=JSON.parse(result.result.url);if(!Array.isArray(rows))throw Error('bad');}
      catch{log.code='SNAPSHOT_INVALID';jhPersistWorkflows56();throw Error('workflow_screen_readback_invalid');}
      const packages=[...new Set(rows.map(x=>x?.package).filter(jhAndroidPackageName56))];
      if(packages.length!==1||(expectedPackage&&packages[0]!==expectedPackage)){
        log.code='SCREEN_NOT_UNAMBIGUOUS';jhPersistWorkflows56();throw Error('workflow_screen_readback_mismatch');
      }
      w.lastPackage=packages[0];log.code='SCREEN_READBACK_VERIFIED';jhPersistWorkflows56();return packages[0];
    }
    // A signed action receipt is NOT screen verification. The caller must
    // perform the next dedicated read-only screen step before advancing.
    log.code='DEVICE_REPORTED_OK_UNVERIFIED';jhPersistWorkflows56();return null;
  }
  function jhValidateLateSnapshot56(w,stepId,expectedPackage){
    if(jhMcpWorkflows56.get(w.id)!==w)return false;
    const log=w.jobs.find(x=>x.stepId===stepId);
    // Process-local job IDs restart from job_1 after a Render restart. A late
    // reconciliation may only inspect a job from the same runtime generation.
    if(!log||log.runtimeDigest!==jhWorkflowRuntimeDigest56)return false;
    const j=jobs.get(log.jobId);
    if(!j||j.status!=='complete'||j.result?.ok!==true)return false;
    const echoed=j.result?.jhMcpWorkflow;
    if(!echoed||echoed.workflowId!==w.id||echoed.workflowStepId!==stepId||
       echoed.workflowPlanDigest!==w.plan||echoed.workflowActionDigest!==j.workflowActionDigest||
       echoed.jobId!==j.id)return false;
    let rows;
    try{rows=JSON.parse(j.result.url);if(!Array.isArray(rows))return false;}catch{return false;}
    const packages=[...new Set(rows.map(x=>x?.package).filter(jhAndroidPackageName56))];
    if(packages.length!==1||packages[0]!==expectedPackage)return false;
    log.code='SCREEN_READBACK_VERIFIED_LATE';
    w.lastPackage=packages[0];jhPersistWorkflows56();
    return true;
  }
  function jhReconcileLateWorkflow56(w){
    if(w.phase!=='NEEDS_REVIEW')return false;
    // Never dispatch/replay. Only accept a job that the existing signed
    // completion endpoint already marked complete for this workflow.
    if(w.initialPackage&&jhValidateLateSnapshot56(w,'step_4',w.initialPackage)){
      w.phase='VERIFIED';jhPersistWorkflows56();return true;
    }
    if(jhValidateLateSnapshot56(w,'step_2','com.kakao.taxi')){
      w.phase='OPENED';jhPersistWorkflows56();return true;
    }
    return false;
  }
  registerOAuthTool('life_android_workflow_link',{
    title:'JH verified Android workflow correlation',
    description:'Explicit BEGIN / OPEN_KAKAO_T / RETURN_PREVIOUS / STATUS on one trusted Android device. Each actual signed MCP job is linked to one server-assigned workflow and separately screen-verified. No automatic replay, approval bypass, or arbitrary URL/script.',
    inputSchema:{mode:z.enum(['BEGIN','OPEN_KAKAO_T','RETURN_PREVIOUS','STATUS']),workflow_id:z.string().optional()},
    annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false}
  },async({mode,workflow_id})=>{
    if(mode==='BEGIN'){
      if(workflow_id)return textResult({ok:false,code:'begin_cannot_accept_external_workflow_id'});
      if(jhMcpWorkflows56.size>=8){for(const [k,v] of jhMcpWorkflows56)if(Date.now()>=v.expiresAt)jhMcpWorkflows56.delete(k);}
      if(jhMcpWorkflows56.size>=8)return textResult({ok:false,code:'workflow_capacity_no_replay'});
      const device=chooseDevice();const auth=device&&active56(device);const meta=device&&devices.get(device);
      if(!device||!auth||meta?.secureBridgeVersion!==56||meta?.deviceDigest!==auth.deviceDigest||
         typeof auth.trustId!=='string'||!/^[A-Za-z0-9_-]{24,128}$/.test(auth.trustId)||
         typeof auth.ownerDigest!=='string'||!/^[0-9a-f]{64}$/.test(auth.ownerDigest)||
         typeof auth.deviceDigest!=='string'||!/^[0-9a-f]{64}$/.test(auth.deviceDigest))
        return textResult({ok:false,code:'active_trusted_secure56_device_required'});
      const id='jh_mcp_'+randomBytes(16).toString('hex');
      const plan=sha56('jh-mcp-foreground-kakaot-return-v3|'+id+'|'+auth.trustId+'|'+auth.ownerDigest+'|'+auth.deviceDigest);
      const w={id,plan,device,sessionId:auth.sessionId,trustId:auth.trustId,
        ownerDigest:auth.ownerDigest,secureDeviceDigest:auth.deviceDigest,sessionRebindCount:0,lastSessionReboundAt:null,
        createdAt:Date.now(),expiresAt:Date.now()+jhWorkflowTtl56,phase:'BEGIN',initialPackage:null,lastPackage:null,jobs:[]};
      jhMcpWorkflows56.set(id,w);jhPersistWorkflows56();
      try{
        const original=await jhWorkflowStep56(w,'step_0','agent_snapshot',{});
        jhRequireWorkflow56(w);w.initialPackage=original;w.phase='READY';jhPersistWorkflows56();
        return textResult({ok:true,...jhWorkflowView56(w)});
      }catch(e){if(jhMcpWorkflows56.get(w.id)!==w)return textResult({ok:false,code:'site_switch_discarded'});w.phase='NEEDS_REVIEW';jhPersistWorkflows56();return textResult({ok:false,code:String(e?.message||'workflow_begin_unconfirmed'),...jhWorkflowView56(w)});}
    }
    if(!workflow_id||!/^jh_mcp_[a-f0-9]{32}$/.test(workflow_id))return textResult({ok:false,code:'workflow_id_required'});
    const read=jhFindWorkflow56(workflow_id,mode==='STATUS');
    if(read.error)return textResult({ok:false,code:read.error});
    const w=read.workflow;
    if(mode==='STATUS'){
      const reconciled=jhReconcileLateWorkflow56(w);
      return textResult({ok:true,reconciled,...jhWorkflowView56(w)});
    }
    if(mode==='OPEN_KAKAO_T'&&w.phase!=='READY')return textResult({ok:false,code:'workflow_phase_mismatch',...jhWorkflowView56(w)});
    if(mode==='RETURN_PREVIOUS'&&w.phase!=='OPENED')return textResult({ok:false,code:'workflow_phase_mismatch',...jhWorkflowView56(w)});
    if(mode!=='OPEN_KAKAO_T'&&mode!=='RETURN_PREVIOUS')return textResult({ok:false,code:'workflow_mode_invalid'});
    w.phase='RUNNING';jhPersistWorkflows56();
    try{
      if(mode==='OPEN_KAKAO_T'){
        await jhWorkflowStep56(w,'step_1','open_url',{target:'카카오T',url:'카카오T'});
        await jhScreenSettle56();
        await jhWorkflowStep56(w,'step_2','agent_snapshot',{},'com.kakao.taxi');
        jhRequireWorkflow56(w);w.phase='OPENED';jhPersistWorkflows56();
      }else{
        await jhWorkflowStep56(w,'step_3','open_url',{target:'previous_work_app',url:''});
        await jhScreenSettle56();
        await jhWorkflowStep56(w,'step_4','agent_snapshot',{},w.initialPackage);
        jhRequireWorkflow56(w);w.phase='VERIFIED';jhPersistWorkflows56();
      }
      return textResult({ok:true,...jhWorkflowView56(w)});
    }catch(e){if(jhMcpWorkflows56.get(w.id)!==w)return textResult({ok:false,code:'site_switch_discarded'});w.phase='NEEDS_REVIEW';jhPersistWorkflows56();return textResult({ok:false,code:String(e?.message||'workflow_step_unconfirmed'),...jhWorkflowView56(w)});}
  });

`;


export const siteDiscardRoute56 = String.raw`
  if(req.method==="POST" && url.pathname==="/device/discard-work"){
    const chunks=[];let total=0;
    for await(const ch of req){total+=ch.length;if(total>2048){res.writeHead(413).end();return;}chunks.push(Buffer.from(ch));}
    const raw=Buffer.concat(chunks);chunks.forEach(x=>x.fill(0));
    let body;try{body=JSON.parse(raw.toString('utf8'));}catch{raw.fill(0);res.writeHead(400).end();return;}
    if(!body||Object.keys(body).sort().join(',')!=='deviceId,eventId'||typeof body.deviceId!=='string'||
       body.deviceId.length>160||! /^[a-f0-9]{32}$/.test(body.eventId)){
      raw.fill(0);res.writeHead(400).end();return;
    }
    const a=active56(body.deviceId),sid=String(req.headers['x-jh-session']||''),dev=String(req.headers['x-jh-device']||''),
      nonce=String(req.headers['x-jh-nonce']||''),exp=Number(req.headers['x-jh-expires']||0),
      digest=String(req.headers['x-jh-body-digest']||''),mac=String(req.headers['x-jh-mac']||'');
    const actual=sha56(raw);raw.fill(0);
    if(!a||sid!==a.sessionId||dev!==a.deviceDigest||digest!==actual||!validToken56(nonce)||
       !Number.isSafeInteger(exp)||exp<Date.now()||exp-Date.now()>60000||
       !eqHex56(mac,hmac56(a.secret,'discard|'+sid+'|'+dev+'|'+nonce+'|'+exp+'|'+digest))||
       !seen56(a.seenDiscard||(a.seenDiscard=new Set()),nonce)){
      res.writeHead(401).end();return;
    }
    try{
      jhDiscardDeviceWork56(body.deviceId,body.eventId);
      res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'})
        .end(JSON.stringify({ok:true,code:'SITE_SWITCH_DISCARDED',eventId:body.eventId}));
    }catch{res.writeHead(503,{'cache-control':'no-store'}).end();}
    return;
  }
`;

export function patchDurableMcpWorkflow56(source) {
  if(typeof source!=='string')throw Error('workflow_source_required');
  const anchor='  registerOAuthTool("life_status",{';
  const scope='function createMcp(){';
  if(source.split(anchor).length!==2||source.split(scope).length!==2||
      source.includes('life_android_workflow_link')||source.includes('jhMcpWorkflows56'))
    throw Error('workflow_runtime_anchor_changed');
  // MCP creates a fresh tool-handler instance for EVERY HTTP request. Both
  // workflow state and its TTL therefore belong to the enclosing server scope.
  const imports="import {existsSync as jhExists56,readFileSync as jhReadFile56,writeFileSync as jhWriteFile56,renameSync as jhRename56,mkdirSync as jhMkdir56,openSync as jhOpen56,fsyncSync as jhFsync56,closeSync as jhClose56} from 'node:fs';\nimport jhPath56 from 'node:path';\n";
  const shared=String.raw`const jhWorkflowTtl56=10*60*1000;
const jhWorkflowRuntimeDigest56=sha56('jh-workflow-runtime-v1|'+randomBytes(32).toString('hex'));
const jhWorkflowStateDir56=(process.env.JH_WORKFLOW_STATE_DIR||'').trim();
const jhWorkflowDurable56=!!jhWorkflowStateDir56;
const jhWorkflowStateFile56=jhWorkflowDurable56?jhPath56.join(jhWorkflowStateDir56,'jh-mcp-workflows-v1.json'):null;
function jhWorkflowSerializable56(w){return {id:w.id,plan:w.plan,device:w.device,sessionId:w.sessionId,trustId:w.trustId??null,ownerDigest:w.ownerDigest??null,secureDeviceDigest:w.secureDeviceDigest??null,sessionRebindCount:Number(w.sessionRebindCount||0),lastSessionReboundAt:w.lastSessionReboundAt??null,createdAt:w.createdAt,expiresAt:w.expiresAt,phase:w.phase,initialPackage:w.initialPackage,lastPackage:w.lastPackage,jobs:w.jobs};}
function jhLoadWorkflows56(){const m=new Map();if(!jhWorkflowDurable56)return m;jhMkdir56(jhWorkflowStateDir56,{recursive:true});if(!jhExists56(jhWorkflowStateFile56))return m;let rows;try{rows=JSON.parse(jhReadFile56(jhWorkflowStateFile56,'utf8'));}catch{throw Error('workflow_state_unreadable');}if(!Array.isArray(rows)||rows.length>8)throw Error('workflow_state_invalid');for(const w of rows){if(!w||!/^jh_mcp_[a-f0-9]{32}$/.test(w.id)||typeof w.plan!=='string'||!Array.isArray(w.jobs)||w.jobs.length>8||typeof w.sessionId!=='string'||typeof w.expiresAt!=='number'||!['BEGIN','READY','RUNNING','OPENED','VERIFIED','NEEDS_REVIEW'].includes(w.phase))throw Error('workflow_state_invalid');for(const x of w.jobs){if(!x||typeof x.stepId!=='string'||typeof x.jobId!=='string'||typeof x.jobDigest!=='string'||!/^[0-9a-f]{64}$/.test(x.jobDigest)||(x.runtimeDigest!==undefined&&x.runtimeDigest!==null&&!/^[0-9a-f]{64}$/.test(x.runtimeDigest)))throw Error('workflow_state_invalid');}if(Date.now()>=w.expiresAt)continue;const bindingOk=typeof w.trustId==='string'&&/^[A-Za-z0-9_-]{24,128}$/.test(w.trustId)&&typeof w.ownerDigest==='string'&&/^[0-9a-f]{64}$/.test(w.ownerDigest)&&typeof w.secureDeviceDigest==='string'&&/^[0-9a-f]{64}$/.test(w.secureDeviceDigest);const bindingAbsent=[w.trustId,w.ownerDigest,w.secureDeviceDigest].every(v=>v===undefined||v===null);if(!bindingOk&&!bindingAbsent)throw Error('workflow_state_invalid');if(bindingAbsent){w.trustId=null;w.ownerDigest=null;w.secureDeviceDigest=null;w.phase='NEEDS_REVIEW';}if(w.phase==='RUNNING'||w.phase==='BEGIN')w.phase='NEEDS_REVIEW';if(!Number.isSafeInteger(w.sessionRebindCount)||w.sessionRebindCount<0)w.sessionRebindCount=0;if(w.lastSessionReboundAt!==null&&w.lastSessionReboundAt!==undefined&&!Number.isSafeInteger(w.lastSessionReboundAt))throw Error('workflow_state_invalid');m.set(w.id,w);}return m;}
const jhMcpWorkflows56=jhLoadWorkflows56();

function jhRequireWorkflow56(w){if(jhMcpWorkflows56.get(w.id)!==w)throw Error('site_switch_discarded');}
function jhWriteDiscardFile56(file,value){
  const tmp=file+'.tmp';const fd=jhOpen56(tmp,'w',0o600);
  try{jhWriteFile56(fd,JSON.stringify(value),'utf8');jhFsync56(fd);}finally{jhClose56(fd);}
  jhRename56(tmp,file);const dir=jhOpen56(jhWorkflowStateDir56,'r');try{jhFsync56(dir);}finally{jhClose56(dir);}
}
const jhDiscardAckFile56=jhWorkflowDurable56?jhPath56.join(jhWorkflowStateDir56,'jh-site-discard-acks-v1.json'):null;
function jhReadDiscardAcks56(){
  if(!jhDiscardAckFile56||!jhExists56(jhDiscardAckFile56))return new Map();
  const rows=JSON.parse(jhReadFile56(jhDiscardAckFile56,'utf8'));
  if(!Array.isArray(rows)||rows.length>256||rows.some(x=>!Array.isArray(x)||x.length!==2||
      !/^[a-f0-9]{64}$/.test(x[0])||!/^[a-f0-9]{32}$/.test(x[1])))throw Error('discard_ack_invalid');
  return new Map(rows);
}
const jhDiscardAcks56=jhReadDiscardAcks56();
function jhDiscardDeviceWork56(device,eventId){
  const key=sha56('discard-device|'+device);
  if(jhDiscardAcks56.get(key)===eventId)return;
  const selected=[...jhMcpWorkflows56.values()].filter(w=>w.device===device&&w.phase!=='VERIFIED');
  const workflowIds=new Set(selected.map(w=>w.id));
  for(const w of selected){
    jhMcpWorkflows56.delete(w.id);
    w.phase='DISCARDED';w.jobs=[];w.initialPackage=null;w.lastPackage=null;w.plan=null;
  }
  // Purge transient command/result bodies; durable side-effect duplicate fences contain hashes only.
  for(const [id,j] of jobs){
    if(j.targetDeviceId!==device)continue;
    if(j.workflowId&&!workflowIds.has(j.workflowId))continue;
    durableNativeHooks56?.discardTransient?.(j);
    j.status='error';j.error='site_switch_discarded';
    for(const k of Object.keys(j))if(!['id','status','error','targetDeviceId'].includes(k))delete j[k];
    jobs.delete(id);
  }
  const q=queues.get(device)||[];queues.set(device,q.filter(id=>jobs.has(id)));
  for(const [lease,w] of frameWaiters56){if(w.deviceId===device){frameWaiters56.delete(lease);w.resolve(null);}}
  if(jhWorkflowDurable56)jhWriteDiscardFile56(jhWorkflowStateFile56,[...jhMcpWorkflows56.values()].map(jhWorkflowSerializable56));
  const acks=new Map(jhDiscardAcks56);acks.set(key,eventId);
  if(acks.size>256)throw Error('discard_ack_capacity');
  if(jhWorkflowDurable56)jhWriteDiscardFile56(jhDiscardAckFile56,[...acks]);
  jhDiscardAcks56.set(key,eventId);
}

function jhPersistWorkflows56(){if(!jhWorkflowDurable56)return;jhMkdir56(jhWorkflowStateDir56,{recursive:true});const rows=[...jhMcpWorkflows56.values()].filter(w=>Date.now()<w.expiresAt).map(jhWorkflowSerializable56);const tmp=jhWorkflowStateFile56+'.tmp';jhWriteFile56(tmp,JSON.stringify(rows),{encoding:'utf8',mode:0o600});jhRename56(tmp,jhWorkflowStateFile56);}
`;

  const pollAnchor='  if(req.method==="GET" && url.pathname==="/device/poll"){';
  if(source.split(pollAnchor).length!==2)throw Error('discard_route_anchor_changed');
  const next=imports+source.replace(scope,shared+scope).replace(anchor,sourceInsertion56+anchor)
    .replace(pollAnchor,siteDiscardRoute56+pollAnchor);
  if(next.slice(imports.length).replace(siteDiscardRoute56+pollAnchor,pollAnchor).replace(sourceInsertion56+anchor,anchor).replace(shared+scope,scope)!==source)
    throw Error('workflow_runtime_scope_mismatch');
  return next;
}
