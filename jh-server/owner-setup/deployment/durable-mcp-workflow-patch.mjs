/**
 * Only a binding layer for the EXISTING JH Secure56 mk/waitJob, device MAC,
 * Android accessibility readback and durable owner startup. NOT a new executor.
 * Patch after the preexisting fixed-identity Durable runtime generator succeeds.
 * Do not mix this into the unsigned published baseline or APK keys.
 */
export const sourceInsertion56 = String.raw`
  // This is an explicitly started, bounded workflow correlation layer around
  // the ORIGINAL Secure56 job queue. It does not grant Android permissions.
  function jhWorkflowView56(w){
    return {workflowId:w.id,planDigest:w.plan,phase:w.phase,initialPackage:w.initialPackage,
      deviceDigest:sha56(w.device),jobs:w.jobs.slice(),durableAcrossRestart:jhWorkflowDurable56,
      verified:w.phase==='VERIFIED',replayAllowed:false};
  }
  function jhFindWorkflow56(id){
    const w=jhMcpWorkflows56.get(id);
    if(!w)return {error:'workflow_not_found_no_automatic_recreation'};
    if(Date.now()>=w.expiresAt){jhMcpWorkflows56.delete(id);jhPersistWorkflows56();return {error:'workflow_expired_no_replay'};}
    const a=active56(w.device);
    if(!a||a.sessionId!==w.sessionId)return {error:'secure_session_changed_no_replay'};
    return {workflow:w};
  }
  async function jhWorkflowStep56(w,stepId,type,payload,expectedPackage=null){
    if(w.jobs.some(x=>x.stepId===stepId))throw Error('workflow_step_already_issued_no_replay');
    const actionDigest=sha56('jh-mcp-workflow-step-v1|'+w.id+'|'+w.plan+'|'+stepId+'|'+type+'|'+JSON.stringify(payload));
    const j=mk(type,{...payload,workflowId:w.id,workflowStepId:stepId,
      workflowPlanDigest:w.plan,workflowActionDigest:actionDigest},w.device);
    const log={stepId,jobId:j.id,jobDigest:sha56(j.id),type,code:'ISSUED'};
    w.jobs.push(log);jhPersistWorkflows56();
    if(j.targetDeviceId!==w.device||!j.secureSessionId||j.secureSessionId!==w.sessionId||j.status!=='queued'){
      log.code='NOT_DISPATCHED';jhPersistWorkflows56();throw Error('workflow_signed_dispatch_unavailable');
    }
    const result=await waitJob(j,25000);
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
      const packages=[...new Set(rows.map(x=>x?.package).filter(x=>typeof x==='string'&&
        /^(com\.|org\.)[A-Za-z0-9_.]+$/.test(x)&&!x.startsWith('com.koreanlifehub.bridge')))];
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
    const log=w.jobs.find(x=>x.stepId===stepId);
    if(!log)return false;
    const j=jobs.get(log.jobId);
    if(!j||j.status!=='complete'||j.result?.ok!==true)return false;
    const echoed=j.result?.jhMcpWorkflow;
    if(!echoed||echoed.workflowId!==w.id||echoed.workflowStepId!==stepId||
       echoed.workflowPlanDigest!==w.plan||echoed.workflowActionDigest!==j.workflowActionDigest||
       echoed.jobId!==j.id)return false;
    let rows;
    try{rows=JSON.parse(j.result.url);if(!Array.isArray(rows))return false;}catch{return false;}
    const packages=[...new Set(rows.map(x=>x?.package).filter(x=>typeof x==='string'&&
      /^(com\.|org\.)[A-Za-z0-9_.]+$/.test(x)&&!x.startsWith('com.koreanlifehub.bridge')))];
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
      const device=chooseDevice();const auth=device&&active56(device);
      if(!device||!auth||devices.get(device)?.secureBridgeVersion!==56)
        return textResult({ok:false,code:'active_secure56_device_required'});
      const id='jh_mcp_'+randomBytes(16).toString('hex');
      const plan=sha56('jh-mcp-chrome-kakaot-return-v1|'+id+'|'+sha56(device));
      const w={id,plan,device,sessionId:auth.sessionId,createdAt:Date.now(),
        expiresAt:Date.now()+jhWorkflowTtl56,phase:'BEGIN',initialPackage:null,lastPackage:null,jobs:[]};
      jhMcpWorkflows56.set(id,w);jhPersistWorkflows56();
      try{
        const original=await jhWorkflowStep56(w,'step_0','agent_snapshot',{},'com.android.chrome');
        w.initialPackage=original;w.phase='READY';jhPersistWorkflows56();
        return textResult({ok:true,...jhWorkflowView56(w)});
      }catch(e){w.phase='NEEDS_REVIEW';jhPersistWorkflows56();return textResult({ok:false,code:String(e?.message||'workflow_begin_unconfirmed'),...jhWorkflowView56(w)});}
    }
    if(!workflow_id||!/^jh_mcp_[a-f0-9]{32}$/.test(workflow_id))return textResult({ok:false,code:'workflow_id_required'});
    const read=jhFindWorkflow56(workflow_id);
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
        await jhWorkflowStep56(w,'step_2','agent_snapshot',{},'com.kakao.taxi');
        w.phase='OPENED';jhPersistWorkflows56();
      }else{
        await jhWorkflowStep56(w,'step_3','open_url',{target:'previous_work_app',url:''});
        await jhWorkflowStep56(w,'step_4','agent_snapshot',{},w.initialPackage);
        w.phase='VERIFIED';jhPersistWorkflows56();
      }
      return textResult({ok:true,...jhWorkflowView56(w)});
    }catch(e){w.phase='NEEDS_REVIEW';jhPersistWorkflows56();return textResult({ok:false,code:String(e?.message||'workflow_step_unconfirmed'),...jhWorkflowView56(w)});}
  });

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
  const imports="import {existsSync as jhExists56,readFileSync as jhReadFile56,writeFileSync as jhWriteFile56,renameSync as jhRename56,mkdirSync as jhMkdir56} from 'node:fs';\nimport jhPath56 from 'node:path';\n";
  const shared="const jhWorkflowTtl56=10*60*1000;\nconst jhWorkflowStateDir56=(process.env.JH_WORKFLOW_STATE_DIR||'').trim();\nconst jhWorkflowDurable56=!!jhWorkflowStateDir56;\nconst jhWorkflowStateFile56=jhWorkflowDurable56?jhPath56.join(jhWorkflowStateDir56,'jh-mcp-workflows-v1.json'):null;\nfunction jhWorkflowSerializable56(w){return {id:w.id,plan:w.plan,device:w.device,sessionId:w.sessionId,createdAt:w.createdAt,expiresAt:w.expiresAt,phase:w.phase,initialPackage:w.initialPackage,lastPackage:w.lastPackage,jobs:w.jobs};}\nfunction jhLoadWorkflows56(){const m=new Map();if(!jhWorkflowDurable56)return m;jhMkdir56(jhWorkflowStateDir56,{recursive:true});if(!jhExists56(jhWorkflowStateFile56))return m;let rows;try{rows=JSON.parse(jhReadFile56(jhWorkflowStateFile56,'utf8'));}catch{throw Error('workflow_state_unreadable');}if(!Array.isArray(rows)||rows.length>8)throw Error('workflow_state_invalid');for(const w of rows){if(!w||!/^jh_mcp_[a-f0-9]{32}$/.test(w.id)||!Array.isArray(w.jobs)||typeof w.expiresAt!=='number')throw Error('workflow_state_invalid');if(Date.now()>=w.expiresAt)continue;if(w.phase==='RUNNING')w.phase='NEEDS_REVIEW';m.set(w.id,w);}return m;}\nconst jhMcpWorkflows56=jhLoadWorkflows56();\nfunction jhPersistWorkflows56(){if(!jhWorkflowDurable56)return;jhMkdir56(jhWorkflowStateDir56,{recursive:true});const rows=[...jhMcpWorkflows56.values()].filter(w=>Date.now()<w.expiresAt).map(jhWorkflowSerializable56);const tmp=jhWorkflowStateFile56+'.tmp';jhWriteFile56(tmp,JSON.stringify(rows),{encoding:'utf8',mode:0o600});jhRename56(tmp,jhWorkflowStateFile56);}\n";
  const next=imports+source.replace(scope,shared+scope).replace(anchor,sourceInsertion56+anchor);
  if(next.slice(imports.length).replace(sourceInsertion56+anchor,anchor).replace(shared+scope,scope)!==source)
    throw Error('workflow_runtime_scope_mismatch');
  return next;
}
