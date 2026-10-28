/**
 * JH167 Android-direct phase 2: host-local Secure56 adapter.
 *
 * The original JH Secure56 host already owns the jobs map, signed
 * completion verification, durable journal, local phone approvals and UI
 * snapshot. Never use public MCP safeJobView56 (it redacts the job id and
 * session). Plug in the EXISTING in-process functions only.
 *
 * IMPORTANT: isolated and disabled by default; not imported into production.
 */
import { createHash, randomBytes } from 'node:crypto';
import { inspectFoldPair,guardFoldAction,FOLD_LAYOUTS } from './fold-evidence.mjs';
import { createAndroidDirectStage1 } from './engine.mjs';

const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const hex32=x=>typeof x==='string'&&/^[0-9a-f]{32}$/.test(x);
const hex64=x=>typeof x==='string'&&/^[0-9a-f]{64}$/.test(x);
const sha=x=>createHash('sha256').update(String(x)).digest('hex');
const paneDigest=(proof,mode)=>sha(JSON.stringify({
  mode,workSide:proof.workSide,chatSide:proof.chatSide,
  chatPackage:proof.chatPackage,workPackage:proof.workPackage,
  chatWindowId:proof.chatWindowId,workWindowId:proof.workWindowId,
  chatBounds:proof.chatBounds,workBounds:proof.workBounds
}));
const actions=new Set(['CLICK','TYPE','SCROLL','KEYPRESS']);
const rawFields=new Set(['task_digest','action','effect','data_class','x','y',
  'viewport_width','viewport_height','scroll_x','scroll_y','keys','text_digest','text_value',
  'based_on_screenshot_digest','current_screenshot_digest','index']);
const fail=(code,extra={})=>Object.freeze({ok:false,code,dispatched:false,
  effectVerified:false,autoRetry:false,...extra});
const deviceReceipt=(j,device,session,command,type)=>{
  return obj(j)&&typeof j.id==='string'&&j.id.length>0&&
    j.type===type&&j.targetDeviceId===device&&
    j.secureSessionId===session&&j.commandId===command;
};
const validToken=x=>typeof x==='string'&&x.length>=8&&x.length<=512;
const safeKind=x=>x==='READ_ONLY'||x==='REVERSIBLE_WRITE'||x==='MUTATION';
/**
 * The ACTUAL JH167-R5 AndroidComputerUseRuntime.mapPoint accepts work-window
 * LOCAL pixels/viewport, not display-global coordinates. Only the trusted
 * host can convert the signed foldable work box to that coordinate space.
 */
function workLocalArgs(args,proof,foldMode){
  const a=structuredClone(args);
  if(!foldMode)return a;
  const b=proof?.workBounds;
  if(!b||![b.left,b.top,b.right,b.bottom].every(Number.isSafeInteger))
    throw Error('SIGNED_WORK_WINDOW_BOUNDS_REQUIRED');
  const width=b.right-b.left,height=b.bottom-b.top;
  if(width<100||height<100)throw Error('SIGNED_WORK_WINDOW_SIZE_INVALID');
  a.viewport_width=width;
  a.viewport_height=height;
  if(['CLICK','SCROLL'].includes(a.action)){
    a.x=a.x-b.left;a.y=a.y-b.top;
    if(!Number.isSafeInteger(a.x)||!Number.isSafeInteger(a.y)||
       a.x<0||a.y<0||a.x>=width||a.y>=height)
      throw Error('GLOBAL_TO_WORK_POINT_INVALID');
  }
  return a;
}

