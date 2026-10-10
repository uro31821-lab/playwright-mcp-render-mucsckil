/** Host-only executor for the EXISTING native open-and-snapshot handler.
 * Opt-in open-and-return only, currently Kakao T. No new listener, credentials,
 * approval mechanism, scheduler, persistent ledger, or replacement dispatcher.
 * Raw jobs/status views come from the authenticated host's existing job store.
 * Process-local workflow dedupe supplements, never replaces, the durable fence.
 */
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {createVerifiedReturnHandoff} from './verified-return-handoff.mjs';
import {inspectNativeReadback} from './native-readback.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const validId=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{8,160}$/.test(x);
const fault=code=>{throw Object.assign(Error(code),{code});};
const rejected=code=>Object.freeze({ok:false,code,taskSuccessVerified:false,appReturnVerified:false});
export function createVerifiedNativeRoundtrip({selectContext,requestJob,waitJob,jobView,cancelQueued,clock=Date.now,maxRecords=64}={}){
 if(![selectContext,requestJob,waitJob,jobView,cancelQueued,clock].every(x=>typeof x==='function')||
    !Number.isSafeInteger(maxRecords)||maxRecords<1||maxRecords>256)throw Error('ROUNDTRIP_HOST_REQUIRED');
 const records=new Map(),busyDevices=new Map();
 const same=(a,b)=>a?.deviceId===b?.deviceId&&a?.sessionId===b?.sessionId;
 function current(r){
  if(r.stopped)fault('ROUNDTRIP_STOPPED');
  const t=clock();
  if(!Number.isSafeInteger(t)||t<r.highWater)fault('ROUNDTRIP_CLOCK_ROLLBACK');
  r.highWater=t;
  if(t>=r.deadline)fault('ROUNDTRIP_EXPIRED');
  if(!same(selectContext(),r.context))fault('ROUNDTRIP_DEVICE_OR_SESSION_CHANGED');
  return t;
 }
 function evidence(r,job,view,minimum){
  const t=current(r),ended=Date.parse(job?.completedAt);
  if(job?.status!=='complete'||job?.result?.ok!==true)fault('ROUNDTRIP_ACTION_NOT_CONFIRMED');
  if(job.targetDeviceId!==r.context.deviceId||job.secureSessionId!==r.context.sessionId)fault('ROUNDTRIP_JOB_BINDING');
  if(!Number.isSafeInteger(job.createdAtMs)||job.createdAtMs<minimum||job.createdAtMs>t||
     !Number.isFinite(ended)||ended<job.createdAtMs||ended>t)fault('ROUNDTRIP_EVIDENCE_TIME');
  if(view?.idDigest!==sha(job.id)||view.type!==job.type||view.status!==job.status||
     view.completedAt!==job.completedAt||!isDeepStrictEqual(view.result,job.result)||
     view.deviceReportedOutcome!=='DEVICE_REPORTED_OK_UNVERIFIED')fault('ROUNDTRIP_STATUS_BINDING');
 }
 async function step(r,type,payload){
  const minimum=current(r);
  const admission=requestJob(type,payload,r.context.deviceId);
  // Never adopt/cancel a cached job belonging to another invocation.
  if(admission?.isNew!==true||!admission.job)fault('ROUNDTRIP_EXISTING_JOB_REQUIRES_REVIEW');
  const submitted=admission.job;r.pending=submitted;
  if(submitted.type!==type||submitted.targetDeviceId!==r.context.deviceId||submitted.secureSessionId!==r.context.sessionId)fault('ROUNDTRIP_JOB_BINDING');
  let observed;
  try{observed=await waitJob(submitted,Math.min(15000,Math.max(1,r.deadline-current(r))));}
  catch{current(r);fault('ROUNDTRIP_TRANSPORT_UNCERTAIN');}
  current(r);
  if(!observed||observed.id!==submitted.id||observed.type!==type)fault('ROUNDTRIP_JOB_BINDING');
  const job=structuredClone(observed),view=structuredClone(jobView(observed));
  evidence(r,job,view,minimum);
  return {job,view};
 }
 async function execute(r){
  let gate;
  try{
   current(r);
   // Start the context before the first observed origin screen.
   r.phase='ORIGIN';
   const first=await step(r,'agent_snapshot',{});
   const origin=inspectNativeReadback(first.job);
   if(!origin.ready||origin.partial||origin.observedPackages?.length!==1)fault('ROUNDTRIP_ORIGIN_NOT_OBSERVED');
   const originPackage=origin.observedPackages[0];
   if(originPackage==='com.kakao.taxi')fault('ROUNDTRIP_ORIGIN_EQUALS_DESTINATION');
   gate=createVerifiedReturnHandoff({workflowId:r.workflowId,...r.context,originPackage,
    destinationPackage:'com.kakao.taxi',now:()=>r.highWater,ttlMs:120000});
   // The original contract's creation time is the start of the workflow, not
   // the later callback time. Supply it through a separate bounded clock.
   let gateTime=r.started;
   gate=createVerifiedReturnHandoff({workflowId:r.workflowId,...r.context,originPackage,
    destinationPackage:'com.kakao.taxi',now:()=>gateTime,ttlMs:120000});
   const binding={workflowId:r.workflowId,...r.context,destinationTarget:'카카오T'};
   gateTime=current(r);
   if(!gate.captureOrigin({binding,snapshot:first.job}).ok)fault('ROUNDTRIP_ORIGIN_NOT_VERIFIED');
   r.phase='EXECUTION';
   const opened=await step(r,'open_url',{target:'카카오T',url:'카카오T'});
   if(opened.job.target!=='카카오T')fault('ROUNDTRIP_TARGET_CHANGED');
   binding.dispatchJobId=opened.job.id;
   r.phase='VERIFICATION';
   const destination=await step(r,'agent_snapshot',{});gateTime=current(r);
   if(!gate.verifyDestination({binding,actionJob:opened.job,actionStatus:opened.view,readbackJob:destination.job}).ok)
    fault('ROUNDTRIP_DESTINATION_NOT_VERIFIED');
   r.phase='RETURN';gateTime=current(r);
   if(!gate.authorizeReturn({binding,explicitlyRequested:r.explicitReturn,target:'last_work_screen'}).ok)
    fault('ROUNDTRIP_RETURN_NOT_AUTHORIZED');
   // No await between the final state check and the existing host dispatcher.
   const returned=await step(r,'open_url',{target:'last_work_screen',url:''});
   if(returned.job.target!=='last_work_screen')fault('ROUNDTRIP_RETURN_TARGET_CHANGED');
   binding.returnJobId=returned.job.id;
   r.phase='RETURN_VERIFICATION';
   const last=await step(r,'agent_snapshot',{});gateTime=current(r);
   const result=gate.verifyReturn({binding,returnJob:returned.job,returnStatus:returned.view,readbackJob:last.job});
   if(!result.ok)fault('ROUNDTRIP_RETURN_NOT_OBSERVED');
   r.phase='COMPLETE';
   return Object.freeze({ok:true,code:'ROUNDTRIP_APP_RETURN_VERIFIED',route:'android',appReturnVerified:true,
    taskSuccessVerified:false,pageOrScrollRestored:false,automaticReplayCount:0});
  }catch(e){
   // Only own still-queued work can be cancelled. A delivered action can have
   // happened; never roll back, replay, or claim to undo that action.
   if(r.pending)try{cancelQueued(r.pending,r.context);}catch{}
   const code=typeof e?.code==='string'&&/^ROUNDTRIP_[A-Z_]+$/.test(e.code)?e.code:'ROUNDTRIP_UNVERIFIED';
   const failedPhase=r.phase;r.phase=r.stopped?'STOPPED':'BLOCKED';
   return Object.freeze({...rejected(code),failedPhase,automaticReplayCount:0});
  }finally{if(busyDevices.get(r.context.deviceId)===r.workflowId)busyDevices.delete(r.context.deviceId);}
 }
 return Object.freeze({
  run({workflowId,target,explicitReturn=false,url}={}){
   if(!validId(workflowId)||explicitReturn!==true)return Promise.resolve(rejected('ROUNDTRIP_EXPLICIT_REQUEST_REQUIRED'));
   if(!['카카오t','카카오티','kakao t','카카오 택시'].includes(String(target||'').trim().toLowerCase())||url)
    return Promise.resolve(rejected('ROUNDTRIP_NATIVE_TARGET_REQUIRED'));
   const context=selectContext();
   if(!validId(context?.deviceId)||!validId(context?.sessionId))return Promise.resolve(rejected('ROUNDTRIP_ACTIVE_CONTEXT_REQUIRED'));
   const fingerprint=sha(JSON.stringify([context.deviceId,context.sessionId,'카카오T',explicitReturn]));
   const old=records.get(workflowId);
   if(old)return old.fingerprint===fingerprint?old.promise:Promise.resolve(rejected('ROUNDTRIP_WORKFLOW_BINDING_CONFLICT'));
   if(busyDevices.has(context.deviceId))return Promise.resolve(rejected('ROUNDTRIP_DEVICE_BUSY'));
   if(records.size>=maxRecords)return Promise.resolve(rejected('ROUNDTRIP_REGISTRY_FULL'));
   const started=clock();if(!Number.isSafeInteger(started)||started<0)return Promise.resolve(rejected('ROUNDTRIP_CLOCK_INVALID'));
   const r={workflowId,context:{...context},fingerprint,started,highWater:started,deadline:started+120000,
    explicitReturn:true,stopped:false,pending:null,phase:'ROUTE',promise:null};
   records.set(workflowId,r);busyDevices.set(context.deviceId,workflowId);
   r.promise=Promise.resolve().then(()=>execute(r));return r.promise;
  },
  stop(workflowId){
   const r=records.get(workflowId);if(!r)return rejected('ROUNDTRIP_NOT_FOUND');
   if(['COMPLETE','BLOCKED','STOPPED'].includes(r.phase))return rejected('ROUNDTRIP_ALREADY_TERMINAL');
   r.stopped=true;
   if(r.pending)try{cancelQueued(r.pending,r.context);}catch{}
   return Object.freeze({ok:true,code:'ROUNDTRIP_STOP_ACCEPTED',inFlightMayHaveExecuted:r.pending?.status==='in_progress'});
  }
 });
}
