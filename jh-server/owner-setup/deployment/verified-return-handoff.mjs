/** Candidate-only contract for JH's route -> native -> readback -> explicit return.
 * Reuses existing native-readback validator. No device calls, phone approvals,
 * new credentials, background retries or startup wiring. All evidence MUST come
 * from the authenticated existing host, never from client-supplied JSON.
 */
import {inspectNativeReadback} from './native-readback.mjs';
const id=x=>typeof x==='string'&&x.length>=4&&x.length<=200&&/^[A-Za-z0-9_.:-]+$/.test(x);
const pkg=x=>typeof x==='string'&&x.length<=200&&/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+$/.test(x);
const deny=code=>Object.freeze({ok:false,code});
const grant=(code,extra={})=>Object.freeze({ok:true,code,...extra});
export function createVerifiedReturnHandoff({workflowId,deviceId,sessionId,originPackage,destinationPackage,now=Date.now,ttlMs=60000}={}){
 if(![workflowId,deviceId,sessionId].every(id)||!pkg(originPackage)||!pkg(destinationPackage)||
   originPackage===destinationPackage||typeof now!=='function'||!Number.isSafeInteger(ttlMs)||ttlMs<1000||ttlMs>120000)
   throw Error('HANDOFF_CONFIGURATION_INVALID');
 const created=now();
 if(!Number.isSafeInteger(created)||created<0)throw Error('HANDOFF_CLOCK_INVALID');
 const deadline=created+ttlMs;
 let state='CAPTURE_ORIGIN',origin=null,seenDestination=null,returnTokenConsumed=false;
 const current=()=>{const t=now();return Number.isSafeInteger(t)&&t>=created&&t<=deadline;};
 const same=e=>e?.workflowId===workflowId&&e?.deviceId===deviceId&&e?.sessionId===sessionId;
 function observed(snapshot,expected,minTime){
   if(!snapshot||snapshot.status!=='complete'||!id(snapshot.id)||snapshot.targetDeviceId!==deviceId||
     snapshot.secureSessionId!==sessionId||!Number.isSafeInteger(snapshot.createdAtMs)||
     snapshot.createdAtMs<minTime||snapshot.createdAtMs>now()||
     !Number.isFinite(Date.parse(snapshot.completedAt))||
     Date.parse(snapshot.completedAt)<snapshot.createdAtMs)return false;
   const inspected=inspectNativeReadback(snapshot,expected);
   return inspected.ready===true&&inspected.targetMatched===true&&inspected.partial===false;
 }
 function actionConfirmed(job,status,expectedId,expectedTarget){
   return job?.id===expectedId&&job?.type==='open_url'&&job?.target===expectedTarget&&
     job?.targetDeviceId===deviceId&&job?.secureSessionId===sessionId&&
     job?.status==='complete'&&job?.result?.ok===true&&
     Number.isFinite(Date.parse(job?.completedAt))&&
     status?.status==='complete'&&status?.deviceReportedOutcome==='DEVICE_REPORTED_OK_UNVERIFIED'&&status?.result?.ok===true;
 }
 return Object.freeze({
  get state(){return state},
  captureOrigin({binding,snapshot}={}){
   if(!current())return deny('HANDOFF_EXPIRED');
   if(!same(binding)||state!=='CAPTURE_ORIGIN')return deny('HANDOFF_ORIGIN_SCOPE');
   if(!observed(snapshot,originPackage,created))return deny('HANDOFF_ORIGIN_NOT_VERIFIED');
   origin={snapshotId:snapshot.id,at:Date.parse(snapshot.completedAt)};
   state='WAIT_DESTINATION';return grant('HANDOFF_ORIGIN_CAPTURED');
  },
  verifyDestination({binding,actionJob,actionStatus,readbackJob}={}){
   if(!current())return deny('HANDOFF_EXPIRED');
   if(!same(binding)||state!=='WAIT_DESTINATION'||!origin)return deny('HANDOFF_DESTINATION_SCOPE');
   if(!actionConfirmed(actionJob,actionStatus,binding?.dispatchJobId,binding?.destinationTarget))
     return deny('HANDOFF_ACTION_NOT_CONFIRMED');
   if(!id(binding?.dispatchJobId)||binding?.destinationTarget!=='카카오T'||
     Date.parse(actionJob.completedAt)<origin.at)return deny('HANDOFF_ACTION_SCOPE');
   if(!observed(readbackJob,destinationPackage,Date.parse(actionJob.completedAt))||
     readbackJob.id===origin.snapshotId||readbackJob.id===actionJob.id)return deny('HANDOFF_DESTINATION_NOT_VERIFIED');
   seenDestination={actionId:actionJob.id,snapshotId:readbackJob.id,at:Date.parse(readbackJob.completedAt)};
   state='READY_FOR_EXPLICIT_RETURN';
   return grant('HANDOFF_DESTINATION_CONFIRMED',{taskSuccessVerified:false});
  },
  authorizeReturn({binding,explicitlyRequested=false,target}={}){
   if(!current())return deny('HANDOFF_EXPIRED');
   if(!same(binding)||state!=='READY_FOR_EXPLICIT_RETURN'||returnTokenConsumed)return deny('HANDOFF_RETURN_NOT_READY');
   if(explicitlyRequested!==true||target!=='last_work_screen')return deny('HANDOFF_EXPLICIT_RETURN_REQUIRED');
   returnTokenConsumed=true;state='RETURN_AUTHORIZED';
   return grant('HANDOFF_RETURN_ALLOWED_ONCE',{target:'last_work_screen',expectedPackage:originPackage,deviceId,sessionId,workflowId});
  },
  verifyReturn({binding,returnJob,returnStatus,readbackJob}={}){
   if(!current())return deny('HANDOFF_EXPIRED');
   if(!same(binding)||state!=='RETURN_AUTHORIZED'||!returnTokenConsumed||!seenDestination)
     return deny('HANDOFF_RETURN_SCOPE');
   if(!actionConfirmed(returnJob,returnStatus,binding?.returnJobId,'last_work_screen')||
     Date.parse(returnJob?.completedAt)<seenDestination.at)return deny('HANDOFF_RETURN_ACTION_NOT_CONFIRMED');
   if(!observed(readbackJob,originPackage,Date.parse(returnJob.completedAt))||
     readbackJob.id===seenDestination.snapshotId||readbackJob.id===returnJob.id)
     return deny('HANDOFF_RETURN_NOT_OBSERVED');
   state='RETURN_CONFIRMED';
   return grant('HANDOFF_RETURN_CONFIRMED',{appReturnVerified:true,pageOrScrollRestored:false,taskSuccessVerified:false});
  }
 });
}
