/**
 * JH167 unified Android entry, phase 3 (candidate ONLY).
 *
 * One execution decision for left-side web and UI operations. NEVER uses
 * Playwright / server browser / ADB and NEVER creates device permission grants.
 *
 * This does NOT install an Android phone implementation. The new signed
 * LEFT_WEB_LINK_V1 capability and readback must first ship in the existing
 * JH167 Secure56 APK; until then OPEN_WEB fails closed.
 */
import {createHash} from 'node:crypto';

const hex32=x=>typeof x==='string'&&/^[a-f0-9]{32}$/.test(x);
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const sha=x=>createHash('sha256').update(String(x),'utf8').digest('hex');
const result=(code,extra={})=>Object.freeze({
  ok:false,code,autoRetry:false,externalEffectVerified:false,...extra
});
const same=(a,b)=>!!a&&!!b&&
  ['deviceId','sessionId','commandId'].every(k=>a[k]===b[k]);
const aliases=Object.freeze({
  '네이버 메일':'https://mail.naver.com/',
  'naver mail':'https://mail.naver.com/',
  '네이버':'https://www.naver.com/',
  'naver':'https://www.naver.com/',
  '구글':'https://www.google.com/',
  'google':'https://www.google.com/',
  '유튜브':'https://www.youtube.com/',
  'youtube':'https://www.youtube.com/',
  '다음':'https://www.daum.net/',
  'daum':'https://www.daum.net/'
});
const actions=Object.freeze([
 'OBSERVE','OPEN_WEB','OPEN_APP','PREPARE_UI','EXECUTE_UI','STATUS_UI',
 'STATUS_OPEN','CANCEL_UI'
]);

function normalizedHttps(value){
  if(typeof value!=='string'||value.length<1||value.length>2048)return null;
  let u;
  try{u=new URL(value)}catch{return null}
  if(u.protocol!=='https:'||u.username||u.password||
     u.hostname.length<3||u.hostname.endsWith('.local')||
     u.hostname.endsWith('.internal')||
     u.hostname==='localhost'||/^\d+(?:\.\d+){3}$/.test(u.hostname)||
     u.hostname.startsWith('[')||u.hostname.endsWith('.onion')||
     u.port && u.port!=='443')return null;
  return u.href;
}
export function resolveAndroidWebTarget(target){
  if(typeof target!=='string'||target.trim().length<1)return null;
  const key=target.trim().toLowerCase();
  return normalizedHttps(Object.hasOwn(aliases,key)?aliases[key]:target.trim());
}
function checkedOwner(readOwner,commandId){
  let x;try{x=readOwner()}catch{return null}
  if(!plain(x)||x.current!==true||x.secure56!==true||
     x.sameProcess!==true||!hex32(x.commandId)||x.commandId!==commandId||
     typeof x.deviceId!=='string'||!x.deviceId||
     typeof x.sessionId!=='string'||!x.sessionId)return null;
  return {commandId:x.commandId,deviceId:x.deviceId,sessionId:x.sessionId};
}
function checkedPhoneCapability(report,owner,at){
  return plain(report)&&report.verifiedByExistingSecure56===true&&
    report.source==='SIGNED_DEVICE_CAPABILITY_RECEIPT'&&
    same(report,owner)&&report.features?.LEFT_WEB_LINK_V1===true&&
    Number.isSafeInteger(report.observedAtMs)&&
    report.observedAtMs<=at&&at-report.observedAtMs<=30_000;
}
function checkedOpenJob(job,owner,jobId) {
  return plain(job)&&job.receiptAuthenticatedByJH===true &&
    same(job,owner)&&typeof job.jobId==='string'&&job.jobId.length>0&&
    (!jobId||job.jobId===jobId)&&
    ['queued','in_progress','complete','error','expired'].includes(job.status);
}
function checkedAddress(proof,owner,url,at,paneDigest){
  return plain(proof)&&proof.verifiedByExistingSecure56===true&&
    proof.source==='SIGNED_ANDROID_ADDRESS_READBACK'&&same(proof,owner)&&
    typeof paneDigest==='string'&&paneDigest.length===64&&
    proof.rightPaneDigest===paneDigest &&
    Number.isSafeInteger(proof.observedAtMs)&&proof.observedAtMs<=at&&
    at-proof.observedAtMs<=10_000 &&
    normalizedHttps(proof.observedUrl)===url;
}
function safeCapture(r){
  return plain(r)&&r.ok===true&&r.workPaneSide==='LEFT'&&
    r.chatPaneSide==='RIGHT'&&typeof r.rightPaneDigest==='string'&&
    /^[a-f0-9]{64}$/.test(r.rightPaneDigest);
}

/**
 * Host-provided functions must be local JH ports; they are not exposed as
 * caller-provided functions in the MCP tool schema.
 *
 * controller = phase-2 signed Android host:
 * {capabilities,capture,prepare,execute,status,cancelPreparation}
 *
 * readSignedCapability() and openLeftWeb() are MUST-NOT-ENABLE placeholders
 * until the actual JH167 phone APK produces audited signed evidence.
 */
