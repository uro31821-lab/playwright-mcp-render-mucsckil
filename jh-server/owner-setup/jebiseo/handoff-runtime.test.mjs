import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createJebiseoHandoffSession} from './handoff-runtime.mjs';
import {createJebiseoRuntime} from './host-runtime.mjs';

// Preserve the explicit OPEN_MANUAL path; text-selection has its own runtime suite.
const createOpenManualSession = options => createJebiseoHandoffSession({...options, deliveryMode: 'OPEN_MANUAL'});

const deviceId='fixture-handoff-phone',commandId='1'.repeat(32);
const request=(overrides={})=>({taskRef:'fixture-handoff-task',threadRef:'fixture-handoff-thread',
  sourceRef:'fixture-user-request',intent:'execute',basis:'direct',feature:'YOUTUBE',
  requestText:'주요 내용을 정리해 줘',youtubeUrl:'https://youtu.be/abcde12345_',...overrides});
const reported=(session,step)=>({taskRef:session.request.taskRef,threadRef:session.request.threadRef,
  requestDigest:session.request.requestDigest,step});
const queued=()=>({toolInvoked:true,status:'PENDING',readbackRequired:true,
  effectKey:'e'.repeat(64),followUp:{tool:'life_job_status',readOnly:true,
    arguments:{job_id:'job_17',command_id:commandId}}});
const noSuccess=result=>{
  assert.equal(result.requestSent,false);assert.equal(result.resultVerified,false);
  assert.equal(result.externalEffectVerified,false);assert.equal(result.automaticReturnToGpt,false);
  assert.equal(result.automaticReplay,false);assert.equal(result.authorizesExecution,false);
};

test('Samsung actions prepare a native manual handoff without constructing a web or app-open runtime',async()=>{
  const session=createOpenManualSession({request:request({feature:'ANDROID',
    youtubeUrl:undefined,target:'삼성 계산기',requestText:'계산기를 열어 줘'}),deviceId,commandId,
    createOriginalRuntime(){assert.fail('Samsung request must not use Chrome or legacy three-app route');}});
  const guide=await session.start();
  assert.equal(guide.nextAction,'OPEN');assert.equal(guide.surface,'GEMINI_NATIVE');
  assert.equal(guide.automatedOpenAttempted,false);assert.equal(guide.requiresUserReply,false);
  assert.match(session.request.prompt,/계산기를 열어 줘/);noSuccess(guide);
  const view=session.presentation();assert.equal(view.manualSteps.length,3);
  assert.equal(view.preparedPrompt,session.request.prompt);assert.equal(view.requiresUserReply,false);
});

test('web request preparation remains usable without a phone command or full Gemini provider',async()=>{
  const session=createOpenManualSession({request:request(),
    createOriginalRuntime(){assert.fail('no binding must remain manual');}});
  const guide=await session.start();assert.equal(guide.nextAction,'OPEN');
  assert.equal(guide.reason,'EXISTING_PHONE_BINDING_UNAVAILABLE');
  assert.equal(guide.requiresUserReply,false);assert.match(session.request.prompt,/abcde12345_/);
  noSuccess(guide);
});

test('concurrent and repeated starts reuse exactly one original OPEN-only task and never send or collect',async()=>{
  const calls=[];let constructors=0,task;
  const session=createOpenManualSession({request:request(),deviceId,commandId,
    createOriginalRuntime(t){constructors++;task=t;return {
      async start(){calls.push('OPEN');return queued();},
      async runStep(input){calls.push(input);return {ok:true,status:'RETURNED'};},
      verifyReply(){assert.fail('no reply collection');},exportVideo(){assert.fail('no export');}
    };}});
  const [first,second]=await Promise.all([session.start(),session.start()]);
  assert.deepEqual(first,second);assert.equal(constructors,1);assert.deepEqual(calls,['OPEN']);
  assert.equal(task.intent,'open');assert.equal(task.feature,undefined);
  assert.equal(task.promptDigest,createHash('sha256').update('').digest('hex'));
  assert.equal(first.nextAction,'INSPECT_EXISTING');assert.equal(first.originalJobId,'job_17');
  assert.equal(first.manualExecutionRecommended,false);assert.equal(first.prompt,undefined);
  await session.start();assert.deepEqual(calls,['OPEN']);noSuccess(first);
  await session.readOpenStatus({job_id:'job_99'});
  assert.deepEqual(calls[1],{operation:'JOB_STATUS',args:{job_id:'job_17',command_id:commandId}});
  assert.equal(calls.length,2);noSuccess(session.view());
});

