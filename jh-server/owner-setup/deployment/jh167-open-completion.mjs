import {inspectSplitEvidence} from './split-screen-evidence.mjs';

// Observation of an existing signed job only. No dispatcher, HTTP sender,
// session recovery, approval or action-retry port is accepted by this module.
export const OPEN_COMPLETION_WAIT_MS=40000;
export const OPEN_STATUS_WAIT_MS=10000;
const pending=j=>j?.status==='queued'||j?.status==='in_progress';
const canonicalUrl=value=>{
 try {const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;}
 catch {return null;}
};

export function describeOpenCompletion(job,{commandId,sessionId}={}){
 const received=job?.status==='complete';
 const base={completionReceived:received,jobStatus:job?.status??'not_found',
  actionSucceeded:null,rightAddressConfirmed:false,pageContentVerified:false,
  automaticReplayAllowed:false,executionStatus:'EFFECT_UNKNOWN',
  deliveryStatus:received?'RECEIVED':'UNCONFIRMED',code:'OPEN_COMPLETION_UNKNOWN',
  followUp:null};
 if(!job)return {...base,code:'OPEN_JOB_NOT_FOUND'};
 if(job.type!=='open_url'||!job.secureSessionId||!commandId||
    job.commandId!==commandId||job.secureSessionId!==sessionId)
  return {...base,code:'OPEN_COMPLETION_BINDING_CHANGED'};
 if(pending(job))return {...base,deliveryStatus:'PENDING',executionStatus:'PENDING',
  code:'OPEN_COMPLETION_PENDING',
  followUp:{tool:'life_job_status',arguments:{job_id:job.id,command_id:commandId},
   readOnly:true,instruction:'Read this existing job only. Do not call BEGIN_COMMAND or open the app again.'}};
 if(!received){
  // Even a missing dispatch timestamp cannot prove no execution occurred.
  // Keep terminal-without-receipt outcomes unknown; never infer failure.
  return base;
 }
 const result=job.result;
 const receivedAt=Date.parse(job.completedAt);
 const target=canonicalUrl(job.url),reported=canonicalUrl(result?.url);
 const timed=Number.isFinite(receivedAt)&&Number.isFinite(job.startedAtMs)&&receivedAt>=job.startedAtMs;
 // Validate the proof at receipt time. A later status read describes that past
 // receipt; it does not claim the phone is still showing the same page now.
 const proof=timed?inspectSplitEvidence(result,null,'com.android.chrome',receivedAt):{ok:false};
 const observed=Number(result?.splitScreen?.observedAtMs);
 const confirmed=result?.ok===true&&result.rightAddressConfirmed===true&&
  target!==null&&target===reported&&proof.ok&&observed>=job.startedAtMs;
 if(!confirmed)return {...base,code:'OPEN_RESULT_UNCONFIRMED',
  deviceReportedCode:typeof result?.code==='string'?result.code:null};
 return {...base,executionStatus:'EFFECT_CONFIRMED',code:'RIGHT_ADDRESS_CONFIRMED',
  actionSucceeded:true,rightAddressConfirmed:true,
  pageContentVerified:result.pageContentVerified===true,confirmedAt:job.completedAt,
  confirmationScope:'REQUESTED_ADDRESS_IN_RIGHT_CHROME_AT_RECEIPT_TIME'};
}

export async function awaitOpenCompletion(job,{waitJob,currentBinding,budgetMs=OPEN_COMPLETION_WAIT_MS}){
 const before=currentBinding();
 const expected=job&&{id:job.id,commandId:job.commandId,targetDeviceId:job.targetDeviceId,secureSessionId:job.secureSessionId};
 if(pending(job)&&job.type==='open_url'&&job.secureSessionId&&
    job.commandId===before.commandId&&job.secureSessionId===before.sessionId){
  const received=await waitJob(job,Math.min(OPEN_COMPLETION_WAIT_MS,Math.max(0,budgetMs)));
  // An adapter cannot silently substitute another job or binding after waiting.
  if(received?.id!==expected.id||received?.commandId!==expected.commandId||
     received?.targetDeviceId!==expected.targetDeviceId||received?.secureSessionId!==expected.secureSessionId)
   return {job:null,summary:{...describeOpenCompletion(null),code:'OPEN_COMPLETION_CORRELATION_MISMATCH'}};
  job=received;
 }
 return {job,summary:describeOpenCompletion(job,currentBinding())};
}

const IMPORT='import {awaitOpenCompletion as jhAwaitOpenCompletion56, OPEN_COMPLETION_WAIT_MS as jhOpenWait56, OPEN_STATUS_WAIT_MS as jhOpenStatusWait56} from "../deployment/jh167-open-completion.mjs";\n';
const HELPER=`  async function jhOpenCompletion56(job,budgetMs=jhOpenWait56){
    const observed=await jhAwaitOpenCompletion56(job,{
      waitJob,budgetMs,currentBinding:()=>({
        commandId:jhRequireCommand56(job?.targetDeviceId),
        sessionId:active56(job?.targetDeviceId)?.sessionId
      })
    });
    const legacy=jobResult(observed.job);
    return {...JSON.parse(legacy.content[0].text),...observed.summary,job:legacy};
  }
`;
export function patchJH167OpenCompletion56(source){
 if(typeof source!=='string'||source.includes(IMPORT))throw Error('JH_OPEN_COMPLETION_ALREADY_PATCHED');
 const edits=[];
 const once=(before,after)=>{
  if(source.split(before).length!==2)throw Error('JH_OPEN_COMPLETION_ANCHOR_CHANGED');
  source=source.replace(before,after);edits.push([before,after]);
 };
 const original=source;
 once('  let jhRightWebOpen56=null;\n',HELPER+'  let jhRightWebOpen56=null;\n');
 for(const [url,indent] of [['url:raw','      '],['url','        ']]){
  const before=`const finished=await waitJob(j,22000);\n${indent}return textResult({route:"android_right",service:raw,${url},jobId:j.id,\n${indent}  rightAddressConfirmed:finished?.status==="complete"&&finished?.result?.rightAddressConfirmed===true,\n${indent}  job:jobResult(finished)});`;
  const after=`const completion=await jhOpenCompletion56(j);\n${indent}return textResult({route:"android_right",service:raw,${url},jobId:j.id,...completion});`;
  once(before,after);
 }
 const old='  },async({job_id})=>{cleanupJobs();return jobResult(jobs.get(job_id));});';
 const updated=`  },async({job_id})=>{
    cleanupJobs();const job=jobs.get(job_id);
    if(job?.type!=="open_url")return jobResult(job);
    const completion=await jhOpenCompletion56(job,jhOpenStatusWait56);
    return textResult({jobId:job_id,...completion});
  });`;
 once(old,updated);
 once('description:"Read a queued Android job result.",',
  'description:"Read the existing Android job only. For an OPEN_COMPLETION_PENDING result, reuse the same job_id and command_id here; never BEGIN_COMMAND or reopen the app. Waits up to 10 seconds for that open job receipt. Missing receipt is not execution failure.",');
 let reverse=source;
 for(const [before,after]of edits.reverse())reverse=reverse.replace(after,before);
 if(reverse!==original)throw Error('JH_OPEN_COMPLETION_SCOPE_CHANGED');
 return IMPORT+source;
}