export function createUnifiedAndroidRoute({
  controller,readOwner,readSignedCapability,openLeftWeb,readOpenJob,
  readSignedAddress,enabled=false,clock=Date.now,maxOpenOperations=128
}={}) {
  if(!controller||
    ['capabilities','capture','prepare','execute','status','cancelPreparation']
      .some(k=>typeof controller[k]!=='function')||
    [readOwner,readSignedCapability,openLeftWeb,readOpenJob,readSignedAddress,clock]
      .some(fn=>typeof fn!=='function')||
    !Number.isSafeInteger(maxOpenOperations)||maxOpenOperations<1||
    maxOpenOperations>1024)
    throw Error('ORIGINAL_SECURE56_UNIFIED_HOST_REQUIRED');
  const openLedger=new Map();
  function supported(){
    const cap=controller.capabilities();
    return cap?.hostLocalOnly===true&&cap?.existingSecure56Required===true&&
      cap?.playwrightUsed===false&&cap?.layoutMode==='LEFT_WEB_RIGHT_GPT'&&
      cap?.workPaneSide==='LEFT';
  }
  function owner(commandId){
    if(!hex32(commandId))return null;
    return checkedOwner(readOwner,commandId);
  }
  async function observe(o){
    const receipt=await controller.capture();
    if(!safeCapture(receipt))return result(receipt?.code||'LEFT_WEB_RIGHT_GPT_NOT_CONFIRMED');
    const current=owner(o.commandId);
    if(!current||!same(current,o.owner))
      return result('UNIFIED_OWNER_CHANGED_DURING_OBSERVATION');
    return Object.freeze({ok:true,code:'LEFT_BROWSER_RIGHT_GPT_OBSERVED',
      browserPackage:receipt.workPackage,workPaneSide:'LEFT',
      chatPaneSide:'RIGHT',rightPaneDigest:receipt.rightPaneDigest,
      physicalUnfoldVerified:receipt.physicalUnfoldVerified===true,
      externalEffectVerified:false,autoRetry:false});
  }
  async function readOpenStatus(record,ownerNow) {
    let j;
    try{j=await readOpenJob({jobId:record.jobId,commandId:ownerNow.commandId})}
    catch{return result('OPEN_STATUS_READ_UNAVAILABLE_NO_REPLAY',{status:'UNKNOWN'})}
    if(!checkedOpenJob(j,ownerNow,record.jobId))
      return result('OPEN_STATUS_BINDING_UNVERIFIED_NO_REPLAY',{status:'UNKNOWN'});
    if(j.status==='queued'||j.status==='in_progress')
      return result('OPEN_PENDING_READ_SAME_JOB',{status:'PENDING'});
    if(j.status!=='complete')
      return result('OPEN_DEVICE_RESULT_UNKNOWN_NO_REPLAY',{status:'UNKNOWN'});
    if(j.deviceReportedOk!==true)
      return result('OPEN_DEVICE_REPORTED_FAILURE',{status:'DEVICE_REPORTED_FAILURE'});
    const current=owner(ownerNow.commandId);
    if(!current||!same(current,ownerNow))
      return result('OWNER_CHANGED_AFTER_OPEN',{status:'UNKNOWN'});
    let capture;
    try{capture=await controller.capture()}catch{}
    if(!safeCapture(capture))
      return result('OPEN_PHONE_REPORTED_BUT_SPLIT_UNVERIFIED',{status:'UNVERIFIED'});
    if(!same(owner(ownerNow.commandId),ownerNow))
      return result('OWNER_CHANGED_AFTER_OPEN_SNAPSHOT',{status:'UNKNOWN'});
    let address;
    try{address=await readSignedAddress({
      commandId:ownerNow.commandId,
      expectedUrl:record.url,
      expectedPaneDigest:capture.rightPaneDigest,
      deviceId:ownerNow.deviceId
    })}catch{}
    if(!checkedAddress(address,ownerNow,record.url,clock(),capture.rightPaneDigest))
      return result('OPEN_PHONE_REPORTED_ADDRESS_UNVERIFIED',{status:'UNVERIFIED'});
    return Object.freeze({
      ok:true,code:'LEFT_BROWSER_ADDRESS_CONFIRMED',status:'ADDRESS_CONFIRMED',
      openedUrl:record.url,workSide:'LEFT',chatSide:'RIGHT',
      pageContentVerified:false,externalEffectVerified:false,autoRetry:false
    });
  }
  async function openWeb(req,o){
    const url=resolveAndroidWebTarget(req.target);
    if(!url)return result('WEB_TARGET_NOT_ALLOWED_OR_UNKNOWN');
    if(!hex32(req.operationId))return result('OPERATION_ID_REQUIRED');
    const existing=openLedger.get(req.operationId);
    if(existing)return result(existing.commandId===o.commandId && existing.url===url
      ?'OPEN_ALREADY_REQUESTED_NO_AUTO_REPLAY':'OPEN_OPERATION_ID_CONFLICT', {
        previousStatus:existing.status
      });
    if(openLedger.size>=maxOpenOperations)
      return result('OPEN_LEDGER_CAPACITY_REACHED');
    if(!supported())return result('ANDROID_LEFT_WEB_ENGINE_NOT_READY');
    let c;
    try{c=await readSignedCapability()}catch{}
    if(!checkedPhoneCapability(c,o,clock()))
      return result('SIGNED_PHONE_LEFT_WEB_CAPABILITY_REQUIRED');
    if(!same(owner(o.commandId),o))return result('UNIFIED_OWNER_CHANGED');
    let capture;
    try{capture=await controller.capture()}catch{}
    if(!safeCapture(capture))return result('LEFT_BROWSER_RIGHT_GPT_NOT_CONFIRMED');
    if(!same(owner(o.commandId),o))return result('UNIFIED_OWNER_CHANGED');
    // Record BEFORE invoking any external effect. Errors after invoke are
    // UNKNOWN. Durable restart fencing stays in original JH journal.
    const record={commandId:o.commandId,deviceId:o.deviceId,sessionId:o.sessionId,
      url,jobId:null,status:'UNKNOWN'};
    openLedger.set(req.operationId,record);
    let reply;
    try{reply=await openLeftWeb({
      url,target:'left_web_link',deviceId:o.deviceId,
      commandId:o.commandId,operationId:req.operationId,
      expectedPaneDigest:capture.rightPaneDigest
    })}catch{return result('LEFT_WEB_OPEN_OUTCOME_UNKNOWN_NO_REPLAY',{status:'UNKNOWN'})}
    if(!checkedOpenJob(reply,o,null)){
      return result('LEFT_WEB_OPEN_RECEIPT_UNVERIFIED_NO_REPLAY',{status:'UNKNOWN'});
    }
    record.jobId=reply.jobId;
    record.status=reply.status;
    if(!same(owner(o.commandId),o))
      return result('UNIFIED_OWNER_CHANGED_AFTER_OPEN_NO_REPLAY',{status:'UNKNOWN'});
    if(reply.status!=='complete')
      return result('OPEN_QUEUED_READ_SAME_JOB',{
        status:'PENDING',operationId:req.operationId
      });
    return readOpenStatus(record,o);
  }
  async function run(req){
    if(!enabled)return result('UNIFIED_ANDROID_DISABLED');
    if(!plain(req)||!actions.includes(req.mode))
      return result('UNIFIED_MODE_UNSUPPORTED');
    if(!supported())return result('ANDROID_LEFT_WEB_ENGINE_NOT_READY');
    const o=owner(req.commandId);
    if(!o)return result('CURRENT_SIGNED_OWNER_COMMAND_REQUIRED');
    if(req.mode==='OPEN_APP')
      return result('LEFT_NATIVE_APP_ADAPTER_NOT_VERIFIED');
    if(req.mode==='OPEN_WEB')return openWeb(req,o);
    if(req.mode==='STATUS_OPEN'){
      if(!hex32(req.operationId))return result('OPERATION_ID_REQUIRED');
      const record=openLedger.get(req.operationId);
      if(!record||!same(record,o))return result('ORIGINAL_OPEN_JOB_NOT_FOUND');
      if(!record.jobId)return result('OPEN_DISPATCH_OUTCOME_UNKNOWN_NO_REPLAY',{status:'UNKNOWN'});
      return readOpenStatus(record,o);
    }
    if(req.mode==='OBSERVE')return observe({...req,owner:o});
    if(req.mode==='PREPARE_UI'){
      const r=await controller.prepare({args:req.args});
      return Object.freeze({...r,autoRetry:false,externalEffectVerified:false});
    }
    if(req.mode==='EXECUTE_UI'){
      const r=await controller.execute({
        preparationId:req.preparationId,operationId:req.operationId
      });
      return Object.freeze({...r,autoRetry:false,externalEffectVerified:false});
    }
    if(req.mode==='STATUS_UI'){
      const r=await controller.status({operationId:req.operationId});
      return Object.freeze({...r,autoRetry:false,externalEffectVerified:false});
    }
    if(req.mode==='CANCEL_UI'){
      const r=controller.cancelPreparation();
      return Object.freeze({...r,autoRetry:false,externalEffectVerified:false});
    }
    return result('UNIFIED_MODE_UNSUPPORTED');
  }
  return Object.freeze({
    run,
    capabilities:()=>Object.freeze({
      engine:'ANDROID_SECURE56_SINGLE',
      enabled:enabled===true&&supported(),
      leftWebRightGpt:true,
      webAndUiOneDevicePath:true,
      playwrightFallback:false,
      phoneOpenCapabilityRequired:true,
      existingJHApprovals:true,
      modes:[...actions],
      livePhoneVerified:false
    })
  });
}