function validInput(args) {
  if(!obj(args)||Object.keys(args).some(k=>!rawFields.has(k))||
     !actions.has(args.action)||!hex64(args.task_digest)||
     args.effect!=='REVERSIBLE_WRITE'||args.data_class!=='NON_SENSITIVE')
    return false;
  if(args.action==='CLICK')return Number.isSafeInteger(args.x)&&
    Number.isSafeInteger(args.y)&&Number.isSafeInteger(args.viewport_width)&&
    Number.isSafeInteger(args.viewport_height)&&args.x>=0&&args.y>=0&&
    args.viewport_width>0&&args.viewport_height>0&&
    args.x<args.viewport_width&&args.y<args.viewport_height;
  if(args.action==='TYPE')return typeof args.text_value==='string'&&
    args.text_value.length>0&&Buffer.byteLength(args.text_value,'utf8')<=2048&&
    hex64(args.text_digest)&&sha(args.text_value)===args.text_digest;
  if(args.action==='SCROLL')return Number.isSafeInteger(args.scroll_y)&&
    args.scroll_y!==0&&Math.abs(args.scroll_y)<=3000&&
    Number.isSafeInteger(args.viewport_height)&&args.viewport_height>0;
  return Array.isArray(args.keys)&&args.keys.length>0&&args.keys.length<=4&&
    args.keys.every(k=>typeof k==='string'&&/^[A-Z0-9_]{1,24}$/.test(k));
}

/**
 * Host contracts must be passed by verified local server code, never by
 * MCP input or a remote device request.
 *
 * selectDevice, deviceMeta, activeSession, requireCommand: existing JH.
 * makeSnapshotJob: original mk('agent_snapshot',{},device).
 * exactEnvelope: original exactEnvelope56 (creates signed, durable-gated job).
 * waitJob: original waitJob. getJob: original local jobs.get.
 * durableReady: existing installed durableNativeHooks status, not a new journal.
 *
 * Verified 2026-10-28 source inspection of actual R5 Android APK source:
 * computer_use_action_prepare returns {ok,code:'READY',leaseToken,
 * requiresFreshApproval}. It NEVER returns actionApprovalGrantToken.
 * A normal SAFE action needs only the signed READY lease; protected actions
 * still require separate local approval request/status/re-prepare, which this
 * candidate intentionally blocks until wired. Never invent a grant.
 */