test('a dispatched ok response and a lost response are observation-only, never permission to resend',async()=>{
  for(const mode of ['ok','throw']) {
    let calls=0;
    const session=createOpenManualSession({request:request(),deviceId,commandId,
      createOriginalRuntime:()=>({runStep:async()=>{},start:async()=>{
        calls++;if(mode==='throw')throw Error('network_lost');
        return {ok:true,toolInvoked:true,status:'RETURNED'};
      }})});
    const guide=await session.start();await session.start();
    assert.equal(calls,1);assert.equal(guide.nextAction,'INSPECT_EXISTING');noSuccess(guide);
  }
});

test('an original pre-dispatch gap can hand off, while a retained uncertain effect stays observe-only',async()=>{
  for(const readbackRequired of [false,true]) {
    const session=createOpenManualSession({request:request(),deviceId,commandId,
      createOriginalRuntime:()=>({runStep:async()=>{},start:async()=>({toolInvoked:false,
        status:'BLOCKED',readbackRequired,code:readbackRequired
          ?'JEBISEO_PRIOR_EFFECT_READBACK_REQUIRED':'JEBISEO_ORIGINAL_PHONE_BINDING_REQUIRED'})})});
    const guide=await session.start();
    assert.equal(guide.nextAction,readbackRequired?'INSPECT_EXISTING':'OPEN');noSuccess(guide);
    if(readbackRequired) {
      assert.equal(session.presentation().preparedPrompt,undefined);
      assert.deepEqual(session.presentation().manualSteps,[guide.instruction]);
    }
  }
});

test('wrong-job, extra-argument and wrong-command followups cannot create a receipt read',async()=>{
  for(const arguments_ of [{job_id:'job_17',command_id:'2'.repeat(32)},
    {job_id:'https://attacker.invalid',command_id:commandId},
    {job_id:'job_17',command_id:commandId,manualDone:true}]) {
    const session=createOpenManualSession({request:request(),deviceId,commandId,
      createOriginalRuntime:()=>({start:async()=>({...queued(),followUp:{tool:'life_job_status',
        readOnly:true,arguments:arguments_}}),runStep:async()=>assert.fail('invalid followup')})});
    const guide=await session.start();assert.equal(guide.statusReadAvailable,false);
    await session.readOpenStatus();noSuccess(guide);
  }
});

test('manual reports are scoped and monotonic while YouTube return stays manual and unverified',async()=>{
  const session=createOpenManualSession({request:request()});await session.start();
  const before=session.view();
  assert.equal(session.reportManualProgress({...reported(session,'SUBMIT'),threadRef:'wrong-thread'}).ok,false);
  assert.equal(session.view(),before);
  const input=session.reportManualProgress(reported(session,'OPEN'));
  assert.equal(input.nextAction,'INPUT');assert.equal(input.prompt,session.request.prompt);
  assert.equal(session.presentation().manualSteps.length,2);
  const draft=session.reportManualProgress(reported(session,'INPUT'));
  assert.equal(draft.nextAction,'SUBMIT');
  assert.equal(session.presentation().preparedPrompt,undefined);
  assert.match(session.presentation().manualSteps[0],/기존 입력 문장을 확인/);
  assert.equal(session.presentation().manualSteps.length,2);
  const submitted=session.reportManualProgress(reported(session,'SUBMIT'));
  assert.equal(submitted.nextAction,'VIEW_GEMINI_RESULT');assert.equal(submitted.userReported,true);
  assert.equal(submitted.requiresUserReply,false);noSuccess(submitted);
  assert.equal(session.presentation().manualSteps.length,1);
  assert.equal(submitted.returnToGpt,true);
  assert.match(session.presentation().manualSteps[0],/분석이 끝난 뒤.*공유.*GPT/);
  assert.equal(session.presentation().preparedPrompt,undefined);
  assert.equal(session.reportManualProgress(reported(session,'INPUT')),submitted);
  assert.equal(await session.start(),submitted);
});

