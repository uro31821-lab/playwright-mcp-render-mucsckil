/** Outermost, reversible learning patch for the complete operator runtime.
 * Memory tools add no executor, approval, dispatch, or authentication decision.
 * The original source and its security/receipt patches must be verified first.
 */
const PREFIX = 'import {describeOpenCompletion as jhLearningDescribeOpen56} from "../deployment/jh167-open-completion.mjs";\n' +
  'import {registerLearningTools as jhRegisterLearningTools56} from "../operational-learning/mcp-tools.mjs";\n';
const CONTEXT = 'const jhCommandContext56=new JhAsyncLocalStorage56();';
const REGISTER = 'const scoped=jhCommandTool56(name,config,handler);';
const REGISTERED = 'const scoped=jhCommandTool56(name,config,jhLearningHandler56(name,handler));if(name===\'life_learning_context\'||name===\'life_learning_review\')scoped.config.description=config.description;';
const TOOL_ANCHOR = '  registerOAuthTool("life_status",{';
const CREATED = '  return cacheSet(recentJobs,key,j);';
const COMPLETED = '    j.status="complete";j.result=body.result;j.completedAt=new Date().toISOString();';
const RETENTION = '    if((j.status==="complete"||j.status==="error"||j.status==="expired") && j.completedAt && now-Date.parse(j.completedAt)>COMPLETED_JOB_RETENTION_MS)jobs.delete(id);';

const SHARED = String.raw`
// Only a host-installed observer can receive these bounded metadata records.
let jhLearningController56=null;
let jhLearningInstalled56=false;
const jhLearningModes56=new Set(['BEGIN_COMMAND','BEGIN','OPEN_KAKAO_T','RETURN_PREVIOUS',
  'START','SAVE_ANALYSIS','FOLLOW_UP','STATUS','FINISH','CANCEL','READBACK_PENDING',
  'SUMMARY','EXPLAIN','SIMPLIFY','TRANSLATE','TABLE','COMPARE','ERROR','REQUIRED',
  'CONTINUE','EVIDENCE','UNCERTAINTY','OCR','MANUAL_HANDOFF','KEYBOARD_ADVICE',
  'SCROLL_ONCE','ZOOM','ZOOM_RESET','RESTORE_INFO']);
function jhLearningRequestId56(value){
  return Number.isSafeInteger(value)||(typeof value==='string'&&/^[A-Za-z0-9._:-]{1,128}$/.test(value))?value:null;
}
function jhLearningCommandId56(value){
  return typeof value==='string'&&/^[a-f0-9]{32}$/.test(value)?value:null;
}
function jhLearningJobMeta56(job,completed){
  if(!job||!/^job_[1-9][0-9]{0,15}$/.test(job.id||'')||
     typeof job.type!=='string'||!/^[a-z][a-z0-9_]{0,79}$/.test(job.type)||
     !['queued','in_progress','complete','error','expired'].includes(job.status))return null;
  const meta={id:job.id,type:job.type,commandId:jhLearningCommandId56(job.commandId),status:job.status};
  const code=completed?job.result?.code??job.error:job.error;
  if(typeof code==='string'&&/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(code))meta.code=code;
  if(completed&&job.status==='complete'&&job.secureSessionId){
    // Only a digest crosses this boundary; no URL, body, grant or session is sent.
    meta.evidenceDigest=sha56(stable56([job.id,job.secureSessionId,job.completedAt,job.result??null]));
    if(job.type==='open_url'&&meta.commandId){
      const proof=jhLearningDescribeOpen56(job,{commandId:job.commandId,sessionId:job.secureSessionId});
      if(proof.executionStatus==='EFFECT_CONFIRMED'&&proof.actionSucceeded===true&&
         proof.confirmationScope==='REQUESTED_ADDRESS_IN_RIGHT_CHROME_AT_RECEIPT_TIME')
        meta.verifiedOutcome='success_verified';
    }
  }
  return Object.freeze(meta);
}
function jhLearningObserveJob56(method,job){
  const controller=jhLearningController56;
  if(!controller)return;
  try{
    const meta=jhLearningJobMeta56(job,method==='jobCompleted');
    if(meta)Promise.resolve(controller[method](meta)).catch(()=>{});
  }catch{} // Observation cannot change the accepted job or its HTTP response.
}
async function jhLearningStatus56(result,controller){
  if(!result||!Array.isArray(result.content)||result.content[0]?.type!=='text')return result;
  let payload;
  try{payload=JSON.parse(result.content[0].text);}catch{return result;}
  if(!payload||typeof payload!=='object'||Array.isArray(payload))return result;
  const degraded={status:'degraded',code:'LEARNING_UNAVAILABLE',replay:false};
  let status;
  try{
    status=await controller.status();
    if(!status||typeof status!=='object'||Array.isArray(status))throw Error('invalid_learning_status');
    JSON.stringify(status);
  }catch{status=degraded;}
  return {...result,content:[{...result.content[0],
    text:JSON.stringify({...payload,operationalLearning:status})},...result.content.slice(1)]};
}
function jhLearningHandler56(name,handler){
  return async function(...args){
    const receiver=this,controller=jhLearningController56;
    if(!controller)return handler.apply(receiver,args);
    let call;
    try{
      const mode=args[0]?.mode;
      call=Object.freeze({name,commandId:jhLearningCommandId56(jhCommandContext56.getStore()?.commandId),
        mode:jhLearningModes56.has(mode)?mode:null,requestId:jhLearningRequestId56(args[1]?.requestId)});
    }catch{return handler.apply(receiver,args);}
    let started=false,pending,decorated,observerFailed=false;
    const once=()=>{
      if(!started){
        started=true;
        pending=Promise.resolve().then(()=>handler.apply(receiver,args));
        pending.catch(()=>{});
      }
      return pending;
    };
    try{decorated=await controller.invoke(call,once);}catch{observerFailed=true;}
    // Controller failure (before OR after invoking) never retries the action.
    // Awaiting the same promise also preserves the exact original exception.
    const controllerInvoked=started;
    const original=await once();
    const result=observerFailed||!controllerInvoked||decorated===undefined?original:decorated;
    if(name==='life_status'){
      try{return await jhLearningStatus56(result,controller);}catch{return result;}
    }
    return result;
  };
}
export function installOperationalLearning56(controller){
  if(jhLearningInstalled56||httpServer.listening||jobs.size||devices.size)
    throw Error('LEARNING_INSTALL_BEFORE_LISTEN_ONLY');
  const methods=['invoke','jobCreated','jobCompleted','status','close'];
  if(!controller||methods.some(key=>typeof controller[key]!=='function'))
    throw Error('LEARNING_CONTROLLER_REQUIRED');
  const exposed=[...methods,...['context','review'].filter(key=>typeof controller[key]==='function')];
  const installed=Object.freeze(Object.fromEntries(exposed.map(key=>[key,controller[key].bind(controller)])));
  jhLearningController56=installed;jhLearningInstalled56=true;
  let closed=false;
  return Object.freeze({installed:true,automaticReplayAllowed:false,close(){
    if(closed)return;closed=true;jhLearningController56=null;
    // The owner host detaches first, then flushes/closes its controller.
  }});
}
`;