export function createAndroidDirectSecure56Host({
  selectDevice,deviceMeta,activeSession,requireCommand,makeSnapshotJob,
  exactEnvelope,waitJob,getJob,durableReady,enabled=false,clock=Date.now,
  layoutMode=FOLD_LAYOUTS.LEGACY_LEFT_GPT_RIGHT_WORK
}={}) {
  for(const fn of [selectDevice,deviceMeta,activeSession,requireCommand,
    makeSnapshotJob,exactEnvelope,waitJob,getJob,durableReady,clock])
    if(typeof fn!=='function')throw Error('JH_ORIGINAL_LOCAL_SECURE56_PORTS_REQUIRED');
  if(!Object.values(FOLD_LAYOUTS).includes(layoutMode))throw Error('JH_FOLD_LAYOUT_MODE_INVALID');
  let screen=null,prepared=null,running=null,capturing=false,preparing=false,cancelEpoch=0;
  const now=()=>clock();
  const strictFoldMode=layoutMode===FOLD_LAYOUTS.LEFT_WEB_RIGHT_GPT||
    layoutMode===FOLD_LAYOUTS.LEFT_GPT_RIGHT_NATIVE_GEMINI;
  function identity() {
    try {
      const d=selectDevice(),meta=d&&deviceMeta(d),s=d&&activeSession(d);
      const command=d&&requireCommand(d);
      if(typeof d!=='string'||!d||!meta||meta.secureBridgeVersion!==56||
        meta.secureActive!==true||!s?.sessionId||
        typeof s.sessionId!=='string'||!hex32(command)||
        now()-Number(meta.lastSeen)>90000||meta.deviceDigest!==s.deviceDigest)
        return null;
      return {deviceId:d,sessionId:s.sessionId,commandId:command};
    } catch {return null}
  }
  function binding() {
    const a=identity();
    if(!a||!screen||screen.observedAtMs>now()||
      now()-screen.observedAtMs>10000||
      !['deviceId','sessionId','commandId'].every(k=>screen.binding[k]===a[k]))
      return null;
    return {...screen.binding,current:true,secure56:true,
      rightPaneVerified:screen.proof.workSide==='RIGHT',
      workPaneVerified:true,workPaneSide:screen.proof.workSide};
  }
  function evidence() {
    const b=binding();if(!b)return null;
    return {verifiedByExistingJH:true,readOnlySnapshot:true,
      observedAtMs:screen.observedAtMs,binding:b};
  }
  // A signed, fresh current-device snapshot identifies the window pair.
  // It does NOT prove a Gemini draft, identity, conversation or send.
  function nativeOwnerEvidence(){
    const b=binding(),p=screen?.proof;
    if(!b||!p?.ok||layoutMode!==FOLD_LAYOUTS.LEFT_GPT_RIGHT_NATIVE_GEMINI||
       p.workSide!=='RIGHT'||p.chatSide!=='LEFT'||
       p.nativeGeminiWindowVerified!==true||
       !Number.isSafeInteger(Number(p.workWindowId))||
       !Number.isSafeInteger(Number(p.chatWindowId)))return null;
    return Object.freeze({
      backend:'JH_ANDROID_NATIVE',secure56:true,current:true,
      deviceId:b.deviceId,sessionId:b.sessionId,commandId:b.commandId,
      workSide:'RIGHT',chatSide:'LEFT',
      workPackage:p.workPackage,chatPackage:p.chatPackage,
      workWindowId:Number(p.workWindowId),chatWindowId:Number(p.chatWindowId),
      // Exact comma-separated original signed two-window geometry. The
      // original queued Android job signs and checks these same six fields.
      workBounds:[p.workBounds.left,p.workBounds.top,p.workBounds.right,p.workBounds.bottom].join(','),
      chatBounds:[p.chatBounds.left,p.chatBounds.top,p.chatBounds.right,p.chatBounds.bottom].join(','),
      observedAt:screen.observedAtMs,rightPaneDigest:b.rightPaneDigest,
      nativeGeminiWindowVerified:p.nativeGeminiWindowVerified===true,
      geminiSurfaceVerified:false,geminiAccountVerified:false
    });
  }
  function verifyNativeOwnerEvidence(e){
    const actual=nativeOwnerEvidence();
    return !!actual&&!!e&&Object.keys(actual).every(k=>e[k]===actual[k]);
  }
  function signedEnvelope(tool,type,effect,args,extra={}) {
    if(!safeKind(effect))throw Error('EFFECT_NOT_ALLOWED');
    const b=binding();if(!b)throw Error('RIGHT_PANE_BINDING_LOST');
    const e=exactEnvelope(tool,type,effect,{...args,device_id:b.deviceId},extra);
    if(e?.error||e?.deviceId!==b.deviceId||
       !deviceReceipt(e?.job,b.deviceId,b.sessionId,b.commandId,type)||
       e.job.status!=='queued')
      throw Error('ORIGINAL_SECURE56_JOB_NOT_QUEUED');
    return {binding:b,job:e.job};
  }
  async function authenticatedJob(job,b,type,maxMs=15000) {
    const done=await waitJob(job,maxMs);
    if(!deviceReceipt(done,b.deviceId,b.sessionId,b.commandId,type)||
      done.id!==job.id)throw Error('JH_SIGNED_JOB_BINDING_CHANGED');
    return done;
  }

  const executor=createAndroidDirectStage1({
    enabled:enabled===true,
    readBinding:binding,
    clock:now,
    authorizeExistingStep:async({operationId,deviceId,commandId,sessionId,taskDigest})=>{
      return !!running&&running.operationId===operationId&&
        running.taskDigest===taskDigest&&durableReady()===true&&
        running.binding.deviceId===deviceId&&
        running.binding.commandId===commandId&&
        running.binding.sessionId===sessionId&&
        !!binding()&&validToken(running.leaseToken)&&
        running.originalPhonePreparedReady===true &&
        running.requiresFreshApproval===false;
    },
    invokeExistingTool:async(name,args,b)=>{
      if(!binding()||binding().rightPaneDigest!==b.rightPaneDigest)
        throw Error('ANDROID_CONTEXT_CHANGED');
      if(name==='life_job_status') {
        const original=getJob(args.job_id);
        if(!deviceReceipt(original,b.deviceId,b.sessionId,b.commandId,
          'computer_use_action_execute'))throw Error('STATUS_JOB_NOT_BOUND');
        return {job:original};
      }
      if(name==='life_android_snapshot') {
        const j=makeSnapshotJob(b.deviceId);
        if(!deviceReceipt(j,b.deviceId,b.sessionId,b.commandId,'agent_snapshot'))
          throw Error('SNAPSHOT_JOB_NOT_BOUND');
        return {job:await authenticatedJob(j,b,'agent_snapshot')};
      }
      if(name==='life_android_computer_inspect') {
        const {job}=signedEnvelope(name,'computer_use_inspect','READ_ONLY',args);
        return {job:await authenticatedJob(job,b,'computer_use_inspect')};
      }
      if(name==='life_android_execute_computer_action') {
        if(!running||running.binding.rightPaneDigest!==b.rightPaneDigest||
           !validToken(args.lease_token)||
           args.lease_token!==running.leaseToken||
           running.originalPhonePreparedReady!==true||
           running.requiresFreshApproval!==false||
           args.action_approval_grant_token!==undefined)
          throw Error('EXISTING_PHONE_PREPARATION_NOT_BOUND');
        // Original exactEnvelope56 builds the Secure56 signed payload and
        // original durableNativeHooks enforce storage fencing before dispatch.
        const {job}=signedEnvelope(name,'computer_use_action_execute','MUTATION',
          args,{leaseToken:args.lease_token,
            localActionApprovalDigest:String(args.local_action_approval_digest||'')});
        return {job:await authenticatedJob(job,b,'computer_use_action_execute')};
      }
      throw Error('MCP_TOOL_NOT_IN_ANDROID_DIRECT_ALLOWLIST');
    }
  });

  async function capture() {
    if(!enabled)return fail('ANDROID_DIRECT_DISABLED');
    if(running||prepared||preparing||capturing)return fail('CANDIDATE_ACTION_IN_PROGRESS');
    const a=identity();if(!a)return fail('ORIGINAL_SECURE56_DEVICE_REQUIRED');
    let j,done,proof;
    // A NEW signed screen read invalidates old pane evidence immediately.
    // Otherwise a rejected Gemini snapshot can leave an obsolete owner
    // proof live long enough to target a different application.
    screen=null;
    capturing=true;
    try {
      j=makeSnapshotJob(a.deviceId);
      if(!deviceReceipt(j,a.deviceId,a.sessionId,a.commandId,'agent_snapshot'))
        return fail('SNAPSHOT_SIGNATURE_SCOPE_INVALID');
      done=await authenticatedJob(j,a,'agent_snapshot',25000);
      if(done.status!=='complete'||done.result?.ok!==true||
         typeof done.result.url!=='string'||
         Buffer.byteLength(done.result.url,'utf8')>2*1024*1024)
        return fail('SIGNED_ANDROID_SNAPSHOT_NOT_COMPLETED');
      const nodes=JSON.parse(done.result.url);
      proof=inspectFoldPair(done.result,nodes,layoutMode,now());
      if(!proof.ok)return fail(proof.code);
      if(!identity()||!['deviceId','sessionId','commandId']
        .every(k=>a[k]===identity()?.[k]))
        return fail('SECURE56_SESSION_CHANGED_DURING_SNAPSHOT');
      const digest=paneDigest(proof,layoutMode);
      screen={observedAtMs:proof.observedAtMs,lastJobId:j.id,proof,
        binding:{...a,rightPaneDigest:digest}};
      return Object.freeze({ok:true,
        code:layoutMode===FOLD_LAYOUTS.LEFT_WEB_RIGHT_GPT
          ?'SIGNED_LEFT_WEB_RIGHT_GPT_OBSERVED':
          layoutMode===FOLD_LAYOUTS.LEFT_GPT_RIGHT_NATIVE_GEMINI
          ?'SIGNED_LEFT_GPT_RIGHT_NATIVE_GEMINI_OBSERVED':
          'SIGNED_ANDROID_RIGHT_PANE_OBSERVED',
        observedAtMs:proof.observedAtMs,workPackage:proof.workPackage,
        workPaneSide:proof.workSide,chatPaneSide:proof.chatSide,
        physicalUnfoldVerified:proof.physicalUnfoldVerified===true,
        rightPaneDigest:digest,effectVerified:false,dispatched:false});
    } catch {
      screen=null;return fail('SIGNED_ANDROID_SNAPSHOT_UNAVAILABLE');
    } finally { capturing=false; }
  }

  async function prepare({args}={}) {
    if(!enabled)return fail('ANDROID_DIRECT_DISABLED');
    if(running||prepared||preparing||capturing)return fail('CANDIDATE_ACTION_IN_PROGRESS');
    const b=binding();if(!b)return fail('FRESH_SIGNED_ANDROID_SCREEN_REQUIRED');
    if(durableReady()!==true)return fail('EXISTING_DURABLE_JOURNAL_REQUIRED');
    if(!validInput(args))return fail('ANDROID_ACTION_ARGUMENTS_INVALID');
    if(strictFoldMode){
      const gate=guardFoldAction(screen?.proof,args);
      if(!gate.ok)return fail(gate.code);
    }
    let job,done;
    const originalEpoch=cancelEpoch;
    preparing=true;
    try {
      const phoneArgs=workLocalArgs(args,screen?.proof,
        strictFoldMode);
      ({job}=signedEnvelope('life_android_computer_prepare',
        'computer_use_action_prepare','READ_ONLY',phoneArgs));
      done=await authenticatedJob(job,b,'computer_use_action_prepare');
      if(cancelEpoch!==originalEpoch)return fail('PHONE_PREPARATION_CANCELLED');
      if(!binding()||binding().rightPaneDigest!==b.rightPaneDigest)
        return fail('ANDROID_CONTEXT_CHANGED_DURING_PREPARE');
      // R5 uses code READY and leaseToken. An approved protected action
      // requires separate local approval status and a fresh prepare. This
      // candidate does NOT dispatch protected actions, even if ok is true.
      if(done.status==='complete'&&
         (done.result?.code==='APPROVAL_REQUIRED'||
          done.result?.requiresFreshApproval===true))
        return fail('PHONE_LOCAL_APPROVAL_REQUIRED',{
          deviceStatus:done.status,phoneCode:done.result?.code||null
        });
      if(done.status!=='complete'||done.result?.ok!==true)
        return fail('PHONE_PREPARATION_OR_LOCAL_APPROVAL_REQUIRED',{
          deviceStatus:done.status,phoneCode:typeof done.result?.code==='string'
            ?done.result.code:null});
      if(done.result.code!=='READY'||done.result.requiresFreshApproval!==false)
        return fail('PHONE_PREPARATION_CODE_NOT_VERIFIED');
      const lease=done.result.leaseToken;
      if(!validToken(lease))return fail('PHONE_ACTION_LEASE_NOT_CONFIRMED');
      const id=randomBytes(16).toString('hex');
      prepared={id,binding:b,screenEvidence:evidence(),
        globalArgs:structuredClone(args),
        args:{...phoneArgs,device_id:b.deviceId,lease_token:lease},
        leaseToken:lease,originalPhonePreparedReady:true,
        requiresFreshApproval:false,createdAtMs:now()};
      return Object.freeze({ok:true,code:'SIGNED_PHONE_PREPARATION_READY',
        preparationId:id,dispatched:false,effectVerified:false,
        autoRetry:false});
    } catch {
      return fail('SIGNED_PHONE_PREPARATION_UNAVAILABLE');
    } finally {preparing=false;}
  }

  async function execute({preparationId,operationId}={}) {
    if(!enabled)return fail('ANDROID_DIRECT_DISABLED');
    if(!prepared||prepared.id!==preparationId||!hex32(operationId))
      return fail('PHONE_PREPARATION_NOT_FOUND');
    if(running||preparing||capturing)return fail('CANDIDATE_ACTION_IN_PROGRESS');
    const step=prepared;
    prepared=null; // A preparation is single-use even if verification fails.
    try {
      if(now()-step.createdAtMs>10000||!binding()||
        binding().rightPaneDigest!==step.binding.rightPaneDigest)
        return fail('PHONE_PREPARATION_EXPIRED_OR_CONTEXT_CHANGED');
      if(durableReady()!==true)return fail('EXISTING_DURABLE_JOURNAL_REQUIRED');
      if(strictFoldMode) {
        // Re-observe actual two-window geometry AFTER phone preparation.
        // Never dispatch an old screen coordinate when the splitter moved,
        // device rotated/folded or keyboard focus switched to ChatGPT.
        capturing=true;
        try {
          const before=screen;
          const snapshotJob=makeSnapshotJob(step.binding.deviceId);
          if(!deviceReceipt(snapshotJob,step.binding.deviceId,
            step.binding.sessionId,step.binding.commandId,'agent_snapshot')||
            snapshotJob.id===before?.lastJobId)
            return fail('FOLD_FRESH_SNAPSHOT_REQUIRED');
          const done=await authenticatedJob(snapshotJob,step.binding,'agent_snapshot',25000);
          if(done.status!=='complete'||done.result?.ok!==true||
            typeof done.result.url!=='string'||
            Buffer.byteLength(done.result.url,'utf8')>2*1024*1024)
            return fail('FOLD_ACTION_PRECHECK_SNAPSHOT_MISSING');
          const nodes=JSON.parse(done.result.url);
          const proof=inspectFoldPair(done.result,nodes,layoutMode,now());
          if(!proof.ok)return fail(proof.code);
          if(proof.observedAtMs<=before.observedAtMs)
            return fail('FOLD_ACTION_PRECHECK_STALE');
          if(paneDigest(proof,layoutMode)!==step.binding.rightPaneDigest)
            return fail('FOLD_LAYOUT_CHANGED_BEFORE_ACTION');
          const gate=guardFoldAction(proof,step.globalArgs);
          if(!gate.ok)return fail(gate.code);
          if(!identity()||!['deviceId','sessionId','commandId']
            .every(k=>identity()?.[k]===step.binding[k]))
            return fail('FOLD_SECURE56_BINDING_CHANGED');
          screen={...before,observedAtMs:proof.observedAtMs,proof,
            lastJobId:snapshotJob.id};
          step.screenEvidence=evidence();
        } catch {
          return fail('FOLD_ACTION_PRECHECK_UNAVAILABLE');
        } finally {capturing=false;}
      }
      running={operationId,taskDigest:step.args.task_digest,
        binding:step.binding,leaseToken:step.leaseToken,
        originalPhonePreparedReady:step.originalPhonePreparedReady,
        requiresFreshApproval:step.requiresFreshApproval};
      const answer=await executor.execute({operationId,args:step.args,
        expectedBinding:step.binding,screenEvidence:step.screenEvidence});
      // Device receipt is NOT proof that the requested site action succeeded.
      return Object.freeze({...answer,autoRetry:false,effectVerified:false});
    } finally {
      running=null;
      step.leaseToken=null;
      step.args.lease_token=null;
      step.globalArgs=null;
    }
  }
  async function status({operationId}={}) {
    if(!enabled)return fail('ANDROID_DIRECT_DISABLED');
    return executor.status({operationId});
  }
  function cancelPreparation() {
    if(running)return fail('CANNOT_CANCEL_AFTER_DISPATCH');
    cancelEpoch++;
    if(preparing)return Object.freeze({ok:true,
      code:'PENDING_PREPARATION_CANCEL_REQUESTED_NO_ACTION'});
    if(prepared){prepared.args.lease_token=null;
      prepared.leaseToken=null;prepared.globalArgs=null;prepared=null;}
    return Object.freeze({ok:true,code:'LOCAL_PREPARATION_CANCELLED_NO_ACTION'});
  }
  return Object.freeze({capture,prepare,execute,status,cancelPreparation,
    nativeOwnerEvidence,verifyNativeOwnerEvidence,
    capabilities:()=>Object.freeze({...executor.capabilities(),
      hostLocalOnly:true,realPhoneTested:false,
      layoutMode,workPaneSide:layoutMode===FOLD_LAYOUTS.LEFT_WEB_RIGHT_GPT?'LEFT':'RIGHT',
      physicalUnfoldVerified:false,
      originalDurableJournalReady:durableReady()===true,
      phoneTokenSchemaConfirmed:true,
      protectedApprovalFlowConnected:false,
      globalToWorkWindowMappingVerifiedOnSynthetic:true})});
}
