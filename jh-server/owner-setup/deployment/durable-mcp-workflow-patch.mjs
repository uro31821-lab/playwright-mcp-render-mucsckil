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
    return {workflowId:w.id,commandId:w.commandId,planDigest:w.plan,phase:w.phase,initialPackage:w.initialPackage,
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
    description:'On every NEW user instruction call ²È="25onRebindCount<0)w.sessionRebindCount=0;if(w.lastSessionReboundAt!==null&&w.lastSessionReboundAt!==undefined&&!Number.isSafeInteger(w.lastSessionReboundAt))throw Error('workflow_state_invalid');m.set(w.id,w);}return m;}
const jhMcpWorkflows56=jhLoadWorkflows56();

function jhRequireWorkflow56(w){if(jhMcpWorkflows56.get(w.id)!==w)throw Error('site_switch_discarded');}
function jhWriteDiscardFile56(file,value){
  const tmp=file+'.tmp';const fd=jhOpen56(tmp,'w',0o600);
  try{jhWriteFile56(fd,JSON.stringify(value),'utf8');jhFsync56(fd);}finally{jhClose56(fd);}
  jhRename56(tmp,file);const dir=jhOpen56(jhWorkflowStateDir56,'r');try{jhFsync56(dir);}finally{jhClose56(dir);}
}
const jhDiscardAckFile56=jhWorkflowDurable56?jhPath56.join(jhWorkflowStateDir56,'jh-site-discard-acks-v1.json'):null;
const jhCommandVersions56=new Map();
function jhReadDiscardAcks56(){
  if(!jhDiscardAckFile56||!jhExists56(jhDiscardAckFile56))return new Map();
  const saved=JSON.parse(jhReadFile56(jhDiscardAckFile56,'utf8'));
  const rows=Array.isArray(saved)?saved:saved?.seen;
  if(!Array.isArray(saved)){
    if(saved?.version!==2||!Array.isArray(saved.current)||saved.current.length>256)throw Error('command_fence_invalid');
    for(const pair of saved.current){
      if(!Array.isArray(pair)||pair.length!==2||!/^[a-f0-9]{64}$/.test(pair[0])||!/^[a-f0-9]{32}$/.test(pair[1]))throw Error('command_fence_invalid');
      jhCommandVersions56.set(pair[0],pair[1]);
    }
  }
  if(!Array.isArray(rows)||rows.length>256)throw Error('discard_ack_invalid');
  return new Map(rows.map(x=>{
    if(!Array.isArray(x)||x.length!==2||!/^[a-f0-9]{64}$/.test(x[0]))throw Error('discard_ack_invalid');
    const ids=Array.isArray(x[1])?x[1]:[x[1]];
    if(!ids.length||ids.length>100000||ids.some(id=>!/^[a-f0-9]{32}$/.test(id))||new Set(ids).size!==ids.length)throw Error('discard_ack_invalid');
    if(Array.isArray(saved))jhCommandVersions56.set(x[0],ids.at(-1));
    return [x[0],ids];
  }));
}
const jhDiscardAcks56=jhReadDiscardAcks56();
function jhCommandVersion56(device){return jhCommandVersions56.get(sha56('discard-device|'+device))||null;}
function jhDiscardDeviceWork56(device,eventId,previousCommandId=undefined){
  const key=sha56('discard-device|'+device);
  if(!/^[a-f0-9]{32}$/.test(eventId))throw Error('discard_event_invalid');
  const seen=jhDiscardAcks56.get(key)||[];
  if(seen.includes(eventId))return;
  if(seen.length>=100000||(!jhDiscardAcks56.has(key)&&jhDiscardAcks56.size>=256))throw Error('discard_ack_capacity');
  const scoped=previousCommandId!==undefined;
  const advances=!scoped||jhCommandVersion56(device)===previousCommandId;
  jhBlockedCommands56.add(device);
  if(advances)jhCommandVersions56.set(key,eventId);
  if(jhWorkflowDurable56)jhWriteDiscardFile56(jhDiscardAckFile56,{version:2,seen:[...jhDiscardAcks56],current:[...jhCommandVersions56]});
  const selected=[...jhMcpWorkflows56.values()].filter(w=>w.device===device&&w.phase!=='VERIFIED'&&(!scoped||w.commandId===previousCommandId));
  const workflowIds=new Set(selected.map(w=>w.id));
  for(const w of selected){
    jhMcpWorkflows56.delete(w.id);
    w.phase='DISCARDED';w.jobs=[];w.initialPackage=null;w.lastPackage=null;w.plan=null;
  }
  // Purge transient command/result bodies; durable side-effect duplicate fences contain hashes only.
  for(const [id,j] of jobs){
    if(j.targetDeviceId!==device||(scoped&&j.commandId!==previousCommandId))continue;
    if(j.workflowId&&!workflowIds.has(j.workflowId))continue;
    // Finished external effects are not undone. Their existing durable hash fences remain intact.
    if(j.status==='complete'&&['agent_step','agent_steps','open_url','computer_use_action_execute'].includes(j.type))continue;
    durableNativeHooks56?.discardTransient?.(j);
    j.status='error';j.error='site_switch_discarded';
    for(const k of Object.keys(j))if(!['id','status','error','targetDeviceId'].includes(k))delete j[k];
    jobs.delete(id);
  }
  for(const [key,value] of recentJobs){if(value?.v?.targetDeviceId===device&&!jobs.has(value.v.id))recentJobs.delete(key);}
  if(advances)recentWeb.clear();
  const q=queues.get(device)||[];queues.set(device,q.filter(id=>jobs.has(id)));
  for(const [lease,w] of frameWaiters56){if(w.deviceId===device&&advances){frameWaiters56.delete(lease);w.resolve(null);}}
  if(jhWorkflowDurable56)jhWriteDiscardFile56(jhWorkflowStateFile56,[...jhMcpWorkflows56.values()].map(jhWorkflowSerializable56));
  const acks=new Map(jhDiscardAcks56);acks.set(key,[...seen,eventId]);
  if(acks.size>256)throw Error('discard_ack_capacity');
  if(jhWorkflowDurable56)jhWriteDiscardFile56(jhDiscardAckFile56,{version:2,seen:[...acks],current:[...jhCommandVersions56]});
  jhDiscardAcks56.set(key,[...seen,eventId]);jhBlockedCommands56.delete(device);
}

function jhPersistWorkflows56(){if(!jhWorkflowDurable56)return;jhMkdir56(jhWorkflowStateDir56,{recursive:true});const rows=[...jhMcpWorkflows56.values()].filter(w=>Date.now()<w.expiresAt).map(jhWorkflowSerializable56);const tmp=jhWorkflowStateFile56+'.tmp';jhWriteFile56(tmp,JSON.stringify(rows),{encoding:'utf8',mode:0o600});jhRename56(tmp,jhWorkflowStateFile56);}
`;

  const pollAnchor='  if(req.method==="GET" && url.pathname==="/device/poll"){';
  if(source.split(pollAnchor).length!==2)throw Error('discard_route_anchor_changed');
  const changes=[];
  let patched=source;
  const once=(before,after)=>{
    if(patched.split(before).length!==2)throw Error('command_binding_anchor_changed');
    patched=patched.replace(before,after);changes.push([before,after]);
  };
  const register='  const registerOAuthTool=(name,config,handler)=>server.registerTool(name,{...config,securitySchemes:oauthSchemes56,_meta:{...(config?._meta||{}),securitySchemes:oauthSchemes56}},handler);';
  once(register,'  const registerOAuthTool=(name,config,handler)=>{const scoped=jhCommandTool56(name,config,handler);return server.registerTool(name,{...scoped.config,securitySchemes:oauthSchemes56,_meta:{...(config?._meta||{}),securitySchemes:oauthSchemes56}},scoped.handler);};');
  once('  const targetDeviceId=chooseDevice(deviceId);','  const targetDeviceId=chooseDevice(deviceId);\n  if(type!=="secure_device_status")p={...p,commandId:jhRequireCommand56(targetDeviceId,p.workflowId)};');
  once('const browserSession=createBrowserSession({transport:browserEventTransport});',
    'const browserSession=createBrowserSession({transport:{request(options){const message=JSON.parse(options.body);if(message.method==="tools/call")jhRequireCommand56(jhCommandContext56.getStore()?.device);return browserEventTransport.request(options);}}});');
  once('async function browserTool(name,args={}){ return browserSession.tool(name,args); }',
    'async function browserTool(name,args={}){ const commandId=jhRequireCommand56(jhCommandContext56.getStore()?.device);const reply=await browserSession.rpc("tools/call",{name,arguments:args,_meta:{jhCommandId:commandId}});jhRequireCommand56(jhCommandContext56.getStore()?.device);return reply.result; }');
  const next=imports+patched.replace(scope,shared+scope).replace(anchor,sourceInsertion56+anchor)
    .replace(pollAnchor,siteDiscardRoute56+pollAnchor);
  let restored=next.slice(imports.length).replace(siteDiscardRoute56+pollAnchor,pollAnchor).replace(sourceInsertion56+anchor,anchor).replace(shared+scope,scope);
  for(const [before,after] of changes.reverse())restored=restored.replace(after,before);
  if(restored!==source)throw Error('workflow_runtime_scope_mismatch');
  return next;
}