const PAIRS = [
  [CONTEXT, CONTEXT + SHARED],
  [REGISTER, REGISTERED],
  [TOOL_ANCHOR, '  jhRegisterLearningTools56({registerOAuthTool,z,textResult,getController:()=>jhLearningController56});\n' + TOOL_ANCHOR],
  [CREATED, '  jhLearningObserveJob56("jobCreated",j);\n' + CREATED],
  [COMPLETED, COMPLETED + '\n    jhLearningObserveJob56("jobCompleted",j);'],
  [RETENTION, '    if(j.status==="error"||j.status==="expired")jhLearningObserveJob56("jobCompleted",j);\n' + RETENTION],
];
const REQUIRED = [
  'const pendingApprovalReceipts56=createPendingApprovalReceiptRegistry56();',
  'const jhSplitReadReceipts56=createSplitReadReceiptRegistry56();',
  'const computerInspectReceipt56=createComputerInspectReceiptRegistry56();',
  'jhV2State56.activeMcpCalls++;',
  'finally{jhV2State56.activeMcpCalls--;}',
  'durableNativeHooks56?.acceptedCompletion(j,body.result)',
  'durableNativeHooks56?.beforeDispatch(',
  'function jhRequireCommand56(',
];

export function applyOperationalLearningPatch(source) {
  if (typeof source !== 'string' || source.includes('jhLearningController56') ||
      !REQUIRED.every(anchor => source.includes(anchor)))
    throw Error('LEARNING_COMPLETE_OPERATOR_REQUIRED');
  let output = source;
  for (const [before, after] of PAIRS) {
    if (output.split(before).length !== 2 || output.includes(after))
      throw Error('LEARNING_PATCH_ANCHOR_DRIFT');
    output = output.replace(before, after);
  }
  output = PREFIX + output;
  if (reverseOperationalLearningPatch(output) !== source) throw Error('LEARNING_PATCH_SCOPE');
  return output;
}

export function reverseOperationalLearningPatch(source) {
  if (typeof source !== 'string' || !source.startsWith(PREFIX)) throw Error('LEARNING_PATCH_PREFIX');
  let output = source.slice(PREFIX.length);
  for (const [before, after] of PAIRS.slice().reverse()) {
    if (output.split(after).length !== 2) throw Error('LEARNING_REVERSE_ANCHOR');
    output = output.replace(after, before);
  }
  return output;
}