test('manual completion before start suppresses a later automated OPEN',async()=>{
  const session=createOpenManualSession({request:request(),deviceId,commandId,
    createOriginalRuntime(){assert.fail('user already completed manually');}});
  const final=session.reportManualProgress(reported(session,'SUBMIT'));
  assert.equal(await session.start(),final);noSuccess(final);
});

test('a late original OPEN response does not overwrite manual progress or offer another submit',async()=>{
  let release,entered;
  const started=new Promise(resolve=>{entered=resolve;});
  const session=createOpenManualSession({request:request(),deviceId,commandId,
    createOriginalRuntime:()=>({runStep:async()=>{},start:()=>{entered();
      return new Promise(resolve=>{release=resolve;});}})});
  const pending=session.start();await started;
  const final=session.reportManualProgress(reported(session,'SUBMIT'));
  release(queued());const late=await pending;
  assert.equal(late.nextAction,final.nextAction);assert.equal(late.userReported,true);
  assert.equal(late.originalJobId,'job_17');noSuccess(late);
  assert.equal(session.presentation().preparedPrompt,undefined);
});

test('a late OPEN error cannot replace an already reported manual submission',async()=>{
  let reject,entered;const started=new Promise(resolve=>{entered=resolve;});
  const session=createOpenManualSession({request:request(),deviceId,commandId,
    createOriginalRuntime:()=>({runStep:async()=>{},start:()=>{entered();
      return new Promise((resolve,no)=>{reject=no;});}})});
  const pending=session.start();await started;
  const final=session.reportManualProgress(reported(session,'SUBMIT'));
  reject(Error('late_response_lost'));assert.equal(await pending,final);noSuccess(final);
});

test('mutation of the caller request cannot change the bound manual prompt',async()=>{
  const input=request();const session=createOpenManualSession({request:input});
  const prepared=session.request.prompt;input.requestText='changed request';
  await session.start();
  assert.equal(session.reportManualProgress(reported(session,'OPEN')).prompt,prepared);
  assert.equal(Object.isFrozen(session.request),true);
});

test('development and non-invocations never construct the original phone runtime',async()=>{
  for(const intent of ['develop','quote','explain','stop']) {
    const session=createOpenManualSession({request:request({intent}),deviceId,commandId,
      createOriginalRuntime(){assert.fail('not an execution request');}});
    assert.equal((await session.start()).active,false);
    assert.equal((await session.readOpenStatus()).active,false);
  }
});

test('the actual legacy runtime receives only its fixed web navigation operation',async()=>{
  const calls=[];
  const session=createOpenManualSession({request:request(),deviceId,commandId,
    createOriginalRuntime:task=>{
      const runtime=createJebiseoRuntime({runtimeMode:'PHONE_RIGHT',
        readCurrentBinding:()=>({deviceId,commandId,runtimeMode:'PHONE_RIGHT',
          secureSessionId:'fixture-session',focusProtected:true,durableDispatchProtected:true}),
        callOriginalTool:async(name,args)=>{calls.push({name,args});return {ok:true};}});
      return {start:()=>runtime.start({task}),runStep:input=>runtime.runStep({...input,task})};
    }});
  await session.start();await session.start();
  assert.deepEqual(calls,[{name:'life_web_navigate',args:{url:'https://gemini.google.com/app',command_id:commandId}}]);
  noSuccess(session.view());
});
